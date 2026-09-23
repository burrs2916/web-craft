use serde::Deserialize;

/// 前端日志条目（与 logger.ts 的 LogEntry 接口对应）
#[derive(Deserialize)]
pub struct LogEntry {
    pub level: String,
    pub module: String,
    pub message: String,
    /// 附加数据的 JSON 字符串（前端已序列化）
    pub data: Option<String>,
    pub timestamp: Option<u64>,
}

/// 批量写入前端日志，减少逐条 IPC 调用的开销。
#[tauri::command]
pub fn write_log_batch(entries: Vec<LogEntry>) {
    for entry in entries {
        let msg = match &entry.data {
            Some(d) if !d.is_empty() => format!("[Frontend:{}] {} {}", entry.module, entry.message, d),
            _ => format!("[Frontend:{}] {}", entry.module, entry.message),
        };
        match entry.level.as_str() {
            "error" => tracing::error!("{}", msg),
            "warn" => tracing::warn!("{}", msg),
            "info" => tracing::info!("{}", msg),
            _ => tracing::debug!("{}", msg),
        }
    }
}

/// 返回日志目录路径，供前端展示"打开日志文件夹"等功能。
#[tauri::command]
pub fn get_log_dir_path() -> Option<String> {
    crate::infra::logging::get_log_dir().map(|p| p.to_string_lossy().to_string())
}
