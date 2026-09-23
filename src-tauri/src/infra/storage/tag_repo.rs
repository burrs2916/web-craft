use crate::core::error::Result;
use crate::core::types::{ContentTag, ContentTagSummary};
use crate::infra::storage::database::Database;

pub struct TagRepo;

impl TagRepo {
    /// 站点全部标签，按名称排序。
    pub fn list(db: &Database, site_id: &str) -> Result<Vec<ContentTag>> {
        let conn = db.conn();
        let mut stmt = conn.prepare(
            "SELECT id, site_id, name FROM content_tags WHERE site_id = ?1 ORDER BY name COLLATE NOCASE",
        )?;
        let rows = stmt.query_map([site_id], |r| {
            Ok(ContentTag {
                id: r.get(0)?,
                site_id: r.get(1)?,
                name: r.get(2)?,
            })
        })?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    /// 标签 + 已发布内容计数（供标签管理页展示）。
    pub fn list_summaries(db: &Database, site_id: &str) -> Result<Vec<ContentTagSummary>> {
        let conn = db.conn();
        let mut stmt = conn.prepare(
            "SELECT t.id, t.site_id, t.name, COUNT(l.content_id) AS cnt \
             FROM content_tags t \
             LEFT JOIN content_tag_links l ON l.tag_id = t.id \
             LEFT JOIN contents c ON c.id = l.content_id AND c.deleted_at IS NULL \
             WHERE t.site_id = ?1 \
             GROUP BY t.id ORDER BY t.name COLLATE NOCASE",
        )?;
        let rows = stmt.query_map([site_id], |r| {
            Ok(ContentTagSummary {
                tag: ContentTag {
                    id: r.get(0)?,
                    site_id: r.get(1)?,
                    name: r.get(2)?,
                },
                count: r.get(3)?,
            })
        })?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    pub fn get_by_id(db: &Database, id: &str) -> Result<Option<ContentTag>> {
        let conn = db.conn();
        let mut stmt = conn.prepare("SELECT id, site_id, name FROM content_tags WHERE id = ?1")?;
        let mut rows = stmt.query_map([id], |r| {
            Ok(ContentTag {
                id: r.get(0)?,
                site_id: r.get(1)?,
                name: r.get(2)?,
            })
        })?;
        match rows.next() {
            Some(row) => Ok(Some(row?)),
            None => Ok(None),
        }
    }

    /// 站点内是否已存在同名标签（exclude_id 用于重命名场景）。
    pub fn name_taken(db: &Database, site_id: &str, name: &str, exclude_id: Option<&str>) -> Result<bool> {
        let conn = db.conn();
        let n: i64 = match exclude_id {
            Some(exclude) => conn.query_row(
                "SELECT COUNT(*) FROM content_tags WHERE site_id = ?1 AND name = ?2 AND id != ?3",
                rusqlite::params![site_id, name, exclude],
                |r| r.get(0),
            )?,
            None => conn.query_row(
                "SELECT COUNT(*) FROM content_tags WHERE site_id = ?1 AND name = ?2",
                rusqlite::params![site_id, name],
                |r| r.get(0),
            )?,
        };
        Ok(n > 0)
    }

    pub fn insert(db: &Database, tag: &ContentTag) -> Result<()> {
        let conn = db.conn();
        conn.execute(
            "INSERT INTO content_tags (id, site_id, name) VALUES (?1, ?2, ?3)",
            rusqlite::params![tag.id, tag.site_id, tag.name],
        )?;
        Ok(())
    }

    pub fn rename(db: &Database, id: &str, name: &str) -> Result<usize> {
        let conn = db.conn();
        let n = conn.execute(
            "UPDATE content_tags SET name = ?2 WHERE id = ?1",
            rusqlite::params![id, name],
        )?;
        Ok(n)
    }

    /// 删除标签（content_tag_links 由外键级联清理）。
    pub fn delete(db: &Database, id: &str) -> Result<usize> {
        let conn = db.conn();
        let n = conn.execute("DELETE FROM content_tags WHERE id = ?1", rusqlite::params![id])?;
        Ok(n)
    }

    /// 读取内容已挂标签（按名称，供编辑器回显）。
    pub fn list_names_for_content(db: &Database, content_id: &str) -> Result<Vec<String>> {
        let conn = db.conn();
        let mut stmt = conn.prepare(
            "SELECT t.name FROM content_tags t \
             JOIN content_tag_links l ON l.tag_id = t.id \
             WHERE l.content_id = ?1 ORDER BY t.name COLLATE NOCASE",
        )?;
        let rows = stmt.query_map([content_id], |r| r.get::<_, String>(0))?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    /// 全量替换内容标签（事务内先清后插）。
    pub fn set_content_tags(db: &Database, content_id: &str, tag_ids: &[String]) -> Result<()> {
        let mut conn = db.conn();
        let tx = conn.transaction()?;
        tx.execute(
            "DELETE FROM content_tag_links WHERE content_id = ?1",
            rusqlite::params![content_id],
        )?;
        for tag_id in tag_ids {
            tx.execute(
                "INSERT OR IGNORE INTO content_tag_links (content_id, tag_id) VALUES (?1, ?2)",
                rusqlite::params![content_id, tag_id],
            )?;
        }
        tx.commit()?;
        Ok(())
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

    fn seed(db: &Database) {
        db.conn()
            .execute(
                "INSERT INTO sites (id, name, local_workdir, created_at, updated_at) \
                 VALUES ('site-a', 'A', '/tmp/a', 1, 1)",
                [],
            )
            .unwrap();
        db.conn()
            .execute(
                "INSERT INTO contents (id, site_id, type, title, slug, created_at, updated_at) \
                 VALUES ('c1', 'site-a', 'post', 'T', 't', 1, 1)",
                [],
            )
            .unwrap();
    }

    #[test]
    fn create_list_rename_delete() {
        let db = test_db();
        seed(&db);
        let tag = ContentTag {
            id: "tag-1".into(),
            site_id: "site-a".into(),
            name: "Rust".into(),
        };
        TagRepo::insert(&db, &tag).unwrap();
        assert!(TagRepo::name_taken(&db, "site-a", "Rust", None).unwrap());
        assert!(!TagRepo::name_taken(&db, "site-a", "rust", None).unwrap());
        assert_eq!(TagRepo::list(&db, "site-a").unwrap().len(), 1);
        TagRepo::rename(&db, "tag-1", "Web").unwrap();
        assert_eq!(TagRepo::get_by_id(&db, "tag-1").unwrap().unwrap().name, "Web");
        assert_eq!(TagRepo::delete(&db, "tag-1").unwrap(), 1);
        assert!(TagRepo::list(&db, "site-a").unwrap().is_empty());
    }

    #[test]
    fn set_and_read_content_tags() {
        let db = test_db();
        seed(&db);
        TagRepo::insert(
            &db,
            &ContentTag { id: "tag-1".into(), site_id: "site-a".into(), name: "A".into() },
        )
        .unwrap();
        TagRepo::insert(
            &db,
            &ContentTag { id: "tag-2".into(), site_id: "site-a".into(), name: "B".into() },
        )
        .unwrap();
        TagRepo::set_content_tags(&db, "c1", &["tag-1".into(), "tag-2".into()]).unwrap();
        let names = TagRepo::list_names_for_content(&db, "c1").unwrap();
        assert_eq!(names, vec!["A", "B"]);
        // 全量替换
        TagRepo::set_content_tags(&db, "c1", &["tag-2".into()]).unwrap();
        let names = TagRepo::list_names_for_content(&db, "c1").unwrap();
        assert_eq!(names, vec!["B"]);
        let summaries = TagRepo::list_summaries(&db, "site-a").unwrap();
        assert_eq!(summaries.len(), 2);
        let b = summaries.iter().find(|s| s.tag.name == "B").unwrap();
        assert_eq!(b.count, 1);
    }
}
