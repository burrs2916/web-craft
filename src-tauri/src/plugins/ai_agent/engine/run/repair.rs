#![allow(dead_code)]

use crate::plugins::ai_agent::repair_plan::{RepairStep, StepPriority};

use super::super::util::truncate_chars;
use super::super::AgentEngine;

impl AgentEngine {
    /// 从 AI 输出文本中解析修复进度标记并更新修复计划
    pub(super) fn update_repair_progress_from_text(&mut self, text: &str) {
        let events = crate::plugins::ai_agent::repair_plan::parse_step_progress(text);
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
                plan.add_step(RepairStep {
                    index: event.index,
                    service: event.service.clone(),
                    description: event.description.clone(),
                    priority: StepPriority::Medium,
                    status: event.status,
                    estimated_commands: Vec::new(),
                    requires_sudo: true,
                    failure_reason: if matches!(event.status, crate::plugins::ai_agent::repair_plan::StepStatus::Failed) {
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
                    if matches!(event.status, crate::plugins::ai_agent::repair_plan::StepStatus::Failed) {
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
    pub(super) fn record_failed_tool_attempt(&mut self, tool_name: &str, args: &str, error: &str) {
        let plan = match self.repair_plan.as_mut() {
            Some(p) => p,
            None => return,
        };

        // 找到当前正在运行的步骤（status = Running）
        let running_step_idx = plan.steps.iter()
            .find(|s| matches!(s.status, crate::plugins::ai_agent::repair_plan::StepStatus::Running))
            .map(|s| s.index);

        let step_idx = match running_step_idx {
            Some(idx) => idx,
            None => {
                // 没有正在运行的步骤，找最近一个失败的步骤
                match plan.steps.iter().rfind(|s| matches!(s.status, crate::plugins::ai_agent::repair_plan::StepStatus::Failed)) {
                    Some(s) => s.index,
                    None => return,
                }
            }
        };

        // 从参数中提取命令
        let command = super::super::util::extract_command_from_args(tool_name, args);
        let method = format!("{} ({})", tool_name, truncate_chars(&command, 60));

        let attempt = crate::plugins::ai_agent::repair_plan::RepairAttempt {
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
}