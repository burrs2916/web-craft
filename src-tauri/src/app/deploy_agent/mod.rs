//! DeployAgent — 部署智能诊断代理
//!
//! Phase 1 目标：部署失败时自动诊断根因，用自然语言解释给用户，
//! 不让用户自己 SSH 上去翻日志。
//!
//! 架构：
//! - `types.rs` — 所有数据结构定义
//! - `rules.rs` — 基于规则的确定性诊断引擎（覆盖 90%+ 常见问题）
//!
//! 设计原则：Agent 是纯分析层，不直接操作远程服务器。
//! 调用方（deploy_service）负责收集诊断证据并传入，
//! Agent 返回结构化的诊断结果。
//! 这样耦合最低、最容易测试，Phase 2 加自动修复时再扩展。

pub mod types;
pub mod rules;

use std::collections::HashSet;

use types::{
    AgentProgress, AgentReport, AgentState, Diagnosis, DiagnosisRound, DeployContext, FixAction,
};

/// 部署智能诊断代理
///
/// Phase 1 版本：只做诊断，不做修复。
/// 接收诊断输入 → 运行规则引擎 → 返回结构化诊断报告。
pub struct DeployAgent {
    /// 部署上下文
    context: DeployContext,
    /// 当前状态
    state: AgentState,
    /// 诊断历史（每一轮）
    rounds: Vec<DiagnosisRound>,
    /// 已尝试的修复 ID（Phase 2 用）
    attempted_fixes: HashSet<String>,
    /// 最大诊断轮次（避免死循环）
    max_rounds: u32,
    /// 当前轮次
    current_round: u32,
}

impl DeployAgent {
    /// 创建新的 Agent 实例
    pub fn new(context: DeployContext) -> Self {
        Self {
            context,
            state: AgentState::Idle,
            rounds: Vec::new(),
            attempted_fixes: HashSet::new(),
            max_rounds: 3,
            current_round: 0,
        }
    }

    /// 获取当前状态
    pub fn state(&self) -> AgentState {
        self.state
    }

    /// 获取部署上下文（只读）
    pub fn context(&self) -> &DeployContext {
        &self.context
    }

    /// 获取诊断历史
    pub fn rounds(&self) -> &[DiagnosisRound] {
        &self.rounds
    }

    /// 执行一轮诊断
    ///
    /// 接收诊断输入，运行规则引擎，返回最佳匹配的诊断结果。
    /// 同时将结果记录到诊断历史中。
    pub fn diagnose(&mut self, input: &rules::DiagnosticInput) -> Option<Diagnosis> {
        self.state = AgentState::Diagnosing;
        self.current_round += 1;

        // 运行规则引擎
        self.state = AgentState::Analyzing;
        let diagnosis = rules::best_diagnosis(input);

        // 记录这一轮
        if let Some(diag) = &diagnosis {
            self.rounds.push(DiagnosisRound {
                round: self.current_round,
                diagnosis: diag.clone(),
                fix_applied: None,
                fix_succeeded: None,
            });
        }

        self.state = AgentState::Reporting;
        diagnosis
    }

    /// 获取所有匹配的诊断结果（按置信度排序）
    pub fn diagnose_all(&self, input: &rules::DiagnosticInput) -> Vec<Diagnosis> {
        rules::run_diagnostic_rules(input)
    }

    /// 生成最终诊断报告
    ///
    /// 汇总所有诊断轮次，生成用户友好的报告。
    pub fn generate_report(&self, input: &rules::DiagnosticInput) -> AgentReport {
        // 取置信度最高的诊断作为主结论
        let best = self.rounds.iter().max_by(|a, b| {
            a.diagnosis
                .confidence
                .partial_cmp(&b.diagnosis.confidence)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        match best {
            Some(round) => {
                let d = &round.diagnosis;
                AgentReport {
                    has_diagnosis: true,
                    summary: d.root_cause.lines().next().unwrap_or("").to_string(),
                    detail: d.root_cause.clone(),
                    confidence: d.confidence,
                    evidence: d.evidence.clone(),
                    attempted_fixes: self
                        .rounds
                        .iter()
                        .filter_map(|r| r.fix_applied.clone())
                        .collect(),
                    suggestions: self.build_suggestions(d),
                    rounds: self.rounds.clone(),
                }
            }
            None => {
                // 没有匹配到任何规则，返回通用报告
                AgentReport {
                    has_diagnosis: false,
                    summary: "未能自动定位根因".into(),
                    detail: format!(
                        "部署在「{}」步骤失败，错误信息：{}\n\n\
                        规则引擎未能匹配到已知的错误模式。\n\
                        建议查看完整部署日志，或将日志提供给技术支持排查。",
                        input.failed_step, input.error_message
                    ),
                    confidence: 0.0,
                    evidence: vec![],
                    attempted_fixes: vec![],
                    suggestions: vec![
                        "查看完整部署日志，搜索 ERROR 或 panic 关键字".into(),
                        "检查服务器资源（内存、CPU、磁盘）是否充足".into(),
                        "确认 server.toml 配置正确".into(),
                    ],
                    rounds: self.rounds.clone(),
                }
            }
        }
    }

    /// 根据诊断结果生成建议
    fn build_suggestions(&self, diagnosis: &Diagnosis) -> Vec<String> {
        let mut suggestions = Vec::new();

        // 如果有建议的修复方案，加进去
        if let Some(fix) = &diagnosis.suggested_fix {
            suggestions.push(format!("修复方案：{}", fix.description));
        }

        // 根据失败步骤加通用建议
        match diagnosis.failed_step.as_str() {
            "db_setup" => {
                suggestions.push("确认 PostgreSQL 服务正在运行".into());
                suggestions.push("检查数据库用户名和密码是否正确".into());
            }
            "migrate" => {
                suggestions.push("检查迁移 SQL 是否有语法错误".into());
                suggestions.push("确认数据库用户有足够的权限创建表".into());
            }
            "service_start" => {
                suggestions.push("检查端口是否被其他程序占用".into());
                suggestions.push("查看 journalctl 服务日志获取详细错误".into());
            }
            "healthz" => {
                suggestions.push("确认服务进程正在运行".into());
                suggestions.push("检查服务日志中的 ERROR 行".into());
            }
            _ => {}
        }

        // 备选原因
        for alt in &diagnosis.alternatives {
            if alt.confidence > 0.3 {
                suggestions.push(format!("其他可能：{}", alt.description));
            }
        }

        suggestions
    }

    /// 格式化错误消息（把诊断结果塞进错误字符串，方便直接返回给用户）
    ///
    /// 这是 Phase 1 的关键产出——把原来干巴巴的"排查建议"
    /// 换成"根因分析 + 证据 + 建议"的完整诊断。
    pub fn format_error_message(&self, report: &AgentReport) -> String {
        if !report.has_diagnosis {
            return format!(
                "部署失败：{}\n\n\
                未能自动定位根因，请查看完整部署日志。\n\n\
                建议：\n{}",
                report.summary,
                report
                    .suggestions
                    .iter()
                    .enumerate()
                    .map(|(i, s)| format!("  {}. {}", i + 1, s))
                    .collect::<Vec<_>>()
                    .join("\n")
            );
        }

        let confidence_pct = (report.confidence * 100.0) as u8;

        let evidence_section = if report.evidence.is_empty() {
            String::new()
        } else {
            format!(
                "\n\n关键证据：\n{}",
                report
                    .evidence
                    .iter()
                    .map(|e| format!("  [{}] {}", e.source, truncate(&e.content, 200)))
                    .collect::<Vec<_>>()
                    .join("\n")
            )
        };

        let fix_section = if let Some(first_fix) = report.suggestions.first() {
            format!("\n\n建议：\n  {}", first_fix)
        } else {
            String::new()
        };

        format!(
            "🔍 AI 诊断（置信度 {}%）\n\
            根因：{}{}{}\n\n\
            （完整诊断信息请查看部署日志中的 AI 诊断面板）",
            confidence_pct, report.summary, evidence_section, fix_section
        )
    }

    /// 获取进度信息（用于前端实时展示）
    pub fn progress(&self) -> AgentProgress {
        let message = match self.state {
            AgentState::Idle => "AI 助手待命".into(),
            AgentState::Diagnosing => "正在收集诊断信息...".into(),
            AgentState::Analyzing => "正在分析错误根因...".into(),
            AgentState::PreparingFix => "正在准备修复方案...".into(),
            AgentState::WaitingConfirm => "等待用户确认修复操作".into(),
            AgentState::Fixing => "正在执行修复...".into(),
            AgentState::Verifying => "正在验证修复结果...".into(),
            AgentState::Retrying => "正在重试部署步骤...".into(),
            AgentState::Reporting => "诊断完成".into(),
        };

        AgentProgress {
            state: self.state,
            message,
            round: self.current_round,
        }
    }
}

// ─── 辅助函数 ────────────────────────────────────────────────────────

fn truncate(s: &str, max_len: usize) -> String {
    if s.len() <= max_len {
        s.to_string()
    } else {
        format!("{}...", &s[..max_len.saturating_sub(3)])
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rules::{DiagnosticInput, PgDiagnosticInfo};

    fn make_context() -> DeployContext {
        DeployContext::new("test-site", "1.2.3.4", "root")
    }

    #[test]
    fn test_agent_diagnose_pg_auth() {
        let ctx = make_context();
        let mut agent = DeployAgent::new(ctx);

        let input = DiagnosticInput {
            failed_step: "db_setup".into(),
            error_message: "password authentication failed for user \"postgres\"".into(),
            pg_info: Some(PgDiagnosticInfo {
                password_encryption: Some("md5".into()),
                pg_hba_rules: vec![
                    "host all all 127.0.0.1/32 scram-sha-256".into(),
                    "host all all ::1/128 scram-sha-256".into(),
                ],
                ..Default::default()
            }),
            ..Default::default()
        };

        let diag = agent.diagnose(&input).expect("should diagnose");
        assert!(diag.confidence > 0.9);
        assert_eq!(agent.rounds().len(), 1);
    }

    #[test]
    fn test_agent_report_with_diagnosis() {
        let ctx = make_context();
        let mut agent = DeployAgent::new(ctx);

        let input = DiagnosticInput {
            failed_step: "db_setup".into(),
            error_message: "password authentication failed".into(),
            pg_info: Some(PgDiagnosticInfo {
                password_encryption: Some("md5".into()),
                pg_hba_rules: vec!["host all all 127.0.0.1/32 scram-sha-256".into()],
                ..Default::default()
            }),
            ..Default::default()
        };

        agent.diagnose(&input);
        let report = agent.generate_report(&input);

        assert!(report.has_diagnosis);
        assert!(report.confidence > 0.9);
        assert!(!report.suggestions.is_empty());
    }

    #[test]
    fn test_agent_report_no_diagnosis() {
        let ctx = make_context();
        let agent = DeployAgent::new(ctx);

        let input = DiagnosticInput {
            failed_step: "upload".into(),
            error_message: "unknown error".into(),
            ..Default::default()
        };

        let report = agent.generate_report(&input);
        assert!(!report.has_diagnosis);
        assert_eq!(report.confidence, 0.0);
    }

    #[test]
    fn test_format_error_message() {
        let ctx = make_context();
        let mut agent = DeployAgent::new(ctx);

        let input = DiagnosticInput {
            failed_step: "db_setup".into(),
            error_message: "password authentication failed".into(),
            pg_info: Some(PgDiagnosticInfo {
                password_encryption: Some("md5".into()),
                pg_hba_rules: vec!["host all all 127.0.0.1/32 scram-sha-256".into()],
                ..Default::default()
            }),
            ..Default::default()
        };

        agent.diagnose(&input);
        let report = agent.generate_report(&input);
        let msg = agent.format_error_message(&report);

        assert!(msg.contains("AI 诊断"));
        assert!(msg.contains("根因"));
        assert!(msg.contains("置信度"));
    }
}
