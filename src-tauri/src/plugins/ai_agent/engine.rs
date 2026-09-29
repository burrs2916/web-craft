#![allow(dead_code)]

use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use super::permission::PermissionMode;
use super::permission::PermissionRequest;
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

mod retry;
mod run;
mod types;
mod util;

pub use types::*;
pub use util::*;

use util::{estimate_messages_tokens};

pub struct AgentEngine {
    agent_id: String,
    provider: Arc<dyn super::provider::LlmProvider>,
    fallback_provider: Option<Arc<dyn super::provider::LlmProvider>>,
    fallback_model: Option<String>,
    tools: Arc<Mutex<ToolRegistry>>,
    model: String,
    system_prompt: String,
    temperature: f64,
    max_iterations: i32,
    max_tokens: i64,
    cancel_token: Option<CancellationToken>,
    permission_mode: PermissionMode,
    always_allowed_tools: Arc<tokio::sync::Mutex<Vec<String>>>,
    permission_requester: Option<Arc<dyn Fn(PermissionRequest) -> Pin<Box<dyn Future<Output = (bool, bool)> + Send>> + Send + Sync>>,
    message_persister: Option<Arc<dyn Fn(PersistMessage) + Send + Sync>>,
    /// 自主任务模式：当模型返回纯文本（无工具调用）但任务尚未完成时，自动注入提醒并继续循环，
    /// 避免每完成一小步就停下等用户点"继续"。仅对明确开启的会话（如远程桌面安装）生效。
    auto_continue: bool,
    /// 修复计划（仅环境修复类 agent 使用）
    repair_plan: Option<super::repair_plan::RepairPlan>,
    /// 修复进度回调：当修复计划有更新时调用
    repair_progress_callback: Option<Arc<dyn Fn(super::repair_plan::RepairPlan) + Send + Sync>>,
    /// 单个工具调用的最大超时时间（秒），防止工具挂起导致整个 agent 卡住
    tool_timeout_secs: u64,
    /// 工具调用失败时的最大重试次数（仅对可重试错误生效）
    tool_max_retries: u32,
    /// 重试初始延迟（毫秒），每次重试后指数增长（x2）
    tool_retry_base_delay_ms: u64,
    /// 上下文压缩配置
    compaction_config: CompactionConfig,
    /// 是否启用对话结束后自动摘要到记忆
    memory_auto_summary: bool,
    /// 自动摘要的最小消息数（少于此数不摘要）
    memory_auto_summary_min_messages: usize,
    /// 记忆写入目标："long_term" 或 "daily"
    memory_auto_summary_target: String,
    /// 修复知识库（用于自动学习）
    repair_kb: Option<Arc<super::repair_kb::RepairKnowledgeBase>>,
    /// 上下文窗口大小（token），用于计算使用率，0 表示未知
    context_window: i64,
}

impl AgentEngine {
    pub fn new(
        provider: Arc<dyn super::provider::LlmProvider>,
        tools: Arc<Mutex<ToolRegistry>>,
        model: String,
        system_prompt: String,
        temperature: f64,
        max_iterations: i32,
    ) -> Self {
        AgentEngine {
            agent_id: String::new(),
            provider,
            fallback_provider: None,
            fallback_model: None,
            tools,
            model,
            system_prompt,
            temperature,
            max_iterations,
            max_tokens: 4096,
            cancel_token: None,
            permission_mode: PermissionMode::Confirm,
            always_allowed_tools: Arc::new(tokio::sync::Mutex::new(Vec::new())),
            permission_requester: None,
            message_persister: None,
            auto_continue: false,
            repair_plan: None,
            repair_progress_callback: None,
            tool_timeout_secs: 300, // 默认 5 分钟超时
            tool_max_retries: 3,    // 默认最多重试 3 次
            tool_retry_base_delay_ms: 500, // 初始 500ms 延迟
            compaction_config: CompactionConfig::default(),
            memory_auto_summary: false,
            memory_auto_summary_min_messages: 4,
            memory_auto_summary_target: "daily".to_string(),
            repair_kb: None,
            context_window: 0, // 默认未知，由外部设置
        }
    }

    pub fn with_agent_id(mut self, id: String) -> Self {
        self.agent_id = id;
        self
    }

    pub fn with_cancel_token(mut self, token: CancellationToken) -> Self {
        self.cancel_token = Some(token);
        self
    }

    pub fn with_permission_mode(mut self, mode: PermissionMode) -> Self {
        self.permission_mode = mode;
        self
    }

    pub fn with_always_allowed_tools(mut self, tools: Vec<String>) -> Self {
        self.always_allowed_tools = Arc::new(tokio::sync::Mutex::new(tools));
        self
    }

    pub fn with_permission_requester(mut self, requester: PermissionRequesterFn) -> Self {
        self.permission_requester = Some(requester);
        self
    }

    pub fn with_fallback(mut self, provider: Arc<dyn super::provider::LlmProvider>, model: String) -> Self {
        self.fallback_provider = Some(provider);
        self.fallback_model = Some(model);
        self
    }

    pub fn with_auto_continue(mut self, enabled: bool) -> Self {
        self.auto_continue = enabled;
        self
    }

    /// 设置最大输出 token 数（覆盖默认值 4096）
    pub fn with_max_tokens(mut self, max_tokens: i64) -> Self {
        if max_tokens > 0 {
            self.max_tokens = max_tokens;
        }
        self
    }

    pub fn with_message_persister(mut self, persister: Arc<dyn Fn(PersistMessage) + Send + Sync>) -> Self {
        self.message_persister = Some(persister);
        self
    }

    /// 设置修复计划目标（用于 env-fix 类 agent）
    pub fn with_repair_plan_target(mut self, target: String) -> Self {
        self.repair_plan = Some(super::repair_plan::RepairPlan::new(
            self.agent_id.clone(),
            target,
        ));
        self
    }

    /// 设置修复进度回调
    pub fn with_repair_progress_callback(
        mut self,
        callback: Arc<dyn Fn(super::repair_plan::RepairPlan) + Send + Sync>,
    ) -> Self {
        self.repair_progress_callback = Some(callback);
        self
    }

    /// 获取当前修复计划（只读）
    pub fn repair_plan(&self) -> Option<&super::repair_plan::RepairPlan> {
        self.repair_plan.as_ref()
    }

    pub fn with_system_prompt(mut self, prompt: String) -> Self {
        self.system_prompt = prompt;
        self
    }

    /// 启用对话结束后自动摘要到记忆
    pub fn with_memory_auto_summary(mut self, enabled: bool, target: &str, min_messages: usize) -> Self {
        self.memory_auto_summary = enabled;
        self.memory_auto_summary_target = target.to_string();
        self.memory_auto_summary_min_messages = min_messages;
        self
    }

    /// 设置修复知识库，用于修复完成后自动学习
    pub fn with_repair_kb(mut self, kb: Arc<super::repair_kb::RepairKnowledgeBase>) -> Self {
        self.repair_kb = Some(kb);
        self
    }

    /// 设置上下文窗口大小（token），用于计算使用率
    pub fn with_context_window(mut self, context_window: i64) -> Self {
        self.context_window = context_window;
        self
    }

    /// 估算上下文使用情况
    fn estimate_context_usage(&self, messages: &[super::provider::ChatMessage]) -> Option<ContextUsage> {
        if self.context_window <= 0 {
            return None;
        }
        let tokens_used = estimate_messages_tokens(messages);
        let usage_ratio = tokens_used as f64 / self.context_window as f64;
        Some(ContextUsage {
            tokens_used,
            context_window: self.context_window,
            usage_ratio,
        })
    }

    /// 在对话结束后自动将对话摘要写入记忆
    /// 仅在启用了自动摘要且消息数满足条件时执行
    async fn try_auto_summarize_to_memory(&self, messages: &[super::provider::ChatMessage]) {
        if !self.memory_auto_summary {
            return;
        }

        // 过滤掉 system 消息，只统计 user/assistant/tool 消息
        let non_system_msgs: Vec<_> = messages.iter()
            .filter(|m| m.role != "system" && m.role != "system_compaction")
            .collect();

        if non_system_msgs.len() < self.memory_auto_summary_min_messages {
            tracing::debug!("[AgentEngine] skip auto-summary: only {} non-system messages (min {})",
                non_system_msgs.len(), self.memory_auto_summary_min_messages);
            return;
        }

        // 获取 memory 工具
        let memory_tool = {
            let tools = self.tools.lock().await;
            tools.get("memory").cloned()
        };

        if memory_tool.is_none() {
            tracing::warn!("[AgentEngine] memory tool not found, skipping auto-summary");
            return;
        }

        tracing::info!("[AgentEngine] starting auto-summary to memory ({} messages)", non_system_msgs.len());

        // 构建摘要请求
        let summary_prompt = Self::build_memory_summary_prompt(&non_system_msgs);

        // 使用 provider 生成摘要
        let options = super::provider::ChatOptions {
            model: self.model.clone(),
            temperature: 0.3,
            max_tokens: 800,
            tools: None,
            ..Default::default()
        };

        match self.provider.chat(&[super::provider::ChatMessage {
            role: "user".to_string(),
            content: summary_prompt,
            reasoning_content: None,
            tool_calls: None,
            tool_call_id: None,
        }], &options).await {
            Ok(response) => {
                if let Some(summary) = response.content {
                    let summary_trimmed = summary.trim();
                    if !summary_trimmed.is_empty() {
                        // 使用 memory 工具保存摘要
                        let params = serde_json::json!({
                            "action": "save",
                            "content": summary_trimmed,
                            "target": self.memory_auto_summary_target,
                        });

                        if let Some(tool) = memory_tool {
                            match tool.execute(params).await {
                                Ok(output) => {
                                    if output.success {
                                        tracing::info!("[AgentEngine] auto-summary saved to {} memory ({} chars)",
                                            self.memory_auto_summary_target, summary_trimmed.len());
                                    } else {
                                        tracing::warn!("[AgentEngine] auto-summary save failed: {}", output.result);
                                    }
                                }
                                Err(e) => {
                                    tracing::warn!("[AgentEngine] auto-summary tool error: {}", e);
                                }
                            }
                        }
                    }
                }
            }
            Err(e) => {
                tracing::warn!("[AgentEngine] auto-summary generation failed: {}", e);
            }
        }
    }

    /// 构建用于记忆摘要的 prompt
    fn build_memory_summary_prompt(messages: &[&super::provider::ChatMessage]) -> String {
        let mut conversation_text = String::new();

        for msg in messages {
            let role_label = match msg.role.as_str() {
                "user" => "User",
                "assistant" => "Assistant",
                "tool" => "Tool Output",
                _ => msg.role.as_str(),
            };
            conversation_text.push_str(&format!("{}: {}\n", role_label, truncate_chars(&msg.content, 500)));
        }

        format!(
            "Please summarize the following conversation into concise, useful memory notes. \
            Focus on:\n\
            1. Key decisions made and their rationale\n\
            2. Important facts, preferences, or requirements discovered\n\
            3. Action items or follow-ups identified\n\
            4. Problems encountered and solutions found\n\
            5. Any lessons learned that would be useful for future conversations\n\n\
            Write the summary as bullet points. Be concise but thorough. \
            Include only information that has long-term value. Skip trivial pleasantries and small talk.\n\n\
            Conversation:\n\
            {}",
            conversation_text
        )
    }

    /// 从修复计划自动提取经验并保存到知识库
    async fn try_auto_learn_to_kb(
        kb: &super::repair_kb::RepairKnowledgeBase,
        plan: &super::repair_plan::RepairPlan,
        agent_id: &str,
    ) {
        use super::repair_kb::{RepairExperience, RepairOutcome, AttemptRecord};
        use super::repair_plan::StepStatus;

        // 只学习有实际步骤的计划
        if plan.steps.is_empty() {
            return;
        }

        let total_steps = plan.steps.len();
        let success_steps = plan.steps.iter().filter(|s| matches!(s.status, StepStatus::Success)).count();
        let failed_steps = plan.steps.iter().filter(|s| matches!(s.status, StepStatus::Failed)).count();

        // 判断整体结果
        let outcome = if failed_steps == 0 && success_steps == total_steps {
            RepairOutcome::Success
        } else if success_steps > 0 && failed_steps > 0 {
            RepairOutcome::Partial
        } else {
            RepairOutcome::Failed
        };

        tracing::info!("[AgentEngine::kb_auto_learn] learning from repair plan: agent={}, steps={}, success={}, failed={}, outcome={:?}",
            agent_id, total_steps, success_steps, failed_steps, outcome);

        // 为每个有尝试记录的步骤生成一条经验
        let mut saved_count = 0;
        for step in &plan.steps {
            // 跳过没有尝试记录的步骤
            if step.attempts.is_empty() {
                continue;
            }

            // 收集关键错误信息
            let key_errors: Vec<String> = step.attempts
                .iter()
                .filter(|a| !a.success && a.error.is_some())
                .filter_map(|a| a.error.clone())
                .collect();

            // 找到成功的方案（最后一个成功的尝试）
            let successful_attempt = step.attempts.iter().rfind(|a| a.success);
            let solution = successful_attempt.map(|a| format!("{}: {}", a.method, a.command));

            // 转换尝试记录
            let attempts: Vec<AttemptRecord> = step.attempts
                .iter()
                .map(|a| AttemptRecord {
                    method: a.method.clone(),
                    command: a.command.clone(),
                    success: a.success,
                    error: a.error.clone(),
                })
                .collect();

            // 生成经验教训
            let lessons_learned = if !matches!(step.status, StepStatus::Success) {
                Some(format!(
                    "修复 {} 失败，尝试了 {} 种方法均未成功。最后错误：{}",
                    step.service,
                    step.attempts.len(),
                    key_errors.last().map(|e| e.as_str()).unwrap_or("未知")
                ))
            } else if step.attempts.len() > 1 {
                Some(format!(
                    "修复 {} 经过 {} 次尝试才成功。前面失败的方法需要注意：{}",
                    step.service,
                    step.attempts.len(),
                    key_errors.iter().take(2).cloned().collect::<Vec<_>>().join("; ")
                ))
            } else {
                None
            };

            // 生成标签
            let mut tags = vec![step.service.clone()];
            if step.requires_sudo {
                tags.push("sudo".to_string());
            }
            if matches!(step.status, StepStatus::Success) {
                tags.push("success".to_string());
            } else {
                tags.push("failed".to_string());
            }
            if step.attempts.len() > 1 {
                tags.push("multi_attempt".to_string());
            }

            let experience = RepairExperience {
                id: format!("{}-step-{}", agent_id, step.index),
                service: step.service.clone(),
                problem_type: format!("{:?}", step.priority).to_lowercase(),
                problem_description: step.description.clone(),
                distro: plan.distro.clone().unwrap_or_default(),
                package_manager: plan.package_manager.clone().unwrap_or_default(),
                outcome: if matches!(step.status, StepStatus::Success) {
                    RepairOutcome::Success
                } else {
                    RepairOutcome::Failed
                },
                solution,
                attempts,
                key_errors,
                lessons_learned,
                created_at: chrono::Utc::now().timestamp(),
                tags,
            };

            match kb.save_experience(&experience) {
                Ok(_) => {
                    saved_count += 1;
                    tracing::debug!("[AgentEngine::kb_auto_learn] saved experience: {} (step {})",
                        step.service, step.index);
                }
                Err(e) => {
                    tracing::warn!("[AgentEngine::kb_auto_learn] save failed for step {}: {}",
                        step.index, e);
                }
            }
        }

        tracing::info!("[AgentEngine::kb_auto_learn] completed: saved {} experiences from {} steps",
            saved_count, total_steps);
    }

    /// 根据 tool_call 的 arguments 特征推断工具名（修复部分模型流式响应省略 function.name 的问题）。
    fn infer_tool_name_from_args(arguments: &str, registry_names: &[String]) -> Option<String> {
        // 只有 1 个工具 → 直接用（绝对安全）
        if registry_names.len() == 1 {
            return Some(registry_names[0].clone());
        }

        let v: serde_json::Value = match serde_json::from_str(arguments) {
            Ok(v) => v,
            Err(_) => return None,
        };

        // 按特征参数强匹配
        if v.get("session_id").is_some() {
            return Some("terminal_session".to_string());
        }
        if v.get("command").is_some() && (v.get("working_dir").is_some() || v.get("cwd").is_some()) {
            return Some("terminal".to_string());
        }
        // repair_kb: action 是 search/save/stats/list_service 之一
        if let Some(action) = v.get("action").and_then(|a| a.as_str()) {
            let kb_actions = ["search", "save", "stats", "list_service"];
            if kb_actions.contains(&action) {
                return Some("repair_kb".to_string());
            }
        }
        // file 工具：有 path / file_path 且没有 session_id
        if (v.get("path").is_some() || v.get("file_path").is_some()) && v.get("session_id").is_none() {
            return Some("file".to_string());
        }
        // command_history 工具：有 query / pattern
        if v.get("query").is_some() || v.get("pattern").is_some() {
            return Some("command_history".to_string());
        }
        // memory 工具：有 content / key
        if v.get("content").is_some() && v.get("session_id").is_none() && v.get("command").is_none() {
            // 弱匹配，仅当 registry 里有 memory 时才返回
            if registry_names.iter().any(|n| n == "memory") {
                return Some("memory".to_string());
            }
        }

        None
    }

    /// 清理消息列表中的无效 tool_calls（函数名为空的），避免 API 400 错误。
    /// 某些模型在流式响应中可能生成不完整的 tool_call，被持久化后下一轮请求会触发错误。
    fn sanitize_messages(messages: &mut [super::provider::ChatMessage]) -> usize {
        let mut removed = 0;
        for msg in messages.iter_mut() {
            if let Some(ref mut tcs) = msg.tool_calls {
                let before = tcs.len();
                tcs.retain(|tc| !tc.function.name.trim().is_empty());
                removed += before - tcs.len();
                if tcs.is_empty() {
                    msg.tool_calls = None;
                }
            }
        }
        removed
    }

}
