//! Shared OpenSSH ControlMaster connection pool.
//!
//! A pool sits on top of a set of `ssh -M -N` control listeners: one per
//! `user@host#auth_method` lane. Any later `ssh` invocation pointing at the
//! same `ControlPath` multiplexes over the already-authenticated master, so
//! repeated remote execution costs no extra authentication round-trips.
//!
//! This is the single ownership point for the ControlMaster pool (design
//! decision D1). `SftpService` still keeps its own copy of this exact logic;
//! migrating it onto this module is the first step of splitting that file, and
//! is deliberately deferred so the SFTP/deploy path stays untouched.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, MutexGuard};
use std::thread;
use std::time::{Duration, Instant};

use crate::core::platform;
use crate::core::types::SshConnectionInfo;
use crate::domain::terminal::pty::{is_password_prompt, Pty};

/// How long an idle master is kept alive before being reaped.
pub const MASTER_IDLE_TTL: Duration = Duration::from_secs(240);
/// How long we wait for the control socket after spawning a master.
const MASTER_READY_TIMEOUT: Duration = Duration::from_secs(15);

/// Win32-OpenSSH ships without `ControlMaster`, so Windows always falls back to
/// the direct/PTY channels and never tries to multiplex.
pub fn supports_multiplexing() -> bool {
    !cfg!(target_os = "windows")
}

/// A live SSH ControlMaster kept in the pool.
struct PooledMaster {
    control_path: String,
    pty: Pty,
    last_used: Instant,
}

pub struct ConnectionPool {
    masters: Mutex<HashMap<String, PooledMaster>>,
}

fn lock(m: &Mutex<HashMap<String, PooledMaster>>) -> MutexGuard<'_, HashMap<String, PooledMaster>> {
    m.lock().unwrap_or_else(|p| p.into_inner())
}

fn unique_control_path() -> String {
    static SEQ: AtomicU64 = AtomicU64::new(0);
    let seq = SEQ.fetch_add(1, Ordering::Relaxed);
    let pid = std::process::id();
    // macOS' sockaddr_un.sun_path is 104 bytes including NUL, so the socket path
    // must stay tiny. Fall back to /tmp when TMPDIR is deep.
    let name = format!("wcp-{}-{:x}.sock", pid, seq);
    let mut p = std::env::temp_dir().join(&name);
    if p.to_string_lossy().len() > 100 {
        let alt = PathBuf::from("/tmp").join(&name);
        if alt.to_string_lossy().len() <= 100 && Path::new("/tmp").exists() {
            p = alt;
        }
    }
    p.to_string_lossy().into_owned()
}

impl ConnectionPool {
    pub fn new() -> Self {
        ConnectionPool {
            masters: Mutex::new(HashMap::new()),
        }
    }

    fn lane_key(ssh: &SshConnectionInfo) -> String {
        format!(
            "{}@{}:{}#{}#remote-exec",
            ssh.username, ssh.host, ssh.port, ssh.auth_method
        )
    }

    /// Returns a ready-to-use `ControlPath` for `ssh` multiplexing over an
    /// authenticated master, plus whether the master was reused from the pool.
    /// Spawns (and authenticates) a fresh master when nothing usable exists.
    pub fn acquire(&self, ssh: &SshConnectionInfo) -> Result<(String, bool), String> {
        let key = Self::lane_key(ssh);
        let mut map = lock(&self.masters);

        if let Some(mut master) = map.remove(&key) {
            let alive = Path::new(&master.control_path).exists()
                && matches!(master.pty.try_wait(), Ok(None));
            if alive {
                master.last_used = Instant::now();
                let cp = master.control_path.clone();
                map.insert(key, master);
                return Ok((cp, true));
            }
            let _ = master.pty.kill();
            let _ = std::fs::remove_file(&master.control_path);
        }

        let master = spawn_master(ssh)?;
        let cp = master.control_path.clone();
        map.insert(key, master);
        Ok((cp, false))
    }

    /// Reap idle masters; call on a timer or opportunistically.
    pub fn reap(&self) {
        let mut map = lock(&self.masters);
        let stale: Vec<String> = map
            .iter()
            .filter(|(_, m)| m.last_used.elapsed() > MASTER_IDLE_TTL)
            .map(|(k, _)| k.clone())
            .collect();
        for k in stale {
            if let Some(m) = map.remove(&k) {
                let _ = m.pty.kill();
                let _ = std::fs::remove_file(&m.control_path);
            }
        }
    }
}

/// Spawn `ssh -M -N user@host` through a pty (no `-f`: backgrounding detaches
/// ssh from the pty and breaks password-fed masters), answer the password
/// prompt, and wait for the control socket — ssh only creates it after a
/// *successful* authentication, which is our readiness signal.
fn spawn_master(ssh: &SshConnectionInfo) -> Result<PooledMaster, String> {
    for attempt in 0..=1 {
        let control_path = unique_control_path();
        let pty = Pty::spawn_ssh_master(ssh, &control_path)
            .map_err(|e| format!("无法启动 SSH 主连接进程: {}", e))?;

        let reader = pty.reader();
        let writer = pty.writer_clone();
        let password = ssh.password.clone().unwrap_or_default();
        let has_password = !password.is_empty();

        let diag: std::sync::Arc<Mutex<String>> = std::sync::Arc::new(Mutex::new(String::new()));
        let diag_feeder = diag.clone();
        let prompt_without_password = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let prompt_flag = prompt_without_password.clone();

        thread::spawn(move || {
            let mut buf = [0u8; 4096];
            let mut trailing = String::with_capacity(256);
            let mut answered = false;
            let mut guard = match reader.lock() {
                Ok(g) => g,
                Err(_) => return,
            };
            let deadline = Instant::now() + MASTER_READY_TIMEOUT;
            while Instant::now() < deadline {
                match guard.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let chunk = String::from_utf8_lossy(&buf[..n]).to_string();
                        if let Ok(mut d) = diag_feeder.lock() {
                            d.push_str(&chunk);
                            if d.len() > 1536 {
                                d.truncate(1536);
                            }
                        }
                        if answered {
                            continue;
                        }
                        trailing.push_str(&chunk);
                        if trailing.len() > 256 {
                            trailing = trailing[trailing.len() - 256..].to_string();
                        }
                        if is_password_prompt(&trailing) {
                            if !has_password {
                                prompt_flag.store(true, Ordering::Relaxed);
                                break;
                            }
                            let bytes = format!("{}\n", password).into_bytes();
                            if let Ok(mut w) = writer.lock() {
                                let _ = write_all(w.as_mut(), &bytes);
                                let _ = w.flush();
                            }
                            answered = true;
                            trailing.clear();
                        }
                    }
                    Err(_) => break,
                }
            }
        });

        let socket = PathBuf::from(&control_path);
        let start = Instant::now();
        let mut child_exited = false;
        while start.elapsed() < MASTER_READY_TIMEOUT {
            if socket.exists() {
                break;
            }
            if prompt_without_password.load(Ordering::Relaxed) {
                break;
            }
            match pty.try_wait() {
                Ok(Some(_)) => {
                    child_exited = true;
                    break;
                }
                Ok(None) => thread::sleep(Duration::from_millis(120)),
                Err(_) => {
                    child_exited = true;
                    break;
                }
            }
        }

        if socket.exists() {
            return Ok(PooledMaster {
                control_path,
                pty,
                last_used: Instant::now(),
            });
        }

        let _ = pty.kill();
        let _ = std::fs::remove_file(&control_path);
        let diag_out = diag.lock().map(|d| d.clone()).unwrap_or_default();
        // 远程重装系统后 host key 变更：accept-new 对"已存在但 key 变了"的主机直接拒绝，
        // 清掉旧 key 并重连一次（与终端连接行为一致）。最多重试一次，避免死循环。
        if attempt == 0 && platform::is_host_key_error(&diag_out) {
            let _ = platform::clear_known_host(&ssh.host, ssh.port);
            continue;
        }
        return Err(classify_failure(&diag_out, child_exited));
    }
    Err("SSH 连接建立失败：未知错误".to_string())
}

fn write_all(w: &mut dyn std::io::Write, bytes: &[u8]) -> std::io::Result<()> {
    std::io::Write::write_all(w, bytes)
}

fn classify_failure(diag: &str, child_exited: bool) -> String {
    let flat = diag.replace(['\n', '\r'], " ");
    if child_exited && flat.contains("Permission denied") {
        return format!("SSH 认证失败：{}", flat);
    }
    format!(
        "SSH 连接建立失败：{}",
        if flat.trim().is_empty() {
            if child_exited {
                "连接进程提前退出".to_string()
            } else {
                "认证超时".to_string()
            }
        } else {
            flat
        }
    )
}