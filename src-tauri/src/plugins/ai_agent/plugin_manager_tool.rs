//! 插件管理 Agent 工具：让 AI 通过 `list/get/create/update/delete/toggle/list_tools/test/refine/analyze_usage`
//! 等动作增删改查「插件」本身。
//!
//! 按职责拆分为子模块（各模块通过 `use super::*;` 共享本文件的导入与类型）：
//! - [`crud`]：list / get / create / update / delete / toggle
//! - [`tools`]：list_tools / test 与失败诊断
//! - [`params`]：入参解析（工具、参数、场景、触发词、ID 去重、命名冲突检查）
//! - [`refine`]：refine（按自然语言改写插件定义）
//! - [`analyze`]：analyze_usage（使用统计与修复建议）与分组推断
//! - [`script_helpers`]：脚本错误分类与自动打补丁

use async_trait::async_trait;
use serde_json::{Value, json};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;

const PLUGIN_MANAGER_DESCRIPTION: &str = "\
Manage plugins: create, refine, test, and analyze AI-powered tools.

## WORKFLOW:
1. **Create**: action='create' → action='test' → fix with action='refine' if needed → test again
2. **Refine**: action='analyze_usage' (get fix suggestions) → action='refine' with patch_tools → action='test'
3. **Always test** after create/refine. Use patch_tools for incremental changes.

## SCRIPT FORMATS:
1. **Script file** (RECOMMENDED): 'script:INTERPRETER\\nSCRIPT_CONTENT' — Use {{param_name}} for substitution. {{workspace_dir}} is a DIRECTORY — always append filename: {{workspace_dir}}/result.json
2. **Shell**: 'shell: COMMAND' — Simple one-liners only. Use {{param_name}} for substitution.
3. **HTTP**: 'METHOD URL_TEMPLATE' — Real external APIs only.
NEVER use 'shell: python3 -c \"...\"' for complex code — use 'script:python3' instead.

## PARAMETER UI HINTS (always add to parameters):
- ui_widget: 'file'|'select'|'textarea'|'number'|'checkbox'|'text'
- ui_label: Human-readable name (e.g. 'Input File')
- ui_placeholder: Hint text | ui_options: Choices for 'select' | ui_accept: File filter for 'file'

## RESULT VIEW: Set result_view on tools: { viewType: 'table'|'list'|'json'|'markdown'|'text' }

## RULES:
- Always include scenarios and trigger_keywords when creating
- Add ui_* hints to parameters; set result_view for structured output
- If dependency missing, add auto-install: subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'PKG', '-q'])
- Print results to stdout only. Create test data inside test scripts.
- NEVER use {{workspace_dir}} as a file path — it's a DIRECTORY. Always append a filename.
";

use crate::app::plugin_service::PluginService;
use crate::app::agent_service::AgentService;
use crate::plugins::domain::plugin::{PluginManifest, PluginScenario, PluginTool, ToolParameter};
use crate::plugins::domain::changelog::{ChangelogEntry, ToolChange};
use crate::plugins::domain::ui_schema::UiSchema;
use super::engine::{AgentTool, ToolOutput, ToolRegistry};
use super::plugin_tool::PluginAgentTool;

pub struct PluginManagerTool {
    plugin_service: Arc<PluginService>,
    tool_registry: Option<Arc<Mutex<ToolRegistry>>>,
    agent_service: Option<Arc<AgentService>>,
    current_agent_id: Option<String>,
    workspace_dir: PathBuf,
}

impl PluginManagerTool {
    #[allow(dead_code)]
    pub fn new(plugin_service: Arc<PluginService>) -> Self {
        let workspace_dir = std::env::temp_dir();
        PluginManagerTool {
            plugin_service,
            tool_registry: None,
            agent_service: None,
            current_agent_id: None,
            workspace_dir,
        }
    }

    pub fn with_context(
        plugin_service: Arc<PluginService>,
        tool_registry: Arc<Mutex<ToolRegistry>>,
        agent_service: Arc<AgentService>,
        agent_id: String,
        workspace_dir: PathBuf,
    ) -> Self {
        PluginManagerTool {
            plugin_service,
            tool_registry: Some(tool_registry),
            agent_service: Some(agent_service),
            current_agent_id: Some(agent_id),
            workspace_dir,
        }
    }
}

#[async_trait]
impl AgentTool for PluginManagerTool {
    fn name(&self) -> &str {
        "plugin_manager"
    }

    fn description(&self) -> &str {
        PLUGIN_MANAGER_DESCRIPTION
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["list", "get", "create", "update", "delete", "toggle", "list_tools", "test", "refine", "analyze_usage"],
                    "description": "Action: list|get|create|update|delete|toggle|list_tools|test|refine|analyze_usage. For refine, prefer patch_tools over replacing all tools."
                },
                "plugin_id": {
                    "type": "string",
                    "description": "Plugin ID (for 'get', 'update', 'delete', 'toggle' actions)"
                },
                "tool_name": {
                    "type": "string",
                    "description": "Tool name within a plugin (for 'test' action)"
                },
                "test_params": {
                    "type": "object",
                    "description": "Parameters to pass to the tool being tested (for 'test' action)"
                },
                "name": {
                    "type": "string",
                    "description": "Plugin name (for 'create', 'update' actions)"
                },
                "version": {
                    "type": "string",
                    "description": "Plugin version, e.g. '1.0.0' (for 'create', 'update' actions)"
                },
                "description": {
                    "type": "string",
                    "description": "Plugin description (for 'create', 'update' actions)"
                },
                "author": {
                    "type": "string",
                    "description": "Plugin author (for 'create', 'update' actions)"
                },
                "enabled": {
                    "type": "boolean",
                    "description": "Whether the plugin is enabled (for 'toggle' action)"
                },
                "tools": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": { "type": "string", "description": "Tool name (unique identifier)" },
                            "description": { "type": "string", "description": "What this tool does" },
                            "script": { "type": "string", "description": "Script format: 'script:INTERPRETER\\nCODE' (recommended), 'shell: CMD' (one-liners), 'METHOD URL' (HTTP). Use {{param}} for substitution. {{workspace_dir}} is a DIRECTORY — append filename." },
                            "parameters": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "name": { "type": "string" },
                                        "param_type": { "type": "string", "enum": ["string", "number", "boolean", "object", "array"] },
                                        "required": { "type": "boolean" },
                                        "description": { "type": "string" },
                                        "default_value": {},
                                        "ui_widget": { "type": "string", "enum": ["text", "textarea", "number", "select", "checkbox", "file"], "description": "UI widget type for user-friendly input. Use 'file' for file paths, 'select' for choices, 'textarea' for long text." },
                                        "ui_label": { "type": "string", "description": "Human-readable label (e.g. 'Input File' instead of 'input_path')" },
                                        "ui_placeholder": { "type": "string", "description": "Placeholder hint text" },
                                        "ui_options": { "type": "array", "items": { "type": "string" }, "description": "Options for 'select' widget" },
                                        "ui_accept": { "type": "string", "description": "File type filter for 'file' widget (e.g. '.pptx,.ppt')" },
                                        "ui_group": { "type": "string", "description": "Group name for organizing parameters" },
                                        "ui_order": { "type": "number", "description": "Display order (lower = first)" }
                                    },
                                    "required": ["name", "param_type", "required", "description"]
                                },
                                "description": "Tool parameters. ALWAYS add ui_widget, ui_label, ui_placeholder for user-friendly forms. For file paths use ui_widget='file' with ui_accept. For choices use ui_widget='select' with ui_options."
                            },
                            "result_view": {
                                "type": "object",
                                "description": "How to display the tool's output. Set this for structured output. Examples: {\"viewType\":\"table\",\"columns\":[{\"key\":\"name\",\"label\":\"Name\"}]} for tabular data, {\"viewType\":\"json\"} for JSON, {\"viewType\":\"markdown\"} for markdown text. If omitted, auto-detects format.",
                                "properties": {
                                    "viewType": { "type": "string", "enum": ["text", "table", "list", "json", "markdown"], "description": "Display type" },
                                    "columns": { "type": "array", "items": { "type": "object", "properties": { "key": { "type": "string" }, "label": { "type": "string" } } }, "description": "Column definitions for 'table' view" }
                                }
                            },
                            "interaction": {
                                "type": "object",
                                "description": "Interaction spec for wizard-style UI. Define steps, result actions, and streaming config.",
                                "properties": {
                                    "steps": {
                                        "type": "array",
                                        "items": {
                                            "type": "object",
                                            "properties": {
                                                "id": { "type": "string", "description": "Step identifier" },
                                                "title": { "type": "string", "description": "Step title shown to user" },
                                                "description": { "type": "string", "description": "Step description" },
                                                "fields": { "type": "array", "items": { "type": "string" }, "description": "Parameter names shown in this step" },
                                                "autoAdvance": { "type": "boolean", "description": "Auto-advance to next step after filling" }
                                            },
                                            "required": ["id", "title", "fields"]
                                        }
                                    },
                                    "resultActions": {
                                        "type": "array",
                                        "items": {
                                            "type": "object",
                                            "properties": {
                                                "id": { "type": "string" },
                                                "label": { "type": "string" },
                                                "icon": { "type": "string" },
                                                "actionType": { "type": "string", "description": "Action type: open_file, re_run, copy_result, export" },
                                                "description": { "type": "string" }
                                            },
                                            "required": ["id", "label", "actionType"]
                                        }
                                    },
                                    "streaming": {
                                        "type": "object",
                                        "properties": {
                                            "progressPattern": { "type": "string", "description": "Regex to extract progress from output" },
                                            "statusField": { "type": "string", "description": "JSON field for status updates" },
                                            "showProgress": { "type": "boolean" }
                                        }
                                    }
                                }
                            }
                        },
                        "required": ["name", "description", "script"]
                    },
                    "description": "Tools provided by this plugin (for 'create', 'update' actions). ALWAYS add result_view for tools with structured output, and ui_* hints on parameters."
                },
                "scenarios": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": { "type": "string", "description": "Scenario name, e.g. 'Query IP Location'" },
                            "description": { "type": "string", "description": "When and why to use this plugin in this scenario" },
                            "example_prompt": { "type": "string", "description": "Example user prompt that would trigger this scenario, e.g. 'What is the location of IP 8.8.8.8?'" }
                        },
                        "required": ["name", "description", "example_prompt"]
                    },
                    "description": "Usage scenarios for this plugin. Describe when and how users would want to use this plugin. Always provide at least one scenario when creating a plugin. (for 'create', 'update' actions)"
                },
                "trigger_keywords": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "Keywords that indicate this plugin might be useful, e.g. ['ip', 'location', 'geolocation', 'where']. Always provide relevant keywords when creating a plugin. (for 'create', 'update' actions)"
                },
                "refine_feedback": {
                    "type": "string",
                    "description": "User feedback or improvement request for the plugin (for 'refine' action). Describe what needs to be improved, fixed, or added."
                },
                "patch_tools": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": { "type": "string", "description": "Name of the existing tool to patch (must match an existing tool name)" },
                            "description": { "type": "string", "description": "New description for the tool (optional, only if changing)" },
                            "script": { "type": "string", "description": "New script for the tool (optional, only if changing)" },
                            "parameters": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "name": { "type": "string" },
                                        "type": { "type": "string" },
                                        "required": { "type": "boolean" },
                                        "description": { "type": "string" }
                                    },
                                    "required": ["name", "type", "required", "description"]
                                },
                                "description": "New parameters for the tool (optional, only if changing)"
                            }
                        },
                        "required": ["name"]
                    },
                    "description": "Incrementally patch specific tools without replacing all tools. Each entry patches one existing tool by name. Only specified fields are updated; omitted fields keep their current values. Use this instead of 'tools' when you only need to modify some tools. (for 'refine' action)"
                },
                "add_tools": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": { "type": "string", "description": "Tool name (unique identifier)" },
                            "description": { "type": "string", "description": "What this tool does" },
                            "script": { "type": "string", "description": "Script that defines how to execute this tool" },
                            "parameters": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "name": { "type": "string" },
                                        "type": { "type": "string" },
                                        "required": { "type": "boolean" },
                                        "description": { "type": "string" }
                                    },
                                    "required": ["name", "type", "required", "description"]
                                }
                            }
                        },
                        "required": ["name", "description", "script"]
                    },
                    "description": "Add new tools to the plugin without modifying existing ones. (for 'refine' action)"
                },
                "remove_tools": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "Remove tools by name from the plugin. (for 'refine' action)"
                },
                "changelog_changes": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "List of changes made during refinement, e.g. ['Added error handling', 'Fixed URL template', 'Added new parameter']. (for 'refine' action)"
                },
                "group_id": {
                    "type": "string",
                    "description": "Plugin group ID for categorization. Available groups: 'network' (网络服务), 'dev' (开发工具), 'data' (数据分析), 'creative' (创意工具), 'utility' (实用工具). If not specified, the system will auto-infer based on plugin name and description."
                },
                "category": {
                    "type": "string",
                    "description": "Sub-category within the group, e.g. '通用', 'HTTP工具', etc. (for 'create', 'update' actions)"
                }
            },
            "required": ["action"]
        })
    }

    async fn execute(&self, params: Value) -> Result<ToolOutput, String> {
        let action = params["action"].as_str()
            .ok_or_else(|| "Missing 'action' parameter".to_string())?;

        match action {
            "list" => self.action_list().await,
            "get" => self.action_get(&params).await,
            "create" => self.action_create(&params).await,
            "update" => self.action_update(&params).await,
            "delete" => self.action_delete(&params).await,
            "toggle" => self.action_toggle(&params).await,
            "list_tools" => self.action_list_tools().await,
            "test" => self.action_test(&params).await,
            "refine" => self.action_refine(&params).await,
            "analyze_usage" => self.action_analyze_usage(&params).await,
            _ => Ok(ToolOutput {
                success: false,
                result: format!("Unknown action '{}'. Available: list, get, create, update, delete, toggle, list_tools, test, refine", action),
                metadata: Value::Null,
            }),
        }
    }
}

mod analyze;
mod crud;
mod params;
mod refine;
mod script_helpers;
mod tools;

pub(crate) use script_helpers::{
    add_dependency_install, add_file_validation, classify_error, convert_shell_python_to_script,
};
