//! Remote/local path normalisation and sftp command quoting.

use std::path::Path;
use std::path::PathBuf;
use std::sync::atomic::AtomicU64;
use std::sync::atomic::Ordering;

/// Commands that operate on relative paths need the session's cwd pinned to the
/// start directory first — a pooled interactive session remembers the last
/// `cd`, a fresh `sftp -b` run does not.
pub(crate) fn reset_cwd_prefix(paths: &[&str]) -> Vec<String> {
    if paths.iter().any(|p| !is_absolute_remote(p)) {
        vec!["cd".to_string()]
    } else {
        Vec::new()
    }
}

/// True when a remote path is absolute *for the server*.
///
/// POSIX servers use a leading slash. Win32-OpenSSH usually canonicalises to
/// `/C:/Users/...`, but some builds (and hand-typed paths) report a bare
/// `C:/Users/...`, which is absolute as well and must not get a `cd` reset.
pub(crate) fn is_absolute_remote(p: &str) -> bool {
    let t = p.trim();
    if t.starts_with('/') || t.starts_with('\\') {
        return true;
    }
    let b = t.as_bytes();
    b.len() >= 3 && b[0].is_ascii_alphabetic() && b[1] == b':' && (b[2] == b'/' || b[2] == b'\\')
}

pub(crate) fn unique_temp_path(prefix: &str) -> String {
    static SEQ: AtomicU64 = AtomicU64::new(0);
    let seq = SEQ.fetch_add(1, Ordering::Relaxed);
    let pid = std::process::id();
    // macOS' sockaddr_un.sun_path is 104 bytes including NUL, so the socket path
    // must stay tiny. Fall back to /tmp when TMPDIR is deep.
    let name = format!("{}-{}-{:x}.sock", prefix, pid, seq);
    let mut p = std::env::temp_dir().join(&name);
    if p.to_string_lossy().len() > 100 {
        let alt = PathBuf::from("/tmp").join(&name);
        if alt.to_string_lossy().len() <= 100 && Path::new("/tmp").exists() {
            p = alt;
        }
    }
    p.to_string_lossy().into_owned()
}

pub(crate) fn write_temp_batch(lines: &[String]) -> Result<PathBuf, String> {
    static SEQ: AtomicU64 = AtomicU64::new(0);
    let path = std::env::temp_dir().join(format!(
        "webcraft-sftp-{}-{:x}.batch",
        std::process::id(),
        SEQ.fetch_add(1, Ordering::Relaxed)
    ));
    let content = lines.join("\n") + "\n";
    std::fs::write(&path, content).map_err(|e| format!("写临时批处理文件失败: {}", e))?;
    Ok(path)
}

/// Quote a path for the sftp command tokenizer (sftp.c `makeargv`), which
/// understands double quotes plus `\"` and `\\` escapes. Quoting also disables
/// glob expansion, so names containing `*`, `?` or `[` behave literally.
pub(crate) fn sftp_quote(p: &str) -> String {
    let escaped = p.replace('\\', "\\\\").replace('"', "\\\"");
    format!("\"{}\"", escaped)
}

/// `cd` into a remote directory, or back to the login directory for ".".
///
/// A bare `cd` is what keeps a pooled interactive session stateless — see
/// `list_dir_raw`.
pub(crate) fn cd_command(dir: &str) -> String {
    if dir == "." {
        "cd".to_string()
    } else {
        format!("cd {}", sftp_quote(dir))
    }
}

/// Rewrite the *source* of a recursive transfer so it merges into the
/// destination instead of nesting a second copy inside it.
///
/// `put -r /local/data data` looks obviously right and is the trap: OpenSSH
/// appends the source basename whenever the destination directory already
/// exists, so a re-upload silently lands in `data/data` while the UI reports
/// success. Naming the `.` component instead makes the basename `.`, which
/// resolves back onto the destination itself — verified against a real
/// sftp-server for both directions and for existing *and* absent
/// destinations, with dotfiles carried along.
///
/// The trailing slash is stripped and re-added so a Win32 drive root (`/C:/`,
/// where the slash is load-bearing — see `is_drive_root`) stays a drive root
/// rather than decaying into "the working directory of drive C".
pub(crate) fn merge_source(path: &str) -> String {
    let trimmed = path.trim_end_matches('/');
    if trimmed.is_empty() {
        // The path was "/" (or a run of slashes): the root itself.
        return "/.".to_string();
    }
    format!("{}/.", trimmed)
}

/// Windows local paths use backslashes, which the sftp tokenizer treats as
/// escapes. Windows accepts forward slashes everywhere, so normalise them.
pub(crate) fn normalize_local_path(p: &str) -> String {
    if cfg!(target_os = "windows") {
        p.replace('\\', "/")
    } else {
        p.to_string()
    }
}

/// Validate and canonicalise a permission mode for the sftp `chmod` verb.
///
/// Only octal digits are accepted: anything else would be pasted straight into
/// the command line of a live session.
pub(crate) fn normalize_octal_mode(mode: &str) -> Result<String, String> {
    let t = mode.trim();
    let digits: &str = t.strip_prefix("0o").unwrap_or(t);
    if digits.is_empty()
        || digits.len() > 4
        || !digits.chars().all(|c| ('0'..='7').contains(&c))
    {
        return Err(format!("无效的权限值: {}", mode));
    }
    // Pad to three digits so "7" means 007 rather than a server-side guess.
    Ok(format!("{:0>3}", digits))
}

/// True for a Win32-OpenSSH drive root: `/C:/` or `C:/`.
///
/// The distinction matters because `cd "/C:"` (no trailing slash) means "the
/// working directory of drive C" in Win32 semantics, which is *not* the root
/// of the drive. Keeping the slash makes "go up from /C:/Users" land where a
/// user expects.
pub(crate) fn is_drive_root(p: &str) -> bool {
    let t = p.strip_prefix('/').unwrap_or(p);
    let b = t.as_bytes();
    b.len() == 3 && b[0].is_ascii_alphabetic() && b[1] == b':' && b[2] == b'/'
}

pub(crate) fn normalize_remote_dir(path: &str) -> String {
    let t = path.trim();
    if t.is_empty() || t == "." {
        ".".to_string()
    } else if is_drive_root(t) {
        t.to_string()
    } else if t.len() > 1 && t.ends_with('/') {
        t.trim_end_matches('/').to_string()
    } else {
        t.to_string()
    }
}

pub(crate) fn remote_basename(path: &str) -> String {
    path.trim_end_matches('/')
        .rsplit('/')
        .next()
        .unwrap_or(path)
        .to_string()
}

pub(crate) fn join_remote(base: &str, name: &str) -> String {
    if base == "." || base.is_empty() {
        name.to_string()
    } else if base.ends_with('/') {
        format!("{}{}", base, name)
    } else {
        format!("{}/{}", base, name)
    }
}
