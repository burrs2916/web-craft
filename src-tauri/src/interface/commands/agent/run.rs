use std::sync::Arc;
use std::collections::HashMap;
use tauri::{Emitter, State};
use tokio_util::sync::CancellationToken;

use crate::app::agent_service::AgentService;
use crate::app::plugin_service::PluginService;
use crate::infra::logging::debug_log;
use crate::infra::storage::agent_repo::AiMessageRow;

use super::dto::{detect_services_from_message, extract_target_from_message};
use super::PENDING_PERMISSIONS;

static CANCEL_TOKENS: std::sync::LazyLock<tokio::sync::Mutex<HashMap<String, CancellationToken>>> =
    std::sync::LazyLock::new(|| tokio::sync::Mutex::new(HashMap::new()));

/// 根据 provider/endpoint 配置构建合适的 LLM Provider
/// 自动检测 Ollama 服务并使用原生 API，其他情况使用 OpenAI 兼容模式
/// 返回 (provider, is_ollama)，其中 is_ollama 表示是否为 Ollama 原生 provider
fn build_llm_provider(
    provider_row: &crate::infra::storage::agent_repo::AiProviderRow,
    endpoint: &crate::infra::storage::agent_repo::AiEndpointRow,
) -> (Arc<dyn crate::plugins::ai_agent::provider::LlmProvider>, bool) {
    let config = crate::plugins::ai_agent::provider::ProviderConfig {
        api_key: provider_row.api_key.clone(),
        base_url: endpoint.base_url.clone(),
        api_type: endpoint.api_type.clone(),
        auth_type: endpoint.auth_type.clone(),
        custom_auth_header: endpoint.custom_auth_header.clone(),
    };

    // 判断是否为 Ollama：
    // 1. provider name 包含 "ollama"
    // 2. base_url 包含 localhost:11434 或 127.0.0.1:11434
    // 3. api_type 明确标记为 "ollama"
    let lower_name = provider_row.name.to_lowercase();
    let lower_url = config.base_url.to_lowercase();
    let is_ollama = lower_name.contains("ollama")
        || lower_url.contains("11434")
        || config.api_type == "ollama";

    if is_ollama {
        tracing::info!("[build_provider] using Ollama native provider for {}", endpoint.base_url);
        let provider = crate::plugins::ai_agent::ollama_provider::OllamaProvider::new(config);
        (Arc::new(provider), true)
    } else {
        tracing::info!("[build_provider] using OpenAI compat provider for {}", endpoint.base_url);
        let provider = crate::plugins::ai_agent::openai_provider::OpenAiCompatProvider::new(config);
        (Arc::new(provider), false)
    }
}

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

    let tool_registry = crate::plugins::ai_agent::engine::ToolRegistry::new();
    let db = service.db();
    let terminal_svc = service.terminal();

    let tools = Arc::new(tokio::sync::Mutex::new(tool_registry));

    // 空 tool_ids 表示「全部工具」：注册所有内置工具 + 全部已启用插件工具。
    // 这样任何未显式配置工具的 agent（默认新建 / seed 残留空值）都能调用项目所有工具，
    // 不会再出现 `Tool '' is not available`。
    let builtin_tool_ids = ["terminal", "file", "command_history", "terminal_session", "plugin_manager", "memory", "repair_kb"];
    let mut effective_tool_ids: Vec<String> = if agent.tool_ids.is_empty() {
        builtin_tool_ids.iter().map(|s| s.to_string()).collect()
    } else {
        agent.tool_ids.clone()
    };
    if agent.tool_ids.is_empty() {
        if let Ok(plugins) = plugin_service.list_plugins() {
            for p in &plugins {
                if p.enabled {
                    for t in &p.tools {
                        if !effective_tool_ids.contains(&t.name) {
                            effective_tool_ids.push(t.name.clone());
                        }
                    }
                }
            }
        }
    }

    // 统一判断某工具是否对该 agent 可用：空 tool_ids 视为全部可用。
    let agent_uses_tool = |name: &str| -> bool {
        agent.tool_ids.is_empty() || agent.tool_ids.iter().any(|t| t == name)
    };
    let uses_any_except = |excluded: &[&str]| -> bool {
        if agent.tool_ids.is_empty() { return true; }
        agent.tool_ids.iter().any(|t| !excluded.contains(&t.as_str()))
    };

    if !skip_tools {
        for tool_id in &effective_tool_ids {
            match tool_id.as_str() {
                "terminal" => {
                    let ws_dir = crate::plugins::ai_agent::file_tool::resolve_workspace_dir(&agent.workspace_dir, &agent.id);
                    let mut reg = tools.lock().await;
                    reg.register(Arc::new(crate::plugins::ai_agent::terminal_tool::TerminalTool::new().with_working_dir(ws_dir.to_string_lossy().to_string())));
                }
                "file" => {
                    let ws_dir = crate::plugins::ai_agent::file_tool::resolve_workspace_dir(&agent.workspace_dir, &agent.id);
                    let mut reg = tools.lock().await;
                    reg.register(Arc::new(crate::plugins::ai_agent::file_tool::FileTool::new(ws_dir)));
                }
                "command_history" => {
                    let mut reg = tools.lock().await;
                    reg.register(Arc::new(crate::plugins::ai_agent::command_history_tool::CommandHistoryTool::new(db.clone())));
                }
                "terminal_session" => {
                    let mut reg = tools.lock().await;
                    let kb_dir = plugin_service.inner().data_dir()
                        .join("agents").join(&agent.id);
                    let audit_log = std::sync::Arc::new(
                        crate::plugins::ai_agent::command_audit::CommandAuditLog::new(kb_dir)
                    );
                    reg.register(Arc::new(crate::plugins::ai_agent::terminal_session_tool::TerminalSessionTool::new(terminal_svc.clone())
                        .with_agent_id(agent.id.clone())
                        .with_audit_log(audit_log)));
                }
                "plugin_manager" => {
                    let ws_dir = crate::plugins::ai_agent::file_tool::resolve_workspace_dir(&agent.workspace_dir, &agent.id);
                    let mut reg = tools.lock().await;
                    reg.register(Arc::new(crate::plugins::ai_agent::plugin_manager_tool::PluginManagerTool::with_context(
                        plugin_service.inner().clone(),
                        tools.clone(),
                        service.inner().clone(),
                        agent.id.clone(),
                        ws_dir,
                    )));
                }
                "memory" => {
                    let agent_memory_dir = plugin_service.inner().data_dir()
                        .join("agents").join(&agent.id);
                    let mut reg = tools.lock().await;
                    reg.register(Arc::new(crate::plugins::ai_agent::memory_tool::MemoryTool::new(agent_memory_dir)));
                }
                "repair_kb" => {
                    let kb_dir = plugin_service.inner().data_dir()
                        .join("agents").join(&agent.id);
                    let mut reg = tools.lock().await;
                    reg.register(Arc::new(crate::plugins::ai_agent::repair_kb_tool::RepairKbTool::new(kb_dir)));
                }
                _ => {
                    if let Ok(Some((pid, plugin_tool))) = plugin_service.inner().find_enabled_tool(tool_id) {
                        let ws_dir = crate::plugins::ai_agent::file_tool::resolve_workspace_dir(&agent.workspace_dir, &agent.id);
                        let mut reg = tools.lock().await;
                        let agent_tool = crate::plugins::ai_agent::plugin_tool::PluginAgentTool::new(plugin_tool, ws_dir)
                            .with_logging(plugin_service.inner().clone(), pid);
                        reg.register(Arc::new(agent_tool));
                    }
                }
            }
        }
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

    let mut system_prompt = agent.system_prompt.clone();

    // Add conversation continuity instruction — critical for polish/refine mode
    system_prompt.push_str("\n\n## Conversation Continuity — CRITICAL\n\
You are in an ongoing conversation session. All previous messages in this conversation are part of your context.\n\
\n\
CRITICAL RULES FOR MAINTAINING CONTEXT:\n\
- ALWAYS review the conversation history before responding. The user's requests build on prior exchanges.\n\
- When the user says \"refine this\" or \"improve that\", they are referring to something discussed or built earlier in THIS conversation.\n\
- DO NOT start from scratch — always build on what was previously established.\n\
- If the user references a previous change, decision, or result, look back through the conversation to find it.\n\
- When working on iterative improvements (polish mode), maintain awareness of:\n\
  * What the original state was\n\
  * What changes were already applied\n\
  * What the current state is\n\
  * What the user wants to improve next\n\
- YOU ARE NOT starting a new conversation each time the user sends a message. This is ONE continuous session.\n\
- Previous tool results, analysis, and decisions are all part of your current context — use them.\n");


    if !skip_tools {
        if let Ok(enabled_plugins) = plugin_service.list_plugins() {
        let agent_tool_set: std::collections::HashSet<String> = effective_tool_ids.iter().cloned().collect();

        let relevant_plugins: Vec<_> = enabled_plugins
            .iter()
            .filter(|p| p.enabled && p.tools.iter().any(|t| agent_tool_set.contains(&t.name)))
            .collect();

        if !relevant_plugins.is_empty() {
            let mut scenario_section = String::from("\n\n## Available Plugin Capabilities\n");
            scenario_section.push_str(
                "CRITICAL RULE — YOU MUST OBEY:\n\
1. When a user's request matches ANY plugin scenario below, you MUST call the corresponding tool FIRST to get real data.\n\
2. You are FORBIDDEN from answering based on your own knowledge when a relevant tool is available.\n\
3. Your response MUST be based on the actual tool results, not your training data.\n\
4. If you are unsure whether to use a tool, ALWAYS use the tool — it is better to call a tool unnecessarily than to skip it.\n\
5. After receiving tool results, analyze them and provide your answer based on the actual data.\n\n"
            );
            scenario_section.push_str("The following plugins and their tools are available to you:\n");

            for plugin in &relevant_plugins {
                scenario_section.push_str(&format!("\n### {} (v{})\n{}\n", plugin.name, plugin.version, plugin.description));

                let agent_owned_tools: Vec<_> = plugin.tools.iter()
                    .filter(|t| agent_tool_set.contains(&t.name))
                    .collect();
                scenario_section.push_str(&format!("Tools: {}\n",
                    agent_owned_tools.iter().map(|t| format!("`{}` — {}", t.name, t.description)).collect::<Vec<_>>().join("; ")
                ));

                if !plugin.scenarios.is_empty() {
                    scenario_section.push_str("Usage scenarios:\n");
                    for scenario in &plugin.scenarios {
                        let tool_name = if !scenario.tool_name.is_empty() {
                            scenario.tool_name.as_str()
                        } else {
                            agent_owned_tools.first().map(|t| t.name.as_str()).unwrap_or("unknown")
                        };
                        let mut s = scenario.clone();
                        s.sanitize();
                        scenario_section.push_str(&format!("- **{}**: {} → Use tool: `{}` (example: \"{}\")\n",
                            s.name, s.description,
                            tool_name,
                            s.example_prompt));
                    }
                }
                if !plugin.trigger_keywords.is_empty() {
                    scenario_section.push_str(&format!("Trigger keywords: {}\n", plugin.trigger_keywords.join(", ")));
                }
            }

            system_prompt.push_str(&scenario_section);
        }
    }

    if agent_uses_tool("plugin_manager") {
        system_prompt.push_str("\n\n## Plugin Refinement Workflow\n\
When the user asks you to refine, improve, or fix a plugin, you MUST follow this exact workflow:\n\
1. **READ**: Use the `plugin_manager` tool with action `get` and the plugin_id to read the plugin's full code, tools, and configuration.\n\
2. **ANALYZE**: Review the code for issues: missing error handling, edge cases, performance problems, unclear descriptions, or missing parameters.\n\
3. **REFINE**: Use the `plugin_manager` tool with action `refine` to apply improvements. Include `changelog_changes` to document what was changed.\n\
4. **TEST**: Use the `plugin_manager` tool with action `test` to verify the refined tool works correctly with sample parameters.\n\
NEVER skip the READ step and answer from memory. ALWAYS call the actual tools to get real data and make real changes.\n");
    }

    if agent_uses_tool("file") {
        let ws_dir = crate::plugins::ai_agent::file_tool::resolve_workspace_dir(&agent.workspace_dir, &agent.id);
        system_prompt.push_str(&format!("\n\n## File & Document Analysis\n\
When the user's message contains file attachment paths in the format `[附件: /path/to/file]`, you MUST:\n\
1. Use the `file` tool with action `analyze` and the file path to extract the document content.\n\
2. For text files (txt, md, json, yaml, code files), you can also use action `read`.\n\
3. For documents (PDF, DOCX, XLSX, CSV), use action `analyze` which will auto-detect the format and extract text.\n\
4. After reading the file content, analyze it and respond based on the actual file data.\n\
5. NEVER skip reading the file and answer from your own knowledge — always read the actual file first.\n\
6. If the file tool returns an error (e.g., unsupported format), inform the user about the limitation.\n\n\
## Agent Workspace\n\
Your workspace directory is: `{}`\n\
- When you need to write or save files, use the `file` tool with action `write` and a relative path (e.g., `report.md`, `output/data.json`).\n\
- Relative paths are automatically resolved under your workspace output directory.\n\
- You can also use absolute paths if needed, but prefer relative paths for workspace outputs.\n\
- The `{{{{output_path}}}}` variable in plugin scripts resolves to your workspace directory.\n", ws_dir.display()));
    } else if !agent.workspace_dir.is_empty() || uses_any_except(&["memory", "plugin_manager", "command_history"]) {
        let ws_dir = crate::plugins::ai_agent::file_tool::resolve_workspace_dir(&agent.workspace_dir, &agent.id);
        system_prompt.push_str(&format!("\n\n## Agent Workspace\n\
Your workspace directory is: `{}`\n\
- When plugin tools produce output files, they are saved in this directory.\n\
- The `{{{{output_path}}}}` variable in plugin scripts resolves to this directory.\n", ws_dir.display()));
    }

    if agent_uses_tool("memory") {
        let agent_memory_dir = plugin_service.inner().data_dir()
            .join("agents").join(&agent.id);
        let memory_tool = crate::plugins::ai_agent::memory_tool::MemoryTool::new(agent_memory_dir);
        let memory_context = memory_tool.load_memory_for_prompt();
        if !memory_context.is_empty() {
            system_prompt.push_str(&memory_context);
        }
    }
    }

    {
        let mut context_parts = Vec::new();

        if let Ok(cwd) = std::env::current_dir() {
            context_parts.push(format!("Working Directory: {}", cwd.display()));
        }

        if let Ok(hostname) = hostname::get() {
            context_parts.push(format!("Host: {}", hostname.to_string_lossy()));
        }

        if let Ok(output) = std::process::Command::new("git")
            .args(["rev-parse", "--is-inside-work-tree"])
            .output()
        {
            if output.status.success() {
                let is_git = String::from_utf8_lossy(&output.stdout).trim() == "true";
                if is_git {
                    if let Ok(branch_output) = std::process::Command::new("git")
                        .args(["branch", "--show-current"])
                        .output()
                    {
                        let branch = String::from_utf8_lossy(&branch_output.stdout).trim().to_string();
                        if !branch.is_empty() {
                            context_parts.push(format!("Git Branch: {}", branch));
                        }
                    }

                    if let Ok(status_output) = std::process::Command::new("git")
                        .args(["status", "--short"])
                        .output()
                    {
                        let status = String::from_utf8_lossy(&status_output.stdout).trim().to_string();
                        if !status.is_empty() {
                            let lines: Vec<&str> = status.lines().take(20).collect();
                            context_parts.push(format!("Git Status ({} changes):\n{}", lines.len(), lines.join("\n")));
                        } else {
                            context_parts.push("Git Status: clean".to_string());
                        }
                    }
                }
            }
        }

        if !context_parts.is_empty() {
            system_prompt.push_str(&format!("\n\n--- Project Context ---\n{}\n--- End Context ---", context_parts.join("\n")));
        }
    }

    let permission_mode = match agent.permission_mode.as_str() {
        "auto" => crate::plugins::ai_agent::permission::PermissionMode::Auto,
        _ => crate::plugins::ai_agent::permission::PermissionMode::Confirm,
    };

    let conv_id_for_perm = conv_id.clone();
    let agent_id_for_perm = agent.id.clone();
    let app_handle_for_perm = app_handle.clone();
    let db_for_perm = service.db();
    let permission_requester: crate::plugins::ai_agent::engine::PermissionRequesterFn = Arc::new(
        move |req: crate::plugins::ai_agent::permission::PermissionRequest| {
            let mut req_with_id = req;
            req_with_id.conversation_id = conv_id_for_perm.clone();
            let handle = app_handle_for_perm.clone();
            let agent_id = agent_id_for_perm.clone();
            let db = db_for_perm.clone();

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
    );

    // 远程桌面安装助手：把会话 metadata 中的目标终端会话注入 system prompt，
    // 让 agent 知道该驱动哪个 terminal_session。普通对话无 rdSetup 字段，不受影响。
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
                // 早期会话存活校验：envFix / ops / srvEnvSetup / rdSetup 等场景的 session_id
                // 来自前端 URL 参数，窗口复用时可能已过期。不存活时直接拒绝启动 Agent，
                // 避免模型反复调用 terminal_session 导致一连串 "session not found" 错误。
                let ext_session: Option<(&str, &str)> =
                    meta.get("envFix").and_then(|m| m.get("sessionId").and_then(|v| v.as_str()).map(|s| ("envFix", s)))
                    .or_else(|| meta.get("ops").and_then(|m| m.get("sessionId").and_then(|v| v.as_str()).map(|s| ("ops", s))))
                    .or_else(|| meta.get("srvEnvSetup").and_then(|m| m.get("sessionId").and_then(|v| v.as_str()).map(|s| ("srvEnvSetup", s))))
                    .or_else(|| meta.get("rdSetup").and_then(|m| m.get("sessionId").and_then(|v| v.as_str()).map(|s| ("rdSetup", s))));
                if let Some((scene, sid)) = ext_session {
                    if !sid.is_empty() && !terminal_service.session_alive(sid) {
                        tracing::warn!("[run_agent] {} session '{}' is not alive, rejecting agent start", scene, sid);
                        debug_log::env_ops("ERROR", &run_id, "agent_run", "session_dead_rejected",
                            &format!("scene={} session_id={} reason=session_not_alive agent_rejected=true", scene, sid));
                        let ui_is_en = meta.get("lang").and_then(|v| v.as_str()).map(|l| l.starts_with("en")).unwrap_or(false);
                        let err_msg = if ui_is_en {
                            format!("SSH terminal session has been lost (disconnected or expired).\n\nSession ID: {}\nScene: {}\n\nPlease reopen the environment fix / deployment tool from the operations center to establish a fresh SSH connection, then try again.", sid, scene)
                        } else {
                            format!("SSH 终端会话已丢失（已断开或过期）。\n\n会话 ID：{}\n场景：{}\n\n请从运维中心重新打开环境修复/部署工具以建立新的 SSH 连接，然后再试。", sid, scene)
                        };
                        return Err(err_msg);
                    }
                    debug_log::env_ops("INFO", &run_id, "agent_run", "session_alive_ok",
                        &format!("scene={} session_id={}", scene, sid));
                }
                if let Some(rd) = meta.get("rdSetup") {
                    let session_id = rd.get("sessionId").and_then(|v| v.as_str()).unwrap_or("");
                    let host = rd.get("host").and_then(|v| v.as_str()).unwrap_or("");
                    let username = rd.get("username").and_then(|v| v.as_str()).unwrap_or("");
                    let install_mode = rd.get("installMode").and_then(|v| v.as_str()).unwrap_or("basic");
                    let install_mode_guide = match install_mode {
                        "headless" => "`headless` (无桌面版): packages = VNC Server + xterm only, NO desktop environment.",
                        "full" => "`full` (全量安装): packages = TigerVNC + XFCE desktop + common apps (Debian: xfce4 xfce4-terminal thunar xfce4-goodies; RHEL/Arch: xfce4 xfce4-terminal thunar).",
                        _ => "`basic` (基础桌面版): packages = TigerVNC + minimal XFCE (Debian/Ubuntu: `--no-install-recommends xfce4 xfce4-terminal`).",
                    };
                    // 提示词国际化：会话 metadata 携带用户界面语言，en → 英文注入，其余 → 中文注入。
                    let is_en = rd.get("lang").and_then(|v| v.as_str()).map(|l| l.starts_with("en")).unwrap_or(false);
                    if !session_id.is_empty() {
                        if is_en {
                            system_prompt.push_str(&format!(
                                "\n\n## Remote Desktop Setup Context\n\
You are helping set up a VNC remote desktop on a remote server.\n\
- Active terminal session id to drive: `{}`\n\
- Target host: `{}` (user: `{}`)\n\
- Install mode (user-selected): `{}` — install exactly this variant, nothing more, nothing less.\n\
ALWAYS use the `terminal_session` tool with action `write`, `session_id` set to the id above, and the command to run. After writing, use action `read_output` to read the result. Do NOT use any other session id.\n\
The remote server's sudo password prompts are auto-answered by the terminal session — just run sudo commands normally.\n\
\n\
Besides installing/configuring VNC, the user may also ask you to do other remote-server maintenance or answer questions (change passwords, check port usage, explain commands, clean disk, chat). Treat those as normal requests and assist via `terminal_session`.\n\
\n\
WORKFLOW (strict three-phase, do NOT skip or merge):\n\
\n\
PHASE 0 — RECON (read-only, NO system changes, mandatory first): Gather the environment profile with a few non-destructive commands, e.g. \
`cat /etc/os-release; uname -a; for pm in apt apt-get dnf yum zypper pacman apk; do command -v $pm && break; done; command -v vncserver Xvnc tigervncserver; command -v xfce4-session gnome-session startkde; ss -ltn 2>/dev/null | grep -q ':5901' && echo PORT_OPEN || echo PORT_CLOSED; id -u; sudo -n true 2>/dev/null && echo SUDO_OK || echo SUDO_NEED_PW`. \
Capture: distro + version, architecture, available package manager, whether a desktop environment already exists, current VNC status, sudo availability, and any obvious dependency conflicts. Do NOT install or modify anything in this phase.\n\
\n\
PHASE 1 — REPORT + CONSENT: Summarize the environment profile in a few lines, then end with EXACTLY one line: `RD_STATUS: installed` (VNC already configured & listening) or `RD_STATUS: not_installed`. \
If not_installed, briefly state the install plan for the chosen mode: which packages, the exact non-interactive install command for THIS distro's package manager, how you will set the VNC password and write xstartup, and how you will start/verify. **Ask the user which VNC password they want to use for connecting (so they can actually log in afterwards).** STOP here and wait for the user. Do NOT begin installing.\n\
\n\
PHASE 2 — INSTALL ONLY AFTER EXPLICIT CONSENT: Only after the user clearly agrees (同意 / 开始安装 / yes) do you execute the planned commands. \
You ALREADY know the distro and package manager from PHASE 0 — do NOT re-detect them; run the correct commands directly. Install exactly per the selected mode: {}\n\
Use the VNC password the user provided in PHASE 1 when running `vncpasswd`; if they did not provide one, generate a simple password and **state it clearly in your final summary** so they can connect. \
Follow the non-interactive HARD RULES from your system prompt (any command that stops to ask is a bug): Debian/Ubuntu must use the full guardrail chain (DEBIAN_FRONTEND=noninteractive + DEBIAN_PRIORITY=critical + --force-confdef --force-confold + -o DPkg::Lock::Timeout=600 + dpkg --configure -a self-heal + debconf pre-seed for keyboard-configuration only if not installed; NEVER pre-seed tzdata; NEVER add `< /dev/null`; NEVER use `apt`, use `apt-get`). SUSE must use `zypper --non-interactive --gpg-auto-import-keys install --auto-agree-with-licenses`. Gentoo must use `emerge --ask=n`, never `--ask`. Set the VNC password (answer `Password:` then `Verify:`; if asked about a view-only password, answer `n`), write ~/.vnc/xstartup, start vncserver, verify it listens on 5901. \
Drive the terminal autonomously: keep issuing `terminal_session` calls until verified, and do NOT end your turn with a plain-text status update or speculative progress claims (e.g. do NOT say 'download finished, will auto-continue'). When fully verified, output a single final summary containing the word 完成 (or \"done\").\n\
If the user does not consent, stop and do nothing.\n\
LANGUAGE RULE: The user's UI language is English — ALWAYS reply entirely in English. Only the `RD_STATUS:` marker line is machine-parsed and must stay exactly as specified.\n",
                                session_id, host, username, install_mode, install_mode_guide
                            ));
                        } else {
                            system_prompt.push_str(&format!(
                                "\n\n## Remote Desktop Setup Context\n\
你在帮助用户在远程服务器上安装配置 VNC 远程桌面。\n\
- 需要驱动的活动终端会话 id：`{}`\n\
- 目标主机：`{}`（用户：`{}`）\n\
- 安装模式（用户选择）：`{}` —— 严格按该模式安装，不多不少。\n\
务必使用 `terminal_session` 工具，action 为 `write`，session_id 用上面的 id，并带上要执行的命令；写完后用 `read_output` 读取结果。不要使用其它 session_id。\n\
远程服务器的 sudo 密码提示会被终端自动应答 —— 正常执行 sudo 命令即可。\n\
\n\
除安装/配置 VNC 外，用户也可能让你做其它远程维护或问答（改密码、查端口、解释命令、清理磁盘、聊天等），都通过 `terminal_session` 正常协助。\n\
\n\
工作流（严格三阶段，不要跳过或合并）：\n\
\n\
PHASE 0 — 侦察（只读，不改动系统，必须先做）：用几条非破坏性命令收集环境画像，例如 \
`cat /etc/os-release; uname -a; for pm in apt apt-get dnf yum zypper pacman apk; do command -v $pm && break; done; command -v vncserver Xvnc tigervncserver; command -v xfce4-session gnome-session startkde; ss -ltn 2>/dev/null | grep -q ':5901' && echo PORT_OPEN || echo PORT_CLOSED; id -u; sudo -n true 2>/dev/null && echo SUDO_OK || echo SUDO_NEED_PW`。\
记录：发行版+版本、架构、可用的包管理器、是否已有桌面环境、当前 VNC 状态、sudo 可用性、明显的依赖冲突。本阶段不要安装或修改任何东西。\n\
\n\
PHASE 1 — 汇报 + 征求同意：用几行总结环境画像，然后以**恰好一行**结束：`RD_STATUS: installed`（VNC 已配置且在监听）或 `RD_STATUS: not_installed`。\
若为 not_installed，简要说明所选模式的安装计划：装哪些包、针对本发行版包管理器的确切非交互安装命令、如何设置 VNC 密码和写 xstartup、如何启动并验证。**询问用户希望用哪个 VNC 密码连接（这样之后才能登录）**。停在这里等待用户，不要开始安装。\n\
\n\
PHASE 2 — 仅在用户明确同意后安装（同意 / 开始安装 / yes）：用户明确同意后才执行计划命令。\
你已经从 PHASE 0 知道发行版和包管理器 —— 不要重新探测，直接执行正确命令。严格按所选模式安装：{}\n\
设置 VNC 密码时使用用户在 PHASE 1 提供的密码；未提供则生成简单密码并在**最终总结中明确告知**。\
遵守系统提示词中的「无人值守铁律」（任何会停下来问的命令都是 bug）：Debian/Ubuntu 必须用全套护栏（DEBIAN_FRONTEND=noninteractive + DEBIAN_PRIORITY=critical + --force-confdef --force-confold + -o DPkg::Lock::Timeout=600 + dpkg --configure -a 自愈 + 仅在未安装时 debconf 预置 keyboard-configuration；绝不预置 tzdata；绝不加 `< /dev/null`；用 apt-get 不用 apt）。SUSE 必须用 `zypper --non-interactive --gpg-auto-import-keys install --auto-agree-with-licenses`。Gentoo 必须用 `emerge --ask=n`，绝不用 `--ask`。写 ~/.vnc/xstartup，启动 vncserver，验证 5901 在监听。\
自主驱动终端：持续调用 `terminal_session` 直到验证完成，不要用纯文本状态更新或猜测性进度来结束回合（例如不要说「下载完成，将自动继续」）。全部验证通过后，输出一条包含「完成」（或 \"done\"）的最终总结。\n\
如果用户不同意，停止且什么都不做。\n\
语言规则：用户界面为中文 —— 请始终用简体中文回复；`RD_STATUS:` 标记行按原样输出，语言无关。\n",
                                session_id, host, username, install_mode, install_mode_guide
                            ));
                        }
                        // 安装是长任务，开启引擎自动续跑：模型中途返回纯文本也不停下，
                        // 由引擎注入提醒继续驱动终端，避免每步都等用户点"继续"。
                        // 但检查结论 / 征询用户意见时引擎不会自动续跑（见 engine.rs awaiting_user 判定）。
                        auto_continue_rd = true;
                    }
                }
                // 站点部署环境安装助手（server-integration-design.md M-x1）：与 rdSetup 同构，
                // 把站点绑定的终端会话与部署路径注入剧本上下文，驱动「探测→汇报→同意后安装」。
                if let Some(se) = meta.get("srvEnvSetup") {
                    let session_id = se.get("sessionId").and_then(|v| v.as_str()).unwrap_or("");
                    let host = se.get("host").and_then(|v| v.as_str()).unwrap_or("");
                    let username = se.get("username").and_then(|v| v.as_str()).unwrap_or("");
                    let site_name = se.get("siteName").and_then(|v| v.as_str()).unwrap_or("");
                    let remote_path = se.get("remotePath").and_then(|v| v.as_str()).unwrap_or("");
                    let is_en = se.get("lang").and_then(|v| v.as_str()).map(|l| l.starts_with("en")).unwrap_or(false);
                    if !session_id.is_empty() {
                        if is_en {
                            system_prompt.push_str(&format!(
                                "\n\n## Server Environment Setup Context\n\
You are preparing the deploy environment for the site `{}` on a remote server.\n\
- Active terminal session id to drive: `{}`\n\
- Target host: `{}` (user: `{}`)\n\
- Deploy remote path: `{}`\n\
ALWAYS use the `terminal_session` tool with action `write`, `session_id` set to the id above, and the command to run. After writing, use action `read_output` to read the result. Do NOT use any other session id.\n\
The remote server's sudo password prompts are auto-answered by the terminal session — just run sudo commands normally.\n\
\n\
WORKFLOW (strict three-phase, do NOT skip or merge):\n\
\n\
PHASE 0 — PROBE (read-only, NO system changes): run the probe commands from your system prompt (os-release, package manager, nginx presence & service status, port 80/443 listening, firewall tool, sudo, disk space) and `read_output` each result. Do NOT install or modify anything in this phase.\n\
\n\
PHASE 1 — REPORT + CONSENT: Summarize the environment profile, then end with EXACTLY one line: `SRV_ENV_STATUS: ready` or `SRV_ENV_STATUS: partial` or `SRV_ENV_STATUS: missing`. If not ready, state the install plan (packages, exact non-interactive command for THIS distro, enable --now, firewall rules, deploy directory, verification). STOP here and wait for the user. Do NOT begin installing.\n\
\n\
PHASE 2 — INSTALL ONLY AFTER EXPLICIT CONSENT: Only after the user clearly agrees do you execute the planned commands. Do NOT re-detect the distro; run the correct commands directly, following the non-interactive HARD RULES from your system prompt. If a deploy path is given above, create it and hand ownership to the current user. Verify `systemctl is-active nginx` is active AND `curl -s -o /dev/null -w '%{{http_code}}' http://localhost` returns 200, then output a final summary containing the word \"done\". If the user does not consent, stop and do nothing.\n\
If port 80/443 is occupied by another web server, report it and ask how to proceed — never kill processes on your own.\n\
LANGUAGE RULE: The user's UI language is English — ALWAYS reply entirely in English. Only the `SRV_ENV_STATUS:` marker line is machine-parsed and must stay exactly as specified.\n",
                                site_name, session_id, host, username, if remote_path.is_empty() { "(not set — skip directory setup)" } else { remote_path }
                            ));
                        } else {
                            system_prompt.push_str(&format!(
                                "\n\n## 服务器环境安装上下文\n\
你在为站点「{}」准备远程服务器上的部署环境。\n\
- 需要驱动的活动终端会话 id：`{}`\n\
- 目标主机：`{}`（用户：`{}`）\n\
- 部署远程路径：`{}`\n\
务必使用 `terminal_session` 工具，action 为 `write`，session_id 用上面的 id，并带上要执行的命令；写完后用 `read_output` 读取结果。不要使用其它 session_id。\n\
远程服务器的 sudo 密码提示会被终端自动应答 —— 正常执行 sudo 命令即可。\n\
\n\
工作流（严格三阶段，不要跳过或合并）：\n\
\n\
PHASE 0 — 探测（只读，不改动系统）：执行系统提示词中的探测命令（os-release、包管理器、nginx 是否安装与服务状态、80/443 端口监听、防火墙工具、sudo、磁盘空间），每条都用 `read_output` 读取结果。本阶段不要安装或修改任何东西。\n\
\n\
PHASE 1 — 汇报 + 征求同意：用几行总结环境画像，然后以**恰好一行**结束：`SRV_ENV_STATUS: ready`（nginx 已装且 active、80 或 443 在监听）或 `SRV_ENV_STATUS: partial`（已装但未运行/端口未监听/被占用）或 `SRV_ENV_STATUS: missing`（未安装）。若非 ready，说明安装计划（装哪些包、针对本发行版的确切非交互安装命令、enable --now、防火墙放行、部署目录、验证方式）。停在这里等待用户，不要开始安装。\n\
\n\
PHASE 2 — 仅在用户明确同意后安装：用户明确同意后才执行计划命令。不要重新探测发行版，直接执行正确命令，遵守系统提示词中的「无人值守铁律」。上面给了部署路径时，创建目录并把属主交给当前用户。验证 `systemctl is-active nginx` 为 active 且 `curl -s -o /dev/null -w '%{{http_code}}' http://localhost` 返回 200，然后输出包含「完成」（或 \"done\"）的最终总结。如果用户不同意，停止且什么都不做。\n\
若 80/443 被其它 Web 服务占用，汇报并征求用户处理意见，不要擅自杀进程。\n\
语言规则：用户界面为中文 —— 请始终用简体中文回复；`SRV_ENV_STATUS:` 标记行按原样输出，语言无关。\n",
                                site_name, session_id, host, username, if remote_path.is_empty() { "（未设置 —— 跳过目录准备）" } else { remote_path }
                            ));
                        }
                        auto_continue_rd = true;
                    }
                }

                // 运维助手上下文：与 srvEnvSetup 同构，注入站点名、部署路径和会话信息。
                if let Some(ops) = meta.get("ops") {
                    let session_id = ops.get("sessionId").and_then(|v| v.as_str()).unwrap_or("");
                    let host = ops.get("host").and_then(|v| v.as_str()).unwrap_or("");
                    let username = ops.get("username").and_then(|v| v.as_str()).unwrap_or("");
                    let site_name = ops.get("siteName").and_then(|v| v.as_str()).unwrap_or("");
                    let remote_path = ops.get("remotePath").and_then(|v| v.as_str()).unwrap_or("");
                    let is_en = ops.get("lang").and_then(|v| v.as_str()).map(|l| l.starts_with("en")).unwrap_or(false);
                    if !session_id.is_empty() {
                        if is_en {
                            system_prompt.push_str(&format!(
                                "\n\n## Ops Context\n\
You are managing operations for the site `{}` on a remote server.\n\
- Active terminal session id to use: `{}`\n\
- Target host: `{}` (user: `{}`)\n\
- Deploy remote path: `{}`\n\
ALWAYS use the `terminal_session` tool with action `write`, `session_id` set to the id above, and the command to run. After writing, use action `read_output` to read the result. Do NOT use any other session id.\n\
The remote server's sudo password prompts are auto-answered by the terminal session — just run sudo commands normally.\n",
                                site_name, session_id, host, username, if remote_path.is_empty() { "(not set)" } else { remote_path }
                            ));
                        } else {
                            system_prompt.push_str(&format!(
                                "\n\n## 运维上下文\n\
你正在为站点「{}」管理远程服务器上的运维工作。\n\
- 要使用的活动终端会话 id：`{}`\n\
- 目标主机：`{}`（用户：`{}`）\n\
- 部署远程路径：`{}`\n\
务必使用 `terminal_session` 工具，action 为 `write`，session_id 用上面的 id，并带上要执行的命令；写完后用 `read_output` 读取结果。不要使用其它 session_id。\n\
远程服务器的 sudo 密码提示会被终端自动应答 —— 正常执行 sudo 命令即可。\n",
                                site_name, session_id, host, username, if remote_path.is_empty() { "（未设置）" } else { remote_path }
                            ));
                        }
                    }
                }

                // 环境修复助手上下文：注入环境检测报告 JSON + 站点信息
                if let Some(env_fix) = meta.get("envFix") {
                    let session_id = env_fix.get("sessionId").and_then(|v| v.as_str()).unwrap_or("");
                    let host = env_fix.get("host").and_then(|v| v.as_str()).unwrap_or("");
                    let username = env_fix.get("username").and_then(|v| v.as_str()).unwrap_or("");
                    let site_name = env_fix.get("siteName").and_then(|v| v.as_str()).unwrap_or("");
                    let remote_path = env_fix.get("remotePath").and_then(|v| v.as_str()).unwrap_or("");
                    let domain = env_fix.get("domain").and_then(|v| v.as_str()).unwrap_or("");
                    let check_report = env_fix.get("checkReport").and_then(|v| v.as_str()).unwrap_or("");
                    let is_en = env_fix.get("lang").and_then(|v| v.as_str()).map(|l| l.starts_with("en")).unwrap_or(false);
                    // 校验终端会话是否存活 —— 窗口复用可能导致 session_id 过期
                    let session_alive = !session_id.is_empty() && terminal_service.session_alive(session_id);
                    if !session_id.is_empty() && !session_alive {
                        tracing::warn!("[run_agent] env-fix session '{}' is not alive, warning agent", session_id);
                    }
                    if !session_id.is_empty() {
                        if is_en {
                            system_prompt.push_str(&format!(
                                "\n\n## Environment Fix Context\n\
You are fixing the Web runtime environment for the site `{}` on a remote server.\n\
- Active terminal session id to drive: `{}`\n\
- Target host: `{}` (user: `{}`)\n\
- Deploy remote path: `{}`\n\
- Domain: `{}`\n\
ALWAYS use the `terminal_session` tool with action `write`, `session_id` set to the id above, and the command to run. After writing, use action `read_output` to read the result. Do NOT use any other session id.\n\
The remote server's sudo password prompts are auto-answered by the terminal session — just run sudo commands normally.\n\
\n\
### Environment Check Report (JSON)\n\
```json\n\
{}\n\
```\n\
\n\
WORKFLOW (strict three-phase, do NOT skip or merge):\n\
\n\
PHASE 0 — DIAGNOSE (read-only, NO system changes): Read the check report JSON above. Identify all failing/warning items. Determine the distro from the `system` group. Sort issues by priority (Web > SSL > Site Service). Do NOT install or modify anything in this phase.\n\
\n\
PHASE 1 — REPORT + CONSENT: Summarize the issues and your fix plan (packages, exact non-interactive commands for this distro, enable services, verification). Include risk notes (sudo needs, service restarts, impact). Then end with EXACTLY one line: `ENV_FIX_STATUS: need_fix` or `ENV_FIX_STATUS: all_good`. STOP here and wait for the user. Do NOT begin fixing.\n\
\n\
PHASE 2 — EXECUTE FIXES ONLY AFTER EXPLICIT CONSENT: Only after the user clearly agrees do you execute the planned fixes. Fix one by one in priority order. Verify each fix before moving on. On errors, read the full output first, diagnose, then retry — don't blindly repeat. Skip failed items and continue. After all fixes, verify all services are running, then output a final summary containing \"done\": what was fixed, what failed, and recommendations.\n\
Follow the Non-interactive HARD RULES from your system prompt for all install commands.\n\
LANGUAGE RULE: The user's UI language is English — ALWAYS reply entirely in English. Only the `ENV_FIX_STATUS:` marker line is machine-parsed and must stay exactly as specified.\n",
                                site_name, session_id, host, username,
                                if remote_path.is_empty() { "(not set)" } else { remote_path },
                                if domain.is_empty() { "(not set)" } else { domain },
                                if check_report.is_empty() { "{}" } else { check_report },
                            ));
                        } else {
                            system_prompt.push_str(&format!(
                                "\n\n## 环境修复上下文\n\
你正在为站点「{}」修复远程服务器上的 Web 运行环境。\n\
- 需要驱动的活动终端会话 id：`{}`\n\
- 目标主机：`{}`（用户：`{}`）\n\
- 部署远程路径：`{}`\n\
- 域名：`{}`\n\
务必使用 `terminal_session` 工具，action 为 `write`，session_id 用上面的 id，并带上要执行的命令；写完后用 `read_output` 读取结果。不要使用其它 session_id。\n\
远程服务器的 sudo 密码提示会被终端自动应答 —— 正常执行 sudo 命令即可。\n\
\n\
### 环境检测报告（JSON）\n\
```json\n\
{}\n\
```\n\
\n\
工作流（严格三阶段，不要跳过或合并）：\n\
\n\
PHASE 0 — 诊断（只读，不改动系统）：阅读上面的检测报告 JSON，找出所有失败/警告项。从 `system` 分组确定发行版。按优先级排序问题（Web > SSL > 站点服务）。本阶段不要安装或修改任何东西。\n\
\n\
PHASE 1 — 汇报 + 征求同意：总结问题和修复方案（包名、针对本发行版的确切非交互命令、启用服务、验证方式）。说明风险（sudo 需求、服务重启、影响范围）。然后以**恰好一行**结束：`ENV_FIX_STATUS: need_fix` 或 `ENV_FIX_STATUS: all_good`。停在这里等待用户，不要开始修复。\n\
\n\
PHASE 2 — 仅在用户明确同意后执行修复：用户明确同意后才执行计划中的修复。按优先级逐个修复，每修复一项验证后再继续。遇到报错先读完整输出再诊断重试，不要无脑重复。失败的项跳过继续下一个。全部完成后验证所有服务运行状态，然后输出包含「修复完成」的最终总结：哪些修好了、哪些失败了、后续建议。\n\
所有安装命令遵守系统提示词中的「无人值守铁律」。\n\
语言规则：用户界面为中文 —— 请始终用简体中文回复；`ENV_FIX_STATUS:` 标记行按原样输出，语言无关。\n",
                                site_name, session_id, host, username,
                                if remote_path.is_empty() { "（未设置）" } else { remote_path },
                                if domain.is_empty() { "（未设置）" } else { domain },
                                if check_report.is_empty() { "{}" } else { check_report },
                            ));
                        }
                        // 终端会话不存活时，在 system prompt 中明确警告 Agent
                        if !session_alive {
                            if is_en {
                                system_prompt.push_str(
                                    "\n\n⚠️ CRITICAL WARNING: The terminal session is NOT available (disconnected or expired). Do NOT call terminal_session tool — it will fail with 'session not found'. Tell the user the SSH session has been lost and ask them to reopen the environment fix tool from the operations center to start a fresh session. Do NOT attempt any fixes."
                                );
                            } else {
                                system_prompt.push_str(
                                    "\n\n⚠️ 重要警告：终端会话不可用（已断开或过期）。**不要调用 terminal_session 工具**——会报 'session not found' 错误。请告知用户 SSH 会话已丢失，让他们从运维中心重新打开环境修复工具以建立新会话。不要尝试执行任何修复操作。"
                                );
                            }
                        }
                        auto_continue_rd = true;
                    }
                }
            }
        }
    }

    // 输出语言跟随用户界面语言（最终指令，放在 system prompt 最末尾最有效）。
    // 对用户自定义 System Prompt 的智能体（终端助手等）同样生效：不翻译用户 prompt 内容，
    // 只锁定回复语言。会话 metadata 由前端 AiCopilotPage 写入 lang 字段。
    if let Ok(Some(conv_meta_row)) = service.find_conversation(&conv_id) {
        if let Ok(meta) = serde_json::from_str::<serde_json::Value>(&conv_meta_row.metadata) {
            let ui_is_en = meta.get("lang").and_then(|v| v.as_str()).map(|l| l.starts_with("en")).unwrap_or(false);
            if ui_is_en {
                system_prompt.push_str("\n\nLANGUAGE RULE (final, overrides everything above): The user's UI language is English. ALWAYS write your ENTIRE reply in English, regardless of the language of the user's message or any instruction above. Keep machine-parsed markers (e.g. RD_STATUS) as specified.");
            } else {
                system_prompt.push_str("\n\n语言规则（最终指令，覆盖以上所有内容）：用户界面语言为中文，请始终用简体中文回复，无论用户消息或以上任何指令是什么语言。机器解析标记（如 RD_STATUS）保持原样。");
            }
        }
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
        // Ollama 模型预加载：环境修复通常需要较长时间，提前加载模型避免首次等待
        if is_ollama {
            let provider_clone = llm_provider_arc.clone();
            let model_name = model.ref_key.clone();
            tokio::spawn(async move {
                match provider_clone.preload_model(&model_name, "30m").await {
                    Ok(_) => tracing::info!("[env_fix] Ollama model preloaded: {}", model_name),
                    Err(e) => tracing::warn!("[env_fix] Ollama model preload failed: {}", e),
                }
            });
        }
        // 从用户消息中提取目标主机信息（简单提取）
        let target = extract_target_from_message(&message);
        engine_builder = engine_builder.with_repair_plan_target(target);

        // 从用户消息/检测报告中提取服务名，搜索历史修复经验
        let kb_dir = plugin_service.inner().data_dir()
            .join("agents").join(&agent.id);
        let kb = std::sync::Arc::new(crate::plugins::ai_agent::repair_kb::RepairKnowledgeBase::new(kb_dir));
        let kb_stats = kb.stats();

        if kb_stats.total_experiences > 0 {
            // 从消息中提取常见服务关键词
            let services_to_search = detect_services_from_message(&message);
            let mut all_experiences = Vec::new();

            for service in &services_to_search {
                let keywords: Vec<&str> = Vec::new();
                let experiences = kb.search(service, &keywords, 2);
                all_experiences.extend(experiences);
            }

            // 去重（按 id）
            all_experiences.sort_by(|a, b| a.id.cmp(&b.id));
            all_experiences.dedup_by(|a, b| a.id == b.id);

            if !all_experiences.is_empty() {
                let formatted = crate::plugins::ai_agent::repair_kb::format_experiences_for_prompt(&all_experiences);
                let enriched = format!("{}\n\n--- Repair Knowledge Base ---\n{}\n--- End KB ---",
                    system_prompt, formatted);
                engine_builder = engine_builder.with_system_prompt(enriched);
            }
        }

        // 修复进度回调：通过 Tauri 事件推送给前端
        let emit_progress = app_handle.clone();
        let conv_id_progress = conv_id.clone();
        engine_builder = engine_builder.with_repair_progress_callback(
            std::sync::Arc::new(move |plan| {
                let progress_json = serde_json::json!({
                    "conversationId": conv_id_progress,
                    "planId": plan.plan_id,
                    "target": plan.target,
                    "totalSteps": plan.total_steps,
                    "completedSteps": plan.completed_steps,
                    "failedSteps": plan.failed_steps,
                    "progressPercent": plan.progress_percent(),
                    "steps": plan.steps.iter().map(|s| serde_json::json!({
                        "index": s.index,
                        "service": s.service,
                        "description": s.description,
                        "status": s.status.as_str(),
                        "priority": format!("{:?}", s.priority).to_lowercase(),
                        "requiresSudo": s.requires_sudo,
                        "failureReason": s.failure_reason,
                        "outputSummary": s.output_summary,
                        "attempts": s.attempts.iter().map(|a| serde_json::json!({
                            "attemptNo": a.attempt_no,
                            "method": a.method,
                            "command": a.command,
                            "success": a.success,
                            "error": a.error,
                        })).collect::<Vec<_>>(),
                    })).collect::<Vec<_>>(),
                });
                if let Err(e) = emit_progress.emit("agent-repair-progress", progress_json) {
                    tracing::warn!("[run_agent] failed to emit agent-repair-progress: {}", e);
                }
            })
        );

        // 启用修复知识库自动学习
        engine_builder = engine_builder.with_repair_kb(kb.clone());
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

    let old_fingerprints: std::collections::HashSet<u64> = history.iter()
        .filter(|m| m.role == "assistant" || m.role == "tool")
        .map(|m| {
            use std::hash::{Hash, Hasher};
            let mut hasher = std::collections::hash_map::DefaultHasher::new();
            m.role.hash(&mut hasher);
            m.content.hash(&mut hasher);
            hasher.finish()
        })
        .collect();

    tracing::info!("[run_agent] history after dedup: {} messages, old_fingerprints: {}", history.len(), old_fingerprints.len());

    let persister_conv_id = conv_id.clone();
    let persister_service: Arc<AgentService> = service.inner().clone();
    let persisted_ids: Arc<std::sync::Mutex<Vec<String>>> = Arc::new(std::sync::Mutex::new(Vec::new()));
    let persisted_ids_clone = persisted_ids.clone();
    let persister_run_ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;
    let persister_asst_counter: Arc<std::sync::Mutex<u32>> = Arc::new(std::sync::Mutex::new(0));
    let persister_tool_counter: Arc<std::sync::Mutex<u32>> = Arc::new(std::sync::Mutex::new(0));

    let message_persister = Arc::new(move |pm: crate::plugins::ai_agent::engine::PersistMessage| {
        if pm.role == "system_compaction" {
            if let Err(e) = persister_service.update_compaction_summary(&persister_conv_id, &pm.content) {
                tracing::warn!("[run_agent] persister: failed to update compaction summary: {}", e);
            }
            return;
        }
        let msg_id = if pm.role == "tool" {
            let tc_id = pm.tool_call_id.as_deref().filter(|s| !s.is_empty());
            if let Some(id) = tc_id {
                format!("tool-{}-{}", persister_conv_id, id)
            } else {
                let counter = match persister_tool_counter.lock() {
                    Ok(mut guard) => {
                        let c = *guard;
                        *guard += 1;
                        c
                    }
                    Err(_) => return,
                };
                tracing::warn!("[run_agent] persister: tool_call_id is empty for tool message, using counter={}", counter);
                format!("tool-{}-auto-{}", persister_conv_id, counter)
            }
        } else {
            let counter = match persister_asst_counter.lock() {
                Ok(mut guard) => {
                    let c = *guard;
                    *guard += 1;
                    c
                }
                Err(_) => return,
            };
            let id = format!("asst-{}-{}-{}", persister_conv_id, persister_run_ts, counter);
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
        match persister_service.save_message(AiMessageRow {
            id: msg_id,
            conversation_id: persister_conv_id.clone(),
            role: pm.role.clone(),
            content: pm.content.clone(),
            tool_calls: tool_calls_str,
            is_error: if pm.is_error { 1 } else { 0 },
            created_at: msg_created_at,
        }) {
            Ok(()) => {
                tracing::info!("[run_agent] persister: saved message id={}, role={}, conv_id={}", id_for_track, pm.role, persister_conv_id);
                if let Ok(mut ids) = persisted_ids_clone.lock() {
                    ids.push(id_for_track);
                }
            }
            Err(e) => {
                tracing::error!("[run_agent] persister: FAILED to save message id={}, role={}, conv_id={}, error={}", id_for_track, pm.role, persister_conv_id, e);
            }
        }
    });

    let mut engine = engine.with_message_persister(message_persister);

    // 记忆相关性检索：基于用户消息搜索相关记忆，注入到对话上下文中
    // 这样比全部加载更节省 token，且更有针对性
    let enhanced_message = if agent_uses_tool("memory") {
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

    let emit_handle = app_handle.clone();
    let conv_id_clone = conv_id.clone();
    let emit_compaction = app_handle.clone();
    let conv_id_compaction = conv_id.clone();
    let emit_tool = app_handle.clone();
    let conv_id_tool = conv_id.clone();
    let emit_status = app_handle.clone();
    let conv_id_status = conv_id.clone();
    // 标记会话为运行中
    if let Err(e) = service.update_conversation_status(&conv_id, "running") {
        tracing::warn!("[run_agent] failed to set conversation status to running: {}", e);
    }

    let chunk_counter = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let chunk_counter_clone = chunk_counter.clone();
    let conv_id_for_chunk_log = conv_id.clone();

    tracing::info!("[run_agent] starting engine.run, conv_id={}", conv_id);
    debug_log::env_ops("INFO", &run_id, "agent_run", "engine_start",
        &format!("conv_id={} tools_enabled={} max_iterations={}", conv_id, !skip_tools, agent.max_iterations));

    let result = engine.run(&enhanced_message, history,
        move |chunk| {
            let count = chunk_counter_clone.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            if count == 0 {
                tracing::info!("[run_agent] first chunk received, conv_id={}, chunk_preview={:?}",
                    conv_id_for_chunk_log, crate::plugins::ai_agent::engine::truncate_bytes(&chunk, 60));
            }
            if chunk.starts_with("[Auto-compacting") || chunk.starts_with("[Compacted:") || chunk.starts_with("[Compaction") || chunk.starts_with("[Context too long") {
                if let Err(e) = emit_compaction.emit("agent-compaction", serde_json::json!({
                    "conversationId": conv_id_compaction,
                    "message": chunk.trim(),
                })) {
                    tracing::warn!("[run_agent] failed to emit agent-compaction: {}", e);
                }
            }
            if let Err(e) = emit_handle.emit("agent-chunk", serde_json::json!({
                "conversationId": conv_id_clone,
                "chunk": chunk,
            })) {
                tracing::warn!("[run_agent] failed to emit agent-chunk: {}", e);
            }
        },
        move |tool_event| {
            if let Err(e) = emit_tool.emit("agent-tool-call", serde_json::json!({
                "conversationId": conv_id_tool,
                "toolCall": tool_event,
            })) {
                tracing::warn!("[run_agent] failed to emit agent-tool-call: {}", e);
            }
        },
        move |status_event| {
            if let Err(e) = emit_status.emit("agent-status", serde_json::json!({
                "conversationId": conv_id_status,
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
        },
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
            // Counter that mirrors the incremental persister's counter.
            // The incremental persister starts at 0 and increments per NEW assistant message.
            // The final sweep must generate IDs that match the ones already saved,
            // so the already_persisted check can correctly skip them.
            let mut final_sweep_asst_idx: u32 = 0;
            let mut final_sweep_tool_idx: u32 = 0;
            for msg in &run_result.messages {
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
                        format!("asst-{}-{}-{}", conv_id, persister_run_ts, idx)
                    };
                    if already_persisted.contains(&expected_id) {
                        continue;
                    }
                    let run_ts = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis() as i64;
                    let tool_calls_str = msg.tool_calls.as_ref()
                        .map(|tc| serde_json::to_string(tc).unwrap_or_default())
                        .unwrap_or_default();
                    let id_for_log = expected_id.clone();
                    match service.save_message(AiMessageRow {
                        id: expected_id,
                        conversation_id: conv_id.clone(),
                        role: msg.role.clone(),
                        content: msg.content.clone(),
                        tool_calls: tool_calls_str,
                        is_error: 0,
                        created_at: run_ts,
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
