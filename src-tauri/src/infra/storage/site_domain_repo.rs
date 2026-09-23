use crate::core::automation::now_ms;
use crate::core::error::Result;
use crate::core::types::SiteDomain;
use crate::infra::storage::database::Database;

fn row_to_site_domain(row: &rusqlite::Row) -> rusqlite::Result<SiteDomain> {
    Ok(SiteDomain {
        id: row.get(0)?,
        site_id: row.get(1)?,
        domain: row.get(2)?,
        is_primary: row.get(3)?,
        created_at: row.get(4)?,
    })
}

const COLUMNS: &str = "id, site_id, domain, is_primary, created_at";

pub struct SiteDomainRepo;

impl SiteDomainRepo {
    /// 查询站点的所有域名，按 is_primary DESC, created_at ASC 排序（主域名在前）。
    pub fn list_by_site(db: &Database, site_id: &str) -> Result<Vec<SiteDomain>> {
        let conn = db.conn();
        let mut stmt = conn.prepare(&format!(
            "SELECT {cols} FROM site_domains WHERE site_id = ?1 ORDER BY is_primary DESC, created_at ASC",
            cols = COLUMNS
        ))?;
        let rows = stmt.query_map([site_id], row_to_site_domain)?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    /// 查询站点的所有域名（纯字符串列表），按 is_primary DESC, created_at ASC 排序。
    pub fn list_domains_by_site(db: &Database, site_id: &str) -> Result<Vec<String>> {
        let conn = db.conn();
        let mut stmt = conn.prepare(
            "SELECT domain FROM site_domains WHERE site_id = ?1 ORDER BY is_primary DESC, created_at ASC",
        )?;
        let rows = stmt.query_map([site_id], |row| row.get::<_, String>(0))?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    pub fn insert(db: &Database, domain: &SiteDomain) -> Result<()> {
        let conn = db.conn();
        conn.execute(
            "INSERT INTO site_domains (id, site_id, domain, is_primary, created_at) \
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![
                domain.id,
                domain.site_id,
                domain.domain,
                domain.is_primary,
                domain.created_at,
            ],
        )?;
        Ok(())
    }

    pub fn delete(db: &Database, id: &str) -> Result<usize> {
        let conn = db.conn();
        let n = conn.execute("DELETE FROM site_domains WHERE id = ?1", [id])?;
        Ok(n)
    }

    /// 删除站点的所有域名（删站点时级联清理）。
    pub fn delete_by_site(db: &Database, site_id: &str) -> Result<usize> {
        let conn = db.conn();
        let n = conn.execute("DELETE FROM site_domains WHERE site_id = ?1", [site_id])?;
        Ok(n)
    }

    /// 设置主域名：先把该站点的所有域名置为非主，再把目标域名置为主域名，
    /// 然后同步 `sites.domain` 冗余字段。
    /// 调用方需保证 domain_id 属于 site_id。
    pub fn set_primary(db: &Database, site_id: &str, domain_id: &str) -> Result<()> {
        let conn = db.conn();
        let tx = conn.unchecked_transaction()?;
        // 1. 清除该站点所有 is_primary
        tx.execute(
            "UPDATE site_domains SET is_primary = 0 WHERE site_id = ?1",
            [site_id],
        )?;
        // 2. 设置目标域名为主域名
        let n = tx.execute(
            "UPDATE site_domains SET is_primary = 1 WHERE id = ?1 AND site_id = ?2",
            rusqlite::params![domain_id, site_id],
        )?;
        if n == 0 {
            tx.rollback()?;
            return Err(crate::core::error::Error::Internal(format!(
                "域名不存在或不属于站点 {}: {}",
                site_id, domain_id
            )));
        }
        // 3. 同步 sites.domain 冗余字段
        let domain: String = tx.query_row(
            "SELECT domain FROM site_domains WHERE id = ?1",
            [domain_id],
            |row| row.get(0),
        )?;
        tx.execute(
            "UPDATE sites SET domain = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![domain, now_ms(), site_id],
        )?;
        tx.commit()?;
        Ok(())
    }

    /// 删除域名后，如果删除的是主域名，自动选最早的一条升为主域名并同步 sites.domain。
    /// 返回 (deleted_count, new_primary_domain)。
    pub fn delete_with_fallback(db: &Database, id: &str) -> Result<(usize, Option<String>)> {
        let conn = db.conn();
        // 先查出该域名的 site_id 和 is_primary
        let (site_id, was_primary): (String, bool) = match conn.query_row(
            "SELECT site_id, is_primary FROM site_domains WHERE id = ?1",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ) {
            Ok(v) => v,
            Err(rusqlite::Error::QueryReturnedNoRows) => {
                return Ok((0, None));
            }
            Err(e) => return Err(e.into()),
        };

        conn.execute("DELETE FROM site_domains WHERE id = ?1", [id])?;

        if !was_primary {
            return Ok((1, None));
        }

        // 删除的是主域名，选最早的一条升为主域名
        let tx = conn.unchecked_transaction()?;
        let new_primary: Option<(String, String)> = tx
            .query_row(
                "SELECT id, domain FROM site_domains WHERE site_id = ?1 \
                 ORDER BY created_at ASC LIMIT 1",
                [&site_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .ok();

        if let Some((new_id, new_domain)) = new_primary {
            tx.execute(
                "UPDATE site_domains SET is_primary = 1 WHERE id = ?1",
                [new_id],
            )?;
            tx.execute(
                "UPDATE sites SET domain = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![new_domain, now_ms(), site_id],
            )?;
            tx.commit()?;
            Ok((1, Some(new_domain)))
        } else {
            // 没有其他域名了，sites.domain 置空
            tx.execute(
                "UPDATE sites SET domain = '', updated_at = ?1 WHERE id = ?2",
                rusqlite::params![now_ms(), site_id],
            )?;
            tx.commit()?;
            Ok((1, None))
        }
    }

    /// 统计站点域名数量。
    pub fn count_by_site(db: &Database, site_id: &str) -> Result<i64> {
        let conn = db.conn();
        let n: i64 = conn.query_row(
            "SELECT COUNT(*) FROM site_domains WHERE site_id = ?1",
            [site_id],
            |row| row.get(0),
        )?;
        Ok(n)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::types::Site;
    use crate::infra::storage::migrations;
    use crate::infra::storage::site_repo::SiteRepo;

    fn test_db() -> Database {
        let mut conn = rusqlite::Connection::open_in_memory().unwrap();
        migrations::run_migrations(&mut conn).unwrap();
        Database::from_connection(conn)
    }

    fn sample_site(id: &str) -> Site {
        Site {
            id: id.to_string(),
            name: format!("Site {}", id),
            domain: String::new(),
            local_workdir: format!("/tmp/{}", id),
            connection_id: None,
            deploy_config_json: "{}".to_string(),
            build_config_json: "{}".to_string(),
            theme_id: "craft-blog".to_string(),
            theme_config_json: "{}".to_string(),
            db_type: "none".to_string(),
            status: "active".to_string(),
            last_deployed_at: None,
            created_at: 1000,
            updated_at: 1000,
        }
    }

    #[test]
    fn test_insert_list_delete() {
        let db = test_db();
        let site = sample_site("site-test");
        SiteRepo::insert(&db, &site).unwrap();

        let d1 = SiteDomain {
            id: "d1".into(),
            site_id: "site-test".into(),
            domain: "example.com".into(),
            is_primary: true,
            created_at: 1000,
        };
        let d2 = SiteDomain {
            id: "d2".into(),
            site_id: "site-test".into(),
            domain: "www.example.com".into(),
            is_primary: false,
            created_at: 2000,
        };
        SiteDomainRepo::insert(&db, &d1).unwrap();
        SiteDomainRepo::insert(&db, &d2).unwrap();

        let list = SiteDomainRepo::list_by_site(&db, "site-test").unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].domain, "example.com");
        assert!(list[0].is_primary);

        let domains = SiteDomainRepo::list_domains_by_site(&db, "site-test").unwrap();
        assert_eq!(domains, vec!["example.com", "www.example.com"]);

        assert_eq!(SiteDomainRepo::count_by_site(&db, "site-test").unwrap(), 2);

        SiteDomainRepo::delete(&db, "d2").unwrap();
        assert_eq!(SiteDomainRepo::count_by_site(&db, "site-test").unwrap(), 1);
    }

    #[test]
    fn test_set_primary() {
        let db = test_db();
        let site = sample_site("site-sp");
        SiteRepo::insert(&db, &site).unwrap();

        let d1 = SiteDomain {
            id: "d1".into(),
            site_id: "site-sp".into(),
            domain: "a.com".into(),
            is_primary: true,
            created_at: 1000,
        };
        let d2 = SiteDomain {
            id: "d2".into(),
            site_id: "site-sp".into(),
            domain: "b.com".into(),
            is_primary: false,
            created_at: 2000,
        };
        SiteDomainRepo::insert(&db, &d1).unwrap();
        SiteDomainRepo::insert(&db, &d2).unwrap();

        // Set d2 as primary
        SiteDomainRepo::set_primary(&db, "site-sp", "d2").unwrap();

        let list = SiteDomainRepo::list_by_site(&db, "site-sp").unwrap();
        assert!(list.iter().find(|d| d.id == "d2").unwrap().is_primary);
        assert!(!list.iter().find(|d| d.id == "d1").unwrap().is_primary);

        // sites.domain should be synced
        let site = SiteRepo::get_by_id(&db, "site-sp").unwrap().unwrap();
        assert_eq!(site.domain, "b.com");
    }

    #[test]
    fn test_delete_with_fallback() {
        let db = test_db();
        let site = sample_site("site-fb");
        SiteRepo::insert(&db, &site).unwrap();
        let d1 = SiteDomain {
            id: "d1".into(),
            site_id: "site-fb".into(),
            domain: "a.com".into(),
            is_primary: true,
            created_at: 1000,
        };
        let d2 = SiteDomain {
            id: "d2".into(),
            site_id: "site-fb".into(),
            domain: "b.com".into(),
            is_primary: false,
            created_at: 2000,
        };
        SiteDomainRepo::insert(&db, &d1).unwrap();
        SiteDomainRepo::insert(&db, &d2).unwrap();

        // Delete primary domain → d2 should auto-promote
        let (n, new_primary) = SiteDomainRepo::delete_with_fallback(&db, "d1").unwrap();
        assert_eq!(n, 1);
        assert_eq!(new_primary.as_deref(), Some("b.com"));

        let list = SiteDomainRepo::list_by_site(&db, "site-fb").unwrap();
        assert_eq!(list.len(), 1);
        assert!(list[0].is_primary);
        assert_eq!(list[0].domain, "b.com");

        let site = SiteRepo::get_by_id(&db, "site-fb").unwrap().unwrap();
        assert_eq!(site.domain, "b.com");

        // Delete last domain → sites.domain should be empty
        let (n, new_primary) = SiteDomainRepo::delete_with_fallback(&db, "d2").unwrap();
        assert_eq!(n, 1);
        assert!(new_primary.is_none());

        let site = SiteRepo::get_by_id(&db, "site-fb").unwrap().unwrap();
        assert_eq!(site.domain, "");
    }
}
