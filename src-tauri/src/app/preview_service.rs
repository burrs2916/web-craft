//! 本地预览 sidecar（M-x3）：用 host 原生的 webcraft-server 二进制加载站点
//! 构建产物 dist/ 与生成式 server.toml，作为子进程常驻，供"本地预览 + 健康徽标
//! 变绿"闭环验证，且不依赖远端服务器。设计见 docs/server-integration-design.md §6 M-x3。

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;

use serde::Serialize;
use tokio::sync::Mutex;
use webcraft_common::{AuthConfig, HttpConfig, RouteEntry, ServerConfig};

use crate::infra::storage::database::Database;
use crate::infra::storage::site_repo::SiteRepo;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewInfo {
    pub site_id: String,
    pub base_url: String,
    pub healthz_url: String,
    pub port: u16,
    pub alive: bool,
}

struct PreviewRun {
    child: tokio::process::Child,
    port: u16,
    base_url: String,
    healthz_url: String,
}

pub struct PreviewService {
    runs: Arc<Mutex<HashMap<String, PreviewRun>>>,
}

impl PreviewService {
    pub fn new() -> Self {
        PreviewService { runs: Arc::new(Mutex::new(HashMap::new())) }
    }

    /// 启动（或重启）某站点的本地预览。dist/ 不存在或找不到 host 二进制则报错返回。
    pub async fn start(&self, db: &Database, data_dir: &Path, site_id: &str) -> Result<PreviewInfo, String> {
        let site = SiteRepo::get_by_id(db, site_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("站点不存在: {}", site_id))?;

        let dist_dir = Path::new(&site.local_workdir).join("dist");
        if !dist_dir.is_dir() {
            return Err(format!(
                "本地构建产物不存在: {}（先完成站点构建再预览）",
                dist_dir.display()
            ));
        }

        let deploy_config: serde_json::Value =
            serde_json::from_str(&site.deploy_config_json).unwrap_or(serde_json::json!({}));
        let bin = Self::find_host_bin(data_dir, &deploy_config)?;

        // 只对本站保持单实例：重复启动先停旧进程。
        self.stop(site_id).await;

        let port = Self::pick_free_port()?;
        let token = uuid::Uuid::new_v4().simple().to_string();
        let config = ServerConfig {
            server: HttpConfig {
                port,
                static_dir: dist_dir.to_string_lossy().to_string(),
            },
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
        let toml_text = webcraft_common::render_config(&config).map_err(|e| e.to_string())?;
        webcraft_common::parse_config(&toml_text).map_err(|e| e.to_string())?;

        let toml_path = std::env::temp_dir().join(format!("webcraft-preview-{}.toml", site_id));
        std::fs::write(&toml_path, &toml_text)
            .map_err(|e| format!("写入预览配置失败: {}", e))?;

        // 子进程日志落盘，排障不阻塞主进程。
        let log_dir = data_dir.join("logs");
        let _ = std::fs::create_dir_all(&log_dir);
        let log_path = log_dir.join(format!("preview-{}.log", site_id));
        let log_file = std::fs::OpenOptions::new()
            .append(true)
            .create(true)
            .open(&log_path)
            .map_err(|e| format!("打开预览日志失败: {}", e))?;
        let log_stdout = log_file.try_clone().map_err(|e| e.to_string())?;

        let child = tokio::process::Command::new(&bin)
            .arg(&toml_path)
            .stdin(Stdio::null())
            .stdout(Stdio::from(log_stdout))
            .stderr(Stdio::from(log_file))
            .spawn()
            .map_err(|e| format!("启动 webcraft-server 失败 ({}): {}", bin.display(), e))?;

        let base_url = format!("http://127.0.0.1:{}", port);
        let healthz_url = format!("{}/healthz", base_url);
        self.runs.lock().await.insert(
            site_id.to_string(),
            PreviewRun { child, port, base_url: base_url.clone(), healthz_url: healthz_url.clone() },
        );
        Ok(PreviewInfo {
            site_id: site_id.to_string(),
            base_url,
            healthz_url,
            port,
            alive: true,
        })
    }

    /// 停止本地预览；进程已退出是正常情况，不算错误。
    pub async fn stop(&self, site_id: &str) -> Result<(), String> {
        let mut runs = self.runs.lock().await;
        if let Some(mut run) = runs.remove(site_id) {
            let _ = run.child.start_kill();
            let _ = run.child.wait().await;
        }
        Ok(())
    }

    /// 当前运行态概览（剔除已退出的子进程）。
    pub async fn list(&self) -> Vec<PreviewInfo> {
        let mut runs = self.runs.lock().await;
        let mut out = Vec::new();
        let mut dead = Vec::new();
        for (id, run) in runs.iter_mut() {
            let alive = run.child.try_wait().map(|st| st.is_none()).unwrap_or(false);
            if alive {
                out.push(PreviewInfo {
                    site_id: id.clone(),
                    base_url: run.base_url.clone(),
                    healthz_url: run.healthz_url.clone(),
                    port: run.port,
                    alive: true,
                });
            } else {
                dead.push(id.clone());
            }
        }
        for id in dead {
            runs.remove(&id);
        }
        out
    }

    /// 依据 host 平台与部署配置定位本地预览用二进制。
    fn find_host_bin(data_dir: &Path, deploy_config: &serde_json::Value) -> Result<PathBuf, String> {
        let os = std::env::consts::OS; // macos / windows / linux
        let arch = std::env::consts::ARCH; // aarch64 / x86_64
        let bin_dir = data_dir.join("bin");
        let host_name = format!("webcraft-server-{}-{}", os, arch);
        let candidates: Vec<(PathBuf, &str)> = if let Some(over) = deploy_config["server_bin"].as_str() {
            vec![(PathBuf::from(over), "deploy_config.server_bin")]
        } else {
            vec![
                (bin_dir.join(&host_name), "bin/webcraft-server-{os}-{arch}"),
                (bin_dir.join("webcraft-server"), "bin/webcraft-server"),
            ]
        };
        candidates
            .iter()
            .find(|(p, _)| p.is_file())
            .map(|(p, _)| p.clone())
            .ok_or_else(|| {
                format!(
                    "未找到本机预览的 webcraft-server 二进制。请先构建 host 产物并放到 {}：\n  cargo build -p webcraft-server --release\n  cp ../target/release/webcraft-server {}",
                    bin_dir.join(&host_name).display(),
                    bin_dir.join(&host_name).display()
                )
            })
    }

    /// 绑定 127.0.0.1:0 取一个空闲端口后立即释放（预览端口随机，避免冲突）。
    fn pick_free_port() -> Result<u16, String> {
        let listener = std::net::TcpListener::bind("127.0.0.1:0")
            .map_err(|e| format!("分配预览端口失败: {}", e))?;
        let port = listener.local_addr().map_err(|e| e.to_string())?.port();
        Ok(port)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pick_free_port_returns_bindable_port() {
        let port = PreviewService::pick_free_port().unwrap();
        assert!(port > 0);
        // 返回的端口应立即可被监听（避免端口已被占用导致预览失败）。
        let listener = std::net::TcpListener::bind(("127.0.0.1", port)).unwrap();
        listener.local_addr().unwrap();
    }

    #[test]
    fn find_host_bin_prefers_specific_then_generic() {
        let dir = std::env::temp_dir().join(format!("preview-bin-test-{}", std::process::id()));
        let bin_dir = dir.join("bin");
        std::fs::create_dir_all(&bin_dir).unwrap();
        let host_name = format!("webcraft-server-{}-{}", std::env::consts::OS, std::env::consts::ARCH);
        let specific = bin_dir.join(&host_name);
        std::fs::write(&specific, "bin").unwrap();
        let generic = bin_dir.join("webcraft-server");
        std::fs::write(&generic, "generic").unwrap();

        let cfg = serde_json::json!({});
        assert_eq!(
            PreviewService::find_host_bin(&dir, &cfg).unwrap(),
            specific
        );
        // 移除专用产物后回退到通用名。
        std::fs::remove_file(&specific).unwrap();
        assert_eq!(
            PreviewService::find_host_bin(&dir, &cfg).unwrap(),
            generic
        );
        // server_bin 覆盖优先于其余候选。
        let override_bin = bin_dir.join("override-server");
        std::fs::write(&override_bin, "override").unwrap();
        let override_cfg = serde_json::json!({ "server_bin": override_bin });
        assert_eq!(
            PreviewService::find_host_bin(&dir, &override_cfg).unwrap(),
            override_bin
        );
        // 都缺失时报错。
        std::fs::remove_file(&generic).unwrap();
        std::fs::remove_dir_all(&dir).unwrap();
    }
}