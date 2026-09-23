//! 本地预览服务：在 127.0.0.1 随机端口提供 dist/ 静态文件，
//! 无需 webcraft-server 二进制。子进程方式已废弃，改为 tokio 原生 listener。

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde::Serialize;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::sync::Mutex;

use crate::infra::storage::database::Database;
use crate::infra::storage::site_repo::SiteRepo;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewInfo {
    pub site_id: String,
    pub base_url: String,
    pub healthz_url: String,
    pub port: u16,
    pub alive: bool,
}

struct PreviewRun {
    shutdown: tokio::sync::oneshot::Sender<()>,
    port: u16,
    base_url: String,
    healthz_url: String,
}

pub struct PreviewService {
    runs: Arc<Mutex<HashMap<String, PreviewRun>>>,
}

impl PreviewService {
    pub fn new() -> Self {
        PreviewService {
            runs: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// 启动（或重启）某站点的本地预览。dist/ 不存在则报错返回。
    pub async fn start(
        &self,
        db: &Database,
        _data_dir: &Path,
        site_id: &str,
    ) -> Result<PreviewInfo, String> {
        let site = SiteRepo::get_by_id(db, site_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("site not found: {}", site_id))?;

        // local_workdir 为空时无法预览（站点尚未绑定网站）
        if site.local_workdir.trim().is_empty() {
            return Err("站点尚未绑定网站，本地工作目录为空（请先绑定已发布网站）".to_string());
        }

        let dist_dir = Path::new(&site.local_workdir).join("dist");
        if !dist_dir.is_dir() {
            return Err(format!(
                "dist not found: {}（please build first）",
                dist_dir.display()
            ));
        }

        // 只对本站保持单实例：重复启动先停旧进程。
        self.stop(site_id).await;

        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .map_err(|e| format!("bind preview port failed: {}", e))?;
        let port = listener
            .local_addr()
            .map_err(|e| e.to_string())?
            .port();

        let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();
        let dist_dir = Arc::new(dist_dir);
        let base_url = format!("http://127.0.0.1:{}", port);
        let healthz_url = format!("{}/healthz", base_url);

        tokio::spawn(Self::serve_loop(
            listener,
            dist_dir,
            shutdown_rx,
        ));

        self.runs.lock().await.insert(
            site_id.to_string(),
            PreviewRun {
                shutdown: shutdown_tx,
                port,
                base_url: base_url.clone(),
                healthz_url: healthz_url.clone(),
            },
        );

        Ok(PreviewInfo {
            site_id: site_id.to_string(),
            base_url,
            healthz_url,
            port,
            alive: true,
        })
    }

    /// 停止本地预览。
    pub async fn stop(&self, site_id: &str) -> Result<(), String> {
        let mut runs = self.runs.lock().await;
        if let Some(run) = runs.remove(site_id) {
            let _ = run.shutdown.send(());
        }
        Ok(())
    }

    /// 当前运行态概览。
    pub async fn list(&self) -> Vec<PreviewInfo> {
        let runs = self.runs.lock().await;
        runs.iter()
            .map(|(id, run)| PreviewInfo {
                site_id: id.clone(),
                base_url: run.base_url.clone(),
                healthz_url: run.healthz_url.clone(),
                port: run.port,
                alive: true,
            })
            .collect()
    }

    // ── internal ──────────────────────────────────────────────

    async fn serve_loop(
        listener: TcpListener,
        dist_dir: Arc<PathBuf>,
        mut shutdown: tokio::sync::oneshot::Receiver<()>,
    ) {
        use tokio::select;
        loop {
            select! {
                // Accept new connections
                accept_result = listener.accept() => {
                    match accept_result {
                        Ok((stream, _addr)) => {
                            let dir = Arc::clone(&dist_dir);
                            tokio::spawn(Self::handle_conn(stream, dir));
                        }
                        Err(e) => {
                            tracing::warn!("preview listener accept error: {}", e);
                            break;
                        }
                    }
                }
                // Shutdown signal received
                _ = &mut shutdown => {
                    tracing::info!("preview server shutting down");
                    break;
                }
            }
        }
    }

    async fn handle_conn(mut stream: tokio::net::TcpStream, dist_dir: Arc<PathBuf>) {
        // Read request (just need the first line for path)
        let mut buf = vec![0u8; 4096];
        let n = match stream.read(&mut buf).await {
            Ok(0) | Err(_) => return,
            Ok(n) => n,
        };
        let request = String::from_utf8_lossy(&buf[..n]);

        // Parse: "GET /path HTTP/1.1\r\n..."
        let first_line = request.lines().next().unwrap_or("GET / HTTP/1.1");
        let mut parts = first_line.split_whitespace();
        let _method = parts.next().unwrap_or("GET");
        let raw_path = parts.next().unwrap_or("/");

        // Strip query string
        let path = raw_path.split('?').next().unwrap_or(raw_path);
        let path = percent_decode(path);

        // /healthz → 200 OK
        if path == "/healthz" {
            let resp = "HTTP/1.1 200 OK\r\nContent-Length: 2\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\nok";
            let _ = stream.write_all(resp.as_bytes()).await;
            let _ = stream.shutdown().await;
            return;
        }

        // Resolve file path safely (prevent path traversal)
        let file_path = resolve_safe(dist_dir.as_ref(), &path);

        // Read file and determine content-type
        let (status, content_type, body): (u16, &str, Vec<u8>) = match file_path {
            Some(fp) if fp.is_file() => {
                match tokio::fs::read(&fp).await {
                    Ok(data) => {
                        let ct = content_type_for(&fp);
                        (200, ct, data)
                    }
                    Err(_) => (500, "text/plain", b"500 Internal Server Error".to_vec()),
                }
            }
            _ => {
                // 404 — try index.html fallback for SPA-style routing
                let index = dist_dir.join("index.html");
                if index.is_file() {
                    match tokio::fs::read(&index).await {
                        Ok(d) => (200, "text/html; charset=utf-8", d),
                        Err(_) => (404, "text/plain", b"404 Not Found".to_vec()),
                    }
                } else {
                    (404, "text/plain", b"404 Not Found".to_vec())
                }
            }
        };

        // Write response
        let header = format!(
            "HTTP/1.1 {} OK\r\nContent-Type: {}\r\nContent-Length: {}\r\nConnection: close\r\nCache-Control: no-cache\r\nAccess-Control-Allow-Origin: *\r\n\r\n",
            status,
            content_type,
            body.len()
        );
        let mut response = Vec::with_capacity(header.len() + body.len());
        response.extend_from_slice(header.as_bytes());
        response.extend_from_slice(&body);

        let _ = stream.write_all(&response).await;
        let _ = stream.shutdown().await;
    }
}

// ── helpers ──────────────────────────────────────────────────

/// Percent-decode a URL path (handles %20, %2F, etc.).
fn percent_decode(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let bytes = input.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or("");
            if let Ok(n) = u8::from_str_radix(hex, 16) {
                out.push(n as char);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i] as char);
        i += 1;
    }
    out
}

/// Safely resolve a URL path under the dist directory, preventing traversal.
fn resolve_safe(dist_dir: &Path, url_path: &str) -> Option<PathBuf> {
    // Normalize: strip leading slashes
    let rel = url_path.trim_start_matches('/');

    // Empty path → index.html
    if rel.is_empty() {
        return Some(dist_dir.join("index.html"));
    }

    // Build candidate path
    let candidate = dist_dir.join(rel);

    // Canonicalize and verify it's under dist_dir
    let canonical = candidate.canonicalize().ok()?;
    let dist_canonical = dist_dir.canonicalize().ok()?;

    if canonical.starts_with(&dist_canonical) {
        Some(canonical)
    } else {
        None
    }
}

/// Determine Content-Type from file extension.
fn content_type_for(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase()
        .as_str()
    {
        "html" | "htm" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" | "mjs" => "application/javascript; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "webp" => "image/webp",
        "ico" => "image/x-icon",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "ttf" => "font/ttf",
        "otf" => "font/otf",
        "wasm" => "application/wasm",
        "txt" => "text/plain; charset=utf-8",
        "xml" => "application/xml; charset=utf-8",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "mp3" => "audio/mpeg",
        "ogg" => "audio/ogg",
        "pdf" => "application/pdf",
        _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_safe_blocks_traversal() {
        let tmp = std::env::temp_dir().join(format!(
            "preview-test-{}",
            std::process::id()
        ));
        std::fs::create_dir_all(&tmp).unwrap();
        std::fs::write(tmp.join("index.html"), "<h1>hi</h1>").unwrap();

        // Normal path
        assert!(resolve_safe(&tmp, "/index.html").is_some());

        // Empty → index.html
        assert!(resolve_safe(&tmp, "/").is_some());

        // Path traversal blocked
        assert!(resolve_safe(&tmp, "/../../../etc/passwd").is_none());

        std::fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn content_type_basic() {
        assert_eq!(
            content_type_for(Path::new("style.css")),
            "text/css; charset=utf-8"
        );
        assert_eq!(
            content_type_for(Path::new("app.js")),
            "application/javascript; charset=utf-8"
        );
        assert_eq!(
            content_type_for(Path::new("logo.png")),
            "image/png"
        );
        assert_eq!(
            content_type_for(Path::new("unknown.xyz")),
            "application/octet-stream"
        );
    }

    #[test]
    fn percent_decode_basic() {
        assert_eq!(percent_decode("/hello%20world"), "/hello world");
        assert_eq!(percent_decode("/path/to/file"), "/path/to/file");
        assert_eq!(percent_decode("/"), "/");
    }
}
