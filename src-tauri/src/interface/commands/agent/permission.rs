use std::sync::Arc;
use tauri::State;

use crate::app::agent_service::AgentService;

use super::PENDING_PERMISSIONS;

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
