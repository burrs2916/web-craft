use std::sync::Arc;

use serde::Deserialize;
use tauri::State;

use crate::app::automation_service::AutomationService;
use crate::core::automation::{AutomationTask, TaskRun, TaskRunDetail, TaskRunStats};
use crate::core::error::Result;

/// 在阻塞线程池上执行 DB 工作。
/// 同步命令默认跑在主线程，一旦 SQLite I/O 慢（外接盘）或与
/// 调度器/运行中的任务争抢 `Mutex<Connection>`，整个 UI 事件循环
/// 会被冻结——表现为点击「任务」tab 后窗口卡死。所有 automation
/// 命令都必须经由这里执行。
async fn run_db<T, F>(f: F) -> std::result::Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn automation_list_tasks(
    auto: State<'_, Arc<AutomationService>>,
) -> std::result::Result<Vec<AutomationTask>, String> {
    let auto = auto.inner().clone();
    run_db(move || auto.list_tasks()).await
}

#[tauri::command]
pub async fn automation_get_task(
    id: String,
    auto: State<'_, Arc<AutomationService>>,
) -> std::result::Result<Option<AutomationTask>, String> {
    let auto = auto.inner().clone();
    run_db(move || auto.get_task(&id)).await
}

#[tauri::command]
pub async fn automation_save_task(
    task: AutomationTask,
    auto: State<'_, Arc<AutomationService>>,
) -> std::result::Result<AutomationTask, String> {
    let auto = auto.inner().clone();
    run_db(move || auto.save_task(task)).await
}

#[tauri::command]
pub async fn automation_delete_task(
    id: String,
    auto: State<'_, Arc<AutomationService>>,
) -> std::result::Result<(), String> {
    let auto = auto.inner().clone();
    run_db(move || auto.delete_task(&id)).await
}

#[tauri::command]
pub async fn automation_toggle_task(
    id: String,
    enabled: bool,
    auto: State<'_, Arc<AutomationService>>,
) -> std::result::Result<(), String> {
    let auto = auto.inner().clone();
    run_db(move || auto.toggle_task(&id, enabled)).await
}

/// Start an async run; returns immediately with the `run_id`.
#[tauri::command]
pub async fn automation_run_task(
    id: String,
    auto: State<'_, Arc<AutomationService>>,
) -> std::result::Result<String, String> {
    let auto = auto.inner().clone();
    run_db(move || auto.run_task(&id, "manual")).await
}

#[tauri::command]
pub async fn automation_cancel_run(
    run_id: String,
    auto: State<'_, Arc<AutomationService>>,
) -> std::result::Result<bool, String> {
    let auto = auto.inner().clone();
    run_db(move || Ok(auto.cancel_run(&run_id))).await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListRunsPayload {
    pub task_id: Option<String>,
    pub status: Option<String>,
    pub trigger: Option<String>,
    pub limit: Option<usize>,
    pub offset: Option<usize>,
}

#[tauri::command]
pub async fn automation_list_runs(
    payload: ListRunsPayload,
    auto: State<'_, Arc<AutomationService>>,
) -> std::result::Result<Vec<TaskRun>, String> {
    let auto = auto.inner().clone();
    run_db(move || {
        auto.list_runs(
            payload.task_id.as_deref(),
            payload.status.as_deref(),
            payload.trigger.as_deref(),
            payload.limit.unwrap_or(50),
            payload.offset.unwrap_or(0),
        )
    })
    .await
}

#[tauri::command]
pub async fn automation_get_stats(
    payload: ListRunsPayload,
    auto: State<'_, Arc<AutomationService>>,
) -> std::result::Result<TaskRunStats, String> {
    let auto = auto.inner().clone();
    run_db(move || auto.get_stats(payload.task_id.as_deref())).await
}

#[tauri::command]
pub async fn automation_get_run(
    run_id: String,
    auto: State<'_, Arc<AutomationService>>,
) -> std::result::Result<Option<TaskRunDetail>, String> {
    let auto = auto.inner().clone();
    run_db(move || {
        auto.get_run(&run_id)
            .map(|opt| opt.map(|(run, steps)| TaskRunDetail { run, steps }))
    })
    .await
}

/// 导出一次运行的报告（format: "markdown" | "json"），写入本地 path。
#[tauri::command]
pub async fn automation_export_run(
    run_id: String,
    format: String,
    path: String,
    auto: State<'_, Arc<AutomationService>>,
) -> std::result::Result<usize, String> {
    let auto = auto.inner().clone();
    run_db(move || auto.export_run(&run_id, &format, &path)).await
}

/// 删除一条历史运行记录。
#[tauri::command]
pub async fn automation_delete_run(
    run_id: String,
    auto: State<'_, Arc<AutomationService>>,
) -> std::result::Result<usize, String> {
    let auto = auto.inner().clone();
    run_db(move || auto.delete_run(&run_id)).await
}

/// 基于已有 run 重新跑一次同任务。返回新 run_id。
#[tauri::command]
pub async fn automation_rerun(
    run_id: String,
    auto: State<'_, Arc<AutomationService>>,
) -> std::result::Result<String, String> {
    let auto = auto.inner().clone();
    run_db(move || auto.rerun(&run_id)).await
}
