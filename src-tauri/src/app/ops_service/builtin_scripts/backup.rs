use crate::core::types::Danger::{Careful};
use crate::core::types::OpsScript;
use super::{param};

pub(super) fn scripts() -> Vec<OpsScript> {
    vec![
        OpsScript {
            id: "ops-backup-tar".into(),
            name: "打包目录为 tar.gz".into(),
            description: "将源目录压缩为 tar.gz 归档".into(),
            category: "backup".into(),
            icon: Some("archive".into()),
            script: "tar -czf {{output_file}} -C \"$(dirname {{source_dir}})\" \"$(basename {{source_dir}})\"".into(),
            parameters: vec![
                param("source_dir", "源目录"),
                param("output_file", "输出文件名"),
            ],
            danger_level: Careful,
            timeout_secs: 300,
            confirm_required: true,
            is_builtin: true,
            enabled: true,
            created_at: 0,
            updated_at: 0,
        },
    ]
}
