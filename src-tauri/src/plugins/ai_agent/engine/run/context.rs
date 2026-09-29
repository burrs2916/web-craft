#![allow(dead_code)]

use crate::infra::logging::debug_log;

/// run() 的结构化日志上下文。
/// 仅 env-ops 类 agent（env-fix / ops-assistant / srv-env-setup）落盘，其余 agent 保持静默，
/// 避免日志噪音。
pub(super) struct RunCtx<'a> {
    pub(super) run_id: &'a str,
    pub(super) is_env_ops: bool,
}

impl<'a> RunCtx<'a> {
    pub(super) fn new(run_id: &'a str, is_env_ops: bool) -> Self {
        Self { run_id, is_env_ops }
    }

    pub(super) fn log(&self, level: &str, phase: &str, event: &str, detail: &str) {
        if self.is_env_ops {
            debug_log::env_ops(level, self.run_id, phase, event, detail);
        }
    }
}