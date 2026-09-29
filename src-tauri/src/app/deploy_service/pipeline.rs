use super::*;

impl DeployService {
    /// 一键部署（路线B：纯静态 Nginx 托管）：校验 → 预检 → 生成 Nginx 配置
    /// → SFTP 上传 dist/ → 蓝绿符号链接切换 → Nginx 配置安装 → 验证可达性 → 清理旧版本。
    /// 失败即中止并落库 failed 记录；成功更新 site.last_deployed_at。
    #[allow(clippy::too_many_arguments)]
    pub fn deploy(
        db: &Database,
        sftp: &SftpService,
        site_id: &str,
        data_dir: &Path,
        trigger_type: &str,
        on_progress: Arc<dyn Fn(DeployProgress) + Send + Sync>,
    ) -> Result<DeployOutcome> {
        let started = now_ms();
        let deployment_id = format!("deploy-{}", uuid::Uuid::new_v4());
        let mut log: Vec<String> = Vec::new();

        // 步骤追踪器（在 deploy 层创建，通过包装 on_progress 来追踪，
        // 这样无论 run() 成功还是失败都能拿到步骤数据）
        use std::sync::Mutex;
        let step_tracker = Arc::new(Mutex::new(StepTracker::new()));
        let tracker_clone = Arc::clone(&step_tracker);
        let progress_wrapper: Arc<dyn Fn(DeployProgress) + Send + Sync> = Arc::new(move |p| {
            if let Ok(mut t) = tracker_clone.lock() {
                t.progress(&p.step, &p.message, p.percent);
            }
            on_progress(p);
        });

        let mut outcome = Self::run(db, sftp, site_id, data_dir, &deployment_id, &mut log, progress_wrapper);
        let finished = now_ms();
        let duration_ms = finished - started;

        // 无论成功失败，都生成 steps_json
        let steps_json = match &outcome {
            Ok(_) => {
                if let Ok(mut t) = step_tracker.lock() {
                    t.finalize_success();
                }
                step_tracker.lock().map(|t| t.to_json()).unwrap_or_else(|_| "[]".to_string())
            }
            Err(e) => {
                if let Ok(mut t) = step_tracker.lock() {
                    t.finalize_failure(&e.to_string());
                }
                step_tracker.lock().map(|t| t.to_json()).unwrap_or_else(|_| "[]".to_string())
            }
        };

        if let Ok(o) = &mut outcome {
            o.duration_ms = duration_ms;
            // 用 deploy 层的步骤数据覆盖 run 返回的（更完整，包含失败场景）
            o.steps_json = steps_json.clone();
        }

        let (status, error_summary, uploaded_count, total_bytes, version_dir, manifest_json, deleted_count) = match &outcome {
            Ok(o) => ("success".to_string(), String::new(), o.uploaded_count, o.total_bytes,
                o.version_dir.clone(), o.manifest_json.clone(), o.deleted_count),
            Err(e) => {
                let msg = e.to_string();
                log.push(format!("[failed] {}", msg));
                ("failed".to_string(), msg, 0, 0, String::new(), "[]".to_string(), 0)
            }
        };

        let conn_id = SiteRepo::get_by_id(db, site_id)?
            .and_then(|s| s.connection_id);
        let remote_path = SiteRepo::get_by_id(db, site_id)?
            .and_then(|s| {
                let cfg: serde_json::Value = serde_json::from_str(&s.deploy_config_json).unwrap_or_default();
                cfg["remote_path"].as_str().map(|s| s.to_string())
            })
            .unwrap_or_default();
        let log_json = serde_json::to_string(&log.iter().take(200).collect::<Vec<_>>()).unwrap_or_else(|_| "[]".to_string());

        let row = DeploymentRow {
            id: deployment_id.clone(),
            site_id: site_id.to_string(),
            trigger_type: trigger_type.to_string(),
            target_env: "production".to_string(),
            mode: "simple".to_string(),
            connection_id: conn_id,
            remote_path,
            version_dir,
            server_version: String::new(),
            status,
            started_at: started,
            finished_at: Some(finished),
            duration_ms: Some(duration_ms),
            uploaded_count: uploaded_count as i64,
            deleted_count: deleted_count as i64,
            total_bytes: total_bytes as i64,
            error_summary,
            manifest_json,
            steps_json,
            log_json,
            rollback_from: None,
        };
        if let Err(e) = deployment_repo::insert(db, &row) {
            tracing::warn!("[deploy] 写部署记录失败: {}", e);
        }
        // 收尾 trace：成/败、耗时、上传量各留一条，便于按 deployment id
        // 一次性 grep 出整条部署链路
        match &outcome {
            Ok(o) => deploy_trace(&deployment_id, "INFO", STEP_DONE, "done",
                &format!("duration_ms={} uploaded={} bytes={} base_url={}",
                    duration_ms, o.uploaded_count, o.total_bytes, o.base_url), &[]),
            Err(e) => deploy_trace(&deployment_id, "ERROR", "-", "failed",
                &format!("duration_ms={} error={}", duration_ms, e), &[]),
        }
        register_deployment_resource(db, &row);
        if outcome.is_ok() {
            if let Some(mut site) = SiteRepo::get_by_id(db, site_id)? {
                site.last_deployed_at = Some(finished);
                SiteRepo::update(db, &site)?;
            }
        }
        outcome
    }

    #[allow(clippy::too_many_arguments)]
    fn run(
        db: &Database,
        sftp: &SftpService,
        site_id: &str,
        data_dir: &Path,
        deployment_id: &str,
        log: &mut Vec<String>,
        on_progress: Arc<dyn Fn(DeployProgress) + Send + Sync>,
    ) -> Result<DeployOutcome> {
        // ---- 步骤追踪器（记录每步状态/耗时，最后落库 steps_json）----
        // 使用 Rc<RefCell> 让嵌套闭包也能共享更新追踪器
        use std::cell::RefCell;
        use std::rc::Rc;
        let step_tracker = Rc::new(RefCell::new(StepTracker::new()));

        // ---- 工具：进度回调（同时更新 step_tracker）----
        let progress = on_progress.clone();
        let tracker_rc = Rc::clone(&step_tracker);
        let step = move |s: &str, m: String, p: u8| {
            deploy_trace(deployment_id, "INFO", s, "step", &format!("{}% | {}", p, m), &[]);
            tracker_rc.borrow_mut().progress(s, &m, p);
            progress(DeployProgress { step: s.to_string(), message: m, percent: p });
        };
        deploy_trace(deployment_id, "INFO", STEP_VALIDATE, "start",
            &format!("site={} deployment={}", site_id, deployment_id), &[]);

        // ---- 1. 校验 ----
        step(STEP_VALIDATE, "校验站点与绑定服务器".to_string(), 3);
        let site = SiteRepo::get_by_id(db, site_id)?
            .ok_or_else(|| Error::Cms(format!("站点不存在: {}", site_id)))?;
        let conn_id = site.connection_id.as_deref()
            .ok_or_else(|| Error::Cms("站点未绑定服务器，无法部署".into()))?;
        let conn = ConnectionRepo::get_by_id(db, conn_id)?
            .ok_or_else(|| Error::Cms(format!("绑定的服务器连接不存在: {}", conn_id)))?;
        let ssh: SshConnectionInfo = serde_json::from_str(&conn.config_json)
            .map_err(|e| Error::Cms(format!("服务器连接配置解析失败: {}", e)))?;

        let deploy_config: serde_json::Value =
            serde_json::from_str(&site.deploy_config_json).unwrap_or(serde_json::json!({}));
        let remote = deploy_config["remote_path"].as_str().unwrap_or("").trim().to_string();
        if remote.is_empty() {
            return Err(Error::Cms("部署远程路径为空，请先在站点配置中填写".into()));
        }
        let domain = site.domain.trim().to_string();
        // 从 site_domains 表获取完整域名列表，降级到 site.domain
        let mut domains = SiteDomainRepo::list_domains_by_site(db, &site.id)
            .unwrap_or_else(|_| Vec::new());
        if domains.is_empty() && !domain.is_empty() {
            domains.push(domain.clone());
        }
        let enable_nginx = deploy_config["enable_nginx"].as_bool().unwrap_or(true);
        let dist_local = Self::resolve_static_dist(data_dir, &site)?;

        // 部署摘要
        log.push("==================================================".to_string());
        log.push("        WebCraft 部署开始 (静态托管 Route B)        ".to_string());
        log.push("==================================================".to_string());
        log.push(format!(" 站点: {}", site.name));
        log.push(format!(" 服务器: {}@{}:{}", ssh.username, ssh.host, ssh.port));
        log.push(format!(" 部署路径: {}", remote));
        log.push(format!(" 模式: 静态托管 (Route B - Nginx + 静态文件)"));
        if !domains.is_empty() {
            log.push(format!(" 域名: {}", domains.join(", ")));
        }
        log.push("==================================================".to_string());

        // ---- 2. 环境预检 ----
        step(STEP_PRECHECK, "环境预检".to_string(), 6);
        let precheck = Self::preflight(&ssh, &remote, 0, enable_nginx)?;
        log.push(format!("预检: nginx={}, dir_writable={}",
            precheck.nginx_available, precheck.dir_writable));
        if !precheck.dir_writable {
            return Err(Error::Cms(format!("远程目录不可写: {}", remote)));
        }
        step(STEP_PRECHECK, format!("nginx={}, dir_writable={}",
            precheck.nginx_available, precheck.dir_writable), 8);

        // ---- 3. 生成 Nginx 配置 ----
        step(STEP_CONFIG, "生成 Nginx 静态托管配置".to_string(), 10);
        let static_root = format!("{}/current/dist", remote);
        let ssl_cert_dir = if enable_nginx && precheck.nginx_available {
            Self::detect_ssl_cert(&ssh, &domains)
        } else {
            None
        };
        let nginx_conf_text = if enable_nginx && precheck.nginx_available {
            Some(nginx_site_config(&domains, &site.name, &static_root, ssl_cert_dir.as_deref()))
        } else {
            None
        };
        let unit_slug = site.id.trim_start_matches("site-");
        let unit_slug_short = &unit_slug[..8.min(unit_slug.len())];
        let nginx_conf_name = format!("webcraft-{}.conf", unit_slug_short);

        // 临时目录
        let tmp_dir = std::env::temp_dir().join(format!("webcraft-{}", deployment_id));
        deploy_trace(deployment_id, "INFO", STEP_CONFIG, "tmp_dir",
            &format!("path={}", tmp_dir.display()), &[]);
        std::fs::create_dir_all(&tmp_dir).map_err(io_err("创建临时目录 ", &tmp_dir))?;
        let nginx_tmp = tmp_dir.join(&nginx_conf_name);
        if let Some(ref nginx_text) = nginx_conf_text {
            std::fs::write(&nginx_tmp, nginx_text)
                .map_err(io_err("写入 nginx 配置 ", &nginx_tmp))?;
        }
        log.push("Nginx 静态托管配置生成完成".to_string());

        let (uploaded_count, total_bytes) = local_stats(&[dist_local.clone()]);

        // ---- 4. SFTP 上传 ----
        let upload = |paths: Vec<String>, dir: &str, names: Option<Vec<String>>, pct_from: u8, pct_to: u8, note: &str, resume: bool| -> Result<()> {
            let sink_progress = on_progress.clone();
            let progress_id = format!("deploy-{}", deployment_id);
            let note_owned = note.to_string();
            let ctx = ProgressCtx::new(
                progress_id,
                Arc::new(move |p: crate::app::sftp_service::TransferProgress| {
                    let span = pct_to.saturating_sub(pct_from);
                    let pct = pct_from + (p.overall_percent as u16 * span as u16 / 100) as u8;
                    sink_progress(DeployProgress {
                        step: STEP_UPLOAD.to_string(),
                        message: format!("{} {} ({}/{})", note_owned, p.file, p.file_no, p.total_files),
                        percent: pct.min(99),
                    });
                }),
            );
            let names_ref = names.as_deref();
            deploy_trace(deployment_id, "INFO", STEP_UPLOAD, "upload_begin",
                &format!("note={} dir={} files={} names={:?} resume={}",
                    note, dir, paths.len(), names, resume), &[]);
            sftp.upload(&ssh, &paths, dir, Some(&ctx), names_ref, resume)
                .map_err(|e| {
                    deploy_trace(deployment_id, "ERROR", STEP_UPLOAD, "upload_failed",
                        &format!("note={} dir={} error={}", note, dir, e), &[]);
                    Error::Cms(format!("上传失败 ({note}): {}", e))
                })?;
            Ok(())
        };

        // 蓝绿部署：版本目录名 = 时间戳
        let release_ts = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
        let release_dir = format!("{}/releases/{}", remote, release_ts);
        let current_link = format!("{}/current", remote);
        let dist_dir = format!("{}/dist", release_dir);

        step(STEP_UPLOAD, "创建远程目录结构".to_string(), 15);
        let mkdir_cmd = format!("mkdir -p '{}' '{}' '{}/nginx.conf.d'",
            release_dir, dist_dir, remote);
        run_ssh_command_with_timeout(&ssh, &mkdir_cmd, 15)
            .map_err(|e| Error::Cms(format!("创建远程目录失败: {}", e)))?;

        // 上传 Nginx 配置
        if nginx_conf_text.is_some() {
            step(STEP_UPLOAD, "上传 Nginx 配置".to_string(), 18);
            upload(
                vec![nginx_tmp.to_string_lossy().to_string()],
                &format!("{}/nginx.conf.d", remote),
                None,
                18, 20, "传输", false,
            )?;
        }

        // 增量上传：前端 dist 未变则跳过 SFTP 全量传输
        let dist_skip = dist_unchanged(&ssh, &remote, &dist_local);
        if dist_skip {
            step(STEP_UPLOAD, "前端 dist 未变化，复用上一版本（硬链接）".to_string(), 25);
            let link_cmd = format!(
                "cp -rl '{}/current/dist' '{}' 2>/dev/null || cp -r '{}/current/dist' '{}'",
                remote, dist_dir, remote, dist_dir
            );
            match run_ssh_command_with_timeout(&ssh, &link_cmd, 20) {
                Ok(_) => log.push("dist 复用上一版本，跳过上传（重部署加速）".to_string()),
                Err(_) => {
                    log.push("dist 硬链接失败，回退为全量上传".to_string());
                    step(STEP_UPLOAD, "上传站点静态内容 (dist/)".to_string(), 25);
                    upload(
                        vec![dist_local.to_string_lossy().to_string()],
                        &dist_dir,
                        Some(vec![".".to_string()]),
                        25, 55, "上传", true,
                    )?;
                }
            }
        } else {
            step(STEP_UPLOAD, "上传站点静态内容 (dist/)".to_string(), 25);
            upload(
                vec![dist_local.to_string_lossy().to_string()],
                &dist_dir,
                Some(vec![".".to_string()]),
                25, 55, "上传", true,
            )?;
        }

        // ---- 5. 原子切换（蓝绿切换）----
        step(STEP_SWITCH, "原子切换版本".to_string(), 60);
        let prev_release = run_ssh_command_with_timeout(
            &ssh,
            &format!("readlink '{current_link}' 2>/dev/null || echo ''"),
            10,
        ).map(|s| s.trim().to_string()).unwrap_or_default();

        step(STEP_SWITCH, "切换符号链接".to_string(), 65);
        let switch_cmd = format!("ln -sfn '{}' '{}'", release_dir, current_link);
        run_ssh_command_with_timeout(&ssh, &switch_cmd, 10)
            .map_err(|e| Error::Cms(format!("切换版本失败: {}", e)))?;
        log.push(format!("版本切换成功: {}", release_ts));

        // ---- 6. Nginx 配置 + reload ----
        let mut base_url = format!("http://{}", ssh.host);
        let mut nginx_configured = false;
        if enable_nginx && precheck.nginx_available && nginx_conf_text.is_some() {
            step(STEP_NGINX, "配置 Nginx 静态托管".to_string(), 70);
            let nginx_result = Self::setup_nginx_proxy(
                &ssh, &remote, &nginx_conf_name, &domains, log,
            );
            match nginx_result {
                Ok(()) => {
                    if !domains.is_empty() {
                        let scheme = if ssl_cert_dir.is_some() { "https" } else { "http" };
                        base_url = format!("{}://{}", scheme, domains[0]);
                    }
                    log.push("Nginx 静态托管配置成功".to_string());
                    if ssl_cert_dir.is_some() {
                        log.push("  SSL 证书已检测到，HTTPS 配置已生成".to_string());
                    }
                    nginx_configured = true;
                }
                Err(e) => {
                    log.push(format!("Nginx 配置失败: {}", e));
                    // 回滚
                    if !prev_release.is_empty() {
                        let _ = run_ssh_command_with_timeout(
                            &ssh,
                            &format!("ln -sfn '{}' '{}'", prev_release, current_link),
                            10,
                        );
                        log.push("已自动回滚到上一版本".to_string());
                    }
                    return Err(Error::Cms(format!("Nginx 配置失败: {}", e)));
                }
            }
        }

        // ---- 7. 前端可达性验证 ----
        if nginx_configured {
            step(STEP_VERIFY, "验证 Nginx 代理层可达...".to_string(), 85);
            let (nginx_ok, nginx_code) = Self::verify_nginx_proxy(&ssh, &domains, log);
            if !nginx_ok {
                log.push(format!(
                    "Nginx 代理层验证未通过（HTTP {}），可能是 Nginx 配置问题",
                    nginx_code
                ));
                // 回滚
                if !prev_release.is_empty() {
                    let _ = run_ssh_command_with_timeout(
                        &ssh,
                        &format!("ln -sfn '{}' '{}'", prev_release, current_link),
                        10,
                    );
                    log.push("已自动回滚到上一版本".to_string());
                }
                return Err(Error::Cms(format!(
                    "前端验证失败（HTTP {}），已自动回滚到上一版本",
                    nginx_code
                )));
            }
            log.push("前端页面可达性验证通过".to_string());
        }

        // ---- 8. 清理旧版本 ----
        step(STEP_CLEANUP, "清理旧版本".to_string(), 95);
        match Self::cleanup_old_releases(&ssh, &remote, KEEP_RELEASES) {
            Ok(removed) if removed > 0 => {
                log.push(format!("清理了 {} 个旧版本", removed));
            }
            Ok(_) => {}
            Err(e) => {
                log.push(format!("清理旧版本失败（非致命）: {}", e));
            }
        }

        // 部署完成总结
        log.push("".to_string());
        log.push("==================================================".to_string());
        log.push("        部署成功完成！                             ".to_string());
        log.push("==================================================".to_string());
        log.push(format!(" 访问地址: {}", base_url));
        log.push(format!(" 版本目录: releases/{}", release_ts));
        log.push(format!(" 上传文件: {} 个", uploaded_count));
        log.push(format!(" 数据大小: {} bytes", total_bytes));
        log.push("==================================================".to_string());

        step(STEP_DONE, "部署完成".to_string(), 100);
        let _ = std::fs::remove_dir_all(&tmp_dir);

        // 生成文件清单 manifest
        let manifest = build_manifest(&dist_local);
        let manifest_json = serde_json::to_string(&manifest).unwrap_or_else(|_| "[]".to_string());

        // 完成步骤追踪
        step_tracker.borrow_mut().finalize_success();
        let steps_json = step_tracker.borrow().to_json();

        Ok(DeployOutcome {
            deployment_id: deployment_id.to_string(),
            base_url,
            uploaded_count,
            total_bytes,
            duration_ms: 0,
            log: log.clone(),
            version_dir: release_ts.clone(),
            deleted_count: 0,
            manifest_json,
            steps_json,
        })
    }
}
