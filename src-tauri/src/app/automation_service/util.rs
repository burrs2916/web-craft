use super::*;

pub(super) fn validate_step(step: &TaskStep) -> Result<()> {
    if step.name.trim().is_empty() {
        return Err(Error::Validation("步骤名称不能为空".into()));
    }
    match step.step_type {
        StepType::RemoteExec | StepType::LocalShell => {
            if step.command.as_deref().unwrap_or("").trim().is_empty() {
                return Err(Error::Validation(format!("步骤「{}」缺少命令", step.name)));
            }
        }
        StepType::SftpTransfer => {
            if step.local_path.as_deref().unwrap_or("").trim().is_empty()
                || step.remote_path.as_deref().unwrap_or("").trim().is_empty()
            {
                return Err(Error::Validation(format!("步骤「{}」缺少本地或远程路径", step.name)));
            }
        }
        StepType::Delay => {
            if step.seconds.unwrap_or(0) == 0 {
                return Err(Error::Validation(format!("步骤「{}」延时不能为 0", step.name)));
            }
        }
        StepType::LocalBuild => {}
        StepType::Deploy => {
            if step.site_id.as_deref().unwrap_or("").trim().is_empty() {
                return Err(Error::Validation(format!("步骤「{}」缺少部署站点", step.name)));
            }
        }
        StepType::Http => {
            if step.http_url.as_deref().unwrap_or("").trim().is_empty() {
                return Err(Error::Validation(format!("步骤「{}」缺少 URL", step.name)));
            }
        }
    }
    Ok(())
}

pub(super) fn condition_allows(condition: Option<&StepCondition>, has_failed: bool) -> bool {
    match condition {
        None | Some(StepCondition::Always) => true,
        Some(StepCondition::OnSuccess) => !has_failed,
        Some(StepCondition::OnFail) => has_failed,
    }
}

pub(super) fn blocked(command: &str, hit: &str) -> AttemptOutcome {
    AttemptOutcome {
        ok: false,
        exit_code: None,
        stdout: String::new(),
        stderr: format!("命令被安全策略拦截（{}）: {}", hit, command),
        assertion_passed: None,
    }
}

pub(super) fn assert_step(step: &TaskStep, result: &RemoteExecResult) -> Option<bool> {
    let has_expect = step.expect_stdout.is_some()
        || step.expect_stderr.is_some()
        || step.expect_exit_code.is_some();
    if !has_expect {
        return None;
    }
    let mut passed = true;
    if let Some(exp) = step.expect_stdout.as_deref() {
        if !exp.is_empty() && !result.stdout.contains(exp) {
            passed = false;
        }
    }
    if let Some(exp) = step.expect_stderr.as_deref() {
        if !exp.is_empty() && !result.stderr.contains(exp) {
            passed = false;
        }
    }
    if let Some(code) = step.expect_exit_code {
        if result.exit_code != code {
            passed = false;
        }
    }
    Some(passed)
}

pub(super) fn finish_with_assertions(result: RemoteExecResult, step: &TaskStep, command: &str) -> AttemptOutcome {
    let assertion_passed = assert_step(step, &result);
    let ok = result.success && assertion_passed.unwrap_or(true);
    let stderr = if ok {
        result.stderr
    } else if result.success {
        format!("断言未通过: {}", summarize_assert(step, &result))
    } else if result.stderr.is_empty() {
        format!("命令执行失败（exit {}）", result.exit_code)
    } else {
        result.stderr
    };
    let _ = command;
    AttemptOutcome {
        ok,
        exit_code: Some(result.exit_code),
        stdout: result.stdout,
        stderr,
        assertion_passed,
    }
}

pub(super) async fn run_local_shell(command: &str, timeout: u64) -> RemoteExecResult {
    let start = std::time::Instant::now();
    let is_windows = cfg!(target_os = "windows");
    let mut cmd = tokio::process::Command::new(if is_windows { "cmd" } else { "sh" });
    if is_windows {
        cmd.arg("/C").arg(command);
    } else {
        cmd.arg("-c").arg(command);
    }
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            return RemoteExecResult {
                success: false,
                exit_code: -1,
                stdout: String::new(),
                stderr: e.to_string(),
                merged: false,
                duration_ms: 0,
                channel: "local_shell".into(),
                truncated: false,
            }
        }
    };
    let mut stdout = String::new();
    let mut stderr = String::new();
    if let Some(mut o) = child.stdout.take() {
        let _ = AsyncReadExt::read_to_string(&mut o, &mut stdout).await;
    }
    if let Some(mut e) = child.stderr.take() {
        let _ = AsyncReadExt::read_to_string(&mut e, &mut stderr).await;
    }
    let status = match tokio::time::timeout(Duration::from_secs(timeout), child.wait()).await {
        Ok(res) => res.ok(),
        Err(_) => {
            let _ = child.kill().await;
            None
        }
    };
    let exit_code = status.and_then(|s| s.code()).unwrap_or(-1);
    let duration_ms = start.elapsed().as_millis() as u64;
    let truncated = (stdout.len() + stderr.len()) > IO_HEAD;
    RemoteExecResult {
        success: exit_code == 0,
        exit_code,
        stdout,
        stderr,
        merged: true,
        duration_ms,
        channel: "local_shell".into(),
        truncated,
    }
}

pub(super) fn summarize(e: &str) -> String {
    let t = e.trim();
    if t.len() <= 120 { t.to_string() } else { format!("{}…", &t[..120]) }
}

pub(super) fn summarize_assert(step: &TaskStep, result: &RemoteExecResult) -> String {
    let mut parts: Vec<String> = Vec::new();
    if let Some(e) = step.expect_stdout.as_deref() {
        if !e.is_empty() && !result.stdout.contains(e) { parts.push(format!("stdout 未包含「{}」", e)); }
    }
    if let Some(e) = step.expect_stderr.as_deref() {
        if !e.is_empty() && !result.stderr.contains(e) { parts.push(format!("stderr 未包含「{}」", e)); }
    }
    if let Some(code) = step.expect_exit_code {
        if result.exit_code != code { parts.push(format!("期望退出码 {} 实际 {}", code, result.exit_code)); }
    }
    if parts.is_empty() { "断言失败".to_string() } else { parts.join("；") }
}

pub(super) fn resolve_ssh(db: &Database, connection_id: &str) -> Result<SshConnectionInfo> {
    let conn = ConnectionRepo::get_by_id(db, connection_id)?
        .ok_or_else(|| Error::Validation(format!("服务器连接不存在: {}", connection_id)))?;
    serde_json::from_str(&conn.config_json).map_err(|e| Error::Internal(format!("连接配置解析失败: {}", e)))
}

/// 连接显示名（多服务器执行时用于步骤标签前缀）。
pub(super) fn connection_name(db: &Database, connection_id: &str) -> String {
    ConnectionRepo::get_by_id(db, connection_id)
        .ok()
        .flatten()
        .map(|c| c.name)
        .unwrap_or_else(|| server_fallback_name(db, connection_id))
}

/// 连接名不可得时的兜底显示（取 id 前 8 位）。
pub(super) fn server_fallback_name(_db: &Database, connection_id: &str) -> String {
    let short: String = connection_id.chars().take(8).collect();
    if short.is_empty() { "服务器".to_string() } else { format!("服务器 {}", short) }
}

/// 空字符串转 None（无连接时 execute_step_once 需要 None 而非 Some("")）。
pub(super) fn non_empty(s: &str) -> Option<&str> {
    if s.is_empty() { None } else { Some(s) }
}

pub(super) fn fmt_timestamp(ms: i64) -> String {
    use chrono::TimeZone;
    chrono::Local
        .timestamp_millis_opt(ms)
        .single()
        .map(|t| t.format("%Y-%m-%d %H:%M:%S").to_string())
        .unwrap_or_else(|| ms.to_string())
}
