use super::*;

impl PluginManagerTool {
    pub(crate) fn ensure_unique_id(&self, base_id: &str) -> Result<String, String> {
        let existing = self.plugin_service.list_plugins()?;
        let existing_ids: Vec<String> = existing.iter().map(|p| p.id.clone()).collect();

        if !existing_ids.contains(&base_id.to_string()) {
            return Ok(base_id.to_string());
        }

        for i in 2..100 {
            let candidate = format!("{}-{}", base_id, i);
            if !existing_ids.contains(&candidate) {
                return Ok(candidate);
            }
        }

        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        Ok(format!("{}-{}", base_id, timestamp))
    }

    pub(crate) fn parse_tools_from_params(&self, params: &Value) -> Result<Vec<PluginTool>, String> {
        let tools_array = match params["tools"].as_array() {
            Some(arr) if !arr.is_empty() => arr,
            _ => return Ok(Vec::new()),
        };

        let mut tools = Vec::new();
        for tool_val in tools_array {
            let name = tool_val["name"].as_str()
                .ok_or_else(|| "Each tool must have a 'name'".to_string())?;
            let description = tool_val["description"].as_str()
                .ok_or_else(|| "Each tool must have a 'description'".to_string())?;
            let script = tool_val["script"].as_str()
                .ok_or_else(|| "Each tool must have a 'script'".to_string())?;

            let mut parameters = Vec::new();
            if let Some(params_arr) = tool_val["parameters"].as_array() {
                parameters = self.parse_single_tool_parameters(params_arr)?;
            }

            let mut ui_schema = if parameters.is_empty() {
                None
            } else {
                Some(UiSchema::from_tool_parameters(&parameters))
            };

            if let Some(interaction_val) = tool_val.get("interaction") {
                if let Some(ref mut schema) = ui_schema {
                    if let Ok(interaction) = serde_json::from_value::<crate::plugins::domain::ui_schema::InteractionSpec>(interaction_val.clone()) {
                        *schema = schema.clone().with_interaction(interaction);
                    }
                }
            }

            let result_view = tool_val.get("result_view")
                .and_then(|v| serde_json::from_value::<crate::plugins::domain::ui_schema::ResultViewSpec>(v.clone()).ok());

            tools.push(PluginTool {
                name: name.to_string(),
                description: description.to_string(),
                parameters,
                script: script.to_string(),
                ui_schema,
                result_view,
            });
        }

        Ok(tools)
    }

    pub(crate) fn parse_single_tool_parameters(&self, params_arr: &[Value]) -> Result<Vec<ToolParameter>, String> {
        let mut parameters = Vec::new();
        for (idx, param_val) in params_arr.iter().enumerate() {
            let param_name = param_val["name"].as_str().unwrap_or("").to_string();
            let param_type = param_val["param_type"].as_str().or_else(|| param_val["type"].as_str()).unwrap_or("string").to_string();
            let required = param_val["required"].as_bool().unwrap_or(false);
            let param_desc = param_val["description"].as_str().unwrap_or("").to_string();
            let default_value = param_val.get("default_value").cloned();

            parameters.push(ToolParameter {
                name: param_name,
                param_type,
                required,
                description: param_desc,
                default_value,
                ui_widget: param_val["ui_widget"].as_str().map(|s| s.to_string()),
                ui_label: param_val["ui_label"].as_str().map(|s| s.to_string()),
                ui_placeholder: param_val["ui_placeholder"].as_str().map(|s| s.to_string()),
                ui_options: param_val["ui_options"].as_array().map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect()),
                ui_accept: param_val["ui_accept"].as_str().map(|s| s.to_string()),
                ui_group: param_val["ui_group"].as_str().map(|s| s.to_string()),
                ui_order: param_val["ui_order"].as_u64().map(|v| v as u32).or(Some(idx as u32)),
            });
        }
        Ok(parameters)
    }

    pub(crate) fn check_tool_name_conflicts(&self, new_tools: &[PluginTool]) -> Result<Vec<String>, String> {
        let reserved_names = [
            "terminal", "file", "command_history",
            "terminal_session", "plugin_manager",
        ];

        let existing_tools = self.plugin_service.list_enabled_tools()?;
        let existing_names: Vec<&str> = existing_tools.iter().map(|t| t.name.as_str()).collect();

        let mut conflicts = Vec::new();

        for tool in new_tools {
            if reserved_names.contains(&tool.name.as_str()) {
                conflicts.push(format!(
                    "- '{}' conflicts with a built-in tool (reserved: {})",
                    tool.name,
                    reserved_names.join(", ")
                ));
            } else if existing_names.contains(&tool.name.as_str()) {
                conflicts.push(format!(
                    "- '{}' conflicts with an existing plugin tool",
                    tool.name
                ));
            }
        }

        let new_names: Vec<&str> = new_tools.iter().map(|t| t.name.as_str()).collect();
        let mut seen = std::collections::HashSet::new();
        for name in &new_names {
            if !seen.insert(*name) {
                conflicts.push(format!(
                    "- '{}' appears more than once within the same plugin",
                    name
                ));
            }
        }

        Ok(conflicts)
    }

    pub(crate) fn parse_scenarios_from_params(&self, params: &Value) -> Vec<PluginScenario> {
        let scenarios_array = match params["scenarios"].as_array() {
            Some(arr) => arr,
            None => return Vec::new(),
        };

        let mut scenarios = Vec::new();
        for scenario_val in scenarios_array {
            let name = scenario_val["name"].as_str().unwrap_or("").to_string();
            let description = scenario_val["description"].as_str().unwrap_or("").to_string();
            let example_prompt = scenario_val["example_prompt"].as_str().unwrap_or("").to_string();
            let category = scenario_val["category"].as_str().unwrap_or("practical").to_string();
            let tool_name = scenario_val["tool_name"].as_str().unwrap_or("").to_string();

            if !name.is_empty() {
                let mut scenario = PluginScenario {
                    name,
                    description,
                    example_prompt,
                    category,
                    tool_name,
                };
                // Sanitize scenarios before saving to prevent system instructions and
                // absolute paths from being persisted to the manifest file
                scenario.sanitize();
                scenarios.push(scenario);
            }
        }

        scenarios
    }

    pub(crate) fn parse_trigger_keywords_from_params(&self, params: &Value) -> Vec<String> {
        match params["trigger_keywords"].as_array() {
            Some(arr) => arr
                .iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect(),
            None => Vec::new(),
        }
    }
}
