//! Directory listing (`list_dir` / `list_dirs` / raw `ls` parsing).

use crate::core::types::SshConnectionInfo;
use super::*;

impl SftpService {
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
    pub(crate) fn list_dirs_fallback(
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
    pub(crate) fn list_dir_raw(
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
}
