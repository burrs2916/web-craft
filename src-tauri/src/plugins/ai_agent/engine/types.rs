#![allow(dead_code)]

use async_trait::async_trait;
use crate::plugins::ai_agent::permission::PermissionRequest;
use serde::Deserialize;
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolOutput {
    pub success: bool,
    pub result: String,
    #[serde(default)]
    pub metadata: Value,
}

pub struct RunResult {
    pub final_content: String,
    pub messages: Vec<crate::plugins::ai_agent::provider::ChatMessage>,
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
    fn risk_level(&self, _params: &Value) -> crate::plugins::ai_agent::permission::ToolRiskLevel {
        crate::plugins::ai_agent::permission::ToolRiskLevel::High
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

    pub fn list_definitions(&self) -> Vec<crate::plugins::ai_agent::provider::ToolDefinition> {
        self.tools.iter().map(|(_, tool)| {
            crate::plugins::ai_agent::provider::ToolDefinition {
                def_type: "function".to_string(),
                function: crate::plugins::ai_agent::provider::ToolFunctionDef {
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
pub(crate) enum ErrorKind {
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

pub type PermissionRequesterFn = Arc<dyn Fn(PermissionRequest) -> Pin<Box<dyn Future<Output = (bool, bool)> + Send>> + Send + Sync>;

#[derive(Debug, Clone)]
pub struct PersistMessage {
    pub role: String,
    pub content: String,
    pub tool_calls: Option<Vec<crate::plugins::ai_agent::provider::ToolCall>>,
    pub tool_call_id: Option<String>,
    pub is_error: bool,
}
