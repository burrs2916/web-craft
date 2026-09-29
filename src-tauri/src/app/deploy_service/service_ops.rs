use super::*;

impl DeployService {
    // ===== 运维管理：服务状态 / 重启 / 停止 / 回滚 =====

    /// 查询服务运行状态（使用 RemoteExecService，与环境检测同一条 SSH 执行路径）
    /// 查询站点服务状态（路线B：Nginx 静态托管）
    pub async fn get_service_status(
        remote_exec: &RemoteExecService,
        db: &Database,
        site_id: &str,
    ) -> Result<ServiceStatus> {
        let site = SiteRepo::get_by_id(db, site_id)?
            .ok_or_else(|| Error::Cms(format!("站点不存在: {}", site_id)))?;
        let conn_id = site.connection_id.as_deref()
            .ok_or_else(|| Error::Cms("站点未绑定服务器".into()))?;
        let conn = ConnectionRepo::get_by_id(db, conn_id)?
            .ok_or_else(|| Error::Cms("绑定的服务器连接不存在".into()))?;
        let ssh: SshConnectionInfo = serde_json::from_str(&conn.config_json)
            .map_err(|e| Error::Cms(format!("服务器连接配置解析失败: {}", e)))?;

        let deploy_config: serde_json::Value =
            serde_json::from_str(&site.deploy_config_json).unwrap_or_default();
        let remote_path = deploy_config["remote_path"].as_str().unwrap_or("").to_string();

        // Nginx 运行状态
        let nginx_active = Self::exec_ssh_stdout(remote_exec, &ssh,
            "systemctl is-active nginx 2>/dev/null || echo unknown",
            10,
        ).await.unwrap_or_else(|_| "unknown".to_string());
        let nginx_active = nginx_active.trim().to_string();

        // 当前版本目录
        let current_version = Self::exec_ssh_stdout(remote_exec, &ssh,
            &format!("[ -L {}/current ] && readlink -f {}/current 2>/dev/null | xargs basename 2>/dev/null || echo ''", remote_path, remote_path),
            10,
        ).await.unwrap_or_default();
        let current_version = current_version.trim().to_string();

        // Nginx 站点配置是否启用（检查所有可能的安装位置）
        // 与 setup_nginx_proxy 的三种策略对齐：
        // 1. /etc/nginx/sites-enabled/  (Debian/Ubuntu)
        // 2. /etc/nginx/conf.d/         (CentOS/RHEL)
        // 3. {remote_path}/nginx.conf.d/ (用户目录，配合 nginx include)
        let unit_slug = site_id.trim_start_matches("site-");
        let unit_slug_short = &unit_slug[..8.min(unit_slug.len())];
        let conf_name = format!("webcraft-{}.conf", unit_slug_short);
        let check_cmd = format!(
            "([ -e /etc/nginx/sites-enabled/{conf} ] && echo yes) \
             || ([ -f /etc/nginx/conf.d/{conf} ] && echo yes) \
             || ([ -f '{remote}/nginx.conf.d/{conf}' ] && echo yes) \
             || echo no",
            conf = conf_name,
            remote = remote_path,
        );
        let conf_enabled = Self::exec_ssh_stdout(remote_exec, &ssh, &check_cmd, 10)
            .await
            .unwrap_or_else(|_| "no".to_string());
        let conf_enabled = conf_enabled.trim() == "yes";

        // HTTP 可达性检查（通过 Nginx 80 端口）
        let mut domains = SiteDomainRepo::list_domains_by_site(db, site_id)
            .unwrap_or_else(|_| Vec::new());
        let domain = site.domain.trim();
        if domains.is_empty() && !domain.is_empty() {
            domains.push(domain.to_string());
        }
        let primary_domain = domains.iter().find(|d| !d.is_empty()).map(|d| d.as_str()).unwrap_or("");
        let check_host = if primary_domain.is_empty() { "localhost" } else { primary_domain };
        let http_code = Self::exec_ssh_stdout(remote_exec, &ssh,
            &format!("curl -s -o /dev/null -w '%{{http_code}}' http://{}/ 2>/dev/null", check_host),
            10,
        ).await.unwrap_or_else(|_| "000".to_string());
        let http_code = http_code.trim().to_string();
        let http_ok = http_code == "200" || http_code == "301" || http_code == "302";

        Ok(ServiceStatus {
            is_running: nginx_active == "active" && conf_enabled,
            healthz_code: http_code.clone(),
            health_ok: http_ok,
            current_version,
        })
    }

    /// 重启服务（路线B：Nginx reload）
    pub async fn restart_service(
        remote_exec: &RemoteExecService,
        db: &Database,
        site_id: &str,
    ) -> Result<()> {
        let site = SiteRepo::get_by_id(db, site_id)?
            .ok_or_else(|| Error::Cms(format!("站点不存在: {}", site_id)))?;
        let conn_id = site.connection_id.as_deref()
            .ok_or_else(|| Error::Cms("站点未绑定服务器".into()))?;
        let conn = ConnectionRepo::get_by_id(db, conn_id)?
            .ok_or_else(|| Error::Cms("绑定的服务器连接不存在".into()))?;
        let ssh: SshConnectionInfo = serde_json::from_str(&conn.config_json)
            .map_err(|e| Error::Cms(format!("服务器连接配置解析失败: {}", e)))?;

        // 路线B：reload Nginx 即可（静态文件无需重启进程）
        // 先尝试 nginx -s reload（兼容性好），失败再用 systemctl
        let output = Self::exec_ssh_stdout(remote_exec, &ssh,
            "nginx -t 2>&1 && (nginx -s reload 2>&1 || systemctl reload nginx 2>&1) && echo OK",
            15,
        ).await.map_err(|e| Error::Cms(format!("Nginx reload 失败: {}", e)))?;
        if !output.contains("OK") {
            return Err(Error::Cms(format!("Nginx reload 失败: {}", output.trim())));
        }
        Ok(())
    }

    /// 停止服务（路线B：禁用 Nginx 站点配置）
    /// 将配置文件重命名为 .disabled 备份，以便后续可恢复（start_service）。
    /// 覆盖所有可能的 Nginx 配置位置：
    /// 1. /etc/nginx/sites-enabled/ + sites-available/  (Debian/Ubuntu)
    /// 2. /etc/nginx/conf.d/                            (CentOS/RHEL)
    /// 3. {remote_path}/nginx.conf.d/                   (用户目录)
    pub async fn stop_service(
        remote_exec: &RemoteExecService,
        db: &Database,
        site_id: &str,
    ) -> Result<()> {
        let site = SiteRepo::get_by_id(db, site_id)?
            .ok_or_else(|| Error::Cms(format!("站点不存在: {}", site_id)))?;
        let conn_id = site.connection_id.as_deref()
            .ok_or_else(|| Error::Cms("站点未绑定服务器".into()))?;
        let conn = ConnectionRepo::get_by_id(db, conn_id)?
            .ok_or_else(|| Error::Cms("绑定的服务器连接不存在".into()))?;
        let ssh: SshConnectionInfo = serde_json::from_str(&conn.config_json)
            .map_err(|e| Error::Cms(format!("服务器连接配置解析失败: {}", e)))?;

        let unit_slug = site_id.trim_start_matches("site-");
        let unit_slug_short = &unit_slug[..8.min(unit_slug.len())];
        let conf_name = format!("webcraft-{}.conf", unit_slug_short);

        // 从部署配置中读取远程路径（用于用户目录 nginx.conf.d 策略）
        let deploy_cfg: serde_json::Value = serde_json::from_str(&site.deploy_config_json).unwrap_or_default();
        let remote_path = deploy_cfg["remote_path"].as_str().unwrap_or("/opt/webcraft");

        // 将各位置的配置重命名为 .disabled 备份（mv -f 存在则覆盖，不存在则静默跳过）
        // 注意：sites-enabled 里可能是 symlink，所以不能用 test -f 判断
        let cmd = format!(
            "mv -f /etc/nginx/sites-enabled/{conf} /etc/nginx/sites-enabled/{conf}.disabled 2>/dev/null; \
             mv -f /etc/nginx/sites-available/{conf} /etc/nginx/sites-available/{conf}.disabled 2>/dev/null; \
             mv -f /etc/nginx/conf.d/{conf} /etc/nginx/conf.d/{conf}.disabled 2>/dev/null; \
             mv -f '{remote}/nginx.conf.d/{conf}' '{remote}/nginx.conf.d/{conf}.disabled' 2>/dev/null; \
             nginx -t 2>&1 && (nginx -s reload 2>&1 || systemctl reload nginx 2>&1) && echo OK",
            conf = conf_name,
            remote = remote_path,
        );

        let output = Self::exec_ssh_stdout(remote_exec, &ssh, &cmd, 15)
            .await
            .map_err(|e| Error::Cms(format!("停止站点失败: {}", e)))?;
        if !output.contains("OK") {
            return Err(Error::Cms(format!("停止站点失败: {}", output.trim())));
        }
        Ok(())
    }

    /// 启动服务（路线B：启用 Nginx 站点配置）
    /// 从 .disabled 备份恢复配置文件 + reload nginx。
    /// 覆盖所有可能的 Nginx 配置位置（与 stop_service 对称）。
    pub async fn start_service(
        remote_exec: &RemoteExecService,
        db: &Database,
        site_id: &str,
    ) -> Result<()> {
        let site = SiteRepo::get_by_id(db, site_id)?
            .ok_or_else(|| Error::Cms(format!("站点不存在: {}", site_id)))?;
        let conn_id = site.connection_id.as_deref()
            .ok_or_else(|| Error::Cms("站点未绑定服务器".into()))?;
        let conn = ConnectionRepo::get_by_id(db, conn_id)?
            .ok_or_else(|| Error::Cms("绑定的服务器连接不存在".into()))?;
        let ssh: SshConnectionInfo = serde_json::from_str(&conn.config_json)
            .map_err(|e| Error::Cms(format!("服务器连接配置解析失败: {}", e)))?;

        let unit_slug = site_id.trim_start_matches("site-");
        let unit_slug_short = &unit_slug[..8.min(unit_slug.len())];
        let conf_name = format!("webcraft-{}.conf", unit_slug_short);

        let deploy_cfg: serde_json::Value = serde_json::from_str(&site.deploy_config_json).unwrap_or_default();
        let remote_path = deploy_cfg["remote_path"].as_str().unwrap_or("/opt/webcraft");

        // 从 .disabled 备份恢复各位置的配置文件（mv -f 不存在则静默跳过）
        // 注意：sites-enabled 里可能是 symlink，所以不能用 test -f 判断
        let cmd = format!(
            "mv -f /etc/nginx/sites-enabled/{conf}.disabled /etc/nginx/sites-enabled/{conf} 2>/dev/null; \
             mv -f /etc/nginx/sites-available/{conf}.disabled /etc/nginx/sites-available/{conf} 2>/dev/null; \
             mv -f /etc/nginx/conf.d/{conf}.disabled /etc/nginx/conf.d/{conf} 2>/dev/null; \
             mv -f '{remote}/nginx.conf.d/{conf}.disabled' '{remote}/nginx.conf.d/{conf}' 2>/dev/null; \
             nginx -t 2>&1 && (nginx -s reload 2>&1 || systemctl reload nginx 2>&1) && echo OK",
            conf = conf_name,
            remote = remote_path,
        );

        let output = Self::exec_ssh_stdout(remote_exec, &ssh, &cmd, 15)
            .await
            .map_err(|e| Error::Cms(format!("启动站点失败: {}", e)))?;
        if !output.contains("OK") {
            return Err(Error::Cms(format!("启动站点失败: {}", output.trim())));
        }
        Ok(())
    }


    /// 辅助函数：通过 RemoteExecService 执行 SSH 命令，返回 stdout
    async fn exec_ssh_stdout(
        remote_exec: &RemoteExecService,
        ssh: &SshConnectionInfo,
        command: &str,
        timeout_secs: u64,
    ) -> std::result::Result<String, String> {
        let req = RemoteExecRequest {
            connection_id: String::new(),
            command: command.to_string(),
            cwd: None,
            timeout_secs,
        };
        let result = remote_exec.execute(ssh, req).await;
        if result.success {
            Ok(result.stdout)
        } else {
            Err(if result.stderr.is_empty() { result.stdout } else { result.stderr })
        }
    }

    /// 回滚到指定部署版本（路线B：切换符号链接 + Nginx reload）
    pub async fn rollback_to(
        remote_exec: &RemoteExecService,
        db: &Database,
        site_id: &str,
        deployment_id: &str,
    ) -> Result<()> {
        let deployment = deployment_repo::get(db, deployment_id)?
            .ok_or_else(|| Error::Cms("部署记录不存在".into()))?;
        if deployment.site_id != site_id {
            return Err(Error::Cms("部署记录不属于该站点".into()));
        }
        if deployment.status != "success" {
            return Err(Error::Cms("只能回滚到成功的部署版本".into()));
        }
        if deployment.version_dir.is_empty() {
            return Err(Error::Cms("该部署记录没有版本目录信息，无法回滚".into()));
        }

        let site = SiteRepo::get_by_id(db, site_id)?
            .ok_or_else(|| Error::Cms(format!("站点不存在: {}", site_id)))?;
        let conn_id = site.connection_id.as_deref()
            .ok_or_else(|| Error::Cms("站点未绑定服务器".into()))?;
        let conn = ConnectionRepo::get_by_id(db, conn_id)?
            .ok_or_else(|| Error::Cms("绑定的服务器连接不存在".into()))?;
        let ssh: SshConnectionInfo = serde_json::from_str(&conn.config_json)
            .map_err(|e| Error::Cms(format!("服务器连接配置解析失败: {}", e)))?;

        let deploy_config: serde_json::Value =
            serde_json::from_str(&site.deploy_config_json).unwrap_or_default();
        let remote_path = deploy_config["remote_path"].as_str().unwrap_or("").to_string();

        let target_dir = format!("{}/releases/{}", remote_path, deployment.version_dir);

        // 检查目标版本目录是否存在
        let exists = Self::exec_ssh_stdout(remote_exec, &ssh,
            &format!("[ -d '{}' ] && echo EXISTS || echo MISSING", target_dir),
            10,
        ).await.map_err(|e| Error::Cms(format!("检查版本目录失败: {}", e)))?;
        if !exists.contains("EXISTS") {
            return Err(Error::Cms(format!("版本目录不存在: {}", target_dir)));
        }

        // 原子切换 current 符号链接
        let switch = Self::exec_ssh_stdout(remote_exec, &ssh,
            &format!("ln -sfn '{}' '{}/current' && echo OK", target_dir, remote_path),
            10,
        ).await.map_err(|e| Error::Cms(format!("切换符号链接失败: {}", e)))?;
        if !switch.contains("OK") {
            return Err(Error::Cms("切换符号链接失败".into()));
        }

        // Nginx reload（静态文件切换后只需 reload，无需重启进程）
        let reload = Self::exec_ssh_stdout(remote_exec, &ssh,
            "nginx -t 2>&1 && systemctl reload nginx 2>&1 && echo OK",
            15,
        ).await.map_err(|e| Error::Cms(format!("Nginx reload 失败: {}", e)))?;
        if !reload.contains("OK") {
            return Err(Error::Cms(format!("Nginx reload 失败: {}", reload.trim())));
        }

        // 写入回滚记录
        let now = now_ms();
        let rollback_row = DeploymentRow {
            id: format!("deploy-rollback-{}", uuid::Uuid::new_v4()),
            site_id: site_id.to_string(),
            trigger_type: "rollback".to_string(),
            target_env: "production".to_string(),
            mode: deployment.mode.clone(),
            connection_id: Some(conn_id.to_string()),
            remote_path: remote_path.clone(),
            version_dir: deployment.version_dir.clone(),
            server_version: String::new(),
            status: "success".to_string(),
            started_at: now,
            finished_at: Some(now),
            duration_ms: Some(0),
            uploaded_count: 0,
            deleted_count: 0,
            total_bytes: 0,
            error_summary: String::new(),
            manifest_json: String::new(),
            steps_json: String::new(),
            log_json: String::new(),
            rollback_from: None,
        };
        deployment_repo::insert(db, &rollback_row)?;

        Ok(())
    }

}
