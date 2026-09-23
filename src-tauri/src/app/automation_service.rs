//! L3 task-orchestration engine (docs/automation-ops-plan.md §6).
//!
//! Executes an [`AutomationTask`]'s steps sequentially: each step produces a
//! [`TaskRunStep`] log row, supports conditions (`on_fail`/`on_success`/
//! `always`), per-step assertions (`expect_stdout`/`expect_stderr`/
//! `expect_exit_code`), per-step retry with backoff, and a global single-run
//! guard per task. Every run is recorded in `task_runs` and streamed to the
//! frontend over kebab-case events.

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
            validate_step(step)?;
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
        let builtins = builtin_tasks(now);
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
        let started = fmt_timestamp(run.started_at);
        let finished = run.finished_at.map(fmt_timestamp).unwrap_or_default();
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

    /// Kick off an async run. Returns immediately with the `run_id`.
    /// `trigger_type` 记录触发来源（manual / schedule / startup），落库供运维追溯。
    pub fn run_task(&self, task_id: &str, trigger_type: &str) -> Result<String> {
        let task = AutomationTaskRepo::get_by_id(&self.db, task_id)?
            .ok_or_else(|| Error::Validation(format!("任务不存在: {}", task_id)))?;
        if !task.enabled {
            return Err(Error::Validation("任务已停用".into()));
        }
        {
            let mut set = self.running.lock().unwrap();
            if set.contains(task_id) {
                return Err(Error::Validation("任务正在运行中，请勿重复触发".into()));
            }
            set.insert(task_id.to_string());
        }

        let run_id = uuid::Uuid::new_v4().to_string();
        let started_at = now_ms();
        TaskRunRepo::insert_run(
            &self.db,
            &TaskRun {
                id: run_id.clone(),
                task_id: task_id.to_string(),
                trigger_type: trigger_type.to_string(),
                connection_id: task.connection_ids.first().cloned(),
                status: run_run_status().into(),
                started_at,
                finished_at: None,
                duration_ms: None,
                error_summary: String::new(),
            },
        )?;
        AutomationTaskRepo::touch_last_run(&self.db, task_id, started_at)?;

        let token = CancellationToken::new();
        self.cancel_tokens.lock().unwrap().insert(run_id.clone(), token.clone());

        let svc = self.clone();
        let run_id_for_spawn = run_id.clone();
        let trigger_owned = trigger_type.to_string();
        tauri::async_runtime::spawn(async move {
            svc.run_inner(task, run_id_for_spawn, token, &trigger_owned).await;
        });
        Ok(run_id)
    }

    /// 启动后台周期调度器，保证自动化任务的「工作连续性」：
    /// - 应用启动时（首次 tick）对 `run_on_startup` 的启用任务触发一次（trigger=startup）；
    /// - 此后每 30s 轮询，对启用了周期调度的任务按 schedule 规则触发（trigger=schedule）。
    /// 调度只调用 `run_task`，复用既有的运行锁 + 落库 + 事件推送，零额外副作用。
    pub fn start_scheduler(&self) {
        let svc = self.clone();
        tauri::async_runtime::spawn(async move {
            // 首次 tick 前先等一小段，避免与启动期其它初始化抢资源。
            tokio::time::sleep(Duration::from_secs(5)).await;
            let mut startup_done = false;
            loop {
                tokio::time::sleep(Duration::from_secs(30)).await;
                let now = now_ms();
                let tasks = match svc.list_tasks() {
                    Ok(t) => t,
                    Err(e) => {
                        tracing::warn!("[scheduler] list_tasks failed: {}", e);
                        continue;
                    }
                };
                for task in tasks {
                    if !task.enabled {
                        continue;
                    }
                    // 启动触发：仅首次 tick 对 run_on_startup 任务触发一次。
                    if !startup_done && task.run_on_startup {
                        if let Err(e) = svc.run_task(&task.id, "startup") {
                            tracing::warn!("[scheduler] startup run {} failed: {}", task.id, e);
                        }
                        continue;
                    }
                    // 周期调度：按 schedule 规则判断是否到期。
                    if task.is_due(now) {
                        if let Err(e) = svc.run_task(&task.id, "schedule") {
                            tracing::warn!("[scheduler] scheduled run {} failed: {}", task.id, e);
                        }
                    }
                }
                startup_done = true;
            }
        });
    }

    async fn run_inner(&self, task: AutomationTask, run_id: String, token: CancellationToken, trigger_type: &str) {
        let task_id = task.id.clone();
        let started_at = now_ms();
        let multi_server = task.connection_ids.len() > 1;

        // 无目标连接时跑一轮（remote_exec 等步骤会失败并给出明确错误）；
        // 有连接时在每台服务器上各跑一轮（依次执行，run 内连续编号）。
        let server_ids: Vec<String> = if task.connection_ids.is_empty() {
            vec![String::new()]
        } else {
            task.connection_ids.clone()
        };

        let mut overall_failed = false;
        let mut cancelled = false;
        let mut error_summary = String::new();
        let mut row_idx: i64 = 0;

        for conn_id in &server_ids {
            // 解析连接；失败则记一条失败步骤并继续下一台服务器
            let (ssh, server_label) = if conn_id.is_empty() {
                (None, String::new())
            } else {
                match resolve_ssh(&self.db, conn_id) {
                    Ok(s) => (Some(s), connection_name(&self.db, conn_id)),
                    Err(e) => {
                        let msg = format!("连接服务器失败: {}", e);
                        let _ = TaskRunRepo::insert_step(
                            &self.db,
                            &TaskRunStep {
                                id: uuid::Uuid::new_v4().to_string(),
                                run_id: run_id.clone(),
                                step_index: row_idx,
                                step_id: format!("conn-{}", conn_id),
                                step_type: "connection".into(),
                                command_rendered: truncate_io(&msg, IO_HEAD, IO_HEAD),
                                status: "failed".into(),
                                exit_code: None,
                                stdout: String::new(),
                                stderr: msg.clone(),
                                assertion_passed: None,
                                attempt: 0,
                                duration_ms: 0,
                            },
                        );
                        overall_failed = true;
                        if error_summary.is_empty() {
                            error_summary = format!("[{}] {}", server_fallback_name(&self.db, conn_id), msg);
                        }
                        continue;
                    }
                }
            };
            let prefix = if multi_server { format!("[{}] ", server_label) } else { String::new() };
            let mut server_failed = false;

            'steps: for step in task.steps.iter() {
                if token.is_cancelled() {
                    cancelled = true;
                    break;
                }
                if !condition_allows(step.condition.as_ref(), server_failed) {
                    self.record_skipped(&run_id, row_idx, step, &prefix).await;
                    row_idx += 1;
                    continue;
                }

                let attempts = step.retry.as_ref().map(|r| r.attempts()).unwrap_or(1).max(1) as usize;
                let backoff = step.retry.as_ref().map(|r| r.backoff_secs).unwrap_or(0);
                let label = format!("{}{}", prefix, step.rendered_label());

                // 步骤先以 running 状态落库：运行中途打开详情也能看到现场。
                let step_row_id = uuid::Uuid::new_v4().to_string();
                let _ = TaskRunRepo::insert_step(
                    &self.db,
                    &TaskRunStep {
                        id: step_row_id.clone(),
                        run_id: run_id.clone(),
                        step_index: row_idx,
                        step_id: step.id.clone(),
                        step_type: step.step_type.as_str().to_string(),
                        command_rendered: truncate_io(&label, IO_HEAD, IO_HEAD),
                        status: "running".into(),
                        exit_code: None,
                        stdout: String::new(),
                        stderr: String::new(),
                        assertion_passed: None,
                        attempt: 1,
                        duration_ms: 0,
                    },
                );

                let mut outcome: Option<AttemptOutcome> = None;
                let mut attempt_used = 1u64;
                let mut step_duration_ms: i64 = 0;
                for attempt in 1..=attempts {
                    if token.is_cancelled() {
                        cancelled = true;
                        break;
                    }
                    attempt_used = attempt as u64;
                    let _ = self.app.emit(
                        "task-step-started",
                        json!({
                            "run_id": run_id,
                            "step_id": step.id,
                            "step_index": row_idx,
                            "step_type": step.step_type.as_str(),
                            "command_rendered": label,
                            "attempt": attempt,
                        }),
                    );
                    let t0 = std::time::Instant::now();
                    let o = self
                        .execute_step_once(ssh.as_ref(), step, non_empty(conn_id), trigger_type)
                        .await;
                    let dur = t0.elapsed().as_millis() as i64;
                    step_duration_ms = dur;
                    if o.ok || attempt == attempts || token.is_cancelled() {
                        outcome = Some(o);
                        break;
                    }
                    if backoff > 0 {
                        tokio::time::sleep(Duration::from_secs(backoff)).await;
                    }
                }

                let o = match outcome {
                    Some(o) => o,
                    None => {
                        cancelled = true;
                        break 'steps;
                    }
                };

                let step_status = if o.ok { "success" } else { "failed" };
                let _ = TaskRunRepo::update_step_result(
                    &self.db,
                    &step_row_id,
                    step_status,
                    o.exit_code,
                    &o.stdout,
                    &o.stderr,
                    o.assertion_passed,
                    attempt_used as i64,
                    step_duration_ms,
                );
                self.app.emit(
                    "task-step-finished",
                    json!({
                        "run_id": run_id,
                        "step_id": step.id,
                        "step_index": row_idx,
                        "status": step_status,
                        "exit_code": o.exit_code,
                        "duration_ms": step_duration_ms,
                    }),
                );

                if !o.ok && !step.continue_on_fail {
                    server_failed = true;
                    if error_summary.is_empty() {
                        error_summary = format!("{}步骤「{}」失败: {}", prefix, step.name, summarize(&o.stderr));
                    }
                }
                row_idx += 1;
            }
            if server_failed {
                overall_failed = true;
            }
            if cancelled {
                break;
            }
        }

        let cancelled = cancelled || token.is_cancelled();
        let status = if cancelled {
            run_cancelled_status()
        } else if overall_failed {
            run_failed_status()
        } else {
            run_success_status()
        };
        let finished_at = now_ms();
        let duration_ms = finished_at - started_at;
        let _ = TaskRunRepo::finish_run(&self.db, &run_id, status, finished_at, duration_ms, &error_summary);
        self.cancel_tokens.lock().unwrap().remove(&run_id);
        self.running.lock().unwrap().remove(&task_id);
        self.app.emit(
            "task-run-finished",
            json!({ "run_id": run_id, "task_id": task_id, "status": status, "duration_ms": duration_ms }),
        );

        // 系统通知：notify 开启的任务，失败必达；成功也简短播报（用户显式选择开启的任务）。
        if task.notify {
            let status_label = match status {
                "success" => "成功",
                "cancelled" => "已取消",
                _ => "失败",
            };
            let body = if overall_failed || cancelled {
                if error_summary.is_empty() { status_label.to_string() } else { error_summary.clone() }
            } else {
                format!("耗时 {} 秒", duration_ms / 1000)
            };
            use tauri_plugin_notification::NotificationExt;
            let _ = self
                .app
                .notification()
                .builder()
                .title(format!("任务「{}」{}", task.name, status_label))
                .body(body)
                .show();
        }
    }

    async fn record_skipped(&self, run_id: &str, idx: i64, step: &TaskStep, prefix: &str) {
        let label = format!("{}{}", prefix, step.rendered_label());
        let _ = TaskRunRepo::insert_step(
            &self.db,
            &TaskRunStep {
                id: uuid::Uuid::new_v4().to_string(),
                run_id: run_id.to_string(),
                step_index: idx,
                step_id: step.id.clone(),
                step_type: step.step_type.as_str().to_string(),
                command_rendered: truncate_io(&label, IO_HEAD, IO_HEAD),
                status: step_skipped_status().to_string(),
                exit_code: None,
                stdout: String::new(),
                stderr: String::new(),
                assertion_passed: None,
                attempt: 0,
                duration_ms: 0,
            },
        );
        let _ = self.app.emit(
            "task-step-finished",
            json!({ "run_id": run_id, "step_id": step.id, "status": "skipped", "exit_code": null, "duration_ms": 0 }),
        );
    }

    async fn execute_step_once(
        &self,
        ssh: Option<&SshConnectionInfo>,
        step: &TaskStep,
        conn_id: Option<&str>,
        trigger_type: &str,
    ) -> AttemptOutcome {
        match step.step_type {
            StepType::Delay => {
                let secs = step.seconds.unwrap_or(0);
                tokio::time::sleep(Duration::from_secs(secs)).await;
                AttemptOutcome { ok: true, exit_code: Some(0), stdout: format!("sleep {}s", secs), stderr: String::new(), assertion_passed: None }
            }
            StepType::RemoteExec => {
                let command = step.command.clone().unwrap_or_default();
                if let Some(hit) = is_dangerous_command(&command) {
                    return blocked(&command, hit);
                }
                match ssh {
                    Some(s) => {
                        let result = self
                            .remote_exec
                            .execute(s, RemoteExecRequest {
                                connection_id: conn_id.unwrap_or_default().to_string(),
                                command: command.clone(),
                                cwd: None,
                                timeout_secs: step.timeout_secs.unwrap_or(DEFAULT_STEP_TIMEOUT),
                            })
                            .await;
                        finish_with_assertions(result, step, &command)
                    }
                    None => AttemptOutcome { ok: false, exit_code: None, stdout: String::new(), stderr: "步骤需要绑定目标服务器连接".into(), assertion_passed: None },
                }
            }
            StepType::LocalShell => {
                let command = step.command.clone().unwrap_or_default();
                if let Some(hit) = is_dangerous_command(&command) {
                    return blocked(&command, hit);
                }
                let outcome = run_local_shell(&command, step.timeout_secs.unwrap_or(DEFAULT_STEP_TIMEOUT)).await;
                finish_with_assertions(outcome, step, &command)
            }
            StepType::SftpTransfer => {
                let local = step.local_path.clone().unwrap_or_default();
                let remote = step.remote_path.clone().unwrap_or_default();
                if local.is_empty() || remote.is_empty() {
                    return AttemptOutcome { ok: false, exit_code: None, stdout: String::new(), stderr: "sftp 步骤需要本地路径与远程路径".into(), assertion_passed: None };
                }
                match ssh {
                    Some(s) => {
                        let ok_msg = format!("上传 {} -> {} 完成", local, remote);
                        let res = self.sftp.upload(s, &[local], &remote, None, None, false);
                        match res {
                            Ok(()) => AttemptOutcome { ok: true, exit_code: Some(0), stdout: ok_msg, stderr: String::new(), assertion_passed: None },
                            Err(e) => AttemptOutcome { ok: false, exit_code: None, stdout: String::new(), stderr: e, assertion_passed: None },
                        }
                    }
                    None => AttemptOutcome { ok: false, exit_code: None, stdout: String::new(), stderr: "sftp 步骤需要绑定目标服务器连接".into(), assertion_passed: None },
                }
            }
            StepType::LocalBuild => AttemptOutcome { ok: false, exit_code: None, stdout: String::new(), stderr: "local_build 步骤尚不支持，请改用 local_shell".into(), assertion_passed: None },
            StepType::Deploy => {
                let site_id = match &step.site_id {
                    Some(s) if !s.trim().is_empty() => s.clone(),
                    _ => {
                        return AttemptOutcome {
                            ok: false,
                            exit_code: None,
                            stdout: String::new(),
                            stderr: "部署步骤需要指定站点 ID".into(),
                            assertion_passed: None,
                        }
                    }
                };
                let data_dir = match self.app.path().app_data_dir() {
                    Ok(p) => p,
                    Err(e) => {
                        return AttemptOutcome {
                            ok: false,
                            exit_code: None,
                            stdout: String::new(),
                            stderr: format!("无法获取应用数据目录: {}", e),
                            assertion_passed: None,
                        }
                    }
                };
                // 静默进度回调：部署进度由 DeployService 内部落库 + 资源登记，
                // 自动化运行仅关心最终成功/失败（失败可触发步骤重试，保证连续性）。
                let on_progress: std::sync::Arc<dyn Fn(DeployProgress) + Send + Sync> =
                    std::sync::Arc::new(|_p| {});
                // 触发来源：自动化调度/启动触发的部署记为 scheduled，使部署历史真实反映「工作连续性」。
                let deploy_trigger = if trigger_type == "manual" { "manual" } else { "scheduled" };
                match DeployService::deploy(&self.db, &self.sftp, &site_id, &data_dir, deploy_trigger, on_progress) {
                    Ok(o) => AttemptOutcome {
                        ok: true,
                        exit_code: Some(0),
                        stdout: format!(
                            "部署完成 deployment_id={} 上传{}文件/{}字节",
                            o.deployment_id, o.uploaded_count, o.total_bytes
                        ),
                        stderr: String::new(),
                        assertion_passed: None,
                    },
                    Err(e) => AttemptOutcome {
                        ok: false,
                        exit_code: None,
                        stdout: String::new(),
                        stderr: e.to_string(),
                        assertion_passed: None,
                    },
                }
            }
            StepType::Http => {
                let url = step.http_url.clone().unwrap_or_default();
                let method = step.http_method.clone().unwrap_or_else(|| "GET".into());
                let timeout_secs = step.timeout_secs.unwrap_or(30);

                let result = tokio::time::timeout(
                    std::time::Duration::from_secs(timeout_secs),
                    async {
                        let client = reqwest::Client::builder()
                            .timeout(std::time::Duration::from_secs(timeout_secs))
                            .build()
                            .map_err(|e| e.to_string())?;

                        let mut req = match method.to_uppercase().as_str() {
                            "GET" => client.get(&url),
                            "POST" => client.post(&url),
                            "PUT" => client.put(&url),
                            "DELETE" => client.delete(&url),
                            "PATCH" => client.patch(&url),
                            "HEAD" => client.head(&url),
                            other => {
                                let m = reqwest::Method::from_bytes(other.as_bytes())
                                    .map_err(|e| format!("无效 HTTP 方法: {}", e))?;
                                client.request(m, &url)
                            }
                        };

                        // 添加请求头
                        if let Some(headers_json) = &step.http_headers {
                            if !headers_json.trim().is_empty() {
                                if let Ok(map) = serde_json::from_str::<std::collections::HashMap<String, String>>(headers_json) {
                                    let mut header_map = reqwest::header::HeaderMap::new();
                                    for (k, v) in map {
                                        if let (Ok(name), Ok(val)) = (
                                            reqwest::header::HeaderName::from_bytes(k.as_bytes()),
                                            reqwest::header::HeaderValue::from_str(&v),
                                        ) {
                                            header_map.insert(name, val);
                                        }
                                    }
                                    req = req.headers(header_map);
                                }
                            }
                        }

                        // 添加请求体
                        if let Some(body) = &step.http_body {
                            if !body.trim().is_empty() {
                                req = req.body(body.clone());
                            }
                        }

                        let resp = req.send().await.map_err(|e| e.to_string())?;
                        let status = resp.status().as_u16();
                        let text = resp.text().await.map_err(|e| e.to_string()).unwrap_or_default();

                        Ok::<_, String>((status, text))
                    },
                )
                .await;

                match result {
                    Ok(Ok((status, body))) => {
                        let ok = if let Some(expected) = step.expect_status_code {
                            status == expected
                        } else {
                            status >= 200 && status < 400
                        };
                        AttemptOutcome {
                            ok,
                            exit_code: Some(status as i32),
                            stdout: format!("HTTP {}\n{}", status, body),
                            stderr: if ok { String::new() } else { format!("HTTP 状态码 {} 不符合预期", status) },
                            assertion_passed: None,
                        }
                    }
                    Ok(Err(e)) => AttemptOutcome {
                        ok: false,
                        exit_code: None,
                        stdout: String::new(),
                        stderr: format!("HTTP 请求失败: {}", e),
                        assertion_passed: None,
                    },
                    Err(_) => AttemptOutcome {
                        ok: false,
                        exit_code: None,
                        stdout: String::new(),
                        stderr: format!("HTTP 请求超时 ({}s)", timeout_secs),
                        assertion_passed: None,
                    },
                }
            }
        }
    }
}

fn validate_step(step: &TaskStep) -> Result<()> {
    if step.name.trim().is_empty() {
        return Err(Error::Validation("步骤名称不能为空".into()));
    }
    match step.step_type {
        StepType::RemoteExec | StepType::LocalShell => {
            if step.command.as_deref().unwrap_or("").trim().is_empty() {
                return Err(Error::Validation(format!("步骤「{}」缺少命令", step.name)));
            }
        }
        StepType::SftpTransfer => {
            if step.local_path.as_deref().unwrap_or("").trim().is_empty()
                || step.remote_path.as_deref().unwrap_or("").trim().is_empty()
            {
                return Err(Error::Validation(format!("步骤「{}」缺少本地或远程路径", step.name)));
            }
        }
        StepType::Delay => {
            if step.seconds.unwrap_or(0) == 0 {
                return Err(Error::Validation(format!("步骤「{}」延时不能为 0", step.name)));
            }
        }
        StepType::LocalBuild => {}
        StepType::Deploy => {
            if step.site_id.as_deref().unwrap_or("").trim().is_empty() {
                return Err(Error::Validation(format!("步骤「{}」缺少部署站点", step.name)));
            }
        }
        StepType::Http => {
            if step.http_url.as_deref().unwrap_or("").trim().is_empty() {
                return Err(Error::Validation(format!("步骤「{}」缺少 URL", step.name)));
            }
        }
    }
    Ok(())
}

fn condition_allows(condition: Option<&StepCondition>, has_failed: bool) -> bool {
    match condition {
        None | Some(StepCondition::Always) => true,
        Some(StepCondition::OnSuccess) => !has_failed,
        Some(StepCondition::OnFail) => has_failed,
    }
}

fn blocked(command: &str, hit: &str) -> AttemptOutcome {
    AttemptOutcome {
        ok: false,
        exit_code: None,
        stdout: String::new(),
        stderr: format!("命令被安全策略拦截（{}）: {}", hit, command),
        assertion_passed: None,
    }
}

fn assert_step(step: &TaskStep, result: &RemoteExecResult) -> Option<bool> {
    let has_expect = step.expect_stdout.is_some()
        || step.expect_stderr.is_some()
        || step.expect_exit_code.is_some();
    if !has_expect {
        return None;
    }
    let mut passed = true;
    if let Some(exp) = step.expect_stdout.as_deref() {
        if !exp.is_empty() && !result.stdout.contains(exp) {
            passed = false;
        }
    }
    if let Some(exp) = step.expect_stderr.as_deref() {
        if !exp.is_empty() && !result.stderr.contains(exp) {
            passed = false;
        }
    }
    if let Some(code) = step.expect_exit_code {
        if result.exit_code != code {
            passed = false;
        }
    }
    Some(passed)
}

fn finish_with_assertions(result: RemoteExecResult, step: &TaskStep, command: &str) -> AttemptOutcome {
    let assertion_passed = assert_step(step, &result);
    let ok = result.success && assertion_passed.unwrap_or(true);
    let stderr = if ok {
        result.stderr
    } else if result.success {
        format!("断言未通过: {}", summarize_assert(step, &result))
    } else if result.stderr.is_empty() {
        format!("命令执行失败（exit {}）", result.exit_code)
    } else {
        result.stderr
    };
    let _ = command;
    AttemptOutcome {
        ok,
        exit_code: Some(result.exit_code),
        stdout: result.stdout,
        stderr,
        assertion_passed,
    }
}

async fn run_local_shell(command: &str, timeout: u64) -> RemoteExecResult {
    let start = std::time::Instant::now();
    let is_windows = cfg!(target_os = "windows");
    let mut cmd = tokio::process::Command::new(if is_windows { "cmd" } else { "sh" });
    if is_windows {
        cmd.arg("/C").arg(command);
    } else {
        cmd.arg("-c").arg(command);
    }
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            return RemoteExecResult {
                success: false,
                exit_code: -1,
                stdout: String::new(),
                stderr: e.to_string(),
                merged: false,
                duration_ms: 0,
                channel: "local_shell".into(),
                truncated: false,
            }
        }
    };
    let mut stdout = String::new();
    let mut stderr = String::new();
    if let Some(mut o) = child.stdout.take() {
        let _ = AsyncReadExt::read_to_string(&mut o, &mut stdout).await;
    }
    if let Some(mut e) = child.stderr.take() {
        let _ = AsyncReadExt::read_to_string(&mut e, &mut stderr).await;
    }
    let status = match tokio::time::timeout(Duration::from_secs(timeout), child.wait()).await {
        Ok(res) => res.ok(),
        Err(_) => {
            let _ = child.kill().await;
            None
        }
    };
    let exit_code = status.and_then(|s| s.code()).unwrap_or(-1);
    let duration_ms = start.elapsed().as_millis() as u64;
    let truncated = (stdout.len() + stderr.len()) > IO_HEAD;
    RemoteExecResult {
        success: exit_code == 0,
        exit_code,
        stdout,
        stderr,
        merged: true,
        duration_ms,
        channel: "local_shell".into(),
        truncated,
    }
}

fn summarize(e: &str) -> String {
    let t = e.trim();
    if t.len() <= 120 { t.to_string() } else { format!("{}…", &t[..120]) }
}

fn summarize_assert(step: &TaskStep, result: &RemoteExecResult) -> String {
    let mut parts: Vec<String> = Vec::new();
    if let Some(e) = step.expect_stdout.as_deref() {
        if !e.is_empty() && !result.stdout.contains(e) { parts.push(format!("stdout 未包含「{}」", e)); }
    }
    if let Some(e) = step.expect_stderr.as_deref() {
        if !e.is_empty() && !result.stderr.contains(e) { parts.push(format!("stderr 未包含「{}」", e)); }
    }
    if let Some(code) = step.expect_exit_code {
        if result.exit_code != code { parts.push(format!("期望退出码 {} 实际 {}", code, result.exit_code)); }
    }
    if parts.is_empty() { "断言失败".to_string() } else { parts.join("；") }
}

fn resolve_ssh(db: &Database, connection_id: &str) -> Result<SshConnectionInfo> {
    let conn = ConnectionRepo::get_by_id(db, connection_id)?
        .ok_or_else(|| Error::Validation(format!("服务器连接不存在: {}", connection_id)))?;
    serde_json::from_str(&conn.config_json).map_err(|e| Error::Internal(format!("连接配置解析失败: {}", e)))
}

/// 连接显示名（多服务器执行时用于步骤标签前缀）。
fn connection_name(db: &Database, connection_id: &str) -> String {
    ConnectionRepo::get_by_id(db, connection_id)
        .ok()
        .flatten()
        .map(|c| c.name)
        .unwrap_or_else(|| server_fallback_name(db, connection_id))
}

/// 连接名不可得时的兜底显示（取 id 前 8 位）。
fn server_fallback_name(_db: &Database, connection_id: &str) -> String {
    let short: String = connection_id.chars().take(8).collect();
    if short.is_empty() { "服务器".to_string() } else { format!("服务器 {}", short) }
}

/// 空字符串转 None（无连接时 execute_step_once 需要 None 而非 Some("")）。
fn non_empty(s: &str) -> Option<&str> {
    if s.is_empty() { None } else { Some(s) }
}

fn fmt_timestamp(ms: i64) -> String {
    use chrono::TimeZone;
    chrono::Local
        .timestamp_millis_opt(ms)
        .single()
        .map(|t| t.format("%Y-%m-%d %H:%M:%S").to_string())
        .unwrap_or_else(|| ms.to_string())
}

// ---------------- 内置任务模板 ----------------

fn builtin_tasks(now: i64) -> Vec<AutomationTask> {
    vec![
        // 1. 每日 PostgreSQL 备份
        AutomationTask {
            id: "builtin-task-pg-backup".into(),
            name: "每日 PostgreSQL 备份".into(),
            description: "每天凌晨自动备份 PostgreSQL 数据库到备份目录，保留最近 7 天。".into(),
            connection_ids: vec![],
            steps: vec![
                TaskStep {
                    id: "step-1".into(),
                    name: "创建备份目录".into(),
                    step_type: StepType::RemoteExec,
                    condition: None,
                    continue_on_fail: false,
                    retry: Some(RetryConfig { max_attempts: 2, backoff_secs: 5 }),
                    timeout_secs: Some(30),
                    command: Some("mkdir -p /opt/webcraft/backup/postgres".into()),
                    local_path: None,
                    remote_path: None,
                    direction: None,
                    seconds: None,
                    expect_stdout: None,
                    expect_stderr: None,
                    expect_exit_code: Some(0),
                    site_id: None,
                    http_url: None,
                    http_method: None,
                    http_body: None,
                    http_headers: None,
                    expect_status_code: None,
                },
                TaskStep {
                    id: "step-2".into(),
                    name: "执行数据库备份".into(),
                    step_type: StepType::RemoteExec,
                    condition: None,
                    continue_on_fail: false,
                    retry: Some(RetryConfig { max_attempts: 2, backoff_secs: 10 }),
                    timeout_secs: Some(600),
                    command: Some("su - postgres -c \"pg_dump -U postgres -F c -f /opt/webcraft/backup/postgres/backup_$(date +%Y%m%d_%H%M%S).dump postgres\" && find /opt/webcraft/backup/postgres -name 'backup_*.dump' -mtime +7 -delete".into()),
                    local_path: None,
                    remote_path: None,
                    direction: None,
                    seconds: None,
                    expect_stdout: None,
                    expect_stderr: None,
                    expect_exit_code: Some(0),
                    site_id: None,
                    http_url: None,
                    http_method: None,
                    http_body: None,
                    http_headers: None,
                    expect_status_code: None,
                },
            ],
            retry: None,
            notify: true,
            run_on_startup: false,
            enabled: false,
            last_run_at: None,
            created_at: now,
            updated_at: now,
            schedule_kind: "daily".into(),
            schedule_interval_secs: 0,
            schedule_at_minute: 180, // 凌晨 3:00
            next_run_at: None,
            last_run_status: None,
        },
        // 2. 服务器资源巡检
        AutomationTask {
            id: "builtin-task-server-check".into(),
            name: "服务器资源巡检".into(),
            description: "每小时检查磁盘、内存、CPU 负载，及时发现资源不足问题。".into(),
            connection_ids: vec![],
            steps: vec![
                TaskStep {
                    id: "step-1".into(),
                    name: "磁盘空间检查".into(),
                    step_type: StepType::RemoteExec,
                    condition: None,
                    continue_on_fail: true,
                    retry: None,
                    timeout_secs: Some(15),
                    command: Some("df -h / /opt /var 2>/dev/null | awk 'NR==1 || /^\\// {print $0}'".into()),
                    local_path: None,
                    remote_path: None,
                    direction: None,
                    seconds: None,
                    expect_stdout: None,
                    expect_stderr: None,
                    expect_exit_code: Some(0),
                    site_id: None,
                    http_url: None,
                    http_method: None,
                    http_body: None,
                    http_headers: None,
                    expect_status_code: None,
                },
                TaskStep {
                    id: "step-2".into(),
                    name: "内存使用".into(),
                    step_type: StepType::RemoteExec,
                    condition: None,
                    continue_on_fail: true,
                    retry: None,
                    timeout_secs: Some(15),
                    command: Some("free -h | awk 'NR==1 || /^Mem:/ {print $0}'".into()),
                    local_path: None,
                    remote_path: None,
                    direction: None,
                    seconds: None,
                    expect_stdout: None,
                    expect_stderr: None,
                    expect_exit_code: Some(0),
                    site_id: None,
                    http_url: None,
                    http_method: None,
                    http_body: None,
                    http_headers: None,
                    expect_status_code: None,
                },
                TaskStep {
                    id: "step-3".into(),
                    name: "CPU 负载".into(),
                    step_type: StepType::RemoteExec,
                    condition: None,
                    continue_on_fail: true,
                    retry: None,
                    timeout_secs: Some(15),
                    command: Some("uptime && nproc 2>/dev/null || echo 'cores: unknown'".into()),
                    local_path: None,
                    remote_path: None,
                    direction: None,
                    seconds: None,
                    expect_stdout: None,
                    expect_stderr: None,
                    expect_exit_code: Some(0),
                    site_id: None,
                    http_url: None,
                    http_method: None,
                    http_body: None,
                    http_headers: None,
                    expect_status_code: None,
                },
            ],
            retry: None,
            notify: false,
            run_on_startup: false,
            enabled: false,
            last_run_at: None,
            created_at: now,
            updated_at: now,
            schedule_kind: "hourly".into(),
            schedule_interval_secs: 0,
            schedule_at_minute: 0,
            next_run_at: None,
            last_run_status: None,
        },
        // 3. Nginx 平滑重启
        AutomationTask {
            id: "builtin-task-nginx-reload".into(),
            name: "Nginx 平滑重启".into(),
            description: "先测试配置，再平滑重载 Nginx，确保配置无误后生效。".into(),
            connection_ids: vec![],
            steps: vec![
                TaskStep {
                    id: "step-1".into(),
                    name: "测试 Nginx 配置".into(),
                    step_type: StepType::RemoteExec,
                    condition: None,
                    continue_on_fail: false,
                    retry: None,
                    timeout_secs: Some(30),
                    command: Some("nginx -t 2>&1".into()),
                    local_path: None,
                    remote_path: None,
                    direction: None,
                    seconds: None,
                    expect_stdout: None,
                    expect_stderr: None,
                    expect_exit_code: Some(0),
                    site_id: None,
                    http_url: None,
                    http_method: None,
                    http_body: None,
                    http_headers: None,
                    expect_status_code: None,
                },
                TaskStep {
                    id: "step-2".into(),
                    name: "平滑重载 Nginx".into(),
                    step_type: StepType::RemoteExec,
                    condition: None,
                    continue_on_fail: false,
                    retry: None,
                    timeout_secs: Some(30),
                    command: Some("nginx -s reload 2>&1 || systemctl reload nginx 2>&1".into()),
                    local_path: None,
                    remote_path: None,
                    direction: None,
                    seconds: None,
                    expect_stdout: None,
                    expect_stderr: None,
                    expect_exit_code: Some(0),
                    site_id: None,
                    http_url: None,
                    http_method: None,
                    http_body: None,
                    http_headers: None,
                    expect_status_code: None,
                },
            ],
            retry: None,
            notify: false,
            run_on_startup: false,
            enabled: false,
            last_run_at: None,
            created_at: now,
            updated_at: now,
            schedule_kind: "off".into(),
            schedule_interval_secs: 0,
            schedule_at_minute: 0,
            next_run_at: None,
            last_run_status: None,
        },
        // 4. 网站健康检查
        AutomationTask {
            id: "builtin-task-site-health".into(),
            name: "网站健康检查".into(),
            description: "每天检查 Nginx 状态、SSL 证书到期时间、磁盘空间。".into(),
            connection_ids: vec![],
            steps: vec![
                TaskStep {
                    id: "step-1".into(),
                    name: "Nginx 服务状态".into(),
                    step_type: StepType::RemoteExec,
                    condition: None,
                    continue_on_fail: true,
                    retry: None,
                    timeout_secs: Some(15),
                    command: Some("systemctl is-active nginx 2>/dev/null && echo '运行中' || (nginx -v 2>&1 && echo '进程运行中') || echo '未运行'".into()),
                    local_path: None,
                    remote_path: None,
                    direction: None,
                    seconds: None,
                    expect_stdout: None,
                    expect_stderr: None,
                    expect_exit_code: None,
                    site_id: None,
                    http_url: None,
                    http_method: None,
                    http_body: None,
                    http_headers: None,
                    expect_status_code: None,
                },
                TaskStep {
                    id: "step-2".into(),
                    name: "SSL 证书到期检查".into(),
                    step_type: StepType::RemoteExec,
                    condition: None,
                    continue_on_fail: true,
                    retry: None,
                    timeout_secs: Some(30),
                    command: Some("for f in /etc/letsencrypt/live/*/fullchain.pem; do if [ -f \"$f\" ]; then domain=$(dirname \"$f\" | xargs basename); end_date=$(openssl x509 -in \"$f\" -noout -enddate | cut -d= -f2); days=$(( ( $(date -d \"$end_date\" +%s 2>/dev/null || echo 0) - $(date +%s) ) / 86400 )); echo \"$domain: ${days}天\"; fi; done 2>/dev/null | head -10".into()),
                    local_path: None,
                    remote_path: None,
                    direction: None,
                    seconds: None,
                    expect_stdout: None,
                    expect_stderr: None,
                    expect_exit_code: None,
                    site_id: None,
                    http_url: None,
                    http_method: None,
                    http_body: None,
                    http_headers: None,
                    expect_status_code: None,
                },
                TaskStep {
                    id: "step-3".into(),
                    name: "根分区磁盘".into(),
                    step_type: StepType::RemoteExec,
                    condition: None,
                    continue_on_fail: true,
                    retry: None,
                    timeout_secs: Some(15),
                    command: Some("df -h / | awk 'NR==2 {print \"已用: \"$5\" (\"$3\"/\"$2\")\"}'".into()),
                    local_path: None,
                    remote_path: None,
                    direction: None,
                    seconds: None,
                    expect_stdout: None,
                    expect_stderr: None,
                    expect_exit_code: Some(0),
                    site_id: None,
                    http_url: None,
                    http_method: None,
                    http_body: None,
                    http_headers: None,
                    expect_status_code: None,
                },
            ],
            retry: None,
            notify: true,
            run_on_startup: false,
            enabled: false,
            last_run_at: None,
            created_at: now,
            updated_at: now,
            schedule_kind: "daily".into(),
            schedule_interval_secs: 0,
            schedule_at_minute: 540, // 早上 9:00
            next_run_at: None,
            last_run_status: None,
        },
        // 5. 日志清理
        AutomationTask {
            id: "builtin-task-log-cleanup".into(),
            name: "日志清理".into(),
            description: "清理 Nginx 过期日志和系统临时文件，释放磁盘空间。".into(),
            connection_ids: vec![],
            steps: vec![
                TaskStep {
                    id: "step-1".into(),
                    name: "清理 Nginx 旧日志".into(),
                    step_type: StepType::RemoteExec,
                    condition: None,
                    continue_on_fail: true,
                    retry: None,
                    timeout_secs: Some(120),
                    command: Some("find /var/log/nginx -name '*.gz' -mtime +30 -delete 2>/dev/null; find /var/log/nginx -name '*[0-9]' -mtime +7 -delete 2>/dev/null; echo 'Nginx 日志清理完成'".into()),
                    local_path: None,
                    remote_path: None,
                    direction: None,
                    seconds: None,
                    expect_stdout: None,
                    expect_stderr: None,
                    expect_exit_code: None,
                    site_id: None,
                    http_url: None,
                    http_method: None,
                    http_body: None,
                    http_headers: None,
                    expect_status_code: None,
                },
                TaskStep {
                    id: "step-2".into(),
                    name: "清理系统临时文件".into(),
                    step_type: StepType::RemoteExec,
                    condition: None,
                    continue_on_fail: true,
                    retry: None,
                    timeout_secs: Some(60),
                    command: Some("find /tmp -type f -atime +7 -delete 2>/dev/null; find /var/tmp -type f -atime +14 -delete 2>/dev/null; echo '临时文件清理完成'".into()),
                    local_path: None,
                    remote_path: None,
                    direction: None,
                    seconds: None,
                    expect_stdout: None,
                    expect_stderr: None,
                    expect_exit_code: None,
                    site_id: None,
                    http_url: None,
                    http_method: None,
                    http_body: None,
                    http_headers: None,
                    expect_status_code: None,
                },
            ],
            retry: None,
            notify: false,
            run_on_startup: false,
            enabled: false,
            last_run_at: None,
            created_at: now,
            updated_at: now,
            schedule_kind: "daily".into(),
            schedule_interval_secs: 0,
            schedule_at_minute: 240, // 凌晨 4:00
            next_run_at: None,
            last_run_status: None,
        },
        // 6. 部署前环境检查
        AutomationTask {
            id: "builtin-task-pre-deploy-check".into(),
            name: "部署前环境检查".into(),
            description: "部署站点前检查 Nginx 状态、磁盘空间和端口占用，确保部署顺利进行。".into(),
            connection_ids: vec![],
            steps: vec![
                TaskStep {
                    id: "step-1".into(),
                    name: "Nginx 配置测试".into(),
                    step_type: StepType::RemoteExec,
                    condition: None,
                    continue_on_fail: false,
                    retry: None,
                    timeout_secs: Some(20),
                    command: Some("nginx -t 2>&1".into()),
                    local_path: None,
                    remote_path: None,
                    direction: None,
                    seconds: None,
                    expect_stdout: None,
                    expect_stderr: None,
                    expect_exit_code: Some(0),
                    site_id: None,
                    http_url: None,
                    http_method: None,
                    http_body: None,
                    http_headers: None,
                    expect_status_code: None,
                },
                TaskStep {
                    id: "step-2".into(),
                    name: "磁盘空间检查".into(),
                    step_type: StepType::RemoteExec,
                    condition: None,
                    continue_on_fail: false,
                    retry: None,
                    timeout_secs: Some(15),
                    command: Some("avail=$(df -m /opt | awk 'NR==2 {print $4}'); echo \"可用: ${avail}MB\"; [ \"$avail\" -gt 500 ] && echo '空间充足' || (echo '空间不足 500MB' && exit 1)".into()),
                    local_path: None,
                    remote_path: None,
                    direction: None,
                    seconds: None,
                    expect_stdout: None,
                    expect_stderr: None,
                    expect_exit_code: Some(0),
                    site_id: None,
                    http_url: None,
                    http_method: None,
                    http_body: None,
                    http_headers: None,
                    expect_status_code: None,
                },
                TaskStep {
                    id: "step-3".into(),
                    name: "端口占用检查".into(),
                    step_type: StepType::RemoteExec,
                    condition: None,
                    continue_on_fail: true,
                    retry: None,
                    timeout_secs: Some(15),
                    command: Some("(ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null) | grep -E ':(80|443)\\s' || echo '80/443 端口未监听'".into()),
                    local_path: None,
                    remote_path: None,
                    direction: None,
                    seconds: None,
                    expect_stdout: None,
                    expect_stderr: None,
                    expect_exit_code: None,
                    site_id: None,
                    http_url: None,
                    http_method: None,
                    http_body: None,
                    http_headers: None,
                    expect_status_code: None,
                },
            ],
            retry: None,
            notify: false,
            run_on_startup: false,
            enabled: false,
            last_run_at: None,
            created_at: now,
            updated_at: now,
            schedule_kind: "off".into(),
            schedule_interval_secs: 0,
            schedule_at_minute: 0,
            next_run_at: None,
            last_run_status: None,
        },
    ]
}