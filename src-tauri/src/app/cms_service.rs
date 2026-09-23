use crate::core::automation::now_ms;
use crate::app::remote_desktop_service::run_ssh_command_with_timeout;
use crate::core::error::{Error, Result};
use crate::core::types::{ConnectionConfig, Content, ContentListFilter, ContentTag, ContentTagSummary, ContentVersion, Site, SiteSummary, SshConnectionInfo};
use crate::infra::storage::connection_repo::ConnectionRepo;
use crate::infra::storage::database::Database;
use crate::infra::storage::resource_repo::ResourceKind;
use crate::infra::storage::tag_repo::TagRepo;
use crate::infra::storage::version_repo::VersionRepo;
use crate::infra::storage::{content_repo::ContentRepo, site_repo::SiteRepo, site_domain_repo::SiteDomainRepo};
use crate::app::resource_service::ResourceService;
use sha2::{Digest, Sha256};

/// 版本快照 JSON（FR-C7）：title/slug/category/summary/content_md/SEO/状态。
fn snapshot_json(content: &Content) -> String {
    serde_json::json!({
        "title": content.title,
        "slug": content.slug,
        "category": content.category,
        "summary": content.summary,
        "content_md": content.content_md,
        "content_json": content.content_json,
        "seo_title": content.seo_title,
        "seo_description": content.seo_description,
        "blocks_json": content.blocks_json,
        "status": content.status,
    })
    .to_string()
}

pub struct CmsService;

/// 默认构建配置（build_config_json），结构契约见 cms-database-design.md §4.2。
const DEFAULT_BUILD_CONFIG: &str = r#"{
  "dist_dir": "dist",
  "posts_per_page": 10,
  "exclude": [],
  "generate": { "rss": true, "sitemap": true, "robots": true, "archive": true, "tags": true }
}"#;

/// 默认部署配置（deploy_config_json），结构契约见 cms-database-design.md §4.1。
const DEFAULT_DEPLOY_CONFIG: &str = r#"{
  "mode": "sftp",
  "remote_path": "",
  "delete_orphaned": false,
  "post_deploy_commands": [],
  "environments": []
}"#;

/// 默认部署配置合并可选远程路径（deploy_config_json 契约见 cms-database-design.md §4.1）。
fn build_deploy_config(remote_path: Option<&str>) -> String {
    let mut config: serde_json::Value =
        serde_json::from_str(DEFAULT_DEPLOY_CONFIG).unwrap_or(serde_json::json!({}));
    if let Some(rp) = remote_path.map(str::trim).filter(|s| !s.is_empty()) {
        config["remote_path"] = serde_json::Value::String(rp.to_string());
    }
    config.to_string()
}

impl CmsService {
    // ---------- 站点 ----------

    /// FR-S1 站点创建。免费版站点数量上限的 Feature Gate 属 M2 门控体系，
    /// M1 单站点即免费形态，此处不拦截（见 PRD 4.10 / M2 验收标准）。
    pub fn create_site(
        db: &Database,
        name: &str,
        domain: &str,
        local_workdir: &str,
        connection_id: Option<&str>,
        remote_path: Option<&str>,
        // 保留入参以维持命令契约；路线B静态托管不需要数据库
        _db_type: Option<&str>,
    ) -> Result<Site> {
        let name = name.trim();
        let workdir = local_workdir.trim();
        if name.is_empty() {
            return Err(Error::Cms("站点名称不能为空".into()));
        }
        // local_workdir 不再强制必填：站点创建时可留空，绑定已发布网站时自动同步。
        // 仅当非空时才做唯一性校验。
        if !workdir.is_empty() && SiteRepo::workdir_taken(db, workdir, None)? {
            return Err(Error::Cms(format!("工作目录已被其他站点使用: {}", workdir)));
        }
        // 站点必须部署到远程服务器：不再支持「仅本地」形态（先在连接管理中创建 SSH 连接）。
        let connection_id = connection_id.map(|s| s.trim()).filter(|s| !s.is_empty());
        if connection_id.is_none() {
            return Err(Error::Cms(
                "新建站点前必须先在「连接」中创建至少一台远程服务器".into(),
            ));
        }
        // 路线B：静态托管，不需要数据库，固定 none
        let db_type = "none".to_string();
        let deploy_config_json = build_deploy_config(remote_path);
        let now = now_ms();
        let site = Site {
            id: format!("site-{}", uuid::Uuid::new_v4()),
            name: name.to_string(),
            domain: domain.trim().to_string(),
            local_workdir: workdir.to_string(),
            connection_id: connection_id.map(|s| s.to_string()),
            deploy_config_json,
            build_config_json: DEFAULT_BUILD_CONFIG.to_string(),
            theme_id: "craft-blog".to_string(),
            theme_config_json: "{}".to_string(),
            db_type,
            status: "active".to_string(),
            last_deployed_at: None,
            created_at: now,
            updated_at: now,
        };
        SiteRepo::insert(db, &site)?;
        // 同步插入 site_domains 记录（主域名）
        if !site.domain.is_empty() {
            if let Err(e) = SiteDomainRepo::insert(db, &crate::core::types::SiteDomain {
                id: format!("domain-{}", uuid::Uuid::new_v4()),
                site_id: site.id.clone(),
                domain: site.domain.clone(),
                is_primary: true,
                created_at: now,
            }) {
                tracing::warn!("[cms] 插入 site_domains 失败（不影响创建）: {}", e);
            }
        }
        // 最佳努力登记为统一资源，并与绑定服务器建立 runs_on 关系
        if let Err(e) = ResourceService::register(
            db,
            ResourceKind::Site,
            &site.id,
            &site.name,
            serde_json::json!({
                "domain": site.domain,
                "status": site.status,
                "dbType": &site.db_type,
                "connectionId": site.connection_id,
            }),
        ) {
            tracing::warn!("[cms] 登记站点资源失败（不影响创建）: {}", e);
        }
        if let Some(conn_id) = &site.connection_id {
            if let Err(e) = ResourceService::link(
                db,
                ResourceKind::Site,
                &site.id,
                ResourceKind::Connection,
                conn_id,
                "runs_on",
            ) {
                tracing::warn!("[cms] 关联站点→连接资源失败（不影响创建）: {}", e);
            }
        }
        Ok(site)
    }

    /// 在绑定的远程服务器上初始化站点目录结构。
    /// 创建远程路径目录及必要的子目录（dist/、.config/systemd/user），
    /// 确保后续部署流程可以直接上传文件。
    pub fn init_remote_site(db: &Database, site_id: &str) -> Result<()> {
        let site = Self::require_site(db, site_id)?;
        let conn_id = site.connection_id.as_deref()
            .ok_or_else(|| Error::Cms("站点未绑定服务器，无法初始化远程目录".into()))?;

        let conn = ConnectionRepo::get_by_id(db, conn_id)?
            .ok_or_else(|| Error::Cms(format!("绑定的服务器连接不存在: {}", conn_id)))?;

        let ssh: SshConnectionInfo = serde_json::from_str(&conn.config_json)
            .map_err(|e| Error::Cms(format!("服务器连接配置解析失败: {}", e)))?;

        let deploy_config: serde_json::Value =
            serde_json::from_str(&site.deploy_config_json).unwrap_or(serde_json::json!({}));
        let remote = deploy_config["remote_path"].as_str().unwrap_or("").trim().to_string();
        if remote.is_empty() {
            return Err(Error::Cms("远程部署路径为空，请先填写远程路径".into()));
        }

        // 创建远程目录结构：站点根目录 + dist 目录 + systemd user 目录
        let cmd = format!(
            "mkdir -p '{0}/dist' '{0}/.config/systemd/user' && echo '目录初始化成功: {0}'",
            remote
        );
        run_ssh_command_with_timeout(&ssh, &cmd, 30)
            .map_err(|e| Error::Cms(format!("远程目录初始化失败: {}", e)))?;

        Ok(())
    }

    pub fn update_site(db: &Database, site: &Site) -> Result<Site> {
        let mut site = site.clone();
        if site.name.trim().is_empty() {
            return Err(Error::Cms("站点名称不能为空".into()));
        }
        // local_workdir 不再强制必填：允许为空（绑定网站时自动同步）
        if !site.local_workdir.trim().is_empty()
            && SiteRepo::workdir_taken(db, site.local_workdir.trim(), Some(&site.id))?
        {
            return Err(Error::Cms(format!("工作目录已被其他站点使用: {}", site.local_workdir)));
        }
        site.name = site.name.trim().to_string();
        let new_domain = site.domain.trim().to_string();
        site.domain = new_domain.clone();
        site.local_workdir = site.local_workdir.trim().to_string();
        site.updated_at = now_ms();
        let n = SiteRepo::update(db, &site)?;
        if n == 0 {
            return Err(Error::Cms(format!("站点不存在: {}", site.id)));
        }
        // 同步 site_domains：如果主域名变更，更新 site_domains 记录
        if !new_domain.is_empty() {
            let existing = SiteDomainRepo::list_by_site(db, &site.id)?;
            let found = existing.iter().find(|d| d.domain == new_domain);
            match found {
                Some(d) if d.is_primary => { /* 已是主域名，无需操作 */ }
                Some(d) => {
                    // 存在但不是主域名 → 设为主域名
                    SiteDomainRepo::set_primary(db, &site.id, &d.id)?;
                }
                None => {
                    // 不存在 → 插入并设为主域名
                    // 先清除其他域名的主域名标记
                    let conn = db.conn();
                    let _ = conn.execute(
                        "UPDATE site_domains SET is_primary = 0 WHERE site_id = ?1",
                        [&site.id],
                    );
                    if let Err(e) = SiteDomainRepo::insert(db, &crate::core::types::SiteDomain {
                        id: format!("domain-{}", uuid::Uuid::new_v4()),
                        site_id: site.id.clone(),
                        domain: new_domain.clone(),
                        is_primary: true,
                        created_at: now_ms(),
                    }) {
                        tracing::warn!("[cms] 更新 site_domains 失败（不影响保存）: {}", e);
                    }
                }
            }
        }
        Ok(site)
    }

    pub fn get_site(db: &Database, id: &str) -> Result<Option<Site>> {
        SiteRepo::get_by_id(db, id)
    }

    pub fn list_sites(db: &Database) -> Result<Vec<SiteSummary>> {
        SiteRepo::list_summaries(db)
    }

    pub fn archive_site(db: &Database, id: &str) -> Result<()> {
        let mut site = Self::require_site(db, id)?;
        site.status = "archived".to_string();
        site.updated_at = now_ms();
        SiteRepo::update(db, &site)?;
        Ok(())
    }

    /// 永久删除站点及其所有内容（不可恢复）。
    pub fn delete_site(db: &Database, id: &str) -> Result<()> {
        Self::require_site(db, id)?;
        // 删除站点相关的所有内容、标签、版本等数据
        let conn = db.conn();
        conn.execute("DELETE FROM contents WHERE site_id = ?1", [id])?;
        conn.execute("DELETE FROM content_tags WHERE site_id = ?1", [id])?;
        conn.execute("DELETE FROM content_versions WHERE site_id = ?1", [id])?;
        conn.execute("DELETE FROM deployments WHERE site_id = ?1", [id])?;
        conn.execute("DELETE FROM site_domains WHERE site_id = ?1", [id])?;
        // 删除站点本身
        let n = SiteRepo::delete(db, id)?;
        if n == 0 {
            return Err(Error::Cms(format!("站点不存在: {}", id)));
        }
        Ok(())
    }

    fn require_site(db: &Database, id: &str) -> Result<Site> {
        SiteRepo::get_by_id(db, id)?.ok_or_else(|| Error::Cms(format!("站点不存在: {}", id)))
    }

    // ---------- 内容 ----------

    /// 新建空白草稿。slug 由标题推导；标题为空或无可保留字符时回退短 ID，
    /// 避免多篇空草稿撞上 (site_id, type, slug) 部分唯一索引。
    pub fn create_content(db: &Database, site_id: &str, content_type: &str, title: &str) -> Result<Content> {
        Self::require_site(db, site_id)?;
        if content_type != "post" && content_type != "page" {
            return Err(Error::Cms(format!("未知内容类型: {}", content_type)));
        }
        let title = title.trim();
        let now = now_ms();
        let content = Content {
            id: format!("content-{}", uuid::Uuid::new_v4()),
            site_id: site_id.to_string(),
            content_type: content_type.to_string(),
            title: if title.is_empty() { "无标题".to_string() } else { title.to_string() },
            slug: String::new(),
            category: String::new(),
            summary: String::new(),
            cover_media_id: None,
            content_json: String::new(),
            content_md: String::new(),
            content_hash: String::new(),
            seo_title: String::new(),
            seo_description: String::new(),
            og_image_media_id: None,
            status: "draft".to_string(),
            scheduled_at: None,
            published_at: None,
            pinned: false,
            deleted_at: None,
            created_at: now,
            updated_at: now,
            blocks_json: String::new(),
            tags: Vec::new(),
        };
        let content = Self::finalize_slug(db, content, None)?;
        ContentRepo::insert(db, &content)?;
        Ok(content)
    }

    /// 保存（全量字段由前端编辑器状态给出）。服务端职责：
    /// 重新计算 content_hash、推导/校验 slug、拒绝跨站点改挂与类型变更。
    pub fn save_content(db: &Database, input: &Content) -> Result<Content> {
        let existing = ContentRepo::get_by_id(db, &input.id)?
            .ok_or_else(|| Error::Cms(format!("内容不存在: {}", input.id)))?;
        if existing.deleted_at.is_some() {
            return Err(Error::Cms("回收站中的内容不能编辑，请先恢复".into()));
        }
        let mut content = input.clone();
        content.site_id = existing.site_id;
        content.content_type = existing.content_type;
        content.status = existing.status.clone();
        content.scheduled_at = existing.scheduled_at;
        content.published_at = existing.published_at;
        content.deleted_at = None;
        content.created_at = existing.created_at;
        content.title = content.title.trim().to_string();
        if content.title.is_empty() {
            return Err(Error::Cms("标题不能为空".into()));
        }
        content.content_hash = Self::compute_hash(&content);
        content.updated_at = now_ms();

        let content = Self::finalize_slug(db, content, Some(&existing.slug))?;
        let n = ContentRepo::update(db, &content)?;
        if n == 0 {
            return Err(Error::Cms(format!("内容不存在: {}", content.id)));
        }
        Ok(content)
    }

    pub fn get_content(db: &Database, id: &str) -> Result<Option<Content>> {
        ContentRepo::get_by_id(db, id)
    }

    pub fn list_contents(db: &Database, site_id: &str, filter: &ContentListFilter) -> Result<Vec<Content>> {
        ContentRepo::list(db, site_id, filter)
    }

    /// draft/scheduled → published。published_at 只记首次上线（repo 层 COALESCE）。
    pub fn publish_content(db: &Database, id: &str) -> Result<Content> {
        let c = Self::require_content(db, id)?;
        if c.deleted_at.is_some() {
            return Err(Error::Cms("回收站中的内容不能发布，请先恢复".into()));
        }
        let now = now_ms();
        let first_publish = c.published_at.is_none();
        ContentRepo::set_status(db, id, "published", None, if first_publish { Some(now) } else { None }, now)?;
        let published = Self::require_content(db, id)?;
        // 每次发布自动存版本快照（FR-C7，trigger=publish）
        Self::snapshot(db, &published, "publish", "")?;
        Ok(published)
    }

    /// published → draft（状态机"撤回"）。published_at 保留首次上线时间。
    pub fn unpublish_content(db: &Database, id: &str) -> Result<Content> {
        let c = Self::require_content(db, id)?;
        if c.status != "published" {
            return Err(Error::Cms("仅已发布内容可撤回".into()));
        }
        ContentRepo::set_status(db, id, "draft", None, None, now_ms())?;
        Self::require_content(db, id)
    }

    pub fn delete_content(db: &Database, id: &str) -> Result<()> {
        Self::require_content(db, id)?;
        let n = ContentRepo::soft_delete(db, id, now_ms())?;
        if n == 0 {
            return Err(Error::Cms(format!("内容已在回收站: {}", id)));
        }
        Ok(())
    }

    /// 恢复时若 slug 已被新内容占用，要求先改名（cms-database-design.md §2.2）。
    pub fn restore_content(db: &Database, id: &str) -> Result<Content> {
        let c = Self::require_content(db, id)?;
        if c.deleted_at.is_none() {
            return Err(Error::Cms("内容不在回收站".into()));
        }
        if ContentRepo::slug_taken(db, &c.site_id, &c.content_type, &c.slug, Some(&c.id))? {
            return Err(Error::Cms(format!(
                "slug \"{}\" 已被其他内容使用，请先修改 slug 再恢复",
                c.slug
            )));
        }
        ContentRepo::restore(db, id, now_ms())?;
        Self::require_content(db, id)
    }

    pub fn purge_content(db: &Database, id: &str) -> Result<()> {
        Self::require_content(db, id)?;
        ContentRepo::purge(db, id)?;
        Ok(())
    }

    pub fn toggle_content_pin(db: &Database, id: &str, pinned: bool) -> Result<()> {
        let n = ContentRepo::toggle_pin(db, id, pinned, now_ms())?;
        if n == 0 {
            return Err(Error::Cms(format!("内容不存在或已在回收站: {}", id)));
        }
        Ok(())
    }

    fn require_content(db: &Database, id: &str) -> Result<Content> {
        ContentRepo::get_by_id(db, id)?.ok_or_else(|| Error::Cms(format!("内容不存在: {}", id)))
    }

    // ---------- 标签（FR-C8） ----------

    pub fn list_tags(db: &Database, site_id: &str) -> Result<Vec<ContentTag>> {
        Self::require_site(db, site_id)?;
        TagRepo::list(db, site_id)
    }

    pub fn list_tag_summaries(db: &Database, site_id: &str) -> Result<Vec<ContentTagSummary>> {
        Self::require_site(db, site_id)?;
        TagRepo::list_summaries(db, site_id)
    }

    /// 创建标签。同名（大小写不敏感）拒绝，名称去首尾空白。
    pub fn create_tag(db: &Database, site_id: &str, name: &str) -> Result<ContentTag> {
        Self::require_site(db, site_id)?;
        let name = name.trim();
        if name.is_empty() {
            return Err(Error::Cms("标签名称不能为空".into()));
        }
        if TagRepo::name_taken(db, site_id, name, None)? {
            return Err(Error::Cms(format!("标签已存在: {}", name)));
        }
        let tag = ContentTag {
            id: format!("tag-{}", uuid::Uuid::new_v4()),
            site_id: site_id.to_string(),
            name: name.to_string(),
        };
        TagRepo::insert(db, &tag)?;
        Ok(tag)
    }

    pub fn rename_tag(db: &Database, tag_id: &str, name: &str) -> Result<ContentTag> {
        let tag = TagRepo::get_by_id(db, tag_id)?
            .ok_or_else(|| Error::Cms(format!("标签不存在: {}", tag_id)))?;
        let name = name.trim();
        if name.is_empty() {
            return Err(Error::Cms("标签名称不能为空".into()));
        }
        if TagRepo::name_taken(db, &tag.site_id, name, Some(tag_id))? {
            return Err(Error::Cms(format!("标签已存在: {}", name)));
        }
        TagRepo::rename(db, tag_id, name)?;
        TagRepo::get_by_id(db, tag_id)?.ok_or_else(|| Error::Cms("标签不存在".into()))
    }

    pub fn delete_tag(db: &Database, tag_id: &str) -> Result<()> {
        let n = TagRepo::delete(db, tag_id)?;
        if n == 0 {
            return Err(Error::Cms(format!("标签不存在: {}", tag_id)));
        }
        Ok(())
    }

    /// 读取内容已挂标签（名称数组，供编辑器回显）。
    pub fn list_content_tags(db: &Database, content_id: &str) -> Result<Vec<String>> {
        Self::require_content(db, content_id)?;
        TagRepo::list_names_for_content(db, content_id)
    }

    /// 全量替换内容标签。tag_ids 必须属于同一站点，否则拒绝。
    pub fn set_content_tags(db: &Database, content_id: &str, tag_ids: &[String]) -> Result<()> {
        let content = Self::require_content(db, content_id)?;
        for tag_id in tag_ids {
            let tag = TagRepo::get_by_id(db, tag_id)?
                .ok_or_else(|| Error::Cms(format!("标签不存在: {}", tag_id)))?;
            if tag.site_id != content.site_id {
                return Err(Error::Cms("标签与内容不属于同一站点".into()));
            }
        }
        TagRepo::set_content_tags(db, content_id, tag_ids)?;
        Ok(())
    }

    // ---------- 版本历史（FR-C7） ----------

    /// 将内容当前态写入版本快照（trigger: manual | publish | rollback）。
    fn snapshot(db: &Database, content: &Content, trigger: &str, comment: &str) -> Result<()> {
        VersionRepo::insert(
            db,
            &content.id,
            &snapshot_json(content),
            trigger,
            comment,
            now_ms(),
        )?;
        VersionRepo::prune(db, &content.id)?;
        Ok(())
    }

    /// 手动"存版本"（FR-C7）。
    pub fn save_content_version(db: &Database, content_id: &str, comment: &str) -> Result<ContentVersion> {
        let content = Self::require_content(db, content_id)?;
        if content.deleted_at.is_some() {
            return Err(Error::Cms("回收站中的内容不能存版本".into()));
        }
        let comment = comment.trim();
        let version = VersionRepo::insert(
            db,
            &content.id,
            &snapshot_json(&content),
            "manual",
            comment,
            now_ms(),
        )?;
        VersionRepo::prune(db, &content.id)?;
        Ok(version)
    }

    /// 内容版本列表（最新在前）。
    pub fn list_content_versions(db: &Database, content_id: &str) -> Result<Vec<ContentVersion>> {
        Self::require_content(db, content_id)?;
        VersionRepo::list(db, content_id)
    }

    /// 回滚到指定版本：先自动存当前态（trigger=rollback），再从快照恢复内容。
    pub fn rollback_content(db: &Database, content_id: &str, version_no: i64) -> Result<Content> {
        let content = Self::require_content(db, content_id)?;
        if content.deleted_at.is_some() {
            return Err(Error::Cms("回收站中的内容不能回滚".into()));
        }
        let version = VersionRepo::get_by_version_no(db, content_id, version_no)?
            .ok_or_else(|| Error::Cms(format!("版本 {} 不存在", version_no)))?;
        // 回滚前自动存当前态
        Self::snapshot(db, &content, "rollback", &format!("回滚前快照 (v{})", version_no))?;
        let snap: serde_json::Value = serde_json::from_str(&version.snapshot_json)
            .map_err(|e| Error::Cms(format!("版本快照损坏: {}", e)))?;
        let next = Content {
            title: snap["title"].as_str().unwrap_or(&content.title).to_string(),
            slug: snap["slug"].as_str().unwrap_or(&content.slug).to_string(),
            category: snap["category"].as_str().unwrap_or("").to_string(),
            summary: snap["summary"].as_str().unwrap_or("").to_string(),
            content_md: snap["content_md"].as_str().unwrap_or("").to_string(),
            content_json: snap["content_json"].as_str().unwrap_or("").to_string(),
            seo_title: snap["seo_title"].as_str().unwrap_or("").to_string(),
            seo_description: snap["seo_description"].as_str().unwrap_or("").to_string(),
            blocks_json: snap["blocks_json"].as_str().unwrap_or("").to_string(),
            ..content
        };
        let next = Self::finalize_slug(db, next, Some(&content.slug))?;
        ContentRepo::update(db, &next)?;
        Self::require_content(db, content_id)
    }

    /// slug 推导与冲突处理：
    /// 1) 前端显式给出的合法 slug 直接采用；2) 否则从标题生成；3) 冲突时加 `-2/-3…` 后缀。
    /// prev_slug = 保存前的旧 slug：未改标题且 slug 未变时跳过冲突推导，保持稳定。
    fn finalize_slug(db: &Database, mut content: Content, prev_slug: Option<&str>) -> Result<Content> {
        let requested = slugify(&content.slug);
        let from_title = slugify(&content.title);
        let base = if !requested.is_empty() { requested } else { from_title };
        let base = if base.is_empty() {
            content.id.chars().rev().take(8).collect::<String>()
        } else {
            base
        };
        // 未显式改 slug（请求空或与旧值相同）时，标题未变也不必重算——直接沿用旧值
        if let Some(prev) = prev_slug {
            if !prev.is_empty() && slugify(prev) == base {
                content.slug = prev.to_string();
                return Ok(content);
            }
        }
        let mut candidate = base.clone();
        let mut counter = 2;
        while ContentRepo::slug_taken(db, &content.site_id, &content.content_type, &candidate, Some(&content.id))? {
            candidate = format!("{}-{}", base, counter);
            counter += 1;
        }
        content.slug = candidate;
        Ok(content)
    }

    /// content_hash = sha256(标题 + 正文 MD + 元数据)，增量构建指纹（ssg-engine-design.md §5）。
    fn compute_hash(c: &Content) -> String {
        let mut hasher = Sha256::new();
        hasher.update(c.title.as_bytes());
        hasher.update(b"\x00");
        hasher.update(c.content_md.as_bytes());
        hasher.update(b"\x00");
        hasher.update(c.category.as_bytes());
        hasher.update(b"\x00");
        hasher.update(c.summary.as_bytes());
        hasher.update(b"\x00");
        hasher.update(c.seo_title.as_bytes());
        hasher.update(b"\x00");
        hasher.update(c.seo_description.as_bytes());
        hasher.update(b"\x00");
        hasher.update(c.blocks_json.as_bytes());
        let digest = hasher.finalize();
        digest.iter().map(|b| format!("{:02x}", b)).collect()
    }
}

/// slug 规则（cms-database-design.md §2.2）：小写字母数字与连字符；
/// 空格/下划线→连字符，连续连压缩为一，去首尾连字符。非 ASCII（如中文标题）全部剔除。
fn slugify(input: &str) -> String {
    let s: String = input
        .trim()
        .to_lowercase()
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() {
                c
            } else if c == ' ' || c == '-' || c == '_' {
                '-'
            } else {
                '\0'
            }
        })
        .filter(|c| *c != '\0')
        .collect();
    let mut out = String::new();
    let mut prev_dash = false;
    for c in s.chars() {
        if c == '-' {
            if !prev_dash && !out.is_empty() {
                out.push('-');
            }
            prev_dash = true;
        } else {
            out.push(c);
            prev_dash = false;
        }
    }
    while out.ends_with('-') {
        out.pop();
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infra::storage::migrations;

    fn test_db() -> Database {
        let mut conn = rusqlite::Connection::open_in_memory().unwrap();
        migrations::run_migrations(&mut conn).unwrap();
        Database::from_connection(conn)
    }

    /// 站点必须绑定服务器，测试用：写入一台 SSH 连接并返回其 id。
    fn seed_connection(db: &Database, name: &str) -> String {
        let conn = ConnectionConfig {
            id: format!("conn-{}", name.to_lowercase().replace(' ', "-")),
            name: name.to_string(),
            connection_type: "ssh".to_string(),
            config_json: serde_json::json!({
                "host": "127.0.0.1",
                "port": 22,
                "username": "root",
                "auth_method": "password",
            })
            .to_string(),
            created_at: now_ms(),
        };
        ConnectionRepo::save(db, &conn).unwrap();
        conn.id
    }

    fn seeded(db: &Database) -> String {
        let conn_id = seed_connection(db, "Test Server");
        let site = CmsService::create_site(db, "My Site", "example.com", "/tmp/site", Some(&conn_id), None, None).unwrap();
        site.id
    }

    #[test]
    fn slug_generation_and_dedup() {
        let db = test_db();
        let site_id = seeded(&db);
        let c1 = CmsService::create_content(&db, &site_id, "post", "Hello World!").unwrap();
        assert_eq!(c1.slug, "hello-world");
        let c2 = CmsService::create_content(&db, &site_id, "post", "Hello World!").unwrap();
        assert_eq!(c2.slug, "hello-world-2");
        // 中文标题无 ASCII 残留 → 回退短 ID，两篇空草稿不冲突
        let c3 = CmsService::create_content(&db, &site_id, "post", "你好世界").unwrap();
        assert!(!c3.slug.is_empty());
        assert_ne!(c3.slug, c1.slug);
    }

    #[test]
    fn save_recomputes_hash_and_keeps_status() {
        let db = test_db();
        let site_id = seeded(&db);
        let c = CmsService::create_content(&db, &site_id, "post", "First").unwrap();
        let published = CmsService::publish_content(&db, &c.id).unwrap();
        assert_eq!(published.status, "published");

        let mut edited = published.clone();
        edited.content_md = "# First\n\nbody".to_string();
        let saved = CmsService::save_content(&db, &edited).unwrap();
        // 编辑已发布内容不改变发布状态，且 hash 随正文变化
        assert_eq!(saved.status, "published");
        assert_eq!(saved.published_at, published.published_at);
        assert_ne!(saved.content_hash, published.content_hash);
        assert!(!saved.content_hash.is_empty());
    }

    #[test]
    fn publish_unpublish_keeps_first_published_at() {
        let db = test_db();
        let site_id = seeded(&db);
        let c = CmsService::create_content(&db, &site_id, "post", "P").unwrap();
        let p1 = CmsService::publish_content(&db, &c.id).unwrap();
        let draft = CmsService::unpublish_content(&db, &c.id).unwrap();
        assert_eq!(draft.status, "draft");
        let p2 = CmsService::publish_content(&db, &c.id).unwrap();
        assert_eq!(p1.published_at, p2.published_at);
    }

    #[test]
    fn delete_restore_conflict_requires_rename() {
        let db = test_db();
        let site_id = seeded(&db);
        let c = CmsService::create_content(&db, &site_id, "post", "Unique Title").unwrap();
        CmsService::delete_content(&db, &c.id).unwrap();

        // 回收站里重建同名 slug 内容
        CmsService::create_content(&db, &site_id, "post", "Unique Title").unwrap();
        let err = CmsService::restore_content(&db, &c.id).unwrap_err();
        assert!(err.to_string().contains("已被其他内容使用"));

        // 改名后恢复成功
        let mut renamed = c.clone();
        renamed.slug = "unique-title-restored".to_string();
        CmsService::save_content(&db, &renamed).unwrap_err(); // 回收站内不可编辑
        let conn = db.conn();
        conn.execute(
            "UPDATE contents SET slug = 'unique-title-restored' WHERE id = ?1",
            rusqlite::params![c.id],
        )
        .unwrap();
        drop(conn);
        let restored = CmsService::restore_content(&db, &c.id).unwrap();
        assert_eq!(restored.slug, "unique-title-restored");
    }

    #[test]
    fn workdir_conflict_rejected() {
        let db = test_db();
        seeded(&db);
        let conn_id = seed_connection(&db, "Conflict Server");
        let err = CmsService::create_site(&db, "Another", "", "/tmp/site", Some(&conn_id), None, None).unwrap_err();
        assert!(err.to_string().contains("已被其他站点使用"));
        // 换目录成功，且远程部署路径落入 deploy_config_json
        let site = CmsService::create_site(&db, "Another", "", "/tmp/site2", Some(&conn_id), Some("/var/www"), None).unwrap();
        let deploy: serde_json::Value = serde_json::from_str(&site.deploy_config_json).unwrap();
        assert_eq!(deploy["remote_path"], "/var/www");
        assert_eq!(deploy["mode"], "sftp");
    }

    #[test]
    fn slugify_rules() {
        assert_eq!(slugify("Hello World!"), "hello-world");
        assert_eq!(slugify("  Multiple   Spaces  "), "multiple-spaces");
        assert_eq!(slugify("a--b__c"), "a-b-c");
        assert_eq!(slugify("trailing-dash-"), "trailing-dash");
        assert_eq!(slugify("中文标题"), "");
        assert_eq!(slugify("Post 2026"), "post-2026");
    }
}
