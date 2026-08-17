//! webcraft-server：axum 单二进制（M-x2 骨架）。
//! 配置驱动的路由表 + Bearer 鉴权 + 静态托管 + 优雅关闭，
//! 设计见 docs/server-integration-design.md。

use std::net::SocketAddr;

use axum::{
    http::{header::AUTHORIZATION, HeaderMap, StatusCode},
    response::IntoResponse,
    routing::get,
    Router,
};
use tower_http::services::ServeDir;
use webcraft_common::{ServerConfig, HANDLER_HEALTH};

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt().init();

    let config_path = std::env::args().nth(1).unwrap_or_else(|| "server.toml".to_string());
    let raw = match std::fs::read_to_string(&config_path) {
        Ok(raw) => raw,
        Err(e) => {
            eprintln!("读取配置 {config_path} 失败: {e}");
            std::process::exit(2);
        }
    };
    let config = match webcraft_common::parse_config(&raw) {
        Ok(config) => config,
        Err(e) => {
            eprintln!("配置校验失败: {e}");
            std::process::exit(2);
        }
    };

    let port = config.server.port;
    let app = build_router(config);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(listener) => listener,
        Err(e) => {
            eprintln!("监听 {addr} 失败: {e}");
            std::process::exit(2);
        }
    };
    tracing::info!("webcraft-server listening on {addr}");

    if let Err(e) = axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
    {
        eprintln!("服务异常退出: {e}");
        std::process::exit(1);
    }
}

/// 按配置路由表构建 Router：health 公开，其余 handler 校验 Bearer token；
/// 未列入路由表的路径落到静态文件服务（SSG dist 产物）。
pub fn build_router(config: ServerConfig) -> Router {
    let static_dir = config.server.static_dir.clone();
    let token = config.auth.token.clone();

    let mut app = Router::new();
    for entry in &config.route {
        let token = token.clone();
        let handler = entry.handler.clone();
        let public = handler == HANDLER_HEALTH;

        let route_handler = move |headers: HeaderMap| async move {
            if !public && !authorized(&headers, &token) {
                return (StatusCode::UNAUTHORIZED, "invalid or missing bearer token").into_response();
            }
            match handler.as_str() {
                HANDLER_HEALTH => (StatusCode::OK, axum::Json(serde_json::json!({ "status": "ok" })))
                    .into_response(),
                other => (
                    StatusCode::NOT_IMPLEMENTED,
                    format!("handler '{other}' 未实现（M1 骨架）"),
                )
                    .into_response(),
            }
        };

        let prefix = entry.path.trim_end_matches('/');
        if prefix.is_empty() {
            // 根路径特殊：只注册精确 "/"
            app = app.route("/", get(route_handler));
        } else {
            // 前缀语义：精确匹配 + 子路径通配各注册一次
            app = app
                .route(&prefix.to_string(), get(route_handler.clone()))
                .route(&format!("{prefix}/*rest"), get(route_handler));
        }
    }

    app.fallback_service(ServeDir::new(static_dir))
}

fn authorized(headers: &HeaderMap, token: &str) -> bool {
    headers
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value == format!("Bearer {token}"))
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("安装 SIGINT 处理器失败");
    };
    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("安装 SIGTERM 处理器失败")
            .recv()
            .await;
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::extract::Request;
    use axum::http::Request as HttpRequest;
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    fn test_config() -> ServerConfig {
        webcraft_common::parse_config(
            r#"
[server]
port = 18080
static_dir = "MISSING_DIR_FOR_TEST"

[auth]
token = "secret"

[[route]]
path = "/healthz"
handler = "health"

[[route]]
path = "/api/content"
handler = "content_api"
roles = ["admin"]
"#,
        )
        .unwrap()
    }

    async fn get_body(response: axum::response::Response) -> String {
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        String::from_utf8(bytes.to_vec()).unwrap()
    }

    #[tokio::test]
    async fn healthz_is_public() {
        let app = build_router(test_config());
        let response = app
            .oneshot(HttpRequest::builder().uri("/healthz").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert!(get_body(response).await.contains("ok"));
    }

    #[tokio::test]
    async fn protected_route_requires_token() {
        let app = build_router(test_config());
        let response = app
            .oneshot(HttpRequest::builder().uri("/api/content").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn protected_route_rejects_wrong_token() {
        let app = build_router(test_config());
        let response = app
            .oneshot(
                HttpRequest::builder()
                    .uri("/api/content")
                    .header(AUTHORIZATION, "Bearer wrong")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn protected_route_with_token_returns_not_implemented() {
        let app = build_router(test_config());
        let response = app
            .oneshot(
                HttpRequest::builder()
                    .uri("/api/content")
                    .header(AUTHORIZATION, "Bearer secret")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_IMPLEMENTED);
        assert!(get_body(response).await.contains("content_api"));
    }

    #[tokio::test]
    async fn route_prefix_matches_subpaths() {
        let app = build_router(test_config());
        let response = app
            .oneshot(
                HttpRequest::builder()
                    .uri("/api/content/posts/hello")
                    .header(AUTHORIZATION, "Bearer secret")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_IMPLEMENTED);
    }

    #[tokio::test]
    async fn unknown_path_falls_back_to_static_service() {
        let dir = std::env::temp_dir().join(format!("webcraft-server-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("index.html"), "<h1>hello</h1>").unwrap();

        let mut config = test_config();
        config.server.static_dir = dir.to_string_lossy().to_string();
        let app = build_router(config);

        let response = app
            .oneshot(HttpRequest::builder().uri("/index.html").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert!(get_body(response).await.contains("hello"));

        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn request_type_smoke() {
        let app = build_router(test_config());
        let request: Request<Body> = HttpRequest::builder().uri("/healthz").body(Body::empty()).unwrap();
        assert_eq!(request.uri().path(), "/healthz");
        let _ = app;
    }
}
