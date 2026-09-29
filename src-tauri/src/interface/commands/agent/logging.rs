#[tauri::command]
pub fn write_frontend_log(level: String, tag: String, message: String) {
    match level.as_str() {
        "error" => tracing::error!("[Frontend:{}] {}", tag, message),
        "warn" => tracing::warn!("[Frontend:{}] {}", tag, message),
        "info" => tracing::info!("[Frontend:{}] {}", tag, message),
        _ => tracing::debug!("[Frontend:{}] {}", tag, message),
    }
}

/// 前端写入 env-ops 调试日志（环境检测 & AI 修复全链路追踪）。
/// 与后端 env_ops 日志共享同一 scope 和格式，便于端到端排查。
#[tauri::command]
pub fn append_env_ops_log(
    level: String,
    run_id: String,
    phase: String,
    event: String,
    detail: String,
) {
    let normalized = match level.to_ascii_uppercase().as_str() {
        "ERROR" => "ERROR",
        "WARN" => "WARN",
        "DEBUG" => "DEBUG",
        _ => "INFO",
    };
    crate::infra::logging::debug_log::env_ops_frontend(normalized, &run_id, &phase, &event, &detail);
}
