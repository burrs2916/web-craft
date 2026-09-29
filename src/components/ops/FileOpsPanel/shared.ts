import {
  GearIcon,
  CertificateIcon,
  FolderIcon,
  HardDrivesIcon,
  TerminalIcon,
  FileTextIcon,
  ArrowClockwiseIcon,
  ShieldCheckIcon,
  ClockIcon,
  DatabaseIcon,
  ArchiveIcon,
  PulseIcon,
  CheckSquareIcon,
  CheckCircleIcon,
  MagnifyingGlassIcon,
  CpuIcon,
  PlugIcon,
} from '@phosphor-icons/react';
import type { OpsDanger } from '../../../proto/ops';

export type OpsCategory = 'nginx' | 'cert' | 'deploy' | 'system' | 'scripts';

export interface NginxQuickItem {
  name: string;
  path: string;
  type: 'file' | 'dir';
  desc: string;
}

/** 脚本按服务分组配置 */
export interface ScriptGroup {
  key: string;
  name: string;
  description: string;
  icon: typeof DatabaseIcon;
  category: string; // 所属主分类，用于分类过滤
  scriptIds: string[]; // 组内脚本ID（按显示顺序）
}

export const CATEGORIES: { key: OpsCategory; label: string; icon: typeof GearIcon; color: string }[] = [
  { key: 'nginx', label: 'Nginx 配置', icon: GearIcon, color: '#1976d2' },
  { key: 'cert', label: 'SSL 证书', icon: CertificateIcon, color: '#66BB6A' },
  { key: 'deploy', label: '部署文件', icon: FolderIcon, color: '#9c27b0' },
  { key: 'system', label: '系统文件', icon: HardDrivesIcon, color: '#ff9800' },
  { key: 'scripts', label: '运维脚本', icon: TerminalIcon, color: '#757575' },
];

// 常用系统文件快捷入口
export const SYSTEM_QUICK_FILES: NginxQuickItem[] = [
  { name: 'hosts', path: '/etc/hosts', type: 'file', desc: '主机名解析' },
  { name: 'crontab', path: '/etc/crontab', type: 'file', desc: '系统定时任务' },
  { name: 'resolv.conf', path: '/etc/resolv.conf', type: 'file', desc: 'DNS 配置' },
  { name: 'fstab', path: '/etc/fstab', type: 'file', desc: '磁盘挂载' },
];

// 脚本子分类
export const SCRIPT_CATEGORIES = [
  { key: 'all', label: '全部' },
  { key: 'web', label: '网站服务' },
  { key: 'cert', label: '证书管理' },
  { key: 'system', label: '系统运维' },
  { key: 'db', label: '数据库' },
  { key: 'backup', label: '备份' },
  { key: 'deploy', label: '部署' },
];

export const SCRIPT_GROUPS: ScriptGroup[] = [
  {
    key: 'nginx',
    name: 'Nginx 服务',
    description: 'Nginx 配置检查、重启、日志查看',
    icon: GearIcon,
    category: 'web',
    scriptIds: [
      'ops-web-nginx-reload',
      'ops-web-nginx-test',
      'ops-web-nginx-access',
      'ops-web-nginx-error',
      'ops-web-env-check',
    ],
  },
  {
    key: 'cert',
    name: 'SSL 证书',
    description: '证书续期、到期时间查询',
    icon: CertificateIcon,
    category: 'cert',
    scriptIds: [
      'ops-cert-renew',
      'ops-cert-expiry',
    ],
  },
  {
    key: 'postgresql',
    name: 'PostgreSQL',
    description: 'PostgreSQL 数据库运维操作',
    icon: DatabaseIcon,
    category: 'db',
    scriptIds: [
      'ops-db-pg-status',
      'ops-db-pg-backup',
      'ops-db-pg-restore',
      'ops-db-pg-slow',
      'ops-db-pg-vacuum',
    ],
  },
  {
    key: 'redis',
    name: 'Redis',
    description: 'Redis 缓存服务运维操作',
    icon: HardDrivesIcon,
    category: 'db',
    scriptIds: [
      'ops-redis-status',
      'ops-redis-memory',
      'ops-redis-slowlog',
      'ops-redis-restart',
      'ops-redis-flushdb',
    ],
  },
  {
    key: 'backend',
    name: '后端服务',
    description: '后端应用服务状态、重启、日志',
    icon: CpuIcon,
    category: 'system',
    scriptIds: [
      'ops-service-status',
      'ops-service-restart',
      'ops-service-logs',
    ],
  },
  {
    key: 'system',
    name: '系统监控',
    description: '磁盘、内存、CPU、端口等系统信息',
    icon: PulseIcon,
    category: 'system',
    scriptIds: [
      'ops-system-disk',
      'ops-system-mem',
      'ops-system-port',
    ],
  },
  {
    key: 'backup',
    name: '备份工具',
    description: '目录打包、文件备份',
    icon: ArchiveIcon,
    category: 'backup',
    scriptIds: [
      'ops-backup-tar',
    ],
  },
  {
    key: 'deploy',
    name: '部署检查',
    description: '部署后健康检查与验证',
    icon: CheckCircleIcon,
    category: 'deploy',
    scriptIds: [
      'ops-deploy-health',
    ],
  },
];

export const DANGER_COLOR: Record<OpsDanger, string> = {
  safe: '#66BB6A',
  careful: '#FFA726',
  dangerous: '#EF5350',
};

export const SCRIPT_ICON_MAP: Record<string, typeof FileTextIcon> = {
  'shield-check': ShieldCheckIcon,
  clock: ClockIcon,
  'hard-drive': HardDrivesIcon,
  database: DatabaseIcon,
  archive: ArchiveIcon,
  pulse: PulseIcon,
  'file-text': FileTextIcon,
  'arrow-circular-clockwise': ArrowClockwiseIcon,
  'check-square': CheckSquareIcon,
  'magnifying-glass': MagnifyingGlassIcon,
  cpu: CpuIcon,
  plug: PlugIcon,
};

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDate(ts: number): string {
  if (!ts) return '—';
  const d = new Date(ts * 1000);
  return d.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}