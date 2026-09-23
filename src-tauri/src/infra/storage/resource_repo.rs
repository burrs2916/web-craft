use rusqlite::params;

use crate::core::error::Result;
use crate::infra::storage::database::Database;
use serde_json::Value;

/// 资源种类。连接 / 站点 / 部署 / 终端 / 自动化 等都被登记为统一资源。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResourceKind {
    Connection,
    Site,
    Deployment,
    Terminal,
    Automation,
    Command,
    Media,
    Content,
}

impl ResourceKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            ResourceKind::Connection => "connection",
            ResourceKind::Site => "site",
            ResourceKind::Deployment => "deployment",
            ResourceKind::Terminal => "terminal",
            ResourceKind::Automation => "automation",
            ResourceKind::Command => "command",
            ResourceKind::Media => "media",
            ResourceKind::Content => "content",
        }
    }

    pub fn parse(s: &str) -> Option<ResourceKind> {
        match s {
            "connection" => Some(ResourceKind::Connection),
            "site" => Some(ResourceKind::Site),
            "deployment" => Some(ResourceKind::Deployment),
            "terminal" => Some(ResourceKind::Terminal),
            "automation" => Some(ResourceKind::Automation),
            "command" => Some(ResourceKind::Command),
            "media" => Some(ResourceKind::Media),
            "content" => Some(ResourceKind::Content),
            _ => None,
        }
    }
}

/// resources 表行：统一资源的目录条目。
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceRow {
    pub id: String,
    pub kind: String,
    pub ref_id: String,
    pub name: String,
    pub meta_json: String,
    pub created_at: i64,
    pub updated_at: i64,
}

/// resource_links 表行：资源之间的有向关系边（构成统一整体的互联）。
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceLinkRow {
    pub id: String,
    pub from_kind: String,
    pub from_ref: String,
    pub to_kind: String,
    pub to_ref: String,
    /// runs_on（站点运行在连接上）/ deploys_to（部署目标）/ belongs_to / uses / links
    pub relation: String,
    pub created_at: i64,
}

/// 稳定资源 ID：kind + ref_id 决定，幂等 upsert 安全。
pub fn resource_id(kind: &str, ref_id: &str) -> String {
    format!("res-{}-{}", kind, ref_id)
}

pub fn upsert(db: &Database, row: &ResourceRow) -> Result<()> {
    let conn = db.conn();
    conn.execute(
        "INSERT OR REPLACE INTO resources (id, kind, ref_id, name, meta_json, created_at, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            row.id,
            row.kind,
            row.ref_id,
            row.name,
            row.meta_json,
            row.created_at,
            row.updated_at,
        ],
    )?;
    Ok(())
}

pub fn get(db: &Database, id: &str) -> Result<Option<ResourceRow>> {
    let conn = db.conn();
    let mut stmt = conn.prepare(
        "SELECT id, kind, ref_id, name, meta_json, created_at, updated_at FROM resources WHERE id = ?1",
    )?;
    let mut rows = stmt.query(params![id])?;
    if let Some(r) = rows.next()? {
        Ok(Some(ResourceRow {
            id: r.get(0)?,
            kind: r.get(1)?,
            ref_id: r.get(2)?,
            name: r.get(3)?,
            meta_json: r.get(4)?,
            created_at: r.get(5)?,
            updated_at: r.get(6)?,
        }))
    } else {
        Ok(None)
    }
}

pub fn get_by_ref(db: &Database, kind: &str, ref_id: &str) -> Result<Option<ResourceRow>> {
    let conn = db.conn();
    let mut stmt = conn.prepare(
        "SELECT id, kind, ref_id, name, meta_json, created_at, updated_at FROM resources \
         WHERE kind = ?1 AND ref_id = ?2",
    )?;
    let mut rows = stmt.query(params![kind, ref_id])?;
    if let Some(r) = rows.next()? {
        Ok(Some(ResourceRow {
            id: r.get(0)?,
            kind: r.get(1)?,
            ref_id: r.get(2)?,
            name: r.get(3)?,
            meta_json: r.get(4)?,
            created_at: r.get(5)?,
            updated_at: r.get(6)?,
        }))
    } else {
        Ok(None)
    }
}

pub fn list_by_kind(db: &Database, kind: &str, limit: i64) -> Result<Vec<ResourceRow>> {
    let conn = db.conn();
    let limit = limit.max(1).min(500);
    let mut stmt = conn.prepare(
        "SELECT id, kind, ref_id, name, meta_json, created_at, updated_at FROM resources \
         WHERE kind = ?1 ORDER BY updated_at DESC LIMIT ?2",
    )?;
    let rows = stmt.query_map(params![kind, limit], |r| {
        Ok(ResourceRow {
            id: r.get(0)?,
            kind: r.get(1)?,
            ref_id: r.get(2)?,
            name: r.get(3)?,
            meta_json: r.get(4)?,
            created_at: r.get(5)?,
            updated_at: r.get(6)?,
        })
    })?;
    Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
}

pub fn list_all(db: &Database, limit: i64) -> Result<Vec<ResourceRow>> {
    let conn = db.conn();
    let limit = limit.max(1).min(1000);
    let mut stmt = conn.prepare(
        "SELECT id, kind, ref_id, name, meta_json, created_at, updated_at FROM resources \
         ORDER BY updated_at DESC LIMIT ?1",
    )?;
    let rows = stmt.query_map(params![limit], |r| {
        Ok(ResourceRow {
            id: r.get(0)?,
            kind: r.get(1)?,
            ref_id: r.get(2)?,
            name: r.get(3)?,
            meta_json: r.get(4)?,
            created_at: r.get(5)?,
            updated_at: r.get(6)?,
        })
    })?;
    Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
}

/// 建立资源间关系边（幂等：相同四元组不重复插入）。
pub fn link(db: &Database, row: &ResourceLinkRow) -> Result<()> {
    let conn = db.conn();
    conn.execute(
        "INSERT OR IGNORE INTO resource_links \
         (id, from_kind, from_ref, to_kind, to_ref, relation, created_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            row.id,
            row.from_kind,
            row.from_ref,
            row.to_kind,
            row.to_ref,
            row.relation,
            row.created_at,
        ],
    )?;
    Ok(())
}

pub fn links_from(db: &Database, kind: &str, ref_id: &str) -> Result<Vec<ResourceLinkRow>> {
    let conn = db.conn();
    let mut stmt = conn.prepare(
        "SELECT id, from_kind, from_ref, to_kind, to_ref, relation, created_at FROM resource_links \
         WHERE from_kind = ?1 AND from_ref = ?2 ORDER BY created_at ASC",
    )?;
    let rows = stmt.query_map(params![kind, ref_id], |r| {
        Ok(ResourceLinkRow {
            id: r.get(0)?,
            from_kind: r.get(1)?,
            from_ref: r.get(2)?,
            to_kind: r.get(3)?,
            to_ref: r.get(4)?,
            relation: r.get(5)?,
            created_at: r.get(6)?,
        })
    })?;
    Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
}

pub fn links_to(db: &Database, kind: &str, ref_id: &str) -> Result<Vec<ResourceLinkRow>> {
    let conn = db.conn();
    let mut stmt = conn.prepare(
        "SELECT id, from_kind, from_ref, to_kind, to_ref, relation, created_at FROM resource_links \
         WHERE to_kind = ?1 AND to_ref = ?2 ORDER BY created_at ASC",
    )?;
    let rows = stmt.query_map(params![kind, ref_id], |r| {
        Ok(ResourceLinkRow {
            id: r.get(0)?,
            from_kind: r.get(1)?,
            from_ref: r.get(2)?,
            to_kind: r.get(3)?,
            to_ref: r.get(4)?,
            relation: r.get(5)?,
            created_at: r.get(6)?,
        })
    })?;
    Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
}

/// 删除某资源及其所有关联边（资源被删除时保持互联图一致）。
pub fn delete_by_ref(db: &Database, kind: &str, ref_id: &str) -> Result<()> {
    let conn = db.conn();
    conn.execute(
        "DELETE FROM resources WHERE kind = ?1 AND ref_id = ?2",
        params![kind, ref_id],
    )?;
    conn.execute(
        "DELETE FROM resource_links WHERE (from_kind = ?1 AND from_ref = ?2) OR (to_kind = ?1 AND to_ref = ?2)",
        params![kind, ref_id],
    )?;
    Ok(())
}

/// 解析 meta_json 为 Value；失败回退空对象，绝不抛错。
pub fn parse_meta(meta_json: &str) -> Value {
    serde_json::from_str(meta_json).unwrap_or(Value::Object(Default::default()))
}
