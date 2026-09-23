export type EnvCheckStatus = 'pass' | 'warning' | 'fail' | 'info';

export interface EnvCheckItem {
  name: string;
  status: EnvCheckStatus;
  value: string;
  detail?: string;
}

export interface EnvCheckGroup {
  id: string;
  name: string;
  items: EnvCheckItem[];
}

export interface EnvCheckSummary {
  score: number;
  total: number;
  passed: number;
  warning: number;
  failed: number;
  info: number;
  /** 检测模式：python=完整版，bash=降级版 */
  check_mode?: 'python' | 'bash' | string;
}

export interface EnvCheckResult {
  summary: EnvCheckSummary;
  groups: EnvCheckGroup[];
}
