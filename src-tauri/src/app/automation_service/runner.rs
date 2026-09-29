use super::*;
use super::util::*;

impl AutomationService {
    /// Kick off an async run. Returns immediately with the `run_id`.
    /// `trigger_type` 记录触发来源（manual / schedule / startup），落库供运维追溯。
    pub fn run_task(&self, task_id: &str, trigger_type: &str) -> Result<String> {
        let task = AutomationTaskRepo::get_by_id(&self.db, task_id)?
            .ok_or_else(|| Error::Validation(format!("任务不存在: {}", task_id)))?;
        if !task.enabled {
            return Err(Error::Validation("任务已停用".into()));
        }
        {
            let mut set = self.running.lock().unwrap();
            if set.contains(task_id) {
                return Err(Error::Validation("任务正在运行中，请勿重复触发".into()));
            }
            set.insert(task_id.to_string());
        }

        let run_id = uuid::Uuid::new_v4().to_string();
        let started_at = now_ms();
        TaskRunRepo::insert_run(
            &self.db,
            &TaskRun {
                id: run_id.clone(),
                task_id: task_id.to_string(),
                trigger_type: trigger_type.to_string(),
                connection_id: task.connection_ids.first().cloned(),
                status: run_run_status().into(),
                started_at,
                finished_at: None,
                duration_ms: None,
                error_summary: String::new(),
            },
        )?;
        AutomationTaskRepo::touch_last_run(&self.db, task_id, started_at)?;

        let token = CancellationToken::new();
        self.cancel_tokens.lock().unwrap().insert(run_id.clone(), token.clone());

        let svc = self.clone();
        let run_id_for_spawn = run_id.clone();
        let trigger_owned = trigger_type.to_string();
        tauri::async_runtime::spawn(async move {
            svc.run_inner(task, run_id_for_spawn, token, &trigger_owned).await;
        });
        Ok(run_id)
    }

    /// 启动后台周期调度器，保证自动化任务的「工作连续性」：
    /// - 应用启动时（首次 tick）对 `run_on_startup` 的启用任务触发一次（trigger=startup）；
    /// - 此后每 30s 轮询，对启用了周期调度的任务按 schedule 规则触发（trigger=schedule）。
    /// 调度只调用 `run_task`，复用既有的运行锁 + 落库 + 事件推送，零额外副作用。
    pub fn start_scheduler(&self) {
        let svc = self.clone();
        tauri::async_runtime::spawn(async move {
            // 首次 tick 前先等一小段，避免与启动期其它初始化抢资源。
            tokio::time::sleep(Duration::from_secs(5)).await;
            let mut startup_done = false;
            loop {
                tokio::time::sleep(Duration::from_secs(30)).await;
                let now = now_ms();
                let tasks = match svc.list_tasks() {
                    Ok(t) => t,
                    Err(e) => {
                        tracing::warn!("[scheduler] list_tasks failed: {}", e);
                        continue;
                    }
                };
                for task in tasks {
                    if !task.enabled {
                        continue;
                    }
                    // 启动触发：仅首次 tick 对 run_on_startup 任务触发一次。
                    if !startup_done && task.run_on_startup {
                        if let Err(e) = svc.run_task(&task.id, "startup") {
                            tracing::warn!("[scheduler] startup run {} failed: {}", task.id, e);
                        }
                        continue;
                    }
                    // 周期调度：按 schedule 规则判断是否到期。
                    if task.is_due(now) {
                        if let Err(e) = svc.run_task(&task.id, "schedule") {
                            tracing::warn!("[scheduler] scheduled run {} failed: {}", task.id, e);
                        }
                    }
                }
                startup_done = true;
            }
        });
    }

    async fn run_inner(&self, task: AutomationTask, run_id: String, token: CancellationToken, trigger_type: &str) {
        let task_id = task.id.clone();
        let started_at = now_ms();
        let multi_server = task.connection_ids.len() > 1;

        // 无目标连接时跑一轮（remote_exec 等步骤会失败并给出明确错误）；
        // 有连接时在每台服务器上各跑一轮（依次执行，run 内连续编号）。
        let server_ids: Vec<String> = if task.connection_ids.is_empty() {
            vec![String::new()]
        } else {
            task.connection_ids.clone()
        };

        let mut overall_failed = false;
        let mut cancelled = false;
        let mut error_summary = String::new();
        let mut row_idx: i64 = 0;

        for conn_id in &server_ids {
            // 解析连接；失败则记一条失败步骤并继续下一台服务器
            let (ssh, server_label) = if conn_id.is_empty() {
                (None, String::new())
            } else {
                match resolve_ssh(&self.db, conn_id) {
                    Ok(s) => (Some(s), connection_name(&self.db, conn_id)),
                    Err(e) => {
                        let msg = format!("连接服务器失败: {}", e);
                        let _ = TaskRunRepo::insert_step(
                            &self.db,
                            &TaskRunStep {
                                id: uuid::Uuid::new_v4().to_string(),
                                run_id: run_id.clone(),
                                step_index: row_idx,
                                step_id: format!("conn-{}", conn_id),
                                step_type: "connection".into(),
                                command_rendered: truncate_io(&msg, IO_HEAD, IO_HEAD),
                                status: "failed".into(),
                                exit_code: None,
                                stdout: String::new(),
                                stderr: msg.clone(),
                                assertion_passed: None,
                                attempt: 0,
                                duration_ms: 0,
                            },
                        );
                        overall_failed = true;
                        if error_summary.is_empty() {
                            error_summary = format!("[{}] {}", server_fallback_name(&self.db, conn_id), msg);
                        }
                        continue;
                    }
                }
            };
            let prefix = if multi_server { format!("[{}] ", server_label) } else { String::new() };
            let mut server_failed = false;

            'steps: for step in task.steps.iter() {
                if token.is_cancelled() {
                    cancelled = true;
                    break;
                }
                if !condition_allows(step.condition.as_ref(), server_failed) {
                    self.record_skipped(&run_id, row_idx, step, &prefix).await;
                    row_idx += 1;
                    continue;
                }

                let attempts = step.retry.as_ref().map(|r| r.attempts()).unwrap_or(1).max(1) as usize;
                let backoff = step.retry.as_ref().map(|r| r.backoff_secs).unwrap_or(0);
                let label = format!("{}{}", prefix, step.rendered_label());

                // 步骤先以 running 状态落库：运行中途打开详情也能看到现场。
                let step_row_id = uuid::Uuid::new_v4().to_string();
                let _ = TaskRunRepo::insert_step(
                    &self.db,
                    &TaskRunStep {
                        id: step_row_id.clone(),
                        run_id: run_id.clone(),
                        step_index: row_idx,
                        step_id: step.id.clone(),
                        step_type: step.step_type.as_str().to_string(),
                        command_rendered: truncate_io(&label, IO_HEAD, IO_HEAD),
                        status: "running".into(),
                        exit_code: None,
                        stdout: String::new(),
                        stderr: String::new(),
                        assertion_passed: None,
                        attempt: 1,
                        duration_ms: 0,
                    },
                );

                let mut outcome: Option<AttemptOutcome> = None;
                let mut attempt_used = 1u64;
                let mut step_duration_ms: i64 = 0;
                for attempt in 1..=attempts {
                    if token.is_cancelled() {
                        cancelled = true;
                        break;
                    }
                    attempt_used = attempt as u64;
                    let _ = self.app.emit(
                        "task-step-started",
                        json!({
                            "run_id": run_id,
                            "step_id": step.id,
                            "step_index": row_idx,
                            "step_type": step.step_type.as_str(),
                            "command_rendered": label,
                            "attempt": attempt,
                        }),
                    );
                    let t0 = std::time::Instant::now();
                    let o = self
                        .execute_step_once(ssh.as_ref(), step, non_empty(conn_id), trigger_type)
                        .await;
                    let dur = t0.elapsed().as_millis() as i64;
                    step_duration_ms = dur;
                    if o.ok || attempt == attempts || token.is_cancelled() {
                        outcome = Some(o);
                        break;
                    }
                    if backoff > 0 {
                        tokio::time::sleep(Duration::from_secs(backoff)).await;
                    }
                }

                let o = match outcome {
                    Some(o) => o,
                    None => {
                        cancelled = true;
                        break 'steps;
                    }
                };

                let step_status = if o.ok { "success" } else { "failed" };
                let _ = TaskRunRepo::update_step_result(
                    &self.db,
                    &step_row_id,
                    step_status,
                    o.exit_code,
                    &o.stdout,
                    &o.stderr,
                    o.assertion_passed,
                    attempt_used as i64,
                    step_duration_ms,
                );
                self.app.emit(
                    "task-step-finished",
                    json!({
                        "run_id": run_id,
                        "step_id": step.id,
                        "step_index": row_idx,
                        "status": step_status,
                        "exit_code": o.exit_code,
                        "duration_ms": step_duration_ms,
                    }),
                );

                if !o.ok && !step.continue_on_fail {
                    server_failed = true;
                    if error_summary.is_empty() {
                        error_summary = format!("{}步骤「{}」失败: {}", prefix, step.name, summarize(&o.stderr));
                    }
                }
                row_idx += 1;
            }
            if server_failed {
                overall_failed = true;
            }
            if cancelled {
                break;
            }
        }

        let cancelled = cancelled || token.is_cancelled();
        let status = if cancelled {
            run_cancelled_status()
        } else if overall_failed {
            run_failed_status()
        } else {
            run_success_status()
        };
        let finished_at = now_ms();
        let duration_ms = finished_at - started_at;
        let _ = TaskRunRepo::finish_run(&self.db, &run_id, status, finished_at, duration_ms, &error_summary);
        self.cancel_tokens.lock().unwrap().remove(&run_id);
        self.running.lock().unwrap().remove(&task_id);
        self.app.emit(
            "task-run-finished",
            json!({ "run_id": run_id, "task_id": task_id, "status": status, "duration_ms": duration_ms }),
        );

        // 系统通知：notify 开启的任务，失败必达；成功也简短播报（用户显式选择开启的任务）。
        if task.notify {
            let status_label = match status {
                "success" => "成功",
                "cancelled" => "已取消",
                _ => "失败",
            };
            let body = if overall_failed || cancelled {
                if error_summary.is_empty() { status_label.to_string() } else { error_summary.clone() }
            } else {
                format!("耗时 {} 秒", duration_ms / 1000)
            };
            use tauri_plugin_notification::NotificationExt;
            let _ = self
                .app
                .notification()
                .builder()
                .title(format!("任务「{}」{}", task.name, status_label))
                .body(body)
                .show();
        }
    }

    async fn record_skipped(&self, run_id: &str, idx: i64, step: &TaskStep, prefix: &str) {
        let label = format!("{}{}", prefix, step.rendered_label());
        let _ = TaskRunRepo::insert_step(
            &self.db,
            &TaskRunStep {
                id: uuid::Uuid::new_v4().to_string(),
                run_id: run_id.to_string(),
                step_index: idx,
                step_id: step.id.clone(),
                step_type: step.step_type.as_str().to_string(),
                command_rendered: truncate_io(&label, IO_HEAD, IO_HEAD),
                status: step_skipped_status().to_string(),
                exit_code: None,
                stdout: String::new(),
                stderr: String::new(),
                assertion_passed: None,
                attempt: 0,
                duration_ms: 0,
            },
        );
        let _ = self.app.emit(
            "task-step-finished",
            json!({ "run_id": run_id, "step_id": step.id, "status": "skipped", "exit_code": null, "duration_ms": 0 }),
        );
    }

    async fn execute_step_once(
        &self,
        ssh: Option<&SshConnectionInfo>,
        step: &TaskStep,
        conn_id: Option<&str>,
        trigger_type: &str,
    ) -> AttemptOutcome {
        match step.step_type {
            StepType::Delay => {
                let secs = step.seconds.unwrap_or(0);
                tokio::time::sleep(Duration::from_secs(secs)).await;
                AttemptOutcome { ok: true, exit_code: Some(0), stdout: format!("sleep {}s", secs), stderr: String::new(), assertion_passed: None }
            }
            StepType::RemoteExec => {
                let command = step.command.clone().unwrap_or_default();
                if let Some(hit) = is_dangerous_command(&command) {
                    return blocked(&command, hit);
                }
                match ssh {
                    Some(s) => {
                        let result = self
                            .remote_exec
                            .execute(s, RemoteExecRequest {
                                connection_id: conn_id.unwrap_or_default().to_string(),
                                command: command.clone(),
                                cwd: None,
                                timeout_secs: step.timeout_secs.unwrap_or(DEFAULT_STEP_TIMEOUT),
                            })
                            .await;
                        finish_with_assertions(result, step, &command)
                    }
                    None => AttemptOutcome { ok: false, exit_code: None, stdout: String::new(), stderr: "步骤需要绑定目标服务器连接".into(), assertion_passed: None },
                }
            }
            StepType::LocalShell => {
                let command = step.command.clone().unwrap_or_default();
                if let Some(hit) = is_dangerous_command(&command) {
                    return blocked(&command, hit);
                }
                let outcome = run_local_shell(&command, step.timeout_secs.unwrap_or(DEFAULT_STEP_TIMEOUT)).await;
                finish_with_assertions(outcome, step, &command)
            }
            StepType::SftpTransfer => {
                let local = step.local_path.clone().unwrap_or_default();
                let remote = step.remote_path.clone().unwrap_or_default();
                if local.is_empty() || remote.is_empty() {
                    return AttemptOutcome { ok: false, exit_code: None, stdout: String::new(), stderr: "sftp 步骤需要本地路径与远程路径".into(), assertion_passed: None };
                }
                match ssh {
                    Some(s) => {
                        let ok_msg = format!("上传 {} -> {} 完成", local, remote);
                        let res = self.sftp.upload(s, &[local], &remote, None, None, false);
                        match res {
                            Ok(()) => AttemptOutcome { ok: true, exit_code: Some(0), stdout: ok_msg, stderr: String::new(), assertion_passed: None },
                            Err(e) => AttemptOutcome { ok: false, exit_code: None, stdout: String::new(), stderr: e, assertion_passed: None },
                        }
                    }
                    None => AttemptOutcome { ok: false, exit_code: None, stdout: String::new(), stderr: "sftp 步骤需要绑定目标服务器连接".into(), assertion_passed: None },
                }
            }
            StepType::LocalBuild => AttemptOutcome { ok: false, exit_code: None, stdout: String::new(), stderr: "local_build 步骤尚不支持，请改用 local_shell".into(), assertion_passed: None },
            StepType::Deploy => {
                let site_id = match &step.site_id {
                    Some(s) if !s.trim().is_empty() => s.clone(),
                    _ => {
                        return AttemptOutcome {
                            ok: false,
                            exit_code: None,
                            stdout: String::new(),
                            stderr: "部署步骤需要指定站点 ID".into(),
                            assertion_passed: None,
                        }
                    }
                };
                let data_dir = match self.app.path().app_data_dir() {
                    Ok(p) => p,
                    Err(e) => {
                        return AttemptOutcome {
                            ok: false,
                            exit_code: None,
                            stdout: String::new(),
                            stderr: format!("无法获取应用数据目录: {}", e),
                            assertion_passed: None,
                        }
                    }
                };
                // 静默进度回调：部署进度由 DeployService 内部落库 + 资源登记，
                // 自动化运行仅关心最终成功/失败（失败可触发步骤重试，保证连续性）。
                let on_progress: std::sync::Arc<dyn Fn(DeployProgress) + Send + Sync> =
                    std::sync::Arc::new(|_p| {});
                // 触发来源：自动化调度/启动触发的部署记为 scheduled，使部署历史真实反映「工作连续性」。
                let deploy_trigger = if trigger_type == "manual" { "manual" } else { "scheduled" };
                match DeployService::deploy(&self.db, &self.sftp, &site_id, &data_dir, deploy_trigger, on_progress) {
                    Ok(o) => AttemptOutcome {
                        ok: true,
                        exit_code: Some(0),
                        stdout: format!(
                            "部署完成 deployment_id={} 上传{}文件/{}字节",
                            o.deployment_id, o.uploaded_count, o.total_bytes
                        ),
                        stderr: String::new(),
                        assertion_passed: None,
                    },
                    Err(e) => AttemptOutcome {
                        ok: false,
                        exit_code: None,
                        stdout: String::new(),
                        stderr: e.to_string(),
                        assertion_passed: None,
                    },
                }
            }
            StepType::Http => {
                let url = step.http_url.clone().unwrap_or_default();
                let method = step.http_method.clone().unwrap_or_else(|| "GET".into());
                let timeout_secs = step.timeout_secs.unwrap_or(30);

                let result = tokio::time::timeout(
                    std::time::Duration::from_secs(timeout_secs),
                    async {
                        let client = reqwest::Client::builder()
                            .timeout(std::time::Duration::from_secs(timeout_secs))
                            .build()
                            .map_err(|e| e.to_string())?;

                        let mut req = match method.to_uppercase().as_str() {
                            "GET" => client.get(&url),
                            "POST" => client.post(&url),
                            "PUT" => client.put(&url),
                            "DELETE" => client.delete(&url),
                            "PATCH" => client.patch(&url),
                            "HEAD" => client.head(&url),
                            other => {
                                let m = reqwest::Method::from_bytes(other.as_bytes())
                                    .map_err(|e| format!("无效 HTTP 方法: {}", e))?;
                                client.request(m, &url)
                            }
                        };

                        // 添加请求头
                        if let Some(headers_json) = &step.http_headers {
                            if !headers_json.trim().is_empty() {
                                if let Ok(map) = serde_json::from_str::<std::collections::HashMap<String, String>>(headers_json) {
                                    let mut header_map = reqwest::header::HeaderMap::new();
                                    for (k, v) in map {
                                        if let (Ok(name), Ok(val)) = (
                                            reqwest::header::HeaderName::from_bytes(k.as_bytes()),
                                            reqwest::header::HeaderValue::from_str(&v),
                                        ) {
                                            header_map.insert(name, val);
                                        }
                                    }
                                    req = req.headers(header_map);
                                }
                            }
                        }

                        // 添加请求体
                        if let Some(body) = &step.http_body {
                            if !body.trim().is_empty() {
                                req = req.body(body.clone());
                            }
                        }

                        let resp = req.send().await.map_err(|e| e.to_string())?;
                        let status = resp.status().as_u16();
                        let text = resp.text().await.map_err(|e| e.to_string()).unwrap_or_default();

                        Ok::<_, String>((status, text))
                    },
                )
                .await;

                match result {
                    Ok(Ok((status, body))) => {
                        let ok = if let Some(expected) = step.expect_status_code {
                            status == expected
                        } else {
                            status >= 200 && status < 400
                        };
                        AttemptOutcome {
                            ok,
                            exit_code: Some(status as i32),
                            stdout: format!("HTTP {}\n{}", status, body),
                            stderr: if ok { String::new() } else { format!("HTTP 状态码 {} 不符合预期", status) },
                            assertion_passed: None,
                        }
                    }
                    Ok(Err(e)) => AttemptOutcome {
                        ok: false,
                        exit_code: None,
                        stdout: String::new(),
                        stderr: format!("HTTP 请求失败: {}", e),
                        assertion_passed: None,
                    },
                    Err(_) => AttemptOutcome {
                        ok: false,
                        exit_code: None,
                        stdout: String::new(),
                        stderr: format!("HTTP 请求超时 ({}s)", timeout_secs),
                        assertion_passed: None,
                    },
                }
            }
        }
    }
}
