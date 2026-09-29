//! 增量构建缓存（见 ssg-engine-design.md §5）。
//! 缓存文件 .webcraft/build-cache.json 记录每条内容的哈希与产物路径，
//! 未变化内容可跳过重新渲染（FR-B3）。

use std::collections::BTreeMap;
use std::path::Path;

use crate::core::error::{Error, Result};

use super::config::BuildConfig;
use super::views::{PageView, PostView};

/// 构建缓存（增量构建指纹，见 ssg-engine-design.md §5）。
/// key = "post:<slug>" / "page:<slug>"，hash = 内容 content_hash（SHA-256）。
#[derive(Debug, Clone, serde::Deserialize)]
pub(super) struct BuildCache {
    pub(super) engine_version: u32,
    pub(super) posts_per_page: usize,
    pub(super) entries: BTreeMap<String, CacheEntry>,
}

#[derive(Debug, Clone, serde::Deserialize)]
pub(super) struct CacheEntry {
    pub(super) hash: String,
    pub(super) outputs: Vec<String>,
}

fn cache_path(workdir: &str) -> std::path::PathBuf {
    Path::new(workdir).join(".webcraft").join("build-cache.json")
}

pub(super) fn read_build_cache(workdir: &str) -> Option<BuildCache> {
    let path = cache_path(workdir);
    let raw = std::fs::read_to_string(&path).ok()?;
    serde_json::from_str(&raw).ok()
}

/// 写入 .webcraft/build-cache.json（增量构建指纹）。
pub(super) fn write_build_cache(
    workdir: &str,
    cfg: &BuildConfig,
    posts: &[PostView],
    pages: &[PageView],
    hashes: &BTreeMap<String, String>,
) -> Result<()> {
    let cache_dir = Path::new(workdir).join(".webcraft");
    std::fs::create_dir_all(&cache_dir).map_err(|e| Error::Cms(format!("创建缓存目录失败: {}", e)))?;
    let mut entries = serde_json::Map::new();
    for p in posts {
        entries.insert(
            format!("post:{}", p.slug),
            serde_json::json!({
                "hash": hashes.get(&format!("post:{}", p.slug)).map(|s| s.as_str()).unwrap_or(""),
                "outputs": [format!("posts/{}/index.html", p.slug)],
            }),
        );
    }
    for p in pages {
        // slug=index/home 的 page 输出到首页 index.html 而非 pages/index/
        let outputs: Vec<String> = if p.slug == "index" || p.slug == "home" {
            vec!["index.html".to_string()]
        } else {
            vec![format!("pages/{}/index.html", p.slug)]
        };
        entries.insert(
            format!("page:{}", p.slug),
            serde_json::json!({
                "hash": hashes.get(&format!("page:{}", p.slug)).map(|s| s.as_str()).unwrap_or(""),
                "outputs": outputs,
            }),
        );
    }
    let cache = serde_json::json!({
        "engine_version": 1,
        "posts_per_page": cfg.posts_per_page,
        "entries": entries,
    });
    let path = cache_dir.join("build-cache.json");
    std::fs::write(&path, serde_json::to_string_pretty(&cache).unwrap_or_default())
        .map_err(|e| Error::Cms(format!("写入构建缓存失败: {}", e)))?;
    Ok(())
}