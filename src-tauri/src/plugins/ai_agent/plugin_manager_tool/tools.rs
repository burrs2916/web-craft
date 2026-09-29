use super::*;

impl PluginManagerTool {
    pub(crate) async fn action_list_tools(&self) -> Result<ToolOutput, String> {
        let tools = self.plugin_service.list_enabled_tools()?;

        if tools.is_empty() {
            return Ok(ToolOutput {
                success: true,
                result: "No tools available from enabled plugins.".to_string(),
                metadata: json!({ "results": [] }),
            });
        }

        let results: Vec<Value> = tools.iter().map(|t| json!({
            "name": t.name,
            "description": t.description,
            "script": t.script,
            "paramCount": t.parameters.len(),
        })).collect();

        let summary = results.iter().map(|r| {
            format!("- {}: {} ({} param(s))", r["name"], r["description"], r["paramCount"])
        }).collect::<Vec<_>>().join("\n");

        Ok(ToolOutput {
            success: true,
            result: format!("Available plugin tools ({}):\n{}", results.len(), summary),
            metadata: json!({ "results": results }),
        })
    }

    pub(crate) async fn action_test(&self, params: &Value) -> Result<ToolOutput, String> {
        let tool_name = params["tool_name"].as_str()
            .ok_or_else(|| "Missing 'tool_name' parameter for test action".to_string())?;

        let test_params = params.get("test_params").cloned().unwrap_or(json!({}));

        let all_tools = self.plugin_service.list_enabled_tools()?;
        let tool_def = all_tools.iter().find(|t| t.name == tool_name)
            .ok_or_else(|| {
                let available: Vec<String> = all_tools.iter().map(|t| t.name.clone()).collect();
                format!("Tool '{}' not found in enabled plugins. Available tools: {}", tool_name, available.join(", "))
            })?;

        let missing_required: Vec<String> = tool_def.parameters.iter()
            .filter(|p| p.required)
            .filter(|p| {
                let val = test_params.get(&p.name);
                val.is_none() || val.map(|v| v.is_null()).unwrap_or(true)
            })
            .map(|p| format!("{} ({})", p.name, p.description))
            .collect();

        if !missing_required.is_empty() {
            return Ok(ToolOutput {
                success: false,
                result: format!(
                    "❌ Tool '{}' test FAILED: Missing required parameters: {}.\n\nPlease provide test_params with all required parameters. Example:\ntest_params: {{ {} }}",
                    tool_name,
                    missing_required.join(", "),
                    tool_def.parameters.iter()
                        .filter(|p| p.required)
                        .map(|p| format!("\"{}\": \"<{}>\"", p.name, p.description))
                        .collect::<Vec<_>>()
                        .join(", ")
                ),
                metadata: json!({
                    "tool": tool_name,
                    "error_type": "missing_required_params",
                    "missing_params": missing_required,
                }),
            });
        }

        let plugin_tool = PluginAgentTool::new(tool_def.clone(), self.workspace_dir.clone());
        let result = plugin_tool.execute(test_params).await;

        match result {
            Ok(output) => {
                if output.success {
                    Ok(ToolOutput {
                        success: true,
                        result: format!("✅ Tool '{}' test PASSED.\n\nOutput:\n{}\n\nThe tool is working correctly.", tool_name, output.result),
                        metadata: output.metadata,
                    })
                } else {
                    let diagnosis = self.diagnose_tool_failure(tool_name, &output.result, &tool_def.script);
                    Ok(ToolOutput {
                        success: false,
                        result: format!("❌ Tool '{}' test FAILED.\n\nError:\n{}\n\n{}", tool_name, output.result, diagnosis),
                        metadata: output.metadata,
                    })
                }
            }
            Err(e) => {
                let diagnosis = self.diagnose_tool_failure(tool_name, &e, &tool_def.script);
                Ok(ToolOutput {
                    success: false,
                    result: format!("❌ Tool '{}' test FAILED with exception.\n\nError: {}\n\n{}", tool_name, e, diagnosis),
                    metadata: json!({ "tool": tool_name, "error": e }),
                })
            }
        }
    }

    pub(crate) fn diagnose_tool_failure(&self, _tool_name: &str, error: &str, script: &str) -> String {
        let mut suggestions = Vec::new();

        if error.contains("ModuleNotFoundError") || error.contains("ImportError") || error.contains("No module named") {
            suggestions.push("A Python dependency is missing. Solutions:".to_string());
            suggestions.push("  1. Install the dependency: pip install <package>".to_string());
            suggestions.push("  2. Modify the script to use 'script:python3' format and add pip install at the top".to_string());
            suggestions.push("  3. Use the 'refine' action to update the tool script with proper dependency handling".to_string());
        }

        if error.contains("SyntaxError") || error.contains("syntax error") {
            if script.starts_with("shell:") && (script.contains("python3 -c") || script.contains("python -c")) {
                suggestions.push("The script uses 'shell: python3 -c \"...\"' which has escaping issues for complex code.".to_string());
                suggestions.push("SOLUTION: Use 'script:python3' format instead for multi-line Python scripts.".to_string());
                suggestions.push("Example: script:python3\\nimport json\\n# your code here".to_string());
            } else {
                suggestions.push("There is a syntax error in the script. Check for:".to_string());
                suggestions.push("  - Missing quotes, parentheses, or indentation".to_string());
                suggestions.push("  - Incorrect escape sequences in shell commands".to_string());
                suggestions.push("  - Use 'refine' action to fix the script".to_string());
            }
        }

        if error.contains("command not found") || error.contains("not recognized") {
            suggestions.push("The interpreter or command is not installed on this system.".to_string());
            suggestions.push("  1. Install the required program (e.g., python3, node)".to_string());
            suggestions.push("  2. Or modify the script to use an available interpreter".to_string());
        }

        if error.contains("timeout") || error.contains("timed out") {
            suggestions.push("The script execution timed out. Solutions:".to_string());
            suggestions.push("  1. Simplify the script to reduce execution time".to_string());
            suggestions.push("  2. Process smaller chunks of data".to_string());
            suggestions.push("  3. Use the 'refine' action to increase the timeout setting".to_string());
        }

        if error.contains("No such file") || error.contains("not found") && !error.contains("command not found") {
            suggestions.push("A file path referenced in the script does not exist.".to_string());
            suggestions.push("  1. Check that the input file path is correct".to_string());
            suggestions.push("  2. Use relative paths or workspace-relative paths".to_string());
            suggestions.push("  3. The {{workspace_dir}} variable resolves to the agent's workspace directory".to_string());
        }

        if error.contains("Is a directory") || error.contains("[Errno 21]") {
            suggestions.push("The script is trying to write to a directory path instead of a file path.".to_string());
            suggestions.push("  ROOT CAUSE: {{output_path}} / {{workspace_dir}} resolves to a DIRECTORY, not a file.".to_string());
            suggestions.push("  FIX: When writing files, ALWAYS append a filename after {{workspace_dir}}:".to_string());
            suggestions.push("    WRONG: open('{{workspace_dir}}', 'w')".to_string());
            suggestions.push("    RIGHT: open('{{workspace_dir}}/result.json', 'w')".to_string());
            suggestions.push("  Use 'refine' with patch_tools to fix the script, then 'test' again.".to_string());
        }

        if error.contains("Permission denied") {
            suggestions.push("The script does not have permission to access the file or directory.".to_string());
            suggestions.push("  1. Check file/directory permissions".to_string());
            suggestions.push("  2. Try using a different output path within {{workspace_dir}}".to_string());
        }

        if error.contains("NameError") || error.contains("name '") && error.contains("' is not defined") {
            suggestions.push("The script references a variable or function that is not defined.".to_string());
            suggestions.push("  1. Check for missing import statements (e.g. import json, import os)".to_string());
            suggestions.push("  2. Check for typos in variable names".to_string());
            suggestions.push("  3. Make sure all variables are defined before use".to_string());
        }

        if error.contains("UnicodeDecodeError") || error.contains("UnicodeEncodeError") || error.contains("'ascii' codec") {
            suggestions.push("The script has an encoding issue, likely with non-ASCII characters (e.g. Chinese text).".to_string());
            suggestions.push("  FIX for Python: Add encoding='utf-8' to all open() calls:".to_string());
            suggestions.push("    WRONG: open('{{input_path}}', 'r')".to_string());
            suggestions.push("    RIGHT: open('{{input_path}}', 'r', encoding='utf-8')".to_string());
            suggestions.push("  Also add at the top of your script: import sys; sys.stdout.reconfigure(encoding='utf-8')".to_string());
        }

        if error.contains("produced NO OUTPUT") || error.contains("No stdout output") {
            suggestions.push("The script completed but did not print any results to stdout.".to_string());
            suggestions.push("  1. Make sure you use print() to output results (not just write to a file)".to_string());
            suggestions.push("  2. For JSON output: print(json.dumps(result, ensure_ascii=False))".to_string());
            suggestions.push("  3. Check that your script doesn't only write to files but also prints to stdout".to_string());
        }

        if error.contains("unresolved parameter placeholders") {
            suggestions.push("The script contains {{param_name}} placeholders that were not replaced with actual values.".to_string());
            suggestions.push("  1. Make sure all required parameters are provided in test_params".to_string());
            suggestions.push("  2. Check parameter names match exactly (case-sensitive)".to_string());
            suggestions.push("  3. Use 'refine' to add default values for optional parameters".to_string());
        }

        if error.contains("JSONDecodeError") || error.contains("json.decoder") || error.contains("Unexpected token") {
            suggestions.push("The script is trying to parse invalid JSON data.".to_string());
            suggestions.push("  1. Validate the input JSON before parsing".to_string());
            suggestions.push("  2. Use try/except around json.loads()".to_string());
            suggestions.push("  3. Print the raw data first to debug: print(repr(data))".to_string());
        }

        if error.contains("ConnectionError") || error.contains("Connection refused") || error.contains("Failed to resolve") {
            suggestions.push("The script cannot connect to a network service.".to_string());
            suggestions.push("  1. Check the URL is correct and accessible".to_string());
            suggestions.push("  2. The service may be down or blocking requests".to_string());
            suggestions.push("  3. Add retry logic and timeout handling".to_string());
        }

        if error.contains("Cannot find module") || error.contains("MODULE_NOT_FOUND") {
            suggestions.push("A Node.js module is missing.".to_string());
            suggestions.push("  1. Install the module: npm install <package>".to_string());
            suggestions.push("  2. Or use 'script:node' format and add require() with try/catch".to_string());
        }

        if suggestions.is_empty() {
            format!("Suggestion: Use the 'get' action to review the plugin code, then use 'refine' to fix the issue and 'test' again to verify.")
        } else {
            format!("Diagnosis:\n{}", suggestions.join("\n"))
        }
    }
}
