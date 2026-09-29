//! Upload plan construction and local tree walking.

use std::path::Path;
use std::path::PathBuf;
use super::*;

/// Ceiling on the number of batch lines a resumed upload may expand into.
///
/// Only files that still have to move end up in the plan, so a transfer that
/// died near the end produces a handful of lines. A plan that blows past this
/// means barely anything got through, and re-sending the tree in one recursive
/// `put` is both correct and cheaper than typing thousands of commands into an
/// interactive Windows session.
pub(crate) const RESUME_PLAN_LIMIT: usize = 2_000;

/// Guard against symlink loops and pathological trees while planning.
pub(crate) const RESUME_MAX_ENTRIES: usize = 20_000;

/// The batch a resumed upload expands into.
#[derive(Default, Debug)]
pub(crate) struct UploadPlan {
    /// `-mkdir` lines, parents before children.
    pub(crate) mkdirs: Vec<String>,
    /// `put` / `put -a` lines for the files that still have to move.
    pub(crate) puts: Vec<String>,
    /// Files the far side already holds at full length.
    pub(crate) skipped: usize,
}

impl UploadPlan {
    pub(crate) fn len(&self) -> usize {
        self.mkdirs.len() + self.puts.len()
    }

    /// True when the remote copy is already complete.
    pub(crate) fn is_noop(&self) -> bool {
        self.mkdirs.is_empty() && self.puts.is_empty()
    }

    /// Decide the verb for one file.
    ///
    /// Equal sizes are taken as "already there". That is the same assumption
    /// every resume implementation makes — the alternative is hashing both
    /// sides, which costs more than re-sending the file.
    pub(crate) fn push_file(&mut self, local: &str, remote: &str, local_size: u64, remote_size: Option<u64>) {
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
pub(crate) struct LocalTree {
    /// Sub-directories, parents before children.
    pub(crate) dirs: Vec<String>,
    /// Regular files and their sizes.
    pub(crate) files: Vec<(String, u64)>,
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
pub(crate) fn walk_local_tree(root: &Path) -> Option<LocalTree> {
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
