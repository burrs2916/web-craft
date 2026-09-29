#![allow(dead_code)]

use crate::plugins::ai_agent::provider::ChatMessage;

use super::super::types::PersistMessage;
use super::super::util::{
    compact_messages, estimate_messages_tokens, should_compact, validate_compacted_messages,
    CompactionConfig,
};
use super::super::AgentEngine;
use super::context::RunCtx;

impl AgentEngine {
    /// 装配初始消息（system + history + user），并在超出阈值时执行 LLM 摘要压缩。
    pub(super) async fn build_initial_messages<F: Fn(String)>(
        &self,
        user_message: &str,
        history: Vec<ChatMessage>,
        on_chunk: &F,
        ctx: &RunCtx<'_>,
    ) -> Vec<ChatMessage> {
        let mut messages: Vec<ChatMessage> = Vec::new();

        messages.push(ChatMessage {
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

        messages.push(ChatMessage {
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
            ctx.log("WARN", "agent_run", "compaction_triggered",
                &format!("estimated_tokens={} threshold={} current_msgs={}",
                    estimate_messages_tokens(&messages), compaction_config.max_estimated_tokens, messages.len()));
            on_chunk("[Auto-compacting conversation history...]\n".to_string());
            match compact_messages(&self.provider, &messages, &compaction_config, &self.model).await {
                Ok((compacted, summary)) => {
                    let removed = messages.len().saturating_sub(compacted.len());
                    tracing::info!("[AgentEngine] compaction ok, removed={}, remaining={}", removed, compacted.len());
                    ctx.log("INFO", "agent_run", "compaction_ok",
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

        messages
    }
}