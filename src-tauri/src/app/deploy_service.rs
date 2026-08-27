use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use webcraft_common::{AuthConfig, HttpConfig, RouteEntry, ServerConfig};
use webcraft_common::{default_production_config, generate_jwt_secret, render_full_config};

use crate::core::automation::now_ms;
use crate::app::ops_service::OpsService;
use crate::app::remote_desktop_service::run_ssh_command_with_timeout;
use crate::app::remote_exec_service::{RemoteExecRequest, RemoteExecService};
use crate::app::sftp_service::{ProgressCtx, SftpService};
use crate::core::error::{Error, Result};
use crate::core::types::SshConnectionInfo;
use crate::infra::storage::connection_repo::ConnectionRepo;
use crate::infra::storage::database::Database;
use crate::infra::storage::deployment_repo::{self, DeploymentRow};
use crate::infra::storage::site_repo::SiteRepo;

/// 部署步骤标识（前端进度 UI 按此渲染阶段）。
pub const STEP_VALIDATE: &str = "validate";
pub const STEP_PRECHECK: &str = "precheck";
pub const STEP_DETECT: &str = "detect";
pub const STEP_CONFIG: &str = "config";
pub const STEP_UPLOAD: &str = "upload";
pub const STEP_INSTALL: &str = "install";
pub const STEP_SWITCH: &str = "switch";
pub const STEP_NGINX: &str = "nginx";
pub const STEP_VERIFY: &str = "verify";
pub const STEP_CLEANUP: &str = "cleanup";
pub const STEP_DONE: &str = "done";

/// 保留的历史版本数量（含当前版本）
const KEEP_RELEASES: usize = 5;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeployProgress {
    pub step: String,
    pub message: String,
    /// 0-100 全流程百分比。
    pub percent: u8,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeployOutcome {
    pub deployment_id: String,
    pub base_url: String,
    pub healthz_url: String,
    pub token: String,
    pub uploaded_count: u64,
    pub total_bytes: u64,
    pub duration_ms: i64,
    pub log: Vec<String>,
}

/// 服务运行状态
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceStatus {
    pub is_running: bool,
    pub status_text: String,
    pub healthz_code: String,
    pub health_ok: bool,
    pub current_version: String,
    pub port: u16,
}

pub struct DeployService;

pub const DEFAULT_SERVER_PORT: u16 = 18080;

/// 环境预检结果
struct PreflightResult {
    init_system: String,       // systemd / openrc / sysvinit / unknown
    nginx_available: bool,     // Nginx 是否已安装
    port_occupied: bool,       // 服务端口是否已被占用
}

impl DeployService {
    /// 环境预检：探测 init 系统、Nginx 可用性、端口占用
    fn preflight(ssh: &SshConnectionInfo, remote_path: &str, port: u16, check_nginx: bool) -> Result<PreflightResult> {
        // init 系统探测
        let init_raw = run_ssh_command_with_timeout(ssh, "
            if command -v systemctl >/dev/null 2>&1; then echo systemd;
            elif command -v rc-service >/dev/null 2>&1; then echo openrc;
            elif command -v service >/dev/null 2>&1; then echo sysvinit;
            else echo unknown; fi
        ", 10).unwrap_or_else(|_| "unknown".to_string());
        let init_system = init_raw.trim().to_string();

        // Nginx 探测
        let nginx_available = if check_nginx {
            run_ssh_command_with_timeout(ssh, "command -v nginx >/dev/null 2>&1 && echo yes || echo no", 10)
                .map(|s| s.trim() == "yes")
                .unwrap_or(false)
        } else {
            false
        };

        // 端口占用探测
        let port_occupied = run_ssh_command_with_timeout(
            ssh,
            &format!("(ss -tlnp 2>/dev/null | grep -q ':{} ' || lsof -i :{} 2>/dev/null | grep -q LISTEN) && echo yes || echo no", port, port),
            10,
        ).map(|s| s.trim() == "yes").unwrap_or(false);

        // 目录可写性检查（失败只记日志不阻塞）
        let _ = run_ssh_command_with_timeout(
            ssh,
            &format!("mkdir -p '{}' && test -w '{}' && echo writable || echo not_writable", remote_path, remote_path),
            10,
        );

        Ok(PreflightResult {
            init_system,
            nginx_available,
            port_occupied,
        })
    }

    /// 配置 Nginx 反向代理
    /// 策略：优先尝试系统级 Nginx（需 sudo），失败则降级到用户目录配置
    fn setup_nginx_proxy(
        ssh: &SshConnectionInfo,
        remote_path: &str,
        conf_name: &str,
        domain: &str,
        log: &mut Vec<String>,
    ) -> Result<()> {
        let user_conf = format!("{}/nginx.conf.d/{}", remote_path, conf_name);

        // root 用户直接执行，非 root 才需要 sudo（用 -S 从 stdin 读密码避免交互卡住）
        let is_root = ssh.username == "root";
        let sudo_prefix = if is_root {
            String::new()
        } else {
            match &ssh.password {
                Some(pwd) if !pwd.is_empty() => {
                    // 转义单引号：' → '\''
                    let escaped = pwd.replace('\'', "'\\''");
                    format!("echo '{}' | sudo -S ", escaped)
                }
                _ => "sudo ".to_string(),
            }
        };
        let sc = |cmd: &str| format!("{}{}", sudo_prefix, cmd);

        // 策略 1：尝试系统级 Nginx（sites-available → sites-enabled）
        let sys_available = run_ssh_command_with_timeout(
            ssh,
            "test -d /etc/nginx/sites-available && test -d /etc/nginx/sites-enabled && echo yes || echo no",
            10,
        ).map(|s| s.trim() == "yes").unwrap_or(false);

        if sys_available {
            let dest_conf = format!("/etc/nginx/sites-available/{}", conf_name);
            let enabled_link = format!("/etc/nginx/sites-enabled/{}", conf_name);

            // 复制配置到系统目录
            let copy_result = run_ssh_command_with_timeout(
                ssh,
                &sc(&format!("cp '{}' '{}'", user_conf, dest_conf)),
                10,
            );

            if copy_result.is_ok() {
                // 启用站点（软链）
                let _ = run_ssh_command_with_timeout(
                    ssh,
                    &sc(&format!("ln -sfn '{}' '{}'", dest_conf, enabled_link)),
                    10,
                );

                // 测试配置
                let test_result = run_ssh_command_with_timeout(ssh, &sc("nginx -t 2>&1"), 15);
                match test_result {
                    Ok(out) if out.contains("test is successful") || out.contains("syntax is ok") => {
                        // reload
                        let reload_result = run_ssh_command_with_timeout(
                            ssh,
                            &sc("nginx -s reload 2>&1 || systemctl reload nginx 2>&1"),
                            15,
                        );
                        match reload_result {
                            Ok(_) => {
                                log.push("Nginx: 系统级配置已生效".to_string());
                                return Ok(());
                            }
                            Err(e) => {
                                log.push(format!("Nginx: reload 失败，回滚配置: {}", e));
                                let _ = run_ssh_command_with_timeout(
                                    ssh,
                                    &sc(&format!("rm -f '{}' '{}' && nginx -s reload 2>/dev/null", dest_conf, enabled_link)),
                                    10,
                                );
                            }
                        }
                    }
                    Ok(out) => {
                        log.push(format!("Nginx: 配置语法错误，回滚: {}", out.lines().last().unwrap_or("")));
                        let _ = run_ssh_command_with_timeout(
                            ssh,
                            &sc(&format!("rm -f '{}' '{}'", dest_conf, enabled_link)),
                            10,
                        );
                    }
                    Err(e) => {
                        log.push(format!("Nginx: 配置测试失败: {}", e));
                        let _ = run_ssh_command_with_timeout(
                            ssh,
                            &sc(&format!("rm -f '{}' '{}'", dest_conf, enabled_link)),
                            10,
                        );
                    }
                }
            } else {
                log.push("Nginx: 无权限写入系统目录，跳过系统级配置".to_string());
            }
        }

        // 策略 2：如果有域名，提示用户手动配置
        if !domain.is_empty() {
            log.push(format!(
                "💡 Nginx 配置文件已保存到 {}/nginx.conf.d/{}，如需手动配置可参考该文件",
                remote_path, conf_name
            ));
        }

        Ok(())
    }

    /// 等待服务进入 active 状态，带渐进式重试
    /// 能识别 failed 状态并提前失败，避免无意义等待
    fn wait_for_service_active(
        ssh: &SshConnectionInfo,
        sysctl: &str,
        unit_name: &str,
        max_wait_secs: u64,
        log: &mut Vec<String>,
    ) -> bool {
        let check_cmd = format!("{} is-active {} 2>/dev/null", sysctl, unit_name);
        let mut waited = 0;
        let mut interval = 2; // 初始间隔 2 秒
        let mut consecutive_failed = 0;

        while waited < max_wait_secs {
            match run_ssh_command_with_timeout(ssh, &check_cmd, 10) {
                Ok(status) if status.trim().eq_ignore_ascii_case("active") => {
                    return true;
                }
                Ok(status) => {
                    let status = status.trim();
                    // 服务已失败，无需继续等待
                    if status.eq_ignore_ascii_case("failed") {
                        consecutive_failed += 1;
                        log.push(format!("  ⚠️  服务进入 failed 状态（连续 {} 次）（已等 {}s）", consecutive_failed, waited));
                        // 连续 3 次都是 failed → 判定为启动失败，提前退出
                        if consecutive_failed >= 3 {
                            log.push("  ❌ 服务持续处于 failed 状态，停止等待".to_string());
                            return false;
                        }
                    } else {
                        consecutive_failed = 0;
                        log.push(format!("  等待中... 当前状态: {}（已等 {}s）", status, waited));
                    }
                }
                Err(e) => {
                    log.push(format!("  检查状态失败: {}（已等 {}s）", e, waited));
                }
            }

            std::thread::sleep(std::time::Duration::from_secs(interval));
            waited += interval;
            // 渐进式退避：2s → 3s → 4s → 5s（最多 5 秒）
            if interval < 5 {
                interval += 1;
            }
        }

        false
    }

    /// 等待 healthz 返回 200，带渐进式重试
    ///
    /// 必须检查 /healthz 端点而不是根路径：完整版部署不上传静态文件时，
    /// 根路径由 static.serve 处理会返回 404，而 /healthz 始终 200（无认证）。
    fn wait_for_healthz(
        ssh: &SshConnectionInfo,
        port: u16,
        max_wait_secs: u64,
        log: &mut Vec<String>,
    ) -> (bool, String) {
        let mut waited = 0;
        let mut interval = 2;
        let mut last_code = String::new();

        while waited < max_wait_secs {
            let check_cmd = format!(
                "curl -s -o /dev/null -w '%{{http_code}}' --connect-timeout 3 http://localhost:{}/healthz 2>/dev/null || echo 000",
                port
            );
            match run_ssh_command_with_timeout(ssh, &check_cmd, 10) {
                Ok(code) => {
                    let code = code.trim().to_string();
                    last_code = code.clone();
                    if code == "200" {
                        return (true, code);
                    }
                    log.push(format!("  healthz: {}（已等 {}s）", code, waited));
                }
                Err(e) => {
                    log.push(format!("  healthz 检查失败: {}（已等 {}s）", e, waited));
                    last_code = "error".to_string();
                }
            }

            std::thread::sleep(std::time::Duration::from_secs(interval));
            waited += interval;
            if interval < 5 {
                interval += 1;
            }
        }

        (false, last_code)
    }

    /// 清理旧版本，保留最近 N 个
    fn cleanup_old_releases(ssh: &SshConnectionInfo, remote_path: &str, keep: usize) -> Result<usize> {
        let releases_dir = format!("{}/releases", remote_path);

        // 列出所有版本目录（按名称排序，新的在后）
        let list_raw = run_ssh_command_with_timeout(
            ssh,
            &format!("ls -1 '{}' 2>/dev/null | sort", releases_dir),
            10,
        ).unwrap_or_default();

        let releases: Vec<&str> = list_raw.lines()
            .filter(|l| !l.trim().is_empty())
            .collect();

        if releases.len() <= keep {
            return Ok(0);
        }

        let to_remove = &releases[..releases.len() - keep];
        let mut removed = 0;

        for rel in to_remove {
            let _ = run_ssh_command_with_timeout(
                ssh,
                &format!("rm -rf '{}/{}'", releases_dir, rel),
                15,
            );
            removed += 1;
        }

        Ok(removed)
    }

    /// 一键部署：校验 → 探测架构 → 生成 server.toml/unit → SFTP 上传
    /// （二进制 + 配置 + unit + dist 静态内容）→ systemd --user 拉起 → healthz 验证。
    /// 失败即中止并落库 failed 记录；成功更新 site.last_deployed_at。
    #[allow(clippy::too_many_arguments)]
    pub fn deploy(
        db: &Database,
        sftp: &SftpService,
        site_id: &str,
        data_dir: &Path,
        on_progress: Arc<dyn Fn(DeployProgress) + Send + Sync>,
    ) -> Result<DeployOutcome> {
        let started = now_ms();
        let deployment_id = format!("deploy-{}", uuid::Uuid::new_v4());
        let mut log: Vec<String> = Vec::new();
        let mut outcome = Self::run(db, sftp, site_id, data_dir, &deployment_id, &mut log, on_progress);
        let finished = now_ms();
        let duration_ms = finished - started;
        if let Ok(o) = &mut outcome {
            o.duration_ms = duration_ms;
        }

        let (status, error_summary, uploaded_count, total_bytes) = match &outcome {
            Ok(o) => ("success".to_string(), String::new(), o.uploaded_count, o.total_bytes),
            Err(e) => {
                let msg = e.to_string();
                log.push(format!("[failed] {}", msg));
                ("failed".to_string(), msg, 0, 0)
            }
        };

        let conn_id = SiteRepo::get_by_id(db, site_id)?
            .and_then(|s| s.connection_id);
        let remote_path = SiteRepo::get_by_id(db, site_id)?
            .and_then(|s| {
                let cfg: serde_json::Value = serde_json::from_str(&s.deploy_config_json).unwrap_or_default();
                cfg["remote_path"].as_str().map(|s| s.to_string())
            })
            .unwrap_or_default();
        let log_json = serde_json::to_string(&log.iter().take(200).collect::<Vec<_>>()).unwrap_or_else(|_| "[]".to_string());

        let row = DeploymentRow {
            id: deployment_id.clone(),
            site_id: site_id.to_string(),
            trigger_type: "manual".to_string(),
            target_env: "production".to_string(),
            mode: "simple".to_string(),
            connection_id: conn_id,
            remote_path,
            version_dir: String::new(),
            server_version: String::new(),
            status,
            started_at: started,
            finished_at: Some(finished),
            duration_ms: Some(duration_ms),
            uploaded_count: uploaded_count as i64,
            deleted_count: 0,
            total_bytes: total_bytes as i64,
            error_summary,
            manifest_json: "[]".to_string(),
            steps_json: "[]".to_string(),
            log_json,
            rollback_from: None,
        };
        if let Err(e) = deployment_repo::insert(db, &row) {
            tracing::warn!("[deploy] 写部署记录失败: {}", e);
        }
        if outcome.is_ok() {
            if let Some(mut site) = SiteRepo::get_by_id(db, site_id)? {
                site.last_deployed_at = Some(finished);
                SiteRepo::update(db, &site)?;
            }
        }
        outcome
    }

    #[allow(clippy::too_many_arguments)]
    fn run(
        db: &Database,
        sftp: &SftpService,
        site_id: &str,
        data_dir: &Path,
        deployment_id: &str,
        log: &mut Vec<String>,
        on_progress: Arc<dyn Fn(DeployProgress) + Send + Sync>,
    ) -> Result<DeployOutcome> {
        // ---- 工具：进度回调 ----
        let step = |s: &str, m: String, p: u8| {
            on_progress(DeployProgress { step: s.to_string(), message: m, percent: p });
        };

        // ---- 1. 校验 ----
        step(STEP_VALIDATE, "校验站点与绑定服务器".to_string(), 3);
        let site = SiteRepo::get_by_id(db, site_id)?
            .ok_or_else(|| Error::Cms(format!("站点不存在: {}", site_id)))?;
        let conn_id = site.connection_id.as_deref()
            .ok_or_else(|| Error::Cms("站点未绑定服务器，无法部署".into()))?;
        let conn = ConnectionRepo::get_by_id(db, conn_id)?
            .ok_or_else(|| Error::Cms(format!("绑定的服务器连接不存在: {}", conn_id)))?;
        let ssh: SshConnectionInfo = serde_json::from_str(&conn.config_json)
            .map_err(|e| Error::Cms(format!("服务器连接配置解析失败: {}", e)))?;

        let deploy_config: serde_json::Value =
            serde_json::from_str(&site.deploy_config_json).unwrap_or(serde_json::json!({}));
        let remote = deploy_config["remote_path"].as_str().unwrap_or("").trim().to_string();
        if remote.is_empty() {
            return Err(Error::Cms("部署远程路径为空，请先在站点配置中填写".into()));
        }
        let port = deploy_config["server_port"].as_u64().unwrap_or(DEFAULT_SERVER_PORT as u64) as u16;
        let domain = site.domain.trim().to_string();
        let enable_nginx = deploy_config["enable_nginx"].as_bool().unwrap_or(true);

        let dist_local = Path::new(&site.local_workdir).join("dist");
        if !dist_local.is_dir() {
            return Err(Error::Cms(format!(
                "本地构建产物不存在: {}（先完成站点构建）",
                dist_local.display()
            )));
        }

        // 数据库/Redis 连接信息（从 deploy_config 读取，或使用默认值）
        // 云端部署只支持 PostgreSQL，始终启用
        let db_name = deploy_config["db_name"].as_str().unwrap_or("webcraft").to_string();
        let db_user = deploy_config["db_user"].as_str().unwrap_or("postgres").to_string();
        let db_pass = deploy_config["db_password"].as_str().unwrap_or("").to_string();
        let db_host = deploy_config["db_host"].as_str().unwrap_or("localhost").to_string();
        let db_port_db = deploy_config["db_port"].as_u64().unwrap_or(5432) as u16;
        let redis_host = deploy_config["redis_host"].as_str().unwrap_or("localhost").to_string();
        let redis_port = deploy_config["redis_port"].as_u64().unwrap_or(6379) as u16;

        let db_url = if db_pass.is_empty() {
            format!("postgres://{}@{}:{}/{}", url_encode_userinfo(&db_user), db_host, db_port_db, db_name)
        } else {
            format!("postgres://{}:{}@{}:{}/{}", url_encode_userinfo(&db_user), url_encode_userinfo(&db_pass), db_host, db_port_db, db_name)
        };
        let redis_url = format!("redis://{}:{}/0", redis_host, redis_port);

        // 记录部署摘要
        log.push("╔════════════════════════════════════════╗".to_string());
        log.push("║        🚀 WebCraft 部署开始            ║".to_string());
        log.push("╠════════════════════════════════════════╣".to_string());
        log.push(format!("║ 站点: {}", site.name));
        log.push(format!("║ 服务器: {}@{}:{}", ssh.username, ssh.host, ssh.port));
        log.push(format!("║ 部署路径: {}", remote));
        log.push(format!("║ 服务端口: {}", port));
        log.push(format!("║ 模式: 极简版 (Minimal)"));
        if !domain.is_empty() {
            log.push(format!("║ 域名: {}", domain));
        }
        log.push("╚════════════════════════════════════════╝".to_string());

        // ---- 2. 环境预检 ----
        step(STEP_PRECHECK, "环境预检".to_string(), 6);
        let precheck = Self::preflight(&ssh, &remote, port, enable_nginx)?;
        log.push(format!("预检: init={}, nginx={}, port_occupied={}",
            precheck.init_system, precheck.nginx_available, precheck.port_occupied));
        if precheck.port_occupied {
            log.push(format!("⚠️  端口 {} 已被占用，启动服务时可能冲突", port));
        }
        step(STEP_PRECHECK, format!("init={}, nginx={}", precheck.init_system, precheck.nginx_available), 8);

        // ---- 3. 探测服务器架构，定位 musl 二进制 ----
        step(STEP_DETECT, "探测服务器架构".to_string(), 10);
        let arch_raw = run_ssh_command_with_timeout(&ssh, "uname -m", 15)
            .map_err(|e| Error::Cms(format!("无法连接服务器探测架构: {}", e)))?;
        // 取最后一行非空行（过滤 SSH 登录提示、密码提示等杂讯）
        let arch = arch_raw.lines()
            .map(|l| l.trim())
            .filter(|l| !l.is_empty())
            .last()
            .unwrap_or("")
            .to_string();
        let arch_suffix = match arch.as_str() {
            "x86_64" | "amd64" => "linux-x86_64",
            "aarch64" | "arm64" => "linux-aarch64",
            other => {
                return Err(Error::Cms(format!(
                    "暂不支持的服务器架构: {}（当前支持 x86_64 / aarch64）",
                    other
                )))
            }
        };
        let bin_local = if let Some(over) = deploy_config["server_bin"].as_str() {
            let p = PathBuf::from(over);
            if !p.is_file() {
                return Err(Error::Cms(format!("配置的二进制文件不存在: {}", p.display())));
            }
            p
        } else {
            // 从多个位置查找二进制（data_dir / cwd / exe_dir 及其所有父目录）
            let search_dirs = Self::build_binary_search_dirs(data_dir);
            let search_refs: Vec<&Path> = search_dirs.iter().map(|p| p.as_path()).collect();
            Self::find_binary_path(&search_refs, "latest", arch_suffix)?
        };
        log.push(format!("二进制来源: {}", bin_local.display()));
        step(STEP_DETECT, format!("服务器架构 {}，二进制就绪", arch_suffix), 14);

        // ---- 4. 生成 server.toml / systemd unit / nginx conf ----
        step(STEP_CONFIG, "生成 server.toml 与服务配置".to_string(), 16);
        let config = default_production_config(port, &db_url, &redis_url);
        let toml_text = render_full_config(&config).map_err(Error::Cms)?;
        webcraft_common::parse_config(&toml_text).map_err(Error::Cms)?;

        let unit_slug = site.id.trim_start_matches("site-");
        let unit_slug_short = &unit_slug[..8.min(unit_slug.len())];
        let unit_name = format!("webcraft-{}.service", unit_slug_short);

        // 蓝绿部署：版本目录名 = 时间戳
        let release_ts = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
        let release_dir = format!("{}/releases/{}", remote, release_ts);
        let current_link = format!("{}/current", remote);

        // systemd unit 指向 current symlink（切换版本不需要改 unit）
        let unit_text = unit_file(&site.name, &current_link);

        // Nginx 反向代理配置
        let nginx_conf_text = if enable_nginx && precheck.nginx_available {
            Some(nginx_site_config(&domain, &site.name, port))
        } else {
            None
        };
        let nginx_conf_name = format!("webcraft-{}.conf", unit_slug_short);

        // 本地临时文件
        let tmp_dir = std::env::temp_dir().join(format!("webcraft-{}", deployment_id));
        std::fs::create_dir_all(&tmp_dir)?;
        let toml_tmp = tmp_dir.join("server.toml");
        let unit_tmp = tmp_dir.join(&unit_name);
        let nginx_tmp = tmp_dir.join(&nginx_conf_name);
        std::fs::write(&toml_tmp, &toml_text)?;
        std::fs::write(&unit_tmp, &unit_text)?;
        if let Some(ref nginx_text) = nginx_conf_text {
            std::fs::write(&nginx_tmp, nginx_text)?;
        }
        log.push(format!("server.toml 端口 {} / PostgreSQL + Redis 配置", port));
        let (uploaded_count, total_bytes) =
            local_stats(&[bin_local.clone(), toml_tmp.clone(), unit_tmp.clone(), dist_local.clone()]);

        // ---- 5. SFTP 上传（到 releases/<timestamp>/） ----
        let upload = |paths: Vec<String>, dir: &str, names: Option<Vec<String>>, pct_from: u8, pct_to: u8, note: &str, resume: bool| -> Result<()> {
            let sink_progress = on_progress.clone();
            let progress_id = format!("deploy-{}", deployment_id);
            let note_owned = note.to_string();
            let ctx = ProgressCtx::new(
                progress_id,
                Arc::new(move |p: crate::app::sftp_service::TransferProgress| {
                    let span = pct_to.saturating_sub(pct_from);
                    let pct = pct_from + (p.overall_percent as u16 * span as u16 / 100) as u8;
                    sink_progress(DeployProgress {
                        step: STEP_UPLOAD.to_string(),
                        message: format!("{} {} ({}/{})", note_owned, p.file, p.file_no, p.total_files),
                        percent: pct.min(99),
                    });
                }),
            );
            let names_ref = names.as_deref();
            sftp.upload(&ssh, &paths, dir, Some(&ctx), names_ref, resume)
                .map_err(|e| Error::Cms(format!("上传失败 ({note}): {}", e)))?;
            Ok(())
        };

        step(STEP_UPLOAD, "创建远程目录结构".to_string(), 18);
        run_ssh_command_with_timeout(
            &ssh,
            &format!("mkdir -p '{release_dir}' '{}/releases' '{}/nginx.conf.d' ~/.config/systemd/user",
                remote, remote),
            15,
        )
        .map_err(|e| Error::Cms(format!("创建远程目录失败: {}", e)))?;

        step(STEP_UPLOAD, "上传服务端二进制与配置".to_string(), 20);
        upload(
            vec![bin_local.to_string_lossy().to_string(), toml_tmp.to_string_lossy().to_string()],
            &release_dir,
            Some(vec!["webcraft-server".to_string(), "server.toml".to_string()]),
            20,
            35,
            "传输",
            false,
        )?;

        step(STEP_UPLOAD, "上传 systemd unit".to_string(), 35);
        upload(
            vec![unit_tmp.to_string_lossy().to_string()],
            ".config/systemd/user",
            None,
            35,
            38,
            "传输",
            false,
        )?;

        if let Some(ref nginx_text) = nginx_conf_text {
            step(STEP_UPLOAD, "上传 Nginx 配置".to_string(), 38);
            upload(
                vec![nginx_tmp.to_string_lossy().to_string()],
                &format!("{}/nginx.conf.d", remote),
                None,
                38,
                40,
                "传输",
                false,
            )?;
            let _ = nginx_text; // 避免未使用警告
        }

        let _ = std::fs::remove_dir_all(&tmp_dir);

        step(STEP_UPLOAD, "上传站点静态内容 (dist/)".to_string(), 42);
        upload(
            vec![dist_local.to_string_lossy().to_string()],
            &format!("{}/dist", release_dir),
            None,
            42,
            70,
            "上传",
            true,
        )?;

        // ---- 6. 数据库初始化 ----
        step(STEP_DB_SETUP, "检查数据库连接".to_string(), 62);

        // 判断是否为本地 PostgreSQL（localhost / 127.0.0.1）
        let is_local_pg = db_host == "localhost" || db_host == "127.0.0.1";
        let mut effective_db_pass = db_pass.clone();

        // 连接检测：psql 认证失败时错误文本经 2>&1 混入输出，SSH 命令本身
        // 仍以退出码 0 结束，因此必须依据输出内容判断，不能依赖 Result::is_err()
        let conn_cmd = format!(
            "PGPASSWORD={} psql -h {} -U {} -d postgres -t -c 'SELECT 1' 2>&1 | tail -1",
            shell_quote(&effective_db_pass), db_host, db_user
        );
        let conn_out = run_ssh_command_with_timeout(&ssh, &conn_cmd, 15).unwrap_or_default();
        let conn_ok = conn_out.trim() == "1";

        let mut db_exists = false;
        if conn_ok {
            let db_check_cmd = format!(
                "PGPASSWORD={} psql -h {} -U {} -d postgres -t -c \"SELECT 1 FROM pg_database WHERE datname='{}'\" 2>&1 | tail -1",
                shell_quote(&effective_db_pass), db_host, db_user, db_name
            );
            db_exists = run_ssh_command_with_timeout(&ssh, &db_check_cmd, 15)
                .map(|s| s.trim() == "1")
                .unwrap_or(false);
        }

        if !conn_ok && is_local_pg && db_user == "postgres" {
            // CentOS/RHEL 系 pg_hba.conf 默认对 TCP 回环（127.0.0.1/32 与 ::1/128）
            // 使用 ident 认证，root 无法以 postgres 身份经 TCP 连接。改用
            // sudo -u postgres 走 unix socket peer 认证完成初始化，并在
            // pg_hba.conf 顶部插入 md5 规则放开 TCP 密码认证（首条匹配生效）
            log.push(format!("⚠️  密码方式连接失败: {}", conn_out.trim()));
            log.push("通过 peer 认证初始化本地 PostgreSQL（建库/设密码/开放 TCP md5 认证）...".to_string());
            step(STEP_DB_SETUP, "初始化本地 PostgreSQL".to_string(), 63);

            if effective_db_pass.is_empty() {
                effective_db_pass = generate_jwt_secret()[..16].to_string();
            }

            // 1. peer 认证建库
            let create_via_peer = format!(
                "sudo -u postgres psql -d postgres -c \"CREATE DATABASE {}\" 2>&1",
                db_name
            );
            let peer_out = run_ssh_command_with_timeout(&ssh, &create_via_peer, 20)
                .unwrap_or_default();
            if peer_out.contains("CREATE DATABASE") {
                log.push(format!("数据库 {} 已创建 ✓", db_name));
                db_exists = true;
            } else if peer_out.contains("already exists") {
                log.push(format!("数据库 {} 已存在 ✓", db_name));
                db_exists = true;
            } else {
                log.push(format!("⚠️  建库输出: {}", peer_out.lines().last().unwrap_or("")));
            }

            // 2. peer 认证设置密码（保证与 server.toml 一致）
            //    密码经 psql -v 变量 + :'pw' 占位注入，安全处理引号等特殊字符
            let set_pass_cmd = format!(
                "sudo -u postgres psql -v ON_ERROR_STOP=1 -v pw={} -c \"ALTER USER postgres PASSWORD :'pw'\" 2>&1",
                shell_quote(&effective_db_pass)
            );
            let pass_out = run_ssh_command_with_timeout(&ssh, &set_pass_cmd, 15)
                .unwrap_or_default();
            if pass_out.contains("ALTER ROLE") {
                log.push("postgres 用户密码已设置 ✓".to_string());
            } else {
                log.push(format!("⚠️  密码设置输出: {}", pass_out.lines().last().unwrap_or("")));
            }

            // 3. pg_hba.conf 顶部插入 md5 规则（覆盖 IPv4/IPv6 回环，
            //    localhost 可能优先解析为 ::1）
            //    reload 用 pg_reload_conf()：与 systemd 服务名无关
            //    （PGDG 安装的服务名是 postgresql-14/15/16/17 等，systemctl reload
            //    按固定服务名猜测会静默失败，导致规则改了却不生效）
            let pg_hba_fix = r#"PG_HBA=$(sudo -u postgres psql -t -A -c 'SHOW hba_file' 2>/dev/null | tr -d '[:space:]'); if [ -n "$PG_HBA" ] && [ -f "$PG_HBA" ]; then grep -qE '^host[[:space:]]+all[[:space:]]+all[[:space:]]+127\.0\.0\.1/32[[:space:]]+md5' "$PG_HBA" || sudo sed -i '1i host    all             all             127.0.0.1/32            md5' "$PG_HBA"; grep -qE '^host[[:space:]]+all[[:space:]]+all[[:space:]]+::1/128[[:space:]]+md5' "$PG_HBA" || sudo sed -i '1i host    all             all             ::1/128                 md5' "$PG_HBA"; sudo chown postgres:postgres "$PG_HBA" 2>/dev/null; sudo chmod 600 "$PG_HBA" 2>/dev/null; sudo restorecon "$PG_HBA" 2>/dev/null; RELOAD=$(sudo -u postgres psql -t -A -c 'SELECT pg_reload_conf()' 2>&1); echo "pg_hba-ok reload=$RELOAD"; else echo "pg_hba-fail: 未找到 pg_hba.conf（PostgreSQL 未运行?）"; fi"#;
            let hba_out = run_ssh_command_with_timeout(&ssh, pg_hba_fix, 20).unwrap_or_default();
            log.push(format!("pg_hba 认证规则: {}", hba_out.lines().last().unwrap_or("")));

            // 4. 验证 TCP 密码连接（与 webcraft-server 的连接方式一致）
            let verify_cmd = format!(
                "PGPASSWORD={} psql -h {} -U {} -d postgres -t -c 'SELECT 1' 2>&1 | tail -1",
                shell_quote(&effective_db_pass), db_host, db_user
            );
            let verify_out = run_ssh_command_with_timeout(&ssh, &verify_cmd, 15).unwrap_or_default();
            if verify_out.trim() == "1" {
                log.push("数据库 TCP 密码认证验证通过 ✓".to_string());
                log.push(format!("💡 数据库密码: {}（已写入 server.toml）", effective_db_pass));
            } else {
                return Err(Error::Cms(format!(
                    "本地 PostgreSQL 初始化后仍无法通过 TCP 连接: {}\n\n中间步骤输出:\n  建库: {}\n  设密码: {}\n  pg_hba: {}\n\n请手动排查:\n  1. sudo -u postgres psql -c 'SHOW hba_file' 查看认证规则文件\n  2. 确认 PostgreSQL 服务正在运行\n  3. 确认 SSH 用户有 sudo 免密权限（visudo 配置 NOPASSWD）",
                    verify_out.trim(),
                    peer_out.lines().last().unwrap_or("(无输出)"),
                    pass_out.lines().last().unwrap_or("(无输出)"),
                    hba_out.lines().last().unwrap_or("(无输出)"),
                )));
            }
        } else if !conn_ok {
            // 远程数据库或非 postgres 用户，无法自动修复
            log.push(format!("⚠️  无法连接数据库: {}", conn_out.trim()));
            log.push("💡 请检查数据库主机地址、端口、用户名和密码是否正确".to_string());
            return Err(Error::Cms(format!(
                "数据库连接失败: {}\n\n请检查：\n  1. 数据库主机地址（db_host）和端口（db_port）是否正确\n  2. 数据库用户名（db_user）和密码（db_password）是否正确\n  3. 数据库服务是否已启动\n  4. 服务器能否访问数据库主机（网络连通性）",
                conn_out.trim()
            )));
        }

        // 如果数据库还不存在，尝试用密码方式创建
        if !db_exists {
            step(STEP_DB_SETUP, "创建数据库".to_string(), 64);
            let create_db_cmd = format!(
                "PGPASSWORD={} psql -h {} -U {} -d postgres -c \"CREATE DATABASE {}\" 2>&1",
                shell_quote(&effective_db_pass), db_host, db_user, db_name
            );
            let create_out = run_ssh_command_with_timeout(&ssh, &create_db_cmd, 30)
                .unwrap_or_default();
            if create_out.contains("CREATE DATABASE") || create_out.contains("already exists") {
                log.push(format!("数据库 {} 已创建 ✓", db_name));
            } else {
                log.push(format!("⚠️  数据库创建可能失败: {}", create_out.lines().last().unwrap_or("")));
                log.push("💡 请检查数据库用户是否有 CREATE DATABASE 权限".to_string());
            }
        } else {
            log.push(format!("数据库 {} 已存在 ✓", db_name));
        }

        // 重新生成 db_url（密码可能已更新）
        let db_url = if effective_db_pass.is_empty() {
            format!("postgres://{}@{}:{}/{}", url_encode_userinfo(&db_user), db_host, db_port_db, db_name)
        } else {
            format!("postgres://{}:{}@{}:{}/{}", url_encode_userinfo(&db_user), url_encode_userinfo(&effective_db_pass), db_host, db_port_db, db_name)
        };

        // 如果密码有变化，重新生成 server.toml 并上传
        if effective_db_pass != db_pass {
            step(STEP_CONFIG, "更新 server.toml 数据库密码".to_string(), 66);
            let config = default_production_config(port, &db_url, &redis_url);
            let toml_text = render_full_config(&config).map_err(Error::Cms)?;
            let toml_local = tmp_dir.join("server.toml");
            std::fs::write(&toml_local, &toml_text)?;
            upload(
                vec![toml_local.to_string_lossy().to_string()],
                &release_dir,
                Some(vec!["server.toml".to_string()]),
                66, 68, "更新配置",
                false,
            )?;
            log.push("server.toml 已更新（含数据库密码） ✓".to_string());
        }

        // 运行迁移（如果二进制支持 migrate 子命令）
        step(STEP_MIGRATE, "执行数据库迁移（可能需要一些时间）".to_string(), 68);
        let migrate_cmd = format!(
            "cd '{release_dir}' && ./webcraft-server migrate server.toml 2>&1",
        );
        let migrate_out = run_ssh_command_with_timeout(&ssh, &migrate_cmd, 180)
            .unwrap_or_else(|e| format!("migrate skipped: {}", e));

        if migrate_out.contains("unexpected argument") {
            // 旧版二进制无 migrate 子命令，跳过（服务启动时 auto_migrate 兜底）
            log.push("当前 webcraft-server 不支持 migrate 子命令，跳过（启动时自动迁移）".to_string());
        } else if migrate_out.contains("Migration") || migrate_out.contains("success") || migrate_out.contains("迁移完成") {
            log.push("数据库迁移完成 ✓".to_string());
        } else if migrate_out.contains("error") || migrate_out.contains("ERROR") || migrate_out.contains("失败") || migrate_out.contains("panic") {
            log.push(format!("⚠️  数据库迁移可能出错: {}", migrate_out.lines().last().unwrap_or("")));
            // 迁移失败不阻断部署，但给出警告
            log.push("💡 服务可能仍能启动，但部分功能可能异常".to_string());
        } else {
            log.push(format!("迁移输出: {}", migrate_out.lines().last().unwrap_or("无输出")));
            log.push("（如果 webcraft-server 不支持 migrate 子命令，请忽略此提示）".to_string());
        }

        step(STEP_MIGRATE, "数据库迁移完成".to_string(), 72);

        // ---- 7. 安装 systemd 服务（首次部署安装，后续只重启）----
        step(STEP_INSTALL, "安装/更新 systemd 服务".to_string(), 75);
        let sysctl = "export XDG_RUNTIME_DIR=/run/user/$(id -u); systemctl --user";
        // 检查服务是否已存在
        let service_exists = run_ssh_command_with_timeout(
            &ssh,
            &format!("{} list-unit-files {} 2>/dev/null | grep -q . && echo yes || echo no", sysctl, unit_name),
            10,
        ).map(|s| s.trim() == "yes").unwrap_or(false);

        let install_cmd = format!(
            "chmod +x '{release_dir}/webcraft-server' && {sysctl} daemon-reload",
        );
        run_ssh_command_with_timeout(&ssh, &install_cmd, 30)
            .map_err(|e| Error::Cms(format!("更新 systemd 失败: {}", e)))?;

        if !service_exists {
            // 首次部署：先 symlink 再 enable（否则 unit 指向不存在的路径）
            let first_link_cmd = format!(
                "ln -sfn '{release_dir}' '{current_link}' && {sysctl} enable --now {unit_name}",
            );
            let out = run_ssh_command_with_timeout(&ssh, &first_link_cmd, 30)
                .map_err(|e| Error::Cms(format!("首次启动服务失败: {}", e)))?;
            log.push(format!("首次部署: enable --now → {}", out.trim()));
        }

        // linger 保证 SSH 退出后 user 级服务继续运行
        match run_ssh_command_with_timeout(&ssh, "loginctl enable-linger 2>/dev/null; echo linger-ok", 15) {
            Ok(_) => log.push("linger 已确认".to_string()),
            Err(e) => log.push(format!("enable-linger 跳过（不影响本次运行）: {}", e)),
        }

        // ---- 7. 原子切换（蓝绿切换）----
        step(STEP_SWITCH, "原子切换版本".to_string(), 78);
        // 保存当前版本路径（用于失败回滚）
        let prev_release = run_ssh_command_with_timeout(
            &ssh,
            &format!("readlink '{current_link}' 2>/dev/null || echo ''"),
            10,
        ).map(|s| s.trim().to_string()).unwrap_or_default();

        // 执行切换
        step(STEP_SWITCH, "切换符号链接并重启服务".to_string(), 80);
        let switch_cmd = format!(
            "ln -sfn '{release_dir}' '{current_link}' && {sysctl} restart {unit_name}",
        );
        run_ssh_command_with_timeout(&ssh, &switch_cmd, 30)
            .map_err(|e| Error::Cms(format!("切换版本失败: {}", e)))?;

        // 渐进式等待服务启动
        step(STEP_SWITCH, "等待服务启动...".to_string(), 82);
        let service_active = Self::wait_for_service_active(&ssh, &sysctl, &unit_name, 60, log);
        if !service_active {
            // 收集诊断信息
            log.push("--- 服务启动失败诊断信息 ---".to_string());
            // systemctl status
            let status_cmd = format!("{} status {} 2>&1 | head -20", sysctl, unit_name);
            if let Ok(s) = run_ssh_command_with_timeout(&ssh, &status_cmd, 10) {
                log.push(format!("systemctl status:\n{}", s.trim()));
            }
            // journalctl 最近日志
            let journal_cmd = format!("journalctl --user -u {} -n 20 --no-pager 2>&1", unit_name);
            if let Ok(j) = run_ssh_command_with_timeout(&ssh, &journal_cmd, 10) {
                log.push(format!("journalctl 最近日志:\n{}", j.trim()));
            }
            // 前台手动启动抓错误（最关键）
            let manual_cmd = format!(
                "cd '{}' && timeout 8 ./webcraft-server --config server.toml 2>&1 | head -40 || true",
                release_dir
            );
            if let Ok(m) = run_ssh_command_with_timeout(&ssh, &manual_cmd, 15) {
                log.push(format!("前台启动输出（最关键）:\n{}", m.trim()));
            }
            // 端口占用检查
            let port_cmd = format!("ss -tlnp | grep ':{} ' || echo '端口未被占用'", port);
            if let Ok(p) = run_ssh_command_with_timeout(&ssh, &port_cmd, 10) {
                log.push(format!("端口占用情况:\n{}", p.trim()));
            }
            log.push("--------------------------".to_string());

            // 切换失败 → 自动回滚到上一个版本
            log.push("⚠️  新版本未进入 active 状态，开始自动回滚".to_string());
            if !prev_release.is_empty() {
                let rollback_cmd = format!(
                    "ln -sfn '{prev}' '{current_link}' && {sysctl} restart {unit_name}",
                    prev = prev_release,
                );
                match run_ssh_command_with_timeout(&ssh, &rollback_cmd, 30) {
                    Ok(_) => {
                        let rb_active = Self::wait_for_service_active(&ssh, &sysctl, &unit_name, 20, log);
                        if rb_active {
                            log.push("✅ 已自动回滚到上一版本，服务恢复正常".to_string());
                        } else {
                            log.push("❌ 回滚后服务仍未 active，需人工排查".to_string());
                        }
                    }
                    Err(rb_e) => {
                        log.push(format!("❌ 回滚执行失败: {}", rb_e));
                    }
                }
            }
            return Err(Error::Cms(format!(
                "新版本部署失败：服务启动超时（60秒内未进入 active 状态）。\n已尝试自动回滚到上一版本。\n\n排查建议：\n  1. 执行 `journalctl --user -u {} -n 80 --no-pager` 查看服务日志\n  2. 检查端口 {} 是否被其他程序占用\n  3. 确认 server.toml 配置正确\n  4. 检查服务器内存/CPU 是否充足",
                unit_name, port
            )));
        }
        log.push(format!("版本切换成功: {} → active", release_ts));

        // ---- 8. Nginx 反向代理配置（可选）----
        let mut base_url = format!("http://{}:{}", ssh.host, port);
        if enable_nginx && precheck.nginx_available && nginx_conf_text.is_some() {
            step(STEP_NGINX, "配置 Nginx 反向代理".to_string(), 80);
            let nginx_result = Self::setup_nginx_proxy(
                &ssh,
                &remote,
                &nginx_conf_name,
                &domain,
                log,
            );
            match nginx_result {
                Ok(()) => {
                    if !domain.is_empty() {
                        base_url = format!("http://{}", domain);
                    }
                    log.push("✅ Nginx 反向代理配置成功".to_string());
                }
                Err(e) => {
                    log.push(format!("⚠️  Nginx 配置失败（不影响服务运行）: {}", e));
                }
            }
        }

        // ---- 9. healthz 验证 ----
        step(STEP_VERIFY, "等待 healthz 就绪...".to_string(), 90);
        let (healthz_ok, healthz_code) = Self::wait_for_healthz(&ssh, port, 60, log);
        if !healthz_ok {
            // 收集诊断信息
            log.push("--- healthz 验证失败诊断信息 ---".to_string());
            let journal_cmd = format!("journalctl --user -u {} -n 30 --no-pager 2>&1", unit_name);
            if let Ok(j) = run_ssh_command_with_timeout(&ssh, &journal_cmd, 10) {
                log.push(format!("服务最近日志:\n{}", j.trim()));
            }
            // 前台手动启动抓错误（最关键）
            let manual_cmd = format!(
                "cd '{}' && timeout 8 ./webcraft-server --config server.toml 2>&1 | head -40 || true",
                release_dir
            );
            if let Ok(m) = run_ssh_command_with_timeout(&ssh, &manual_cmd, 15) {
                log.push(format!("前台启动输出（最关键）:\n{}", m.trim()));
            }
            let curl_cmd = format!("curl -v http://localhost:{}/healthz 2>&1 | head -30", port);
            if let Ok(c) = run_ssh_command_with_timeout(&ssh, &curl_cmd, 10) {
                log.push(format!("端口响应详情:\n{}", c.trim()));
            }
            log.push("--------------------------".to_string());

            log.push(format!("⚠️  healthz 未返回 200（最终: {}），开始自动回滚", healthz_code));
            if !prev_release.is_empty() {
                let rollback_cmd = format!(
                    "ln -sfn '{prev}' '{current_link}' && {sysctl} restart {unit_name}",
                    prev = prev_release,
                );
                match run_ssh_command_with_timeout(&ssh, &rollback_cmd, 30) {
                    Ok(_) => {
                        let rb_active = Self::wait_for_service_active(&ssh, &sysctl, &unit_name, 20, log);
                        if rb_active {
                            let (rb_healthz, _) = Self::wait_for_healthz(&ssh, port, 20, log);
                            if rb_healthz {
                                log.push("✅ 自动回滚成功，上一版本服务运行正常".to_string());
                            } else {
                                log.push("⚠️  回滚后服务 active 但 healthz 异常，需人工排查".to_string());
                            }
                        } else {
                            log.push("❌ 回滚后服务未能进入 active 状态".to_string());
                        }
                    }
                    Err(rb_e) => {
                        log.push(format!("❌ 回滚执行失败: {}", rb_e));
                    }
                }
            }
            return Err(Error::Cms(format!(
                "healthz 验证失败（60秒内未返回 200，最终状态: {}）。\n新版本服务异常，已自动回滚到上一版本。\n\n排查建议：\n  1. 执行 `journalctl --user -u {} -n 80 --no-pager` 查看服务启动日志\n  2. 检查配置文件是否正确\n  3. 确认端口 {} 未被防火墙拦截",
                healthz_code, unit_name, port
            )));
        }
        log.push(format!("healthz 200 ✓ (localhost:{})", port));

        // ---- 10. 清理旧版本 ----
        step(STEP_CLEANUP, "清理旧版本".to_string(), 96);
        match Self::cleanup_old_releases(&ssh, &remote, KEEP_RELEASES) {
            Ok(removed) if removed > 0 => {
                log.push(format!("清理了 {} 个旧版本", removed));
            }
            Ok(_) => {}
            Err(e) => {
                log.push(format!("清理旧版本失败（非致命）: {}", e));
            }
        }

        // 部署完成总结
        log.push("".to_string());
        log.push("╔════════════════════════════════════════╗".to_string());
        log.push("║        ✅ 部署成功完成！               ║".to_string());
        log.push("╠════════════════════════════════════════╣".to_string());
        log.push(format!("║ 访问地址: {}", base_url));
        log.push(format!("║ 健康检查: {}/healthz", base_url));
        log.push(format!("║ 版本目录: releases/{}", release_ts));
        log.push(format!("║ 上传文件: {} 个", uploaded_count));
        log.push(format!("║ 数据大小: {} bytes", total_bytes));
        log.push("╚════════════════════════════════════════╝".to_string());

        step(STEP_DONE, "部署完成".to_string(), 100);
        let healthz_url = format!("{}/healthz", base_url);
        Ok(DeployOutcome {
            deployment_id: deployment_id.to_string(),
            base_url,
            healthz_url,
            token: config.jwt.secret.clone(),
            uploaded_count,
            total_bytes,
            duration_ms: 0,
            log: log.clone(),
        })
    }
}

/// 统计本地待上传产物的文件数与总字节数（目录递归）。
fn local_stats(paths: &[PathBuf]) -> (u64, u64) {
    let mut files = 0u64;
    let mut bytes = 0u64;
    fn walk(p: &Path, files: &mut u64, bytes: &mut u64) {
        if let Ok(meta) = std::fs::metadata(p) {
            if meta.is_file() {
                *files += 1;
                *bytes += meta.len();
            } else if meta.is_dir() {
                if let Ok(entries) = std::fs::read_dir(p) {
                    for entry in entries.flatten() {
                        walk(&entry.path(), files, bytes);
                    }
                }
            }
        }
    }
    for p in paths {
        walk(p, &mut files, &mut bytes);
    }
    (files, bytes)
}

/// shell 单引号安全包裹（密码可能含 ' " $ 等字符）
fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

/// URL userinfo 百分号编码（拼接 postgres://user:pass@host 时防止 @:/ 等字符破坏解析；
/// tokio-postgres 解析连接串时会自动解码 userinfo）
fn url_encode_userinfo(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

/// user 级 systemd unit（无需 root；linger 由部署流程单独开启）。
fn unit_file(site_name: &str, remote_dir: &str) -> String {
    format!(
        "# Generated by WebCraft deploy. See docs/server-integration-design.md\n\
[Unit]\n\
Description=WebCraft site: {site}\n\
After=network.target\n\
StartLimitIntervalSec=300\n\
StartLimitBurst=5\n\n\
[Service]\n\
Type=simple\n\
WorkingDirectory={dir}\n\
ExecStart={dir}/webcraft-server --config {dir}/server.toml\n\
Restart=on-failure\n\
RestartSec=3\n\
TimeoutStartSec=60\n\
TimeoutStopSec=30\n\
KillMode=mixed\n\n\
[Install]\n\
WantedBy=default.target\n",
        site = site_name,
        dir = remote_dir,
    )
}

/// 生成 Nginx 反向代理站点配置。
/// 代理到本地 webcraft-server 端口，支持静态文件直接由 Nginx 提供（可选）。
fn nginx_site_config(domain: &str, site_name: &str, app_port: u16) -> String {
    let server_name = if domain.is_empty() {
        "_".to_string()  // 默认 server
    } else {
        domain.to_string()
    };

    // 按字符边界截取前 8 个（避免中文 UTF-8 字节切片 panic）
    let slug = site_name
        .chars()
        .take(8)
        .collect::<String>()
        .to_lowercase()
        .replace(' ', "-");

    format!(
        "# Generated by WebCraft deploy — site: {site}\n\
# Reverse proxy to webcraft-server on port {port}\n\n\
server {{\n\
    listen 80;\n\
    server_name {sname};\n\n\
    # 日志（可选，注释掉避免产生大量日志）\n\
    # access_log /var/log/nginx/webcraft-{slug}.access.log;\n\
    # error_log  /var/log/nginx/webcraft-{slug}.error.log;\n\n\
    # 客户端最大上传大小\n\
    client_max_body_size 50M;\n\n\
    # 代理到 webcraft-server\n\
    location / {{\n\
        proxy_pass http://127.0.0.1:{port};\n\
        proxy_http_version 1.1;\n\
        proxy_set_header Host $host;\n\
        proxy_set_header X-Real-IP $remote_addr;\n\
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n\
        proxy_set_header X-Forwarded-Proto $scheme;\n\n\
        # WebSocket 支持（如果需要）\n\
        proxy_set_header Upgrade $http_upgrade;\n\
        proxy_set_header Connection \"upgrade\";\n\n\
        # 超时设置\n\
        proxy_connect_timeout 30s;\n\
        proxy_send_timeout 300s;\n\
        proxy_read_timeout 300s;\n\n\
        # 缓存静态文件（可选优化，交给后端也可以）\n\
        # location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {{\n\
        #     proxy_pass http://127.0.0.1:{port};\n\
        #     expires 30d;\n\
        #     add_header Cache-Control \"public, immutable\";\n\
        # }}\n\
    }}\n\n\
    # 健康检查端点（可用于外部监控）\n\
    location = /healthz {{\n\
        proxy_pass http://127.0.0.1:{port}/healthz;\n\
        access_log off;\n\
    }}\n\
}}\n",
        site = site_name,
        sname = server_name,
        slug = slug,
        port = app_port,
    )
}

// ============================================================
// 完整功能版部署（Full Server Mode）
// ============================================================
// 支持：PostgreSQL + Redis + JWT 认证 + RBAC + 数据模型引擎 + ...
// 模式：源码上传 → 服务器编译 → 自动迁移 → 启动服务
// 环境检测：复用运维中心 ops-web-env-check 脚本（不重复造轮子）
// AI 修复：  复用已有的 AI Copilot + 环境修复 Agent 链路
// ============================================================

/// 部署模式
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DeployMode {
    /// 极简版（M1）：静态托管 + 简单 API，二进制部署
    Simple,
    /// 完整版：完整功能 webcraft-server，源码编译部署
    Full,
}

impl DeployMode {
    pub fn from_str(s: &str) -> Self {
        match s {
            "full" | "complete" | "pro" => DeployMode::Full,
            _ => DeployMode::Simple,
        }
    }
}

// ---------- ops-web-env-check 脚本输出解析 ----------

/// 环境检测汇总（来自 ops-web-env-check 的 summary 字段）
#[derive(Debug, Clone, Deserialize)]
pub struct EnvCheckSummary {
    pub score: i32,
    pub total: i32,
    pub passed: i32,
    pub warning: i32,
    pub failed: i32,
    pub info: i32,
    pub check_mode: String,
}

/// 单个检测项
#[derive(Debug, Clone, Deserialize)]
pub struct EnvCheckItem {
    pub name: String,
    pub status: String, // pass / warning / fail / info
    pub value: String,
    #[serde(default)]
    pub detail: String,
}

/// 检测分组
#[derive(Debug, Clone, Deserialize)]
pub struct EnvCheckGroup {
    pub id: String,
    pub name: String,
    pub items: Vec<EnvCheckItem>,
}

/// ops-web-env-check 完整输出结构
#[derive(Debug, Clone, Deserialize)]
pub struct EnvCheckResult {
    pub summary: EnvCheckSummary,
    pub groups: Vec<EnvCheckGroup>,
}

impl EnvCheckResult {
    /// 从 ops-web-env-check 的 stdout 中解析 JSON
    /// 脚本输出可能包含 stderr 信息（如 [env-check] mode=python），需要提取纯 JSON
    pub fn from_stdout(stdout: &str) -> Result<Self> {
        // 找到第一个 '{' 和最后一个 '}' 之间的内容
        let json_start = stdout.find('{')
            .ok_or_else(|| Error::Cms("环境检测输出中未找到 JSON".to_string()))?;
        let json_end = stdout.rfind('}')
            .ok_or_else(|| Error::Cms("环境检测输出中未找到 JSON 结尾".to_string()))?;
        let json_str = &stdout[json_start..=json_end];
        serde_json::from_str(json_str)
            .map_err(|e| Error::Cms(format!("环境检测结果解析失败: {}", e)))
    }

    /// 检查是否满足完整版部署的最低要求
    /// 必须项：PostgreSQL (pass)、Redis (pass)
    /// 注意：云端部署只支持 PostgreSQL，不支持其他数据库
    pub fn check_full_deploy_ready(&self) -> FullDeployReadiness {
        let mut pg_ok = false;
        let mut redis_ok = false;
        let mut issues: Vec<String> = Vec::new();

        for group in &self.groups {
            for item in &group.items {
                let name_lower = item.name.to_lowercase();
                if name_lower.contains("postgresql") {
                    if item.status == "pass" {
                        pg_ok = true;
                    } else if item.status == "fail" || item.status == "warning" {
                        issues.push(format!("PostgreSQL: {} - {}", item.value, item.detail));
                    }
                } else if name_lower.contains("redis") && !name_lower.contains("内存") && !name_lower.contains("持久化") && !name_lower.contains("连接数") {
                    if item.status == "pass" {
                        redis_ok = true;
                    } else if item.status == "fail" || item.status == "warning" {
                        issues.push(format!("Redis: {} - {}", item.value, item.detail));
                    }
                }
            }
        }

        FullDeployReadiness {
            pg_ok,
            redis_ok,
            score: self.summary.score,
            failed_count: self.summary.failed,
            warning_count: self.summary.warning,
            issues,
        }
    }
}

/// 完整版部署就绪检查结果
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FullDeployReadiness {
    pub pg_ok: bool,
    pub redis_ok: bool,
    pub score: i32,
    pub failed_count: i32,
    pub warning_count: i32,
    pub issues: Vec<String>,
}

impl FullDeployReadiness {
    pub fn is_ready(&self) -> bool {
        self.pg_ok && self.redis_ok
    }
}

/// 完整版部署结果
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FullDeployOutcome {
    pub deployment_id: String,
    pub base_url: String,
    pub healthz_url: String,
    pub admin_username: String,
    pub admin_password: String,
    pub jwt_secret: String,
    pub db_url: String,
    pub redis_url: String,
    pub uploaded_count: u64,
    pub total_bytes: u64,
    pub duration_ms: i64,
    pub log: Vec<String>,
    pub version_dir: String,
}

impl DeployService {
    /// 完整版环境预检：复用运维中心 ops-web-env-check 脚本
    /// 不重复造轮子，直接调用已有脚本获取完整环境报告
    pub async fn preflight_via_ops(
        ops: &OpsService,
        db: &Database,
        connection_id: &str,
        domain: &str,
        deploy_path: &str,
        db_type: &str,
    ) -> Result<EnvCheckResult> {
        let mut params = HashMap::new();
        params.insert("domain".to_string(), domain.to_string());
        params.insert("deploy_path".to_string(), deploy_path.to_string());
        params.insert("expected_db".to_string(), db_type.to_string());

        let result = ops.run(db, "ops-web-env-check", &params, connection_id)
            .await
            .map_err(|e| Error::Cms(format!("环境检测脚本执行失败: {}", e)))?;

        if !result.success {
            return Err(Error::Cms(format!(
                "环境检测脚本执行失败: {}",
                if result.stderr.is_empty() { result.stdout.clone() } else { result.stderr.clone() }
            )));
        }

        EnvCheckResult::from_stdout(&result.stdout)
    }

    /// 生成完整配置的 server.toml（完整版部署用）
    pub fn generate_full_config(
        port: u16,
        db_url: &str,
        redis_url: &str,
    ) -> Result<String> {
        let config = default_production_config(port, db_url, redis_url);
        render_full_config(&config).map_err(Error::Cms)
    }

    /// 打包本地 server 源码（排除 target、.git 等大文件）
    pub fn package_source(project_root: &Path, output_path: &Path) -> Result<(u64, u64)> {
        // 确保输出目录存在
        if let Some(parent) = output_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| Error::Cms(format!("创建目录失败: {}", e)))?;
        }

        let server_dir = project_root.join("server");
        let common_dir = project_root.join("common");

        if !server_dir.is_dir() {
            return Err(Error::Cms(format!("server 目录不存在: {}", server_dir.display())));
        }

        // 创建临时打包目录
        let tmp_dir = std::env::temp_dir().join(format!("webcraft-src-{}", uuid::Uuid::new_v4().simple()));
        let tmp_server = tmp_dir.join("server");
        let tmp_common = tmp_dir.join("common");

        // 复制 server 源码（排除 target）
        Self::copy_dir_filtered(&server_dir, &tmp_server, &["target", ".git"])?;

        // 复制 common 源码
        if common_dir.is_dir() {
            Self::copy_dir_filtered(&common_dir, &tmp_common, &["target", ".git"])?;
        }

        // 复制 workspace Cargo.toml（如果存在）
        let ws_cargo = project_root.join("Cargo.toml");
        if ws_cargo.is_file() {
            std::fs::copy(&ws_cargo, tmp_dir.join("Cargo.toml"))
                .map_err(|e| Error::Cms(format!("复制 Cargo.toml 失败: {}", e)))?;
        }

        // 打包成 tar.gz
        let output = std::fs::File::create(output_path)
            .map_err(|e| Error::Cms(format!("创建源码包失败: {}", e)))?;

        let gz = flate2::write::GzEncoder::new(output, flate2::Compression::default());
        let mut tar = tar::Builder::new(gz);
        tar.append_dir_all(".", &tmp_dir)
            .map_err(|e| Error::Cms(format!("打包失败: {}", e)))?;

        let gz = tar.into_inner()
            .map_err(|e| Error::Cms(format!("tar 写入失败: {}", e)))?;
        gz.finish().map_err(|e| Error::Cms(format!("gzip 失败: {}", e)))?;

        // 统计
        let meta = std::fs::metadata(output_path)
            .map_err(|e| Error::Cms(format!("获取文件大小失败: {}", e)))?;
        let total_bytes = meta.len();

        // 清理临时目录
        let _ = std::fs::remove_dir_all(&tmp_dir);

        Ok((1, total_bytes))
    }

    /// 复制目录，排除指定子目录
    fn copy_dir_filtered(src: &Path, dst: &Path, exclude: &[&str]) -> Result<()> {
        std::fs::create_dir_all(dst).map_err(|e| Error::Cms(format!("创建目录失败: {}", e)))?;

        for entry in std::fs::read_dir(src).map_err(|e| Error::Cms(format!("读取目录失败: {}", e)))? {
            let entry = entry.map_err(|e| Error::Cms(format!("读取目录项失败: {}", e)))?;
            let name = entry.file_name();
            let name_str = name.to_string_lossy();

            // 排除列表
            if exclude.iter().any(|ex| name_str == *ex) {
                continue;
            }

            let src_path = entry.path();
            let dst_path = dst.join(&name);

            if src_path.is_dir() {
                Self::copy_dir_filtered(&src_path, &dst_path, exclude)?;
            } else {
                std::fs::copy(&src_path, &dst_path)
                    .map_err(|e| Error::Cms(format!("复制文件失败: {}", e)))?;
            }
        }

        Ok(())
    }

    // ============================================================
    // 完整版一键部署（async）
    // ============================================================
    // 流水线：
    //   1. 校验站点与绑定服务器
    //   2. 环境检测（复用 ops-web-env-check）
    //   3. 打包源码（server + common）
    //   4. SFTP 上传源码包
    //   5. 服务器端解压 + cargo build --release
    //   6. 生成 server.toml（完整 AppConfig）
    //   7. 数据库初始化 + 迁移
    //   8. systemd 服务安装 + 启动
    //   9. Nginx 反向代理配置
    //  10. healthz 验证
    //  11. 清理旧版本
    // ============================================================

    /// 完整版一键部署入口（异步，支持通过 ops 做环境检测）
    #[allow(clippy::too_many_arguments)]
    pub async fn deploy_full(
        db: &Database,
        sftp: &SftpService,
        ops: &OpsService,
        site_id: &str,
        project_root: &Path,
        data_dir: &Path,
        version: Option<&str>,
        on_progress: Arc<dyn Fn(DeployProgress) + Send + Sync>,
    ) -> Result<FullDeployOutcome> {
        let started = now_ms();
        let deployment_id = format!("deploy-full-{}", uuid::Uuid::new_v4());
        let mut log: Vec<String> = Vec::new();
        let outcome = Self::run_full(
            db, sftp, ops, site_id, project_root, data_dir,
            version.unwrap_or("latest"),
            &deployment_id, &mut log, on_progress,
        ).await;
        let finished = now_ms();
        let duration_ms = finished - started;

        let (status, error_summary, uploaded_count, total_bytes, version_dir) = match &outcome {
            Ok(o) => ("success".to_string(), String::new(), o.uploaded_count, o.total_bytes, o.version_dir.clone()),
            Err(e) => {
                let msg = e.to_string();
                log.push(format!("[failed] {}", msg));
                ("failed".to_string(), msg, 0, 0, String::new())
            }
        };

        // 从 site 读取 connection_id
        let conn_id = SiteRepo::get_by_id(db, site_id)?
            .and_then(|s| s.connection_id);

        // 从 deploy_config 取 remote_path
        let remote_path = SiteRepo::get_by_id(db, site_id)?
            .and_then(|s| {
                let cfg: serde_json::Value = serde_json::from_str(&s.deploy_config_json).unwrap_or_default();
                cfg["remote_path"].as_str().map(|s| s.to_string())
            })
            .unwrap_or_default();

        let log_json = serde_json::to_string(&log.iter().take(200).collect::<Vec<_>>()).unwrap_or_else(|_| "[]".to_string());

        let row = DeploymentRow {
            id: deployment_id.clone(),
            site_id: site_id.to_string(),
            trigger_type: "manual".to_string(),
            target_env: "production".to_string(),
            mode: "full".to_string(),
            connection_id: conn_id,
            remote_path,
            version_dir,
            server_version: version.unwrap_or("latest").to_string(),
            status,
            started_at: started,
            finished_at: Some(finished),
            duration_ms: Some(duration_ms),
            uploaded_count: uploaded_count as i64,
            deleted_count: 0,
            total_bytes: total_bytes as i64,
            error_summary,
            manifest_json: "[]".to_string(),
            steps_json: "[]".to_string(),
            log_json,
            rollback_from: None,
        };
        if let Err(e) = deployment_repo::insert(db, &row) {
            tracing::warn!("[deploy-full] 写部署记录失败: {}", e);
        }
        if outcome.is_ok() {
            if let Some(mut site) = SiteRepo::get_by_id(db, site_id)? {
                site.last_deployed_at = Some(finished);
                SiteRepo::update(db, &site)?;
            }
        }
        outcome.map(|mut o| { o.duration_ms = duration_ms; o })
    }

    #[allow(clippy::too_many_arguments)]
    async fn run_full(
        db: &Database,
        sftp: &SftpService,
        ops: &OpsService,
        site_id: &str,
        project_root: &Path,
        data_dir: &Path,
        version: &str,
        deployment_id: &str,
        log: &mut Vec<String>,
        on_progress: Arc<dyn Fn(DeployProgress) + Send + Sync>,
    ) -> Result<FullDeployOutcome> {
        let step = |s: &str, m: String, p: u8| {
            on_progress(DeployProgress { step: s.to_string(), message: m, percent: p });
        };

        // ---- 1. 校验 ----
        step(STEP_VALIDATE, "校验站点与绑定服务器".to_string(), 2);
        let site = SiteRepo::get_by_id(db, site_id)?
            .ok_or_else(|| Error::Cms(format!("站点不存在: {}", site_id)))?;
        let conn_id = site.connection_id.as_deref()
            .ok_or_else(|| Error::Cms("站点未绑定服务器，无法部署".into()))?;
        let conn = ConnectionRepo::get_by_id(db, conn_id)?
            .ok_or_else(|| Error::Cms(format!("绑定的服务器连接不存在: {}", conn_id)))?;
        let ssh: SshConnectionInfo = serde_json::from_str(&conn.config_json)
            .map_err(|e| Error::Cms(format!("服务器连接配置解析失败: {}", e)))?;

        let deploy_config: serde_json::Value =
            serde_json::from_str(&site.deploy_config_json).unwrap_or(serde_json::json!({}));
        let remote = deploy_config["remote_path"].as_str().unwrap_or("").trim().to_string();
        if remote.is_empty() {
            return Err(Error::Cms("部署远程路径为空，请先在站点配置中填写".into()));
        }
        let port = deploy_config["server_port"].as_u64().unwrap_or(DEFAULT_SERVER_PORT as u64) as u16;
        let domain = site.domain.trim().to_string();
        let enable_nginx = deploy_config["enable_nginx"].as_bool().unwrap_or(true);

        // 数据库/Redis 连接信息（从 deploy_config 读取，或使用默认值）
        let db_name = deploy_config["db_name"].as_str().unwrap_or("webcraft").to_string();
        let db_user = deploy_config["db_user"].as_str().unwrap_or("postgres").to_string();
        let db_pass = deploy_config["db_password"].as_str().unwrap_or("").to_string();
        let db_host = deploy_config["db_host"].as_str().unwrap_or("localhost").to_string();
        let db_port_db = deploy_config["db_port"].as_u64().unwrap_or(5432) as u16;
        let redis_host = deploy_config["redis_host"].as_str().unwrap_or("localhost").to_string();
        let redis_port = deploy_config["redis_port"].as_u64().unwrap_or(6379) as u16;

        let db_url = if db_pass.is_empty() {
            format!("postgres://{}@{}:{}/{}", url_encode_userinfo(&db_user), db_host, db_port_db, db_name)
        } else {
            format!("postgres://{}:{}@{}:{}/{}", url_encode_userinfo(&db_user), url_encode_userinfo(&db_pass), db_host, db_port_db, db_name)
        };
        let redis_url = format!("redis://{}:{}/0", redis_host, redis_port);

        // 记录部署摘要
        log.push("╔════════════════════════════════════════╗".to_string());
        log.push("║        🚀 WebCraft 部署开始            ║".to_string());
        log.push("╠════════════════════════════════════════╣".to_string());
        log.push(format!("║ 站点: {}", site.name));
        log.push(format!("║ 服务器: {}@{}:{}", ssh.username, ssh.host, ssh.port));
        log.push(format!("║ 部署路径: {}", remote));
        log.push(format!("║ 服务端口: {}", port));
        log.push(format!("║ 版本: {}", version));
        log.push(format!("║ 模式: 完整版 (Full)"));
        log.push(format!("║ 数据库: {}/{}", db_host, db_name));
        if !domain.is_empty() {
            log.push(format!("║ 域名: {}", domain));
        }
        log.push("╚════════════════════════════════════════╝".to_string());

        // ---- 2. 环境检测（复用 ops-web-env-check）----
        step(STEP_ENV_CHECK_FULL, "环境检测（调用运维中心脚本）".to_string(), 5);
        let env_result = Self::preflight_via_ops(ops, db, conn_id, &domain, &remote, "postgresql").await?;
        let readiness = env_result.check_full_deploy_ready();
        log.push(format!(
            "环境检测: 得分 {}，failed={}，warning={}，pg_ok={}，redis_ok={}",
            readiness.score, readiness.failed_count, readiness.warning_count,
            readiness.pg_ok, readiness.redis_ok
        ));

        if !readiness.is_ready() {
            let issue_list = readiness.issues.join("\n  - ");
            log.push(format!("⚠️  环境未满足完整版部署要求:\n  - {}", issue_list));
            log.push("💡 请前往运维中心使用「AI 智能修复」自动修复环境问题后再部署".to_string());
            return Err(Error::Cms(format!(
                "环境未满足完整版部署要求（得分 {}）。\n问题:\n  - {}\n\n请前往运维中心使用「AI 智能修复」自动修复环境问题。",
                readiness.score, issue_list
            )));
        }
        step(STEP_ENV_CHECK_FULL, format!("环境就绪（得分 {}）", readiness.score), 8);

        // ---- 3. 准备 release 目录 ----
        let tmp_dir = std::env::temp_dir().join(format!("webcraft-full-{}", deployment_id));
        std::fs::create_dir_all(&tmp_dir)?;

        let release_ts = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
        let release_dir = format!("{}/releases/{}", remote, release_ts);
        let current_link = format!("{}/current", remote);

        // 创建远程目录
        run_ssh_command_with_timeout(
            &ssh,
            &format!("mkdir -p '{release_dir}' '{}/releases' '{}/nginx.conf.d' ~/.config/systemd/user",
                remote, remote),
            15,
        ).map_err(|e| Error::Cms(format!("创建远程目录失败: {}", e)))?;

        // ---- 4. 上传二进制 ----
        step(STEP_BINARY_UPLOAD, "探测服务器架构".to_string(), 10);

        // 探测服务器架构，选择对应平台的二进制
        let arch_raw = run_ssh_command_with_timeout(&ssh, "uname -m", 15)
            .map_err(|e| Error::Cms(format!("无法探测服务器架构: {}", e)))?;
        // 取最后一行非空行（过滤 SSH 登录提示、密码提示等杂讯）
        let arch = arch_raw.lines()
            .map(|l| l.trim())
            .filter(|l| !l.is_empty())
            .last()
            .unwrap_or("")
            .to_string();
        let arch_suffix = match arch.as_str() {
            "x86_64" | "amd64" => "linux-x86_64",
            "aarch64" | "arm64" => "linux-aarch64",
            other => {
                return Err(Error::Cms(format!(
                    "暂不支持的服务器架构: {}（当前支持 x86_64 / aarch64）",
                    other
                )))
            }
        };
        log.push(format!("服务器架构: {} → 使用 {}", arch, arch_suffix));

        // 从多个位置查找指定版本的二进制（data_dir / cwd / exe_dir 及其所有父目录）
        let search_dirs = Self::build_binary_search_dirs(data_dir);
        let search_refs: Vec<&Path> = search_dirs.iter().map(|p| p.as_path()).collect();
        let binary_path = Self::find_binary_path(&search_refs, version, arch_suffix)?;

        let binary_size = std::fs::metadata(&binary_path)?.len();
        log.push(format!("二进制文件: {} ({} bytes, 版本: {})", binary_path.display(), binary_size, version));

        step(STEP_BINARY_UPLOAD, "上传二进制到服务器".to_string(), 15);

        let upload = |paths: Vec<String>, dir: &str, names: Option<Vec<String>>, pct_from: u8, pct_to: u8, note: &str, resume: bool| -> Result<()> {
            let sink_progress = on_progress.clone();
            let progress_id = format!("deploy-full-{}", deployment_id);
            let note_owned = note.to_string();
            let ctx = ProgressCtx::new(
                progress_id,
                Arc::new(move |p: crate::app::sftp_service::TransferProgress| {
                    let span = pct_to.saturating_sub(pct_from);
                    let pct = pct_from + (p.overall_percent as u16 * span as u16 / 100) as u8;
                    sink_progress(DeployProgress {
                        step: STEP_BINARY_UPLOAD.to_string(),
                        message: format!("{} {} ({}/{})", note_owned, p.file, p.file_no, p.total_files),
                        percent: pct.min(99),
                    });
                }),
            );
            let names_ref = names.as_deref();
            sftp.upload(&ssh, &paths, dir, Some(&ctx), names_ref, resume)
                .map_err(|e| Error::Cms(format!("上传失败 ({note}): {}", e)))?;
            Ok(())
        };

        upload(
            vec![binary_path.to_string_lossy().to_string()],
            &release_dir,
            Some(vec!["webcraft-server".to_string()]),
            15, 35, "上传二进制",
            false,
        )?;

        // chmod +x
        run_ssh_command_with_timeout(
            &ssh,
            &format!("chmod +x '{release_dir}/webcraft-server'"),
            10,
        ).map_err(|e| Error::Cms(format!("设置二进制执行权限失败: {}", e)))?;

        let file_count = 1;
        let total_bytes = binary_size;
        step(STEP_BINARY_UPLOAD, format!("二进制上传完成（{} bytes）", total_bytes), 40);

        // ---- 6. 生成完整 server.toml ----
        step(STEP_CONFIG, "生成 server.toml（完整配置）".to_string(), 58);
        let jwt_secret = generate_jwt_secret();
        let config = default_production_config(port, &db_url, &redis_url);
        // 覆盖 jwt secret 为生成的（保证每次部署一致可复现）
        // 注：default_production_config 已经生成了随机 secret，这里用同一个
        let toml_text = render_full_config(&config).map_err(Error::Cms)?;

        let toml_local = tmp_dir.join("server.toml");
        std::fs::write(&toml_local, &toml_text)?;

        // 上传配置
        upload(
            vec![toml_local.to_string_lossy().to_string()],
            &release_dir,
            Some(vec!["server.toml".to_string()]),
            58, 60, "上传配置",
            false,
        )?;
        log.push("server.toml 已上传（完整 AppConfig）".to_string());

        // 上传站点静态内容（项目存在 dist/ 时；无 dist 视为纯后端部署，跳过）
        let dist_local = project_root.join("dist");
        if dist_local.is_dir() {
            step(STEP_UPLOAD, "上传站点静态内容 (dist/)".to_string(), 60);
            upload(
                vec![dist_local.to_string_lossy().to_string()],
                &format!("{}/dist", release_dir),
                None,
                60, 61, "上传静态内容",
                true,
            )?;
            log.push(format!("dist/ 静态内容已上传 ✓（{}）", dist_local.display()));
        } else {
            log.push("未找到 dist/ 目录，跳过静态内容上传（纯后端部署）".to_string());
        }

        // ---- 7. 数据库初始化 + 迁移 ----
        step(STEP_DB_SETUP, "检查数据库连接".to_string(), 62);

        // 判断是否为本地 PostgreSQL（localhost / 127.0.0.1）
        let is_local_pg = db_host == "localhost" || db_host == "127.0.0.1";
        let mut effective_db_pass = db_pass.clone();

        // 连接检测：psql 认证失败时错误文本经 2>&1 混入输出，SSH 命令本身
        // 仍以退出码 0 结束，因此必须依据输出内容判断，不能依赖 Result::is_err()
        let conn_cmd = format!(
            "PGPASSWORD={} psql -h {} -U {} -d postgres -t -c 'SELECT 1' 2>&1 | tail -1",
            shell_quote(&effective_db_pass), db_host, db_user
        );
        let conn_out = run_ssh_command_with_timeout(&ssh, &conn_cmd, 15).unwrap_or_default();
        let conn_ok = conn_out.trim() == "1";

        let mut db_exists = false;
        if conn_ok {
            let db_check_cmd = format!(
                "PGPASSWORD={} psql -h {} -U {} -d postgres -t -c \"SELECT 1 FROM pg_database WHERE datname='{}'\" 2>&1 | tail -1",
                shell_quote(&effective_db_pass), db_host, db_user, db_name
            );
            db_exists = run_ssh_command_with_timeout(&ssh, &db_check_cmd, 15)
                .map(|s| s.trim() == "1")
                .unwrap_or(false);
        }

        if !conn_ok && is_local_pg && db_user == "postgres" {
            // CentOS/RHEL 系 pg_hba.conf 默认对 TCP 回环（127.0.0.1/32 与 ::1/128）
            // 使用 ident 认证，root 无法以 postgres 身份经 TCP 连接。改用
            // sudo -u postgres 走 unix socket peer 认证完成初始化，并在
            // pg_hba.conf 顶部插入 md5 规则放开 TCP 密码认证（首条匹配生效）
            log.push(format!("⚠️  密码方式连接失败: {}", conn_out.trim()));
            log.push("通过 peer 认证初始化本地 PostgreSQL（建库/设密码/开放 TCP md5 认证）...".to_string());
            step(STEP_DB_SETUP, "初始化本地 PostgreSQL".to_string(), 63);

            if effective_db_pass.is_empty() {
                effective_db_pass = generate_jwt_secret()[..16].to_string();
            }

            // 1. peer 认证建库
            let create_via_peer = format!(
                "sudo -u postgres psql -d postgres -c \"CREATE DATABASE {}\" 2>&1",
                db_name
            );
            let peer_out = run_ssh_command_with_timeout(&ssh, &create_via_peer, 20)
                .unwrap_or_default();
            if peer_out.contains("CREATE DATABASE") {
                log.push(format!("数据库 {} 已创建 ✓", db_name));
                db_exists = true;
            } else if peer_out.contains("already exists") {
                log.push(format!("数据库 {} 已存在 ✓", db_name));
                db_exists = true;
            } else {
                log.push(format!("⚠️  建库输出: {}", peer_out.lines().last().unwrap_or("")));
            }

            // 2. peer 认证设置密码（保证与 server.toml 一致）
            //    密码经 psql -v 变量 + :'pw' 占位注入，安全处理引号等特殊字符
            let set_pass_cmd = format!(
                "sudo -u postgres psql -v ON_ERROR_STOP=1 -v pw={} -c \"ALTER USER postgres PASSWORD :'pw'\" 2>&1",
                shell_quote(&effective_db_pass)
            );
            let pass_out = run_ssh_command_with_timeout(&ssh, &set_pass_cmd, 15)
                .unwrap_or_default();
            if pass_out.contains("ALTER ROLE") {
                log.push("postgres 用户密码已设置 ✓".to_string());
            } else {
                log.push(format!("⚠️  密码设置输出: {}", pass_out.lines().last().unwrap_or("")));
            }

            // 3. pg_hba.conf 顶部插入 md5 规则（覆盖 IPv4/IPv6 回环，
            //    localhost 可能优先解析为 ::1）
            //    reload 用 pg_reload_conf()：与 systemd 服务名无关
            //    （PGDG 安装的服务名是 postgresql-14/15/16/17 等，systemctl reload
            //    按固定服务名猜测会静默失败，导致规则改了却不生效）
            let pg_hba_fix = r#"PG_HBA=$(sudo -u postgres psql -t -A -c 'SHOW hba_file' 2>/dev/null | tr -d '[:space:]'); if [ -n "$PG_HBA" ] && [ -f "$PG_HBA" ]; then grep -qE '^host[[:space:]]+all[[:space:]]+all[[:space:]]+127\.0\.0\.1/32[[:space:]]+md5' "$PG_HBA" || sudo sed -i '1i host    all             all             127.0.0.1/32            md5' "$PG_HBA"; grep -qE '^host[[:space:]]+all[[:space:]]+all[[:space:]]+::1/128[[:space:]]+md5' "$PG_HBA" || sudo sed -i '1i host    all             all             ::1/128                 md5' "$PG_HBA"; sudo chown postgres:postgres "$PG_HBA" 2>/dev/null; sudo chmod 600 "$PG_HBA" 2>/dev/null; sudo restorecon "$PG_HBA" 2>/dev/null; RELOAD=$(sudo -u postgres psql -t -A -c 'SELECT pg_reload_conf()' 2>&1); echo "pg_hba-ok reload=$RELOAD"; else echo "pg_hba-fail: 未找到 pg_hba.conf（PostgreSQL 未运行?）"; fi"#;
            let hba_out = run_ssh_command_with_timeout(&ssh, pg_hba_fix, 20).unwrap_or_default();
            log.push(format!("pg_hba 认证规则: {}", hba_out.lines().last().unwrap_or("")));

            // 4. 验证 TCP 密码连接（与 webcraft-server 的连接方式一致）
            let verify_cmd = format!(
                "PGPASSWORD={} psql -h {} -U {} -d postgres -t -c 'SELECT 1' 2>&1 | tail -1",
                shell_quote(&effective_db_pass), db_host, db_user
            );
            let verify_out = run_ssh_command_with_timeout(&ssh, &verify_cmd, 15).unwrap_or_default();
            if verify_out.trim() == "1" {
                log.push("数据库 TCP 密码认证验证通过 ✓".to_string());
                log.push(format!("💡 数据库密码: {}（已写入 server.toml）", effective_db_pass));
            } else {
                return Err(Error::Cms(format!(
                    "本地 PostgreSQL 初始化后仍无法通过 TCP 连接: {}\n\n中间步骤输出:\n  建库: {}\n  设密码: {}\n  pg_hba: {}\n\n请手动排查:\n  1. sudo -u postgres psql -c 'SHOW hba_file' 查看认证规则文件\n  2. 确认 PostgreSQL 服务正在运行\n  3. 确认 SSH 用户有 sudo 免密权限（visudo 配置 NOPASSWD）",
                    verify_out.trim(),
                    peer_out.lines().last().unwrap_or("(无输出)"),
                    pass_out.lines().last().unwrap_or("(无输出)"),
                    hba_out.lines().last().unwrap_or("(无输出)"),
                )));
            }
        } else if !conn_ok {
            // 远程数据库或非 postgres 用户，无法自动修复
            log.push(format!("⚠️  无法连接数据库: {}", conn_out.trim()));
            log.push("💡 请检查数据库主机地址、端口、用户名和密码是否正确".to_string());
            return Err(Error::Cms(format!(
                "数据库连接失败: {}\n\n请检查：\n  1. 数据库主机地址（db_host）和端口（db_port）是否正确\n  2. 数据库用户名（db_user）和密码（db_password）是否正确\n  3. 数据库服务是否已启动\n  4. 服务器能否访问数据库主机（网络连通性）",
                conn_out.trim()
            )));
        }

        // 如果数据库还不存在，尝试用密码方式创建
        if !db_exists {
            step(STEP_DB_SETUP, "创建数据库".to_string(), 64);
            let create_db_cmd = format!(
                "PGPASSWORD={} psql -h {} -U {} -d postgres -c \"CREATE DATABASE {}\" 2>&1",
                shell_quote(&effective_db_pass), db_host, db_user, db_name
            );
            let create_out = run_ssh_command_with_timeout(&ssh, &create_db_cmd, 30)
                .unwrap_or_default();
            if create_out.contains("CREATE DATABASE") || create_out.contains("already exists") {
                log.push(format!("数据库 {} 已创建 ✓", db_name));
            } else {
                log.push(format!("⚠️  数据库创建可能失败: {}", create_out.lines().last().unwrap_or("")));
                log.push("💡 请检查数据库用户是否有 CREATE DATABASE 权限".to_string());
            }
        } else {
            log.push(format!("数据库 {} 已存在 ✓", db_name));
        }

        // 重新生成 db_url（密码可能已更新）
        let db_url = if effective_db_pass.is_empty() {
            format!("postgres://{}@{}:{}/{}", url_encode_userinfo(&db_user), db_host, db_port_db, db_name)
        } else {
            format!("postgres://{}:{}@{}:{}/{}", url_encode_userinfo(&db_user), url_encode_userinfo(&effective_db_pass), db_host, db_port_db, db_name)
        };

        // 如果密码有变化，重新生成 server.toml 并上传
        if effective_db_pass != db_pass {
            step(STEP_CONFIG, "更新 server.toml 数据库密码".to_string(), 66);
            let config = default_production_config(port, &db_url, &redis_url);
            let toml_text = render_full_config(&config).map_err(Error::Cms)?;
            let toml_local = tmp_dir.join("server.toml");
            std::fs::write(&toml_local, &toml_text)?;
            upload(
                vec![toml_local.to_string_lossy().to_string()],
                &release_dir,
                Some(vec!["server.toml".to_string()]),
                66, 68, "更新配置",
                false,
            )?;
            log.push("server.toml 已更新（含数据库密码） ✓".to_string());
        }

        // 运行迁移（如果二进制支持 migrate 子命令）
        step(STEP_MIGRATE, "执行数据库迁移（可能需要一些时间）".to_string(), 68);
        let migrate_cmd = format!(
            "cd '{release_dir}' && ./webcraft-server migrate server.toml 2>&1",
        );
        let migrate_out = run_ssh_command_with_timeout(&ssh, &migrate_cmd, 180)
            .unwrap_or_else(|e| format!("migrate skipped: {}", e));

        if migrate_out.contains("unexpected argument") {
            // 旧版二进制无 migrate 子命令，跳过（服务启动时 auto_migrate 兜底）
            log.push("当前 webcraft-server 不支持 migrate 子命令，跳过（启动时自动迁移）".to_string());
        } else if migrate_out.contains("Migration") || migrate_out.contains("success") || migrate_out.contains("迁移完成") {
            log.push("数据库迁移完成 ✓".to_string());
        } else if migrate_out.contains("error") || migrate_out.contains("ERROR") || migrate_out.contains("失败") || migrate_out.contains("panic") {
            log.push(format!("⚠️  数据库迁移可能出错: {}", migrate_out.lines().last().unwrap_or("")));
            // 迁移失败不阻断部署，但给出警告
            log.push("💡 服务可能仍能启动，但部分功能可能异常".to_string());
        } else {
            log.push(format!("迁移输出: {}", migrate_out.lines().last().unwrap_or("无输出")));
            log.push("（如果 webcraft-server 不支持 migrate 子命令，请忽略此提示）".to_string());
        }

        step(STEP_MIGRATE, "数据库迁移完成".to_string(), 72);

        // ---- 8. systemd 服务安装 + 启动 ----
        step(STEP_INSTALL, "安装/更新 systemd 服务".to_string(), 75);
        let unit_slug = site.id.trim_start_matches("site-");
        let unit_slug_short = &unit_slug[..8.min(unit_slug.len())];
        let unit_name = format!("webcraft-{}.service", unit_slug_short);
        let sysctl = "export XDG_RUNTIME_DIR=/run/user/$(id -u); systemctl --user";

        let unit_text = unit_file(&site.name, &current_link);
        let unit_local = tmp_dir.join(&unit_name);
        std::fs::write(&unit_local, &unit_text)?;

        upload(
            vec![unit_local.to_string_lossy().to_string()],
            ".config/systemd/user",
            None,
            75, 77, "上传 unit",
            false,
        )?;

        // 检查服务是否已存在
        let service_exists = run_ssh_command_with_timeout(
            &ssh,
            &format!("{} list-unit-files {} 2>/dev/null | grep -q . && echo yes || echo no", sysctl, unit_name),
            10,
        ).map(|s| s.trim() == "yes").unwrap_or(false);

        // daemon-reload
        run_ssh_command_with_timeout(
            &ssh,
            &format!("{} daemon-reload", sysctl),
            15,
        ).map_err(|e| Error::Cms(format!("systemd daemon-reload 失败: {}", e)))?;

        if !service_exists {
            // 首次部署：先 symlink 再 enable
            let first_link_cmd = format!(
                "ln -sfn '{release_dir}' '{current_link}' && {sysctl} enable --now {unit_name}",
            );
            let out = run_ssh_command_with_timeout(&ssh, &first_link_cmd, 30)
                .map_err(|e| Error::Cms(format!("首次启动服务失败: {}", e)))?;
            log.push(format!("首次部署: enable --now → {}", out.trim()));
        }

        // linger 保证 SSH 退出后 user 级服务继续运行
        match run_ssh_command_with_timeout(&ssh, "loginctl enable-linger 2>/dev/null; echo linger-ok", 15) {
            Ok(_) => log.push("linger 已确认".to_string()),
            Err(e) => log.push(format!("enable-linger 跳过: {}", e)),
        }

        // ---- 9. 原子切换（蓝绿切换）----
        step(STEP_SWITCH, "原子切换版本".to_string(), 80);
        let prev_release = run_ssh_command_with_timeout(
            &ssh,
            &format!("readlink '{current_link}' 2>/dev/null || echo ''"),
            10,
        ).map(|s| s.trim().to_string()).unwrap_or_default();

        // 执行切换
        step(STEP_SWITCH, "切换符号链接并重启服务".to_string(), 82);
        let switch_cmd = format!(
            "ln -sfn '{release_dir}' '{current_link}' && {sysctl} restart {unit_name}",
        );
        run_ssh_command_with_timeout(&ssh, &switch_cmd, 30)
            .map_err(|e| Error::Cms(format!("切换版本失败: {}", e)))?;

        // 渐进式等待服务启动（最多等 60 秒）
        step(STEP_SWITCH, "等待服务启动...".to_string(), 84);
        let service_active = Self::wait_for_service_active(&ssh, &sysctl, &unit_name, 60, log);
        if !service_active {
            // 收集诊断信息
            log.push("--- 服务启动失败诊断信息 ---".to_string());
            let status_cmd = format!("{} status {} 2>&1 | head -20", sysctl, unit_name);
            if let Ok(s) = run_ssh_command_with_timeout(&ssh, &status_cmd, 10) {
                log.push(format!("systemctl status:\n{}", s.trim()));
            }
            let journal_cmd = format!("journalctl --user -u {} -n 20 --no-pager 2>&1", unit_name);
            if let Ok(j) = run_ssh_command_with_timeout(&ssh, &journal_cmd, 10) {
                log.push(format!("journalctl 最近日志:\n{}", j.trim()));
            }
            // 前台手动启动抓错误（最关键）
            let manual_cmd = format!(
                "cd '{}' && timeout 8 ./webcraft-server --config server.toml 2>&1 | head -40 || true",
                release_dir
            );
            if let Ok(m) = run_ssh_command_with_timeout(&ssh, &manual_cmd, 15) {
                log.push(format!("前台启动输出（最关键）:\n{}", m.trim()));
            }
            let port_cmd = format!("ss -tlnp | grep ':{} ' || echo '端口未被占用'", port);
            if let Ok(p) = run_ssh_command_with_timeout(&ssh, &port_cmd, 10) {
                log.push(format!("端口占用情况:\n{}", p.trim()));
            }
            log.push("--------------------------".to_string());

            log.push("⚠️  新版本未进入 active 状态，开始自动回滚".to_string());
            if !prev_release.is_empty() {
                let rollback_cmd = format!(
                    "ln -sfn '{prev}' '{current_link}' && {sysctl} restart {unit_name}",
                    prev = prev_release,
                );
                match run_ssh_command_with_timeout(&ssh, &rollback_cmd, 30) {
                    Ok(_) => {
                        // 等待回滚后的服务启动
                        let rb_active = Self::wait_for_service_active(&ssh, &sysctl, &unit_name, 20, log);
                        if rb_active {
                            log.push("✅ 已自动回滚到上一版本，服务恢复正常".to_string());
                        } else {
                            log.push("❌ 回滚后服务仍未 active，需人工排查".to_string());
                        }
                    }
                    Err(rb_e) => {
                        log.push(format!("❌ 回滚执行失败: {}", rb_e));
                    }
                }
            }
            return Err(Error::Cms(format!(
                "新版本部署失败：服务启动超时（60秒内未进入 active 状态）。\n已尝试自动回滚到上一版本。\n\n排查建议：\n  1. 执行 `journalctl --user -u {} -n 80 --no-pager` 查看服务日志\n  2. 检查端口 {} 是否被其他程序占用\n  3. 确认 server.toml 配置正确\n  4. 检查服务器内存/CPU 是否充足",
                unit_name, port
            )));
        }
        log.push(format!("版本切换成功: {} → active", release_ts));

        // ---- 10. Nginx 反向代理配置 ----
        let mut base_url = format!("http://{}:{}", ssh.host, port);
        if enable_nginx {
            step(STEP_NGINX, "配置 Nginx 反向代理".to_string(), 85);
            let nginx_conf_name = format!("webcraft-{}.conf", unit_slug_short);
            let nginx_conf_text = nginx_site_config(&domain, &site.name, port);
            let nginx_local = tmp_dir.join(&nginx_conf_name);
            std::fs::write(&nginx_local, &nginx_conf_text)?;

            upload(
                vec![nginx_local.to_string_lossy().to_string()],
                &format!("{}/nginx.conf.d", remote),
                None,
                85, 87, "上传 nginx",
                false,
            )?;

            let nginx_result = Self::setup_nginx_proxy(&ssh, &remote, &nginx_conf_name, &domain, log);
            match nginx_result {
                Ok(()) => {
                    if !domain.is_empty() {
                        base_url = format!("http://{}", domain);
                    }
                    log.push("✅ Nginx 反向代理配置成功".to_string());
                }
                Err(e) => {
                    log.push(format!("⚠️  Nginx 配置失败（不影响服务运行）: {}", e));
                }
            }
        }

        // ---- 11. healthz 验证 ----
        step(STEP_VERIFY, "等待 healthz 就绪...".to_string(), 90);
        let (healthz_ok, healthz_code) = Self::wait_for_healthz(&ssh, port, 60, log);
        if !healthz_ok {
            // 收集诊断信息
            log.push("--- healthz 验证失败诊断信息 ---".to_string());
            let journal_cmd = format!("journalctl --user -u {} -n 30 --no-pager 2>&1", unit_name);
            if let Ok(j) = run_ssh_command_with_timeout(&ssh, &journal_cmd, 10) {
                log.push(format!("服务最近日志:\n{}", j.trim()));
            }
            // 前台手动启动抓错误（最关键）
            let manual_cmd = format!(
                "cd '{}' && timeout 8 ./webcraft-server --config server.toml 2>&1 | head -40 || true",
                release_dir
            );
            if let Ok(m) = run_ssh_command_with_timeout(&ssh, &manual_cmd, 15) {
                log.push(format!("前台启动输出（最关键）:\n{}", m.trim()));
            }
            let curl_cmd = format!("curl -v http://localhost:{}/healthz 2>&1 | head -30", port);
            if let Ok(c) = run_ssh_command_with_timeout(&ssh, &curl_cmd, 10) {
                log.push(format!("端口响应详情:\n{}", c.trim()));
            }
            log.push("--------------------------".to_string());

            log.push(format!("⚠️  healthz 未返回 200（最终: {}），开始自动回滚", healthz_code));
            if !prev_release.is_empty() {
                step(STEP_VERIFY, "自动回滚中...".to_string(), 93);
                let rollback_cmd = format!(
                    "ln -sfn '{prev}' '{current_link}' && {sysctl} restart {unit_name}",
                    prev = prev_release,
                );
                match run_ssh_command_with_timeout(&ssh, &rollback_cmd, 30) {
                    Ok(_) => {
                        // 等待回滚后的服务启动并验证 healthz
                        let rb_active = Self::wait_for_service_active(&ssh, &sysctl, &unit_name, 20, log);
                        if rb_active {
                            let (rb_healthz, _) = Self::wait_for_healthz(&ssh, port, 20, log);
                            if rb_healthz {
                                log.push("✅ 自动回滚成功，上一版本服务运行正常".to_string());
                            } else {
                                log.push("⚠️  回滚后服务 active 但 healthz 异常，需人工排查".to_string());
                            }
                        } else {
                            log.push("❌ 回滚后服务未能进入 active 状态".to_string());
                        }
                    }
                    Err(rb_e) => {
                        log.push(format!("❌ 回滚执行失败: {}", rb_e));
                    }
                }
            }
            return Err(Error::Cms(format!(
                "healthz 验证失败（60秒内未返回 200，最终状态: {}）。\n新版本服务异常，已自动回滚到上一版本。\n\n排查建议：\n  1. 执行 `journalctl --user -u {} -n 80 --no-pager` 查看服务启动日志\n  2. 检查数据库连接配置（DB_HOST/DB_PORT/DB_USER/DB_PASSWORD）\n  3. 检查 Redis 连接配置（REDIS_HOST/REDIS_PORT）\n  4. 确认端口 {} 未被防火墙拦截",
                healthz_code, unit_name, port
            )));
        }
        log.push(format!("healthz 200 ✓ (localhost:{})", port));

        // ---- 12. 清理旧版本 ----
        step(STEP_CLEANUP, "清理旧版本".to_string(), 96);
        match Self::cleanup_old_releases(&ssh, &remote, KEEP_RELEASES) {
            Ok(removed) if removed > 0 => {
                log.push(format!("清理了 {} 个旧版本", removed));
            }
            Ok(_) => {}
            Err(e) => {
                log.push(format!("清理旧版本失败（非致命）: {}", e));
            }
        }

        // 清理本地临时文件
        let _ = std::fs::remove_dir_all(&tmp_dir);

        // 部署完成总结
        log.push("".to_string());
        log.push("╔════════════════════════════════════════╗".to_string());
        log.push("║        ✅ 部署成功完成！               ║".to_string());
        log.push("╠════════════════════════════════════════╣".to_string());
        log.push(format!("║ 访问地址: {}", base_url));
        log.push(format!("║ 健康检查: {}/healthz", base_url));
        log.push(format!("║ 版本目录: releases/{}", release_ts));
        log.push(format!("║ 上传文件: {} 个", file_count));
        log.push(format!("║ 数据大小: {} bytes", total_bytes));
        log.push("║                                        ║".to_string());
        log.push("║ 默认管理员账号:                        ║".to_string());
        log.push("║   用户名: admin                        ║".to_string());
        log.push("║   密码:   admin123 （请及时修改）      ║".to_string());
        log.push("╚════════════════════════════════════════╝".to_string());

        step(STEP_DONE, "部署完成".to_string(), 100);

        // 生成默认管理员账号信息（如果是首次部署）
        // 注：实际的管理员账号由数据库迁移时的种子数据创建
        // 这里只返回配置中的信息，用于提示用户
        let admin_username = "admin".to_string();
        let admin_password = "admin123".to_string(); // 默认密码，首次登录后应修改

        let healthz_url = format!("{}/healthz", base_url);
        Ok(FullDeployOutcome {
            deployment_id: deployment_id.to_string(),
            base_url,
            healthz_url,
            admin_username,
            admin_password,
            jwt_secret,
            db_url,
            redis_url,
            uploaded_count: file_count,
            total_bytes,
            duration_ms: 0,
            log: log.clone(),
            version_dir: release_ts.clone(),
        })
    }

    // ===== 运维管理：服务状态 / 重启 / 停止 / 回滚 =====

    /// 查询服务运行状态（使用 RemoteExecService，与环境检测同一条 SSH 执行路径）
    pub async fn get_service_status(
        remote_exec: &RemoteExecService,
        db: &Database,
        site_id: &str,
    ) -> Result<ServiceStatus> {
        let site = SiteRepo::get_by_id(db, site_id)?
            .ok_or_else(|| Error::Cms(format!("站点不存在: {}", site_id)))?;
        let conn_id = site.connection_id.as_deref()
            .ok_or_else(|| Error::Cms("站点未绑定服务器".into()))?;
        let conn = ConnectionRepo::get_by_id(db, conn_id)?
            .ok_or_else(|| Error::Cms("绑定的服务器连接不存在".into()))?;
        let ssh: SshConnectionInfo = serde_json::from_str(&conn.config_json)
            .map_err(|e| Error::Cms(format!("服务器连接配置解析失败: {}", e)))?;

        let deploy_config: serde_json::Value =
            serde_json::from_str(&site.deploy_config_json).unwrap_or_default();
        let port = deploy_config["server_port"].as_u64().unwrap_or(DEFAULT_SERVER_PORT as u64) as u16;
        let remote_path = deploy_config["remote_path"].as_str().unwrap_or("").to_string();

        // systemd 状态
        let active = Self::exec_ssh_stdout(remote_exec, &ssh,
            "systemctl --user is-active webcraft-server 2>/dev/null || echo 'inactive'",
            10,
        ).await.unwrap_or_else(|_| "unknown".to_string());
        let active = active.trim().to_string();

        // healthz 检查
        // curl 连接失败时 -w 仍会输出 000，故不需再 || echo
        let healthz = Self::exec_ssh_stdout(remote_exec, &ssh,
            &format!("curl -s -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{}/healthz 2>/dev/null", port),
            10,
        ).await.unwrap_or_else(|_| "000".to_string());
        let healthz = healthz.trim().to_string();
        // 容错：如果输出不是 3 位数字（比如拼接了其他内容），取最后 3 位
        let healthz = if healthz.len() >= 3 && healthz.chars().all(|c| c.is_ascii_digit()) {
            healthz.chars().rev().take(3).collect::<String>().chars().rev().collect()
        } else {
            "000".to_string()
        };

        // 当前版本目录：先判断符号链接是否存在，存在才 readlink
        let current_version = Self::exec_ssh_stdout(remote_exec, &ssh,
            &format!("[ -L {}/current ] && readlink -f {}/current 2>/dev/null | xargs basename 2>/dev/null || echo ''", remote_path, remote_path),
            10,
        ).await.unwrap_or_default();
        let current_version = current_version.trim().to_string();

        Ok(ServiceStatus {
            is_running: active == "active",
            status_text: active,
            healthz_code: healthz.clone(),
            health_ok: healthz == "200",
            current_version,
            port,
        })
    }

    /// 重启服务
    pub async fn restart_service(
        remote_exec: &RemoteExecService,
        db: &Database,
        site_id: &str,
    ) -> Result<()> {
        let site = SiteRepo::get_by_id(db, site_id)?
            .ok_or_else(|| Error::Cms(format!("站点不存在: {}", site_id)))?;
        let conn_id = site.connection_id.as_deref()
            .ok_or_else(|| Error::Cms("站点未绑定服务器".into()))?;
        let conn = ConnectionRepo::get_by_id(db, conn_id)?
            .ok_or_else(|| Error::Cms("绑定的服务器连接不存在".into()))?;
        let ssh: SshConnectionInfo = serde_json::from_str(&conn.config_json)
            .map_err(|e| Error::Cms(format!("服务器连接配置解析失败: {}", e)))?;

        let output = Self::exec_ssh_stdout(remote_exec, &ssh,
            "systemctl --user restart webcraft-server 2>&1 && echo OK || echo FAIL",
            15,
        ).await.map_err(|e| Error::Cms(format!("重启服务失败: {}", e)))?;
        if !output.contains("OK") {
            return Err(Error::Cms(format!("重启服务失败: {}", output.trim())));
        }
        Ok(())
    }

    /// 停止服务
    pub async fn stop_service(
        remote_exec: &RemoteExecService,
        db: &Database,
        site_id: &str,
    ) -> Result<()> {
        let site = SiteRepo::get_by_id(db, site_id)?
            .ok_or_else(|| Error::Cms(format!("站点不存在: {}", site_id)))?;
        let conn_id = site.connection_id.as_deref()
            .ok_or_else(|| Error::Cms("站点未绑定服务器".into()))?;
        let conn = ConnectionRepo::get_by_id(db, conn_id)?
            .ok_or_else(|| Error::Cms("绑定的服务器连接不存在".into()))?;
        let ssh: SshConnectionInfo = serde_json::from_str(&conn.config_json)
            .map_err(|e| Error::Cms(format!("服务器连接配置解析失败: {}", e)))?;

        let output = Self::exec_ssh_stdout(remote_exec, &ssh,
            "systemctl --user stop webcraft-server 2>&1 && echo OK || echo FAIL",
            15,
        ).await.map_err(|e| Error::Cms(format!("停止服务失败: {}", e)))?;
        if !output.contains("OK") {
            return Err(Error::Cms(format!("停止服务失败: {}", output.trim())));
        }
        Ok(())
    }

    /// 辅助函数：通过 RemoteExecService 执行 SSH 命令，返回 stdout
    async fn exec_ssh_stdout(
        remote_exec: &RemoteExecService,
        ssh: &SshConnectionInfo,
        command: &str,
        timeout_secs: u64,
    ) -> std::result::Result<String, String> {
        let req = RemoteExecRequest {
            connection_id: String::new(),
            command: command.to_string(),
            cwd: None,
            timeout_secs,
        };
        let result = remote_exec.execute(ssh, req).await;
        if result.success {
            Ok(result.stdout)
        } else {
            Err(if result.stderr.is_empty() { result.stdout } else { result.stderr })
        }
    }

    /// 回滚到指定部署版本
    pub async fn rollback_to(
        remote_exec: &RemoteExecService,
        db: &Database,
        site_id: &str,
        deployment_id: &str,
    ) -> Result<()> {
        let deployment = deployment_repo::get(db, deployment_id)?
            .ok_or_else(|| Error::Cms("部署记录不存在".into()))?;
        if deployment.site_id != site_id {
            return Err(Error::Cms("部署记录不属于该站点".into()));
        }
        if deployment.status != "success" {
            return Err(Error::Cms("只能回滚到成功的部署版本".into()));
        }
        if deployment.version_dir.is_empty() {
            return Err(Error::Cms("该部署记录没有版本目录信息，无法回滚".into()));
        }

        let site = SiteRepo::get_by_id(db, site_id)?
            .ok_or_else(|| Error::Cms(format!("站点不存在: {}", site_id)))?;
        let conn_id = site.connection_id.as_deref()
            .ok_or_else(|| Error::Cms("站点未绑定服务器".into()))?;
        let conn = ConnectionRepo::get_by_id(db, conn_id)?
            .ok_or_else(|| Error::Cms("绑定的服务器连接不存在".into()))?;
        let ssh: SshConnectionInfo = serde_json::from_str(&conn.config_json)
            .map_err(|e| Error::Cms(format!("服务器连接配置解析失败: {}", e)))?;

        let deploy_config: serde_json::Value =
            serde_json::from_str(&site.deploy_config_json).unwrap_or_default();
        let remote_path = deploy_config["remote_path"].as_str().unwrap_or("").to_string();
        let port = deploy_config["server_port"].as_u64().unwrap_or(DEFAULT_SERVER_PORT as u64) as u16;

        let target_dir = format!("{}/releases/{}", remote_path, deployment.version_dir);

        // 检查目标版本目录是否存在
        let exists = Self::exec_ssh_stdout(remote_exec, &ssh,
            &format!("[ -d '{}' ] && echo EXISTS || echo MISSING", target_dir),
            10,
        ).await.map_err(|e| Error::Cms(format!("检查版本目录失败: {}", e)))?;
        if !exists.contains("EXISTS") {
            return Err(Error::Cms(format!("版本目录不存在: {}", target_dir)));
        }

        // 原子切换 current 符号链接
        let switch = Self::exec_ssh_stdout(remote_exec, &ssh,
            &format!("ln -sfn '{}' '{}/current' && echo OK", target_dir, remote_path),
            10,
        ).await.map_err(|e| Error::Cms(format!("切换符号链接失败: {}", e)))?;
        if !switch.contains("OK") {
            return Err(Error::Cms("切换符号链接失败".into()));
        }

        // 重启服务
        let restart = Self::exec_ssh_stdout(remote_exec, &ssh,
            "systemctl --user restart webcraft-server 2>&1 && echo OK",
            15,
        ).await.map_err(|e| Error::Cms(format!("重启服务失败: {}", e)))?;
        if !restart.contains("OK") {
            return Err(Error::Cms(format!("重启服务失败: {}", restart.trim())));
        }

        // healthz 验证（最多等 10 秒）
        let mut healthy = false;
        for _ in 0..10 {
            let code = Self::exec_ssh_stdout(remote_exec, &ssh,
                &format!("curl -s -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{}/healthz 2>/dev/null", port),
                5,
            ).await.unwrap_or_else(|_| "000".to_string());
            if code.trim() == "200" {
                healthy = true;
                break;
            }
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        }

        if !healthy {
            // 回滚失败：切回上一个 current 记录（如果有的话）
            return Err(Error::Cms("回滚后 healthz 检查失败，服务可能异常".into()));
        }

        // 写入一条回滚记录
        let now = now_ms();
        let rollback_row = DeploymentRow {
            id: format!("deploy-rollback-{}", uuid::Uuid::new_v4()),
            site_id: site_id.to_string(),
            trigger_type: "rollback".to_string(),
            target_env: "production".to_string(),
            mode: deployment.mode.clone(),
            connection_id: Some(conn_id.to_string()),
            remote_path: remote_path.clone(),
            version_dir: deployment.version_dir.clone(),
            server_version: String::new(),
            status: "success".to_string(),
            started_at: now,
            finished_at: Some(now),
            duration_ms: Some(0),
            uploaded_count: 0,
            deleted_count: 0,
            total_bytes: 0,
            error_summary: String::new(),
            manifest_json: "[]".to_string(),
            steps_json: "[]".to_string(),
            log_json: format!("[\"回滚到版本 {}\"]", deployment.version_dir),
            rollback_from: Some(deployment_id.to_string()),
        };
        deployment_repo::insert(db, &rollback_row).ok();

        Ok(())
    }
}

// 额外步骤常量（完整版）
pub const STEP_SOURCE_PACKAGE: &str = "source_package";
pub const STEP_ENV_CHECK_FULL: &str = "env_check_full";
pub const STEP_SOURCE_UPLOAD: &str = "source_upload";
pub const STEP_BUILD: &str = "build";
pub const STEP_BINARY_UPLOAD: &str = "binary_upload";
pub const STEP_DB_SETUP: &str = "db_setup";
pub const STEP_MIGRATE: &str = "migrate";

/// 可用的 webcraft-server 版本信息
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerVersion {
    /// 版本标识（用于部署时选择），如 "latest"、"v1.0.0"
    pub version: String,
    /// 支持的架构列表，如 ["linux-x86_64", "linux-aarch64"]
    pub arches: Vec<String>,
    /// 文件大小（字节）
    pub size: u64,
    /// 最后修改时间（时间戳）
    pub modified_at: i64,
}

impl DeployService {
    /// 列出本地可用的 webcraft-server 版本（自动搜索多个 bin 目录）
    pub fn list_available_versions(search_dirs: &[&Path]) -> Result<Vec<ServerVersion>> {
        let mut versions: std::collections::HashMap<String, ServerVersion> = std::collections::HashMap::new();

        for base_dir in search_dirs {
            let bin_dir = base_dir.join("bin");
            if !bin_dir.exists() {
                continue;
            }

            Self::scan_bin_dir(&bin_dir, &mut versions)?;
        }

        // 排序：latest 排第一，然后按版本号降序
        let mut result: Vec<ServerVersion> = versions.into_values().collect();
        result.sort_by(|a, b| {
            if a.version == "latest" { return std::cmp::Ordering::Less; }
            if b.version == "latest" { return std::cmp::Ordering::Greater; }
            // 简单按版本号字符串倒序（v1.10 > v1.9 > v1.0.0）
            b.version.cmp(&a.version)
        });

        Ok(result)
    }

    /// 扫描单个 bin 目录，把结果合并到 versions 中
    fn scan_bin_dir(
        bin_dir: &std::path::Path,
        versions: &mut std::collections::HashMap<String, ServerVersion>,
    ) -> Result<()> {
        let entries = std::fs::read_dir(bin_dir)
            .map_err(|e| Error::Cms(format!("读取 bin 目录失败: {}", e)))?;

        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let filename = path.file_name()
                .and_then(|f| f.to_str())
                .unwrap_or("");

            // 解析文件名模式：
            // 1. webcraft-server (通用，无版本号，无架构) → version = "latest", arch = "generic"
            // 2. webcraft-server-linux-x86_64 (无版本号，有架构) → version = "latest", arch = "linux-x86_64"
            // 3. webcraft-server-linux-aarch64 (无版本号，有架构) → version = "latest", arch = "linux-aarch64"
            // 4. webcraft-server-v1.0.0 (有版本号，无架构) → version = "v1.0.0", arch = "generic"
            // 5. webcraft-server-v1.0.0-linux-x86_64 (有版本号，有架构)
            // 6. webcraft-server-v1.0.0-linux-aarch64 (有版本号，有架构)

            if !filename.starts_with("webcraft-server") {
                continue;
            }

            let rest = &filename["webcraft-server".len()..];
            if rest.is_empty() {
                // webcraft-server → latest, generic
                let size = path.metadata().map(|m| m.len()).unwrap_or(0);
                let modified_at = path.metadata()
                    .ok()
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs() as i64)
                    .unwrap_or(0);
                versions.entry("latest".to_string())
                    .and_modify(|v| { if !v.arches.iter().any(|a| a == "generic") { v.arches.push("generic".to_string()); } v.size = v.size.max(size); v.modified_at = v.modified_at.max(modified_at); })
                    .or_insert_with(|| ServerVersion {
                        version: "latest".to_string(),
                        arches: vec!["generic".to_string()],
                        size,
                        modified_at,
                    });
                continue;
            }

            let rest = rest.strip_prefix('-').unwrap_or(rest);
            let parts: Vec<&str> = rest.split('-').collect();

            // 判断是否是版本号开头（v 开头 + 数字）
            let (version_str, arch_start_idx) = if let Some(first) = parts.first() {
                if first.starts_with('v') && first.len() > 1 && first.chars().nth(1).map_or(false, |c| c.is_ascii_digit()) {
                    // 有版本号
                    (first.to_string(), 1)
                } else {
                    // 无版本号，直接是架构
                    ("latest".to_string(), 0)
                }
            } else {
                ("latest".to_string(), 0)
            };

            // 提取架构部分
            let arch_parts: Vec<&str> = parts.iter().skip(arch_start_idx).copied().collect();
            let arch = if arch_parts.is_empty() {
                "generic".to_string()
            } else {
                arch_parts.join("-")
            };

            // 只识别已知架构 + generic
            let known_arches = ["linux-x86_64", "linux-aarch64", "generic"];
            if !known_arches.contains(&arch.as_str()) {
                continue;
            }

            let size = path.metadata().map(|m| m.len()).unwrap_or(0);
            let modified_at = path.metadata()
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs() as i64)
                .unwrap_or(0);

            versions.entry(version_str.clone())
                .and_modify(|v| {
                    if !v.arches.contains(&arch) {
                        v.arches.push(arch.clone());
                    }
                    v.size = v.size.max(size);
                    v.modified_at = v.modified_at.max(modified_at);
                })
                .or_insert_with(|| ServerVersion {
                    version: version_str,
                    arches: vec![arch],
                    size,
                    modified_at,
                });
        }

        Ok(())
    }

    /// 构建二进制文件搜索路径（data_dir → cwd → exe_dir，各自向上遍历所有父目录）
    fn build_binary_search_dirs(data_dir: &Path) -> Vec<PathBuf> {
        let mut dirs: Vec<PathBuf> = Vec::new();

        // 1. data_dir 及其所有父目录
        let mut p: Option<&Path> = Some(data_dir);
        while let Some(d) = p {
            dirs.push(d.to_path_buf());
            p = d.parent();
        }

        // 2. 当前工作目录及其所有父目录
        if let Ok(cwd) = std::env::current_dir() {
            let mut p: Option<&Path> = Some(&cwd);
            while let Some(d) = p {
                dirs.push(d.to_path_buf());
                p = d.parent();
            }
        }

        // 3. 可执行文件目录及其所有父目录
        if let Ok(exe) = std::env::current_exe() {
            if let Some(exe_dir) = exe.parent() {
                let mut p: Option<&Path> = Some(exe_dir);
                while let Some(d) = p {
                    dirs.push(d.to_path_buf());
                    p = d.parent();
                }
            }
        }

        // 去重（保持顺序）
        let mut unique: Vec<PathBuf> = Vec::new();
        for d in dirs {
            if !unique.iter().any(|u| u == &d) {
                unique.push(d);
            }
        }
        unique
    }

    /// 根据版本号和架构查找二进制文件路径（按顺序搜索多个目录）
    pub fn find_binary_path(search_dirs: &[&Path], version: &str, arch_suffix: &str) -> Result<PathBuf> {
        for base_dir in search_dirs {
            let bin_dir = base_dir.join("bin");

            // 候选路径，按优先级排列
            let candidates = if version == "latest" {
                vec![
                    bin_dir.join(format!("webcraft-server-{}", arch_suffix)),
                    bin_dir.join("webcraft-server"),
                ]
            } else {
                vec![
                    bin_dir.join(format!("webcraft-server-{}-{}", version, arch_suffix)),
                    bin_dir.join(format!("webcraft-server-{}", version)),
                ]
            };

            for candidate in &candidates {
                if candidate.exists() {
                    return Ok(candidate.clone());
                }
            }
        }

        let searched: Vec<String> = search_dirs
            .iter()
            .map(|d| format!("  {}/bin/", d.display()))
            .collect();
        Err(Error::Cms(format!(
            "未找到版本 {} 的 webcraft-server 二进制（架构 {}）。\n已搜索目录:\n{}\n请将二进制放到以上任一目录的 bin/ 中。",
            version, arch_suffix, searched.join("\n")
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rendered_config_roundtrips_through_parser() {
        let config = ServerConfig {
            server: HttpConfig { port: 18080, static_dir: "dist".to_string() },
            auth: AuthConfig {
                token: "t".to_string(),
                allowed_roles: vec!["admin".to_string()],
            },
            route: vec![RouteEntry {
                path: "/healthz".to_string(),
                handler: "health".to_string(),
                roles: vec![],
            }],
        };
        let text = webcraft_common::render_config(&config).unwrap();
        let parsed = webcraft_common::parse_config(&text).unwrap();
        assert_eq!(parsed, config);
    }

    #[test]
    fn unit_file_contains_exec_and_restart() {
        let text = unit_file("我的博客", "/srv/blog");
        assert!(text.contains("ExecStart=/srv/blog/webcraft-server --config /srv/blog/server.toml"));
        assert!(text.contains("WorkingDirectory=/srv/blog"));
        assert!(text.contains("Restart=on-failure"));
        assert!(text.contains("WantedBy=default.target"));
    }
}
