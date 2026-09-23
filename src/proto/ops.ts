/** 脚本危险等级，与 Rust 端 `Danger` 枚举 lowercase 对齐。 */
export type OpsDanger = 'safe' | 'careful' | 'dangerous';

/** 参数控件类型，与 Rust 端 `ParamKind` 枚举 camelCase 对齐。 */
export type ParamKind = 'text' | 'select' | 'multiSelect';

export interface ScriptParam {
  name: string;
  label: string;
  kind: ParamKind;
  defaultValue?: string;
  options: string[];
  required: boolean;
}

/** 与 Rust 端 `OpsScript` camelCase 序列化对齐。 */
export interface OpsScript {
  id: string;
  name: string;
  description: string;
  category: string;
  icon?: string | null;
  script: string;
  parameters: ScriptParam[];
  dangerLevel: OpsDanger;
  timeoutSecs: number;
  confirmRequired: boolean;
  isBuiltin: boolean;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

/** 远程执行结果，与 Rust 端 `RemoteExecResult` camelCase 对齐。 */
export interface RemoteExecResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  merged: boolean;
  durationMs: number;
  channel: string;
  truncated: boolean;
}

/** 运维脚本单次执行历史，与 Rust 端 `OpsScriptRun` camelCase 对齐。 */
export interface OpsScriptRun {
  id: string;
  scriptId: string;
  scriptName: string;
  category: string;
  connectionId: string;
  connectionName: string;
  commandRendered: string;
  paramsJson: string;
  status: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  merged: boolean;
  truncated: boolean;
  channel: string;
  dangerLevel: OpsDanger;
  durationMs: number;
  startedAt: number;
}

/** 远程文件/目录项 */
export interface RemoteFileItem {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modifiedAt: number;
  permissions: string;
  owner: string;
  group: string;
}

/** 远程文件内容 */
export interface RemoteFileContent {
  path: string;
  content: string;
  size: number;
  modifiedAt: number;
  permissions: string;
  isText: boolean;
}

/** SSL 证书信息 */
export interface CertInfo {
  certPath: string;
  keyPath: string;
  chainPath: string;
  subject: string;
  issuer: string;
  notBefore: number;
  notAfter: number;
  daysRemaining: number;
  domains: string[];
  fingerprint: string;
  exists: boolean;
}