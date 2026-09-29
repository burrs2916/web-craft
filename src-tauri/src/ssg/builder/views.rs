//! 构建视图模型：站点/文章/页面/分页/归档/标签的序列化结构，以及 URL、日期辅助函数。
//! 这些结构直接序列化进 Tera 上下文（site/post/page/pagination/archive/tags）。

use chrono::{DateTime, Utc};
use serde::Serialize;

use crate::core::types::Content;
use crate::infra::storage::database::Database;
use crate::infra::storage::media_repo::MediaRepo;
use crate::ssg::markdown;

use super::queries::list_tags_for_content;

#[derive(Serialize)]
pub(super) struct SiteView {
    pub(super) name: String,
    pub(super) url: String,
    pub(super) lang: String,
}

#[derive(Serialize)]
pub(super) struct PostView {
    pub(super) slug: String,
    pub(super) title: String,
    pub(super) summary: String,
    pub(super) category: String,
    pub(super) tags: Vec<String>,
    pub(super) seo_title: String,
    pub(super) seo_description: String,
    /// 封面图 URL（相对于站点根，如 /assets/media/2025/08/abc.jpg）
    pub(super) cover_image: Option<String>,
    /// OG 分享图 URL（相对于站点根）
    pub(super) og_image: Option<String>,
    /// 原始 Markdown（懒渲染：仅在生成文章页时转 HTML，列表页不消耗）
    #[serde(skip)]
    pub(super) content_md: String,
    /// 渲染后的 HTML，序列化时跳过，由 post_with_html 填充
    #[serde(skip)]
    pub(super) content_html: String,
    pub(super) published_at: String,
    pub(super) published_at_iso: String,
    pub(super) rfc822: String,
}

#[derive(Serialize)]
pub(super) struct PageView {
    pub(super) slug: String,
    pub(super) title: String,
    pub(super) seo_title: String,
    pub(super) seo_description: String,
    /// OG 分享图 URL（相对于站点根）
    pub(super) og_image: Option<String>,
    #[serde(skip)]
    pub(super) content_md: String,
    /// 渲染后的 HTML，序列化时跳过，由 page_with_html 填充
    #[serde(skip)]
    pub(super) content_html: String,
    /// 区块 JSON（空串表示无区块）
    #[serde(skip)]
    pub(super) blocks_json: String,
    /// 渲染后的区块 HTML，序列化时跳过，由 page_with_html 填充
    #[serde(skip)]
    pub(super) blocks_html: String,
}

#[derive(Serialize)]
pub(super) struct PaginationView {
    current: usize,
    total: usize,
    prev: Option<String>,
    next: Option<String>,
}

#[derive(Serialize)]
pub(super) struct ArchiveMonth {
    pub(super) month: String,
    pub(super) count: usize,
}

#[derive(Serialize)]
pub(super) struct TagCount {
    pub(super) name: String,
    pub(super) count: usize,
}

/// 站点 URL：优先 domain，其次回退占位（本地预览用相对路径也能工作）。
pub(super) fn site_url(domain: &str) -> String {
    let d = domain.trim().trim_end_matches('/');
    if d.is_empty() {
        "http://localhost".to_string()
    } else if d.starts_with("http://") || d.starts_with("https://") {
        d.to_string()
    } else {
        format!("https://{}", d)
    }
}

fn format_date(ms: i64) -> (String, String, String) {
    let dt = DateTime::<Utc>::from_timestamp_millis(ms)
        .unwrap_or_else(|| DateTime::<Utc>::from_timestamp(0, 0).unwrap());
    (
        dt.format("%Y-%m-%d").to_string(),
        dt.format("%Y-%m-%dT%H:%M:%SZ").to_string(),
        dt.format("%a, %d %b %Y %H:%M:%S GMT").to_string(),
    )
}

/// 分页文件相对路径：第 1 页 = base/index.html，N≥2 = base/page/N/index.html。
/// 返回不带前导斜杠的相对路径，供 dist_new.join() 使用。
pub(super) fn page_url(base: &str, page: usize) -> String {
    let base = base.trim_start_matches('/');
    if page <= 1 {
        if base.is_empty() {
            "index.html".to_string()
        } else {
            format!("{}/index.html", base)
        }
    } else if base.is_empty() {
        format!("page/{}/index.html", page)
    } else {
        format!("{}/page/{}/index.html", base, page)
    }
}

/// 分页链接绝对 URL（模板 href 用，带前导斜杠）。
fn page_href(base: &str, page: usize) -> String {
    format!("/{}", page_url(base, page))
}

pub(super) fn build_pagination(current: usize, total_pages: usize, base: &str) -> Option<PaginationView> {
    if total_pages <= 1 {
        return None;
    }
    Some(PaginationView {
        current,
        total: total_pages,
        prev: if current > 1 { Some(page_href(base, current - 1)) } else { None },
        next: if current < total_pages { Some(page_href(base, current + 1)) } else { None },
    })
}

pub(super) fn to_post_view(db: &Database, site_id: &str, c: &Content) -> PostView {
    let (published_at, published_at_iso, rfc822) = format_date(c.published_at.unwrap_or(c.updated_at));
    let tags = list_tags_for_content(db, site_id, &c.id).unwrap_or_default();
    let cover_image = media_id_to_url(db, &c.cover_media_id);
    let og_image = media_id_to_url(db, &c.og_image_media_id);
    PostView {
        slug: c.slug.clone(),
        title: c.title.clone(),
        summary: c.summary.clone(),
        category: c.category.clone(),
        tags,
        seo_title: c.seo_title.clone(),
        seo_description: c.seo_description.clone(),
        cover_image,
        og_image,
        content_md: c.content_md.clone(),
        content_html: String::new(),
        published_at,
        published_at_iso,
        rfc822,
    }
}

/// 将媒体资产 ID 转换为站点根相对 URL（如 /assets/media/2025/08/abc.jpg）。
pub(super) fn media_id_to_url(db: &Database, media_id: &Option<String>) -> Option<String> {
    let id = media_id.as_ref()?;
    let asset = MediaRepo::get_by_id(db, id).ok()??;
    Some(format!("/assets/{}", asset.storage_path))
}

/// 生成文章页用的 PostView JSON：惰性渲染 Markdown → content_html。
pub(super) fn post_with_html(p: &PostView) -> serde_json::Value {
    let mut v = serde_json::to_value(p).unwrap_or(serde_json::Value::Null);
    if let Some(obj) = v.as_object_mut() {
        obj.insert("content_html".into(), serde_json::Value::String(markdown::render_markdown(&p.content_md)));
    }
    v
}

/// 生成独立页用的 PageView JSON：惰性渲染 Markdown → content_html + 注入 blocks_html。
pub(super) fn page_with_html(p: &PageView) -> serde_json::Value {
    let mut v = serde_json::to_value(p).unwrap_or(serde_json::Value::Null);
    if let Some(obj) = v.as_object_mut() {
        obj.insert("content_html".into(), serde_json::Value::String(markdown::render_markdown(&p.content_md)));
        obj.insert("blocks_html".into(), serde_json::Value::String(p.blocks_html.clone()));
    }
    v
}