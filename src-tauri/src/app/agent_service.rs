#![allow(dead_code)]

use std::sync::Arc;

use crate::app::terminal_service::TerminalService;
use crate::infra::storage::database::Database;
use crate::infra::storage::agent_repo::{
    AiProviderRepo, AiProviderRow,
    AiEndpointRepo, AiEndpointRow,
    AiModelRepo, AiModelRow,
    AiAgentRepo, AiAgentRow,
    AiConversationRepo, AiConversationRow,
    AiMessageRepo, AiMessageRow,
};

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

/// Ollama 本地模型信息
#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct OllamaModelInfo {
    pub name: String,
    pub ref_key: String,
    pub size: u64,
    pub modified_at: String,
    pub parameter_size: String,
    pub quantization_level: String,
    pub family: String,
}

/// Ollama 服务状态信息
#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct OllamaStatusInfo {
    pub service_available: bool,
    pub version: String,
    pub model_loaded: bool,
    pub model_name: String,
    pub running_models: Vec<String>,
    pub error: Option<String>,
}

pub struct AgentService {
    db: Arc<Database>,
    terminal: Arc<TerminalService>,
}

impl AgentService {
    pub fn new(db: Arc<Database>, terminal: Arc<TerminalService>) -> Self {
        AgentService { db, terminal }
    }

    pub fn db(&self) -> Arc<Database> {
        self.db.clone()
    }

    pub fn terminal(&self) -> Arc<TerminalService> {
        self.terminal.clone()
    }

    pub fn list_providers(&self) -> Result<Vec<AiProviderRow>, String> {
        AiProviderRepo::list(&self.db)
    }

    pub fn get_provider_by_id(&self, id: &str) -> Result<Option<AiProviderRow>, String> {
        AiProviderRepo::get_by_id(&self.db, id)
    }

    pub fn save_provider(&self, provider: AiProviderRow) -> Result<(), String> {
        AiProviderRepo::save(&self.db, &provider)
    }

    pub fn delete_provider(&self, id: &str) -> Result<(), String> {
        AiProviderRepo::delete(&self.db, id)
    }

    pub fn list_endpoints(&self) -> Result<Vec<AiEndpointRow>, String> {
        AiEndpointRepo::list(&self.db)
    }

    pub fn get_endpoint_by_id(&self, id: &str) -> Result<Option<AiEndpointRow>, String> {
        AiEndpointRepo::get_by_id(&self.db, id)
    }

    pub fn list_endpoints_by_provider(&self, provider_id: &str) -> Result<Vec<AiEndpointRow>, String> {
        AiEndpointRepo::list_by_provider(&self.db, provider_id)
    }

    pub fn save_endpoint(&self, endpoint: AiEndpointRow) -> Result<(), String> {
        AiEndpointRepo::save(&self.db, &endpoint)
    }

    pub fn delete_endpoint(&self, id: &str) -> Result<(), String> {
        AiEndpointRepo::delete(&self.db, id)
    }

    pub fn list_models(&self) -> Result<Vec<AiModelRow>, String> {
        AiModelRepo::list(&self.db)
    }

    pub fn get_model_by_id(&self, id: &str) -> Result<Option<AiModelRow>, String> {
        AiModelRepo::get_by_id(&self.db, id)
    }

    pub fn list_models_by_endpoint(&self, endpoint_id: &str) -> Result<Vec<AiModelRow>, String> {
        AiModelRepo::list_by_endpoint(&self.db, endpoint_id)
    }

    pub fn save_model(&self, model: AiModelRow) -> Result<(), String> {
        AiModelRepo::save(&self.db, &model)
    }

    pub fn delete_model(&self, id: &str) -> Result<(), String> {
        AiModelRepo::delete(&self.db, id)
    }

    pub async fn test_endpoint_connection(&self, endpoint_id: &str) -> Result<String, String> {
        let endpoint = AiEndpointRepo::get_by_id(&self.db, endpoint_id)?
            .ok_or_else(|| "Endpoint not found".to_string())?;

        let provider = AiProviderRepo::get_by_id(&self.db, &endpoint.provider_id)?
            .ok_or_else(|| "Provider not found".to_string())?;

        let url = format!("{}/models", endpoint.base_url.trim_end_matches('/'));
        let client = reqwest::Client::new();

        let mut req = client.get(&url);
        match endpoint.auth_type.as_str() {
            "bearer" => {
                req = req.header("Authorization", format!("Bearer {}", provider.api_key));
            }
            "x-api-key" => {
                req = req.header("x-api-key", &provider.api_key);
            }
            "custom" => {
                if !endpoint.custom_auth_header.is_empty() {
                    req = req.header(&endpoint.custom_auth_header, &provider.api_key);
                }
            }
            _ => {}
        }

        let resp = req.send().await.map_err(|e| format!("Connection failed: {}", e))?;
        let status = resp.status();

        if status.is_success() {
            Ok(format!("Connection successful (HTTP {})", status))
        } else {
            let body = resp.text().await.unwrap_or_default();
            Err(format!("Connection failed (HTTP {}): {}", status, body.chars().take(200).collect::<String>()))
        }
    }

    pub async fn test_model_chat(&self, model_id: &str) -> Result<String, String> {
        let model = AiModelRepo::get_by_id(&self.db, model_id)?
            .ok_or_else(|| "Model not found".to_string())?;

        let endpoint = AiEndpointRepo::get_by_id(&self.db, &model.endpoint_id)?
            .ok_or_else(|| "Endpoint not found".to_string())?;

        let provider = AiProviderRepo::get_by_id(&self.db, &endpoint.provider_id)?
            .ok_or_else(|| "Provider not found".to_string())?;

        let url = match endpoint.api_type.as_str() {
            "anthropic-messages" => format!("{}/v1/messages", endpoint.base_url.trim_end_matches('/')),
            _ => format!("{}/chat/completions", endpoint.base_url.trim_end_matches('/')),
        };
        let client = reqwest::Client::new();

        let body = match endpoint.api_type.as_str() {
            "anthropic-messages" => serde_json::json!({
                "model": model.ref_key,
                "messages": [{"role": "user", "content": "Hi"}],
                "max_tokens": 10,
            }),
            _ => serde_json::json!({
                "model": model.ref_key,
                "messages": [{"role": "user", "content": "Hi"}],
                "max_tokens": 10,
            }),
        };

        let mut req = client.post(&url)
            .header("Content-Type", "application/json")
            .json(&body);

        if endpoint.api_type == "anthropic-messages" {
            req = req.header("anthropic-version", "2023-06-01");
        }

        match endpoint.auth_type.as_str() {
            "bearer" => {
                req = req.header("Authorization", format!("Bearer {}", provider.api_key));
            }
            "x-api-key" => {
                req = req.header("x-api-key", &provider.api_key);
            }
            "custom" => {
                if !endpoint.custom_auth_header.is_empty() {
                    req = req.header(&endpoint.custom_auth_header, &provider.api_key);
                }
            }
            _ => {}
        }

        let resp = req.send().await.map_err(|e| format!("Request failed: {}", e))?;
        let status = resp.status();

        if status.is_success() {
            let _text = resp.text().await.unwrap_or_default();
            Ok(format!("Model test successful (HTTP {})", status))
        } else {
            let body = resp.text().await.unwrap_or_default();
            Err(format!("Model test failed (HTTP {}): {}", status, body.chars().take(200).collect::<String>()))
        }
    }

    /// 扫描本地 Ollama 服务，获取可用模型列表
    pub async fn scan_ollama_models(&self, base_url: &str) -> Result<Vec<OllamaModelInfo>, String> {
        let url = format!("{}/api/tags", base_url.trim_end_matches('/'));
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(5))
            .build()
            .map_err(|e| format!("Failed to create client: {}", e))?;

        let resp = client.get(&url)
            .send()
            .await
            .map_err(|e| {
                if e.is_connect() {
                    "Ollama service not found. Please make sure Ollama is installed and running.".to_string()
                } else {
                    format!("Failed to connect to Ollama: {}", e)
                }
            })?;

        let status = resp.status();
        if !status.is_success() {
            return Err(format!("Ollama API error (HTTP {}): {}", status, resp.text().await.unwrap_or_default()));
        }

        let body: serde_json::Value = resp.json().await.map_err(|e| format!("Failed to parse response: {}", e))?;
        let models = body["models"].as_array()
            .ok_or_else(|| "Invalid response: no models field".to_string())?;

        let mut result = Vec::new();
        for m in models {
            let name = m["name"].as_str().unwrap_or("").to_string();
            let size = m["size"].as_u64().unwrap_or(0);
            let modified_at = m["modified_at"].as_str().unwrap_or("").to_string();
            let details = m["details"].as_object();
            let parameter_size = details.and_then(|d| d["parameter_size"].as_str()).unwrap_or("").to_string();
            let quantization_level = details.and_then(|d| d["quantization_level"].as_str()).unwrap_or("").to_string();
            let family = details.and_then(|d| d["family"].as_str()).unwrap_or("").to_string();

            result.push(OllamaModelInfo {
                name: name.clone(),
                ref_key: name.clone(),
                size,
                modified_at,
                parameter_size,
                quantization_level,
                family,
            });
        }

        Ok(result)
    }

    /// 检查 Ollama 服务状态和模型加载情况
    pub async fn check_ollama_status(&self, base_url: &str, model_name: Option<&str>) -> Result<OllamaStatusInfo, String> {
        let base = base_url.trim_end_matches('/');
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(5))
            .connect_timeout(std::time::Duration::from_secs(3))
            .build()
            .map_err(|e| format!("Failed to create client: {}", e))?;

        let mut status_info = OllamaStatusInfo {
            service_available: false,
            version: String::new(),
            model_loaded: false,
            model_name: model_name.unwrap_or("").to_string(),
            running_models: Vec::new(),
            error: None,
        };

        // 1. 获取版本信息（同时检测服务是否可用）
        match client.get(format!("{}/api/version", base)).send().await {
            Ok(resp) if resp.status().is_success() => {
                status_info.service_available = true;
                if let Ok(json) = resp.json::<serde_json::Value>().await {
                    status_info.version = json["version"].as_str().unwrap_or("unknown").to_string();
                }
            }
            Ok(resp) => {
                status_info.error = Some(format!("Version API returned HTTP {}", resp.status()));
                return Ok(status_info);
            }
            Err(e) => {
                if e.is_connect() {
                    status_info.error = Some("Ollama service not found. Please make sure Ollama is installed and running.".to_string());
                } else {
                    status_info.error = Some(format!("Failed to connect to Ollama: {}", e));
                }
                return Ok(status_info);
            }
        }

        // 2. 获取运行中的模型列表
        match client.get(format!("{}/api/ps", base)).send().await {
            Ok(resp) if resp.status().is_success() => {
                if let Ok(json) = resp.json::<serde_json::Value>().await {
                    if let Some(models) = json["models"].as_array() {
                        for m in models {
                            if let Some(name) = m["name"].as_str() {
                                status_info.running_models.push(name.to_string());
                            }
                        }
                    }
                }
            }
            Ok(resp) => {
                status_info.error = Some(format!("PS API returned HTTP {}", resp.status()));
            }
            Err(e) => {
                status_info.error = Some(format!("Failed to get running models: {}", e));
            }
        }

        // 3. 检查指定模型是否已加载
        if let Some(model) = model_name {
            for running_model in &status_info.running_models {
                if running_model == model || running_model.starts_with(&format!("{}:", model)) {
                    status_info.model_loaded = true;
                    break;
                }
            }
        }

        Ok(status_info)
    }

    pub fn list_agents(&self) -> Result<Vec<AiAgentRow>, String> {
        AiAgentRepo::list(&self.db)
    }

    pub fn get_agent_by_id(&self, id: &str) -> Result<Option<AiAgentRow>, String> {
        AiAgentRepo::get_by_id(&self.db, id)
    }

    pub fn save_agent(&self, agent: AiAgentRow) -> Result<(), String> {
        AiAgentRepo::save(&self.db, &agent)
    }

    pub fn delete_agent(&self, id: &str) -> Result<(), String> {
        AiAgentRepo::delete(&self.db, id)
    }

    pub fn list_conversations(&self, agent_id: &str) -> Result<Vec<AiConversationRow>, String> {
        AiConversationRepo::list_by_agent(&self.db, agent_id)
    }

    pub fn create_conversation(&self, agent_id: &str, title: &str) -> Result<AiConversationRow, String> {
        self.create_conversation_with_metadata(agent_id, title, "{}")
    }

    pub fn create_conversation_with_metadata(&self, agent_id: &str, title: &str, metadata: &str) -> Result<AiConversationRow, String> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = now_ms();
        let conv = AiConversationRow {
            id,
            agent_id: agent_id.to_string(),
            title: title.to_string(),
            metadata: metadata.to_string(),
            compaction_summary: String::new(),
            status: "idle".to_string(),
            message_count: 0,
            created_at: now,
            updated_at: now,
        };
        AiConversationRepo::save(&self.db, &conv)?;
        Ok(conv)
    }

    pub fn update_conversation_status(&self, id: &str, status: &str) -> Result<(), String> {
        AiConversationRepo::update_status(&self.db, id, status)
    }

    /// 应用启动时重置所有运行中的会话为中断状态
    pub fn reset_running_conversations(&self) -> Result<i64, String> {
        AiConversationRepo::reset_running_to_interrupted(&self.db)
    }

    pub fn delete_conversation(&self, id: &str) -> Result<(), String> {
        AiConversationRepo::delete(&self.db, id)
    }

    /// 清理旧会话：保留最近 keep_count 个，超过 max_age_days 的一并清理
    /// 返回被删除的会话数
    pub fn cleanup_old_conversations(
        &self,
        agent_id: &str,
        keep_count: i64,
        max_age_days: Option<i64>,
    ) -> Result<i64, String> {
        AiConversationRepo::cleanup_old_conversations(&self.db, agent_id, keep_count, max_age_days)
    }

    pub fn list_messages(&self, conversation_id: &str) -> Result<Vec<AiMessageRow>, String> {
        AiMessageRepo::list_by_conversation(&self.db, conversation_id)
    }

    pub fn save_message(&self, msg: AiMessageRow) -> Result<(), String> {
        AiMessageRepo::save(&self.db, &msg)
    }

    pub fn delete_messages_after(&self, conversation_id: &str, after_message_id: &str) -> Result<(), String> {
        AiMessageRepo::delete_after(&self.db, conversation_id, after_message_id)
    }

    pub fn find_conversation(&self, id: &str) -> Result<Option<AiConversationRow>, String> {
        AiConversationRepo::find_by_id(&self.db, id)
    }

    pub fn update_conversation_title(&self, id: &str, title: &str) -> Result<(), String> {
        if let Some(mut conv) = AiConversationRepo::find_by_id(&self.db, id)? {
            conv.title = title.to_string();
            conv.updated_at = now_ms();
            AiConversationRepo::save(&self.db, &conv)?;
        }
        Ok(())
    }

    pub fn touch_conversation(&self, id: &str) -> Result<(), String> {
        if let Some(mut conv) = AiConversationRepo::find_by_id(&self.db, id)? {
            conv.updated_at = now_ms();
            AiConversationRepo::save(&self.db, &conv)?;
        }
        Ok(())
    }

    pub fn update_compaction_summary(&self, id: &str, summary: &str) -> Result<(), String> {
        AiConversationRepo::update_compaction_summary(&self.db, id, summary)
    }
}
