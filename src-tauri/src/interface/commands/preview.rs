use std::sync::Arc;

use tauri::{AppHandle, Manager, State};

use crate::app::preview_service::{PreviewInfo, PreviewService};
use crate::infra::storage::database::Database;

/// 启动（或重启）站点的本地预览。
#[tauri::command(async)]
pub async fn site_preview_start(
    site_id: String,
    app: AppHandle,
    db: State<'_, Arc<Database>>,
    preview: State<'_, Arc<PreviewService>>,
) -> Result<PreviewInfo, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    preview.start(&db, &data_dir, &site_id).await
}

/// 停止站点的本地预览。
#[tauri::command(async)]
pub async fn site_preview_stop(
    site_id: String,
    preview: State<'_, Arc<PreviewService>>,
) -> Result<(), String> {
    preview.stop(&site_id).await
}

/// 当前所有运行中的本地预览概览。
#[tauri::command(async)]
pub async fn site_preview_list(
    preview: State<'_, Arc<PreviewService>>,
) -> Result<Vec<PreviewInfo>, String> {
    Ok(preview.list().await)
}