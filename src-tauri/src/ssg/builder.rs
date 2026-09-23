//! SSG 构建编排（docs/ssg-engine-design.md §4 builder.rs）
//! 数据流水线：published 内容 → Markdown → HTML 片段 → Tera 渲染 → dist/
//! 产物先写 dist-new/ 再原子交换 dist/，构建中途失败不污染上一次产物。

use std::collections::BTreeMap;
use std::path::Path;
use std::time::Instant;

use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::Value;

use crate::core::error::{Error, Result};
use crate::core::types::{Content, ContentListFilter};
use crate::infra::storage::content_repo::ContentRepo;
use crate::infra::storage::database::Database;
use crate::infra::storage::media_repo::MediaRepo;
use crate::infra::storage::site_repo::SiteRepo;

use super::feeds;
use super::markdown;
use super::theme;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildReport {
    pub ok: bool,
    pub duration_ms: u64,
    pub pages: usize,
    pub assets: usize,
    /// 本次构建因内容未变化而跳过的页面数（增量构建）
    #[serde(default)]
    pub skipped: usize,
    pub warnings: Vec<String>,
    pub error: Option<String>,
    pub dist_dir: String,
}

impl BuildReport {
    fn failure(dist_dir: &str, error: String, duration_ms: u64) -> Self {
        BuildReport {
            ok: false,
            duration_ms,
            pages: 0,
            assets: 0,
            skipped: 0,
            warnings: vec![],
            error: Some(error),
            dist_dir: dist_dir.to_string(),
        }
    }
}

#[derive(Serialize)]
struct SiteView {
    name: String,
    url: String,
    lang: String,
}

#[derive(Serialize)]
struct PostView {
    slug: String,
    title: String,
    summary: String,
    category: String,
    tags: Vec<String>,
    seo_title: String,
    seo_description: String,
    /// 封面图 URL（相对于站点根，如 /assets/media/2025/08/abc.jpg）
    cover_image: Option<String>,
    /// OG 分享图 URL（相对于站点根）
    og_image: Option<String>,
    /// 原始 Markdown（懒渲染：仅在生成文章页时转 HTML，列表页不消耗）
    #[serde(skip)]
    content_md: String,
    /// 渲染后的 HTML，序列化时跳过，由 post_with_html 填充
    #[serde(skip)]
    content_html: String,
    published_at: String,
    published_at_iso: String,
    rfc822: String,
}

#[derive(Serialize)]
struct PageView {
    slug: String,
    title: String,
    seo_title: String,
    seo_description: String,
    /// OG 分享图 URL（相对于站点根）
    og_image: Option<String>,
    #[serde(skip)]
    content_md: String,
    /// 渲染后的 HTML，序列化时跳过，由 page_with_html 填充
    #[serde(skip)]
    content_html: String,
    /// 区块 JSON（空串表示无区块）
    #[serde(skip)]
    blocks_json: String,
    /// 渲染后的区块 HTML，序列化时跳过，由 page_with_html 填充
    #[serde(skip)]
    blocks_html: String,
}

#[derive(Serialize)]
struct PaginationView {
    current: usize,
    total: usize,
    prev: Option<String>,
    next: Option<String>,
}

#[derive(Serialize)]
struct ArchiveMonth {
    month: String,
    count: usize,
}

#[derive(Serialize)]
struct TagCount {
    name: String,
    count: usize,
}

/// 站点 URL：优先 domain，其次回退占位（本地预览用相对路径也能工作）。
fn site_url(domain: &str) -> String {
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
fn page_url(base: &str, page: usize) -> String {
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

fn build_pagination(current: usize, total_pages: usize, base: &str) -> Option<PaginationView> {
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

/// 读取 build_config_json（契约见 cms-database-design.md §4.2）。
struct BuildConfig {
    dist_dir: String,
    posts_per_page: usize,
    generate: GenerateFlags,
}

#[derive(Default)]
struct GenerateFlags {
    rss: bool,
    sitemap: bool,
    robots: bool,
    archive: bool,
    tags: bool,
}

fn parse_build_config(raw: &str) -> BuildConfig {
    let v: Value = serde_json::from_str(raw).unwrap_or(Value::Null);
    let dist_dir = v["dist_dir"].as_str().unwrap_or("dist").to_string();
    let posts_per_page = v["posts_per_page"].as_u64().unwrap_or(10).max(1) as usize;
    let gen = &v["generate"];
    let flag = |key: &str, default: bool| gen.get(key).and_then(|x| x.as_bool()).unwrap_or(default);
    BuildConfig {
        dist_dir,
        posts_per_page,
        generate: GenerateFlags {
            rss: flag("rss", true),
            sitemap: flag("sitemap", true),
            robots: flag("robots", true),
            archive: flag("archive", true),
            tags: flag("tags", true),
        },
    }
}

/// 读取 theme_config_json 为 Tera 上下文对象。
fn parse_theme_config(raw: &str) -> Value {
    serde_json::from_str(raw).unwrap_or(Value::Object(Default::default()))
}

/// 解析并解析主题设置：将 media id 转为 URL、nav_links_json 解析为数组、toggle 转 bool。
fn resolve_theme_settings(db: &Database, raw: &Value) -> Value {
    use serde_json::Map;
    let mut out = Map::new();

    // 原样拷贝所有字符串值
    if let Some(obj) = raw.as_object() {
        for (k, v) in obj {
            out.insert(k.clone(), v.clone());
        }
    }

    // logo_media_id → logo_url
    if let Some(logo_id) = raw.get("logo_media_id").and_then(|v| v.as_str()) {
        if !logo_id.is_empty() {
            if let Ok(Some(asset)) = MediaRepo::get_by_id(db, logo_id) {
                out.insert(
                    "logo_url".to_string(),
                    Value::String(format!("/assets/{}", asset.storage_path)),
                );
            }
        }
    }

    // nav_links_json → nav_links (array of {label, href})
    if let Some(nav_json) = raw.get("nav_links_json").and_then(|v| v.as_str()) {
        if !nav_json.is_empty() {
            if let Ok(parsed) = serde_json::from_str::<Value>(nav_json) {
                out.insert("nav_links".to_string(), parsed);
            }
        }
    }

    // show_tagline: "true"/"false" 字符串转 bool（默认 true）
    if let Some(val) = raw.get("show_tagline").and_then(|v| v.as_str()) {
        out.insert("show_tagline".to_string(), Value::Bool(val == "true"));
    } else {
        out.insert("show_tagline".to_string(), Value::Bool(true));
    }

    Value::Object(out)
}

/// 从主题配置生成 CSS 变量覆盖块（FR-T2）：accent_color → --primary/--primary-light/--border。
/// 追加在主题 main.css 之后，利用 CSS 级联覆盖默认强调色。
/// 选择器同时覆盖 :root 与 [data-theme="dark"]，保证深色模式下强调色同样生效；
/// :root:root 提升优先级以压过 prefers-color-scheme 媒体查询（同优先级按源顺序后者胜）。
fn theme_css_override(settings: &Value) -> String {
    let accent = settings
        .get("accent_color")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty() && s.starts_with('#') && s.len() == 7);
    let Some(accent) = accent else { return String::new() };
    let light = lighten_hex(&accent);
    format!(
        "/* WebCraft theme override (accent_color) */\n:root:root, [data-theme=\"dark\"] {{\n  --primary: {accent};\n  --primary-light: {light};\n  --border: {accent}24;\n}}\n"
    )
}

/// 简单提亮十六进制颜色（用于 primary-light），失败时原样返回。
fn lighten_hex(hex: &str) -> String {
    let parse = |s: &str| u8::from_str_radix(s, 16).ok();
    let r = parse(&hex[1..3]);
    let g = parse(&hex[3..5]);
    let b = parse(&hex[5..7]);
    let (Some(r), Some(g), Some(b)) = (r, g, b) else { return hex.to_string() };
    let mix = |c: u8| (c as u16 + ((255 - c as u16) * 2 / 5)) as u8;
    format!("#{:02X}{:02X}{:02X}", mix(r), mix(g), mix(b))
}

/// 站点内已发布内容的标签计数（content_tags × content_tag_links × contents）。
fn list_tag_counts(db: &Database, site_id: &str) -> Result<Vec<TagCount>> {
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
fn list_posts_by_tag(db: &Database, site_id: &str, tag: &str) -> Result<Vec<Content>> {
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
fn list_tags_for_content(db: &Database, site_id: &str, content_id: &str) -> Result<Vec<String>> {
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

fn to_post_view(db: &Database, site_id: &str, c: &Content) -> PostView {
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
fn media_id_to_url(db: &Database, media_id: &Option<String>) -> Option<String> {
    let id = media_id.as_ref()?;
    let asset = MediaRepo::get_by_id(db, id).ok()??;
    Some(format!("/assets/{}", asset.storage_path))
}

/// 生成文章页用的 PostView JSON：惰性渲染 Markdown → content_html。
fn post_with_html(p: &PostView) -> serde_json::Value {
    let mut v = serde_json::to_value(p).unwrap_or(serde_json::Value::Null);
    if let Some(obj) = v.as_object_mut() {
        obj.insert("content_html".into(), serde_json::Value::String(markdown::render_markdown(&p.content_md)));
    }
    v
}

/// 生成独立页用的 PageView JSON：惰性渲染 Markdown → content_html + 注入 blocks_html。
fn page_with_html(p: &PageView) -> serde_json::Value {
    let mut v = serde_json::to_value(p).unwrap_or(serde_json::Value::Null);
    if let Some(obj) = v.as_object_mut() {
        obj.insert("content_html".into(), serde_json::Value::String(markdown::render_markdown(&p.content_md)));
        obj.insert("blocks_html".into(), serde_json::Value::String(p.blocks_html.clone()));
    }
    v
}

/// 增量构建（无缓存时自动全量）。force=true 强制全量重建。
pub fn build(db: &Database, site_id: &str, force: bool) -> Result<BuildReport> {
    let started = Instant::now();
    let site = SiteRepo::get_by_id(db, site_id)?
        .ok_or_else(|| Error::Cms(format!("站点不存在: {}", site_id)))?;
    let workdir = site.local_workdir.trim().to_string();
    if workdir.is_empty() {
        return Ok(BuildReport::failure("", "站点本地工作目录为空".into(), started.elapsed().as_millis() as u64));
    }
    let cfg = parse_build_config(&site.build_config_json);
    let dist_dir = Path::new(&workdir).join(&cfg.dist_dir);
    let dist_new = Path::new(&workdir).join(format!("{}-new", cfg.dist_dir));

    let contents = ContentRepo::list(
        db,
        site_id,
        &ContentListFilter { content_type: None, status: Some("published".into()), keyword: None, tag: None, include_deleted: Some(false) },
    )?;

    let mut posts: Vec<PostView> = Vec::new();
    let mut pages: Vec<PageView> = Vec::new();
    let mut warnings: Vec<String> = Vec::new();

    for c in &contents {
        if c.slug.is_empty() {
            warnings.push(format!("内容 \"{}\" 缺少 slug，已跳过", c.title));
            continue;
        }
        if c.content_type == "page" {
            pages.push(PageView {
                slug: c.slug.clone(),
                title: c.title.clone(),
                seo_title: c.seo_title.clone(),
                seo_description: c.seo_description.clone(),
                og_image: media_id_to_url(db, &c.og_image_media_id),
                content_md: c.content_md.clone(),
                content_html: String::new(),
                blocks_json: c.blocks_json.clone(),
                blocks_html: String::new(),
            });
        } else {
            posts.push(to_post_view(db, site_id, c));
        }
    }
    // 已发布内容按发布时间倒序（published_at 为 None 的兜底放最后）
    posts.sort_by(|a, b| b.published_at_iso.cmp(&a.published_at_iso));

    // 内容哈希表（增量构建指纹，key = "post:<slug>" / "page:<slug>"）
    let mut hashes: BTreeMap<String, String> = BTreeMap::new();
    for c in &contents {
        if c.slug.is_empty() {
            continue;
        }
        let key = if c.content_type == "page" {
            format!("page:{}", c.slug)
        } else {
            format!("post:{}", c.slug)
        };
        hashes.insert(key, c.content_hash.clone());
    }

    let site_view = SiteView {
        name: site.name.clone(),
        url: site_url(&site.domain),
        lang: "zh-CN".to_string(),
    };
    let settings_raw = parse_theme_config(&site.theme_config_json);
    let settings = resolve_theme_settings(db, &settings_raw);

    // 按站点主题 id 加载模板与资源（默认 craft-blog）
    let theme_id = if site.theme_id.trim().is_empty() {
        theme::THEME_ID.to_string()
    } else {
        site.theme_id.clone()
    };
    let theme_def = theme::find_theme(&theme_id)
        .ok_or_else(|| Error::Cms(format!("主题不存在: {}", theme_id)))?;
    let tera = theme::load_theme(&theme_id)
        .ok_or_else(|| Error::Cms(format!("主题模板加载失败: {}", theme_id)))?;

    // 区块渲染：有 blocks_json 的 page 预渲染为 HTML
    for p in pages.iter_mut() {
        if !p.blocks_json.is_empty() {
            p.blocks_html = super::blocks::render_blocks(&tera, db, &p.blocks_json)?;
        }
    }

    let mut pages_written = 0usize;
    let mut assets_written = 0usize;
    let mut skipped = 0usize;

    // 增量模式：非 force 且缓存有效（引擎版本与分页配置一致）
    let prev_cache = read_build_cache(&workdir);
    let incremental = !force
        && prev_cache
            .as_ref()
            .is_some_and(|c| c.engine_version == 1 && c.posts_per_page == cfg.posts_per_page);

    // 先清空 dist-new，保证产物干净
    if dist_new.exists() {
        std::fs::remove_dir_all(&dist_new).map_err(|e| Error::Cms(format!("清理 {} 失败: {}", dist_new.display(), e)))?;
    }
    std::fs::create_dir_all(&dist_new).map_err(|e| Error::Cms(format!("创建 {} 失败: {}", dist_new.display(), e)))?;

    // 增量阶段：把未变化内容的旧产物拷贝到 dist-new，避免重新渲染（FR-B3）
    if incremental {
        if let Some(prev) = &prev_cache {
            for (key, entry) in &prev.entries {
                if hashes.get(key) != Some(&entry.hash) {
                    continue;
                }
                for out in &entry.outputs {
                    let src = dist_dir.join(out);
                    if !src.is_file() {
                        continue;
                    }
                    let dest = dist_new.join(out);
                    if let Some(parent) = dest.parent() {
                        std::fs::create_dir_all(parent).map_err(|e| Error::Cms(format!("创建目录失败: {}", e)))?;
                    }
                    std::fs::copy(&src, &dest).map_err(|e| Error::Cms(format!("拷贝旧产物 {} 失败: {}", out, e)))?;
                    skipped += 1;
                }
            }
        }
    }

    let mut write_page = |rel: &str, html: &str| -> Result<()> {
        let path = dist_new.join(rel);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| Error::Cms(format!("创建目录失败: {}", e)))?;
        }
        std::fs::write(&path, html).map_err(|e| Error::Cms(format!("写入 {} 失败: {}", path.display(), e)))?;
        pages_written += 1;
        Ok(())
    };

    let render = |template: &str, mut ctx: tera::Context, seo: Option<(&str, &str, Option<&str>)>| -> Result<String> {
        ctx.insert("site", &site_view);
        ctx.insert("settings", &settings);
        ctx.insert("page_seo_description", seo.map(|(_, d, _)| d).unwrap_or(""));
        ctx.insert("page_seo_title", seo.map(|(t, _, _)| t).unwrap_or(""));
        ctx.insert("page_og_image", seo.and_then(|(_, _, o)| o).unwrap_or(""));
        tera.render(template, &ctx).map_err(|e| Error::Cms(format!("模板 {} 渲染失败: {}", template, e)))
    };

    // ---------- 首页 + 分页 ----------
    // 如果存在 slug="index" 的 page 且含 blocks_json，其区块 HTML 注入首页上下文
    let homepage_blocks: Option<&str> = pages
        .iter()
        .find(|p| p.slug == "index" || p.slug == "home")
        .map(|p| p.blocks_html.as_str())
        .filter(|s| !s.is_empty());

    let per_page = cfg.posts_per_page;
    let total_pages = if posts.is_empty() { 1 } else { (posts.len() + per_page - 1) / per_page };
    for page in 1..=total_pages {
        let start = (page - 1) * per_page;
        let end = (start + per_page).min(posts.len());
        let mut ctx = tera::Context::new();
        ctx.insert("posts", &posts[start..end]);
        ctx.insert("pagination", &build_pagination(page, total_pages, ""));
        // 首页区块仅在第 1 页注入（避免分页页也出现区块）
        if page == 1 {
            if let Some(blocks) = homepage_blocks {
                ctx.insert("homepage_blocks", blocks);
            }
        }
        let html = render("index.html", ctx, None)?;
        write_page(&page_url("", page), &html)?;
    }

    // ---------- 文章 / 独立页面 ----------
    for p in &posts {
        let out = format!("posts/{}/index.html", p.slug);
        if dist_new.join(&out).exists() {
            continue; // 未变化，已从旧产物拷贝
        }
        let mut ctx = tera::Context::new();
        ctx.insert("post", &post_with_html(p));
        let html = render("post.html", ctx, Some((&p.seo_title, &p.seo_description, p.cover_image.as_deref().or(p.og_image.as_deref()))))?;
        write_page(&out, &html)?;
    }
    for p in &pages {
        // slug=index/home 的 page 区块已在首页渲染，不再单独输出
        if p.slug == "index" || p.slug == "home" {
            continue;
        }
        let out = format!("pages/{}/index.html", p.slug);
        if dist_new.join(&out).exists() {
            continue;
        }
        let mut ctx = tera::Context::new();
        ctx.insert("page", &page_with_html(p));
        let html = render("page.html", ctx, Some((&p.seo_title, &p.seo_description, p.og_image.as_deref())))?;
        write_page(&out, &html)?;
    }

    // ---------- 分类页 ----------
    let mut categories: BTreeMap<String, Vec<&PostView>> = BTreeMap::new();
    for p in &posts {
        if !p.category.is_empty() {
            categories.entry(p.category.clone()).or_default().push(p);
        }
    }
    for (name, cat_posts) in &categories {
        let base = format!("/category/{}", name);
        let cat_total = (cat_posts.len() + per_page - 1) / per_page;
        for page in 1..=cat_total {
            let start = (page - 1) * per_page;
            let end = (start + per_page).min(cat_posts.len());
            let mut ctx = tera::Context::new();
            ctx.insert("category", name);
            ctx.insert("posts", &cat_posts[start..end]);
            ctx.insert("pagination", &build_pagination(page, cat_total, &base));
            let html = render("category.html", ctx, None)?;
            write_page(&page_url(&base, page), &html)?;
        }
    }

    // ---------- 标签 ----------
    let tag_counts = list_tag_counts(db, site_id)?;
    if cfg.generate.tags {
        let mut ctx = tera::Context::new();
        ctx.insert("tags", &tag_counts);
        let html = render("tags.html", ctx, None)?;
        write_page("tags/index.html", &html)?;
        for tag in &tag_counts {
            let tag_posts = list_posts_by_tag(db, site_id, &tag.name)?;
            let views: Vec<PostView> = tag_posts.iter().map(|c| to_post_view(db, site_id, c)).collect();
            let base = format!("/tags/{}", tag.name);
            let tag_total = if views.is_empty() { 1 } else { (views.len() + per_page - 1) / per_page };
            for page in 1..=tag_total {
                let start = (page - 1) * per_page;
                let end = (start + per_page).min(views.len());
                let mut ctx = tera::Context::new();
                ctx.insert("tag", &tag.name);
                ctx.insert("posts", &views[start..end]);
                ctx.insert("pagination", &build_pagination(page, tag_total, &base));
                let html = render("tag.html", ctx, None)?;
                write_page(&page_url(&base, page), &html)?;
            }
        }
    }

    // ---------- 归档 ----------
    let mut archive: BTreeMap<String, Vec<ArchiveMonth>> = BTreeMap::new();
    if cfg.generate.archive {
        // year-month → posts，用于生成按月归档页
        let mut month_posts: BTreeMap<(String, String), Vec<&PostView>> = BTreeMap::new();
        for p in &posts {
            // published_at 形如 "YYYY-MM-DD"，直接切片取年月
            if p.published_at.len() < 7 {
                continue;
            }
            let year = p.published_at[0..4].to_string();
            let month = p.published_at[5..7].to_string();
            let entry = archive.entry(year.clone()).or_default();
            if let Some(last) = entry.last_mut() {
                if last.month == month {
                    last.count += 1;
                } else {
                    entry.push(ArchiveMonth { month: month.clone(), count: 1 });
                }
            } else {
                entry.push(ArchiveMonth { month: month.clone(), count: 1 });
            }
            month_posts.entry((year, month)).or_default().push(p);
        }
        let mut ctx = tera::Context::new();
        ctx.insert("archive", &archive);
        let html = render("archive.html", ctx, None)?;
        write_page("archive/index.html", &html)?;
        for ((year, month), month_posts) in &month_posts {
            let mut ctx = tera::Context::new();
            ctx.insert("archive_year", year);
            ctx.insert("archive_month", month);
            ctx.insert("posts", month_posts);
            let html = render("archive-month.html", ctx, None)?;
            write_page(&format!("archive/{}/{}/index.html", year, month), &html)?;
        }
    }

    // ---------- 404 / RSS / sitemap / robots ----------
    let html = render("404.html", tera::Context::new(), None)?;
    write_page("404.html", &html)?;

    if cfg.generate.rss {
        let mut ctx = tera::Context::new();
        ctx.insert("posts", &posts);
        let rss = render("feed.xml", ctx, None)?;
        write_page("feed.xml", &rss)?;
    }

    let mut sitemap_paths: Vec<String> = vec!["/".to_string()];
    for p in &posts {
        sitemap_paths.push(format!("/posts/{}/", p.slug));
    }
    for p in &pages {
        if p.slug == "index" || p.slug == "home" {
            continue;
        }
        sitemap_paths.push(format!("/pages/{}/", p.slug));
    }
    if cfg.generate.archive {
        sitemap_paths.push("/archive/".to_string());
        for (year, months) in &archive {
            for m in months {
                sitemap_paths.push(format!("/archive/{}/{}/", year, m.month));
            }
        }
    }
    if cfg.generate.sitemap {
        write_page("sitemap.xml", &feeds::sitemap(&site_view.url, &sitemap_paths))?;
    }
    if cfg.generate.robots {
        write_page("robots.txt", &feeds::robots(&site_view.url))?;
    }

    // ---------- 主题静态资源 ----------
    // 若主题配置含 accent_color，追加 CSS 变量覆盖块，让站点强调色即时生效（FR-T2）。
    let css_override = theme_css_override(&settings);
    for (rel, bytes) in theme_def.assets {
        let dest = dist_new.join("assets").join("theme").join(&theme_id).join(rel);
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent).map_err(|e| Error::Cms(format!("创建目录失败: {}", e)))?;
        }
        let content = if rel.ends_with(".css") && !css_override.is_empty() {
            let mut buf = bytes.to_vec();
            buf.extend_from_slice(b"\n");
            buf.extend_from_slice(css_override.as_bytes());
            buf
        } else {
            bytes.to_vec()
        };
        std::fs::write(&dest, content).map_err(|e| Error::Cms(format!("写入资源失败: {}", e)))?;
        assets_written += 1;
    }

    // ---------- 媒体资源 ----------
    // 将站点 media/ 目录下的文件复制到 dist/assets/media/，供文章/页面图片引用。
    // 按当前年月分目录存储，目录结构保持不变。
    let media_src = Path::new(&workdir).join("media");
    if media_src.is_dir() {
        let media_dest = dist_new.join("assets").join("media");
        match copy_media_dir(&media_src, &media_dest) {
            Ok(count) => assets_written += count,
            Err(e) => warnings.push(format!("媒体资源复制失败: {}", e)),
        }
    }

    // ---------- 原子交换 dist-new → dist ----------
    atomic_swap(&dist_new, &dist_dir)?;

    // ---------- 构建缓存（增量构建指纹，v1 记录内容级哈希） ----------
    write_build_cache(&workdir, &cfg, &posts, &pages, &hashes)?;

    Ok(BuildReport {
        ok: true,
        duration_ms: started.elapsed().as_millis() as u64,
        pages: pages_written,
        assets: assets_written,
        skipped,
        warnings,
        error: None,
        dist_dir: dist_dir.to_string_lossy().to_string(),
    })
}

/// 原子交换：dist → dist-old，dist-new → dist，成功后清理 dist-old；
/// 第二步失败时回滚，保证旧产物不丢。
fn atomic_swap(dist_new: &Path, dist_dir: &Path) -> Result<()> {
    let old = dist_dir.with_extension("old");
    if dist_dir.exists() {
        if old.exists() {
            std::fs::remove_dir_all(&old).map_err(|e| Error::Cms(format!("清理 {} 失败: {}", old.display(), e)))?;
        }
        std::fs::rename(dist_dir, &old).map_err(|e| Error::Cms(format!("交换产物失败: {}", e)))?;
    }
    if let Err(e) = std::fs::rename(dist_new, dist_dir) {
        if old.exists() {
            let _ = std::fs::rename(&old, dist_dir);
        }
        return Err(Error::Cms(format!("产物就位失败: {}", e)));
    }
    if old.exists() {
        let _ = std::fs::remove_dir_all(&old);
    }
    Ok(())
}

/// 构建缓存（增量构建指纹，见 ssg-engine-design.md §5）。
/// key = "post:<slug>" / "page:<slug>"，hash = 内容 content_hash（SHA-256）。
#[derive(Debug, Clone, serde::Deserialize)]
struct BuildCache {
    engine_version: u32,
    posts_per_page: usize,
    entries: BTreeMap<String, CacheEntry>,
}

#[derive(Debug, Clone, serde::Deserialize)]
struct CacheEntry {
    hash: String,
    outputs: Vec<String>,
}

fn cache_path(workdir: &str) -> std::path::PathBuf {
    Path::new(workdir).join(".webcraft").join("build-cache.json")
}

fn read_build_cache(workdir: &str) -> Option<BuildCache> {
    let path = cache_path(workdir);
    let raw = std::fs::read_to_string(&path).ok()?;
    serde_json::from_str(&raw).ok()
}

/// 写入 .webcraft/build-cache.json（增量构建指纹）。
fn write_build_cache(
    workdir: &str,
    cfg: &BuildConfig,
    posts: &[PostView],
    pages: &[PageView],
    hashes: &BTreeMap<String, String>,
) -> Result<()> {
    let cache_dir = Path::new(workdir).join(".webcraft");
    std::fs::create_dir_all(&cache_dir).map_err(|e| Error::Cms(format!("创建缓存目录失败: {}", e)))?;
    let mut entries = serde_json::Map::new();
    for p in posts {
        entries.insert(
            format!("post:{}", p.slug),
            serde_json::json!({
                "hash": hashes.get(&format!("post:{}", p.slug)).map(|s| s.as_str()).unwrap_or(""),
                "outputs": [format!("posts/{}/index.html", p.slug)],
            }),
        );
    }
    for p in pages {
        // slug=index/home 的 page 输出到首页 index.html 而非 pages/index/
        let outputs: Vec<String> = if p.slug == "index" || p.slug == "home" {
            vec!["index.html".to_string()]
        } else {
            vec![format!("pages/{}/index.html", p.slug)]
        };
        entries.insert(
            format!("page:{}", p.slug),
            serde_json::json!({
                "hash": hashes.get(&format!("page:{}", p.slug)).map(|s| s.as_str()).unwrap_or(""),
                "outputs": outputs,
            }),
        );
    }
    let cache = serde_json::json!({
        "engine_version": 1,
        "posts_per_page": cfg.posts_per_page,
        "entries": entries,
    });
    let path = cache_dir.join("build-cache.json");
    std::fs::write(&path, serde_json::to_string_pretty(&cache).unwrap_or_default())
        .map_err(|e| Error::Cms(format!("写入构建缓存失败: {}", e)))?;
    Ok(())
}

/// 递归复制媒体目录，返回复制的文件数量。
/// 仅复制文件，保留目录结构；跳过以 `.` 开头的隐藏文件/目录。
fn copy_media_dir(src: &Path, dest: &Path) -> Result<usize> {
    if !src.is_dir() {
        return Ok(0);
    }
    std::fs::create_dir_all(dest)
        .map_err(|e| Error::Cms(format!("创建媒体目标目录失败: {}", e)))?;

    let mut count = 0usize;
    for entry in std::fs::read_dir(src)
        .map_err(|e| Error::Cms(format!("读取媒体目录失败: {}", e)))?
    {
        let entry = entry.map_err(|e| Error::Cms(format!("读取媒体目录项失败: {}", e)))?;
        let file_name = entry.file_name();
        let name_str = file_name.to_string_lossy();
        // 跳过隐藏文件
        if name_str.starts_with('.') {
            continue;
        }
        let path = entry.path();
        let dest_path = dest.join(&file_name);
        if path.is_dir() {
            count += copy_media_dir(&path, &dest_path)?;
        } else if path.is_file() {
            std::fs::copy(&path, &dest_path)
                .map_err(|e| Error::Cms(format!("复制媒体文件失败: {}", e)))?;
            count += 1;
        }
    }
    Ok(count)
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

    /// 站点必须绑定服务器：为测试预置一台 SSH 连接。
    fn seed_test_connection(db: &Database) -> String {
        let conn = crate::core::types::ConnectionConfig {
            id: "conn-ssg-test".to_string(),
            name: "SSG Test Server".to_string(),
            connection_type: "ssh".to_string(),
            config_json: serde_json::json!({
                "host": "127.0.0.1",
                "port": 22,
                "username": "root",
                "auth_method": "password",
            })
            .to_string(),
            created_at: 1,
        };
        crate::infra::storage::connection_repo::ConnectionRepo::save(db, &conn).unwrap();
        conn.id
    }

    fn seed_site_with_posts(db: &Database, dir: &str) -> String {
        let conn_id = seed_test_connection(db);
        let site = crate::app::cms_service::CmsService::create_site(db, "Test Blog", "example.com", dir, Some(&conn_id), None, None).unwrap();
        let c1 = crate::app::cms_service::CmsService::create_content(db, &site.id, "post", "Hello World").unwrap();
        let mut c1 = c1;
        c1.content_md = "# Hello\n\nWorld **bold**".to_string();
        c1.summary = "A test post".to_string();
        c1.category = "tech".to_string();
        let c1 = crate::app::cms_service::CmsService::save_content(db, &c1).unwrap();
        crate::app::cms_service::CmsService::publish_content(db, &c1.id).unwrap();
        site.id
    }

    #[test]
    fn builds_static_site() {
        let db = test_db();
        let dir = std::env::temp_dir().join(format!("ssg-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let site_id = seed_site_with_posts(&db, dir.to_str().unwrap());
        let report = build(&db, &site_id, true).unwrap();
        assert!(report.ok, "build failed: {:?}", report.error);
        assert!(report.pages >= 4); // index + post + 404 + rss + sitemap + robots + category + archive + tags
        let dist = Path::new(&dir).join("dist");
        assert!(dist.join("index.html").is_file());
        assert!(dist.join("posts/hello-world/index.html").is_file());
        assert!(dist.join("404.html").is_file());
        assert!(dist.join("feed.xml").is_file());
        assert!(dist.join("sitemap.xml").is_file());
        assert!(dist.join("robots.txt").is_file());
        assert!(dist.join("assets/theme/craft-blog/css/main.css").is_file());
        let post_html = std::fs::read_to_string(dist.join("posts/hello-world/index.html")).unwrap();
        assert!(post_html.contains("<strong>bold</strong>"));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn empty_site_builds_index() {
        let db = test_db();
        let dir = std::env::temp_dir().join(format!("ssg-empty-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let site = crate::app::cms_service::CmsService::create_site(&db, "Empty", "", dir.to_str().unwrap(), Some(&seed_test_connection(&db)), None, None).unwrap();
        let report = build(&db, &site.id, true).unwrap();
        assert!(report.ok);
        assert!(Path::new(&dir).join("dist/index.html").is_file());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn theme_override_injects_accent_color() {
        let cfg: Value = serde_json::from_str(r##"{"accent_color":"#FF5500"}"##).unwrap();
        let css = theme_css_override(&cfg);
        assert!(css.contains("--primary: #FF5500;"), "got: {}", css);
        assert!(css.contains("--primary-light:"));
        assert!(css.contains("--border: #FF550024;"));
        // 无 accent_color 时不注入
        let empty: Value = serde_json::from_str("{}").unwrap();
        assert_eq!(theme_css_override(&empty), "");
        // 非法颜色不注入
        let bad: Value = serde_json::from_str(r##"{"accent_color":"red"}"##).unwrap();
        assert_eq!(theme_css_override(&bad), "");
    }

    #[test]
    fn builds_with_selected_theme() {
        let db = test_db();
        let dir = std::env::temp_dir().join(format!("ssg-theme-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let site = crate::app::cms_service::CmsService::create_site(&db, "Docs Site", "docs.example.com", dir.to_str().unwrap(), Some(&seed_test_connection(&db)), None, None).unwrap();
        let mut c = crate::app::cms_service::CmsService::create_content(&db, &site.id, "post", "Docs Post").unwrap();
        c.content_md = "# Docs\n\nBody".to_string();
        let c = crate::app::cms_service::CmsService::save_content(&db, &c).unwrap();
        crate::app::cms_service::CmsService::publish_content(&db, &c.id).unwrap();

        // 切换到 craft-docs 主题
        let mut site = crate::app::cms_service::CmsService::get_site(&db, &site.id).unwrap().unwrap();
        site.theme_id = "craft-docs".to_string();
        crate::app::cms_service::CmsService::update_site(&db, &site).unwrap();

        let report = build(&db, &site.id, true).unwrap();
        assert!(report.ok, "build failed: {:?}", report.error);
        let dist = Path::new(&dir).join("dist");
        // 文档主题资源按主题 id 输出
        assert!(dist.join("assets/theme/craft-docs/css/main.css").is_file(), "craft-docs CSS 缺失");
        let index = std::fs::read_to_string(dist.join("index.html")).unwrap();
        assert!(index.contains("/assets/theme/craft-docs/css/main.css"), "模板未引用文档主题 CSS");
        assert!(index.contains("docs-layout"), "未使用文档主题布局");

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn dark_mode_injects_data_theme_attribute() {
        let db = test_db();
        let dir = std::env::temp_dir().join(format!("ssg-dark-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let site = crate::app::cms_service::CmsService::create_site(&db, "Dark Blog", "dark.example.com", dir.to_str().unwrap(), Some(&seed_test_connection(&db)), None, None).unwrap();
        let mut c = crate::app::cms_service::CmsService::create_content(&db, &site.id, "post", "Dark Post").unwrap();
        c.content_md = "# Dark\n\nBody".to_string();
        let c = crate::app::cms_service::CmsService::save_content(&db, &c).unwrap();
        crate::app::cms_service::CmsService::publish_content(&db, &c.id).unwrap();

        // 设置 dark_mode=dark，构建后 html 应带 data-theme="dark"
        let mut site = crate::app::cms_service::CmsService::get_site(&db, &site.id).unwrap().unwrap();
        site.theme_config_json = r#"{"dark_mode":"dark"}"#.to_string();
        crate::app::cms_service::CmsService::update_site(&db, &site).unwrap();

        let report = build(&db, &site.id, true).unwrap();
        assert!(report.ok, "build failed: {:?}", report.error);
        let dist = Path::new(&dir).join("dist");
        let index = std::fs::read_to_string(dist.join("index.html")).unwrap();
        assert!(index.contains(r#"data-theme="dark""#), "未注入 data-theme=dark");
        // 主题 CSS 应包含深色模式变量块
        let css = std::fs::read_to_string(dist.join("assets/theme/craft-blog/css/main.css")).unwrap();
        assert!(css.contains("[data-theme=\"dark\"]"), "CSS 缺少深色模式变量块");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn incremental_build_skips_unchanged() {
        let db = test_db();
        let dir = std::env::temp_dir().join(format!("ssg-incr-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let site = crate::app::cms_service::CmsService::create_site(&db, "Incr Blog", "incr.example.com", dir.to_str().unwrap(), Some(&seed_test_connection(&db)), None, None).unwrap();
        let mut c1 = crate::app::cms_service::CmsService::create_content(&db, &site.id, "post", "Post One").unwrap();
        c1.content_md = "# One\n\nBody one".to_string();
        let c1 = crate::app::cms_service::CmsService::save_content(&db, &c1).unwrap();
        crate::app::cms_service::CmsService::publish_content(&db, &c1.id).unwrap();
        let mut c2 = crate::app::cms_service::CmsService::create_content(&db, &site.id, "post", "Post Two").unwrap();
        c2.content_md = "# Two\n\nBody two".to_string();
        let c2 = crate::app::cms_service::CmsService::save_content(&db, &c2).unwrap();
        crate::app::cms_service::CmsService::publish_content(&db, &c2.id).unwrap();

        // 首次全量构建
        let r1 = build(&db, &site.id, true).unwrap();
        assert!(r1.ok);
        assert_eq!(r1.skipped, 0, "全量构建不应跳过");

        // 无变化增量构建：两篇文章都应被跳过
        let r2 = build(&db, &site.id, false).unwrap();
        assert!(r2.ok);
        assert_eq!(r2.skipped, 2, "无变化增量构建应跳过 2 篇，实际 {}", r2.skipped);

        // 修改一篇后增量构建：只重渲染被修改的一篇
        let mut c2 = crate::app::cms_service::CmsService::get_content(&db, &c2.id).unwrap().unwrap();
        c2.content_md = "# Two Updated\n\nNew body".to_string();
        let c2 = crate::app::cms_service::CmsService::save_content(&db, &c2).unwrap();
        let r3 = build(&db, &site.id, false).unwrap();
        assert!(r3.ok);
        assert_eq!(r3.skipped, 1, "修改一篇后应只跳过 1 篇，实际 {}", r3.skipped);
        let dist = Path::new(&dir).join("dist");
        let post2 = std::fs::read_to_string(dist.join("posts/post-two/index.html")).unwrap();
        assert!(post2.contains("New body"), "被修改的文章未重新渲染");
        let post1 = std::fs::read_to_string(dist.join("posts/post-one/index.html")).unwrap();
        assert!(post1.contains("Body one"), "未修改的文章内容不应丢失");

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn builds_monthly_archive_and_seo() {
        let db = test_db();
        let dir = std::env::temp_dir().join(format!("ssg-seo-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let site = crate::app::cms_service::CmsService::create_site(&db, "Seo Blog", "seo.example.com", dir.to_str().unwrap(), Some(&seed_test_connection(&db)), None, None).unwrap();
        let mut c = crate::app::cms_service::CmsService::create_content(&db, &site.id, "post", "SEO Post").unwrap();
        c.content_md = "# SEO\n\nBody".to_string();
        c.seo_title = "SEO Custom Title".to_string();
        c.seo_description = "A custom SEO description".to_string();
        let c = crate::app::cms_service::CmsService::save_content(&db, &c).unwrap();
        crate::app::cms_service::CmsService::publish_content(&db, &c.id).unwrap();

        let report = build(&db, &site.id, true).unwrap();
        assert!(report.ok, "build failed: {:?}", report.error);
        let dist = Path::new(&dir).join("dist");
        // CSS 产物路径与模板引用一致（修复 404 bug）
        assert!(dist.join("assets/theme/craft-blog/css/main.css").is_file());
        let base_html = std::fs::read_to_string(dist.join("index.html")).unwrap();
        assert!(base_html.contains("/assets/theme/craft-blog/css/main.css"), "CSS 引用路径错误");
        // 按月归档页生成（修复死链）
        let post_html = std::fs::read_to_string(dist.join("posts/seo-post/index.html")).unwrap();
        assert!(post_html.contains("SEO Custom Title"), "SEO title 未注入");
        assert!(post_html.contains("A custom SEO description"), "SEO description 未注入");
        assert!(post_html.contains("<meta name=\"description\" content=\"A custom SEO description\">"), "meta description 缺失");
        // 归档页链接有对应产物
        let archive_html = std::fs::read_to_string(dist.join("archive/index.html")).unwrap();
        assert!(archive_html.contains("/archive/"), "归档页缺少月份链接");
        // 找到实际生成的月份归档页
        let archive_dir = dist.join("archive");
        if archive_dir.is_dir() {
            let has_month = std::fs::read_dir(&archive_dir)
                .map(|it| it.filter_map(|e| e.ok()).any(|e| e.path().is_dir()))
                .unwrap_or(false);
            assert!(has_month, "未生成按月归档目录");
        }
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn builds_page_with_blocks() {
        let db = test_db();
        let dir = std::env::temp_dir().join(format!("ssg-blocks-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let conn_id = seed_test_connection(&db);
        let site = crate::app::cms_service::CmsService::create_site(
            &db, "Blocks Blog", "blocks.example.com", dir.to_str().unwrap(), Some(&conn_id), None, None,
        ).unwrap();

        // 创建一个带 blocks_json 的 page
        let mut page = crate::app::cms_service::CmsService::create_content(&db, &site.id, "page", "About Us").unwrap();
        page.blocks_json = r###"[
            {"type":"hero","config":{"title":"Welcome","subtitle":"We build things","bg_color":"#1a1a2e"}},
            {"type":"spacer","config":{"height":"32px"}},
            {"type":"text","config":{"content_md":"## Our Story\n\nFounded in **2026**."}},
            {"type":"cta","config":{"title":"Get Started","button_text":"Contact","button_link":"/contact"}}
        ]"###.to_string();
        let page = crate::app::cms_service::CmsService::save_content(&db, &page).unwrap();
        crate::app::cms_service::CmsService::publish_content(&db, &page.id).unwrap();

        let report = build(&db, &site.id, true).unwrap();
        assert!(report.ok, "build failed: {:?}", report.error);
        let dist = Path::new(&dir).join("dist");
        let html = std::fs::read_to_string(dist.join("pages/about-us/index.html")).unwrap();
        // hero 块
        assert!(html.contains("Welcome"), "hero title 缺失");
        assert!(html.contains("We build things"), "hero subtitle 缺失");
        assert!(html.contains("#1a1a2e"), "hero bg_color 缺失");
        // spacer 块
        assert!(html.contains("height:32px"), "spacer 缺失");
        // text 块 Markdown 渲染
        assert!(html.contains("<h2>Our Story</h2>"), "text 块 h2 缺失");
        assert!(html.contains("<strong>2026</strong>"), "text 块 strong 缺失");
        // cta 块
        assert!(html.contains("Get Started"), "cta title 缺失");
        assert!(html.contains("Contact"), "cta button_text 缺失");
        assert!(html.contains("/contact"), "cta button_link 缺失");
        // 不应渲染 Markdown content_md（page 有 blocks_json 时走 blocks 路径）
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn builds_homepage_with_blocks() {
        let db = test_db();
        let dir = std::env::temp_dir().join(format!("ssg-home-blocks-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let conn_id = seed_test_connection(&db);
        let site = crate::app::cms_service::CmsService::create_site(
            &db, "Home Blocks", "homeblocks.example.com", dir.to_str().unwrap(), Some(&conn_id), None, None,
        ).unwrap();

        // 创建 slug=index 的 page 带 blocks_json
        let mut page = crate::app::cms_service::CmsService::create_content(&db, &site.id, "page", "Home").unwrap();
        page.slug = "index".to_string();
        page.blocks_json = r##"[
            {"type":"hero","config":{"title":"Home Page Hero","subtitle":"Subtitle here"}},
            {"type":"cta","config":{"title":"Action","button_text":"Go","button_link":"/go"}}
        ]"##.to_string();
        let page = crate::app::cms_service::CmsService::save_content(&db, &page).unwrap();
        crate::app::cms_service::CmsService::publish_content(&db, &page.id).unwrap();

        let report = build(&db, &site.id, true).unwrap();
        assert!(report.ok, "build failed: {:?}", report.error);
        let dist = Path::new(&dir).join("dist");
        assert!(dist.join("index.html").is_file(), "index.html 不存在");
        let html = std::fs::read_to_string(dist.join("index.html")).unwrap();
        assert!(html.contains("Home Page Hero"), "首页 hero title 缺失");
        assert!(html.contains("Subtitle here"), "首页 hero subtitle 缺失");
        assert!(html.contains("Action"), "首页 cta title 缺失");
        assert!(html.contains("/go"), "首页 cta button_link 缺失");
        std::fs::remove_dir_all(&dir).ok();
    }
}
