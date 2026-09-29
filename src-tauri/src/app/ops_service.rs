//! L2 ops-script library: parameterised, reusable remote-ops scripts.
//!
//! Execution always flows through L1 remote-exec: render the script template
//! (shell-safe param substitution) → resolve the connection → run.

use std::collections::HashMap;
use std::sync::Arc;

use serde_json::{json, Value};

use crate::app::remote_exec_service::{RemoteExecRequest, RemoteExecResult, RemoteExecService};
use crate::core::error::{Error, Result};
use crate::core::types::{CertInfo, OpsScript, OpsScriptRun, RemoteFileContent, RemoteFileItem, SshConnectionInfo};
use crate::infra::logging::debug_log;
use crate::infra::storage::connection_repo::ConnectionRepo;
use crate::infra::storage::database::Database;
use crate::infra::storage::ops_script_repo::{OpsScriptRepo, OpsScriptRunRepo};

mod builtin_scripts;

use self::builtin_scripts::builtin_scripts;

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