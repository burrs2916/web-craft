use std::sync::Arc;

use crate::infra::storage::agent_repo::{AiEndpointRow, AiProviderRow};

/// 根据 provider/endpoint 配置构建合适的 LLM Provider
/// 自动检测 Ollama 服务并使用原生 API，其他情况使用 OpenAI 兼容模式
/// 返回 (provider, is_ollama)，其中 is_ollama 表示是否为 Ollama 原生 provider
pub fn build_llm_provider(
    provider_row: &AiProviderRow,
    endpoint: &AiEndpointRow,
) -> (Arc<dyn crate::plugins::ai_agent::provider::LlmProvider>, bool) {
    let config = crate::plugins::ai_agent::provider::ProviderConfig {
        api_key: provider_row.api_key.clone(),
        base_url: endpoint.base_url.clone(),
        api_type: endpoint.api_type.clone(),
        auth_type: endpoint.auth_type.clone(),
        custom_auth_header: endpoint.custom_auth_header.clone(),
    };

    // 判断是否为 Ollama：
    // 1. provider name 包含 "ollama"
    // 2. base_url 包含 localhost:11434 或 127.0.0.1:11434
    // 3. api_type 明确标记为 "ollama"
    let lower_name = provider_row.name.to_lowercase();
    let lower_url = config.base_url.to_lowercase();
    let is_ollama = lower_name.contains("ollama")
        || lower_url.contains("11434")
        || config.api_type == "ollama";

    if is_ollama {
        tracing::info!("[build_provider] using Ollama native provider for {}", endpoint.base_url);
        let provider = crate::plugins::ai_agent::ollama_provider::OllamaProvider::new(config);
        (Arc::new(provider), true)
    } else {
        tracing::info!("[build_provider] using OpenAI compat provider for {}", endpoint.base_url);
        let provider = crate::plugins::ai_agent::openai_provider::OpenAiCompatProvider::new(config);
        (Arc::new(provider), false)
    }
}
