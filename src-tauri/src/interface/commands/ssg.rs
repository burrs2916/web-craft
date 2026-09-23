use std::sync::Arc;

use tauri::{AppHandle, Emitter, State};

use crate::app::ssg_service::SsgService;
use crate::infra::storage::database::Database;
use crate::ssg::theme;
use crate::ssg::BuildReport;

/// 增量构建（无缓存时自动全量）。完成后广播 ssg-build-finished 供预览刷新。
#[tauri::command]
pub fn ssg_build(
    site_id: String,
    app: AppHandle,
    db: State<'_, Arc<Database>>,
) -> Result<BuildReport, String> {
    let report = SsgService::build(&db, &site_id, false).map_err(|e| e.to_string())?;
    let _ = app.emit("ssg-build-finished", &report);
    Ok(report)
}

/// 强制全量重建（清缓存、清空 dist）。
#[tauri::command]
pub fn ssg_build_full(
    site_id: String,
    app: AppHandle,
    db: State<'_, Arc<Database>>,
) -> Result<BuildReport, String> {
    let report = SsgService::build(&db, &site_id, true).map_err(|e| e.to_string())?;
    let _ = app.emit("ssg-build-finished", &report);
    Ok(report)
}

/// 列出全部内置主题元数据（供主题选择器与动态设置表单）。
#[tauri::command]
pub fn theme_list() -> Vec<theme::ThemeMeta> {
    theme::list_themes()
}
