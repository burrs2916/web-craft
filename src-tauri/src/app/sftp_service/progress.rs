//! Transfer progress meter parsing and reporting.

use std::path::Path;
use std::sync::Arc;
use std::sync::Mutex;
use crate::domain::terminal::pty::Pty;
use serde::Serialize;
use super::*;

/// Batch line that switches OpenSSH's progress meter back on.
///
/// `-b` sets BatchMode, which disables the meter outright. The `progress`
/// command toggles it, and the leading `-` marks the line non-fatal so an sftp
/// client that has never heard of the verb prints "Invalid command." and keeps
/// going instead of aborting the transfer.
pub(crate) const PROGRESS_ON: &str = "-progress";

/// The acknowledgement `PROGRESS_ON` prints; filtered out of transcripts.
pub(crate) const PROGRESS_ENABLED_NOTICE: &str = "Progress meter enabled";

/// One progress tick of a running transfer, forwarded to the UI.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferProgress {
    pub transfer_id: String,
    /// Name of the file currently on the wire.
    pub file: String,
    /// Progress of *that file*, 0-100.
    pub percent: u8,
    /// Progress of the whole transfer, 0-100. Equal to `percent` when the
    /// total size could not be established (see [`ProgressCtx`]).
    pub overall_percent: u8,
    /// True when `overall_percent` is backed by a real total rather than
    /// mirroring the current file. The UI must not promise a completion
    /// figure it cannot stand behind.
    pub overall_known: bool,
    /// 1-based index of the file being moved.
    pub file_no: u32,
    /// Files the transfer expects to move, 0 when unknown.
    pub total_files: u32,
    /// Bytes moved so far across every file of this transfer.
    pub transferred_bytes: u64,
    /// Bytes the transfer expects to move, 0 when unknown.
    pub total_bytes: u64,
    pub transferred: String,
    pub rate: String,
    pub eta: String,
}

pub type ProgressSink = Arc<dyn Fn(TransferProgress) + Send + Sync>;

/// Cross-file aggregation state for one transfer.
///
/// OpenSSH's progress meter is strictly *per file*: a recursive upload of 200
/// files redraws 0% → 100% two hundred times. Watching that tells the user
/// nothing about how far along the job actually is, so the ticks are folded
/// into a running total here before they reach the UI.
#[derive(Default)]
pub(crate) struct ProgressState {
    pub(crate) total_bytes: u64,
    pub(crate) total_files: u32,
    /// Bytes belonging to files that have already been handed off.
    pub(crate) done_bytes: u64,
    /// Files that have already been handed off.
    pub(crate) done_files: u32,
    pub(crate) current_file: String,
    /// High-water mark for the file on the wire; the meter can redraw a lower
    /// value after a re-render and the total must never walk backwards.
    pub(crate) current_bytes: u64,
}

pub struct ProgressCtx {
    pub transfer_id: String,
    pub sink: ProgressSink,
    pub(crate) state: Mutex<ProgressState>,
}

impl ProgressCtx {
    pub fn new(transfer_id: String, sink: ProgressSink) -> Self {
        ProgressCtx {
            transfer_id,
            sink,
            state: Mutex::new(ProgressState::default()),
        }
    }

    /// Declare how much work the transfer represents. Both values are best
    /// effort: 0 means "unknown", which downgrades the UI to per-file
    /// reporting instead of inventing a percentage.
    pub(crate) fn set_totals(&self, bytes: u64, files: u32) {
        let mut st = lock(&self.state);
        st.total_bytes = bytes;
        st.total_files = files;
    }

    /// Fold one meter line into the running total and forward it.
    pub(crate) fn tick(&self, file: &str, percent: u8, transferred: &str, rate: &str, eta: &str) {
        let (overall, overall_known, file_no, total_files, moved, total_bytes) = {
            let mut st = lock(&self.state);
            if st.current_file != file {
                // A new name on the wire is the only "file finished" signal the
                // meter gives us. Bank what the previous one moved.
                if !st.current_file.is_empty() {
                    st.done_bytes += st.current_bytes;
                    st.done_files += 1;
                }
                st.current_file = file.to_string();
                st.current_bytes = 0;
            }
            let bytes = parse_meter_bytes(transferred).unwrap_or(0);
            if bytes > st.current_bytes {
                st.current_bytes = bytes;
            }
            let moved = st.done_bytes.saturating_add(st.current_bytes);
            let (overall, known) = if st.total_bytes > 0 {
                (
                    ((moved.min(st.total_bytes) * 100) / st.total_bytes) as u8,
                    true,
                )
            } else if st.total_files > 0 {
                // No byte total (a recursive download, where the far side is
                // not walked up front) but the file count is known: each file
                // contributes an equal slice.
                let done = st.done_files.min(st.total_files);
                let v = (done as u64 * 100 + percent as u64) / st.total_files as u64;
                (v.min(100) as u8, true)
            } else {
                (percent, false)
            };
            (
                overall,
                known,
                st.done_files + 1,
                st.total_files,
                moved,
                st.total_bytes,
            )
        };
        (self.sink)(TransferProgress {
            transfer_id: self.transfer_id.clone(),
            file: file.to_string(),
            percent,
            overall_percent: overall,
            overall_known,
            file_no,
            total_files,
            transferred_bytes: moved,
            total_bytes,
            transferred: transferred.to_string(),
            rate: rate.to_string(),
            eta: eta.to_string(),
        });
    }
}

/// Read a transfer to completion, forwarding progress ticks as they arrive.
pub(crate) fn drive_transfer_pty(pty: &Pty, ctx: &ProgressCtx) -> Result<String, String> {
    let reader = pty.reader();

    let mut collected = String::new();
    let mut pending = String::new();
    let mut ansi = AnsiFilter::default();
    let mut buf = [0u8; 8192];
    {
        let mut guard = reader
            .lock()
            .map_err(|_| "读取 sftp 输出失败".to_string())?;
        let mut text = String::new();
        loop {
            match guard.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    text.clear();
                    ansi.push(&String::from_utf8_lossy(&buf[..n]), &mut text);
                    for ch in text.chars() {
                        if ch == '\r' || ch == '\n' {
                            if !pending.trim().is_empty() {
                                handle_transfer_line(&pending, ctx, &mut collected);
                            }
                            pending.clear();
                        } else {
                            pending.push(ch);
                        }
                    }
                }
                Err(_) => break,
            }
        }
    }
    if !pending.trim().is_empty() {
        handle_transfer_line(&pending, ctx, &mut collected);
    }

    let code = pty.wait().unwrap_or(-1);
    if code == 0 {
        Ok(collected)
    } else {
        Err(friendly_sftp_error(&collected, ""))
    }
}

pub(crate) fn handle_transfer_line(line: &str, ctx: &ProgressCtx, collected: &mut String) {
    if let Some(p) = parse_progress_line(line) {
        ctx.tick(&p.0, p.1, &p.2, &p.3, &p.4);
        return;
    }
    // Our own doing (see `PROGRESS_ON`); keeping it out of the transcript
    // means it can never end up quoted back at the user as an error.
    if line.trim() == PROGRESS_ENABLED_NOTICE {
        return;
    }
    if collected.len() < 8192 {
        collected.push_str(line.trim_end());
        collected.push('\n');
    }
}

/// Parse one OpenSSH progress-meter line, e.g.
/// `archive.tar.gz   43%   12MB   1.2MB/s   00:20 ETA`
/// Walk local `paths` (files and directories) and sum the byte size of every
/// regular file plus the file count. Used to seed the cross-file progress total
/// so an upload can show a real "overall %" instead of the meter's repeated
/// 0→100% per file.
pub(crate) fn local_tree_totals(paths: &[String]) -> (u64, u32) {
    let mut bytes = 0u64;
    let mut files = 0u32;
    for p in paths {
        let path = Path::new(p);
        if let Ok(meta) = path.symlink_metadata() {
            // A symlink is a single unit regardless of what it points at.
            if meta.file_type().is_symlink() {
                bytes = bytes.saturating_add(meta.len());
                files += 1;
                continue;
            }
        }
        if path.is_dir() {
            let mut stack = vec![path.to_path_buf()];
            while let Some(dir) = stack.pop() {
                let Ok(read) = std::fs::read_dir(&dir) else {
                    continue;
                };
                for entry in read.flatten() {
                    let ep = entry.path();
                    if ep.is_dir() {
                        stack.push(ep);
                    } else if ep.is_file() {
                        if let Ok(m) = entry.metadata() {
                            bytes = bytes.saturating_add(m.len());
                            files += 1;
                        }
                    }
                }
            }
        } else if path.is_file() {
            if let Ok(m) = path.metadata() {
                bytes = bytes.saturating_add(m.len());
                files += 1;
            }
        }
    }
    (bytes, files)
}

pub(crate) fn parse_progress_line(line: &str) -> Option<(String, u8, String, String, String)> {
    let trimmed = line.trim_end();
    if trimmed.starts_with("sftp>") {
        return None;
    }
    let pct_idx = trimmed.find('%')?;
    let head = &trimmed[..pct_idx];
    let digits_start = head
        .rfind(|c: char| !c.is_ascii_digit())
        .map(|i| i + 1)
        .unwrap_or(0);
    if digits_start >= head.len() {
        return None;
    }
    let percent: u32 = head[digits_start..].parse().ok()?;
    if percent > 100 {
        return None;
    }
    let name = head[..digits_start].trim().to_string();
    if name.is_empty() {
        return None;
    }
    let rest: Vec<&str> = trimmed[pct_idx + 1..].split_whitespace().collect();
    if rest.len() < 2 {
        return None;
    }
    Some((
        name,
        percent as u8,
        rest[0].to_string(),
        rest[1].to_string(),
        rest.get(2).copied().unwrap_or("").to_string(),
    ))
}

/// Parse the human-readable byte count OpenSSH prints in its progress meter
/// (`"0"`, `"12KB"`, `"1.5MB"`, `"1000MB"`, `"1.2GB"`) back into a raw byte
/// count. The meter's first column doubles as the bytes-moved figure we fold
/// into the cross-file total, so it has to survive the locale-specific
/// thousands separator and unit. Returns `None` only on a truly unreadable
/// token; a missing unit defaults to bytes.
pub(crate) fn parse_meter_bytes(token: &str) -> Option<u64> {
    let token = token.trim();
    if token.is_empty() {
        return None;
    }
    // Split a trailing unit (`KB`/`MB`/`GB`/`TB`) from the numeric head. The
    // numeric part may carry a locale thousands separator (`,` or `.`), so it
    // is scrubbed before parsing rather than relying on `f64::from_str`.
    let (num, unit) = match token.rfind(|c: char| c.is_ascii_alphabetic()) {
        Some(i) if i > 0 => (token[..i].trim(), token[i..].trim().to_ascii_lowercase()),
        _ => (token, String::new()),
    };
    let cleaned: String = num.chars().filter(|c| c.is_ascii_digit()).collect();
    if cleaned.is_empty() {
        return None;
    }
    let value: u64 = cleaned.parse().ok()?;
    let mult = match unit.as_str() {
        "kb" => 1_000u64,
        "mb" => 1_000_000u64,
        "gb" => 1_000_000_000u64,
        "tb" => 1_000_000_000_000u64,
        // OpenSSH on some builds uses `B` literal or no suffix for bytes.
        "b" | "" => 1u64,
        _ => 1u64,
    };
    Some(value.saturating_mul(mult))
}
