#![allow(dead_code)]

use std::sync::Arc;

use super::AgentEngine;

use super::types::{ErrorKind};
use super::util::{MAX_PROVIDER_RETRIES, PROVIDER_RETRY_BASE_DELAY_MS, truncate_chars};

impl AgentEngine {
    pub(super) async fn try_fallback(
        &self,
        messages: &[crate::plugins::ai_agent::provider::ChatMessage],
        options: &crate::plugins::ai_agent::provider::ChatOptions,
        on_chunk: &impl Fn(String),
        original_error: &str,
    ) -> Result<crate::plugins::ai_agent::provider::ChatResponse, String> {
        // 判断是否可以 fallback
        if !Self::is_fallback_eligible(original_error) {
            return Err(original_error.to_string());
        }

        if let (Some(ref fallback_provider), Some(ref fallback_model)) = (&self.fallback_provider, &self.fallback_model) {
            let error_preview = original_error.chars().take(80).collect::<String>();
            on_chunk(format!("[Primary provider error ({}), trying fallback model: {}]\n", error_preview, fallback_model));

            // 根据错误类型智能调整 fallback 参数
            let error_kind = Self::classify_error(original_error);

            let (fallback_max_tokens, fallback_temperature, base_retry_delay_ms) = match error_kind {
                ErrorKind::ContextLimit => {
                    // 上下文超限：大幅降低输出 token，降低 temperature（更聚焦）
                    let reduced = (options.max_tokens * 2 / 5).max(256);
                    let temp = (options.temperature * 0.7).max(0.1);
                    tracing::info!("[AgentEngine] context limit error: reducing max_tokens {}→{}, temp {:.2}→{:.2}",
                        options.max_tokens, reduced, options.temperature, temp);
                    (reduced, temp, 0u64)
                }
                ErrorKind::RateLimit => {
                    // 速率限制：保持参数，增加重试延迟
                    tracing::info!("[AgentEngine] rate limit error: using longer retry delays");
                    (options.max_tokens, options.temperature, 2000u64)
                }
                ErrorKind::ServerError => {
                    // 服务端错误：略降 temperature，中等重试延迟
                    let temp = (options.temperature * 0.9).max(0.1);
                    (options.max_tokens, temp, 1000u64)
                }
                ErrorKind::NetworkError => {
                    // 网络错误：保持参数，短延迟重试
                    (options.max_tokens, options.temperature, 500u64)
                }
                ErrorKind::Other => {
                    (options.max_tokens, options.temperature, 500u64)
                }
            };

            let fallback_options = crate::plugins::ai_agent::provider::ChatOptions {
                model: fallback_model.clone(),
                temperature: fallback_temperature,
                max_tokens: fallback_max_tokens,
                tools: options.tools.clone(),
                ..Default::default()
            };

            // Fallback 也带重试 + 指数退避
            let mut last_error = String::new();
            for attempt in 0..=MAX_PROVIDER_RETRIES {
                match self.chat_stream_collect_with_provider(fallback_provider, messages, &fallback_options, on_chunk).await {
                    Ok(r) => return Ok(r),
                    Err(e) => {
                        last_error = e.clone();
                        let is_retryable = Self::is_retryable_error(&e);
                        if !is_retryable || attempt >= MAX_PROVIDER_RETRIES {
                            break;
                        }
                        // 指数退避：base_delay * 2^attempt
                        let wait_ms = base_retry_delay_ms * (1u64 << attempt.min(5));
                        tracing::warn!("[AgentEngine] fallback attempt {}/{} failed, retrying in {}ms: {}",
                            attempt + 1, MAX_PROVIDER_RETRIES + 1, wait_ms, truncate_chars(&e, 100));
                        tokio::time::sleep(std::time::Duration::from_millis(wait_ms)).await;
                    }
                }
            }
            Err(format!("Fallback model '{}' also failed: {}", fallback_model, last_error))
        } else {
            Err(original_error.to_string())
        }
    }

    /// 判断错误是否可以触发 fallback
    fn is_fallback_eligible(error: &str) -> bool {
        // 服务端错误
        error.contains("429") || error.contains("500") || error.contains("502")
        || error.contains("503") || error.contains("504")
        // 上下文超限
        || error.contains("context_length_exceeded") || error.contains("max_tokens")
        || error.contains("too many tokens") || error.contains("token limit")
        // 网络问题
        || error.contains("timeout") || error.contains("connection")
        || error.contains("network") || error.contains("dns")
        // 速率限制
        || error.contains("rate limit") || error.contains("rate_limit")
        || error.contains("too many requests")
    }

    /// 错误类型分类，用于智能调节参数和重试策略
    fn classify_error(error: &str) -> ErrorKind {
        let lower = error.to_lowercase();
        if lower.contains("context_length_exceeded")
            || lower.contains("max_tokens")
            || lower.contains("too many tokens")
            || lower.contains("token limit")
            || lower.contains("context length")
        {
            ErrorKind::ContextLimit
        } else if lower.contains("rate limit")
            || lower.contains("rate_limit")
            || lower.contains("too many requests")
            || lower.contains("429")
        {
            ErrorKind::RateLimit
        } else if lower.contains("500")
            || lower.contains("502")
            || lower.contains("503")
            || lower.contains("504")
            || lower.contains("server error")
            || lower.contains("internal error")
        {
            ErrorKind::ServerError
        } else if lower.contains("timeout")
            || lower.contains("connection")
            || lower.contains("network")
            || lower.contains("dns")
            || lower.contains("econnrefused")
            || lower.contains("econnreset")
            || lower.contains("broken pipe")
        {
            ErrorKind::NetworkError
        } else {
            ErrorKind::Other
        }
    }

    /// 判断错误是否可以重试（同模型重试）
    /// 只有服务端临时性错误才可重试：
    /// - 429 / rate limit（速率限制）
    /// - 500 / 502 / 503（服务端临时故障）
    /// 以下错误不可重试：
    /// - 模型加载超时（stream timeout / no data received）— 重试没有意义
    /// - 普通 timeout / connection 错误 — 本地模型连接错误通常是服务没启动
    fn is_retryable_error(error: &str) -> bool {
        let lower = error.to_lowercase();

        // 模型加载超时绝对不可重试（重试只会让用户等待更久）
        if lower.contains("stream timeout")
            || lower.contains("no data received within")
            || lower.contains("模型加载超时")
        {
            return false;
        }

        // 服务端临时性错误可以重试
        lower.contains("429")
            || lower.contains("500")
            || lower.contains("502")
            || lower.contains("503")
            || lower.contains("rate limit")
            || lower.contains("rate_limit")
            || lower.contains("too many requests")
            || lower.contains("service unavailable")
            || lower.contains("bad gateway")
    }


    pub(super) async fn chat_stream_with_retry(
        &self,
        messages: &[crate::plugins::ai_agent::provider::ChatMessage],
        options: &crate::plugins::ai_agent::provider::ChatOptions,
        on_chunk: &impl Fn(String),
    ) -> Result<crate::plugins::ai_agent::provider::ChatResponse, String> {
        // 防御性清理：移除函数名为空的 tool_calls，避免 API 400 错误。
        // 部分模型（如 DeepSeek 流式）可能生成不完整的 tool_call，持久化后下一轮请求会触发：
        //   messages[N].tool_calls[0].function missing required field "name"
        let mut sanitized_msgs = messages.to_vec();
        let removed = Self::sanitize_messages(&mut sanitized_msgs);
        if removed > 0 {
            tracing::warn!(
                "[AgentEngine] sanitized {} invalid tool_call(s) with empty function.name before API call",
                removed
            );
        }

        let mut last_error = String::new();
        for attempt in 0..=MAX_PROVIDER_RETRIES {
            match self.chat_stream_collect(&sanitized_msgs, options, on_chunk).await {
                Ok(r) => return Ok(r),
                Err(e) => {
                    last_error = e.clone();
                    let is_retryable = Self::is_retryable_error(&e);
                    if !is_retryable || attempt >= MAX_PROVIDER_RETRIES {
                        return Err(last_error);
                    }
                    let delay = PROVIDER_RETRY_BASE_DELAY_MS * 2u64.pow(attempt as u32);
                    on_chunk(format!("[Provider error, retrying in {}ms (attempt {}/{})]\n", delay, attempt + 1, MAX_PROVIDER_RETRIES));
                    tokio::time::sleep(std::time::Duration::from_millis(delay)).await;
                }
            }
        }
        Err(last_error)
    }

    async fn chat_stream_collect(
        &self,
        messages: &[crate::plugins::ai_agent::provider::ChatMessage],
        options: &crate::plugins::ai_agent::provider::ChatOptions,
        on_chunk: &impl Fn(String),
    ) -> Result<crate::plugins::ai_agent::provider::ChatResponse, String> {
        self.chat_stream_collect_with_provider(&self.provider, messages, options, on_chunk).await
    }

    async fn chat_stream_collect_with_provider(
        &self,
        provider: &Arc<dyn crate::plugins::ai_agent::provider::LlmProvider>,
        messages: &[crate::plugins::ai_agent::provider::ChatMessage],
        options: &crate::plugins::ai_agent::provider::ChatOptions,
        on_chunk: &impl Fn(String),
    ) -> Result<crate::plugins::ai_agent::provider::ChatResponse, String> {
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<String>();
        let tx_clone = tx.clone();
        let on_chunk_forwarder: Arc<dyn Fn(crate::plugins::ai_agent::provider::ChatChunk) + Send + Sync> = Arc::new(move |chunk: crate::plugins::ai_agent::provider::ChatChunk| {
            // 转发文本内容增量（无前缀，保持向后兼容）
            if let Some(content) = &chunk.content {
                if !content.is_empty() {
                    let _ = tx.send(content.clone());
                }
            }
            // 转发工具调用增量（\x02 前缀 + JSON）
            if let Some(tool_calls) = &chunk.tool_calls {
                if !tool_calls.is_empty() {
                    if let Ok(json) = serde_json::to_string(tool_calls) {
                        let _ = tx.send(format!("\x02{}", json));
                    }
                }
            }
            // 转发思考过程增量（\x04 前缀 + 文本）
            if let Some(reasoning) = &chunk.reasoning_content {
                if !reasoning.is_empty() {
                    let _ = tx.send(format!("\x04{}", reasoning));
                }
            }
            // 转发完成原因（\x03 前缀 + reason）
            if let Some(finish_reason) = &chunk.finish_reason {
                let _ = tx.send(format!("\x03{}", finish_reason));
            }
        });

        let provider_clone = provider.clone();
        let messages_clone = messages.to_vec();
        let options_clone = options.clone();
        let model_name = options.model.clone();

        let mut handle = tokio::spawn(async move {
            let result = provider_clone.chat_stream_realtime(&messages_clone, &options_clone, on_chunk_forwarder).await;
            // 显式 drop tx_clone，确保接收端能及时感知流结束
            // （on_chunk_forwarder 内部的 tx 也会在此时随 Arc 一起 drop）
            drop(tx_clone);
            result
        });

        let mut chunk_count: u64 = 0;
        let mut last_chunk_time = std::time::Instant::now();

        loop {
            tokio::select! {
                // 正常接收流式数据
                maybe_chunk = rx.recv() => {
                    match maybe_chunk {
                        Some(content) => {
                            on_chunk(content);
                            chunk_count += 1;
                            last_chunk_time = std::time::Instant::now();
                        }
                        None => {
                            // Channel 已关闭，流结束
                            tracing::debug!("[chat_stream] channel closed, total chunks={}, model={}", chunk_count, model_name);
                            break;
                        }
                    }
                }
                // 检查后台任务是否已完成（处理异常提前退出的情况）
                join_result = &mut handle => {
                    match join_result {
                        Ok(Ok(response)) => {
                            tracing::debug!("[chat_stream] task finished early, content_len={}, model={}",
                                response.content.as_ref().map(|c| c.len()).unwrap_or(0), model_name);
                            // 任务已完成，继续 drain channel 中剩余的 chunk
                            while let Some(content) = rx.recv().await {
                                on_chunk(content);
                                chunk_count += 1;
                            }
                            return Ok(response);
                        }
                        Ok(Err(e)) => {
                            tracing::error!("[chat_stream] task failed: {}, model={}, chunks_received={}", e, model_name, chunk_count);
                            // 即使出错，也把已收到的 chunk 传递出去
                            while let Some(content) = rx.recv().await {
                                on_chunk(content);
                                chunk_count += 1;
                            }
                            return Err(e);
                        }
                        Err(join_err) => {
                            tracing::error!("[chat_stream] task panicked/aborted: {}, model={}, chunks_received={}", join_err, model_name, chunk_count);
                            // 同样 drain 剩余 chunk
                            while let Ok(content) = rx.try_recv() {
                                on_chunk(content);
                                chunk_count += 1;
                            }
                            return Err(format!("Stream task crashed: {}", join_err));
                        }
                    }
                }
                // 空闲超时保护：如果长时间没有收到 chunk，检查任务是否还活着
                // 这个超时只作为兜底，provider 内部已有更精细的超时控制
                _ = tokio::time::sleep(std::time::Duration::from_secs(600)) => {
                    let elapsed = last_chunk_time.elapsed();
                    if elapsed.as_secs() > 600 && chunk_count == 0 {
                        tracing::error!("[chat_stream] no data received for 600s, aborting. model={}", model_name);
                        handle.abort();
                        return Err(format!(
                            "Stream timeout: no data received within 600s. Model={} may be unresponsive.",
                            model_name
                        ));
                    }
                }
            }
        }

        // Channel 正常关闭，等待任务返回最终结果
        match handle.await {
            Ok(Ok(response)) => {
                tracing::info!("[chat_stream] completed successfully, total_chunks={}, content_len={}, model={}",
                    chunk_count, response.content.as_ref().map(|c| c.len()).unwrap_or(0), model_name);
                Ok(response)
            }
            Ok(Err(e)) => {
                tracing::error!("[chat_stream] completed with error: {}, model={}", e, model_name);
                Err(e)
            }
            Err(join_err) => {
                tracing::error!("[chat_stream] task join error: {}, model={}", join_err, model_name);
                Err(format!("Stream task crashed: {}", join_err))
            }
        }
    }
}
