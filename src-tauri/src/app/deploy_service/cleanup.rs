use super::*;

impl DeployService {
    /// 清理旧版本，保留最近 N 个
    pub(crate) fn cleanup_old_releases(ssh: &SshConnectionInfo, remote_path: &str, keep: usize) -> Result<usize> {
        let releases_dir = format!("{}/releases", remote_path);

        // 列出所有版本目录（按名称排序，新的在后）
        let list_raw = run_ssh_command_with_timeout(
            ssh,
            &format!("ls -1 '{}' 2>/dev/null | sort", releases_dir),
            10,
        ).unwrap_or_default();

        let releases: Vec<&str> = list_raw.lines()
            .filter(|l| !l.trim().is_empty())
            .collect();

        if releases.len() <= keep {
            return Ok(0);
        }

        let to_remove = &releases[..releases.len() - keep];
        let mut removed = 0;

        for rel in to_remove {
            let _ = run_ssh_command_with_timeout(
                ssh,
                &format!("rm -rf '{}/{}'", releases_dir, rel),
                15,
            );
            removed += 1;
        }

        Ok(removed)
    }
}
