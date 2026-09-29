//! SSG 构建编排（docs/ssg-engine-design.md §4 builder.rs）
//! 数据流水线：published 内容 → Markdown → HTML 片段 → Tera 渲染 → dist/
//! 产物先写 dist-new/ 再原子交换 dist/，构建中途失败不污染上一次产物。
//!
//! 实现按职责拆分到同目录子模块：
//! - `views`    视图模型（SiteView/PostView/PageView…）与 URL、日期辅助
//! - `config`   build_config_json / theme_config_json 解析与主题 CSS 覆盖
//! - `queries`  已发布内容的标签计数、按标签取内容、内容标签查询
//! - `cache`    增量构建缓存读写
//! - `fs_ops`   dist 原子交换与媒体目录复制
//! - `tests`    集成测试

mod cache;
mod config;
mod fs_ops;
mod queries;
mod views;

#[cfg(test)]
mod tests;

use std::collections::BTreeMap;
use std::path::Path;
use std::time::Instant;

use serde::Serialize;

use crate::core::error::{Error, Result};
use crate::core::types::ContentListFilter;
use crate::infra::storage::content_repo::ContentRepo;
use crate::infra::storage::database::Database;
use crate::infra::storage::site_repo::SiteRepo;

use super::feeds;
use super::theme;

use cache::{read_build_cache, write_build_cache};
use config::{parse_build_config, parse_theme_config, resolve_theme_settings, theme_css_override};
use fs_ops::{atomic_swap, copy_media_dir};
use queries::{list_posts_by_tag, list_tag_counts};
use views::{
    build_pagination, media_id_to_url, page_url, page_with_html, post_with_html, site_url,
    to_post_view, ArchiveMonth, PageView, PostView, SiteView,
};

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