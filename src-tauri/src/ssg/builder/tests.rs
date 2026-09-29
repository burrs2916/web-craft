//! builder 集成测试：静态站点构建、增量构建、主题/SEO/区块渲染等。

use super::*;
use crate::infra::storage::migrations;
use serde_json::Value;

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