use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::app::deploy_service::{DeployOutcome, DeployProgress, DeployReadiness, DeployService, ServiceStatus};
use crate::app::remote_exec_service::RemoteExecService;
use crate::app::sftp_service::SftpService;
use crate::infra::storage::connection_repo::ConnectionRepo;
use crate::infra::storage::database::Database;
use crate::infra::storage::deployment_repo::{self, DeploymentRow};
use crate::infra::storage::site_repo::SiteRepo;

/// site_healthz 返回值。code=200 表示部署服务在线（healthz 通过）。
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthzResult {
    pub code: Option<u16>,
    pub url: Option<String>,
    pub error: Option<String>,
}

fn emit_progress(app: &AppHandle, site_id: &str, progress: DeployProgress) {
    #[derive(Serialize, Clone)]
    #[serde(rename_all = "camelCase")]
    struct Payload<'a> {
        site_id: &'a str,
        #[serde(flatten)]
        progress: &'a DeployProgress,
    }
    if let Err(e) = app.emit("deploy-progress", Payload { site_id, progress: &progress }) {
        tracing::warn!("[deploy] emit deploy-progress failed: {}", e);
    }
}

fn emit_full_progress(app: &AppHandle, site_id: &str, progress: DeployProgress) {
    #[derive(Serialize, Clone)]
    #[serde(rename_all = "camelCase")]
    struct Payload<'a> {
        site_id: &'a str,
        #[serde(flatten)]
        progress: &'a DeployProgress,
    }
    if let Err(e) = app.emit("full-deploy-progress", Payload { site_id, progress: &progress }) {
        tracing::warn!("[deploy-full] emit full-deploy-progress failed: {}", e);
    }
}

/// 一键部署站点到绑定服务器（M-x3 部署闭环，编排见 deploy_service）。
/// 进度通过 `deploy-progress` 事件流推送；结束统一发 `sites-changed`（last_deployed_at 变化）。
#[tauri::command(async)]
pub fn site_deploy(
    site_id: String,
    app: AppHandle,
    db: State<'_, Arc<Database>>,
    sftp: State<'_, Arc<SftpService>>,
) -> Result<DeployOutcome, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let progress_app = app.clone();
    let progress_site = site_id.clone();
    let on_progress: std::sync::Arc<dyn Fn(DeployProgress) + Send + Sync> =
        std::sync::Arc::new(move |p| emit_progress(&progress_app, &progress_site, p));
    let outcome = DeployService::deploy(&db, &sftp, &site_id, &data_dir, "manual", on_progress)
        .map_err(|e| e.to_string())?;
    if let Err(e) = app.emit("sites-changed", ()) {
        tracing::warn!("[deploy] emit sites-changed failed: {}", e);
    }
    Ok(outcome)
}

#[tauri::command]
pub fn deployment_list(site_id: String, db: State<'_, Arc<Database>>) -> Result<Vec<DeploymentRow>, String> {
    deployment_repo::list_by_site(&db, &site_id, 50).map_err(|e| e.to_string())
}

/// 获取单个部署记录详情
#[tauri::command]
pub fn deployment_get(id: String, db: State<'_, Arc<Database>>) -> Result<Option<DeploymentRow>, String> {
    deployment_repo::get(&db, &id).map_err(|e| e.to_string())
}

/// 按服务器连接查询部署记录（运维中心用）
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeploymentListResult {
    pub items: Vec<DeploymentRow>,
    pub total: i64,
}

#[tauri::command]
pub fn deployment_list_by_connection(
    connection_id: String,
    page: Option<i64>,
    page_size: Option<i64>,
    db: State<'_, Arc<Database>>,
) -> Result<DeploymentListResult, String> {
    let page = page.unwrap_or(1).max(1);
    let page_size = page_size.unwrap_or(20).min(100);
    let offset = (page - 1) * page_size;
    let items = deployment_repo::list_by_connection(&db, &connection_id, page_size, offset)
        .map_err(|e| e.to_string())?;
    let total = deployment_repo::count_by_connection(&db, &connection_id)
        .map_err(|e| e.to_string())?;
    Ok(DeploymentListResult { items, total })
}

/// 聚合某服务器连接下全部部署记录的「工作连续性」指标（覆盖所有历史，不限于当前分页）。
/// 供运维中心「工作连续性」概览使用，让成功率 / 自动化占比 / 连续成功 / 最近部署基于真实全量数据。
#[tauri::command]
pub fn deployment_stats(
    connection_id: String,
    db: State<'_, Arc<Database>>,
) -> Result<deployment_repo::DeploymentStats, String> {
    deployment_repo::stats_by_connection(&db, &connection_id).map_err(|e| e.to_string())
}

/// 查询站点服务运行状态
#[tauri::command(async)]
pub async fn service_get_status(
    site_id: String,
    db: State<'_, Arc<Database>>,
    remote_exec: State<'_, Arc<RemoteExecService>>,
) -> Result<ServiceStatus, String> {
    DeployService::get_service_status(&remote_exec, &db, &site_id)
        .await
        .map_err(|e| e.to_string())
}

/// 重启站点服务
#[tauri::command(async)]
pub async fn service_restart(
    site_id: String,
    db: State<'_, Arc<Database>>,
    remote_exec: State<'_, Arc<RemoteExecService>>,
) -> Result<(), String> {
    DeployService::restart_service(&remote_exec, &db, &site_id)
        .await
        .map_err(|e| e.to_string())
}

/// 停止站点服务
#[tauri::command(async)]
pub async fn service_stop(
    site_id: String,
    db: State<'_, Arc<Database>>,
    remote_exec: State<'_, Arc<RemoteExecService>>,
) -> Result<(), String> {
    DeployService::stop_service(&remote_exec, &db, &site_id)
        .await
        .map_err(|e| e.to_string())
}

/// 启动站点（路线B：从 .disabled 备份恢复 Nginx 配置 + reload）
#[tauri::command(async)]
pub async fn service_start(
    site_id: String,
    db: State<'_, Arc<Database>>,
    remote_exec: State<'_, Arc<RemoteExecService>>,
) -> Result<(), String> {
    DeployService::start_service(&remote_exec, &db, &site_id)
        .await
        .map_err(|e| e.to_string())
}

/// 回滚到指定部署版本
#[tauri::command(async)]
pub async fn deployment_rollback(
    site_id: String,
    deployment_id: String,
    db: State<'_, Arc<Database>>,
    remote_exec: State<'_, Arc<RemoteExecService>>,
) -> Result<(), String> {
    DeployService::rollback_to(&remote_exec, &db, &site_id, &deployment_id)
        .await
        .map_err(|e| e.to_string())
}

/// 探测站点 HTTP 可达性（路线B：Nginx 静态托管，端口 80）。
/// code=200/301/302 即在线；从绑定服务器 host + site.domain 推导 URL，超时 3s。
#[tauri::command(async)]
pub async fn site_healthz(
    site_id: String,
    db: State<'_, Arc<Database>>,
) -> Result<HealthzResult, String> {
    let site = SiteRepo::get_by_id(&db, &site_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("站点不存在: {}", site_id))?;
    let conn_id = site.connection_id.as_deref()
        .ok_or_else(|| "站点未绑定服务器".to_string())?;
    let conn = ConnectionRepo::get_by_id(&db, conn_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "站点绑定的服务器连接不存在".to_string())?;
    let ssh: crate::core::types::SshConnectionInfo =
        serde_json::from_str(&conn.config_json)
            .map_err(|e| format!("服务器连接配置解析失败: {}", e))?;

    // 路线B：检查 Nginx 80 端口 HTTP 可达性，不再探测 /healthz
    // 支持多域名：优先从 site_domains 表获取域名列表，降级到 site.domain
    let mut domains = crate::infra::storage::site_domain_repo::SiteDomainRepo::list_domains_by_site(&db, &site_id)
        .map_err(|e| e.to_string())?;
    let site_domain = site.domain.trim();
    if domains.is_empty() && !site_domain.is_empty() {
        domains.push(site_domain.to_string());
    }
    let host = if domains.is_empty() { &ssh.host } else { &domains[0] };
    let url = format!("http://{}/", host);
    let client = reqwest::Client::new();
    let code = match client
        .get(&url)
        .timeout(std::time::Duration::from_secs(3))
        .send()
        .await
    {
        Ok(resp) => Some(resp.status().as_u16()),
        Err(e) => {
            return Ok(HealthzResult { code: None, url: Some(url), error: Some(e.to_string()) })
        }
    };
    Ok(HealthzResult { code, url: Some(url), error: None })
}

/// 部署前就绪检查：把「为什么不能部署」结构化返回，前端据此在「部署」前显式呈现阻断点。
/// 只读诊断，不写库，覆盖站点/连接/远程路径/本地 dist/远端可达。
#[tauri::command]
pub fn site_deploy_check(
    site_id: String,
    app: AppHandle,
    db: State<'_, Arc<Database>>,
) -> Result<DeployReadiness, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    DeployService::check_readiness(&db, &data_dir, &site_id).map_err(|e| e.to_string())
}

/// 删除单条部署记录
#[tauri::command]
pub fn deployment_delete(
    id: String,
    db: State<'_, Arc<Database>>,
) -> Result<(), String> {
    deployment_repo::delete_by_id(&db, &id).map_err(|e| e.to_string())
}

/// 批量删除部署记录（按 ID 列表）
#[tauri::command]
pub fn deployment_batch_delete(
    ids: Vec<String>,
    db: State<'_, Arc<Database>>,
) -> Result<usize, String> {
    deployment_repo::delete_by_ids(&db, &ids).map_err(|e| e.to_string())
}

/// 清理某个站点的部署历史：保留最近 keep_count 条，删除其余
#[tauri::command]
pub fn deployment_cleanup_site(
    site_id: String,
    keep_count: i64,
    db: State<'_, Arc<Database>>,
) -> Result<usize, String> {
    deployment_repo::cleanup_old_by_site(&db, &site_id, keep_count).map_err(|e| e.to_string())
}

/// 按状态删除部署记录（如清理所有失败的部署）
#[tauri::command]
pub fn deployment_delete_by_status(
    site_id: String,
    status: String,
    db: State<'_, Arc<Database>>,
) -> Result<usize, String> {
    deployment_repo::delete_by_status(&db, &site_id, &status).map_err(|e| e.to_string())
}
