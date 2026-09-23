//! 区块化页面渲染引擎（blocks_json → HTML）
//!
//! 每个 block 是 `{ "type": "hero", "config": { ... } }` 的 JSON 对象。
//! 本模块负责：解析 JSON → 解析 media_id 为 URL → 渲染 Markdown → Tera 分发渲染。
//! 渲染产出的 HTML 由 builder.rs 注入 page.blocks_html / 首页 homepage_blocks。

use serde_json::Value;
use tera::{Context, Tera};

use crate::core::error::{Error, Result};
use crate::infra::storage::database::Database;
use crate::infra::storage::media_repo::MediaRepo;

use super::markdown;

/// 将 blocks_json（JSON 数组）渲染为拼接 HTML。
/// 空串或空数组返回空字符串。
pub fn render_blocks(tera: &Tera, db: &Database, blocks_json: &str) -> Result<String> {
    let raw = blocks_json.trim();
    if raw.is_empty() {
        return Ok(String::new());
    }
    let blocks: Vec<Value> = serde_json::from_str(raw).unwrap_or_default();
    if blocks.is_empty() {
        return Ok(String::new());
    }

    let mut html_parts: Vec<String> = Vec::with_capacity(blocks.len());
    for block in &blocks {
        let block_type = block
            .get("type")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        if block_type.is_empty() {
            continue;
        }

        // 提取 config（允许 block 直接就是 config 对象，即没有外层 type/config 包装）
        let mut config = block
            .get("config")
            .cloned()
            .unwrap_or_else(|| block.clone());

        // 解析 media_id → 添加 *_url 字段
        resolve_media_ids(db, &mut config);

        // text 区块：预渲染 Markdown → content_html
        if block_type == "text" {
            if let Some(md) = config.get("content_md").and_then(|v| v.as_str()) {
                let html = markdown::render_markdown(md);
                if let Some(obj) = config.as_object_mut() {
                    obj.insert("content_html".to_string(), Value::String(html));
                }
            }
        }

        let mut ctx = Context::new();
        ctx.insert("block", &config);

        let template = format!("blocks/{}.html", block_type);
        let html = tera
            .render(&template, &ctx)
            .map_err(|e| Error::Cms(format!("区块模板 {} 渲染失败: {}", template, e)))?;
        html_parts.push(html);
    }

    Ok(html_parts.join("\n"))
}

/// 递归遍历 JSON，将所有 media_id 类字段解析为 *_url 字段。
/// 支持的字段名：media_id / bg_image / cover_image / logo_media_id
/// 规则：找到非空字符串值 → 查 media_assets 表 → 添加 {原字段}_url = "/assets/{storage_path}"
fn resolve_media_ids(db: &Database, value: &mut Value) {
    match value {
        Value::Object(obj) => {
            // 先递归子节点
            for (_, v) in obj.iter_mut() {
                resolve_media_ids(db, v);
            }
            // 收集 media_id → url 映射
            let additions: Vec<(String, Value)> = obj
                .iter()
                .filter_map(|(k, v)| {
                    let id_str = v.as_str()?;
                    if id_str.is_empty() {
                        return None;
                    }
                    let url_key = media_field_to_url_key(k)?;
                    let url = media_id_to_url(db, id_str)?;
                    Some((url_key, Value::String(url)))
                })
                .collect();
            for (k, v) in additions {
                obj.insert(k, v);
            }
        }
        Value::Array(arr) => {
            for item in arr.iter_mut() {
                resolve_media_ids(db, item);
            }
        }
        _ => {}
    }
}

/// 判断字段名是否是 media_id 引用，返回对应的 *_url 字段名。
/// media_id → media_url
/// bg_image → bg_image_url
/// cover_image → cover_image_url
/// logo_media_id → logo_url
/// 其他 *_media_id → *_url
fn media_field_to_url_key(field: &str) -> Option<String> {
    if field == "media_id" {
        Some("media_url".to_string())
    } else if field == "bg_image" {
        Some("bg_image_url".to_string())
    } else if field == "cover_image" {
        Some("cover_image_url".to_string())
    } else if field == "logo_media_id" {
        Some("logo_url".to_string())
    } else if field.ends_with("_media_id") {
        Some(field.replace("_media_id", "_url"))
    } else {
        None
    }
}

/// 按 media_id 查询 media_assets 表，返回站点根相对 URL。
fn media_id_to_url(db: &Database, media_id: &str) -> Option<String> {
    let asset = MediaRepo::get_by_id(db, media_id).ok()??;
    Some(format!("/assets/{}", asset.storage_path))
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

    fn test_tera() -> Tera {
        let mut tera = Tera::default();
        // 注册最小化的测试模板
        tera.add_raw_template("blocks/spacer.html", r#"<div class="wc-spacer" style="height:{{ block.height | default(value="32px") }}"></div>"#)
            .unwrap();
        tera.add_raw_template("blocks/text.html", r#"<div class="wc-text">{{ block.content_html | safe }}</div>"#)
            .unwrap();
        tera.add_raw_template("blocks/cta.html", r#"<section class="wc-cta" style="background:{{ block.bg_color | default(value="var(--primary)") }}"><h2>{{ block.title }}</h2></section>"#)
            .unwrap();
        tera
    }

    #[test]
    fn empty_json_returns_empty() {
        let db = test_db();
        let tera = test_tera();
        assert_eq!(render_blocks(&tera, &db, "").unwrap(), "");
        assert_eq!(render_blocks(&tera, &db, "[]").unwrap(), "");
    }

    #[test]
    fn renders_spacer_block() {
        let db = test_db();
        let tera = test_tera();
        let json = r#"[{"type":"spacer","config":{"height":"48px"}}]"#;
        let html = render_blocks(&tera, &db, json).unwrap();
        assert!(html.contains("height:48px"));
    }

    #[test]
    fn renders_text_block_with_markdown() {
        let db = test_db();
        let tera = test_tera();
        let json = r##"[{"type":"text","config":{"content_md":"# Hello\n\n**bold** text"}}]"##;
        let html = render_blocks(&tera, &db, json).unwrap();
        assert!(html.contains("<h1>Hello</h1>"));
        assert!(html.contains("<strong>bold</strong>"));
    }

    #[test]
    fn renders_multiple_blocks() {
        let db = test_db();
        let tera = test_tera();
        let json = r##"[
            {"type":"spacer","config":{"height":"10px"}},
            {"type":"cta","config":{"title":"Contact us","bg_color":"#FF0000"}}
        ]"##;
        let html = render_blocks(&tera, &db, json).unwrap();
        assert!(html.contains("height:10px"));
        assert!(html.contains("Contact us"));
        assert!(html.contains("#FF0000"));
    }

    #[test]
    fn skips_unknown_block_type() {
        let db = test_db();
        let tera = test_tera();
        let json = r#"[{"type":"nonexistent","config":{}}]"#;
        let result = render_blocks(&tera, &db, json);
        // 未知模板会报错
        assert!(result.is_err());
    }

    #[test]
    fn media_field_mapping() {
        assert_eq!(media_field_to_url_key("media_id"), Some("media_url".into()));
        assert_eq!(media_field_to_url_key("bg_image"), Some("bg_image_url".into()));
        assert_eq!(media_field_to_url_key("cover_image"), Some("cover_image_url".into()));
        assert_eq!(media_field_to_url_key("logo_media_id"), Some("logo_url".into()));
        assert_eq!(media_field_to_url_key("avatar_media_id"), Some("avatar_url".into()));
        assert_eq!(media_field_to_url_key("title"), None);
    }
}
