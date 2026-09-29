//! Remote file operations and connection lifecycle.

use std::sync::Arc;
use crate::core::types::SshConnectionInfo;
use crate::domain::terminal::pty::Pty;
use super::*;

impl SftpService {
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
    pub(crate) fn claim_transfer(&self, progress: Option<&ProgressCtx>) -> Option<TransferSlot<'_>> {
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

    pub(crate) fn register_running(&self, transfer_id: &str, pty: Arc<Pty>) {
        lock(&self.running).insert(transfer_id.to_string(), pty);
    }

    pub(crate) fn unregister_running(&self, transfer_id: &str) {
        lock(&self.running).remove(transfer_id);
    }

    /// Non-consuming on purpose: `exec` may loop once more after a dropped
    /// connection, and a verdict that erased itself on the first read would
    /// let that retry resurrect a transfer the user aborted. The claim slot
    /// clears it when the operation ends.
    pub(crate) fn cancel_requested(&self, progress: Option<&ProgressCtx>) -> bool {
        match progress {
            Some(ctx) => lock(&self.cancelled).contains(&ctx.transfer_id),
            None => false,
        }
    }
}
