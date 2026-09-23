//! DeployAgent 类型定义

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Agent 状态
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentState {
    /// 待命（部署正常进行中）
    Idle,
    /// 收集诊断信息
    Diagnosing,
    /// 分析根因
    Analyzing,
    /// 准备修复
    PreparingFix,
    /// 等待用户确认（高风险操作）
    WaitingConfirm,
    /// 执行修复
    Fixing,
    /// 验证修复结果
    Verifying,
    /// 重试原步骤
    Retrying,
    /// 生成诊断报告（无法自动修复）
    Reporting,
}

/// 风险等级
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RiskLevel {
    /// 低风险：只读操作，可直接执行
    Low,
    /// 中风险：修改配置/重启服务，可自动执行（部署本身就要改这些）
    Medium,
    /// 高风险：删数据/杀进程/系统级变更，必须用户确认
    High,
}

impl RiskLevel {
    pub fn as_str(&self) -> &'static str {
        match self {
            RiskLevel::Low => "low",
            RiskLevel::Medium => "medium",
            RiskLevel::High => "high",
        }
    }
}

/// 诊断证据项
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceItem {
    /// 证据来源（如 "journalctl"、"pg_hba.conf"、"前台启动输出"）
    pub source: String,
    /// 证据内容摘要或全文
    pub content: String,
}

/// 修复步骤
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FixStep {
    /// 步骤描述
    pub description: String,
    /// 要执行的命令（如果是命令型修复）
    pub command: Option<String>,
    /// 是否已执行
    pub executed: bool,
    /// 执行结果（成功/失败/输出）
    pub result: Option<String>,
}

/// 修复方案
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FixAction {
    /// 修复类型 ID（用于去重，避免重复尝试同一个修复）
    pub id: String,
    /// 修复描述（给用户看的自然语言描述）
    pub description: String,
    /// 风险等级
    pub risk_level: RiskLevel,
    /// 修复步骤
    pub steps: Vec<FixStep>,
}

/// 诊断结果
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnosis {
    /// 失败的步骤
    pub failed_step: String,
    /// 原始错误信息
    pub original_error: String,
    /// 根因分析（自然语言）
    pub root_cause: String,
    /// 置信度 0.0 - 1.0
    pub confidence: f32,
    /// 收集到的关键证据
    pub evidence: Vec<EvidenceItem>,
    /// 建议的修复方案（如果有）
    pub suggested_fix: Option<FixAction>,
    /// 其他可能原因（按置信度排序）
    pub alternatives: Vec<AlternativeCause>,
    /// 诊断用了哪层引擎：rule / llm
    pub engine: &'static str,
}

/// 备选原因
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AlternativeCause {
    pub description: String,
    pub confidence: f32,
}

/// 诊断轮次记录
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosisRound {
    /// 第几轮
    pub round: u32,
    /// 诊断结果
    pub diagnosis: Diagnosis,
    /// 执行的修复（如果有）
    pub fix_applied: Option<FixAction>,
    /// 修复是否成功
    pub fix_succeeded: Option<bool>,
}

/// 部署上下文（Agent 工作所需的最小信息）
#[derive(Debug, Clone)]
pub struct DeployContext {
    /// 站点 ID
    pub site_id: String,
    /// 服务器 SSH 连接信息
    pub ssh_host: String,
    pub ssh_port: u16,
    pub ssh_user: String,
    /// 服务端口
    pub service_port: u16,
    /// 远程发布目录
    pub release_dir: String,
    /// systemd unit 名
    pub unit_name: String,
    /// 数据库连接信息（如果可用）
    pub database_url: Option<String>,
    /// 额外的上下文变量
    pub extra: HashMap<String, String>,
}

impl DeployContext {
    pub fn new(site_id: impl Into<String>, ssh_host: impl Into<String>, ssh_user: impl Into<String>) -> Self {
        Self {
            site_id: site_id.into(),
            ssh_host: ssh_host.into(),
            ssh_port: 22,
            ssh_user: ssh_user.into(),
            service_port: 8080,
            release_dir: String::new(),
            unit_name: String::new(),
            database_url: None,
            extra: HashMap::new(),
        }
    }
}

/// Agent 诊断报告（最终返回给用户的结构）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentReport {
    /// 是否定位到了根因
    pub has_diagnosis: bool,
    /// 根因总结（一句话）
    pub summary: String,
    /// 详细根因分析
    pub detail: String,
    /// 置信度
    pub confidence: f32,
    /// 关键证据列表
    pub evidence: Vec<EvidenceItem>,
    /// 已尝试的修复
    pub attempted_fixes: Vec<FixAction>,
    /// 建议的下一步操作（自然语言列表）
    pub suggestions: Vec<String>,
    /// 诊断历史（每一轮）
    pub rounds: Vec<DiagnosisRound>,
}

/// Agent 进度事件（用于前端实时展示诊断过程）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentProgress {
    /// 当前状态
    pub state: AgentState,
    /// 当前正在做什么（自然语言）
    pub message: String,
    /// 诊断轮次
    pub round: u32,
}
