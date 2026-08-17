use std::sync::Arc;

use serde::Deserialize;
use tauri::{AppHandle, Emitter, State};

use crate::app::cms_service::CmsService;
use crate::core::types::{Content, ContentListFilter, Site, SiteSummary};
use crate::infra::storage::database::Database;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSiteInput {
    pub name: String,
    #[serde(default)]
    pub domain: String,
    pub local_workdir: String,
    pub connection_id: Option<String>,
    /// 部署远程目录，写入 deploy_config_json.remote_path；未绑定服务器时忽略
    #[serde(default)]
    pub remote_path: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateContentInput {
    pub site_id: String,
    #[serde(rename = "type")]
    pub content_type: String,
    #[serde(default)]
    pub title: String,
}

fn emit(app: &AppHandle, event: &str) {
    if let Err(e) = app.emit(event, ()) {
        tracing::warn!("[cms] emit {} failed: {}", event, e);
    }
}

// ---------- 站点 ----------

#[tauri::command]
pub fn site_create(
    input: CreateSiteInput,
    app: AppHandle,
    db: State<'_, Arc<Database>>,
) -> Result<Site, String> {
    let site = CmsService::create_site(
        &db,
        &input.name,
        &input.domain,
        &input.local_workdir,
        input.connection_id.as_deref(),
        input.remote_path.as_deref(),
    )
    .map_err(|e| e.to_string())?;
    emit(&app, "sites-changed");
    Ok(site)
}

#[tauri::command]
pub fn site_list(db: State<'_, Arc<Database>>) -> Result<Vec<SiteSummary>, String> {
    CmsService::list_sites(&db).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn site_get(id: String, db: State<'_, Arc<Database>>) -> Result<Option<Site>, String> {
    CmsService::get_site(&db, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn site_update(site: Site, app: AppHandle, db: State<'_, Arc<Database>>) -> Result<Site, String> {
    let site = CmsService::update_site(&db, &site).map_err(|e| e.to_string())?;
    emit(&app, "sites-changed");
    Ok(site)
}

#[tauri::command]
pub fn site_archive(id: String, app: AppHandle, db: State<'_, Arc<Database>>) -> Result<(), String> {
    CmsService::archive_site(&db, &id).map_err(|e| e.to_string())?;
    emit(&app, "sites-changed");
    Ok(())
}

// ---------- 内容 ----------

#[tauri::command]
pub fn content_create(
    input: CreateContentInput,
    app: AppHandle,
    db: State<'_, Arc<Database>>,
) -> Result<Content, String> {
    let content = CmsService::create_content(&db, &input.site_id, &input.content_type, &input.title)
        .map_err(|e| e.to_string())?;
    emit(&app, "contents-changed");
    Ok(content)
}

#[tauri::command]
pub fn content_list(
    site_id: String,
    filter: Option<ContentListFilter>,
    db: State<'_, Arc<Database>>,
) -> Result<Vec<Content>, String> {
    let filter = filter.unwrap_or_default();
    CmsService::list_contents(&db, &site_id, &filter).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn content_get(id: String, db: State<'_, Arc<Database>>) -> Result<Option<Content>, String> {
    CmsService::get_content(&db, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn content_save(
    content: Content,
    app: AppHandle,
    db: State<'_, Arc<Database>>,
) -> Result<Content, String> {
    let content = CmsService::save_content(&db, &content).map_err(|e| e.to_string())?;
    emit(&app, "contents-changed");
    Ok(content)
}

#[tauri::command]
pub fn content_publish(id: String, app: AppHandle, db: State<'_, Arc<Database>>) -> Result<Content, String> {
    let content = CmsService::publish_content(&db, &id).map_err(|e| e.to_string())?;
    emit(&app, "contents-changed");
    Ok(content)
}

#[tauri::command]
pub fn content_unpublish(id: String, app: AppHandle, db: State<'_, Arc<Database>>) -> Result<Content, String> {
    let content = CmsService::unpublish_content(&db, &id).map_err(|e| e.to_string())?;
    emit(&app, "contents-changed");
    Ok(content)
}

#[tauri::command]
pub fn content_delete(id: String, app: AppHandle, db: State<'_, Arc<Database>>) -> Result<(), String> {
    CmsService::delete_content(&db, &id).map_err(|e| e.to_string())?;
    emit(&app, "contents-changed");
    Ok(())
}

#[tauri::command]
pub fn content_restore(id: String, app: AppHandle, db: State<'_, Arc<Database>>) -> Result<Content, String> {
    let content = CmsService::restore_content(&db, &id).map_err(|e| e.to_string())?;
    emit(&app, "contents-changed");
    Ok(content)
}

#[tauri::command]
pub fn content_purge(id: String, app: AppHandle, db: State<'_, Arc<Database>>) -> Result<(), String> {
    CmsService::purge_content(&db, &id).map_err(|e| e.to_string())?;
    emit(&app, "contents-changed");
    Ok(())
}

#[tauri::command]
pub fn content_set_pinned(id: String, pinned: bool, app: AppHandle, db: State<'_, Arc<Database>>) -> Result<(), String> {
    CmsService::toggle_content_pin(&db, &id, pinned).map_err(|e| e.to_string())?;
    emit(&app, "contents-changed");
    Ok(())
}
