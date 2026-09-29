import type { DeploymentStep, DeployStep } from '../../../proto/cms';

/** 部署「工作连续性」概览统计（基于 backend 全量统计，覆盖所有历史） */
export interface ContinuityOverview {
  total: number;
  successCount: number;
  failedCount: number;
  scheduledCount: number;
  consecutiveSuccess: number;
  successRate: number;
  autoRatio: number;
  lastScheduledAt: number | null;
  lastDeployedAt: number | null;
}

export interface DeployConfigPreview {
  remotePath: string;
  domain: string;
  enableNginx: boolean;
}

export interface EnvReadiness {
  score: number;
  passed: number;
  warning: number;
  failed: number;
  nginxOk: boolean;
  isReady: boolean;
}

export type DeployPhase = 'idle' | 'running' | 'success' | 'failed';

export type TriggerFilter = 'all' | 'manual' | 'scheduled' | 'rollback';

export interface TriggerCounts {
  all: number;
  manual: number;
  scheduled: number;
  rollback: number;
}

// 静态部署步骤（路线B：上传 dist/ 静态文件 → Nginx 提供服务 → HTTP 可达验证）；部署流程唯一模式。
export const BINARY_DEPLOY_STEPS: { key: DeployStep; label: string }[] = [
  { key: 'validate', label: '校验配置' },
  { key: 'precheck', label: '环境检测' },
  { key: 'config', label: '生成配置' },
  { key: 'upload', label: '上传静态文件' },
  { key: 'switch', label: '蓝绿切换' },
  { key: 'nginx', label: '配置 Nginx' },
  { key: 'verify', label: 'HTTP 可达检查' },
  { key: 'cleanup', label: '清理旧版本' },
  { key: 'done', label: '部署完成' },
];

export const STATUS_COLOR: Record<string, string> = {
  success: '#66BB6A',
  failed: '#EF5350',
  running: '#42A5F5',
  pending: '#FFA726',
};

export const STATUS_LABEL: Record<string, string> = {
  success: '成功',
  failed: '失败',
  running: '进行中',
  pending: '等待中',
};

export const MODE_LABEL: Record<string, string> = {
  simple: '精简版',
  full: '完整版',
};

export const TRIGGER_LABEL: Record<string, string> = {
  manual: '手动部署',
  scheduled: '定时任务',
  rollback: '回滚操作',
};

/** 部署完成系统通知（Tauri 原生通知，动态 import 避免 web 环境报错） */
export async function fireDeployNotification(title: string, body: string, _type: 'success' | 'error'): Promise<void> {
  try {
    const mod = await import('@tauri-apps/plugin-notification');
    let granted = false;
    try {
      granted = await mod.isPermissionGranted();
    } catch {
      granted = false;
    }
    if (!granted) {
      try {
        const perm = await mod.requestPermission();
        granted = perm === 'granted';
      } catch {
        granted = false;
      }
    }
    if (granted) {
      mod.sendNotification({ title, body });
    }
  } catch {
    /* not in Tauri context, ignore */
  }
}

export function formatRelativeTime(ts: number | null): string {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDuration(ms: number | null): string {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleString();
}

export function parseSteps(stepsJson: string): DeploymentStep[] {
  try {
    return JSON.parse(stepsJson) as DeploymentStep[];
  } catch {
    return [];
  }
}

export function parseLogs(logJson: string): string[] {
  try {
    return JSON.parse(logJson) as string[];
  } catch {
    return [];
  }
}