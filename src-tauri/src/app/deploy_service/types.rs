use serde::Serialize;

use crate::core::automation::now_ms;
use crate::infra::storage::deployment_repo;

/// 部署步骤标识（前端进度 UI 按此渲染阶段）。
pub const STEP_VALIDATE: &str = "validate";
pub const STEP_PRECHECK: &str = "precheck";
pub const STEP_CONFIG: &str = "config";
pub const STEP_UPLOAD: &str = "upload";
pub const STEP_SWITCH: &str = "switch";
pub const STEP_NGINX: &str = "nginx";
pub const STEP_VERIFY: &str = "verify";
pub const STEP_CLEANUP: &str = "cleanup";
pub const STEP_DONE: &str = "done";

/// 保留的历史版本数量（含当前版本）
pub(crate) const KEEP_RELEASES: usize = 5;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeployProgress {
    pub step: String,
    pub message: String,
    /// 0-100 全流程百分比。
    pub percent: u8,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeployOutcome {
    pub deployment_id: String,
    pub base_url: String,
    pub uploaded_count: u64,
    pub total_bytes: u64,
    pub duration_ms: i64,
    pub log: Vec<String>,
    /// 版本目录名（蓝绿部署的 release_ts，如 "20260903-153045"）
    pub version_dir: String,
    /// 删除的文件数（与上一版本对比）
    pub deleted_count: u64,
    /// 文件清单 JSON（Vec<ManifestEntry> 的序列化字符串）
    pub manifest_json: String,
    /// 部署步骤 JSON（Vec<DeploymentStep> 的序列化字符串）
    pub steps_json: String,
}

/// manifest 中的单条文件记录
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestEntry {
    pub path: String,
    pub size: u64,
    /// 文件修改时间的 unix 毫秒时间戳（用于增量判断）
    pub mtime_ms: Option<i64>,
}

/// 运行时步骤追踪器：记录每一步的状态、时间，最后序列化为 steps_json
pub(crate) struct StepTracker {
    steps: Vec<deployment_repo::DeploymentStep>,
    started_at: i64,
    current_step: Option<String>,
}

impl StepTracker {
    pub(crate) fn new() -> Self {
        Self {
            steps: vec![
                deployment_repo::DeploymentStep {
                    key: STEP_VALIDATE.to_string(),
                    name: "校验配置".to_string(),
                    status: "pending".to_string(),
                    message: String::new(),
                    percent: 0,
                    started_at: None,
                    finished_at: None,
                },
                deployment_repo::DeploymentStep {
                    key: STEP_PRECHECK.to_string(),
                    name: "环境检测".to_string(),
                    status: "pending".to_string(),
                    message: String::new(),
                    percent: 0,
                    started_at: None,
                    finished_at: None,
                },
                deployment_repo::DeploymentStep {
                    key: STEP_CONFIG.to_string(),
                    name: "生成配置".to_string(),
                    status: "pending".to_string(),
                    message: String::new(),
                    percent: 0,
                    started_at: None,
                    finished_at: None,
                },
                deployment_repo::DeploymentStep {
                    key: STEP_UPLOAD.to_string(),
                    name: "上传静态文件".to_string(),
                    status: "pending".to_string(),
                    message: String::new(),
                    percent: 0,
                    started_at: None,
                    finished_at: None,
                },
                deployment_repo::DeploymentStep {
                    key: STEP_SWITCH.to_string(),
                    name: "蓝绿切换".to_string(),
                    status: "pending".to_string(),
                    message: String::new(),
                    percent: 0,
                    started_at: None,
                    finished_at: None,
                },
                deployment_repo::DeploymentStep {
                    key: STEP_NGINX.to_string(),
                    name: "Nginx 配置".to_string(),
                    status: "pending".to_string(),
                    message: String::new(),
                    percent: 0,
                    started_at: None,
                    finished_at: None,
                },
                deployment_repo::DeploymentStep {
                    key: STEP_VERIFY.to_string(),
                    name: "可达性验证".to_string(),
                    status: "pending".to_string(),
                    message: String::new(),
                    percent: 0,
                    started_at: None,
                    finished_at: None,
                },
                deployment_repo::DeploymentStep {
                    key: STEP_CLEANUP.to_string(),
                    name: "清理旧版本".to_string(),
                    status: "pending".to_string(),
                    message: String::new(),
                    percent: 0,
                    started_at: None,
                    finished_at: None,
                },
                deployment_repo::DeploymentStep {
                    key: STEP_DONE.to_string(),
                    name: "部署完成".to_string(),
                    status: "pending".to_string(),
                    message: String::new(),
                    percent: 0,
                    started_at: None,
                    finished_at: None,
                },
            ],
            started_at: now_ms(),
            current_step: None,
        }
    }

    /// 更新进度：自动检测步骤切换（上一步自动 finish，新步骤自动 start）
    pub(crate) fn progress(&mut self, key: &str, message: &str, percent: u8) {
        let now = now_ms();
        // 如果切换了步骤，先结束上一步
        if self.current_step.as_deref() != Some(key) {
            // 结束上一步
            if let Some(prev_key) = &self.current_step {
                if let Some(prev_step) = self.steps.iter_mut().find(|s| s.key == *prev_key) {
                    if prev_step.status == "running" {
                        prev_step.status = "success".to_string();
                        prev_step.percent = 100;
                        prev_step.finished_at = Some(now);
                    }
                }
            }
            // 开始新步骤
            if let Some(step) = self.steps.iter_mut().find(|s| s.key == key) {
                step.status = "running".to_string();
                step.started_at = Some(now);
            }
            self.current_step = Some(key.to_string());
        }
        // 更新当前步骤的进度
        if let Some(step) = self.steps.iter_mut().find(|s| s.key == key) {
            step.message = message.to_string();
            step.percent = percent;
        }
    }

    /// 部署成功完成：标记所有已开始的步骤为 success
    pub(crate) fn finalize_success(&mut self) {
        let now = now_ms();
        for step in self.steps.iter_mut() {
            if step.status == "running" {
                step.status = "success".to_string();
                step.percent = 100;
                step.finished_at = Some(now);
            }
        }
    }

    /// 部署失败：标记当前步骤为 failed，后续步骤为 skipped
    pub(crate) fn finalize_failure(&mut self, error_msg: &str) {
        let now = now_ms();
        let mut failed = false;
        for step in self.steps.iter_mut() {
            if failed {
                step.status = "skipped".to_string();
            } else if step.status == "running" {
                step.status = "failed".to_string();
                step.message = error_msg.to_string();
                step.finished_at = Some(now);
                failed = true;
            }
        }
        // 如果还没开始任何步骤就失败了，标记第一步为 failed
        if !failed {
            if let Some(first) = self.steps.first_mut() {
                first.status = "failed".to_string();
                first.message = error_msg.to_string();
                first.started_at = Some(now);
                first.finished_at = Some(now);
            }
        }
    }

    /// 序列化为 JSON 字符串
    pub(crate) fn to_json(&self) -> String {
        serde_json::to_string(&self.steps).unwrap_or_else(|_| "[]".to_string())
    }
}

/// 服务运行状态（路线B：Nginx 静态托管）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceStatus {
    pub is_running: bool,
    pub healthz_code: String,
    pub health_ok: bool,
    pub current_version: String,
}

