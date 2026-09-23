use std::collections::HashMap;
use std::sync::Arc;

use serde::Deserialize;
use tauri::State;

use crate::app::remote_exec_service::{RemoteExecRequest, RemoteExecResult, RemoteExecService};
use crate::app::ops_service::OpsService;
use crate::core::types::{CertInfo, OpsScript, OpsScriptRun, RemoteFileContent, RemoteFileItem, SshConnectionInfo};
use crate::infra::storage::connection_repo::ConnectionRepo;
use crate::infra::storage::database::Database;

/// L1 primitive command. Run an arbitrary remote command through the pooled
/// channel selection (ControlMaster → direct → PTY).
#[tauri::command(async)]
pub async fn remote_exec(
    connection_id: String,
    command: String,
    cwd: Option<String>,
    timeout_secs: Option<u64>,
    db: State<'_, Arc<Database>>,
    exec: State<'_, Arc<RemoteExecService>>,
) -> Result<RemoteExecResult, String> {
    let ssh = resolve_ssh(&db, &connection_id)?;
    let result = exec
        .execute(
            &ssh,
            RemoteExecRequest {
                connection_id,
                command,
                cwd,
                timeout_secs: timeout_secs.unwrap_or(crate::app::remote_exec_service::DEFAULT_TIMEOUT_SECS),
            },
        )
        .await;
    Ok(result)
}

/// L2: list scripts, optionally filtered by category.
#[tauri::command]
pub fn ops_list_scripts(
    category: Option<String>,
    db: State<'_, Arc<Database>>,
    ops: State<'_, Arc<OpsService>>,
) -> Result<Vec<OpsScript>, String> {
    ops.list(&db, category.as_deref()).map_err(|e| e.to_string())
}

/// L2: create or update a user script (builtins are read-only).
#[tauri::command]
pub fn ops_save_script(
    script: OpsScript,
    db: State<'_, Arc<Database>>,
    ops: State<'_, Arc<OpsService>>,
) -> Result<OpsScript, String> {
    ops.save(&db, script).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ops_delete_script(id: String, db: State<'_, Arc<Database>>, ops: State<'_, Arc<OpsService>>) -> Result<(), String> {
    ops.delete(&db, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ops_toggle_script(id: String, enabled: bool, db: State<'_, Arc<Database>>, ops: State<'_, Arc<OpsService>>) -> Result<(), String> {
    ops.toggle(&db, &id, enabled).map_err(|e| e.to_string())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunScriptPayload {
    pub params: HashMap<String, String>,
    pub connection_id: String,
}

/// L2: render the script with params and run it on the connection's server.
#[tauri::command(async)]
pub async fn ops_run_script(
    id: String,
    payload: RunScriptPayload,
    db: State<'_, Arc<Database>>,
    ops: State<'_, Arc<OpsService>>,
) -> Result<RemoteExecResult, String> {
    ops.run(&db, &id, &payload.params, &payload.connection_id)
        .await
        .map_err(|e| e.to_string())
}

/// L2: script execution history (audit trail). Pass `script_id` to narrow.
#[tauri::command]
pub fn ops_script_runs(
    script_id: Option<String>,
    limit: Option<i64>,
    db: State<'_, Arc<Database>>,
    ops: State<'_, Arc<OpsService>>,
) -> Result<Vec<OpsScriptRun>, String> {
    ops.run_history(&db, script_id.as_deref(), limit.unwrap_or(50))
        .map_err(|e| e.to_string())
}

fn resolve_ssh(db: &Database, connection_id: &str) -> Result<SshConnectionInfo, String> {
    let conn = ConnectionRepo::get_by_id(db, connection_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("服务器连接不存在: {}", connection_id))?;
    serde_json::from_str(&conn.config_json)
        .map_err(|e| format!("服务器连接配置解析失败: {}", e))
}

/// 读取远程文件内容
#[tauri::command(async)]
pub async fn ops_read_file(
    connection_id: String,
    path: String,
    db: State<'_, Arc<Database>>,
    ops: State<'_, Arc<OpsService>>,
) -> Result<RemoteFileContent, String> {
    ops.read_file(&db, &connection_id, &path)
        .await
        .map_err(|e| e.to_string())
}

/// 写入远程文件（自动备份）
#[tauri::command(async)]
pub async fn ops_write_file(
    connection_id: String,
    path: String,
    content: String,
    db: State<'_, Arc<Database>>,
    ops: State<'_, Arc<OpsService>>,
) -> Result<(), String> {
    ops.write_file(&db, &connection_id, &path, &content)
        .await
        .map_err(|e| e.to_string())
}

/// 列出远程目录内容
#[tauri::command(async)]
pub async fn ops_list_dir(
    connection_id: String,
    path: String,
    db: State<'_, Arc<Database>>,
    ops: State<'_, Arc<OpsService>>,
) -> Result<Vec<RemoteFileItem>, String> {
    ops.list_dir(&db, &connection_id, &path)
        .await
        .map_err(|e| e.to_string())
}

/// 获取 SSL 证书信息
#[tauri::command(async)]
pub async fn ops_get_cert_info(
    connection_id: String,
    cert_path: String,
    db: State<'_, Arc<Database>>,
    ops: State<'_, Arc<OpsService>>,
) -> Result<CertInfo, String> {
    ops.get_cert_info(&db, &connection_id, &cert_path)
        .await
        .map_err(|e| e.to_string())
}