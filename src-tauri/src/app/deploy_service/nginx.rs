use super::*;

impl DeployService {
    /// 配置 Nginx 反向代理
    /// 策略：优先尝试系统级 Nginx（需 sudo），失败则降级到用户目录配置
    pub(crate) fn setup_nginx_proxy(
        ssh: &SshConnectionInfo,
        remote_path: &str,
        conf_name: &str,
        domains: &[String],
        log: &mut Vec<String>,
    ) -> Result<()> {
        let user_conf = format!("{}/nginx.conf.d/{}", remote_path, conf_name);

        // root 用户直接执行，非 root 才需要 sudo（用 -S 从 stdin 读密码避免交互卡住）
        let is_root = ssh.username == "root";
        let sudo_prefix = if is_root {
            String::new()
        } else {
            match &ssh.password {
                Some(pwd) if !pwd.is_empty() => {
                    // 转义单引号：' → '\''
                    let escaped = pwd.replace('\'', "'\\''");
                    format!("echo '{}' | sudo -S ", escaped)
                }
                _ => "sudo ".to_string(),
            }
        };
        let sc = |cmd: &str| format!("{}{}", sudo_prefix, cmd);

        // 策略 1：尝试系统级 Nginx（sites-available → sites-enabled）
        let sys_available = run_ssh_command_with_timeout(
            ssh,
            "test -d /etc/nginx/sites-available && test -d /etc/nginx/sites-enabled && echo yes || echo no",
            10,
        ).map(|s| s.trim() == "yes").unwrap_or(false);

        if sys_available {
            // 清理与当前域名冲突的旧配置（Certbot 或手工创建的域名命名 conf），
            // 避免 server_name 冲突导致 Nginx 忽略 WebCraft 配置。
            for domain in domains {
                if domain.is_empty() {
                    continue;
                }
                let domain_site_avail = format!("/etc/nginx/sites-available/{}", domain);
                let domain_site_enabled = format!("/etc/nginx/sites-enabled/{}", domain);
                let _ = run_ssh_command_with_timeout(
                    ssh,
                    &sc(&format!(
                        "test -f '{sa}' && mv -f '{sa}' '{sa}.webcraft-replaced.bak' || true; \
                         test -L '{se}' && rm -f '{se}' || true",
                        sa = domain_site_avail,
                        se = domain_site_enabled
                    )),
                    10,
                );
            }

            let dest_conf = format!("/etc/nginx/sites-available/{}", conf_name);
            let enabled_link = format!("/etc/nginx/sites-enabled/{}", conf_name);

            // 复制配置到系统目录
            let copy_result = run_ssh_command_with_timeout(
                ssh,
                &sc(&format!("cp '{}' '{}'", user_conf, dest_conf)),
                10,
            );

            if copy_result.is_ok() {
                // 启用站点（软链）
                let _ = run_ssh_command_with_timeout(
                    ssh,
                    &sc(&format!("ln -sfn '{}' '{}'", dest_conf, enabled_link)),
                    10,
                );

                // 测试配置
                let test_result = run_ssh_command_with_timeout(ssh, &sc("nginx -t 2>&1"), 15);
                match test_result {
                    Ok(out) if out.contains("test is successful") || out.contains("syntax is ok") => {
                        // reload
                        let reload_result = run_ssh_command_with_timeout(
                            ssh,
                            &sc("nginx -s reload 2>&1 || systemctl reload nginx 2>&1"),
                            15,
                        );
                        match reload_result {
                            Ok(_) => {
                                log.push("Nginx: 系统级配置已生效".to_string());
                                return Ok(());
                            }
                            Err(e) => {
                                log.push(format!("Nginx: reload 失败，回滚配置: {}", e));
                                let _ = run_ssh_command_with_timeout(
                                    ssh,
                                    &sc(&format!("rm -f '{}' '{}' && nginx -s reload 2>/dev/null", dest_conf, enabled_link)),
                                    10,
                                );
                            }
                        }
                    }
                    Ok(out) => {
                        log.push(format!("Nginx: 配置语法错误，回滚: {}", out.lines().last().unwrap_or("")));
                        let _ = run_ssh_command_with_timeout(
                            ssh,
                            &sc(&format!("rm -f '{}' '{}'", dest_conf, enabled_link)),
                            10,
                        );
                    }
                    Err(e) => {
                        log.push(format!("Nginx: 配置测试失败: {}", e));
                        let _ = run_ssh_command_with_timeout(
                            ssh,
                            &sc(&format!("rm -f '{}' '{}'", dest_conf, enabled_link)),
                            10,
                        );
                    }
                }
            } else {
                log.push("Nginx: 无权限写入系统目录，跳过系统级配置".to_string());
            }
        }

        // 策略 2：系统无 sites-available（如 CentOS/RHEL 的 nginx/1.20.1），
        // 写入标准 conf.d 目录（/etc/nginx/conf.d 默认被主配置 include）。
        // 否则动态生成的配置只会落到 {remote}/nginx.conf.d 而不会被加载，
        // 导致旧的 /etc/nginx/conf.d 中写死 root 的配置继续生效（403 Forbidden）。
        let confd_available = run_ssh_command_with_timeout(
            ssh,
            "test -d /etc/nginx/conf.d && echo yes || echo no",
            10,
        )
        .map(|s| s.trim() == "yes")
        .unwrap_or(false);

        if confd_available {
            // 清理旧的手工配置：example 模板里写死 `root /opt/webcraft/data/dist` 的
            // 残留 conf 会与本次生成的 proxy_pass 配置冲突并继续返回 403，部署前先备份移走。
            let _ = run_ssh_command_with_timeout(
                ssh,
                &sc("for f in /etc/nginx/conf.d/*.conf; do grep -q 'root /opt/webcraft' \"$f\" 2>/dev/null && mv -f \"$f\" \"${f}.deprecated.bak\"; done; true"),
                10,
            );

            // 清理与当前域名冲突的 Certbot/手工配置：
            // Certbot 通常以域名命名 conf（如 burrs.cloud.conf），其 server_name
            // 与 WebCraft 生成的配置相同，会导致 Nginx 忽略其中一个（冲突警告）。
            // 先备份再移走，确保 WebCraft 配置生效。
            for domain in domains {
                if domain.is_empty() {
                    continue;
                }
                let domain_conf = format!("/etc/nginx/conf.d/{}.conf", domain);
                let _ = run_ssh_command_with_timeout(
                    ssh,
                    &sc(&format!(
                        "test -f '{dc}' && mv -f '{dc}' '{dc}.webcraft-replaced.bak' || true",
                        dc = domain_conf
                    )),
                    10,
                );
                // 兜底：清理 sites-enabled 里可能存在的同名配置
                let domain_site = format!("/etc/nginx/sites-enabled/{}", domain);
                let _ = run_ssh_command_with_timeout(
                    ssh,
                    &sc(&format!(
                        "test -L '{ds}' && rm -f '{ds}' || true",
                        ds = domain_site
                    )),
                    10,
                );
            }

            let dest_conf = format!("/etc/nginx/conf.d/{}", conf_name);
            let copy_result = run_ssh_command_with_timeout(
                ssh,
                &sc(&format!("cp '{}' '{}'", user_conf, dest_conf)),
                10,
            );
            if copy_result.is_ok() {
                let test_result = run_ssh_command_with_timeout(ssh, &sc("nginx -t 2>&1"), 15);
                match test_result {
                    Ok(out) if out.contains("test is successful") || out.contains("syntax is ok") => {
                        let reload_result = run_ssh_command_with_timeout(
                            ssh,
                            &sc("nginx -s reload 2>&1 || systemctl reload nginx 2>&1"),
                            15,
                        );
                        match reload_result {
                            Ok(_) => {
                                log.push("Nginx: conf.d 配置已生效（CentOS/RHEL 路径）".to_string());
                                return Ok(());
                            }
                            Err(e) => {
                                log.push(format!("Nginx: reload 失败，回滚: {}", e));
                                let _ = run_ssh_command_with_timeout(
                                    ssh,
                                    &sc(&format!("rm -f '{}'", dest_conf)),
                                    10,
                                );
                            }
                        }
                    }
                    Ok(out) => {
                        log.push(format!(
                            "Nginx: 配置语法错误，回滚: {}",
                            out.lines().last().unwrap_or("")
                        ));
                        let _ = run_ssh_command_with_timeout(
                            ssh,
                            &sc(&format!("rm -f '{}'", dest_conf)),
                            10,
                        );
                    }
                    Err(e) => {
                        log.push(format!("Nginx: 配置测试失败: {}", e));
                        let _ = run_ssh_command_with_timeout(
                            ssh,
                            &sc(&format!("rm -f '{}'", dest_conf)),
                            10,
                        );
                    }
                }
            } else {
                log.push("Nginx: 无权限写入 /etc/nginx/conf.d，跳过系统级配置".to_string());
            }
        }

        // 策略 3：都没有可写目录时，仅提示用户手动配置
        if !domains.is_empty() {
            log.push(format!(
                "💡 Nginx 配置文件已保存到 {}/nginx.conf.d/{}，如需手动配置可参考该文件",
                remote_path, conf_name
            ));
        }

        Ok(())
    }

    /// 经 Nginx 代理层验证：通过 Nginx（80 端口）访问根路径，
    /// 验证「浏览器 → Nginx → 静态文件」完整链路。
    /// 直连验证（verify_frontend_reachable）只证明后端自身能返回 HTML，
    /// 但 Nginx 配置错误（proxy_pass 指错端口、server_name 不匹配）会导致
    /// 用户通过域名访问时被网关挡掉，直连发现不了。
    /// 有域名时带 Host header 精确命中对应 server block；无域名时
    /// server_name = "_"（default server），直接 localhost 即可。
    pub(crate) fn verify_nginx_proxy(
        ssh: &SshConnectionInfo,
        domains: &[String],
        log: &mut Vec<String>,
    ) -> (bool, String) {
        // 使用主域名（第一个）进行验证，无域名时走 default server
        let primary_domain = domains.iter().find(|d| !d.is_empty()).map(|d| d.as_str()).unwrap_or("");
        let probe_cmd = if primary_domain.is_empty() {
            "curl -sS -o /tmp/webcraft_nginx_check.html -D - --connect-timeout 5 http://localhost/ 2>&1 | head -20".to_string()
        } else {
            format!(
                "curl -sS -o /tmp/webcraft_nginx_check.html -D - --connect-timeout 5 -H 'Host: {}' http://localhost/ 2>&1 | head -20",
                primary_domain
            )
        };
        let out = match run_ssh_command_with_timeout(ssh, &probe_cmd, 15) {
            Ok(o) => o,
            Err(e) => {
                log.push(format!("  Nginx 代理层验证执行失败: {}", e));
                return (false, "error".to_string());
            }
        };

        let status_line = out
            .lines()
            .find(|l| l.trim_start().to_lowercase().starts_with("http/"))
            .unwrap_or("");
        let code = status_line
            .split_whitespace()
            .nth(1)
            .unwrap_or("000")
            .to_string();
        let content_type = out
            .lines()
            .find(|l| l.to_lowercase().starts_with("content-type:"))
            .unwrap_or("")
            .to_lowercase();
        let is_html = content_type.contains("text/html");
        let ok = code == "200" && is_html;

        if ok {
            log.push(format!("  Nginx 代理层验证通过: HTTP {} (Content-Type: {}) ✓", code, content_type.trim()));
        } else {
            log.push(format!(
                "  ⚠️ Nginx 代理层验证失败: HTTP {} (Content-Type: '{}') —— Nginx 配置可能有问题（proxy_pass / server_name / 静态 root），直连后端正常但经网关访问异常",
                code, content_type.trim()
            ));
        }
        (ok, code)
    }
}

/// - `ssl_cert_dir` 为 `Some(path)` 时（Let's Encrypt 证书目录存在），
///   生成 HTTP→HTTPS 301 + 443 静态服务双 server block。
/// - 为 `None` 时只生成 80 端口静态服务。
pub(crate) fn nginx_site_config(
    domains: &[String],
    site_name: &str,
    static_root: &str,
    ssl_cert_dir: Option<&str>,
) -> String {
    let server_name = if domains.is_empty() {
        "_".to_string()
    } else {
        domains.join(" ")
    };

    // 静态文件 location 块
    let static_block = format!(
        "    # 客户端最大上传大小\n\
         client_max_body_size 50M;\n\n\
         # 静态文件根目录（蓝绿部署 current 符号链接指向）\n\
         root {root};\n\n\
         # SPA 路由：先找文件，找不到回退到 index.html\n\
         location / {{\n\
         \x20   try_files $uri $uri/ /index.html;\n\
         }}\n\n\
         # 静态资源缓存\n\
         location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {{\n\
         \x20   expires 30d;\n\
         \x20   add_header Cache-Control \"public, immutable\";\n\
         }}\n\n\
         # HTML 不缓存（确保用户总能拿到最新版本）\n\
         location ~* \\.html$ {{\n\
         \x20   add_header Cache-Control \"no-cache, no-store, must-revalidate\";\n\
         }}\n",
        root = static_root,
    );

    match ssl_cert_dir {
        Some(cert_dir) => {
            let fullchain = format!("{}/fullchain.pem", cert_dir);
            let privkey = format!("{}/privkey.pem", cert_dir);
            format!(
                "# Generated by WebCraft deploy — site: {site} (HTTPS, static)\n\
                 # Static file serving via Nginx with SSL\n\n\
                 # HTTP -> HTTPS 重定向\n\
                 server {{\n\
                 \x20   listen 80;\n\
                 \x20   server_name {sname};\n\
                 \x20   return 301 https://$host$request_uri;\n\
                 }}\n\n\
                 # HTTPS 静态服务\n\
                 server {{\n\
                 \x20   listen 443 ssl;\n\
                 \x20   server_name {sname};\n\n\
                 \x20   # SSL 证书\n\
                 \x20   ssl_certificate {fullchain};\n\
                 \x20   ssl_certificate_key {privkey};\n\
                 \x20   ssl_protocols TLSv1.2 TLSv1.3;\n\
                 \x20   ssl_ciphers HIGH:!aNULL:!MD5;\n\n\
                 {static}\n\
                 }}\n",
                site = site_name,
                sname = server_name,
                fullchain = fullchain,
                privkey = privkey,
                static = static_block,
            )
        }
        None => format!(
            "# Generated by WebCraft deploy — site: {site} (HTTP, static)\n\
             # Static file serving via Nginx\n\n\
             server {{\n\
             \x20   listen 80;\n\
             \x20   server_name {sname};\n\n\
             {static}\n\
             }}\n",
            site = site_name,
            sname = server_name,
            static = static_block,
        ),
    }
}
