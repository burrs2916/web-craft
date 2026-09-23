use crate::core::automation::now_ms;
use crate::core::error::Result;
use crate::infra::storage::automation_repo::AutomationTaskRepo;
use crate::infra::storage::connection_repo::ConnectionRepo;
use crate::infra::storage::database::Database;
use crate::infra::storage::deployment_repo;
use crate::infra::storage::resource_repo::{
    self, parse_meta, ResourceKind, ResourceLinkRow, ResourceRow,
};
use crate::infra::storage::session_repo::SessionRepo;
use crate::infra::storage::site_repo::SiteRepo;
use serde_json::{json, Value};

/// 统一资源服务：把连接 / 站点 / 部署 / 终端 / 自动化 等领域对象登记为
/// 可互链、可查询、可互相调用的「资源」，构成 web-craft 的统一整体。
///
/// 设计要点：
/// - 每个领域对象在 `resources` 中有一条目录条目，id = `res-{kind}-{ref_id}`（幂等）。
/// - 对象之间的关系（站点 runs_on 连接、部署 deploys_to 连接、自动化 uses 连接…）
///   写入 `resource_links`，形成互联图，供前端统一资源中心交叉跳转。
/// - `reconcile_all` 把存量数据一次性纳入统一体；新数据在各 save 路径最佳努力登记。
pub struct ResourceService;

impl ResourceService {
    /// 登记（或更新）一个资源。meta 为该种类相关的结构化元数据。
    pub fn register(
        db: &Database,
        kind: ResourceKind,
        ref_id: &str,
        name: &str,
        meta: Value,
    ) -> Result<ResourceRow> {
        let now = now_ms();
        let row = ResourceRow {
            id: resource_repo::resource_id(kind.as_str(), ref_id),
            kind: kind.as_str().to_string(),
            ref_id: ref_id.to_string(),
            name: name.to_string(),
            meta_json: serde_json::to_string(&meta).unwrap_or_else(|_| "{}".to_string()),
            created_at: now,
            updated_at: now,
        };
        resource_repo::upsert(db, &row)?;
        Ok(row)
    }

    /// 建立资源间关系边（幂等）。
    pub fn link(
        db: &Database,
        from: ResourceKind,
        from_ref: &str,
        to: ResourceKind,
        to_ref: &str,
        relation: &str,
    ) -> Result<()> {
        let row = ResourceLinkRow {
            id: format!(
                "lnk-{}-{}-{}-{}-{}",
                from.as_str(),
                from_ref,
                to.as_str(),
                to_ref,
                relation
            ),
            from_kind: from.as_str().to_string(),
            from_ref: from_ref.to_string(),
            to_kind: to.as_str().to_string(),
            to_ref: to_ref.to_string(),
            relation: relation.to_string(),
            created_at: now_ms(),
        };
        resource_repo::link(db, &row)
    }

    /// 把存量数据一次性纳入统一资源体（连接 / 站点 / 部署 / 终端 / 自动化），
    /// 并重建它们之间的互联边。幂等，可反复调用。
    pub fn reconcile_all(db: &Database) -> Result<ReconcileSummary> {
        let mut summary = ReconcileSummary::default();

        // ---- 连接 ----
        if let Ok(conns) = ConnectionRepo::list(db) {
            for c in &conns {
                let meta = connection_meta(&c.config_json);
                let _ = Self::register(
                    db,
                    ResourceKind::Connection,
                    &c.id,
                    &c.name,
                    json!({
                        "type": c.connection_type,
                        "host": meta.get("host"),
                        "username": meta.get("username"),
                        "port": meta.get("port"),
                    }),
                );
                summary.connections += 1;
            }
        }

        // ---- 站点 + 站点 runs_on 连接 ----
        if let Ok(sites) = SiteRepo::list_summaries(db) {
            for s in &sites {
                let site = &s.site;
                let _ = Self::register(
                    db,
                    ResourceKind::Site,
                    &site.id,
                    &site.name,
                    json!({
                        "domain": site.domain,
                        "status": site.status,
                        "dbType": site.db_type,
                        "connectionId": site.connection_id,
                    }),
                );
                summary.sites += 1;
                if let Some(conn_id) = &site.connection_id {
                    let _ = Self::link(
                        db,
                        ResourceKind::Site,
                        &site.id,
                        ResourceKind::Connection,
                        conn_id,
                        "runs_on",
                    );
                }

                // ---- 该站点的部署 + 部署 deploys_to 连接 ----
                if let Ok(deps) = deployment_repo::list_by_site(db, &site.id, 200) {
                    for d in &deps {
                        let _ = Self::register(
                            db,
                            ResourceKind::Deployment,
                            &d.id,
                            &format!("部署 {}", &d.id[..8.min(d.id.len())]),
                            json!({
                                "status": d.status,
                                "mode": d.mode,
                                "targetEnv": d.target_env,
                                "serverVersion": d.server_version,
                                "siteId": d.site_id,
                                "connectionId": d.connection_id,
                            }),
                        );
                        summary.deployments += 1;
                        let _ = Self::link(
                            db,
                            ResourceKind::Deployment,
                            &d.id,
                            ResourceKind::Site,
                            &d.site_id,
                            "deploys_to",
                        );
                        if let Some(conn_id) = &d.connection_id {
                            let _ = Self::link(
                                db,
                                ResourceKind::Deployment,
                                &d.id,
                                ResourceKind::Connection,
                                conn_id,
                                "runs_on",
                            );
                        }
                    }
                }
            }
        }

        // ---- 终端会话 ----
        if let Ok(sessions) = SessionRepo::list(db) {
            for t in &sessions {
                let _ = Self::register(
                    db,
                    ResourceKind::Terminal,
                    &t.id,
                    &t.name,
                    json!({
                        "profileId": t.profile_id,
                        "cwd": t.cwd,
                    }),
                );
                summary.terminals += 1;
            }
        }

        // ---- 自动化任务 + uses 连接 ----
        if let Ok(tasks) = AutomationTaskRepo::list(db) {
            for t in &tasks {
                let conn_ids: Vec<String> = t.connection_ids.clone();
                let _ = Self::register(
                    db,
                    ResourceKind::Automation,
                    &t.id,
                    &t.name,
                    json!({
                        "enabled": t.enabled,
                        "connectionIds": conn_ids,
                    }),
                );
                summary.automations += 1;
                for cid in &conn_ids {
                    let _ = Self::link(
                        db,
                        ResourceKind::Automation,
                        &t.id,
                        ResourceKind::Connection,
                        cid,
                        "uses",
                    );
                }
            }
        }

        Ok(summary)
    }

    /// 登记一个终端会话资源，并与站点（opens）/ 连接（connects_to）互联，
    /// 使「连接 / 终端 / 站点」在统一资源体中即时打通（无需等待 reconcile_all）。
    /// 失败仅告警，绝不影响调用方主流程。
    pub fn register_terminal(
        db: &Database,
        session_id: &str,
        site_id: &str,
        connection_id: &str,
        name: &str,
    ) -> Result<()> {
        let label = if name.is_empty() {
            format!("服务器终端 {}", &session_id[..session_id.len().min(8)])
        } else {
            name.to_string()
        };
        Self::register(
            db,
            ResourceKind::Terminal,
            session_id,
            &label,
            json!({ "siteId": site_id, "connectionId": connection_id, "kind": "server" }),
        )?;
        if !site_id.is_empty() {
            let _ = Self::link(
                db,
                ResourceKind::Terminal,
                session_id,
                ResourceKind::Site,
                site_id,
                "opens",
            );
        }
        if !connection_id.is_empty() {
            let _ = Self::link(
                db,
                ResourceKind::Terminal,
                session_id,
                ResourceKind::Connection,
                connection_id,
                "connects_to",
            );
        }
        Ok(())
    }
}

/// 从连接的 config_json 解析出 host / username / port（解析失败返回空对象）。
fn connection_meta(config_json: &str) -> Value {
    let v: Value = serde_json::from_str(config_json).unwrap_or(Value::Object(Default::default()));
    json!({
        "host": v.get("host"),
        "username": v.get("username"),
        "port": v.get("port"),
    })
}

/// reconcile_all 的结果统计。
#[derive(Debug, Default, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReconcileSummary {
    pub connections: u32,
    pub sites: u32,
    pub deployments: u32,
    pub terminals: u32,
    pub automations: u32,
}

/// 便捷：把 meta_json 字符串解析为 Value（供命令层返回）。
pub fn meta_of(row: &ResourceRow) -> Value {
    parse_meta(&row.meta_json)
}
