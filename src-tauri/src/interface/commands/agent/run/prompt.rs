use crate::app::plugin_service::PluginService;
use crate::infra::storage::agent_repo::AiAgentRow;

/// 统一判断某工具是否对该 agent 可用：空 tool_ids 视为全部可用。
pub fn agent_uses_tool(agent: &AiAgentRow, name: &str) -> bool {
    agent.tool_ids.is_empty() || agent.tool_ids.iter().any(|t| t == name)
}

/// 构建 system prompt：基础提示 + 会话连续性 + 插件场景/工具说明 + 项目上下文。
/// 场景化上下文（rdSetup / srvEnvSetup / ops / envFix）与语言规则由调用方另行追加。
pub fn build_system_prompt(
    agent: &AiAgentRow,
    effective_tool_ids: &[String],
    plugin_service: &PluginService,
    skip_tools: bool,
) -> String {
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

    let agent_uses_tool = |name: &str| -> bool {
        agent.tool_ids.is_empty() || agent.tool_ids.iter().any(|t| t == name)
    };
    let uses_any_except = |excluded: &[&str]| -> bool {
        if agent.tool_ids.is_empty() { return true; }
        agent.tool_ids.iter().any(|t| !excluded.contains(&t.as_str()))
    };

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
        let agent_memory_dir = plugin_service.data_dir()
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

    system_prompt
}

/// 输出语言跟随用户界面语言（最终指令，放在 system prompt 最末尾最有效）。
/// 对用户自定义 System Prompt 的智能体（终端助手等）同样生效：不翻译用户 prompt 内容，
/// 只锁定回复语言。会话 metadata 由前端 AiCopilotPage 写入 lang 字段。
pub fn push_language_rule(system_prompt: &mut String, metadata: &str) {
    if let Ok(meta) = serde_json::from_str::<serde_json::Value>(metadata) {
        let ui_is_en = meta.get("lang").and_then(|v| v.as_str()).map(|l| l.starts_with("en")).unwrap_or(false);
        if ui_is_en {
            system_prompt.push_str("\n\nLANGUAGE RULE (final, overrides everything above): The user's UI language is English. ALWAYS write your ENTIRE reply in English, regardless of the language of the user's message or any instruction above. Keep machine-parsed markers (e.g. RD_STATUS) as specified.");
        } else {
            system_prompt.push_str("\n\n语言规则（最终指令，覆盖以上所有内容）：用户界面语言为中文，请始终用简体中文回复，无论用户消息或以上任何指令是什么语言。机器解析标记（如 RD_STATUS）保持原样。");
        }
    }
}
