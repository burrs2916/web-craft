use crate::core::error::Result;
use crate::core::types::ContentVersion;
use crate::infra::storage::database::Database;

/// 内容版本快照仓库（content_versions 表，FR-C7）。
/// 快照时机：手动"存版本"、每次发布（trigger=publish）、回滚前自动存当前态。
pub struct VersionRepo;

impl VersionRepo {
    /// 每篇内容保留的最近版本数，超出由 prune 清理。
    pub const KEEP_LATEST: i64 = 50;

    /// 内容版本列表，按版本号倒序（最新在前）。
    pub fn list(db: &Database, content_id: &str) -> Result<Vec<ContentVersion>> {
        let conn = db.conn();
        let mut stmt = conn.prepare(
            "SELECT id, content_id, version_no, snapshot_json, trigger, comment, created_at \
             FROM content_versions WHERE content_id = ?1 ORDER BY version_no DESC",
        )?;
        let rows = stmt.query_map([content_id], |r| {
            Ok(ContentVersion {
                id: r.get(0)?,
                content_id: r.get(1)?,
                version_no: r.get(2)?,
                snapshot_json: r.get(3)?,
                trigger: r.get(4)?,
                comment: r.get(5)?,
                created_at: r.get(6)?,
            })
        })?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    /// 按版本号取快照。
    pub fn get_by_version_no(db: &Database, content_id: &str, version_no: i64) -> Result<Option<ContentVersion>> {
        let conn = db.conn();
        let mut stmt = conn.prepare(
            "SELECT id, content_id, version_no, snapshot_json, trigger, comment, created_at \
             FROM content_versions WHERE content_id = ?1 AND version_no = ?2",
        )?;
        let mut rows = stmt.query_map(rusqlite::params![content_id, version_no], |r| {
            Ok(ContentVersion {
                id: r.get(0)?,
                content_id: r.get(1)?,
                version_no: r.get(2)?,
                snapshot_json: r.get(3)?,
                trigger: r.get(4)?,
                comment: r.get(5)?,
                created_at: r.get(6)?,
            })
        })?;
        match rows.next() {
            Some(row) => Ok(Some(row?)),
            None => Ok(None),
        }
    }

    /// 插入快照，version_no 取该内容当前最大值 + 1（并发安全：UNIQUE(content_id, version_no)）。
    pub fn insert(db: &Database, content_id: &str, snapshot_json: &str, trigger: &str, comment: &str, now: i64) -> Result<ContentVersion> {
        let conn = db.conn();
        let next_no: i64 = conn.query_row(
            "SELECT COALESCE(MAX(version_no), 0) + 1 FROM content_versions WHERE content_id = ?1",
            [content_id],
            |r| r.get(0),
        )?;
        let version = ContentVersion {
            id: format!("ver-{}", uuid::Uuid::new_v4()),
            content_id: content_id.to_string(),
            version_no: next_no,
            snapshot_json: snapshot_json.to_string(),
            trigger: trigger.to_string(),
            comment: comment.to_string(),
            created_at: now,
        };
        conn.execute(
            "INSERT INTO content_versions (id, content_id, version_no, snapshot_json, trigger, comment, created_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![
                version.id,
                version.content_id,
                version.version_no,
                version.snapshot_json,
                version.trigger,
                version.comment,
                version.created_at
            ],
        )?;
        Ok(version)
    }

    /// 保留最近 KEEP_LATEST 个版本，删除更早的（返回删除数）。
    pub fn prune(db: &Database, content_id: &str) -> Result<usize> {
        let conn = db.conn();
        let n = conn.execute(
            "DELETE FROM content_versions WHERE content_id = ?1 AND version_no NOT IN ( \
             SELECT version_no FROM content_versions WHERE content_id = ?1 \
             ORDER BY version_no DESC LIMIT ?2)",
            rusqlite::params![content_id, Self::KEEP_LATEST],
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
    fn insert_auto_increments_and_lists_desc() {
        let db = test_db();
        seed(&db);
        let v1 = VersionRepo::insert(&db, "c1", "{\"title\":\"A\"}", "manual", "first", 1).unwrap();
        let v2 = VersionRepo::insert(&db, "c1", "{\"title\":\"B\"}", "publish", "", 2).unwrap();
        assert_eq!(v1.version_no, 1);
        assert_eq!(v2.version_no, 2);
        let list = VersionRepo::list(&db, "c1").unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].version_no, 2);
        assert_eq!(list[1].version_no, 1);
        let got = VersionRepo::get_by_version_no(&db, "c1", 1).unwrap().unwrap();
        assert_eq!(got.snapshot_json, "{\"title\":\"A\"}");
    }

    #[test]
    fn prune_keeps_latest() {
        let db = test_db();
        seed(&db);
        for i in 1..=55 {
            VersionRepo::insert(&db, "c1", &format!("{{\"n\":{}}}", i), "manual", "", i).unwrap();
        }
        let removed = VersionRepo::prune(&db, "c1").unwrap();
        assert_eq!(removed, 5);
        let list = VersionRepo::list(&db, "c1").unwrap();
        assert_eq!(list.len(), 50);
        assert_eq!(list[0].version_no, 55);
        assert_eq!(list[49].version_no, 6);
    }
}
