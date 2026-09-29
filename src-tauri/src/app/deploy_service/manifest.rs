use super::*;

/// 遍历本地目录生成文件清单（相对路径 + 大小 + mtime）
pub(crate) fn build_manifest(dir: &Path) -> Vec<ManifestEntry> {
    let mut entries = Vec::new();
    fn walk(p: &Path, base: &Path, entries: &mut Vec<ManifestEntry>) {
        if let Ok(meta) = std::fs::metadata(p) {
            if meta.is_file() {
                let rel = p.strip_prefix(base)
                    .map(|r| r.to_string_lossy().replace('\\', "/"))
                    .unwrap_or_else(|_| p.to_string_lossy().to_string());
                let mtime_ms = meta.modified().ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as i64);
                entries.push(ManifestEntry {
                    path: rel,
                    size: meta.len(),
                    mtime_ms,
                });
            } else if meta.is_dir() {
                if let Ok(read_dir) = std::fs::read_dir(p) {
                    for entry in read_dir.flatten() {
                        walk(&entry.path(), base, entries);
                    }
                }
            }
        }
    }
    walk(dir, dir, &mut entries);
    entries.sort_by(|a, b| a.path.cmp(&b.path));
    entries
}

/// 计算本地 dist 与远端上一版本(current/dist) 的文件数+总大小是否一致。
/// 一致说明前端没有变化，可跳过 SFTP 全量上传，直接在远端硬链接上一版 dist，
/// 大幅加速重部署；不一致才走正常全量上传（不会漏传）。
pub(crate) fn dist_unchanged(
    ssh: &SshConnectionInfo,
    remote: &str,
    dist_local: &Path,
) -> bool {
    let (lf, lb) = local_stats(&[dist_local.to_path_buf()]);
    if lf == 0 {
        return false; // 本地 dist 为空，没东西可比，走正常上传
    }
    let remote_current = format!("{}/current/dist", remote);
    let stat_cmd = format!(
        "test -d '{}' && \
         find '{}' -type f | wc -l && \
         du -sb '{}' | cut -f1",
        remote_current, remote_current, remote_current
    );
    let out = match run_ssh_command_with_timeout(ssh, &stat_cmd, 15) {
        Ok(o) => o,
        Err(_) => return false,
    };
    let parts: Vec<&str> = out.lines().map(|l| l.trim()).filter(|l| !l.is_empty()).collect();
    if parts.len() < 2 {
        return false; // current/dist 不存在或无法统计
    }
    let rf: u64 = parts[0].parse().unwrap_or(0);
    let rb: u64 = parts[1].parse().unwrap_or(0);
    rf == lf && rb == lb
}

/// 统计本地待上传产物的文件数与总字节数（目录递归）。
pub(crate) fn local_stats(paths: &[PathBuf]) -> (u64, u64) {
    let mut files = 0u64;
    let mut bytes = 0u64;
    fn walk(p: &Path, files: &mut u64, bytes: &mut u64) {
        if let Ok(meta) = std::fs::metadata(p) {
            if meta.is_file() {
                *files += 1;
                *bytes += meta.len();
            } else if meta.is_dir() {
                if let Ok(entries) = std::fs::read_dir(p) {
                    for entry in entries.flatten() {
                        walk(&entry.path(), files, bytes);
                    }
                }
            }
        }
    }
    for p in paths {
        walk(p, &mut files, &mut bytes);
    }
    (files, bytes)
}
