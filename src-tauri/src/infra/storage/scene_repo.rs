use crate::core::error::Result;
use crate::core::types::{PersistedScene, SceneCategoryRust};
use crate::infra::storage::database::Database;

// ---------- scenes 表 ----------

const SCENE_COLUMNS: &str = "id, name, description, coordinate_system, camera, bounds, \
     layers, bindings, variables, layout, editor_components, editor_layers, canvas_config, \
     global_components, views, active_view_id, viewport_sync_rules, category_id, tags, \
     thumbnail, status, published_at, metadata, created_at, updated_at";

fn row_to_scene(row: &rusqlite::Row) -> rusqlite::Result<PersistedScene> {
    Ok(PersistedScene {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        coordinate_system: row.get(3)?,
        camera: row.get(4)?,
        bounds: row.get(5)?,
        layers: row.get(6)?,
        bindings: row.get(7)?,
        variables: row.get(8)?,
        layout: row.get(9)?,
        editor_components: row.get(10)?,
        editor_layers: row.get(11)?,
        canvas_config: row.get(12)?,
        global_components: row.get(13)?,
        views: row.get(14)?,
        active_view_id: row.get(15)?,
        viewport_sync_rules: row.get(16)?,
        category_id: row.get(17)?,
        tags: row.get(18)?,
        thumbnail: row.get(19)?,
        status: row.get(20)?,
        published_at: row.get(21)?,
        metadata: row.get(22)?,
        created_at: row.get(23)?,
        updated_at: row.get(24)?,
    })
}

pub struct SceneRepo;

impl SceneRepo {
    pub fn get_all(db: &Database) -> Result<Vec<PersistedScene>> {
        let conn = db.conn();
        let mut stmt = conn.prepare(&format!("SELECT {SCENE_COLUMNS} FROM scenes ORDER BY updated_at DESC"))?;
        let rows = stmt.query_map([], row_to_scene)?;
        let mut scenes = Vec::new();
        for row in rows {
            scenes.push(row?);
        }
        Ok(scenes)
    }

    pub fn get_by_id(db: &Database, id: &str) -> Result<Option<PersistedScene>> {
        let conn = db.conn();
        let mut stmt = conn.prepare(&format!("SELECT {SCENE_COLUMNS} FROM scenes WHERE id = ?1"))?;
        let mut rows = stmt.query_map(rusqlite::params![id], row_to_scene)?;
        if let Some(row) = rows.next() {
            Ok(Some(row?))
        } else {
            Ok(None)
        }
    }

    pub fn get_by_category(db: &Database, category_id: &str) -> Result<Vec<PersistedScene>> {
        let conn = db.conn();
        let mut stmt = conn.prepare(&format!(
            "SELECT {SCENE_COLUMNS} FROM scenes WHERE category_id = ?1 ORDER BY updated_at DESC"
        ))?;
        let rows = stmt.query_map(rusqlite::params![category_id], row_to_scene)?;
        let mut scenes = Vec::new();
        for row in rows {
            scenes.push(row?);
        }
        Ok(scenes)
    }

    pub fn upsert(db: &Database, scene: &PersistedScene) -> Result<()> {
        let conn = db.conn();
        conn.execute(
            "INSERT OR REPLACE INTO scenes (id, name, description, coordinate_system, camera, \
             bounds, layers, bindings, variables, layout, editor_components, editor_layers, \
             canvas_config, global_components, views, active_view_id, viewport_sync_rules, \
             category_id, tags, thumbnail, status, published_at, metadata, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, \
             ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25)",
            rusqlite::params![
                scene.id,
                scene.name,
                scene.description,
                scene.coordinate_system,
                scene.camera,
                scene.bounds,
                scene.layers,
                scene.bindings,
                scene.variables,
                scene.layout,
                scene.editor_components,
                scene.editor_layers,
                scene.canvas_config,
                scene.global_components,
                scene.views,
                scene.active_view_id,
                scene.viewport_sync_rules,
                scene.category_id,
                scene.tags,
                scene.thumbnail,
                scene.status,
                scene.published_at,
                scene.metadata,
                scene.created_at,
                scene.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn delete(db: &Database, id: &str) -> Result<()> {
        let conn = db.conn();
        conn.execute("DELETE FROM scenes WHERE id = ?1", rusqlite::params![id])?;
        Ok(())
    }
}

// ---------- scene_categories 表 ----------

const CATEGORY_COLUMNS: &str = "id, name, icon, color, sort_order, parent_id, description, \
     created_at, updated_at";

fn row_to_category(row: &rusqlite::Row) -> rusqlite::Result<SceneCategoryRust> {
    Ok(SceneCategoryRust {
        id: row.get(0)?,
        name: row.get(1)?,
        icon: row.get(2)?,
        color: row.get(3)?,
        sort_order: row.get(4)?,
        parent_id: row.get(5)?,
        description: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

impl SceneRepo {
    pub fn get_all_categories(db: &Database) -> Result<Vec<SceneCategoryRust>> {
        let conn = db.conn();
        let mut stmt = conn.prepare(&format!(
            "SELECT {CATEGORY_COLUMNS} FROM scene_categories ORDER BY sort_order ASC"
        ))?;
        let rows = stmt.query_map([], row_to_category)?;
        let mut cats = Vec::new();
        for row in rows {
            cats.push(row?);
        }
        Ok(cats)
    }

    pub fn get_category_by_id(db: &Database, id: &str) -> Result<Option<SceneCategoryRust>> {
        let conn = db.conn();
        let mut stmt = conn.prepare(&format!(
            "SELECT {CATEGORY_COLUMNS} FROM scene_categories WHERE id = ?1"
        ))?;
        let mut rows = stmt.query_map(rusqlite::params![id], row_to_category)?;
        if let Some(row) = rows.next() {
            Ok(Some(row?))
        } else {
            Ok(None)
        }
    }

    pub fn upsert_category(db: &Database, cat: &SceneCategoryRust) -> Result<()> {
        let conn = db.conn();
        conn.execute(
            "INSERT OR REPLACE INTO scene_categories (id, name, icon, color, sort_order, \
             parent_id, description, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            rusqlite::params![
                cat.id,
                cat.name,
                cat.icon,
                cat.color,
                cat.sort_order,
                cat.parent_id,
                cat.description,
                cat.created_at,
                cat.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn delete_category(db: &Database, id: &str) -> Result<()> {
        let conn = db.conn();
        conn.execute("DELETE FROM scene_categories WHERE id = ?1", rusqlite::params![id])?;
        Ok(())
    }
}
