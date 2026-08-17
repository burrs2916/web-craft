use rusqlite::params;

use crate::core::error::Result;
use crate::infra::storage::database::Database;

/// deployments 表行（schema 见 cms-database-design.md / migrations.rs）。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeploymentRow {
    pub id: String,
    pub site_id: String,
    pub trigger_type: String,
    pub target_env: String,
    pub status: String,
    pub started_at: i64,
    pub finished_at: Option<i64>,
    pub duration_ms: Option<i64>,
    pub uploaded_count: i64,
    pub deleted_count: i64,
    pub total_bytes: i64,
    pub error_summary: String,
    pub manifest_json: String,
}

pub fn insert(db: &Database, row: &DeploymentRow) -> Result<()> {
    let conn = db.conn();
    conn.execute(
        "INSERT INTO deployments (id, site_id, trigger_type, target_env, status, started_at, \
         finished_at, duration_ms, uploaded_count, deleted_count, total_bytes, error_summary, manifest_json) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        params![
            row.id,
            row.site_id,
            row.trigger_type,
            row.target_env,
            row.status,
            row.started_at,
            row.finished_at,
            row.duration_ms,
            row.uploaded_count,
            row.deleted_count,
            row.total_bytes,
            row.error_summary,
            row.manifest_json,
        ],
    )?;
    Ok(())
}

pub fn list_by_site(db: &Database, site_id: &str) -> Result<Vec<DeploymentRow>> {
    let conn = db.conn();
    let mut stmt = conn.prepare(
        "SELECT id, site_id, trigger_type, target_env, status, started_at, finished_at, \
         duration_ms, uploaded_count, deleted_count, total_bytes, error_summary, manifest_json \
         FROM deployments WHERE site_id = ?1 ORDER BY started_at DESC LIMIT 50",
    )?;
    let rows = stmt.query_map(params![site_id], |r| {
        Ok(DeploymentRow {
            id: r.get(0)?,
            site_id: r.get(1)?,
            trigger_type: r.get(2)?,
            target_env: r.get(3)?,
            status: r.get(4)?,
            started_at: r.get(5)?,
            finished_at: r.get(6)?,
            duration_ms: r.get(7)?,
            uploaded_count: r.get(8)?,
            deleted_count: r.get(9)?,
            total_bytes: r.get(10)?,
            error_summary: r.get(11)?,
            manifest_json: r.get(12)?,
        })
    })?;
    Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
}
