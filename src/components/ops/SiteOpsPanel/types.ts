import type { ConnectionConfig } from '../../../proto/connection';
import type { OpsTab } from './constants';

export interface SiteOpsPanelProps {
  connectionId: string;
  connections: ConnectionConfig[];
  /** 站点名，用于 AI 运维助手上下文。 */
  siteName?: string;
  /** 站点域名，用于 SSL 证书检测等。 */
  domain?: string;
  /** 远程部署路径，用于 AI 运维助手上下文。 */
  remotePath?: string;
  /** 初始选中的 Tab */
  initialTab?: OpsTab;
}