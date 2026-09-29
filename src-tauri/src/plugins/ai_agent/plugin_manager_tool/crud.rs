use super::*;

impl PluginManagerTool {
    pub(crate) async fn action_list(&self) -> Result<ToolOutput, String> {
        let plugins = self.plugin_service.list_plugins()?;

        if plugins.is_empty() {
            return Ok(ToolOutput {
                success: true,
                result: "No plugins found. You can create one using the 'create' action.".to_string(),
                metadata: json!({ "results": [] }),
            });
        }

        let results: Vec<Value> = plugins.iter().map(|p| json!({
            "id": p.id,
            "name": p.name,
            "version": p.version,
            "description": p.description,
            "author": p.author,
            "enabled": p.enabled,
            "toolsCount": p.tools.len(),
        })).collect();

        let summary = results.iter().map(|r| {
            let status = if r["enabled"].as_bool().unwrap_or(false) { "✓" } else { "✗" };
            format!("{} {} v{} - {} ({} tool(s))", status, r["name"], r["version"], r["description"], r["toolsCount"])
        }).collect::<Vec<_>>().join("\n");

        Ok(ToolOutput {
            success: true,
            result: format!("Plugins ({}):\n{}", results.len(), summary),
            metadata: json!({ "results": results }),
        })
    }

    pub(crate) async fn action_get(&self, params: &Value) -> Result<ToolOutput, String> {
        let plugin_id = params["plugin_id"].as_str()
            .ok_or_else(|| "Missing 'plugin_id' parameter".to_string())?;

        let plugin = self.plugin_service.get_plugin(plugin_id)?
            .ok_or_else(|| format!("Plugin '{}' not found", plugin_id))?;

        let tools_info: Vec<Value> = plugin.tools.iter().map(|t| {
            let params_info: Vec<Value> = t.parameters.iter().map(|p| json!({
                "name": p.name,
                "type": p.param_type,
                "required": p.required,
                "description": p.description,
            })).collect();
            json!({
                "name": t.name,
                "description": t.description,
                "script": t.script,
                "parameters": params_info,
            })
        }).collect();

        Ok(ToolOutput {
            success: true,
            result: format!(
                "# {} v{}\nBy: {}\n{}\nEnabled: {}\nTools ({}):\n{}{}\n{}",
                plugin.name,
                plugin.version,
                plugin.author,
                plugin.description,
                if plugin.enabled { "Yes" } else { "No" },
                plugin.tools.len(),
                tools_info.iter().map(|t| format!("  - {}: {} (script: {})", t["name"], t["description"], t["script"])).collect::<Vec<_>>().join("\n"),
                if plugin.scenarios.is_empty() { String::new() } else {
                    format!("\nScenarios ({}):\n{}", plugin.scenarios.len(),
                        plugin.scenarios.iter().map(|s| {
                            let mut sanitized = s.clone();
                            sanitized.sanitize();
                            format!("  - {}: {} (example: \"{}\")", sanitized.name, sanitized.description, sanitized.example_prompt)
                        }).collect::<Vec<_>>().join("\n"))
                },
                if plugin.trigger_keywords.is_empty() { String::new() } else {
                    format!("\nTrigger Keywords: {}", plugin.trigger_keywords.join(", "))
                }
            ),
            metadata: json!({
                "id": plugin.id,
                "name": plugin.name,
                "version": plugin.version,
                "description": plugin.description,
                "author": plugin.author,
                "enabled": plugin.enabled,
                "tools": tools_info,
                "scenarios": plugin.scenarios.iter().map(|s| {
                    let mut sanitized = s.clone();
                    sanitized.sanitize();
                    json!({
                        "name": sanitized.name,
                        "description": sanitized.description,
                        "examplePrompt": sanitized.example_prompt,
                    })
                }).collect::<Vec<_>>(),
                "triggerKeywords": plugin.trigger_keywords,
            }),
        })
    }

    pub(crate) async fn action_create(&self, params: &Value) -> Result<ToolOutput, String> {
        let name = params["name"].as_str()
            .ok_or_else(|| "Missing 'name' parameter for create".to_string())?;
        let description = params["description"].as_str()
            .ok_or_else(|| "Missing 'description' parameter for create".to_string())?;
        let version = params["version"].as_str().unwrap_or("1.0.0");
        let author = params["author"].as_str().unwrap_or("AI Assistant");

        let base_id = name.to_lowercase()
            .replace(' ', "-")
            .chars()
            .map(|c| if c.is_alphanumeric() || c == '-' { c } else { '-' })
            .collect::<String>();

        let id = self.ensure_unique_id(&base_id)?;

        let tools = self.parse_tools_from_params(params)?;

        let scenarios = self.parse_scenarios_from_params(params);
        let trigger_keywords = self.parse_trigger_keywords_from_params(params);

        let conflicts = self.check_tool_name_conflicts(&tools)?;
        if !conflicts.is_empty() {
            return Ok(ToolOutput {
                success: false,
                result: format!(
                    "Cannot create plugin: tool name conflicts detected:\n{}\nPlease rename these tools. Built-in reserved names: terminal, file, command_history, terminal_session, plugin_manager.",
                    conflicts.join("\n")
                ),
                metadata: json!({ "conflicts": conflicts }),
            });
        }

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;

        let group_id = params["group_id"].as_str()
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .unwrap_or_else(|| self.infer_group_id(name, description));
        let category = params["category"].as_str().unwrap_or("").to_string();

        let create_tool_changes: Vec<ToolChange> = tools.iter().map(|t| ToolChange {
            tool_name: t.name.clone(),
            field: "added".to_string(),
            before: String::new(),
            after: t.script.clone(),
        }).collect();

        let manifest = PluginManifest {
            id: id.clone(),
            name: name.to_string(),
            version: version.to_string(),
            description: description.to_string(),
            author: author.to_string(),
            enabled: true,
            tools,
            scenarios,
            trigger_keywords,
            changelog: vec![ChangelogEntry {
                version: version.to_string(),
                date: now,
                changes: vec!["Initial release".to_string()],
                tool_changes: create_tool_changes,
            }],
            group_id,
            category,
            created_at: now,
            updated_at: now,
        };

        self.plugin_service.save_plugin(&manifest)?;

        let tool_names: Vec<String> = manifest.tools.iter().map(|t| t.name.clone()).collect();

        if let (Some(registry), Some(agent_svc), Some(agent_id)) =
            (&self.tool_registry, &self.agent_service, &self.current_agent_id)
        {
            for tool_def in &manifest.tools {
                {
                    let mut reg = registry.lock().await;
                    let agent_tool = PluginAgentTool::new(tool_def.clone(), self.workspace_dir.clone())
                        .with_logging(self.plugin_service.clone(), manifest.id.clone());
                    reg.register(Arc::new(agent_tool));
                }
            }

            if let Ok(mut agents) = agent_svc.list_agents() {
                if let Some(agent) = agents.iter_mut().find(|a| a.id == *agent_id) {
                    for tool_name in &tool_names {
                        if !agent.tool_ids.is_empty() && !agent.tool_ids.contains(tool_name) {
                            agent.tool_ids.push(tool_name.clone());
                        }
                    }
                    if let Err(e) = agent_svc.save_agent(agent.clone()) {
                        tracing::warn!("[plugin_manager] action_create: failed to save agent '{}': {}", agent.id, e);
                    }
                }
            }
        }

        let test_hints: Vec<String> = manifest.tools.iter().map(|t| {
            let param_hints: Vec<String> = t.parameters.iter()
                .filter(|p| p.required)
                .map(|p| format!("\"{}\": \"<{}>\"", p.name, p.description))
                .collect();
            format!("  - test tool '{}': action='test', plugin_id='{}', tool_name='{}', test_params={{ {} }}",
                t.name, manifest.id, t.name, param_hints.join(", "))
        }).collect();

        Ok(ToolOutput {
            success: true,
            result: format!(
                "Created plugin '{}' (id: {}) v{} with {} tool(s): {}. The plugin is enabled and its tools have been automatically added to the current agent.\n\n\
                 IMPORTANT: You MUST now test each tool to verify it works correctly. Use the 'test' action:\n{}\n\n\
                 If any test fails, use 'refine' with patch_tools to fix the issue, then test again.",
                manifest.name, manifest.id, manifest.version, manifest.tools.len(), tool_names.join(", "),
                test_hints.join("\n")
            ),
            metadata: json!({
                "id": manifest.id,
                "name": manifest.name,
                "version": manifest.version,
                "enabled": manifest.enabled,
                "toolsCount": manifest.tools.len(),
                "toolNames": tool_names,
                "nextStep": "test",
                "testCommands": test_hints,
            }),
        })
    }

    pub(crate) async fn action_update(&self, params: &Value) -> Result<ToolOutput, String> {
        let plugin_id = params["plugin_id"].as_str()
            .ok_or_else(|| "Missing 'plugin_id' parameter for update".to_string())?;

        let mut existing = self.plugin_service.get_plugin(plugin_id)?
            .ok_or_else(|| format!("Plugin '{}' not found", plugin_id))?;

        let old_tool_names: Vec<String> = existing.tools.iter().map(|t| t.name.clone()).collect();

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
                let add_params = if let Some(params_arr) = add_tool["parameters"].as_array() {
                    self.parse_single_tool_parameters(params_arr)?
                } else {
                    Vec::new()
                };
                let mut add_ui_schema = if add_params.is_empty() {
                    None
                } else {
                    Some(UiSchema::from_tool_parameters(&add_params))
                };
                if let Some(interaction_val) = add_tool.get("interaction") {
                    if let Some(ref mut schema) = add_ui_schema {
                        if let Ok(interaction) = serde_json::from_value::<crate::plugins::domain::ui_schema::InteractionSpec>(interaction_val.clone()) {
                            *schema = schema.clone().with_interaction(interaction);
                        }
                    }
                }
                let add_result_view = add_tool.get("result_view")
                    .and_then(|v| serde_json::from_value::<crate::plugins::domain::ui_schema::ResultViewSpec>(v.clone()).ok());
                existing.tools.push(PluginTool {
                    name: name.to_string(),
                    description: description.to_string(),
                    script: script.to_string(),
                    parameters: add_params,
                    ui_schema: add_ui_schema,
                    result_view: add_result_view,
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

        existing.updated_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;

        self.plugin_service.save_plugin(&existing)?;

        let new_tool_names: Vec<String> = existing.tools.iter().map(|t| t.name.clone()).collect();

        if let Some(registry) = &self.tool_registry {
            let mut reg = registry.lock().await;
            for name in &old_tool_names {
                reg.unregister(name);
            }
            for tool_def in &existing.tools {
                let agent_tool = PluginAgentTool::new(tool_def.clone(), self.workspace_dir.clone())
                    .with_logging(self.plugin_service.clone(), existing.id.clone());
                reg.register(Arc::new(agent_tool));
            }
            tracing::info!("[plugin_manager] action_refine: registry updated, new_tool_count={}", existing.tools.len());
        }

        let removed_tool_names: Vec<String> = old_tool_names.iter()
            .filter(|name| !new_tool_names.contains(name))
            .cloned()
            .collect();

        if let (Some(agent_svc), Some(current_id)) = (&self.agent_service, &self.current_agent_id) {
            tracing::info!("[plugin_manager] action_refine: updating agent tool_ids, current_agent_id={}", current_id);
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
                            tracing::warn!("[plugin_manager] action_update: failed to save agent '{}': {}", agent.id, e);
                        }
                    }
                }
            }
        }

        Ok(ToolOutput {
            success: true,
            result: format!("Updated plugin '{}' (id: {}). Tool definitions have been refreshed in the current session.", existing.name, existing.id),
            metadata: json!({
                "id": existing.id,
                "name": existing.name,
                "version": existing.version,
                "toolNames": new_tool_names,
            }),
        })
    }

    pub(crate) async fn action_delete(&self, params: &Value) -> Result<ToolOutput, String> {
        let plugin_id = params["plugin_id"].as_str()
            .ok_or_else(|| "Missing 'plugin_id' parameter for delete".to_string())?;

        let existing = self.plugin_service.get_plugin(plugin_id)?;

        let deleted_tool_names: Vec<String> = existing.as_ref()
            .map(|p| p.tools.iter().map(|t| t.name.clone()).collect())
            .unwrap_or_default();

        self.plugin_service.delete_plugin(plugin_id)?;

        if let Some(registry) = &self.tool_registry {
            let mut reg = registry.lock().await;
            for tool_name in &deleted_tool_names {
                reg.unregister(tool_name);
            }
        }

        if let (Some(agent_svc), Some(_agent_id)) = (&self.agent_service, &self.current_agent_id) {
            if !deleted_tool_names.is_empty() {
                if let Ok(mut agents) = agent_svc.list_agents() {
                    for agent in &mut agents {
                        let before_len = agent.tool_ids.len();
                        for tool_name in &deleted_tool_names {
                            agent.tool_ids.retain(|t| t != tool_name);
                        }
                        let before_allowed = agent.always_allowed_tools.len();
                        for tool_name in &deleted_tool_names {
                            agent.always_allowed_tools.retain(|t| t != tool_name);
                        }
                        if agent.tool_ids.len() != before_len || agent.always_allowed_tools.len() != before_allowed {
                            if let Err(e) = agent_svc.save_agent(agent.clone()) {
                                tracing::warn!("[plugin_manager] action_delete: failed to save agent '{}': {}", agent.id, e);
                            }
                        }
                    }
                }
            }
        }

        // Always clean up empty groups/categories after deletion,
        // regardless of whether agent_service is available or any agent was modified
        if let Err(e) = self.plugin_service.cleanup_empty_groups_and_categories() {
            tracing::warn!("[plugin_manager] action_delete: cleanup_empty_groups failed: {}", e);
        }

        let name = existing.as_ref().map(|p| p.name.as_str()).unwrap_or(plugin_id);

        Ok(ToolOutput {
            success: true,
            result: format!("Deleted plugin '{}' (id: {}). Removed {} tool(s) from the current session.", name, plugin_id, deleted_tool_names.len()),
            metadata: json!({ "id": plugin_id, "deletedTools": deleted_tool_names }),
        })
    }

    pub(crate) async fn action_toggle(&self, params: &Value) -> Result<ToolOutput, String> {
        let plugin_id = params["plugin_id"].as_str()
            .ok_or_else(|| "Missing 'plugin_id' parameter for toggle".to_string())?;
        let enabled = params["enabled"].as_bool()
            .ok_or_else(|| "Missing 'enabled' parameter for toggle".to_string())?;

        self.plugin_service.toggle_plugin(plugin_id, enabled)?;

        let plugin = self.plugin_service.get_plugin(plugin_id)?;

        Ok(ToolOutput {
            success: true,
            result: format!("Plugin '{}' is now {}", plugin_id, if enabled { "enabled" } else { "disabled" }),
            metadata: json!({
                "id": plugin_id,
                "enabled": enabled,
                "name": plugin.map(|p| p.name).unwrap_or_default(),
            }),
        })
    }
}
