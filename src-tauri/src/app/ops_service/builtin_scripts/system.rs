use crate::core::types::Danger::{Safe};
use crate::core::types::OpsScript;
use super::{param, select_param};

pub(super) fn scripts() -> Vec<OpsScript> {
    vec![
        OpsScript {
            id: "ops-system-disk".into(),
            name: "磁盘空间".into(),
            description: "查看指定挂载点磁盘使用情况（df）".into(),
            category: "system".into(),
            icon: Some("hard-drive".into()),
            script: "df -h {{mount_point}}".into(),
            parameters: vec![select_param("mount_point", "挂载点", &["/", "/var", "/home"])],
            danger_level: Safe,
            timeout_secs: 30,
            confirm_required: false,
            is_builtin: true,
            enabled: true,
            created_at: 0,
            updated_at: 0,
        },
        OpsScript {
            id: "ops-system-mem".into(),
            name: "内存 / CPU 概览".into(),
            description: "查看内存占用、CPU 数与负载".into(),
            category: "system".into(),
            icon: Some("cpu".into()),
            script: "echo '== 内存 =='; free -h; echo; echo '== CPU/负载 =='; nproc; uptime".into(),
            parameters: vec![],
            danger_level: Safe,
            timeout_secs: 30,
            confirm_required: false,
            is_builtin: true,
            enabled: true,
            created_at: 0,
            updated_at: 0,
        },
        OpsScript {
            id: "ops-system-port".into(),
            name: "查看端口占用".into(),
            description: "列出监听指定端口的进程".into(),
            category: "system".into(),
            icon: Some("plug".into()),
            script: "ss -tlnp 2>/dev/null | grep -E ':({{port}})\\b' || (netstat -tlnp 2>/dev/null | grep '{{port}}' || echo '未发现端口占用')".into(),
            parameters: vec![param("port", "端口号")],
            danger_level: Safe,
            timeout_secs: 30,
            confirm_required: false,
            is_builtin: true,
            enabled: true,
            created_at: 0,
            updated_at: 0,
        },
    ]
}
