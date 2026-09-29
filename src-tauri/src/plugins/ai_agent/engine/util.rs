#![allow(dead_code)]

use std::sync::Arc;

pub(crate) const COMPACT_PRESERVE_RECENT: usize = 6;
pub(crate) const COMPACT_MAX_ESTIMATED_TOKENS: usize = 80_000;
pub(crate) const CHARS_PER_TOKEN: usize = 4;

pub(crate) const MAX_PROVIDER_RETRIES: usize = 2;
pub(crate) const PROVIDER_RETRY_BASE_DELAY_MS: u64 = 1000;

/// 按字符数安全截断字符串（UTF-8 边界安全），用于日志 preview。
/// `&s[..n]` 形式的字节切片遇到中文等多字节字符会 panic，必须用本函数。
pub fn truncate_chars(s: &str, max_chars: usize) -> &str {
    match s.char_indices().nth(max_chars) {
        Some((idx, _)) => &s[..idx],
        None => s,
    }
}


/// 按字节数上限安全截断（回退到最近的字符边界），永不 panic。
pub fn truncate_bytes(s: &str, max_bytes: usize) -> &str {
    if s.len() <= max_bytes {
        return s;
    }
    let mut end = max_bytes;
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    &s[..end]
}

#[derive(Debug, Clone, Copy)]
pub struct CompactionConfig {
    pub preserve_recent: usize,
    pub max_estimated_tokens: usize,
}

impl Default for CompactionConfig {
    fn default() -> Self {
        Self {
            preserve_recent: COMPACT_PRESERVE_RECENT,
            max_estimated_tokens: COMPACT_MAX_ESTIMATED_TOKENS,
        }
    }
}

pub(crate) fn estimate_tokens(text: &str) -> usize {
    text.len().max(1) / CHARS_PER_TOKEN
}

pub(crate) fn estimate_messages_tokens(messages: &[crate::plugins::ai_agent::provider::ChatMessage]) -> usize {
    messages.iter().map(|m| estimate_tokens(&m.content)).sum()
}

/// 判断错误是否为可重试错误（临时性错误）
pub(crate) fn is_retryable_error(err_msg: &str) -> bool {
    let lower = err_msg.to_lowercase();
    lower.contains("timeout")
        || lower.contains("timed out")
        || lower.contains("connection")
        || lower.contains("econnrefused")
        || lower.contains("econnreset")
        || lower.contains("etimedout")
        || lower.contains("temporary")
        || lower.contains("retry")
        || lower.contains("busy")
        || lower.contains("resource temporarily unavailable")
        || lower.contains("try again")
        || lower.contains("broken pipe")
        || lower.contains("connection reset")
        || lower.contains("connection refused")
        || lower.contains("dns")
        || lower.contains("name resolution")
        || lower.contains("socket")
        // SSH 相关
        || lower.contains("ssh") && (lower.contains("reset") || lower.contains("refused") || lower.contains("timeout"))
        || lower.contains("broken pipe")
        // 锁竞争
        || lower.contains("lock") && (lower.contains("held") || lower.contains("busy") || lower.contains("timeout"))
        || lower.contains("dpkg") && lower.contains("lock")
        || lower.contains("apt") && lower.contains("lock")
        // 速率限制
        || lower.contains("rate limit")
        || lower.contains("too many requests")
        || lower.contains("429")
        // 服务暂时不可用
        || lower.contains("503")
        || lower.contains("502")
        || lower.contains("504")
        || lower.contains("service unavailable")
        || lower.contains("bad gateway")
        || lower.contains("gateway timeout")
        // IO 临时错误
        || lower.contains("interrupted system call")
        || lower.contains("eintr")
        || lower.contains("resource busy")
        // TLS/SSL 握手临时失败
        || lower.contains("tls handshake") && (lower.contains("timeout") || lower.contains("reset"))
        || lower.contains("ssl handshake") && (lower.contains("timeout") || lower.contains("reset"))
}

/// 根据错误类型构造友好的降级错误消息，给 AI 提供修复建议
pub(crate) fn build_tool_error_message(tool_name: &str, err_msg: &str) -> String {
    if err_msg.contains("not found") || err_msg.contains("No such file") {
        format!("Tool '{}' failed: {}. The target does not exist. Please verify the path or name and try again.", tool_name, err_msg)
    } else if err_msg.contains("permission") || err_msg.contains("Permission denied") || err_msg.contains("access denied") {
        format!("Tool '{}' failed due to permission error: {}. Try a different approach or check access rights.", tool_name, err_msg)
    } else if err_msg.contains("timeout") || err_msg.contains("timed out") {
        format!("Tool '{}' timed out: {}. The operation took too long. Try a simpler or more specific request.", tool_name, err_msg)
    } else if err_msg.contains("ModuleNotFoundError") || err_msg.contains("ImportError") || err_msg.contains("No module named") {
        format!("Tool '{}' failed because a Python dependency is missing: {}. Install it with 'pip install <package>' and retry, or modify the script to avoid this dependency.", tool_name, err_msg)
    } else if err_msg.contains("SyntaxError") || err_msg.contains("syntax error") {
        format!("Tool '{}' failed due to a script syntax error: {}. Fix the script syntax and use the refine action to update the plugin.", tool_name, err_msg)
    } else if err_msg.contains("command not found") || err_msg.contains("not recognized") {
        format!("Tool '{}' failed because the interpreter/command is not installed: {}. Install the required program or use a different script type.", tool_name, err_msg)
    } else if err_msg.contains("lock") && (err_msg.contains("dpkg") || err_msg.contains("apt")) {
        format!("Tool '{}' failed: {}. Another package manager process is holding the dpkg/apt lock. Wait a few seconds and retry, or check if another apt/dpkg process is running.", tool_name, err_msg)
    } else if err_msg.contains("429") || err_msg.contains("rate limit") || err_msg.contains("too many requests") {
        format!("Tool '{}' hit rate limit: {}. Wait briefly and retry with exponential backoff.", tool_name, err_msg)
    } else if err_msg.contains("502") || err_msg.contains("503") || err_msg.contains("504") || err_msg.contains("service unavailable") || err_msg.contains("bad gateway") {
        format!("Tool '{}' failed due to server-side error: {}. This is likely temporary — retry after a short delay.", tool_name, err_msg)
    } else if err_msg.contains("broken pipe") || err_msg.contains("connection reset") || err_msg.contains("connection refused") {
        format!("Tool '{}' failed due to connection issue: {}. The connection was dropped or refused. Check if the remote service is running and retry.", tool_name, err_msg)
    } else if err_msg.contains("SSH") && (err_msg.contains("reset") || err_msg.contains("closed") || err_msg.contains("timeout")) {
        format!("Tool '{}' SSH session error: {}. The SSH connection was interrupted. Verify the session is still alive, or reconnect if necessary.", tool_name, err_msg)
    } else {
        format!("Tool '{}' execution failed: {}. Please try an alternative approach.", tool_name, err_msg)
    }
}

/// 将 CancellationToken 转换为 Future，用于 tokio::select!
/// 如果 token 为 None，则返回一个永远不会完成的 future
pub(crate) fn cancel_future(token: &Option<tokio_util::sync::CancellationToken>) -> impl std::future::Future<Output = ()> + '_ {
    let token = token.clone();
    async move {
        if let Some(t) = token {
            t.cancelled().await;
        } else {
            std::future::pending::<()>().await;
        }
    }
}

pub(crate) fn should_compact(messages: &[crate::plugins::ai_agent::provider::ChatMessage], config: &CompactionConfig) -> bool {
    if messages.len() <= config.preserve_recent + 1 {
        return false;
    }
    let total = estimate_messages_tokens(messages);
    total >= config.max_estimated_tokens
}

/// 从工具参数字符串中提取命令文本（用于修复尝试记录）
pub(crate) fn extract_command_from_args(tool_name: &str, args_json: &str) -> String {
    let parsed: serde_json::Value = serde_json::from_str(args_json).unwrap_or(serde_json::Value::Null);

    // terminal_session: 优先 command，其次 action
    if tool_name == "terminal_session" {
        if let Some(cmd) = parsed["command"].as_str() {
            return cmd.to_string();
        }
        if let Some(action) = parsed["action"].as_str() {
            if let Some(path) = parsed["path"].as_str() {
                return format!("{} {}", action, path);
            }
            return action.to_string();
        }
    }
    // terminal: command 字段
    if tool_name == "terminal" {
        if let Some(cmd) = parsed["command"].as_str() {
            return cmd.to_string();
        }
    }

    // 默认返回前 100 个字符
    args_json.chars().take(100).collect()
}

pub(crate) fn validate_compacted_messages(messages: &[crate::plugins::ai_agent::provider::ChatMessage]) -> Result<(), String> {
    if messages.is_empty() {
        return Err("Compacted messages is empty".to_string());
    }
    if messages[0].role != "system" {
        return Err(format!("First message is not system, got: {}", messages[0].role));
    }
    let tool_call_ids: std::collections::HashSet<String> = messages.iter()
        .filter(|m| m.role == "assistant")
        .filter_map(|m| m.tool_calls.as_ref())
        .flat_map(|tcs| tcs.iter().map(|tc| tc.id.clone()))
        .collect();
    let tool_msg_ids: std::collections::HashSet<String> = messages.iter()
        .filter(|m| m.role == "tool")
        .filter_map(|m| m.tool_call_id.clone())
        .collect();
    let orphan_tool_msgs: Vec<&str> = tool_msg_ids.iter()
        .filter(|id| !tool_call_ids.contains(*id))
        .map(|id| id.as_str())
        .collect();
    if !orphan_tool_msgs.is_empty() && orphan_tool_msgs.len() > 3 {
        return Err(format!("Too many orphan tool messages after compaction: {}", orphan_tool_msgs.len()));
    }
    Ok(())
}

pub(crate) async fn compact_messages(
    provider: &Arc<dyn crate::plugins::ai_agent::provider::LlmProvider>,
    messages: &[crate::plugins::ai_agent::provider::ChatMessage],
    config: &CompactionConfig,
    model: &str,
) -> Result<(Vec<crate::plugins::ai_agent::provider::ChatMessage>, String), String> {
    if messages.len() <= config.preserve_recent + 1 {
        return Ok((messages.to_vec(), String::new()));
    }

    let split_point = messages.len().saturating_sub(config.preserve_recent);
    let old_messages = &messages[1..split_point];
    let recent_messages = &messages[split_point..];

    if old_messages.is_empty() {
        return Ok((messages.to_vec(), String::new()));
    }

    let conversation_text: String = old_messages
        .iter()
        .map(|m| format!("[{}]: {}", m.role, m.content))
        .collect::<Vec<_>>()
        .join("\n\n");

    let summary_prompt = format!(
        "Summarize the following conversation concisely. Preserve key facts, decisions, user preferences, tool results, and any important context. Do not add information not present in the conversation.\n\nConversation:\n{}",
        conversation_text
    );

    let summary_messages = vec![
        crate::plugins::ai_agent::provider::ChatMessage {
            role: "system".to_string(),
            content: "You are a conversation summarizer. Produce a concise, factual summary that preserves all important context, decisions, and results.".to_string(),
            reasoning_content: None,
            tool_calls: None,
            tool_call_id: None,
        },
        crate::plugins::ai_agent::provider::ChatMessage {
            role: "user".to_string(),
            content: summary_prompt,
            reasoning_content: None,
            tool_calls: None,
            tool_call_id: None,
        },
    ];

    let options = crate::plugins::ai_agent::provider::ChatOptions {
        model: model.to_string(),
        temperature: 0.3,
        max_tokens: 2048,
        tools: None,
        ..Default::default()
    };

    let response = provider.chat(&summary_messages, &options).await?;
    let summary = response.content.unwrap_or_default();

    let compacted_system = format!(
        "{}\n\n[Conversation Summary]\nThe following is a summary of earlier conversation:\n{}\n[/Conversation Summary]",
        messages[0].content,
        summary.trim()
    );

    let mut result = vec![
        crate::plugins::ai_agent::provider::ChatMessage {
            role: "system".to_string(),
            content: compacted_system,
            reasoning_content: None,
            tool_calls: None,
            tool_call_id: None,
        },
    ];
    result.extend(recent_messages.to_vec());
    Ok((result, summary.trim().to_string()))
}

pub(crate) fn last_assistant_content(messages: &[crate::plugins::ai_agent::provider::ChatMessage]) -> String {
    messages.iter()
        .rev()
        .find(|m| m.role == "assistant")
        .and_then(|m| if m.content.is_empty() { None } else { Some(m.content.clone()) })
        .unwrap_or_else(|| "No response".to_string())
}
