use super::*;

impl PluginManagerTool {
    pub(crate) async fn action_analyze_usage(&self, params: &Value) -> Result<ToolOutput, String> {
        let plugin_id = params["plugin_id"].as_str()
            .ok_or_else(|| "Missing 'plugin_id' parameter for analyze_usage".to_string())?;

        let plugin = self.plugin_service.get_plugin(plugin_id)?
            .ok_or_else(|| format!("Plugin '{}' not found", plugin_id))?;

        let metrics = self.plugin_service.get_usage_metrics(plugin_id)?;

        let recent_logs = self.plugin_service.list_usage_logs(plugin_id, 30)?;

        let fail_rate = if metrics.total_executions > 0 {
            metrics.fail_count as f64 / metrics.total_executions as f64
        } else {
            0.0
        };

        let mut analysis = format!(
            "# Usage Analysis: {} (id: {})\n\n\
             ## Execution Metrics\n\
             - Total executions: {}\n\
             - Success: {}\n\
             - Failures: {}\n\
             - Failure rate: {:.1}%\n\
             - Avg duration: {:.0}ms\n\
             - Last executed: {}\n\n",
            plugin.name,
            plugin_id,
            metrics.total_executions,
            metrics.success_count,
            metrics.fail_count,
            fail_rate * 100.0,
            metrics.avg_duration_ms,
            metrics.last_executed_at,
        );

        let mut error_patterns: std::collections::HashMap<String, Vec<(String, String, String, Option<String>)>> = std::collections::HashMap::new();
        let mut tool_fail_counts: std::collections::HashMap<String, (usize, usize)> = std::collections::HashMap::new();

        for log in &recent_logs {
            let entry = tool_fail_counts.entry(log.tool_name.clone()).or_insert((0, 0));
            if log.success {
                entry.0 += 1;
            } else {
                entry.1 += 1;
                if let Some(ref err) = log.error_message {
                    let err_key = classify_error(err);
                    let output_snippet = log.output_summary.as_ref().map(|s| s.chars().take(200).collect::<String>());
                    error_patterns.entry(err_key).or_default().push((
                        log.tool_name.clone(),
                        log.params_summary.clone(),
                        err.chars().take(300).collect(),
                        output_snippet,
                    ));
                }
            }
        }

        if !recent_logs.is_empty() {
            analysis.push_str("## Per-Tool Breakdown\n");
            for (tool_name, (ok, fail)) in &tool_fail_counts {
                let total = *ok + *fail;
                let rate = if total > 0 { *fail as f64 / total as f64 * 100.0 } else { 0.0 };
                analysis.push_str(&format!("- {}: {} calls, {} ok, {} fail ({:.0}% fail rate)\n", tool_name, total, ok, fail, rate));
            }
            analysis.push_str("\n");
        }

        if !error_patterns.is_empty() {
            analysis.push_str("## Error Patterns\n");
            for (pattern, instances) in &error_patterns {
                analysis.push_str(&format!("### {} ({} occurrences)\n", pattern, instances.len()));
                for (tool, params, err, output_snippet) in instances.iter().take(3) {
                    analysis.push_str(&format!("- Tool: {} | Params: {} | Error: {}\n", tool, params, err));
                    if let Some(ref snippet) = output_snippet {
                        analysis.push_str(&format!("  Output: {}\n", snippet));
                    }
                }
                analysis.push_str("\n");
            }
        }

        if !recent_logs.is_empty() {
            analysis.push_str("## Recent Execution Details (last 5)\n");
            for log in recent_logs.iter().take(5) {
                let status = if log.success { "✓" } else { "✗" };
                analysis.push_str(&format!(
                    "- {} {} | source={} | {}ms | params: {}\n",
                    status, log.tool_name, log.source, log.duration_ms, log.params_summary
                ));
                if !log.success {
                    if let Some(ref err) = log.error_message {
                        analysis.push_str(&format!("  Error: {}\n", err.chars().take(200).collect::<String>()));
                    }
                }
                if let Some(ref out) = log.output_summary {
                    analysis.push_str(&format!("  Output: {}\n", out.chars().take(150).collect::<String>()));
                }
            }
            analysis.push_str("\n");
        }

        let mut refine_actions: Vec<Value> = Vec::new();
        let mut changelog_items: Vec<String> = Vec::new();

        if fail_rate > 0.2 {
            for (pattern, instances) in &error_patterns {
                let tool_names: Vec<String> = instances.iter().map(|(t, _, _, _)| t.clone()).collect();
                let unique_tools: Vec<String> = {
                    let mut v = tool_names.clone();
                    v.sort();
                    v.dedup();
                    v
                };

                match pattern.as_str() {
                    "Missing Dependency" => {
                        for tool_name in &unique_tools {
                            if let Some(tool) = plugin.tools.iter().find(|t| t.name == *tool_name) {
                                let patched_script = add_dependency_install(&tool.script, instances);
                                refine_actions.push(json!({
                                    "name": tool_name,
                                    "script": patched_script,
                                }));
                                changelog_items.push(format!("Auto-install missing dependencies in tool '{}'", tool_name));
                            }
                        }
                    }
                    "File Not Found" => {
                        for tool_name in &unique_tools {
                            if let Some(tool) = plugin.tools.iter().find(|t| t.name == *tool_name) {
                                let patched_script = add_file_validation(&tool.script);
                                refine_actions.push(json!({
                                    "name": tool_name,
                                    "script": patched_script,
                                }));
                                changelog_items.push(format!("Add file existence validation in tool '{}'", tool_name));
                            }
                        }
                    }
                    "Syntax Error" => {
                        for tool_name in &unique_tools {
                            if let Some(tool) = plugin.tools.iter().find(|t| t.name == *tool_name) {
                                if tool.script.starts_with("shell:") && (tool.script.contains("python3 -c") || tool.script.contains("python -c")) {
                                    let patched_script = convert_shell_python_to_script(&tool.script);
                                    refine_actions.push(json!({
                                        "name": tool_name,
                                        "script": patched_script,
                                    }));
                                    changelog_items.push(format!("Convert shell:python3 -c to script:python3 format in tool '{}'", tool_name));
                                }
                            }
                        }
                    }
                    "Timeout" => {
                        changelog_items.push(format!("Tools {} have timeout issues - consider optimizing or chunking data", unique_tools.join(", ")));
                    }
                    _ => {
                        changelog_items.push(format!("Fix {} errors in tools: {}", pattern, unique_tools.join(", ")));
                    }
                }
            }
        }

        if metrics.avg_duration_ms > 5000.0 {
            changelog_items.push("Optimize slow execution - consider caching or reducing data processing".to_string());
        }

        if !refine_actions.is_empty() || !changelog_items.is_empty() {
            analysis.push_str("## ⚡ Recommended Refinement\n\n");
            analysis.push_str("Based on the usage analysis above, the following issues should be fixed. ");
            analysis.push_str("**Call the 'refine' action NOW with these parameters to fix the issues:**\n\n");

            if !refine_actions.is_empty() {
                analysis.push_str("```json\n");
                let refine_params = json!({
                    "action": "refine",
                    "plugin_id": plugin_id,
                    "patch_tools": refine_actions,
                    "changelog_changes": changelog_items,
                });
                analysis.push_str(&serde_json::to_string_pretty(&refine_params).unwrap_or_default());
                analysis.push_str("\n```\n\n");
                analysis.push_str("**IMPORTANT**: Copy the JSON above and call the plugin_manager tool with it. ");
                analysis.push_str("After refining, use the 'test' action to verify the fixes work.\n");
            } else {
                analysis.push_str("The issues require manual script review. Use the 'get' action to inspect the current scripts, ");
                analysis.push_str("then use 'refine' with patch_tools to fix them.\n");
            }
        } else if metrics.total_executions > 0 {
            analysis.push_str("## Status: Healthy ✓\nNo immediate optimization needed. The plugin is performing well.");
        } else {
            analysis.push_str("## No Usage Data\nThis plugin has not been executed yet. Use the 'test' action to verify it works.");
        }

        Ok(ToolOutput {
            success: true,
            result: analysis,
            metadata: json!({
                "pluginId": plugin_id,
                "totalExecutions": metrics.total_executions,
                "failRate": fail_rate,
                "avgDurationMs": metrics.avg_duration_ms,
                "needsRefinement": !refine_actions.is_empty(),
                "refineActions": refine_actions.len(),
                "errorPatterns": error_patterns.keys().collect::<Vec<_>>(),
            }),
        })
    }

    pub(crate) fn infer_group_id(&self, name: &str, description: &str) -> String {
        let text = format!("{} {}", name.to_lowercase(), description.to_lowercase());

        let network_keywords = ["http", "api", "url", "request", "fetch", "web", "rest", "graphql", "ip", "dns", "ping", "download", "upload", "network"];
        let dev_keywords = ["code", "debug", "compile", "build", "test", "git", "deploy", "lint", "format", "terminal", "shell", "docker", "kubernetes", "ci", "cd"];
        let data_keywords = ["data", "csv", "json", "xml", "parse", "convert", "transform", "analyze", "statistics", "chart", "graph", "excel", "sql", "database"];
        let creative_keywords = ["image", "video", "audio", "music", "design", "draw", "paint", "color", "font", "style", "animate", "render", "creative"];

        let network_score = network_keywords.iter().filter(|k| text.contains(*k)).count();
        let dev_score = dev_keywords.iter().filter(|k| text.contains(*k)).count();
        let data_score = data_keywords.iter().filter(|k| text.contains(*k)).count();
        let creative_score = creative_keywords.iter().filter(|k| text.contains(*k)).count();

        let max_score = network_score.max(dev_score).max(data_score).max(creative_score);

        if max_score == 0 {
            return "utility".to_string();
        }

        if network_score == max_score { return "network".to_string(); }
        if dev_score == max_score { return "dev".to_string(); }
        if data_score == max_score { return "data".to_string(); }
        if creative_score == max_score { return "creative".to_string(); }

        "utility".to_string()
    }
}
