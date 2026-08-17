#![allow(dead_code)]

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalSession {
    pub id: String,
    pub name: String,
    pub profile_id: Option<String>,
    pub cwd: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PtyConfig {
    pub rows: u16,
    pub cols: u16,
    pub shell: Option<String>,
    pub cwd: Option<String>,
    pub env: Option<std::collections::HashMap<String, String>>,
    pub connection_type: Option<String>,
    pub ssh: Option<SshConnectionInfo>,
    pub x11_forwarding: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalSize {
    pub rows: u16,
    pub cols: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkedNoteInfo {
    pub link_id: String,
    pub note_id: String,
    pub title: String,
    pub category: String,
    pub group_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandHistoryEntry {
    pub id: String,
    pub session_id: Option<String>,
    pub command: String,
    pub cwd: String,
    pub exit_code: Option<i32>,
    pub executed_at: i64,
    #[serde(default)]
    pub linked: bool,
    #[serde(default)]
    pub linked_notes: Vec<LinkedNoteInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandSnippet {
    pub id: String,
    pub name: String,
    pub command: String,
    pub description: String,
    pub tags: Vec<String>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalProfile {
    pub id: String,
    pub name: String,
    pub config_json: String,
    pub is_default: bool,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionConfig {
    pub id: String,
    pub name: String,
    pub connection_type: String,
    pub config_json: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshConnectionInfo {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_method: String,
    pub private_key_path: Option<String>,
    pub password: Option<String>,
}

/// CMS 领域类型，字段与 src/proto/cms.ts 契约逐一对齐（snake_case，不做 camelCase 改名）。
/// JSON 列以 string 传输，由各端自行解析（结构契约见 docs/cms-database-design.md §4）。

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Site {
    pub id: String,
    pub name: String,
    pub domain: String,
    pub local_workdir: String,
    pub connection_id: Option<String>,
    pub deploy_config_json: String,
    pub build_config_json: String,
    pub theme_id: String,
    pub theme_config_json: String,
    pub status: String,
    pub last_deployed_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

/// site_list 聚合视图（FR-S2）。connection_online 为 None 表示未绑定服务器；
/// 已绑定的在线探测 M2 接入连接池后启用。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SiteSummary {
    #[serde(flatten)]
    pub site: Site,
    pub draft_count: i64,
    pub published_count: i64,
    pub connection_online: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Content {
    pub id: String,
    pub site_id: String,
    #[serde(rename = "type")]
    pub content_type: String,
    pub title: String,
    pub slug: String,
    pub category: String,
    pub summary: String,
    pub cover_media_id: Option<String>,
    pub content_json: String,
    pub content_md: String,
    pub content_hash: String,
    pub seo_title: String,
    pub seo_description: String,
    pub og_image_media_id: Option<String>,
    pub status: String,
    pub scheduled_at: Option<i64>,
    pub published_at: Option<i64>,
    pub pinned: bool,
    pub deleted_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

/// content_list 过滤参数；全部可选，None 表示不过滤。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ContentListFilter {
    #[serde(rename = "type")]
    pub content_type: Option<String>,
    pub status: Option<String>,
    pub keyword: Option<String>,
    /// true = 回收站视图（deleted_at 非空）；默认 false = 正常内容
    pub include_deleted: Option<bool>,
}

#[allow(unused_imports)]
pub use crate::plugins::domain::plugin::PluginManifest;
#[allow(unused_imports)]
pub use crate::plugins::domain::plugin::PluginTool;
#[allow(unused_imports)]
pub use crate::plugins::domain::plugin::ToolParameter;
#[allow(unused_imports)]
pub use crate::plugins::domain::plugin::PluginScenario;
#[allow(unused_imports)]
pub use crate::plugins::domain::changelog::ChangelogEntry;
#[allow(unused_imports)]
pub use crate::plugins::domain::changelog::ToolChange;
#[allow(unused_imports)]
pub use crate::plugins::domain::ui_schema::UiSchema;
#[allow(unused_imports)]
pub use crate::plugins::domain::ui_schema::UiField;
#[allow(unused_imports)]
pub use crate::plugins::domain::ui_schema::QuickAction;
#[allow(unused_imports)]
pub use crate::plugins::domain::ui_schema::ResultViewSpec;
#[allow(unused_imports)]
pub use crate::plugins::domain::ui_schema::TableColumn;
#[allow(unused_imports)]
pub use crate::plugins::domain::usage_log::UsageLogEntry;
#[allow(unused_imports)]
pub use crate::plugins::domain::usage_log::ExecutionMetrics;
