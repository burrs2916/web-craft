//! L2 ops-script library: parameterised, reusable remote-ops scripts.
//!
//! Execution always flows through L1 remote-exec: render the script template
//! (shell-safe param substitution) → resolve the connection → run.

use std::collections::HashMap;
use std::sync::Arc;

use serde_json::{json, Value};

use crate::app::remote_exec_service::{RemoteExecRequest, RemoteExecResult, RemoteExecService};
use crate::core::error::{Error, Result};
use crate::core::types::{CertInfo, Danger, OpsScript, OpsScriptRun, ParamKind, RemoteFileContent, RemoteFileItem, ScriptParam, SshConnectionInfo};
use crate::infra::logging::debug_log;
use crate::infra::storage::connection_repo::ConnectionRepo;
use crate::infra::storage::database::Database;
use crate::infra::storage::ops_script_repo::{OpsScriptRepo, OpsScriptRunRepo};

/// 每个脚本保留的执行历史条数上限，超出即删除最旧的，防止库无限增长。
pub const MAX_SCRIPT_HISTORY: i64 = 100;

pub struct OpsService {
    pub remote_exec: Arc<RemoteExecService>,
}

impl OpsService {
    pub fn new(remote_exec: Arc<RemoteExecService>) -> Self {
        OpsService { remote_exec }
    }

    /// Seed built-in scripts idempotently.
    /// - New builtin scripts: insert
    /// - Existing builtin scripts: update content (preserves user edits only for non-builtin)
    pub fn ensure_builtins(&self, db: &Database) -> Result<()> {
        let now = now_ms();
        let builtins = builtin_scripts();
        let builtin_ids: std::collections::HashSet<String> = builtins.iter().map(|s| s.id.clone()).collect();

        for mut script in builtins {
            script.is_builtin = true;
            match OpsScriptRepo::get_by_id(db, &script.id)? {
                None => {
                    script.created_at = now;
                    script.updated_at = now;
                    OpsScriptRepo::insert(db, &script)?;
                }
                Some(existing) if existing.is_builtin => {
                    // Preserve created_at and enabled flag; update everything else.
                    script.created_at = existing.created_at;
                    script.updated_at = now;
                    script.enabled = existing.enabled;
                    OpsScriptRepo::update(db, &script)?;
                }
                Some(_) => {
                    // User-created script with same id — skip.
                }
            }
        }

        // 清理已废弃的内置脚本（旧版本残留）
        let all_builtins = OpsScriptRepo::list_builtin(db)?;
        for old in all_builtins {
            if !builtin_ids.contains(&old.id) {
                OpsScriptRepo::delete(db, &old.id)?;
            }
        }

        Ok(())
    }

    pub fn list(&self, db: &Database, category: Option<&str>) -> Result<Vec<OpsScript>> {
        OpsScriptRepo::list(db, category)
    }

    pub fn save(&self, db: &Database, mut script: OpsScript) -> Result<OpsScript> {
        if script.id.trim().is_empty() {
            script.id = format!("ops-{}", uuid::Uuid::new_v4());
        }
        if script.name.trim().is_empty() {
            return Err(Error::Validation("脚本名称不能为空".to_string()));
        }
        if script.script.trim().is_empty() {
            return Err(Error::Validation("脚本内容不能为空".to_string()));
        }
        let now = now_ms();
        match OpsScriptRepo::get_by_id(db, &script.id)? {
            None => {
                script.created_at = now;
                script.updated_at = now;
                script.is_builtin = false;
                OpsScriptRepo::insert(db, &script)?;
            }
            Some(existing) => {
                // builtin scripts are read-only; only editable fields change.
                if existing.is_builtin {
                    return Err(Error::Validation("预置脚本为只读，不可修改".to_string()));
                }
                script.created_at = existing.created_at;
                script.updated_at = now;
                OpsScriptRepo::update(db, &script)?;
            }
        }
        Ok(script)
    }

    pub fn delete(&self, db: &Database, id: &str) -> Result<()> {
        let script = OpsScriptRepo::get_by_id(db, id)?
            .ok_or_else(|| Error::Validation(format!("脚本不存在: {}", id)))?;
        if script.is_builtin {
            return Err(Error::Validation("预置脚本不可删除，可停用".to_string()));
        }
        OpsScriptRepo::delete(db, id)?;
        OpsScriptRunRepo::delete_for_script(db, id)?;
        Ok(())
    }

    pub fn toggle(&self, db: &Database, id: &str, enabled: bool) -> Result<()> {
        OpsScriptRepo::set_enabled(db, id, enabled)?;
        Ok(())
    }

    /// Render + run a script against the connection's server, persisting a run
    /// history record (audit trail) regardless of success/failure.
    pub async fn run(
        &self,
        db: &Database,
        script_id: &str,
        params: &HashMap<String, String>,
        connection_id: &str,
    ) -> Result<RemoteExecResult> {
        let run_id = format!("{}-{}", script_id, now_ms());
        debug_log::env_ops("INFO", &run_id, "script_run", "start",
            &format!("script_id={} connection_id={} params={}", script_id, connection_id, serde_json::to_string(params).unwrap_or_else(|_| "{}".to_string())));

        let script = OpsScriptRepo::get_by_id(db, script_id)?
            .ok_or_else(|| Error::Validation(format!("脚本不存在: {}", script_id)))?;
        if !script.enabled {
            debug_log::env_ops("WARN", &run_id, "script_run", "disabled",
                &format!("script {} is disabled", script.name));
            return Err(Error::Validation(format!("脚本已停用: {}", script.name)));
        }

        let rendered = render_script(&script, params)?;
        debug_log::env_ops("INFO", &run_id, "script_run", "rendered",
            &format!("script_len={} preview={}", rendered.len(), debug_log::clamp(&rendered, 120)));

        let conn = ConnectionRepo::get_by_id(db, connection_id)?
            .ok_or_else(|| Error::Validation(format!("服务器连接不存在: {}", connection_id)))?;
        let ssh: crate::core::types::SshConnectionInfo =
            serde_json::from_str(&conn.config_json)
                .map_err(|e| Error::Internal(format!("服务器连接配置解析失败: {}", e)))?;

        debug_log::env_ops("INFO", &run_id, "script_run", "remote_exec_start",
            &format!("host={} user={} timeout={}s", ssh.host, ssh.username, script.timeout_secs));

        let script_snap = (
            script.id.clone(),
            script.name.clone(),
            script.category.clone(),
            format!("{:?}", script.danger_level),
        );
        let params_json = serde_json::to_string(params).unwrap_or_else(|_| "{}".to_string());
        let started_at = now_ms();

        let result = self
            .remote_exec
            .execute(
                &ssh,
                RemoteExecRequest {
                    connection_id: connection_id.to_string(),
                    command: rendered.clone(),
                    cwd: None,
                    timeout_secs: script.timeout_secs.max(1),
                },
            )
            .await;

        debug_log::env_ops(if result.success { "INFO" } else { "ERROR" }, &run_id, "script_run", "remote_exec_done",
            &format!("success={} exit_code={} duration_ms={} stdout_len={} stderr_len={} truncated={} stdout_preview={} stderr_preview={}",
                result.success, result.exit_code, result.duration_ms,
                result.stdout.len(), result.stderr.len(), result.truncated,
                debug_log::clamp(&result.stdout, 200),
                debug_log::clamp(&result.stderr, 200)));

        if let Err(e) = OpsScriptRunRepo::insert(
            db,
            &OpsScriptRun {
                id: format!("orun-{}", uuid::Uuid::new_v4()),
                script_id: script_snap.0,
                script_name: script_snap.1,
                category: script_snap.2,
                connection_id: connection_id.to_string(),
                connection_name: conn.name,
                command_rendered: rendered,
                params_json,
                status: if result.success {
                    "success".to_string()
                } else {
                    "failed".to_string()
                },
                exit_code: result.exit_code,
                stdout: result.stdout.clone(),
                stderr: result.stderr.clone(),
                merged: result.merged,
                truncated: result.truncated,
                channel: result.channel.clone(),
                danger_level: script_snap.3,
                duration_ms: result.duration_ms,
                started_at,
            },
        ) {
            tracing::error!("OpsService::run 持久化脚本执行历史失败: {}", e);
            debug_log::env_ops("ERROR", &run_id, "script_run", "history_persist_failed", &e.to_string());
        }
        let _ = OpsScriptRunRepo::prune(db, &script.id, MAX_SCRIPT_HISTORY);

        debug_log::env_ops("INFO", &run_id, "script_run", "end",
            &format!("status={}", if result.success { "success" } else { "failed" }));

        Ok(result)
    }

    /// Script execution trail, most recent first. `script_id = None` → all scripts.
    pub fn run_history(&self, db: &Database, script_id: Option<&str>, limit: i64) -> Result<Vec<OpsScriptRun>> {
        OpsScriptRunRepo::list(db, script_id, limit)
    }

    // ---------- 远程文件运维 ----------

    /// 读取远程文件内容
    pub async fn read_file(&self, db: &Database, connection_id: &str, path: &str) -> Result<RemoteFileContent> {
        let ssh = resolve_ssh(db, connection_id)?;
        let path = shell_escape(path);

        // 检查文件是否存在并获取元信息
        let meta_cmd = format!(
            "test -f '{path}' && echo SIZE:$(stat -c %s '{path}' 2>/dev/null || stat -f %z '{path}' 2>/dev/null) && echo MTIME:$(stat -c %Y '{path}' 2>/dev/null || stat -f %m '{path}' 2>/dev/null) && echo PERM:$(stat -c %a '{path}' 2>/dev/null || stat -f %Lp '{path}' 2>/dev/null) && echo EXISTS:yes || echo EXISTS:no"
        );
        let meta_output = self.exec_ssh(&ssh, &meta_cmd, 10).await?;
        let meta = parse_file_meta(&meta_output);

        if !meta.exists {
            return Err(Error::Cms(format!("文件不存在: {}", path)));
        }

        // 读取文件内容（限制 1MB 以内，大文件提示）
        let content_cmd = format!("cat '{path}' 2>/dev/null | head -c 1048576");
        let content = self.exec_ssh(&ssh, &content_cmd, 15).await?;

        // 判断是否为文本文件
        let is_text_cmd = format!("file -b --mime-type '{path}' 2>/dev/null || echo text/plain");
        let mime = self.exec_ssh(&ssh, &is_text_cmd, 5).await?;
        let is_text = mime.trim().starts_with("text/") || mime.contains("json") || mime.contains("xml") || mime.contains("javascript");

        Ok(RemoteFileContent {
            path: path.to_string(),
            content,
            size: meta.size,
            modified_at: meta.mtime,
            permissions: meta.perm,
            is_text,
        })
    }

    /// 写入远程文件（自动备份 .bak）
    pub async fn write_file(&self, db: &Database, connection_id: &str, path: &str, content: &str) -> Result<()> {
        let ssh = resolve_ssh(db, connection_id)?;
        let path = shell_escape(path);

        // 先备份原文件
        let backup_cmd = format!("test -f '{path}' && cp -f '{path}' '{path}.webcraft.bak' 2>/dev/null; echo OK");
        let _ = self.exec_ssh(&ssh, &backup_cmd, 10).await?;

        // 写入新内容：使用 base64 + heredoc 方式，避免特殊字符问题
        // heredoc 使用带引号的 EOF 标记，防止变量展开
        let encoded = base64_encode(content);
        let marker = "__WEBCRAFT_FILE_CONTENT__";
        let write_cmd = format!(
            "mkdir -p \"$(dirname '{path}')\" && \
             base64 -d > '{path}' <<'{marker}'\n{encoded}\n{marker}\n\
             echo OK",
            path = path,
            marker = marker,
            encoded = encoded,
        );
        let output = self.exec_ssh(&ssh, &write_cmd, 20).await
            .map_err(|e| Error::Cms(format!("写入文件失败: {}", e)))?;
        if !output.contains("OK") {
            return Err(Error::Cms(format!("写入文件失败: {}", output.trim())));
        }
        Ok(())
    }

    /// 列出远程目录内容
    pub async fn list_dir(&self, db: &Database, connection_id: &str, path: &str) -> Result<Vec<RemoteFileItem>> {
        let ssh = resolve_ssh(db, connection_id)?;
        let path = shell_escape(path);

        // 使用 for 循环逐一枚举，用 TAB 分隔字段，避免 ls 不同系统格式差异
        // 格式：name<TAB>type<TAB>size<TAB>mtime<TAB>perm<TAB>owner<TAB>group
        let cmd = format!(
            "cd '{path}' 2>/dev/null && for f in .* *; do \
               [ \"$f\" = \".\" ] && continue; \
               [ \"$f\" = \"..\" ] && continue; \
               [ -e \"$f\" ] || continue; \
               if [ -d \"$f\" ]; then t=dir; else t=file; fi; \
               sz=$(stat -c %s \"$f\" 2>/dev/null || stat -f %z \"$f\" 2>/dev/null || echo 0); \
               mt=$(stat -c %Y \"$f\" 2>/dev/null || stat -f %m \"$f\" 2>/dev/null || echo 0); \
               pm=$(stat -c %a \"$f\" 2>/dev/null || stat -f %Lp \"$f\" 2>/dev/null || echo ---); \
               ow=$(stat -c %U \"$f\" 2>/dev/null || stat -f %Su \"$f\" 2>/dev/null || echo -); \
               gr=$(stat -c %G \"$f\" 2>/dev/null || stat -f %Sg \"$f\" 2>/dev/null || echo -); \
               printf '%s\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\n' \"$f\" \"$t\" \"$sz\" \"$mt\" \"$pm\" \"$ow\" \"$gr\"; \
             done; echo DONE"
        );
        let output = self.exec_ssh(&ssh, &cmd, 15).await?;

        let mut items = Vec::new();
        for line in output.lines() {
            if line.trim() == "DONE" { break; }
            let parts: Vec<&str> = line.splitn(7, '\t').collect();
            if parts.len() < 7 { continue; }

            let name = parts[0].to_string();
            let is_dir = parts[1] == "dir";
            let size = parts[2].parse::<i64>().unwrap_or(0);
            let mtime = parts[3].parse::<i64>().unwrap_or(0);
            let perm = parts[4].to_string();
            let owner = parts[5].to_string();
            let group = parts[6].to_string();

            let full_path = if path.ends_with('/') {
                format!("{}{}", path, name)
            } else {
                format!("{}/{}", path, name)
            };

            items.push(RemoteFileItem {
                name,
                path: full_path,
                is_dir,
                size,
                modified_at: mtime,
                permissions: perm,
                owner,
                group,
            });
        }

        Ok(items)
    }

    /// 获取 SSL 证书信息
    pub async fn get_cert_info(&self, db: &Database, connection_id: &str, cert_path: &str) -> Result<CertInfo> {
        let ssh = resolve_ssh(db, connection_id)?;
        let cert_path = shell_escape(cert_path);

        // 检查证书文件是否存在
        let exists_cmd = format!("test -f '{cert_path}' && echo yes || echo no");
        let exists = self.exec_ssh(&ssh, &exists_cmd, 5).await?;
        let exists = exists.trim() == "yes";

        if !exists {
            return Ok(CertInfo {
                cert_path: cert_path.to_string(),
                key_path: String::new(),
                chain_path: String::new(),
                subject: String::new(),
                issuer: String::new(),
                not_before: 0,
                not_after: 0,
                days_remaining: 0,
                domains: Vec::new(),
                fingerprint: String::new(),
                exists: false,
            });
        }

        // 使用 openssl 解析证书（一次性获取多个字段，减少 SSH 调用）
        let info_cmd = format!(
            "openssl x509 -in '{cert_path}' -noout -subject -issuer -startdate -enddate 2>/dev/null"
        );
        let info_output = self.exec_ssh(&ssh, &info_cmd, 5).await.unwrap_or_default();

        // 解析 subject / issuer / 日期
        let mut subject = String::new();
        let mut issuer = String::new();
        let mut not_before_str = String::new();
        let mut not_after_str = String::new();
        for line in info_output.lines() {
            if let Some(v) = line.strip_prefix("subject=") {
                subject = v.trim().to_string();
            } else if let Some(v) = line.strip_prefix("issuer=") {
                issuer = v.trim().to_string();
            } else if let Some(v) = line.strip_prefix("notBefore=") {
                not_before_str = v.trim().to_string();
            } else if let Some(v) = line.strip_prefix("notAfter=") {
                not_after_str = v.trim().to_string();
            }
        }

        // 用 date 命令把日期转成时间戳（兼容 GNU date 和 BSD date 的回退）
        let not_before = parse_date_ts(&ssh, &not_before_str, self).await;
        let not_after = parse_date_ts(&ssh, &not_after_str, self).await;

        let now_ts = now_ms() / 1000;
        let days_remaining = if not_after > now_ts {
            (not_after - now_ts) / 86400
        } else {
            0
        };

        // SAN 域名
        let san_cmd = format!("openssl x509 -in '{cert_path}' -noout -ext subjectAltName 2>/dev/null | grep -oE 'DNS:[^,]+' | sed 's/DNS://'");
        let san_output = self.exec_ssh(&ssh, &san_cmd, 5).await.unwrap_or_default();
        let domains: Vec<String> = san_output.lines()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();

        // 指纹
        let fp_cmd = format!("openssl x509 -in '{cert_path}' -noout -fingerprint -sha256 2>/dev/null | cut -d= -f2");
        let fingerprint = self.exec_ssh(&ssh, &fp_cmd, 5).await.unwrap_or_default();

        // 猜测 key 和 chain 路径
        let key_path = guess_key_path(&cert_path);
        let chain_path = guess_chain_path(&cert_path);

        Ok(CertInfo {
            cert_path: cert_path.to_string(),
            key_path,
            chain_path,
            subject,
            issuer,
            not_before,
            not_after,
            days_remaining,
            domains,
            fingerprint: fingerprint.trim().to_string(),
            exists: true,
        })
    }

    // ---------- 内部工具方法 ----------

    async fn exec_ssh(&self, ssh: &SshConnectionInfo, cmd: &str, timeout: u64) -> Result<String> {
        let req = RemoteExecRequest {
            connection_id: String::new(),
            command: cmd.to_string(),
            cwd: None,
            timeout_secs: timeout,
        };
        let result = self.remote_exec.execute(ssh, req).await;
        if !result.success {
            return Err(Error::Cms(format!("远程执行失败: {}", result.stderr)));
        }
        Ok(result.stdout)
    }
}

/// 用 date 命令把 openssl 日期字符串转成 Unix 时间戳（秒）
/// 兼容 GNU date (Linux) 和 BSD date (macOS)，都失败返回 0
async fn parse_date_ts(ssh: &SshConnectionInfo, date_str: &str, ops: &OpsService) -> i64 {
    if date_str.is_empty() { return 0; }
    let escaped = shell_escape(date_str);

    // 先试 GNU date 格式，再试 BSD date -j -f
    let cmd = format!(
        "date -d '{escaped}' +%s 2>/dev/null || date -j -f '%b %d %T %Y %Z' '{escaped}' +%s 2>/dev/null || echo 0"
    );
    let output = ops.exec_ssh(ssh, &cmd, 5).await.unwrap_or_default();
    output.trim().parse::<i64>().unwrap_or(0)
}

/// Substitute params into the script template (shell-safe), failing on leftover
/// placeholders so a missing value never reaches a remote shell half-rendered.
fn render_script(script: &OpsScript, params: &HashMap<String, String>) -> Result<String> {
    let value: Value = params
        .iter()
        .map(|(k, v)| (k.clone(), json!(v)))
        .collect();
    let noop_dir = std::path::PathBuf::new();
    let (rendered, _used) =
        crate::plugins::engine::template::render_template_shell_safe(&script.script, &value, &noop_dir);
    if rendered.contains("{{") {
        return Err(Error::Validation(format!(
            "脚本参数未填完整（存在未解析的占位符）：{}",
            script.name
        )));
    }
    Ok(rendered)
}

fn param(name: &str, label: &str) -> ScriptParam {
    ScriptParam {
        name: name.to_string(),
        label: label.to_string(),
        kind: ParamKind::Text,
        default_value: None,
        options: vec![],
        required: false,
    }
}

fn select_param(name: &str, label: &str, options: &[&str]) -> ScriptParam {
    ScriptParam {
        name: name.to_string(),
        label: label.to_string(),
        kind: ParamKind::Select,
        default_value: options.first().map(|s| s.to_string()),
        options: options.iter().map(|s| s.to_string()).collect(),
        required: false,
    }
}

/// Built-in scripts shipped with the app.
fn builtin_scripts() -> Vec<OpsScript> {
    use Danger::{Careful, Dangerous, Safe};
    vec![
        OpsScript {
            id: "ops-web-nginx-reload".into(),
            name: "重启/重载 Nginx".into(),
            description: "重载 Nginx 配置（systemctl reload nginx）".into(),
            category: "web".into(),
            icon: Some("arrow-circular-clockwise".into()),
            script: "sudo systemctl reload {{service_name}}".into(),
            parameters: vec![select_param(
                "service_name",
                "服务名",
                &["nginx"],
            )],
            danger_level: Careful,
            timeout_secs: 30,
            confirm_required: true,
            is_builtin: true,
            enabled: true,
            created_at: 0,
            updated_at: 0,
        },
        OpsScript {
            id: "ops-web-nginx-access".into(),
            name: "查看 Nginx 访问日志".into(),
            description: "打印 Nginx 访问日志尾部 N 行".into(),
            category: "web".into(),
            icon: Some("file-text".into()),
            script: "tail -n {{lines}} /var/log/nginx/access.log".into(),
            parameters: vec![param("lines", "行数")],
            danger_level: Safe,
            timeout_secs: 30,
            confirm_required: false,
            is_builtin: true,
            enabled: true,
            created_at: 0,
            updated_at: 0,
        },
        OpsScript {
            id: "ops-web-nginx-error".into(),
            name: "查看 Nginx 错误日志".into(),
            description: "打印 Nginx 错误日志尾部 N 行".into(),
            category: "web".into(),
            icon: Some("file-text".into()),
            script: "tail -n {{lines}} /var/log/nginx/error.log".into(),
            parameters: vec![param("lines", "行数")],
            danger_level: Safe,
            timeout_secs: 30,
            confirm_required: false,
            is_builtin: true,
            enabled: true,
            created_at: 0,
            updated_at: 0,
        },
        OpsScript {
            id: "ops-web-nginx-test".into(),
            name: "测试 Nginx 配置".into(),
            description: "校验 Nginx 配置文件语法（nginx -t）".into(),
            category: "web".into(),
            icon: Some("check-square".into()),
            script: "sudo nginx -t".into(),
            parameters: vec![],
            danger_level: Careful,
            timeout_secs: 30,
            confirm_required: true,
            is_builtin: true,
            enabled: true,
            created_at: 0,
            updated_at: 0,
        },
        OpsScript {
            id: "ops-web-env-check".into(),
            name: "Web 环境检测".into(),
            description: "检查服务器 Web 运行环境，输出结构化 JSON 报告：系统基础、Web 服务、端口监听、SSL 证书、DNS 解析".into(),
            category: "web".into(),
            icon: Some("magnifying-glass".into()),
            script: r##"#!/bin/bash
# Web 环境检测脚本 - 支持 python3 完整版和 bash 降级版
# 自动检测 python3 是否可用，优先使用完整版，否则降级到 bash 版本

DOMAIN="{{domain}}"
DEPLOY_PATH="{{deploy_path}}"
ENV_CHECK_MODE=""

# 检测 python3 是否可用
if command -v python3 >/dev/null 2>&1; then
    ENV_CHECK_MODE="python"
else
    ENV_CHECK_MODE="bash"
fi

# 输出模式信息到 stderr（不影响 JSON 输出）
echo "[env-check] mode=$ENV_CHECK_MODE" >&2

if [ "$ENV_CHECK_MODE" = "python" ]; then
    # ===== Python 完整版 =====
    python3 <<'PYEOF'
import json, os, subprocess, shutil, platform, sys
from datetime import datetime, timezone

DOMAIN = "{{domain}}" if "{{domain}}" else ""
DEPLOY_PATH = "{{deploy_path}}" if "{{deploy_path}}" else ""

def run(cmd, check_exit=False, timeout=10):
    try:
        r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
        if check_exit and r.returncode != 0:
            return None
        return r.stdout.strip()
    except Exception:
        return None

def has_cmd(name):
    return shutil.which(name) is not None

def pgrep(name):
    return subprocess.call(f"pgrep -x {name} >/dev/null 2>&1", shell=True) == 0

def check_service(cmd_name, proc_name, version_cmd, version_extract):
    installed = has_cmd(cmd_name)
    if not installed:
        return {"status": "fail", "value": "未安装", "detail": ""}
    ver_out = run(version_cmd) or ""
    version = ""
    if ver_out and version_extract:
        import re
        m = re.search(version_extract, ver_out)
        if m:
            version = m.group(1)
    if not version and ver_out:
        version = ver_out.split()[0] if ver_out.split() else ver_out[:30]
    running = pgrep(proc_name)
    status = "pass" if running else "warning"
    return {
        "status": status,
        "value": f"{version} · {'运行中' if running else '未运行'}",
        "detail": ""
    }

groups = []

# ========== 1. 系统基础 ==========
system_items = []

# OS
os_name = "Unknown"
if has_cmd("lsb_release"):
    os_name = run("lsb_release -d 2>/dev/null | cut -f2") or os_name
elif os.path.exists("/etc/os-release"):
    r = run("cat /etc/os-release | grep PRETTY_NAME | cut -d= -f2 | tr -d '\"'")
    if r: os_name = r
kernel = platform.release()
arch = platform.machine()
system_items.append({
    "name": "操作系统",
    "status": "info",
    "value": os_name,
    "detail": f"Kernel {kernel} · {arch}"
})

# Uptime
uptime_str = run("uptime -p 2>/dev/null || uptime | awk -F\"up \" \"{print $2}\" | awk -F\",\" \"{print $1}\"")
if uptime_str:
    system_items.append({
        "name": "运行时间",
        "status": "info",
        "value": uptime_str.strip(),
        "detail": ""
    })

# CPU
cpu_model = run("grep 'model name' /proc/cpuinfo 2>/dev/null | head -1 | cut -d: -f2 | xargs") or ""
cpu_count = os.cpu_count() or 0
loadavg = os.getloadavg() if hasattr(os, "getloadavg") else (0, 0, 0)
system_items.append({
    "name": "CPU",
    "status": "info",
    "value": f"{cpu_count} 核 · load {loadavg[0]:.2f}",
    "detail": cpu_model[:50] if cpu_model else ""
})

# Memory
mem_total = mem_used = mem_free = swap_total = swap_used = 0
if has_cmd("free"):
    r = run("free -m")
    if r:
        lines = r.split("\n")
        for line in lines:
            parts = line.split()
            if parts and parts[0] == "Mem:":
                mem_total = int(parts[1]) if len(parts) > 1 else 0
                mem_used = int(parts[2]) if len(parts) > 2 else 0
                mem_free = int(parts[3]) if len(parts) > 3 else 0
            if parts and parts[0] == "Swap:":
                swap_total = int(parts[1]) if len(parts) > 1 else 0
                swap_used = int(parts[2]) if len(parts) > 2 else 0

if mem_total > 0:
    pct = (mem_used / mem_total) * 100
    status = "pass" if pct < 70 else ("warning" if pct < 85 else "fail")
    detail = f"Swap: {swap_used}M / {swap_total}M" if swap_total > 0 else ""
    system_items.append({
        "name": "内存",
        "status": status,
        "value": f"{mem_used}M / {mem_total}M ({pct:.0f}%)",
        "detail": detail
    })

# Disk
df_r = run("df -h / 2>/dev/null | tail -1")
if df_r:
    parts = df_r.split()
    if len(parts) >= 5:
        total = parts[1]
        used = parts[2]
        avail = parts[3]
        pct_str = parts[4].rstrip("%")
        try:
            pct = int(pct_str)
            status = "pass" if pct < 70 else ("warning" if pct < 85 else "fail")
            system_items.append({
                "name": "磁盘 (根分区)",
                "status": status,
                "value": f"{used} / {total} ({pct}%)",
                "detail": f"剩余 {avail}"
            })
        except ValueError:
            pass

# Inode
inode_r = run("df -i / 2>/dev/null | tail -1")
if inode_r:
    parts = inode_r.split()
    if len(parts) >= 5:
        pct_str = parts[4].rstrip("%")
        try:
            pct = int(pct_str)
            if pct > 70:
                status = "warning" if pct < 85 else "fail"
                system_items.append({
                    "name": "Inode",
                    "status": status,
                    "value": f"已用 {pct}%",
                    "detail": ""
                })
        except ValueError:
            pass

groups.append({"id": "system", "name": "系统基础", "items": system_items})

# ========== 2. Web 服务 ==========
web_items = []

# Nginx
nginx = check_service("nginx", "nginx", "nginx -v 2>&1", r"nginx/([\d.]+)")
if nginx["status"] != "fail":
    conf_path = run("nginx -t 2>&1 | grep 'configuration file' | head -1 | awk \"{print \\$5}\"") or ""
    # 同时统计 sites-enabled（Debian/Ubuntu 风格）和 conf.d（RHEL/CentOS/Arch 风格）
    sites_se = run("ls /etc/nginx/sites-enabled/ 2>/dev/null | grep -v '^default$' | wc -l") or "0"
    sites_cd = run("ls /etc/nginx/conf.d/ 2>/dev/null | grep -E '\\.(conf|conf\\.disabled)$' | wc -l") or "0"
    sites_total = int(sites_se.strip() or 0) + int(sites_cd.strip() or 0)
    detail = ""
    if conf_path: detail += f"配置: {conf_path}"
    if sites_total > 0:
        detail += f" · {sites_total} 个站点"
    nginx["detail"] = detail
web_items.append({"name": "Nginx", **nginx})

# Nginx 配置正确性检测
if has_cmd("nginx"):
    nginx_test = run("sudo nginx -t 2>&1", timeout=15)
    if nginx_test:
        if "test is successful" in nginx_test or "syntax is ok" in nginx_test:
            web_items.append({
                "name": "Nginx 配置检测",
                "status": "pass",
                "value": "配置正确",
                "detail": "nginx -t 检测通过"
            })
        else:
            err_lines = [l for l in nginx_test.split("\n") if "emerg" in l.lower() or "error" in l.lower()][:2]
            web_items.append({
                "name": "Nginx 配置检测",
                "status": "fail",
                "value": "配置错误",
                "detail": " | ".join(err_lines) if err_lines else nginx_test[:80]
            })
    else:
        web_items.append({
            "name": "Nginx 配置检测",
            "status": "warning",
            "value": "无法检测",
            "detail": "nginx -t 执行失败，可能需要 sudo 权限"
        })

groups.append({"id": "web", "name": "Web 服务", "items": web_items})

# ========== 3. 端口监听 ==========
port_items = []
common_ports = [
    (80, "HTTP"),
    (443, "HTTPS"),
]

ss_available = has_cmd("ss")
for port, name in common_ports:
    if ss_available:
        r = run(f"ss -tlnp 2>/dev/null | grep -E \":{port}\\b\" | head -1")
    else:
        r = run(f"netstat -tlnp 2>/dev/null | grep -E \":{port}\\b\" | head -1")
    
    if r and r.strip():
        import re
        proc_match = re.search(r'users:\(\("([^"]+)"', r)
        proc = proc_match.group(1) if proc_match else name
        port_items.append({
            "name": f":{port} ({name})",
            "status": "pass",
            "value": "监听中",
            "detail": proc
        })
    else:
        port_items.append({
            "name": f":{port} ({name})",
            "status": "info",
            "value": "未监听",
            "detail": ""
        })

groups.append({"id": "ports", "name": "端口监听", "items": port_items})

# ========== 4. 运行时依赖 ==========
runtime_items = []

# OpenSSL（运行时需要，用于 HTTPS 请求）
openssl_ver = run("openssl version 2>/dev/null")
if openssl_ver:
    import re
    ssl_v = ""
    m = re.search(r'OpenSSL ([\d.]+)', openssl_ver)
    if m: ssl_v = m.group(1)
    if not ssl_v: ssl_v = openssl_ver.split()[1] if len(openssl_ver.split()) > 1 else ""
    runtime_items.append({
        "name": "OpenSSL",
        "status": "pass",
        "value": ssl_v,
        "detail": "HTTPS 请求需要"
    })
else:
    runtime_items.append({
        "name": "OpenSSL",
        "status": "fail",
        "value": "未安装",
        "detail": "HTTPS 请求需要"
    })

if runtime_items:
    groups.append({"id": "runtime", "name": "运行时依赖", "items": runtime_items})

# ========== 7. SSL 证书 ==========
if DOMAIN:
    ssl_items = []
    
    cert_cmd = f"echo | openssl s_client -servername {DOMAIN} -connect {DOMAIN}:443 2>/dev/null"
    cert_raw = run(cert_cmd, timeout=15)
    
    if cert_raw and "BEGIN CERTIFICATE" in cert_raw:
        # 提取 PEM 证书部分（从 BEGIN 到 END），避免把 s_client 的其他输出传给 x509
        import re
        pem_match = re.search(r'-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----', cert_raw, re.DOTALL)
        pem_cert = pem_match.group(0) if pem_match else cert_raw
        
        # 用临时文件方式传递证书，避免 shell 管道 + 多行内容导致的解析问题
        import tempfile, os
        tmpf = None
        try:
            tmpf = tempfile.NamedTemporaryFile(mode='w', suffix='.pem', delete=False)
            tmpf.write(pem_cert)
            tmpf.close()
            tmp_path = tmpf.name
            
            enddate = run(f"openssl x509 -in {tmp_path} -noout -enddate 2>/dev/null | cut -d= -f2")
            issuer = run(f"openssl x509 -in {tmp_path} -noout -issuer 2>/dev/null | sed 's/.*CN[[:space:]]*=[[:space:]]*//' | sed 's/,.*//'")
            subject = run(f"openssl x509 -in {tmp_path} -noout -subject 2>/dev/null | sed 's/.*CN[[:space:]]*=[[:space:]]*//' | sed 's/,.*//'")
            # 同时取 SAN（Subject Alternative Name），很多证书 CN 是空的或不完整
            san = run(f"openssl x509 -in {tmp_path} -noout -ext subjectAltName 2>/dev/null | tail -1 | tr -d ' '")
        finally:
            if tmpf and os.path.exists(tmp_path):
                os.unlink(tmp_path)
        
        if enddate:
            try:
                end_dt = datetime.strptime(enddate.strip(), "%b %d %H:%M:%S %Y %Z")
                now = datetime.now()
                days_left = (end_dt - now).days
                
                if days_left > 30:
                    ssl_status = "pass"
                elif days_left > 7:
                    ssl_status = "warning"
                else:
                    ssl_status = "fail"
                
                ssl_items.append({
                    "name": "证书有效期",
                    "status": ssl_status,
                    "value": f"剩余 {days_left} 天",
                    "detail": f"到期: {enddate.strip()[:20]}"
                })
            except Exception:
                ssl_items.append({
                    "name": "证书有效期",
                    "status": "info",
                    "value": enddate.strip()[:30],
                    "detail": ""
                })
        
        if issuer:
            issuer_clean = issuer.strip()
            ssl_items.append({
                "name": "颁发者",
                "status": "info",
                "value": issuer_clean[:40],
                "detail": ""
            })
        
        # 域名优先用 SAN，SAN 没有再用 CN
        domain_value = ""
        if san and "DNS:" in san:
            # 取第一个 DNS 域名，如果有多个在 detail 里展示
            dns_names = [d.strip() for d in san.replace("DNS:", "").split(",") if d.strip()]
            if dns_names:
                domain_value = dns_names[0]
                detail = f"共 {len(dns_names)} 个域名: {', '.join(dns_names[:5])}"
                if len(dns_names) > 5:
                    detail += f" 等 {len(dns_names)} 个"
                ssl_items.append({
                    "name": "证书域名",
                    "status": "info",
                    "value": domain_value,
                    "detail": detail
                })
        elif subject:
            ssl_items.append({
                "name": "证书域名",
                "status": "info",
                "value": subject.strip(),
                "detail": ""
            })
        
        if not ssl_items:
            ssl_items.append({
                "name": "SSL 证书",
                "status": "info",
                "value": "已获取",
                "detail": "证书存在但无法解析详情"
            })
    else:
        ssl_items.append({
            "name": "SSL 证书",
            "status": "fail",
            "value": "无法获取",
            "detail": f"无法连接 {DOMAIN}:443 或证书不存在"
        })
    
    if ssl_items:
        groups.append({"id": "ssl", "name": "SSL 证书", "items": ssl_items})

# ========== 8. DNS 解析 ==========
dns_items = []

if DOMAIN:
    # 获取服务器公网 IP
    server_ip = run("curl -s4 --connect-timeout 5 ifconfig.me 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}'") or ""

    # DNS 解析（五级降级：dig → host → nslookup → getent → socket）
    resolved_ip = ""
    if has_cmd("dig"):
        resolved_ip = run("dig +short \"%s\" A 2>/dev/null | grep -E '^[0-9]+\\.' | head -1" % DOMAIN) or ""
    if not resolved_ip and has_cmd("host"):
        r = run("host -t A \"%s\" 2>/dev/null | grep 'has address' | head -1" % DOMAIN)
        if r:
            parts = r.split()
            resolved_ip = parts[-1] if parts else ""
    if not resolved_ip and has_cmd("nslookup"):
        r = run("nslookup \"%s\" 2>/dev/null | grep -E '^Address:?\\s' | grep -v '#' | tail -1" % DOMAIN)
        if r:
            parts = r.split()
            resolved_ip = parts[-1] if parts else ""
    if not resolved_ip and has_cmd("getent"):
        r = run("getent hosts \"%s\" 2>/dev/null | awk '{print $1}' | grep -E '^[0-9]+\\.' | head -1" % DOMAIN)
        if r:
            resolved_ip = r.strip()
    if not resolved_ip:
        # Python socket 作为最终 fallback（无需外部命令）
        import socket as _socket
        try:
            resolved_ip = _socket.gethostbyname(DOMAIN)
        except Exception:
            pass

    if resolved_ip:
        if server_ip and resolved_ip == server_ip:
            dns_items.append({
                "name": f"DNS 解析 ({DOMAIN})",
                "status": "pass",
                "value": f"解析到 {resolved_ip}",
                "detail": f"与服务器 IP {server_ip} 匹配"
            })
        elif server_ip:
            dns_items.append({
                "name": f"DNS 解析 ({DOMAIN})",
                "status": "warning",
                "value": f"解析到 {resolved_ip}",
                "detail": f"与服务器 IP {server_ip} 不匹配（如使用 CDN 属正常）"
            })
        else:
            dns_items.append({
                "name": f"DNS 解析 ({DOMAIN})",
                "status": "warning",
                "value": f"解析到 {resolved_ip}",
                "detail": "无法获取服务器公网 IP 进行比对"
            })
    else:
        dns_items.append({
            "name": f"DNS 解析 ({DOMAIN})",
            "status": "fail",
            "value": "无法解析",
            "detail": "DNS A 记录未配置或域名未注册"
        })
else:
    dns_items.append({
        "name": "DNS 解析",
        "status": "info",
        "value": "未绑定域名",
        "detail": "部署后仅可通过服务器 IP 访问"
    })

groups.append({"id": "dns", "name": "DNS 解析", "items": dns_items})

# ========== 计算汇总 ==========
total = 0
passed = 0
warning = 0
failed = 0
info = 0

for g in groups:
    for item in g["items"]:
        total += 1
        s = item["status"]
        if s == "pass": passed += 1
        elif s == "warning": warning += 1
        elif s == "fail": failed += 1
        elif s == "info": info += 1

score_denom = passed + warning + failed
score = int(((passed * 100 + warning * 60) / score_denom)) if score_denom > 0 else 0

result = {
    "summary": {
        "score": score,
        "total": total,
        "passed": passed,
        "warning": warning,
        "failed": failed,
        "info": info,
        "check_mode": "python"
    },
    "groups": groups
}

print(json.dumps(result, ensure_ascii=False))
PYEOF
else
    # ===== Bash 降级版 =====
    # 覆盖核心检测项：系统基础、Web服务、端口监听、SSL证书
    
    # JSON 构建辅助函数
    json_escape() {
        echo "$1" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\n/\\n/g; s/\r/\\r/g; s/\t/\\t/g'
    }
    
    # 检测命令是否存在
    has_cmd() {
        command -v "$1" >/dev/null 2>&1
    }
    
    # 检测进程是否运行
    pgrep_name() {
        pgrep -x "$1" >/dev/null 2>&1
    }
    
    # 安全运行命令
    run_cmd() {
        timeout 10 sh -c "$1" 2>/dev/null | head -100
    }
    
    TOTAL=0
    PASSED=0
    WARNING=0
    FAILED=0
    INFO_COUNT=0
    
    GROUPS_JSON=""
    
    # ========== 1. 系统基础 ==========
    SYSTEM_ITEMS=""
    
    # OS
    OS_NAME="Unknown"
    if has_cmd lsb_release; then
        OS_NAME=$(lsb_release -d 2>/dev/null | cut -f2 | sed 's/^[[:space:]]*//')
    elif [ -f /etc/os-release ]; then
        OS_NAME=$(grep PRETTY_NAME /etc/os-release | cut -d= -f2 | tr -d '"')
    fi
    KERNEL=$(uname -r)
    ARCH=$(uname -m)
    OS_NAME_ESC=$(json_escape "$OS_NAME")
    KERNEL_ESC=$(json_escape "$KERNEL")
    SYSTEM_ITEMS="$SYSTEM_ITEMS
    {\"name\":\"操作系统\",\"status\":\"info\",\"value\":\"$OS_NAME_ESC\",\"detail\":\"Kernel $KERNEL_ESC · $ARCH\"}"
    TOTAL=$((TOTAL + 1))
    INFO_COUNT=$((INFO_COUNT + 1))
    
    # Uptime
    UPTIME_STR=$(uptime -p 2>/dev/null || uptime | awk -F"up " '{print $2}' | awk -F"," '{print $1}')
    if [ -n "$UPTIME_STR" ]; then
        UPTIME_ESC=$(json_escape "$UPTIME_STR")
        SYSTEM_ITEMS="$SYSTEM_ITEMS,
    {\"name\":\"运行时间\",\"status\":\"info\",\"value\":\"$UPTIME_ESC\",\"detail\":\"\"}"
        TOTAL=$((TOTAL + 1))
        INFO_COUNT=$((INFO_COUNT + 1))
    fi
    
    # CPU
    CPU_COUNT=$(nproc 2>/dev/null || echo "?")
    LOAD_AVG=$(cat /proc/loadavg 2>/dev/null | awk '{print $1}')
    CPU_MODEL=$(grep 'model name' /proc/cpuinfo 2>/dev/null | head -1 | cut -d: -f2 | sed 's/^[[:space:]]*//')
    CPU_MODEL_SHORT=$(echo "$CPU_MODEL" | cut -c1-50)
    CPU_MODEL_ESC=$(json_escape "$CPU_MODEL_SHORT")
    SYSTEM_ITEMS="$SYSTEM_ITEMS,
    {\"name\":\"CPU\",\"status\":\"info\",\"value\":\"$CPU_COUNT 核 · load $LOAD_AVG\",\"detail\":\"$CPU_MODEL_ESC\"}"
    TOTAL=$((TOTAL + 1))
    INFO_COUNT=$((INFO_COUNT + 1))
    
    # Memory
    if has_cmd free; then
        MEM_INFO=$(free -m 2>/dev/null)
        MEM_TOTAL=$(echo "$MEM_INFO" | awk '/^Mem:/ {print $2}')
        MEM_USED=$(echo "$MEM_INFO" | awk '/^Mem:/ {print $3}')
        SWAP_TOTAL=$(echo "$MEM_INFO" | awk '/^Swap:/ {print $2}')
        SWAP_USED=$(echo "$MEM_INFO" | awk '/^Swap:/ {print $3}')
        if [ -n "$MEM_TOTAL" ] && [ "$MEM_TOTAL" -gt 0 ] 2>/dev/null; then
            MEM_PCT=$((MEM_USED * 100 / MEM_TOTAL))
            if [ "$MEM_PCT" -lt 70 ]; then
                MEM_STATUS="pass"
                PASSED=$((PASSED + 1))
            elif [ "$MEM_PCT" -lt 85 ]; then
                MEM_STATUS="warning"
                WARNING=$((WARNING + 1))
            else
                MEM_STATUS="fail"
                FAILED=$((FAILED + 1))
            fi
            SWAP_DETAIL=""
            if [ -n "$SWAP_TOTAL" ] && [ "$SWAP_TOTAL" -gt 0 ] 2>/dev/null; then
                SWAP_DETAIL="Swap: ${SWAP_USED}M / ${SWAP_TOTAL}M"
            fi
            SWAP_DETAIL_ESC=$(json_escape "$SWAP_DETAIL")
            SYSTEM_ITEMS="$SYSTEM_ITEMS,
    {\"name\":\"内存\",\"status\":\"$MEM_STATUS\",\"value\":\"${MEM_USED}M / ${MEM_TOTAL}M (${MEM_PCT}%)\",\"detail\":\"$SWAP_DETAIL_ESC\"}"
            TOTAL=$((TOTAL + 1))
        fi
    fi
    
    # Disk
    DF_INFO=$(df -h / 2>/dev/null | tail -1)
    if [ -n "$DF_INFO" ]; then
        DISK_TOTAL=$(echo "$DF_INFO" | awk '{print $2}')
        DISK_USED=$(echo "$DF_INFO" | awk '{print $3}')
        DISK_AVAIL=$(echo "$DF_INFO" | awk '{print $4}')
        DISK_PCT=$(echo "$DF_INFO" | awk '{print $5}' | tr -d '%')
        if [ -n "$DISK_PCT" ] && [ "$DISK_PCT" -ge 0 ] 2>/dev/null; then
            if [ "$DISK_PCT" -lt 70 ]; then
                DISK_STATUS="pass"
                PASSED=$((PASSED + 1))
            elif [ "$DISK_PCT" -lt 85 ]; then
                DISK_STATUS="warning"
                WARNING=$((WARNING + 1))
            else
                DISK_STATUS="fail"
                FAILED=$((FAILED + 1))
            fi
            SYSTEM_ITEMS="$SYSTEM_ITEMS,
    {\"name\":\"磁盘 (根分区)\",\"status\":\"$DISK_STATUS\",\"value\":\"$DISK_USED / $DISK_TOTAL ($DISK_PCT%)\",\"detail\":\"剩余 $DISK_AVAIL\"}"
            TOTAL=$((TOTAL + 1))
        fi
    fi
    
    # 添加系统组
    GROUPS_JSON="$GROUPS_JSON
  {\"id\":\"system\",\"name\":\"系统基础\",\"items\":[$SYSTEM_ITEMS
  ]}"
    
    # ========== 2. Web 服务 ==========
    WEB_ITEMS=""
    
    # Nginx
    if has_cmd nginx; then
        NGINX_VER=$(nginx -v 2>&1 | grep -oE 'nginx/[0-9.]+' | head -1 | sed 's/nginx\///')
        if [ -z "$NGINX_VER" ]; then
            NGINX_VER="unknown"
        fi
        if pgrep_name nginx; then
            NGINX_STATUS="pass"
            NGINX_VALUE="$NGINX_VER · 运行中"
            PASSED=$((PASSED + 1))
        else
            NGINX_STATUS="warning"
            NGINX_VALUE="$NGINX_VER · 未运行"
            WARNING=$((WARNING + 1))
        fi
        NGINX_DETAIL=""
        # 同时统计 sites-enabled（Debian/Ubuntu 风格）和 conf.d（RHEL/CentOS/Arch 风格）
        SITES_SE=$(ls /etc/nginx/sites-enabled/ 2>/dev/null | grep -v '^default$' | wc -l)
        SITES_CD=$(ls /etc/nginx/conf.d/ 2>/dev/null | grep -E '\.(conf|conf\.disabled)$' | wc -l)
        SITES_COUNT=$((SITES_SE + SITES_CD))
        if [ "$SITES_COUNT" -gt 0 ] 2>/dev/null; then
            NGINX_DETAIL="$SITES_COUNT 个站点"
        fi
        NGINX_DETAIL_ESC=$(json_escape "$NGINX_DETAIL")
        WEB_ITEMS="$WEB_ITEMS
    {\"name\":\"Nginx\",\"status\":\"$NGINX_STATUS\",\"value\":\"$NGINX_VALUE\",\"detail\":\"$NGINX_DETAIL_ESC\"}"
        TOTAL=$((TOTAL + 1))
        
        # Nginx 配置检测
        NGINX_TEST=$(sudo nginx -t 2>&1)
        if echo "$NGINX_TEST" | grep -qiE "(test is successful|syntax is ok)"; then
            WEB_ITEMS="$WEB_ITEMS,
    {\"name\":\"Nginx 配置检测\",\"status\":\"pass\",\"value\":\"配置正确\",\"detail\":\"nginx -t 检测通过\"}"
            PASSED=$((PASSED + 1))
        elif [ -n "$NGINX_TEST" ]; then
            NGINX_ERR=$(echo "$NGINX_TEST" | grep -iE "(emerg|error)" | head -2 | tr '\n' ' ' | cut -c1-80)
            NGINX_ERR_ESC=$(json_escape "$NGINX_ERR")
            WEB_ITEMS="$WEB_ITEMS,
    {\"name\":\"Nginx 配置检测\",\"status\":\"fail\",\"value\":\"配置错误\",\"detail\":\"$NGINX_ERR_ESC\"}"
            FAILED=$((FAILED + 1))
        else
            WEB_ITEMS="$WEB_ITEMS,
    {\"name\":\"Nginx 配置检测\",\"status\":\"warning\",\"value\":\"无法检测\",\"detail\":\"nginx -t 执行失败，可能需要 sudo 权限\"}"
            WARNING=$((WARNING + 1))
        fi
        TOTAL=$((TOTAL + 1))
    else
        WEB_ITEMS="$WEB_ITEMS
    {\"name\":\"Nginx\",\"status\":\"fail\",\"value\":\"未安装\",\"detail\":\"\"}"
        FAILED=$((FAILED + 1))
        TOTAL=$((TOTAL + 1))
    fi
    
    # 添加 Web 组
    if [ -n "$WEB_ITEMS" ]; then
        if [ -n "$GROUPS_JSON" ]; then
            GROUPS_JSON="$GROUPS_JSON,"
        fi
        GROUPS_JSON="$GROUPS_JSON
  {\"id\":\"web\",\"name\":\"Web 服务\",\"items\":[$WEB_ITEMS
  ]}"
    fi
    
    # ========== 3. 端口监听 ==========
    PORT_ITEMS=""
    
    check_port() {
        local port=$1
        local name=$2
        local result=""
        if has_cmd ss; then
            result=$(ss -tlnp 2>/dev/null | grep -E ":${port}[[:space:]]" | head -1)
        elif has_cmd netstat; then
            result=$(netstat -tlnp 2>/dev/null | grep -E ":${port}[[:space:]]" | head -1)
        fi
        if [ -n "$result" ]; then
            PORT_ITEMS="$PORT_ITEMS
    {\"name\":\":${port} (${name})\",\"status\":\"pass\",\"value\":\"监听中\",\"detail\":\"${name}\"}"
            PASSED=$((PASSED + 1))
        else
            PORT_ITEMS="$PORT_ITEMS
    {\"name\":\":${port} (${name})\",\"status\":\"info\",\"value\":\"未监听\",\"detail\":\"\"}"
            INFO_COUNT=$((INFO_COUNT + 1))
        fi
        TOTAL=$((TOTAL + 1))
    }
    
    check_port 80 "HTTP"
    PORT_ITEMS="$PORT_ITEMS,"
    check_port 443 "HTTPS"
    
    # 添加端口组
    if [ -n "$GROUPS_JSON" ]; then
        GROUPS_JSON="$GROUPS_JSON,"
    fi
    GROUPS_JSON="$GROUPS_JSON
  {\"id\":\"ports\",\"name\":\"端口监听\",\"items\":[$PORT_ITEMS
  ]}"

    # ========== 4. SSL 证书 ==========
    if [ -n "$DOMAIN" ] && has_cmd openssl; then
        SSL_ITEMS=""
        CERT_RAW=$(echo | timeout 15 openssl s_client -servername "$DOMAIN" -connect "$DOMAIN:443" 2>/dev/null)
        
        if echo "$CERT_RAW" | grep -q "BEGIN CERTIFICATE"; then
            # 提取 PEM 证书到临时文件，避免管道传多行内容出问题
            CERT_TMP=$(mktemp /tmp/webcraft-cert-XXXXXX.pem 2>/dev/null)
            if [ -n "$CERT_TMP" ]; then
                echo "$CERT_RAW" | sed -n '/-----BEGIN CERTIFICATE-----/,/-----END CERTIFICATE-----/p' > "$CERT_TMP"
                
                ENDDATE=$(openssl x509 -in "$CERT_TMP" -noout -enddate 2>/dev/null | cut -d= -f2)
                ISSUER=$(openssl x509 -in "$CERT_TMP" -noout -issuer 2>/dev/null | sed -E 's/.*CN[[:space:]]*=[[:space:]]*//' | sed 's/,.*//')
                SUBJECT=$(openssl x509 -in "$CERT_TMP" -noout -subject 2>/dev/null | sed -E 's/.*CN[[:space:]]*=[[:space:]]*//' | sed 's/,.*//')
                SAN=$(openssl x509 -in "$CERT_TMP" -noout -ext subjectAltName 2>/dev/null | tail -1 | tr -d ' ')
                
                rm -f "$CERT_TMP"
            else
                # 降级：直接管道
                ENDDATE=$(echo "$CERT_RAW" | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
                ISSUER=$(echo "$CERT_RAW" | openssl x509 -noout -issuer 2>/dev/null | sed -E 's/.*CN[[:space:]]*=[[:space:]]*//' | sed 's/,.*//')
                SUBJECT=$(echo "$CERT_RAW" | openssl x509 -noout -subject 2>/dev/null | sed -E 's/.*CN[[:space:]]*=[[:space:]]*//' | sed 's/,.*//')
                SAN=""
            fi
            
            if [ -n "$ENDDATE" ]; then
                # 简单计算剩余天数（bash 方式，精度稍低但可用）
                END_TS=$(date -d "$ENDDATE" +%s 2>/dev/null)
                NOW_TS=$(date +%s)
                if [ -n "$END_TS" ] && [ "$END_TS" -gt 0 ] 2>/dev/null; then
                    DAYS_LEFT=$(( (END_TS - NOW_TS) / 86400 ))
                    if [ "$DAYS_LEFT" -gt 30 ]; then
                        SSL_STATUS="pass"
                        PASSED=$((PASSED + 1))
                    elif [ "$DAYS_LEFT" -gt 7 ]; then
                        SSL_STATUS="warning"
                        WARNING=$((WARNING + 1))
                    else
                        SSL_STATUS="fail"
                        FAILED=$((FAILED + 1))
                    fi
                    ENDDATE_SHORT=$(echo "$ENDDATE" | cut -c1-20)
                    ENDDATE_ESC=$(json_escape "$ENDDATE_SHORT")
                    SSL_ITEMS="$SSL_ITEMS
    {\"name\":\"证书有效期\",\"status\":\"$SSL_STATUS\",\"value\":\"剩余 ${DAYS_LEFT} 天\",\"detail\":\"到期: $ENDDATE_ESC\"}"
                    TOTAL=$((TOTAL + 1))
                fi
            fi
            
            if [ -n "$ISSUER" ]; then
                ISSUER_SHORT=$(echo "$ISSUER" | cut -c1-40)
                ISSUER_ESC=$(json_escape "$ISSUER_SHORT")
                SSL_ITEMS="$SSL_ITEMS,
    {\"name\":\"颁发者\",\"status\":\"info\",\"value\":\"$ISSUER_ESC\",\"detail\":\"\"}"
                TOTAL=$((TOTAL + 1))
                INFO_COUNT=$((INFO_COUNT + 1))
            fi
            
            # 域名优先用 SAN，没有再用 CN
            if [ -n "$SAN" ] && echo "$SAN" | grep -q "DNS:"; then
                # 取第一个 DNS 域名
                FIRST_DOMAIN=$(echo "$SAN" | sed 's/DNS://g' | tr ',' '\n' | head -1 | tr -d ' ')
                DNS_COUNT=$(echo "$SAN" | grep -o "DNS:" | wc -l)
                if [ -n "$FIRST_DOMAIN" ]; then
                    DOMAIN_ESC=$(json_escape "$FIRST_DOMAIN")
                    DOMAIN_DETAIL="共 ${DNS_COUNT} 个域名"
                    DETAIL_ESC=$(json_escape "$DOMAIN_DETAIL")
                    SSL_ITEMS="$SSL_ITEMS,
    {\"name\":\"证书域名\",\"status\":\"info\",\"value\":\"$DOMAIN_ESC\",\"detail\":\"$DETAIL_ESC\"}"
                    TOTAL=$((TOTAL + 1))
                    INFO_COUNT=$((INFO_COUNT + 1))
                fi
            elif [ -n "$SUBJECT" ]; then
                SUBJECT_ESC=$(json_escape "$SUBJECT")
                SSL_ITEMS="$SSL_ITEMS,
    {\"name\":\"证书域名\",\"status\":\"info\",\"value\":\"$SUBJECT_ESC\",\"detail\":\"\"}"
                TOTAL=$((TOTAL + 1))
                INFO_COUNT=$((INFO_COUNT + 1))
            fi
        else
            DOMAIN_ESC=$(json_escape "$DOMAIN")
            SSL_ITEMS="$SSL_ITEMS
    {\"name\":\"SSL 证书\",\"status\":\"fail\",\"value\":\"无法获取\",\"detail\":\"无法连接 ${DOMAIN_ESC}:443 或证书不存在\"}"
            FAILED=$((FAILED + 1))
            TOTAL=$((TOTAL + 1))
        fi
        
        if [ -n "$SSL_ITEMS" ]; then
            if [ -n "$GROUPS_JSON" ]; then
                GROUPS_JSON="$GROUPS_JSON,"
            fi
            GROUPS_JSON="$GROUPS_JSON
  {\"id\":\"ssl\",\"name\":\"SSL 证书\",\"items\":[$SSL_ITEMS
  ]}"
        fi
    fi
    
    # ========== 5. DNS 解析 ==========
    DNS_ITEMS=""
    if [ -n "$DOMAIN" ]; then
        # 获取服务器公网 IP
        SERVER_IP=$(curl -s4 --connect-timeout 5 ifconfig.me 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "")
        
        # DNS 解析（五级降级：dig → host → nslookup → getent → python3 socket）
        RESOLVED_IP=""
        if command -v dig >/dev/null 2>&1; then
            RESOLVED_IP=$(dig +short "$DOMAIN" A 2>/dev/null | grep -E '^[0-9]+\.' | head -1)
        fi
        if [ -z "$RESOLVED_IP" ] && command -v host >/dev/null 2>&1; then
            RESOLVED_IP=$(host -t A "$DOMAIN" 2>/dev/null | grep "has address" | head -1 | awk '{print $NF}')
        fi
        if [ -z "$RESOLVED_IP" ] && command -v nslookup >/dev/null 2>&1; then
            RESOLVED_IP=$(nslookup "$DOMAIN" 2>/dev/null | grep -E "^Address:?\s" | grep -v '#' | tail -1 | awk '{print $NF}')
        fi
        if [ -z "$RESOLVED_IP" ] && command -v getent >/dev/null 2>&1; then
            RESOLVED_IP=$(getent hosts "$DOMAIN" 2>/dev/null | awk '{print $1}' | grep -E '^[0-9]+\.' | head -1)
        fi
        if [ -z "$RESOLVED_IP" ] && command -v python3 >/dev/null 2>&1; then
            RESOLVED_IP=$(python3 -c "import socket,sys; print(socket.gethostbyname(sys.argv[1]))" "$DOMAIN" 2>/dev/null)
        fi
        
        DOMAIN_ESC=$(json_escape "$DOMAIN")
        if [ -n "$RESOLVED_IP" ]; then
            if [ -n "$SERVER_IP" ] && [ "$RESOLVED_IP" = "$SERVER_IP" ]; then
                DNS_ITEMS="{\"name\":\"DNS 解析 ($DOMAIN_ESC)\",\"status\":\"pass\",\"value\":\"解析到 $RESOLVED_IP\",\"detail\":\"与服务器 IP $SERVER_IP 匹配\"}"
                PASSED=$((PASSED + 1))
            elif [ -n "$SERVER_IP" ]; then
                DNS_ITEMS="{\"name\":\"DNS 解析 ($DOMAIN_ESC)\",\"status\":\"warning\",\"value\":\"解析到 $RESOLVED_IP\",\"detail\":\"与服务器 IP $SERVER_IP 不匹配（如使用 CDN 属正常）\"}"
                WARNING=$((WARNING + 1))
            else
                DNS_ITEMS="{\"name\":\"DNS 解析 ($DOMAIN_ESC)\",\"status\":\"warning\",\"value\":\"解析到 $RESOLVED_IP\",\"detail\":\"无法获取服务器公网 IP 进行比对\"}"
                WARNING=$((WARNING + 1))
            fi
        else
            DNS_ITEMS="{\"name\":\"DNS 解析 ($DOMAIN_ESC)\",\"status\":\"fail\",\"value\":\"无法解析\",\"detail\":\"DNS A 记录未配置或域名未注册\"}"
            FAILED=$((FAILED + 1))
        fi
        TOTAL=$((TOTAL + 1))
    else
        DNS_ITEMS="{\"name\":\"DNS 解析\",\"status\":\"info\",\"value\":\"未绑定域名\",\"detail\":\"部署后仅可通过服务器 IP 访问\"}"
        INFO_COUNT=$((INFO_COUNT + 1))
        TOTAL=$((TOTAL + 1))
    fi
    
    if [ -n "$DNS_ITEMS" ]; then
        if [ -n "$GROUPS_JSON" ]; then
            GROUPS_JSON="$GROUPS_JSON,"
        fi
        GROUPS_JSON="$GROUPS_JSON
  {\"id\":\"dns\",\"name\":\"DNS 解析\",\"items\":[$DNS_ITEMS
  ]}"
    fi
    
    # ========== 计算汇总 ==========
    SCORE_DENOM=$((PASSED + WARNING + FAILED))
    if [ "$SCORE_DENOM" -gt 0 ]; then
        SCORE=$(( (PASSED * 100 + WARNING * 60) / SCORE_DENOM ))
    else
        SCORE=0
    fi
    
    # 输出最终 JSON
    cat <<JSONEOF
{"summary":{"score":$SCORE,"total":$TOTAL,"passed":$PASSED,"warning":$WARNING,"failed":$FAILED,"info":$INFO_COUNT,"check_mode":"bash"},"groups":[$GROUPS_JSON
]}
JSONEOF
fi
"##.into(),
            parameters: vec![
                param("domain", "站点域名"),
                param("deploy_path", "部署路径"),
            ],
            danger_level: Safe,
            timeout_secs: 60,
            confirm_required: false,
            is_builtin: true,
            enabled: true,
            created_at: 0,
            updated_at: 0,
        },
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
        OpsScript {
            id: "ops-system-disk".into(),
            name: "磁盘空间".into(),
            description: "查看指定挂载点磁盘使用情况（df）".into(),
            category: "system".into(),
            icon: Some("hard-drive".into()),
            script: "df -h {{mount_point}}".into(),
            parameters: vec![select_param("mount_point", "挂载点", &["/", "/var", "/home"])],
            danger_level: Safe,
            timeout_secs: 30,
            confirm_required: false,
            is_builtin: true,
            enabled: true,
            created_at: 0,
            updated_at: 0,
        },
        OpsScript {
            id: "ops-system-mem".into(),
            name: "内存 / CPU 概览".into(),
            description: "查看内存占用、CPU 数与负载".into(),
            category: "system".into(),
            icon: Some("cpu".into()),
            script: "echo '== 内存 =='; free -h; echo; echo '== CPU/负载 =='; nproc; uptime".into(),
            parameters: vec![],
            danger_level: Safe,
            timeout_secs: 30,
            confirm_required: false,
            is_builtin: true,
            enabled: true,
            created_at: 0,
            updated_at: 0,
        },
        OpsScript {
            id: "ops-system-port".into(),
            name: "查看端口占用".into(),
            description: "列出监听指定端口的进程".into(),
            category: "system".into(),
            icon: Some("plug".into()),
            script: "ss -tlnp 2>/dev/null | grep -E ':({{port}})\\b' || (netstat -tlnp 2>/dev/null | grep '{{port}}' || echo '未发现端口占用')".into(),
            parameters: vec![param("port", "端口号")],
            danger_level: Safe,
            timeout_secs: 30,
            confirm_required: false,
            is_builtin: true,
            enabled: true,
            created_at: 0,
            updated_at: 0,
        },
        OpsScript {
            id: "ops-backup-tar".into(),
            name: "打包目录为 tar.gz".into(),
            description: "将源目录压缩为 tar.gz 归档".into(),
            category: "backup".into(),
            icon: Some("archive".into()),
            script: "tar -czf {{output_file}} -C \"$(dirname {{source_dir}})\" \"$(basename {{source_dir}})\"".into(),
            parameters: vec![
                param("source_dir", "源目录"),
                param("output_file", "输出文件名"),
            ],
            danger_level: Careful,
            timeout_secs: 300,
            confirm_required: true,
            is_builtin: true,
            enabled: true,
            created_at: 0,
            updated_at: 0,
        },
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
        // ---------- 数据库：PostgreSQL ----------
        OpsScript {
            id: "ops-db-pg-status".into(),
            name: "PostgreSQL 运行状态".into(),
            description: "检查 PostgreSQL 服务状态、连接数、版本".into(),
            category: "db".into(),
            icon: Some("database".into()),
            script: "echo '=== 服务状态 ==='; \
pg_isready -U {{pg_user}} -h {{pg_host}} -p {{pg_port}} 2>&1 && echo '✅ PostgreSQL 服务正常' || { echo '❌ PostgreSQL 不可达'; exit 1; }; \
echo ''; echo '=== 版本信息 ==='; \
psql -U {{pg_user}} -h {{pg_host}} -p {{pg_port}} -tc 'SELECT version();' 2>/dev/null | head -1 | sed 's/^[ ]*//'; \
echo ''; echo '=== 连接情况 ==='; \
psql -U {{pg_user}} -h {{pg_host}} -p {{pg_port}} -tc \"SELECT count(*) as connections FROM pg_stat_activity WHERE datname = '{{db_name}}';\" 2>/dev/null | awk 'NR==1{print \"当前连接数: \" $1}'; \
echo ''; echo '=== 数据库大小 ==='; \
psql -U {{pg_user}} -h {{pg_host}} -p {{pg_port}} -tc \"SELECT pg_size_pretty(pg_database_size('{{db_name}}'));\" 2>/dev/null | awk 'NR==1{print \"数据库大小: \" $1}'".into(),
            parameters: vec![
                param("pg_host", "主机"),
                param("pg_port", "端口"),
                param("pg_user", "用户名"),
                param("db_name", "数据库名"),
            ],
            danger_level: Safe,
            timeout_secs: 30,
            confirm_required: false,
            is_builtin: true,
            enabled: true,
            created_at: 0,
            updated_at: 0,
        },
        OpsScript {
            id: "ops-db-pg-backup".into(),
            name: "PostgreSQL 数据库备份".into(),
            description: "使用 pg_dump 备份指定数据库为 .sql 或 .sql.gz 文件".into(),
            category: "db".into(),
            icon: Some("archive".into()),
            script: "mkdir -p \"$(dirname '{{output_path}}')\"; \
if [ '{{format}}' = 'sql' ]; then \
  pg_dump -U {{pg_user}} -h {{pg_host}} -p {{pg_port}} -Fc '{{db_name}}' > '{{output_path}}' && echo '✅ 备份完成: {{output_path}}' && ls -lh '{{output_path}}' | awk '{print \"文件大小: \" $5}'; \
else \
  pg_dump -U {{pg_user}} -h {{pg_host}} -p {{pg_port}} -Fc '{{db_name}}' | gzip > '{{output_path}}' && echo '✅ 备份完成: {{output_path}}' && ls -lh '{{output_path}}' | awk '{print \"文件大小: \" $5}'; \
fi".into(),
            parameters: vec![
                param("pg_host", "主机"),
                param("pg_port", "端口"),
                param("pg_user", "用户名"),
                param("db_name", "数据库名"),
                param("output_path", "输出路径"),
                select_param("format", "备份格式", &["gz", "sql"]),
            ],
            danger_level: Careful,
            timeout_secs: 300,
            confirm_required: true,
            is_builtin: true,
            enabled: true,
            created_at: 0,
            updated_at: 0,
        },
        OpsScript {
            id: "ops-db-pg-restore".into(),
            name: "PostgreSQL 数据库恢复".into(),
            description: "从 .sql 或 .sql.gz 备份文件恢复数据库（危险操作）".into(),
            category: "db".into(),
            icon: Some("database".into()),
            script: "if [ ! -f '{{backup_path}}' ]; then echo '❌ 备份文件不存在: {{backup_path}}'; exit 1; fi; \
echo '⚠️  即将恢复数据库: {{db_name}}'; echo '备份文件: {{backup_path}}'; echo ''; \
if echo '{{backup_path}}' | grep -q '\\.gz$'; then \
  gunzip -c '{{backup_path}}' | psql -U {{pg_user}} -h {{pg_host}} -p {{pg_port}} -d '{{db_name}}' 2>&1 && echo '✅ 恢复完成'; \
else \
  psql -U {{pg_user}} -h {{pg_host}} -p {{pg_port}} -d '{{db_name}}' -f '{{backup_path}}' 2>&1 && echo '✅ 恢复完成'; \
fi".into(),
            parameters: vec![
                param("pg_host", "主机"),
                param("pg_port", "端口"),
                param("pg_user", "用户名"),
                param("db_name", "目标数据库"),
                param("backup_path", "备份文件路径"),
            ],
            danger_level: Dangerous,
            timeout_secs: 300,
            confirm_required: true,
            is_builtin: true,
            enabled: true,
            created_at: 0,
            updated_at: 0,
        },
        OpsScript {
            id: "ops-db-pg-slow".into(),
            name: "PostgreSQL 慢查询".into(),
            description: "查看执行时间最慢的 N 条 SQL 查询".into(),
            category: "db".into(),
            icon: Some("clock".into()),
            script: "psql -U {{pg_user}} -h {{pg_host}} -p {{pg_port}} -d '{{db_name}}' <<'EOF'\nSELECT \n  round(total_exec_time::numeric, 2) as total_ms,\n  calls,\n  round(mean_exec_time::numeric, 2) as mean_ms,\n  left(query, 120) as query\nFROM pg_stat_statements\nORDER BY mean_exec_time DESC\nLIMIT {{limit}};\nEOF".into(),
            parameters: vec![
                param("pg_host", "主机"),
                param("pg_port", "端口"),
                param("pg_user", "用户名"),
                param("db_name", "数据库名"),
                select_param("limit", "显示条数", &["10", "20", "50"]),
            ],
            danger_level: Safe,
            timeout_secs: 30,
            confirm_required: false,
            is_builtin: true,
            enabled: true,
            created_at: 0,
            updated_at: 0,
        },
        OpsScript {
            id: "ops-db-pg-vacuum".into(),
            name: "PostgreSQL VACUUM 分析".into(),
            description: "对指定数据库执行 VACUUM ANALYZE，优化查询性能".into(),
            category: "db".into(),
            icon: Some("hard-drive".into()),
            script: "echo '开始 VACUUM ANALYZE: {{db_name}} (模式: {{mode}})'; \
start_time=$(date +%s); \
if [ '{{mode}}' = 'full' ]; then \
  psql -U {{pg_user}} -h {{pg_host}} -p {{pg_port}} -d '{{db_name}}' -c 'VACUUM FULL ANALYZE;' 2>&1; \
else \
  psql -U {{pg_user}} -h {{pg_host}} -p {{pg_port}} -d '{{db_name}}' -c 'VACUUM ANALYZE;' 2>&1; \
fi; \
end_time=$(date +%s); \
echo \"✅ 完成，耗时 $((end_time - start_time)) 秒\"".into(),
            parameters: vec![
                param("pg_host", "主机"),
                param("pg_port", "端口"),
                param("pg_user", "用户名"),
                param("db_name", "数据库名"),
                select_param("mode", "模式", &["normal", "full"]),
            ],
            danger_level: Careful,
            timeout_secs: 600,
            confirm_required: true,
            is_builtin: true,
            enabled: true,
            created_at: 0,
            updated_at: 0,
        },
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
        OpsScript {
            id: "ops-redis-status".into(),
            name: "Redis 运行状态".into(),
            description: "检查 Redis 服务状态、版本、内存使用、连接数等信息".into(),
            category: "database".into(),
            icon: Some("database".into()),
            script: "if command -v redis-cli >/dev/null 2>&1; then \
  echo '=== Redis 服务状态 ==='; \
  if redis-cli -h {{redis_host}} -p {{redis_port}} -a '{{redis_password}}' ping 2>/dev/null | grep -q PONG; then \
    echo '状态: ✅ 运行中'; \
  else \
    echo '状态: ❌ 无法连接'; \
  fi; \
  echo ''; \
  echo '=== INFO 概览 ==='; \
  redis-cli -h {{redis_host}} -p {{redis_port}} -a '{{redis_password}}' INFO server 2>/dev/null | grep -E 'redis_version|os|tcp_port|process_id|uptime_in_days'; \
  echo ''; \
  redis-cli -h {{redis_host}} -p {{redis_port}} -a '{{redis_password}}' INFO memory 2>/dev/null | grep -E 'used_memory_human|used_memory_peak_human|maxmemory_human|mem_fragmentation_ratio'; \
  echo ''; \
  redis-cli -h {{redis_host}} -p {{redis_port}} -a '{{redis_password}}' INFO stats 2>/dev/null | grep -E 'total_connections_received|total_commands_processed|instantaneous_ops_per_sec|keyspace_hits|keyspace_misses'; \
  echo ''; \
  echo '=== Key 统计 ==='; \
  redis-cli -h {{redis_host}} -p {{redis_port}} -a '{{redis_password}}' INFO keyspace 2>/dev/null; \
else \
  echo '❌ redis-cli 未安装'; \
fi".into(),
            parameters: vec![
                param("redis_host", "主机"),
                param("redis_port", "端口"),
                param("redis_password", "密码"),
            ],
            danger_level: Safe,
            timeout_secs: 15,
            confirm_required: false,
            is_builtin: true,
            enabled: true,
            created_at: 0,
            updated_at: 0,
        },
        OpsScript {
            id: "ops-redis-flushdb".into(),
            name: "Redis 清空数据库".into(),
            description: "清空指定 Redis 数据库的所有 key（危险操作，请谨慎使用）".into(),
            category: "database".into(),
            icon: Some("archive".into()),
            script: "if command -v redis-cli >/dev/null 2>&1; then \
  echo '⚠️  即将清空 Redis DB {{redis_db}} 的所有数据！'; \
  echo ''; \
  KEY_COUNT=$(redis-cli -h {{redis_host}} -p {{redis_port}} -a '{{redis_password}}' -n {{redis_db}} DBSIZE 2>/dev/null); \
  echo \"当前 key 数量: $KEY_COUNT\"; \
  echo ''; \
  redis-cli -h {{redis_host}} -p {{redis_port}} -a '{{redis_password}}' -n {{redis_db}} FLUSHDB 2>&1; \
  echo ''; \
  echo '✅ 已清空'; \
  NEW_COUNT=$(redis-cli -h {{redis_host}} -p {{redis_port}} -a '{{redis_password}}' -n {{redis_db}} DBSIZE 2>/dev/null); \
  echo \"清空后 key 数量: $NEW_COUNT\"; \
else \
  echo '❌ redis-cli 未安装'; \
fi".into(),
            parameters: vec![
                param("redis_host", "主机"),
                param("redis_port", "端口"),
                param("redis_password", "密码"),
                param("redis_db", "数据库编号"),
            ],
            danger_level: Dangerous,
            timeout_secs: 30,
            confirm_required: true,
            is_builtin: true,
            enabled: true,
            created_at: 0,
            updated_at: 0,
        },
        OpsScript {
            id: "ops-redis-slowlog".into(),
            name: "Redis 慢查询".into(),
            description: "查看 Redis 慢查询日志，定位耗时命令".into(),
            category: "database".into(),
            icon: Some("clock".into()),
            script: "if command -v redis-cli >/dev/null 2>&1; then \
  echo '=== 慢查询配置 ==='; \
  redis-cli -h {{redis_host}} -p {{redis_port}} -a '{{redis_password}}' CONFIG GET slowlog-log-slower-than 2>/dev/null; \
  redis-cli -h {{redis_host}} -p {{redis_port}} -a '{{redis_password}}' CONFIG GET slowlog-max-len 2>/dev/null; \
  echo ''; \
  echo \"=== 最近 {{count}} 条慢查询 ===\"; \
  redis-cli -h {{redis_host}} -p {{redis_port}} -a '{{redis_password}}' SLOWLOG GET {{count}} 2>/dev/null; \
else \
  echo '❌ redis-cli 未安装'; \
fi".into(),
            parameters: vec![
                param("redis_host", "主机"),
                param("redis_port", "端口"),
                param("redis_password", "密码"),
                select_param("count", "显示条数", &["10", "20", "50"]),
            ],
            danger_level: Safe,
            timeout_secs: 15,
            confirm_required: false,
            is_builtin: true,
            enabled: true,
            created_at: 0,
            updated_at: 0,
        },
        OpsScript {
            id: "ops-redis-memory".into(),
            name: "Redis 内存分析".into(),
            description: "分析 Redis 内存使用、大 key 分布和碎片率".into(),
            category: "database".into(),
            icon: Some("pulse".into()),
            script: "if command -v redis-cli >/dev/null 2>&1; then \
  echo '=== 内存概览 ==='; \
  redis-cli -h {{redis_host}} -p {{redis_port}} -a '{{redis_password}}' INFO memory 2>/dev/null | grep -E 'used_memory_human|used_memory_rss_human|used_memory_peak_human|used_memory_lua_human|maxmemory_human|maxmemory_policy|mem_fragmentation_ratio'; \
  echo ''; \
  echo '=== 数据库 key 分布 ==='; \
  redis-cli -h {{redis_host}} -p {{redis_port}} -a '{{redis_password}}' INFO keyspace 2>/dev/null; \
  echo ''; \
  echo '=== 客户端连接 ==='; \
  redis-cli -h {{redis_host}} -p {{redis_port}} -a '{{redis_password}}' INFO clients 2>/dev/null | grep -E 'connected_clients|blocked_clients'; \
  echo ''; \
  echo '=== 统计信息 ==='; \
  redis-cli -h {{redis_host}} -p {{redis_port}} -a '{{redis_password}}' INFO stats 2>/dev/null | grep -E 'instantaneous_ops_per_sec|rejected_connections|evicted_keys|keyspace_hits|keyspace_misses'; \
else \
  echo '❌ redis-cli 未安装'; \
fi".into(),
            parameters: vec![
                param("redis_host", "主机"),
                param("redis_port", "端口"),
                param("redis_password", "密码"),
            ],
            danger_level: Safe,
            timeout_secs: 15,
            confirm_required: false,
            is_builtin: true,
            enabled: true,
            created_at: 0,
            updated_at: 0,
        },
        OpsScript {
            id: "ops-redis-restart".into(),
            name: "重启 Redis 服务".into(),
            description: "重启 Redis 服务并验证是否正常启动".into(),
            category: "database".into(),
            icon: Some("arrow-circular-clockwise".into()),
            script: "echo '正在重启 Redis 服务...'; \
if systemctl restart redis 2>/dev/null; then \
  echo '✅ systemctl restart redis 执行成功'; \
elif systemctl restart redis-server 2>/dev/null; then \
  echo '✅ systemctl restart redis-server 执行成功'; \
elif service redis-server restart 2>/dev/null; then \
  echo '✅ service redis-server restart 执行成功'; \
elif service redis restart 2>/dev/null; then \
  echo '✅ service redis restart 执行成功'; \
else \
  echo '❌ 重启失败，未找到 redis 服务'; \
  exit 1; \
fi; \
sleep 2; \
echo ''; \
echo '=== 验证服务状态 ==='; \
if command -v redis-cli >/dev/null 2>&1 && redis-cli -h {{redis_host}} -p {{redis_port}} -a '{{redis_password}}' ping 2>/dev/null | grep -q PONG; then \
  echo '✅ Redis 已启动并可正常连接'; \
  redis-cli -h {{redis_host}} -p {{redis_port}} -a '{{redis_password}}' INFO server 2>/dev/null | grep -E 'redis_version|uptime_in_seconds'; \
else \
  echo '⚠️  服务已重启但无法连接，请检查配置'; \
fi".into(),
            parameters: vec![
                param("redis_host", "主机"),
                param("redis_port", "端口"),
                param("redis_password", "密码"),
            ],
            danger_level: Careful,
            timeout_secs: 30,
            confirm_required: true,
            is_builtin: true,
            enabled: true,
            created_at: 0,
            updated_at: 0,
        },
    ]
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or_default()
}

/// 解析 SSH 连接信息
fn resolve_ssh(db: &Database, connection_id: &str) -> Result<SshConnectionInfo> {
    let conn = ConnectionRepo::get_by_id(db, connection_id)?
        .ok_or_else(|| Error::Cms(format!("服务器连接不存在: {}", connection_id)))?;
    serde_json::from_str(&conn.config_json)
        .map_err(|e| Error::Cms(format!("服务器连接配置解析失败: {}", e)))
}

/// shell 单引号转义
fn shell_escape(s: &str) -> String {
    s.replace('\'', "'\\''")
}

struct FileMeta {
    exists: bool,
    size: i64,
    mtime: i64,
    perm: String,
}

/// 解析文件元信息输出
fn parse_file_meta(output: &str) -> FileMeta {
    let mut meta = FileMeta {
        exists: false,
        size: 0,
        mtime: 0,
        perm: String::new(),
    };
    for line in output.lines() {
        if let Some(v) = line.strip_prefix("SIZE:") {
            meta.size = v.trim().parse().unwrap_or(0);
        } else if let Some(v) = line.strip_prefix("MTIME:") {
            meta.mtime = v.trim().parse().unwrap_or(0);
        } else if let Some(v) = line.strip_prefix("PERM:") {
            meta.perm = v.trim().to_string();
        } else if line.trim() == "EXISTS:yes" {
            meta.exists = true;
        }
    }
    meta
}

/// 根据证书路径猜测私钥路径
fn guess_key_path(cert_path: &str) -> String {
    // certbot 标准路径：/etc/letsencrypt/live/domain/fullchain.pem -> privkey.pem
    let p = cert_path.replace("fullchain.pem", "privkey.pem")
        .replace("cert.pem", "privkey.pem")
        .replace(".crt", ".key")
        .replace(".pem", ".key");
    if p != cert_path { p } else { format!("{}.key", cert_path) }
}

/// 根据证书路径猜测证书链路径
fn guess_chain_path(cert_path: &str) -> String {
    let p = cert_path.replace("cert.pem", "chain.pem")
        .replace(".crt", "-chain.crt");
    if p != cert_path { p } else { format!("{}.chain", cert_path) }
}

/// base64 编码（简单实现，避免额外依赖，无换行输出）
fn base64_encode(input: &str) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let bytes = input.as_bytes();
    let mut result = String::new();
    let mut i = 0;
    while i < bytes.len() {
        let b1 = bytes[i] as u32;
        let b2 = if i + 1 < bytes.len() { bytes[i + 1] as u32 } else { 0 };
        let b3 = if i + 2 < bytes.len() { bytes[i + 2] as u32 } else { 0 };
        let triple = (b1 << 16) | (b2 << 8) | b3;
        result.push(CHARS[((triple >> 18) & 0x3F) as usize] as char);
        result.push(CHARS[((triple >> 12) & 0x3F) as usize] as char);
        if i + 1 < bytes.len() {
            result.push(CHARS[((triple >> 6) & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
        if i + 2 < bytes.len() {
            result.push(CHARS[(triple & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
        i += 3;
    }
    // 单引号转义：base64 不含单引号，但为了安全还是做一次 shell 单引号转义
    // 注意：base64 只含 A-Za-z0-9+/=，不含单引号，所以这里不需要额外转义
    result
}