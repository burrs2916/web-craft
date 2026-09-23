use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde::Serialize;

use crate::core::automation::now_ms;
use crate::app::remote_desktop_service::run_ssh_command_with_timeout;
use crate::app::remote_exec_service::{RemoteExecRequest, RemoteExecService};
use crate::app::sftp_service::{ProgressCtx, SftpService};
use crate::core::error::{io_err, Error, Result};
use crate::core::types::{Site, SshConnectionInfo};
use crate::infra::logging::debug_log;
use crate::infra::storage::connection_repo::ConnectionRepo;
use crate::infra::storage::database::Database;
use crate::infra::storage::deployment_repo::{self, DeploymentRow};
use crate::infra::storage::site_repo::SiteRepo;
use crate::infra::storage::site_domain_repo::SiteDomainRepo;

/// 部署步骤标识（前端进度 UI 按此渲染阶段）。
pub const STEP_VALIDATE: &str = "validate";
pub const STEP_PRECHECK: &str = "precheck";
pub const STEP_CONFIG: &str = "config";
pub const STEP_UPLOAD: &str = "upload";
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
    pub uploaded_count: u64,
    pub total_bytes: u64,
    pub duration_ms: i64,
    pub log: Vec<String>,
    /// 版本目录名（蓝绿部署的 release_ts，如 "20260903-153045"）
    pub version_dir: String,
    /// 删除的文件数（与上一版本对比）
    pub deleted_count: u64,
    /// 文件清单 JSON（Vec<ManifestEntry> 的序列化字符串）
    pub manifest_json: String,
    /// 部署步骤 JSON（Vec<DeploymentStep> 的序列化字符串）
    pub steps_json: String,
}

/// manifest 中的单条文件记录
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestEntry {
    pub path: String,
    pub size: u64,
    /// 文件修改时间的 unix 毫秒时间戳（用于增量判断）
    pub mtime_ms: Option<i64>,
}

/// 运行时步骤追踪器：记录每一步的状态、时间，最后序列化为 steps_json
struct StepTracker {
    steps: Vec<deployment_repo::DeploymentStep>,
    started_at: i64,
    current_step: Option<String>,
}

impl StepTracker {
    fn new() -> Self {
        Self {
            steps: vec![
                deployment_repo::DeploymentStep {
                    key: STEP_VALIDATE.to_string(),
                    name: "校验配置".to_string(),
                    status: "pending".to_string(),
                    message: String::new(),
                    percent: 0,
                    started_at: None,
                    finished_at: None,
                },
                deployment_repo::DeploymentStep {
                    key: STEP_PRECHECK.to_string(),
                    name: "环境检测".to_string(),
                    status: "pending".to_string(),
                    message: String::new(),
                    percent: 0,
                    started_at: None,
                    finished_at: None,
                },
                deployment_repo::DeploymentStep {
                    key: STEP_CONFIG.to_string(),
                    name: "生成配置".to_string(),
                    status: "pending".to_string(),
                    message: String::new(),
                    percent: 0,
                    started_at: None,
                    finished_at: None,
                },
                deployment_repo::DeploymentStep {
                    key: STEP_UPLOAD.to_string(),
                    name: "上传静态文件".to_string(),
                    status: "pending".to_string(),
                    message: String::new(),
                    percent: 0,
                    started_at: None,
                    finished_at: None,
                },
                deployment_repo::DeploymentStep {
                    key: STEP_SWITCH.to_string(),
                    name: "蓝绿切换".to_string(),
                    status: "pending".to_string(),
                    message: String::new(),
                    percent: 0,
                    started_at: None,
                    finished_at: None,
                },
                deployment_repo::DeploymentStep {
                    key: STEP_NGINX.to_string(),
                    name: "Nginx 配置".to_string(),
                    status: "pending".to_string(),
                    message: String::new(),
                    percent: 0,
                    started_at: None,
                    finished_at: None,
                },
                deployment_repo::DeploymentStep {
                    key: STEP_VERIFY.to_string(),
                    name: "可达性验证".to_string(),
                    status: "pending".to_string(),
                    message: String::new(),
                    percent: 0,
                    started_at: None,
                    finished_at: None,
                },
                deployment_repo::DeploymentStep {
                    key: STEP_CLEANUP.to_string(),
                    name: "清理旧版本".to_string(),
                    status: "pending".to_string(),
                    message: String::new(),
                    percent: 0,
                    started_at: None,
                    finished_at: None,
                },
                deployment_repo::DeploymentStep {
                    key: STEP_DONE.to_string(),
                    name: "部署完成".to_string(),
                    status: "pending".to_string(),
                    message: String::new(),
                    percent: 0,
                    started_at: None,
                    finished_at: None,
                },
            ],
            started_at: now_ms(),
            current_step: None,
        }
    }

    /// 更新进度：自动检测步骤切换（上一步自动 finish，新步骤自动 start）
    fn progress(&mut self, key: &str, message: &str, percent: u8) {
        let now = now_ms();
        // 如果切换了步骤，先结束上一步
        if self.current_step.as_deref() != Some(key) {
            // 结束上一步
            if let Some(prev_key) = &self.current_step {
                if let Some(prev_step) = self.steps.iter_mut().find(|s| s.key == *prev_key) {
                    if prev_step.status == "running" {
                        prev_step.status = "success".to_string();
                        prev_step.percent = 100;
                        prev_step.finished_at = Some(now);
                    }
                }
            }
            // 开始新步骤
            if let Some(step) = self.steps.iter_mut().find(|s| s.key == key) {
                step.status = "running".to_string();
                step.started_at = Some(now);
            }
            self.current_step = Some(key.to_string());
        }
        // 更新当前步骤的进度
        if let Some(step) = self.steps.iter_mut().find(|s| s.key == key) {
            step.message = message.to_string();
            step.percent = percent;
        }
    }

    /// 部署成功完成：标记所有已开始的步骤为 success
    fn finalize_success(&mut self) {
        let now = now_ms();
        for step in self.steps.iter_mut() {
            if step.status == "running" {
                step.status = "success".to_string();
                step.percent = 100;
                step.finished_at = Some(now);
            }
        }
    }

    /// 部署失败：标记当前步骤为 failed，后续步骤为 skipped
    fn finalize_failure(&mut self, error_msg: &str) {
        let now = now_ms();
        let mut failed = false;
        for step in self.steps.iter_mut() {
            if failed {
                step.status = "skipped".to_string();
            } else if step.status == "running" {
                step.status = "failed".to_string();
                step.message = error_msg.to_string();
                step.finished_at = Some(now);
                failed = true;
            }
        }
        // 如果还没开始任何步骤就失败了，标记第一步为 failed
        if !failed {
            if let Some(first) = self.steps.first_mut() {
                first.status = "failed".to_string();
                first.message = error_msg.to_string();
                first.started_at = Some(now);
                first.finished_at = Some(now);
            }
        }
    }

    /// 序列化为 JSON 字符串
    fn to_json(&self) -> String {
        serde_json::to_string(&self.steps).unwrap_or_else(|_| "[]".to_string())
    }
}

/// 服务运行状态（路线B：Nginx 静态托管）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceStatus {
    pub is_running: bool,
    pub healthz_code: String,
    pub health_ok: bool,
    pub current_version: String,
}

pub struct DeployService;

/// 部署前就绪检查的问题项（site_deploy_check 返回，前端据此显式呈现阻断点）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeployReadinessIssue {
    /// error | warning | info
    pub level: String,
    pub code: String,
    pub message: String,
    pub hint: Option<String>,
}

/// 部署前就绪检查结果（路线B：静态托管）。
/// 只读诊断，不拉取二进制、不写库。
/// 检查项：站点 / 连接 / 远程路径 / 本地 dist / Nginx 可用性。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeployReadiness {
    pub ok: bool,
    pub site_id: String,
    pub site_name: Option<String>,
    pub connection_id: Option<String>,
    pub connection_name: Option<String>,
    pub remote_path: Option<String>,
    pub local_dist_exists: bool,
    /// 远程服务器 Nginx 是否可用
    pub nginx_available: Option<bool>,
    pub issues: Vec<DeployReadinessIssue>,
}

/// 环境预检结果（路线B：仅 Nginx + 静态文件）
struct PreflightResult {
    nginx_available: bool,     // Nginx 是否已安装
    dir_writable: bool,        // 远程目录是否可写
}

impl DeployService {
    /// 环境预检（路线B）：Nginx 可用性 + 目录可写性
    fn preflight(ssh: &SshConnectionInfo, remote_path: &str, _port: u16, check_nginx: bool) -> Result<PreflightResult> {
        // Nginx 探测
        let nginx_available = if check_nginx {
            run_ssh_command_with_timeout(ssh, "command -v nginx >/dev/null 2>&1 && echo yes || echo no", 10)
                .map(|s| s.trim() == "yes")
                .unwrap_or(false)
        } else {
            false
        };

        // 目录可写性检查
        let dir_writable = run_ssh_command_with_timeout(
            ssh,
            &format!("mkdir -p '{}' && test -w '{}' && echo writable || echo not_writable", remote_path, remote_path),
            10,
        ).map(|s| s.trim() == "writable").unwrap_or(false);

        Ok(PreflightResult {
            nginx_available,
            dir_writable,
        })
    }

    /// 检测服务器上指定域名是否存在 Let's Encrypt SSL 证书。
    ///
    /// 返回证书目录路径（如 `/etc/letsencrypt/live/burrs.cloud`），
    /// 该路径可直接传给 `nginx_site_config` 的 `ssl_cert_dir` 参数，
    /// 使 Nginx 配置同时包含 443 proxy_pass + 80→HTTPS 301 重定向。
    ///
    /// 如果证书不存在或检测失败，返回 `None`（回退到 HTTP-only 配置）。
    fn detect_ssl_cert(ssh: &SshConnectionInfo, domains: &[String]) -> Option<String> {
        for domain in domains {
            if domain.is_empty() {
                continue;
            }
            let cert_path = format!("/etc/letsencrypt/live/{}/fullchain.pem", domain);
            let result = run_ssh_command_with_timeout(
                ssh,
                &format!("test -f '{}' && echo yes || echo no", cert_path),
                10,
            )
            .unwrap_or_else(|_| "no".to_string());

            if result.trim() == "yes" {
                return Some(format!("/etc/letsencrypt/live/{}", domain));
            }
        }
        None
    }

    /// 配置 Nginx 反向代理
    /// 策略：优先尝试系统级 Nginx（需 sudo），失败则降级到用户目录配置
    fn setup_nginx_proxy(
        ssh: &SshConnectionInfo,
        remote_path: &str,
        conf_name: &str,
        domains: &[String],
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
            // 清理与当前域名冲突的旧配置（Certbot 或手工创建的域名命名 conf），
            // 避免 server_name 冲突导致 Nginx 忽略 WebCraft 配置。
            for domain in domains {
                if domain.is_empty() {
                    continue;
                }
                let domain_site_avail = format!("/etc/nginx/sites-available/{}", domain);
                let domain_site_enabled = format!("/etc/nginx/sites-enabled/{}", domain);
                let _ = run_ssh_command_with_timeout(
                    ssh,
                    &sc(&format!(
                        "test -f '{sa}' && mv -f '{sa}' '{sa}.webcraft-replaced.bak' || true; \
                         test -L '{se}' && rm -f '{se}' || true",
                        sa = domain_site_avail,
                        se = domain_site_enabled
                    )),
                    10,
                );
            }

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

        // 策略 2：系统无 sites-available（如 CentOS/RHEL 的 nginx/1.20.1），
        // 写入标准 conf.d 目录（/etc/nginx/conf.d 默认被主配置 include）。
        // 否则动态生成的配置只会落到 {remote}/nginx.conf.d 而不会被加载，
        // 导致旧的 /etc/nginx/conf.d 中写死 root 的配置继续生效（403 Forbidden）。
        let confd_available = run_ssh_command_with_timeout(
            ssh,
            "test -d /etc/nginx/conf.d && echo yes || echo no",
            10,
        )
        .map(|s| s.trim() == "yes")
        .unwrap_or(false);

        if confd_available {
            // 清理旧的手工配置：example 模板里写死 `root /opt/webcraft/data/dist` 的
            // 残留 conf 会与本次生成的 proxy_pass 配置冲突并继续返回 403，部署前先备份移走。
            let _ = run_ssh_command_with_timeout(
                ssh,
                &sc("for f in /etc/nginx/conf.d/*.conf; do grep -q 'root /opt/webcraft' \"$f\" 2>/dev/null && mv -f \"$f\" \"${f}.deprecated.bak\"; done; true"),
                10,
            );

            // 清理与当前域名冲突的 Certbot/手工配置：
            // Certbot 通常以域名命名 conf（如 burrs.cloud.conf），其 server_name
            // 与 WebCraft 生成的配置相同，会导致 Nginx 忽略其中一个（冲突警告）。
            // 先备份再移走，确保 WebCraft 配置生效。
            for domain in domains {
                if domain.is_empty() {
                    continue;
                }
                let domain_conf = format!("/etc/nginx/conf.d/{}.conf", domain);
                let _ = run_ssh_command_with_timeout(
                    ssh,
                    &sc(&format!(
                        "test -f '{dc}' && mv -f '{dc}' '{dc}.webcraft-replaced.bak' || true",
                        dc = domain_conf
                    )),
                    10,
                );
                // 兜底：清理 sites-enabled 里可能存在的同名配置
                let domain_site = format!("/etc/nginx/sites-enabled/{}", domain);
                let _ = run_ssh_command_with_timeout(
                    ssh,
                    &sc(&format!(
                        "test -L '{ds}' && rm -f '{ds}' || true",
                        ds = domain_site
                    )),
                    10,
                );
            }

            let dest_conf = format!("/etc/nginx/conf.d/{}", conf_name);
            let copy_result = run_ssh_command_with_timeout(
                ssh,
                &sc(&format!("cp '{}' '{}'", user_conf, dest_conf)),
                10,
            );
            if copy_result.is_ok() {
                let test_result = run_ssh_command_with_timeout(ssh, &sc("nginx -t 2>&1"), 15);
                match test_result {
                    Ok(out) if out.contains("test is successful") || out.contains("syntax is ok") => {
                        let reload_result = run_ssh_command_with_timeout(
                            ssh,
                            &sc("nginx -s reload 2>&1 || systemctl reload nginx 2>&1"),
                            15,
                        );
                        match reload_result {
                            Ok(_) => {
                                log.push("Nginx: conf.d 配置已生效（CentOS/RHEL 路径）".to_string());
                                return Ok(());
                            }
                            Err(e) => {
                                log.push(format!("Nginx: reload 失败，回滚: {}", e));
                                let _ = run_ssh_command_with_timeout(
                                    ssh,
                                    &sc(&format!("rm -f '{}'", dest_conf)),
                                    10,
                                );
                            }
                        }
                    }
                    Ok(out) => {
                        log.push(format!(
                            "Nginx: 配置语法错误，回滚: {}",
                            out.lines().last().unwrap_or("")
                        ));
                        let _ = run_ssh_command_with_timeout(
                            ssh,
                            &sc(&format!("rm -f '{}'", dest_conf)),
                            10,
                        );
                    }
                    Err(e) => {
                        log.push(format!("Nginx: 配置测试失败: {}", e));
                        let _ = run_ssh_command_with_timeout(
                            ssh,
                            &sc(&format!("rm -f '{}'", dest_conf)),
                            10,
                        );
                    }
                }
            } else {
                log.push("Nginx: 无权限写入 /etc/nginx/conf.d，跳过系统级配置".to_string());
            }
        }

        // 策略 3：都没有可写目录时，仅提示用户手动配置
        if !domains.is_empty() {
            log.push(format!(
                "💡 Nginx 配置文件已保存到 {}/nginx.conf.d/{}，如需手动配置可参考该文件",
                remote_path, conf_name
            ));
        }

        Ok(())
    }

    /// 经 Nginx 代理层验证：通过 Nginx（80 端口）访问根路径，
    /// 验证「浏览器 → Nginx → 静态文件」完整链路。
    /// 直连验证（verify_frontend_reachable）只证明后端自身能返回 HTML，
    /// 但 Nginx 配置错误（proxy_pass 指错端口、server_name 不匹配）会导致
    /// 用户通过域名访问时被网关挡掉，直连发现不了。
    /// 有域名时带 Host header 精确命中对应 server block；无域名时
    /// server_name = "_"（default server），直接 localhost 即可。
    fn verify_nginx_proxy(
        ssh: &SshConnectionInfo,
        domains: &[String],
        log: &mut Vec<String>,
    ) -> (bool, String) {
        // 使用主域名（第一个）进行验证，无域名时走 default server
        let primary_domain = domains.iter().find(|d| !d.is_empty()).map(|d| d.as_str()).unwrap_or("");
        let probe_cmd = if primary_domain.is_empty() {
            "curl -sS -o /tmp/webcraft_nginx_check.html -D - --connect-timeout 5 http://localhost/ 2>&1 | head -20".to_string()
        } else {
            format!(
                "curl -sS -o /tmp/webcraft_nginx_check.html -D - --connect-timeout 5 -H 'Host: {}' http://localhost/ 2>&1 | head -20",
                primary_domain
            )
        };
        let out = match run_ssh_command_with_timeout(ssh, &probe_cmd, 15) {
            Ok(o) => o,
            Err(e) => {
                log.push(format!("  Nginx 代理层验证执行失败: {}", e));
                return (false, "error".to_string());
            }
        };

        let status_line = out
            .lines()
            .find(|l| l.trim_start().to_lowercase().starts_with("http/"))
            .unwrap_or("");
        let code = status_line
            .split_whitespace()
            .nth(1)
            .unwrap_or("000")
            .to_string();
        let content_type = out
            .lines()
            .find(|l| l.to_lowercase().starts_with("content-type:"))
            .unwrap_or("")
            .to_lowercase();
        let is_html = content_type.contains("text/html");
        let ok = code == "200" && is_html;

        if ok {
            log.push(format!("  Nginx 代理层验证通过: HTTP {} (Content-Type: {}) ✓", code, content_type.trim()));
        } else {
            log.push(format!(
                "  ⚠️ Nginx 代理层验证失败: HTTP {} (Content-Type: '{}') —— Nginx 配置可能有问题（proxy_pass / server_name / 静态 root），直连后端正常但经网关访问异常",
                code, content_type.trim()
            ));
        }
        (ok, code)
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

    /// 一键部署（路线B：纯静态 Nginx 托管）：校验 → 预检 → 生成 Nginx 配置
    /// → SFTP 上传 dist/ → 蓝绿符号链接切换 → Nginx 配置安装 → 验证可达性 → 清理旧版本。
    /// 失败即中止并落库 failed 记录；成功更新 site.last_deployed_at。
    #[allow(clippy::too_many_arguments)]
    pub fn deploy(
        db: &Database,
        sftp: &SftpService,
        site_id: &str,
        data_dir: &Path,
        trigger_type: &str,
        on_progress: Arc<dyn Fn(DeployProgress) + Send + Sync>,
    ) -> Result<DeployOutcome> {
        let started = now_ms();
        let deployment_id = format!("deploy-{}", uuid::Uuid::new_v4());
        let mut log: Vec<String> = Vec::new();

        // 步骤追踪器（在 deploy 层创建，通过包装 on_progress 来追踪，
        // 这样无论 run() 成功还是失败都能拿到步骤数据）
        use std::sync::Mutex;
        let step_tracker = Arc::new(Mutex::new(StepTracker::new()));
        let tracker_clone = Arc::clone(&step_tracker);
        let progress_wrapper: Arc<dyn Fn(DeployProgress) + Send + Sync> = Arc::new(move |p| {
            if let Ok(mut t) = tracker_clone.lock() {
                t.progress(&p.step, &p.message, p.percent);
            }
            on_progress(p);
        });

        let mut outcome = Self::run(db, sftp, site_id, data_dir, &deployment_id, &mut log, progress_wrapper);
        let finished = now_ms();
        let duration_ms = finished - started;

        // 无论成功失败，都生成 steps_json
        let steps_json = match &outcome {
            Ok(_) => {
                if let Ok(mut t) = step_tracker.lock() {
                    t.finalize_success();
                }
                step_tracker.lock().map(|t| t.to_json()).unwrap_or_else(|_| "[]".to_string())
            }
            Err(e) => {
                if let Ok(mut t) = step_tracker.lock() {
                    t.finalize_failure(&e.to_string());
                }
                step_tracker.lock().map(|t| t.to_json()).unwrap_or_else(|_| "[]".to_string())
            }
        };

        if let Ok(o) = &mut outcome {
            o.duration_ms = duration_ms;
            // 用 deploy 层的步骤数据覆盖 run 返回的（更完整，包含失败场景）
            o.steps_json = steps_json.clone();
        }

        let (status, error_summary, uploaded_count, total_bytes, version_dir, manifest_json, deleted_count) = match &outcome {
            Ok(o) => ("success".to_string(), String::new(), o.uploaded_count, o.total_bytes,
                o.version_dir.clone(), o.manifest_json.clone(), o.deleted_count),
            Err(e) => {
                let msg = e.to_string();
                log.push(format!("[failed] {}", msg));
                ("failed".to_string(), msg, 0, 0, String::new(), "[]".to_string(), 0)
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
            trigger_type: trigger_type.to_string(),
            target_env: "production".to_string(),
            mode: "simple".to_string(),
            connection_id: conn_id,
            remote_path,
            version_dir,
            server_version: String::new(),
            status,
            started_at: started,
            finished_at: Some(finished),
            duration_ms: Some(duration_ms),
            uploaded_count: uploaded_count as i64,
            deleted_count: deleted_count as i64,
            total_bytes: total_bytes as i64,
            error_summary,
            manifest_json,
            steps_json,
            log_json,
            rollback_from: None,
        };
        if let Err(e) = deployment_repo::insert(db, &row) {
            tracing::warn!("[deploy] 写部署记录失败: {}", e);
        }
        // 收尾 trace：成/败、耗时、上传量各留一条，便于按 deployment id
        // 一次性 grep 出整条部署链路
        match &outcome {
            Ok(o) => deploy_trace(&deployment_id, "INFO", STEP_DONE, "done",
                &format!("duration_ms={} uploaded={} bytes={} base_url={}",
                    duration_ms, o.uploaded_count, o.total_bytes, o.base_url), &[]),
            Err(e) => deploy_trace(&deployment_id, "ERROR", "-", "failed",
                &format!("duration_ms={} error={}", duration_ms, e), &[]),
        }
        register_deployment_resource(db, &row);
        if outcome.is_ok() {
            if let Some(mut site) = SiteRepo::get_by_id(db, site_id)? {
                site.last_deployed_at = Some(finished);
                SiteRepo::update(db, &site)?;
            }
        }
        outcome
    }

    /// 部署前就绪检查（路线B）：一次性返回「为什么不能部署」的结构化结论。
    /// 只读诊断，覆盖：站点存在 / 连接有效 / 远程路径 / 本地 dist / Nginx 可用。
    pub fn check_readiness(
        db: &Database,
        data_dir: &Path,
        site_id: &str,
    ) -> Result<DeployReadiness> {
        let mut issues: Vec<DeployReadinessIssue> = Vec::new();
        let mut ok = true;

        let site = match SiteRepo::get_by_id(db, site_id)? {
            Some(s) => s,
            None => {
                return Ok(DeployReadiness {
                    ok: false,
                    site_id: site_id.to_string(),
                    site_name: None,
                    connection_id: None,
                    connection_name: None,
                    remote_path: None,
                    local_dist_exists: false,
                    nginx_available: None,
                    issues: vec![DeployReadinessIssue {
                        level: "error".to_string(),
                        code: "SITE_NOT_FOUND".to_string(),
                        message: format!("站点不存在: {}", site_id),
                        hint: None,
                    }],
                });
            }
        };

        let deploy_config: serde_json::Value =
            serde_json::from_str(&site.deploy_config_json).unwrap_or(serde_json::json!({}));
        let remote = deploy_config["remote_path"].as_str().unwrap_or("").trim().to_string();

        // 1) 服务器连接
        let mut conn_name: Option<String> = None;
        let mut ssh: Option<SshConnectionInfo> = None;
        match &site.connection_id {
            None => {
                ok = false;
                issues.push(DeployReadinessIssue {
                    level: "error".to_string(),
                    code: "NO_CONNECTION".to_string(),
                    message: "站点未绑定服务器连接，无法部署".to_string(),
                    hint: Some("请在站点设置中绑定一个远程服务器连接".to_string()),
                });
            }
            Some(cid) => match ConnectionRepo::get_by_id(db, cid)? {
                None => {
                    ok = false;
                    issues.push(DeployReadinessIssue {
                        level: "error".to_string(),
                        code: "CONNECTION_NOT_FOUND".to_string(),
                        message: format!("绑定的服务器连接不存在: {}", cid),
                        hint: None,
                    });
                }
                Some(conn) => {
                    conn_name = Some(conn.name.clone());
                    match serde_json::from_str::<SshConnectionInfo>(&conn.config_json) {
                        Ok(s) => ssh = Some(s),
                        Err(e) => {
                            ok = false;
                            issues.push(DeployReadinessIssue {
                                level: "error".to_string(),
                                code: "CONNECTION_CONFIG_INVALID".to_string(),
                                message: format!("服务器连接配置解析失败: {}", e),
                                hint: None,
                            });
                        }
                    }
                }
            },
        }

        // 2) 远程路径
        if remote.is_empty() {
            ok = false;
            issues.push(DeployReadinessIssue {
                level: "error".to_string(),
                code: "NO_REMOTE_PATH".to_string(),
                message: "部署远程路径为空".to_string(),
                hint: Some("请在站点配置中填写远程部署路径（如 /var/www/example.com/html）".to_string()),
            });
        }

        // 3) 本地构建产物
        let dist_local = match Self::resolve_static_dist(data_dir, &site) {
            Ok(p) => p,
            Err(e) => {
                ok = false;
                issues.push(DeployReadinessIssue {
                    level: "error".to_string(),
                    code: "NO_LOCAL_DIST".to_string(),
                    message: e.to_string(),
                    hint: Some("运行站点构建生成 dist/ 后再部署".to_string()),
                });
                PathBuf::new()
            }
        };
        let local_dist_exists = !dist_local.as_os_str().is_empty() && dist_local.is_dir();

        // 4) 远端 Nginx 可用性（路线B核心检查项）
        let mut nginx_available: Option<bool> = None;
        if let Some(ssh) = &ssh {
            if !remote.is_empty() {
                match run_ssh_command_with_timeout(ssh, "command -v nginx >/dev/null 2>&1 && echo yes || echo no", 15) {
                    Ok(out) => {
                        let nginx_ok = out.trim() == "yes";
                        nginx_available = Some(nginx_ok);
                        if !nginx_ok {
                            ok = false;
                            issues.push(DeployReadinessIssue {
                                level: "error".to_string(),
                                code: "NGINX_NOT_FOUND".to_string(),
                                message: "远程服务器未安装 Nginx".to_string(),
                                hint: Some("请先在服务器上安装 Nginx（如 apt install nginx 或 yum install nginx）".to_string()),
                            });
                        }
                    }
                    Err(e) => {
                        ok = false;
                        issues.push(DeployReadinessIssue {
                            level: "error".to_string(),
                            code: "SSH_UNREACHABLE".to_string(),
                            message: format!("无法连接服务器: {}", e),
                            hint: Some("检查连接凭据/网络/主机是否可达".to_string()),
                        });
                    }
                }
            }
        }

        // 信息项
        if ok {
            if let Some(ref cname) = conn_name {
                issues.push(DeployReadinessIssue {
                    level: "info".to_string(),
                    code: "CONNECTED".to_string(),
                    message: format!("已绑定服务器连接：{}", cname),
                    hint: None,
                });
            }
            if local_dist_exists {
                issues.push(DeployReadinessIssue {
                    level: "info".to_string(),
                    code: "DIST_READY".to_string(),
                    message: "本地 dist/ 构建产物就绪".to_string(),
                    hint: None,
                });
            }
            if nginx_available == Some(true) {
                issues.push(DeployReadinessIssue {
                    level: "info".to_string(),
                    code: "NGINX_READY".to_string(),
                    message: "远程 Nginx 可用，静态托管就绪".to_string(),
                    hint: None,
                });
            }

            // 5) DNS 绑定检查（warning，不阻断部署）
            // 批量检测所有域名的 DNS 解析 IP 是否与服务器 IP 匹配（单次 SSH 调用）
            if let Some(ssh) = &ssh {
                let mut domains = SiteDomainRepo::list_domains_by_site(db, &site.id)
                    .unwrap_or_else(|_| Vec::new());
                let site_domain = site.domain.trim();
                if domains.is_empty() && !site_domain.is_empty() {
                    domains.push(site_domain.to_string());
                }
                // 过滤空域名
                domains.retain(|d| !d.is_empty());

                if domains.is_empty() {
                    issues.push(DeployReadinessIssue {
                        level: "info".to_string(),
                        code: "NO_DOMAIN".to_string(),
                        message: "站点未绑定域名，部署后仅可通过服务器 IP 访问".to_string(),
                        hint: Some("在站点设置中绑定域名以启用通过域名访问".to_string()),
                    });
                } else {
                    // 构建批量 DNS 检测脚本：一次 SSH 调用检测所有域名
                    // 五级降级：dig → host → nslookup → getent → python3 socket
                    let domain_list = domains.join(" ");
                    let dns_cmd = format!(
                        r#"SERVER_IP=$(curl -s4 --connect-timeout 5 ifconfig.me 2>/dev/null || hostname -I 2>/dev/null | awk '{{print $1}}' || echo '');
echo "SERVER_IP=$SERVER_IP";
for d in {domains}; do
    RESOLVED='';
    if command -v dig >/dev/null 2>&1; then
        RESOLVED=$(dig +short "$d" A 2>/dev/null | grep -E '^[0-9]+\.' | head -1);
    fi
    if [ -z "$RESOLVED" ] && command -v host >/dev/null 2>&1; then
        RESOLVED=$(host -t A "$d" 2>/dev/null | grep "has address" | head -1 | awk '{{print $NF}}');
    fi
    if [ -z "$RESOLVED" ] && command -v nslookup >/dev/null 2>&1; then
        RESOLVED=$(nslookup "$d" 2>/dev/null | grep -E "^Address:?\s" | grep -v '#' | tail -1 | awk '{{print $NF}}');
    fi
    if [ -z "$RESOLVED" ] && command -v getent >/dev/null 2>&1; then
        RESOLVED=$(getent hosts "$d" 2>/dev/null | awk '{{print $1}}' | grep -E '^[0-9]+\.' | head -1);
    fi
    if [ -z "$RESOLVED" ] && command -v python3 >/dev/null 2>&1; then
        RESOLVED=$(python3 -c "import socket,sys; print(socket.gethostbyname(sys.argv[1]))" "$d" 2>/dev/null);
    fi
    echo "DOMAIN=$d:RESOLVED=$RESOLVED";
done"#,
                        domains = domain_list
                    );
                    match run_ssh_command_with_timeout(ssh, &dns_cmd, 30) {
                        Ok(out) => {
                            let mut server_ip = String::new();
                            // 先解析 SERVER_IP
                            for line in out.lines() {
                                let line = line.trim();
                                if line.starts_with("SERVER_IP=") {
                                    server_ip = line.strip_prefix("SERVER_IP=").unwrap_or("").trim().to_string();
                                }
                            }
                            // 再逐域名解析结果
                            for domain in &domains {
                                let prefix = format!("DOMAIN={}:RESOLVED=", domain);
                                let resolved_ip = out.lines()
                                    .map(|l| l.trim())
                                    .find(|l| l.starts_with(&prefix))
                                    .map(|l| l.strip_prefix(&prefix).unwrap_or("").trim().to_string())
                                    .unwrap_or_default();

                                if resolved_ip.is_empty() {
                                    issues.push(DeployReadinessIssue {
                                        level: "warning".to_string(),
                                        code: "DNS_UNRESOLVED".to_string(),
                                        message: format!("域名 {} 的 DNS 无法解析 A 记录", domain),
                                        hint: Some("请在域名服务商处添加 A 记录指向服务器 IP，DNS 生效通常需要几分钟到数小时".to_string()),
                                    });
                                } else if !server_ip.is_empty() && resolved_ip != server_ip {
                                    issues.push(DeployReadinessIssue {
                                        level: "warning".to_string(),
                                        code: "DNS_MISMATCH".to_string(),
                                        message: format!("域名 {} 解析到 {}，但服务器 IP 为 {}", domain, resolved_ip, server_ip),
                                        hint: Some("如果使用了 CDN（如 Cloudflare），IP 不匹配属正常；否则请检查 A 记录是否指向正确的服务器 IP".to_string()),
                                    });
                                } else {
                                    issues.push(DeployReadinessIssue {
                                        level: "info".to_string(),
                                        code: "DNS_MATCHED".to_string(),
                                        message: format!("域名 {} DNS 解析正常（{}）", domain, resolved_ip),
                                        hint: None,
                                    });
                                }
                            }
                        }
                        Err(e) => {
                            for domain in &domains {
                                issues.push(DeployReadinessIssue {
                                    level: "warning".to_string(),
                                    code: "DNS_CHECK_FAILED".to_string(),
                                    message: format!("域名 {} DNS 检测失败: {}", domain, e),
                                    hint: Some("DNS 检测需要 SSH 连接到服务器执行，确保连接可用".to_string()),
                                });
                            }
                        }
                    }
                }
            }
        }

        Ok(DeployReadiness {
            ok,
            site_id: site_id.to_string(),
            site_name: Some(site.name.clone()),
            connection_id: site.connection_id.clone(),
            connection_name: conn_name,
            remote_path: if remote.is_empty() { None } else { Some(remote) },
            local_dist_exists,
            nginx_available,
            issues,
        })
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
        // ---- 步骤追踪器（记录每步状态/耗时，最后落库 steps_json）----
        // 使用 Rc<RefCell> 让嵌套闭包也能共享更新追踪器
        use std::cell::RefCell;
        use std::rc::Rc;
        let step_tracker = Rc::new(RefCell::new(StepTracker::new()));

        // ---- 工具：进度回调（同时更新 step_tracker）----
        let progress = on_progress.clone();
        let tracker_rc = Rc::clone(&step_tracker);
        let step = move |s: &str, m: String, p: u8| {
            deploy_trace(deployment_id, "INFO", s, "step", &format!("{}% | {}", p, m), &[]);
            tracker_rc.borrow_mut().progress(s, &m, p);
            progress(DeployProgress { step: s.to_string(), message: m, percent: p });
        };
        deploy_trace(deployment_id, "INFO", STEP_VALIDATE, "start",
            &format!("site={} deployment={}", site_id, deployment_id), &[]);

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
        let domain = site.domain.trim().to_string();
        // 从 site_domains 表获取完整域名列表，降级到 site.domain
        let mut domains = SiteDomainRepo::list_domains_by_site(db, &site.id)
            .unwrap_or_else(|_| Vec::new());
        if domains.is_empty() && !domain.is_empty() {
            domains.push(domain.clone());
        }
        let enable_nginx = deploy_config["enable_nginx"].as_bool().unwrap_or(true);
        let dist_local = Self::resolve_static_dist(data_dir, &site)?;

        // 部署摘要
        log.push("==================================================".to_string());
        log.push("        WebCraft 部署开始 (静态托管 Route B)        ".to_string());
        log.push("==================================================".to_string());
        log.push(format!(" 站点: {}", site.name));
        log.push(format!(" 服务器: {}@{}:{}", ssh.username, ssh.host, ssh.port));
        log.push(format!(" 部署路径: {}", remote));
        log.push(format!(" 模式: 静态托管 (Route B - Nginx + 静态文件)"));
        if !domains.is_empty() {
            log.push(format!(" 域名: {}", domains.join(", ")));
        }
        log.push("==================================================".to_string());

        // ---- 2. 环境预检 ----
        step(STEP_PRECHECK, "环境预检".to_string(), 6);
        let precheck = Self::preflight(&ssh, &remote, 0, enable_nginx)?;
        log.push(format!("预检: nginx={}, dir_writable={}",
            precheck.nginx_available, precheck.dir_writable));
        if !precheck.dir_writable {
            return Err(Error::Cms(format!("远程目录不可写: {}", remote)));
        }
        step(STEP_PRECHECK, format!("nginx={}, dir_writable={}",
            precheck.nginx_available, precheck.dir_writable), 8);

        // ---- 3. 生成 Nginx 配置 ----
        step(STEP_CONFIG, "生成 Nginx 静态托管配置".to_string(), 10);
        let static_root = format!("{}/current/dist", remote);
        let ssl_cert_dir = if enable_nginx && precheck.nginx_available {
            Self::detect_ssl_cert(&ssh, &domains)
        } else {
            None
        };
        let nginx_conf_text = if enable_nginx && precheck.nginx_available {
            Some(nginx_site_config(&domains, &site.name, &static_root, ssl_cert_dir.as_deref()))
        } else {
            None
        };
        let unit_slug = site.id.trim_start_matches("site-");
        let unit_slug_short = &unit_slug[..8.min(unit_slug.len())];
        let nginx_conf_name = format!("webcraft-{}.conf", unit_slug_short);

        // 临时目录
        let tmp_dir = std::env::temp_dir().join(format!("webcraft-{}", deployment_id));
        deploy_trace(deployment_id, "INFO", STEP_CONFIG, "tmp_dir",
            &format!("path={}", tmp_dir.display()), &[]);
        std::fs::create_dir_all(&tmp_dir).map_err(io_err("创建临时目录 ", &tmp_dir))?;
        let nginx_tmp = tmp_dir.join(&nginx_conf_name);
        if let Some(ref nginx_text) = nginx_conf_text {
            std::fs::write(&nginx_tmp, nginx_text)
                .map_err(io_err("写入 nginx 配置 ", &nginx_tmp))?;
        }
        log.push("Nginx 静态托管配置生成完成".to_string());

        let (uploaded_count, total_bytes) = local_stats(&[dist_local.clone()]);

        // ---- 4. SFTP 上传 ----
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
            deploy_trace(deployment_id, "INFO", STEP_UPLOAD, "upload_begin",
                &format!("note={} dir={} files={} names={:?} resume={}",
                    note, dir, paths.len(), names, resume), &[]);
            sftp.upload(&ssh, &paths, dir, Some(&ctx), names_ref, resume)
                .map_err(|e| {
                    deploy_trace(deployment_id, "ERROR", STEP_UPLOAD, "upload_failed",
                        &format!("note={} dir={} error={}", note, dir, e), &[]);
                    Error::Cms(format!("上传失败 ({note}): {}", e))
                })?;
            Ok(())
        };

        // 蓝绿部署：版本目录名 = 时间戳
        let release_ts = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
        let release_dir = format!("{}/releases/{}", remote, release_ts);
        let current_link = format!("{}/current", remote);
        let dist_dir = format!("{}/dist", release_dir);

        step(STEP_UPLOAD, "创建远程目录结构".to_string(), 15);
        let mkdir_cmd = format!("mkdir -p '{}' '{}' '{}/nginx.conf.d'",
            release_dir, dist_dir, remote);
        run_ssh_command_with_timeout(&ssh, &mkdir_cmd, 15)
            .map_err(|e| Error::Cms(format!("创建远程目录失败: {}", e)))?;

        // 上传 Nginx 配置
        if nginx_conf_text.is_some() {
            step(STEP_UPLOAD, "上传 Nginx 配置".to_string(), 18);
            upload(
                vec![nginx_tmp.to_string_lossy().to_string()],
                &format!("{}/nginx.conf.d", remote),
                None,
                18, 20, "传输", false,
            )?;
        }

        // 增量上传：前端 dist 未变则跳过 SFTP 全量传输
        let dist_skip = dist_unchanged(&ssh, &remote, &dist_local);
        if dist_skip {
            step(STEP_UPLOAD, "前端 dist 未变化，复用上一版本（硬链接）".to_string(), 25);
            let link_cmd = format!(
                "cp -rl '{}/current/dist' '{}' 2>/dev/null || cp -r '{}/current/dist' '{}'",
                remote, dist_dir, remote, dist_dir
            );
            match run_ssh_command_with_timeout(&ssh, &link_cmd, 20) {
                Ok(_) => log.push("dist 复用上一版本，跳过上传（重部署加速）".to_string()),
                Err(_) => {
                    log.push("dist 硬链接失败，回退为全量上传".to_string());
                    step(STEP_UPLOAD, "上传站点静态内容 (dist/)".to_string(), 25);
                    upload(
                        vec![dist_local.to_string_lossy().to_string()],
                        &dist_dir,
                        Some(vec![".".to_string()]),
                        25, 55, "上传", true,
                    )?;
                }
            }
        } else {
            step(STEP_UPLOAD, "上传站点静态内容 (dist/)".to_string(), 25);
            upload(
                vec![dist_local.to_string_lossy().to_string()],
                &dist_dir,
                Some(vec![".".to_string()]),
                25, 55, "上传", true,
            )?;
        }

        // ---- 5. 原子切换（蓝绿切换）----
        step(STEP_SWITCH, "原子切换版本".to_string(), 60);
        let prev_release = run_ssh_command_with_timeout(
            &ssh,
            &format!("readlink '{current_link}' 2>/dev/null || echo ''"),
            10,
        ).map(|s| s.trim().to_string()).unwrap_or_default();

        step(STEP_SWITCH, "切换符号链接".to_string(), 65);
        let switch_cmd = format!("ln -sfn '{}' '{}'", release_dir, current_link);
        run_ssh_command_with_timeout(&ssh, &switch_cmd, 10)
            .map_err(|e| Error::Cms(format!("切换版本失败: {}", e)))?;
        log.push(format!("版本切换成功: {}", release_ts));

        // ---- 6. Nginx 配置 + reload ----
        let mut base_url = format!("http://{}", ssh.host);
        let mut nginx_configured = false;
        if enable_nginx && precheck.nginx_available && nginx_conf_text.is_some() {
            step(STEP_NGINX, "配置 Nginx 静态托管".to_string(), 70);
            let nginx_result = Self::setup_nginx_proxy(
                &ssh, &remote, &nginx_conf_name, &domains, log,
            );
            match nginx_result {
                Ok(()) => {
                    if !domains.is_empty() {
                        let scheme = if ssl_cert_dir.is_some() { "https" } else { "http" };
                        base_url = format!("{}://{}", scheme, domains[0]);
                    }
                    log.push("Nginx 静态托管配置成功".to_string());
                    if ssl_cert_dir.is_some() {
                        log.push("  SSL 证书已检测到，HTTPS 配置已生成".to_string());
                    }
                    nginx_configured = true;
                }
                Err(e) => {
                    log.push(format!("Nginx 配置失败: {}", e));
                    // 回滚
                    if !prev_release.is_empty() {
                        let _ = run_ssh_command_with_timeout(
                            &ssh,
                            &format!("ln -sfn '{}' '{}'", prev_release, current_link),
                            10,
                        );
                        log.push("已自动回滚到上一版本".to_string());
                    }
                    return Err(Error::Cms(format!("Nginx 配置失败: {}", e)));
                }
            }
        }

        // ---- 7. 前端可达性验证 ----
        if nginx_configured {
            step(STEP_VERIFY, "验证 Nginx 代理层可达...".to_string(), 85);
            let (nginx_ok, nginx_code) = Self::verify_nginx_proxy(&ssh, &domains, log);
            if !nginx_ok {
                log.push(format!(
                    "Nginx 代理层验证未通过（HTTP {}），可能是 Nginx 配置问题",
                    nginx_code
                ));
                // 回滚
                if !prev_release.is_empty() {
                    let _ = run_ssh_command_with_timeout(
                        &ssh,
                        &format!("ln -sfn '{}' '{}'", prev_release, current_link),
                        10,
                    );
                    log.push("已自动回滚到上一版本".to_string());
                }
                return Err(Error::Cms(format!(
                    "前端验证失败（HTTP {}），已自动回滚到上一版本",
                    nginx_code
                )));
            }
            log.push("前端页面可达性验证通过".to_string());
        }

        // ---- 8. 清理旧版本 ----
        step(STEP_CLEANUP, "清理旧版本".to_string(), 95);
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
        log.push("==================================================".to_string());
        log.push("        部署成功完成！                             ".to_string());
        log.push("==================================================".to_string());
        log.push(format!(" 访问地址: {}", base_url));
        log.push(format!(" 版本目录: releases/{}", release_ts));
        log.push(format!(" 上传文件: {} 个", uploaded_count));
        log.push(format!(" 数据大小: {} bytes", total_bytes));
        log.push("==================================================".to_string());

        step(STEP_DONE, "部署完成".to_string(), 100);
        let _ = std::fs::remove_dir_all(&tmp_dir);

        // 生成文件清单 manifest
        let manifest = build_manifest(&dist_local);
        let manifest_json = serde_json::to_string(&manifest).unwrap_or_else(|_| "[]".to_string());

        // 完成步骤追踪
        step_tracker.borrow_mut().finalize_success();
        let steps_json = step_tracker.borrow().to_json();

        Ok(DeployOutcome {
            deployment_id: deployment_id.to_string(),
            base_url,
            uploaded_count,
            total_bytes,
            duration_ms: 0,
            log: log.clone(),
            version_dir: release_ts.clone(),
            deleted_count: 0,
            manifest_json,
            steps_json,
        })
    }
}

/// 遍历本地目录生成文件清单（相对路径 + 大小 + mtime）
fn build_manifest(dir: &Path) -> Vec<ManifestEntry> {
    let mut entries = Vec::new();
    fn walk(p: &Path, base: &Path, entries: &mut Vec<ManifestEntry>) {
        if let Ok(meta) = std::fs::metadata(p) {
            if meta.is_file() {
                let rel = p.strip_prefix(base)
                    .map(|r| r.to_string_lossy().replace('\\', "/"))
                    .unwrap_or_else(|_| p.to_string_lossy().to_string());
                let mtime_ms = meta.modified().ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as i64);
                entries.push(ManifestEntry {
                    path: rel,
                    size: meta.len(),
                    mtime_ms,
                });
            } else if meta.is_dir() {
                if let Ok(read_dir) = std::fs::read_dir(p) {
                    for entry in read_dir.flatten() {
                        walk(&entry.path(), base, entries);
                    }
                }
            }
        }
    }
    walk(dir, dir, &mut entries);
    entries.sort_by(|a, b| a.path.cmp(&b.path));
    entries
}

/// 计算本地 dist 与远端上一版本(current/dist) 的文件数+总大小是否一致。
/// 一致说明前端没有变化，可跳过 SFTP 全量上传，直接在远端硬链接上一版 dist，
/// 大幅加速重部署；不一致才走正常全量上传（不会漏传）。
fn dist_unchanged(
    ssh: &SshConnectionInfo,
    remote: &str,
    dist_local: &Path,
) -> bool {
    let (lf, lb) = local_stats(&[dist_local.to_path_buf()]);
    if lf == 0 {
        return false; // 本地 dist 为空，没东西可比，走正常上传
    }
    let remote_current = format!("{}/current/dist", remote);
    let stat_cmd = format!(
        "test -d '{}' && \
         find '{}' -type f | wc -l && \
         du -sb '{}' | cut -f1",
        remote_current, remote_current, remote_current
    );
    let out = match run_ssh_command_with_timeout(ssh, &stat_cmd, 15) {
        Ok(o) => o,
        Err(_) => return false,
    };
    let parts: Vec<&str> = out.lines().map(|l| l.trim()).filter(|l| !l.is_empty()).collect();
    if parts.len() < 2 {
        return false; // current/dist 不存在或无法统计
    }
    let rf: u64 = parts[0].parse().unwrap_or(0);
    let rb: u64 = parts[1].parse().unwrap_or(0);
    rf == lf && rb == lb
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

/// 生成 Nginx 静态托管站点配置（路线B）。
/// 直接由 Nginx 提供静态文件（路线B）。
///
/// - `ssl_cert_dir` 为 `Some(path)` 时（Let's Encrypt 证书目录存在），
///   生成 HTTP→HTTPS 301 + 443 静态服务双 server block。
/// - 为 `None` 时只生成 80 端口静态服务。
fn nginx_site_config(
    domains: &[String],
    site_name: &str,
    static_root: &str,
    ssl_cert_dir: Option<&str>,
) -> String {
    let server_name = if domains.is_empty() {
        "_".to_string()
    } else {
        domains.join(" ")
    };

    // 静态文件 location 块
    let static_block = format!(
        "    # 客户端最大上传大小\n\
         client_max_body_size 50M;\n\n\
         # 静态文件根目录（蓝绿部署 current 符号链接指向）\n\
         root {root};\n\n\
         # SPA 路由：先找文件，找不到回退到 index.html\n\
         location / {{\n\
         \x20   try_files $uri $uri/ /index.html;\n\
         }}\n\n\
         # 静态资源缓存\n\
         location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {{\n\
         \x20   expires 30d;\n\
         \x20   add_header Cache-Control \"public, immutable\";\n\
         }}\n\n\
         # HTML 不缓存（确保用户总能拿到最新版本）\n\
         location ~* \\.html$ {{\n\
         \x20   add_header Cache-Control \"no-cache, no-store, must-revalidate\";\n\
         }}\n",
        root = static_root,
    );

    match ssl_cert_dir {
        Some(cert_dir) => {
            let fullchain = format!("{}/fullchain.pem", cert_dir);
            let privkey = format!("{}/privkey.pem", cert_dir);
            format!(
                "# Generated by WebCraft deploy — site: {site} (HTTPS, static)\n\
                 # Static file serving via Nginx with SSL\n\n\
                 # HTTP -> HTTPS 重定向\n\
                 server {{\n\
                 \x20   listen 80;\n\
                 \x20   server_name {sname};\n\
                 \x20   return 301 https://$host$request_uri;\n\
                 }}\n\n\
                 # HTTPS 静态服务\n\
                 server {{\n\
                 \x20   listen 443 ssl;\n\
                 \x20   server_name {sname};\n\n\
                 \x20   # SSL 证书\n\
                 \x20   ssl_certificate {fullchain};\n\
                 \x20   ssl_certificate_key {privkey};\n\
                 \x20   ssl_protocols TLSv1.2 TLSv1.3;\n\
                 \x20   ssl_ciphers HIGH:!aNULL:!MD5;\n\n\
                 {static}\n\
                 }}\n",
                site = site_name,
                sname = server_name,
                fullchain = fullchain,
                privkey = privkey,
                static = static_block,
            )
        }
        None => format!(
            "# Generated by WebCraft deploy — site: {site} (HTTP, static)\n\
             # Static file serving via Nginx\n\n\
             server {{\n\
             \x20   listen 80;\n\
             \x20   server_name {sname};\n\n\
             {static}\n\
             }}\n",
            site = site_name,
            sname = server_name,
            static = static_block,
        ),
    }
}
impl DeployService {
    // ===== 运维管理：服务状态 / 重启 / 停止 / 回滚 =====

    /// 查询服务运行状态（使用 RemoteExecService，与环境检测同一条 SSH 执行路径）
    /// 查询站点服务状态（路线B：Nginx 静态托管）
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
        let remote_path = deploy_config["remote_path"].as_str().unwrap_or("").to_string();

        // Nginx 运行状态
        let nginx_active = Self::exec_ssh_stdout(remote_exec, &ssh,
            "systemctl is-active nginx 2>/dev/null || echo unknown",
            10,
        ).await.unwrap_or_else(|_| "unknown".to_string());
        let nginx_active = nginx_active.trim().to_string();

        // 当前版本目录
        let current_version = Self::exec_ssh_stdout(remote_exec, &ssh,
            &format!("[ -L {}/current ] && readlink -f {}/current 2>/dev/null | xargs basename 2>/dev/null || echo ''", remote_path, remote_path),
            10,
        ).await.unwrap_or_default();
        let current_version = current_version.trim().to_string();

        // Nginx 站点配置是否启用（检查所有可能的安装位置）
        // 与 setup_nginx_proxy 的三种策略对齐：
        // 1. /etc/nginx/sites-enabled/  (Debian/Ubuntu)
        // 2. /etc/nginx/conf.d/         (CentOS/RHEL)
        // 3. {remote_path}/nginx.conf.d/ (用户目录，配合 nginx include)
        let unit_slug = site_id.trim_start_matches("site-");
        let unit_slug_short = &unit_slug[..8.min(unit_slug.len())];
        let conf_name = format!("webcraft-{}.conf", unit_slug_short);
        let check_cmd = format!(
            "([ -e /etc/nginx/sites-enabled/{conf} ] && echo yes) \
             || ([ -f /etc/nginx/conf.d/{conf} ] && echo yes) \
             || ([ -f '{remote}/nginx.conf.d/{conf}' ] && echo yes) \
             || echo no",
            conf = conf_name,
            remote = remote_path,
        );
        let conf_enabled = Self::exec_ssh_stdout(remote_exec, &ssh, &check_cmd, 10)
            .await
            .unwrap_or_else(|_| "no".to_string());
        let conf_enabled = conf_enabled.trim() == "yes";

        // HTTP 可达性检查（通过 Nginx 80 端口）
        let mut domains = SiteDomainRepo::list_domains_by_site(db, site_id)
            .unwrap_or_else(|_| Vec::new());
        let domain = site.domain.trim();
        if domains.is_empty() && !domain.is_empty() {
            domains.push(domain.to_string());
        }
        let primary_domain = domains.iter().find(|d| !d.is_empty()).map(|d| d.as_str()).unwrap_or("");
        let check_host = if primary_domain.is_empty() { "localhost" } else { primary_domain };
        let http_code = Self::exec_ssh_stdout(remote_exec, &ssh,
            &format!("curl -s -o /dev/null -w '%{{http_code}}' http://{}/ 2>/dev/null", check_host),
            10,
        ).await.unwrap_or_else(|_| "000".to_string());
        let http_code = http_code.trim().to_string();
        let http_ok = http_code == "200" || http_code == "301" || http_code == "302";

        Ok(ServiceStatus {
            is_running: nginx_active == "active" && conf_enabled,
            healthz_code: http_code.clone(),
            health_ok: http_ok,
            current_version,
        })
    }

    /// 重启服务（路线B：Nginx reload）
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

        // 路线B：reload Nginx 即可（静态文件无需重启进程）
        // 先尝试 nginx -s reload（兼容性好），失败再用 systemctl
        let output = Self::exec_ssh_stdout(remote_exec, &ssh,
            "nginx -t 2>&1 && (nginx -s reload 2>&1 || systemctl reload nginx 2>&1) && echo OK",
            15,
        ).await.map_err(|e| Error::Cms(format!("Nginx reload 失败: {}", e)))?;
        if !output.contains("OK") {
            return Err(Error::Cms(format!("Nginx reload 失败: {}", output.trim())));
        }
        Ok(())
    }

    /// 停止服务（路线B：禁用 Nginx 站点配置）
    /// 将配置文件重命名为 .disabled 备份，以便后续可恢复（start_service）。
    /// 覆盖所有可能的 Nginx 配置位置：
    /// 1. /etc/nginx/sites-enabled/ + sites-available/  (Debian/Ubuntu)
    /// 2. /etc/nginx/conf.d/                            (CentOS/RHEL)
    /// 3. {remote_path}/nginx.conf.d/                   (用户目录)
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

        let unit_slug = site_id.trim_start_matches("site-");
        let unit_slug_short = &unit_slug[..8.min(unit_slug.len())];
        let conf_name = format!("webcraft-{}.conf", unit_slug_short);

        // 从部署配置中读取远程路径（用于用户目录 nginx.conf.d 策略）
        let deploy_cfg: serde_json::Value = serde_json::from_str(&site.deploy_config_json).unwrap_or_default();
        let remote_path = deploy_cfg["remote_path"].as_str().unwrap_or("/opt/webcraft");

        // 将各位置的配置重命名为 .disabled 备份（mv -f 存在则覆盖，不存在则静默跳过）
        // 注意：sites-enabled 里可能是 symlink，所以不能用 test -f 判断
        let cmd = format!(
            "mv -f /etc/nginx/sites-enabled/{conf} /etc/nginx/sites-enabled/{conf}.disabled 2>/dev/null; \
             mv -f /etc/nginx/sites-available/{conf} /etc/nginx/sites-available/{conf}.disabled 2>/dev/null; \
             mv -f /etc/nginx/conf.d/{conf} /etc/nginx/conf.d/{conf}.disabled 2>/dev/null; \
             mv -f '{remote}/nginx.conf.d/{conf}' '{remote}/nginx.conf.d/{conf}.disabled' 2>/dev/null; \
             nginx -t 2>&1 && (nginx -s reload 2>&1 || systemctl reload nginx 2>&1) && echo OK",
            conf = conf_name,
            remote = remote_path,
        );

        let output = Self::exec_ssh_stdout(remote_exec, &ssh, &cmd, 15)
            .await
            .map_err(|e| Error::Cms(format!("停止站点失败: {}", e)))?;
        if !output.contains("OK") {
            return Err(Error::Cms(format!("停止站点失败: {}", output.trim())));
        }
        Ok(())
    }

    /// 启动服务（路线B：启用 Nginx 站点配置）
    /// 从 .disabled 备份恢复配置文件 + reload nginx。
    /// 覆盖所有可能的 Nginx 配置位置（与 stop_service 对称）。
    pub async fn start_service(
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

        let unit_slug = site_id.trim_start_matches("site-");
        let unit_slug_short = &unit_slug[..8.min(unit_slug.len())];
        let conf_name = format!("webcraft-{}.conf", unit_slug_short);

        let deploy_cfg: serde_json::Value = serde_json::from_str(&site.deploy_config_json).unwrap_or_default();
        let remote_path = deploy_cfg["remote_path"].as_str().unwrap_or("/opt/webcraft");

        // 从 .disabled 备份恢复各位置的配置文件（mv -f 不存在则静默跳过）
        // 注意：sites-enabled 里可能是 symlink，所以不能用 test -f 判断
        let cmd = format!(
            "mv -f /etc/nginx/sites-enabled/{conf}.disabled /etc/nginx/sites-enabled/{conf} 2>/dev/null; \
             mv -f /etc/nginx/sites-available/{conf}.disabled /etc/nginx/sites-available/{conf} 2>/dev/null; \
             mv -f /etc/nginx/conf.d/{conf}.disabled /etc/nginx/conf.d/{conf} 2>/dev/null; \
             mv -f '{remote}/nginx.conf.d/{conf}.disabled' '{remote}/nginx.conf.d/{conf}' 2>/dev/null; \
             nginx -t 2>&1 && (nginx -s reload 2>&1 || systemctl reload nginx 2>&1) && echo OK",
            conf = conf_name,
            remote = remote_path,
        );

        let output = Self::exec_ssh_stdout(remote_exec, &ssh, &cmd, 15)
            .await
            .map_err(|e| Error::Cms(format!("启动站点失败: {}", e)))?;
        if !output.contains("OK") {
            return Err(Error::Cms(format!("启动站点失败: {}", output.trim())));
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

    /// 回滚到指定部署版本（路线B：切换符号链接 + Nginx reload）
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

        // Nginx reload（静态文件切换后只需 reload，无需重启进程）
        let reload = Self::exec_ssh_stdout(remote_exec, &ssh,
            "nginx -t 2>&1 && systemctl reload nginx 2>&1 && echo OK",
            15,
        ).await.map_err(|e| Error::Cms(format!("Nginx reload 失败: {}", e)))?;
        if !reload.contains("OK") {
            return Err(Error::Cms(format!("Nginx reload 失败: {}", reload.trim())));
        }

        // 写入回滚记录
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
            manifest_json: String::new(),
            steps_json: String::new(),
            log_json: String::new(),
            rollback_from: None,
        };
        deployment_repo::insert(db, &rollback_row)?;

        Ok(())
    }

    /// 解析站点本地 dist/ 目录路径。
    /// 优先使用 deploy_config_json 中的 dist_dir 覆盖；否则取 local_workdir/dist。
    /// local_workdir 为空时返回错误（需先绑定网站）。
    /// 路径不存在则返回错误。
    pub fn resolve_static_dist(data_dir: &Path, site: &Site) -> Result<PathBuf> {
        let deploy_config: serde_json::Value =
            serde_json::from_str(&site.deploy_config_json).unwrap_or(serde_json::json!({}));

        let dist_dir = if let Some(override_dir) = deploy_config.get("dist_dir").and_then(|v| v.as_str()) {
            // 绝对路径直接用，相对路径基于 data_dir
            let p = PathBuf::from(override_dir);
            if p.is_absolute() {
                p
            } else {
                data_dir.join(p)
            }
        } else if site.local_workdir.trim().is_empty() {
            // local_workdir 未设置：站点尚未绑定网站
            return Err(Error::Cms(
                "站点尚未绑定网站，本地工作目录为空（请先在站点详情页绑定已发布网站）".into(),
            ));
        } else {
            // 构建端产物按模板隔离为 {workdir}/{framework}/dist，
            // 这里按同样规则解析，确保部署读出的是构建真正生成的目录（不混用其它模板产物）。
            let workdir = site.local_workdir.trim();
            let build_cfg: serde_json::Value =
                serde_json::from_str(&site.build_config_json).unwrap_or(serde_json::json!({}));
            // 1) 站点显式声明的模板 → 锁定该模板的 dist
            if let Some(fw) = deploy_config
                .get("framework")
                .and_then(|v| v.as_str())
                .or_else(|| build_cfg.get("framework").and_then(|v| v.as_str()))
                .filter(|s| !s.is_empty())
            {
                PathBuf::from(workdir).join(fw).join("dist")
            } else {
                // 2) 无显式模板：探测已构建的模板子目录（取首个含 index.html 的）
                let mut found: Option<PathBuf> = None;
                for name in ["static-html", "vue", "react", "angular"] {
                    let p = PathBuf::from(workdir).join(name);
                    if p.join("dist").join("index.html").is_file() {
                        found = Some(p.join("dist"));
                        break;
                    }
                }
                // 3) 回退：兼容置于 {workdir}/dist 的旧布局
                found.unwrap_or_else(|| PathBuf::from(workdir).join("dist"))
            }
        };

        if !dist_dir.is_dir() {
            return Err(Error::Cms(format!(
                "本地构建产物不存在: {}（先完成站点构建再部署）",
                dist_dir.display()
            )));
        }
        Ok(dist_dir)
    }

}

/// 注册部署记录到资源表（用于资源关联与全局搜索）。
fn register_deployment_resource(db: &Database, row: &DeploymentRow) {
    use crate::infra::storage::resource_repo;

    let resource_row = resource_repo::ResourceRow {
        id: resource_repo::resource_id("deployment", &row.id),
        kind: resource_repo::ResourceKind::Deployment.as_str().to_string(),
        ref_id: row.id.clone(),
        name: format!("部署 {} ({})", row.site_id, row.status),
        meta_json: serde_json::json!({
            "site_id": row.site_id,
            "connection_id": row.connection_id,
            "status": row.status,
            "trigger_type": row.trigger_type,
            "started_at": row.started_at,
            "finished_at": row.finished_at,
            "duration_ms": row.duration_ms,
            "uploaded_count": row.uploaded_count,
            "total_bytes": row.total_bytes,
        })
        .to_string(),
        created_at: row.started_at,
        updated_at: row.finished_at.unwrap_or(row.started_at),
    };

    if let Err(e) = resource_repo::upsert(db, &resource_row) {
        tracing::warn!("[deploy] 注册部署资源失败: {}", e);
    }
}

// 额外步骤常量（完整版）
/// 部署链路 trace：写入全部 debug.log 位置（含项目根的 `logs/debug.log`）。
///
/// 部署流程跨越校验、预检、Nginx 配置、上传、符号链接切换、验证等多个阶段，且大量
/// 判定依赖**远端命令的输出内容**而非退出码；只靠返回给前端的 `log` 向量，
/// 一旦中途失败就无从还原现场。这里复用 `debug_log` 的结构化 trace，把每个
/// 阶段、每条远端命令及其输出都落到 debug.log。
///
/// `secrets` 中的字符串会先经 [`debug_log::redact`] 掩码：debug.log 是需要
/// 拿去给他人排查问题的，SSH 口令、数据库口令、JWT 密钥绝不能落盘。
pub fn deploy_trace(
    run_id: &str,
    level: &str,
    phase: &str,
    event: &str,
    detail: &str,
    secrets: &[&str],
) {
    let shown = if secrets.is_empty() {
        detail.to_string()
    } else {
        debug_log::redact(detail, secrets)
    };
    debug_log::deploy(level, run_id, phase, event, &shown);
}

// `io_err` 现由 `crate::core::error::io_err` 提供（返回 `Error::IoWithContext`，
// 包含操作描述、路径与底层 `std::io::Error`，避免 `#[from]` 自动转换时丢失现场）。
// 见 `src/core/error.rs`。

