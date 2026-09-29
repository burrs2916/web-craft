use super::*;

impl PluginManagerTool {
    pub(crate) async fn action_refine(&self, params: &Value) -> Result<ToolOutput, String> {
        tracing::info!("[plugin_manager] action_refine called, params keys: {:?}", params.as_object().map(|o| o.keys().collect::<Vec<_>>()));
        let plugin_id = params["plugin_id"].as_str()
            .ok_or_else(|| "Missing 'plugin_id' parameter for refine".to_string())?;
        tracing::info!("[plugin_manager] action_refine: plugin_id={}", plugin_id);

        let mut existing = self.plugin_service.get_plugin(plugin_id)?
            .ok_or_else(|| format!("Plugin '{}' not found", plugin_id))?;

        let metrics = self.plugin_service.get_usage_metrics(plugin_id).ok();
        let fail_rate = metrics.as_ref().map(|m| {
            if m.total_executions > 0 { m.fail_count as f64 / m.total_executions as f64 } else { 0.0 }
        }).unwrap_or(0.0);

        let mut usage_context = String::new();
        if let Some(ref m) = metrics {
            if m.total_executions > 0 {
                usage_context = format!(
                    "\n\n## Usage Context (auto-injected)\n- Total executions: {}\n- Success: {}\n- Failures: {}\n- Failure rate: {:.1}%\n- Avg duration: {:.0}ms\n",
                    m.total_executions, m.success_count, m.fail_count, fail_rate * 100.0, m.avg_duration_ms
                );
                if fail_rate > 0.2 {
                    let common_errors = self.plugin_service.get_common_errors(plugin_id, 3).unwrap_or_default();
                    if !common_errors.is_empty() {
                        usage_context.push_str("\n### Top Errors:\n");
                        for (i, err) in common_errors.iter().enumerate() {
                            usage_context.push_str(&format!("{}. {}\n", i + 1, err));
                        }
                    }
                    usage_context.push_str("\n⚠️ This plugin has a HIGH failure rate. Focus your refinement on fixing the errors above.\n");
                }
            }
        }

        let old_tool_names: Vec<String> = existing.tools.iter().map(|t| t.name.clone()).collect();

        let old_tools_snapshot: Vec<(String, String, String)> = existing.tools.iter()
            .map(|t| (t.name.clone(), t.description.clone(), t.script.clone()))
            .collect();

        if let Some(name) = params["name"].as_str() {
            existing.name = name.to_string();
        }
        if let Some(desc) = params["description"].as_str() {
            existing.description = desc.to_string();
        }
        if let Some(version) = params["version"].as_str() {
            existing.version = version.to_string();
        }
        if let Some(author) = params["author"].as_str() {
            existing.author = author.to_string();
        }
        if params["tools"].is_array() {
            existing.tools = self.parse_tools_from_params(params)?;
        }

        if let Some(patch_arr) = params["patch_tools"].as_array() {
            for patch in patch_arr {
                let target_name = patch["name"].as_str()
                    .ok_or_else(|| "Each patch_tools entry must have a 'name'".to_string())?;
                if let Some(tool) = existing.tools.iter_mut().find(|t| t.name == target_name) {
                    if let Some(desc) = patch["description"].as_str() {
                        tool.description = desc.to_string();
                    }
                    if let Some(script) = patch["script"].as_str() {
                        tool.script = script.to_string();
                    }
                    if let Some(params_arr) = patch["parameters"].as_array() {
                        tool.parameters = self.parse_single_tool_parameters(params_arr)?;
                    }
                } else {
                    return Err(format!("Cannot patch tool '{}': tool not found in plugin. Existing tools: {}", target_name, existing.tools.iter().map(|t| t.name.clone()).collect::<Vec<_>>().join(", ")));
                }
            }
        }

        if let Some(add_arr) = params["add_tools"].as_array() {
            for add_tool in add_arr {
                let name = add_tool["name"].as_str()
                    .ok_or_else(|| "Each add_tools entry must have a 'name'".to_string())?;
                if existing.tools.iter().any(|t| t.name == name) {
                    return Err(format!("Cannot add tool '{}': a tool with this name already exists in the plugin. Use patch_tools instead.", name));
                }
                let description = add_tool["description"].as_str()
                    .ok_or_else(|| "Each add_tools entry must have a 'description'".to_string())?;
                let script = add_tool["script"].as_str()
                    .ok_or_else(|| "Each add_tools entry must have a 'script'".to_string())?;
                let refine_params = if let Some(params_arr) = add_tool["parameters"].as_array() {
                    self.parse_single_tool_parameters(params_arr)?
                } else {
                    Vec::new()
                };
                let refine_ui_schema = if refine_params.is_empty() {
                    None
                } else {
                    Some(UiSchema::from_tool_parameters(&refine_params))
                };
                existing.tools.push(PluginTool {
                    name: name.to_string(),
                    description: description.to_string(),
                    script: script.to_string(),
                    parameters: refine_params,
                    ui_schema: refine_ui_schema,
                    result_view: None,
                });
            }
        }

        if let Some(remove_arr) = params["remove_tools"].as_array() {
            let names_to_remove: Vec<String> = remove_arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect();
            for name in &names_to_remove {
                if !existing.tools.iter().any(|t| &t.name == name) {
                    return Err(format!("Cannot remove tool '{}': tool not found in plugin.", name));
                }
            }
            existing.tools.retain(|t| !names_to_remove.contains(&t.name));
        }

        if params["scenarios"].is_array() {
            existing.scenarios = self.parse_scenarios_from_params(params);
        }
        if params["trigger_keywords"].is_array() {
            existing.trigger_keywords = self.parse_trigger_keywords_from_params(params);
        }

        let mut tool_changes: Vec<ToolChange> = Vec::new();

        for new_tool in &existing.tools {
            if let Some(old) = old_tools_snapshot.iter().find(|(name, _, _)| name == &new_tool.name) {
                if old.2 != new_tool.script {
                    tool_changes.push(ToolChange {
                        tool_name: new_tool.name.clone(),
                        field: "script".to_string(),
                        before: old.2.clone(),
                        after: new_tool.script.clone(),
                    });
                }
                if old.1 != new_tool.description {
                    tool_changes.push(ToolChange {
                        tool_name: new_tool.name.clone(),
                        field: "description".to_string(),
                        before: old.1.clone(),
                        after: new_tool.description.clone(),
                    });
                }
            }
        }

        for old in &old_tools_snapshot {
            if !existing.tools.iter().any(|t| t.name == old.0) {
                tool_changes.push(ToolChange {
                    tool_name: old.0.clone(),
                    field: "removed".to_string(),
                    before: old.2.clone(),
                    after: String::new(),
                });
            }
        }

        for new_tool in &existing.tools {
            if !old_tools_snapshot.iter().any(|(name, _, _)| name == &new_tool.name) {
                tool_changes.push(ToolChange {
                    tool_name: new_tool.name.clone(),
                    field: "added".to_string(),
                    before: String::new(),
                    after: new_tool.script.clone(),
                });
            }
        }

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;

        let changelog_changes: Vec<String> = match params["changelog_changes"].as_array() {
            Some(arr) => arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect(),
            None => vec!["Plugin refined based on feedback".to_string()],
        };

        let tool_changes_count = tool_changes.len();
        existing.changelog.push(ChangelogEntry {
            version: existing.version.clone(),
            date: now,
            changes: changelog_changes,
            tool_changes,
        });

        existing.updated_at = now;

        tracing::info!("[plugin_manager] action_refine: saving plugin, tool_changes={}", tool_changes_count);
        self.plugin_service.save_plugin(&existing)?;
        tracing::info!("[plugin_manager] action_refine: plugin saved, updating registry");

        let new_tool_names: Vec<String> = existing.tools.iter().map(|t| t.name.clone()).collect();

        if let Some(registry) = &self.tool_registry {
            tracing::info!("[plugin_manager] action_refine: acquiring registry lock");
            let mut reg = registry.lock().await;
            tracing::info!("[plugin_manager] action_refine: registry lock acquired, unregistering old tools");
            for name in &old_tool_names {
                reg.unregister(name);
            }
            for tool_def in &existing.tools {
                let agent_tool = PluginAgentTool::new(tool_def.clone(), self.workspace_dir.clone())
                    .with_logging(self.plugin_service.clone(), existing.id.clone());
                reg.register(Arc::new(agent_tool));
            }
        }

        // Remove old tool names from ALL agents (stale tool_ids and always_allowed_tools)
        // Add new tool names ONLY to the current agent
        let removed_tool_names: Vec<String> = old_tool_names.iter()
            .filter(|name| !new_tool_names.contains(name))
            .cloned()
            .collect();

        if let (Some(agent_svc), Some(current_id)) = (&self.agent_service, &self.current_agent_id) {
            if let Ok(mut agents) = agent_svc.list_agents() {
                for agent in &mut agents {
                    let before_len = agent.tool_ids.len();
                    let before_allowed = agent.always_allowed_tools.len();
                    // Remove old tool names from ALL agents
                    for name in &old_tool_names {
                        agent.tool_ids.retain(|t| t != name);
                    }
                    // Clean up always_allowed_tools for removed/renamed tools
                    for name in &removed_tool_names {
                        agent.always_allowed_tools.retain(|t| t != name);
                    }
                    // Add new tool names only to the current agent
                    if agent.id == *current_id {
                        for name in &new_tool_names {
                            if !agent.tool_ids.is_empty() && !agent.tool_ids.contains(name) {
                                agent.tool_ids.push(name.clone());
                            }
                        }
                    }
                    if agent.tool_ids.len() != before_len || agent.always_allowed_tools.len() != before_allowed {
                        if let Err(e) = agent_svc.save_agent(agent.clone()) {
                            tracing::warn!("[plugin_manager] action_refine: failed to save agent '{}': {}", agent.id, e);
                        }
                    }
                }
            }
        }

        let test_hints: Vec<String> = existing.tools.iter().map(|t| {
            let param_hints: Vec<String> = t.parameters.iter()
                .filter(|p| p.required)
                .map(|p| format!("\"{}\": \"<{}>\"", p.name, p.description))
                .collect();
            format!("  - test tool '{}': action='test', plugin_id='{}', tool_name='{}', test_params={{ {} }}",
                t.name, existing.id, t.name, param_hints.join(", "))
        }).collect();

        tracing::info!("[plugin_manager] action_refine: completed successfully, plugin={}, version={}", existing.name, existing.version);

        Ok(ToolOutput {
            success: true,
            result: format!(
                "Refined plugin '{}' (id: {}) to v{}. Changelog entry added. Tool definitions have been refreshed in the current session.{}\n\n\
                 IMPORTANT: You MUST now test the modified tools to verify they work correctly. Use the 'test' action:\n{}\n\n\
                 If any test fails, use 'refine' with patch_tools to fix the issue, then test again.",
                existing.name, existing.id, existing.version, usage_context,
                test_hints.join("\n")
            ),
            metadata: json!({
                "id": existing.id,
                "name": existing.name,
                "version": existing.version,
                "toolNames": new_tool_names,
                "failRate": fail_rate,
                "nextStep": "test",
                "testCommands": test_hints,
                "changelogEntry": {
                    "version": existing.version,
                    "changes": existing.changelog.last().map(|e| e.changes.clone()).unwrap_or_default(),
                },
            }),
        })
    }
}
