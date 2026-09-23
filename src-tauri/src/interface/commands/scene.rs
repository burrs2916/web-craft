use std::sync::Arc;

use base64::Engine;
use tauri::State;

use crate::core::types::{PersistedScene, SceneCategoryRust};
use crate::infra::storage::database::Database;
use crate::infra::storage::scene_repo::SceneRepo;

/// Read a local file and return it as a `data:` URL (base64-encoded).
/// Used by the frontend sceneStore for migrating thumbnail file paths to
/// inline data URLs.
#[tauri::command]
pub fn read_file_as_data_url(file_path: String) -> Result<String, String> {
    let path = std::path::Path::new(&file_path);
    if !path.exists() {
        return Err(format!("File not found: {}", file_path));
    }
    let data = std::fs::read(path).map_err(|e| format!("Failed to read file: {}", e))?;
    let ext = path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("png")
        .to_lowercase();
    let mime = match ext.as_str() {
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        _ => "application/octet-stream",
    };
    let b64 = base64::engine::general_purpose::STANDARD.encode(&data);
    Ok(format!("data:{};base64,{}", mime, b64))
}

// ---------- 场景（网站）----------

#[tauri::command]
pub fn get_all_scenes(db: State<'_, Arc<Database>>) -> Result<Vec<PersistedScene>, String> {
    SceneRepo::get_all(&db).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_scene(id: String, db: State<'_, Arc<Database>>) -> Result<Option<PersistedScene>, String> {
    SceneRepo::get_by_id(&db, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_scenes_by_category(
    category_id: String,
    db: State<'_, Arc<Database>>,
) -> Result<Vec<PersistedScene>, String> {
    SceneRepo::get_by_category(&db, &category_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_scene(scene: PersistedScene, db: State<'_, Arc<Database>>) -> Result<(), String> {
    SceneRepo::upsert(&db, &scene).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_scene(scene: PersistedScene, db: State<'_, Arc<Database>>) -> Result<(), String> {
    SceneRepo::upsert(&db, &scene).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_scene(id: String, db: State<'_, Arc<Database>>) -> Result<(), String> {
    SceneRepo::delete(&db, &id).map_err(|e| e.to_string())
}

// ---------- 场景分类 ----------

#[tauri::command]
pub fn get_all_categories(db: State<'_, Arc<Database>>) -> Result<Vec<SceneCategoryRust>, String> {
    SceneRepo::get_all_categories(&db).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_category(id: String, db: State<'_, Arc<Database>>) -> Result<Option<SceneCategoryRust>, String> {
    SceneRepo::get_category_by_id(&db, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_category(category: SceneCategoryRust, db: State<'_, Arc<Database>>) -> Result<(), String> {
    SceneRepo::upsert_category(&db, &category).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_category(id: String, db: State<'_, Arc<Database>>) -> Result<(), String> {
    SceneRepo::delete_category(&db, &id).map_err(|e| e.to_string())
}
