//! Upload / download and resume planning.

use std::collections::HashMap;
use std::collections::HashSet;
use std::path::Path;
use crate::core::types::SshConnectionInfo;
use super::*;

impl SftpService {
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
    pub(crate) fn exec_upload_auto_chmod(
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
    pub(crate) fn ensure_dir_writable(
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

    /// Recursively collect files and directories below `root` (deepest first)
    /// so a directory can be deleted with plain `rm`/`rmdir` verbs.
    pub(crate) fn collect_tree(
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
    pub(crate) fn plan_resume_upload(
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
    pub(crate) fn remote_tree_sizes(
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
}
