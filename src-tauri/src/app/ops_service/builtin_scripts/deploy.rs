use crate::core::types::Danger::{Safe};
use crate::core::types::OpsScript;
use super::{param, select_param};

pub(super) fn scripts() -> Vec<OpsScript> {
    vec![
        OpsScript {
            id: "ops-deploy-health".into(),
            name: "部署后健康检查".into(),
            description: "curl 探测 URL 返回指定状态码".into(),
            category: "deploy".into(),
            icon: Some("pulse".into()),
            script: "code=$(curl -s -o /dev/null --connect-timeout 5 -w '%{http_code}' '{{url}}'); echo \"HTTP $code\"; [ \"$code\" = \"{{expected_code}}\" ] && echo OK || { echo '状态码不符'; exit 1; }".into(),
            parameters: vec![
                select_param("expected_code", "期望状态码", &["200", "301", "302", "404", "403"]),
                param("url", "URL"),
            ],
            danger_level: Safe,
            timeout_secs: 40,
            confirm_required: false,
            is_builtin: true,
            enabled: true,
            created_at: 0,
            updated_at: 0,
        },
    ]
}
