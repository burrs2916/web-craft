use tauri::State;

use crate::app::resource_service::{meta_of, ReconcileSummary, ResourceService};
use crate::core::error::Result as CoreResult;
use crate::infra::storage::database::Database;
use crate::infra::storage::resource_repo::{
    self, ResourceKind, ResourceLinkRow, ResourceRow,
};

/// 统一资源列表。可选按 kind 过滤（connection/site/deployment/terminal/automation…）。
#[tauri::command]
pub fn resource_list(
    kind: Option<String>,
    limit: Option<i64>,
    db: State<'_, std::sync::Arc<Database>>,
) -> Result<Vec<ResourceRow>, String> {
    let limit = limit.unwrap_or(200).max(1).min(1000);
    let items = match kind.as_deref().and_then(ResourceKind::parse) {
        Some(k) => resource_repo::list_by_kind(&db, k.as_str(), limit),
        None => resource_repo::list_all(&db, limit),
    }
    .map_err(|e| e.to_string())?;
    Ok(items)
}

/// 获取单个资源详情（含解析后的 meta）。
#[tauri::command]
pub fn resource_get(
    id: String,
    db: State<'_, std::sync::Arc<Database>>,
) -> Result<Option<ResourceRow>, String> {
    resource_repo::get(&db, &id).map_err(|e| e.to_string())
}

/// 资源互联边视图：含对端资源，供统一资源中心交叉跳转。
#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceLinkView {
    pub relation: String,
    /// outgoing = 本资源指向对端；incoming = 对端指向本资源
    pub direction: String,
    pub peer: ResourceRow,
}

/// 查询某资源的全部互联边（出边 + 入边），并附带对端资源信息。
#[tauri::command]
pub fn resource_links(
    kind: String,
    ref_id: String,
    db: State<'_, std::sync::Arc<Database>>,
) -> Result<Vec<ResourceLinkView>, String> {
    let k = ResourceKind::parse(&kind)
        .ok_or_else(|| format!("非法的资源种类: {kind}"))?;
    let mut views = Vec::new();

    if let Ok(out) = resource_repo::links_from(&db, k.as_str(), &ref_id) {
        for l in out {
            if let Some(peer) = resource_repo::get_by_ref(&db, &l.to_kind, &l.to_ref)
                .map_err(|e| e.to_string())?
            {
                views.push(ResourceLinkView {
                    relation: l.relation,
                    direction: "outgoing".to_string(),
                    peer,
                });
            }
        }
    }
    if let Ok(incoming) = resource_repo::links_to(&db, k.as_str(), &ref_id) {
        for l in incoming {
            if let Some(peer) = resource_repo::get_by_ref(&db, &l.from_kind, &l.from_ref)
                .map_err(|e| e.to_string())?
            {
                views.push(ResourceLinkView {
                    relation: l.relation,
                    direction: "incoming".to_string(),
                    peer,
                });
            }
        }
    }
    Ok(views)
}

/// 把存量数据纳入统一资源体（连接 / 站点 / 部署 / 终端 / 自动化）并重建互联边。
/// 幂等，可反复调用；也可在应用启动或数据变更后调用以保持统一体最新。
#[tauri::command]
pub fn resource_reconcile(
    db: State<'_, std::sync::Arc<Database>>,
) -> Result<ReconcileSummary, String> {
    ResourceService::reconcile_all(&db).map_err(|e| e.to_string())
}

/// 即时登记一个「服务器终端」会话资源，并与站点（opens）/ 连接（connects_to）互联，
/// 让连接 / 终端 / 站点在统一资源体中即时打通（无需等待 resource_reconcile）。
/// 幂等；失败以字符串返回但不影响主流程。
#[tauri::command]
pub fn register_terminal_resource(
    session_id: String,
    site_id: String,
    connection_id: String,
    name: Option<String>,
    db: State<'_, std::sync::Arc<Database>>,
) -> Result<(), String> {
    ResourceService::register_terminal(
        &db,
        &session_id,
        &site_id,
        &connection_id,
        name.as_deref().unwrap_or(""),
    )
    .map_err(|e| e.to_string())
}

/// 便捷：把资源 meta_json 解析为 Value（命令层导出，供前端直接使用）。
pub fn resource_meta_value(row: &ResourceRow) -> CoreResult<serde_json::Value> {
    Ok(meta_of(row))
}
