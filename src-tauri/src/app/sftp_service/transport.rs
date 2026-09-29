//! SSH/SFTP process spawning, ControlMaster pool and error mapping.

use std::process::Command;
use std::time::Duration;
use std::time::Instant;
use crate::core::types::SshConnectionInfo;
use crate::domain::terminal::pty::Pty;
use super::*;

/// How long an idle ControlMaster is kept alive before being reaped.
pub(crate) const MASTER_IDLE_TTL: Duration = Duration::from_secs(240);

/// How long we wait for the control socket to show up after spawning a master.
pub(crate) const MASTER_READY_TIMEOUT: Duration = Duration::from_secs(15);

/// True when the local OpenSSH client can multiplex sessions over a control
/// socket. Win32-OpenSSH ships without `ControlMaster`, so Windows always uses
/// the interactive session path instead of stalling on a socket that will
/// never appear.
pub(crate) fn supports_multiplexing() -> bool {
    !cfg!(target_os = "windows")
}

/// Metadata lane (listing / mkdir / rename / delete): kept separate from the
/// transfer lane so browsing stays responsive while a big upload is running.
pub(crate) const LANE_META: &str = "m";

/// Transfer lane (upload / download).
pub(crate) const LANE_XFER: &str = "x";

/// A live SSH ControlMaster kept in the pool.
pub(crate) struct PooledMaster {
    pub(crate) control_path: String,
    pub(crate) pty: Pty,
    pub(crate) last_used: Instant,
}

pub(crate) fn pool_key(ssh: &SshConnectionInfo, lane: &str) -> String {
    format!(
        "{}@{}:{}#{}#{}",
        ssh.username, ssh.host, ssh.port, ssh.auth_method, lane
    )
}

/// Wrap a bare IPv6 literal in brackets.
///
/// The sftp client parses its target as `host:path`, so `user@2001:db8::1`
/// would be read as host `2001` plus a remote path. `ssh` has the same
/// ambiguity in some code paths. Hostnames and IPv4 literals never contain a
/// colon, which makes the test unambiguous.
pub(crate) fn bracket_host(host: &str) -> String {
    let h = host.trim();
    if h.contains(':') && !h.starts_with('[') {
        format!("[{}]", h)
    } else {
        h.to_string()
    }
}

/// `user@host` target accepted by both `sftp` and `ssh`.
pub(crate) fn ssh_target(ssh: &SshConnectionInfo) -> String {
    format!("{}@{}", ssh.username, bracket_host(&ssh.host))
}

/// Keepalive so a long transfer survives NAT/firewall idle timeouts instead of
/// dying with "Connection closed" halfway through a multi-gigabyte file.
pub(crate) fn keepalive_args(args: &mut Vec<String>) {
    args.push("-o".to_string());
    args.push("ServerAliveInterval=20".to_string());
    args.push("-o".to_string());
    args.push("ServerAliveCountMax=6".to_string());
}

/// Arguments shared by every sftp invocation.
pub(crate) fn base_sftp_args(ssh: &SshConnectionInfo, batch_file: &str) -> Vec<String> {
    let mut args: Vec<String> = vec![
        "-o".to_string(),
        "StrictHostKeyChecking=accept-new".to_string(),
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
    args.push("-b".to_string());
    args.push(batch_file.to_string());
    args.push(ssh_target(ssh));
    args
}

/// Execute one sftp batch. With a progress sink the process runs inside a pty
/// (OpenSSH only renders its progress meter when stdout is a tty); otherwise a
/// plain piped process is used so listings stay free of terminal noise.
pub(crate) fn run_sftp_process(
    bin: &str,
    args: &[String],
    progress: Option<&ProgressCtx>,
) -> Result<String, String> {
    match progress {
        None => {
            // The listing lands here, so this is the call that must not lose
            // the UTF-8 locale: every file name the UI shows — and every path
            // built from it — comes out of this process.
            let out = Command::new(bin)
                .args(args)
                .envs(locale_env())
                .output()
                .map_err(|e| format!("无法启动 sftp 进程: {}", e))?;
            if out.status.success() {
                Ok(String::from_utf8_lossy(&out.stdout).to_string())
            } else {
                let stderr = String::from_utf8_lossy(&out.stderr).to_string();
                let stdout = String::from_utf8_lossy(&out.stdout).to_string();
                Err(friendly_sftp_error(&stderr, &stdout))
            }
        }
        Some(ctx) => run_sftp_with_progress(bin, args, ctx),
    }
}

pub(crate) fn run_sftp_with_progress(
    bin: &str,
    args: &[String],
    ctx: &ProgressCtx,
) -> Result<String, String> {
    let pty = spawn_sftp_pty(bin, args, 200, &[("TERM", "xterm-256color")])?;
    drive_transfer_pty(&pty, ctx)
}

pub(crate) fn shutdown_master(master: &PooledMaster, ssh: &SshConnectionInfo) {
    if let Ok(ssh_bin) = crate::core::platform::resolve_ssh_binary() {
        let _ = Command::new(ssh_bin)
            .args([
                "-O",
                "exit",
                "-o",
                &format!("ControlPath={}", master.control_path),
                &ssh_target(ssh),
            ])
            .output();
    }
    let _ = master.pty.kill();
    let _ = std::fs::remove_file(&master.control_path);
}

pub(crate) fn classify_master_failure(diag: &str, child_exited: bool, prompt_no_password: bool) -> String {
    let low = diag.to_lowercase();
    if prompt_no_password {
        return "服务器要求输入密码，但此连接未保存密码".to_string();
    }
    if low.contains("permission denied") {
        return "密码或密钥认证被拒绝（凭据不正确，或服务器禁用了该登录方式）".to_string();
    }
    if low.contains("too long")
        || low.contains("unix_listener")
        || low.contains("setsockopt")
        || low.contains("control socket")
    {
        return "无法创建复用套接字（临时目录路径过长）".to_string();
    }
    if low.contains("could not resolve") || low.contains("name or service not known") {
        return "无法解析主机名".to_string();
    }
    if low.contains("connection refused") {
        return "目标端口拒绝连接（SSH 服务未运行或端口不对）".to_string();
    }
    if low.contains("no route") || low.contains("network is unreachable") {
        return "网络不可达".to_string();
    }
    if low.contains("host key verification failed") {
        return "主机密钥校验失败".to_string();
    }
    if low.contains("timed out") {
        return "连接超时".to_string();
    }
    if child_exited {
        "认证未通过或主机不可达".to_string()
    } else {
        "握手超时（主机响应过慢或网络不通）".to_string()
    }
}

/// Errors that mean "the multiplexed channel is gone", worth one silent retry.
pub(crate) fn is_connection_error(msg: &str) -> bool {
    let low = msg.to_lowercase();
    low.contains("connection closed")
        || low.contains("connection reset")
        || low.contains("broken pipe")
        || low.contains("control socket")
        || low.contains("mux")
        || low.contains("connect to host")
        || low.contains("connection refused")
        || low.contains("no such file or directory\nssh_exchange")
        || low.contains("ssh_exchange_identification")
        || low.contains("连接已断开")
}

/// 是否因目标无写权限而失败（上传/下载时）。匹配 friendly_sftp_error 之后的
/// 中文文案与原始英文。
pub(crate) fn is_permission_error(msg: &str) -> bool {
    let low = msg.to_lowercase();
    low.contains("permission denied") || low.contains("无写权限") || low.contains("权限不足")
}

/// Turn raw sftp stderr into something a human can act on.
pub(crate) fn friendly_sftp_error(stderr: &str, stdout: &str) -> String {
    // 只在 stderr 里找真正的错误行；stdout 的正常输出（如 `ls` 列表行）绝不作为
    // 错误文案返回。Dropbear 系 sftp-server 的 longname 里 nlink 是 `?`，且
    // numeric 视图失败时进程仍可能输出完整列表——这些 listing 行不是错误，
    // 否则用户会看到「SFTP 操作失败：drwx------ ? ubuntu ubuntu 4096 … .ssh」。
    let raw = if stderr.trim().is_empty() { stdout } else { stderr };
    let line = raw
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty() && !l.starts_with("sftp>"))
        // 跳过 listing 行：以权限令牌开头的 ls 输出（drwx------ …）
        .filter(|l| {
            l.split_whitespace()
                .next()
                .map(is_perm_token)
                .unwrap_or(false)
                != true
        })
        .last()
        .unwrap_or("")
        .to_string();
    let low = line.to_lowercase();
    if low.contains("permission denied") {
        // `dest open "<path>"` 是上传/下载时远端打开目标文件失败：直接指出
        // 目标路径，并点明是远端目录写权限问题（常见：传到了 `/` 根目录，
        // 普通用户对根目录没有写权限）。
        if let Some(open_at) = line.find("dest open") {
            let path = line[open_at + "dest open".len()..]
                .trim_start()
                .trim_start_matches('"')
                .split('"')
                .next()
                .unwrap_or("")
                .trim();
            if !path.is_empty() {
                return format!(
                    "远端目录无写权限：{}（请切换到有写权限的目录，或确认该目录对当前用户可写）",
                    path
                );
            }
        }
        return format!("权限不足：{}", line);
    }
    if low.contains("no such file") {
        return format!("路径不存在：{}", line);
    }
    if low.contains("failure") && low.contains("rmdir") {
        return format!("目录非空或无法删除：{}", line);
    }
    if low.contains("not a regular file") {
        return "该项是目录，请使用递归传输".to_string();
    }
    if low.contains("quota") {
        return format!("远端磁盘配额不足：{}", line);
    }
    if low.contains("no space left") {
        return "远端磁盘空间不足".to_string();
    }
    if low.contains("file already exists") || low.contains("file exists") {
        return format!("目标已存在：{}", line);
    }
    if low.contains("read-only file system") {
        return "远端文件系统为只读".to_string();
    }
    if low.contains("connection closed")
        || low.contains("connection reset")
        || low.contains("broken pipe")
    {
        return "连接已断开，请重试".to_string();
    }
    if low.contains("invalid argument") && low.contains("rename") {
        return format!("重命名失败（跨设备或名称非法）：{}", line);
    }
    if line.is_empty() {
        "SFTP 操作失败".to_string()
    } else {
        format!("SFTP 操作失败：{}", line)
    }
}
