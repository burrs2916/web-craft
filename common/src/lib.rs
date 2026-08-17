//! webcraft-server 配置契约。schema 与校验规则见 docs/server-integration-design.md §4。

use std::collections::HashSet;

use serde::{Deserialize, Serialize};

pub const HANDLER_HEALTH: &str = "health";
pub const HANDLER_CONTENT_API: &str = "content_api";
pub const HANDLER_COMMENTS: &str = "comments";

/// M1 handler 静态枚举（D-SI3）；未列出的 handler 名校验失败即拒绝启动。
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

/// 解析并校验 server.toml。任何错误都应阻止服务启动（默认拒绝，D-SI4）。
pub fn parse_config(toml_str: &str) -> Result<ServerConfig, String> {
    let config: ServerConfig =
        toml::from_str(toml_str).map_err(|e| format!("server.toml 解析失败: {e}"))?;
    validate(&config)?;
    Ok(config)
}

fn validate(config: &ServerConfig) -> Result<(), String> {
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

#[cfg(test)]
mod tests {
    use super::*;

    const VALID: &str = r#"
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
    fn parses_valid_config_with_defaults() {
        let config = parse_config(VALID).unwrap();
        assert_eq!(config.server.port, 8080);
        assert_eq!(config.route.len(), 2);
        assert!(config.route[0].roles.is_empty());
        assert_eq!(config.route[1].roles, vec!["admin".to_string(), "editor".to_string()]);
    }

    #[test]
    fn missing_static_dir_falls_back_to_dist() {
        let config = parse_config(
            r#"
[server]
port = 8080

[auth]
token = "secret"
"#,
        )
        .unwrap();
        assert_eq!(config.server.static_dir, "dist");
        assert!(config.route.is_empty());
    }

    #[test]
    fn rejects_bad_toml() {
        assert!(parse_config("not toml").is_err());
    }

    #[test]
    fn rejects_empty_token() {
        let err = parse_config(
            r#"
[server]
port = 8080

[auth]
token = ""
"#,
        )
        .unwrap_err();
        assert!(err.contains("token"));
    }

    #[test]
    fn rejects_duplicate_path() {
        let err = parse_config(
            r#"
[server]
port = 8080

[auth]
token = "secret"

[[route]]
path = "/healthz"
handler = "health"

[[route]]
path = "/healthz"
handler = "health"
"#,
        )
        .unwrap_err();
        assert!(err.contains("重复"));
    }

    #[test]
    fn rejects_unknown_handler() {
        let err = parse_config(
            r#"
[server]
port = 8080

[auth]
token = "secret"

[[route]]
path = "/api/x"
handler = "nope"
"#,
        )
        .unwrap_err();
        assert!(err.contains("未知 handler"));
    }

    #[test]
    fn rejects_role_outside_allowed() {
        let err = parse_config(
            r#"
[server]
port = 8080

[auth]
token = "secret"
allowed_roles = ["admin"]

[[route]]
path = "/api/content"
handler = "content_api"
roles = ["editor"]
"#,
        )
        .unwrap_err();
        assert!(err.contains("不在 allowed_roles"));
    }

    #[test]
    fn rejects_non_absolute_path() {
        let err = parse_config(
            r#"
[server]
port = 8080

[auth]
token = "secret"

[[route]]
path = "api/content"
handler = "health"
"#,
        )
        .unwrap_err();
        assert!(err.contains("以 / 开头"));
    }
}
