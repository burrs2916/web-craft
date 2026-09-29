use std::sync::Arc;
use std::collections::HashMap;
use tauri::{Emitter, State};
use tokio_util::sync::CancellationToken;

use crate::app::agent_service::AgentService;
use crate::app::plugin_service::PluginService;
use crate::infra::logging::debug_log;

use super::PENDING_PERMISSIONS;

mod events;
mod llm;
mod permission;
mod persist;
mod prompt;
mod repair;
mod scene;
mod tools;

use llm::build_llm_provider;

static CANCEL_TOKENS: std::sync::LazyLock<tokio::sync::Mutex<HashMap<String, CancellationToken>>> =
    std::sync::LazyLock::new(|| tokio::sync::Mutex::new(HashMap::new()));

#[tauri::command]
pub async fn run_agent(
    agent_id: String,
    message: String,
    conversation_id: Option<String>,
    disable_tools: Option<bool>,
    app_handle: tauri::AppHandle,
    service: State<'_, Arc<AgentService>>,
    plugin_service: State<'_, Arc<PluginService>>,
    terminal_service: State<'_, Arc<crate::app::terminal_service::TerminalService>>,
) -> Result<String, String> {
    let skip_tools = disable_tools.unwrap_or(false);
    tracing::info!("[run_agent] called agent_id={}, conv_id={:?}, message_len={}, disable_tools={}", agent_id, conversation_id, message.len(), skip_tools);
    tracing::debug!("[run_agent] message preview: {}...", crate::plugins::ai_agent::engine::truncate_bytes(&message, 200));
    let agent = service.get_agent_by_id(&agent_id)?
        .ok_or_else(|| "Agent not found".to_string())?;
    let run_id = format!("agent-{}", chrono::Local::now().format("%Y%m%d-%H%M%S%3f"));
    debug_log::env_ops("INFO", &run_id, "agent_run", "start",
        &format!("agent_id={} agent_name={} conv_id={:?} message_len={} skip_tools={}",
            agent_id, agent.name, conversation_id, message.len(), skip_tools));

    let model_id = agent.model_id.as_ref()
        .ok_or_else(|| "Agent has no model configured".to_string())?;
    let model = service.get_model_by_id(model_id)?
        .ok_or_else(|| "Model not found".to_string())?;

    let endpoint = service.get_endpoint_by_id(&model.endpoint_id)?
        .ok_or_else(|| "Endpoint not found".to_string())?;

    let provider = service.get_provider_by_id(&endpoint.provider_id)?
        .ok_or_else(|| "Provider not found".to_string())?;

    let (llm_provider_arc, is_ollama) = build_llm_provider(&provider, &endpoint);

    tracing::info!("[run_agent] provider setup: agent={}, model={}, provider_type={}, endpoint={}, api_type={}",
        agent_id, model.ref_key,
        if is_ollama { "ollama_native" } else { "openai_compat" },
        endpoint.base_url, endpoint.api_type);

    let fallback_provider_and_model: Option<(Arc<dyn crate::plugins::ai_agent::provider::LlmProvider>, String)> = if let Some(fb_model_id) = &agent.fallback_model_id {
        if let Ok(Some(fb_model)) = service.get_model_by_id(fb_model_id) {
            if let Ok(Some(fb_endpoint)) = service.get_endpoint_by_id(&fb_model.endpoint_id) {
                if let Ok(Some(fb_provider_row)) = service.get_provider_by_id(&fb_endpoint.provider_id) {
                    let (fb_provider, _fb_is_ollama) = build_llm_provider(&fb_provider_row, &fb_endpoint);
                    Some((fb_provider, fb_model.ref_key.clone()))
                } else {
                    None
                }
            } else {
                None
            }
        } else {
            None
        }
    } else {
        None
    };

    let tools = Arc::new(tokio::sync::Mutex::new(crate::plugins::ai_agent::engine::ToolRegistry::new()));

    // 空 tool_ids 表示「全部工具」：注册所有内置工具 + 全部已启用插件工具。
    let effective_tool_ids = tools::resolve_effective_tool_ids(&agent, plugin_service.inner());

    if !skip_tools {
        tools::register_agent_tools(
            &tools,
            &agent,
            &effective_tool_ids,
            service.db(),
            service.terminal(),
            plugin_service.inner(),
            service.inner(),
        ).await;
    }

    let conv_id = conversation_id.unwrap_or_else(|| {
        uuid::Uuid::new_v4().to_string()
    });

    let cancel_token = CancellationToken::new();
    let cancel_token_clone = cancel_token.clone();
    {
        let mut tokens = CANCEL_TOKENS.lock().await;
        // 如果已有旧的取消令牌，先取消（防止之前的会话残留）
        if let Some(old_token) = tokens.get(&conv_id) {
            tracing::warn!("[run_agent] found stale cancel token for {}, cancelling first", conv_id);
            old_token.cancel();
        }
        tokens.insert(conv_id.clone(), cancel_token_clone);
    }

    // 清理可能残留的权限请求
    {
        let mut pending_perms = PENDING_PERMISSIONS.lock().await;
        if pending_perms.remove(&conv_id).is_some() {
            tracing::warn!("[run_agent] cleaned up stale permission request for {}", conv_id);
        }
    }

    let mut system_prompt = prompt::build_system_prompt(
        &agent,
        &effective_tool_ids,
        plugin_service.inner(),
        skip_tools,
    );

    let permission_mode = match agent.permission_mode.as_str() {
        "auto" => crate::plugins::ai_agent::permission::PermissionMode::Auto,
        _ => crate::plugins::ai_agent::permission::PermissionMode::Confirm,
    };

    let permission_requester = permission::build_permission_requester(
        conv_id.clone(),
        agent.id.clone(),
        app_handle.clone(),
        service.db(),
    );

    // 场景化上下文注入：把会话 metadata 中的目标终端会话/站点信息注入 system prompt。
    let mut auto_continue_rd = false;
    if let Ok(Some(conv_row)) = service.find_conversation(&conv_id) {
        if !conv_row.compaction_summary.is_empty() {
            system_prompt.push_str(&format!(
                "\n\n[Previous Conversation Summary]\n{}\n[/Previous Conversation Summary]",
                conv_row.compaction_summary
            ));
        }
        if !conv_row.metadata.is_empty() && conv_row.metadata != "{}" {
            if let Ok(meta) = serde_json::from_str::<serde_json::Value>(&conv_row.metadata) {
                scene::check_external_session_alive(&meta, terminal_service.inner(), &run_id)?;
                auto_continue_rd = scene::inject_scene_context(&mut system_prompt, &meta, terminal_service.inner());
            }
        }
    }

    if let Ok(Some(conv_meta_row)) = service.find_conversation(&conv_id) {
        prompt::push_language_rule(&mut system_prompt, &conv_meta_row.metadata);
    }

    let mut engine_builder = crate::plugins::ai_agent::engine::AgentEngine::new(
        llm_provider_arc.clone(),
        tools,
        model.ref_key.clone(),
        system_prompt.clone(),
        agent.temperature,
        agent.max_iterations,
    )
    .with_cancel_token(cancel_token)
    .with_agent_id(agent.id.clone())
    .with_permission_mode(permission_mode)
    .with_always_allowed_tools(agent.always_allowed_tools.clone())
    .with_permission_requester(permission_requester)
    .with_auto_continue(auto_continue_rd)
    .with_max_tokens(model.max_tokens);

    if let Some((fb_provider, fb_model)) = fallback_provider_and_model {
        engine_builder = engine_builder.with_fallback(fb_provider, fb_model);
    }

    // 环境修复类 agent：启用修复计划追踪 + 注入历史经验
    let is_env_fix_agent = agent.id == "env-fix-assistant"
        || agent.id.contains("env-fix");
    if is_env_fix_agent {
        engine_builder = repair::configure_repair_engine(
            engine_builder,
            &agent,
            plugin_service.inner(),
            &app_handle,
            &conv_id,
            &system_prompt,
            &message,
            &llm_provider_arc,
            &model.ref_key,
            is_ollama,
        );
    }

    let engine = engine_builder
        .with_memory_auto_summary(true, "daily", 6);

    let mut history: Vec<crate::plugins::ai_agent::provider::ChatMessage> = if let Ok(db_msgs) = service.list_messages(&conv_id) {
        tracing::info!("[run_agent] loaded {} messages from DB for conv_id={}", db_msgs.len(), conv_id);
        db_msgs.iter().map(|m| {
            let tool_calls: Option<Vec<crate::plugins::ai_agent::provider::ToolCall>> = 
                if m.tool_calls.is_empty() || m.tool_calls == "[]" {
                    None
                } else {
                    serde_json::from_str(&m.tool_calls).ok()
                };
            let tool_call_id = if m.role == "tool" {
                Some(m.id.strip_prefix("tool-")
                    .map(|s| {
                        let parts: Vec<&str> = s.splitn(2, '-').collect();
                        parts.get(1).map(|p| p.to_string()).unwrap_or_else(|| m.id.clone())
                    })
                    .unwrap_or_else(|| m.id.clone()))
            } else {
                None
            };
            crate::plugins::ai_agent::provider::ChatMessage {
                role: m.role.clone(),
                content: m.content.clone(),
                reasoning_content: None,
                tool_calls,
                tool_call_id,
            }
        }).collect::<Vec<_>>()
    } else {
        Vec::new()
    };

    // Deduplicate: the frontend saves the user message to DB before calling run_agent,
    // so the same message appears in both history and the `message` parameter.
    // Remove the last message from history if it's a user message matching the current input,
    // to avoid sending duplicate messages to the LLM.
    if let Some(last) = history.last() {
        if last.role == "user" && last.content == message {
            tracing::info!("[run_agent] deduplicating: removing last user message from history (matches current input)");
            history.pop();
        }
    }

    let old_fingerprints = persist::message_fingerprints(&history);

    tracing::info!("[run_agent] history after dedup: {} messages, old_fingerprints: {}", history.len(), old_fingerprints.len());

    let (message_persister, persisted_ids, persister_run_ts) =
        persist::create_message_persister(service.inner().clone(), conv_id.clone());

    let mut engine = engine.with_message_persister(message_persister);

    // 记忆相关性检索：基于用户消息搜索相关记忆，注入到对话上下文中
    // 这样比全部加载更节省 token，且更有针对性
    let enhanced_message = if prompt::agent_uses_tool(&agent, "memory") {
        let agent_memory_dir = plugin_service.inner().data_dir()
            .join("agents").join(&agent.id);
        let memory_tool = crate::plugins::ai_agent::memory_tool::MemoryTool::new(agent_memory_dir);
        let relevant = memory_tool.search_relevant_for_prompt(&message, 15);
        if !relevant.is_empty() {
            format!("{}\n\n{}", relevant.trim(), message)
        } else {
            message
        }
    } else {
        message
    };

    // 标记会话为运行中
    if let Err(e) = service.update_conversation_status(&conv_id, "running") {
        tracing::warn!("[run_agent] failed to set conversation status to running: {}", e);
    }

    let chunk_counter = Arc::new(std::sync::atomic::AtomicUsize::new(0));

    tracing::info!("[run_agent] starting engine.run, conv_id={}", conv_id);
    debug_log::env_ops("INFO", &run_id, "agent_run", "engine_start",
        &format!("conv_id={} tools_enabled={} max_iterations={}", conv_id, !skip_tools, agent.max_iterations));

    let result = engine.run(&enhanced_message, history,
        events::make_chunk_emitter(app_handle.clone(), conv_id.clone(), chunk_counter.clone()),
        events::make_tool_emitter(app_handle.clone(), conv_id.clone()),
        events::make_status_emitter(app_handle.clone(), conv_id.clone()),
    ).await;

    let total_chunks = chunk_counter.load(std::sync::atomic::Ordering::Relaxed);
    tracing::info!("[run_agent] engine.run completed, result={}, conv_id={}, total_chunks={}", result.is_ok(), conv_id, total_chunks);
    debug_log::env_ops(if result.is_ok() { "INFO" } else { "ERROR" }, &run_id, "agent_run", "engine_done",
        &format!("success={} total_chunks={} conv_id={}", result.is_ok(), total_chunks, conv_id));

    // 标记会话为空闲（运行结束）
    if let Err(e) = service.update_conversation_status(&conv_id, "idle") {
        tracing::warn!("[run_agent] failed to set conversation status to idle: {}", e);
    }

    {
        let mut tokens = CANCEL_TOKENS.lock().await;
        tokens.remove(&conv_id);
    }

    // 清理待处理的权限请求（如果有的话）
    {
        let mut pending_perms = PENDING_PERMISSIONS.lock().await;
        if pending_perms.remove(&conv_id).is_some() {
            tracing::warn!("[run_agent] cleaning up stale permission request for {}", conv_id);
        }
    }

    match result {
        Ok(run_result) => {
            tracing::info!("[run_agent] run_result: final_content_len={}, total_messages={}", run_result.final_content.len(), run_result.messages.len());
            let already_persisted: Vec<String> = persisted_ids.lock()
                .map_err(|e| format!("Agent persister error: {}", e))?.drain(..).collect();
            tracing::info!(
                "[run_agent] {} messages already persisted incrementally, checking for any missed",
                already_persisted.len()
            );
            persist::final_sweep_persist(
                service.inner(),
                &conv_id,
                &run_result.messages,
                &old_fingerprints,
                &already_persisted,
                persister_run_ts,
            );

            if let Err(e) = service.touch_conversation(&conv_id) {
                tracing::warn!("[run_agent] failed to touch conversation {}: {}", conv_id, e);
            }

            tracing::info!("[run_agent] emitting agent-done, conv_id={}, response_len={}", conv_id, run_result.final_content.len());
            if let Err(e) = app_handle.emit("agent-done", serde_json::json!({
                "conversationId": conv_id,
                "response": run_result.final_content,
            })) {
                tracing::warn!("[run_agent] failed to emit agent-done for {}: {}", conv_id, e);
            }
            tracing::info!("[run_agent] agent-done emitted successfully, conv_id={}", conv_id);
            Ok(run_result.final_content)
        }
        Err(e) => {
            tracing::error!("[run_agent] engine.run failed: {}, conv_id={}", e, conv_id);
            debug_log::env_ops("ERROR", &run_id, "agent_run", "engine_failed",
                &format!("error={} conv_id={}", debug_log::clamp(&e, 300), conv_id));
            if let Err(emit_err) = app_handle.emit("agent-error", serde_json::json!({
                "conversationId": conv_id,
                "error": e,
            })) {
                tracing::warn!("[run_agent] failed to emit agent-error for {}: {}", conv_id, emit_err);
            }
            tracing::info!("[run_agent] agent-error emitted, conv_id={}", conv_id);
            Err(e)
        }
    }
}

#[tauri::command]
pub async fn stop_agent(
    conversation_id: String,
) -> Result<bool, String> {
    tracing::info!("[stop_agent] called, conversation_id={}", conversation_id);

    // 1. 触发取消令牌
    let tokens: tokio::sync::MutexGuard<'_, HashMap<String, CancellationToken>> = CANCEL_TOKENS.lock().await;
    let cancelled = if let Some(token) = tokens.get(&conversation_id) {
        token.cancel();
        tracing::info!("[stop_agent] cancellation token triggered for {}", conversation_id);
        true
    } else {
        tracing::warn!("[stop_agent] no cancellation token found for {}", conversation_id);
        false
    };
    drop(tokens);

    // 2. 清理待处理的权限请求（拒绝并移除）
    let mut pending_perms = PENDING_PERMISSIONS.lock().await;
    if let Some((tx, _agent_id, tool_name)) = pending_perms.remove(&conversation_id) {
        tracing::info!("[stop_agent] cleaning up pending permission request for {} (tool: {})",
            conversation_id, tool_name);
        let _ = tx.send((false, false)); // 拒绝权限请求
    }
    drop(pending_perms);

    Ok(cancelled)
}