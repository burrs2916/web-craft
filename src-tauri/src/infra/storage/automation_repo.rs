//! Storage for automation tasks and their run history (docs/automation-ops-plan.md §9).

use crate::core::automation::{
    now_ms, run_run_status, truncate_io, AutomationTask, TaskRun, TaskRunDailyStat,
    TaskRunStats, TaskRunStep,
};
use crate::core::error::Result;
use crate::infra::storage::database::Database;

const IO_HEAD: usize = 16 * 1024;
const IO_TAIL: usize = 16 * 1024;

const TASK_COLUMNS: &str =
    "id, name, description, connection_ids_json, steps_json, retry_json, notify, \
     run_on_startup, permission_mode, last_run_at, enabled, created_at, updated_at, \
     schedule_kind, schedule_interval_secs, schedule_at_minute";

fn row_to_task(row: &rusqlite::Row) -> rusqlite::Result<AutomationTask> {
    let connection_ids_json: String = row.get(3)?;
    let steps_json: String = row.get(4)?;
    let retry_json: Option<String> = row.get(5)?;
    Ok(AutomationTask {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        connection_ids: serde_json::from_str(&connection_ids_json).unwrap_or_default(),
        steps: serde_json::from_str(&steps_json).unwrap_or_default(),
        retry: retry_json
            .filter(|s| !s.is_empty())
            .and_then(|s| serde_json::from_str(&s).ok()),
        notify: row.get::<_, i64>(6)? != 0,
        run_on_startup: row.get::<_, i64>(7)? != 0,
        enabled: row.get::<_, i64>(10)? != 0,
        last_run_at: row.get(9)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
        schedule_kind: row.get::<_, String>(13).unwrap_or_default(),
        schedule_interval_secs: row.get::<_, i64>(14).unwrap_or(0).max(0) as u64,
        schedule_at_minute: row.get::<_, i64>(15).unwrap_or(0).max(0) as u32,
        next_run_at: None,
        last_run_status: None,
    })
}

fn bind_task(task: &AutomationTask) -> rusqlite::Result<Vec<rusqlite::types::Value>> {
    let steps_json = serde_json::to_string(&task.steps)
        .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let conn_json = serde_json::to_string(&task.connection_ids)
        .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let retry_json = task
        .retry
        .as_ref()
        .and_then(|r| serde_json::to_string(r).ok());
    Ok(vec![
        rusqlite::types::Value::Text(task.id.clone()),
        rusqlite::types::Value::Text(task.name.clone()),
        rusqlite::types::Value::Text(task.description.clone()),
        rusqlite::types::Value::Text(conn_json),
        rusqlite::types::Value::Text(steps_json),
        rusqlite::types::Value::Text(retry_json.unwrap_or_default()),
        rusqlite::types::Value::Integer(task.notify as i64),
        rusqlite::types::Value::Integer(task.run_on_startup as i64),
        rusqlite::types::Value::Text("Manual".to_string()),
        rusqlite::types::Value::Integer(task.last_run_at.unwrap_or_default()),
        rusqlite::types::Value::Integer(task.enabled as i64),
        rusqlite::types::Value::Integer(task.created_at),
        rusqlite::types::Value::Integer(task.updated_at),
        rusqlite::types::Value::Text(task.schedule_kind.clone()),
        rusqlite::types::Value::Integer(task.schedule_interval_secs as i64),
        rusqlite::types::Value::Integer(task.schedule_at_minute as i64),
    ])
}

pub struct AutomationTaskRepo;

impl AutomationTaskRepo {
    pub fn insert(db: &Database, task: &AutomationTask) -> Result<()> {
        let conn = db.conn();
        let p = bind_task(task)?;
        conn.execute(
            &format!(
                "INSERT INTO automation_tasks ({}) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16)",
                TASK_COLUMNS
            ),
            rusqlite::params_from_iter(p),
        )?;
        Ok(())
    }

    pub fn update(db: &Database, task: &AutomationTask) -> Result<usize> {
        let conn = db.conn();
        let p = bind_task(task)?;
        let n = conn.execute(
            "UPDATE automation_tasks SET name=?2, description=?3, connection_ids_json=?4, \
             steps_json=?5, retry_json=?6, notify=?7, run_on_startup=?8, enabled=?11, \
             schedule_kind=?14, schedule_interval_secs=?15, schedule_at_minute=?16, \
             updated_at=?13 WHERE id=?1",
            rusqlite::params_from_iter(p),
        )?;
        Ok(n)
    }

    pub fn get_by_id(db: &Database, id: &str) -> Result<Option<AutomationTask>> {
        let conn = db.conn();
        let mut stmt = conn.prepare(&format!(
            "SELECT {} FROM automation_tasks WHERE id = ?1",
            TASK_COLUMNS
        ))?;
        let mut rows = stmt.query([id])?;
        match rows.next()? {
            Some(row) => Ok(Some(row_to_task(row)?)),
            None => Ok(None),
        }
    }

    pub fn list(db: &Database) -> Result<Vec<AutomationTask>> {
        let conn = db.conn();
        let mut stmt =
            conn.prepare(&format!("SELECT {} FROM automation_tasks ORDER BY updated_at DESC", TASK_COLUMNS))?;
        let rows = stmt.query([])?;
        let mut out = Vec::new();
        let mut rows = rows;
        while let Some(row) = rows.next()? {
            out.push(row_to_task(row)?);
        }
        // 批量填充最近运行状态（复用当前已持有的 conn：
        // std::sync::Mutex 不可重入，二次 db.conn() 会同线程自死锁）
        if !out.is_empty() {
            let status_map = Self::latest_run_statuses(&conn)?;
            for task in out.iter_mut() {
                if let Some(s) = status_map.get(&task.id) {
                    task.last_run_status = Some(s.clone());
                }
            }
        }
        Ok(out)
    }

    /// 返回每个任务最近一次运行的状态，用于列表页快速展示。
    fn latest_run_statuses(conn: &rusqlite::Connection) -> Result<std::collections::HashMap<String, String>> {
        // 用 SQLite 的窗口函数思路：对每个 task_id 取 started_at 最大的那条。
        // 为兼容旧版 SQLite，用关联子查询实现。
        let mut stmt = conn.prepare(
            "SELECT r.task_id, r.status FROM task_runs r WHERE r.started_at = \
             (SELECT MAX(started_at) FROM task_runs WHERE task_id = r.task_id)"
        )?;
        let mut rows = stmt.query([])?;
        let mut map = std::collections::HashMap::new();
        while let Some(row) = rows.next()? {
            let task_id: String = row.get(0)?;
            let status: String = row.get(1)?;
            map.insert(task_id, status);
        }
        Ok(map)
    }

    pub fn delete(db: &Database, id: &str) -> Result<usize> {
        let conn = db.conn();
        Ok(conn.execute("DELETE FROM automation_tasks WHERE id = ?1", [id])?)
    }

    pub fn set_enabled(db: &Database, id: &str, enabled: bool) -> Result<usize> {
        let conn = db.conn();
        Ok(conn.execute(
            "UPDATE automation_tasks SET enabled = ?2, updated_at = ?3 WHERE id = ?1",
            rusqlite::params![id, enabled as i64, now_ms()],
        )?)
    }

    pub fn touch_last_run(db: &Database, id: &str, at: i64) -> Result<usize> {
        let conn = db.conn();
        Ok(conn.execute(
            "UPDATE automation_tasks SET last_run_at = ?2, updated_at = ?2 WHERE id = ?1",
            rusqlite::params![id, at],
        )?)
    }
}

const RUN_COLUMNS: &str =
    "id, task_id, trigger_type, connection_id, status, started_at, finished_at, duration_ms, error_summary";

fn row_to_run(row: &rusqlite::Row) -> rusqlite::Result<TaskRun> {
    Ok(TaskRun {
        id: row.get(0)?,
        task_id: row.get(1)?,
        trigger_type: row.get(2)?,
        connection_id: row.get(3)?,
        status: row.get(4)?,
        started_at: row.get(5)?,
        finished_at: row.get(6)?,
        duration_ms: row.get(7)?,
        error_summary: row.get(8)?,
    })
}

fn bind_run(run: &TaskRun) -> Vec<rusqlite::types::Value> {
    vec![
        rusqlite::types::Value::Text(run.id.clone()),
        rusqlite::types::Value::Text(run.task_id.clone()),
        rusqlite::types::Value::Text(run.trigger_type.clone()),
        rusqlite::types::Value::Text(run.connection_id.clone().unwrap_or_default()),
        rusqlite::types::Value::Text(run.status.clone()),
        rusqlite::types::Value::Integer(run.started_at),
        match run.finished_at {
            Some(v) => rusqlite::types::Value::Integer(v),
            None => rusqlite::types::Value::Null,
        },
        match run.duration_ms {
            Some(v) => rusqlite::types::Value::Integer(v),
            None => rusqlite::types::Value::Null,
        },
        rusqlite::types::Value::Text(run.error_summary.clone()),
    ]
}

pub struct TaskRunRepo;

impl TaskRunRepo {
    pub fn insert_run(db: &Database, run: &TaskRun) -> Result<()> {
        let conn = db.conn();
        let p = bind_run(run);
        conn.execute(
            &format!(
                "INSERT INTO task_runs ({}) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
                RUN_COLUMNS
            ),
            rusqlite::params_from_iter(p),
        )?;
        Ok(())
    }

    pub fn finish_run(
        db: &Database,
        id: &str,
        status: &str,
        finished_at: i64,
        duration_ms: i64,
        error_summary: &str,
    ) -> Result<()> {
        let conn = db.conn();
        conn.execute(
            "UPDATE task_runs SET status=?2, finished_at=?3, duration_ms=?4, error_summary=?5 WHERE id=?1",
            rusqlite::params![id, status, finished_at, duration_ms, error_summary],
        )?;
        Ok(())
    }

    /// 列表查询：支持任务/状态/触发方式筛选与偏移分页。
    /// `limit == 0` 视为默认 50，上限 500。
    pub fn list_runs(
        db: &Database,
        task_id: Option<&str>,
        status: Option<&str>,
        trigger: Option<&str>,
        limit: usize,
        offset: usize,
    ) -> Result<Vec<TaskRun>> {
        let conn = db.conn();
        let limit = if limit == 0 { 50 } else { limit.min(500) };
        let mut sql = format!("SELECT {} FROM task_runs WHERE 1=1", RUN_COLUMNS);
        let mut params: Vec<rusqlite::types::Value> = Vec::new();
        if let Some(tid) = task_id {
            params.push(rusqlite::types::Value::Text(tid.to_string()));
            sql.push_str(&format!(" AND task_id = ?{}", params.len()));
        }
        if let Some(s) = status {
            params.push(rusqlite::types::Value::Text(s.to_string()));
            sql.push_str(&format!(" AND status = ?{}", params.len()));
        }
        if let Some(tg) = trigger {
            params.push(rusqlite::types::Value::Text(tg.to_string()));
            sql.push_str(&format!(" AND trigger_type = ?{}", params.len()));
        }
        sql.push_str(" ORDER BY started_at DESC");
        params.push(rusqlite::types::Value::Integer(limit as i64));
        sql.push_str(&format!(" LIMIT ?{}", params.len()));
        params.push(rusqlite::types::Value::Integer(offset as i64));
        sql.push_str(&format!(" OFFSET ?{}", params.len()));

        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query(rusqlite::params_from_iter(params))?;
        let mut out = Vec::new();
        let mut rows = rows;
        while let Some(row) = rows.next()? {
            out.push(row_to_run(row)?);
        }
        Ok(out)
    }

    pub fn get_run(db: &Database, id: &str) -> Result<Option<TaskRun>> {
        let conn = db.conn();
        let mut stmt = conn.prepare(&format!(
            "SELECT {} FROM task_runs WHERE id = ?1",
            RUN_COLUMNS
        ))?;
        let mut rows = stmt.query([id])?;
        match rows.next()? {
            Some(row) => Ok(Some(row_to_run(row)?)),
            None => Ok(None),
        }
    }

    /// 删除一次运行及其所有步骤。返回删除的运行数（0 或 1）。
    pub fn delete_run(db: &Database, id: &str) -> Result<usize> {
        let conn = db.conn();
        conn.execute("DELETE FROM task_run_steps WHERE run_id = ?1", [id])?;
        let n = conn.execute("DELETE FROM task_runs WHERE id = ?1", [id])?;
        Ok(n)
    }

    pub fn insert_step(db: &Database, step: &TaskRunStep) -> Result<()> {
        let conn = db.conn();
        let p = bind_step(step);
        conn.execute(
            "INSERT INTO task_run_steps \
             (id, run_id, step_index, step_id, step_type, command_rendered, status, exit_code, \
              stdout, stderr, assertion_passed, attempt, duration_ms) \
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)",
            rusqlite::params_from_iter(p),
        )?;
        Ok(())
    }

    /// 更新步骤行结果（步骤先以 running 状态落库，执行完回填真实结果与耗时）。
    pub fn update_step_result(
        db: &Database,
        id: &str,
        status: &str,
        exit_code: Option<i32>,
        stdout: &str,
        stderr: &str,
        assertion_passed: Option<bool>,
        attempt: i64,
        duration_ms: i64,
    ) -> Result<()> {
        let conn = db.conn();
        conn.execute(
            "UPDATE task_run_steps SET status=?2, exit_code=?3, stdout=?4, stderr=?5, \
             assertion_passed=?6, attempt=?7, duration_ms=?8 WHERE id=?1",
            rusqlite::params![
                id,
                status,
                exit_code,
                truncate_io(stdout, IO_HEAD, IO_TAIL),
                truncate_io(stderr, IO_HEAD, IO_TAIL),
                assertion_passed,
                attempt,
                duration_ms
            ],
        )?;
        Ok(())
    }

    /// 历史保留策略：删除 `keep_days` 天之前的运行，且每任务只保留最近 `per_task_keep` 条。
    /// 返回 (删除的运行数, 删除的步骤数)。步骤行的 stdout/stderr 较大，是膨胀的主要来源。
    pub fn prune(db: &Database, keep_days: i64, per_task_keep: i64) -> Result<(usize, usize)> {
        let conn = db.conn();
        let cutoff = now_ms() - keep_days.saturating_mul(86_400_000);
        // 待删除的运行：超期 或 每任务条数超出上限（窗口函数需 SQLite ≥ 3.25）
        let ids: Vec<String> = {
            let mut stmt = conn.prepare(
                "SELECT id FROM task_runs WHERE started_at < ?1 \
                 UNION \
                 SELECT id FROM ( \
                   SELECT id, ROW_NUMBER() OVER (PARTITION BY task_id ORDER BY started_at DESC) AS rn \
                   FROM task_runs \
                 ) WHERE rn > ?2",
            )?;
            let rows = stmt.query_map(
                rusqlite::params![cutoff, per_task_keep],
                |row| row.get::<_, String>(0),
            )?;
            rows.collect::<rusqlite::Result<Vec<_>>>()?
        };
        if ids.is_empty() {
            return Ok((0, 0));
        }
        let mut steps_removed = 0usize;
        let mut runs_removed = 0usize;
        for id in &ids {
            steps_removed += conn.execute(
                "DELETE FROM task_run_steps WHERE run_id = ?1",
                rusqlite::params![id],
            )?;
            runs_removed += conn.execute(
                "DELETE FROM task_runs WHERE id = ?1",
                rusqlite::params![id],
            )?;
        }
        // 清理可能的孤儿步骤行（防御性）
        conn.execute(
            "DELETE FROM task_run_steps WHERE run_id NOT IN (SELECT id FROM task_runs)",
            [],
        )?;
        Ok((runs_removed, steps_removed))
    }

    pub fn get_steps(db: &Database, run_id: &str) -> Result<Vec<TaskRunStep>> {
        let conn = db.conn();
        let mut stmt = conn.prepare(
            "SELECT id, run_id, step_index, step_id, step_type, command_rendered, status, exit_code, \
             stdout, stderr, assertion_passed, attempt, duration_ms \
             FROM task_run_steps WHERE run_id=?1 ORDER BY step_index ASC",
        )?;
        let rows = stmt.query([run_id])?;
        let mut out = Vec::new();
        let mut rows = rows;
        while let Some(row) = rows.next()? {
            out.push(row_to_step(row)?);
        }
        Ok(out)
    }

    /// 运行统计概览：总数、成功/失败/取消、平均耗时、最近 7 天分布。
    pub fn stats(db: &Database, task_id: Option<&str>) -> Result<TaskRunStats> {
        let conn = db.conn();
        let where_clause = if task_id.is_some() { "WHERE task_id = ?1" } else { "WHERE 1=1" };
        let mut params: Vec<&dyn rusqlite::ToSql> = Vec::new();
        if let Some(tid) = task_id.as_ref() {
            params.push(tid);
        }

        // 总数、成功、失败、取消、平均耗时
        let mut stmt = conn.prepare(&format!(
            "SELECT COUNT(*), \
             SUM(CASE WHEN status='success' THEN 1 ELSE 0 END), \
             SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END), \
             SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END), \
             COALESCE(AVG(duration_ms), 0) \
             FROM task_runs {}",
            where_clause
        ))?;
        let mut rows = stmt.query(rusqlite::params_from_iter(&params))?;
        let mut stats = TaskRunStats::default();
        if let Some(row) = rows.next()? {
            stats.total_runs = row.get(0)?;
            stats.success_runs = row.get::<_, Option<i64>>(1)?.unwrap_or(0);
            stats.failed_runs = row.get::<_, Option<i64>>(2)?.unwrap_or(0);
            stats.cancelled_runs = row.get::<_, Option<i64>>(3)?.unwrap_or(0);
            stats.avg_duration_ms = row.get::<_, f64>(4)? as i64;
        }

        // 最近 7 天：按日期分组
        let seven_days_ago = now_ms() - 7 * 24 * 3600 * 1000;
        let mut stmt2 = conn.prepare(&format!(
            "SELECT \
             date(started_at/1000, 'unixepoch', 'localtime') as d, \
             COUNT(*), \
             SUM(CASE WHEN status='success' THEN 1 ELSE 0 END), \
             SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) \
             FROM task_runs \
             WHERE started_at >= ? {} \
             GROUP BY d ORDER BY d ASC",
            if task_id.is_some() { "AND task_id = ?" } else { "" }
        ))?;
        let mut params2: Vec<&dyn rusqlite::ToSql> = vec![&seven_days_ago];
        if let Some(tid) = task_id.as_ref() {
            params2.push(tid);
        }
        let mut rows2 = stmt2.query(rusqlite::params_from_iter(&params2))?;
        let mut daily: Vec<TaskRunDailyStat> = Vec::new();
        while let Some(row) = rows2.next()? {
            daily.push(TaskRunDailyStat {
                date: row.get(0)?,
                total: row.get(1)?,
                success: row.get::<_, Option<i64>>(2)?.unwrap_or(0),
                failed: row.get::<_, Option<i64>>(3)?.unwrap_or(0),
            });
        }
        stats.last_7_days = daily;
        Ok(stats)
    }
}

fn bind_step(step: &TaskRunStep) -> Vec<rusqlite::types::Value> {
    vec![
        rusqlite::types::Value::Text(step.id.clone()),
        rusqlite::types::Value::Text(step.run_id.clone()),
        rusqlite::types::Value::Integer(step.step_index),
        rusqlite::types::Value::Text(step.step_id.clone()),
        rusqlite::types::Value::Text(step.step_type.clone()),
        rusqlite::types::Value::Text(truncate_io(&step.command_rendered, IO_HEAD, IO_TAIL)),
        rusqlite::types::Value::Text(step.status.clone()),
        match step.exit_code {
            Some(v) => rusqlite::types::Value::Integer(v as i64),
            None => rusqlite::types::Value::Null,
        },
        rusqlite::types::Value::Text(truncate_io(&step.stdout, IO_HEAD, IO_TAIL)),
        rusqlite::types::Value::Text(truncate_io(&step.stderr, IO_HEAD, IO_TAIL)),
        match step.assertion_passed {
            Some(v) => rusqlite::types::Value::Integer(v as i64),
            None => rusqlite::types::Value::Null,
        },
        rusqlite::types::Value::Integer(step.attempt),
        rusqlite::types::Value::Integer(step.duration_ms),
    ]
}

fn row_to_step(row: &rusqlite::Row) -> rusqlite::Result<TaskRunStep> {
    Ok(TaskRunStep {
        id: row.get(0)?,
        run_id: row.get(1)?,
        step_index: row.get(2)?,
        step_id: row.get(3)?,
        step_type: row.get(4)?,
        command_rendered: row.get(5)?,
        status: row.get(6)?,
        exit_code: row.get(7)?,
        stdout: row.get(8)?,
        stderr: row.get(9)?,
        assertion_passed: row
            .get::<_, Option<i64>>(10)?
            .map(|v| v != 0),
        attempt: row.get(11)?,
        duration_ms: row.get(12)?,
    })
}

pub fn running_status() -> &'static str {
    run_run_status()
}