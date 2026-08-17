use crate::core::error::Result;
use crate::core::types::{Site, SiteSummary};
use crate::infra::storage::database::Database;

const SITE_COLUMNS: &str = "id, name, domain, local_workdir, connection_id, deploy_config_json, \
     build_config_json, theme_id, theme_config_json, status, last_deployed_at, created_at, updated_at";

fn row_to_site(row: &rusqlite::Row) -> rusqlite::Result<Site> {
    Ok(Site {
        id: row.get(0)?,
        name: row.get(1)?,
        domain: row.get(2)?,
        local_workdir: row.get(3)?,
        connection_id: row.get(4)?,
        deploy_config_json: row.get(5)?,
        build_config_json: row.get(6)?,
        theme_id: row.get(7)?,
        theme_config_json: row.get(8)?,
        status: row.get(9)?,
        last_deployed_at: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}

pub struct SiteRepo;

impl SiteRepo {
    pub fn insert(db: &Database, site: &Site) -> Result<()> {
        let conn = db.conn();
        conn.execute(
            "INSERT INTO sites (id, name, domain, local_workdir, connection_id, deploy_config_json, \
             build_config_json, theme_id, theme_config_json, status, last_deployed_at, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            rusqlite::params![
                site.id,
                site.name,
                site.domain,
                site.local_workdir,
                site.connection_id,
                site.deploy_config_json,
                site.build_config_json,
                site.theme_id,
                site.theme_config_json,
                site.status,
                site.last_deployed_at,
                site.created_at,
                site.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn update(db: &Database, site: &Site) -> Result<usize> {
        let conn = db.conn();
        let n = conn.execute(
            "UPDATE sites SET name = ?2, domain = ?3, local_workdir = ?4, connection_id = ?5, \
             deploy_config_json = ?6, build_config_json = ?7, theme_id = ?8, theme_config_json = ?9, \
             status = ?10, updated_at = ?11 \
             WHERE id = ?1",
            rusqlite::params![
                site.id,
                site.name,
                site.domain,
                site.local_workdir,
                site.connection_id,
                site.deploy_config_json,
                site.build_config_json,
                site.theme_id,
                site.theme_config_json,
                site.status,
                site.updated_at,
            ],
        )?;
        Ok(n)
    }

    pub fn get_by_id(db: &Database, id: &str) -> Result<Option<Site>> {
        let conn = db.conn();
        let mut stmt =
            conn.prepare(&format!("SELECT {} FROM sites WHERE id = ?1", SITE_COLUMNS))?;
        let mut rows = stmt.query_map([id], row_to_site)?;
        match rows.next() {
            Some(row) => Ok(Some(row?)),
            None => Ok(None),
        }
    }

    pub fn workdir_taken(db: &Database, local_workdir: &str, exclude_id: Option<&str>) -> Result<bool> {
        let conn = db.conn();
        let n: i64 = match exclude_id {
            Some(exclude) => conn.query_row(
                "SELECT COUNT(*) FROM sites WHERE local_workdir = ?1 AND id != ?2",
                rusqlite::params![local_workdir, exclude],
                |r| r.get(0),
            )?,
            None => conn.query_row(
                "SELECT COUNT(*) FROM sites WHERE local_workdir = ?1",
                rusqlite::params![local_workdir],
                |r| r.get(0),
            )?,
        };
        Ok(n > 0)
    }

    /// FR-S2 聚合视图：站点 + 草稿数/已发布数。connection_online 留空（M2 接入探测）。
    pub fn list_summaries(db: &Database) -> Result<Vec<SiteSummary>> {
        let conn = db.conn();
        let mut stmt = conn.prepare(&format!(
            "SELECT {cols}, \
                (SELECT COUNT(*) FROM contents c WHERE c.site_id = s.id \
                    AND c.deleted_at IS NULL AND c.status = 'draft'), \
                (SELECT COUNT(*) FROM contents c WHERE c.site_id = s.id \
                    AND c.deleted_at IS NULL AND c.status = 'published') \
             FROM sites s ORDER BY s.created_at DESC",
            cols = SITE_COLUMNS
                .split(", ")
                .map(|c| format!("s.{}", c))
                .collect::<Vec<_>>()
                .join(", ")
        ))?;
        let rows = stmt.query_map([], |row| {
            let site = row_to_site(row)?;
            Ok(SiteSummary {
                site,
                draft_count: row.get(13)?,
                published_count: row.get(14)?,
                connection_online: None,
            })
        })?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
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

    fn sample_site(id: &str, workdir: &str) -> Site {
        Site {
            id: id.to_string(),
            name: format!("Site {}", id),
            domain: String::new(),
            local_workdir: workdir.to_string(),
            connection_id: None,
            deploy_config_json: "{}".to_string(),
            build_config_json: "{}".to_string(),
            theme_id: "craft-blog".to_string(),
            theme_config_json: "{}".to_string(),
            status: "active".to_string(),
            last_deployed_at: None,
            created_at: 1000,
            updated_at: 1000,
        }
    }

    #[test]
    fn insert_then_summary_counts_contents() {
        let db = test_db();
        SiteRepo::insert(&db, &sample_site("site-a", "/tmp/a")).unwrap();
        let summaries = SiteRepo::list_summaries(&db).unwrap();
        assert_eq!(summaries.len(), 1);
        assert_eq!(summaries[0].draft_count, 0);

        // 注意：作用域结束必须释放 db 锁，否则下面 list_summaries 同线程二次加锁会死锁
        {
            let conn = db.conn();
            conn.execute(
                "INSERT INTO contents (id, site_id, type, title, slug, status, created_at, updated_at) \
                 VALUES ('c1', 'site-a', 'post', 'Hello', 'hello', 'draft', 1, 1)",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO contents (id, site_id, type, title, slug, status, published_at, created_at, updated_at) \
                 VALUES ('c2', 'site-a', 'post', 'World', 'world', 'published', 5, 1, 1)",
                [],
            )
            .unwrap();
            // 回收站内容不计入统计
            conn.execute(
                "INSERT INTO contents (id, site_id, type, title, slug, status, deleted_at, created_at, updated_at) \
                 VALUES ('c3', 'site-a', 'post', 'Gone', 'gone', 'draft', 9, 1, 1)",
                [],
            )
            .unwrap();
        }
        let summaries = SiteRepo::list_summaries(&db).unwrap();
        assert_eq!(summaries[0].draft_count, 1);
        assert_eq!(summaries[0].published_count, 1);
    }

    #[test]
    fn workdir_uniqueness_check() {
        let db = test_db();
        SiteRepo::insert(&db, &sample_site("site-a", "/tmp/a")).unwrap();
        assert!(SiteRepo::workdir_taken(&db, "/tmp/a", None).unwrap());
        assert!(!SiteRepo::workdir_taken(&db, "/tmp/a", Some("site-a")).unwrap());
        assert!(!SiteRepo::workdir_taken(&db, "/tmp/b", None).unwrap());
    }
}
