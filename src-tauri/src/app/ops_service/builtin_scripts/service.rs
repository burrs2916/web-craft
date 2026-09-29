use crate::core::types::Danger::{Careful, Safe};
use crate::core::types::OpsScript;
use super::{param, select_param};

pub(super) fn scripts() -> Vec<OpsScript> {
    vec![
        // ---------- 后端服务管理 ----------
        OpsScript {
            id: "ops-service-status".into(),
            name: "后端服务状态".into(),
            description: "检查指定 systemd 服务的运行状态和资源占用".into(),
            category: "system".into(),
            icon: Some("pulse".into()),
            script: "echo '=== 服务状态 ==='; \
systemctl status {{service_name}} --no-pager 2>&1 | head -10; \
echo ''; echo '=== 资源占用 ==='; \
if pgrep -f '{{service_name}}' > /dev/null; then \
  pid=$(pgrep -f '{{service_name}}' | head -1); \
  echo \"PID: $pid\"; \
  ps -p $pid -o %cpu,%mem,rss,etime --no-headers 2>/dev/null | awk '{printf \"CPU: %s%% | 内存: %s%% | RSS: %s KB | 运行: %s\\n\", $1, $2, $3, $4}'; \
else \
  echo '服务未运行'; \
fi".into(),
            parameters: vec![
                param("service_name", "服务名"),
            ],
            danger_level: Safe,
            timeout_secs: 20,
            confirm_required: false,
            is_builtin: true,
            enabled: true,
            created_at: 0,
            updated_at: 0,
        },
        OpsScript {
            id: "ops-service-restart".into(),
            name: "重启后端服务".into(),
            description: "通过 systemctl restart 重启指定服务".into(),
            category: "system".into(),
            icon: Some("arrow-circular-clockwise".into()),
            script: "echo '正在重启 {{service_name}}...'; \
sudo systemctl restart {{service_name}} && { \
  sleep 2; \
  if systemctl is-active --quiet {{service_name}}; then \
    echo '✅ {{service_name}} 重启成功，当前运行中'; \
    systemctl status {{service_name}} --no-pager | head -5; \
  else \
    echo '❌ 重启后服务未运行'; \
    systemctl status {{service_name}} --no-pager | head -10; \
    exit 1; \
  fi; \
} || { echo '❌ 重启失败'; exit 1; }".into(),
            parameters: vec![
                param("service_name", "服务名"),
            ],
            danger_level: Careful,
            timeout_secs: 60,
            confirm_required: true,
            is_builtin: true,
            enabled: true,
            created_at: 0,
            updated_at: 0,
        },
        OpsScript {
            id: "ops-service-logs".into(),
            name: "查看服务日志".into(),
            description: "通过 journalctl 查看指定服务的最近 N 行日志".into(),
            category: "system".into(),
            icon: Some("file-text".into()),
            script: "sudo journalctl -u {{service_name}} -n {{lines}} --no-pager 2>&1 || { \
  echo 'journalctl 不可用，尝试读取日志文件'; \
  if [ -f '/var/log/{{service_name}}.log' ]; then \
    tail -n {{lines}} /var/log/{{service_name}}.log; \
  else \
    echo '未找到日志文件'; \
  fi; \
}".into(),
            parameters: vec![
                param("service_name", "服务名"),
                select_param("lines", "行数", &["50", "100", "200", "500"]),
            ],
            danger_level: Safe,
            timeout_secs: 20,
            confirm_required: false,
            is_builtin: true,
            enabled: true,
            created_at: 0,
            updated_at: 0,
        },
        // ── Redis 运维 ──────────────────────────────────────────────
    ]
}
