/**
 * 终端 / SFTP 标签会话的跨重启恢复（本地持久化，localStorage）。
 *
 * 安全约定：绝不落盘 SSH 密码。因此：
 *  - 写侧统一剔除 ssh.password；
 *  - 读侧防御性剔除，避免遗留脏数据进入内存。
 * 恢复侧因此只能自动重建「本地终端」与「私钥/无密码」SSH 会话，密码会话需用户重连。
 */

const STORAGE_KEY = 'wc.terminal.tabs';

export type TabKind = 'terminal' | 'sftp';

/** 可持久化的最少标签元数据（忽略 isActive / 运行态）。 */
export interface PersistedTerminalTab {
  kind: TabKind;
  connectionType: 'local' | 'ssh';
  title: string;
  connectionId?: string;
  /** 仅保存非敏感字段；password 永不落盘 */
  ssh?: {
    host: string;
    port: number;
    username: string;
    authMethod: string;
    privateKeyPath?: string;
  };
}

/** 从 Tab（含运行态）提取可持久化、且剔除密码的描述。 */
export function tabToPersisted(tab: {
  kind?: TabKind;
  connectionType: 'local' | 'ssh';
  title: string;
  connectionId?: string;
  ssh?: {
    host: string;
    port: number;
    username: string;
    authMethod: string;
    privateKeyPath?: string;
    password?: string;
  };
}): PersistedTerminalTab {
  return {
    kind: tab.kind ?? 'terminal',
    connectionType: tab.connectionType,
    title: tab.title,
    connectionId: tab.connectionId,
    ssh: tab.ssh
      ? {
          host: tab.ssh.host,
          port: tab.ssh.port,
          username: tab.ssh.username,
          authMethod: tab.ssh.authMethod,
          privateKeyPath: tab.ssh.privateKeyPath,
        }
      : undefined,
  };
}

export function readPersistedTabs(): PersistedTerminalTab[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as (PersistedTerminalTab & { kind?: TabKind })[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((t) => t && t.connectionType)
      .map((t) => ({
        kind: t.kind ?? 'terminal',
        connectionType: t.connectionType,
        title: t.title || '',
        connectionId: t.connectionId,
        ssh: t.ssh
          ? {
              host: t.ssh.host,
              port: t.ssh.port,
              username: t.ssh.username,
              authMethod: t.ssh.authMethod,
              privateKeyPath: t.ssh.privateKeyPath,
            }
          : undefined,
      }));
  } catch {
    return [];
  }
}

export function savePersistedTabs(tabs: PersistedTerminalTab[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
  } catch {
    /* 存储不可用时静默降级，不影响终端使用 */
  }
}

/** 密码认证的 SSH 会话：密码不落盘，无法安全自动重连。 */
export function canAutoRestore(tab: PersistedTerminalTab): boolean {
  if (tab.connectionType === 'local') return true;
  return (tab.ssh?.authMethod ?? 'password') !== 'password';
}
