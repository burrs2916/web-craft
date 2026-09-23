/**
 * sprayLogStore — 喷雾控制「本地指令流」全局单例
 *
 * 从 SprayControlToolbarRenderer 自带的 SprayControlLog（前端内存日志）中抽离：
 * 原实现把指令记录放在工具栏组件内的 useState，刷新即丢、且无法被日志监控视图消费。
 * 抽成全局 zustand store 后：
 *   1) 工具栏下发指令时 pushLog → 写入本 store（不再本地私有）
 *   2) 日志监控视图的「操作日志」表格顶部接入"本会话本地指令"浮条，实时展示
 *      "我刚下发了什么、成功没"，与后端 operation_logs 历史记录互补。
 *
 * 数据语义（与 SprayControlLog 保持一致）：
 *   - 纯前端内存，不落库、不查后端；刷新页面即清空（后端历史由 log-monitor/operations 兜底）。
 *   - 仅记录本会话喷雾控制工具栏下发的指令（强喷/强停/循环喷/获取参数/参数设置/工作时间等）。
 */
import { create } from "zustand";

// ─── 类型（原 SprayControlLog.LogEntry）──

export type ControlAction =
  | "forceSpray" | "forceStop" | "autoMode"
  | "fetchParams" | "loopStart" | "loopStop"
  | "setSprayParams" | "setWorkTime";

export interface LogEntry {
  id: number;
  time: string;        // HH:MM:SS
  timestamp: number;   // Unix ms
  action: ControlAction | "selectAll" | "selectNone" | "selectGroup";
  commandCode: string; // "0619" / "061b" / "0613" / "-"
  targetMains: string[];
  targetSubs: string[];
  payload: Record<string, unknown> | null;
  result: "ok" | "fail" | "partial" | "pending";
  responses: Array<{ deviceId: string; success: boolean; code: number; msg: string }>;
  durationMs: number;
  message: string;
  sceneMode: string;
}

// ─── 常量（原 SprayControlLog）──

export const MAX_LOGS = 50;

/** 选择操作（非指令）的 commandCode 标记 */
export const NON_COMMAND_CODE = "-";

export const ACTION_LABELS: Record<string, string> = {
  forceSpray: "强喷", forceStop: "强停", autoMode: "自动",
  fetchParams: "获取参数", loopStart: "循环喷", loopStop: "停循环",
  setSprayParams: "喷雾参数", setWorkTime: "工作时间",
  selectAll: "全选在线", selectNone: "全不选", selectGroup: "按集控分组选",
};

export const RESULT_META: Record<string, { color: string; label: string }> = {
  ok:      { color: "#4ade80", label: "成功" },
  partial: { color: "#facc15", label: "部分失败" },
  fail:    { color: "#f87171", label: "失败" },
  pending: { color: "#94a3b8", label: "等待中" },
};

// ─── Store ───

interface SprayLogState {
  logs: LogEntry[];
  pushLog: (entry: Omit<LogEntry, "id" | "time" | "timestamp">) => void;
  clearLogs: () => void;
}

let logIdCounter = 0;

export const useSprayLogStore = create<SprayLogState>((set) => ({
  logs: [],
  pushLog: (entry) =>
    set((state) => {
      const now = new Date();
      const next: LogEntry = {
        ...entry,
        id: ++logIdCounter,
        time: now.toLocaleTimeString("zh-CN", { hour12: false }),
        timestamp: now.getTime(),
      };
      return { logs: [next, ...state.logs].slice(0, MAX_LOGS) };
    }),
  clearLogs: () => set({ logs: [] }),
}));

/**
 * 兼容旧调用：保留 useSprayControlLog 名称与签名，内部代理全局 store。
 * 工具栏所有 pushLog 调用点无需改动。
 */
export function useSprayControlLog() {
  const logs = useSprayLogStore((s) => s.logs);
  const pushLog = useSprayLogStore((s) => s.pushLog);
  const clearLogs = useSprayLogStore((s) => s.clearLogs);
  return { logs, pushLog, clearLogs };
}

/** 直接取 pushLog（无需订阅 logs，避免无谓重渲染） */
export function getPushLog(): (entry: Omit<LogEntry, "id" | "time" | "timestamp">) => void {
  return useSprayLogStore.getState().pushLog;
}
