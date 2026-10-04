import type { ConnectionConfig } from '../../../proto';

export interface DeployPanelProps {
  connectionId: string;
  /** 当前运维中心所有连接（用于「打开服务器终端」解析 SSH 信息） */
  connections?: ConnectionConfig[];
  /** 点击「去环境检测修复」时回调 */
  onGoToEnvCheck?: () => void;
  /** 是否自动打开第一个站点的部署弹窗（从环境检测页跳转过来时用） */
  autoDeployFirst?: boolean;
  /** 自动打开后回调，用于重置父组件状态 */
  onAutoOpened?: () => void;
}