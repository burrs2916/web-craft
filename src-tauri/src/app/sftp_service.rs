//! SFTP file-transfer service.
//!
//! Design goals (cross-platform, zero extra dependencies):
//! - Only the system OpenSSH toolchain is used (`ssh` + `sftp`). No sshpass,
//!   no russh/ssh2 crates, so the app still builds and ships on Windows.
//! - On Unix every remote operation is multiplexed over a pooled SSH
//!   ControlMaster, so navigating directories costs one round trip instead of a
//!   full SSH handshake. Password auth feeds the prompt through a pty (the same
//!   proven path as `connection.rs::test_ssh_password`).
//! - Win32-OpenSSH has no ControlMaster support (there is no Unix domain
//!   socket multiplexing), and `sftp -b` implies `BatchMode=yes`, which makes
//!   password authentication impossible. Windows therefore drives a *pooled
//!   interactive* `sftp` session over a pty: the password prompt is answered
//!   once, then commands are typed and synchronised on the `sftp>` prompt.
//!   The same path is the fallback whenever a ControlMaster cannot be built.
//! - Directory listings are produced by the *local* sftp client
//!   (`ls -lan`, numeric view) instead of the server supplied `longname`,
//!   which makes the column layout identical for Linux, BSD, Solaris,
//!   AIX and Windows OpenSSH servers.
//! - Transfers run inside a pty so OpenSSH prints its progress meter, which we
//!   parse and forward to the UI.

use crate::core::types::SshConnectionInfo;
use crate::domain::terminal::pty::Pty;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

mod fsops;
mod listing;
mod locale;
mod parse;
mod paths;
mod progress;
mod session;
mod transfer;
mod transport;
mod upload;

pub(crate) use locale::*;
pub(crate) use parse::*;
pub(crate) use paths::*;
pub(crate) use progress::*;
pub(crate) use session::*;
pub(crate) use transport::*;
pub(crate) use upload::*;

/// Message returned when the user aborted a transfer on purpose.
pub const CANCELLED_MESSAGE: &str = "传输已取消";

#[derive(Debug, Clone, Serialize)]
pub struct SftpEntry {
    pub name: String,
    pub is_dir: bool,
    pub is_symlink: bool,
    /// True when the entry can be *entered*: a real directory, or a symlink
    /// that resolves to one.
    ///
    /// `is_dir` deliberately stays the `lstat` truth so recursive deletes never
    /// walk through a link; this flag is the one navigation is driven by.
    pub target_is_dir: bool,
    pub size: u64,
    /// Normalised "YYYY-MM-DD HH:MM" when the timestamp could be understood,
    /// otherwise the raw string reported by the sftp client.
    pub mtime: String,
    /// Epoch seconds used for sorting. 0 when unknown.
    pub mtime_ts: i64,
    /// Raw permission string (e.g. "drwxr-xr-x").
    pub perms: String,
    pub owner: String,
    pub group: String,
    /// Target of a symbolic link, when the listing exposed one.
    pub link_target: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SftpListResult {
    /// Absolute path as resolved by the remote host (`pwd`).
    pub path: String,
    pub entries: Vec<SftpEntry>,
}

/// A single directory's listing from a batched [`SftpService::list_dirs`] call.
///
/// `error` is `None` on success. A per-path failure is recorded here rather than
/// aborting the whole batch, so a tree expansion can still render the siblings
/// that resolved fine while flagging the one that did not.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirListing {
    pub path: String,
    pub entries: Vec<SftpEntry>,
    pub error: Option<String>,
}

/// A remote path plus the type we already know from the listing, so deletes and
/// downloads can pick the right sftp verb without an extra stat round trip.
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteItem {
    pub path: String,
    #[serde(default)]
    pub is_dir: bool,
}

pub struct SftpService {
    masters: Mutex<HashMap<String, PooledMaster>>,
    sessions: Mutex<HashMap<String, InteractiveSession>>,
    lane_locks: Mutex<HashMap<String, Arc<Mutex<()>>>>,
    /// Every transfer the service has accepted and not yet finished, claimed
    /// *before* anything can block. A transfer spends real time queued behind
    /// its lane and inside the SSH handshake; without this registry `cancel`
    /// cannot tell "still waiting to start" from "already over" and refuses
    /// both.
    inflight: Mutex<HashSet<String>>,
    /// Transfers that own a live child process, so the UI can kill them.
    running: Mutex<HashMap<String, Arc<Pty>>>,
    cancelled: Mutex<HashSet<String>>,
}

/// Holds one transfer id in [`SftpService::inflight`] for the duration of an
/// operation and guarantees the bookkeeping is released on every exit path,
/// including a panic.
struct TransferSlot<'a> {
    service: &'a SftpService,
    id: String,
}

impl Drop for TransferSlot<'_> {
    fn drop(&mut self) {
        lock(&self.service.inflight).remove(&self.id);
        lock(&self.service.running).remove(&self.id);
        lock(&self.service.cancelled).remove(&self.id);
    }
}

impl Default for SftpService {
    fn default() -> Self {
        Self::new()
    }
}

impl Drop for SftpService {
    fn drop(&mut self) {
        self.shutdown_all();
    }
}

/// Poison-tolerant lock: a panicking worker must never brick the pool.
fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    match m.lock() {
        Ok(g) => g,
        Err(p) => p.into_inner(),
    }
}

impl SftpService {
    pub fn new() -> Self {
        SftpService {
            masters: Mutex::new(HashMap::new()),
            sessions: Mutex::new(HashMap::new()),
            lane_locks: Mutex::new(HashMap::new()),
            inflight: Mutex::new(HashSet::new()),
            running: Mutex::new(HashMap::new()),
            cancelled: Mutex::new(HashSet::new()),
        }
    }

    fn lane_lock(&self, key: &str) -> Arc<Mutex<()>> {
        let mut locks = lock(&self.lane_locks);
        locks
            .entry(key.to_string())
            .or_insert_with(|| Arc::new(Mutex::new(())))
            .clone()
    }

    fn reap_idle(&self) {
        {
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
        let mut sessions = lock(&self.sessions);
        let stale: Vec<String> = sessions
            .iter()
            .filter(|(_, s)| s.last_used.elapsed() > MASTER_IDLE_TTL)
            .map(|(k, _)| k.clone())
            .collect();
        for k in stale {
            if let Some(s) = sessions.remove(&k) {
                s.close();
            }
        }
    }

    fn store_master(&self, key: &str, mut master: PooledMaster) {
        master.last_used = Instant::now();
        let mut map = lock(&self.masters);
        map.insert(key.to_string(), master);
    }

    /// Returns a usable master plus whether it came from the pool.
    fn acquire_master(
        &self,
        ssh: &SshConnectionInfo,
        key: &str,
    ) -> Result<(PooledMaster, bool), String> {
        let cached = lock(&self.masters).remove(key);
        if let Some(m) = cached {
            let alive = Path::new(&m.control_path).exists() && matches!(m.pty.try_wait(), Ok(None));
            if alive {
                return Ok((m, true));
            }
            let _ = m.pty.kill();
            let _ = std::fs::remove_file(&m.control_path);
        }
        let fresh = self.create_master(ssh)?;
        Ok((fresh, false))
    }

    /// Run one sftp batch, transparently (re)establishing the multiplexed
    /// connection and retrying once if a pooled master turned out to be stale.
    fn exec(
        &self,
        ssh: &SshConnectionInfo,
        lane: &str,
        batch: &[String],
        progress: Option<&ProgressCtx>,
    ) -> Result<String, String> {
        let sftp_bin = crate::core::platform::resolve_sftp_binary()
            .map_err(|e| format!("无法定位 sftp 程序: {}", e))?;

        let key = pool_key(ssh, lane);
        let lane_lock = self.lane_lock(&key);
        let _guard = match lane_lock.lock() {
            Ok(g) => g,
            Err(p) => p.into_inner(),
        };
        // The wait for this lane is where a queued transfer spends most of its
        // life. Honour a cancel issued during it instead of starting work the
        // user has already called off.
        if self.cancel_requested(progress) {
            return Err(CANCELLED_MESSAGE.to_string());
        }
        self.reap_idle();

        // Windows (and any host without control-socket multiplexing) types the
        // commands into a live sftp session instead.
        if !supports_multiplexing() {
            return self.exec_interactive(ssh, &key, batch, progress);
        }

        // `sftp -b <file>` implies BatchMode, and BatchMode switches the
        // progress meter *off* — so a transfer driven from a batch file used to
        // emit no ticks at all and the UI sat at 0% until the whole thing
        // finished, which is indistinguishable from a hang on a large file.
        // Re-arming it from inside the batch is the one lever that does not
        // give up batch semantics (abort-on-error and a meaningful exit code).
        let batch_file = if progress.is_some() {
            let mut lines = Vec::with_capacity(batch.len() + 1);
            lines.push(PROGRESS_ON.to_string());
            lines.extend(batch.iter().cloned());
            write_temp_batch(&lines)?
        } else {
            write_temp_batch(batch)?
        };
        let base_args = base_sftp_args(ssh, &batch_file.to_string_lossy());

        let mut attempt = 0u8;
        let result = loop {
            // Also covers a cancel that arrived while the previous attempt was
            // tearing down a dead master.
            if self.cancel_requested(progress) {
                break Err(CANCELLED_MESSAGE.to_string());
            }
            match self.acquire_master(ssh, &key) {
                Ok((master, reused)) => {
                    let mut args: Vec<String> = vec![
                        "-o".to_string(),
                        format!("ControlPath={}", master.control_path),
                        "-o".to_string(),
                        "ControlMaster=no".to_string(),
                    ];
                    args.extend(base_args.iter().cloned());

                    match self.run_tracked(&sftp_bin, &args, progress) {
                        Ok(out) => {
                            self.store_master(&key, master);
                            break Ok(out);
                        }
                        Err(e) => {
                            if is_connection_error(&e) {
                                shutdown_master(&master, ssh);
                                if reused && attempt == 0 {
                                    attempt += 1;
                                    continue;
                                }
                                break Err(e);
                            }
                            self.store_master(&key, master);
                            break Err(e);
                        }
                    }
                }
                Err(e) => {
                    // `sftp -b` implies BatchMode=yes, which forbids password
                    // prompts — so a password connection without a master has
                    // to fall back to the interactive session. Key/agent auth
                    // can still talk to the host directly.
                    if ssh.auth_method == "password" {
                        tracing::warn!("[SFTP] control master unavailable, interactive mode: {}", e);
                        break self.exec_interactive(ssh, &key, batch, progress);
                    }
                    tracing::warn!("[SFTP] control master unavailable, direct mode: {}", e);
                    break self.run_tracked(&sftp_bin, &base_args, progress);
                }
            }
        };

        let _ = std::fs::remove_file(&batch_file);
        result
    }

    /// Run a one-shot sftp process, registering it so the transfer stays
    /// cancellable from the UI.
    fn run_tracked(
        &self,
        bin: &str,
        args: &[String],
        progress: Option<&ProgressCtx>,
    ) -> Result<String, String> {
        let ctx = match progress {
            None => return run_sftp_process(bin, args, None),
            Some(c) => c,
        };
        // Last gate before a child exists: the SSH handshake that just
        // completed can have taken tens of seconds.
        if self.cancel_requested(progress) {
            return Err(CANCELLED_MESSAGE.to_string());
        }
        let pty = Arc::new(spawn_sftp_pty(
            bin,
            args,
            200,
            &[("TERM", "xterm-256color")],
        )?);
        self.register_running(&ctx.transfer_id, pty.clone());
        let out = drive_transfer_pty(&pty, ctx);
        self.unregister_running(&ctx.transfer_id);
        match out {
            Ok(v) => Ok(v),
            Err(e) => {
                if self.cancel_requested(progress) {
                    Err(CANCELLED_MESSAGE.to_string())
                } else {
                    Err(e)
                }
            }
        }
    }

    fn exec_interactive(
        &self,
        ssh: &SshConnectionInfo,
        key: &str,
        batch: &[String],
        progress: Option<&ProgressCtx>,
    ) -> Result<String, String> {
        let mut attempt = 0u8;
        loop {
            // Spawning a session means a full password handshake; skip it
            // entirely when the transfer has already been called off.
            if self.cancel_requested(progress) {
                return Err(CANCELLED_MESSAGE.to_string());
            }
            let cached = lock(&self.sessions).remove(key);
            let (mut session, reused) = match cached {
                Some(s) if s.is_alive() => (s, true),
                Some(s) => {
                    s.close();
                    (InteractiveSession::spawn(ssh)?, false)
                }
                None => (InteractiveSession::spawn(ssh)?, false),
            };

            if let Some(ctx) = progress {
                self.register_running(&ctx.transfer_id, session.pty.clone());
            }

            let mut collected = String::new();
            let mut failure: Option<(String, bool)> = None; // (message, session_broken)
            for cmd in batch {
                if let Err(e) = session.send(cmd) {
                    failure = Some((e, true));
                    break;
                }
                match session.pump(None, progress, SESSION_IDLE_TIMEOUT) {
                    Ok(text) => {
                        // A leading `-` is the sftp convention for "this
                        // command is allowed to fail". `sftp -b` honours it on
                        // the batch lane; the interactive lane has to honour it
                        // too, or an optional probe would abort the operation
                        // it was only meant to enrich.
                        let tolerant = cmd.trim_start().starts_with('-');
                        if !tolerant {
                            if let Some(err) = interactive_error(&text, cmd) {
                                failure = Some((err, false));
                                break;
                            }
                        }
                        collected.push_str(&text);
                    }
                    Err(e) => {
                        failure = Some((e, true));
                        break;
                    }
                }
            }

            if let Some(ctx) = progress {
                self.unregister_running(&ctx.transfer_id);
            }

            match failure {
                None => {
                    session.last_used = Instant::now();
                    lock(&self.sessions).insert(key.to_string(), session);
                    return Ok(collected);
                }
                Some((msg, broken)) => {
                    if self.cancel_requested(progress) {
                        session.close();
                        return Err(CANCELLED_MESSAGE.to_string());
                    }
                    if broken || !session.is_alive() {
                        session.close();
                        // A pooled session can die between two operations; one
                        // silent reconnect keeps that invisible to the user.
                        if reused && attempt == 0 && progress.is_none() {
                            attempt += 1;
                            continue;
                        }
                    } else {
                        session.last_used = Instant::now();
                        lock(&self.sessions).insert(key.to_string(), session);
                    }
                    return Err(msg);
                }
            }
        }
    }

    /// Spawn `ssh -M -N user@host` through a pty (no `-f`: backgrounding
    /// detaches ssh from the pty and breaks password-fed masters), answer the
    /// password prompt, and wait for the control socket — ssh only creates it
    /// after a *successful* authentication, which is our readiness signal.
    fn create_master(&self, ssh: &SshConnectionInfo) -> Result<PooledMaster, String> {
        for attempt in 0..=1 {
        let control_path = unique_temp_path("bsp-cp");
        let pty = Pty::spawn_ssh_master(ssh, &control_path)
            .map_err(|e| format!("无法启动 SSH 主连接进程: {}", e))?;

        let reader = pty.reader();
        let writer = pty.writer_clone();
        let password = ssh.password.clone().unwrap_or_default();
        let has_password = !password.is_empty();

        let diag: Arc<Mutex<String>> = Arc::new(Mutex::new(String::with_capacity(512)));
        let diag_feeder = diag.clone();
        let prompt_without_password = Arc::new(AtomicBool::new(false));
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
                                *d = d[d.len() - 1536..].to_string();
                            }
                        }
                        if answered {
                            continue;
                        }
                        trailing.push_str(&chunk);
                        if trailing.len() > 256 {
                            trailing = trailing[trailing.len() - 256..].to_string();
                        }
                        let wants_password = crate::domain::terminal::pty::is_password_prompt(&trailing);
                        if wants_password {
                            if !has_password {
                                prompt_flag.store(true, Ordering::Relaxed);
                                break;
                            }
                            let bytes = format!("{}\n", password).into_bytes();
                            if let Ok(mut w) = writer.lock() {
                                let _ = w.write_all(&bytes);
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
            tracing::info!("[SFTP] control master ready ({})", control_path);
            return Ok(PooledMaster {
                control_path,
                pty,
                last_used: Instant::now(),
            });
        }

        let _ = pty.kill();
        let _ = std::fs::remove_file(&control_path);
        let diag_out = diag.lock().map(|d| d.clone()).unwrap_or_default();
        tracing::error!(
            "[SFTP] control master failed (exited={}): {}",
            child_exited,
            diag_out.replace(['\n', '\r'], " ")
        );
        // 远程重装系统后 host key 变更：accept-new 对"已存在但 key 变了"的主机直接拒绝，
        // 此时清掉旧 key 并重连一次即可（与终端连接行为一致）。最多重试一次，避免死循环。
        if attempt == 0 && crate::core::platform::is_host_key_error(&diag_out) {
            let _ = crate::core::platform::clear_known_host(&ssh.host, ssh.port);
            tracing::info!("[SFTP] host key changed; cleared known_hosts and retrying once");
            continue;
        }
        return Err(format!(
            "SSH 连接建立失败：{}",
            classify_master_failure(&diag_out, child_exited, prompt_without_password.load(Ordering::Relaxed))
        ));
        }
        Err("SSH 连接建立失败：未知错误".to_string())
    }
}

#[cfg(test)]
mod tests;
