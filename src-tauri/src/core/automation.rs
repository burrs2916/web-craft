//! L3 task-orchestration domain types (docs/automation-ops-plan.md §6).
//!
//! All structs serialize with `camelCase` to match the frontend contract, and
//! the step `type` field is a reserved word, so it is explicitly renamed.

use chrono::{Datelike, Timelike, TimeZone};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum StepType {
    LocalBuild,
    SftpTransfer,
    RemoteExec,
    LocalShell,
    Delay,
    /// 部署站点：复用 DeployService::deploy，把站点发布到其绑定的服务器连接
    /// （上传 dist/ 静态文件 → Nginx 提供服务 → HTTP 可达验证 + 落库部署历史）。
    /// 用于把「部署」编排进自动化任务，保证工作连续性。
    Deploy,
    /// HTTP 请求：用于健康检查、Webhook 通知、API 调用等。
    Http,
}

impl StepType {
    pub fn as_str(&self) -> &'static str {
        match self {
            StepType::LocalBuild => "local_build",
            StepType::SftpTransfer => "sftp_transfer",
            StepType::RemoteExec => "remote_exec",
            StepType::LocalShell => "local_shell",
            StepType::Delay => "delay",
            StepType::Deploy => "deploy",
            StepType::Http => "http",
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum StepCondition {
    OnFail,
    OnSuccess,
    Always,
}

impl StepCondition {
    pub fn as_str(&self) -> &'static str {
        match self {
            StepCondition::OnFail => "on_fail",
            StepCondition::OnSuccess => "on_success",
            StepCondition::Always => "always",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RetryConfig {
    #[serde(default = "default_max_attempts")]
    pub max_attempts: u32,
    #[serde(default)]
    pub backoff_secs: u64,
}

fn default_max_attempts() -> u32 {
    1
}

impl RetryConfig {
    pub fn attempts(&self) -> u32 {
        self.max_attempts.max(1)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskStep {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub step_type: StepType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub condition: Option<StepCondition>,
    #[serde(default)]
    pub continue_on_fail: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retry: Option<RetryConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timeout_secs: Option<u64>,
    // remote_exec / local_shell
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    // sftp_transfer
    #[serde(skip_serializing_if = "Option::is_none")]
    pub local_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub remote_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub direction: Option<String>,
    // delay
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seconds: Option<u64>,
    // assertions (remote_exec / local_shell)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expect_stdout: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expect_stderr: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expect_exit_code: Option<i32>,
    // deploy
    #[serde(skip_serializing_if = "Option::is_none")]
    pub site_id: Option<String>,
    // http
    #[serde(skip_serializing_if = "Option::is_none")]
    pub http_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub http_method: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub http_body: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub http_headers: Option<String>, // JSON map
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expect_status_code: Option<u16>,
}

impl TaskStep {
    /// Human-readable, rendered form of this step for the run log.
    pub fn rendered_label(&self) -> String {
        match self.step_type {
            StepType::RemoteExec | StepType::LocalShell => {
                self.command.clone().unwrap_or_default()
            }
            StepType::SftpTransfer => {
                let dir = self.direction.as_deref().unwrap_or("upload");
                format!(
                    "{} {} -> {}",
                    dir,
                    self.local_path.as_deref().unwrap_or("?"),
                    self.remote_path.as_deref().unwrap_or("?")
                )
            }
            StepType::Delay => format!("sleep {}s", self.seconds.unwrap_or(0)),
            StepType::LocalBuild => "local_build".to_string(),
            StepType::Deploy => format!("deploy site {}", self.site_id.clone().unwrap_or_default()),
            StepType::Http => format!("{} {}",
                self.http_method.clone().unwrap_or_else(|| "GET".into()),
                self.http_url.clone().unwrap_or_default()
            ),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct AutomationTask {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub connection_ids: Vec<String>,
    pub steps: Vec<TaskStep>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retry: Option<RetryConfig>,
    #[serde(default)]
    pub notify: bool,
    #[serde(default)]
    pub run_on_startup: bool,
    #[serde(default)]
    pub enabled: bool,
    pub last_run_at: Option<i64>,
    // 计算字段（不落库）：最近一次运行的状态，仅供前端展示
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_run_status: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    // ---- 周期调度（保证工作连续性，docs/automation-ops-plan.md §10） ----
    // schedule_kind: "off" | "interval" | "daily" | "hourly"
    #[serde(default)]
    pub schedule_kind: String,
    // interval 模式：两次运行最小间隔（秒）
    #[serde(default)]
    pub schedule_interval_secs: u64,
    // hourly 模式：每小时的第几分钟（0..59）；daily 模式：当天第几分钟（0..1439）
    #[serde(default)]
    pub schedule_at_minute: u32,
    // 计算字段（不落库）：下一次到期时间（ms），仅供前端展示
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next_run_at: Option<i64>,
}

pub const SCHEDULE_OFF: &str = "off";
pub const SCHEDULE_INTERVAL: &str = "interval";
pub const SCHEDULE_DAILY: &str = "daily";
pub const SCHEDULE_HOURLY: &str = "hourly";

impl AutomationTask {
    /// 是否启用了周期调度（启用 + 非 off）。
    pub fn schedule_is_active(&self) -> bool {
        self.enabled
            && !self.schedule_kind.is_empty()
            && self.schedule_kind != SCHEDULE_OFF
    }

    /// 返回 `<= now` 的最近一次应触发时刻（ms），若调度在 now 之前从未到点则返回 None。
    /// interval 模式下若从未运行（last_run_at 为空）则返回 now，表示立即到期。
    pub fn last_due_instant(&self, now: i64) -> Option<i64> {
        let now_dt = chrono::DateTime::<chrono::Utc>::from(
            std::time::UNIX_EPOCH + std::time::Duration::from_millis(now.max(0) as u64),
        )
        .with_timezone(&chrono::Local);
        match self.schedule_kind.as_str() {
            SCHEDULE_INTERVAL => {
                let iv = (self.schedule_interval_secs.max(1) as i64) * 1000;
                let last = self.last_run_at.unwrap_or(0);
                if last <= 0 {
                    return Some(now);
                }
                let elapsed = now - last;
                if elapsed < iv {
                    return None;
                }
                Some(last + (elapsed / iv) * iv)
            }
            SCHEDULE_DAILY => {
                let minute_of_day = (self.schedule_at_minute as i64).clamp(0, 1439);
                let h = (minute_of_day / 60) as u32;
                let m = (minute_of_day % 60) as u32;
                let time = chrono::NaiveTime::from_hms_opt(h, m, 0)?;
                let today = now_dt.date_naive().and_time(time);
                let today_dt = chrono::Local.from_local_datetime(&today).single()?;
                let today_ms = today_dt.timestamp_millis();
                if now >= today_ms {
                    Some(today_ms)
                } else {
                    Some(today_ms - 86_400_000)
                }
            }
            SCHEDULE_HOURLY => {
                let minute = (self.schedule_at_minute as i64).clamp(0, 59);
                let time = chrono::NaiveTime::from_hms_opt(now_dt.hour(), minute as u32, 0)?;
                let this = now_dt.date_naive().and_time(time);
                let this_dt = chrono::Local.from_local_datetime(&this).single()?;
                let this_ms = this_dt.timestamp_millis();
                if now >= this_ms {
                    Some(this_ms)
                } else {
                    Some(this_ms - 3_600_000)
                }
            }
            _ => None,
        }
    }

    /// 当前是否到期：调度生效 且 最近一次应触发时刻晚于上次运行时间。
    pub fn is_due(&self, now: i64) -> bool {
        if !self.schedule_is_active() {
            return false;
        }
        match self.last_due_instant(now) {
            Some(due) => due > self.last_run_at.unwrap_or(0),
            None => false,
        }
    }

    /// 严格晚于 now 的下一次到期时刻（ms），用于前端展示。
    pub fn next_due_instant(&self, now: i64) -> Option<i64> {
        let last = self.last_due_instant(now)?;
        match self.schedule_kind.as_str() {
            SCHEDULE_INTERVAL => Some(last + (self.schedule_interval_secs.max(1) as i64) * 1000),
            SCHEDULE_DAILY => Some(last + 86_400_000),
            SCHEDULE_HOURLY => Some(last + 3_600_000),
            _ => None,
        }
    }

    /// 人类可读的调度摘要（前端展示用，无需 chrono）。
    pub fn schedule_summary(&self) -> String {
        match self.schedule_kind.as_str() {
            SCHEDULE_INTERVAL => {
                let s = self.schedule_interval_secs;
                if s >= 3600 {
                    format!("每 {} 小时", s / 3600)
                } else if s >= 60 {
                    format!("每 {} 分钟", s / 60)
                } else {
                    format!("每 {} 秒", s.max(1))
                }
            }
            SCHEDULE_DAILY => {
                let mod_h = (self.schedule_at_minute as i64).clamp(0, 1439);
                format!("每天 {:02}:{:02}", mod_h / 60, mod_h % 60)
            }
            SCHEDULE_HOURLY => {
                format!("每小时第 {:02} 分", (self.schedule_at_minute as i64).clamp(0, 59))
            }
            _ => "手动触发".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct TaskRun {
    pub id: String,
    pub task_id: String,
    pub trigger_type: String,
    pub connection_id: Option<String>,
    pub status: String,
    pub started_at: i64,
    pub finished_at: Option<i64>,
    pub duration_ms: Option<i64>,
    #[serde(default)]
    pub error_summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct TaskRunStep {
    pub id: String,
    pub run_id: String,
    pub step_index: i64,
    pub step_id: String,
    pub step_type: String,
    #[serde(default)]
    pub command_rendered: String,
    pub status: String,
    pub exit_code: Option<i32>,
    #[serde(default)]
    pub stdout: String,
    #[serde(default)]
    pub stderr: String,
    pub assertion_passed: Option<bool>,
    #[serde(default)]
    pub attempt: i64,
    #[serde(default)]
    pub duration_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct TaskRunDetail {
    pub run: TaskRun,
    pub steps: Vec<TaskRunStep>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TaskRunStats {
    pub total_runs: i64,
    pub success_runs: i64,
    pub failed_runs: i64,
    pub cancelled_runs: i64,
    pub avg_duration_ms: i64,
    /// 最近 7 天每天的运行次数（从 6 天前到今天，共 7 天）。
    pub last_7_days: Vec<TaskRunDailyStat>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskRunDailyStat {
    pub date: String, // YYYY-MM-DD
    pub total: i64,
    pub success: i64,
    pub failed: i64,
}

const STATUS_RUNNING: &str = "running";
const STATUS_SUCCESS: &str = "success";
const STATUS_FAILED: &str = "failed";
const STATUS_CANCELLED: &str = "cancelled";
const STATUS_SKIPPED: &str = "skipped";

pub fn run_run_status() -> &'static str {
    STATUS_RUNNING
}
pub fn run_success_status() -> &'static str {
    STATUS_SUCCESS
}
pub fn run_failed_status() -> &'static str {
    STATUS_FAILED
}
pub fn run_cancelled_status() -> &'static str {
    STATUS_CANCELLED
}
pub fn step_skipped_status() -> &'static str {
    STATUS_SKIPPED
}

pub fn truncate_io(s: &str, head: usize, tail: usize) -> String {
    if s.len() <= head + tail {
        return s.to_string();
    }
    let h = &s[..head];
    let t = &s[s.len() - tail..];
    format!("{}\n... [{} bytes truncated] ...\n{}", h, s.len() - head - tail, t)
}

pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn step_type_round_trips_to_snake_case() {
        assert_eq!(StepType::RemoteExec.as_str(), "remote_exec");
        assert_eq!(StepType::LocalBuild.as_str(), "local_build");
        assert_eq!(StepType::SftpTransfer.as_str(), "sftp_transfer");
        assert_eq!(StepType::Delay.as_str(), "delay");
        assert_eq!(StepType::Deploy.as_str(), "deploy");
    }

    #[test]
    fn step_condition_round_trips_to_snake_case() {
        assert_eq!(StepCondition::Always.as_str(), "always");
        assert_eq!(StepCondition::OnSuccess.as_str(), "on_success");
    }

    #[test]
    fn retry_attempts_never_below_one() {
        let low = RetryConfig { max_attempts: 0, backoff_secs: 3 };
        assert_eq!(low.attempts(), 1);
        let normal = RetryConfig { max_attempts: 5, backoff_secs: 2 };
        assert_eq!(normal.attempts(), 5);
    }

    #[test]
    fn truncate_io_keeps_short_input_intact() {
        let s = "hello world";
        assert_eq!(truncate_io(s, 256, 256), s);
    }

    #[test]
    fn truncate_io_cuts_long_input_with_marker() {
        let s = "a".repeat(100);
        let out = truncate_io(&s, 8, 8);
        assert!(out.contains("[84 bytes truncated]"));
        assert!(out.starts_with("aaaaaaaa"));
        assert!(out.ends_with("aaaaaaaa"));
    }

    #[test]
    fn rendered_label_covers_all_step_types() {
        let exec = TaskStep { id: "1".into(), name: "x".into(), step_type: StepType::RemoteExec, condition: None, continue_on_fail: false, retry: None, timeout_secs: None, command: Some("npm run build".into()), local_path: None, remote_path: None, direction: None, seconds: None, expect_stdout: None, expect_stderr: None, expect_exit_code: None, site_id: None, http_url: None, http_method: None, http_body: None, http_headers: None, expect_status_code: None };
        assert_eq!(exec.rendered_label(), "npm run build");

        let sftp = TaskStep { id: "2".into(), name: "x".into(), step_type: StepType::SftpTransfer, condition: None, continue_on_fail: false, retry: None, timeout_secs: None, command: None, local_path: Some("/dist".into()), remote_path: Some("/var/www".into()), direction: Some("upload".into()), seconds: None, expect_stdout: None, expect_stderr: None, expect_exit_code: None, site_id: None, http_url: None, http_method: None, http_body: None, http_headers: None, expect_status_code: None };
        assert_eq!(sftp.rendered_label(), "upload /dist -> /var/www");

        let delay = TaskStep { id: "3".into(), name: "x".into(), step_type: StepType::Delay, condition: None, continue_on_fail: false, retry: None, timeout_secs: None, command: None, local_path: None, remote_path: None, direction: None, seconds: Some(5), expect_stdout: None, expect_stderr: None, expect_exit_code: None, site_id: None, http_url: None, http_method: None, http_body: None, http_headers: None, expect_status_code: None };
        assert_eq!(delay.rendered_label(), "sleep 5s");
    }
}