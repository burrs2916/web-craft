use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use chrono::Datelike;
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::core::error::{Error, Result};
use crate::core::types::MediaAsset;
use crate::infra::storage::database::Database;
use crate::infra::storage::media_repo::MediaRepo;
use crate::infra::storage::site_repo::SiteRepo;

/// 缩略图最长边（像素）。
const THUMB_MAX_SIDE: u32 = 400;

/// 单文件大小上限（50MB）。
const MAX_FILE_SIZE: u64 = 50 * 1024 * 1024;

/// 支持的图片 MIME（可生成缩略图、读取尺寸）。
const IMAGE_MIMES: &[&str] = &[
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
];

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// 从扩展名推断 MIME type（轻量，无需额外依赖）。
fn guess_mime(filename: &str) -> String {
    let lower = filename.to_ascii_lowercase();
    let ext = lower.rsplit('.').next().unwrap_or("");
    match ext {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "pdf" => "application/pdf",
        "zip" => "application/zip",
        "md" | "markdown" => "text/markdown",
        "txt" => "text/plain",
        "json" => "application/json",
        "css" => "text/css",
        "js" => "application/javascript",
        "html" => "text/html",
        _ => "application/octet-stream",
    }
    .to_string()
}

/// 计算文件的 SHA-256 哈希（hex）。
fn file_hash(path: &Path) -> Result<String> {
    use std::io::Read;
    let mut file = std::fs::File::open(path)
        .map_err(|e| Error::Internal(format!("open file for hash: {e}")))?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 64 * 1024];
    loop {
        let n = file
            .read(&mut buf)
            .map_err(|e| Error::Internal(format!("read file for hash: {e}")))?;
        if n == 0 { break; }
        hasher.update(&buf[..n]);
    }
    Ok(hex::encode(hasher.finalize()))
}

/// YYYY/MM 子目录（基于当前 UTC 月份）。
fn year_month_dir() -> String {
    let now = chrono::Utc::now();
    format!("{:04}/{:02}", now.year(), now.month())
}

/// 生成缩略图，返回缩略图相对路径；非图片或生成失败返回 None。
fn generate_thumbnail(
    source_path: &Path,
    mime: &str,
    media_dir: &Path,
    hash_hex: &str,
    ext: &str,
) -> Option<String> {
    if !IMAGE_MIMES.contains(&mime) {
        return None;
    }
    let img = image::open(source_path).ok()?;
    let thumb = img.thumbnail(THUMB_MAX_SIDE, THUMB_MAX_SIDE);

    let thumb_filename = format!("{hash_hex}_thumb.{ext}");
    let thumb_path = media_dir.join(&thumb_filename);
    if let Some(parent) = thumb_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    thumb.save(&thumb_path).ok()?;

    // 相对站点工作目录的路径：media/YYYY/MM/<hash>_thumb.<ext>
    let rel = format!("media/{}/{thumb_filename}", year_month_dir());
    Some(rel)
}

pub struct MediaService;

impl MediaService {
    /// 上传单个文件到站点媒体库。
    /// 若同站点同哈希已存在，则秒传返回已有记录（不重复存文件）。
    pub fn upload_file(
        db: &Database,
        site_id: &str,
        source_path: &Path,
        original_filename: &str,
    ) -> Result<MediaAsset> {
        let site = SiteRepo::get_by_id(db, site_id)?
            .ok_or_else(|| Error::Cms(format!("site {site_id} not found")))?;

        // 校验文件大小
        let metadata = std::fs::metadata(source_path)
            .map_err(|e| Error::Internal(format!("stat source file: {e}")))?;
        if metadata.len() > MAX_FILE_SIZE {
            return Err(Error::Validation(format!(
                "file too large: {} bytes (max {MAX_FILE_SIZE})",
                metadata.len()
            )));
        }

        // 计算哈希
        let hash_hex = file_hash(source_path)?;

        // 秒传：同站点同哈希直接返回
        if let Some(existing) = MediaRepo::find_by_hash(db, site_id, &hash_hex)? {
            return Ok(existing);
        }

        let mime = guess_mime(original_filename);
        let ext = original_filename
            .rsplit('.')
            .next()
            .unwrap_or("bin")
            .to_ascii_lowercase();

        // 目标目录：<workdir>/media/YYYY/MM/
        // local_workdir 为空时提示先绑定网站
        let workdir_str = site.local_workdir.trim();
        if workdir_str.is_empty() {
            return Err(Error::Cms(
                "站点尚未绑定网站，本地工作目录为空（请先在站点详情页绑定已发布网站）".into(),
            ));
        }
        let workdir = PathBuf::from(workdir_str);
        let ym = year_month_dir();
        let media_dir = workdir.join("media").join(&ym);
        std::fs::create_dir_all(&media_dir)
            .map_err(|e| Error::Internal(format!("create media dir: {e}")))?;

        let dest_filename = format!("{hash_hex}.{ext}");
        let dest_path = media_dir.join(&dest_filename);

        // 目标文件已存在（同哈希不同上传并发）则直接复用
        if !dest_path.exists() {
            std::fs::copy(source_path, &dest_path)
                .map_err(|e| Error::Internal(format!("copy file to media: {e}")))?;
        }

        let storage_rel = format!("media/{ym}/{dest_filename}");

        // 读取图片尺寸 + 生成缩略图
        let (width, height, thumb_path) = if IMAGE_MIMES.contains(&mime.as_str()) {
            match image::image_dimensions(&dest_path) {
                Ok((w, h)) => {
                    let thumb = generate_thumbnail(
                        &dest_path,
                        &mime,
                        &media_dir,
                        &hash_hex,
                        &ext,
                    );
                    (Some(w as i32), Some(h as i32), thumb)
                }
                Err(_) => (None, None, None),
            }
        } else {
            (None, None, None)
        };

        let asset = MediaAsset {
            id: Uuid::new_v4().to_string(),
            site_id: site_id.to_string(),
            filename: original_filename.to_string(),
            storage_path: storage_rel,
            mime_type: mime,
            size_bytes: metadata.len() as i64,
            width,
            height,
            file_hash: hash_hex,
            thumb_path,
            created_at: now_ms(),
        };

        MediaRepo::insert(db, &asset)?;
        Ok(asset)
    }

    /// 列出站点媒体资源（按创建时间倒序，分页）。
    pub fn list(
        db: &Database,
        site_id: &str,
        limit: i64,
        offset: i64,
    ) -> Result<(Vec<MediaAsset>, i64)> {
        // 校验站点存在
        SiteRepo::get_by_id(db, site_id)?
            .ok_or_else(|| Error::Cms(format!("site {site_id} not found")))?;

        let items = MediaRepo::list(db, site_id, limit, offset)?;
        let total = MediaRepo::count(db, site_id)?;
        Ok((items, total))
    }

    /// 根据 ID 获取单个媒体资产。
    pub fn get_by_id(db: &Database, asset_id: &str) -> Result<Option<MediaAsset>> {
        MediaRepo::get_by_id(db, asset_id)
    }

    /// 删除媒体资源：同时删除数据库记录和物理文件（含缩略图）。
    pub fn delete(db: &Database, site_id: &str, asset_id: &str) -> Result<()> {
        let site = SiteRepo::get_by_id(db, site_id)?
            .ok_or_else(|| Error::Cms(format!("site {site_id} not found")))?;

        let asset = MediaRepo::get_by_id(db, asset_id)?
            .ok_or_else(|| Error::Cms(format!("media asset {asset_id} not found")))?;

        if asset.site_id != site_id {
            return Err(Error::Validation("asset does not belong to site".into()));
        }

        let workdir_str = site.local_workdir.trim();
        if workdir_str.is_empty() {
            return Err(Error::Cms(
                "站点尚未绑定网站，本地工作目录为空".into(),
            ));
        }
        let workdir = PathBuf::from(workdir_str);

        // 删除主文件
        let main_path = workdir.join(&asset.storage_path);
        if main_path.exists() {
            let _ = std::fs::remove_file(&main_path);
        }

        // 删除缩略图
        if let Some(thumb) = &asset.thumb_path {
            let thumb_path = workdir.join(thumb);
            if thumb_path.exists() {
                let _ = std::fs::remove_file(&thumb_path);
            }
        }

        // 尝试清理空的年月目录（从最内层向上）
        if let Some(parent) = main_path.parent() {
            let _ = Self::cleanup_empty_dirs(parent, &workdir.join("media"));
        }

        MediaRepo::delete(db, asset_id)?;
        Ok(())
    }

    /// 自底向上删除空目录，直到遇到非空目录或 media 根目录。
    fn cleanup_empty_dirs(dir: &Path, stop_at: &Path) {
        let mut current = Some(dir);
        while let Some(d) = current {
            if d == stop_at || !d.starts_with(stop_at) {
                break;
            }
            match std::fs::read_dir(d) {
                Ok(mut entries) => {
                    if entries.next().is_some() {
                        break; // 非空，停止
                    }
                    let _ = std::fs::remove_dir(d);
                }
                Err(_) => break,
            }
            current = d.parent();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infra::storage::migrations;
    use std::sync::atomic::{AtomicU32, Ordering};

    fn test_db() -> Database {
        let mut conn = rusqlite::Connection::open_in_memory().unwrap();
        migrations::run_migrations(&mut conn).unwrap();
        Database::from_connection(conn)
    }

    fn unique_temp_dir() -> std::path::PathBuf {
        static COUNTER: AtomicU32 = AtomicU32::new(0);
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("wc_media_test_{}_{}", std::process::id(), n));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn setup(workdir: &std::path::Path) -> Database {
        let db = test_db();
        db.conn()
            .execute(
                "INSERT INTO sites (id, name, local_workdir, created_at, updated_at) \
                 VALUES ('site-a', 'A', ?1, 1, 1)",
                [workdir.to_string_lossy().as_ref()],
            )
            .unwrap();
        db
    }

    /// 用 image crate 生成一张 10x10 的测试 JPEG。
    fn create_test_jpeg(path: &Path) {
        let img = image::RgbImage::from_pixel(10, 10, image::Rgb([255, 0, 0]));
        img.save_with_format(path, image::ImageFormat::Jpeg).unwrap();
    }

    #[test]
    fn upload_image_with_thumb_and_dedup() {
        let tmp = unique_temp_dir();
        let db = setup(&tmp);

        let src = tmp.join("upload.jpg");
        create_test_jpeg(&src);

        let asset = MediaService::upload_file(&db, "site-a", &src, "photo.jpg").unwrap();
        assert_eq!(asset.filename, "photo.jpg");
        assert!(asset.width.is_some());
        assert!(asset.height.is_some());
        assert!(asset.thumb_path.is_some());
        assert!(asset.storage_path.starts_with("media/"));

        // 物理文件存在
        assert!(tmp.join(&asset.storage_path).exists());
        assert!(tmp.join(asset.thumb_path.as_ref().unwrap()).exists());

        // 秒传：同文件再传一次，返回同一记录
        let asset2 = MediaService::upload_file(&db, "site-a", &src, "another.jpg").unwrap();
        assert_eq!(asset2.id, asset.id);
        assert_eq!(asset2.file_hash, asset.file_hash);

        // 列表
        let (items, total) = MediaService::list(&db, "site-a", 20, 0).unwrap();
        assert_eq!(total, 1);
        assert_eq!(items.len(), 1);

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn delete_removes_files_and_record() {
        let tmp = unique_temp_dir();
        let db = setup(&tmp);

        let src = tmp.join("upload.jpg");
        create_test_jpeg(&src);
        let asset = MediaService::upload_file(&db, "site-a", &src, "photo.jpg").unwrap();

        let main_path = tmp.join(&asset.storage_path);
        let thumb_path = tmp.join(asset.thumb_path.as_ref().unwrap());
        assert!(main_path.exists());
        assert!(thumb_path.exists());

        MediaService::delete(&db, "site-a", &asset.id).unwrap();
        assert!(!main_path.exists());
        assert!(!thumb_path.exists());
        assert_eq!(MediaRepo::count(&db, "site-a").unwrap(), 0);

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn non_image_file_no_thumb() {
        let tmp = unique_temp_dir();
        let db = setup(&tmp);

        let src = tmp.join("notes.txt");
        std::fs::write(&src, b"hello world").unwrap();

        let asset = MediaService::upload_file(&db, "site-a", &src, "notes.txt").unwrap();
        assert_eq!(asset.mime_type, "text/plain");
        assert!(asset.width.is_none());
        assert!(asset.height.is_none());
        assert!(asset.thumb_path.is_none());

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn site_not_found_returns_error() {
        let tmp = unique_temp_dir();
        let db = setup(&tmp);
        let src = tmp.join("a.txt");
        std::fs::write(&src, b"hi").unwrap();

        let err = MediaService::upload_file(&db, "nonexistent", &src, "a.txt").unwrap_err();
        assert!(err.to_string().contains("not found"));

        let _ = std::fs::remove_dir_all(&tmp);
    }
}
