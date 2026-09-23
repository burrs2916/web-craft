import { invoke } from '@tauri-apps/api/core';
import type {
  AutomationTask,
  TaskRun,
  TaskRunDetail,
  TaskRunStats,
} from '../../proto/automation';

export function automationListTasks(): Promise<AutomationTask[]> {
  return invoke<AutomationTask[]>('automation_list_tasks');
}

export function automationSaveTask(task: AutomationTask): Promise<AutomationTask> {
  return invoke<AutomationTask>('automation_save_task', { task });
}

export function automationDeleteTask(id: string): Promise<void> {
  return invoke('automation_delete_task', { id });
}

export function automationToggleTask(id: string, enabled: boolean): Promise<void> {
  return invoke('automation_toggle_task', { id, enabled });
}

export function automationRunTask(id: string): Promise<string> {
  return invoke<string>('automation_run_task', { id });
}

export function automationCancelRun(runId: string): Promise<boolean> {
  return invoke<boolean>('automation_cancel_run', { runId });
}

export function automationListRuns(opts?: {
  taskId?: string;
  status?: string;
  trigger?: string;
  limit?: number;
  offset?: number;
}): Promise<TaskRun[]> {
  return invoke<TaskRun[]>('automation_list_runs', {
    payload: {
      taskId: opts?.taskId ?? null,
      status: opts?.status ?? null,
      trigger: opts?.trigger ?? null,
      limit: opts?.limit ?? 50,
      offset: opts?.offset ?? 0,
    },
  });
}

export function automationGetStats(opts?: { taskId?: string }): Promise<TaskRunStats> {
  return invoke<TaskRunStats>('automation_get_stats', {
    payload: { taskId: opts?.taskId ?? null },
  });
}

export function automationGetRun(runId: string): Promise<TaskRunDetail | null> {
  return invoke<TaskRunDetail | null>('automation_get_run', { runId });
}

export function automationExportRun(
  runId: string,
  format: 'markdown' | 'json',
  path: string,
): Promise<number> {
  return invoke<number>('automation_export_run', { runId, format, path });
}

export function automationDeleteRun(runId: string): Promise<number> {
  return invoke<number>('automation_delete_run', { runId });
}

export function automationRerun(runId: string): Promise<string> {
  return invoke<string>('automation_rerun', { runId });
}