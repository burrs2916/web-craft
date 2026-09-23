// L3 任务编排前端类型。AutomationTask / TaskRun / TaskRunStep 使用 snake_case
// 字段（Rust 端未设 rename_all）；TaskStep 及 RetryConfig 使用 camelCase。

export type StepTypeValue =
  | 'local_build'
  | 'sftp_transfer'
  | 'remote_exec'
  | 'local_shell'
  | 'delay'
  | 'deploy'
  | 'http';

export type StepConditionValue = 'on_fail' | 'on_success' | 'always';

export interface RetryConfig {
  maxAttempts: number;
  backoffSecs: number;
}

export interface TaskStep {
  id: string;
  name: string;
  /** 步骤类型，序列化为 JSON 的 `type` 字段。 */
  type: StepTypeValue;
  condition?: StepConditionValue | null;
  continueOnFail: boolean;
  retry?: RetryConfig | null;
  timeoutSecs?: number | null;
  // remote_exec / local_shell
  command?: string | null;
  // sftp_transfer
  localPath?: string | null;
  remotePath?: string | null;
  direction?: string | null;
  // delay
  seconds?: number | null;
  // assertions
  expectStdout?: string | null;
  expectStderr?: string | null;
  expectExitCode?: number | null;
  // deploy
  siteId?: string | null;
  // http
  httpUrl?: string | null;
  httpMethod?: string | null;
  httpBody?: string | null;
  httpHeaders?: string | null;
  expectStatusCode?: number | null;
}

export interface AutomationTask {
  id: string;
  name: string;
  description: string;
  connection_ids: string[];
  steps: TaskStep[];
  retry?: RetryConfig | null;
  notify: boolean;
  run_on_startup: boolean;
  enabled: boolean;
  last_run_at?: number | null;
  last_run_status?: string | null;
  created_at: number;
  updated_at: number;
  // 周期调度（保证工作连续性）
  schedule_kind?: string; // 'off' | 'interval' | 'daily' | 'hourly'
  schedule_interval_secs?: number;
  schedule_at_minute?: number;
  next_run_at?: number | null;
}

export type RunStatus = 'running' | 'success' | 'failed' | 'cancelled';
export type StepStatus = 'running' | 'success' | 'failed' | 'skipped';

export interface TaskRun {
  id: string;
  task_id: string;
  trigger_type: string;
  connection_id?: string | null;
  status: RunStatus;
  started_at: number;
  finished_at?: number | null;
  duration_ms?: number | null;
  error_summary: string;
}

export interface TaskRunStep {
  id: string;
  run_id: string;
  step_index: number;
  step_id: string;
  step_type: string;
  command_rendered: string;
  status: StepStatus;
  exit_code?: number | null;
  stdout: string;
  stderr: string;
  assertion_passed?: boolean | null;
  attempt: number;
  duration_ms: number;
}

export interface TaskRunDetail {
  run: TaskRun;
  steps: TaskRunStep[];
}

export interface TaskRunStats {
  totalRuns: number;
  successRuns: number;
  failedRuns: number;
  cancelledRuns: number;
  avgDurationMs: number;
  last7Days: TaskRunDailyStat[];
}

export interface TaskRunDailyStat {
  date: string;
  total: number;
  success: number;
  failed: number;
}