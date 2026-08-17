use crate::app::notebook_service::now_ms;
use crate::core::error::{Error, Result};
use crate::core::types::{Content, ContentListFilter, Site, SiteSummary};
use crate::infra::storage::database::Database;
use crate::infra::storage::{content_repo::ContentRepo, site_repo::SiteRepo};
use sha2::{Digest, Sha256};

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

impl CmsService {
    // ---------- 站点 ----------

    /// FR-S1 站点创建。免费版站点数量上限的 Feature Gate 属 M2 门控体系，
    /// M1 单站点即免费形态，此处不拦截（见 PRD 4.10 / M2 验收标准）。
    pub fn create_site(db: &Database, name: &str, domain: &str, local_workdir: &str, connection_id: Option<&str>) -> Result<Site> {
        let name = name.trim();
        let workdir = local_workdir.trim();
        if name.is_empty() {
            return Err(Error::Cms("站点名称不能为空".into()));
        }
        if workdir.is_empty() {
            return Err(Error::Cms("本地工作目录不能为空".into()));
        }
        if SiteRepo::workdir_taken(db, workdir, None)? {
            return Err(Error::Cms(format!("工作目录已被其他站点使用: {}", workdir)));
        }
        let now = now_ms();
        let site = Site {
            id: format!("site-{}", uuid::Uuid::new_v4()),
            name: name.to_string(),
            domain: domain.trim().to_string(),
            local_workdir: workdir.to_string(),
            connection_id: connection_id.map(|s| s.to_string()),
            deploy_config_json: DEFAULT_DEPLOY_CONFIG.to_string(),
            build_config_json: DEFAULT_BUILD_CONFIG.to_string(),
            theme_id: "craft-blog".to_string(),
            theme_config_json: "{}".to_string(),
            status: "active".to_string(),
            last_deployed_at: None,
            created_at: now,
            updated_at: now,
        };
        SiteRepo::insert(db, &site)?;
        Ok(site)
    }

    pub fn update_site(db: &Database, site: &Site) -> Result<Site> {
        let mut site = site.clone();
        if site.name.trim().is_empty() {
            return Err(Error::Cms("站点名称不能为空".into()));
        }
        if site.local_workdir.trim().is_empty() {
            return Err(Error::Cms("本地工作目录不能为空".into()));
        }
        if SiteRepo::workdir_taken(db, site.local_workdir.trim(), Some(&site.id))? {
            return Err(Error::Cms(format!("工作目录已被其他站点使用: {}", site.local_workdir)));
        }
        site.name = site.name.trim().to_string();
        site.domain = site.domain.trim().to_string();
        site.local_workdir = site.local_workdir.trim().to_string();
        site.updated_at = now_ms();
        let n = SiteRepo::update(db, &site)?;
        if n == 0 {
            return Err(Error::Cms(format!("站点不存在: {}", site.id)));
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
        Self::require_content(db, id)
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

    fn seeded(db: &Database) -> String {
        let site = CmsService::create_site(db, "My Site", "example.com", "/tmp/site", None).unwrap();
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
        let err = CmsService::create_site(&db, "Another", "", "/tmp/site", None).unwrap_err();
        assert!(err.to_string().contains("已被其他站点使用"));
        // 换目录成功
        assert!(CmsService::create_site(&db, "Another", "", "/tmp/site2", None).is_ok());
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
