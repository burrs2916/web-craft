use std::sync::Arc;

use tauri::Emitter;

use crate::infra::storage::database::Database;
use crate::plugins::ai_agent::engine::PermissionRequesterFn;

use super::super::PENDING_PERMISSIONS;

/// 构建权限请求回调：持久化请求、推送到前端、等待用户响应（60s 超时）。
pub fn build_permission_requester(
    conv_id: String,
    agent_id: String,
    app_handle: tauri::AppHandle,
    db: Arc<Database>,
) -> PermissionRequesterFn {
    Arc::new(
        move |req: crate::plugins::ai_agent::permission::PermissionRequest| {
            let mut req_with_id = req;
            req_with_id.conversation_id = conv_id.clone();
            let handle = app_handle.clone();
            let agent_id = agent_id.clone();
            let db = db.clone();

            Box::pin(async move {
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_secs() as i64)
                    .unwrap_or(0);

                // 持久化权限请求到数据库
                let req_id = req_with_id.conversation_id.clone();
                let args_json = serde_json::to_string(&req_with_id.arguments).unwrap_or_default();
                if let Err(e) = db.conn().execute(
                    "INSERT OR REPLACE INTO ai_permission_requests 
                     (id, conversation_id, agent_id, tool_name, arguments, risk_level, description, status, created_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'pending', ?8)",
                    rusqlite::params![
                        req_id,
                        req_with_id.conversation_id,
                        agent_id,
                        req_with_id.tool_name,
                        args_json,
                        req_with_id.risk_level.as_str(),
                        req_with_id.description,
                        now,
                    ],
                ) {
                    tracing::warn!("[permission] failed to persist request: {}", e);
                }

                let (tx, rx) = tokio::sync::oneshot::channel::<(bool, bool)>();

                {
                    let mut pending = PENDING_PERMISSIONS.lock().await;
                    pending.insert(req_with_id.conversation_id.clone(), (tx, agent_id.clone(), req_with_id.tool_name.clone()));
                }

                if let Err(e) = handle.emit("agent-permission-request", serde_json::json!({
                    "conversationId": req_with_id.conversation_id,
                    "agentId": agent_id,
                    "toolName": req_with_id.tool_name,
                    "arguments": req_with_id.arguments,
                    "riskLevel": req_with_id.risk_level.as_str(),
                    "description": req_with_id.description,
                })) {
                    tracing::warn!("[run_agent] failed to emit agent-permission-request: {}", e);
                }

                match tokio::time::timeout(std::time::Duration::from_secs(60), rx).await {
                    Ok(Ok((approved, always_allow))) => {
                        // 更新数据库状态
                        let resp_time = std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .map(|d| d.as_secs() as i64)
                            .unwrap_or(0);
                        let status = if approved { "approved" } else { "denied" };
                        if let Err(e) = db.conn().execute(
                            "UPDATE ai_permission_requests SET status = ?1, always_allow = ?2, responded_at = ?3 WHERE id = ?4",
                            rusqlite::params![
                                status,
                                if always_allow { 1 } else { 0 },
                                resp_time,
                                req_id,
                            ],
                        ) {
                            tracing::warn!("[permission] failed to update response: {}", e);
                        }
                        (approved, always_allow)
                    }
                    _ => {
                        // 超时，更新数据库状态
                        let resp_time = std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .map(|d| d.as_secs() as i64)
                            .unwrap_or(0);
                        if let Err(e) = db.conn().execute(
                            "UPDATE ai_permission_requests SET status = 'timeout', responded_at = ?1 WHERE id = ?2 AND status = 'pending'",
                            rusqlite::params![resp_time, req_id],
                        ) {
                            tracing::warn!("[permission] failed to update timeout: {}", e);
                        }
                        (false, false)
                    }
                }
            })
        }
    )
}
