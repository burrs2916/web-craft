#![allow(dead_code)]

use thiserror::Error;

#[derive(Debug, Error)]
pub enum Error {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("{op}失败: {source} | path={path}")]
    IoWithContext {
        op: String,
        path: String,
        source: std::io::Error,
    },

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("Terminal error: {0}")]
    Terminal(String),

    #[error("Session error: {0}")]
    Session(String),

    #[error("Command error: {0}")]
    Command(String),

    #[error("Profile error: {0}")]
    Profile(String),

    #[error("Connection error: {0}")]
    Connection(String),

    #[error("Plugin error: {0}")]
    Plugin(String),

    #[error("Config error: {0}")]
    Config(String),

    #[error("CMS error: {0}")]
    Cms(String),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Internal error: {0}")]
    Internal(String),
}

pub type Result<T> = std::result::Result<T, Error>;

/// 为 IO 错误附加「操作描述 + 路径」，避免 #[from] 自动转换时丢失现场信息。
///
/// 接受任何可转为路径的类型（`&Path` / `&PathBuf` 等），统一用 `display()` 渲染。
///
/// 用法：
/// ```ignore
/// std::fs::write(&p, data).map_err(io_err("写入 server.toml", &p))?;
/// ```
/// 失败时产生：`写入 server.toml 失败: No such file... | path=/a/b/c`
pub fn io_err<P: AsRef<std::path::Path>>(op: &str, path: &P) -> impl FnOnce(std::io::Error) -> Error {
    let op = op.to_string();
    let path = path.as_ref().display().to_string();
    move |e| Error::IoWithContext {
        op,
        path,
        source: e,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 契约：io_err 包装后的错误必须同时携带操作描述与路径，
    /// 且底层 source 可被追溯。这是「部署日志能精确定位失败文件」的保证，
    /// 一旦回归（例如又退回 #[from] 自动转换）该测试即失败。
    #[test]
    fn io_err_carries_op_and_path_and_source() {
        let path = std::path::PathBuf::from("/var/tmp/webcraft-xxx/server.toml");
        let underlying = std::io::Error::new(std::io::ErrorKind::NotFound, "No such file");
        let err = io_err("写入 server.toml", &path)(underlying);

        let msg = err.to_string();
        assert!(msg.contains("写入 server.toml"), "错误缺少操作描述: {msg}");
        assert!(
            msg.contains("/var/tmp/webcraft-xxx/server.toml"),
            "错误缺少路径，无法定位失败文件: {msg}"
        );

        match &err {
            Error::IoWithContext { source, .. } => {
                assert_eq!(source.kind(), std::io::ErrorKind::NotFound);
            }
            other => panic!("期望 IoWithContext，实际: {other:?}"),
        }
    }

    /// 接受 &Path 与 &PathBuf 两种形式，调用点方能统一使用。
    #[test]
    fn io_err_accepts_path_and_pathbuf() {
        let as_pathbuf = std::path::PathBuf::from("/a/b");
        let _ = io_err("x", &as_pathbuf)(std::io::Error::new(std::io::ErrorKind::Other, "e"));
        let as_path = std::path::Path::new("/c/d");
        let _ = io_err("x", &as_path)(std::io::Error::new(std::io::ErrorKind::Other, "e"));
    }
}
