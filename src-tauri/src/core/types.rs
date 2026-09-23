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
pub struct CommandHistoryEntry {
    pub id: String,
    pub session_id: Option<String>,
    pub command: String,
    pub cwd: String,
    pub exit_code: Option<i32>,
    pub executed_at: i64,
    #[serde(default)]
    pub linked: bool,
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
    /// 站点使用的数据库类型：none（纯静态，不需要）/ postgresql
    pub db_type: String,
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

/// 站点域名记录（site_domains 表）。
/// 一个站点可绑定多个域名，其中 is_primary=true 的域名同步写入 sites.domain 冗余字段。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SiteDomain {
    pub id: String,
    pub site_id: String,
    pub domain: String,
    pub is_primary: bool,
    pub created_at: i64,
}

/// 域名 DNS 检测结果（通过 SSH 在服务器上执行 DNS 解析比对）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DomainDnsStatus {
    pub domain: String,
    /// DNS A 记录解析到的 IP
    pub resolved_ip: Option<String>,
    /// 服务器公网 IP
    pub server_ip: Option<String>,
    /// matched | mismatch | unresolved | not_checked
    pub status: String,
    /// 人类可读说明
    pub detail: String,
}

/// 运维脚本参数定义（L2，ops_scripts.parameters_json 元素）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptParam {
    pub name: String,
    pub label: String,
    #[serde(rename = "kind", default = "default_param_kind")]
    pub kind: ParamKind,
    #[serde(default)]
    pub default_value: Option<String>,
    #[serde(default)]
    pub options: Vec<String>,
    #[serde(default)]
    pub required: bool,
}

fn default_param_kind() -> ParamKind {
    ParamKind::Text
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum ParamKind {
    Text,
    Select,
    MultiSelect,
}

/// 参数化运维脚本（L2）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpsScript {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub icon: Option<String>,
    pub script: String,
    #[serde(default)]
    pub parameters: Vec<ScriptParam>,
    #[serde(rename = "dangerLevel")]
    pub danger_level: Danger,
    #[serde(default = "default_timeout_secs")]
    pub timeout_secs: u64,
    #[serde(default)]
    pub confirm_required: bool,
    #[serde(default)]
    pub is_builtin: bool,
    #[serde(default)]
    pub enabled: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

fn default_timeout_secs() -> u64 {
    60
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Danger {
    Safe,
    Careful,
    Dangerous,
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
    /// 区块化页面 JSON（type='page' 时存储区块序列，空串表示无区块）
    #[serde(default)]
    pub blocks_json: String,
    /// 内容已挂标签名（列表批量加载；保存/读取时为空数组）
    #[serde(default)]
    pub tags: Vec<String>,
}

/// content_list 过滤参数；全部可选，None 表示不过滤。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ContentListFilter {
    #[serde(rename = "type")]
    pub content_type: Option<String>,
    pub status: Option<String>,
    pub keyword: Option<String>,
    /// 按标签名精确过滤（仅正常视图生效）
    pub tag: Option<String>,
    /// true = 回收站视图（deleted_at 非空）；默认 false = 正常内容
    pub include_deleted: Option<bool>,
}

/// 站点内容标签（content_tags 表，FR-C8 标签管理）。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContentTag {
    pub id: String,
    pub site_id: String,
    pub name: String,
}

/// 内容标签聚合视图：标签 + 该标签下的内容数量。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContentTagSummary {
    #[serde(flatten)]
    pub tag: ContentTag,
    pub count: i64,
}

/// 内容版本快照（content_versions 表，FR-C7）。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContentVersion {
    pub id: String,
    pub content_id: String,
    pub version_no: i64,
    pub snapshot_json: String,
    pub trigger: String,
    pub comment: String,
    pub created_at: i64,
}

/// 媒体资源（media_assets 表）：上传到站点的图片/附件。
/// 物理文件存放在站点工作目录下的 media/YYYY/MM/<hash>.<ext>，
/// 数据库记录元数据与哈希，支持去重上传。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaAsset {
    pub id: String,
    pub site_id: String,
    pub filename: String,
    /// 相对站点工作目录的存储路径，如 media/2025/08/abc123.jpg
    pub storage_path: String,
    pub mime_type: String,
    pub size_bytes: i64,
    pub width: Option<i32>,
    pub height: Option<i32>,
    /// 文件内容 sha256，用于秒传去重
    pub file_hash: String,
    /// 缩略图相对路径，如 media/2025/08/abc123_thumb.jpg，非图片为 None
    pub thumb_path: Option<String>,
    pub created_at: i64,
}

/// 运维脚本单次执行历史（ops_script_runs 表）：每次脚本运行的审计留痕，
/// 含渲染后命令、参数快照、目标连接与结构化输出。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpsScriptRun {
    pub id: String,
    pub script_id: String,
    pub script_name: String,
    pub category: String,
    pub connection_id: String,
    pub connection_name: String,
    pub command_rendered: String,
    pub params_json: String,
    pub status: String,
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
    pub merged: bool,
    pub truncated: bool,
    pub channel: String,
    pub danger_level: String,
    pub duration_ms: u64,
    pub started_at: i64,
}

/// 远程文件/目录项
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteFileItem {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: i64,
    pub modified_at: i64,
    pub permissions: String,
    pub owner: String,
    pub group: String,
}

/// 远程文件内容
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteFileContent {
    pub path: String,
    pub content: String,
    pub size: i64,
    pub modified_at: i64,
    pub permissions: String,
    pub is_text: bool,
}

/// SSL 证书信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CertInfo {
    pub cert_path: String,
    pub key_path: String,
    pub chain_path: String,
    pub subject: String,
    pub issuer: String,
    pub not_before: i64,
    pub not_after: i64,
    pub days_remaining: i64,
    pub domains: Vec<String>,
    pub fingerprint: String,
    pub exists: bool,
}

// ---------- Scene（场景 = 网站）----------
// 前端 PersistedScene 的 Rust 镜像，全部复杂字段以 JSON 字符串存 TEXT 列。

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedScene {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub coordinate_system: String,
    pub camera: String,
    pub bounds: Option<String>,
    pub layers: String,
    pub bindings: String,
    pub variables: Option<String>,
    pub layout: String,
    pub editor_components: Option<String>,
    pub editor_layers: Option<String>,
    pub canvas_config: Option<String>,
    pub global_components: Option<String>,
    pub views: Option<String>,
    pub active_view_id: Option<String>,
    pub viewport_sync_rules: Option<String>,
    pub category_id: Option<String>,
    pub tags: String,
    pub thumbnail: Option<String>,
    pub status: String,
    pub published_at: Option<i64>,
    pub metadata: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneCategoryRust {
    pub id: String,
    pub name: String,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub sort_order: i32,
    pub parent_id: Option<String>,
    pub description: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
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
