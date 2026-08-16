/// 版本化迁移（docs/cms-database-design.md §3）。
///
/// 规则：
/// - 每个版本号对应一个只追加、不修改的迁移步骤；禁止改动已发布版本的函数
/// - 新增表/列 = SCHEMA_VERSION + 1，并追加新的 `if current < N` 分支
/// - v1 是版本化机制引入前的存量逻辑收编（v1_initialize + v1_migrate），其内部
///   已含自管理事务，因此不包外层事务；v2 起每个版本在单事务内执行
use rusqlite::Connection;

use crate::core::error::{Error, Result};

/// 当前 schema 版本。新增迁移步骤时 +1。
const SCHEMA_VERSION: i64 = 2;

pub fn run_migrations(conn: &mut Connection) -> Result<()> {
    let current: i64 = conn
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .unwrap_or(0);

    if current > SCHEMA_VERSION {
        // 来自更新版本二进制的库被当前版本打开：拒绝降级，避免把新库误判为待迁移
        return Err(Error::Internal(format!(
            "database schema version {} is newer than supported {}",
            current, SCHEMA_VERSION
        )));
    }

    tracing::info!(
        "[migrations] schema version {} -> {}",
        current,
        SCHEMA_VERSION
    );

    if current < 1 {
        super::database::Database::v1_initialize(conn)?;
        super::database::Database::v1_migrate(conn)?;
        set_version(conn, 1)?;
    }
    if current < 2 {
        let tx = conn.transaction()?;
        create_cms_tables(&tx)?;
        set_version(&tx, 2)?;
        tx.commit()?;
    }
    Ok(())
}

fn set_version(conn: &Connection, version: i64) -> Result<()> {
    conn.pragma_update(None, "user_version", version).map_err(|e| {
        Error::Internal(format!("failed to set user_version = {}: {}", version, e))
    })
}

/// v2：CMS 表（docs/cms-database-design.md §2，7 张表）
fn create_cms_tables(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS sites (
            id                 TEXT PRIMARY KEY,
            name               TEXT NOT NULL,
            domain             TEXT NOT NULL DEFAULT '',
            local_workdir      TEXT NOT NULL,
            connection_id      TEXT,
            deploy_config_json TEXT NOT NULL DEFAULT '{}',
            build_config_json  TEXT NOT NULL DEFAULT '{}',
            theme_id           TEXT NOT NULL DEFAULT 'craft-blog',
            theme_config_json  TEXT NOT NULL DEFAULT '{}',
            status             TEXT NOT NULL DEFAULT 'active',
            last_deployed_at   INTEGER,
            created_at         INTEGER NOT NULL,
            updated_at         INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_sites_connection ON sites(connection_id);

        CREATE TABLE IF NOT EXISTS contents (
            id                TEXT PRIMARY KEY,
            site_id           TEXT NOT NULL,
            type              TEXT NOT NULL DEFAULT 'post',
            title             TEXT NOT NULL,
            slug              TEXT NOT NULL,
            category          TEXT NOT NULL DEFAULT '',
            summary           TEXT NOT NULL DEFAULT '',
            cover_media_id    TEXT,
            content_json      TEXT NOT NULL DEFAULT '',
            content_md        TEXT NOT NULL DEFAULT '',
            content_hash      TEXT NOT NULL DEFAULT '',
            seo_title         TEXT NOT NULL DEFAULT '',
            seo_description   TEXT NOT NULL DEFAULT '',
            og_image_media_id TEXT,
            status            TEXT NOT NULL DEFAULT 'draft',
            scheduled_at      INTEGER,
            published_at      INTEGER,
            pinned            INTEGER NOT NULL DEFAULT 0,
            deleted_at        INTEGER,
            created_at        INTEGER NOT NULL,
            updated_at        INTEGER NOT NULL,
            FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_contents_slug
            ON contents(site_id, type, slug) WHERE deleted_at IS NULL;
        CREATE INDEX IF NOT EXISTS idx_contents_site_status
            ON contents(site_id, status, deleted_at, published_at DESC);
        CREATE INDEX IF NOT EXISTS idx_contents_scheduled ON contents(status, scheduled_at);

        CREATE TABLE IF NOT EXISTS content_versions (
            id            TEXT PRIMARY KEY,
            content_id    TEXT NOT NULL,
            version_no    INTEGER NOT NULL,
            snapshot_json TEXT NOT NULL,
            trigger       TEXT NOT NULL DEFAULT 'manual',
            comment       TEXT NOT NULL DEFAULT '',
            created_at    INTEGER NOT NULL,
            FOREIGN KEY (content_id) REFERENCES contents(id) ON DELETE CASCADE,
            UNIQUE (content_id, version_no)
        );

        CREATE TABLE IF NOT EXISTS content_tags (
            id      TEXT PRIMARY KEY,
            site_id TEXT NOT NULL,
            name    TEXT NOT NULL,
            FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
            UNIQUE (site_id, name)
        );

        CREATE TABLE IF NOT EXISTS content_tag_links (
            content_id TEXT NOT NULL,
            tag_id     TEXT NOT NULL,
            PRIMARY KEY (content_id, tag_id),
            FOREIGN KEY (content_id) REFERENCES contents(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES content_tags(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS deployments (
            id             TEXT PRIMARY KEY,
            site_id        TEXT NOT NULL,
            trigger_type   TEXT NOT NULL,
            target_env     TEXT NOT NULL DEFAULT 'production',
            status         TEXT NOT NULL,
            started_at     INTEGER NOT NULL,
            finished_at    INTEGER,
            duration_ms    INTEGER,
            uploaded_count INTEGER NOT NULL DEFAULT 0,
            deleted_count  INTEGER NOT NULL DEFAULT 0,
            total_bytes    INTEGER NOT NULL DEFAULT 0,
            error_summary  TEXT NOT NULL DEFAULT '',
            manifest_json  TEXT NOT NULL DEFAULT '[]',
            FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_deployments_site ON deployments(site_id, started_at DESC);

        CREATE TABLE IF NOT EXISTS media_assets (
            id           TEXT PRIMARY KEY,
            site_id      TEXT NOT NULL,
            filename     TEXT NOT NULL,
            storage_path TEXT NOT NULL,
            mime_type    TEXT NOT NULL,
            size_bytes   INTEGER NOT NULL,
            width        INTEGER,
            height       INTEGER,
            file_hash    TEXT NOT NULL,
            thumb_path   TEXT,
            created_at   INTEGER NOT NULL,
            FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_media_site ON media_assets(site_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_media_hash ON media_assets(site_id, file_hash);
        ",
    )
    .map_err(|e| Error::Internal(format!("create_cms_tables failed: {}", e)))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn open_test_db() -> Connection {
        let mut conn = Connection::open_in_memory().expect("open in-memory db");
        conn.execute_batch("PRAGMA foreign_keys = OFF;").unwrap();
        conn
    }

    fn table_exists(conn: &Connection, name: &str) -> bool {
        conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
            [name],
            |r| r.get::<_, i64>(0),
        )
        .unwrap()
            == 1
    }

    fn current_version(conn: &Connection) -> i64 {
        conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap()
    }

    #[test]
    fn fresh_db_reaches_latest_with_cms_tables() {
        let mut conn = open_test_db();
        run_migrations(&mut conn).expect("fresh install migrations");
        assert_eq!(current_version(&conn), SCHEMA_VERSION);
        for table in [
            "sites",
            "contents",
            "content_versions",
            "content_tags",
            "content_tag_links",
            "deployments",
            "media_assets",
        ] {
            assert!(table_exists(&conn, table), "table {} should exist", table);
        }
    }

    #[test]
    fn rerun_is_noop() {
        let mut conn = open_test_db();
        run_migrations(&mut conn).unwrap();
        run_migrations(&mut conn).unwrap();
        assert_eq!(current_version(&conn), SCHEMA_VERSION);
    }

    #[test]
    fn downgrade_is_rejected() {
        let mut conn = open_test_db();
        conn.pragma_update(None, "user_version", SCHEMA_VERSION + 1)
            .unwrap();
        assert!(run_migrations(&mut conn).is_err());
    }
}
