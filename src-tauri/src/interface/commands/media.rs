use std::path::PathBuf;
use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::app::media_service::MediaService;
use crate::core::types::MediaAsset;
use crate::infra::storage::database::Database;

fn emit(app: &AppHandle, event: &str) {
    if let Err(e) = app.emit(event, ()) {
        tracing::warn!("[media] emit {} failed: {}", event, e);
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaListResult {
    items: Vec<MediaAsset>,
    total: i64,
}

/// 上传单个文件到站点媒体库（从本地路径拷贝）。
/// 支持秒传：同站点同哈希文件直接返回已有记录。
#[tauri::command]
pub fn media_upload(
    site_id: String,
    source_path: PathBuf,
    filename: String,
    app: AppHandle,
    db: State<'_, Arc<Database>>,
) -> Result<MediaAsset, String> {
    let asset = MediaService::upload_file(&db, &site_id, &source_path, &filename)
        .map_err(|e| e.to_string())?;
    emit(&app, "media-changed");
    Ok(asset)
}

/// 列出站点媒体资源（按创建时间倒序，分页）。
#[tauri::command]
pub fn media_list(
    site_id: String,
    limit: Option<i64>,
    offset: Option<i64>,
    db: State<'_, Arc<Database>>,
) -> Result<MediaListResult, String> {
    let limit = limit.unwrap_or(50).clamp(1, 200);
    let offset = offset.unwrap_or(0).max(0);
    let (items, total) = MediaService::list(&db, &site_id, limit, offset)
        .map_err(|e| e.to_string())?;
    Ok(MediaListResult { items, total })
}

/// 根据 ID 获取单个媒体资产。
#[tauri::command]
pub fn media_get(
    asset_id: String,
    db: State<'_, Arc<Database>>,
) -> Result<Option<MediaAsset>, String> {
    MediaService::get_by_id(&db, &asset_id)
        .map_err(|e| e.to_string())
}

/// 删除媒体资源（同时删除数据库记录和物理文件）。
#[tauri::command]
pub fn media_delete(
    site_id: String,
    asset_id: String,
    app: AppHandle,
    db: State<'_, Arc<Database>>,
) -> Result<(), String> {
    MediaService::delete(&db, &site_id, &asset_id)
        .map_err(|e| e.to_string())?;
    emit(&app, "media-changed");
    Ok(())
}
