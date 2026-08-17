use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::app::deploy_service::{DeployOutcome, DeployProgress, DeployService};
use crate::app::sftp_service::SftpService;
use crate::infra::storage::connection_repo::ConnectionRepo;
use crate::infra::storage::database::Database;
use crate::infra::storage::deployment_repo::{self, DeploymentRow};
use crate::infra::storage::site_repo::SiteRepo;

/// site_healthz 返回值。code=200 表示部署服务在线（healthz 通过）。
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthzResult {
    pub code: Option<u16>,
    pub url: Option<String>,
    pub error: Option<String>,
}

fn emit_progress(app: &AppHandle, site_id: &str, progress: DeployProgress) {
    #[derive(Serialize, Clone)]
    #[serde(rename_all = "camelCase")]
    struct Payload<'a> {
        site_id: &'a str,
        #[serde(flatten)]
        progress: &'a DeployProgress,
    }
    if let Err(e) = app.emit("deploy-progress", Payload { site_id, progress: &progress }) {
        tracing::warn!("[deploy] emit deploy-progress failed: {}", e);
    }
}

/// 一键部署站点到绑定服务器（M-x3 部署闭环，编排见 deploy_service）。
/// 进度通过 `deploy-progress` 事件流推送；结束统一发 `sites-changed`（last_deployed_at 变化）。
#[tauri::command(async)]
pub fn site_deploy(
    site_id: String,
    app: AppHandle,
    db: State<'_, Arc<Database>>,
    sftp: State<'_, Arc<SftpService>>,
) -> Result<DeployOutcome, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let progress_app = app.clone();
    let progress_site = site_id.clone();
    let on_progress: std::sync::Arc<dyn Fn(DeployProgress) + Send + Sync> =
        std::sync::Arc::new(move |p| emit_progress(&progress_app, &progress_site, p));
    let outcome = DeployService::deploy(&db, &sftp, &site_id, &data_dir, on_progress)
        .map_err(|e| e.to_string())?;
    if let Err(e) = app.emit("sites-changed", ()) {
        tracing::warn!("[deploy] emit sites-changed failed: {}", e);
    }
    Ok(outcome)
}

#[tauri::command]
pub fn deployment_list(site_id: String, db: State<'_, Arc<Database>>) -> Result<Vec<DeploymentRow>, String> {
    deployment_repo::list_by_site(&db, &site_id).map_err(|e| e.to_string())
}

/// 探测站点部署服务的 /healthz（健康徽标用）。code=200 即在线。
/// 远端地址从绑定服务器 host + deploy_config.server_port 推导，超时 3s。
#[tauri::command(async)]
pub async fn site_healthz(
    site_id: String,
    db: State<'_, Arc<Database>>,
) -> Result<HealthzResult, String> {
    let site = SiteRepo::get_by_id(&db, &site_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("站点不存在: {}", site_id))?;
    let conn_id = site.connection_id.as_deref()
        .ok_or_else(|| "站点未绑定服务器".to_string())?;
    let conn = ConnectionRepo::get_by_id(&db, conn_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "站点绑定的服务器连接不存在".to_string())?;
    let ssh: crate::core::types::SshConnectionInfo =
        serde_json::from_str(&conn.config_json)
            .map_err(|e| format!("服务器连接配置解析失败: {}", e))?;

    let deploy_config: serde_json::Value =
        serde_json::from_str(&site.deploy_config_json).unwrap_or(serde_json::json!({}));
    let port = deploy_config["server_port"]
        .as_u64()
        .unwrap_or(crate::app::deploy_service::DEFAULT_SERVER_PORT as u64) as u16;

    let url = format!("http://{}:{}/healthz", ssh.host, port);
    let client = reqwest::Client::new();
    let code = match client
        .get(&url)
        .timeout(std::time::Duration::from_secs(3))
        .send()
        .await
    {
        Ok(resp) => Some(resp.status().as_u16()),
        Err(e) => {
            return Ok(HealthzResult { code: None, url: Some(url), error: Some(e.to_string()) })
        }
    };
    Ok(HealthzResult { code, url: Some(url), error: None })
}
