//! L3 task-orchestration engine (docs/automation-ops-plan.md §6).
//!
//! Executes an [`AutomationTask`]'s steps sequentially: each step produces a
//! [`TaskRunStep`] log row, supports conditions (`on_fail`/`on_success`/
//! `always`), per-step assertions (`expect_stdout`/`expect_stderr`/
//! `expect_exit_code`), per-step retry with backoff, and a global single-run
//! guard per task. Every run is recorded in `task_runs` and streamed to the
//! frontend over kebab-case events.
//!
//! 拆分为以下子模块，各子模块通过 `use super::*;` 共享本文件的导入与公共类型：
//! - [`runner`]：任务执行主流程（`run_task` / `start_scheduler` / `run_inner` / `record_skipped` / `execute_step_once`）
//! - [`util`]：步骤校验、断言、条件判断、本地 shell 执行与展示辅助
//! - [`builtin`]：内置任务模板

use std::collections::{HashMap, HashSet};
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;

use serde_json::json;
use tauri::Emitter;
use tauri::Manager;
use tokio::io::AsyncReadExt;
use tokio_util::sync::CancellationToken;

use crate::app::deploy_service::{DeployProgress, DeployService};
use crate::app::remote_exec_service::{RemoteExecRequest, RemoteExecResult, RemoteExecService};
use crate::app::sftp_service::SftpService;
use crate::core::automation::{
    now_ms, run_cancelled_status, run_failed_status, run_run_status, run_success_status,
    step_skipped_status, truncate_io, AutomationTask, RetryConfig, StepCondition, StepType,
    TaskRun, TaskRunDailyStat, TaskRunStats, TaskRunStep, TaskStep,
};
use crate::core::error::{Error, Result};
use crate::core::types::SshConnectionInfo;
use crate::infra::storage::automation_repo::{AutomationTaskRepo, TaskRunRepo};
use crate::infra::storage::connection_repo::ConnectionRepo;
use crate::infra::storage::database::Database;
use crate::plugins::engine::safety::is_dangerous_command;

const IO_HEAD: usize = 256 * 1024;
const DEFAULT_STEP_TIMEOUT: u64 = 60;

mod builtin;
mod runner;
mod util;

/// Result of one physical attempt of a step.
struct AttemptOutcome {
    ok: bool,
    exit_code: Option<i32>,
    stdout: String,
    stderr: String,
    assertion_passed: Option<bool>,
}

#[derive(Clone)]
pub struct AutomationService {
    db: Arc<Database>,
    remote_exec: Arc<RemoteExecService>,
    sftp: Arc<SftpService>,
    app: tauri::AppHandle,
    running: Arc<std::sync::Mutex<HashSet<String>>>,
    cancel_tokens: Arc<std::sync::Mutex<HashMap<String, CancellationToken>>>,
}


impl AutomationService {
    pub fn new(
        db: Arc<Database>,
        remote_exec: Arc<RemoteExecService>,
        sftp: Arc<SftpService>,
        app: tauri::AppHandle,
    ) -> Self {
        Self {
            db,
            remote_exec,
            sftp,
            app,
            running: Arc::new(std::sync::Mutex::new(HashSet::new())),
            cancel_tokens: Arc::new(std::sync::Mutex::new(HashMap::new())),
        }
    }

    pub fn list_tasks(&self) -> Result<Vec<AutomationTask>> {
        let mut tasks = AutomationTaskRepo::list(&self.db)?;
        let now = now_ms();
        for t in tasks.iter_mut() {
            t.next_run_at = t.next_due_instant(now);
        }
        Ok(tasks)
    }

    pub fn get_task(&self, id: &str) -> Result<Option<AutomationTask>> {
        AutomationTaskRepo::get_by_id(&self.db, id)
    }

    pub fn save_task(&self, mut task: AutomationTask) -> Result<AutomationTask> {
        if task.name.trim().is_empty() {
            return Err(Error::Validation("任务名称不能为空".into()));
        }
        if task.connection_ids.is_empty() {
            return Err(Error::Validation("任务至少需要一个目标服务器连接".into()));
        }
        if task.steps.is_empty() {
            return Err(Error::Validation("任务至少需要一个步骤".into()));
        }
        for step in &task.steps {
            util::validate_step(step)?;
        }
        let now = now_ms();
        let is_new = task.id.is_empty();
        if is_new {
            task.id = uuid::Uuid::new_v4().to_string();
            task.created_at = now;
        }
        task.updated_at = now;
        if is_new {
            AutomationTaskRepo::insert(&self.db, &task)?;
        } else {
            if AutomationTaskRepo::update(&self.db, &task)? == 0 {
                return Err(Error::Validation(format!("任务不存在: {}", task.id)));
            }
        }
        Ok(task)
    }

    pub fn delete_task(&self, id: &str) -> Result<()> {
        AutomationTaskRepo::delete(&self.db, id)?;
        Ok(())
    }

    pub fn toggle_task(&self, id: &str, enabled: bool) -> Result<()> {
        AutomationTaskRepo::set_enabled(&self.db, id, enabled)?;
        Ok(())
    }

    /// 确保内置任务模板存在。首次启动时写入，后续按 id 检测，不存在则补。
    /// 内置任务默认禁用、无目标连接，用户编辑后选上连接即可使用。
    pub fn ensure_builtin_tasks(&self) -> Result<()> {
        let now = now_ms();
        let builtins = builtin::builtin_tasks(now);
        for task in builtins {
            match AutomationTaskRepo::get_by_id(&self.db, &task.id)? {
                Some(_) => continue, // 已存在，不覆盖
                None => {
                    if let Err(e) = AutomationTaskRepo::insert(&self.db, &task) {
                        tracing::warn!("[automation] 内置任务 {} 写入失败: {}", task.id, e);
                    }
                }
            }
        }
        Ok(())
    }

    pub fn list_runs(
        &self,
        task_id: Option<&str>,
        status: Option<&str>,
        trigger: Option<&str>,
        limit: usize,
        offset: usize,
    ) -> Result<Vec<TaskRun>> {
        TaskRunRepo::list_runs(&self.db, task_id, status, trigger, limit, offset)
    }

    /// 历史保留策略（启动时调用）：保留 90 天 + 每任务最近 N 条。
    pub fn prune_run_history(&self, keep_days: i64, per_task_keep: i64) -> Result<(usize, usize)> {
        TaskRunRepo::prune(&self.db, keep_days, per_task_keep)
    }

    /// 删除一条历史运行记录及其步骤。
    pub fn delete_run(&self, run_id: &str) -> Result<usize> {
        TaskRunRepo::delete_run(&self.db, run_id)
    }

    /// 基于已有 run 的配置重新跑一次（trigger=manual）。返回新 run_id。
    pub fn rerun(&self, run_id: &str) -> Result<String> {
        let run = TaskRunRepo::get_run(&self.db, run_id)?
            .ok_or_else(|| Error::Validation(format!("运行记录不存在: {}", run_id)))?;
        self.run_task(&run.task_id, "manual")
    }

    /// 导出一次运行的完整报告（markdown / json），写入 `path`，返回字节数。
    pub fn export_run(&self, run_id: &str, format: &str, path: &str) -> Result<usize> {
        let (run, steps) = self
            .get_run(run_id)?
            .ok_or_else(|| Error::Validation(format!("运行记录不存在: {}", run_id)))?;
        let task_name = AutomationTaskRepo::get_by_id(&self.db, &run.task_id)?
            .map(|t| t.name)
            .unwrap_or_else(|| run.task_id.clone());
        let fmt_ms = |ms: i64| {
            if ms >= 3600_000 {
                format!("{}h {}m", ms / 3600_000, (ms % 3600_000) / 60_000)
            } else if ms >= 60_000 {
                format!("{}m {}s", ms / 60_000, (ms % 60_000) / 1000)
            } else {
                format!("{}s", (ms as f64) / 1000.0)
            }
        };
        let started = util::fmt_timestamp(run.started_at);
        let finished = run.finished_at.map(util::fmt_timestamp).unwrap_or_default();
        let duration = run.duration_ms.map(fmt_ms).unwrap_or_default();

        let content = match format {
            "json" => {
                let payload = json!({
                    "task": { "id": run.task_id, "name": task_name },
                    "run": run,
                    "steps": steps,
                });
                serde_json::to_string_pretty(&payload)
                    .map_err(|e| Error::Validation(format!("序列化失败: {}", e)))?
            }
            _ => {
                let mut md = String::new();
                md.push_str(&format!("# 运行报告: {}\n\n", task_name));
                md.push_str(&format!("- 运行 ID: `{}`\n", run.id));
                md.push_str(&format!("- 状态: **{}**\n", run.status));
                md.push_str(&format!("- 触发方式: {}\n", run.trigger_type));
                md.push_str(&format!("- 开始: {} / 结束: {}\n", started, finished));
                md.push_str(&format!("- 总耗时: {}\n", duration));
                if !run.error_summary.is_empty() {
                    md.push_str(&format!("\n> 错误摘要: {}\n", run.error_summary));
                }
                md.push_str("\n## 步骤\n\n");
                md.push_str("| # | 步骤 | 类型 | 状态 | 耗时 | 尝试 |\n|---|------|------|------|------|------|\n");
                for s in &steps {
                    md.push_str(&format!(
                        "| {} | {} | {} | {} | {} | {} |\n",
                        s.step_index + 1,
                        s.command_rendered.replace('|', "\\|").replace('\n', " "),
                        s.step_type,
                        s.status,
                        fmt_ms(s.duration_ms),
                        s.attempt
                    ));
                }
                md.push_str("\n## 步骤输出\n");
                for s in &steps {
                    md.push_str(&format!(
                        "\n### {}. {}\n\n",
                        s.step_index + 1,
                        s.command_rendered.replace('\n', " ")
                    ));
                    if !s.stdout.is_empty() {
                        md.push_str(&format!("**stdout**\n\n```text\n{}\n```\n", s.stdout));
                    }
                    if !s.stderr.is_empty() {
                        md.push_str(&format!("**stderr**\n\n```text\n{}\n```\n", s.stderr));
                    }
                    if s.stdout.is_empty() && s.stderr.is_empty() {
                        md.push_str("（无输出）\n");
                    }
                }
                md
            }
        };
        std::fs::write(path, &content)?;
        Ok(content.len())
    }

    /// 统计任务运行概览：总数、成功、失败、平均耗时、最近 7 天分布。
    pub fn get_stats(&self, task_id: Option<&str>) -> Result<TaskRunStats> {
        TaskRunRepo::stats(&self.db, task_id)
    }

    pub fn get_run(&self, run_id: &str) -> Result<Option<(TaskRun, Vec<TaskRunStep>)>> {
        let run = match TaskRunRepo::get_run(&self.db, run_id)? {
            Some(r) => r,
            None => return Ok(None),
        };
        let steps = TaskRunRepo::get_steps(&self.db, run_id)?;
        Ok(Some((run, steps)))
    }

    pub fn cancel_run(&self, run_id: &str) -> bool {
        let token = self.cancel_tokens.lock().unwrap().get(run_id).cloned();
        match token {
            Some(t) => {
                t.cancel();
                true
            }
            None => false,
        }
    }
}
