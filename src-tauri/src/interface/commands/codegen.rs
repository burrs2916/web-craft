//! Codegen 命令：预览与发布文件写入 + 预览 HTTP 服务器 + 构建管线
//!
//! 前端 codegenService.ts 通过 invoke 调用以下命令：
//!   - write_preview_file: 写入预览 HTML 到临时目录
//!   - get_preview_url:    启动 HTTP 服务器并返回预览 URL
//!   - write_publish_file: 写入发布 HTML 到指定输出目录
//!   - check_node_available: 检查 Node.js/npm 是否可用
//!   - build_project:      构建工程（npm install + build 或 static-html 直接复制）
//!   - prepare_dist:       将构建产物准备到部署目录

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::sync::Mutex;

// ── 预览服务器 ────────────────────────────────────────────────

struct CodegenPreviewRun {
    shutdown: tokio::sync::oneshot::Sender<()>,
    base_url: String,
}

/// 管理多个 codegen 预览目录的 HTTP 服务器实例
pub struct CodegenPreviewService {
    runs: Arc<Mutex<HashMap<String, CodegenPreviewRun>>>,
}

impl CodegenPreviewService {
    pub fn new() -> Self {
        CodegenPreviewService {
            runs: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// 启动（或重启）某目录的预览服务器
    pub async fn start(&self, dir: &Path) -> Result<String, String> {
        let dir_str = dir.to_string_lossy().to_string();

        // 如果已有运行中的服务器，先停止
        self.stop(&dir_str).await;

        if !dir.is_dir() {
            return Err(format!("preview dir not found: {}", dir.display()));
        }

        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .map_err(|e| format!("bind preview port failed: {}", e))?;
        let port = listener
            .local_addr()
            .map_err(|e| e.to_string())?
            .port();

        let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();
        let dir = Arc::new(dir.to_path_buf());
        let base_url = format!("http://127.0.0.1:{}", port);

        tokio::spawn(Self::serve_loop(listener, dir, shutdown_rx));

        self.runs.lock().await.insert(
            dir_str.clone(),
            CodegenPreviewRun {
                shutdown: shutdown_tx,
                base_url: base_url.clone(),
            },
        );

        Ok(base_url)
    }

    /// 停止某目录的预览服务器
    pub async fn stop(&self, dir: &str) {
        let mut runs = self.runs.lock().await;
        if let Some(run) = runs.remove(dir) {
            let _ = run.shutdown.send(());
        }
    }

    async fn serve_loop(
        listener: TcpListener,
        dir: Arc<PathBuf>,
        mut shutdown: tokio::sync::oneshot::Receiver<()>,
    ) {
        use tokio::select;
        loop {
            select! {
                accept_result = listener.accept() => {
                    match accept_result {
                        Ok((stream, _addr)) => {
                            let d = Arc::clone(&dir);
                            tokio::spawn(Self::handle_conn(stream, d));
                        }
                        Err(e) => {
                            tracing::warn!("codegen preview listener error: {}", e);
                            break;
                        }
                    }
                }
                _ = &mut shutdown => {
                    tracing::info!("codegen preview server shutting down");
                    break;
                }
            }
        }
    }

    async fn handle_conn(mut stream: tokio::net::TcpStream, dir: Arc<PathBuf>) {
        let mut buf = vec![0u8; 4096];
        let n = match stream.read(&mut buf).await {
            Ok(0) | Err(_) => return,
            Ok(n) => n,
        };
        let request = String::from_utf8_lossy(&buf[..n]);

        let first_line = request.lines().next().unwrap_or("GET / HTTP/1.1");
        let mut parts = first_line.split_whitespace();
        let _method = parts.next().unwrap_or("GET");
        let raw_path = parts.next().unwrap_or("/");

        let path = raw_path.split('?').next().unwrap_or(raw_path);
        let path = percent_decode(path);

        // /healthz
        if path == "/healthz" {
            let resp = "HTTP/1.1 200 OK\r\nContent-Length: 2\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\nok";
            let _ = stream.write_all(resp.as_bytes()).await;
            let _ = stream.shutdown().await;
            return;
        }

        let file_path = resolve_safe(dir.as_ref(), &path);

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
                // 404 — try preview.html first (预览模式入口), then index.html
                let preview = dir.join("preview.html");
                let index = dir.join("index.html");
                let fallback = if preview.is_file() {
                    Some(preview)
                } else if index.is_file() {
                    Some(index)
                } else {
                    None
                };
                match fallback {
                    Some(fp) => match tokio::fs::read(&fp).await {
                        Ok(d) => (200, "text/html; charset=utf-8", d),
                        Err(_) => (404, "text/plain", b"404 Not Found".to_vec()),
                    },
                    None => (404, "text/plain", b"404 Not Found".to_vec()),
                }
            }
        };

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

// ── Tauri 命令 ───────────────────────────────────────────────

/// 解析预览目录路径：
/// - 绝对路径 → 直接使用（用户通过 localWorkDir 绑定的目录）
/// - 相对路径 → 拼接到 app_data_dir 下（兼容旧的 web-craft-preview/{sceneId} 方式）
fn resolve_preview_dir(dir: &str, app: &AppHandle) -> Result<PathBuf, String> {
    let p = PathBuf::from(dir);
    if p.is_absolute() {
        Ok(p)
    } else {
        let base = app
            .path()
            .app_data_dir()
            .map_err(|e| format!("app_data_dir: {}", e))?;
        Ok(base.join(&dir))
    }
}

/// 写入预览文件到预览目录（绝对路径直接使用，相对路径拼接到 app_data_dir）
///
/// filename 支持嵌套路径（如 "src/pages/Home.tsx"），会自动创建所需的父目录。
/// 这样预览目录也能包含完整的多文件工程结构。
#[tauri::command]
pub fn write_preview_file(
    dir: String,
    filename: String,
    content: String,
    app: AppHandle,
) -> Result<String, String> {
    let preview_dir = resolve_preview_dir(&dir, &app)?;

    std::fs::create_dir_all(&preview_dir)
        .map_err(|e| format!("create preview dir failed: {}", e))?;

    // filename 可能含子路径（如 "src/pages/Home.tsx"），需创建完整父目录链
    let file_path = preview_dir.join(&filename);
    if let Some(parent) = file_path.parent() {
        if parent != preview_dir {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("create preview subpath dir failed: {}", e))?;
        }
    }

    std::fs::write(&file_path, &content)
        .map_err(|e| format!("write preview file failed: {}", e))?;

    Ok(file_path.to_string_lossy().to_string())
}

/// 启动预览服务器并返回 URL
#[tauri::command(async)]
pub async fn get_preview_url(
    dir: String,
    filename: String,
    app: AppHandle,
    state: State<'_, Arc<CodegenPreviewService>>,
) -> Result<String, String> {
    let preview_dir = resolve_preview_dir(&dir, &app)?;

    let base_url = state.start(&preview_dir).await?;
    let url = format!("{}/{}", base_url, filename);

    Ok(url)
}

/// 写入发布文件到输出目录（支持嵌套路径，如 src/pages/Home.tsx）
///
/// 路径解析逻辑与 write_preview_file 一致：
/// - 绝对路径 → 直接使用（用户通过 localWorkDir 绑定的目录）
/// - 相对路径 → 拼接到 app_data_dir 下（与预览行为一致）
#[tauri::command]
pub fn write_publish_file(
    dir: String,
    filename: String,
    content: String,
    app: AppHandle,
) -> Result<String, String> {
    let output_dir = resolve_preview_dir(&dir, &app)?;

    // filename 可能含子路径（如 "src/pages/Home.tsx"），需创建完整父目录链
    let file_path = output_dir.join(&filename);
    if let Some(parent) = file_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("create publish dir failed: {}", e))?;
    }

    std::fs::write(&file_path, &content)
        .map_err(|e| format!("write publish file failed: {}", e))?;

    Ok(file_path.to_string_lossy().to_string())
}

/// 清空输出目录 — 删除目录下所有内容，然后重新创建空目录
///
/// 每次预览/发布前调用，确保生成的项目是干净的：
/// 不会残留上次生成的旧文件（如已删除的页面、重命名的组件等）。
/// 目录不存在时会自动创建。
#[tauri::command]
pub fn clean_output_dir(dir: String, app: AppHandle) -> Result<(), String> {
    let target_dir = resolve_preview_dir(&dir, &app)?;

    if target_dir.exists() {
        // 删除整个目录（含所有子目录和文件）
        std::fs::remove_dir_all(&target_dir)
            .map_err(|e| format!("clean dir failed: {}", e))?;
    }

    // 重新创建空目录
    std::fs::create_dir_all(&target_dir)
        .map_err(|e| format!("recreate dir failed: {}", e))?;

    Ok(())
}

/// 在系统文件管理器中打开指定目录（macOS Finder / Windows Explorer）
#[tauri::command]
pub fn open_in_finder(dir: String, app: AppHandle) -> Result<(), String> {
    let target_dir = resolve_preview_dir(&dir, &app)?;

    if !target_dir.is_dir() {
        return Err(format!("directory not found: {}", target_dir.display()));
    }

    // macOS: open <dir>, Windows: explorer <dir>, Linux: xdg-open <dir>
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&target_dir)
            .spawn()
            .map_err(|e| format!("failed to open Finder: {}", e))?;
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&target_dir)
            .spawn()
            .map_err(|e| format!("failed to open Explorer: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&target_dir)
            .spawn()
            .map_err(|e| format!("failed to open file manager: {}", e))?;
    }

    Ok(())
}

/// 停止指定目录的预览服务器
#[tauri::command(async)]
pub async fn stop_preview_server(
    dir: String,
    app: AppHandle,
    state: State<'_, Arc<CodegenPreviewService>>,
) -> Result<(), String> {
    let preview_dir = resolve_preview_dir(&dir, &app)?;
    let dir_str = preview_dir.to_string_lossy().to_string();
    state.stop(&dir_str).await;
    Ok(())
}

// ── helpers ──────────────────────────────────────────────────

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

fn resolve_safe(base_dir: &Path, url_path: &str) -> Option<PathBuf> {
    let rel = url_path.trim_start_matches('/');
    if rel.is_empty() {
        // Root path: prefer preview.html (SPA preview entry), fall back to index.html
        let preview = base_dir.join("preview.html");
        if preview.is_file() {
            return Some(preview);
        }
        return Some(base_dir.join("index.html"));
    }
    let candidate = base_dir.join(rel);
    let canonical = candidate.canonicalize().ok()?;
    let base_canonical = base_dir.canonicalize().ok()?;
    if canonical.starts_with(&base_canonical) {
        Some(canonical)
    } else {
        None
    }
}

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
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "mp3" => "audio/mpeg",
        "ogg" => "audio/ogg",
        "pdf" => "application/pdf",
        _ => "application/octet-stream",
    }
}

// ── 构建管线 ──────────────────────────────────────────────────

/// Node.js 环境检查结果
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeCheckResult {
    pub node_available: bool,
    pub npm_available: bool,
    pub node_version: Option<String>,
    pub npm_version: Option<String>,
}

/// 构建结果
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildResult {
    pub success: bool,
    pub framework: String,
    pub project_dir: String,
    pub dist_dir: String,
    pub file_count: u32,
    pub duration_ms: u64,
    pub error: Option<String>,
    pub logs: Vec<String>,
}

/// 构建进度事件
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BuildProgress {
    pub step: String,
    pub message: String,
    pub percent: u8,
}

fn emit_build_progress(app: &AppHandle, step: &str, message: &str, percent: u8) {
    #[derive(Serialize, Clone)]
    #[serde(rename_all = "camelCase")]
    struct Payload<'a> {
        step: &'a str,
        message: &'a str,
        percent: u8,
    }
    let _ = app.emit("build-progress", Payload { step, message, percent });
}

/// 检查 Node.js 和 npm 是否可用
#[tauri::command]
pub fn check_node_available() -> Result<NodeCheckResult, String> {
    // 用 which/where 命令检测（跨平台）
    let node_available = check_command_exists("node");
    let npm_available = check_command_exists("npm");

    let node_version = if node_available {
        std::process::Command::new("node")
            .arg("--version")
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .map(|s| s.trim().to_string())
    } else {
        None
    };

    let npm_version = if npm_available {
        std::process::Command::new("npm")
            .arg("--version")
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .map(|s| s.trim().to_string())
    } else {
        None
    };

    Ok(NodeCheckResult {
        node_available,
        npm_available,
        node_version,
        npm_version,
    })
}

/// 检测命令是否可用（跨平台：Unix 用 which，Windows 用 where）
fn check_command_exists(cmd: &str) -> bool {
    let checker = if cfg!(target_os = "windows") { "where" } else { "which" };
    std::process::Command::new(checker)
        .arg(cmd)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// 构建工程 — 运行 npm install + build，或直接复制 static-html 文件
///
/// 对于 static-html 框架：直接将项目目录内容复制到 dist/
/// 对于 React/Vue/Angular 框架：运行 npm install && npm run build
///
/// 构建完成后，将 dist/ 复制到 output_dist（通常为 {localWorkDir}/dist/），
/// 供 DeployService 读取并上传。
#[tauri::command(async)]
pub async fn build_project(
    dir: String,
    framework: String,
    output_dist: Option<String>,
    app: AppHandle,
) -> Result<BuildResult, String> {
    let start = std::time::Instant::now();
    let project_dir = PathBuf::from(&dir);

    if !project_dir.is_dir() {
        return Err(format!("项目目录不存在: {}", project_dir.display()));
    }

    let mut logs: Vec<String> = Vec::new();
    let framework_lower = framework.to_lowercase();

    // 计算最终 dist 目录（dist 在框架子目录下，避免多框架互相覆盖）
    let final_dist = output_dist.unwrap_or_else(|| {
        project_dir
            .join("dist")
            .to_string_lossy()
            .to_string()
    });

    emit_build_progress(&app, "start", &format!("开始构建 {} 工程", framework), 5);

    if framework_lower == "static-html" {
        // ── static-html：直接复制到 dist/ ──
        emit_build_progress(&app, "copy", "复制静态文件到 dist/", 30);

        let dist_path = PathBuf::from(&final_dist);
        // 清空旧 dist
        if dist_path.exists() {
            std::fs::remove_dir_all(&dist_path)
                .map_err(|e| format!("清理旧 dist 失败: {}", e))?;
        }
        std::fs::create_dir_all(&dist_path)
            .map_err(|e| format!("创建 dist 失败: {}", e))?;

        let count = copy_dir_recursive(&project_dir, &dist_path, &mut logs)
            .map_err(|e| format!("复制文件失败: {}", e))?;

        emit_build_progress(&app, "done", &format!("构建完成，{} 个文件", count), 100);

        return Ok(BuildResult {
            success: true,
            framework,
            project_dir: dir,
            dist_dir: final_dist,
            file_count: count,
            duration_ms: start.elapsed().as_millis() as u64,
            error: None,
            logs,
        });
    }

    // ── React / Vue / Angular：npm install + npm run build ──
    emit_build_progress(&app, "check", "检查 Node.js 环境", 10);

    // 检查 npm 是否可用
    if !check_command_exists("npm") {
        let msg = "npm 不可用。请安装 Node.js 后重试。";
        logs.push(msg.to_string());
        emit_build_progress(&app, "error", msg, 0);
        return Ok(BuildResult {
            success: false,
            framework,
            project_dir: dir,
            dist_dir: final_dist,
            file_count: 0,
            duration_ms: start.elapsed().as_millis() as u64,
            error: Some(msg.to_string()),
            logs,
        });
    }

    emit_build_progress(&app, "install", "安装依赖 (npm install)", 20);

    // npm install
    let install_output = std::process::Command::new("npm")
        .arg("install")
        .current_dir(&project_dir)
        .output()
        .map_err(|e| format!("npm install 启动失败: {}", e))?;

    if !install_output.status.success() {
        let stderr = String::from_utf8_lossy(&install_output.stderr).to_string();
        let stdout = String::from_utf8_lossy(&install_output.stdout).to_string();
        let err_msg = format!("npm install 失败:\n{}\n{}", stdout, stderr);
        logs.push(err_msg.clone());
        emit_build_progress(&app, "error", "安装依赖失败", 0);
        return Ok(BuildResult {
            success: false,
            framework,
            project_dir: dir,
            dist_dir: final_dist,
            file_count: 0,
            duration_ms: start.elapsed().as_millis() as u64,
            error: Some(err_msg),
            logs,
        });
    }

    logs.push("npm install 完成".to_string());
    emit_build_progress(&app, "build", "构建工程 (npm run build)", 40);

    // npm run build
    let build_output = std::process::Command::new("npm")
        .args(["run", "build"])
        .current_dir(&project_dir)
        .output()
        .map_err(|e| format!("npm run build 启动失败: {}", e))?;

    if !build_output.status.success() {
        let stderr = String::from_utf8_lossy(&build_output.stderr).to_string();
        let stdout = String::from_utf8_lossy(&build_output.stdout).to_string();
        let err_msg = format!("npm run build 失败:\n{}\n{}", stdout, stderr);
        logs.push(err_msg.clone());
        emit_build_progress(&app, "error", "构建失败", 0);
        return Ok(BuildResult {
            success: false,
            framework,
            project_dir: dir,
            dist_dir: final_dist,
            file_count: 0,
            duration_ms: start.elapsed().as_millis() as u64,
            error: Some(err_msg),
            logs,
        });
    }

    logs.push("npm run build 完成".to_string());
    emit_build_progress(&app, "collect", "收集构建产物", 70);

    // 找到构建输出目录
    let built_dist = find_built_dist(&project_dir, &framework_lower);
    let built_dist = match built_dist {
        Some(p) => p,
        None => {
            let msg = format!("找不到构建产物 dist/ 目录");
            logs.push(msg.clone());
            return Ok(BuildResult {
                success: false,
                framework,
                project_dir: dir,
                dist_dir: final_dist,
                file_count: 0,
                duration_ms: start.elapsed().as_millis() as u64,
                error: Some(msg),
                logs,
            });
        }
    };

    emit_build_progress(&app, "copy", "复制构建产物到部署目录", 80);

    // 复制到最终 dist 目录
    let dist_path = PathBuf::from(&final_dist);
    if dist_path.exists() {
        std::fs::remove_dir_all(&dist_path)
            .map_err(|e| format!("清理旧 dist 失败: {}", e))?;
    }
    std::fs::create_dir_all(&dist_path)
        .map_err(|e| format!("创建 dist 失败: {}", e))?;

    let count = copy_dir_recursive(&built_dist, &dist_path, &mut logs)
        .map_err(|e| format!("复制构建产物失败: {}", e))?;

    emit_build_progress(&app, "done", &format!("构建完成，{} 个文件", count), 100);

    Ok(BuildResult {
        success: true,
        framework,
        project_dir: dir,
        dist_dir: final_dist,
        file_count: count,
        duration_ms: start.elapsed().as_millis() as u64,
        error: None,
        logs,
    })
}

/// 递归复制目录，返回文件数
fn copy_dir_recursive(src: &Path, dst: &Path, logs: &mut Vec<String>) -> Result<u32, String> {
    if !src.is_dir() {
        return Err(format!("源目录不存在: {}", src.display()));
    }

    // 自我保护：源与目标相同（如 built_dist 与输出 dist 同路径）时无操作，
    // 避免清空后自我复制导致产物丢失。
    if src == dst {
        return Ok(0);
    }

    let mut count = 0u32;

    for entry in std::fs::read_dir(src).map_err(|e| format!("读取目录失败: {} - {}", src.display(), e))? {
        let entry = entry.map_err(|e| format!("读取目录条目失败: {}", e))?;
        let name = entry.file_name();
        let src_path = entry.path();
        let dst_path = dst.join(&name);

        // 跳过 node_modules / .git
        if name == "node_modules" || name == ".git" {
            continue;
        }

        // 关键防护：当输出目录位于源目录内部时（output_dist 常为
        // {workDir}/{framework}/dist，恰是源目录的子目录），遍历到该子目录条目时
        // 必须跳过，否则会把 dist 递归复制进 dist/dist/dist/... 导致文件名无限变长。
        if src_path == dst {
            continue;
        }

        if src_path.is_dir() {
            std::fs::create_dir_all(&dst_path)
                .map_err(|e| format!("创建目录失败: {} - {}", dst_path.display(), e))?;
            count += copy_dir_recursive(&src_path, &dst_path, logs)?;
        } else {
            std::fs::copy(&src_path, &dst_path)
                .map_err(|e| format!("复制文件失败: {} - {}", src_path.display(), e))?;
            count += 1;
        }
    }

    Ok(count)
}

/// 查找框架构建后的 dist 目录
fn find_built_dist(project_dir: &Path, framework: &str) -> Option<PathBuf> {
    let dist = project_dir.join("dist");
    if dist.is_dir() {
        // Angular 默认输出到 dist/{project-name}/，检查是否有子目录
        if framework == "angular" {
            // 查找 dist 下的第一个子目录
            if let Ok(entries) = std::fs::read_dir(&dist) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.is_dir() && p.join("index.html").exists() {
                        return Some(p);
                    }
                }
            }
        }
        // 检查 dist/index.html 存在
        if dist.join("index.html").exists() {
            return Some(dist);
        }
    }
    None
}
