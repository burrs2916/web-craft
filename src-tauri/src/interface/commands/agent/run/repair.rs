use std::sync::Arc;

use tauri::Emitter;

use crate::app::plugin_service::PluginService;
use crate::infra::storage::agent_repo::AiAgentRow;
use crate::plugins::ai_agent::engine::AgentEngine;
use crate::plugins::ai_agent::provider::LlmProvider;

use super::super::dto::{detect_services_from_message, extract_target_from_message};

/// 环境修复类 agent 的引擎配置：Ollama 模型预加载、修复计划目标、历史经验注入、
/// 修复进度回调与修复知识库自动学习。
pub fn configure_repair_engine(
    mut engine_builder: AgentEngine,
    agent: &AiAgentRow,
    plugin_service: &PluginService,
    app_handle: &tauri::AppHandle,
    conv_id: &str,
    system_prompt: &str,
    message: &str,
    llm_provider_arc: &Arc<dyn LlmProvider>,
    model_ref: &str,
    is_ollama: bool,
) -> AgentEngine {
    // Ollama 模型预加载：环境修复通常需要较长时间，提前加载模型避免首次等待
    if is_ollama {
        let provider_clone = llm_provider_arc.clone();
        let model_name = model_ref.to_string();
        tokio::spawn(async move {
            match provider_clone.preload_model(&model_name, "30m").await {
                Ok(_) => tracing::info!("[env_fix] Ollama model preloaded: {}", model_name),
                Err(e) => tracing::warn!("[env_fix] Ollama model preload failed: {}", e),
            }
        });
    }
    // 从用户消息中提取目标主机信息（简单提取）
    let target = extract_target_from_message(message);
    engine_builder = engine_builder.with_repair_plan_target(target);

    // 从用户消息/检测报告中提取服务名，搜索历史修复经验
    let kb_dir = plugin_service.data_dir()
        .join("agents").join(&agent.id);
    let kb = std::sync::Arc::new(crate::plugins::ai_agent::repair_kb::RepairKnowledgeBase::new(kb_dir));
    let kb_stats = kb.stats();

    if kb_stats.total_experiences > 0 {
        // 从消息中提取常见服务关键词
        let services_to_search = detect_services_from_message(message);
        let mut all_experiences = Vec::new();

        for service in &services_to_search {
            let keywords: Vec<&str> = Vec::new();
            let experiences = kb.search(service, &keywords, 2);
            all_experiences.extend(experiences);
        }

        // 去重（按 id）
        all_experiences.sort_by(|a, b| a.id.cmp(&b.id));
        all_experiences.dedup_by(|a, b| a.id == b.id);

        if !all_experiences.is_empty() {
            let formatted = crate::plugins::ai_agent::repair_kb::format_experiences_for_prompt(&all_experiences);
            let enriched = format!("{}\n\n--- Repair Knowledge Base ---\n{}\n--- End KB ---",
                system_prompt, formatted);
            engine_builder = engine_builder.with_system_prompt(enriched);
        }
    }

    // 修复进度回调：通过 Tauri 事件推送给前端
    let emit_progress = app_handle.clone();
    let conv_id_progress = conv_id.to_string();
    engine_builder = engine_builder.with_repair_progress_callback(
        std::sync::Arc::new(move |plan| {
            let progress_json = serde_json::json!({
                "conversationId": conv_id_progress,
                "planId": plan.plan_id,
                "target": plan.target,
                "totalSteps": plan.total_steps,
                "completedSteps": plan.completed_steps,
                "failedSteps": plan.failed_steps,
                "progressPercent": plan.progress_percent(),
                "steps": plan.steps.iter().map(|s| serde_json::json!({
                    "index": s.index,
                    "service": s.service,
                    "description": s.description,
                    "status": s.status.as_str(),
                    "priority": format!("{:?}", s.priority).to_lowercase(),
                    "requiresSudo": s.requires_sudo,
                    "failureReason": s.failure_reason,
                    "outputSummary": s.output_summary,
                    "attempts": s.attempts.iter().map(|a| serde_json::json!({
                        "attemptNo": a.attempt_no,
                        "method": a.method,
                        "command": a.command,
                        "success": a.success,
                        "error": a.error,
                    })).collect::<Vec<_>>(),
                })).collect::<Vec<_>>(),
            });
            if let Err(e) = emit_progress.emit("agent-repair-progress", progress_json) {
                tracing::warn!("[run_agent] failed to emit agent-repair-progress: {}", e);
            }
        })
    );

    // 启用修复知识库自动学习
    engine_builder = engine_builder.with_repair_kb(kb.clone());
    engine_builder
}
