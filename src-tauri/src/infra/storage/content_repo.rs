use crate::core::error::Result;
use crate::core::types::{Content, ContentListFilter};
use crate::infra::storage::database::Database;

const CONTENT_COLUMNS: &str = "id, site_id, type, title, slug, category, summary, cover_media_id, \
     content_json, content_md, content_hash, seo_title, seo_description, og_image_media_id, \
     status, scheduled_at, published_at, pinned, deleted_at, created_at, updated_at";

fn row_to_content(row: &rusqlite::Row) -> rusqlite::Result<Content> {
    let pinned: i64 = row.get(17)?;
    Ok(Content {
        id: row.get(0)?,
        site_id: row.get(1)?,
        content_type: row.get(2)?,
        title: row.get(3)?,
        slug: row.get(4)?,
        category: row.get(5)?,
        summary: row.get(6)?,
        cover_media_id: row.get(7)?,
        content_json: row.get(8)?,
        content_md: row.get(9)?,
        content_hash: row.get(10)?,
        seo_title: row.get(11)?,
        seo_description: row.get(12)?,
        og_image_media_id: row.get(13)?,
        status: row.get(14)?,
        scheduled_at: row.get(15)?,
        published_at: row.get(16)?,
        pinned: pinned != 0,
        deleted_at: row.get(18)?,
        created_at: row.get(19)?,
        updated_at: row.get(20)?,
    })
}

pub struct ContentRepo;

impl ContentRepo {
    pub fn insert(db: &Database, c: &Content) -> Result<()> {
        let conn = db.conn();
        conn.execute(
            "INSERT INTO contents (id, site_id, type, title, slug, category, summary, cover_media_id, \
             content_json, content_md, content_hash, seo_title, seo_description, og_image_media_id, \
             status, scheduled_at, published_at, pinned, deleted_at, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)",
            rusqlite::params![
                c.id,
                c.site_id,
                c.content_type,
                c.title,
                c.slug,
                c.category,
                c.summary,
                c.cover_media_id,
                c.content_json,
                c.content_md,
                c.content_hash,
                c.seo_title,
                c.seo_description,
                c.og_image_media_id,
                c.status,
                c.scheduled_at,
                c.published_at,
                c.pinned as i64,
                c.deleted_at,
                c.created_at,
                c.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn update(db: &Database, c: &Content) -> Result<usize> {
        let conn = db.conn();
        let n = conn.execute(
            "UPDATE contents SET type = ?2, title = ?3, slug = ?4, category = ?5, summary = ?6, \
             cover_media_id = ?7, content_json = ?8, content_md = ?9, content_hash = ?10, \
             seo_title = ?11, seo_description = ?12, og_image_media_id = ?13, pinned = ?14, \
             updated_at = ?15 \
             WHERE id = ?1 AND deleted_at IS NULL",
            rusqlite::params![
                c.id,
                c.content_type,
                c.title,
                c.slug,
                c.category,
                c.summary,
                c.cover_media_id,
                c.content_json,
                c.content_md,
                c.content_hash,
                c.seo_title,
                c.seo_description,
                c.og_image_media_id,
                c.pinned as i64,
                c.updated_at,
            ],
        )?;
        Ok(n)
    }

    pub fn get_by_id(db: &Database, id: &str) -> Result<Option<Content>> {
        let conn = db.conn();
        let mut stmt = conn.prepare(&format!(
            "SELECT {} FROM contents WHERE id = ?1",
            CONTENT_COLUMNS
        ))?;
        let mut rows = stmt.query_map([id], row_to_content)?;
        match rows.next() {
            Some(row) => Ok(Some(row?)),
            None => Ok(None),
        }
    }

    pub fn list(db: &Database, site_id: &str, filter: &ContentListFilter) -> Result<Vec<Content>> {
        let conn = db.conn();
        let include_deleted = filter.include_deleted.unwrap_or(false);
        let mut sql = format!(
            "SELECT {} FROM contents WHERE site_id = ?1",
            CONTENT_COLUMNS
        );
        let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(site_id.to_string())];
        if include_deleted {
            sql.push_str(" AND deleted_at IS NOT NULL");
        } else {
            sql.push_str(" AND deleted_at IS NULL");
        }
        if let Some(t) = &filter.content_type {
            params.push(Box::new(t.clone()));
            sql.push_str(&format!(" AND type = ?{}", params.len()));
        }
        if !include_deleted {
            if let Some(s) = &filter.status {
                params.push(Box::new(s.clone()));
                sql.push_str(&format!(" AND status = ?{}", params.len()));
            }
        }
        if let Some(kw) = &filter.keyword {
            if !kw.trim().is_empty() {
                let like = format!("%{}%", kw.trim());
                params.push(Box::new(like));
                sql.push_str(&format!(" AND (title LIKE ?{} OR slug LIKE ?{})", params.len(), params.len()));
            }
        }
        // 置顶优先，其后按更新时间倒序（最近编辑靠前）
        sql.push_str(" ORDER BY pinned DESC, updated_at DESC");

        let mut stmt = conn.prepare(&sql)?;
        let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        let rows = stmt.query_map(param_refs.as_slice(), row_to_content)?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    /// slug 在同站点同类型下是否已被未删除内容占用（exclude_id 用于自身改名场景）。
    pub fn slug_taken(
        db: &Database,
        site_id: &str,
        content_type: &str,
        slug: &str,
        exclude_id: Option<&str>,
    ) -> Result<bool> {
        let conn = db.conn();
        let n: i64 = match exclude_id {
            Some(exclude) => conn.query_row(
                "SELECT COUNT(*) FROM contents WHERE site_id = ?1 AND type = ?2 AND slug = ?3 \
                 AND deleted_at IS NULL AND id != ?4",
                rusqlite::params![site_id, content_type, slug, exclude],
                |r| r.get(0),
            )?,
            None => conn.query_row(
                "SELECT COUNT(*) FROM contents WHERE site_id = ?1 AND type = ?2 AND slug = ?3 \
                 AND deleted_at IS NULL",
                rusqlite::params![site_id, content_type, slug],
                |r| r.get(0),
            )?,
        };
        Ok(n > 0)
    }

    /// 状态机迁移（cms-database-design.md §5）。返回受影响行数。
    pub fn set_status(
        db: &Database,
        id: &str,
        status: &str,
        scheduled_at: Option<i64>,
        published_at: Option<i64>,
        now: i64,
    ) -> Result<usize> {
        let conn = db.conn();
        let n = conn.execute(
            "UPDATE contents SET status = ?2, scheduled_at = ?3, published_at = COALESCE(?4, published_at), \
             updated_at = ?5 WHERE id = ?1 AND deleted_at IS NULL",
            rusqlite::params![id, status, scheduled_at, published_at, now],
        )?;
        Ok(n)
    }

    /// 软删除进回收站（FR-C8）。
    pub fn soft_delete(db: &Database, id: &str, now: i64) -> Result<usize> {
        let conn = db.conn();
        let n = conn.execute(
            "UPDATE contents SET deleted_at = ?2, updated_at = ?2 WHERE id = ?1 AND deleted_at IS NULL",
            rusqlite::params![id, now],
        )?;
        Ok(n)
    }

    pub fn restore(db: &Database, id: &str, now: i64) -> Result<usize> {
        let conn = db.conn();
        let n = conn.execute(
            "UPDATE contents SET deleted_at = NULL, updated_at = ?2 WHERE id = ?1 AND deleted_at IS NOT NULL",
            rusqlite::params![id, now],
        )?;
        Ok(n)
    }

    pub fn purge(db: &Database, id: &str) -> Result<usize> {
        let conn = db.conn();
        let n = conn.execute("DELETE FROM contents WHERE id = ?1", rusqlite::params![id])?;
        Ok(n)
    }

    pub fn toggle_pin(db: &Database, id: &str, pinned: bool, now: i64) -> Result<usize> {
        let conn = db.conn();
        let n = conn.execute(
            "UPDATE contents SET pinned = ?2, updated_at = ?3 \
             WHERE id = ?1 AND deleted_at IS NULL",
            rusqlite::params![id, pinned as i64, now],
        )?;
        Ok(n)
    }
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

    fn seed_site(db: &Database) {
        db.conn()
            .execute(
                "INSERT INTO sites (id, name, local_workdir, created_at, updated_at) \
                 VALUES ('site-a', 'A', '/tmp/a', 1, 1)",
                [],
            )
            .unwrap();
    }

    fn sample(id: &str, slug: &str) -> Content {
        Content {
            id: id.to_string(),
            site_id: "site-a".to_string(),
            content_type: "post".to_string(),
            title: format!("T {}", id),
            slug: slug.to_string(),
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
            created_at: 1,
            updated_at: 1,
        }
    }

    #[test]
    fn soft_delete_then_restore_cycle() {
        let db = test_db();
        seed_site(&db);
        ContentRepo::insert(&db, &sample("c1", "hello")).unwrap();

        assert_eq!(ContentRepo::soft_delete(&db, "c1", 10).unwrap(), 1);
        // 回收站视图可见，正常列表不可见
        let normal = ContentRepo::list(&db, "site-a", &ContentListFilter::default()).unwrap();
        let trash = ContentRepo::list(
            &db,
            "site-a",
            &ContentListFilter {
                include_deleted: Some(true),
                ..Default::default()
            },
        )
        .unwrap();
        assert!(normal.is_empty());
        assert_eq!(trash.len(), 1);

        // 软删除后同 slug 可新建（部分唯一索引）
        assert!(!ContentRepo::slug_taken(&db, "site-a", "post", "hello", None).unwrap());
        ContentRepo::insert(&db, &sample("c2", "hello")).unwrap();

        // 恢复旧内容时 slug 冲突被唯一索引拦截（服务层负责前置校验并给出改名提示）
        assert!(ContentRepo::slug_taken(&db, "site-a", "post", "hello", Some("c1")).unwrap());
        assert!(ContentRepo::restore(&db, "c1", 20).is_err());
        let conn = db.conn();
        conn.execute(
            "UPDATE contents SET slug = 'hello-old' WHERE id = ?1",
            rusqlite::params!["c1"],
        )
        .unwrap();
        drop(conn);
        assert_eq!(ContentRepo::restore(&db, "c1", 20).unwrap(), 1);
        assert!(ContentRepo::get_by_id(&db, "c1").unwrap().unwrap().deleted_at.is_none());
    }

    #[test]
    fn slug_scoped_by_type() {
        let db = test_db();
        seed_site(&db);
        ContentRepo::insert(&db, &sample("c1", "about")).unwrap();
        // post 与 page 同名 slug 不冲突
        assert!(!ContentRepo::slug_taken(&db, "site-a", "page", "about", None).unwrap());
        assert!(ContentRepo::slug_taken(&db, "site-a", "post", "about", None).unwrap());
    }

    #[test]
    fn publish_sets_published_at_once() {
        let db = test_db();
        seed_site(&db);
        ContentRepo::insert(&db, &sample("c1", "hello")).unwrap();
        ContentRepo::set_status(&db, "c1", "published", None, Some(100), 100).unwrap();
        ContentRepo::set_status(&db, "c1", "draft", None, None, 200).unwrap();
        let c = ContentRepo::get_by_id(&db, "c1").unwrap().unwrap();
        // 撤回后 published_at 保留首次上线时间
        assert_eq!(c.published_at, Some(100));
        assert_eq!(c.status, "draft");
    }
}
