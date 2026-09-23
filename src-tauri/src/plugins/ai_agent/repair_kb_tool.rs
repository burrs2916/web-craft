use async_trait::async_trait;
use serde_json::{Value, json};
use std::path::PathBuf;
use std::sync::Arc;

use super::engine::{AgentTool, ToolOutput};
use super::repair_kb::{RepairKnowledgeBase, RepairExperience, RepairOutcome, AttemptRecord, format_experiences_for_prompt};

pub struct RepairKbTool {
    kb: Arc<RepairKnowledgeBase>,
}

impl RepairKbTool {
    pub fn new(base_dir: PathBuf) -> Self {
        RepairKbTool {
            kb: Arc::new(RepairKnowledgeBase::new(base_dir)),
        }
    }

    pub fn kb(&self) -> Arc<RepairKnowledgeBase> {
        self.kb.clone()
    }
}

#[async_trait]
impl AgentTool for RepairKbTool {
    fn name(&self) -> &str {
        "repair_kb"
    }

    fn description(&self) -> &str {
        "Repair knowledge base: search past repair experiences, save new experiences, get stats. Use 'search' before fixing a problem to learn from past attempts. Use 'save' after a repair completes (success or failure) to record what worked and what didn't."
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["search", "save", "stats", "list_service"],
                    "description": "Action: 'search' find relevant past experiences, 'save' record a new repair experience, 'stats' get KB statistics, 'list_service' list all experiences for a service"
                },
                "service": {
                    "type": "string",
                    "description": "Service name (e.g., 'Nginx', 'PostgreSQL', 'Redis'). Required for 'search', 'save', 'list_service'."
                },
                "query": {
                    "type": "string",
                    "description": "Search keywords for 'search' action. Describe the problem or error."
                },
                "limit": {
                    "type": "number",
                    "description": "Max results for 'search' (default: 3, max: 10)"
                },
                "problem_type": {
                    "type": "string",
                    "description": "Problem type category (for 'save'): 'install_failed', 'service_not_starting', 'config_error', 'port_conflict', 'ssl_issue', 'permission_error', 'other'"
                },
                "problem_description": {
                    "type": "string",
                    "description": "Detailed description of the problem (for 'save')"
                },
                "outcome": {
                    "type": "string",
                    "enum": ["success", "failed", "partial"],
                    "description": "Repair outcome (for 'save')"
                },
                "solution": {
                    "type": "string",
                    "description": "What worked in the end (for 'save', required when outcome is success)"
                },
                "key_errors": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "Key error messages encountered (for 'save')"
                },
                "lessons_learned": {
                    "type": "string",
                    "description": "Key takeaways and best practices (for 'save')"
                },
                "distro": {
                    "type": "string",
                    "description": "Linux distribution (for 'save'), e.g., 'ubuntu', 'centos', 'arch'"
                },
                "package_manager": {
                    "type": "string",
                    "description": "Package manager (for 'save'), e.g., 'apt-get', 'dnf', 'yum', 'pacman', 'apk'"
                }
            },
            "required": ["action"]
        })
    }

    fn category(&self) -> &str {
        "info"
    }

    fn risk_level(&self, params: &Value) -> crate::plugins::ai_agent::permission::ToolRiskLevel {
        use crate::plugins::ai_agent::permission::ToolRiskLevel;
        match params["action"].as_str() {
            Some("save") => ToolRiskLevel::Low,
            Some("search") | Some("stats") | Some("list_service") => ToolRiskLevel::Informational,
            _ => ToolRiskLevel::Low,
        }
    }

    fn permission_description(&self, params: &Value) -> String {
        let action = params["action"].as_str().unwrap_or("unknown");
        match action {
            "search" => {
                let service = params["service"].as_str().unwrap_or("any");
                let query = params["query"].as_str().unwrap_or("");
                format!("Search repair KB: {} ({})", service, super::engine::truncate_bytes(query, 60))
            }
            "save" => {
                let service = params["service"].as_str().unwrap_or("unknown");
                let outcome = params["outcome"].as_str().unwrap_or("unknown");
                format!("Save repair experience: {} - {}", service, outcome)
            }
            "stats" => "Get repair KB stats".to_string(),
            "list_service" => {
                let service = params["service"].as_str().unwrap_or("unknown");
                format!("List repair experiences for: {}", service)
            }
            _ => format!("Repair KB: {}", action),
        }
    }

    async fn execute(&self, params: Value) -> Result<ToolOutput, String> {
        let action = params["action"].as_str()
            .ok_or_else(|| "Missing 'action' parameter".to_string())?;

        match action {
            "search" => self.action_search(&params).await,
            "save" => self.action_save(&params).await,
            "stats" => self.action_stats().await,
            "list_service" => self.action_list_service(&params).await,
            _ => Ok(ToolOutput {
                success: false,
                result: format!("Unknown action '{}'. Available: search, save, stats, list_service", action),
                metadata: Value::Null,
            }),
        }
    }
}

impl RepairKbTool {
    async fn action_search(&self, params: &Value) -> Result<ToolOutput, String> {
        let service = params["service"].as_str()
            .ok_or_else(|| "Missing 'service' parameter".to_string())?;
        let query = params["query"].as_str().unwrap_or("");
        let limit = params["limit"].as_i64().unwrap_or(3).min(10).max(1) as usize;

        // 从查询中提取关键词
        let keywords: Vec<&str> = if query.is_empty() {
            Vec::new()
        } else {
            query.split_whitespace().collect()
        };

        let experiences = self.kb.search(service, &keywords, limit);

        if experiences.is_empty() {
            return Ok(ToolOutput {
                success: true,
                result: format!("No past repair experiences found for '{}'. This is a fresh start — whatever method you try will be recorded for future reference.", service),
                metadata: json!({ "count": 0, "results": [] }),
            });
        }

        let formatted = format_experiences_for_prompt(&experiences);
        Ok(ToolOutput {
            success: true,
            result: format!("Found {} relevant repair experience(s):\n\n{}", experiences.len(), formatted),
            metadata: json!({
                "count": experiences.len(),
                "results": experiences.iter().map(|e| json!({
                    "id": e.id,
                    "service": e.service,
                    "problemType": e.problem_type,
                    "outcome": format!("{:?}", e.outcome).to_lowercase(),
                })).collect::<Vec<_>>(),
            }),
        })
    }

    async fn action_save(&self, params: &Value) -> Result<ToolOutput, String> {
        let service = params["service"].as_str()
            .ok_or_else(|| "Missing 'service' parameter".to_string())?;
        let problem_type = params["problem_type"].as_str().unwrap_or("other");
        let problem_description = params["problem_description"].as_str()
            .unwrap_or("No description provided");
        let outcome_str = params["outcome"].as_str().unwrap_or("success");

        let outcome = match outcome_str {
            "failed" => RepairOutcome::Failed,
            "partial" => RepairOutcome::Partial,
            _ => RepairOutcome::Success,
        };

        let solution = params["solution"].as_str().map(|s| s.to_string());
        let lessons_learned = params["lessons_learned"].as_str().map(|s| s.to_string());
        let distro = params["distro"].as_str().unwrap_or("unknown").to_string();
        let package_manager = params["package_manager"].as_str().unwrap_or("unknown").to_string();

        let key_errors: Vec<String> = params["key_errors"].as_array()
            .map(|arr| arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect())
            .unwrap_or_default();

        let id = self.kb.generate_id();
        let tags = generate_tags(service, problem_type, &key_errors);

        let experience = RepairExperience {
            id,
            service: service.to_string(),
            problem_type: problem_type.to_string(),
            problem_description: problem_description.to_string(),
            distro,
            package_manager,
            outcome,
            solution,
            attempts: Vec::new(), // 详细尝试记录通过修复计划同步
            key_errors,
            lessons_learned,
            created_at: chrono::Utc::now().timestamp(),
            tags,
        };

        self.kb.save_experience(&experience)?;

        let outcome_label = match outcome {
            RepairOutcome::Success => "success",
            RepairOutcome::Failed => "failed",
            RepairOutcome::Partial => "partial",
        };

        Ok(ToolOutput {
            success: true,
            result: format!("Repair experience saved to knowledge base.\nID: {}\nService: {}\nProblem: {}\nOutcome: {}",
                experience.id, service, problem_type, outcome_label),
            metadata: json!({
                "id": experience.id,
                "service": service,
                "outcome": outcome_label,
            }),
        })
    }

    async fn action_stats(&self) -> Result<ToolOutput, String> {
        let stats = self.kb.stats();
        Ok(ToolOutput {
            success: true,
            result: format!(
                "Repair Knowledge Base Stats:\n\
                 - Total experiences: {}\n\
                 - Successful: {}\n\
                 - Failed: {}\n\
                 - Services covered: {}",
                stats.total_experiences,
                stats.success_count,
                stats.failed_count,
                stats.services_count,
            ),
            metadata: json!({
                "total": stats.total_experiences,
                "success": stats.success_count,
                "failed": stats.failed_count,
                "services": stats.services_count,
            }),
        })
    }

    async fn action_list_service(&self, params: &Value) -> Result<ToolOutput, String> {
        let service = params["service"].as_str()
            .ok_or_else(|| "Missing 'service' parameter".to_string())?;

        let experiences = self.kb.get_by_service(service);
        if experiences.is_empty() {
            return Ok(ToolOutput {
                success: true,
                result: format!("No repair experiences for '{}' yet.", service),
                metadata: json!({ "count": 0 }),
            });
        }

        let mut result = format!("Repair experiences for '{}' ({} total):\n\n", service, experiences.len());
        for exp in &experiences {
            let outcome_icon = match exp.outcome {
                RepairOutcome::Success => "✅",
                RepairOutcome::Failed => "❌",
                RepairOutcome::Partial => "⚠️",
            };
            result.push_str(&format!("{} [{}] {} - {}\n",
                outcome_icon, exp.id, exp.problem_type,
                super::engine::truncate_bytes(&exp.problem_description, 60)));
        }

        Ok(ToolOutput {
            success: true,
            result,
            metadata: json!({
                "service": service,
                "count": experiences.len(),
            }),
        })
    }
}

fn generate_tags(service: &str, problem_type: &str, errors: &[String]) -> Vec<String> {
    let mut tags = Vec::new();
    tags.push(service.to_lowercase());
    tags.push(problem_type.to_string());

    // 从错误信息中提取常见关键词作为标签
    for err in errors {
        let err_lower = err.to_lowercase();
        if err_lower.contains("404") || err_lower.contains("not found") {
            tags.push("not_found".to_string());
        }
        if err_lower.contains("permission") || err_lower.contains("eacces") {
            tags.push("permission".to_string());
        }
        if err_lower.contains("timeout") || err_lower.contains("timed out") {
            tags.push("timeout".to_string());
        }
        if err_lower.contains("already") && err_lower.contains("use") {
            tags.push("already_in_use".to_string());
        }
        if err_lower.contains("syntax") {
            tags.push("syntax_error".to_string());
        }
        if err_lower.contains("connection refused") || err_lower.contains("econnrefused") {
            tags.push("connection_refused".to_string());
        }
    }

    tags.sort();
    tags.dedup();
    tags
}
