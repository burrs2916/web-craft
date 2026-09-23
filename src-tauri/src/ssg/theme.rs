//! 内置主题注册表：craft-blog（博客）/ craft-docs（文档）。
//! 模板与静态资源以 include_str!/include_bytes! 编译期嵌入，随应用分发
//! （docs/theme-system-design.md §2"内置主题随应用分发"）。

use tera::Tera;

pub const THEME_ID: &str = "craft-blog";

/// 主题设置项模型（与 theme.json settings 对齐，供前端动态渲染表单）。
#[derive(Debug, Clone)]
pub struct ThemeSetting {
    pub key: &'static str,
    pub label: &'static str,
    pub kind: &'static str,
    pub default: &'static str,
    pub options: &'static [(&'static str, &'static str)],
}

/// 内置主题定义。
pub struct ThemeDef {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    pub license: &'static str,
    pub settings: &'static [ThemeSetting],
    pub templates: &'static [(&'static str, &'static str)],
    pub assets: &'static [(&'static str, &'static [u8])],
}

const CRAFT_BLOG: ThemeDef = ThemeDef {
    id: "craft-blog",
    name: "Craft Blog",
    description: "极简双栏博客主题（v2）：现代排版 + 深色模式，WebCraft 默认主题",
    license: "free",
    settings: &[
        ThemeSetting { key: "tagline", label: "站点标语", kind: "text", default: "", options: &[] },
        ThemeSetting { key: "logo_media_id", label: "站点 Logo", kind: "media", default: "", options: &[] },
        ThemeSetting { key: "accent_color", label: "强调色", kind: "color", default: "#0F766E", options: &[] },
        ThemeSetting {
            key: "dark_mode",
            label: "深色模式",
            kind: "select",
            default: "auto",
            options: &[("auto", "跟随系统"), ("light", "始终浅色"), ("dark", "始终深色")],
        },
        ThemeSetting {
            key: "nav_links_json",
            label: "导航菜单",
            kind: "nav-list",
            default: "",
            options: &[],
        },
        ThemeSetting { key: "footer_text", label: "页脚文字", kind: "textarea", default: "", options: &[] },
        ThemeSetting {
            key: "show_tagline",
            label: "显示站点标语",
            kind: "toggle",
            default: "true",
            options: &[],
        },
    ],
    templates: &[
        ("base.html", include_str!("../../themes/craft-blog/templates/base.html")),
        ("index.html", include_str!("../../themes/craft-blog/templates/index.html")),
        ("post.html", include_str!("../../themes/craft-blog/templates/post.html")),
        ("page.html", include_str!("../../themes/craft-blog/templates/page.html")),
        ("archive.html", include_str!("../../themes/craft-blog/templates/archive.html")),
        ("archive-month.html", include_str!("../../themes/craft-blog/templates/archive-month.html")),
        ("category.html", include_str!("../../themes/craft-blog/templates/category.html")),
        ("tag.html", include_str!("../../themes/craft-blog/templates/tag.html")),
        ("tags.html", include_str!("../../themes/craft-blog/templates/tags.html")),
        ("404.html", include_str!("../../themes/craft-blog/templates/404.html")),
        ("feed.xml", include_str!("../../themes/craft-blog/templates/feed.xml")),
        ("partials/header.html", include_str!("../../themes/craft-blog/templates/partials/header.html")),
        ("partials/footer.html", include_str!("../../themes/craft-blog/templates/partials/footer.html")),
        // 区块模板
        ("blocks/hero.html", include_str!("../../themes/craft-blog/templates/blocks/hero.html")),
        ("blocks/spacer.html", include_str!("../../themes/craft-blog/templates/blocks/spacer.html")),
        ("blocks/feature.html", include_str!("../../themes/craft-blog/templates/blocks/feature.html")),
        ("blocks/gallery.html", include_str!("../../themes/craft-blog/templates/blocks/gallery.html")),
        ("blocks/text.html", include_str!("../../themes/craft-blog/templates/blocks/text.html")),
        ("blocks/cta.html", include_str!("../../themes/craft-blog/templates/blocks/cta.html")),
        ("blocks/image.html", include_str!("../../themes/craft-blog/templates/blocks/image.html")),
        ("blocks/video.html", include_str!("../../themes/craft-blog/templates/blocks/video.html")),
        ("blocks/contact.html", include_str!("../../themes/craft-blog/templates/blocks/contact.html")),
    ],
    assets: &[
        ("css/main.css", include_bytes!("../../themes/craft-blog/assets/css/main.css")),
        ("css/blocks.css", include_bytes!("../../themes/craft-blog/assets/css/blocks.css")),
    ],
};

const CRAFT_DOCS: ThemeDef = ThemeDef {
    id: "craft-docs",
    name: "Craft Docs",
    description: "文档型主题（v2）：侧边导航 + 阅读排版 + 深色模式，适合手册与知识库",
    license: "free",
    settings: &[
        ThemeSetting { key: "tagline", label: "站点标语", kind: "text", default: "", options: &[] },
        ThemeSetting { key: "logo_media_id", label: "站点 Logo", kind: "media", default: "", options: &[] },
        ThemeSetting { key: "accent_color", label: "强调色", kind: "color", default: "#0284C7", options: &[] },
        ThemeSetting {
            key: "dark_mode",
            label: "深色模式",
            kind: "select",
            default: "auto",
            options: &[("auto", "跟随系统"), ("light", "始终浅色"), ("dark", "始终深色")],
        },
        ThemeSetting { key: "footer_text", label: "页脚文字", kind: "textarea", default: "", options: &[] },
        ThemeSetting {
            key: "show_tagline",
            label: "显示站点标语",
            kind: "toggle",
            default: "true",
            options: &[],
        },
    ],
    templates: &[
        ("base.html", include_str!("../../themes/craft-docs/templates/base.html")),
        ("index.html", include_str!("../../themes/craft-docs/templates/index.html")),
        ("post.html", include_str!("../../themes/craft-docs/templates/post.html")),
        ("page.html", include_str!("../../themes/craft-docs/templates/page.html")),
        ("archive.html", include_str!("../../themes/craft-docs/templates/archive.html")),
        ("archive-month.html", include_str!("../../themes/craft-docs/templates/archive-month.html")),
        ("category.html", include_str!("../../themes/craft-docs/templates/category.html")),
        ("tag.html", include_str!("../../themes/craft-docs/templates/tag.html")),
        ("tags.html", include_str!("../../themes/craft-docs/templates/tags.html")),
        ("404.html", include_str!("../../themes/craft-docs/templates/404.html")),
        ("feed.xml", include_str!("../../themes/craft-docs/templates/feed.xml")),
        ("partials/header.html", include_str!("../../themes/craft-docs/templates/partials/header.html")),
        ("partials/footer.html", include_str!("../../themes/craft-docs/templates/partials/footer.html")),
        // 区块模板（与 craft-blog 共享）
        ("blocks/hero.html", include_str!("../../themes/craft-blog/templates/blocks/hero.html")),
        ("blocks/spacer.html", include_str!("../../themes/craft-blog/templates/blocks/spacer.html")),
        ("blocks/feature.html", include_str!("../../themes/craft-blog/templates/blocks/feature.html")),
        ("blocks/gallery.html", include_str!("../../themes/craft-blog/templates/blocks/gallery.html")),
        ("blocks/text.html", include_str!("../../themes/craft-blog/templates/blocks/text.html")),
        ("blocks/cta.html", include_str!("../../themes/craft-blog/templates/blocks/cta.html")),
        ("blocks/image.html", include_str!("../../themes/craft-blog/templates/blocks/image.html")),
        ("blocks/video.html", include_str!("../../themes/craft-blog/templates/blocks/video.html")),
        ("blocks/contact.html", include_str!("../../themes/craft-blog/templates/blocks/contact.html")),
    ],
    assets: &[
        ("css/main.css", include_bytes!("../../themes/craft-docs/assets/css/main.css")),
        ("css/blocks.css", include_bytes!("../../themes/craft-blog/assets/css/blocks.css")),
    ],
};

/// 内置主题注册表。
pub const THEMES: &[ThemeDef] = &[CRAFT_BLOG, CRAFT_DOCS];

/// 按 id 查找主题定义。
pub fn find_theme(id: &str) -> Option<&'static ThemeDef> {
    THEMES.iter().find(|t| t.id == id)
}

/// 主题元数据（供前端主题选择器展示）。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeMeta {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    pub license: &'static str,
    pub settings: Vec<ThemeSettingMeta>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeSettingMeta {
    pub key: &'static str,
    pub label: &'static str,
    pub kind: &'static str,
    pub default: &'static str,
    pub options: Vec<ThemeOptionMeta>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeOptionMeta {
    pub value: &'static str,
    pub label: &'static str,
}

/// 列出全部内置主题元数据。
pub fn list_themes() -> Vec<ThemeMeta> {
    THEMES
        .iter()
        .map(|t| ThemeMeta {
            id: t.id,
            name: t.name,
            description: t.description,
            license: t.license,
            settings: t
                .settings
                .iter()
                .map(|s| ThemeSettingMeta {
                    key: s.key,
                    label: s.label,
                    kind: s.kind,
                    default: s.default,
                    options: s
                        .options
                        .iter()
                        .map(|(v, l)| ThemeOptionMeta { value: v, label: l })
                        .collect(),
                })
                .collect(),
        })
        .collect()
}

/// 构建一个加载了指定内置主题模板的 Tera 实例。
/// 模板在编译期嵌入，加载失败属编程错误，直接 panic 暴露。
pub fn load_theme(id: &str) -> Option<Tera> {
    let def = find_theme(id)?;
    let mut tera = Tera::default();
    for (name, content) in def.templates {
        tera.add_raw_template(name, content)
            .unwrap_or_else(|e| panic!("内置模板 {} 加载失败: {}", name, e));
    }
    Some(tera)
}
