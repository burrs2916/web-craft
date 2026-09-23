#![allow(dead_code)]

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

use super::permission::{self, PermissionMode, PermissionRequest};
use crate::infra::logging::debug_log;

const COMPACT_PRESERVE_RECENT: usize = 6;
const COMPACT_MAX_ESTIMATED_TOKENS: usize = 80_000;
const CHARS_PER_TOKEN: usize = 4;
const MAX_PROVIDER_RETRIES: usize = 2;
const PROVIDER_RETRY_BASE_DELAY_MS: u64 = 1000;

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

fn estimate_tokens(text: &str) -> usize {
    text.len().max(1) / CHARS_PER_TOKEN
}

fn estimate_messages_tokens(messages: &[super::provider::ChatMessage]) -> usize {
    messages.iter().map(|m| estimate_tokens(&m.content)).sum()
}

/// 判断错误是否为可重试错误（临时性错误）
fn is_retryable_error(err_msg: &str) -> bool {
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
fn build_tool_error_message(tool_name: &str, err_msg: &str) -> String {
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
fn cancel_future(token: &Option<tokio_util::sync::CancellationToken>) -> impl std::future::Future<Output = ()> + '_ {
    let token = token.clone();
    async move {
        if let Some(t) = token {
            t.cancelled().await;
        } else {
            std::future::pending::<()>().await;
        }
    }
}

fn should_compact(messages: &[super::provider::ChatMessage], config: &CompactionConfig) -> bool {
    if messages.len() <= config.preserve_recent + 1 {
        return false;
    }
    let total = estimate_messages_tokens(messages);
    total >= config.max_estimated_tokens
}

/// 从工具参数字符串中提取命令文本（用于修复尝试记录）
fn extract_command_from_args(tool_name: &str, args_json: &str) -> String {
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

fn validate_compacted_messages(messages: &[super::provider::ChatMessage]) -> Result<(), String> {
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

async fn compact_messages(
    provider: &Arc<dyn super::provider::LlmProvider>,
    messages: &[super::provider::ChatMessage],
    config: &CompactionConfig,
    model: &str,
) -> Result<(Vec<super::provider::ChatMessage>, String), String> {
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
        super::provider::ChatMessage {
            role: "system".to_string(),
            content: "You are a conversation summarizer. Produce a concise, factual summary that preserves all important context, decisions, and results.".to_string(),
            reasoning_content: None,
            tool_calls: None,
            tool_call_id: None,
        },
        super::provider::ChatMessage {
            role: "user".to_string(),
            content: summary_prompt,
            reasoning_content: None,
            tool_calls: None,
            tool_call_id: None,
        },
    ];

    let options = super::provider::ChatOptions {
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
        super::provider::ChatMessage {
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolOutput {
    pub success: bool,
    pub result: String,
    #[serde(default)]
    pub metadata: Value,
}

pub struct RunResult {
    pub final_content: String,
    pub messages: Vec<super::provider::ChatMessage>,
}

#[async_trait]
pub trait AgentTool: Send + Sync {
    fn name(&self) -> &str;
    fn description(&self) -> &str;
    fn parameters(&self) -> Value;
    async fn execute(&self, params: Value) -> Result<ToolOutput, String>;

    /// 工具分类：用于 UI 分组和权限策略
    /// 可选值: "info", "file", "exec", "privileged", "destructive", "other"
    fn category(&self) -> &str {
        "other"
    }

    /// 评估本次调用的风险等级
    /// 默认实现返回 High（安全默认），工具应该根据参数精确计算
    fn risk_level(&self, _params: &Value) -> super::permission::ToolRiskLevel {
        super::permission::ToolRiskLevel::High
    }

    /// 生成本次调用的权限描述（显示给用户确认）
    /// 默认实现返回通用描述，工具应该生成更友好的描述
    fn permission_description(&self, params: &Value) -> String {
        let args_str = if let Some(obj) = params.as_object().filter(|o| !o.is_empty()) {
            obj.iter()
                .map(|(k, v)| format!("  {}: {}", k, v))
                .collect::<Vec<_>>()
                .join("\n")
        } else {
            "(no parameters)".to_string()
        };
        format!("Tool: {}\nParameters:\n{}", self.name(), args_str)
    }
}

pub struct ToolRegistry {
    tools: HashMap<String, Arc<dyn AgentTool>>,
}

impl ToolRegistry {
    pub fn new() -> Self {
        ToolRegistry {
            tools: HashMap::new(),
        }
    }

    pub fn register(&mut self, tool: Arc<dyn AgentTool>) {
        self.tools.insert(tool.name().to_string(), tool);
    }

    pub fn unregister(&mut self, name: &str) -> bool {
        self.tools.remove(name).is_some()
    }

    pub fn get(&self, name: &str) -> Option<&Arc<dyn AgentTool>> {
        self.tools.get(name)
    }

    pub fn list_definitions(&self) -> Vec<super::provider::ToolDefinition> {
        self.tools.iter().map(|(_, tool)| {
            super::provider::ToolDefinition {
                def_type: "function".to_string(),
                function: super::provider::ToolFunctionDef {
                    name: tool.name().to_string(),
                    description: tool.description().to_string(),
                    parameters: tool.parameters(),
                },
            }
        }).collect()
    }

    pub fn list_names(&self) -> Vec<String> {
        self.tools.keys().cloned().collect()
    }
}

/// LLM API 错误类型分类，用于智能参数调节和重试策略
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ErrorKind {
    /// 上下文长度超限
    ContextLimit,
    /// 速率限制（429）
    RateLimit,
    /// 服务端错误（5xx）
    ServerError,
    /// 网络连接错误
    NetworkError,
    /// 其他错误
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallEvent {
    pub tool_name: String,
    pub arguments: Value,
    pub result: Option<String>,
    pub success: Option<bool>,
    pub status: String,
    /// 工具执行耗时（毫秒），仅在 status 为 done/denied 时有值
    pub duration_ms: Option<u64>,
}

/// Agent 执行状态事件，用于前端实时同步执行进度
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentStatusEvent {
    /// 当前状态: "thinking" | "tool_calling" | "summarizing" | "compact" | "fallback" | "done"
    pub status: String,
    /// 当前迭代次数
    pub iteration: u32,
    /// 最大迭代次数
    pub max_iterations: u32,
    /// 附加信息（如正在调用的工具名、fallback 模型名等）
    pub detail: Option<String>,
    /// 流式统计信息（可选）
    pub stream_stats: Option<StreamStats>,
    /// 上下文窗口使用情况（可选）
    pub context_usage: Option<ContextUsage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextUsage {
    /// 估算已用 token 数
    pub tokens_used: usize,
    /// 上下文窗口总 token 数
    pub context_window: i64,
    /// 使用比例 (0.0 ~ 1.0)
    pub usage_ratio: f64,
}

impl AgentStatusEvent {
    pub fn new(status: &str, iteration: u32, max_iterations: u32) -> Self {
        Self {
            status: status.to_string(),
            iteration,
            max_iterations,
            detail: None,
            stream_stats: None,
            context_usage: None,
        }
    }

    pub fn with_detail(mut self, detail: impl Into<String>) -> Self {
        self.detail = Some(detail.into());
        self
    }

    pub fn with_stream_stats(mut self, stats: StreamStats) -> Self {
        self.stream_stats = Some(stats);
        self
    }

    pub fn with_context_usage(mut self, usage: ContextUsage) -> Self {
        self.context_usage = Some(usage);
        self
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamStats {
    /// 已生成字符数
    pub chars_total: usize,
    /// 已生成 token 估算数（按 4 字符 ≈ 1 token 粗略估算）
    pub tokens_estimated: usize,
    /// 瞬时生成速率（字符/秒）
    pub chars_per_sec: f64,
    /// 瞬时生成速率（token/秒，估算）
    pub tokens_per_sec: f64,
    /// 已用时间（毫秒）
    pub elapsed_ms: u64,
}

fn last_assistant_content(messages: &[super::provider::ChatMessage]) -> String {
    messages.iter()
        .rev()
        .find(|m| m.role == "assistant")
        .and_then(|m| if m.content.is_empty() { None } else { Some(m.content.clone()) })
        .unwrap_or_else(|| "No response".to_string())
}

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

pub type PermissionRequesterFn = Arc<dyn Fn(PermissionRequest) -> Pin<Box<dyn Future<Output = (bool, bool)> + Send>> + Send + Sync>;

#[derive(Debug, Clone)]
pub struct PersistMessage {
    pub role: String,
    pub content: String,
    pub tool_calls: Option<Vec<super::provider::ToolCall>>,
    pub tool_call_id: Option<String>,
    pub is_error: bool,
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

    pub async fn run(
        &mut self,
        user_message: &str,
        history: Vec<super::provider::ChatMessage>,
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
        let mut messages: Vec<super::provider::ChatMessage> = Vec::new();

        messages.push(super::provider::ChatMessage {
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

        messages.push(super::provider::ChatMessage {
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

            let options = super::provider::ChatOptions {
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
                        let mut truncate_result: Option<super::provider::ChatResponse> = None;
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

            let assistant_msg = super::provider::ChatMessage {
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

                    let mut approved_calls: Vec<(super::provider::ToolCall, Value)> = Vec::new();
                    let mut denied_results: Vec<(super::provider::ToolCall, String)> = Vec::new();

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
                        messages.push(super::provider::ChatMessage {
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

                        messages.push(super::provider::ChatMessage {
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
                        messages.push(super::provider::ChatMessage {
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

                            messages.push(super::provider::ChatMessage {
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

                let options = super::provider::ChatOptions {
                    model: model_clone,
                    temperature: 0.3,
                    max_tokens: 800,
                    tools: None,
                    ..Default::default()
                };

                match provider_clone.chat(&[super::provider::ChatMessage {
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

    async fn try_fallback(
        &self,
        messages: &[super::provider::ChatMessage],
        options: &super::provider::ChatOptions,
        on_chunk: &impl Fn(String),
        original_error: &str,
    ) -> Result<super::provider::ChatResponse, String> {
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

            let fallback_options = super::provider::ChatOptions {
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

    /// 从 AI 输出文本中解析修复进度标记并更新修复计划
    fn update_repair_progress_from_text(&mut self, text: &str) {
        let events = super::repair_plan::parse_step_progress(text);
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
                use super::repair_plan::{RepairStep, StepPriority};
                plan.add_step(RepairStep {
                    index: event.index,
                    service: event.service.clone(),
                    description: event.description.clone(),
                    priority: StepPriority::Medium,
                    status: event.status,
                    estimated_commands: Vec::new(),
                    requires_sudo: true,
                    failure_reason: if matches!(event.status, super::repair_plan::StepStatus::Failed) {
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
                    if matches!(event.status, super::repair_plan::StepStatus::Failed) {
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
            .find(|s| matches!(s.status, super::repair_plan::StepStatus::Running))
            .map(|s| s.index);

        let step_idx = match running_step_idx {
            Some(idx) => idx,
            None => {
                // 没有正在运行的步骤，找最近一个失败的步骤
                match plan.steps.iter().rfind(|s| matches!(s.status, super::repair_plan::StepStatus::Failed)) {
                    Some(s) => s.index,
                    None => return,
                }
            }
        };

        // 从参数中提取命令
        let command = extract_command_from_args(tool_name, args);
        let method = format!("{} ({})", tool_name, truncate_chars(&command, 60));

        let attempt = super::repair_plan::RepairAttempt {
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
        use super::repair_plan::StepStatus;

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

    fn truncate_messages(&self, messages: &[super::provider::ChatMessage]) -> Vec<super::provider::ChatMessage> {
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

    async fn chat_stream_with_retry(
        &self,
        messages: &[super::provider::ChatMessage],
        options: &super::provider::ChatOptions,
        on_chunk: &impl Fn(String),
    ) -> Result<super::provider::ChatResponse, String> {
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
        messages: &[super::provider::ChatMessage],
        options: &super::provider::ChatOptions,
        on_chunk: &impl Fn(String),
    ) -> Result<super::provider::ChatResponse, String> {
        self.chat_stream_collect_with_provider(&self.provider, messages, options, on_chunk).await
    }

    async fn chat_stream_collect_with_provider(
        &self,
        provider: &Arc<dyn super::provider::LlmProvider>,
        messages: &[super::provider::ChatMessage],
        options: &super::provider::ChatOptions,
        on_chunk: &impl Fn(String),
    ) -> Result<super::provider::ChatResponse, String> {
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<String>();
        let tx_clone = tx.clone();
        let on_chunk_forwarder: Arc<dyn Fn(super::provider::ChatChunk) + Send + Sync> = Arc::new(move |chunk: super::provider::ChatChunk| {
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

