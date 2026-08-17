use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde::Serialize;
use webcraft_common::{AuthConfig, HttpConfig, RouteEntry, ServerConfig};

use crate::app::notebook_service::now_ms;
use crate::app::remote_desktop_service::run_ssh_command_with_timeout;
use crate::app::sftp_service::{ProgressCtx, SftpService};
use crate::core::error::{Error, Result};
use crate::core::types::SshConnectionInfo;
use crate::infra::storage::connection_repo::ConnectionRepo;
use crate::infra::storage::database::Database;
use crate::infra::storage::deployment_repo::{self, DeploymentRow};
use crate::infra::storage::site_repo::SiteRepo;

/// 部署步骤标识（前端进度 UI 按此渲染阶段）。流程契约见 docs/server-integration-design.md §5。
pub const STEP_VALIDATE: &str = "validate";
pub const STEP_DETECT: &str = "detect";
pub const STEP_CONFIG: &str = "config";
pub const STEP_UPLOAD: &str = "upload";
pub const STEP_INSTALL: &str = "install";
pub const STEP_VERIFY: &str = "verify";
pub const STEP_DONE: &str = "done";

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

pub struct DeployService;

const DEFAULT_SERVER_PORT: u16 = 18080;

impl DeployService {
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
        let row = DeploymentRow {
            id: deployment_id.clone(),
            site_id: site_id.to_string(),
            trigger_type: "manual".to_string(),
            target_env: "production".to_string(),
            status,
            started_at: started,
            finished_at: Some(finished),
            duration_ms: Some(duration_ms),
            uploaded_count: uploaded_count as i64,
            deleted_count: 0,
            total_bytes: total_bytes as i64,
            error_summary,
            manifest_json: "[]".to_string(),
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
        // ---- 1. 校验 ----
        let step = |s: &str, m: String, p: u8| {
            on_progress(DeployProgress { step: s.to_string(), message: m, percent: p });
        };
        step(STEP_VALIDATE, "校验站点与绑定服务器".to_string(), 5);
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

        let dist_local = Path::new(&site.local_workdir).join("dist");
        if !dist_local.is_dir() {
            return Err(Error::Cms(format!(
                "本地构建产物不存在: {}（先完成站点构建）",
                dist_local.display()
            )));
        }

        // ---- 2. 探测服务器架构，定位 musl 二进制 ----
        step(STEP_DETECT, "探测服务器架构".to_string(), 10);
        let arch_raw = run_ssh_command_with_timeout(&ssh, "uname -m", 15)
            .map_err(|e| Error::Cms(format!("无法连接服务器探测架构: {}", e)))?;
        let arch = arch_raw.trim();
        let arch_suffix = match arch {
            "x86_64" => "x86_64",
            "aarch64" | "arm64" => "aarch64",
            other => {
                return Err(Error::Cms(format!(
                    "暂不支持的服务器架构: {}（当前支持 x86_64 / aarch64）",
                    other
                )))
            }
        };
        let bin_dir = data_dir.join("bin");
        let candidates: Vec<(PathBuf, &str)> = if let Some(over) = deploy_config["server_bin"].as_str() {
            vec![(PathBuf::from(over), "deploy_config.server_bin")]
        } else {
            vec![
                (bin_dir.join(format!("webcraft-server-{}", arch_suffix)), "bin/webcraft-server-{arch}"),
                (bin_dir.join("webcraft-server"), "bin/webcraft-server"),
            ]
        };
        let (bin_local, bin_src) = candidates
            .iter()
            .find(|(p, _)| p.is_file())
            .ok_or_else(|| {
                Error::Cms(format!(
                    "未找到 {} 架构的 webcraft-server 二进制。请先在本机执行 scripts/build-server.sh 并将产物放到 {}",
                    arch_suffix,
                    bin_dir.join(format!("webcraft-server-{}", arch_suffix)).display()
                ))
            })?;
        log.push(format!("二进制来源: {} ({})", bin_local.display(), bin_src));
        step(STEP_DETECT, format!("服务器架构 {}，二进制就绪", arch_suffix), 15);

        // ---- 3. 生成 server.toml 与 systemd unit ----
        step(STEP_CONFIG, "生成 server.toml 与 systemd unit".to_string(), 18);
        let token = uuid::Uuid::new_v4().simple().to_string();
        let server_config = ServerConfig {
            server: HttpConfig { port, static_dir: "dist".to_string() },
            auth: AuthConfig {
                token: token.clone(),
                allowed_roles: vec!["admin".to_string(), "editor".to_string()],
            },
            route: vec![
                RouteEntry { path: "/healthz".to_string(), handler: "health".to_string(), roles: vec![] },
                RouteEntry {
                    path: "/api/content".to_string(),
                    handler: "content_api".to_string(),
                    roles: vec!["admin".to_string(), "editor".to_string()],
                },
            ],
        };
        let toml_text = webcraft_common::render_config(&server_config)
            .map_err(Error::Cms)?;
        // 生成物回验：渲染结果必须能被服务端同款解析器接受。
        webcraft_common::parse_config(&toml_text).map_err(Error::Cms)?;

        let unit_slug = site.id.trim_start_matches("site-");
        let unit_name = format!("webcraft-{}.service", &unit_slug[..8.min(unit_slug.len())]);
        let unit_text = unit_file(&site.name, &remote);
        let tmp_dir = std::env::temp_dir().join(format!("webcraft-{}", deployment_id));
        std::fs::create_dir_all(&tmp_dir)?;
        let toml_tmp = tmp_dir.join("server.toml");
        let unit_tmp = tmp_dir.join(&unit_name);
        std::fs::write(&toml_tmp, &toml_text)?;
        std::fs::write(&unit_tmp, &unit_text)?;
        log.push(format!("server.toml 端口 {} / 路由 {} 条", port, server_config.route.len()));
        let (uploaded_count, total_bytes) =
            local_stats(&[bin_local.clone(), toml_tmp.clone(), unit_tmp.clone(), dist_local.clone()]);

        // ---- 4. SFTP 上传 ----
        // resume 语义是"远端同尺寸即跳过"：二进制/配置/unit 必须强制覆盖
        // （token 每次轮换但 server.toml 尺寸不变，续传会误跳过）；
        // dist/ 是字节大头，开断点续传，中断重跑只补未传完的文件。
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

        run_ssh_command_with_timeout(
            &ssh,
            &format!("mkdir -p '{}' '.config/systemd/user'", remote),
            15,
        )
        .map_err(|e| Error::Cms(format!("创建远程目录失败: {}", e)))?;
        step(STEP_UPLOAD, "上传服务端二进制与配置".to_string(), 20);
        upload(
            vec![bin_local.to_string_lossy().to_string(), toml_tmp.to_string_lossy().to_string()],
            &remote,
            Some(vec!["webcraft-server".to_string(), "server.toml".to_string()]),
            20,
            35,
            "传输",
            false,
        )?;
        upload(
            vec![unit_tmp.to_string_lossy().to_string()],
            ".config/systemd/user",
            None,
            35,
            40,
            "传输",
            false,
        )?;
        let _ = std::fs::remove_dir_all(&tmp_dir);
        step(STEP_UPLOAD, "上传站点静态内容 (dist/)".to_string(), 42);
        upload(
            vec![dist_local.to_string_lossy().to_string()],
            &format!("{}/dist", remote),
            None,
            42,
            75,
            "上传",
            true,
        )?;

        // ---- 5. systemd --user 安装并拉起 ----
        step(STEP_INSTALL, "安装 systemd 服务并启动".to_string(), 78);
        // ssh 非登录会话可能缺 XDG_RUNTIME_DIR 导致 systemctl --user 连不上 bus，显式补上。
        let sysctl = "export XDG_RUNTIME_DIR=/run/user/$(id -u); systemctl --user";
        let install_cmd = format!(
            "chmod +x '{0}/webcraft-server' && {1} daemon-reload && {1} enable --now {2} && sleep 1 && {1} is-active {2}",
            remote, sysctl, unit_name
        );
        let install_out = run_ssh_command_with_timeout(&ssh, &install_cmd, 60)
            .map_err(|e| Error::Cms(format!("systemd 安装失败: {}", e)))?;
        log.push(format!("systemd is-active: {}", install_out.trim()));
        if !install_out.trim().eq_ignore_ascii_case("active") {
            return Err(Error::Cms(format!(
                "服务未能进入 active 状态（当前: {}）。可在服务器执行 `journalctl --user -u {}` 查看日志",
                install_out.trim(),
                unit_name
            )));
        }
        // linger 保证 SSH 退出后 user 级服务继续运行；失败不阻塞（部分环境默认已开）。
        match run_ssh_command_with_timeout(&ssh, "loginctl enable-linger 2>/dev/null; echo linger-ok", 15) {
            Ok(_) => log.push("linger 已确认".to_string()),
            Err(e) => log.push(format!("enable-linger 跳过（不影响本次运行）: {}", e)),
        }

        // ---- 6. healthz 验证 ----
        step(STEP_VERIFY, "验证 healthz".to_string(), 90);
        let code = run_ssh_command_with_timeout(
            &ssh,
            &format!("sleep 2; curl -s -o /dev/null -w '%{{http_code}}' http://localhost:{}", port),
            30,
        )
        .map_err(|e| Error::Cms(format!("健康检查执行失败: {}", e)))?;
        let code = code.trim();
        if code != "200" {
            return Err(Error::Cms(format!(
                "healthz 未返回 200（得到 {}）。服务可能仍在启动，可稍后重试部署或查服务器日志",
                code
            )));
        }
        log.push(format!("healthz 200 (localhost:{})", port));

        step(STEP_DONE, "部署完成".to_string(), 100);
        Ok(DeployOutcome {
            deployment_id: deployment_id.to_string(),
            base_url: format!("http://{}:{}", ssh.host, port),
            healthz_url: format!("http://{}:{}/healthz", ssh.host, port),
            token,
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

/// user 级 systemd unit（无需 root；linger 由部署流程单独开启）。
fn unit_file(site_name: &str, remote_dir: &str) -> String {
    format!(
        "# Generated by WebCraft deploy. See docs/server-integration-design.md\n\
[Unit]\n\
Description=WebCraft site: {site}\n\
After=network.target\n\n\
[Service]\n\
WorkingDirectory={dir}\n\
ExecStart={dir}/webcraft-server {dir}/server.toml\n\
Restart=on-failure\n\
RestartSec=3\n\n\
[Install]\n\
WantedBy=default.target\n",
        site = site_name,
        dir = remote_dir,
    )
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
        assert!(text.contains("ExecStart=/srv/blog/webcraft-server /srv/blog/server.toml"));
        assert!(text.contains("WorkingDirectory=/srv/blog"));
        assert!(text.contains("Restart=on-failure"));
        assert!(text.contains("WantedBy=default.target"));
    }
}
