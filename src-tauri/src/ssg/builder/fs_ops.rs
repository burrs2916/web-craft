//! 构建产物文件系统操作：dist-new → dist 原子交换、媒体目录递归复制。

use std::path::Path;

use crate::core::error::{Error, Result};

/// 原子交换：dist → dist-old，dist-new → dist，成功后清理 dist-old；
/// 第二步失败时回滚，保证旧产物不丢。
pub(super) fn atomic_swap(dist_new: &Path, dist_dir: &Path) -> Result<()> {
    let old = dist_dir.with_extension("old");
    if dist_dir.exists() {
        if old.exists() {
            std::fs::remove_dir_all(&old).map_err(|e| Error::Cms(format!("清理 {} 失败: {}", old.display(), e)))?;
        }
        std::fs::rename(dist_dir, &old).map_err(|e| Error::Cms(format!("交换产物失败: {}", e)))?;
    }
    if let Err(e) = std::fs::rename(dist_new, dist_dir) {
        if old.exists() {
            let _ = std::fs::rename(&old, dist_dir);
        }
        return Err(Error::Cms(format!("产物就位失败: {}", e)));
    }
    if old.exists() {
        let _ = std::fs::remove_dir_all(&old);
    }
    Ok(())
}

/// 递归复制媒体目录，返回复制的文件数量。
/// 仅复制文件，保留目录结构；跳过以 `.` 开头的隐藏文件/目录。
pub(super) fn copy_media_dir(src: &Path, dest: &Path) -> Result<usize> {
    if !src.is_dir() {
        return Ok(0);
    }
    std::fs::create_dir_all(dest)
        .map_err(|e| Error::Cms(format!("创建媒体目标目录失败: {}", e)))?;

    let mut count = 0usize;
    for entry in std::fs::read_dir(src)
        .map_err(|e| Error::Cms(format!("读取媒体目录失败: {}", e)))?
    {
        let entry = entry.map_err(|e| Error::Cms(format!("读取媒体目录项失败: {}", e)))?;
        let file_name = entry.file_name();
        let name_str = file_name.to_string_lossy();
        // 跳过隐藏文件
        if name_str.starts_with('.') {
            continue;
        }
        let path = entry.path();
        let dest_path = dest.join(&file_name);
        if path.is_dir() {
            count += copy_media_dir(&path, &dest_path)?;
        } else if path.is_file() {
            std::fs::copy(&path, &dest_path)
                .map_err(|e| Error::Cms(format!("复制媒体文件失败: {}", e)))?;
            count += 1;
        }
    }
    Ok(count)
}