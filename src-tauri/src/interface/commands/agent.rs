use std::sync::Arc;
use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use tauri::{State, Emitter};
use tokio_util::sync::CancellationToken;

use crate::app::agent_service::AgentService;
use crate::app::plugin_service::PluginService;
use crate::infra::logging::debug_log;
use crate::infra::storage::agent_repo::{
    AiProviderRow, AiEndpointRow, AiModelRow, AiAgentRow,
    AiConversationRow, AiMessageRow,
};

static CANCEL_TOKENS: std::sync::LazyLock<tokio::sync::Mutex<HashMap<String, CancellationToken>>> =
    std::sync::LazyLock::new(|| tokio::sync::Mutex::new(HashMap::new()));

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderDto {
    pub id: String,
    pub name: String,
    pub api_key: String,
    pub logo: String,
    pub enabled: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EndpointDto {
    pub id: String,
    pub provider_id: String,
    pub name: String,
    pub api_type: String,
    pub base_url: String,
    pub auth_type: String,
    pub custom_auth_header: String,
    pub enabled: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelDto {
    pub id: String,
    pub name: String,
    pub ref_key: String,
    pub endpoint_id: String,
    pub reasoning: bool,
    pub input_types: Vec<String>,
    pub context_window: i64,
    pub max_tokens: i64,
    pub enabled: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentDto {
    pub id: String,
    pub name: String,
    pub description: String,
    pub model_id: Option<String>,
    pub system_prompt: String,
    pub temperature: f64,
    pub max_iterations: i32,
    pub tool_ids: Vec<String>,
    pub trigger_type: String,
    pub auto_confirm: bool,
    pub permission_mode: String,
    pub always_allowed_tools: Vec<String>,
    pub fallback_model_id: Option<String>,
    pub workspace_dir: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationDto {
    pub id: String,
    pub agent_id: String,
    pub title: String,
    pub metadata: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageDto {
    pub id: String,
    pub conversation_id: String,
    pub role: String,
    pub content: String,
    pub tool_calls: String,
    pub is_error: i32,
    pub created_at: i64,
}

fn to_provider_dto(p: &AiProviderRow) -> ProviderDto {
    ProviderDto {
        id: p.id.clone(),
        name: p.name.clone(),
        api_key: p.api_key.clone(),
        logo: p.logo.clone(),
        enabled: p.enabled,
        created_at: p.created_at,
        updated_at: p.updated_at,
    }
}

fn to_endpoint_dto(e: &AiEndpointRow) -> EndpointDto {
    EndpointDto {
        id: e.id.clone(),
        provider_id: e.provider_id.clone(),
        name: e.name.clone(),
        api_type: e.api_type.clone(),
        base_url: e.base_url.clone(),
        auth_type: e.auth_type.clone(),
        custom_auth_header: e.custom_auth_header.clone(),
        enabled: e.enabled,
        created_at: e.created_at,
        updated_at: e.updated_at,
    }
}

fn to_model_dto(m: &AiModelRow) -> ModelDto {
    ModelDto {
        id: m.id.clone(),
        name: m.name.clone(),
        ref_key: m.ref_key.clone(),
        endpoint_id: m.endpoint_id.clone(),
        reasoning: m.reasoning,
        input_types: m.input_types.clone(),
        context_window: m.context_window,
        max_tokens: m.max_tokens,
        enabled: m.enabled,
        created_at: m.created_at,
        updated_at: m.updated_at,
    }
}

/// 从检测报告/用户消息中检测涉及的服务名称
fn detect_services_from_message(message: &str) -> Vec<String> {
    let lower = message.to_lowercase();
    let mut services = Vec::new();

    // 按优先级检测常见服务
    if lower.contains("nginx") {
        services.push("Nginx".to_string());
    }
    if lower.contains("postgresql") || lower.contains("postgres") || lower.contains("pgsql") {
        services.push("PostgreSQL".to_string());
    }
    if lower.contains("redis") {
        services.push("Redis".to_string());
    }
    if lower.contains("ssl") || lower.contains("certbot") || lower.contains("https") || lower.contains("证书") {
        services.push("SSL".to_string());
    }
    if lower.contains("php") {
        services.push("PHP".to_string());
    }
    if lower.contains("node") || lower.contains("nodejs") {
        services.push("Node.js".to_string());
    }

    services
}

/// 从用户消息中提取目标主机描述（用于修复计划标题）
fn extract_target_from_message(message: &str) -> String {
    // 找 "session_id" 或 "会话" 附近的信息
    if let Some(idx) = message.find("session_id:") {
        let after = &message[idx + "session_id:".len()..];
        let end = after.find(|c: char| c.is_whitespace() || c == '\n').unwrap_or(after.len());
        let sid = crate::plugins::ai_agent::engine::truncate_bytes(after, end.min(50)).trim();
        if !sid.is_empty() {
            return format!("Session {}", sid);
        }
    }

    if let Some(idx) = message.find("主机") {
        let after = &message[idx + "主机".len()..];
        let end = after.find(|c: char| c == '\n' || c == '。' || c == '，')
            .unwrap_or(after.len());
        let host = crate::plugins::ai_agent::engine::truncate_bytes(after, end.min(30)).trim();
        if !host.is_empty() {
            return host.to_string();
        }
    }

    // 默认取前 40 个字符（UTF-8 边界安全，按字符数截断）
    let trimmed = message.trim();
    if trimmed.chars().count() <= 40 {
        trimmed.to_string()
    } else {
        format!("{}...", crate::plugins::ai_agent::engine::truncate_chars(trimmed, 40))
    }
}

fn to_agent_dto(a: &AiAgentRow) -> AgentDto {
    AgentDto {
        id: a.id.clone(),
        name: a.name.clone(),
        description: a.description.clone(),
        model_id: a.model_id.clone(),
        system_prompt: a.system_prompt.clone(),
        temperature: a.temperature,
        max_iterations: a.max_iterations,
        tool_ids: a.tool_ids.clone(),
        trigger_type: a.trigger_type.clone(),
        auto_confirm: a.auto_confirm,
        permission_mode: a.permission_mode.clone(),
        always_allowed_tools: a.always_allowed_tools.clone(),
        fallback_model_id: a.fallback_model_id.clone(),
        workspace_dir: a.workspace_dir.clone(),
        created_at: a.created_at,
        updated_at: a.updated_at,
    }
}

fn to_conversation_dto(c: &AiConversationRow) -> ConversationDto {
    ConversationDto {
        id: c.id.clone(),
        agent_id: c.agent_id.clone(),
        title: c.title.clone(),
        metadata: c.metadata.clone(),
        created_at: c.created_at,
        updated_at: c.updated_at,
    }
}

fn to_message_dto(m: &AiMessageRow) -> MessageDto {
    MessageDto {
        id: m.id.clone(),
        conversation_id: m.conversation_id.clone(),
        role: m.role.clone(),
        content: m.content.clone(),
        tool_calls: m.tool_calls.clone(),
        is_error: m.is_error,
        created_at: m.created_at,
    }
}

#[tauri::command]
pub fn list_providers(service: State<'_, Arc<AgentService>>) -> Result<Vec<ProviderDto>, String> {
    let providers = service.list_providers()?;
    Ok(providers.iter().map(to_provider_dto).collect())
}

#[tauri::command]
pub fn save_provider(service: State<'_, Arc<AgentService>>, provider: ProviderDto) -> Result<(), String> {
    service.save_provider(AiProviderRow {
        id: provider.id,
        name: provider.name,
        api_key: provider.api_key,
        logo: provider.logo,
        enabled: provider.enabled,
        created_at: provider.created_at,
        updated_at: provider.updated_at,
    })
}

#[tauri::command]
pub fn delete_provider(service: State<'_, Arc<AgentService>>, id: String) -> Result<(), String> {
    service.delete_provider(&id)
}

#[tauri::command]
pub fn list_endpoints(service: State<'_, Arc<AgentService>>) -> Result<Vec<EndpointDto>, String> {
    let endpoints = service.list_endpoints()?;
    Ok(endpoints.iter().map(to_endpoint_dto).collect())
}

#[tauri::command]
pub fn list_endpoints_by_provider(service: State<'_, Arc<AgentService>>, provider_id: String) -> Result<Vec<EndpointDto>, String> {
    let endpoints = service.list_endpoints_by_provider(&provider_id)?;
    Ok(endpoints.iter().map(to_endpoint_dto).collect())
}

#[tauri::command]
pub fn save_endpoint(service: State<'_, Arc<AgentService>>, endpoint: EndpointDto) -> Result<(), String> {
    service.save_endpoint(AiEndpointRow {
        id: endpoint.id,
        provider_id: endpoint.provider_id,
        name: endpoint.name,
        api_type: endpoint.api_type,
        base_url: endpoint.base_url,
        auth_type: endpoint.auth_type,
        custom_auth_header: endpoint.custom_auth_header,
        enabled: endpoint.enabled,
        created_at: endpoint.created_at,
        updated_at: endpoint.updated_at,
    })
}

#[tauri::command]
pub fn delete_endpoint(service: State<'_, Arc<AgentService>>, id: String) -> Result<(), String> {
    service.delete_endpoint(&id)
}

#[tauri::command]
pub fn list_models(service: State<'_, Arc<AgentService>>) -> Result<Vec<ModelDto>, String> {
    let models = service.list_models()?;
    Ok(models.iter().map(to_model_dto).collect())
}

#[tauri::command]
pub fn list_models_by_endpoint(service: State<'_, Arc<AgentService>>, endpoint_id: String) -> Result<Vec<ModelDto>, String> {
    let models = service.list_models_by_endpoint(&endpoint_id)?;
    Ok(models.iter().map(to_model_dto).collect())
}

#[tauri::command]
pub fn save_model(service: State<'_, Arc<AgentService>>, model: ModelDto) -> Result<(), String> {
    service.save_model(AiModelRow {
        id: model.id,
        name: model.name,
        ref_key: model.ref_key,
        endpoint_id: model.endpoint_id,
        reasoning: model.reasoning,
        input_types: model.input_types,
        context_window: model.context_window,
        max_tokens: model.max_tokens,
        enabled: model.enabled,
        created_at: model.created_at,
        updated_at: model.updated_at,
    })
}

#[tauri::command]
pub fn delete_model(service: State<'_, Arc<AgentService>>, id: String) -> Result<(), String> {
    service.delete_model(&id)
}

#[tauri::command]
pub async fn test_endpoint_connection(service: State<'_, Arc<AgentService>>, endpoint_id: String) -> Result<String, String> {
    service.test_endpoint_connection(&endpoint_id).await
}

#[tauri::command]
pub async fn test_model_chat(service: State<'_, Arc<AgentService>>, model_id: String) -> Result<String, String> {
    service.test_model_chat(&model_id).await
}

#[tauri::command]
pub async fn scan_ollama_models(service: State<'_, Arc<AgentService>>, base_url: String) -> Result<Vec<OllamaModelInfoDto>, String> {
    let models = service.scan_ollama_models(&base_url).await?;
    Ok(models.into_iter().map(|m| OllamaModelInfoDto {
        name: m.name,
        ref_key: m.ref_key,
        size: m.size,
        modified_at: m.modified_at,
        parameter_size: m.parameter_size,
        quantization_level: m.quantization_level,
        family: m.family,
    }).collect())
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OllamaModelInfoDto {
    pub name: String,
    pub ref_key: String,
    pub size: u64,
    pub modified_at: String,
    pub parameter_size: String,
    pub quantization_level: String,
    pub family: String,
}

#[tauri::command]
pub async fn check_ollama_status(
    service: State<'_, Arc<AgentService>>,
    base_url: String,
    model_name: Option<String>,
) -> Result<OllamaStatusDto, String> {
    let info = service.check_ollama_status(&base_url, model_name.as_deref()).await?;
    Ok(OllamaStatusDto {
        service_available: info.service_available,
        version: info.version,
        model_loaded: info.model_loaded,
        model_name: info.model_name,
        running_models: info.running_models,
        error: info.error,
    })
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OllamaStatusDto {
    pub service_available: bool,
    pub version: String,
    pub model_loaded: bool,
    pub model_name: String,
    pub running_models: Vec<String>,
    pub error: Option<String>,
}

#[tauri::command]
pub fn list_agents(service: State<'_, Arc<AgentService>>) -> Result<Vec<AgentDto>, String> {
    let agents = service.list_agents()?;
    Ok(agents.iter().map(to_agent_dto).collect())
}

#[tauri::command]
pub fn save_agent(service: State<'_, Arc<AgentService>>, agent: AgentDto) -> Result<(), String> {
    service.save_agent(AiAgentRow {
        id: agent.id,
        name: agent.name,
        description: agent.description,
        model_id: agent.model_id,
        system_prompt: agent.system_prompt,
        temperature: agent.temperature,
        max_iterations: agent.max_iterations,
        tool_ids: agent.tool_ids,
        trigger_type: agent.trigger_type,
        auto_confirm: agent.auto_confirm,
        permission_mode: agent.permission_mode,
        always_allowed_tools: agent.always_allowed_tools,
        fallback_model_id: agent.fallback_model_id,
        workspace_dir: agent.workspace_dir,
        created_at: agent.created_at,
        updated_at: agent.updated_at,
    })
}

#[tauri::command]
pub fn delete_agent(service: State<'_, Arc<AgentService>>, id: String) -> Result<(), String> {
    service.delete_agent(&id)
}

#[tauri::command]
pub fn list_conversations(service: State<'_, Arc<AgentService>>, agent_id: String) -> Result<Vec<ConversationDto>, String> {
    let convs = service.list_conversations(&agent_id)?;
    Ok(convs.iter().map(to_conversation_dto).collect())
}

#[tauri::command]
pub fn create_conversation(service: State<'_, Arc<AgentService>>, agent_id: String, title: String, metadata: Option<String>) -> Result<ConversationDto, String> {
    let meta = metadata.unwrap_or_else(|| "{}".to_string());
    let conv = service.create_conversation_with_metadata(&agent_id, &title, &meta)?;
    Ok(to_conversation_dto(&conv))
}

#[tauri::command]
pub fn delete_conversation(service: State<'_, Arc<AgentService>>, id: String) -> Result<(), String> {
    service.delete_conversation(&id)
}

#[tauri::command]
pub fn cleanup_old_conversations(
    service: State<'_, Arc<AgentService>>,
    agent_id: String,
    keep_count: i64,
    max_age_days: Option<i64>,
) -> Result<i64, String> {
    service.cleanup_old_conversations(&agent_id, keep_count, max_age_days)
}

#[tauri::command]
pub fn update_conversation_title(service: State<'_, Arc<AgentService>>, id: String, title: String) -> Result<(), String> {
    service.update_conversation_title(&id, &title)
}

#[tauri::command]
pub fn list_messages(service: State<'_, Arc<AgentService>>, conversation_id: String) -> Result<Vec<MessageDto>, String> {
    let msgs = service.list_messages(&conversation_id)?;
    Ok(msgs.iter().map(to_message_dto).collect())
}

#[tauri::command]
pub fn save_message(service: State<'_, Arc<AgentService>>, msg: MessageDto) -> Result<(), String> {
    service.save_message(AiMessageRow {
        id: msg.id,
        conversation_id: msg.conversation_id,
        role: msg.role,
        content: msg.content,
        tool_calls: msg.tool_calls,
        is_error: msg.is_error,
        created_at: msg.created_at,
    })
}

#[tauri::command]
pub fn delete_messages_after(service: State<'_, Arc<AgentService>>, conversation_id: String, after_message_id: String) -> Result<(), String> {
    service.delete_messages_after(&conversation_id, &after_message_id)
}

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

    let config = crate::plugins::ai_agent::provider::ProviderConfig {
        api_key: provider.api_key.clone(),
        base_url: endpoint.base_url.clone(),
        api_type: endpoint.api_type.clone(),
        auth_type: endpoint.auth_type.clone(),
        custom_auth_header: endpoint.custom_auth_header.clone(),
    };

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

static PENDING_PERMISSIONS: std::sync::LazyLock<tokio::sync::Mutex<HashMap<String, (tokio::sync::oneshot::Sender<(bool, bool)>, String, String)>>> =
    std::sync::LazyLock::new(|| tokio::sync::Mutex::new(HashMap::new()));

#[tauri::command]
pub async fn respond_permission(
    conversation_id: String,
    approved: bool,
    always_allow: bool,
    service: State<'_, Arc<AgentService>>,
) -> Result<(), String> {
    let mut pending = PENDING_PERMISSIONS.lock().await;
    if let Some((tx, agent_id, tool_name)) = pending.remove(&conversation_id) {
        let _ = tx.send((approved, always_allow));

        if approved && always_allow {
            if let Ok(mut agents) = service.list_agents() {
                if let Some(agent) = agents.iter_mut().find(|a| a.id == agent_id) {
                    if !agent.always_allowed_tools.contains(&tool_name) {
                        let tool_name_clone = tool_name.clone();
                        agent.always_allowed_tools.push(tool_name);
                        if let Err(e) = service.save_agent(agent.clone()) {
                            tracing::error!("[respond_permission] failed to persist always_allowed for agent '{}', tool '{}': {}", agent_id, tool_name_clone, e);
                        }
                    }
                }
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn update_agent_allowed_tools(
    agent_id: String,
    always_allowed_tools: Vec<String>,
    service: State<'_, Arc<AgentService>>,
) -> Result<(), String> {
    let mut agents = service.list_agents()?;
    let agent = agents.iter_mut().find(|a| a.id == agent_id)
        .ok_or_else(|| format!("Agent '{}' not found", agent_id))?;
    agent.always_allowed_tools = always_allowed_tools;
    service.save_agent(agent.clone())
}

/// 专用「远程桌面安装助手」Agent 的固定 id（幂等播种，避免重复插入）。
const RD_SETUP_AGENT_ID: &str = "rd-setup-assistant";

/// 该 Agent 的领域提示词：指导其通过 terminal_session 在远程服务器上安装/配置 VNC。
/// 安装内容（无桌面 / 基础桌面 / 全量）由 run_agent 注入的「Install Mode」区块动态指定，
/// 用户可在设置指南中选择；除安装外，助手也可协助其它远程维护操作（改密码、查端口等）。
/// 中文版（默认）；英文版见 RD_SETUP_SYSTEM_PROMPT_EN，按会话语言（metadata.rdSetup.lang）选择。
const RD_SETUP_SYSTEM_PROMPT_ZH: &str = r#"你是「远程桌面安装助手」，专门帮助用户在远程 Linux 服务器上安装并配置 VNC 远程桌面（TigerVNC），以便本应用的远程桌面功能通过 VNC 连接过去进行图形化操作。

## 工作环境
- 你通过 `terminal_session` 工具操作一个已经建立好的远程服务器 SSH 终端会话。
- 会话 id、目标主机、用户名以及「安装模式」会在「Remote Desktop Setup Context」区块里提供，请严格使用该 session_id，不要编造其它 id。
- 该 SSH 会话的 sudo 密码提示会被终端自动应答，直接正常执行 sudo 命令即可，无需交互输入密码。
- 工具自带安全护栏，会拦截 `rm -rf /`、`mkfs`、`dd if=`、`fork 炸弹`、`> /dev/sd` 等危险命令；你也应避免任何破坏性操作。

## 工作步骤（按此推进）
1. 探测环境：用 `terminal_session` 的 `write` 执行 `cat /etc/os-release` 与 `uname -m`，再用 `read_output` 读取结果，判断发行版与架构。
2. 根据「Remote Desktop Setup Context」中的安装模式（Install Mode）决定安装内容：
   - `headless`（无桌面版）：只安装 VNC Server 与 xterm，不装桌面环境，连接后进入一个远程终端窗口。
   - `basic`（基础桌面版）：安装 VNC Server + XFCE 轻量桌面（最小依赖）。
   - `full`（全量安装）：安装 VNC Server + XFCE 桌面 + 常用应用。
   具体包清单见 Context 的「Install Mode」区块；安装命令必须遵守下方「无人值守铁律」。

## 无人值守铁律（CRITICAL —— 任何会停下来问的命令都是 bug，终端只自动应答 sudo 密码提示）
- Debian/Ubuntu（xfce4 会拉进 keyboard-configuration/tzdata，debconf 交互会卡死安装，务必全套护栏）：
  1) 先自愈上次中断留下的半配置态（`;` 非致命）：`sudo dpkg --configure -a;`
  2) 预置键盘布局（仅在包未装时喂，绝不覆盖已有布局；**不要预置 tzdata**，noninteractive 本就保留原时区）：
     `if ! dpkg -s keyboard-configuration >/dev/null 2>&1; then echo 'keyboard-configuration keyboard-configuration/layout select us' | sudo debconf-set-selections; fi;`
  3) 主安装（整条**单行**；`sudo env` 用真二进制，绕过 sudoers 无 SETENV 时拒绝命令行变量）：
     `sudo env DEBIAN_FRONTEND=noninteractive DEBIAN_PRIORITY=critical NEEDRESTART_MODE=l apt-get -o DPkg::Lock::Timeout=600 -o Acquire::Retries=3 -y --force-confdef --force-confold --no-install-recommends update && sudo env DEBIAN_FRONTEND=noninteractive DEBIAN_PRIORITY=critical NEEDRESTART_MODE=l apt-get -o DPkg::Lock::Timeout=600 -o Acquire::Retries=3 -y --force-confdef --force-confold --no-install-recommends install <packages>`
  - 用 `apt-get` 而非 `apt`（apt 的重绘进度条会让终端日志不可读）。
- RHEL/CentOS：`sudo dnf install -y <packages>`；若报 `No match for argument: xfce4`（RHEL 9 桌面依赖 CRB 仓库），先 `sudo dnf config-manager --set-enabled crb` 再重试。
- Arch：`sudo pacman -S --noconfirm <packages>`
- SUSE：`sudo zypper --non-interactive --gpg-auto-import-keys install --auto-agree-with-licenses <packages>`（`--non-interactive` 必须在子命令**之前**）
- Gentoo：`sudo emerge --ask=n <packages>`（**绝不能用 `--ask`，那会停下来问**）
- Void：`sudo xbps-install -Sy <packages>`
- Solus：`sudo eopkg install -y <packages>`
- Alpine：`sudo apk add --no-interactive <packages>`
- 其它发行版：先探测包管理器（`which apt` / `dnf` / `yum` / `pacman` / `zypper` / `emerge` / `xbps-install` / `eopkg` / `apk`），再查其无人值守开关。
- **禁止**给命令加 `< /dev/null` 重定向——会掐断 sudo 密码自动应答，导致永久阻塞。
- 安装命令必须**单行、可自动结束**；`update && install` 保持 `&&`，让 install 的退出码留在链尾。
3. 配置 VNC 密码：使用**用户在确认安装时提供的 VNC 密码**（PHASE 1 询问得到）。执行 `vncpasswd`，交互序列：提示 `Password:` 发送该密码 → 提示 `Verify:` 再发一次 → **若出现 view-only password 提示（`Would you like to enter a view-only password (y/n)?`）发送 `n`**。除密码提示外的任何提示都不要继续输入。若用户未提供密码，生成一个简单的（8 位左右），设置后**在最终总结里醒目告知用户**。
4. 写入 `~/.vnc/xstartup`（先 `mkdir -p ~/.vnc` 确保目录存在，避免步骤顺序变化时失败）：
   - headless 模式：启动 `xterm`（如 `xterm -geometry 160x50`）；
   - basic / full 模式：启动 XFCE（`exec startxfce4`）。
   并用 `chmod +x ~/.vnc/xstartup`。
5. 启动 VNC 服务：`vncserver :1 -geometry 1280x720`，并确认监听端口（默认 5901）。可用 `ss -ltnp 2>/dev/null | grep 590` 验证。
6. 完成后用 `read_output` 复核：确认 `vncserver` / `Xtigervnc` 进程存在、5901 端口在监听、vncpasswd 已设置；**若 PHASE 0 显示端口未开放（PORT_CLOSED）而装完仍不通，提醒用户放行 5901 的防火墙/云安全组规则**。

## 输出规范
- 每执行一步先简要说明要做什么，再调用工具。
- 遇到报错先 `read_output` 看完整信息，判断是网络/依赖/权限问题，给出修复命令重试；不要无脑重复同一条命令。
- 全部完成后，明确告诉用户：安装配置已完成，请回到设置指南点击「重新检查」以刷新状态并连接。

## 注意
- 只使用 `terminal_session` 工具，不要尝试其它工具。
- 主要职责是安装/配置 VNC；除此之外，当用户请求其它远程服务器维护操作（如修改密码、查看端口占用、解释命令、清理磁盘等）时，也通过 terminal_session 正常协助执行。
- 语言：始终用简体中文回复（用户的界面语言为中文）；`RD_STATUS:` 标记行按原样输出，语言无关。
"#;

/// 英文版（会话语言为 en 时由 seed 写入 / run_agent 动态选用）。
const RD_SETUP_SYSTEM_PROMPT_EN: &str = r#"You are the "Remote Desktop Setup Assistant", helping users install and configure a VNC remote desktop (TigerVNC) on a remote Linux server, so the app's Remote Desktop feature can connect via VNC for graphical access.

## Working Environment
- You operate an already-established SSH terminal session on the remote server via the `terminal_session` tool.
- The session id, target host, username, and the "Install Mode" are provided in the "Remote Desktop Setup Context" block — strictly use that session_id, never invent another.
- The SSH session's sudo password prompts are auto-answered by the terminal session, so run sudo commands normally without interactive password entry.
- The tool has built-in safety guards that block `rm -rf /`, `mkfs`, `dd if=`, fork bombs, `> /dev/sd`, etc.; you must also avoid any destructive operation.

## Steps (proceed in this order)
1. Probe the environment: use `terminal_session` action `write` to run `cat /etc/os-release` and `uname -m`, then `read_output` to determine the distro and architecture.
2. Pick the packages per the "Install Mode" from the "Remote Desktop Setup Context":
   - `headless` (no desktop): VNC Server + xterm only, no desktop environment; connection lands in a remote terminal window.
   - `basic` (basic desktop): VNC Server + minimal XFCE (e.g. `--no-install-recommends xfce4 xfce4-terminal`).
   - `full` (full install): VNC Server + XFCE desktop + common apps (xfce4, xfce4-terminal, thunar, etc.).
   The exact package list is in the "Install Mode" block of the Context. Install commands MUST follow the "Non-interactive HARD RULES" below.

## Non-interactive HARD RULES (CRITICAL — any command that stops to ask is a bug; the terminal only auto-answers sudo password prompts)
- Debian/Ubuntu (xfce4 pulls in keyboard-configuration/tzdata whose debconf prompts can freeze the install; use the full guardrail chain):
  1) Self-heal a half-configured state left by an interrupted install (`;` non-fatal): `sudo dpkg --configure -a;`
  2) Pre-seed the keyboard layout (only if the package is not installed; never overwrite an existing layout; **do NOT pre-seed tzdata** — noninteractive already keeps the original timezone):
     `if ! dpkg -s keyboard-configuration >/dev/null 2>&1; then echo 'keyboard-configuration keyboard-configuration/layout select us' | sudo debconf-set-selections; fi;`
  3) Main install (single line; `sudo env` uses the real binary, bypassing sudoers lacking SETENV):
     `sudo env DEBIAN_FRONTEND=noninteractive DEBIAN_PRIORITY=critical NEEDRESTART_MODE=l apt-get -o DPkg::Lock::Timeout=600 -o Acquire::Retries=3 -y --force-confdef --force-confold --no-install-recommends update && sudo env DEBIAN_FRONTEND=noninteractive DEBIAN_PRIORITY=critical NEEDRESTART_MODE=l apt-get -o DPkg::Lock::Timeout=600 -o Acquire::Retries=3 -y --force-confdef --force-confold --no-install-recommends install <packages>`
  - Use `apt-get`, never `apt` (apt's redrawn progress bar makes the terminal log unreadable).
- RHEL/CentOS: `sudo dnf install -y <packages>`; if you get `No match for argument: xfce4` (RHEL 9 desktops need the CRB repo), run `sudo dnf config-manager --set-enabled crb` first and retry.
- Arch: `sudo pacman -S --noconfirm <packages>`
- SUSE: `sudo zypper --non-interactive --gpg-auto-import-keys install --auto-agree-with-licenses <packages>` (`--non-interactive` must come BEFORE the subcommand)
- Gentoo: `sudo emerge --ask=n <packages>` (**never `--ask`**, it stops to ask)
- Void: `sudo xbps-install -Sy <packages>`
- Solus: `sudo eopkg install -y <packages>`
- Alpine: `sudo apk add --no-interactive <packages>`
- Other distros: probe the package manager first (`which apt` / `dnf` / `yum` / `pacman` / `zypper` / `emerge` / `xbps-install` / `eopkg` / `apk`), then find its non-interactive flag.
- **NEVER** append `< /dev/null` to commands — it kills the sudo password auto-answer and causes a permanent block.
- Install commands must be **single-line and self-terminating**; keep `update && install` chained with `&&` so the install exit code stays at the end.
3. Set the VNC password: use **the VNC password the user provided when consenting** (asked in PHASE 1). Run `vncpasswd`; interaction: on `Password:` send that password, on `Verify:` send it again, **and if asked about a view-only password (`Would you like to enter a view-only password (y/n)?`) answer `n`**. Never type anything for prompts other than the password prompts. If the user did not provide a password, generate a simple one (~8 chars) and **state it clearly in the final summary**.
4. Write `~/.vnc/xstartup` (first `mkdir -p ~/.vnc` to ensure the directory exists):
   - headless mode: launch `xterm` (e.g. `xterm -geometry 160x50`);
   - basic / full mode: launch XFCE (`exec startxfce4`).
   Then `chmod +x ~/.vnc/xstartup`.
5. Start the VNC server: `vncserver :1 -geometry 1280x720`, confirm the listening port (5901 by default) with `ss -ltnp 2>/dev/null | grep 590`.
6. After finishing, `read_output` to verify: `vncserver`/`Xtigervnc` process exists, port 5901 is listening, and vncpasswd is set; **if PHASE 0 reported PORT_CLOSED and it still does not connect after install, remind the user to open port 5901 in the firewall/cloud security group**.

## Output Style
- Before each step, briefly say what you are about to do, then call the tool.
- On errors, `read_output` first to see the full message, diagnose (network/dependency/permission), and retry with a fixed command; do not blindly repeat the same command.
- When everything is done, tell the user clearly: installation is complete — go back to the setup guide and click "Re-check" to refresh the status and connect.

## Notes
- Only use the `terminal_session` tool; do not try other tools.
- Your main job is installing/configuring VNC; in addition, when the user asks for other remote-server maintenance (changing passwords, checking port usage, explaining commands, cleaning disk, etc.), assist them via `terminal_session` as normal.
- Language: the user's UI language is English — ALWAYS reply entirely in English; the `RD_STATUS:` marker line is machine-parsed and stays exactly as specified.
"#;

/// 确保「远程桌面安装助手」Agent 存在（幂等）。该 Agent 仅拥有 `terminal_session` 工具，
/// 且其 `always_allowed_tools` 含 `terminal_session`（配合 `permission_mode=auto`），因此驱动设置指南
/// 里的 SSH 终端时不会每次弹出权限确认。返回该 Agent 的固定 id。
#[tauri::command]
pub fn ensure_remote_desktop_setup_agent(
    model_id: Option<String>,
    lang: Option<String>,
    service: State<'_, Arc<AgentService>>,
) -> Result<String, String> {
    fn now_ms() -> i64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64
    }

    // 按会话语言选择提示词版本（en → 英文，其余 → 中文）。
    let system_prompt = if lang.as_deref().map(|l| l.starts_with("en")).unwrap_or(false) {
        RD_SETUP_SYSTEM_PROMPT_EN
    } else {
        RD_SETUP_SYSTEM_PROMPT_ZH
    };

    // 已存在则强制修复关键接线字段，避免早期残存的旧记录（tool_ids 为空 / 权限未授予）
    // 导致 agent 调不动 terminal_session（表现为 Tool '' is not available、左侧终端无输出）。
    // 保留用户可改的 name/description/model_id/created_at；强制覆盖功能性接线字段。
    if let Some(mut existing) = service.get_agent_by_id(RD_SETUP_AGENT_ID)? {
        existing.tool_ids = vec!["terminal_session".to_string()];
        existing.always_allowed_tools = vec!["terminal_session".to_string()];
        existing.permission_mode = "auto".to_string();
        existing.auto_confirm = true;
        existing.trigger_type = "manual".to_string();
        existing.system_prompt = system_prompt.to_string();
        existing.temperature = 0.2;
        existing.max_iterations = 80;
        existing.fallback_model_id = None;
        existing.workspace_dir = crate::plugins::ai_agent::file_tool::get_default_workspace_dir(RD_SETUP_AGENT_ID)
            .to_string_lossy()
            .to_string();
        existing.updated_at = now_ms();
        service.save_agent(existing)?;
        return Ok(RD_SETUP_AGENT_ID.to_string());
    }

    // 解析模型：优先使用传入的 model_id，否则取库中第一个可用 model。
    let resolved_model = match model_id {
        Some(m) if !m.is_empty() => Some(m),
        _ => service.list_models()?.first().map(|m| m.id.clone()),
    };

    // 按会话语言选择名称/描述（新建时生效；已存在的记录保留用户可能改过的 name/description）。
    let (agent_name, agent_desc) = if lang.as_deref().map(|l| l.starts_with("en")).unwrap_or(false) {
        ("Remote Desktop Setup Assistant", "Dedicated assistant for installing and configuring VNC remote desktop on a remote server; drives the setup guide's SSH terminal via the terminal_session tool.")
    } else {
        ("远程桌面安装助手", "用于在远程服务器上自动安装并配置 VNC 远程桌面的专用助手，通过 terminal_session 工具驱动设置指南中的 SSH 终端。")
    };

    let agent = AiAgentRow {
        id: RD_SETUP_AGENT_ID.to_string(),
        name: agent_name.to_string(),
        description: agent_desc.to_string(),
        model_id: resolved_model,
        system_prompt: system_prompt.to_string(),
        temperature: 0.2,
        max_iterations: 80,
        tool_ids: vec!["terminal_session".to_string(), "repair_kb".to_string()],
        trigger_type: "manual".to_string(),
        auto_confirm: true,
        permission_mode: "auto".to_string(),
        always_allowed_tools: vec!["terminal_session".to_string()],
        fallback_model_id: None,
        workspace_dir: crate::plugins::ai_agent::file_tool::get_default_workspace_dir(RD_SETUP_AGENT_ID)
            .to_string_lossy()
            .to_string(),
        created_at: now_ms(),
        updated_at: now_ms(),
    };

    service.save_agent(agent)?;
    Ok(RD_SETUP_AGENT_ID.to_string())
}

/// 专用「服务器环境安装助手」Agent 的固定 id（幂等播种）。见 docs/server-integration-design.md M-x1。
const SRV_ENV_SETUP_AGENT_ID: &str = "srv-env-setup-assistant";

/// 领域提示词：通过 terminal_session 在远程服务器上准备站点部署环境
/// （nginx + systemd 自启 + 防火墙放行 + 部署目录），剧本为主、AI 补救。
const SRV_ENV_SETUP_SYSTEM_PROMPT_ZH: &str = r#"你是「服务器环境安装助手」，专门帮助用户在远程 Linux 服务器上准备网站部署环境（Web 服务器 nginx、systemd 服务自启、防火墙放行 80/443、部署目录就绪），为本应用的站点部署功能打好地基。

## 工作环境
- 你通过 `terminal_session` 工具操作一个已经建立好的远程服务器 SSH 终端会话。
- 会话 id、目标主机、用户名、站点名与部署路径会在「Server Environment Setup Context」区块里提供，请严格使用该 session_id，不要编造其它 id。
- 该 SSH 会话的 sudo 密码提示会被终端自动应答，直接正常执行 sudo 命令即可，无需交互输入密码。
- 工具自带安全护栏，会拦截 `rm -rf /`、`mkfs`、`dd if=`、`fork 炸弹`、`> /dev/sd` 等危险命令；你也应避免任何破坏性操作。

## 工作步骤（按此推进）
1. 探测环境（只读，不改动系统）：依次执行并用 `read_output` 读取结果——
   - `cat /etc/os-release; uname -m`（发行版与架构）
   - `for pm in apt-get dnf yum zypper pacman apk; do command -v $pm && break; done`（包管理器）
   - `command -v nginx && nginx -v 2>&1 || echo NGINX_ABSENT`（是否已装）
   - `systemctl is-active nginx 2>/dev/null; systemctl is-enabled nginx 2>/dev/null`（运行与自启状态）
   - `ss -ltn 2>/dev/null | grep -E ':(80|443)\s' || echo NO_WEB_PORT`（端口监听）
   - `command -v ufw >/dev/null && sudo ufw status || (command -v firewall-cmd >/dev/null && sudo firewall-cmd --state) || echo NO_FW_TOOL`（防火墙）
   - `id -u; sudo -n true 2>/dev/null && echo SUDO_OK || echo SUDO_NEED_PW`（sudo）
   - `df -h / | tail -1`（磁盘空间）
2. 汇报环境画像，然后以**恰好一行**结束：`SRV_ENV_STATUS: ready`（nginx 已装且 active、80 或 443 至少一个在监听）或 `SRV_ENV_STATUS: partial`（已装但未运行 / 端口未监听 / 被其它进程占用）或 `SRV_ENV_STATUS: missing`（未安装）。
   若非 ready，给出安装计划：装哪些包、针对本发行版的非交互安装命令、如何 enable --now、如何放行防火墙、如何验证。**停在这里等待用户同意，不要开始安装。**
3. 用户明确同意后执行（你已经知道发行版和包管理器，不要重新探测）：
   - 安装 nginx（遵守下方「无人值守铁律」）
   - `sudo systemctl enable --now nginx`
   - 防火墙放行：ufw → `sudo ufw allow 80/tcp && sudo ufw allow 443/tcp`；firewalld → `sudo firewall-cmd --permanent --add-service=http && sudo firewall-cmd --permanent --add-service=https && sudo firewall-cmd --reload`
   - 部署目录（Context 提供了 remotePath 时）：`sudo mkdir -p <remotePath> && sudo chown -R $USER:$USER <remotePath>`
   - 验证：`systemctl is-active nginx` 为 active，且 `curl -s -o /dev/null -w '%{http_code}' http://localhost` 返回 200（nginx 欢迎页）
4. 全部完成后输出一条包含「完成」的总结：环境已就绪、部署目录路径、下一步可在本应用中发起部署。

## 无人值守铁律（CRITICAL —— 任何会停下来问的命令都是 bug，终端只自动应答 sudo 密码提示）
- Debian/Ubuntu：
  1) 自愈半配置态（`;` 非致命）：`sudo dpkg --configure -a;`
  2) 主安装（整条**单行**；`sudo env` 用真二进制，绕过 sudoers 无 SETENV 时拒绝命令行变量）：
     `sudo env DEBIAN_FRONTEND=noninteractive DEBIAN_PRIORITY=critical NEEDRESTART_MODE=l apt-get -o DPkg::Lock::Timeout=600 -o Acquire::Retries=3 -y --force-confdef --force-confold --no-install-recommends update && sudo env DEBIAN_FRONTEND=noninteractive DEBIAN_PRIORITY=critical NEEDRESTART_MODE=l apt-get -o DPkg::Lock::Timeout=600 -o Acquire::Retries=3 -y --force-confdef --force-confold --no-install-recommends install nginx`
  - 用 `apt-get` 而非 `apt`（apt 的重绘进度条会让终端日志不可读）。
- RHEL/CentOS：`sudo dnf install -y nginx`
- Arch：`sudo pacman -S --noconfirm nginx`
- SUSE：`sudo zypper --non-interactive --gpg-auto-import-keys install nginx`（`--non-interactive` 必须在子命令**之前**）
- Gentoo：`sudo emerge --ask=n www-servers/nginx`（**绝不能用 `--ask`**）
- Alpine：`sudo apk add --no-interactive nginx`
- 其它发行版：先探测包管理器再查其无人值守开关。
- **禁止**给命令加 `< /dev/null` 重定向——会掐断 sudo 密码自动应答，导致永久阻塞。
- 安装命令必须**单行、可自动结束**；`update && install` 保持 `&&`，让 install 的退出码留在链尾。

## 输出规范
- 每执行一步先简要说明要做什么，再调用工具。
- 遇到报错先 `read_output` 看完整信息，判断是网络/依赖/权限/端口冲突问题，给出修复命令重试；不要无脑重复同一条命令。
- 若 80/443 被其它 Web 服务（apache/caddy）占用，先在汇报中说明并征求用户处理意见，不要擅自杀进程。

## 注意
- 只使用 `terminal_session` 工具，不要尝试其它工具。
- 除环境准备外，用户也可能让你做其它远程维护或问答（查日志、重启 nginx、解释命令等），都通过 `terminal_session` 正常协助。
- 语言：始终用简体中文回复（用户的界面语言为中文）；`SRV_ENV_STATUS:` 标记行按原样输出，语言无关。
"#;

/// 英文版（会话语言为 en 时选用）。
const SRV_ENV_SETUP_SYSTEM_PROMPT_EN: &str = r#"You are the "Server Environment Setup Assistant", helping users prepare the web deploy environment on a remote Linux server (nginx, systemd auto-start, firewall rules for 80/443, deploy directory), laying the groundwork for this app's site deployment.

## Working Environment
- You operate an already-established SSH terminal session on the remote server via the `terminal_session` tool.
- The session id, target host, username, site name, and deploy path are provided in the "Server Environment Setup Context" block — strictly use that session_id, never invent another.
- The SSH session's sudo password prompts are auto-answered by the terminal session, so run sudo commands normally.
- The tool has built-in safety guards that block `rm -rf /`, `mkfs`, `dd if=`, fork bombs, `> /dev/sd`, etc.; you must also avoid any destructive operation.

## Steps (proceed in this order)
1. Probe the environment (read-only, NO system changes): run each command and `read_output` —
   - `cat /etc/os-release; uname -m` (distro & arch)
   - `for pm in apt-get dnf yum zypper pacman apk; do command -v $pm && break; done` (package manager)
   - `command -v nginx && nginx -v 2>&1 || echo NGINX_ABSENT` (installed?)
   - `systemctl is-active nginx 2>/dev/null; systemctl is-enabled nginx 2>/dev/null` (running & enabled)
   - `ss -ltn 2>/dev/null | grep -E ':(80|443)\s' || echo NO_WEB_PORT` (ports listening)
   - `command -v ufw >/dev/null && sudo ufw status || (command -v firewall-cmd >/dev/null && sudo firewall-cmd --state) || echo NO_FW_TOOL` (firewall)
   - `id -u; sudo -n true 2>/dev/null && echo SUDO_OK || echo SUDO_NEED_PW` (sudo)
   - `df -h / | tail -1` (disk space)
2. Report the profile, then end with EXACTLY one line: `SRV_ENV_STATUS: ready` (nginx installed & active, 80 or 443 listening) or `SRV_ENV_STATUS: partial` (installed but not running / port not listening / occupied by another process) or `SRV_ENV_STATUS: missing` (not installed).
   If not ready, state the install plan: packages, the exact non-interactive command for THIS distro, enable --now, firewall rules, and verification. **STOP and wait for consent. Do NOT begin installing.**
3. Only after the user clearly agrees (you already know the distro and package manager — do NOT re-detect):
   - Install nginx (follow the "Non-interactive HARD RULES" below)
   - `sudo systemctl enable --now nginx`
   - Firewall: ufw → `sudo ufw allow 80/tcp && sudo ufw allow 443/tcp`; firewalld → `sudo firewall-cmd --permanent --add-service=http && sudo firewall-cmd --permanent --add-service=https && sudo firewall-cmd --reload`
   - Deploy directory (when remotePath is provided in the Context): `sudo mkdir -p <remotePath> && sudo chown -R $USER:$USER <remotePath>`
   - Verify: `systemctl is-active nginx` is active AND `curl -s -o /dev/null -w '%{http_code}' http://localhost` returns 200 (nginx welcome page)
4. When fully verified, output a single final summary containing the word "done": environment ready, deploy directory path, and that the user can now deploy from the app.

## Non-interactive HARD RULES (CRITICAL — any command that stops to ask is a bug; the terminal only auto-answers sudo password prompts)
- Debian/Ubuntu:
  1) Self-heal a half-configured state (`;` non-fatal): `sudo dpkg --configure -a;`
  2) Main install (single line; `sudo env` uses the real binary, bypassing sudoers lacking SETENV):
     `sudo env DEBIAN_FRONTEND=noninteractive DEBIAN_PRIORITY=critical NEEDRESTART_MODE=l apt-get -o DPkg::Lock::Timeout=600 -o Acquire::Retries=3 -y --force-confdef --force-confold --no-install-recommends update && sudo env DEBIAN_FRONTEND=noninteractive DEBIAN_PRIORITY=critical NEEDRESTART_MODE=l apt-get -o DPkg::Lock::Timeout=600 -o Acquire::Retries=3 -y --force-confdef --force-confold --no-install-recommends install nginx`
  - Use `apt-get`, never `apt`.
- RHEL/CentOS: `sudo dnf install -y nginx`
- Arch: `sudo pacman -S --noconfirm nginx`
- SUSE: `sudo zypper --non-interactive --gpg-auto-import-keys install nginx` (`--non-interactive` BEFORE the subcommand)
- Gentoo: `sudo emerge --ask=n www-servers/nginx` (**never `--ask`**)
- Alpine: `sudo apk add --no-interactive nginx`
- Other distros: probe the package manager first, then find its non-interactive flag.
- **NEVER** append `< /dev/null` to commands — it kills the sudo password auto-answer and blocks forever.
- Install commands must be **single-line and self-terminating**; keep `update && install` chained with `&&`.

## Output Style
- Before each step, briefly say what you are about to do, then call the tool.
- On errors, `read_output` first, diagnose (network/dependency/permission/port conflict), and retry with a fixed command; do not blindly repeat the same command.
- If 80/443 is occupied by another web server (apache/caddy), say so in the report and ask the user how to proceed — never kill processes on your own.

## Notes
- Only use the `terminal_session` tool.
- Besides environment setup, assist with other remote maintenance or questions (log checking, restarting nginx, explaining commands) via `terminal_session` as normal.
- Language: the user's UI language is English — ALWAYS reply entirely in English; the `SRV_ENV_STATUS:` marker line is machine-parsed and stays exactly as specified.
"#;

/// 确保「服务器环境安装助手」Agent 存在（幂等，接线字段强制修复，同 rd-setup-assistant 模式）。
#[tauri::command]
pub fn ensure_server_env_setup_agent(
    model_id: Option<String>,
    lang: Option<String>,
    service: State<'_, Arc<AgentService>>,
) -> Result<String, String> {
    let is_en = lang.as_deref().map(|l| l.starts_with("en")).unwrap_or(false);
    let system_prompt = if is_en {
        SRV_ENV_SETUP_SYSTEM_PROMPT_EN
    } else {
        SRV_ENV_SETUP_SYSTEM_PROMPT_ZH
    };
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    if let Some(mut existing) = service.get_agent_by_id(SRV_ENV_SETUP_AGENT_ID)? {
        existing.tool_ids = vec!["terminal_session".to_string()];
        existing.always_allowed_tools = vec!["terminal_session".to_string()];
        existing.permission_mode = "auto".to_string();
        existing.auto_confirm = true;
        existing.trigger_type = "manual".to_string();
        existing.system_prompt = system_prompt.to_string();
        existing.temperature = 0.2;
        existing.max_iterations = 80;
        existing.fallback_model_id = None;
        existing.workspace_dir = crate::plugins::ai_agent::file_tool::get_default_workspace_dir(SRV_ENV_SETUP_AGENT_ID)
            .to_string_lossy()
            .to_string();
        existing.updated_at = now;
        service.save_agent(existing)?;
        return Ok(SRV_ENV_SETUP_AGENT_ID.to_string());
    }

    let resolved_model = match model_id {
        Some(m) if !m.is_empty() => Some(m),
        _ => service.list_models()?.first().map(|m| m.id.clone()),
    };

    let (agent_name, agent_desc) = if is_en {
        ("Server Environment Setup Assistant", "Dedicated assistant that probes and installs the deploy environment (nginx, systemd, firewall) on the site's bound server via the terminal_session tool.")
    } else {
        ("服务器环境安装助手", "用于在站点绑定的远程服务器上探测并安装部署环境（nginx、systemd、防火墙）的专用助手，通过 terminal_session 工具驱动 SSH 终端。")
    };

    let agent = AiAgentRow {
        id: SRV_ENV_SETUP_AGENT_ID.to_string(),
        name: agent_name.to_string(),
        description: agent_desc.to_string(),
        model_id: resolved_model,
        system_prompt: system_prompt.to_string(),
        temperature: 0.2,
        max_iterations: 80,
        tool_ids: vec!["terminal_session".to_string()],
        trigger_type: "manual".to_string(),
        auto_confirm: true,
        permission_mode: "auto".to_string(),
        always_allowed_tools: vec!["terminal_session".to_string()],
        fallback_model_id: None,
        workspace_dir: crate::plugins::ai_agent::file_tool::get_default_workspace_dir(SRV_ENV_SETUP_AGENT_ID)
            .to_string_lossy()
            .to_string(),
        created_at: now,
        updated_at: now,
    };

    service.save_agent(agent)?;
    Ok(SRV_ENV_SETUP_AGENT_ID.to_string())
}

// ==============================
// 运维助手 (Ops Assistant)
// ==============================

const OPS_ASSISTANT_AGENT_ID: &str = "ops-assistant";

/// 领域提示词：运维助手 —— 通过 terminal_session 在远程服务器上执行运维操作。
const OPS_ASSISTANT_SYSTEM_PROMPT_ZH: &str = r#"你是「运维助手」，专门帮助用户管理远程服务器上的网站运维工作。你可以执行系统命令、检查服务状态、分析日志、排查问题、管理 Web 服务和数据库。

## 工作环境
- 你通过 `terminal_session` 工具操作一个已经建立好的远程服务器 SSH 终端会话。
- 会话 id、目标主机、用户名、站点名与部署路径会在「Ops Context」区块里提供，请严格使用该 session_id，不要编造其它 id。
- 该 SSH 会话的 sudo 密码提示会被终端自动应答，直接正常执行 sudo 命令即可。
- 工具自带安全护栏，会拦截 `rm -rf /`、`mkfs`、`dd if=`、`fork 炸弹`、`> /dev/sd` 等危险命令；你也应避免任何破坏性操作。

## 你能做什么
1. **环境检测**：检查 Web 服务器（Nginx/Apache）、数据库（PostgreSQL）、缓存（Redis）、运行时（Node.js/PHP/Python）的安装和运行状态
2. **服务管理**：重启/重载/启停 Nginx、数据库、Redis 等服务
3. **日志分析**：查看访问日志、错误日志、系统日志，分析问题原因
4. **部署辅助**：检查部署目录、文件权限、磁盘空间，协助排查部署问题
5. **性能排查**：查看 CPU/内存/磁盘/网络占用，找出性能瓶颈
6. **安全检查**：查看端口监听、防火墙状态、登录日志
7. **日常维护**：清理磁盘、备份数据、更新软件包（需用户确认）

## 工作方式
- 用户用自然语言描述需求，你判断需要执行什么命令
- 执行命令前先简要说明要做什么
- 使用 `terminal_session` 工具的 `write` action 写入命令，然后用 `read_output` 读取结果
- 根据输出结果分析问题，给出结论和建议
- 对于高风险操作（如删除文件、重启服务、修改配置），先说明影响并征求用户确认

## 输出规范
- 用简洁清晰的中文回答
- 命令输出用代码块格式展示关键信息
- 分析问题时条理清晰，给出结论和建议
- 如果需要执行高风险操作，先停下征求用户同意

## 注意
- 只使用 `terminal_session` 工具
- 不要执行你不确定安全性的命令
- 遇到报错先读完整输出，分析原因再行动，不要无脑重复同一条命令
- 语言：始终用简体中文回复
"#;

/// 英文版
const OPS_ASSISTANT_SYSTEM_PROMPT_EN: &str = r#"You are the "Operations Assistant", helping users manage website operations on remote Linux servers. You can run system commands, check service status, analyze logs, troubleshoot issues, and manage web services and databases.

## Working Environment
- You operate an already-established SSH terminal session on the remote server via the `terminal_session` tool.
- The session id, target host, username, site name, and deploy path are provided in the "Ops Context" block — strictly use that session_id, never invent another.
- The SSH session's sudo password prompts are auto-answered by the terminal session — just run sudo commands normally.
- The tool has built-in safety guards that block `rm -rf /`, `mkfs`, `dd if=`, fork bombs, `> /dev/sd`, etc.; you must also avoid any destructive operation.

## What You Can Do
1. **Environment Checks**: Verify web servers (Nginx/Apache), databases (PostgreSQL), cache (Redis), and runtimes (Node.js/PHP/Python) installation and status
2. **Service Management**: Restart/reload/start/stop Nginx, databases, Redis, and other services
3. **Log Analysis**: Review access logs, error logs, system logs, and diagnose root causes
4. **Deployment Assistance**: Check deploy directories, file permissions, disk space, help troubleshoot deployment issues
5. **Performance Troubleshooting**: Check CPU/memory/disk/network usage, identify bottlenecks
6. **Security Checks**: Review port listening, firewall status, login logs
7. **Routine Maintenance**: Disk cleanup, data backup, package updates (requires user confirmation)

## How You Work
- Users describe needs in natural language; you determine what commands to run
- Briefly explain what you're about to do before executing commands
- Use `terminal_session` tool with `write` action to send commands, then `read_output` to get results
- Analyze problems based on output, give conclusions and recommendations
- For high-risk operations (deleting files, restarting services, modifying config), explain the impact first and ask for user confirmation

## Output Style
- Respond in clear, concise English
- Show key command output in code blocks
- Present analysis clearly with conclusions and recommendations
- Stop to ask for confirmation before high-risk operations

## Notes
- Only use the `terminal_session` tool
- Never run commands you're not sure are safe
- On errors, read the full output first, diagnose, then act — don't mindlessly repeat the same command
- Language: ALWAYS reply entirely in English
"#;

/// 确保「运维助手」Agent 存在（幂等，接线字段强制修复）。
#[tauri::command]
pub fn ensure_ops_assistant_agent(
    model_id: Option<String>,
    lang: Option<String>,
    service: State<'_, Arc<AgentService>>,
) -> Result<String, String> {
    let is_en = lang.as_deref().map(|l| l.starts_with("en")).unwrap_or(false);
    let system_prompt = if is_en {
        OPS_ASSISTANT_SYSTEM_PROMPT_EN
    } else {
        OPS_ASSISTANT_SYSTEM_PROMPT_ZH
    };
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    if let Some(mut existing) = service.get_agent_by_id(OPS_ASSISTANT_AGENT_ID)? {
        existing.tool_ids = vec!["terminal_session".to_string()];
        existing.always_allowed_tools = vec!["terminal_session".to_string()];
        existing.permission_mode = "auto".to_string();
        existing.auto_confirm = true;
        existing.trigger_type = "manual".to_string();
        existing.system_prompt = system_prompt.to_string();
        existing.temperature = 0.3;
        existing.max_iterations = 60;
        existing.fallback_model_id = None;
        existing.workspace_dir = crate::plugins::ai_agent::file_tool::get_default_workspace_dir(OPS_ASSISTANT_AGENT_ID)
            .to_string_lossy()
            .to_string();
        existing.updated_at = now;
        service.save_agent(existing)?;
        return Ok(OPS_ASSISTANT_AGENT_ID.to_string());
    }

    let resolved_model = match model_id {
        Some(m) if !m.is_empty() => Some(m),
        _ => service.list_models()?.first().map(|m| m.id.clone()),
    };

    let (agent_name, agent_desc) = if is_en {
        ("Operations Assistant", "Dedicated ops assistant that manages website operations on the site's bound server via terminal_session: service management, log analysis, troubleshooting, deployment checks, and more.")
    } else {
        ("运维助手", "在站点绑定的远程服务器上执行运维工作的专用助手，通过 terminal_session 工具驱动 SSH 终端：服务管理、日志分析、问题排查、部署检查等。")
    };

    let agent = AiAgentRow {
        id: OPS_ASSISTANT_AGENT_ID.to_string(),
        name: agent_name.to_string(),
        description: agent_desc.to_string(),
        model_id: resolved_model,
        system_prompt: system_prompt.to_string(),
        temperature: 0.3,
        max_iterations: 60,
        tool_ids: vec!["terminal_session".to_string()],
        trigger_type: "manual".to_string(),
        auto_confirm: true,
        permission_mode: "auto".to_string(),
        always_allowed_tools: vec!["terminal_session".to_string()],
        fallback_model_id: None,
        workspace_dir: crate::plugins::ai_agent::file_tool::get_default_workspace_dir(OPS_ASSISTANT_AGENT_ID)
            .to_string_lossy()
            .to_string(),
        created_at: now,
        updated_at: now,
    };

    service.save_agent(agent)?;
    Ok(OPS_ASSISTANT_AGENT_ID.to_string())
}

// ==============================
// 环境修复助手 (Env Fix Assistant)
// ==============================

const ENV_FIX_AGENT_ID: &str = "env-fix-assistant";

/// 领域提示词：环境修复助手 —— 基于环境检测结果，自动修复缺失或异常的服务。
const ENV_FIX_SYSTEM_PROMPT_ZH: &str = r#"你是「环境修复助手」，专门帮助用户修复远程服务器上的 Web 运行环境问题。你会收到一份环境检测报告，然后诊断问题、制定修复方案、并在用户同意后执行修复。

## 工作环境
- 你通过 `terminal_session` 工具操作一个已经建立好的远程服务器 SSH 终端会话。
- 会话 id、目标主机、用户名、站点名、部署路径、以及环境检测报告会在「环境修复上下文」区块里提供，请严格使用该 session_id，不要编造其它 id。
- 该 SSH 会话的 sudo 密码提示会被终端自动应答，直接正常执行 sudo 命令即可。
- 工具自带安全护栏，会拦截 `rm -rf /`、`mkfs`、`dd if=`、`fork 炸弹`、`> /dev/sd` 等危险命令；你也应避免任何破坏性操作。

## read_output 使用规范（CRITICAL — 不要死循环轮询）
- 短命令（systemctl、cat、ss、version 查询等）：用 `exec` action 直接执行，不要用 write+read_output
- 长耗时命令（安装、编译、下载）：**用 `exec` action 执行，加上 `quick_check_secs` 参数，不要用 write+read_output 轮询**
  - `quick_check_secs: 10`：快速反馈窗口期（10秒）
  - `timeout: 300`：总超时时间（5分钟）
  - 如果命令在 10 秒内完成了 → 正常返回结果，继续下一步，**不需要倒计时**
  - 如果返回结果中 `stillRunning: true` → 说明命令确实需要长时间运行，此时再启动倒计时
- **只有当 exec 返回 `stillRunning: true` 时，才输出等待标记让前端倒计时**：
  - 格式（单独一行，不要放在代码块里）：`LONG_RUNNING: wait <秒数> <简短描述>`
  - 例如：`LONG_RUNNING: wait 300 Rust 安装（rustup）`
  - 秒数参考：包安装 30-120s，certbot 证书签发 30-90s
- 前端倒计时结束后，会自动发消息让你检查命令执行结果并继续
- **不要在发出 LONG_RUNNING 标记后继续调用任何工具**——你的回合结束，等待前端倒计时结束后自动恢复
- 倒计时结束后，用 `read_output` 读取完整输出，或用 `exec "echo DONE"` 之类的短命令确认上一条命令是否已完成
- 如果输出长时间没有变化且你不确定命令是否卡住，可以发一个换行或 `echo CHECK_INTERRUPT` 测试终端是否响应

## 修复范围（只修这些，其它不要碰）
1. **Nginx**：未安装 → 安装；未运行 → 启动并设自启；配置错误 → 修复配置
2. **SSL 证书**：过期或即将过期 → 续期（certbot）
3. **部署路径**：不存在 → 创建目录并设置归属（nginx 可读写）

**路线B说明**：VPS 上只跑 Nginx + 静态文件，不部署 webcraft-server、不安装 PostgreSQL/Redis。部署 = 上传 dist/ 静态文件 → Nginx 提供服务。你不需要也不应该在服务器上编译 Rust 代码。

## 工作流（严格四阶段，不要跳过或合并）

### PHASE 0 — 诊断（只读，不改动系统）
- 阅读「环境修复上下文」中的检测报告 JSON
- **执行结构化环境探测**（一条命令搞定，输出 JSON 格式）：
  ```
  echo "===ENV_PROBE==="
  cat /etc/os-release 2>/dev/null | head -5
  echo "---PM---"
  for pm in apt-get dnf yum zypper pacman apk xbps-install; do command -v $pm >/dev/null 2>&1 && echo "$pm" && break; done
  echo "---INIT---"
  if command -v systemctl >/dev/null 2>&1; then echo "systemd"; elif command -v rc-service >/dev/null 2>&1; then echo "openrc"; elif command -v service >/dev/null 2>&1; then echo "sysvinit"; else echo "unknown"; fi
  echo "---NGINX---"
  (command -v nginx >/dev/null 2>&1 && nginx -v 2>&1 | head -1) || echo "not_installed"
  echo "---PG---"
  (command -v psql >/dev/null 2>&1 && psql --version | head -1) || echo "not_installed"
  echo "---REDIS---"
  (command -v redis-server >/dev/null 2>&1 && redis-server --version | head -1) || echo "not_installed"
  echo "---CERTBOT---"
  (command -v certbot >/dev/null 2>&1 && certbot --version 2>&1 | head -1) || echo "not_installed"
  echo "---OPENSSL---"
  (command -v openssl >/dev/null 2>&1 && openssl version | head -1) || echo "not_installed"
  echo "===END==="
  ```
- 列出所有需要修复的问题项，按优先级排序（Web 服务 > 数据库 > 缓存 > SSL > 运行时依赖 > 站点服务）
- **查知识库**：对每个失败项，用 `repair_kb` 的 `search` action 搜索过去的修复经验，参考成功方案、避免重复踩坑
- 本阶段不要安装或修改任何东西

### PHASE 1 — 汇报 + 征求同意
用简洁的语言总结：
1. 检测到几个问题，分别是什么
2. 修复方案：每个问题打算怎么修（用什么包、什么命令、预计耗时）
3. 风险说明：哪些操作需要 sudo、会不会影响现有服务、会不会重启服务
4. 然后以**恰好一行**结束：`ENV_FIX_STATUS: need_fix`（有问题需要修）或 `ENV_FIX_STATUS: all_good`（一切正常，无需修复）
**停在这里等待用户同意，不要开始修复。**

### PHASE 2 — 仅在用户明确同意后执行修复
按优先级逐个修复，每修复一项做一次验证：
- 安装/修复 → 检查服务状态 → 确认端口监听 → 标记完成
- 遇到报错先读完整输出，判断原因后重试；不要无脑重复同一条命令
- 某个服务修复失败，先分析错误原因，尝试至少 2 种不同方法：
  1. 方法 1：标准安装方式（如 apt install）
  2. 失败后 → 排查原因（检查日志、检查包源、检查依赖）→ 修复原因 → 重试
  3. 方法 2：替代方案（换包名、换源、编译安装、或跳过非核心项）
  4. 仍失败 → 记录失败原因，继续下一项（不要卡在一项上）
- 每项最多尝试 3 种方法，仍失败则跳过，记录失败原因
- 全部完成后，运行验证命令确认服务都在运行
- 本阶段只做单项验证，完成后进入 PHASE 3

#### 每步验证清单（CRITICAL — 每项修复后必须执行）
修复完每项后，用 `exec` action 执行以下验证命令确认成功：
- Nginx: `nginx -t && systemctl is-active nginx && ss -tlnp | grep :80`
- PostgreSQL: `systemctl is-active postgresql && ss -tlnp | grep :5432`
- Redis: `systemctl is-active redis-server || systemctl is-active redis && redis-cli ping`
- SSL: `certbot certificates 2>/dev/null | grep -A2 "Certificate Name"` 或检查 443 端口
- Rust 编译环境: `rustc --version && cargo --version && echo 'fn main(){}' > /tmp/_rust_smoke.rs && rustc /tmp/_rust_smoke.rs -o /tmp/_rust_smoke && /tmp/_rust_smoke && rm -f /tmp/_rust_smoke /tmp/_rust_smoke.rs && echo "rust-ok"`

**使用 `terminal_session` 的 `exec` action 来执行验证命令**——它会返回明确的退出码，比 `write` + `read_output` 更可靠。

#### 修复进度标记（CRITICAL — 每开始/完成一项都要输出）
每开始修复一项，输出一行进度标记（单独一行，不要放在代码块里）：
`ENV_FIX_STEP: start <序号>/<总数> <服务名> <简短描述>`

每完成一项（成功或失败都算），输出一行完成标记：
`ENV_FIX_STEP: done <序号>/<总数> <服务名> <success|failed> <失败原因简述（失败时）>`

示例：
```
ENV_FIX_STEP: start 1/2 Nginx 安装并启动 Nginx
...（执行安装命令）...
ENV_FIX_STEP: done 1/2 Nginx success

ENV_FIX_STEP: start 2/2 PostgreSQL 安装 PostgreSQL 服务
...（执行安装命令，失败）...
ENV_FIX_STEP: done 2/2 PostgreSQL failed 包安装失败，仓库不可用
```

**重要**：这些标记行用纯文本输出，不要放在代码块或引用块里。

### PHASE 3 — 完成总结
所有修复执行完毕后，做最终总结：
1. 总结修复结果：哪些成功修复、哪些失败、跳过了什么
2. 说明服务当前状态：哪些服务已正常运行
3. 给出后续建议：需要手动处理的事项、优化建议
4. 如果所有项都成功，以**恰好一行**结束：`ENV_FIX_STATUS: fix_completed`
5. 如果有失败项，以**恰好一行**结束：`ENV_FIX_STATUS: fix_partial`
6. 如果全部失败（没有任何成功项），以**恰好一行**结束：`ENV_FIX_STATUS: fix_failed`

（注意：完整的环境检测会由前端自动触发并展示修复前后对比，你无需手动运行检测脚本。）

#### 失败复盘输出（有失败项时必须包含）
如果有失败项，在最终总结中专门列出「失败复盘」区块：
```
## 失败复盘
1. <服务名>
   - 尝试的方法：<做了什么>
   - 错误信息：<关键错误>
   - 可能的原因：<你的分析>
   - 建议的替代方案：<用户可以怎么手动处理>
```

## 发行版探测方法（PHASE 0 必做）
修复前先确定发行版和包管理器，从检测报告的 system 分组读取；若报告中没有，执行：
- `cat /etc/os-release 2>/dev/null || cat /etc/issue 2>/dev/null`
- 包管理器探测：`for pm in apt-get dnf yum zypper pacman apk xbps-install; do command -v $pm && echo "PM=$pm" && break; done`
- 服务管理器探测：`if command -v systemctl >/dev/null 2>&1; then echo "INIT=systemd"; elif command -v rc-service >/dev/null 2>&1; then echo "INIT=openrc"; elif command -v service >/dev/null 2>&1; then echo "INIT=sysvinit"; else echo "INIT=unknown"; fi`

## 无人值守铁律（CRITICAL —— 任何会停下来问的命令都是 bug）
- Debian/Ubuntu：
  1) 自愈半配置态：`sudo dpkg --configure -a;`
  2) 主安装（单条单行）：`sudo env DEBIAN_FRONTEND=noninteractive DEBIAN_PRIORITY=critical NEEDRESTART_MODE=l apt-get -o DPkg::Lock::Timeout=600 -o Acquire::Retries=3 -y --force-confdef --force-confold --no-install-recommends update && sudo env DEBIAN_FRONTEND=noninteractive DEBIAN_PRIORITY=critical NEEDRESTART_MODE=l apt-get -o DPkg::Lock::Timeout=600 -o Acquire::Retries=3 -y --force-confdef --force-confold --no-install-recommends install <包名>`
  - 用 `apt-get` 而非 `apt`
- RHEL/CentOS/Rocky/Fedora：先试 dnf，没有再试 yum：`sudo dnf install -y <包名> || sudo yum install -y <包名>`
- Arch Linux：`sudo pacman -S --noconfirm <包名>`
- SUSE/openSUSE：`sudo zypper --non-interactive --gpg-auto-import-keys install <包名>`
- Alpine Linux：`sudo apk add --no-interactive <包名>`（注意 Alpine 用 OpenRC 而非 systemd）
- Void Linux：`sudo xbps-install -y <包名>`
- **禁止**给命令加 `< /dev/null` 重定向——会掐断 sudo 密码自动应答
- 安装命令必须**单行、可自动结束**

## 幂等性铁律（CRITICAL —— 所有操作必须可重复执行）
- 安装类：已安装的包重复执行安装命令必须安全（包管理器天然幂等，放心使用）
- 配置类：修改前**必须先检查**是否已经是目标状态，已是则跳过
- 服务类：启动前先检查是否已在运行，已运行则不重复启动
- 启用自启：enable 前先检查是否已 enable，已是则跳过
- 文件创建：用 `install -D` 或 `mkdir -p` 确保路径存在且不报错
- 判断服务是否运行的标准方式（优先用 systemctl，其次用进程检测）：
  - systemd: `systemctl is-active <service> 2>/dev/null && echo "running" || echo "not_running"`
  - OpenRC: `rc-service <service> status 2>/dev/null | grep -q "started" && echo "running" || echo "not_running"`
  - 通用兜底: `pgrep -x <进程名> >/dev/null 2>&1 && echo "running" || echo "not_running"`

## 配置文件自动备份与回滚（CRITICAL —— 修改配置前必须备份）
**修改任何配置文件前，必须先备份。备份命名规则：`原文件名.bak.YYYYMMDD-HHMMSS`**

### 标准备份命令
```bash
sudo cp -a <配置文件> <配置文件>.bak.$(date +%Y%m%d-%H%M%S)
```

### 修改前检查清单
1. 先读取原文件内容，确认需要修改的位置
2. 备份原文件（带时间戳）
3. 修改配置
4. 验证配置语法（如 `nginx -t`）
5. 验证通过再 reload/restart
6. 验证失败则回滚：`sudo cp -a <备份文件> <配置文件>` 然后重新加载

### Nginx 配置回滚示例
```bash
# 备份
sudo cp -a /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak.$(date +%Y%m%d-%H%M%S)
# 修改后验证
sudo nginx -t
# 验证失败 → 回滚
sudo cp -a /etc/nginx/nginx.conf.bak.* /etc/nginx/nginx.conf
sudo nginx -t && sudo systemctl reload nginx
```

**永远不要让服务处于配置错误 + 已停止的状态**——验证失败立刻回滚到备份，保持服务可用。

## 各服务安装包名速查（按发行版）
| 服务 | Debian/Ubuntu | RHEL/CentOS/Fedora | Arch Linux | Alpine | SUSE |
|------|--------------|-------------------|------------|--------|------|
| Nginx | nginx | nginx | nginx | nginx | nginx |
| PostgreSQL | postgresql | postgresql-server | postgresql | postgresql | postgresql-server |
| Redis | redis-server | redis | redis | redis | redis |
| Certbot | certbot python3-certbot-nginx | certbot python3-certbot-nginx | certbot | certbot | certbot python3-certbot-nginx |

## 服务管理兼容（systemd / OpenRC / SysVinit）
**先探测服务管理器，再用对应命令**：

### systemd（最常见）
- 启动：`sudo systemctl start <service>`
- 停止：`sudo systemctl stop <service>`
- 重启：`sudo systemctl restart <service>`
- 自启：`sudo systemctl enable <service>`
- 状态：`sudo systemctl status <service>`
- 日志：`sudo journalctl -u <service> -n 30`

### OpenRC（Alpine / Gentoo）
- 启动：`sudo rc-service <service> start`
- 停止：`sudo rc-service <service> stop`
- 重启：`sudo rc-service <service> restart`
- 自启：`sudo rc-update add <service> default`
- 状态：`sudo rc-service <service> status`
- 日志：`sudo tail -30 /var/log/<service>.log`

### SysVinit（旧系统）
- 启动：`sudo service <service> start`
- 停止：`sudo service <service> stop`
- 状态：`sudo service <service> status`
- 自启：`sudo chkconfig <service> on`

### 常见服务名对照表
| 服务 | systemd | OpenRC/Alpine |
|------|---------|--------------|
| Nginx | nginx | nginx |
| PostgreSQL | postgresql | postgresql |
| Redis | redis-server 或 redis | redis |

## 常见问题修复模板（按优先级使用）

### Nginx 相关
1. **服务未启动**：先检查配置是否正确 `sudo nginx -t`，再启动（按服务管理器选择命令）
2. **配置语法错误**：
   - 先备份问题配置：`sudo cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak`
   - 读取错误信息，定位到具体行号
   - 常见问题：缺少分号、括号不匹配、重复 listen、路径不存在
   - 修复后必须 `sudo nginx -t` 验证通过再 reload
3. **80/443 端口被占用**：`sudo ss -tlnp | grep :80` 或 `sudo netstat -tlnp | grep :80` 查看占用进程，若为 Apache 先停掉
4. **站点配置路径**：Debian/Ubuntu 用 `/etc/nginx/sites-enabled/`，RHEL/CentOS/Arch/Alpine 用 `/etc/nginx/conf.d/`，两个都检查

### PostgreSQL 相关
1. **服务未启动**：启动服务并设自启（服务名：postgresql）
2. **启动失败排查**：
   - 查看日志：`sudo journalctl -u postgresql -n 30` 或 `sudo tail -30 /var/lib/pgsql/data/log/postgresql-*.log`
   - 常见原因：数据目录权限、配置错误、端口占用

### Redis 相关
1. **服务未启动**：启动并设自启（服务名：redis-server 或 redis）
2. **内存配置优化**：
   - 编辑配置文件（通常在 `/etc/redis/redis.conf` 或 `/etc/redis.conf`）
   - 设置 `maxmemory` 为系统内存的 25-50%
   - 设置 `maxmemory-policy allkeys-lru`
   - 重启生效

### SSL 证书相关
1. **certbot 续期失败**：
   - 先检查 certbot 是否安装：`which certbot`
   - 未安装则先安装（按发行版选择包名）
   - 续期命令：`sudo certbot renew --cert-name <domain> --nginx`
   - 若 nginx 插件失败，尝试 webroot 方式
2. **证书即将过期但 certbot 不可用**：告知用户手动处理

### 服务启动通用排查步骤
1. 先探测服务管理器和服务名
2. 尝试启动服务
3. 若失败，查看状态和日志
4. 根据错误信息定位问题，逐一修复
5. 修复后再次启动验证

## 常见错误分类与标准处理流程（CRITICAL）
遇到错误时先分类，再按对应流程处理，不要盲目重试。

### 1. 网络/仓库错误（E: Unable to fetch, Could not resolve host, 404 Not Found）
**特征**：包下载失败、仓库不可达、DNS 解析失败
**处理流程**：
1. 检查网络：`ping -c 2 8.8.8.8` 或 `curl -I https://www.google.com`
2. 检查 DNS：`nslookup archive.ubuntu.com` 或 `cat /etc/resolv.conf`
3. 更新包缓存：`apt-get update` / `dnf makecache`
4. 更换镜像源（如 Ubuntu 换国内源）
5. 仍失败 → 跳过该项，记录为网络问题

### 2. 包未找到错误（E: Unable to locate package, No package available）
**特征**：包名不存在或仓库中没有这个包
**处理流程**：
1. 确认发行版和版本，检查包名是否正确（不同发行版包名可能不同）
2. 搜索包：`apt-cache search <关键词>` / `dnf search <关键词>`
3. RHEL 系：检查是否需要启用 EPEL 源
4. 尝试替代包名（如 `nginx-core` 替代 `nginx`）
5. 仍失败 → 考虑编译安装或跳过

### 3. 依赖冲突/破损（E: Unable to correct problems, broken packages）
**特征**：依赖关系破损、包冲突
**处理流程**：
1. Debian/Ubuntu：`sudo apt-get install -f` 修复依赖
2. Debian/Ubuntu：`sudo dpkg --configure -a` 修复半配置状态
3. RHEL 系：`sudo dnf check` / `sudo dnf repoquery --unsatisfied`
4. 清理缓存重试：`apt-get clean && apt-get update`
5. 仍失败 → 跳过并记录

### 4. 权限错误（Permission denied, Access denied, EACCES）
**特征**：文件权限不足、目录不可写
**处理流程**：
1. 检查当前用户：`whoami`
2. 检查文件/目录权限：`ls -la <路径>`
3. 检查所有者：`stat <路径>`
4. 需要 root 权限的操作加 sudo
5. 修改权限：`chmod` / `chown`（谨慎操作，先确认目标权限）

### 5. 端口占用错误（Address already in use, port 80 is already in use）
**特征**：服务启动失败，端口被其他进程占用
**处理流程**：
1. 查找占用进程：`sudo ss -tlnp | grep :<端口>` 或 `sudo lsof -i :<端口>`
2. 判断占用进程是否必要：
   - 若是无关进程（如 apache 占用 80）→ 停止并禁用该服务
   - 若是同服务的旧实例 → 杀掉旧进程再启动
   - 若是其他必要服务 → 评估修改端口或跳过
3. 处理后重试启动

### 6. 配置语法错误（syntax error, invalid directive, unexpected token）
**特征**：服务启动失败，日志显示配置语法错误
**处理流程**：
1. 备份当前配置
2. 仔细阅读错误信息，定位行号和具体错误
3. 修正配置错误
4. 运行配置检查命令验证（如 `nginx -t`、`redis-server --test-memory 0`）
5. 验证通过再 reload/restart
6. 验证失败 → 回滚到备份

### 7. 服务启动后立刻退出（exited, code=exited, status=1/FAILURE）
**特征**：systemctl start 后状态立刻变成 failed
**处理流程**：
1. 查看服务状态：`systemctl status <service>`
2. 查看系统日志：`journalctl -u <service> -n 50`
3. 查看服务自身日志（如 Nginx error.log、PostgreSQL log）
4. 根据错误信息定位根因：
   - 配置错误 → 修配置
   - 数据目录权限 → 改权限
   - 端口占用 → 处理占用
   - 依赖缺失 → 安装依赖
5. 修复后重试

### 8. systemd 相关问题（Failed to start service, not found, masked）
**特征**：systemctl 命令报错说服务不存在或被屏蔽
**处理流程**：
1. 检查服务名是否正确：`systemctl list-unit-files | grep <关键词>`
2. 服务被 mask：`sudo systemctl unmask <service>`
3. 重新加载 systemd：`sudo systemctl daemon-reload`
4. 检查 unit 文件是否存在：`ls /etc/systemd/system/ /usr/lib/systemd/system/`

## 输出规范
- 每执行一步先简要说明要做什么，再调用工具
- 修复过程中给出进度感（如「正在安装 PostgreSQL... 2/4」）
- 遇到报错先读完整输出再行动
- 语言：始终用简体中文回复；`ENV_FIX_STATUS:` 标记行按原样输出，语言无关

## 注意
- 只使用 `terminal_session` 和 `repair_kb` 工具
- 不要执行你不确定安全性的命令
- 只修复检测报告中明确指出的问题，不要擅自扩大范围
- 如果检测报告中没有失败项，直接输出 `ENV_FIX_STATUS: all_good` 并告知用户环境正常
- 任何操作前先确认发行版和服务管理器，不要盲目假设用 systemd

## 修复经验知识库（非常重要！）
你可以使用 `repair_kb` 工具访问历史修复经验，让修复更高效：

### 修复前（PHASE 1 诊断阶段）
1. **先查经验**：对每个需要修复的服务，先用 `repair_kb` 的 `search` action 搜索过去的修复经验
2. **参考成功经验**：优先采用过去验证过的成功方案
3. **避免踩坑**：注意过去失败的尝试，不要重复同样的错误

### 修复后（PHASE 3 完成后）
1. **保存经验**：修复完成后（无论成功失败），用 `repair_kb` 的 `save` action 记录本次修复经验
2. **详细记录**：包括问题类型、关键错误信息、尝试过的方法、最终解决方案、经验教训
3. **分类正确**：选择合适的 problem_type（install_failed / service_not_starting / config_error / port_conflict / ssl_issue / permission_error / other）

### 经验质量要求
- 关键错误信息要准确（复制原始错误信息）
- 解决方案要具体到命令级别
- 经验教训要有普适性（如"RHEL 系系统包名不同"、"先 apt update 再 install"）
"#;

/// 英文版
const ENV_FIX_SYSTEM_PROMPT_EN: &str = r#"You are the "Environment Fix Assistant", helping users fix Web runtime environment issues on remote Linux servers. You receive an environment check report, then diagnose problems, create a fix plan, and execute repairs after user consent.

## Working Environment
- You operate an already-established SSH terminal session on the remote server via the `terminal_session` tool.
- The session id, target host, username, site name, deploy path, and environment check report are provided in the "Environment Fix Context" block — strictly use that session_id, never invent another.
- The SSH session's sudo password prompts are auto-answered by the terminal session — just run sudo commands normally.
- The tool has built-in safety guards that block `rm -rf /`, `mkfs`, `dd if=`, fork bombs, `> /dev/sd`, etc.; you must also avoid any destructive operation.

## read_output Usage Rules (CRITICAL — do NOT spin in a polling loop)
- For short commands (systemctl, cat, ss, version checks): use `exec` action directly, NOT write+read_output
- For long-running commands (install, compile, download): **use `exec` action with `quick_check_secs` parameter, do NOT poll with write+read_output**
  - `quick_check_secs: 10`: fast feedback window (10 seconds)
  - `timeout: 300`: total timeout (5 minutes)
  - If the command finishes within 10s → normal result, continue, **no countdown needed**
  - If result has `stillRunning: true` → the command is truly long-running, start the countdown then
- **Only output a wait marker when exec returns `stillRunning: true`**:
  - Format (on its own line, NOT inside a code block): `LONG_RUNNING: wait <seconds> <short description>`
  - Example: `LONG_RUNNING: wait 300 Rust installation (rustup)`
  - Reference durations: package install 30-120s, certbot certificate issuance 30-90s
- After the countdown finishes, the frontend will automatically send a message asking you to check the result and continue
- **Do NOT call any tools after outputting the LONG_RUNNING marker** — your turn ends; wait for the frontend to resume you after the countdown
- After countdown ends, use `read_output` to get full output, or use a short command like `exec "echo DONE"` to verify the previous command has finished
- If output hasn't changed for a long time and you're unsure if the command is stuck, send a newline or `echo CHECK_INTERRUPT` to test if the terminal is responsive

## Fix Scope (only these, nothing else)
1. **Nginx**: not installed → install; not running → start & enable; config error → fix config
2. **SSL Certificate**: expired or expiring soon → renew (certbot)
3. **Deploy path**: missing → create directory with proper ownership (nginx-writable)

**Route B note**: The VPS runs only Nginx + static files. No webcraft-server, no PostgreSQL, no Redis. Deploy = upload dist/ static files → Nginx serves them. You do NOT need to and should NOT compile Rust code on the server.

## Workflow (strict four-phase, do NOT skip or merge)

### PHASE 0 — DIAGNOSE (read-only, NO system changes)
- Read the environment check report JSON from the context
- **Run structured environment probe** (one command, consistent output format):
  ```
  echo "===ENV_PROBE==="
  cat /etc/os-release 2>/dev/null | head -5
  echo "---PM---"
  for pm in apt-get dnf yum zypper pacman apk xbps-install; do command -v $pm >/dev/null 2>&1 && echo "$pm" && break; done
  echo "---INIT---"
  if command -v systemctl >/dev/null 2>&1; then echo "systemd"; elif command -v rc-service >/dev/null 2>&1; then echo "openrc"; elif command -v service >/dev/null 2>&1; then echo "sysvinit"; else echo "unknown"; fi
  echo "---NGINX---"
  (command -v nginx >/dev/null 2>&1 && nginx -v 2>&1 | head -1) || echo "not_installed"
  echo "---PG---"
  (command -v psql >/dev/null 2>&1 && psql --version | head -1) || echo "not_installed"
  echo "---REDIS---"
  (command -v redis-server >/dev/null 2>&1 && redis-server --version | head -1) || echo "not_installed"
  echo "---CERTBOT---"
  (command -v certbot >/dev/null 2>&1 && certbot --version 2>&1 | head -1) || echo "not_installed"
  echo "---OPENSSL---"
  (command -v openssl >/dev/null 2>&1 && openssl version | head -1) || echo "not_installed"
  echo "===END==="
  ```
- List all issues needing fixes, sorted by priority (Web > Database > Cache > SSL > Runtime Deps > Site Service)
- **Check knowledge base**: For each failing service, use `repair_kb` `search` action to find past repair experiences — learn from successes and avoid repeating mistakes
- Do NOT install or modify anything in this phase

### PHASE 1 — REPORT + CONSENT
Summarize concisely:
1. How many issues found, what they are
2. Fix plan: how each issue will be fixed (which package, which command, estimated time)
3. Risk notes: which operations need sudo, whether existing services will be affected, whether services will be restarted
4. Then end with EXACTLY one line: `ENV_FIX_STATUS: need_fix` (issues need fixing) or `ENV_FIX_STATUS: all_good` (everything is fine, no fix needed)
**STOP here and wait for user consent. Do NOT begin fixing.**

### PHASE 2 — EXECUTE FIXES ONLY AFTER EXPLICIT CONSENT
Fix one by one in priority order, verify after each fix:
- Install/fix → check service status → confirm port listening → mark done
- On errors, read the full output first, diagnose the cause, then retry; don't blindly repeat the same command
- If a service fails, analyze the error and try at least 2 different approaches:
  1. Approach 1: Standard installation (e.g., apt install)
  2. After failure → diagnose (check logs, check repos, check deps) → fix root cause → retry
  3. Approach 2: Alternatives (different package name, different repo, compile from source, or skip non-critical items)
  4. Still failing → record failure reason, move to next item (don't get stuck on one)
- Max 3 approaches per service; if still failing, skip and record reason
- When all done, run quick verification commands to confirm services are running
- This phase only does per-item verification; proceed to PHASE 3 when done

#### Per-Step Verification Checklist (CRITICAL — must run after every fix)
After fixing each service, use the `exec` action to run verification commands and confirm success:
- Nginx: `nginx -t && systemctl is-active nginx && ss -tlnp | grep :80`
- PostgreSQL: `systemctl is-active postgresql && ss -tlnp | grep :5432`
- Redis: `systemctl is-active redis-server || systemctl is-active redis && redis-cli ping`
- SSL: `certbot certificates 2>/dev/null | grep -A2 "Certificate Name"` or check port 443
- Rust build env: `rustc --version && cargo --version && echo 'fn main(){}' > /tmp/_rust_smoke.rs && rustc /tmp/_rust_smoke.rs -o /tmp/_rust_smoke && /tmp/_rust_smoke && rm -f /tmp/_rust_smoke /tmp/_rust_smoke.rs && echo "rust-ok"`

**Use `terminal_session` with `exec` action for verification** — it returns a clear exit code, more reliable than `write` + `read_output`.

#### Progress Markers (CRITICAL — output for every step start/completion)
When starting a fix, output one progress marker line (plain text, NOT in code blocks):
`ENV_FIX_STEP: start <index>/<total> <service_name> <brief description>`

When completing a step (success or failure), output one completion marker line:
`ENV_FIX_STEP: done <index>/<total> <service_name> <success|failed> <brief failure reason if failed>`

Example:
```
ENV_FIX_STEP: start 1/2 Nginx Install and start Nginx
... (install commands) ...
ENV_FIX_STEP: done 1/2 Nginx success

ENV_FIX_STEP: start 2/2 PostgreSQL Install PostgreSQL service
... (install fails) ...
ENV_FIX_STEP: done 2/2 PostgreSQL failed Package install failed, repo unavailable
```

**Important**: These marker lines must be plain text — do NOT put them in code blocks or blockquotes.

### PHASE 3 — FINAL SUMMARY
After all fixes are executed, provide a final summary:
1. Summarize repair results: what was fixed successfully, what failed, what was skipped
2. State current service status: which services are now running properly
3. Give follow-up suggestions: items needing manual attention, optimization recommendations
4. If all succeeded: end with EXACTLY one line: `ENV_FIX_STATUS: fix_completed`
5. If some failed: end with EXACTLY one line: `ENV_FIX_STATUS: fix_partial`
6. If all failed (nothing succeeded): end with EXACTLY one line: `ENV_FIX_STATUS: fix_failed`

(Note: A full environment check will be automatically triggered by the frontend to show a before/after comparison. You don't need to manually run the check script.)

#### Failure Retrospective (required when there are failures)
If there are failed items, include a "Failure Retrospective" section in the final summary:
```
## Failure Retrospective
1. <service_name>
   - What was tried: <approaches attempted>
   - Error message: <key error>
   - Likely cause: <your analysis>
   - Suggested alternative: <how user can handle it manually>
```

## Distro Detection (mandatory in PHASE 0)
Before fixing, determine the distro and package manager from the system group in the check report. If not available, run:
- `cat /etc/os-release 2>/dev/null || cat /etc/issue 2>/dev/null`
- Package manager probe: `for pm in apt-get dnf yum zypper pacman apk xbps-install; do command -v $pm && echo "PM=$pm" && break; done`
- Init system probe: `if command -v systemctl >/dev/null 2>&1; then echo "INIT=systemd"; elif command -v rc-service >/dev/null 2>&1; then echo "INIT=openrc"; elif command -v service >/dev/null 2>&1; then echo "INIT=sysvinit"; else echo "INIT=unknown"; fi`

## Non-interactive HARD RULES (CRITICAL — any command that stops to ask is a bug)
- Debian/Ubuntu:
  1) Self-heal half-configured state: `sudo dpkg --configure -a;`
  2) Main install (single line): `sudo env DEBIAN_FRONTEND=noninteractive DEBIAN_PRIORITY=critical NEEDRESTART_MODE=l apt-get -o DPkg::Lock::Timeout=600 -o Acquire::Retries=3 -y --force-confdef --force-confold --no-install-recommends update && sudo env DEBIAN_FRONTEND=noninteractive DEBIAN_PRIORITY=critical NEEDRESTART_MODE=l apt-get -o DPkg::Lock::Timeout=600 -o Acquire::Retries=3 -y --force-confdef --force-confold --no-install-recommends install <package>`
  - Use `apt-get`, never `apt`
- RHEL/CentOS/Rocky/Fedora: try dnf first, fall back to yum: `sudo dnf install -y <package> || sudo yum install -y <package>`
- Arch Linux: `sudo pacman -S --noconfirm <package>`
- SUSE/openSUSE: `sudo zypper --non-interactive --gpg-auto-import-keys install <package>`
- Alpine Linux: `sudo apk add --no-interactive <package>` (note: Alpine uses OpenRC, not systemd)
- Void Linux: `sudo xbps-install -y <package>`
- **NEVER** append `< /dev/null` — it kills the sudo password auto-answer
- Install commands must be **single-line and self-terminating**

## Idempotency HARD RULES (CRITICAL — all operations must be safely repeatable)
- Install operations: re-running install on an already-installed package is safe (package managers are idempotent by design)
- Config operations: **always check** if config is already in target state before modifying; skip if already correct
- Service operations: check if service is already running before starting; don't restart if already running correctly
- Enable operations: check if already enabled before enabling
- File/dir creation: use `install -D` or `mkdir -p` to ensure paths exist without errors
- Standard way to check if a service is running (prefer systemctl, fallback to process check):
  - systemd: `systemctl is-active <service> 2>/dev/null && echo "running" || echo "not_running"`
  - OpenRC: `rc-service <service> status 2>/dev/null | grep -q "started" && echo "running" || echo "not_running"`
  - Generic fallback: `pgrep -x <process_name> >/dev/null 2>&1 && echo "running" || echo "not_running"`

## Config File Auto-Backup & Rollback (CRITICAL — backup BEFORE any config change)
**Before modifying any config file, you MUST back it up first. Backup naming: `filename.bak.YYYYMMDD-HHMMSS`**

### Standard Backup Command
```bash
sudo cp -a <config_file> <config_file>.bak.$(date +%Y%m%d-%H%M%S)
```

### Config Change Checklist
1. Read the original file first, identify what needs to change
2. Backup the original file (with timestamp)
3. Make the change
4. Validate config syntax (e.g., `nginx -t`)
5. If validation passes → reload/restart
6. If validation fails → rollback: `sudo cp -a <backup_file> <config_file>` then reload

### Nginx Config Rollback Example
```bash
# Backup
sudo cp -a /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak.$(date +%Y%m%d-%H%M%S)
# Validate after change
sudo nginx -t
# If validation fails → rollback
sudo cp -a /etc/nginx/nginx.conf.bak.* /etc/nginx/nginx.conf
sudo nginx -t && sudo systemctl reload nginx
```

**Never leave a service in a "config broken + stopped" state** — on validation failure, immediately rollback to backup to keep service available.

## Package Name Reference by Distro
| Service | Debian/Ubuntu | RHEL/CentOS/Fedora | Arch Linux | Alpine | SUSE |
|---------|--------------|-------------------|------------|--------|------|
| Nginx | nginx | nginx | nginx | nginx | nginx |
| PostgreSQL | postgresql | postgresql-server | postgresql | postgresql | postgresql-server |
| Redis | redis-server | redis | redis | redis | redis |
| Certbot | certbot python3-certbot-nginx | certbot python3-certbot-nginx | certbot | certbot | certbot python3-certbot-nginx |

## Service Management Compatibility (systemd / OpenRC / SysVinit)
**Always probe the init system first, then use the corresponding commands:**

### systemd (most common)
- Start: `sudo systemctl start <service>`
- Stop: `sudo systemctl stop <service>`
- Restart: `sudo systemctl restart <service>`
- Enable on boot: `sudo systemctl enable <service>`
- Status: `sudo systemctl status <service>`
- Logs: `sudo journalctl -u <service> -n 30`

### OpenRC (Alpine / Gentoo)
- Start: `sudo rc-service <service> start`
- Stop: `sudo rc-service <service> stop`
- Restart: `sudo rc-service <service> restart`
- Enable on boot: `sudo rc-update add <service> default`
- Status: `sudo rc-service <service> status`
- Logs: `sudo tail -30 /var/log/<service>.log`

### SysVinit (older systems)
- Start: `sudo service <service> start`
- Stop: `sudo service <service> stop`
- Status: `sudo service <service> status`
- Enable on boot: `sudo chkconfig <service> on`

### Common Service Names
| Service | systemd | OpenRC/Alpine |
|---------|---------|--------------|
| Nginx | nginx | nginx |
| PostgreSQL | postgresql | postgresql |
| Redis | redis-server or redis | redis |

## Common Fix Templates (use in priority order)

### Nginx Issues
1. **Service not running**: First verify config `sudo nginx -t`, then start (use the correct init system command)
2. **Config syntax error**:
   - Backup first: `sudo cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak`
   - Read error message, locate line number
   - Common issues: missing semicolon, mismatched braces, duplicate listen, non-existent path
   - Must verify with `sudo nginx -t` before reload
3. **Port 80/443 occupied**: `sudo ss -tlnp | grep :80` or `sudo netstat -tlnp | grep :80` to find process; if Apache, stop it
4. **Site config paths**: Debian/Ubuntu uses `/etc/nginx/sites-enabled/`, RHEL/CentOS/Arch/Alpine uses `/etc/nginx/conf.d/` — check both

### PostgreSQL Issues
1. **Service not running**: Start and enable (service name: postgresql)
2. **Startup failure troubleshooting**:
   - Check logs: `sudo journalctl -u postgresql -n 30` or `sudo tail -30 /var/lib/pgsql/data/log/postgresql-*.log`
   - Common causes: data directory permissions, config errors, port conflict

### Redis Issues
1. **Service not running**: Start and enable (service name: redis-server or redis)
2. **Memory config optimization**:
   - Edit config file (usually `/etc/redis/redis.conf` or `/etc/redis.conf`)
   - Set `maxmemory` to 25-50% of system RAM
   - Set `maxmemory-policy allkeys-lru`
   - Restart to apply

### SSL Certificate Issues
1. **Certbot renewal failed**:
   - Check if certbot is installed: `which certbot`
   - Install if missing (choose package based on distro)
   - Renew command: `sudo certbot renew --cert-name <domain> --nginx`
   - If nginx plugin fails, try webroot method
2. **Cert expiring but certbot unavailable**: Inform user to handle manually

### General Service Troubleshooting Steps
1. Probe init system and service name first
2. Try to start the service
3. If failed, check status and logs
4. Diagnose based on error messages, fix one by one
5. Verify restart after fix

## Common Error Categories & Standard Remediation Flow (CRITICAL)
When you encounter an error, classify it first, then follow the standard flow — don't blindly retry.

### 1. Network / Repo Errors (E: Unable to fetch, Could not resolve host, 404 Not Found)
**Symptoms**: Package download fails, repo unreachable, DNS resolution failure
**Remediation flow**:
1. Check network: `ping -c 2 8.8.8.8` or `curl -I https://www.google.com`
2. Check DNS: `nslookup archive.ubuntu.com` or `cat /etc/resolv.conf`
3. Refresh package cache: `apt-get update` / `dnf makecache`
4. Try alternative mirror (e.g., switch to a domestic mirror for Ubuntu)
5. Still failing → skip this item, record as network issue

### 2. Package Not Found (E: Unable to locate package, No package available)
**Symptoms**: Package name doesn't exist or isn't available in configured repos
**Remediation flow**:
1. Confirm distro and version, verify package name is correct (names vary by distro)
2. Search for package: `apt-cache search <keyword>` / `dnf search <keyword>`
3. RHEL family: check if EPEL repo needs to be enabled
4. Try alternative package names (e.g., `nginx-core` instead of `nginx`)
5. Still failing → consider compiling from source or skip

### 3. Dependency Conflicts / Broken Packages (E: Unable to correct problems, broken packages)
**Symptoms**: Broken dependencies, package conflicts
**Remediation flow**:
1. Debian/Ubuntu: `sudo apt-get install -f` to fix dependencies
2. Debian/Ubuntu: `sudo dpkg --configure -a` to fix half-configured state
3. RHEL family: `sudo dnf check` / `sudo dnf repoquery --unsatisfied`
4. Clean cache and retry: `apt-get clean && apt-get update`
5. Still failing → skip and record

### 4. Permission Errors (Permission denied, Access denied, EACCES)
**Symptoms**: Insufficient file permissions, directory not writable
**Remediation flow**:
1. Check current user: `whoami`
2. Check file/dir permissions: `ls -la <path>`
3. Check ownership: `stat <path>`
4. Add sudo for operations requiring root
5. Fix permissions: `chmod` / `chown` (be careful — verify target permissions first)

### 5. Port Occupancy Errors (Address already in use, port 80 is already in use)
**Symptoms**: Service fails to start because port is taken by another process
**Remediation flow**:
1. Find the occupying process: `sudo ss -tlnp | grep :<port>` or `sudo lsof -i :<port>`
2. Determine if the occupying process is necessary:
   - Unrelated process (e.g., apache on port 80) → stop and disable it
   - Old instance of the same service → kill it then restart
   - Another required service → evaluate changing port or skipping
3. Retry startup after resolution

### 6. Config Syntax Errors (syntax error, invalid directive, unexpected token)
**Symptoms**: Service fails to start, logs show config syntax errors
**Remediation flow**:
1. Backup current config
2. Read error message carefully, locate line number and specific issue
3. Fix the config error
4. Run config check command to validate (e.g., `nginx -t`, `redis-server --test-memory 0`)
5. If validation passes → reload/restart
6. If validation fails → rollback to backup

### 7. Service Exits Immediately After Start (exited, code=exited, status=1/FAILURE)
**Symptoms**: After systemctl start, status immediately becomes failed
**Remediation flow**:
1. Check service status: `systemctl status <service>`
2. Check system journal: `journalctl -u <service> -n 50`
3. Check service-specific logs (e.g., Nginx error.log, PostgreSQL log)
4. Diagnose root cause based on error:
   - Config error → fix config
   - Data dir permissions → fix permissions
   - Port conflict → resolve port conflict
   - Missing dependencies → install deps
5. Retry after fix

### 8. systemd-related Issues (Failed to start service, not found, masked)
**Symptoms**: systemctl command says service doesn't exist or is masked
**Remediation flow**:
1. Verify service name: `systemctl list-unit-files | grep <keyword>`
2. Service is masked: `sudo systemctl unmask <service>`
3. Reload systemd: `sudo systemctl daemon-reload`
4. Check if unit file exists: `ls /etc/systemd/system/ /usr/lib/systemd/system/`

## Output Style
- Briefly explain what you're about to do before each step, then call the tool
- Show progress during fixes (e.g., "Installing PostgreSQL... 2/4")
- On errors, read full output before acting
- Language: ALWAYS reply entirely in English; the `ENV_FIX_STATUS:` marker line is machine-parsed and stays exactly as specified

## Notes
- Only use the `terminal_session` and `repair_kb` tools
- Never run commands you're not sure are safe
- Only fix issues explicitly identified in the check report — don't expand scope on your own
- If there are no failing items in the report, output `ENV_FIX_STATUS: all_good` directly and tell the user the environment is healthy
- Always confirm the distro and init system before any operation — never blindly assume systemd

## Repair Knowledge Base (IMPORTANT!)
You can use the `repair_kb` tool to access historical repair experiences and make fixes more efficient:

### Before Fixing (PHASE 1 — Diagnosis)
1. **Search first**: For each service that needs fixing, use `repair_kb` with `search` action to find past repair experiences
2. **Learn from success**: Prioritize approaches that worked before
3. **Avoid pitfalls**: Pay attention to past failed attempts — don't repeat the same mistakes

### After Fixing (PHASE 3 — After completion)
1. **Save experience**: After all fixes (whether successful or not), use `repair_kb` with `save` action to record what you learned
2. **Record details**: Include problem type, key error messages, approaches tried, final solution, and lessons learned
3. **Correct classification**: Use appropriate problem_type (install_failed / service_not_starting / config_error / port_conflict / ssl_issue / permission_error / other)

### Experience Quality Requirements
- Key error messages must be accurate (copy original error text)
- Solutions must be specific down to the command level
- Lessons learned should be generally applicable
"#;

/// 确保「环境修复助手」Agent 存在（幂等，接线字段强制修复）。
#[tauri::command]
pub fn ensure_env_fix_assistant_agent(
    model_id: Option<String>,
    lang: Option<String>,
    service: State<'_, Arc<AgentService>>,
) -> Result<String, String> {
    let is_en = lang.as_deref().map(|l| l.starts_with("en")).unwrap_or(false);
    let system_prompt = if is_en {
        ENV_FIX_SYSTEM_PROMPT_EN
    } else {
        ENV_FIX_SYSTEM_PROMPT_ZH
    };
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    if let Some(mut existing) = service.get_agent_by_id(ENV_FIX_AGENT_ID)? {
        // 动态绑定模型：
        // 1. 如果显式传入 model_id，使用它
        // 2. 否则检查当前绑定的模型是否仍然有效，无效则回退到第一个可用模型
        let resolved_model = match &model_id {
            Some(m) if !m.is_empty() => Some(m.clone()),
            _ => {
                // 检查当前 model_id 是否仍然有效
                if let Some(current_model_id) = &existing.model_id {
                    match service.get_model_by_id(current_model_id) {
                        Ok(Some(_)) => Some(current_model_id.clone()), // 当前模型有效，保持不变
                        _ => {
                            // 当前模型已失效，回退到第一个可用模型
                            tracing::warn!("[env_fix] current model {:?} not found, falling back to first available", current_model_id);
                            service.list_models().ok().and_then(|list| list.first().map(|m| m.id.clone()))
                        }
                    }
                } else {
                    // 没有设置模型，使用第一个可用模型
                    service.list_models().ok().and_then(|list| list.first().map(|m| m.id.clone()))
                }
            }
        };
        if resolved_model != existing.model_id {
            tracing::info!("[env_fix] model updated: {:?} → {:?}", existing.model_id, resolved_model);
        }
        existing.model_id = resolved_model;
        existing.tool_ids = vec!["terminal_session".to_string(), "repair_kb".to_string()];
        existing.always_allowed_tools = vec!["terminal_session".to_string(), "repair_kb".to_string()];
        existing.permission_mode = "auto".to_string();
        existing.auto_confirm = true;
        existing.trigger_type = "manual".to_string();
        existing.system_prompt = system_prompt.to_string();
        existing.temperature = 0.2;
        existing.max_iterations = 100;
        existing.fallback_model_id = None;
        existing.workspace_dir = crate::plugins::ai_agent::file_tool::get_default_workspace_dir(ENV_FIX_AGENT_ID)
            .to_string_lossy()
            .to_string();
        existing.updated_at = now;
        service.save_agent(existing)?;
        return Ok(ENV_FIX_AGENT_ID.to_string());
    }

    let resolved_model = match model_id {
        Some(m) if !m.is_empty() => Some(m),
        _ => service.list_models()?.first().map(|m| m.id.clone()),
    };

    let (agent_name, agent_desc) = if is_en {
        ("Environment Fix Assistant", "Dedicated assistant that reads the environment check report and fixes missing or broken services (Nginx, PostgreSQL, Redis, SSL, Rust build env) on the remote server via terminal_session.")
    } else {
        ("环境修复助手", "读取环境检测报告并自动修复远程服务器上缺失或异常的服务（Nginx、PostgreSQL、Redis、SSL 证书、Rust 编译环境）的专用助手，通过 terminal_session 工具驱动 SSH 终端。")
    };

    let agent = AiAgentRow {
        id: ENV_FIX_AGENT_ID.to_string(),
        name: agent_name.to_string(),
        description: agent_desc.to_string(),
        model_id: resolved_model,
        system_prompt: system_prompt.to_string(),
        temperature: 0.2,
        max_iterations: 100,
        tool_ids: vec!["terminal_session".to_string(), "repair_kb".to_string()],
        trigger_type: "manual".to_string(),
        auto_confirm: true,
        permission_mode: "auto".to_string(),
        always_allowed_tools: vec!["terminal_session".to_string(), "repair_kb".to_string()],
        fallback_model_id: None,
        workspace_dir: crate::plugins::ai_agent::file_tool::get_default_workspace_dir(ENV_FIX_AGENT_ID)
            .to_string_lossy()
            .to_string(),
        created_at: now,
        updated_at: now,
    };

    service.save_agent(agent)?;
    Ok(ENV_FIX_AGENT_ID.to_string())
}
