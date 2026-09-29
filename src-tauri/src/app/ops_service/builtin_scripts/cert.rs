use crate::core::types::Danger::{Careful, Safe};
use crate::core::types::OpsScript;
use super::{param};

pub(super) fn scripts() -> Vec<OpsScript> {
    vec![
        OpsScript {
            id: "ops-cert-renew".into(),
            name: "certbot 续期证书".into(),
            description: "为指定证书名执行 certbot 续期".into(),
            category: "cert".into(),
            icon: Some("shield-check".into()),
            script: "sudo certbot renew --cert-name {{domain}}".into(),
            parameters: vec![param("domain", "证书域名")],
            danger_level: Careful,
            timeout_secs: 180,
            confirm_required: true,
            is_builtin: true,
            enabled: true,
            created_at: 0,
            updated_at: 0,
        },
        OpsScript {
            id: "ops-cert-expiry".into(),
            name: "查询证书到期时间".into(),
            description: "通过 openssl 读取域名证书的到期时间".into(),
            category: "cert".into(),
            icon: Some("clock".into()),
            script: "echo | openssl s_client -servername {{domain}} -connect {{domain}}:443 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null || echo '无法获取证书信息'".into(),
            parameters: vec![param("domain", "域名")],
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
