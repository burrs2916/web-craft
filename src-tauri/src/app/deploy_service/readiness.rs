use super::*;

impl DeployService {
    /// 部署前就绪检查（路线B）：一次性返回「为什么不能部署」的结构化结论。
    /// 只读诊断，覆盖：站点存在 / 连接有效 / 远程路径 / 本地 dist / Nginx 可用。
    pub fn check_readiness(
        db: &Database,
        data_dir: &Path,
        site_id: &str,
    ) -> Result<DeployReadiness> {
        let mut issues: Vec<DeployReadinessIssue> = Vec::new();
        let mut ok = true;

        let site = match SiteRepo::get_by_id(db, site_id)? {
            Some(s) => s,
            None => {
                return Ok(DeployReadiness {
                    ok: false,
                    site_id: site_id.to_string(),
                    site_name: None,
                    connection_id: None,
                    connection_name: None,
                    remote_path: None,
                    local_dist_exists: false,
                    nginx_available: None,
                    issues: vec![DeployReadinessIssue {
                        level: "error".to_string(),
                        code: "SITE_NOT_FOUND".to_string(),
                        message: format!("站点不存在: {}", site_id),
                        hint: None,
                    }],
                });
            }
        };

        let deploy_config: serde_json::Value =
            serde_json::from_str(&site.deploy_config_json).unwrap_or(serde_json::json!({}));
        let remote = deploy_config["remote_path"].as_str().unwrap_or("").trim().to_string();

        // 1) 服务器连接
        let mut conn_name: Option<String> = None;
        let mut ssh: Option<SshConnectionInfo> = None;
        match &site.connection_id {
            None => {
                ok = false;
                issues.push(DeployReadinessIssue {
                    level: "error".to_string(),
                    code: "NO_CONNECTION".to_string(),
                    message: "站点未绑定服务器连接，无法部署".to_string(),
                    hint: Some("请在站点设置中绑定一个远程服务器连接".to_string()),
                });
            }
            Some(cid) => match ConnectionRepo::get_by_id(db, cid)? {
                None => {
                    ok = false;
                    issues.push(DeployReadinessIssue {
                        level: "error".to_string(),
                        code: "CONNECTION_NOT_FOUND".to_string(),
                        message: format!("绑定的服务器连接不存在: {}", cid),
                        hint: None,
                    });
                }
                Some(conn) => {
                    conn_name = Some(conn.name.clone());
                    match serde_json::from_str::<SshConnectionInfo>(&conn.config_json) {
                        Ok(s) => ssh = Some(s),
                        Err(e) => {
                            ok = false;
                            issues.push(DeployReadinessIssue {
                                level: "error".to_string(),
                                code: "CONNECTION_CONFIG_INVALID".to_string(),
                                message: format!("服务器连接配置解析失败: {}", e),
                                hint: None,
                            });
                        }
                    }
                }
            },
        }

        // 2) 远程路径
        if remote.is_empty() {
            ok = false;
            issues.push(DeployReadinessIssue {
                level: "error".to_string(),
                code: "NO_REMOTE_PATH".to_string(),
                message: "部署远程路径为空".to_string(),
                hint: Some("请在站点配置中填写远程部署路径（如 /var/www/example.com/html）".to_string()),
            });
        }

        // 3) 本地构建产物
        let dist_local = match Self::resolve_static_dist(data_dir, &site) {
            Ok(p) => p,
            Err(e) => {
                ok = false;
                issues.push(DeployReadinessIssue {
                    level: "error".to_string(),
                    code: "NO_LOCAL_DIST".to_string(),
                    message: e.to_string(),
                    hint: Some("运行站点构建生成 dist/ 后再部署".to_string()),
                });
                PathBuf::new()
            }
        };
        let local_dist_exists = !dist_local.as_os_str().is_empty() && dist_local.is_dir();

        // 4) 远端 Nginx 可用性（路线B核心检查项）
        let mut nginx_available: Option<bool> = None;
        if let Some(ssh) = &ssh {
            if !remote.is_empty() {
                match run_ssh_command_with_timeout(ssh, "command -v nginx >/dev/null 2>&1 && echo yes || echo no", 15) {
                    Ok(out) => {
                        let nginx_ok = out.trim() == "yes";
                        nginx_available = Some(nginx_ok);
                        if !nginx_ok {
                            ok = false;
                            issues.push(DeployReadinessIssue {
                                level: "error".to_string(),
                                code: "NGINX_NOT_FOUND".to_string(),
                                message: "远程服务器未安装 Nginx".to_string(),
                                hint: Some("请先在服务器上安装 Nginx（如 apt install nginx 或 yum install nginx）".to_string()),
                            });
                        }
                    }
                    Err(e) => {
                        ok = false;
                        issues.push(DeployReadinessIssue {
                            level: "error".to_string(),
                            code: "SSH_UNREACHABLE".to_string(),
                            message: format!("无法连接服务器: {}", e),
                            hint: Some("检查连接凭据/网络/主机是否可达".to_string()),
                        });
                    }
                }
            }
        }

        // 信息项
        if ok {
            if let Some(ref cname) = conn_name {
                issues.push(DeployReadinessIssue {
                    level: "info".to_string(),
                    code: "CONNECTED".to_string(),
                    message: format!("已绑定服务器连接：{}", cname),
                    hint: None,
                });
            }
            if local_dist_exists {
                issues.push(DeployReadinessIssue {
                    level: "info".to_string(),
                    code: "DIST_READY".to_string(),
                    message: "本地 dist/ 构建产物就绪".to_string(),
                    hint: None,
                });
            }
            if nginx_available == Some(true) {
                issues.push(DeployReadinessIssue {
                    level: "info".to_string(),
                    code: "NGINX_READY".to_string(),
                    message: "远程 Nginx 可用，静态托管就绪".to_string(),
                    hint: None,
                });
            }

            // 5) DNS 绑定检查（warning，不阻断部署）
            // 批量检测所有域名的 DNS 解析 IP 是否与服务器 IP 匹配（单次 SSH 调用）
            if let Some(ssh) = &ssh {
                let mut domains = SiteDomainRepo::list_domains_by_site(db, &site.id)
                    .unwrap_or_else(|_| Vec::new());
                let site_domain = site.domain.trim();
                if domains.is_empty() && !site_domain.is_empty() {
                    domains.push(site_domain.to_string());
                }
                // 过滤空域名
                domains.retain(|d| !d.is_empty());

                if domains.is_empty() {
                    issues.push(DeployReadinessIssue {
                        level: "info".to_string(),
                        code: "NO_DOMAIN".to_string(),
                        message: "站点未绑定域名，部署后仅可通过服务器 IP 访问".to_string(),
                        hint: Some("在站点设置中绑定域名以启用通过域名访问".to_string()),
                    });
                } else {
                    // 构建批量 DNS 检测脚本：一次 SSH 调用检测所有域名
                    // 五级降级：dig → host → nslookup → getent → python3 socket
                    let domain_list = domains.join(" ");
                    let dns_cmd = format!(
                        r#"SERVER_IP=$(curl -s4 --connect-timeout 5 ifconfig.me 2>/dev/null || hostname -I 2>/dev/null | awk '{{print $1}}' || echo '');
echo "SERVER_IP=$SERVER_IP";
for d in {domains}; do
    RESOLVED='';
    if command -v dig >/dev/null 2>&1; then
        RESOLVED=$(dig +short "$d" A 2>/dev/null | grep -E '^[0-9]+\.' | head -1);
    fi
    if [ -z "$RESOLVED" ] && command -v host >/dev/null 2>&1; then
        RESOLVED=$(host -t A "$d" 2>/dev/null | grep "has address" | head -1 | awk '{{print $NF}}');
    fi
    if [ -z "$RESOLVED" ] && command -v nslookup >/dev/null 2>&1; then
        RESOLVED=$(nslookup "$d" 2>/dev/null | grep -E "^Address:?\s" | grep -v '#' | tail -1 | awk '{{print $NF}}');
    fi
    if [ -z "$RESOLVED" ] && command -v getent >/dev/null 2>&1; then
        RESOLVED=$(getent hosts "$d" 2>/dev/null | awk '{{print $1}}' | grep -E '^[0-9]+\.' | head -1);
    fi
    if [ -z "$RESOLVED" ] && command -v python3 >/dev/null 2>&1; then
        RESOLVED=$(python3 -c "import socket,sys; print(socket.gethostbyname(sys.argv[1]))" "$d" 2>/dev/null);
    fi
    echo "DOMAIN=$d:RESOLVED=$RESOLVED";
done"#,
                        domains = domain_list
                    );
                    match run_ssh_command_with_timeout(ssh, &dns_cmd, 30) {
                        Ok(out) => {
                            let mut server_ip = String::new();
                            // 先解析 SERVER_IP
                            for line in out.lines() {
                                let line = line.trim();
                                if line.starts_with("SERVER_IP=") {
                                    server_ip = line.strip_prefix("SERVER_IP=").unwrap_or("").trim().to_string();
                                }
                            }
                            // 再逐域名解析结果
                            for domain in &domains {
                                let prefix = format!("DOMAIN={}:RESOLVED=", domain);
                                let resolved_ip = out.lines()
                                    .map(|l| l.trim())
                                    .find(|l| l.starts_with(&prefix))
                                    .map(|l| l.strip_prefix(&prefix).unwrap_or("").trim().to_string())
                                    .unwrap_or_default();

                                if resolved_ip.is_empty() {
                                    issues.push(DeployReadinessIssue {
                                        level: "warning".to_string(),
                                        code: "DNS_UNRESOLVED".to_string(),
                                        message: format!("域名 {} 的 DNS 无法解析 A 记录", domain),
                                        hint: Some("请在域名服务商处添加 A 记录指向服务器 IP，DNS 生效通常需要几分钟到数小时".to_string()),
                                    });
                                } else if !server_ip.is_empty() && resolved_ip != server_ip {
                                    issues.push(DeployReadinessIssue {
                                        level: "warning".to_string(),
                                        code: "DNS_MISMATCH".to_string(),
                                        message: format!("域名 {} 解析到 {}，但服务器 IP 为 {}", domain, resolved_ip, server_ip),
                                        hint: Some("如果使用了 CDN（如 Cloudflare），IP 不匹配属正常；否则请检查 A 记录是否指向正确的服务器 IP".to_string()),
                                    });
                                } else {
                                    issues.push(DeployReadinessIssue {
                                        level: "info".to_string(),
                                        code: "DNS_MATCHED".to_string(),
                                        message: format!("域名 {} DNS 解析正常（{}）", domain, resolved_ip),
                                        hint: None,
                                    });
                                }
                            }
                        }
                        Err(e) => {
                            for domain in &domains {
                                issues.push(DeployReadinessIssue {
                                    level: "warning".to_string(),
                                    code: "DNS_CHECK_FAILED".to_string(),
                                    message: format!("域名 {} DNS 检测失败: {}", domain, e),
                                    hint: Some("DNS 检测需要 SSH 连接到服务器执行，确保连接可用".to_string()),
                                });
                            }
                        }
                    }
                }
            }
        }

        Ok(DeployReadiness {
            ok,
            site_id: site_id.to_string(),
            site_name: Some(site.name.clone()),
            connection_id: site.connection_id.clone(),
            connection_name: conn_name,
            remote_path: if remote.is_empty() { None } else { Some(remote) },
            local_dist_exists,
            nginx_available,
            issues,
        })
    }
}
