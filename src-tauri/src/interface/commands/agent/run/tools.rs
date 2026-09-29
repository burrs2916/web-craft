use std::sync::Arc;

use crate::app::agent_service::AgentService;
use crate::app::plugin_service::PluginService;
use crate::app::terminal_service::TerminalService;
use crate::infra::storage::agent_repo::AiAgentRow;
use crate::infra::storage::database::Database;
use crate::plugins::ai_agent::engine::ToolRegistry;

/// 解析该 agent 实际生效的工具 id 列表。
/// 空 tool_ids 表示「全部工具」：注册所有内置工具 + 全部已启用插件工具。
/// 这样任何未显式配置工具的 agent（默认新建 / seed 残留空值）都能调用项目所有工具，
/// 不会再出现 `Tool '' is not available`。
pub fn resolve_effective_tool_ids(
    agent: &AiAgentRow,
    plugin_service: &PluginService,
) -> Vec<String> {
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
    effective_tool_ids
}

/// 注册 agent 可用的内置工具与已启用插件工具。
pub async fn register_agent_tools(
    tools: &Arc<tokio::sync::Mutex<ToolRegistry>>,
    agent: &AiAgentRow,
    effective_tool_ids: &[String],
    db: Arc<Database>,
    terminal_svc: Arc<TerminalService>,
    plugin_service: &Arc<PluginService>,
    service: &Arc<AgentService>,
) {
    for tool_id in effective_tool_ids {
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
                let kb_dir = plugin_service.data_dir()
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
                    plugin_service.clone(),
                    tools.clone(),
                    service.clone(),
                    agent.id.clone(),
                    ws_dir,
                )));
            }
            "memory" => {
                let agent_memory_dir = plugin_service.data_dir()
                    .join("agents").join(&agent.id);
                let mut reg = tools.lock().await;
                reg.register(Arc::new(crate::plugins::ai_agent::memory_tool::MemoryTool::new(agent_memory_dir)));
            }
            "repair_kb" => {
                let kb_dir = plugin_service.data_dir()
                    .join("agents").join(&agent.id);
                let mut reg = tools.lock().await;
                reg.register(Arc::new(crate::plugins::ai_agent::repair_kb_tool::RepairKbTool::new(kb_dir)));
            }
            _ => {
                if let Ok(Some((pid, plugin_tool))) = plugin_service.find_enabled_tool(tool_id) {
                    let ws_dir = crate::plugins::ai_agent::file_tool::resolve_workspace_dir(&agent.workspace_dir, &agent.id);
                    let mut reg = tools.lock().await;
                    let agent_tool = crate::plugins::ai_agent::plugin_tool::PluginAgentTool::new(plugin_tool, ws_dir)
                        .with_logging(plugin_service.clone(), pid);
                    reg.register(Arc::new(agent_tool));
                }
            }
        }
    }
}
