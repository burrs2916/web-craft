#![allow(dead_code)]

use crate::plugins::ai_agent::permission;
use crate::plugins::ai_agent::permission::PermissionRequest;
use crate::plugins::ai_agent::provider::{ChatMessage, ToolCall};
use serde_json::Value;

use super::super::types::{AgentStatusEvent, PersistMessage, ToolCallEvent, ToolOutput};
use super::super::util::{
    build_tool_error_message, cancel_future, is_retryable_error, truncate_chars,
};
use super::super::AgentEngine;
use super::context::RunCtx;

impl AgentEngine {
    /// 修复部分模型流式响应省略 function.name 的问题：能推断则补全，无法推断则丢弃该 tool_call。
    pub(super) async fn repair_empty_tool_names(&self, tool_calls: &mut Option<Vec<ToolCall>>) {
        if let Some(tcs) = tool_calls {
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
    }

    /// 逐条评估工具调用的风险并按权限策略确认，返回 (已批准调用, 被拒绝结果)。
    pub(super) async fn resolve_tool_permissions<F: Fn(ToolCallEvent)>(
        &self,
        tool_calls: &[ToolCall],
        on_tool_call: &F,
        ctx: &RunCtx<'_>,
    ) -> (Vec<(ToolCall, Value)>, Vec<(ToolCall, String)>) {
        let mut approved_calls: Vec<(ToolCall, Value)> = Vec::new();
        let mut denied_results: Vec<(ToolCall, String)> = Vec::new();

        for tc in tool_calls {
            let tool_name = &tc.function.name;
            let args: Value = serde_json::from_str(&tc.function.arguments)
                .unwrap_or(Value::Null);
            let args_json = serde_json::to_string(&args).unwrap_or_default();

            tracing::info!("[AgentEngine] tool_call: name={}, args_preview={}", tool_name, truncate_chars(&args_json, 200));
            ctx.log("INFO", "tool_call", "requested",
                &format!("tool={} args_preview={}", tool_name,
                    truncate_chars(&args_json, 200)));

            // 从注册表获取工具实例（用于风险评估和权限描述）
            let tool_arc = {
                let tools_guard = self.tools.lock().await;
                tools_guard.get(tool_name).cloned()
            };

            let needs_confirm = {
                let allowed_guard = self.always_allowed_tools.lock().await;
                let risk = if let Some(ref tool) = tool_arc {
                    tool.risk_level(&args)
                } else {
                    permission::ToolRiskLevel::High
                };
                permission::should_confirm(self.permission_mode, risk, &allowed_guard, tool_name)
            };

            if needs_confirm {
                tracing::info!("[AgentEngine] permission required for tool: {}", tool_name);
                ctx.log("INFO", "tool_call", "permission_required",
                    &format!("tool={} mode={:?}", tool_name, self.permission_mode));
                let risk = if let Some(ref tool) = tool_arc {
                    tool.risk_level(&args)
                } else {
                    permission::ToolRiskLevel::High
                };
                let desc = if let Some(ref tool) = tool_arc {
                    tool.permission_description(&args)
                } else {
                    permission::build_permission_description(tool_name, &args)
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
                    ctx.log("INFO", "tool_call", "permission_result",
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

        (approved_calls, denied_results)
    }

    /// 并发执行已批准的工具调用，并把结果（含被拒绝的）写回消息历史。
    /// 返回 true 表示执行过程中被用户取消。
    pub(super) async fn execute_approved_tools<F, O>(
        &mut self,
        approved_calls: &[(ToolCall, Value)],
        denied_results: &[(ToolCall, String)],
        on_tool_call: &F,
        on_status: &O,
        iteration: u32,
        ctx: &RunCtx<'_>,
        messages: &mut Vec<ChatMessage>,
        tool_call_count: &mut usize,
    ) -> bool
    where
        F: Fn(ToolCallEvent),
        O: Fn(AgentStatusEvent),
    {
        for (tc, _) in approved_calls {
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
        for (tc, args) in approved_calls {
            let tool_name = tc.function.name.clone();
            let args = args.clone();
            let tool_arc = {
                let tools = self.tools.lock().await;
                tools.get(&tool_name).cloned()
            };
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
        on_status(AgentStatusEvent {
            status: "tool_calling".to_string(),
            iteration,
            max_iterations: self.max_iterations as u32,
            detail: Some(format!("{} tool(s)", approved_calls.len() + denied_results.len())),
            stream_stats: None,
            context_usage: None,
        });

        let tool_results = futures::future::join_all(tool_futures).await;

        for (tc, deny_msg) in denied_results {
            messages.push(ChatMessage {
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

        let mut cancelled = false;
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
            ctx.log(if tool_result.success { "INFO" } else { "ERROR" }, "tool_call", "exec_done",
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
                    cancelled = true;
                    break;
                }
            }

            let tool_result_content = if tool_result.success {
                *tool_call_count += 1;
                if *tool_call_count == 1 {
                    format!("{}\n\n---\nAnalyze the above data and answer the user's question based on the actual results. Do NOT use your own knowledge to override the data.", tool_result.result)
                } else {
                    tool_result.result.clone()
                }
            } else {
                format!("Tool execution failed: {}\n\nIf this tool is not suitable, try a different approach or explain the limitation to the user.", tool_result.result)
            };

            messages.push(ChatMessage {
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

        cancelled
    }
}