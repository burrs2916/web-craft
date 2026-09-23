import { invoke } from '@tauri-apps/api/core';
import type { OpsScript, OpsScriptRun, RemoteExecResult, RemoteFileItem, RemoteFileContent, CertInfo } from '../../proto/ops';

export function opsListScripts(category?: string): Promise<OpsScript[]> {
  return invoke<OpsScript[]>('ops_list_scripts', { category: category ?? null });
}

/** 参数以 HashMap<String,String> 传入，多选值用逗号拼接。 */
export function opsRunScript(
  id: string,
  params: Record<string, string>,
  connectionId: string,
): Promise<RemoteExecResult> {
  return invoke<RemoteExecResult>('ops_run_script', {
    id,
    payload: { params, connectionId },
  });
}

export function opsSaveScript(script: OpsScript): Promise<OpsScript> {
  return invoke<OpsScript>('ops_save_script', { script });
}

export function opsDeleteScript(id: string): Promise<void> {
  return invoke('ops_delete_script', { id });
}

export function opsToggleScript(id: string, enabled: boolean): Promise<void> {
  return invoke('ops_toggle_script', { id, enabled });
}

/** 脚本执行历史（审计留痕），可按脚本过滤。 */
export function opsScriptRuns(scriptId?: string, limit = 50): Promise<OpsScriptRun[]> {
  return invoke<OpsScriptRun[]>('ops_script_runs', { scriptId: scriptId ?? null, limit });
}

// ---------- 远程文件运维 ----------

/** 读取远程文件内容 */
export function opsReadFile(connectionId: string, path: string): Promise<RemoteFileContent> {
  return invoke<RemoteFileContent>('ops_read_file', { connectionId, path });
}

/** 写入远程文件（自动备份 .bak） */
export function opsWriteFile(connectionId: string, path: string, content: string): Promise<void> {
  return invoke('ops_write_file', { connectionId, path, content });
}

/** 列出远程目录内容 */
export function opsListDir(connectionId: string, path: string): Promise<RemoteFileItem[]> {
  return invoke<RemoteFileItem[]>('ops_list_dir', { connectionId, path });
}

/** 获取 SSL 证书信息 */
export function opsGetCertInfo(connectionId: string, certPath: string): Promise<CertInfo> {
  return invoke<CertInfo>('ops_get_cert_info', { connectionId, certPath });
}

export function remoteExec(
  connectionId: string,
  command: string,
  opts?: { cwd?: string; timeoutSecs?: number },
): Promise<RemoteExecResult> {
  return invoke<RemoteExecResult>('remote_exec', {
    connectionId,
    command,
    cwd: opts?.cwd ?? null,
    timeoutSecs: opts?.timeoutSecs ?? 60,
  });
}