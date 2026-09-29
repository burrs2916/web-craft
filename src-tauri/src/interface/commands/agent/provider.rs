use std::sync::Arc;
use tauri::State;

use crate::app::agent_service::AgentService;
use crate::infra::storage::agent_repo::{AiProviderRow, AiEndpointRow, AiModelRow};

use super::dto::{
    ProviderDto, EndpointDto, ModelDto,
    to_provider_dto, to_endpoint_dto, to_model_dto,
};

#[tauri::command]
pub fn list_providers(service: State<'_, Arc<AgentService>>) -> Result<Vec<ProviderDto>, String> {
    let providers = service.list_providers()?;
    Ok(providers.iter().map(to_provider_dto).collect())
}

#[tauri::command]
pub fn save_provider(service: State<'_, Arc<AgentService>>, provider: ProviderDto) -> Result<(), String> {
    service.save_provider(AiProviderRow {
        id: provider.id,
        name: provider.name,
        api_key: provider.api_key,
        logo: provider.logo,
        enabled: provider.enabled,
        created_at: provider.created_at,
        updated_at: provider.updated_at,
    })
}

#[tauri::command]
pub fn delete_provider(service: State<'_, Arc<AgentService>>, id: String) -> Result<(), String> {
    service.delete_provider(&id)
}

#[tauri::command]
pub fn list_endpoints(service: State<'_, Arc<AgentService>>) -> Result<Vec<EndpointDto>, String> {
    let endpoints = service.list_endpoints()?;
    Ok(endpoints.iter().map(to_endpoint_dto).collect())
}

#[tauri::command]
pub fn list_endpoints_by_provider(service: State<'_, Arc<AgentService>>, provider_id: String) -> Result<Vec<EndpointDto>, String> {
    let endpoints = service.list_endpoints_by_provider(&provider_id)?;
    Ok(endpoints.iter().map(to_endpoint_dto).collect())
}

#[tauri::command]
pub fn save_endpoint(service: State<'_, Arc<AgentService>>, endpoint: EndpointDto) -> Result<(), String> {
    service.save_endpoint(AiEndpointRow {
        id: endpoint.id,
        provider_id: endpoint.provider_id,
        name: endpoint.name,
        api_type: endpoint.api_type,
        base_url: endpoint.base_url,
        auth_type: endpoint.auth_type,
        custom_auth_header: endpoint.custom_auth_header,
        enabled: endpoint.enabled,
        created_at: endpoint.created_at,
        updated_at: endpoint.updated_at,
    })
}

#[tauri::command]
pub fn delete_endpoint(service: State<'_, Arc<AgentService>>, id: String) -> Result<(), String> {
    service.delete_endpoint(&id)
}

#[tauri::command]
pub fn list_models(service: State<'_, Arc<AgentService>>) -> Result<Vec<ModelDto>, String> {
    let models = service.list_models()?;
    Ok(models.iter().map(to_model_dto).collect())
}

#[tauri::command]
pub fn list_models_by_endpoint(service: State<'_, Arc<AgentService>>, endpoint_id: String) -> Result<Vec<ModelDto>, String> {
    let models = service.list_models_by_endpoint(&endpoint_id)?;
    Ok(models.iter().map(to_model_dto).collect())
}

#[tauri::command]
pub fn save_model(service: State<'_, Arc<AgentService>>, model: ModelDto) -> Result<(), String> {
    service.save_model(AiModelRow {
        id: model.id,
        name: model.name,
        ref_key: model.ref_key,
        endpoint_id: model.endpoint_id,
        reasoning: model.reasoning,
        input_types: model.input_types,
        context_window: model.context_window,
        max_tokens: model.max_tokens,
        enabled: model.enabled,
        created_at: model.created_at,
        updated_at: model.updated_at,
    })
}

#[tauri::command]
pub fn delete_model(service: State<'_, Arc<AgentService>>, id: String) -> Result<(), String> {
    service.delete_model(&id)
}

#[tauri::command]
pub async fn test_endpoint_connection(service: State<'_, Arc<AgentService>>, endpoint_id: String) -> Result<String, String> {
    service.test_endpoint_connection(&endpoint_id).await
}

#[tauri::command]
pub async fn test_model_chat(service: State<'_, Arc<AgentService>>, model_id: String) -> Result<String, String> {
    service.test_model_chat(&model_id).await
}

#[tauri::command]
pub async fn scan_ollama_models(service: State<'_, Arc<AgentService>>, base_url: String) -> Result<Vec<OllamaModelInfoDto>, String> {
    let models = service.scan_ollama_models(&base_url).await?;
    Ok(models.into_iter().map(|m| OllamaModelInfoDto {
        name: m.name,
        ref_key: m.ref_key,
        size: m.size,
        modified_at: m.modified_at,
        parameter_size: m.parameter_size,
        quantization_level: m.quantization_level,
        family: m.family,
    }).collect())
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OllamaModelInfoDto {
    pub name: String,
    pub ref_key: String,
    pub size: u64,
    pub modified_at: String,
    pub parameter_size: String,
    pub quantization_level: String,
    pub family: String,
}

#[tauri::command]
pub async fn check_ollama_status(
    service: State<'_, Arc<AgentService>>,
    base_url: String,
    model_name: Option<String>,
) -> Result<OllamaStatusDto, String> {
    let info = service.check_ollama_status(&base_url, model_name.as_deref()).await?;
    Ok(OllamaStatusDto {
        service_available: info.service_available,
        version: info.version,
        model_loaded: info.model_loaded,
        model_name: info.model_name,
        running_models: info.running_models,
        error: info.error,
    })
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OllamaStatusDto {
    pub service_available: bool,
    pub version: String,
    pub model_loaded: bool,
    pub model_name: String,
    pub running_models: Vec<String>,
    pub error: Option<String>,
}
