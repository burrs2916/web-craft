#![allow(dead_code)]

use super::super::AgentEngine;

impl AgentEngine {
    /// 判断模型本轮纯文本回复是否表示任务已完成 / 正在等待用户确认。
    /// `last_lower` 必须是已转为小写的模型输出。
    pub(super) fn classify_completion(last_lower: &str) -> (bool, bool) {
        let looks_done = last_lower.contains("完成")
            || last_lower.contains("已完成")
            || last_lower.contains("修复完成")
            || last_lower.contains("done")
            || last_lower.contains("finished")
            || last_lower.contains("complete")
            || last_lower.contains("completed")
            || last_lower.contains("vnc is ready")
            || last_lower.contains("is ready")
            || last_lower.contains("已达到")
            || last_lower.contains("可以连接")
            || last_lower.contains("可连接")
            // 环境修复：修复完成 / 一切正常
            || last_lower.contains("env_fix_status: fix_completed")
            || last_lower.contains("env_fix_status: all_good")
            // 服务器环境安装：已就绪
            || last_lower.contains("srv_env_status: ready");
        // 等待用户确认：检测到"检查结论标记"或模型在征询用户意见时，绝不自动续跑，
        // 必须先交还用户（如远程桌面安装前的"是否安装"确认）。
        // 词表覆盖中英文常见征询说法（英文环境下模型可能用 would you like / shall i 等）。
        let awaiting_user = last_lower.contains("rd_status:")
            // 服务器环境安装状态标记（ready 除外，ready 归 looks_done）
            || last_lower.contains("srv_env_status: missing")
            || last_lower.contains("srv_env_status: partial")
            // 环境修复状态标记（all_good / fix_completed 除外，归 looks_done）
            || last_lower.contains("env_fix_status: need_fix")
            || last_lower.contains("需要我")
            || last_lower.contains("要我")
            || last_lower.contains("是否")
            || last_lower.contains("请确认")
            || last_lower.contains("确认吗")
            || last_lower.contains("安装吗")
            || last_lower.contains("do you want")
            || last_lower.contains("would you like")
            || last_lower.contains("want me to")
            || last_lower.contains("shall i")
            || last_lower.contains("shall we")
            || last_lower.contains("may i")
            || last_lower.contains("should i")
            || last_lower.contains("proceed with")
            || last_lower.contains("ready to install")
            || last_lower.contains("do you agree")
            || last_lower.contains("please confirm");

        (looks_done, awaiting_user)
    }

    /// 根据当前状态智能选择 auto-continue 续跑提示
    /// 返回 (展示用标签, 发送给模型的完整提示)
    pub(super) fn determine_auto_continue_nudge(&self, last_lower: &str) -> (String, String) {
        use crate::plugins::ai_agent::repair_plan::StepStatus;

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
}