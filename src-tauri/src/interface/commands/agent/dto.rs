use serde::{Deserialize, Serialize};

use crate::infra::storage::agent_repo::{
    AiProviderRow, AiEndpointRow, AiModelRow, AiAgentRow,
    AiConversationRow, AiMessageRow,
};

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

pub(super) fn to_provider_dto(p: &AiProviderRow) -> ProviderDto {
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

pub(super) fn to_endpoint_dto(e: &AiEndpointRow) -> EndpointDto {
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

pub(super) fn to_model_dto(m: &AiModelRow) -> ModelDto {
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
pub(super) fn detect_services_from_message(message: &str) -> Vec<String> {
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
pub(super) fn extract_target_from_message(message: &str) -> String {
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

pub(super) fn to_agent_dto(a: &AiAgentRow) -> AgentDto {
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

pub(super) fn to_conversation_dto(c: &AiConversationRow) -> ConversationDto {
    ConversationDto {
        id: c.id.clone(),
        agent_id: c.agent_id.clone(),
        title: c.title.clone(),
        metadata: c.metadata.clone(),
        created_at: c.created_at,
        updated_at: c.updated_at,
    }
}

pub(super) fn to_message_dto(m: &AiMessageRow) -> MessageDto {
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
