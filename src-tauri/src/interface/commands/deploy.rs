use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::app::deploy_service::{DeployOutcome, DeployProgress, DeployService};
use crate::app::sftp_service::SftpService;
use crate::infra::storage::database::Database;
use crate::infra::storage::deployment_repo::{self, DeploymentRow};

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
