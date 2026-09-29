#![allow(dead_code)]

use crate::plugins::ai_agent::provider::ChatMessage;

use super::super::types::AgentStatusEvent;
use super::super::util::truncate_chars;
use super::super::AgentEngine;
use super::context::RunCtx;

impl AgentEngine {
    /// run 收尾：状态事件、自动摘要到记忆、修复知识库学习、取消 token 消费。
    pub(super) async fn finalize_run<O>(
        &mut self,
        result: &Result<String, String>,
        messages: &[ChatMessage],
        iteration: i32,
        on_status: &O,
        ctx: &RunCtx<'_>,
    ) where
        O: Fn(AgentStatusEvent),
    {
        tracing::info!("[AgentEngine] run() finished, result is_ok={}", result.is_ok());
        ctx.log(if result.is_ok() { "INFO" } else { "ERROR" }, "agent_run", "end",
            &format!("success={} iterations={} final_content_preview={}",
                result.is_ok(), iteration,
                result.as_ref().map(|r| truncate_chars(r, 200)).unwrap_or("")));

        // 完成状态事件
        on_status(AgentStatusEvent {
            status: "done".to_string(),
            iteration: iteration as u32,
            max_iterations: self.max_iterations as u32,
            detail: Some(if result.is_ok() { "success" } else { "error" }.to_string()),
            stream_stats: None,
            context_usage: None,
        });

        // 自动摘要到记忆（异步执行，不阻塞主流程）
        if self.memory_auto_summary && result.is_ok() {
            let messages_clone = messages.to_vec();
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
            on_status(AgentStatusEvent {
                status: "error".to_string(),
                iteration: iteration as u32,
                max_iterations: self.max_iterations as u32,
                detail: Some(err_msg.clone()),
                stream_stats: None,
                context_usage: None,
            });
        }
    }
}