#![allow(dead_code)]

use crate::plugins::ai_agent::provider::{ChatMessage, ChatOptions, ChatResponse};

use super::super::util::{compact_messages, truncate_chars};
use super::super::AgentEngine;
use super::context::RunCtx;

impl AgentEngine {
    /// LLM 调用失败后的恢复流程：上下文超限时渐进压缩/截断，其余错误尝试 fallback 模型。
    /// 成功返回新的响应；失败返回最终错误（由调用方负责中止流式统计任务）。
    pub(super) async fn recover_from_llm_error<F: Fn(String)>(
        &self,
        err: String,
        messages: &mut Vec<ChatMessage>,
        options: &ChatOptions,
        on_chunk: &F,
        ctx: &RunCtx<'_>,
        iteration: i32,
    ) -> Result<ChatResponse, String> {
        let e = err;
        tracing::error!("[AgentEngine] chat_stream_with_retry failed at iteration {}: {}", iteration, truncate_chars(&e, 200));
        ctx.log("ERROR", "llm_call", "failed",
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
            let mut truncate_result: Option<ChatResponse> = None;
            loop {
                let truncated = self.truncate_messages(&current_messages);
                if truncated.len() >= current_messages.len() || truncated.len() <= 4 {
                    // 无法再截断了
                    break;
                }
                current_messages = truncated;
                attempt += 1;
                tracing::info!("[AgentEngine] truncation attempt {}: {} messages", attempt, current_messages.len());

                match self.chat_stream_with_retry(&current_messages, options, on_chunk).await {
                    Ok(r) => {
                        if attempt > 1 {
                            on_chunk(format!("[History compressed to {} messages]\n", current_messages.len()));
                        }
                        // 截断成功，更新 messages 并保存结果
                        *messages = current_messages.clone();
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
                Ok(r)
            } else {
                // 最后尝试 fallback 模型
                tracing::warn!("[AgentEngine] truncation not enough, trying fallback model");
                let retried = self.try_fallback(&current_messages, options, on_chunk, &last_error).await;
                match retried {
                    Ok(r) => {
                        on_chunk("[Switched to fallback model after compression]\n".to_string());
                        Ok(r)
                    }
                    Err(fe) => {
                        tracing::error!("[AgentEngine] fallback also failed after compression: {}", fe);
                        on_chunk(format!("[Provider error after compression: {}]\n", fe));
                        Err(fe)
                    }
                }
            }
        } else {
            let retried = self.try_fallback(messages, options, on_chunk, &e).await;
            match retried {
                Ok(r) => {
                    on_chunk("[Switched to fallback model]\n".to_string());
                    Ok(r)
                }
                Err(fallback_err) => {
                    on_chunk(format!("[Provider error: {}]\n", fallback_err));
                    Err(fallback_err)
                }
            }
        }
    }
}