//! SSG 构建服务（IPC 层，docs/ssg-engine-design.md §8）
//! 薄封装：直接透传 ssg::build，命令层负责事件广播。

use crate::core::error::Result;
use crate::infra::storage::database::Database;
use crate::ssg::{build, BuildReport};

pub struct SsgService;

impl SsgService {
    /// 增量构建（无缓存自动全量）；force=true 强制全量重建。
    pub fn build(db: &Database, site_id: &str, force: bool) -> Result<BuildReport> {
        build(db, site_id, force)
    }
}
