use super::*;

impl DeployService {
    /// 环境预检（路线B）：Nginx 可用性 + 目录可写性
    pub(crate) fn preflight(ssh: &SshConnectionInfo, remote_path: &str, _port: u16, check_nginx: bool) -> Result<PreflightResult> {
        // Nginx 探测
        let nginx_available = if check_nginx {
            run_ssh_command_with_timeout(ssh, "command -v nginx >/dev/null 2>&1 && echo yes || echo no", 10)
                .map(|s| s.trim() == "yes")
                .unwrap_or(false)
        } else {
            false
        };

        // 目录可写性检查
        let dir_writable = run_ssh_command_with_timeout(
            ssh,
            &format!("mkdir -p '{}' && test -w '{}' && echo writable || echo not_writable", remote_path, remote_path),
            10,
        ).map(|s| s.trim() == "writable").unwrap_or(false);

        Ok(PreflightResult {
            nginx_available,
            dir_writable,
        })
    }

    /// 检测服务器上指定域名是否存在 Let's Encrypt SSL 证书。
    ///
    /// 返回证书目录路径（如 `/etc/letsencrypt/live/burrs.cloud`），
    /// 该路径可直接传给 `nginx_site_config` 的 `ssl_cert_dir` 参数，
    /// 使 Nginx 配置同时包含 443 proxy_pass + 80→HTTPS 301 重定向。
    ///
    /// 如果证书不存在或检测失败，返回 `None`（回退到 HTTP-only 配置）。
    pub(crate) fn detect_ssl_cert(ssh: &SshConnectionInfo, domains: &[String]) -> Option<String> {
        for domain in domains {
            if domain.is_empty() {
                continue;
            }
            let cert_path = format!("/etc/letsencrypt/live/{}/fullchain.pem", domain);
            let result = run_ssh_command_with_timeout(
                ssh,
                &format!("test -f '{}' && echo yes || echo no", cert_path),
                10,
            )
            .unwrap_or_else(|_| "no".to_string());

            if result.trim() == "yes" {
                return Some(format!("/etc/letsencrypt/live/{}", domain));
            }
        }
        None
    }
}
