use std::sync::Arc;

use serde::Deserialize;
use tauri::{AppHandle, Emitter, State};

use crate::app::cms_service::CmsService;
use crate::app::remote_desktop_service::run_ssh_command_with_timeout;
use crate::core::types::{Content, ContentListFilter, ContentTag, ContentTagSummary, ContentVersion, DomainDnsStatus, Site, SiteDomain, SiteSummary};
use crate::core::automation::now_ms;
use crate::infra::storage::connection_repo::ConnectionRepo;
use crate::infra::storage::database::Database;
use crate::infra::storage::site_domain_repo::SiteDomainRepo;
use crate::infra::storage::site_repo::SiteRepo;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSiteInput {
    pub name: String,
    #[serde(default)]
    pub domain: String,
    /// 本地工作目录：可选，留空时绑定网站后自动同步
    #[serde(default)]
    pub local_workdir: String,
    pub connection_id: Option<String>,
    /// 部署远程目录，写入 deploy_config_json.remote_path；未绑定服务器时忽略
    #[serde(default)]
    pub remote_path: Option<String>,
    /// 站点使用的数据库类型：none（默认，纯静态）/ postgresql
    #[serde(default)]
    pub db_type: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateContentInput {
    pub site_id: String,
    #[serde(rename = "type")]
    pub content_type: String,
    #[serde(default)]
    pub title: String,
}

fn emit(app: &AppHandle, event: &str) {
    if let Err(e) = app.emit(event, ()) {
        tracing::warn!("[cms] emit {} failed: {}", event, e);
    }
}

// ---------- 站点 ----------

#[tauri::command]
pub fn site_create(
    input: CreateSiteInput,
    app: AppHandle,
    db: State<'_, Arc<Database>>,
) -> Result<Site, String> {
    let site = CmsService::create_site(
        &db,
        &input.name,
        &input.domain,
        &input.local_workdir,
        input.connection_id.as_deref(),
        input.remote_path.as_deref(),
        input.db_type.as_deref(),
    )
    .map_err(|e| e.to_string())?;
    emit(&app, "sites-changed");
    Ok(site)
}

#[tauri::command]
pub fn site_init_remote(
    site_id: String,
    db: State<'_, Arc<Database>>,
) -> Result<(), String> {
    CmsService::init_remote_site(&db, &site_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn site_list(db: State<'_, Arc<Database>>) -> Result<Vec<SiteSummary>, String> {
    CmsService::list_sites(&db).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn site_get(id: String, db: State<'_, Arc<Database>>) -> Result<Option<Site>, String> {
    CmsService::get_site(&db, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn site_update(site: Site, app: AppHandle, db: State<'_, Arc<Database>>) -> Result<Site, String> {
    let site = CmsService::update_site(&db, &site).map_err(|e| e.to_string())?;
    emit(&app, "sites-changed");
    Ok(site)
}

#[tauri::command]
pub fn site_archive(id: String, app: AppHandle, db: State<'_, Arc<Database>>) -> Result<(), String> {
    CmsService::archive_site(&db, &id).map_err(|e| e.to_string())?;
    emit(&app, "sites-changed");
    Ok(())
}

#[tauri::command]
pub fn site_delete(id: String, app: AppHandle, db: State<'_, Arc<Database>>) -> Result<(), String> {
    CmsService::delete_site(&db, &id).map_err(|e| e.to_string())?;
    emit(&app, "sites-changed");
    Ok(())
}

// ---------- 站点域名 ----------

#[tauri::command]
pub fn site_domain_list(
    site_id: String,
    db: State<'_, Arc<Database>>,
) -> Result<Vec<SiteDomain>, String> {
    SiteDomainRepo::list_by_site(&db, &site_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn site_domain_add(
    site_id: String,
    domain: String,
    is_primary: bool,
    app: AppHandle,
    db: State<'_, Arc<Database>>,
) -> Result<SiteDomain, String> {
    let domain = domain.trim().to_lowercase();
    if domain.is_empty() {
        return Err("域名不能为空".to_string());
    }
    // 检查重复
    let existing = SiteDomainRepo::list_by_site(&db, &site_id).map_err(|e| e.to_string())?;
    if existing.iter().any(|d| d.domain == domain) {
        return Err(format!("域名已存在: {}", domain));
    }
    let mut record = SiteDomain {
        id: format!("domain-{}", uuid::Uuid::new_v4()),
        site_id: site_id.clone(),
        domain: domain.clone(),
        is_primary,
        created_at: now_ms(),
    };
    SiteDomainRepo::insert(&db, &record).map_err(|e| e.to_string())?;
    if is_primary {
        SiteDomainRepo::set_primary(&db, &site_id, &record.id).map_err(|e| e.to_string())?;
    } else {
        // 即使未指定 is_primary，若当前站点无任何主域名，自动提升新域名为首域名的主域名
        let has_primary = existing.iter().any(|d| d.is_primary);
        if !has_primary {
            SiteDomainRepo::set_primary(&db, &site_id, &record.id).map_err(|e| e.to_string())?;
            record.is_primary = true; // 同步内存记录，确保返回前端的状态一致
            tracing::info!("[cms] 域名 {} 自动提升为主域名（站点无主域名）", domain);
        }
    }
    emit(&app, "sites-changed");
    Ok(record)
}

#[tauri::command]
pub fn site_domain_remove(
    domain_id: String,
    app: AppHandle,
    db: State<'_, Arc<Database>>,
) -> Result<(), String> {
    let (n, new_primary) = SiteDomainRepo::delete_with_fallback(&db, &domain_id)
        .map_err(|e| e.to_string())?;
    if n == 0 {
        return Err("域名不存在".to_string());
    }
    tracing::info!("[cms] 域名已删除, 新主域名: {:?}", new_primary);
    emit(&app, "sites-changed");
    Ok(())
}

#[tauri::command]
pub fn site_domain_dns_check(
    site_id: String,
    db: State<'_, Arc<Database>>,
) -> Result<Vec<DomainDnsStatus>, String> {
    let site = SiteRepo::get_by_id(&db, &site_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("站点不存在: {}", site_id))?;

    let conn_id = site.connection_id.as_deref()
        .ok_or_else(|| "站点未绑定服务器，无法检测 DNS".to_string())?;
    let conn = ConnectionRepo::get_by_id(&db, conn_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "绑定的服务器连接不存在".to_string())?;
    let ssh: crate::core::types::SshConnectionInfo =
        serde_json::from_str(&conn.config_json)
            .map_err(|e| format!("服务器连接配置解析失败: {}", e))?;

    // 获取域名列表：优先 site_domains 表，降级到 site.domain
    let domains = SiteDomainRepo::list_domains_by_site(&db, &site_id)
        .map_err(|e| e.to_string())?;
    let domains = if domains.is_empty() && !site.domain.is_empty() {
        vec![site.domain.clone()]
    } else {
        domains
    };

    if domains.is_empty() {
        return Ok(vec![DomainDnsStatus {
            domain: String::new(),
            resolved_ip: None,
            server_ip: None,
            status: "not_checked".to_string(),
            detail: "站点未绑定域名".to_string(),
        }]);
    }

    // 在服务器上执行 DNS 检测：获取服务器公网 IP + 逐域名解析
    // 五级降级：dig → host → nslookup → getent → python3 socket
    let domain_list = domains.join(" ");
    let dns_cmd = format!(
        r#"SERVER_IP=$(curl -s4 --connect-timeout 5 ifconfig.me 2>/dev/null || hostname -I 2>/dev/null | awk '{{print $1}}' || echo '');
echo "SERVER_IP=$SERVER_IP";
for d in {domains}; do
    RESOLVED='';
    if command -v dig >/dev/null 2>&1; then
        RESOLVED=$(dig +short "$d" A 2>/dev/null | grep -E '^[0-9]+\.' | head -1);
    fi
    if [ -z "$RESOLVED" ] && command -v host >/dev/null 2>&1; then
        RESOLVED=$(host -t A "$d" 2>/dev/null | grep "has address" | head -1 | awk '{{print $NF}}');
    fi
    if [ -z "$RESOLVED" ] && command -v nslookup >/dev/null 2>&1; then
        RESOLVED=$(nslookup "$d" 2>/dev/null | grep -E "^Address:?\s" | grep -v '#' | tail -1 | awk '{{print $NF}}');
    fi
    if [ -z "$RESOLVED" ] && command -v getent >/dev/null 2>&1; then
        RESOLVED=$(getent hosts "$d" 2>/dev/null | awk '{{print $1}}' | grep -E '^[0-9]+\.' | head -1);
    fi
    if [ -z "$RESOLVED" ] && command -v python3 >/dev/null 2>&1; then
        RESOLVED=$(python3 -c "import socket,sys; print(socket.gethostbyname(sys.argv[1]))" "$d" 2>/dev/null);
    fi
    echo "DOMAIN=$d:RESOLVED=$RESOLVED";
done"#,
        domains = domain_list
    );

    let output = match run_ssh_command_with_timeout(&ssh, &dns_cmd, 30) {
        Ok(o) => o,
        Err(e) => {
            // SSH 执行失败，返回所有域名 not_checked
            return Ok(domains.into_iter().map(|d| DomainDnsStatus {
                domain: d,
                resolved_ip: None,
                server_ip: None,
                status: "not_checked".to_string(),
                detail: format!("SSH 执行失败: {}", e),
            }).collect());
        }
    };

    // 解析输出
    let mut server_ip: Option<String> = None;
    let mut results: Vec<DomainDnsStatus> = Vec::new();

    for line in output.lines() {
        let line = line.trim();
        if line.starts_with("SERVER_IP=") {
            let ip = line.strip_prefix("SERVER_IP=").unwrap_or("").trim().to_string();
            if !ip.is_empty() {
                server_ip = Some(ip);
            }
        } else if line.starts_with("DOMAIN=") {
            // 格式: DOMAIN=example.com:RESOLVED=1.2.3.4
            let rest = line.strip_prefix("DOMAIN=").unwrap_or("");
            let parts: Vec<&str> = rest.splitn(2, ":RESOLVED=").collect();
            if parts.len() == 2 {
                let d = parts[0].trim().to_string();
                let resolved = parts[1].trim().to_string();
                let resolved_ip = if resolved.is_empty() { None } else { Some(resolved.clone()) };

                let (status, detail) = match &resolved_ip {
                    None => ("unresolved".to_string(),
                        "DNS 无法解析 A 记录，域名未注册或未配置".to_string()),
                    Some(rip) => {
                        match &server_ip {
                            Some(sip) if sip == rip => ("matched".to_string(),
                                format!("解析 IP {} 与服务器 IP {} 匹配", rip, sip)),
                            Some(sip) => ("mismatch".to_string(),
                                format!("解析 IP {} 与服务器 IP {} 不匹配（如使用 CDN 属正常）", rip, sip)),
                            None => ("not_checked".to_string(),
                                format!("域名解析到 {}，服务器 IP 未获取", rip)),
                        }
                    }
                };

                results.push(DomainDnsStatus {
                    domain: d,
                    resolved_ip,
                    server_ip: server_ip.clone(),
                    status,
                    detail,
                });
            }
        }
    }

    // 如果解析失败，补全未检测到的域名
    for d in &domains {
        if !results.iter().any(|r| r.domain == *d) {
            results.push(DomainDnsStatus {
                domain: d.clone(),
                resolved_ip: None,
                server_ip: server_ip.clone(),
                status: "not_checked".to_string(),
                detail: "DNS 检测结果未获取".to_string(),
            });
        }
    }

    Ok(results)
}

#[tauri::command]
pub fn content_create(
    input: CreateContentInput,
    app: AppHandle,
    db: State<'_, Arc<Database>>,
) -> Result<Content, String> {
    let content = CmsService::create_content(&db, &input.site_id, &input.content_type, &input.title)
        .map_err(|e| e.to_string())?;
    emit(&app, "contents-changed");
    Ok(content)
}

#[tauri::command]
pub fn content_list(
    site_id: String,
    filter: Option<ContentListFilter>,
    db: State<'_, Arc<Database>>,
) -> Result<Vec<Content>, String> {
    let filter = filter.unwrap_or_default();
    CmsService::list_contents(&db, &site_id, &filter).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn content_get(id: String, db: State<'_, Arc<Database>>) -> Result<Option<Content>, String> {
    CmsService::get_content(&db, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn content_save(
    content: Content,
    app: AppHandle,
    db: State<'_, Arc<Database>>,
) -> Result<Content, String> {
    let content = CmsService::save_content(&db, &content).map_err(|e| e.to_string())?;
    emit(&app, "contents-changed");
    Ok(content)
}

#[tauri::command]
pub fn content_publish(id: String, app: AppHandle, db: State<'_, Arc<Database>>) -> Result<Content, String> {
    let content = CmsService::publish_content(&db, &id).map_err(|e| e.to_string())?;
    emit(&app, "contents-changed");
    Ok(content)
}

#[tauri::command]
pub fn content_unpublish(id: String, app: AppHandle, db: State<'_, Arc<Database>>) -> Result<Content, String> {
    let content = CmsService::unpublish_content(&db, &id).map_err(|e| e.to_string())?;
    emit(&app, "contents-changed");
    Ok(content)
}

#[tauri::command]
pub fn content_delete(id: String, app: AppHandle, db: State<'_, Arc<Database>>) -> Result<(), String> {
    CmsService::delete_content(&db, &id).map_err(|e| e.to_string())?;
    emit(&app, "contents-changed");
    Ok(())
}

#[tauri::command]
pub fn content_restore(id: String, app: AppHandle, db: State<'_, Arc<Database>>) -> Result<Content, String> {
    let content = CmsService::restore_content(&db, &id).map_err(|e| e.to_string())?;
    emit(&app, "contents-changed");
    Ok(content)
}

#[tauri::command]
pub fn content_purge(id: String, app: AppHandle, db: State<'_, Arc<Database>>) -> Result<(), String> {
    CmsService::purge_content(&db, &id).map_err(|e| e.to_string())?;
    emit(&app, "contents-changed");
    Ok(())
}

#[tauri::command]
pub fn content_set_pinned(id: String, pinned: bool, app: AppHandle, db: State<'_, Arc<Database>>) -> Result<(), String> {
    CmsService::toggle_content_pin(&db, &id, pinned).map_err(|e| e.to_string())?;
    emit(&app, "contents-changed");
    Ok(())
}

// ---------- 标签（FR-C8） ----------

#[tauri::command]
pub fn tag_list(site_id: String, db: State<'_, Arc<Database>>) -> Result<Vec<ContentTag>, String> {
    CmsService::list_tags(&db, &site_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn tag_list_summaries(site_id: String, db: State<'_, Arc<Database>>) -> Result<Vec<ContentTagSummary>, String> {
    CmsService::list_tag_summaries(&db, &site_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn tag_create(
    site_id: String,
    name: String,
    app: AppHandle,
    db: State<'_, Arc<Database>>,
) -> Result<ContentTag, String> {
    let tag = CmsService::create_tag(&db, &site_id, &name).map_err(|e| e.to_string())?;
    emit(&app, "tags-changed");
    Ok(tag)
}

#[tauri::command]
pub fn tag_rename(
    tag_id: String,
    name: String,
    app: AppHandle,
    db: State<'_, Arc<Database>>,
) -> Result<ContentTag, String> {
    let tag = CmsService::rename_tag(&db, &tag_id, &name).map_err(|e| e.to_string())?;
    emit(&app, "tags-changed");
    Ok(tag)
}

#[tauri::command]
pub fn tag_delete(tag_id: String, app: AppHandle, db: State<'_, Arc<Database>>) -> Result<(), String> {
    CmsService::delete_tag(&db, &tag_id).map_err(|e| e.to_string())?;
    emit(&app, "tags-changed");
    Ok(())
}

#[tauri::command]
pub fn content_list_tags(content_id: String, db: State<'_, Arc<Database>>) -> Result<Vec<String>, String> {
    CmsService::list_content_tags(&db, &content_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn content_set_tags(
    content_id: String,
    tag_ids: Vec<String>,
    app: AppHandle,
    db: State<'_, Arc<Database>>,
) -> Result<(), String> {
    CmsService::set_content_tags(&db, &content_id, &tag_ids).map_err(|e| e.to_string())?;
    emit(&app, "contents-changed");
    Ok(())
}

// ---------- 版本历史（FR-C7） ----------

#[tauri::command]
pub fn content_save_version(
    content_id: String,
    comment: String,
    app: AppHandle,
    db: State<'_, Arc<Database>>,
) -> Result<ContentVersion, String> {
    let version = CmsService::save_content_version(&db, &content_id, &comment).map_err(|e| e.to_string())?;
    emit(&app, "contents-changed");
    Ok(version)
}

#[tauri::command]
pub fn content_list_versions(content_id: String, db: State<'_, Arc<Database>>) -> Result<Vec<ContentVersion>, String> {
    CmsService::list_content_versions(&db, &content_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn content_rollback(
    content_id: String,
    version_no: i64,
    app: AppHandle,
    db: State<'_, Arc<Database>>,
) -> Result<Content, String> {
    let content = CmsService::rollback_content(&db, &content_id, version_no).map_err(|e| e.to_string())?;
    emit(&app, "contents-changed");
    Ok(content)
}
