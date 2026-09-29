#![allow(dead_code)]

use std::sync::atomic::Ordering;
use std::sync::Arc;

use crate::plugins::ai_agent::provider::{ChatMessage, ChatOptions};

use super::types::{AgentStatusEvent, PersistMessage, RunResult, ToolCallEvent};
use super::util::{estimate_messages_tokens, last_assistant_content, truncate_chars};
use super::AgentEngine;

mod auto_continue;
mod context;
mod finalize;
mod llm_call;
mod preflight;
mod repair;
mod stream_stats;
mod tool_phase;
mod truncate;

use context::RunCtx;

impl AgentEngine {
    pub async fn run(
        &mut self,
        user_message: &str,
        history: Vec<ChatMessage>,
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
        let ctx = RunCtx::new(&run_id, is_env_ops);

        tracing::info!("[AgentEngine] run() called, agent_id={}, message_len={}, history_count={}", self.agent_id, user_message.len(), history.len());
        ctx.log("INFO", "agent_run", "start",
            &format!("agent_id={} model={} temperature={} max_iterations={} history_msgs={} msg_len={}",
                self.agent_id, self.model, self.temperature, self.max_iterations,
                history.len(), user_message.len()));
        tracing::debug!("[AgentEngine] user_message preview: {}...", truncate_chars(user_message, 200));
        ctx.log("INFO", "agent_run", "user_msg_preview",
            truncate_chars(user_message, 300));

        // 装配初始消息（system + history + user），必要时执行摘要压缩
        let mut messages = self.build_initial_messages(user_message, history, &on_chunk, &ctx).await;

        let tool_defs = {
            let tools = self.tools.lock().await;
            tools.list_definitions()
        };

        let tools_opt = if tool_defs.is_empty() { None } else { Some(tool_defs) };

        let mut iteration = 0;
        let mut force_tool_attempts = 0;
        let mut tool_call_count: usize = 0;
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

            let options = ChatOptions {
                model: self.model.clone(),
                temperature: self.temperature,
                max_tokens: self.max_tokens,
                tools: tools_opt.clone(),
                ..Default::default()
            };

            tracing::info!("[AgentEngine] iteration={}, calling chat_stream_with_retry, model={}", iteration, self.model);
            ctx.log("INFO", "llm_call", "start",
                &format!("iteration={} model={} messages={} estimated_tokens={}",
                    iteration, self.model, messages.len(), estimate_messages_tokens(&messages)));

            // 流式统计：包装 on_chunk 以跟踪字符数和速率
            let ticker = self.spawn_stream_stats(on_status_arc.clone(), iteration as u32);
            let stream_chars_clone = ticker.chars.clone();
            let on_chunk_wrapped = |chunk: String| {
                stream_chars_clone.fetch_add(chunk.chars().count(), Ordering::Relaxed);
                on_chunk(chunk);
            };

            let response = match self.chat_stream_with_retry(&messages, &options, &on_chunk_wrapped).await {
                Ok(r) => {
                    tracing::info!("[AgentEngine] chat_stream_with_retry ok, content_len={}, tool_calls={}", r.content.as_ref().map(|c| c.len()).unwrap_or(0), r.tool_calls.as_ref().map(|tc| tc.len()).unwrap_or(0));
                    ctx.log("INFO", "llm_call", "response",
                        &format!("iteration={} content_len={} tool_calls={} content_preview={}",
                            iteration, r.content.as_ref().map(|c| c.len()).unwrap_or(0),
                            r.tool_calls.as_ref().map(|tc| tc.len()).unwrap_or(0),
                            &r.content.as_ref().map(|c| truncate_chars(c, 200)).unwrap_or("")));
                    r
                }
                Err(e) => {
                    match self.recover_from_llm_error(e, &mut messages, &options, &on_chunk, &ctx, iteration).await {
                        Ok(r) => r,
                        Err(fe) => {
                            ticker.handle.abort();
                            return Err(fe);
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
            let mut response_tool_calls = response.tool_calls.clone();
            self.repair_empty_tool_names(&mut response_tool_calls).await;

            let assistant_msg = ChatMessage {
                role: "assistant".to_string(),
                content: response.content.clone().unwrap_or_default(),
                reasoning_content: None,
                tool_calls: response_tool_calls.clone(),
                tool_call_id: None,
            };

            // 停止流式速率统计
            ticker.handle.abort();

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

                    let (approved_calls, denied_results) =
                        self.resolve_tool_permissions(tool_calls, &on_tool_call, &ctx).await;

                    let cancelled = self.execute_approved_tools(
                        &approved_calls,
                        &denied_results,
                        &on_tool_call,
                        on_status_arc.as_ref(),
                        iteration as u32,
                        &ctx,
                        &mut messages,
                        &mut tool_call_count,
                    ).await;

                    if cancelled {
                        on_chunk("\n[Stopped by user]\n".to_string());
                        break 'outer Ok(last_assistant_content(&messages));
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
                        messages.push(ChatMessage {
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
                        let (looks_done, awaiting_user) = Self::classify_completion(&last);

                        // 智能续跑：根据上下文选择不同的续跑策略
                        if !looks_done && !awaiting_user {
                            auto_continue_count += 1;

                            // 检测当前状态，选择续跑提示
                            let nudge_message = self.determine_auto_continue_nudge(&last);

                            tracing::info!("[AgentEngine] auto-continue ({}/{}), strategy='{}'",
                                auto_continue_count, MAX_AUTO_CONTINUE,
                                truncate_chars(&nudge_message.0, 30));
                            on_chunk(format!("\n[auto-continue: {}]\n", nudge_message.0));

                            messages.push(ChatMessage {
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

        // 收尾：状态事件 + 自动摘要 + 知识库学习 + 取消 token 消费
        self.finalize_run(&result, &messages, iteration, on_status_arc.as_ref(), &ctx).await;

        result.map(|content| RunResult {
            final_content: content,
            messages,
        })
    }
}