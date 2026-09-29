use std::sync::Arc;
use tauri::State;

use crate::app::agent_service::AgentService;
use crate::infra::storage::agent_repo::{AiAgentRow, AiMessageRow};

use super::dto::{
    AgentDto, ConversationDto, MessageDto,
    to_agent_dto, to_conversation_dto, to_message_dto,
};

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
