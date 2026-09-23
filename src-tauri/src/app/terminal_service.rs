use crate::core::error::{Error, Result};
use crate::core::types::PtyConfig;
use crate::domain::terminal::pty::Pty;
use crate::interface::events::terminal_events;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;
use tauri::AppHandle;

const OUTPUT_BUFFER_MAX_LINES: usize = 1000;
/// 密码自动填充最大次数，防止死循环（如密码错误反复提示）。
/// SSH 登录占 1 次，其余留给 sudo 等场景。
const MAX_PASSWORD_FILLS: u32 = 10;

struct SessionState {
    pty: std::sync::Arc<Mutex<Pty>>,
    output_buffer: std::sync::Arc<Mutex<Vec<String>>>,
}

pub struct TerminalService {
    sessions: Mutex<HashMap<String, SessionState>>,
    app_handle: Mutex<Option<AppHandle>>,
}

impl TerminalService {
    pub fn new() -> Self {
        TerminalService {
            sessions: Mutex::new(HashMap::new()),
            app_handle: Mutex::new(None),
        }
    }

    pub fn set_app_handle(&self, handle: AppHandle) -> Result<()> {
        *self.app_handle.lock().map_err(|e| Error::Terminal(format!("App handle lock error: {}", e)))? = Some(handle);
        Ok(())
    }

    pub fn spawn(&self, session_id: &str, config: &PtyConfig) -> Result<()> {
        let pty = Pty::spawn(config)?;
        let reader = pty.reader();
        let writer = pty.writer_clone();

        let password: Option<String> = config
            .ssh
            .as_ref()
            .and_then(|s| s.password.clone())
            .filter(|p| !p.is_empty());

        tracing::info!(
            "[terminal] spawn session={}, conn_type={}, auth_method={}, has_password={}",
            session_id,
            config.connection_type.as_deref().unwrap_or("local"),
            config.ssh.as_ref().map(|s| s.auth_method.as_str()).unwrap_or("n/a"),
            password.is_some()
        );

        let buffer = std::sync::Arc::new(Mutex::new(Vec::with_capacity(OUTPUT_BUFFER_MAX_LINES)));
        // pty 用 Arc<Mutex> 共享：reader 线程检测到 host key 变更（远程重装系统）
        // 需要自动清理旧 key 并重建 pty，write/kill/resize 必须跟着走新 pty。
        let pty_arc = std::sync::Arc::new(Mutex::new(pty));

        self.sessions.lock().map_err(|e| Error::Terminal(format!("Session lock error: {}", e)))?.insert(session_id.to_string(), SessionState {
            pty: pty_arc.clone(),
            output_buffer: buffer.clone(),
        });
        let buffer_clone = buffer.clone();

        let sid = session_id.to_string();
        let handle = self.app_handle.lock().map_err(|e| Error::Terminal(format!("App handle lock error: {}", e)))?.clone();
        let config_owned = config.clone();
        let pty_arc_thread = pty_arc.clone();

        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            // 重连时换新 pty 的 reader/writer，故为可变绑定
            let mut reader = reader;
            let mut writer = writer;
            let mut trailing = String::with_capacity(256);
            let mut password_fill_count = 0u32;
            // host key 变更检测用独立缓冲：报错文本可能跨 chunk
            let mut hostkey_buf = String::with_capacity(1024);
            let mut hostkey_retried = false;
            // 自动重连计数（仅 SSH 会话有效）
            let mut reconnect_count = 0u32;
            const MAX_RECONNECTS: u32 = 3;
            let is_ssh = config_owned.ssh.is_some();

            // 外层循环：host key 变更或连接断开时自动重连
            loop {
                let mut normal_exit = false;
                loop {
                    let mut reader_guard = match reader.lock() {
                        Ok(g) => g,
                        Err(_) => return,
                    };
                    match reader_guard.read(&mut buf) {
                        Ok(0) => {
                            drop(reader_guard);
                            normal_exit = true;
                            break;
                        }
                        Ok(n) => {
                            let data = &buf[..n];
                            let output = String::from_utf8_lossy(data).to_string();
                            drop(reader_guard);

                            {
                                if let Ok(mut buf) = buffer_clone.lock() {
                                    for line in output.lines() {
                                        buf.push(line.to_string());
                                        if buf.len() > OUTPUT_BUFFER_MAX_LINES {
                                            buf.remove(0);
                                        }
                                    }
                                }
                            }

                            if let Some(ref h) = handle {
                                terminal_events::emit_terminal_output(h, &sid, &output);
                            }

                            // ---- host key 变更检测（优先于密码检测）----
                            if !hostkey_retried {
                                hostkey_buf.push_str(&output);
                                if hostkey_buf.len() > 4096 {
                                    hostkey_buf = hostkey_buf[hostkey_buf.len() - 4096..].to_string();
                                }
                                let hk_lower = hostkey_buf.to_lowercase();
                                if hk_lower.contains("host key verification failed")
                                    || hk_lower.contains("remote host identification has changed")
                                {
                                    hostkey_retried = true;
                                    if let Some(ref h) = handle {
                                        terminal_events::emit_terminal_output(
                                            h,
                                            &sid,
                                            "\r\n[系统] 检测到远程主机密钥已变更（可能系统已重置），正在自动清除旧密钥并重新连接…\r\n",
                                        );
                                    }
                                    if let Some(ref ssh) = config_owned.ssh {
                                        let _ = crate::core::platform::clear_known_host(&ssh.host, ssh.port);
                                    }
                                    match Pty::spawn(&config_owned) {
                                        Ok(new_pty) => {
                                            {
                                                let mut guard = match pty_arc_thread.lock() {
                                                    Ok(g) => g,
                                                    Err(_) => return,
                                                };
                                                *guard = new_pty;
                                            }
                                            {
                                                let guard = match pty_arc_thread.lock() {
                                                    Ok(g) => g,
                                                    Err(_) => return,
                                                };
                                                reader = guard.reader();
                                                writer = guard.writer_clone();
                                            }
                                        }
                                        Err(e) => {
                                            if let Some(ref h) = handle {
                                                terminal_events::emit_terminal_error(h, &sid, &format!("重新连接失败: {}", e));
                                            }
                                            return;
                                        }
                                    }
                                    // 重连后清状态，重新等密码提示
                                    trailing.clear();
                                    hostkey_buf.clear();
                                    password_fill_count = 0;
                                    break; // 跳出内层循环，继续外层读新 pty
                                }
                            }

                            // 密码自动填充：支持 SSH 登录 + sudo 等多次密码提示场景。
                            if password_fill_count < MAX_PASSWORD_FILLS {
                                if let Some(ref pwd) = password {
                                    trailing.push_str(&output);
                                    if trailing.len() > 256 {
                                        trailing = trailing[trailing.len() - 256..].to_string();
                                    }
                                    if crate::domain::terminal::pty::is_password_prompt(&trailing) {
                                        password_fill_count += 1;
                                        tracing::info!(
                                            "[terminal] Detected password prompt for session {} (count={}/{}), auto-filling...",
                                            sid, password_fill_count, MAX_PASSWORD_FILLS
                                        );
                                        let pw_bytes = format!("{}\n", pwd);
                                        if let Ok(mut w) = writer.lock() {
                                            let _ = w.write_all(pw_bytes.as_bytes());
                                            let _ = w.flush();
                                        }
                                        trailing.clear();
                                    }
                                }
                            }
                        }
                        Err(e) => {
                            drop(reader_guard);
                            // 连接错误：尝试重连（仅 SSH 会话）
                            if is_ssh && reconnect_count < MAX_RECONNECTS {
                                reconnect_count += 1;
                                let delay_ms = 1000 * reconnect_count; // 递增延迟
                                tracing::warn!("[terminal] SSH read error for session {}: {}. Reconnecting ({}/{}, delay={}ms)...",
                                    sid, e, reconnect_count, MAX_RECONNECTS, delay_ms);

                                if let Some(ref h) = handle {
                                    terminal_events::emit_terminal_output(
                                        h,
                                        &sid,
                                        &format!("\r\n[系统] 检测到连接断开（{}），正在自动重连（第 {}/{} 次）…\r\n",
                                            e, reconnect_count, MAX_RECONNECTS),
                                    );
                                }

                                // 等待后尝试重连
                                std::thread::sleep(std::time::Duration::from_millis(delay_ms as u64));

                                match Pty::spawn(&config_owned) {
                                    Ok(new_pty) => {
                                        {
                                            let mut guard = match pty_arc_thread.lock() {
                                                Ok(g) => g,
                                                Err(_) => return,
                                            };
                                            *guard = new_pty;
                                        }
                                        {
                                            let guard = match pty_arc_thread.lock() {
                                                Ok(g) => g,
                                                Err(_) => return,
                                            };
                                            reader = guard.reader();
                                            writer = guard.writer_clone();
                                        }
                                        // 重连成功：重置状态
                                        trailing.clear();
                                        hostkey_buf.clear();
                                        password_fill_count = 0;
                                        hostkey_retried = false;

                                        if let Some(ref h) = handle {
                                            terminal_events::emit_terminal_output(
                                                h,
                                                &sid,
                                                "\r\n[系统] 重新连接成功，继续会话。\r\n",
                                            );
                                        }
                                        break; // 跳出内层循环，继续外层读新 pty
                                    }
                                    Err(reconnect_err) => {
                                        tracing::warn!("[terminal] Reconnect attempt {} failed: {}",
                                            reconnect_count, reconnect_err);
                                        // 继续外层循环，尝试下一次重连
                                        continue;
                                    }
                                }
                            }

                            // 非 SSH 或重连次数用尽
                            if let Some(ref h) = handle {
                                terminal_events::emit_terminal_error(h, &sid, &e.to_string());
                            }
                            return;
                        }
                    }
                }

                // 正常退出（Ok(0)）
                if normal_exit {
                    // SSH 会话：检查是否意外断开，尝试重连
                    if is_ssh && reconnect_count < MAX_RECONNECTS {
                        reconnect_count += 1;
                        let delay_ms = 1000 * reconnect_count;
                        tracing::warn!("[terminal] SSH session {} closed unexpectedly (EOF). Reconnecting ({}/{}, delay={}ms)...",
                            sid, reconnect_count, MAX_RECONNECTS, delay_ms);

                        if let Some(ref h) = handle {
                            terminal_events::emit_terminal_output(
                                h,
                                &sid,
                                &format!("\r\n[系统] 检测到 SSH 连接断开，正在自动重连（第 {}/{} 次）…\r\n",
                                    reconnect_count, MAX_RECONNECTS),
                            );
                        }

                        std::thread::sleep(std::time::Duration::from_millis(delay_ms as u64));

                        match Pty::spawn(&config_owned) {
                            Ok(new_pty) => {
                                {
                                    let mut guard = match pty_arc_thread.lock() {
                                        Ok(g) => g,
                                        Err(_) => return,
                                    };
                                    *guard = new_pty;
                                }
                                {
                                    let guard = match pty_arc_thread.lock() {
                                        Ok(g) => g,
                                        Err(_) => return,
                                    };
                                    reader = guard.reader();
                                    writer = guard.writer_clone();
                                }
                                trailing.clear();
                                hostkey_buf.clear();
                                password_fill_count = 0;
                                hostkey_retried = false;

                                if let Some(ref h) = handle {
                                    terminal_events::emit_terminal_output(
                                        h,
                                        &sid,
                                        "\r\n[系统] 重新连接成功，继续会话。\r\n",
                                    );
                                }
                                continue; // 继续外层循环，读取新连接
                            }
                            Err(e) => {
                                tracing::warn!("[terminal] Reconnect attempt {} failed: {}",
                                    reconnect_count, e);
                                // 继续外层循环，尝试下一次重连
                                continue;
                            }
                        }
                    }

                    // 本地会话或重连次数用尽：正常关闭
                    if let Some(ref h) = handle {
                        terminal_events::emit_terminal_closed(h, &sid, Some(0));
                    }
                    return;
                }
            }
        });

        Ok(())
    }

    pub fn write(&self, session_id: &str, data: &[u8]) -> Result<usize> {
        let sessions = self.sessions.lock().map_err(|e| Error::Terminal(format!("Session lock error: {}", e)))?;
        let state = sessions
            .get(session_id)
            .ok_or_else(|| crate::core::error::Error::Terminal("session not found".into()))?;
        let pty = state.pty.lock().map_err(|e| Error::Terminal(format!("pty lock error: {}", e)))?;
        pty.write(data)
    }

    pub fn kill(&self, session_id: &str) -> Result<()> {
        let mut sessions = self.sessions.lock().map_err(|e| Error::Terminal(format!("Session lock error: {}", e)))?;
        if let Some(state) = sessions.get(session_id) {
            let pty = state.pty.lock().map_err(|e| Error::Terminal(format!("pty lock error: {}", e)))?;
            pty.kill()?;
        }
        sessions.remove(session_id);
        Ok(())
    }

    pub fn resize(&self, session_id: &str, rows: u16, cols: u16) -> Result<()> {
        let sessions = self.sessions.lock().map_err(|e| Error::Terminal(format!("Session lock error: {}", e)))?;
        let state = sessions
            .get(session_id)
            .ok_or_else(|| crate::core::error::Error::Terminal("session not found".into()))?;
        let pty = state.pty.lock().map_err(|e| Error::Terminal(format!("pty lock error: {}", e)))?;
        pty.resize(rows, cols)
    }

    pub fn list_sessions(&self) -> Result<Vec<String>> {
        let sessions = self.sessions.lock().map_err(|e| Error::Terminal(format!("Session lock error: {}", e)))?;
        Ok(sessions.keys().cloned().collect())
    }

    /// 检查指定 session 是否存在且处于活跃状态（进程未退出）。
    pub fn session_alive(&self, session_id: &str) -> bool {
        let sessions = match self.sessions.lock() {
            Ok(s) => s,
            Err(_) => return false,
        };
        let Some(state) = sessions.get(session_id) else {
            return false;
        };
        // 通过 try_wait 检查 PTY 进程是否已退出
        let pty = match state.pty.lock() {
            Ok(p) => p,
            Err(_) => return false,
        };
        matches!(pty.try_wait(), Ok(None))
    }

    pub fn get_output_buffer(&self, session_id: &str, max_lines: usize) -> Result<String> {
        let sessions = self.sessions.lock().map_err(|e| Error::Terminal(format!("Session lock error: {}", e)))?;
        let state = sessions
            .get(session_id)
            .ok_or_else(|| crate::core::error::Error::Terminal("session not found".into()))?;

        let buffer = state.output_buffer.lock().map_err(|e| Error::Terminal(format!("Buffer lock error: {}", e)))?;
        let start = if buffer.len() > max_lines {
            buffer.len() - max_lines
        } else {
            0
        };
        Ok(buffer[start..].join("\n"))
    }

    pub fn get_cwd(&self, session_id: &str) -> Result<Option<String>> {
        let sessions = self.sessions.lock().map_err(|e| Error::Terminal(format!("Session lock error: {}", e)))?;
        let state = sessions
            .get(session_id)
            .ok_or_else(|| crate::core::error::Error::Terminal("session not found".into()))?;

        if let Some(pid) = state.pty.lock().ok().and_then(|p| p.process_id()) {
            let cwd_path = std::path::PathBuf::from(format!("/proc/{}/cwd", pid));
            if cwd_path.exists() {
                return Ok(std::fs::read_link(cwd_path)
                    .ok()
                    .map(|p| p.to_string_lossy().to_string()));
            }
            let lsof = std::process::Command::new("lsof")
                .args(["-Ffn", "-p", &pid.to_string()])
                .output();
            if let Ok(output) = lsof {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let mut found_cwd: Option<String> = None;
                let mut current_fd: Option<String> = None;
                for line in stdout.lines() {
                    let line = line.trim();
                    if line.starts_with('f') {
                        current_fd = Some(line[1..].to_string());
                    } else if line.starts_with('n') && current_fd.as_deref() == Some("cwd") {
                        found_cwd = Some(line[1..].to_string());
                        break;
                    }
                }
                if let Some(cwd) = found_cwd {
                    return Ok(Some(cwd));
                }
            }
        }
        Ok(None)
    }
}
