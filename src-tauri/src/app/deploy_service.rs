//! 部署服务（路线B：纯静态 Nginx 托管）。
//!
//! 拆分为以下子模块，各模块通过 `use super::*;` 共享本文件的导入与公共类型：
//! - [`types`]：步骤常量、DTO（`DeployProgress` / `DeployOutcome` / `ManifestEntry` / `ServiceStatus`）与 `StepTracker`
//! - [`preflight`]：环境预检（Nginx 可用性、目录可写性、SSL 证书探测）
//! - [`nginx`]：Nginx 站点配置生成/安装与代理层验证
//! - [`cleanup`]：旧版本清理
//! - [`manifest`]：文件清单生成与增量比对
//! - [`readiness`]：部署前就绪检查
//! - [`pipeline`]：部署主流程（校验 → 预检 → 上传 → 蓝绿切换 → 验证 → 清理）
//! - [`service_ops`]：服务状态查询 / 重启 / 停止 / 回滚
//! - [`paths`]：本地 dist 目录解析

use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde::Serialize;

use crate::core::automation::now_ms;
use crate::app::remote_desktop_service::run_ssh_command_with_timeout;
use crate::app::remote_exec_service::{RemoteExecRequest, RemoteExecService};
use crate::app::sftp_service::{ProgressCtx, SftpService};
use crate::core::error::{io_err, Error, Result};
use crate::core::types::{Site, SshConnectionInfo};
use crate::infra::logging::debug_log;
use crate::infra::storage::connection_repo::ConnectionRepo;
use crate::infra::storage::database::Database;
use crate::infra::storage::deployment_repo::{self, DeploymentRow};
use crate::infra::storage::site_repo::SiteRepo;
use crate::infra::storage::site_domain_repo::SiteDomainRepo;

mod cleanup;
mod manifest;
mod nginx;
mod paths;
mod pipeline;
mod preflight;
mod readiness;
mod service_ops;
mod types;

pub use types::{DeployOutcome, DeployProgress, ManifestEntry, ServiceStatus};
pub use types::{
    STEP_CLEANUP, STEP_CONFIG, STEP_DONE, STEP_NGINX, STEP_PRECHECK, STEP_SWITCH, STEP_UPLOAD,
    STEP_VALIDATE, STEP_VERIFY,
};

pub(crate) use types::{StepTracker, KEEP_RELEASES};
pub(crate) use manifest::{build_manifest, dist_unchanged, local_stats};
pub(crate) use nginx::nginx_site_config;

pub struct DeployService;

/// 部署前就绪检查的问题项（site_deploy_check 返回，前端据此显式呈现阻断点）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeployReadinessIssue {
    /// error | warning | info
    pub level: String,
    pub code: String,
    pub message: String,
    pub hint: Option<String>,
}

/// 部署前就绪检查结果（路线B：静态托管）。
/// 只读诊断，不拉取二进制、不写库。
/// 检查项：站点 / 连接 / 远程路径 / 本地 dist / Nginx 可用性。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeployReadiness {
    pub ok: bool,
    pub site_id: String,
    pub site_name: Option<String>,
    pub connection_id: Option<String>,
    pub connection_name: Option<String>,
    pub remote_path: Option<String>,
    pub local_dist_exists: bool,
    /// 远程服务器 Nginx 是否可用
    pub nginx_available: Option<bool>,
    pub issues: Vec<DeployReadinessIssue>,
}

/// 环境预检结果（路线B：仅 Nginx + 静态文件）
pub(crate) struct PreflightResult {
    nginx_available: bool,     // Nginx 是否已安装
    dir_writable: bool,        // 远程目录是否可写
}

/// 注册部署记录到资源表（用于资源关联与全局搜索）。
fn register_deployment_resource(db: &Database, row: &DeploymentRow) {
    use crate::infra::storage::resource_repo;

    let resource_row = resource_repo::ResourceRow {
        id: resource_repo::resource_id("deployment", &row.id),
        kind: resource_repo::ResourceKind::Deployment.as_str().to_string(),
        ref_id: row.id.clone(),
        name: format!("部署 {} ({})", row.site_id, row.status),
        meta_json: serde_json::json!({
            "site_id": row.site_id,
            "connection_id": row.connection_id,
            "status": row.status,
            "trigger_type": row.trigger_type,
            "started_at": row.started_at,
            "finished_at": row.finished_at,
            "duration_ms": row.duration_ms,
            "uploaded_count": row.uploaded_count,
            "total_bytes": row.total_bytes,
        })
        .to_string(),
        created_at: row.started_at,
        updated_at: row.finished_at.unwrap_or(row.started_at),
    };

    if let Err(e) = resource_repo::upsert(db, &resource_row) {
        tracing::warn!("[deploy] 注册部署资源失败: {}", e);
    }
}

/// 部署链路 trace：写入全部 debug.log 位置（含项目根的 `logs/debug.log`）。
///
/// 部署流程跨越校验、预检、Nginx 配置、上传、符号链接切换、验证等多个阶段，且大量
/// 判定依赖**远端命令的输出内容**而非退出码；只靠返回给前端的 `log` 向量，
/// 一旦中途失败就无从还原现场。这里复用 `debug_log` 的结构化 trace，把每个
/// 阶段、每条远端命令及其输出都落到 debug.log。
///
/// `secrets` 中的字符串会先经 [`debug_log::redact`] 掩码：debug.log 是需要
/// 拿去给他人排查问题的，SSH 口令、数据库口令、JWT 密钥绝不能落盘。
pub fn deploy_trace(
    run_id: &str,
    level: &str,
    phase: &str,
    event: &str,
    detail: &str,
    secrets: &[&str],
) {
    let shown = if secrets.is_empty() {
        detail.to_string()
    } else {
        debug_log::redact(detail, secrets)
    };
    debug_log::deploy(level, run_id, phase, event, &shown);
}

// `io_err` 现由 `crate::core::error::io_err` 提供（返回 `Error::IoWithContext`，
// 包含操作描述、路径与底层 `std::io::Error`，避免 `#[from]` 自动转换时丢失现场）。
// 见 `src/core/error.rs`。