use tauri::Emitter;

use crate::plugins::ai_agent::engine::{AgentStatusEvent, ToolCallEvent};

/// 构建流式文本分片回调：推送 agent-chunk，并识别压缩提示推送 agent-compaction。
pub fn make_chunk_emitter(
    app_handle: tauri::AppHandle,
    conv_id: String,
    counter: std::sync::Arc<std::sync::atomic::AtomicUsize>,
) -> impl Fn(String) + Send + Sync + 'static {
    move |chunk: String| {
        let count = counter.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        if count == 0 {
            tracing::info!("[run_agent] first chunk received, conv_id={}, chunk_preview={:?}",
                conv_id, crate::plugins::ai_agent::engine::truncate_bytes(&chunk, 60));
        }
        if chunk.starts_with("[Auto-compacting") || chunk.starts_with("[Compacted:") || chunk.starts_with("[Compaction") || chunk.starts_with("[Context too long") {
            if let Err(e) = app_handle.emit("agent-compaction", serde_json::json!({
                "conversationId": conv_id.clone(),
                "message": chunk.trim(),
            })) {
                tracing::warn!("[run_agent] failed to emit agent-compaction: {}", e);
            }
        }
        if let Err(e) = app_handle.emit("agent-chunk", serde_json::json!({
            "conversationId": conv_id.clone(),
            "chunk": chunk,
        })) {
            tracing::warn!("[run_agent] failed to emit agent-chunk: {}", e);
        }
    }
}

/// 构建工具调用事件回调。
pub fn make_tool_emitter(
    app_handle: tauri::AppHandle,
    conv_id: String,
) -> impl Fn(ToolCallEvent) + Send + Sync + 'static {
    move |tool_event: ToolCallEvent| {
        if let Err(e) = app_handle.emit("agent-tool-call", serde_json::json!({
            "conversationId": conv_id,
            "toolCall": tool_event,
        })) {
            tracing::warn!("[run_agent] failed to emit agent-tool-call: {}", e);
        }
    }
}

/// 构建运行状态事件回调。
pub fn make_status_emitter(
    app_handle: tauri::AppHandle,
    conv_id: String,
) -> impl Fn(AgentStatusEvent) + Send + Sync + 'static {
    move |status_event: AgentStatusEvent| {
        if let Err(e) = app_handle.emit("agent-status", serde_json::json!({
            "conversationId": conv_id,
            "status": status_event.status,
            "iteration": status_event.iteration,
            "maxIterations": status_event.max_iterations,
            "detail": status_event.detail,
            "streamStats": status_event.stream_stats.map(|s| serde_json::json!({
                "charsTotal": s.chars_total,
                "tokensEstimated": s.tokens_estimated,
                "charsPerSec": s.chars_per_sec,
                "tokensPerSec": s.tokens_per_sec,
                "elapsedMs": s.elapsed_ms,
            })),
            "contextUsage": status_event.context_usage.map(|c| serde_json::json!({
                "tokensUsed": c.tokens_used,
                "contextWindow": c.context_window,
                "usageRatio": c.usage_ratio,
            })),
        })) {
            tracing::warn!("[run_agent] failed to emit agent-status: {}", e);
        }
    }
}
