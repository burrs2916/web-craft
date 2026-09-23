use crate::core::error::Result;
use crate::core::types::MediaAsset;
use crate::infra::storage::database::Database;

const COLUMNS: &str = "id, site_id, filename, storage_path, mime_type, size_bytes, \
                       width, height, file_hash, thumb_path, created_at";

fn map_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<MediaAsset> {
    Ok(MediaAsset {
        id: r.get(0)?,
        site_id: r.get(1)?,
        filename: r.get(2)?,
        storage_path: r.get(3)?,
        mime_type: r.get(4)?,
        size_bytes: r.get(5)?,
        width: r.get(6)?,
        height: r.get(7)?,
        file_hash: r.get(8)?,
        thumb_path: r.get(9)?,
        created_at: r.get(10)?,
    })
}

pub struct MediaRepo;

impl MediaRepo {
    /// 站点媒体资源列表，按创建时间倒序，支持分页。
    pub fn list(
        db: &Database,
        site_id: &str,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<MediaAsset>> {
        let conn = db.conn();
        let mut stmt = conn.prepare(&format!(
            "SELECT {COLUMNS} FROM media_assets WHERE site_id = ?1 \
             ORDER BY created_at DESC LIMIT ?2 OFFSET ?3",
        ))?;
        let rows = stmt.query_map(rusqlite::params![site_id, limit, offset], map_row)?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    /// 统计站点媒体总数。
    pub fn count(db: &Database, site_id: &str) -> Result<i64> {
        let conn = db.conn();
        let n: i64 = conn.query_row(
            "SELECT COUNT(*) FROM media_assets WHERE site_id = ?1",
            [site_id],
            |r| r.get(0),
        )?;
        Ok(n)
    }

    /// 按哈希查找（秒传去重用）。
    pub fn find_by_hash(db: &Database, site_id: &str, file_hash: &str) -> Result<Option<MediaAsset>> {
        let conn = db.conn();
        let mut stmt = conn.prepare(&format!(
            "SELECT {COLUMNS} FROM media_assets WHERE site_id = ?1 AND file_hash = ?2 LIMIT 1",
        ))?;
        let mut rows = stmt.query_map([site_id, file_hash], map_row)?;
        match rows.next() {
            Some(row) => Ok(Some(row?)),
            None => Ok(None),
        }
    }

    pub fn get_by_id(db: &Database, id: &str) -> Result<Option<MediaAsset>> {
        let conn = db.conn();
        let mut stmt = conn.prepare(&format!(
            "SELECT {COLUMNS} FROM media_assets WHERE id = ?1 LIMIT 1",
        ))?;
        let mut rows = stmt.query_map([id], map_row)?;
        match rows.next() {
            Some(row) => Ok(Some(row?)),
            None => Ok(None),
        }
    }

    pub fn insert(db: &Database, asset: &MediaAsset) -> Result<()> {
        let conn = db.conn();
        conn.execute(
            "INSERT INTO media_assets \
             (id, site_id, filename, storage_path, mime_type, size_bytes, \
              width, height, file_hash, thumb_path, created_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            rusqlite::params![
                asset.id,
                asset.site_id,
                asset.filename,
                asset.storage_path,
                asset.mime_type,
                asset.size_bytes,
                asset.width,
                asset.height,
                asset.file_hash,
                asset.thumb_path,
                asset.created_at,
            ],
        )?;
        Ok(())
    }

    /// 删除媒体记录（调用方需自行清理物理文件）。
    pub fn delete(db: &Database, id: &str) -> Result<usize> {
        let conn = db.conn();
        let n = conn.execute("DELETE FROM media_assets WHERE id = ?1", rusqlite::params![id])?;
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

    fn sample_asset(id: &str, hash: &str) -> MediaAsset {
        MediaAsset {
            id: id.into(),
            site_id: "site-a".into(),
            filename: "photo.jpg".into(),
            storage_path: format!("media/2025/08/{hash}.jpg"),
            mime_type: "image/jpeg".into(),
            size_bytes: 102400,
            width: Some(1920),
            height: Some(1080),
            file_hash: hash.into(),
            thumb_path: Some(format!("media/2025/08/{hash}_thumb.jpg")),
            created_at: 1000,
        }
    }

    #[test]
    fn insert_list_count_delete() {
        let db = test_db();
        seed_site(&db);

        assert_eq!(MediaRepo::count(&db, "site-a").unwrap(), 0);
        let a = sample_asset("m1", "abc123");
        MediaRepo::insert(&db, &a).unwrap();
        assert_eq!(MediaRepo::count(&db, "site-a").unwrap(), 1);

        let list = MediaRepo::list(&db, "site-a", 20, 0).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, "m1");
        assert_eq!(list[0].width, Some(1920));

        // 哈希去重查找
        let found = MediaRepo::find_by_hash(&db, "site-a", "abc123").unwrap();
        assert!(found.is_some());
        assert_eq!(found.unwrap().id, "m1");

        let not_found = MediaRepo::find_by_hash(&db, "site-a", "noexist").unwrap();
        assert!(not_found.is_none());

        // 删除
        assert_eq!(MediaRepo::delete(&db, "m1").unwrap(), 1);
        assert_eq!(MediaRepo::count(&db, "site-a").unwrap(), 0);
    }

    #[test]
    fn pagination() {
        let db = test_db();
        seed_site(&db);
        for i in 0..5 {
            let a = sample_asset(&format!("m{}", i), &format!("hash{}", i));
            MediaRepo::insert(&db, &a).unwrap();
        }
        let page1 = MediaRepo::list(&db, "site-a", 2, 0).unwrap();
        assert_eq!(page1.len(), 2);
        let page2 = MediaRepo::list(&db, "site-a", 2, 2).unwrap();
        assert_eq!(page2.len(), 2);
        let page3 = MediaRepo::list(&db, "site-a", 2, 4).unwrap();
        assert_eq!(page3.len(), 1);
    }
}
