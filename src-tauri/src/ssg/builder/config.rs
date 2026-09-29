//! 站点构建配置与主题设置解析：
//! build_config_json → BuildConfig；theme_config_json → Tera 上下文 settings；
//! accent_color → CSS 变量覆盖块。

use serde_json::Value;

use crate::infra::storage::database::Database;
use crate::infra::storage::media_repo::MediaRepo;

/// 读取 build_config_json（契约见 cms-database-design.md §4.2）。
pub(super) struct BuildConfig {
    pub(super) dist_dir: String,
    pub(super) posts_per_page: usize,
    pub(super) generate: GenerateFlags,
}

#[derive(Default)]
pub(super) struct GenerateFlags {
    pub(super) rss: bool,
    pub(super) sitemap: bool,
    pub(super) robots: bool,
    pub(super) archive: bool,
    pub(super) tags: bool,
}

pub(super) fn parse_build_config(raw: &str) -> BuildConfig {
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
pub(super) fn parse_theme_config(raw: &str) -> Value {
    serde_json::from_str(raw).unwrap_or(Value::Object(Default::default()))
}

/// 解析并解析主题设置：将 media id 转为 URL、nav_links_json 解析为数组、toggle 转 bool。
pub(super) fn resolve_theme_settings(db: &Database, raw: &Value) -> Value {
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
pub(super) fn theme_css_override(settings: &Value) -> String {
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