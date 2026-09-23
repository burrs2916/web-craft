//! SSG 静态站点生成引擎（docs/ssg-engine-design.md）
//! 对外接口：build / build_full。模块内部不访问数据库以外状态，纯函数化便于测试。

pub mod blocks;
pub mod builder;
pub mod feeds;
pub mod markdown;
pub mod theme;

pub use builder::{build, BuildReport};
