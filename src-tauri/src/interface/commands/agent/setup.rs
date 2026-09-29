use std::sync::Arc;
use tauri::State;

use crate::app::agent_service::AgentService;
use crate::infra::storage::agent_repo::AiAgentRow;

mod envFix;
mod opsAssistant;
mod remoteDesktop;
mod serverEnv;

// 用 glob 重导出：`#[tauri::command]` 会额外生成 `__cmd__*` / `__tauri_command_name_*`
// 隐藏符号，`generate_handler!` 依赖它们，定向重导出会漏掉这些符号。
pub use envFix::*;
pub use opsAssistant::*;
pub use remoteDesktop::*;
pub use serverEnv::*;
