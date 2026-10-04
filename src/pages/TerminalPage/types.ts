/** 终端页标签模型：一个标签要么是终端会话，要么是 SFTP 会话。 */
export interface Tab {
  id: string;
  kind: 'terminal' | 'sftp';
  title: string;
  isActive: boolean;
  connectionType: 'local' | 'ssh';
  ssh?: { host: string; port: number; username: string; authMethod: string; privateKeyPath?: string; password?: string };
  disconnected?: boolean;
  profileId?: string;
  /** 来自既有 SSH 连接的 id，用于在连接管理页标记"使用中" */
  connectionId?: string;
}