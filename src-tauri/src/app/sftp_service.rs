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
use std::process::Command;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{channel, Receiver, RecvTimeoutError};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

mod parse;
pub(crate) use parse::*;

/// How long an idle ControlMaster is kept alive before being reaped.
const MASTER_IDLE_TTL: Duration = Duration::from_secs(240);
/// How long we wait for the control socket to show up after spawning a master.
const MASTER_READY_TIMEOUT: Duration = Duration::from_secs(15);
/// How long an interactive session may stay silent before we call it stuck.
const SESSION_IDLE_TIMEOUT: Duration = Duration::from_secs(90);
/// How long the initial banner/password exchange may take.
const SESSION_HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(25);
/// Message returned when the user aborted a transfer on purpose.
pub const CANCELLED_MESSAGE: &str = "传输已取消";

/// True when the local OpenSSH client can multiplex sessions over a control
/// socket. Win32-OpenSSH ships without `ControlMaster`, so Windows always uses
/// the interactive session path instead of stalling on a socket that will
/// never appear.
fn supports_multiplexing() -> bool {
    !cfg!(target_os = "windows")
}

/// Metadata lane (listing / mkdir / rename / delete): kept separate from the
/// transfer lane so browsing stays responsive while a big upload is running.
const LANE_META: &str = "m";
/// Transfer lane (upload / download).
const LANE_XFER: &str = "x";

/// Batch line that switches OpenSSH's progress meter back on.
///
/// `-b` sets BatchMode, which disables the meter outright. The `progress`
/// command toggles it, and the leading `-` marks the line non-fatal so an sftp
/// client that has never heard of the verb prints "Invalid command." and keeps
/// going instead of aborting the transfer.
const PROGRESS_ON: &str = "-progress";
/// The acknowledgement `PROGRESS_ON` prints; filtered out of transcripts.
const PROGRESS_ENABLED_NOTICE: &str = "Progress meter enabled";

/// Ceiling on the number of batch lines a resumed upload may expand into.
///
/// Only files that still have to move end up in the plan, so a transfer that
/// died near the end produces a handful of lines. A plan that blows past this
/// means barely anything got through, and re-sending the tree in one recursive
/// `put` is both correct and cheaper than typing thousands of commands into an
/// interactive Windows session.
const RESUME_PLAN_LIMIT: usize = 2_000;
/// Guard against symlink loops and pathological trees while planning.
const RESUME_MAX_ENTRIES: usize = 20_000;

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
struct ProgressState {
    total_bytes: u64,
    total_files: u32,
    /// Bytes belonging to files that have already been handed off.
    done_bytes: u64,
    /// Files that have already been handed off.
    done_files: u32,
    current_file: String,
    /// High-water mark for the file on the wire; the meter can redraw a lower
    /// value after a re-render and the total must never walk backwards.
    current_bytes: u64,
}

pub struct ProgressCtx {
    pub transfer_id: String,
    pub sink: ProgressSink,
    state: Mutex<ProgressState>,
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
    fn set_totals(&self, bytes: u64, files: u32) {
        let mut st = lock(&self.state);
        st.total_bytes = bytes;
        st.total_files = files;
    }

    /// Fold one meter line into the running total and forward it.
    fn tick(&self, file: &str, percent: u8, transferred: &str, rate: &str, eta: &str) {
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

/// A remote path plus the type we already know from the listing, so deletes and
/// downloads can pick the right sftp verb without an extra stat round trip.
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteItem {
    pub path: String,
    #[serde(default)]
    pub is_dir: bool,
}

/// A live SSH ControlMaster kept in the pool.
struct PooledMaster {
    control_path: String,
    pty: Pty,
    last_used: Instant,
}

/// Incremental ANSI/VT scrubber.
///
/// Windows ConPTY re-renders everything through a virtual screen buffer and
/// sprinkles cursor sequences into the stream; libedit does the same on Unix.
/// Escape sequences can be split across reads, so the state has to survive
/// between chunks.
#[derive(Default)]
struct AnsiFilter {
    state: u8,
}

impl AnsiFilter {
    fn push(&mut self, input: &str, out: &mut String) {
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
struct InteractiveSession {
    pty: Arc<Pty>,
    rx: Receiver<Vec<u8>>,
    ansi: AnsiFilter,
    /// Bytes seen since the last line break — also where the `sftp>` prompt and
    /// the password prompt show up (neither ends with a newline).
    pending: String,
    /// Rolling tail of the raw conversation, used to explain handshake errors.
    diag: String,
    /// Set when an auth prompt appeared that we cannot satisfy.
    auth_error: Option<String>,
    last_used: Instant,
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

    // ---- public API ----

    /// List a remote directory, resolving which entries can be entered.
    /// `path` of "" / "." means the user's home.
    pub fn list_dir(&self, ssh: &SshConnectionInfo, path: &str) -> Result<SftpListResult, String> {
        let target = normalize_remote_dir(path);
        let mut batch: Vec<String> = vec![cd_command(&target), "pwd".to_string()];
        // Numeric long view: formatted by the *local* client, so the layout is
        // identical no matter what SSH server implementation is on the far end.
        batch.push("ls -lan".to_string());
        // 第二个 `pwd` 是**输出分段边界**，不是多余的往返：它把 `ls -lan` 的
        // 列表输出和下面的 symlink 探测输出切成两段，二者再也不会共用同一个
        // 缓冲区。这是「每个文件显示两份」的结构性根因所在——`{,.}*/` 里的
        // `.*/ ` 会展开出 `./`，等于让服务器**把当前目录再列一遍**；只要那段
        // 回显是长格式（非 OpenSSH 实现、或 `-1` 未被采纳），`parse_ls` 就会
        // 把它解析成第二份完整列表。物理隔离后，探测输出永远进不了 parse_ls。
        batch.push("pwd".to_string());
        // Resolve enterable children (symlinked folders) in the *same* batch —
        // one sftp round trip instead of two. The probe is read-only and its
        // leading `-` keeps a client too old for `-1`, or an unreadable glob,
        // from failing the listing.
        batch.push("-ls -1 {,.}*/".to_string());

        let output = match self.exec(ssh, LANE_META, &batch, None) {
            Ok(o) => o,
            // 除连接类错误外，`ls -lan` 失败一律回退服务端 longname 视图重试一次。
            // 触发场景：老客户端（Invalid flag / usage: ls）、不完整 sftp-server
            // （扩展请求失败，如 Dropbear 系返回不支持，longname 里 nlink 为 `?`）。
            // 列表本身通常没问题，numeric 视图失败不该让整个浏览不可用。
            Err(e) if !is_connection_error(&e) => {
                // 重建而非截断原 batch：原 batch 末尾是 `pwd` + 探测，简单
                // 截断会把失败的 `ls -lan` 再跑一遍。
                let fallback = vec![cd_command(&target), "pwd".to_string(), "ls -la".to_string()];
                match self.exec(ssh, LANE_META, &fallback, None) {
                    Ok(o) => o,
                    Err(_) => return Err(e),
                }
            }
            Err(e) => return Err(e),
        };

        let resolved = parse_pwd(&output).unwrap_or_else(|| target.clone());
        // sections[0] = 首个 pwd 之前的横幅噪声，[1] = `ls -lan`，[2] = 探测。
        // 段数不足说明这台服务器的回显不符合预期（或走了 `ls -la` 回退，只有
        // 一段）——退回整段解析的老行为，靠 parse_ls 的去重兜底，绝不因为
        // 分段失败就把列表弄丢。
        let sections = split_listing_sections(&output);
        let (listing_seg, probe_seg): (&str, &str) = if sections.len() >= 3 {
            (sections[1].as_str(), sections[2].as_str())
        } else {
            (output.as_str(), output.as_str())
        };
        let mut entries = parse_ls(listing_seg);
        let dir_targets = parse_dir_markers(probe_seg);
        apply_dir_markers(&mut entries, &dir_targets);
        Ok(SftpListResult {
            path: resolved,
            entries,
        })
    }

    /**
     * List several directories in a single sftp session.
     *
     * The directory tree expands an ancestor chain all at once; doing that with
     * one `list_dir` per node serialises N round trips behind the META lock.
     * Concatenating every `cd`/`ls` into one batch collapses that to a single
     * process spawn — the difference between a tree that snaps open and one that
     * visibly staggers on a high-latency link.
     *
     * Each directory contributes one `Remote working directory:` line, which
     * [`split_listing_sections`] uses to carve the transcript back into N
     * sections mapped to the requested paths in order. If the layout ever
     * diverges from that expectation (a server that echoes `cd` differently, a
     * whole-batch failure) we fall back to independent `list_dir` calls, so this
     * can only be faster than today, never less correct.
     */
    pub fn list_dirs(
        &self,
        ssh: &SshConnectionInfo,
        paths: &[String],
    ) -> Result<Vec<DirListing>, String> {
        if paths.is_empty() {
            return Ok(vec![]);
        }
        let mut batch: Vec<String> = Vec::with_capacity(paths.len() * 4);
        for p in paths {
            batch.push(cd_command(p));
            // `pwd` is the only reliable per-section delimiter in batch mode; the
            // `cd` echo is not guaranteed across server implementations.
            batch.push("pwd".to_string());
            batch.push("ls -lan".to_string());
            // 分段边界：与 `list_dir` 同理，把列表输出和探测输出隔开，避免
            // 探测里 `./` 造成的「当前目录被列第二遍」污染 parse_ls。
            batch.push("pwd".to_string());
            // Resolve enterable children (symlinked folders) in the same batch.
            batch.push("-ls -1 {,.}*/".to_string());
        }

        let output = match self.exec(ssh, LANE_META, &batch, None) {
            Ok(o) => o,
            Err(e) if is_connection_error(&e) => return Err(e),
            Err(_) => return self.list_dirs_fallback(ssh, paths),
        };

        let sections = split_listing_sections(&output);
        // `sections[0]` is everything before the first `cd`; after it every path
        // contributes **two** sections (listing, then probe). A mismatch means
        // the transcript did not arrive as expected — bail to the per-path path
        // rather than mis-associate entries.
        if sections.len() != paths.len() * 2 + 1 {
            return self.list_dirs_fallback(ssh, paths);
        }

        let mut out = Vec::with_capacity(paths.len());
        for (i, p) in paths.iter().enumerate() {
            let listing_seg = &sections[i * 2 + 1];
            let probe_seg = &sections[i * 2 + 2];
            let mut entries = parse_ls(listing_seg);
            let markers = parse_dir_markers(probe_seg);
            apply_dir_markers(&mut entries, &markers);
            out.push(DirListing {
                path: p.clone(),
                entries,
                error: None,
            });
        }
        Ok(out)
    }

    /// Per-path fallback for [`list_dirs`] when a batched listing cannot be
    /// trusted. Each directory is listed on its own; a failure is recorded
    /// against that path instead of poisoning the whole batch.
    fn list_dirs_fallback(
        &self,
        ssh: &SshConnectionInfo,
        paths: &[String],
    ) -> Result<Vec<DirListing>, String> {
        let mut out = Vec::with_capacity(paths.len());
        for p in paths {
            match self.list_dir(ssh, p) {
                Ok(r) => out.push(DirListing {
                    path: r.path,
                    entries: r.entries,
                    error: None,
                }),
                Err(e) => out.push(DirListing {
                    path: p.clone(),
                    entries: vec![],
                    error: Some(e),
                }),
            }
        }
        Ok(out)
    }

    /// The listing itself, without the symlink probe.
    ///
    /// Used by the recursive walk behind deletes, which decides purely on
    /// `is_dir` (it must never follow a link) and would otherwise pay for a
    /// probe per directory it descends into.
    fn list_dir_raw(
        &self,
        ssh: &SshConnectionInfo,
        path: &str,
    ) -> Result<SftpListResult, String> {
        let target = normalize_remote_dir(path);

        // A bare `cd` returns to the directory the session started in. Always
        // emitting it keeps a *pooled interactive* session stateless: without
        // it, "." would resolve to wherever the previous command left the
        // remote cwd instead of the user's home.
        let mut batch: Vec<String> = vec![cd_command(&target)];
        batch.push("pwd".to_string());
        // Numeric long view: formatted by the *local* client, so the layout is
        // identical no matter what SSH server implementation is on the far end.
        batch.push("ls -lan".to_string());

        let output = match self.exec(ssh, LANE_META, &batch, None) {
            Ok(o) => o,
            // 同 list_dir：非连接错误一律回退服务端 longname 视图，覆盖老客户端
            // 与不完整 sftp-server（Dropbear 系 `ls -lan` 扩展请求失败）。
            Err(e) if !is_connection_error(&e) => {
                let mut fallback = batch.clone();
                if let Some(last) = fallback.last_mut() {
                    *last = "ls -la".to_string();
                }
                match self.exec(ssh, LANE_META, &fallback, None) {
                    Ok(o) => o,
                    Err(_) => return Err(e),
                }
            }
            Err(e) => return Err(e),
        };

        let resolved = parse_pwd(&output).unwrap_or_else(|| target.clone());
        let entries = parse_ls(&output);
        Ok(SftpListResult {
            path: resolved,
            entries,
        })
    }

    /// Upload local files/directories into `remote_dir`. Directories are sent
    /// recursively. All items travel through a single sftp session.
    ///
    /// `resume` continues an interrupted transfer instead of starting over.
    /// See [`SftpService::plan_resume_upload`] for why that cannot simply be
    /// the sftp client's own `-a` flag.
    pub fn upload(
        &self,
        ssh: &SshConnectionInfo,
        local_paths: &[String],
        remote_dir: &str,
        progress: Option<&ProgressCtx>,
        remote_names: Option<&[String]>,
        resume: bool,
    ) -> Result<(), String> {
        if local_paths.is_empty() {
            return Ok(());
        }
        // Claimed before any blocking work so the row the user just saw appear
        // can be cancelled straight away.
        let _slot = self.claim_transfer(progress);
        let dir = normalize_remote_dir(remote_dir);

        if resume {
            if let Some(plan) =
                self.plan_resume_upload(ssh, &dir, local_paths, remote_names, progress)?
            {
                tracing::debug!(
                    "[SFTP] 续传计划: {} 个待传, {} 个已完整跳过, {} 个目录待建",
                    plan.puts.len(),
                    plan.skipped,
                    plan.mkdirs.len()
                );
                if plan.is_noop() {
                    // Every byte is already on the far side. Reporting success
                    // without opening a transfer session is the honest answer.
                    return Ok(());
                }
                let mut batch: Vec<String> = vec![cd_command(&dir)];
                batch.extend(plan.mkdirs);
                batch.extend(plan.puts);
                return self.exec_upload_auto_chmod(ssh, &dir, &batch, progress);
            }
            // No usable plan (nothing landed yet, tree too large, listing
            // unreadable): fall through to a full send, which merges into
            // whatever is already there and is always correct.
        }

        let mut batch: Vec<String> = vec![cd_command(&dir)];
        // Seed the cross-file progress total from the local tree so a folder
        // upload reports one honest "overall %". The resume path above returns
        // before reaching here and deliberately leaves totals unset, so it
        // falls back to the per-file meter (already-present files are skipped,
        // so a synthetic total would never reach 100%).
        let totals = local_tree_totals(local_paths);
        if let Some(ctx) = progress {
            ctx.set_totals(totals.0, totals.1);
        }
        for (i, local) in local_paths.iter().enumerate() {
            let p = Path::new(local);
            let name = p
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .ok_or_else(|| format!("无法解析本地文件名: {}", local))?;
            let recursive = p.is_dir();
            let local_arg = normalize_local_path(local);
            // Folders are sent as `<dir>/.` so re-uploading merges into the
            // existing remote folder instead of nesting a copy inside it.
            let source = if recursive {
                merge_source(&local_arg)
            } else {
                local_arg
            };
            // `remote_names` lets the UI keep both copies on a name clash by
            // uploading the incoming file under a fresh name (`report (1).pdf`)
            // instead of clobbering the original. Falls back to the local base
            // name when the override is absent or mis-sized.
            let dest_name = match remote_names {
                Some(names) if i < names.len() => names[i].clone(),
                _ => name.clone(),
            };
            batch.push(format!(
                "put {}{} {}",
                if recursive { "-r " } else { "" },
                sftp_quote(&source),
                sftp_quote(&dest_name)
            ));
        }
        self.exec_upload_auto_chmod(ssh, &dir, &batch, progress)
    }

    /// 执行上传 batch；失败且为权限类错误时，自动给目标目录加属主写+执行位
    /// 并重试一次。目录不属于当前用户（如根目录 `/`）或文件系统只读时无法
    /// 自动赋予，返回引导性错误。
    fn exec_upload_auto_chmod(
        &self,
        ssh: &SshConnectionInfo,
        dir: &str,
        batch: &[String],
        progress: Option<&ProgressCtx>,
    ) -> Result<(), String> {
        match self.exec(ssh, LANE_XFER, batch, progress) {
            Ok(_) => Ok(()),
            Err(e) if is_permission_error(&e) => match self.ensure_dir_writable(ssh, dir) {
                Ok(true) => {
                    tracing::info!("[SFTP] 已自动为目标目录添加写权限，重试上传: {}", dir);
                    self.exec(ssh, LANE_XFER, batch, progress).map(|_| ())
                }
                Ok(false) => Err(format!(
                    "目标目录无写权限，且无法自动赋予（目录不属于当前用户或文件系统只读）：{}。\
                     请使用有权限的账号（如 root）连接，或上传到你有写权限的目录。",
                    dir
                )),
                Err(guide) => Err(guide),
            },
            Err(e) => Err(e),
        }
    }

    /// 读取目标目录当前 mode，给属主加上写+执行位（`u+w,u+x`，保留其余位），
    /// 返回 Ok(true) 表示已 chmod 成功；Ok(false) 表示目录已有属主写位却仍
    /// 失败（不是目录权限问题，chmod 也救不了）；Err 表示 ls/chmod 本身失败。
    fn ensure_dir_writable(
        &self,
        ssh: &SshConnectionInfo,
        dir: &str,
    ) -> Result<bool, String> {
        let probe = vec![format!("ls -lan {}", sftp_quote(dir))];
        let out = self.exec(ssh, LANE_META, &probe, None)?;
        let mode = parse_dir_mode_from_ls(&out)
            .ok_or_else(|| format!("无法读取目标目录权限：{}", dir))?;
        let needed = mode | 0o300; // 属主写 + 执行（往目录里建文件需要 w+x）
        if needed == mode {
            // 目录本来就有属主写位却仍失败 → 不是目录权限问题
            return Ok(false);
        }
        let chmod_batch = vec![format!("chmod {:o} {}", needed, sftp_quote(dir))];
        self.exec(ssh, LANE_META, &chmod_batch, None)?;
        tracing::info!(
            "[SFTP] 已自动为目录添加写权限: {} ({:o} -> {:o})",
            dir,
            mode,
            needed
        );
        Ok(true)
    }

    /// Download remote files/directories into a local directory.
    ///
    /// `resume` maps straight onto the sftp client's `-a`: for *downloads* the
    /// flag behaves exactly as advertised — a missing local file is fetched in
    /// full, a short one is continued, a complete one is left alone, and a
    /// recursive `get -r -a` applies all three per file. (The upload direction
    /// is not symmetric; see `plan_resume_upload`.)
    pub fn download(
        &self,
        ssh: &SshConnectionInfo,
        items: &[RemoteItem],
        local_dir: &str,
        progress: Option<&ProgressCtx>,
        resume: bool,
    ) -> Result<(), String> {
        if items.is_empty() {
            return Ok(());
        }
        let _slot = self.claim_transfer(progress);
        let local_base = normalize_local_path(local_dir);
        let mut batch: Vec<String> = Vec::new();
        for item in items {
            let name = remote_basename(&item.path);
            let dest = if local_base.ends_with('/') {
                format!("{}{}", local_base, name)
            } else {
                format!("{}/{}", local_base, name)
            };
            // Same merge rule as `upload`, mirrored: without it a second
            // download of the same folder lands in `<dest>/<name>/<name>`.
            let source = if item.is_dir {
                merge_source(&item.path)
            } else {
                item.path.clone()
            };
            batch.push(format!(
                "get {}{}{} {}",
                if item.is_dir { "-r " } else { "" },
                if resume { "-a " } else { "" },
                sftp_quote(&source),
                sftp_quote(&dest)
            ));
        }
        self.exec(ssh, LANE_XFER, &batch, progress).map(|_| ())
    }

    /// Delete remote files and directories. Directories are removed
    /// recursively (SFTP has no recursive verb, so the tree is walked first).
    pub fn remove(&self, ssh: &SshConnectionInfo, items: &[RemoteItem]) -> Result<(), String> {
        if items.is_empty() {
            return Ok(());
        }
        let paths: Vec<&str> = items.iter().map(|i| i.path.as_str()).collect();
        let mut batch: Vec<String> = reset_cwd_prefix(&paths);
        for item in items {
            if item.is_dir {
                let (files, dirs) = self.collect_tree(ssh, &item.path)?;
                for f in files {
                    batch.push(format!("rm {}", sftp_quote(&f)));
                }
                for d in dirs {
                    batch.push(format!("rmdir {}", sftp_quote(&d)));
                }
                batch.push(format!("rmdir {}", sftp_quote(&item.path)));
            } else {
                batch.push(format!("rm {}", sftp_quote(&item.path)));
            }
        }
        self.exec(ssh, LANE_META, &batch, None).map(|_| ())
    }

    pub fn rename(&self, ssh: &SshConnectionInfo, from: &str, to: &str) -> Result<(), String> {
        let mut batch = reset_cwd_prefix(&[from, to]);
        batch.push(format!("rename {} {}", sftp_quote(from), sftp_quote(to)));
        self.exec(ssh, LANE_META, &batch, None).map(|_| ())
    }

    pub fn mkdir(&self, ssh: &SshConnectionInfo, remote_path: &str) -> Result<(), String> {
        let mut batch = reset_cwd_prefix(&[remote_path]);
        batch.push(format!("mkdir {}", sftp_quote(remote_path)));
        self.exec(ssh, LANE_META, &batch, None).map(|_| ())
    }

    /// Apply a POSIX permission mode to remote paths.
    ///
    /// `mode` is an octal string ("755", "0644"). Windows servers answer
    /// SSH_FXP_SETSTAT with a failure or silently ignore the mode bits — the
    /// error is surfaced verbatim rather than pretended away.
    pub fn chmod(
        &self,
        ssh: &SshConnectionInfo,
        paths: &[String],
        mode: &str,
    ) -> Result<(), String> {
        if paths.is_empty() {
            return Ok(());
        }
        let normalized = normalize_octal_mode(mode)?;
        let refs: Vec<&str> = paths.iter().map(|p| p.as_str()).collect();
        let mut batch = reset_cwd_prefix(&refs);
        for p in paths {
            batch.push(format!("chmod {} {}", normalized, sftp_quote(p)));
        }
        self.exec(ssh, LANE_META, &batch, None).map(|_| ())
    }

    /// Tear down every pooled master for a connection (called when the SFTP
    /// window closes) so no stray `ssh -M -N` process is left behind.
    pub fn disconnect(&self, ssh: &SshConnectionInfo) {
        let prefix = format!("{}@{}:{}", ssh.username, ssh.host, ssh.port);
        {
            let mut map = lock(&self.masters);
            let keys: Vec<String> = map
                .keys()
                .filter(|k| k.starts_with(&prefix))
                .cloned()
                .collect();
            for k in keys {
                if let Some(m) = map.remove(&k) {
                    shutdown_master(&m, ssh);
                }
            }
        }
        let mut sessions = lock(&self.sessions);
        let keys: Vec<String> = sessions
            .keys()
            .filter(|k| k.starts_with(&prefix))
            .cloned()
            .collect();
        for k in keys {
            if let Some(s) = sessions.remove(&k) {
                s.close();
            }
        }
    }

    /// Drop every pooled master/session regardless of connection (app shutdown).
    pub fn shutdown_all(&self) {
        {
            let mut map = lock(&self.masters);
            for (_, m) in map.drain() {
                let _ = m.pty.kill();
                let _ = std::fs::remove_file(&m.control_path);
            }
        }
        let mut sessions = lock(&self.sessions);
        for (_, s) in sessions.drain() {
            s.close();
        }
    }

    /// Abort a transfer, whether or not it has started.
    ///
    /// A transfer only owns a child process for part of its life: it first
    /// queues behind its lane (a big upload can hold that for minutes) and
    /// then waits out the SSH handshake (up to 25 s for an interactive
    /// password session). Recording the verdict makes the cancel stick across
    /// both windows — the operation short-circuits before spawning anything.
    /// When a child does exist, killing it unblocks the reader so the caller
    /// unwinds with [`CANCELLED_MESSAGE`].
    ///
    /// Returns false only for ids the service is not working on, so a stale
    /// cancel cannot leave an unread verdict behind forever.
    pub fn cancel(&self, transfer_id: &str) -> bool {
        if !lock(&self.inflight).contains(transfer_id) {
            return false;
        }
        lock(&self.cancelled).insert(transfer_id.to_string());
        if let Some(p) = lock(&self.running).remove(transfer_id) {
            let _ = p.kill();
        }
        true
    }

    /// Claim a transfer id for one operation. Called before the lane lock, so
    /// the transfer is cancellable from the instant the UI queues it.
    fn claim_transfer(&self, progress: Option<&ProgressCtx>) -> Option<TransferSlot<'_>> {
        let ctx = progress?;
        // A retry reuses the id: drop the verdict from the previous attempt,
        // otherwise the replay would abort on a cancel the user already saw.
        lock(&self.cancelled).remove(&ctx.transfer_id);
        lock(&self.inflight).insert(ctx.transfer_id.clone());
        Some(TransferSlot {
            service: self,
            id: ctx.transfer_id.clone(),
        })
    }

    fn register_running(&self, transfer_id: &str, pty: Arc<Pty>) {
        lock(&self.running).insert(transfer_id.to_string(), pty);
    }

    fn unregister_running(&self, transfer_id: &str) {
        lock(&self.running).remove(transfer_id);
    }

    /// Non-consuming on purpose: `exec` may loop once more after a dropped
    /// connection, and a verdict that erased itself on the first read would
    /// let that retry resurrect a transfer the user aborted. The claim slot
    /// clears it when the operation ends.
    fn cancel_requested(&self, progress: Option<&ProgressCtx>) -> bool {
        match progress {
            Some(ctx) => lock(&self.cancelled).contains(&ctx.transfer_id),
            None => false,
        }
    }

    // ---- internals ----

    /// Recursively collect files and directories below `root` (deepest first)
    /// so a directory can be deleted with plain `rm`/`rmdir` verbs.
    fn collect_tree(
        &self,
        ssh: &SshConnectionInfo,
        root: &str,
    ) -> Result<(Vec<String>, Vec<String>), String> {
        const MAX_ENTRIES: usize = 20_000;
        let mut files: Vec<String> = Vec::new();
        let mut dirs: Vec<String> = Vec::new();
        let mut queue: Vec<String> = vec![root.to_string()];
        let mut visited = 0usize;

        while let Some(dir) = queue.pop() {
            // `_raw`: this walk decides on `is_dir` alone, so resolving
            // symlink targets would be a round trip per directory for nothing.
            let listing = self.list_dir_raw(ssh, &dir)?;
            for e in listing.entries {
                visited += 1;
                if visited > MAX_ENTRIES {
                    return Err("目录内容过多，已取消递归删除以避免长时间阻塞".to_string());
                }
                let child = join_remote(&dir, &e.name);
                // Never follow symlinks: unlink them like regular files.
                if e.is_dir && !e.is_symlink {
                    dirs.push(child.clone());
                    queue.push(child);
                } else {
                    files.push(child);
                }
            }
        }
        // Deepest directories first so `rmdir` always sees an empty target.
        dirs.sort_by_key(|d| std::cmp::Reverse(d.matches('/').count()));
        Ok((files, dirs))
    }

    /// Work out what a resumed upload still has to send.
    ///
    /// The sftp client has an `-a` flag for exactly this, and for downloads it
    /// is the whole answer — but `put -a` is not its mirror image. Measured
    /// against a real sftp-server (OpenSSH 10.2):
    ///
    /// - remote file absent  -> `stat remote: No such file or directory`,
    ///   command fails, **nothing is uploaded**;
    /// - remote file complete -> `destination file same size or larger`,
    ///   command fails;
    /// - inside `put -r -a` both of those are per-file failures the recursive
    ///   walk shrugs off, so a resumed folder upload *silently skips every
    ///   file that never made it the first time* — the worst possible outcome
    ///   for a "continue where it stopped" button.
    ///
    /// So the decision is made here instead: one listing of the destination,
    /// one recursive listing per folder being resumed, and then a plain `put`,
    /// a `put -a`, or nothing at all for each file.
    ///
    /// Returns `Ok(None)` when resuming buys nothing (destination empty or
    /// unreadable, plan too large) — the caller then does a full merge upload,
    /// which is always correct, just slower.
    fn plan_resume_upload(
        &self,
        ssh: &SshConnectionInfo,
        dir: &str,
        local_paths: &[String],
        remote_names: Option<&[String]>,
        progress: Option<&ProgressCtx>,
    ) -> Result<Option<UploadPlan>, String> {
        // An unreadable or absent destination means nothing landed yet.
        let top = match self.list_dir_raw(ssh, dir) {
            Ok(l) => l,
            Err(e) if is_connection_error(&e) => return Err(e),
            Err(_) => return Ok(None),
        };
        let mut top_files: HashMap<String, u64> = HashMap::new();
        let mut top_dirs: HashSet<String> = HashSet::new();
        for e in &top.entries {
            // Symlinks are followed by the transfer itself, so a link to a
            // directory counts as a directory here too.
            if e.is_dir || e.target_is_dir {
                top_dirs.insert(e.name.clone());
            } else {
                top_files.insert(e.name.clone(), e.size);
            }
        }

        let mut plan = UploadPlan::default();
        for (i, local) in local_paths.iter().enumerate() {
            if self.cancel_requested(progress) {
                return Err(CANCELLED_MESSAGE.to_string());
            }
            let p = Path::new(local);
            let name = p
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .ok_or_else(|| format!("无法解析本地文件名: {}", local))?;
            let dest = match remote_names {
                Some(names) if i < names.len() => names[i].clone(),
                _ => name,
            };
            let local_arg = normalize_local_path(local);

            if !p.is_dir() {
                let size = p.metadata().map(|m| m.len()).unwrap_or(0);
                plan.push_file(&local_arg, &dest, size, top_files.get(&dest).copied());
                continue;
            }

            if !top_dirs.contains(&dest) {
                // Nothing of this folder is on the far side yet (or a file of
                // the same name is in the way): one recursive put handles both.
                plan.puts.push(format!(
                    "put -r {} {}",
                    sftp_quote(&merge_source(&local_arg)),
                    sftp_quote(&dest)
                ));
                continue;
            }

            let local_tree = match walk_local_tree(p) {
                Some(t) => t,
                // Unreadable or absurdly large local tree: let the plain
                // recursive put deal with it and report the real error.
                None => return Ok(None),
            };
            let remote_root = join_remote(dir, &dest);
            let mut remote_files: HashMap<String, u64> = HashMap::new();
            let mut remote_dirs: HashSet<String> = HashSet::new();
            if !self.remote_tree_sizes(ssh, &remote_root, &mut remote_files, &mut remote_dirs)? {
                return Ok(None);
            }

            for rel in &local_tree.dirs {
                if !remote_dirs.contains(rel) {
                    // Leading `-`: a directory another item just created, or
                    // one that appeared between listing and transfer, must not
                    // abort the batch.
                    plan.mkdirs
                        .push(format!("-mkdir {}", sftp_quote(&format!("{}/{}", dest, rel))));
                }
            }
            for (rel, size) in &local_tree.files {
                let local_child = format!("{}/{}", local_arg.trim_end_matches('/'), rel);
                let remote_child = format!("{}/{}", dest, rel);
                plan.push_file(
                    &local_child,
                    &remote_child,
                    *size,
                    remote_files.get(rel).copied(),
                );
            }
            if plan.len() > RESUME_PLAN_LIMIT {
                return Ok(None);
            }
        }

        if plan.len() > RESUME_PLAN_LIMIT {
            return Ok(None);
        }
        Ok(Some(plan))
    }

    /// Recursively map `root`'s files to their sizes, keyed by path relative to
    /// `root`. Returns false when the tree could not be trusted (unreadable, or
    /// larger than [`RESUME_MAX_ENTRIES`]), which downgrades the caller to a
    /// full re-send.
    fn remote_tree_sizes(
        &self,
        ssh: &SshConnectionInfo,
        root: &str,
        files: &mut HashMap<String, u64>,
        dirs: &mut HashSet<String>,
    ) -> Result<bool, String> {
        // (absolute path, path relative to root)
        let mut queue: Vec<(String, String)> = vec![(root.to_string(), String::new())];
        let mut visited = 0usize;
        while let Some((abs, rel)) = queue.pop() {
            let listing = match self.list_dir_raw(ssh, &abs) {
                Ok(l) => l,
                Err(e) if is_connection_error(&e) => return Err(e),
                Err(_) => return Ok(false),
            };
            for e in listing.entries {
                visited += 1;
                if visited > RESUME_MAX_ENTRIES {
                    return Ok(false);
                }
                let child_rel = if rel.is_empty() {
                    e.name.clone()
                } else {
                    format!("{}/{}", rel, e.name)
                };
                if e.is_dir && !e.is_symlink {
                    dirs.insert(child_rel.clone());
                    queue.push((join_remote(&abs, &e.name), child_rel));
                } else if !e.is_symlink {
                    // Symlinks are skipped on the way up too (see
                    // `walk_local_tree`), so they never enter the comparison.
                    files.insert(child_rel, e.size);
                }
            }
        }
        Ok(true)
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

    // ---- interactive session lane (Windows / no multiplexing) ----

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

impl Drop for SftpService {
    fn drop(&mut self) {
        self.shutdown_all();
    }
}

// ---- interactive session ----

/// Poison-tolerant lock: a panicking worker must never brick the pool.
fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    match m.lock() {
        Ok(g) => g,
        Err(p) => p.into_inner(),
    }
}

enum PendingPrompt {
    Password,
    Passphrase,
    Verification,
    HostKey,
}

/// Recognise the interactive `sftp>` prompt. It is printed without a trailing
/// newline, so it always sits alone in the pending buffer.
fn is_sftp_prompt(pending: &str) -> bool {
    pending.trim_end() == "sftp>"
}

fn classify_pending_prompt(pending: &str) -> Option<PendingPrompt> {
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
    fn spawn(ssh: &SshConnectionInfo) -> Result<Self, String> {
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

    fn is_alive(&self) -> bool {
        matches!(self.pty.try_wait(), Ok(None))
    }

    fn close(self) {
        let _ = self.pty.write(b"bye\n");
        let _ = self.pty.kill();
    }

    fn write_raw(&self, s: &str) -> Result<(), String> {
        self.pty
            .write(s.as_bytes())
            .map(|_| ())
            .map_err(|e| format!("写入 sftp 会话失败: {}", e))
    }

    fn send(&mut self, cmd: &str) -> Result<(), String> {
        self.pending.clear();
        self.write_raw(&format!("{}\n", cmd))
    }

    fn note(&mut self, line: &str) {
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

    fn flush_line(&mut self, progress: Option<&ProgressCtx>, collected: &mut String) {
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
    fn pump(
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
fn interactive_error(output: &str, cmd: &str) -> Option<String> {
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

/// Commands that operate on relative paths need the session's cwd pinned to the
/// start directory first — a pooled interactive session remembers the last
/// `cd`, a fresh `sftp -b` run does not.
fn reset_cwd_prefix(paths: &[&str]) -> Vec<String> {
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
fn is_absolute_remote(p: &str) -> bool {
    let t = p.trim();
    if t.starts_with('/') || t.starts_with('\\') {
        return true;
    }
    let b = t.as_bytes();
    b.len() >= 3 && b[0].is_ascii_alphabetic() && b[1] == b':' && (b[2] == b'/' || b[2] == b'\\')
}

// ---- child locale ----

/// Environment overlay that keeps non-ASCII file names intact.
///
/// OpenSSH prints its listing through `mprintf`, which escapes every byte it
/// cannot decode under the current `LC_CTYPE` into `\NNN` octal. A desktop app
/// is precisely the process that trips this: macOS launches app bundles from
/// Finder without `LANG` at all, so `中文.txt` arrives as
/// `\344\270\255\346\226\207.txt`. That is not merely ugly — every follow-up
/// get/rm/rename/chmod is addressed by the name we read back, so the escaped
/// form silently points at a path that does not exist.
///
/// It cannot be repaired in the parser either: a *literal* backslash is left
/// alone by OpenSSH, which makes a real `back\344slash.txt` indistinguishable
/// from an escaped name. Decoding would corrupt the legitimate file. Handing
/// the child a UTF-8 `LC_CTYPE` is the only correct place to fix it.
///
/// `LC_TIME=C` pins English month names for the rare server that formats the
/// listing itself, and an empty `LC_ALL` is the POSIX way to say "ignore me",
/// which lets those two categories through even when the parent exported it.
fn locale_env() -> Vec<(String, String)> {
    // Win32-OpenSSH never consults POSIX locale variables — the MSVC runtime
    // resolves the code page from the OS — so setting them would be noise.
    if cfg!(target_os = "windows") {
        return Vec::new();
    }
    vec![
        ("LC_ALL".to_string(), String::new()),
        ("LC_CTYPE".to_string(), utf8_locale()),
        ("LC_TIME".to_string(), "C".to_string()),
        // 密码提示本地化：OpenSSH 在中文 locale 下显示 "user@host 的密码："，
        // 会让只匹配英文 "password:" 的自动喂密码逻辑漏检。LC_MESSAGES=C
        // 强制英文提示，与 pty::build_ssh_command 保持一致。
        ("LC_MESSAGES".to_string(), "C".to_string()),
    ]
}

/// Pick a UTF-8 locale that actually exists here, resolved once per process.
///
/// Naming an absent locale is worse than naming none: `setlocale` fails, the
/// child falls back to `C`, and the names are escaped again. So an inherited
/// value wins whenever it is already UTF-8, and every other candidate is
/// checked against `locale -a` before we commit to it.
fn utf8_locale() -> String {
    static CACHE: OnceLock<String> = OnceLock::new();
    CACHE
        .get_or_init(|| {
            for key in ["LC_ALL", "LC_CTYPE", "LANG"] {
                if let Ok(v) = std::env::var(key) {
                    if is_utf8_locale(&v) {
                        return v;
                    }
                }
            }
            let installed = installed_locales();
            for want in ["C.UTF-8", "C.utf8", "en_US.UTF-8", "en_US.utf8"] {
                if installed.iter().any(|l| l == want) {
                    return want.to_string();
                }
            }
            if let Some(any) = installed.iter().find(|l| is_utf8_locale(l)) {
                return any.clone();
            }
            // Nothing to verify against: musl images ship no `locale` binary
            // and treat every locale as UTF-8, so this is the right guess.
            "C.UTF-8".to_string()
        })
        .clone()
}

fn is_utf8_locale(v: &str) -> bool {
    let l = v.to_ascii_lowercase();
    l.ends_with("utf-8") || l.ends_with("utf8")
}

fn installed_locales() -> Vec<String> {
    match Command::new("locale").arg("-a").output() {
        Ok(out) if out.status.success() => String::from_utf8_lossy(&out.stdout)
            .lines()
            .map(|l| l.trim().to_string())
            .filter(|l| !l.is_empty())
            .collect(),
        _ => Vec::new(),
    }
}

/// Spawn an sftp child on a pty with the locale overlay applied.
///
/// `extra` carries the caller's own variables (the `TERM` the transfer meter
/// or the interactive prompt needs); the locale pairs are appended so they
/// cannot be dropped by accident at a call site.
fn spawn_sftp_pty(
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

// ---- process helpers ----

fn pool_key(ssh: &SshConnectionInfo, lane: &str) -> String {
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
fn bracket_host(host: &str) -> String {
    let h = host.trim();
    if h.contains(':') && !h.starts_with('[') {
        format!("[{}]", h)
    } else {
        h.to_string()
    }
}

/// `user@host` target accepted by both `sftp` and `ssh`.
fn ssh_target(ssh: &SshConnectionInfo) -> String {
    format!("{}@{}", ssh.username, bracket_host(&ssh.host))
}

/// Keepalive so a long transfer survives NAT/firewall idle timeouts instead of
/// dying with "Connection closed" halfway through a multi-gigabyte file.
fn keepalive_args(args: &mut Vec<String>) {
    args.push("-o".to_string());
    args.push("ServerAliveInterval=20".to_string());
    args.push("-o".to_string());
    args.push("ServerAliveCountMax=6".to_string());
}

/// Arguments shared by every sftp invocation.
fn base_sftp_args(ssh: &SshConnectionInfo, batch_file: &str) -> Vec<String> {
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
fn run_sftp_process(
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

fn run_sftp_with_progress(
    bin: &str,
    args: &[String],
    ctx: &ProgressCtx,
) -> Result<String, String> {
    let pty = spawn_sftp_pty(bin, args, 200, &[("TERM", "xterm-256color")])?;
    drive_transfer_pty(&pty, ctx)
}

/// Read a transfer to completion, forwarding progress ticks as they arrive.
fn drive_transfer_pty(pty: &Pty, ctx: &ProgressCtx) -> Result<String, String> {
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

fn handle_transfer_line(line: &str, ctx: &ProgressCtx, collected: &mut String) {
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
fn local_tree_totals(paths: &[String]) -> (u64, u32) {
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

fn parse_progress_line(line: &str) -> Option<(String, u8, String, String, String)> {
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
fn parse_meter_bytes(token: &str) -> Option<u64> {
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

fn shutdown_master(master: &PooledMaster, ssh: &SshConnectionInfo) {
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

fn classify_master_failure(diag: &str, child_exited: bool, prompt_no_password: bool) -> String {
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
fn is_connection_error(msg: &str) -> bool {
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
fn is_permission_error(msg: &str) -> bool {
    let low = msg.to_lowercase();
    low.contains("permission denied") || low.contains("无写权限") || low.contains("权限不足")
}


/// Turn raw sftp stderr into something a human can act on.
fn friendly_sftp_error(stderr: &str, stdout: &str) -> String {
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

// ---- path helpers ----

fn unique_temp_path(prefix: &str) -> String {
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

fn write_temp_batch(lines: &[String]) -> Result<PathBuf, String> {
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
fn sftp_quote(p: &str) -> String {
    let escaped = p.replace('\\', "\\\\").replace('"', "\\\"");
    format!("\"{}\"", escaped)
}

/// The batch a resumed upload expands into.
#[derive(Default, Debug)]
struct UploadPlan {
    /// `-mkdir` lines, parents before children.
    mkdirs: Vec<String>,
    /// `put` / `put -a` lines for the files that still have to move.
    puts: Vec<String>,
    /// Files the far side already holds at full length.
    skipped: usize,
}

impl UploadPlan {
    fn len(&self) -> usize {
        self.mkdirs.len() + self.puts.len()
    }

    /// True when the remote copy is already complete.
    fn is_noop(&self) -> bool {
        self.mkdirs.is_empty() && self.puts.is_empty()
    }

    /// Decide the verb for one file.
    ///
    /// Equal sizes are taken as "already there". That is the same assumption
    /// every resume implementation makes — the alternative is hashing both
    /// sides, which costs more than re-sending the file.
    fn push_file(&mut self, local: &str, remote: &str, local_size: u64, remote_size: Option<u64>) {
        match remote_size {
            Some(done) if done == local_size => {
                self.skipped += 1;
            }
            Some(done) if done < local_size => {
                self.puts.push(format!(
                    "put -a {} {}",
                    sftp_quote(local),
                    sftp_quote(remote)
                ));
            }
            // Absent, or longer than the source (a leftover from a different
            // file): send it whole. `put -a` would refuse both cases outright.
            _ => {
                self.puts
                    .push(format!("put {} {}", sftp_quote(local), sftp_quote(remote)));
            }
        }
    }
}

/// A local directory flattened into paths relative to its root.
#[derive(Default, Debug)]
struct LocalTree {
    /// Sub-directories, parents before children.
    dirs: Vec<String>,
    /// Regular files and their sizes.
    files: Vec<(String, u64)>,
}

/// Walk a local directory the way `put -r` does.
///
/// Only regular files travel: OpenSSH's recursive upload reports anything else
/// as "skipping non-regular file", symlinks included, so counting them here
/// would plan transfers that never happen. `read_dir` does not follow links,
/// which also makes the walk loop-proof.
///
/// Returns `None` on an I/O error or a tree bigger than
/// [`RESUME_MAX_ENTRIES`]; the caller then falls back to a full recursive put.
fn walk_local_tree(root: &Path) -> Option<LocalTree> {
    let mut tree = LocalTree::default();
    // Breadth first, so a parent is always listed before its children and the
    // `-mkdir` lines come out in a creatable order.
    let mut queue: Vec<(PathBuf, String)> = vec![(root.to_path_buf(), String::new())];
    let mut head = 0usize;
    let mut visited = 0usize;

    while head < queue.len() {
        let (dir, rel) = queue[head].clone();
        head += 1;
        let mut children: Vec<(String, std::fs::FileType, u64)> = Vec::new();
        for entry in std::fs::read_dir(&dir).ok()? {
            let entry = entry.ok()?;
            let ft = entry.file_type().ok()?;
            let size = if ft.is_file() {
                entry.metadata().map(|m| m.len()).unwrap_or(0)
            } else {
                0
            };
            children.push((entry.file_name().to_string_lossy().to_string(), ft, size));
        }
        // Deterministic order keeps the batch reproducible and the progress
        // meter's file sequence stable across attempts.
        children.sort_by(|a, b| a.0.cmp(&b.0));

        for (name, ft, size) in children {
            visited += 1;
            if visited > RESUME_MAX_ENTRIES {
                return None;
            }
            let child_rel = if rel.is_empty() {
                name.clone()
            } else {
                format!("{}/{}", rel, name)
            };
            if ft.is_dir() {
                tree.dirs.push(child_rel.clone());
                queue.push((dir.join(&name), child_rel));
            } else if ft.is_file() {
                tree.files.push((child_rel, size));
            }
        }
    }
    Some(tree)
}

/// `cd` into a remote directory, or back to the login directory for ".".
///
/// A bare `cd` is what keeps a pooled interactive session stateless — see
/// `list_dir_raw`.
fn cd_command(dir: &str) -> String {
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
fn merge_source(path: &str) -> String {
    let trimmed = path.trim_end_matches('/');
    if trimmed.is_empty() {
        // The path was "/" (or a run of slashes): the root itself.
        return "/.".to_string();
    }
    format!("{}/.", trimmed)
}

/// Windows local paths use backslashes, which the sftp tokenizer treats as
/// escapes. Windows accepts forward slashes everywhere, so normalise them.
fn normalize_local_path(p: &str) -> String {
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
fn normalize_octal_mode(mode: &str) -> Result<String, String> {
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
fn is_drive_root(p: &str) -> bool {
    let t = p.strip_prefix('/').unwrap_or(p);
    let b = t.as_bytes();
    b.len() == 3 && b[0].is_ascii_alphabetic() && b[1] == b':' && b[2] == b'/'
}

fn normalize_remote_dir(path: &str) -> String {
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

fn remote_basename(path: &str) -> String {
    path.trim_end_matches('/')
        .rsplit('/')
        .next()
        .unwrap_or(path)
        .to_string()
}

fn join_remote(base: &str, name: &str) -> String {
    if base == "." || base.is_empty() {
        name.to_string()
    } else if base.ends_with('/') {
        format!("{}{}", base, name)
    } else {
        format!("{}/{}", base, name)
    }
}


#[cfg(test)]
mod tests;
