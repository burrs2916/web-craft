use std::sync::Arc;

use crate::app::agent_service::AgentService;
use crate::infra::storage::agent_repo::AiMessageRow;
use crate::plugins::ai_agent::engine::PersistMessage;
use crate::plugins::ai_agent::provider::ChatMessage;

/// 计算历史消息指纹（role + content），用于最终补写时跳过已存在的消息。
pub fn message_fingerprints(history: &[ChatMessage]) -> std::collections::HashSet<u64> {
    history.iter()
        .filter(|m| m.role == "assistant" || m.role == "tool")
        .map(|m| {
            use std::hash::{Hash, Hasher};
            let mut hasher = std::collections::hash_map::DefaultHasher::new();
            m.role.hash(&mut hasher);
            m.content.hash(&mut hasher);
            hasher.finish()
        })
        .collect()
}

/// 构建增量消息持久化回调。
/// 返回 (persister, 已持久化的消息 id 列表, 本次运行的 assistant 消息 id 时间戳)。
pub fn create_message_persister(
    service: Arc<AgentService>,
    conv_id: String,
) -> (
    Arc<dyn Fn(PersistMessage) + Send + Sync>,
    Arc<std::sync::Mutex<Vec<String>>>,
    i64,
) {
    let persisted_ids: Arc<std::sync::Mutex<Vec<String>>> = Arc::new(std::sync::Mutex::new(Vec::new()));
    let persisted_ids_clone = persisted_ids.clone();
    let run_ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;
    let asst_counter: Arc<std::sync::Mutex<u32>> = Arc::new(std::sync::Mutex::new(0));
    let tool_counter: Arc<std::sync::Mutex<u32>> = Arc::new(std::sync::Mutex::new(0));

    let persister: Arc<dyn Fn(PersistMessage) + Send + Sync> = Arc::new(move |pm: PersistMessage| {
        if pm.role == "system_compaction" {
            if let Err(e) = service.update_compaction_summary(&conv_id, &pm.content) {
                tracing::warn!("[run_agent] persister: failed to update compaction summary: {}", e);
            }
            return;
        }
        let msg_id = if pm.role == "tool" {
            let tc_id = pm.tool_call_id.as_deref().filter(|s| !s.is_empty());
            if let Some(id) = tc_id {
                format!("tool-{}-{}", conv_id, id)
            } else {
                let counter = match tool_counter.lock() {
                    Ok(mut guard) => {
                        let c = *guard;
                        *guard += 1;
                        c
                    }
                    Err(_) => return,
                };
                tracing::warn!("[run_agent] persister: tool_call_id is empty for tool message, using counter={}", counter);
                format!("tool-{}-auto-{}", conv_id, counter)
            }
        } else {
            let counter = match asst_counter.lock() {
                Ok(mut guard) => {
                    let c = *guard;
                    *guard += 1;
                    c
                }
                Err(_) => return,
            };
            let id = format!("asst-{}-{}-{}", conv_id, run_ts, counter);
            id
        };
        let tool_calls_str = pm.tool_calls.as_ref()
            .map(|tc| serde_json::to_string(tc).unwrap_or_default())
            .unwrap_or_default();
        let msg_created_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;
        let id_for_track = msg_id.clone();
        match service.save_message(AiMessageRow {
            id: msg_id,
            conversation_id: conv_id.clone(),
            role: pm.role.clone(),
            content: pm.content.clone(),
            tool_calls: tool_calls_str,
            is_error: if pm.is_error { 1 } else { 0 },
            created_at: msg_created_at,
        }) {
            Ok(()) => {
                tracing::info!("[run_agent] persister: saved message id={}, role={}, conv_id={}", id_for_track, pm.role, conv_id);
                if let Ok(mut ids) = persisted_ids_clone.lock() {
                    ids.push(id_for_track);
                }
            }
            Err(e) => {
                tracing::error!("[run_agent] persister: FAILED to save message id={}, role={}, conv_id={}, error={}", id_for_track, pm.role, conv_id, e);
            }
        }
    });

    (persister, persisted_ids, run_ts)
}

/// 最终补写：把增量持久化过程中遗漏的消息写库。
pub fn final_sweep_persist(
    service: &AgentService,
    conv_id: &str,
    messages: &[ChatMessage],
    old_fingerprints: &std::collections::HashSet<u64>,
    already_persisted: &[String],
    run_ts: i64,
) {
    // Counter that mirrors the incremental persister's counter.
    // The incremental persister starts at 0 and increments per NEW assistant message.
    // The final sweep must generate IDs that match the ones already saved,
    // so the already_persisted check can correctly skip them.
    let mut final_sweep_asst_idx: u32 = 0;
    let mut final_sweep_tool_idx: u32 = 0;
    for msg in messages {
        if msg.role == "assistant" || msg.role == "tool" {
            {
                use std::hash::{Hash, Hasher};
                let mut hasher = std::collections::hash_map::DefaultHasher::new();
                msg.role.hash(&mut hasher);
                msg.content.hash(&mut hasher);
                let fingerprint = hasher.finish();
                if old_fingerprints.contains(&fingerprint) {
                    continue;
                }
            }
            let expected_id = if msg.role == "tool" {
                let tc_id = msg.tool_call_id.as_deref().filter(|s| !s.is_empty());
                if let Some(id) = tc_id {
                    format!("tool-{}-{}", conv_id, id)
                } else {
                    let idx = final_sweep_tool_idx;
                    final_sweep_tool_idx += 1;
                    format!("tool-{}-auto-{}", conv_id, idx)
                }
            } else {
                // Use the same counter scheme as the incremental persister:
                // only count NEW assistant messages (history ones are already
                // filtered out by the fingerprint check above).
                let idx = final_sweep_asst_idx;
                final_sweep_asst_idx += 1;
                format!("asst-{}-{}-{}", conv_id, run_ts, idx)
            };
            if already_persisted.contains(&expected_id) {
                continue;
            }
            let msg_ts = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as i64;
            let tool_calls_str = msg.tool_calls.as_ref()
                .map(|tc| serde_json::to_string(tc).unwrap_or_default())
                .unwrap_or_default();
            let id_for_log = expected_id.clone();
            match service.save_message(AiMessageRow {
                id: expected_id,
                conversation_id: conv_id.to_string(),
                role: msg.role.clone(),
                content: msg.content.clone(),
                tool_calls: tool_calls_str,
                is_error: 0,
                created_at: msg_ts,
            }) {
                Ok(()) => {
                    tracing::info!("[run_agent] final_sweep: saved message id={}, role={}", id_for_log, msg.role);
                }
                Err(e) => {
                    tracing::error!("[run_agent] final_sweep: FAILED to save message id={}, role={}, error={}", id_for_log, msg.role, e);
                }
            }
        }
    }
}
