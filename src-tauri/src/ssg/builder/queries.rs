//! 站点内容查询：已发布内容的标签计数、按标签取内容、单条内容的标签名。

use crate::core::error::Result;
use crate::core::types::Content;
use crate::infra::storage::database::Database;

use super::views::TagCount;

/// 站点内已发布内容的标签计数（content_tags × content_tag_links × contents）。
pub(super) fn list_tag_counts(db: &Database, site_id: &str) -> Result<Vec<TagCount>> {
    let conn = db.conn();
    let mut stmt = conn.prepare(
        "SELECT t.name, COUNT(l.content_id) AS c
         FROM content_tags t
         JOIN content_tag_links l ON l.tag_id = t.id
         JOIN contents c ON c.id = l.content_id
         WHERE t.site_id = ?1 AND c.status = 'published' AND c.deleted_at IS NULL
         GROUP BY t.name ORDER BY t.name",
    )?;
    let rows = stmt.query_map(rusqlite::params![site_id], |r| {
        Ok(TagCount { name: r.get(0)?, count: r.get(1)? })
    })?;
    Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
}

/// 某标签下的已发布内容。
pub(super) fn list_posts_by_tag(db: &Database, site_id: &str, tag: &str) -> Result<Vec<Content>> {
    let conn = db.conn();
    let mut stmt = conn.prepare(
        "SELECT c.id, c.site_id, c.type, c.title, c.slug, c.category, c.summary,
                c.cover_media_id, c.content_json, c.content_md, c.content_hash,
                c.seo_title, c.seo_description, c.og_image_media_id, c.status,
                c.scheduled_at, c.published_at, c.pinned, c.deleted_at, c.created_at, c.updated_at,
                c.blocks_json
         FROM contents c
         JOIN content_tag_links l ON l.content_id = c.id
         JOIN content_tags t ON t.id = l.tag_id
         WHERE c.site_id = ?1 AND t.name = ?2 AND c.status = 'published' AND c.deleted_at IS NULL
         ORDER BY c.published_at DESC",
    )?;
    let rows = stmt.query_map(rusqlite::params![site_id, tag], |r| {
        Ok(Content {
            id: r.get(0)?,
            site_id: r.get(1)?,
            content_type: r.get(2)?,
            title: r.get(3)?,
            slug: r.get(4)?,
            category: r.get(5)?,
            summary: r.get(6)?,
            cover_media_id: r.get(7)?,
            content_json: r.get(8)?,
            content_md: r.get(9)?,
            content_hash: r.get(10)?,
            seo_title: r.get(11)?,
            seo_description: r.get(12)?,
            og_image_media_id: r.get(13)?,
            status: r.get(14)?,
            scheduled_at: r.get(15)?,
            published_at: r.get(16)?,
            pinned: r.get(17)?,
            deleted_at: r.get(18)?,
            created_at: r.get(19)?,
            updated_at: r.get(20)?,
            blocks_json: r.get(21)?,
            tags: Vec::new(),
        })
    })?;
    Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
}

/// 某条已发布内容的标签名列表。
pub(super) fn list_tags_for_content(db: &Database, site_id: &str, content_id: &str) -> Result<Vec<String>> {
    let conn = db.conn();
    let mut stmt = conn.prepare(
        "SELECT t.name FROM content_tags t
         JOIN content_tag_links l ON l.tag_id = t.id
         WHERE t.site_id = ?1 AND l.content_id = ?2
         ORDER BY t.name",
    )?;
    let rows = stmt.query_map(rusqlite::params![site_id, content_id], |r| r.get::<_, String>(0))?;
    Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
}