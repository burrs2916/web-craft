use rusqlite::params;

use crate::core::error::Result;
use crate::infra::storage::database::Database;

/// 部署步骤状态
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeploymentStep {
    pub key: String,
    pub name: String,
    pub status: String, // pending / running / success / failed / skipped
    pub message: String,
    pub percent: u8,
    pub started_at: Option<i64>,
    pub finished_at: Option<i64>,
}

/// deployments 表行（schema 见 migrations.rs v2 + v11）。
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeploymentRow {
    pub id: String,
    pub site_id: String,
    pub trigger_type: String,
    pub target_env: String,
    pub mode: String, // simple / full
    pub connection_id: Option<String>,
    pub remote_path: String,
    pub version_dir: String,
    pub server_version: String,
    pub status: String,
    pub started_at: i64,
    pub finished_at: Option<i64>,
    pub duration_ms: Option<i64>,
    pub uploaded_count: i64,
    pub deleted_count: i64,
    pub total_bytes: i64,
    pub error_summary: String,
    pub manifest_json: String,
    pub steps_json: String, // Vec<DeploymentStep>
    pub log_json: String,   // Vec<String>
    pub rollback_from: Option<String>,
}

/// 部署「工作连续性」聚合统计（按服务器连接，覆盖全部历史，不限于当前分页）
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeploymentStats {
    pub total: i64,
    pub success_count: i64,
    pub failed_count: i64,
    pub scheduled_count: i64,
    pub last_deployed_at: Option<i64>,
    pub last_scheduled_at: Option<i64>,
    /// 自最近一次部署向前数的连续成功次数（健康度信号）
    pub consecutive_success: i64,
}

pub fn insert(db: &Database, row: &DeploymentRow) -> Result<()> {
    let conn = db.conn();
    conn.execute(
        "INSERT INTO deployments (id, site_id, trigger_type, target_env, mode, connection_id, \
         remote_path, version_dir, server_version, status, started_at, finished_at, \
         duration_ms, uploaded_count, deleted_count, total_bytes, error_summary, manifest_json, \
         steps_json, log_json, rollback_from) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)",
        params![
            row.id,
            row.site_id,
            row.trigger_type,
            row.target_env,
            row.mode,
            row.connection_id,
            row.remote_path,
            row.version_dir,
            row.server_version,
            row.status,
            row.started_at,
            row.finished_at,
            row.duration_ms,
            row.uploaded_count,
            row.deleted_count,
            row.total_bytes,
            row.error_summary,
            row.manifest_json,
            row.steps_json,
            row.log_json,
            row.rollback_from,
        ],
    )?;
    Ok(())
}

pub fn update_status(
    db: &Database,
    id: &str,
    status: &str,
    finished_at: Option<i64>,
    duration_ms: Option<i64>,
    error_summary: Option<&str>,
) -> Result<()> {
    let conn = db.conn();
    conn.execute(
        "UPDATE deployments SET status = ?1, finished_at = ?2, duration_ms = ?3, \
         error_summary = COALESCE(?4, error_summary) \
         WHERE id = ?5",
        params![status, finished_at, duration_ms, error_summary, id],
    )?;
    Ok(())
}

pub fn update_steps(db: &Database, id: &str, steps_json: &str) -> Result<()> {
    let conn = db.conn();
    conn.execute(
        "UPDATE deployments SET steps_json = ?1 WHERE id = ?2",
        params![steps_json, id],
    )?;
    Ok(())
}

pub fn append_log(db: &Database, id: &str, log_line: &str, max_lines: usize) -> Result<()> {
    let conn = db.conn();
    let current: String = conn
        .query_row(
            "SELECT log_json FROM deployments WHERE id = ?1",
            params![id],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| "[]".to_string());

    let mut logs: Vec<String> = serde_json::from_str(&current).unwrap_or_default();
    logs.push(log_line.to_string());
    // 超出上限时截断头部
    if logs.len() > max_lines {
        let skip = logs.len() - max_lines;
        logs = logs.into_iter().skip(skip).collect();
    }
    let new_json = serde_json::to_string(&logs).unwrap_or_else(|_| "[]".to_string());

    conn.execute(
        "UPDATE deployments SET log_json = ?1 WHERE id = ?2",
        params![new_json, id],
    )?;
    Ok(())
}

pub fn update_stats(
    db: &Database,
    id: &str,
    uploaded_count: i64,
    deleted_count: i64,
    total_bytes: i64,
) -> Result<()> {
    let conn = db.conn();
    conn.execute(
        "UPDATE deployments SET uploaded_count = ?1, deleted_count = ?2, total_bytes = ?3 WHERE id = ?4",
        params![uploaded_count, deleted_count, total_bytes, id],
    )?;
    Ok(())
}

pub fn get(db: &Database, id: &str) -> Result<Option<DeploymentRow>> {
    let conn = db.conn();
    let mut stmt = conn.prepare(
        "SELECT id, site_id, trigger_type, target_env, mode, connection_id, remote_path, \
         version_dir, server_version, status, started_at, finished_at, duration_ms, \
         uploaded_count, deleted_count, total_bytes, error_summary, manifest_json, \
         steps_json, log_json, rollback_from \
         FROM deployments WHERE id = ?1",
    )?;
    let mut rows = stmt.query(params![id])?;
    if let Some(r) = rows.next()? {
        Ok(Some(DeploymentRow {
            id: r.get(0)?,
            site_id: r.get(1)?,
            trigger_type: r.get(2)?,
            target_env: r.get(3)?,
            mode: r.get(4)?,
            connection_id: r.get(5)?,
            remote_path: r.get(6)?,
            version_dir: r.get(7)?,
            server_version: r.get(8)?,
            status: r.get(9)?,
            started_at: r.get(10)?,
            finished_at: r.get(11)?,
            duration_ms: r.get(12)?,
            uploaded_count: r.get(13)?,
            deleted_count: r.get(14)?,
            total_bytes: r.get(15)?,
            error_summary: r.get(16)?,
            manifest_json: r.get(17)?,
            steps_json: r.get(18)?,
            log_json: r.get(19)?,
            rollback_from: r.get(20)?,
        }))
    } else {
        Ok(None)
    }
}

/// 按 ID 删除单条部署记录
pub fn delete_by_id(db: &Database, id: &str) -> Result<()> {
    db.conn().execute("DELETE FROM deployments WHERE id = ?1", params![id])?;
    Ok(())
}

/// 按 ID 列表批量删除部署记录
pub fn delete_by_ids(db: &Database, ids: &[String]) -> Result<usize> {
    if ids.is_empty() {
        return Ok(0);
    }
    let conn = db.conn();
    let placeholders: Vec<String> = (1..=ids.len()).map(|i| format!("?{}", i)).collect();
    let sql = format!("DELETE FROM deployments WHERE id IN ({})", placeholders.join(", "));
    let mut stmt = conn.prepare(&sql)?;
    let params: Vec<&dyn rusqlite::ToSql> = ids.iter().map(|s| s as &dyn rusqlite::ToSql).collect();
    let count = stmt.execute(params.as_slice())?;
    Ok(count)
}

/// 删除某个站点的所有部署记录
pub fn delete_by_site(db: &Database, site_id: &str) -> Result<usize> {
    let count = db.conn().execute(
        "DELETE FROM deployments WHERE site_id = ?1",
        params![site_id],
    )?;
    Ok(count)
}

/// 删除某个服务器连接的所有部署记录
pub fn delete_by_connection(db: &Database, connection_id: &str) -> Result<usize> {
    let count = db.conn().execute(
        "DELETE FROM deployments WHERE connection_id = ?1",
        params![connection_id],
    )?;
    Ok(count)
}

/// 清理站点的旧部署记录，只保留最近 N 条
pub fn cleanup_old_by_site(db: &Database, site_id: &str, keep_count: i64) -> Result<usize> {
    if keep_count <= 0 {
        return delete_by_site(db, site_id);
    }
    let count = db.conn().execute(
        "DELETE FROM deployments WHERE site_id = ?1 AND id NOT IN (
            SELECT id FROM deployments WHERE site_id = ?1
            ORDER BY started_at DESC LIMIT ?2
        )",
        params![site_id, keep_count],
    )?;
    Ok(count)
}

/// 按状态删除部署记录（如清理所有失败的）
pub fn delete_by_status(db: &Database, site_id: &str, status: &str) -> Result<usize> {
    let count = db.conn().execute(
        "DELETE FROM deployments WHERE site_id = ?1 AND status = ?2",
        params![site_id, status],
    )?;
    Ok(count)
}

pub fn list_by_site(db: &Database, site_id: &str, limit: i64) -> Result<Vec<DeploymentRow>> {
    let conn = db.conn();
    let limit = limit.max(1).min(200);
    let mut stmt = conn.prepare(
        "SELECT id, site_id, trigger_type, target_env, mode, connection_id, remote_path, \
         version_dir, server_version, status, started_at, finished_at, duration_ms, \
         uploaded_count, deleted_count, total_bytes, error_summary, manifest_json, \
         steps_json, log_json, rollback_from \
         FROM deployments WHERE site_id = ?1 ORDER BY started_at DESC LIMIT ?2",
    )?;
    let rows = stmt.query_map(params![site_id, limit], |r| {
        Ok(DeploymentRow {
            id: r.get(0)?,
            site_id: r.get(1)?,
            trigger_type: r.get(2)?,
            target_env: r.get(3)?,
            mode: r.get(4)?,
            connection_id: r.get(5)?,
            remote_path: r.get(6)?,
            version_dir: r.get(7)?,
            server_version: r.get(8)?,
            status: r.get(9)?,
            started_at: r.get(10)?,
            finished_at: r.get(11)?,
            duration_ms: r.get(12)?,
            uploaded_count: r.get(13)?,
            deleted_count: r.get(14)?,
            total_bytes: r.get(15)?,
            error_summary: r.get(16)?,
            manifest_json: r.get(17)?,
            steps_json: r.get(18)?,
            log_json: r.get(19)?,
            rollback_from: r.get(20)?,
        })
    })?;
    Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
}

/// 按服务器连接 ID 查询部署记录（运维中心用，支持分页）
pub fn list_by_connection(
    db: &Database,
    connection_id: &str,
    limit: i64,
    offset: i64,
) -> Result<Vec<DeploymentRow>> {
    let conn = db.conn();
    let limit = limit.max(1).min(200);
    let offset = offset.max(0);
    let mut stmt = conn.prepare(
        "SELECT id, site_id, trigger_type, target_env, mode, connection_id, remote_path, \
         version_dir, server_version, status, started_at, finished_at, duration_ms, \
         uploaded_count, deleted_count, total_bytes, error_summary, manifest_json, \
         steps_json, log_json, rollback_from \
         FROM deployments WHERE connection_id = ?1 ORDER BY started_at DESC LIMIT ?2 OFFSET ?3",
    )?;
    let rows = stmt.query_map(params![connection_id, limit, offset], |r| {
        Ok(DeploymentRow {
            id: r.get(0)?,
            site_id: r.get(1)?,
            trigger_type: r.get(2)?,
            target_env: r.get(3)?,
            mode: r.get(4)?,
            connection_id: r.get(5)?,
            remote_path: r.get(6)?,
            version_dir: r.get(7)?,
            server_version: r.get(8)?,
            status: r.get(9)?,
            started_at: r.get(10)?,
            finished_at: r.get(11)?,
            duration_ms: r.get(12)?,
            uploaded_count: r.get(13)?,
            deleted_count: r.get(14)?,
            total_bytes: r.get(15)?,
            error_summary: r.get(16)?,
            manifest_json: r.get(17)?,
            steps_json: r.get(18)?,
            log_json: r.get(19)?,
            rollback_from: r.get(20)?,
        })
    })?;
    Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
}

/// 统计某服务器连接的部署记录总数
pub fn count_by_connection(db: &Database, connection_id: &str) -> Result<i64> {
    let conn = db.conn();
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM deployments WHERE connection_id = ?1",
        params![connection_id],
        |r| r.get(0),
    )?;
    Ok(count)
}

/// 聚合某服务器连接下全部部署记录的「工作连续性」指标。
/// 与 `list_by_connection` 不同，此处统计覆盖所有历史（不限分页），供运维概览使用。
pub fn stats_by_connection(db: &Database, connection_id: &str) -> Result<DeploymentStats> {
    let conn = db.conn();
    let total: i64 = conn.query_row(
        "SELECT COUNT(*) FROM deployments WHERE connection_id = ?1",
        params![connection_id],
        |r| r.get(0),
    )?;
    let success_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM deployments WHERE connection_id = ?1 AND status = 'success'",
        params![connection_id],
        |r| r.get(0),
    )?;
    let failed_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM deployments WHERE connection_id = ?1 AND status = 'failed'",
        params![connection_id],
        |r| r.get(0),
    )?;
    let scheduled_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM deployments WHERE connection_id = ?1 AND trigger_type = 'scheduled'",
        params![connection_id],
        |r| r.get(0),
    )?;
    let last_deployed_at: Option<i64> = conn.query_row(
        "SELECT MAX(started_at) FROM deployments WHERE connection_id = ?1",
        params![connection_id],
        |r| r.get(0),
    )?;
    let last_scheduled_at: Option<i64> = conn.query_row(
        "SELECT MAX(started_at) FROM deployments WHERE connection_id = ?1 AND trigger_type = 'scheduled'",
        params![connection_id],
        |r| r.get(0),
    )?;
    // 自最近一次部署向前数连续 success 的次数（健康度信号）
    let mut stmt = conn.prepare(
        "SELECT started_at, status FROM deployments WHERE connection_id = ?1 ORDER BY started_at DESC",
    )?;
    let rows = stmt.query_map(params![connection_id], |r| {
        Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?))
    })?;
    let mut consecutive_success: i64 = 0;
    for row in rows {
        let (_, status) = row?;
        if status == "success" {
            consecutive_success += 1;
        } else {
            break;
        }
    }
    Ok(DeploymentStats {
        total,
        success_count,
        failed_count,
        scheduled_count,
        last_deployed_at,
        last_scheduled_at,
        consecutive_success,
    })
}

pub fn get_latest_success(db: &Database, site_id: &str) -> Result<Option<DeploymentRow>> {
    let conn = db.conn();
    let mut stmt = conn.prepare(
        "SELECT id, site_id, trigger_type, target_env, mode, connection_id, remote_path, \
         version_dir, server_version, status, started_at, finished_at, duration_ms, \
         uploaded_count, deleted_count, total_bytes, error_summary, manifest_json, \
         steps_json, log_json, rollback_from \
         FROM deployments WHERE site_id = ?1 AND status = 'success' \
         ORDER BY started_at DESC LIMIT 1",
    )?;
    let mut rows = stmt.query(params![site_id])?;
    if let Some(r) = rows.next()? {
        Ok(Some(DeploymentRow {
            id: r.get(0)?,
            site_id: r.get(1)?,
            trigger_type: r.get(2)?,
            target_env: r.get(3)?,
            mode: r.get(4)?,
            connection_id: r.get(5)?,
            remote_path: r.get(6)?,
            version_dir: r.get(7)?,
            server_version: r.get(8)?,
            status: r.get(9)?,
            started_at: r.get(10)?,
            finished_at: r.get(11)?,
            duration_ms: r.get(12)?,
            uploaded_count: r.get(13)?,
            deleted_count: r.get(14)?,
            total_bytes: r.get(15)?,
            error_summary: r.get(16)?,
            manifest_json: r.get(17)?,
            steps_json: r.get(18)?,
            log_json: r.get(19)?,
            rollback_from: r.get(20)?,
        }))
    } else {
        Ok(None)
    }
}
