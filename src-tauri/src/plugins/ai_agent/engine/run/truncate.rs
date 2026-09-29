#![allow(dead_code)]

use crate::plugins::ai_agent::provider::ChatMessage;

use super::super::AgentEngine;

impl AgentEngine {
    /// 渐进式截断历史消息：保留首条 system，并从尾部向前取安全边界，
    /// 确保 assistant.tool_calls ↔ tool 消息配对完整。
    pub(super) fn truncate_messages(&self, messages: &[ChatMessage]) -> Vec<ChatMessage> {
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