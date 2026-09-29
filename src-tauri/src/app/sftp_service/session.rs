//! Pooled interactive `sftp` session over a pty.

use std::sync::mpsc::channel;
use std::sync::mpsc::Receiver;
use std::sync::mpsc::RecvTimeoutError;
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use std::time::Instant;
use crate::core::types::SshConnectionInfo;
use crate::domain::terminal::pty::Pty;
use super::*;

/// How long an interactive session may stay silent before we call it stuck.
pub(crate) const SESSION_IDLE_TIMEOUT: Duration = Duration::from_secs(90);

/// How long the initial banner/password exchange may take.
pub(crate) const SESSION_HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(25);

/// Incremental ANSI/VT scrubber.
///
/// Windows ConPTY re-renders everything through a virtual screen buffer and
/// sprinkles cursor sequences into the stream; libedit does the same on Unix.
/// Escape sequences can be split across reads, so the state has to survive
/// between chunks.
#[derive(Default)]
pub(crate) struct AnsiFilter {
    pub(crate) state: u8,
}

impl AnsiFilter {
    pub(crate) fn push(&mut self, input: &str, out: &mut String) {
        for c in input.chars() {
            match self.state {
                // normal
                0 => match c {
                    '\u{1b}' => self.state = 1,
                    '\u{7}' | '\u{0}' => {}
                    _ => out.push(c),
                },
                // ESC seen
                1 => match c {
                    '[' => self.state = 2,
                    ']' => self.state = 3,
                    '(' | ')' | '#' | '%' => self.state = 5,
                    _ => self.state = 0,
                },
                // CSI: consume until the final byte
                2 => {
                    if ('\u{40}'..='\u{7e}').contains(&c) {
                        self.state = 0;
                    }
                }
                // OSC: terminated by BEL or ST (ESC \)
                3 => match c {
                    '\u{7}' => self.state = 0,
                    '\u{1b}' => self.state = 4,
                    _ => {}
                },
                4 => self.state = 0,
                // charset designator: swallow exactly one byte
                _ => self.state = 0,
            }
        }
    }
}

/// A pooled interactive `sftp` session driven over a pty.
pub(crate) struct InteractiveSession {
    pub(crate) pty: Arc<Pty>,
    pub(crate) rx: Receiver<Vec<u8>>,
    pub(crate) ansi: AnsiFilter,
    /// Bytes seen since the last line break — also where the `sftp>` prompt and
    /// the password prompt show up (neither ends with a newline).
    pub(crate) pending: String,
    /// Rolling tail of the raw conversation, used to explain handshake errors.
    pub(crate) diag: String,
    /// Set when an auth prompt appeared that we cannot satisfy.
    pub(crate) auth_error: Option<String>,
    pub(crate) last_used: Instant,
}

pub(crate) enum PendingPrompt {
    Password,
    Passphrase,
    Verification,
    HostKey,
}

/// Recognise the interactive `sftp>` prompt. It is printed without a trailing
/// newline, so it always sits alone in the pending buffer.
pub(crate) fn is_sftp_prompt(pending: &str) -> bool {
    pending.trim_end() == "sftp>"
}

pub(crate) fn classify_pending_prompt(pending: &str) -> Option<PendingPrompt> {
    let low = pending.trim_end().to_lowercase();
    if low.is_empty() {
        return None;
    }
    if low.ends_with("password:") || (low.contains("密码") && low.ends_with('：')) {
        return Some(PendingPrompt::Password);
    }
    if low.ends_with(':') && (low.contains("passphrase for key") || low.contains("enter passphrase"))
    {
        return Some(PendingPrompt::Passphrase);
    }
    if low.ends_with(':')
        && (low.contains("verification code")
            || low.contains("one-time password")
            || low.contains("otp:"))
    {
        return Some(PendingPrompt::Verification);
    }
    if low.ends_with('?') && (low.contains("(yes/no") || low.contains("fingerprint)")) {
        return Some(PendingPrompt::HostKey);
    }
    None
}

impl InteractiveSession {
    /// Start `sftp` inside a pty and drive it up to the first prompt.
    pub(crate) fn spawn(ssh: &SshConnectionInfo) -> Result<Self, String> {
        let mut last_err = "SSH 连接建立失败：未知错误".to_string();
        for attempt in 0..=1 {
        let bin = crate::core::platform::resolve_sftp_binary()
            .map_err(|e| format!("无法定位 sftp 程序: {}", e))?;

        let mut args: Vec<String> = vec![
            "-o".to_string(),
            "StrictHostKeyChecking=accept-new".to_string(),
            "-o".to_string(),
            "ConnectTimeout=15".to_string(),
            // One shot only: a rejected password must fail fast instead of
            // re-prompting into a pty nobody is watching.
            "-o".to_string(),
            "NumberOfPasswordPrompts=1".to_string(),
        ];
        keepalive_args(&mut args);
        if ssh.port != 22 {
            args.push("-P".to_string());
            args.push(ssh.port.to_string());
        }
        if ssh.auth_method == "private_key" {
            if let Some(key) = &ssh.private_key_path {
                args.push("-i".to_string());
                args.push(key.clone());
            }
        }
        args.push(ssh_target(ssh));

        // Wide pty: ConPTY re-flows anything past the window width, which would
        // corrupt long file names in the listing.
        let pty = Arc::new(spawn_sftp_pty(&bin, &args, 500, &[("TERM", "dumb")])?);

        let (tx, rx) = channel::<Vec<u8>>();
        let reader = pty.reader();
        thread::spawn(move || {
            let mut buf = [0u8; 8192];
            let mut guard = match reader.lock() {
                Ok(g) => g,
                Err(_) => return,
            };
            loop {
                match guard.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        if tx.send(buf[..n].to_vec()).is_err() {
                            break;
                        }
                    }
                    Err(_) => break,
                }
            }
        });

        let mut session = InteractiveSession {
            pty,
            rx,
            ansi: AnsiFilter::default(),
            pending: String::new(),
            diag: String::new(),
            auth_error: None,
            last_used: Instant::now(),
        };

        let password = ssh.password.clone().unwrap_or_default();
        let pw = if ssh.auth_method == "password" && !password.is_empty() {
            Some(password)
        } else {
            None
        };

        match session.pump(pw.as_deref(), None, SESSION_HANDSHAKE_TIMEOUT) {
            Ok(_) => {
                tracing::info!("[SFTP] interactive session ready ({}@{})", ssh.username, ssh.host);
                return Ok(session);
            }
            Err(_) => {
                let specific = session.auth_error.take();
                let exited = !session.is_alive();
                let diag = session.diag.clone();
                let _ = session.pty.kill();
                tracing::error!(
                    "[SFTP] interactive session failed: {}",
                    diag.replace(['\n', '\r'], " ")
                );
                // 远程重装系统后 host key 变更：清掉旧 key 并重连一次（与终端连接一致）。
                if attempt == 0 && crate::core::platform::is_host_key_error(&diag) {
                    let _ = crate::core::platform::clear_known_host(&ssh.host, ssh.port);
                    tracing::info!("[SFTP] interactive host key changed; cleared known_hosts and retrying once");
                    continue;
                }
                last_err = format!(
                    "SSH 连接建立失败：{}",
                    specific.unwrap_or_else(|| classify_master_failure(&diag, exited, false))
                );
                break;
            }
        }
        }
        Err(last_err)
    }

    pub(crate) fn is_alive(&self) -> bool {
        matches!(self.pty.try_wait(), Ok(None))
    }

    pub(crate) fn close(self) {
        let _ = self.pty.write(b"bye\n");
        let _ = self.pty.kill();
    }

    pub(crate) fn write_raw(&self, s: &str) -> Result<(), String> {
        self.pty
            .write(s.as_bytes())
            .map(|_| ())
            .map_err(|e| format!("写入 sftp 会话失败: {}", e))
    }

    pub(crate) fn send(&mut self, cmd: &str) -> Result<(), String> {
        self.pending.clear();
        self.write_raw(&format!("{}\n", cmd))
    }

    pub(crate) fn note(&mut self, line: &str) {
        self.diag.push_str(line);
        self.diag.push('\n');
        while self.diag.len() > 2048 {
            match self.diag.find('\n') {
                Some(i) => self.diag = self.diag[i + 1..].to_string(),
                None => {
                    self.diag.clear();
                    break;
                }
            }
        }
    }

    pub(crate) fn flush_line(&mut self, progress: Option<&ProgressCtx>, collected: &mut String) {
        let line = std::mem::take(&mut self.pending);
        let trimmed = line.trim_end();
        if trimmed.is_empty() {
            return;
        }
        self.note(trimmed);
        if let Some(ctx) = progress {
            if let Some(p) = parse_progress_line(trimmed) {
                ctx.tick(&p.0, p.1, &p.2, &p.3, &p.4);
                return;
            }
        }
        // 4 MB ceiling: enough for a directory with ~40k entries, small enough
        // that a runaway remote cannot exhaust memory.
        if collected.len() < 4_000_000 {
            collected.push_str(trimmed);
            collected.push('\n');
        }
    }

    /// Read until the next `sftp>` prompt, answering auth prompts on the way
    /// and forwarding progress ticks.
    pub(crate) fn pump(
        &mut self,
        password: Option<&str>,
        progress: Option<&ProgressCtx>,
        idle: Duration,
    ) -> Result<String, String> {
        let mut collected = String::new();
        let mut answered = false;
        let mut last = Instant::now();
        loop {
            match self.rx.recv_timeout(Duration::from_millis(120)) {
                Ok(chunk) => {
                    last = Instant::now();
                    let mut text = String::with_capacity(chunk.len());
                    self.ansi.push(&String::from_utf8_lossy(&chunk), &mut text);
                    for ch in text.chars() {
                        if ch == '\r' || ch == '\n' {
                            self.flush_line(progress, &mut collected);
                        } else {
                            self.pending.push(ch);
                        }
                    }

                    if is_sftp_prompt(&self.pending) {
                        self.pending.clear();
                        return Ok(collected);
                    }
                    if answered {
                        continue;
                    }
                    match classify_pending_prompt(&self.pending) {
                        Some(PendingPrompt::Password) => match password {
                            Some(pw) if !pw.is_empty() => {
                                self.write_raw(&format!("{}\n", pw))?;
                                answered = true;
                                self.pending.clear();
                            }
                            _ => {
                                self.auth_error =
                                    Some("服务器要求输入密码，但此连接未保存密码".to_string());
                                return Err("需要密码".to_string());
                            }
                        },
                        Some(PendingPrompt::Passphrase) => {
                            self.auth_error = Some(
                                "私钥已加密，需要口令（请改用未加密的密钥或先 ssh-add 到代理）"
                                    .to_string(),
                            );
                            return Err("需要密钥口令".to_string());
                        }
                        Some(PendingPrompt::Verification) => {
                            self.auth_error =
                                Some("服务器要求二次验证码，文件传输暂不支持该登录方式".to_string());
                            return Err("需要二次验证".to_string());
                        }
                        Some(PendingPrompt::HostKey) => {
                            self.write_raw("yes\n")?;
                            self.pending.clear();
                        }
                        None => {}
                    }
                }
                Err(RecvTimeoutError::Timeout) => {
                    if last.elapsed() > idle {
                        return Err("远端长时间无响应，操作已中断".to_string());
                    }
                }
                Err(RecvTimeoutError::Disconnected) => {
                    self.flush_line(progress, &mut collected);
                    if collected.trim().is_empty() {
                        return Err("连接已断开".to_string());
                    }
                    return Err(friendly_sftp_error(&collected, ""));
                }
            }
        }
    }
}

/// Detect a failed sftp command in the transcript of an interactive session.
///
/// Interactive mode never exits non-zero, so errors have to be recognised from
/// the text. Listing rows and the echoed command are skipped so a file called
/// `Permission denied` cannot fake a failure.
pub(crate) fn interactive_error(output: &str, cmd: &str) -> Option<String> {
    for raw in output.lines() {
        let line = raw.trim();
        if line.is_empty() || line == cmd || line.starts_with("sftp>") {
            continue;
        }
        if let Some(first) = line.split_whitespace().next() {
            if is_perm_token(first) {
                continue;
            }
        }
        let low = line.to_lowercase();
        let failed = low.starts_with("couldn't")
            || low.starts_with("can't")
            || low.starts_with("cannot ")
            || low.starts_with("unable to")
            || low.starts_with("invalid flag")
            || low.starts_with("usage:")
            || low.starts_with("remote readdir")
            || low.contains("permission denied")
            || low.contains("no such file or directory")
            || low.contains("not a regular file")
            || low.contains("quota exceeded")
            || (low.starts_with("file \"") && low.contains("not found"));
        if failed {
            return Some(friendly_sftp_error(line, ""));
        }
    }
    None
}

/// Spawn an sftp child on a pty with the locale overlay applied.
///
/// `extra` carries the caller's own variables (the `TERM` the transfer meter
/// or the interactive prompt needs); the locale pairs are appended so they
/// cannot be dropped by accident at a call site.
pub(crate) fn spawn_sftp_pty(
    bin: &str,
    args: &[String],
    cols: u16,
    extra: &[(&str, &str)],
) -> Result<Pty, String> {
    let owned = locale_env();
    let mut envs: Vec<(&str, &str)> = extra.to_vec();
    envs.extend(owned.iter().map(|(k, v)| (k.as_str(), v.as_str())));
    Pty::spawn_program_with_env(bin, args, cols, &envs)
        .map_err(|e| format!("无法启动 sftp 进程: {}", e))
}
