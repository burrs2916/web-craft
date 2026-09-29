#![allow(dead_code)]

use crate::infra::logging::debug_log;
use crate::plugins::ai_agent::permission::PermissionRequest;
use crate::plugins::ai_agent::permission;
use serde_json::Value;
use std::sync::Arc;

use super::AgentEngine;

use super::types::{AgentStatusEvent, PersistMessage, RunResult, StreamStats, ToolCallEvent, ToolOutput};
use super::util::{CompactionConfig, build_tool_error_message, cancel_future, compact_messages, estimate_messages_tokens, extract_command_from_args, is_retryable_error, last_assistant_content, should_compact, truncate_chars, validate_compacted_messages};

impl AgentEngine {
    pub async fn run(
        &mut self,
        user_message: &str,
        history: Vec<crate::plugins::ai_agent::provider::ChatMessage>,
        on_chunk: impl Fn(String),
        on_tool_call: impl Fn(ToolCallEvent),
        on_status: impl Fn(AgentStatusEvent) + Send + Sync + 'static,
    ) -> Result<RunResult, String> {
        // P2-7：入口强制检查取消 token 一致性
        // 1. 如果 token 已被取消，直接返回（防止已取消的会话又被重新 run）
        if let Some(ref token) = self.cancel_token {
            if token.is_cancelled() {
                tracing::warn!("[AgentEngine] run() called but cancel token already cancelled, agent_id={}", self.agent_id);
                return Err("agent already cancelled".to_string());
            }
        }

        let on_status_arc = Arc::new(on_status);
        let run_id = format!("{}-{}", self.agent_id, std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0));
        let is_env_ops = self.agent_id.contains("env-fix") || self.agent_id.contains("ops-assistant") || self.agent_id.contains("srv-env-setup");
        let log = |level: &str, phase: &str, event: &str, detail: &str| {
            if is_env_ops {
                debug_log::env_ops(level, &run_id, phase, event, detail);
            }
        };

        tracing::info!("[AgentEngine] run() called, agent_id={}, message_len={}, history_count={}", self.agent_id, user_message.len(), history.len());
        log("INFO", "agent_run", "start",
            &format!("agent_id={} model={} temperature={} max_iterations={} history_msgs={} msg_len={}",
                self.agent_id, self.model, self.temperature, self.max_iterations,
                history.len(), user_message.len()));
        tracing::debug!("[AgentEngine] user_message preview: {}...", truncate_chars(user_message, 200));
        log("INFO", "agent_run", "user_msg_preview",
            truncate_chars(user_message, 300));
        let mut messages: Vec<crate::plugins::ai_agent::provider::ChatMessage> = Vec::new();

        messages.push(crate::plugins::ai_agent::provider::ChatMessage {
            role: "system".to_string(),
            content: self.system_prompt.clone(),
            reasoning_content: None,
            tool_calls: None,
            tool_call_id: None,
        });

        for msg in history {
            if msg.role == "system" {
                continue;
            }
            messages.push(msg);
        }

        messages.push(crate::plugins::ai_agent::provider::ChatMessage {
            role: "user".to_string(),
            content: user_message.to_string(),
            reasoning_content: None,
            tool_calls: None,
            tool_call_id: None,
        });

        tracing::info!("[AgentEngine] total messages before compaction check: {}", messages.len());

        let compaction_config = CompactionConfig::default();
        if should_compact(&messages, &compaction_config) {
            tracing::warn!("[AgentEngine] compaction triggered, estimated_tokens={}, threshold={}", estimate_messages_tokens(&messages), compaction_config.max_estimated_tokens);
            log("WARN", "agent_run", "compaction_triggered",
                &format!("estimated_tokens={} threshold={} current_msgs={}",
                    estimate_messages_tokens(&messages), compaction_config.max_estimated_tokens, messages.len()));
            on_chunk("[Auto-compacting conversation history...]\n".to_string());
            match compact_messages(&self.provider, &messages, &compaction_config, &self.model).await {
                Ok((compacted, summary)) => {
                    let removed = messages.len().saturating_sub(compacted.len());
                    tracing::info!("[AgentEngine] compaction ok, removed={}, remaining={}", removed, compacted.len());
                    log("INFO", "agent_run", "compaction_ok",
                        &format!("removed={} remaining={} summary_len={}", removed, compacted.len(), summary.len()));
                    on_chunk(format!("[Compacted: {} messages summarized, {} recent preserved]\n", removed, compacted.len().saturating_sub(1)));
                    if let Some(ref persister) = self.message_persister {
                        persister(PersistMessage {
                            role: "system_compaction".to_string(),
                            content: summary,
                            tool_calls: None,
                            tool_call_id: None,
                            is_error: false,
                        });
                    }
                    match validate_compacted_messages(&compacted) {
                        Ok(()) => {
                            messages = compacted;
                        }
                        Err(ve) => {
                            tracing::error!("[AgentEngine] compaction validation failed: {}", ve);
                            on_chunk(format!("[Compaction validation failed: {}, keeping full history]\n", ve));
                        }
                    }
                }
                Err(e) => {
                    tracing::error!("[AgentEngine] compaction failed: {}", e);
                    on_chunk(format!("[Compaction failed: {}, continuing with full history]\n", e));
                }
            }
        }

        let tool_defs = {
            let tools = self.tools.lock().await;
            tools.list_definitions()
        };

        let tools_opt = if tool_defs.is_empty() { None } else { Some(tool_defs) };

        let mut iteration = 0;
        let mut force_tool_attempts = 0;
        let mut tool_call_count = 0;
        let mut auto_continue_count = 0;
        const MAX_AUTO_CONTINUE: i32 = 10;
        tracing::info!("[AgentEngine] starting loop, max_iterations={}, tools_count={}", self.max_iterations, tools_opt.as_ref().map(|t| t.len()).unwrap_or(0));
        let result: Result<String, String> = 'outer: loop {
            if iteration >= self.max_iterations {
                tracing::warn!("[AgentEngine] max iterations reached ({})", self.max_iterations);
                on_chunk("\n[Max iterations reached]\n".to_string());
                (on_status_arc.as_ref())(AgentStatusEvent {
                    status: "done".to_string(),
                    iteration: iteration as u32,
                    max_iterations: self.max_iterations as u32,
                    detail: Some("max_iterations_reached".to_string()),
                    stream_stats: None,
                    context_usage: None,
                });
                break 'outer Ok(last_assistant_content(&messages));
            }

            if let Some(ref token) = self.cancel_token {
                if token.is_cancelled() {
                    tracing::info!("[AgentEngine] cancelled by user at iteration {}", iteration);
                    on_chunk("\n[Stopped by user]\n".to_string());
                    (on_status_arc.as_ref())(AgentStatusEvent {
                        status: "done".to_string(),
                        iteration: iteration as u32,
                        max_iterations: self.max_iterations as u32,
                        detail: Some("cancelled".to_string()),
                        stream_stats: None,
                        context_usage: None,
                    });
                    break 'outer Ok(last_assistant_content(&messages));
                }
            }

            // 思考中状态：正在调用 LLM
            let context_usage = self.estimate_context_usage(&messages);
            (on_status_arc.as_ref())(AgentStatusEvent {
                status: "thinking".to_string(),
                iteration: iteration as u32,
                max_iterations: self.max_iterations as u32,
                detail: Some("正在连接模型...".to_string()),
                stream_stats: None,
                context_usage,
            });

            let options = crate::plugins::ai_agent::provider::ChatOptions {
                model: self.model.clone(),
                temperature: self.temperature,
                max_tokens: self.max_tokens,
                tools: tools_opt.clone(),
                ..Default::default()
            };

            let _use_stream = true;
            tracing::info!("[AgentEngine] iteration={}, calling chat_stream_with_retry, model={}", iteration, self.model);
            log("INFO", "llm_call", "start",
                &format!("iteration={} model={} messages={} estimated_tokens={}",
                    iteration, self.model, messages.len(), estimate_messages_tokens(&messages)));

            // 流式统计：包装 on_chunk 以跟踪字符数和速率
            let stream_start = std::time::Instant::now();
            let stream_chars = Arc::new(std::sync::atomic::AtomicUsize::new(0));
            let stream_chars_clone = stream_chars.clone();
            let on_chunk_wrapped = |chunk: String| {
                stream_chars_clone.fetch_add(chunk.chars().count(), std::sync::atomic::Ordering::Relaxed);
                on_chunk(chunk);
            };

            // 定期发送流式速率统计（每 500ms 一次）
            // 持续运行直到外部 abort（不再有 tick 次数限制，支持大模型长时间加载）
            let stream_stats_handle = {
                let stream_chars = stream_chars.clone();
                let on_status = on_status_arc.clone();
                let iteration_val = iteration as u32;
                let max_iter_val = self.max_iterations as u32;
                tokio::spawn(async move {
                    let mut _last_chars = 0;
                    loop {
                        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                        let current_chars = stream_chars.load(std::sync::atomic::Ordering::Relaxed);
                        let elapsed_ms = stream_start.elapsed().as_millis() as u64;
                        if elapsed_ms == 0 {
                            continue;
                        }
                        let chars_per_sec = (current_chars as f64) / (elapsed_ms as f64 / 1000.0);
                        let tokens_per_sec = chars_per_sec / 4.0;
                        let tokens_estimated = current_chars / 4;

                        let detail = if current_chars == 0 {
                            // 还没有收到任何数据，模型可能在加载中（尤其是本地大模型）
                            let waited_secs = elapsed_ms / 1000;
                            if waited_secs < 10 {
                                "正在连接模型...".to_string()
                            } else if waited_secs < 60 {
                                format!("模型加载中... 已等待 {}s", waited_secs)
                            } else if waited_secs < 300 {
                                format!("模型加载中（大模型可能需要 1-5 分钟）... 已等待 {}s", waited_secs)
                            } else {
                                let mins = waited_secs / 60;
                                let secs = waited_secs % 60;
                                format!("模型加载中，请耐心等待... 已等待 {}m {}s", mins, secs)
                            }
                        } else {
                            format!("生成中... {:.1} tok/s", tokens_per_sec)
                        };

                        (on_status.as_ref())(AgentStatusEvent {
                            status: "thinking".to_string(),
                            iteration: iteration_val,
                            max_iterations: max_iter_val,
                            detail: Some(detail),
                            stream_stats: Some(StreamStats {
                                chars_total: current_chars,
                                tokens_estimated,
                                chars_per_sec,
                                tokens_per_sec,
                                elapsed_ms,
                            }),
                            context_usage: None,
                        });

                        _last_chars = current_chars;
                    }
                })
            };

            let response = match self.chat_stream_with_retry(&messages, &options, &on_chunk_wrapped).await {
                Ok(r) => {
                    tracing::info!("[AgentEngine] chat_stream_with_retry ok, content_len={}, tool_calls={}", r.content.as_ref().map(|c| c.len()).unwrap_or(0), r.tool_calls.as_ref().map(|tc| tc.len()).unwrap_or(0));
                    log("INFO", "llm_call", "response",
                        &format!("iteration={} content_len={} tool_calls={} content_preview={}",
                            iteration, r.content.as_ref().map(|c| c.len()).unwrap_or(0),
                            r.tool_calls.as_ref().map(|tc| tc.len()).unwrap_or(0),
                            &r.content.as_ref().map(|c| truncate_chars(c, 200)).unwrap_or("")));
                    r
                }
                Err(e) => {
                    tracing::error!("[AgentEngine] chat_stream_with_retry failed at iteration {}: {}", iteration, truncate_chars(&e, 200));
                    log("ERROR", "llm_call", "failed",
                        &format!("iteration={} error={}", iteration, truncate_chars(&e, 300)));
                    if e.contains("context_length_exceeded") || e.contains("max_tokens") || e.contains("too many tokens") || e.contains("token limit") {
                        tracing::warn!("[AgentEngine] context too long, truncating history (current {} messages)", messages.len());
                        on_chunk("[Context too long, compressing history and retrying...]\n".to_string());

                        // 渐进式压缩：先摘要压缩 → 不行再截断 → 再不行激进截断
                        let mut current_messages = messages.to_vec();
                        let mut last_error = e.clone();
                        let mut attempt = 0;

                        // 第 1 次：尝试 LLM 摘要压缩（如果消息足够多）
                        if current_messages.len() > 20 && self.compaction_config.max_estimated_tokens > 0 {
                            tracing::info!("[AgentEngine] trying LLM summarization compaction (attempt {})", attempt + 1);
                            on_chunk("[Compressing conversation history with AI summary...]\n".to_string());
                            match compact_messages(
                                &self.provider,
                                &current_messages,
                                &self.compaction_config,
                                &self.model,
                            ).await {
                                Ok((compacted, _summary)) => {
                                    if compacted.len() < current_messages.len() {
                                        current_messages = compacted;
                                        tracing::info!("[AgentEngine] compacted to {} messages", current_messages.len());
                                    }
                                }
                                Err(ce) => {
                                    tracing::warn!("[AgentEngine] compaction failed: {}", ce);
                                }
                            }
                            attempt += 1;
                        }

                        // 第 2+ 次：渐进式截断
                        let mut truncate_result: Option<crate::plugins::ai_agent::provider::ChatResponse> = None;
                        loop {
                            let truncated = self.truncate_messages(&current_messages);
                            if truncated.len() >= current_messages.len() || truncated.len() <= 4 {
                                // 无法再截断了
                                break;
                            }
                            current_messages = truncated;
                            attempt += 1;
                            tracing::info!("[AgentEngine] truncation attempt {}: {} messages", attempt, current_messages.len());

                            match self.chat_stream_with_retry(&current_messages, &options, &on_chunk).await {
                                Ok(r) => {
                                    if attempt > 1 {
                                        on_chunk(format!("[History compressed to {} messages]\n", current_messages.len()));
                                    }
                                    // 截断成功，更新 messages 并保存结果
                                    messages = current_messages.clone();
                                    truncate_result = Some(r);
                                    break;
                                }
                                Err(e2) => {
                                    last_error = e2.clone();
                                    if last_error.contains("context_length_exceeded")
                                        || last_error.contains("max_tokens")
                                        || last_error.contains("too many tokens") {
                                        // 继续截断
                                        continue;
                                    }
                                    // 非 token 超限错误，尝试 fallback
                                    break;
                                }
                            }
                        }

                        if let Some(r) = truncate_result {
                            r
                        } else {
                            // 最后尝试 fallback 模型
                            tracing::warn!("[AgentEngine] truncation not enough, trying fallback model");
                            let retried = self.try_fallback(&current_messages, &options, &on_chunk, &last_error).await;
                            match retried {
                                Ok(r) => {
                                    on_chunk("[Switched to fallback model after compression]\n".to_string());
                                    r
                                }
                                Err(fe) => {
                                    tracing::error!("[AgentEngine] fallback also failed after compression: {}", fe);
                                    stream_stats_handle.abort();
                                    on_chunk(format!("[Provider error after compression: {}]\n", fe));
                                    return Err(fe);
                                }
                            }
                        }
                    } else {
                        let retried = self.try_fallback(&messages, &options, &on_chunk, &e).await;
                        match retried {
                            Ok(r) => {
                                on_chunk("[Switched to fallback model]\n".to_string());
                                r
                            }
                            Err(fallback_err) => {
                                stream_stats_handle.abort();
                                on_chunk(format!("[Provider error: {}]\n", fallback_err));
                                return Err(fallback_err);
                            }
                        }
                    }
                }
            };

            if let Some(ref token) = self.cancel_token {
                if token.is_cancelled() {
                    on_chunk("\n[Stopped by user]\n".to_string());
                    break 'outer Ok(last_assistant_content(&messages));
                }
            }

            // 某些 OpenAI 兼容模型（如 deepseek-v4-flash-0731）在流式响应中会省略
            // tool_calls[].function.name（只返回 arguments），导致 `Tool '' is not available`。
            // 依据上下文修复空工具名：注册表只有 1 个工具时直接用该工具名（绝对安全）；
            // 多工具时按参数特征推断（session_id 是 terminal_session 的独有特征）。
            let mut response_tool_calls = response.tool_calls.clone();
            if let Some(ref mut tcs) = response_tool_calls {
                let registry_names: Vec<String> = {
                    let tools = self.tools.lock().await;
                    tools.list_names()
                };
                for tc in tcs.iter_mut() {
                    if tc.function.name.trim().is_empty() {
                        let inferred = Self::infer_tool_name_from_args(&tc.function.arguments, &registry_names);
                        if let Some(name) = inferred {
                            tracing::warn!(
                                "[AgentEngine] empty tool name inferred as '{}' from context (args={})",
                                name,
                                truncate_chars(&tc.function.arguments, 80)
                            );
                            tc.function.name = name;
                        }
                    }
                }
                // 过滤掉仍然无法推断名称的 tool_call（会导致 API 400 错误）
                let before = tcs.len();
                tcs.retain(|tc| !tc.function.name.trim().is_empty());
                if tcs.len() < before {
                    tracing::error!(
                        "[AgentEngine] dropped {} tool_call(s) with unresolvable empty name",
                        before - tcs.len()
                    );
                }
            }

            let assistant_msg = crate::plugins::ai_agent::provider::ChatMessage {
                role: "assistant".to_string(),
                content: response.content.clone().unwrap_or_default(),
                reasoning_content: None,
                tool_calls: response_tool_calls.clone(),
                tool_call_id: None,
            };

            // 停止流式速率统计
            stream_stats_handle.abort();

            messages.push(assistant_msg.clone());
            if let Some(ref persister) = self.message_persister {
                persister(PersistMessage {
                    role: assistant_msg.role.clone(),
                    content: assistant_msg.content.clone(),
                    tool_calls: assistant_msg.tool_calls.clone(),
                    tool_call_id: assistant_msg.tool_call_id.clone(),
                    is_error: false,
                });
            }

            // 解析修复进度标记（env-fix 类 agent）
            if self.repair_plan.is_some() {
                if let Some(ref content) = response.content {
                    self.update_repair_progress_from_text(content);
                }
            }

            match &response_tool_calls {
                Some(tool_calls) if !tool_calls.is_empty() => {
                    tracing::info!("[AgentEngine] iteration={}, processing {} tool calls", iteration, tool_calls.len());

                    let mut approved_calls: Vec<(crate::plugins::ai_agent::provider::ToolCall, Value)> = Vec::new();
                    let mut denied_results: Vec<(crate::plugins::ai_agent::provider::ToolCall, String)> = Vec::new();

                    for tc in tool_calls {
                        let tool_name = &tc.function.name;
                        let args: Value = serde_json::from_str(&tc.function.arguments)
                            .unwrap_or(Value::Null);
                        let args_json = serde_json::to_string(&args).unwrap_or_default();

                        tracing::info!("[AgentEngine] tool_call: name={}, args_preview={}", tool_name, truncate_chars(&args_json, 200));
                        log("INFO", "tool_call", "requested",
                            &format!("tool={} args_preview={}", tool_name,
                                truncate_chars(&args_json, 200)));

                        // 从注册表获取工具实例（用于风险评估和权限描述）
                        let tool_arc = {
                            let tools_guard = self.tools.lock().await;
                            tools_guard.get(&tool_name).cloned()
                        };

                        let needs_confirm = {
                            let allowed_guard = self.always_allowed_tools.lock().await;
                            let risk = if let Some(ref tool) = tool_arc {
                                tool.risk_level(&args)
                            } else {
                                permission::ToolRiskLevel::High
                            };
                            permission::should_confirm(self.permission_mode, risk, &allowed_guard, &tool_name)
                        };

                        if needs_confirm {
                            tracing::info!("[AgentEngine] permission required for tool: {}", tool_name);
                            log("INFO", "tool_call", "permission_required",
                                &format!("tool={} mode={:?}", tool_name, self.permission_mode));
                            let risk = if let Some(ref tool) = tool_arc {
                                tool.risk_level(&args)
                            } else {
                                permission::ToolRiskLevel::High
                            };
                            let desc = if let Some(ref tool) = tool_arc {
                                tool.permission_description(&args)
                            } else {
                                permission::build_permission_description(&tool_name, &args)
                            };

                            let (approved, always_allow) = if let Some(ref requester) = self.permission_requester {
                                let req = PermissionRequest {
                                    conversation_id: String::new(),
                                    agent_id: self.agent_id.clone(),
                                    tool_name: tool_name.clone(),
                                    arguments: args.clone(),
                                    risk_level: risk,
                                    description: desc,
                                };
                                let result = requester(req).await;
                                tracing::info!("[AgentEngine] permission result for {}: approved={}, always_allow={}", tool_name, result.0, result.1);
                                log("INFO", "tool_call", "permission_result",
                                    &format!("tool={} approved={} always_allow={}", tool_name, result.0, result.1));
                                result
                            } else {
                                tracing::warn!("[AgentEngine] no permission_requester, denying tool: {}", tool_name);
                                (false, false)
                            };

                            if approved && always_allow {
                                let mut allowed = self.always_allowed_tools.lock().await;
                                if !allowed.contains(tool_name) {
                                    allowed.push(tool_name.clone());
                                }
                            }

                            if !approved {
                                tracing::warn!("[AgentEngine] tool '{}' denied by user", tool_name);
                                on_tool_call(ToolCallEvent {
                                    tool_name: tool_name.clone(),
                                    arguments: args.clone(),
                                    result: None,
                                    success: None,
                                    status: "running".to_string(),
                                    duration_ms: None,
                                });
                                let deny_msg = format!("Permission denied for tool '{}'. User did not approve this action.", tool_name);
                                on_tool_call(ToolCallEvent {
                                    tool_name: tool_name.clone(),
                                    arguments: Value::Null,
                                    result: Some(deny_msg.clone()),
                                    success: Some(false),
                                    status: "denied".to_string(),
                                    duration_ms: Some(0),
                                });
                                denied_results.push((tc.clone(), deny_msg));
                                continue;
                            }
                        }

                        approved_calls.push((tc.clone(), args));
                    }

                    for (tc, _) in &approved_calls {
                        on_tool_call(ToolCallEvent {
                            tool_name: tc.function.name.clone(),
                            arguments: serde_json::from_str(&tc.function.arguments).unwrap_or(Value::Null),
                            result: None,
                            success: None,
                            status: "running".to_string(),
                            duration_ms: None,
                        });
                    }

                    let mut tool_futures = Vec::new();
                    let tool_timeout = std::time::Duration::from_secs(self.tool_timeout_secs);
                    for (tc, args) in &approved_calls {
                        let tool_name = tc.function.name.clone();
                        let args = args.clone();
                        let tools = self.tools.lock().await;
                        let tool_arc = tools.get(&tool_name).cloned();
                        drop(tools);
                        let cancel_token = self.cancel_token.clone();
                        let tool_max_retries = self.tool_max_retries;
                        let tool_retry_base_delay = self.tool_retry_base_delay_ms;
                        tool_futures.push(async move {
                            // 记录开始时间
                            let start_time = std::time::Instant::now();

                            // 工具执行主体（含重试逻辑）
                            let execution = async {
                                match tool_arc {
                                    Some(tool) => {
                                        let mut attempt = 0u32;

                                        loop {
                                            attempt += 1;
                                            match tool.execute(args.clone()).await {
                                                Ok(output) => {
                                                    if attempt > 1 {
                                                        tracing::info!("[AgentEngine] tool '{}' succeeded on attempt {}/{}", tool_name, attempt, tool_max_retries + 1);
                                                    }
                                                    break output;
                                                }
                                                Err(e) => {
                                                    let err_msg = format!("{}", e);
                                                    let is_retryable = is_retryable_error(&err_msg);

                                                    if is_retryable && attempt <= tool_max_retries {
                                                        let delay_ms = tool_retry_base_delay * (1u64 << (attempt - 1));
                                                        tracing::warn!(
                                                            "[AgentEngine] tool '{}' failed (attempt {}/{}): {}, retrying in {}ms",
                                                            tool_name, attempt, tool_max_retries + 1,
                                                            truncate_chars(&err_msg, 120),
                                                            delay_ms
                                                        );

                                                        // 重试延迟支持取消
                                                        let cancelled = tokio::select! {
                                                            _ = tokio::time::sleep(std::time::Duration::from_millis(delay_ms)) => false,
                                                            _ = cancel_future(&cancel_token) => true,
                                                        };
                                                        if cancelled {
                                                            break ToolOutput {
                                                                success: false,
                                                                result: format!("Tool '{}' cancelled by user during retry (attempt {})", tool_name, attempt),
                                                                metadata: Value::Null,
                                                            };
                                                        }
                                                        continue;
                                                    } else {
                                                        let degraded = build_tool_error_message(&tool_name, &err_msg);
                                                        break ToolOutput {
                                                            success: false,
                                                            result: degraded,
                                                            metadata: Value::Null,
                                                        };
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    None => ToolOutput {
                                        success: false,
                                        result: format!("Tool '{}' is not available. Available tools may differ from what you expect. Try using a different tool or approach.", tool_name),
                                        metadata: Value::Null,
                                    }
                                }
                            };

                            // 三重保护：超时 + 取消信号 + 正常完成
                            let result = tokio::select! {
                                r = tokio::time::timeout(tool_timeout, execution) => {
                                    r.unwrap_or_else(|_| ToolOutput {
                                        success: false,
                                        result: format!("Tool '{}' timed out after {}s (global tool timeout). The operation took too long and was cancelled to prevent the agent from hanging. Try breaking the task into smaller steps.", tool_name, tool_timeout.as_secs()),
                                        metadata: Value::Null,
                                    })
                                }
                                _ = cancel_future(&cancel_token) => {
                                    tracing::info!("[AgentEngine] tool '{}' cancelled by user", tool_name);
                                    ToolOutput {
                                        success: false,
                                        result: format!("Tool '{}' cancelled by user.", tool_name),
                                        metadata: Value::Null,
                                    }
                                }
                            };

                            // 计算执行耗时
                            let duration_ms = start_time.elapsed().as_millis() as u64;

                            (tool_name, result, cancel_token, duration_ms)
                        });
                    }

                    // 工具执行中状态
                    (on_status_arc.as_ref())(AgentStatusEvent {
                        status: "tool_calling".to_string(),
                        iteration: iteration as u32,
                        max_iterations: self.max_iterations as u32,
                        detail: Some(format!("{} tool(s)", tool_calls.len())),
                        stream_stats: None,
                        context_usage: None,
                    });

                    let tool_results = futures::future::join_all(tool_futures).await;

                    for (tc, deny_msg) in &denied_results {
                        messages.push(crate::plugins::ai_agent::provider::ChatMessage {
                            role: "tool".to_string(),
                            content: deny_msg.clone(),
                            reasoning_content: None,
                            tool_calls: None,
                            tool_call_id: Some(tc.id.clone()),
                        });
                        if let Some(ref persister) = self.message_persister {
                            persister(PersistMessage {
                                role: "tool".to_string(),
                                content: deny_msg.clone(),
                                tool_calls: None,
                                tool_call_id: Some(tc.id.clone()),
                                is_error: true,
                            });
                        }
                    }

                    for (idx, (tool_name, tool_result, cancel_token, duration_ms)) in tool_results.iter().enumerate() {
                        let tc = &approved_calls[idx].0;
                        on_tool_call(ToolCallEvent {
                            tool_name: tool_name.clone(),
                            arguments: Value::Null,
                            result: Some(tool_result.result.clone()),
                            success: Some(tool_result.success),
                            status: "done".to_string(),
                            duration_ms: Some(*duration_ms),
                        });

                        tracing::info!("[AgentEngine] tool '{}' execution done, success={}, result_len={}", tool_name, tool_result.success, tool_result.result.len());
                        log(if tool_result.success { "INFO" } else { "ERROR" }, "tool_call", "exec_done",
                            &format!("tool={} success={} result_len={} result_preview={}",
                                tool_name, tool_result.success, tool_result.result.len(),
                                truncate_chars(&tool_result.result, 300)));

                        // 修复计划追踪：记录 terminal_session 工具的执行尝试
                        if self.repair_plan.is_some()
                            && (tool_name == "terminal_session" || tool_name == "terminal")
                            && !tool_result.success
                        {
                            self.record_failed_tool_attempt(tool_name, &tc.function.arguments, &tool_result.result);
                        }

                        if let Some(ref token) = cancel_token {
                            if token.is_cancelled() {
                                on_chunk("\n[Stopped by user]\n".to_string());
                                break 'outer Ok(last_assistant_content(&messages));
                            }
                        }

                        let tool_result_content = if tool_result.success {
                            tool_call_count += 1;
                            if tool_call_count == 1 {
                                format!("{}\n\n---\nAnalyze the above data and answer the user's question based on the actual results. Do NOT use your own knowledge to override the data.", tool_result.result)
                            } else {
                                tool_result.result.clone()
                            }
                        } else {
                            format!("Tool execution failed: {}\n\nIf this tool is not suitable, try a different approach or explain the limitation to the user.", tool_result.result)
                        };

                        messages.push(crate::plugins::ai_agent::provider::ChatMessage {
                            role: "tool".to_string(),
                            content: tool_result_content.clone(),
                            reasoning_content: None,
                            tool_calls: None,
                            tool_call_id: Some(tc.id.clone()),
                        });
                        if let Some(ref persister) = self.message_persister {
                            persister(PersistMessage {
                                role: "tool".to_string(),
                                content: tool_result_content,
                                tool_calls: None,
                                tool_call_id: Some(tc.id.clone()),
                                is_error: !tool_result.success,
                            });
                        }
                    }
                }
                _ => {
                    let has_tools = tools_opt.as_ref().map(|t| !t.is_empty()).unwrap_or(false);
                    let should_force_tool = has_tools
                        && iteration == 0
                        && self.system_prompt.contains("MUST call the corresponding tool")
                        && force_tool_attempts < 3;

                    if should_force_tool {
                        force_tool_attempts += 1;
                        tracing::warn!("[AgentEngine] forcing tool call at iteration {}, attempt {}", iteration, force_tool_attempts);
                        let tool_names: Vec<String> = tools_opt.as_ref()
                            .map(|defs| defs.iter().map(|d| d.function.name.clone()).collect())
                            .unwrap_or_default();
                        let reminder = format!(
                            "IMPORTANT: You did not call any tool in your previous response, but tools are available: {}. You MUST call one of these tools to get real data. Do NOT answer from your own knowledge. Please retry with a tool call.",
                            tool_names.join(", ")
                        );
                        messages.push(crate::plugins::ai_agent::provider::ChatMessage {
                            role: "user".to_string(),
                            content: reminder,
                            reasoning_content: None,
                            tool_calls: None,
                            tool_call_id: None,
                        });
                        iteration += 1;
                        continue;
                    }

                    // 自主任务模式：模型返回纯文本但未给出完成结论时，自动注入提醒继续驱动终端，
                    // 避免每一步都停下等用户点"继续"。受 MAX_AUTO_CONTINUE 与 max_iterations 双重兜底，不会死循环。
                    if self.auto_continue && auto_continue_count < MAX_AUTO_CONTINUE {
                        let last = response.content.clone().unwrap_or_default().to_lowercase();
                        let looks_done = last.contains("完成")
                            || last.contains("已完成")
                            || last.contains("修复完成")
                            || last.contains("done")
                            || last.contains("finished")
                            || last.contains("complete")
                            || last.contains("completed")
                            || last.contains("vnc is ready")
                            || last.contains("is ready")
                            || last.contains("已达到")
                            || last.contains("可以连接")
                            || last.contains("可连接")
                            // 环境修复：修复完成 / 一切正常
                            || last.contains("env_fix_status: fix_completed")
                            || last.contains("env_fix_status: all_good")
                            // 服务器环境安装：已就绪
                            || last.contains("srv_env_status: ready");
                        // 等待用户确认：检测到"检查结论标记"或模型在征询用户意见时，绝不自动续跑，
                        // 必须先交还用户（如远程桌面安装前的"是否安装"确认）。
                        // 词表覆盖中英文常见征询说法（英文环境下模型可能用 would you like / shall i 等）。
                        let awaiting_user = last.contains("rd_status:")
                            // 服务器环境安装状态标记（ready 除外，ready 归 looks_done）
                            || last.contains("srv_env_status: missing")
                            || last.contains("srv_env_status: partial")
                            // 环境修复状态标记（all_good / fix_completed 除外，归 looks_done）
                            || last.contains("env_fix_status: need_fix")
                            || last.contains("需要我")
                            || last.contains("要我")
                            || last.contains("是否")
                            || last.contains("请确认")
                            || last.contains("确认吗")
                            || last.contains("安装吗")
                            || last.contains("do you want")
                            || last.contains("would you like")
                            || last.contains("want me to")
                            || last.contains("shall i")
                            || last.contains("shall we")
                            || last.contains("may i")
                            || last.contains("should i")
                            || last.contains("proceed with")
                            || last.contains("ready to install")
                            || last.contains("do you agree")
                            || last.contains("please confirm");

                        // 智能续跑：根据上下文选择不同的续跑策略
                        if !looks_done && !awaiting_user {
                            auto_continue_count += 1;

                            // 检测当前状态，选择续跑提示
                            let nudge_message = self.determine_auto_continue_nudge(&last);

                            tracing::info!("[AgentEngine] auto-continue ({}/{}), strategy='{}'",
                                auto_continue_count, MAX_AUTO_CONTINUE,
                                truncate_chars(&nudge_message.0, 30));
                            on_chunk(format!("\n[auto-continue: {}]\n", nudge_message.0));

                            messages.push(crate::plugins::ai_agent::provider::ChatMessage {
                                role: "user".to_string(),
                                content: nudge_message.1,
                                reasoning_content: None,
                                tool_calls: None,
                                tool_call_id: None,
                            });
                            iteration += 1;
                            continue;
                        }
                    }

                    tracing::info!("[AgentEngine] loop completed at iteration {}, no more tool calls, total messages={}", iteration, messages.len());
                    break 'outer Ok(last_assistant_content(&messages));
                }
            }

            iteration += 1;
        };

        tracing::info!("[AgentEngine] run() finished, result is_ok={}", result.is_ok());
        log(if result.is_ok() { "INFO" } else { "ERROR" }, "agent_run", "end",
            &format!("success={} iterations={} final_content_preview={}",
                result.is_ok(), iteration,
                result.as_ref().map(|r| truncate_chars(r, 200)).unwrap_or("")));

        // 完成状态事件
        (on_status_arc.as_ref())(AgentStatusEvent {
            status: "done".to_string(),
            iteration: iteration as u32,
            max_iterations: self.max_iterations as u32,
            detail: Some(if result.is_ok() { "success" } else { "error" }.to_string()),
            stream_stats: None,
            context_usage: None,
        });

        // 自动摘要到记忆（异步执行，不阻塞主流程）
        if self.memory_auto_summary && result.is_ok() {
            let messages_clone = messages.clone();
            let tools_arc = self.tools.clone();
            let provider_clone = self.provider.clone();
            let model_clone = self.model.clone();
            let target_clone = self.memory_auto_summary_target.clone();
            let min_msgs = self.memory_auto_summary_min_messages;
            let agent_id_clone = self.agent_id.clone();

            tokio::spawn(async move {
                // 过滤掉 system 消息
                let non_system_msgs: Vec<_> = messages_clone.iter()
                    .filter(|m| m.role != "system" && m.role != "system_compaction")
                    .collect();

                if non_system_msgs.len() < min_msgs {
                    return;
                }

                // 获取 memory 工具
                let memory_tool = {
                    let tools = tools_arc.lock().await;
                    tools.get("memory").cloned()
                };

                if memory_tool.is_none() {
                    return;
                }

                tracing::info!("[AgentEngine::auto_summary] starting for agent={}, msgs={}",
                    agent_id_clone, non_system_msgs.len());

                // 构建摘要 prompt
                let mut conversation_text = String::new();
                for msg in &non_system_msgs {
                    let role_label = match msg.role.as_str() {
                        "user" => "User",
                        "assistant" => "Assistant",
                        "tool" => "Tool Output",
                        _ => msg.role.as_str(),
                    };
                    let content_preview = truncate_chars(&msg.content, 500);
                    conversation_text.push_str(&format!("{}: {}\n", role_label, content_preview));
                }

                let summary_prompt = format!(
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
                );

                let options = crate::plugins::ai_agent::provider::ChatOptions {
                    model: model_clone,
                    temperature: 0.3,
                    max_tokens: 800,
                    tools: None,
                    ..Default::default()
                };

                match provider_clone.chat(&[crate::plugins::ai_agent::provider::ChatMessage {
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
                                let params = serde_json::json!({
                                    "action": "save",
                                    "content": summary_trimmed,
                                    "target": target_clone,
                                });

                                if let Some(tool) = memory_tool {
                                    match tool.execute(params).await {
                                        Ok(output) => {
                                            if output.success {
                                                tracing::info!("[AgentEngine::auto_summary] saved to memory ({} chars)",
                                                    summary_trimmed.len());
                                            } else {
                                                tracing::warn!("[AgentEngine::auto_summary] save failed: {}", output.result);
                                            }
                                        }
                                        Err(e) => {
                                            tracing::warn!("[AgentEngine::auto_summary] tool error: {}", e);
                                        }
                                    }
                                }
                            }
                        }
                    }
                    Err(e) => {
                        tracing::warn!("[AgentEngine::auto_summary] generation failed: {}", e);
                    }
                }
            });
        }

        // 修复知识库自动学习（异步执行，不阻塞主流程）
        if let Some(kb) = self.repair_kb.clone() {
            if let Some(plan) = self.repair_plan.clone() {
                let agent_id_clone = self.agent_id.clone();
                tokio::spawn(async move {
                    Self::try_auto_learn_to_kb(&kb, &plan, &agent_id_clone).await;
                });
            }
        }

        // P2-7：run 结束时消费取消 token，确保同一个 engine 实例不能重复 run
        // 通过将 cancel_token take 出来并 drop，强制要求下次 run 前必须重新设置
        if let Some(token) = self.cancel_token.take() {
            // 正常结束不主动 cancel（由外部命令层管理 token 生命周期）
            // 只做 take，确保实例内一致性
            drop(token);
        }

        // 如果执行失败，发送 error 状态事件，确保前端能感知到错误
        if let Err(ref err_msg) = result {
            (on_status_arc.as_ref())(AgentStatusEvent {
                status: "error".to_string(),
                iteration: iteration as u32,
                max_iterations: self.max_iterations as u32,
                detail: Some(err_msg.clone()),
                stream_stats: None,
                context_usage: None,
            });
        }

        result.map(|content| RunResult {
            final_content: content,
            messages,
        })
    }


    /// 从 AI 输出文本中解析修复进度标记并更新修复计划
    fn update_repair_progress_from_text(&mut self, text: &str) {
        let events = crate::plugins::ai_agent::repair_plan::parse_step_progress(text);
        if events.is_empty() {
            return;
        }

        let plan = match self.repair_plan.as_mut() {
            Some(p) => p,
            None => return,
        };

        let mut changed = false;
        for event in &events {
            // 检查步骤是否已存在
            let step_exists = plan.steps.iter().any(|s| s.index == event.index);

            if !step_exists {
                // 动态添加步骤（AI 首次提到该步骤）
                use crate::plugins::ai_agent::repair_plan::{RepairStep, StepPriority};
                plan.add_step(RepairStep {
                    index: event.index,
                    service: event.service.clone(),
                    description: event.description.clone(),
                    priority: StepPriority::Medium,
                    status: event.status,
                    estimated_commands: Vec::new(),
                    requires_sudo: true,
                    failure_reason: if matches!(event.status, crate::plugins::ai_agent::repair_plan::StepStatus::Failed) {
                        Some(event.description.clone())
                    } else {
                        None
                    },
                    attempts: Vec::new(),
                    output_summary: None,
                });
                changed = true;
            } else {
                // 更新已有步骤状态
                let prev_status = plan.steps.iter()
                    .find(|s| s.index == event.index)
                    .map(|s| s.status);

                if prev_status != Some(event.status) {
                    plan.update_step_status(event.index, event.status);
                    if matches!(event.status, crate::plugins::ai_agent::repair_plan::StepStatus::Failed) {
                        plan.mark_step_failed(event.index, event.description.clone());
                    }
                    changed = true;
                }
            }
        }

        // 如果步骤总数变化了，更新 total
        if let Some(max_event) = events.iter().max_by_key(|e| e.total) {
            if max_event.total > 0 && max_event.total != plan.total_steps {
                // AI 报告的总数比我们追踪的多，说明还有未开始的步骤
                // 保持当前追踪的步骤数即可，不用强行对齐
            }
        }

        if changed {
            tracing::info!("[AgentEngine] repair progress: {}/{} steps ({} success, {} failed)",
                plan.completed_steps + plan.failed_steps,
                plan.total_steps,
                plan.completed_steps,
                plan.failed_steps);

            // 触发进度回调
            if let Some(ref callback) = self.repair_progress_callback {
                callback(plan.clone());
            }
        }
    }

    /// 记录一次失败的工具尝试到当前正在进行的修复步骤
    fn record_failed_tool_attempt(&mut self, tool_name: &str, args: &str, error: &str) {
        let plan = match self.repair_plan.as_mut() {
            Some(p) => p,
            None => return,
        };

        // 找到当前正在运行的步骤（status = Running）
        let running_step_idx = plan.steps.iter()
            .find(|s| matches!(s.status, crate::plugins::ai_agent::repair_plan::StepStatus::Running))
            .map(|s| s.index);

        let step_idx = match running_step_idx {
            Some(idx) => idx,
            None => {
                // 没有正在运行的步骤，找最近一个失败的步骤
                match plan.steps.iter().rfind(|s| matches!(s.status, crate::plugins::ai_agent::repair_plan::StepStatus::Failed)) {
                    Some(s) => s.index,
                    None => return,
                }
            }
        };

        // 从参数中提取命令
        let command = extract_command_from_args(tool_name, args);
        let method = format!("{} ({})", tool_name, truncate_chars(&command, 60));

        let attempt = crate::plugins::ai_agent::repair_plan::RepairAttempt {
            attempt_no: (plan.steps.iter()
                .find(|s| s.index == step_idx)
                .map(|s| s.attempts.len())
                .unwrap_or(0) as u32) + 1,
            method,
            command,
            success: false,
            error: Some(error.chars().take(500).collect()),
        };

        plan.add_attempt(step_idx, attempt);

        // 触发进度回调（如果有的话）
        if let Some(ref callback) = self.repair_progress_callback {
            callback(plan.clone());
        }
    }

    /// 根据当前状态智能选择 auto-continue 续跑提示
    /// 返回 (展示用标签, 发送给模型的完整提示)
    fn determine_auto_continue_nudge(&self, last_lower: &str) -> (String, String) {
        use crate::plugins::ai_agent::repair_plan::StepStatus;

        // 策略 1：环境修复中有步骤刚失败，建议换方法重试
        if let Some(ref plan) = self.repair_plan {
            let has_failed = plan.steps.iter().any(|s| matches!(s.status, StepStatus::Failed));
            let has_pending = plan.steps.iter().any(|s| matches!(s.status, StepStatus::Pending));
            let has_running = plan.steps.iter().any(|s| matches!(s.status, StepStatus::Running));

            if has_failed && !has_running {
                let failed_services: Vec<&str> = plan.steps.iter()
                    .filter(|s| matches!(s.status, StepStatus::Failed))
                    .map(|s| s.service.as_str())
                    .collect();

                let label = format!("retrying {} (new approach)", failed_services.join(", "));
                let message = format!(
                    "[System] Some repair steps failed: {}. Do NOT give up. Analyze the failure reason, then try a DIFFERENT approach for the failed service(s). \
                    For example:\n\
                    - If apt install failed, try fixing package sources first (apt update --fix-missing)\n\
                    - If service won't start, check the error log first (journalctl -u <service> or /var/log/)\n\
                    - If a config has wrong syntax, validate config before restarting\n\
                    Use the terminal_session tool with 'exec' action for reliable command execution with exit code. \
                    After fixing, mark the step as done with ENV_FIX_STEP.",
                    failed_services.join(", ")
                );
                return (label, message);
            }

            if has_pending && !has_running {
                let pending_count = plan.steps.iter()
                    .filter(|s| matches!(s.status, StepStatus::Pending))
                    .count();
                let label = format!("continuing with {} remaining steps", pending_count);
                let message = format!(
                    "[System] Repair is in progress. There are {} remaining steps. Continue with the next repair step. \
                    Start by outputting ENV_FIX_STEP: start <index>/<total> <service> <description>, \
                    then use terminal_session to execute the fix, then output ENV_FIX_STEP: done ... \
                    Use 'exec' action for reliable command execution.",
                    pending_count
                );
                return (label, message);
            }
        }

        // 策略 2：检测到安装相关输出但未完成 → 继续驱动终端
        if last_lower.contains("installing") || last_lower.contains("安装中")
            || last_lower.contains("downloading") || last_lower.contains("下载中")
            || last_lower.contains("processing") || last_lower.contains("setting up")
        {
            ("installation in progress, checking status".to_string(),
                "[System] Installation appears to be in progress. Continue by reading terminal output to check status. \
                 Use terminal_session with read_output action to see the latest output. \
                 If the command finished, verify the service is running, then proceed to the next step.".to_string())
        } else {
            // 默认策略：继续推进
            ("task not finished yet, resuming".to_string(),
                "[System] The task is NOT complete yet. Do NOT stop and do NOT end your turn with a plain-text summary. \
                 Continue calling the `terminal_session` tool: write the next command, then read_output to verify. \
                 Use 'exec' action for reliable single-command execution with exit code. \
                 Only output a final summary when everything is verified done.".to_string())
        }
    }

    fn truncate_messages(&self, messages: &[crate::plugins::ai_agent::provider::ChatMessage]) -> Vec<crate::plugins::ai_agent::provider::ChatMessage> {
        if messages.len() <= 3 {
            return messages.to_vec();
        }

        // 第一步：保留系统消息（始终保留第一条 system）
        let mut result = Vec::new();
        if let Some(first) = messages.first() {
            if first.role == "system" {
                result.push(first.clone());
            }
        }

        // 第二步：从尾部向前找一个安全的截断点
        // 安全截断点：在 assistant 消息之前（确保 tool_call/tool_msg 配对完整）
        let keep_count = (messages.len() / 2).max(6);
        let start_idx = messages.len().saturating_sub(keep_count);

        // 从 start_idx 向前找到最近的用户消息（作为对话轮次的边界）
        let mut safe_start = start_idx;
        for i in (1..=start_idx).rev() {
            if messages[i].role == "user" {
                safe_start = i;
                break;
            }
        }

        // 第三步：收集消息，同时确保 tool_call ↔ tool_msg 配对完整
        let mut pending_tool_calls: std::collections::HashSet<String> = std::collections::HashSet::new();
        let mut temp_messages = Vec::new();

        for msg in messages.iter().skip(safe_start) {
            // 跳过重复的 system 消息
            if msg.role == "system" && result.first().map_or(false, |f| f.role == "system") {
                continue;
            }

            // 追踪 tool_call 配对状态
            if msg.role == "assistant" {
                if let Some(tcs) = &msg.tool_calls {
                    for tc in tcs {
                        pending_tool_calls.insert(tc.id.clone());
                    }
                }
            }
            if msg.role == "tool" {
                if let Some(tcid) = &msg.tool_call_id {
                    pending_tool_calls.remove(tcid);
                }
            }

            temp_messages.push(msg.clone());
        }

        // 如果有未配对的 tool 消息（孤儿），且数量较多，回退到更保守的截断
        if pending_tool_calls.len() > 2 {
            // 从尾部找更多消息，直到所有 tool_call 都配对
            // 简化处理：再多保留 10 条消息
            let extra_start = safe_start.saturating_sub(10).max(1);
            temp_messages.clear();
            pending_tool_calls.clear();

            for msg in messages.iter().skip(extra_start) {
                if msg.role == "system" && result.first().map_or(false, |f| f.role == "system") {
                    continue;
                }
                if msg.role == "assistant" {
                    if let Some(tcs) = &msg.tool_calls {
                        for tc in tcs {
                            pending_tool_calls.insert(tc.id.clone());
                        }
                    }
                }
                if msg.role == "tool" {
                    if let Some(tcid) = &msg.tool_call_id {
                        pending_tool_calls.remove(tcid);
                    }
                }
                temp_messages.push(msg.clone());
            }
        }

        result.extend(temp_messages);
        result
    }

}
