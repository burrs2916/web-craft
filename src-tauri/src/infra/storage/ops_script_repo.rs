use crate::core::error::Result;
use crate::core::types::{Danger, OpsScript, OpsScriptRun, ScriptParam};
use crate::infra::storage::database::Database;

const OPS_COLUMNS: &str =
    "id, name, description, category, icon, script, parameters_json, danger_level, \
     timeout_secs, confirm_required, is_builtin, enabled, created_at, updated_at";

fn row_to_script(row: &rusqlite::Row) -> rusqlite::Result<OpsScript> {
    let parameters_json: String = row.get(6)?;
    let danger_level: String = row.get(7)?;
    Ok(OpsScript {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        category: row.get(3)?,
        icon: row.get(4)?,
        script: row.get(5)?,
        parameters: serde_json::from_str(&parameters_json).unwrap_or_default(),
        danger_level: match danger_level.as_str() {
            "Careful" => Danger::Careful,
            "Dangerous" => Danger::Dangerous,
            _ => Danger::Safe,
        },
        timeout_secs: row.get(8)?,
        confirm_required: row.get::<_, i64>(9)? != 0,
        is_builtin: row.get::<_, i64>(10)? != 0,
        enabled: row.get::<_, i64>(11)? != 0,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
    })
}

fn bind_params(script: &OpsScript) -> rusqlite::Result<Vec<rusqlite::types::Value>> {
    let parameters_json = serde_json::to_string(&script.parameters)
        .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let danger_level = match script.danger_level {
        Danger::Safe => "Safe",
        Danger::Careful => "Careful",
        Danger::Dangerous => "Dangerous",
    }
    .to_string();
    Ok(vec![
        rusqlite::types::Value::Text(script.id.clone()),
        rusqlite::types::Value::Text(script.name.clone()),
        rusqlite::types::Value::Text(script.description.clone()),
        rusqlite::types::Value::Text(script.category.clone()),
        rusqlite::types::Value::Text(script.icon.clone().unwrap_or_default()),
        rusqlite::types::Value::Text(script.script.clone()),
        rusqlite::types::Value::Text(parameters_json),
        rusqlite::types::Value::Text(danger_level),
        rusqlite::types::Value::Integer(script.timeout_secs as i64),
        rusqlite::types::Value::Integer(script.confirm_required as i64),
        rusqlite::types::Value::Integer(script.is_builtin as i64),
        rusqlite::types::Value::Integer(script.enabled as i64),
        rusqlite::types::Value::Integer(script.created_at),
        rusqlite::types::Value::Integer(script.updated_at),
    ])
}

pub struct OpsScriptRepo;

impl OpsScriptRepo {
    pub fn insert(db: &Database, script: &OpsScript) -> Result<()> {
        let conn = db.conn();
        let p = bind_params(script)?;
        conn.execute(
            &format!(
                "INSERT INTO ops_scripts ({}) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)",
                OPS_COLUMNS
            ),
            rusqlite::params_from_iter(p),
        )?;
        Ok(())
    }

    pub fn update(db: &Database, script: &OpsScript) -> Result<usize> {
        let conn = db.conn();
        let p = bind_params(script)?;
        let n = conn.execute(
            "UPDATE ops_scripts SET name=?2, description=?3, category=?4, icon=?5, script=?6, \
             parameters_json=?7, danger_level=?8, timeout_secs=?9, confirm_required=?10, \
             is_builtin=?11, enabled=?12, updated_at=?14 WHERE id=?1",
            rusqlite::params_from_iter(p),
        )?;
        Ok(n)
    }

    pub fn get_by_id(db: &Database, id: &str) -> Result<Option<OpsScript>> {
        let conn = db.conn();
        let mut stmt = conn.prepare(&format!(
            "SELECT {} FROM ops_scripts WHERE id = ?1",
            OPS_COLUMNS
        ))?;
        let mut rows = stmt.query([id])?;
        match rows.next()? {
            Some(row) => Ok(Some(row_to_script(row)?)),
            None => Ok(None),
        }
    }

    pub fn list(db: &Database, category: Option<&str>) -> Result<Vec<OpsScript>> {
        let conn = db.conn();
        let sql = match category {
            Some(_) => format!(
                "SELECT {} FROM ops_scripts WHERE category = ?1 ORDER BY is_builtin DESC, name ASC",
                OPS_COLUMNS
            ),
            None => format!(
                "SELECT {} FROM ops_scripts ORDER BY is_builtin DESC, name ASC",
                OPS_COLUMNS
            ),
        };
        let mut stmt = conn.prepare(&sql)?;
        let rows = match category {
            Some(c) => stmt.query([c])?,
            None => stmt.query([])?,
        };
        let mut out = Vec::new();
        let mut rows = rows;
        while let Some(row) = rows.next()? {
            out.push(row_to_script(&row)?);
        }
        Ok(out)
    }

    /// 列出所有内置脚本（用于清理旧版本残留）
    pub fn list_builtin(db: &Database) -> Result<Vec<OpsScript>> {
        let conn = db.conn();
        let sql = format!("SELECT {} FROM ops_scripts WHERE is_builtin = 1", OPS_COLUMNS);
        let mut stmt = conn.prepare(&sql)?;
        let mut rows = stmt.query([])?;
        let mut out = Vec::new();
        while let Some(row) = rows.next()? {
            out.push(row_to_script(&row)?);
        }
        Ok(out)
    }

    pub fn delete(db: &Database, id: &str) -> Result<usize> {
        let conn = db.conn();
        Ok(conn.execute("DELETE FROM ops_scripts WHERE id = ?1", [id])?)
    }

    pub fn set_enabled(db: &Database, id: &str, enabled: bool) -> Result<usize> {
        let conn = db.conn();
        Ok(conn.execute(
            "UPDATE ops_scripts SET enabled = ?2, updated_at = ?3 WHERE id = ?1",
            rusqlite::params![id, enabled as i64, now_ms()],
        )?)
    }

    pub fn count(db: &Database) -> Result<i64> {
        let conn = db.conn();
        Ok(conn.query_row("SELECT COUNT(*) FROM ops_scripts", [], |r| r.get(0))?)
    }
}

/// ScriptParam 的可读写封装（供意外场景下跨层使用）。
#[allow(dead_code)]
pub fn serialize_params(params: &[ScriptParam]) -> Result<String> {
    serde_json::to_string(params).map_err(Into::into)
}

const OPS_RUN_COLUMNS: &str =
    "id, script_id, script_name, category, connection_id, connection_name, command_rendered, \
     params_json, status, exit_code, stdout, stderr, merged, truncated, channel, danger_level, \
     duration_ms, started_at";

fn run_row_to_run(row: &rusqlite::Row) -> rusqlite::Result<OpsScriptRun> {
    Ok(OpsScriptRun {
        id: row.get(0)?,
        script_id: row.get(1)?,
        script_name: row.get(2)?,
        category: row.get(3)?,
        connection_id: row.get(4)?,
        connection_name: row.get(5)?,
        command_rendered: row.get(6)?,
        params_json: row.get(7)?,
        status: row.get(8)?,
        exit_code: row.get(9)?,
        stdout: row.get(10)?,
        stderr: row.get(11)?,
        merged: row.get::<_, i64>(12)? != 0,
        truncated: row.get::<_, i64>(13)? != 0,
        channel: row.get(14)?,
        danger_level: row.get(15)?,
        duration_ms: row.get(16)?,
        started_at: row.get(17)?,
    })
}

/// 运维脚本执行历史仓库（ops_script_runs 表）：追加写、按脚本/时间倒序读。
pub struct OpsScriptRunRepo;

impl OpsScriptRunRepo {
    pub fn insert(db: &Database, run: &OpsScriptRun) -> Result<()> {
        let conn = db.conn();
        conn.execute(
            &format!(
                "INSERT INTO ops_script_runs ({}) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18)",
                OPS_RUN_COLUMNS
            ),
            rusqlite::params![
                run.id,
                run.script_id,
                run.script_name,
                run.category,
                run.connection_id,
                run.connection_name,
                run.command_rendered,
                run.params_json,
                run.status,
                run.exit_code,
                run.stdout,
                run.stderr,
                run.merged as i64,
                run.truncated as i64,
                run.channel,
                run.danger_level,
                run.duration_ms as i64,
                run.started_at,
            ],
        )?;
        Ok(())
    }

    pub fn list(db: &Database, script_id: Option<&str>, limit: i64) -> Result<Vec<OpsScriptRun>> {
        let conn = db.conn();
        let sql = match script_id {
            Some(_) => format!(
                "SELECT {} FROM ops_script_runs WHERE script_id = ?1 ORDER BY started_at DESC LIMIT ?2",
                OPS_RUN_COLUMNS
            ),
            None => format!(
                "SELECT {} FROM ops_script_runs ORDER BY started_at DESC LIMIT ?1",
                OPS_RUN_COLUMNS
            ),
        };
        let mut stmt = conn.prepare(&sql)?;
        let rows = match script_id {
            Some(id) => stmt.query(rusqlite::params![id, limit])?,
            None => stmt.query(rusqlite::params![limit])?,
        };
        let mut out = Vec::new();
        let mut rows = rows;
        while let Some(row) = rows.next()? {
            out.push(run_row_to_run(&row)?);
        }
        Ok(out)
    }

    /// 仅保留每个脚本最近 `keep_n` 条，超出即删除，防止历史无限增长。
    pub fn prune(db: &Database, script_id: &str, keep_n: i64) -> Result<usize> {
        let conn = db.conn();
        let n = conn.execute(
            "DELETE FROM ops_script_runs WHERE script_id = ?1 AND id NOT IN (\
                 SELECT id FROM ops_script_runs WHERE script_id = ?1 \
                 ORDER BY started_at DESC LIMIT ?2\
             )",
            rusqlite::params![script_id, keep_n],
        )?;
        Ok(n)
    }

    pub fn delete_for_script(db: &Database, script_id: &str) -> Result<usize> {
        let conn = db.conn();
        Ok(conn.execute(
            "DELETE FROM ops_script_runs WHERE script_id = ?1",
            [script_id],
        )?)
    }
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or_default()
}