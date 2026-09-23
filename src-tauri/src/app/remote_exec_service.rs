//! L1 remote-exec primitive: run a command on a bound server and capture
//! structured stdout / stderr / exit_code / duration.
//!
//! Three channels (design §4.1):
//!   1. ControlMaster — reuse an authenticated `ssh -M` listener over its
//!      `ControlPath` (Unix only). Zero extra authentication, stdout and stderr
//!      are naturally separated because the invocation is non-PTY.
//!   2. Direct — `ssh -i key -o BatchMode=yes` for key-authenticated hosts with
//!      no usable master.
//!   3. PTY — password-authenticated hosts fall back to a fed-password pty and
//!      return merged output (`merged: true`).

use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio::process::Command;

use crate::core::types::SshConnectionInfo;
use crate::infra::ssh::pool::{supports_multiplexing, ConnectionPool};
use crate::plugins::engine::safety::is_dangerous_command;

/// Ceiling on captured stdout/stderr; oversized output keeps head and tail.
pub const OUTPUT_LIMIT: usize = 256 * 1024;
/// Default remote command timeout. Hard ceiling enforced by commands.
pub const DEFAULT_TIMEOUT_SECS: u64 = 60;
pub const MAX_TIMEOUT_SECS: u64 = 600;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteExecRequest {
    pub connection_id: String,
    pub command: String,
    pub cwd: Option<String>,
    #[serde(default = "default_timeout")]
    pub timeout_secs: u64,
}

fn default_timeout() -> u64 {
    DEFAULT_TIMEOUT_SECS
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteExecResult {
    pub success: bool,
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
    pub merged: bool,
    pub duration_ms: u64,
    pub channel: String,
    pub truncated: bool,
}

/// Channel selection, in the design's fixed preference order.
fn choose_channel(ssh: &SshConnectionInfo) -> Channel {
    if supports_multiplexing() {
        Channel::ControlMaster
    } else if ssh.auth_method == "private_key" {
        Channel::Direct
    } else {
        Channel::Pty
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Channel {
    ControlMaster,
    Direct,
    Pty,
}

impl Channel {
    fn as_str(&self) -> &'static str {
        match self {
            Channel::ControlMaster => "control_master",
            Channel::Direct => "direct",
            Channel::Pty => "pty",
        }
    }
}

pub struct RemoteExecService {
    pool: Arc<ConnectionPool>,
}

impl RemoteExecService {
    pub fn new(pool: Arc<ConnectionPool>) -> Self {
        RemoteExecService { pool }
    }

    /// Run `ssh {user}@{host} <command>` and return a structured result.
    pub async fn execute(&self, ssh: &SshConnectionInfo, mut req: RemoteExecRequest) -> RemoteExecResult {
        let start = std::time::Instant::now();
        req.timeout_secs = req.timeout_secs.min(MAX_TIMEOUT_SECS).max(1);
        let command = prepend_cwd(&req.command, req.cwd.as_deref());

        // Security gate before anything touches the wire.
        if let Some(hit) = is_dangerous_command(&command) {
            return fail("safety", start, format!("命令被安全策略拦截（{}）", hit));
        }

        match choose_channel(ssh) {
            Channel::ControlMaster => {
                let pool = self.pool.clone();
                let ssh_box = Box::new(ssh.clone());
                // acquire() spawns/authenticates a master synchronously; drain it
                // off the async runtime so a slow handshake never stalls app I/O.
                let acquired = tokio::task::spawn_blocking(move || pool.acquire(&ssh_box))
                    .await
                    .unwrap_or_else(|e| Err(e.to_string()));
                match acquired {
                Ok((control_path, _)) => {
                    let args = control_master_args(ssh, &control_path, &command);
                    self.run_piped(ssh, args, req.timeout_secs, Channel::ControlMaster, start)
                        .await
                }
                // Master unavailable → fall through to the direct / PTY paths.
                Err(_) => {
                    let args = direct_args(ssh, &command);
                    self.run_piped(ssh, args, req.timeout_secs, Channel::Direct, start)
                        .await
                }
                }
            },
            Channel::Direct => {
                let args = direct_args(ssh, &command);
                self.run_piped(ssh, args, req.timeout_secs, Channel::Direct, start)
                    .await
            }
            Channel::Pty => {
                let full = command;
                let ssh_box = Box::new(ssh.clone());
                let r = tokio::task::spawn_blocking(move || {
                    crate::app::remote_desktop_service::run_ssh_command_with_timeout(
                        &ssh_box, &full, req.timeout_secs,
                    )
                })
                .await
                .unwrap_or_else(|e| Err(e.to_string()));
                match r {
                    Ok(out) => {
                        let mut stdout = out;
                        let truncated = clip(&mut stdout, OUTPUT_LIMIT);
                        RemoteExecResult {
                            success: true,
                            exit_code: 0,
                            stdout,
                            stderr: String::new(),
                            merged: true,
                            duration_ms: start.elapsed().as_millis() as u64,
                            channel: Channel::Pty.as_str().to_string(),
                            truncated,
                        }
                    }
                    Err(e) => fail(Channel::Pty.as_str(), start, e),
                }
            }
        }
    }

    async fn run_piped(
        &self,
        ssh: &SshConnectionInfo,
        args: Vec<String>,
        timeout: u64,
        channel: Channel,
        start: std::time::Instant,
    ) -> RemoteExecResult {
        let bin = match crate::core::platform::resolve_ssh_binary() {
            Ok(b) => b,
            Err(e) => return fail(channel.as_str(), start, format!("找不到 ssh 可执行文件: {}", e)),
        };
        let child = match Command::new(bin)
            .args(&args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
        {
            Ok(c) => c,
            Err(e) => return fail(channel.as_str(), start, format!("启动 ssh 进程失败: {}", e)),
        };

        let dur = Duration::from_secs(timeout);
        let output = match tokio::time::timeout(dur, child.wait_with_output()).await {
            Ok(Ok(o)) => o,
            Ok(Err(e)) => return fail(channel.as_str(), start, format!("等待 ssh 进程失败: {}", e)),
            Err(_) => {
                return fail(
                    channel.as_str(),
                    start,
                    format!("命令执行超时（{} 秒）", timeout),
                )
            }
        };

        let exit_code = output.status.code().unwrap_or(-1);
        let mut stdout = String::from_utf8_lossy(&output.stdout).into_owned();
        let mut stderr = String::from_utf8_lossy(&output.stderr).into_owned();
        let clipped_stdout = clip(&mut stdout, OUTPUT_LIMIT);
        let clipped_stderr = clip(&mut stderr, OUTPUT_LIMIT);

        RemoteExecResult {
            success: exit_code == 0,
            exit_code,
            stdout,
            stderr,
            merged: false,
            duration_ms: start.elapsed().as_millis() as u64,
            channel: channel.as_str().to_string(),
            truncated: clipped_stdout || clipped_stderr,
        }
    }
}

/// A uniform error result carrying the channel we were on.
fn fail(channel: &str, start: std::time::Instant, message: String) -> RemoteExecResult {
    RemoteExecResult {
        success: false,
        exit_code: -1,
        stdout: String::new(),
        stderr: message,
        merged: false,
        duration_ms: start.elapsed().as_millis() as u64,
        channel: channel.to_string(),
        truncated: false,
    }
}

/// Prefix a remote command with `cd <cwd> && ` when a working directory is given.
fn prepend_cwd(command: &str, cwd: Option<&str>) -> String {
    match cwd {
        Some(d) if !d.trim().is_empty() => format!("cd {} && {}", shell_quote(d.trim()), command),
        _ => command.to_string(),
    }
}

/// Single-quote a shell word; embedded single quotes become `'\''`.
fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

/// `ssh -o ControlPath=... -o BatchMode=yes ... user@host <command>`.
fn control_master_args(ssh: &SshConnectionInfo, control_path: &str, command: &str) -> Vec<String> {
    let mut args = base_args(ssh);
    args.push("-o".to_string());
    args.push("ControlMaster=no".to_string());
    args.push("-o".to_string());
    args.push(format!("ControlPath={}", control_path));
    args.push("-o".to_string());
    args.push("BatchMode=yes".to_string());
    args.push(command.to_string());
    args
}

/// `ssh [-i key] -o BatchMode=yes ... user@host <command>`.
fn direct_args(ssh: &SshConnectionInfo, command: &str) -> Vec<String> {
    let mut args = base_args(ssh);
    args.push("-o".to_string());
    args.push("BatchMode=yes".to_string());
    args.push(command.to_string());
    args
}

fn base_args(ssh: &SshConnectionInfo) -> Vec<String> {
    let mut args = vec![
        "-o".to_string(),
        "StrictHostKeyChecking=accept-new".to_string(),
        "-o".to_string(),
        "ConnectTimeout=10".to_string(),
        "-o".to_string(),
        "ServerAliveInterval=20".to_string(),
        "-o".to_string(),
        "ServerAliveCountMax=6".to_string(),
    ];
    if ssh.port != 22 {
        args.push("-p".to_string());
        args.push(ssh.port.to_string());
    }
    if ssh.auth_method == "private_key" {
        if let Some(key) = &ssh.private_key_path {
            args.push("-i".to_string());
            args.push(key.clone());
        }
    }
    let target = format!("{}@{}", ssh.username, bracket_host(&ssh.host));
    args.push(target);
    args
}

fn bracket_host(host: &str) -> String {
    let h = host.trim();
    if h.contains(':') && !h.starts_with('[') {
        format!("[{}]", h)
    } else {
        h.to_string()
    }
}

/// Keep head + tail when output exceeds `limit`; returns whether it clipped.
fn clip(s: &mut String, limit: usize) -> bool {
    if s.len() <= limit {
        return false;
    }
    let half = limit / 2;
    let head = s[..half].to_string();
    let tail = s[s.len() - half..].to_string();
    *s = format!("{}…[截断 {} 字节]…{}", head, s.len() - limit, tail);
    true
}

#[cfg(test)]
mod tests {
    use std::time::Instant;

    use super::{clip, shell_quote, prepend_cwd};

    #[test]
    fn clip_collapses_oversized_output_keeping_edges() {
        let mut s = "a".repeat(300_000);
        assert!(clip(&mut s, 10));
        assert!(s.contains('…'));
        assert!(s.starts_with("aaaaa"));
        assert!(s.ends_with("aaaaa"));
    }

    #[test]
    fn clip_leaves_small_output_untouched() {
        let mut s = "hello".to_string();
        assert!(!clip(&mut s, 10));
        assert_eq!(s, "hello");
    }

    #[test]
    fn shell_quote_wraps_and_escapes_quotes() {
        assert_eq!(shell_quote("abc"), "'abc'");
        assert_eq!(shell_quote("a'b"), "'a'\\''b'");
    }

    #[test]
    fn prepend_cwd_prefixes_only_when_set() {
        assert_eq!(prepend_cwd("ls", None), "ls");
        assert_eq!(prepend_cwd("ls", Some(" /var/www ")), "cd '/var/www' && ls");
        assert_eq!(prepend_cwd("ls", Some("  ")), "ls");
    }

    #[test]
    fn fail_builds_error_result() {
        let r = super::fail("safety", Instant::now(), "boom".to_string());
        assert!(!r.success);
        assert_eq!(r.stderr, "boom");
        assert_eq!(r.channel, "safety");
    }
}