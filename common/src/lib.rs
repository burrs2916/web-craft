//! webcraft-server 配置契约。
//!
//! 两套结构并存：
//! - 旧版极简结构（ServerConfig / AuthConfig / RouteEntry）：供 M1 阶段部署流水线使用，向后兼容
//! - 新版完整结构（AppConfig）：完整功能的 webcraft-server 配置，含 database/redis/jwt/log 等
//!
//! 部署服务逐步迁移到新版结构。

use std::collections::HashSet;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

// ============================================================
// 旧版极简结构（向后兼容，M1 阶段使用）
// ============================================================

pub const HANDLER_HEALTH: &str = "health";
pub const HANDLER_CONTENT_API: &str = "content_api";
pub const HANDLER_COMMENTS: &str = "comments";

/// M1 handler 静态枚举；未列出的 handler 名校验失败即拒绝启动。
pub const KNOWN_HANDLERS: &[&str] = &[HANDLER_HEALTH, HANDLER_CONTENT_API, HANDLER_COMMENTS];

const DEFAULT_ALLOWED_ROLES: &[&str] = &["admin", "editor", "visitor"];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ServerConfig {
    pub server: HttpConfig,
    pub auth: AuthConfig,
    #[serde(default)]
    pub route: Vec<RouteEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct HttpConfig {
    pub port: u16,
    #[serde(default = "default_static_dir")]
    pub static_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AuthConfig {
    pub token: String,
    #[serde(default = "default_allowed_roles")]
    pub allowed_roles: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RouteEntry {
    pub path: String,
    pub handler: String,
    #[serde(default)]
    pub roles: Vec<String>,
}

fn default_static_dir() -> String {
    "dist".to_string()
}

fn default_allowed_roles() -> Vec<String> {
    DEFAULT_ALLOWED_ROLES.iter().map(|s| s.to_string()).collect()
}

/// 解析并校验 server.toml（旧版极简结构）。
pub fn parse_config(toml_str: &str) -> Result<ServerConfig, String> {
    let config: ServerConfig =
        toml::from_str(toml_str).map_err(|e| format!("server.toml 解析失败: {e}"))?;
    validate_legacy(&config)?;
    Ok(config)
}

/// 序列化 ServerConfig 为 server.toml 文本（旧版）。
pub fn render_config(config: &ServerConfig) -> Result<String, String> {
    validate_legacy(config)?;
    toml::to_string_pretty(config).map_err(|e| format!("server.toml 序列化失败: {e}"))
}

fn validate_legacy(config: &ServerConfig) -> Result<(), String> {
    if config.server.port == 0 {
        return Err("[server] port 不能为 0".into());
    }
    if config.auth.token.trim().is_empty() {
        return Err("[auth] token 不能为空".into());
    }
    if config.auth.allowed_roles.is_empty() {
        return Err("[auth] allowed_roles 不能为空".into());
    }
    let mut seen: HashSet<&str> = HashSet::new();
    for route in &config.route {
        if !route.path.starts_with('/') {
            return Err(format!("[[route]] path 必须以 / 开头: {}", route.path));
        }
        if !seen.insert(route.path.as_str()) {
            return Err(format!("[[route]] path 重复: {}", route.path));
        }
        if !KNOWN_HANDLERS.contains(&route.handler.as_str()) {
            return Err(format!(
                "[[route]] 未知 handler '{}'（可用: {}）",
                route.handler,
                KNOWN_HANDLERS.join(", ")
            ));
        }
        for role in &route.roles {
            if !config.auth.allowed_roles.contains(role) {
                return Err(format!(
                    "[[route]] path {} 的角色 '{}' 不在 allowed_roles 内",
                    route.path, role
                ));
            }
        }
    }
    Ok(())
}

// ============================================================
// 新版完整结构（完整功能 webcraft-server 使用）
// ============================================================

/// 根配置 - 完整功能版
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub server: ServerSection,
    pub database: DatabaseSection,
    pub redis: RedisSection,
    #[serde(default = "default_static_section")]
    pub static_files: StaticSection,
    #[serde(default = "default_jwt_section")]
    pub jwt: JwtSection,
    #[serde(default = "default_log_section")]
    pub log: LogSection,
}

/// HTTP 服务配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerSection {
    /// 监听地址
    #[serde(default = "default_host")]
    pub host: String,
    /// 监听端口
    #[serde(default = "default_port")]
    pub port: u16,
    /// 工作目录（静态文件、上传文件等相对路径的基准）
    #[serde(default)]
    pub work_dir: PathBuf,
    /// 上传文件存储目录（相对 work_dir）
    #[serde(default = "default_upload_dir")]
    pub upload_dir: PathBuf,
    /// 上传文件 URL 前缀
    #[serde(default = "default_upload_url_prefix")]
    pub upload_url_prefix: String,
}

/// 数据库配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseSection {
    /// 连接字符串
    #[serde(default = "default_db_url")]
    pub url: String,
    /// 最大连接数
    #[serde(default = "default_db_max_conn")]
    pub max_connections: u32,
    /// 最小连接数
    #[serde(default = "default_db_min_conn")]
    pub min_connections: u32,
    /// 连接超时（秒）
    #[serde(default = "default_db_timeout")]
    pub connect_timeout_secs: u64,
    /// 自动执行迁移
    #[serde(default = "default_true")]
    pub auto_migrate: bool,
}

/// Redis 配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedisSection {
    /// 连接地址
    #[serde(default = "default_redis_url")]
    pub url: String,
    /// 最大连接数
    #[serde(default = "default_redis_max_conn")]
    pub max_connections: u32,
}

/// 静态文件配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StaticSection {
    /// 静态文件目录（相对 work_dir）
    #[serde(default = "default_static_dir_path")]
    pub dir: PathBuf,
    /// 是否启用 SPA fallback
    #[serde(default)]
    pub spa_fallback: bool,
    /// 缓存最大年龄（秒），0 表示不缓存
    #[serde(default = "default_cache_max_age")]
    pub cache_max_age_secs: u64,
}

/// JWT 配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JwtSection {
    /// 密钥
    #[serde(default = "default_jwt_secret")]
    pub secret: String,
    /// 访问 Token 过期时间（分钟）
    #[serde(default = "default_access_expire")]
    pub access_token_expire_minutes: u64,
    /// 刷新 Token 过期时间（天）
    #[serde(default = "default_refresh_expire")]
    pub refresh_token_expire_days: u64,
    /// Token 前缀
    #[serde(default = "default_token_prefix")]
    pub token_prefix: String,
}

/// 日志配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogSection {
    /// 日志级别：trace / debug / info / warn / error
    #[serde(default = "default_log_level")]
    pub level: String,
    /// 是否输出 JSON 格式
    #[serde(default)]
    pub json_format: bool,
}

// ---- 默认值函数 ----

fn default_host() -> String {
    "0.0.0.0".to_string()
}
fn default_port() -> u16 {
    18080
}
fn default_upload_dir() -> PathBuf {
    PathBuf::from("uploads")
}
fn default_upload_url_prefix() -> String {
    "uploads".to_string()
}
fn default_db_url() -> String {
    "postgresql://webcraft:webcraft@localhost:5432/webcraft".to_string()
}
fn default_db_max_conn() -> u32 {
    10
}
fn default_db_min_conn() -> u32 {
    2
}
fn default_db_timeout() -> u64 {
    10
}
fn default_redis_url() -> String {
    "redis://127.0.0.1:6379/0".to_string()
}
fn default_redis_max_conn() -> u32 {
    20
}
fn default_static_section() -> StaticSection {
    StaticSection {
        dir: PathBuf::from("dist"),
        spa_fallback: true,
        cache_max_age_secs: 3600,
    }
}
fn default_static_dir_path() -> PathBuf {
    PathBuf::from("dist")
}
fn default_cache_max_age() -> u64 {
    3600
}
fn default_jwt_section() -> JwtSection {
    JwtSection {
        secret: "".to_string(), // 部署时必须注入，空值会被校验拒绝
        access_token_expire_minutes: 120,
        refresh_token_expire_days: 7,
        token_prefix: "Bearer".to_string(),
    }
}
fn default_jwt_secret() -> String {
    "".to_string()
}
fn default_access_expire() -> u64 {
    120
}
fn default_refresh_expire() -> u64 {
    7
}
fn default_token_prefix() -> String {
    "Bearer".to_string()
}
fn default_log_section() -> LogSection {
    LogSection {
        level: "info".to_string(),
        json_format: false,
    }
}
fn default_log_level() -> String {
    "info".to_string()
}
fn default_true() -> bool {
    true
}

/// 解析并校验完整配置（新版）。
pub fn parse_full_config(toml_str: &str) -> Result<AppConfig, String> {
    let config: AppConfig =
        toml::from_str(toml_str).map_err(|e| format!("server.toml 解析失败: {e}"))?;
    validate_full(&config)?;
    Ok(config)
}

/// 序列化完整配置为 server.toml 文本（新版）。
pub fn render_full_config(config: &AppConfig) -> Result<String, String> {
    validate_full(config)?;
    toml::to_string_pretty(config).map_err(|e| format!("server.toml 序列化失败: {e}"))
}

fn validate_full(config: &AppConfig) -> Result<(), String> {
    // server
    if config.server.port == 0 {
        return Err("[server] port 不能为 0".into());
    }
    if config.server.host.trim().is_empty() {
        return Err("[server] host 不能为空".into());
    }

    // database
    if config.database.url.trim().is_empty() {
        return Err("[database] url 不能为空".into());
    }
    if !config.database.url.starts_with("postgresql://") && !config.database.url.starts_with("postgres://") {
        return Err("[database] url 必须是 postgresql:// 协议".into());
    }
    if config.database.max_connections == 0 {
        return Err("[database] max_connections 必须大于 0".into());
    }

    // redis
    if config.redis.url.trim().is_empty() {
        return Err("[redis] url 不能为空".into());
    }
    if !config.redis.url.starts_with("redis://") {
        return Err("[redis] url 必须是 redis:// 协议".into());
    }
    if config.redis.max_connections == 0 {
        return Err("[redis] max_connections 必须大于 0".into());
    }

    // jwt - 部署时必须注入密钥
    if config.jwt.secret.trim().is_empty() {
        return Err("[jwt] secret 不能为空，请在部署时注入随机密钥".into());
    }
    if config.jwt.secret.len() < 16 {
        return Err("[jwt] secret 长度至少 16 位，建议 32 位以上".into());
    }
    if config.jwt.access_token_expire_minutes == 0 {
        return Err("[jwt] access_token_expire_minutes 必须大于 0".into());
    }
    if config.jwt.refresh_token_expire_days == 0 {
        return Err("[jwt] refresh_token_expire_days 必须大于 0".into());
    }

    // log
    let valid_levels = ["trace", "debug", "info", "warn", "error"];
    if !valid_levels.contains(&config.log.level.as_str()) {
        return Err(format!(
            "[log] level 必须是 {} 之一",
            valid_levels.join("/")
        ));
    }

    Ok(())
}

// ============================================================
// 部署辅助工具
// ============================================================

/// 生成随机 JWT 密钥（32 字节 hex）
pub fn generate_jwt_secret() -> String {
    use uuid::Uuid;
    // 用两个 UUID 拼接，得到 64 字符的随机字符串
    format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple())
}

/// 快速生成一份生产可用的默认配置（密钥随机生成）
pub fn default_production_config(
    port: u16,
    db_url: &str,
    redis_url: &str,
) -> AppConfig {
    AppConfig {
        server: ServerSection {
            host: default_host(),
            port,
            work_dir: PathBuf::from("."),
            upload_dir: default_upload_dir(),
            upload_url_prefix: default_upload_url_prefix(),
        },
        database: DatabaseSection {
            url: db_url.to_string(),
            max_connections: default_db_max_conn(),
            min_connections: default_db_min_conn(),
            connect_timeout_secs: default_db_timeout(),
            auto_migrate: true,
        },
        redis: RedisSection {
            url: redis_url.to_string(),
            max_connections: default_redis_max_conn(),
        },
        static_files: default_static_section(),
        jwt: JwtSection {
            secret: generate_jwt_secret(),
            access_token_expire_minutes: default_access_expire(),
            refresh_token_expire_days: default_refresh_expire(),
            token_prefix: default_token_prefix(),
        },
        log: LogSection {
            level: "info".to_string(),
            json_format: true, // 生产环境用 JSON 日志
        },
    }
}

// ============================================================
// 测试
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;

    // ---- 旧版兼容性测试 ----

    const LEGACY_VALID: &str = r#"
[server]
port = 8080
static_dir = "dist"

[auth]
token = "secret"
allowed_roles = ["admin", "editor"]

[[route]]
path = "/healthz"
handler = "health"

[[route]]
path = "/api/content"
handler = "content_api"
roles = ["admin", "editor"]
"#;

    #[test]
    fn legacy_parse_valid() {
        let config = parse_config(LEGACY_VALID).unwrap();
        assert_eq!(config.server.port, 8080);
        assert_eq!(config.route.len(), 2);
    }

    #[test]
    fn legacy_rejects_empty_token() {
        assert!(parse_config(
            r#"
[server]
port = 8080
[auth]
token = ""
"#
        )
        .is_err());
    }

    // ---- 新版完整配置测试 ----

    #[test]
    fn full_config_defaults() {
        let toml_str = r#"
[server]
port = 18080

[database]
url = "postgresql://user:pass@localhost:5432/db"

[redis]
url = "redis://localhost:6379/0"

[jwt]
secret = "this_is_a_long_enough_secret_key_12345"
"#;
        let config = parse_full_config(toml_str).unwrap();
        assert_eq!(config.server.port, 18080);
        assert_eq!(config.server.host, "0.0.0.0");
        assert_eq!(config.database.max_connections, 10);
        assert_eq!(config.redis.max_connections, 20);
        assert_eq!(config.jwt.access_token_expire_minutes, 120);
        assert_eq!(config.log.level, "info");
        assert!(config.static_files.spa_fallback);
    }

    #[test]
    fn full_config_rejects_short_secret() {
        let toml_str = r#"
[server]
port = 18080

[database]
url = "postgresql://user:pass@localhost:5432/db"

[redis]
url = "redis://localhost:6379/0"

[jwt]
secret = "short"
"#;
        let err = parse_full_config(toml_str).unwrap_err();
        assert!(err.contains("至少 16 位"));
    }

    #[test]
    fn full_config_rejects_empty_secret() {
        let toml_str = r#"
[server]
port = 18080

[database]
url = "postgresql://user:pass@localhost:5432/db"

[redis]
url = "redis://localhost:6379/0"
"#;
        let err = parse_full_config(toml_str).unwrap_err();
        assert!(err.contains("secret"));
    }

    #[test]
    fn full_config_rejects_bad_db_url() {
        let toml_str = r#"
[server]
port = 18080

[database]
url = "mysql://..."

[redis]
url = "redis://localhost:6379/0"

[jwt]
secret = "this_is_a_long_enough_secret_key_12345"
"#;
        let err = parse_full_config(toml_str).unwrap_err();
        assert!(err.contains("postgresql"));
    }

    #[test]
    fn full_config_render_roundtrip() {
        let config = default_production_config(
            18080,
            "postgresql://u:p@localhost:5432/db",
            "redis://localhost:6379/0",
        );
        let toml_str = render_full_config(&config).unwrap();
        let parsed = parse_full_config(&toml_str).unwrap();
        assert_eq!(parsed.server.port, config.server.port);
        assert_eq!(parsed.database.url, config.database.url);
        assert_eq!(parsed.redis.url, config.redis.url);
        assert_eq!(parsed.jwt.secret, config.jwt.secret);
    }

    #[test]
    fn generate_secret_is_long_enough() {
        let secret = generate_jwt_secret();
        assert!(secret.len() >= 32);
    }
}
