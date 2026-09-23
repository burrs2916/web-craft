/**
 * logMonitorApi — 日志监控视图专用后端 API
 *
 * 设计目标：
 * - 与 historyApi **物理隔离**，仅服务于"日志监控"视图，避免污染通用 `/api/history/*` 调用方。
 * - DTO 与 edge-conductor 侧 `dto::log_monitor::request::*` 一一对应：
 *     POST /api/history/log-monitor/operations
 *     POST /api/history/log-monitor/events
 *     POST /api/history/log-monitor/system
 *     POST /api/history/log-monitor/sensors
 *
 * 复用约束：
 * - HTTP baseUrl / headers 解析复用 `historyApi` 的 `getBackendConfig()`（同源）。
 * - 响应字段归一化复用 `historyApi` 的 `normalizeResponse` / `normalizeRecord`
 *   （既有契约：data/items/rows/records/logs/events/points 兼容，ts→timestamp 映射）。
 *
 * 重用保证：
 * - `historyApi.ts` 与 `logQueryStore` **一行不动**；本文件**不**从 `logQueryStore` 取任何状态。
 */
import {
  useDeviceStore,
} from "../store/deviceStore";
import { useDataSourceStore } from "../store/datasourceStore";
import { logger } from "../utils/logger";

// ═══════════════════════════════════════════════════════════════════
// 场景作用域 DTO（与 edge-conductor dto::log_monitor::request::LogScope 对齐）
// ═══════════════════════════════════════════════════════════════════

/**
 * 场景作用域枚举。
 * - `{ mode: "global" }`                                全矿（与 device_id 缺失等价）
 * - `{ mode: "scene", device_ids: ["a","b"] }`         仅查这一组设备（SQL: device_id IN (...)）
 */
export type LogScope =
  | { mode: "global" }
  | { mode: "scene"; device_ids: string[] };

const SCOPE_GLOBAL: LogScope = { mode: "global" };

const emptyDeviceIds = (s: LogScope): string[] | undefined => {
  if (s.mode === "scene" && s.device_ids.length > 0) return s.device_ids;
  return undefined;
};

// ═══════════════════════════════════════════════════════════════════
// 4 个端点的 Request DTO
// ═══════════════════════════════════════════════════════════════════

export interface LogMonitorOperationsParams {
  from: string;
  to: string;
  scope: LogScope;
  action?: string;
  result?: string;
  /** 命令码过滤（如 0x0619 / 0x061b / 0x0628 喷雾触发类） */
  commandCode?: string;
  limit?: number;
  offset?: number;
}

export interface LogMonitorEventsParams {
  from: string;
  to: string;
  scope: LogScope;
  type?: string;
  level?: string;
  limit?: number;
  offset?: number;
}

export interface LogMonitorSystemParams {
  from: string;
  to: string;
  type?: string;
  level?: string;
  module?: string;
  limit?: number;
  offset?: number;
}

export interface LogMonitorSensorsParams {
  from: string;
  to: string;
  scope: LogScope;
  type?: string;
  agg?: string;
  step?: string;
  limit?: number;
  offset?: number;
}

// ═══════════════════════════════════════════════════════════════════
// 响应类型 —— 直接复用 historyApi 既有命名（前端字段不变）
// ═══════════════════════════════════════════════════════════════════

import type {
  OperationHistoryResponse,
  EventHistoryResponse,
  SystemHistoryResponse,
  SensorHistoryResponse,
  ExportParams,
} from "./historyApi";

// ═══════════════════════════════════════════════════════════════════
// 后端 baseUrl / headers 复用（与 historyApi 同源）
// ═══════════════════════════════════════════════════════════════════

interface BackendConfig {
  baseUrl: string;
  headers: Record<string, string>;
}

/**
 * 与 historyApi.getBackendConfig 行为一致 —— 单源优先 activeDataSourceId（仅 HTTP），
 * 否则回退到第一个 HTTP 数据源（边缘计算 localhost:8084）。
 * 此处 inline 一份是为了**避免循环依赖 historyApi ↔ logMonitorApi**。
 */
function getBackendConfig(): BackendConfig | null {
  const dsStore = useDataSourceStore.getState();
  const all = dsStore.dataSources ?? [];
  const activeId = useDeviceStore.getState().activeDataSourceId;
  const activeDs = activeId ? dsStore.getDataSource(activeId) : undefined;
  const isHttp = (ds?: { connection?: { url?: string } }) =>
    !!ds?.connection?.url && /^https?:\/\//i.test(ds.connection.url);
  const ds =
    (isHttp(activeDs) ? activeDs : undefined) ?? all.find((d) => isHttp(d));
  if (!ds) return null;
  const baseUrl = (ds.connection.url ?? "").replace(/\/+$/, "");
  const headers: Record<string, string> = {};
  (ds.connection.headers ?? [])
    .filter((h) => h.enabled && h.key)
    .forEach((h) => {
      if (h.key) headers[h.key] = h.value ?? "";
    });
  return { baseUrl, headers };
}

/** 统一 POST JSON —— 与 historyApi 的 postJson 等价 */
async function postJson<T>(path: string, body: unknown): Promise<T> {
  const cfg = getBackendConfig();
  if (!cfg) {
    throw new Error("未配置数据源，无法查询日志监控数据");
  }
  const url = `${cfg.baseUrl}${path}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { ...cfg.headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(
      `HTTP ${resp.status}: ${resp.statusText}${text ? ` - ${text}` : ""}`,
    );
  }
  return (await resp.json()) as T;
}

// ═══════════════════════════════════════════════════════════════════
// 兼容响应的归一化（与 historyApi 的契约一致，避免重复实现）
// ═══════════════════════════════════════════════════════════════════

function normalizeResponse<T>(raw: unknown): { data: T[]; total: number | undefined } {
  if (Array.isArray(raw)) {
    return { data: raw as T[], total: raw.length };
  }
  const obj = raw as Record<string, unknown> | null;
  if (!obj || typeof obj !== "object") return { data: [], total: undefined };
  const data = (obj.data
    ?? obj.items
    ?? obj.rows
    ?? obj.records
    ?? obj.logs
    ?? obj.events
    ?? obj.points
    ?? []) as unknown[];
  let total: number | undefined;
  if (typeof obj.total === "number") total = obj.total;
  else if (typeof obj.count === "number") total = obj.count;
  else if (Array.isArray(data)) total = data.length;
  return { data: data as T[], total };
}

// ═══════════════════════════════════════════════════════════════════
// API 导出函数
// ═══════════════════════════════════════════════════════════════════

/** POST /api/history/log-monitor/operations —— 按场景设备池查询操作日志 */
export async function queryLogMonitorOperations(
  params: LogMonitorOperationsParams,
): Promise<OperationHistoryResponse> {
  try {
    const raw = await postJson<unknown>(
      "/api/history/log-monitor/operations",
      {
        from: params.from,
        to: params.to,
        scope: params.scope,
        action: params.action,
        result: params.result,
        command_code: params.commandCode,
        limit: params.limit,
        offset: params.offset,
      },
    );
    const { data, total } = normalizeResponse<unknown>(raw);
    return {
      data: data as OperationHistoryResponse["data"],
      total: typeof total === "number" ? total : data.length,
    };
  } catch (err) {
    logger.error("logMonitorApi", "queryLogMonitorOperations failed", {
      error: err,
      params,
    });
    throw err;
  }
}

/** POST /api/history/log-monitor/events —— 按场景设备池查询设备事件 */
export async function queryLogMonitorEvents(
  params: LogMonitorEventsParams,
): Promise<EventHistoryResponse> {
  try {
    const raw = await postJson<unknown>("/api/history/log-monitor/events", {
      from: params.from,
      to: params.to,
      scope: params.scope,
      type: params.type,
      level: params.level,
      limit: params.limit,
      offset: params.offset,
    });
    const { data, total } = normalizeResponse<unknown>(raw);
    return {
      data: data as EventHistoryResponse["data"],
      total: typeof total === "number" ? total : data.length,
    };
  } catch (err) {
    logger.error("logMonitorApi", "queryLogMonitorEvents failed", {
      error: err,
      params,
    });
    throw err;
  }
}

/**
 * POST /api/history/log-monitor/events —— 概览卡统计专用（足量样本）
 *
 * 与 `queryLogMonitorEvents` 同源，但固定大 limit（默认 1000）且不计偏移，
 * 仅用于概览卡"近24h故障/重要告警"统计，避免只看表格分页的 20 条导致统计失真。
 * 不进入表格分页数据。
 */
export async function queryLogMonitorEventsForStats(
  params: LogMonitorEventsParams & { statsLimit?: number },
): Promise<EventHistoryResponse> {
  try {
    const raw = await postJson<unknown>("/api/history/log-monitor/events", {
      from: params.from,
      to: params.to,
      scope: params.scope,
      type: params.type,
      level: params.level,
      limit: params.statsLimit ?? 1000,
      offset: 0,
    });
    const { data, total } = normalizeResponse<unknown>(raw);
    return {
      data: data as EventHistoryResponse["data"],
      total: typeof total === "number" ? total : data.length,
    };
  } catch (err) {
    logger.error("logMonitorApi", "queryLogMonitorEventsForStats failed", {
      error: err,
      params,
    });
    throw err;
  }
}

/** POST /api/history/log-monitor/system —— 全局系统事件（与 scene 无关，前端 badge 标识） */
export async function queryLogMonitorSystem(
  params: LogMonitorSystemParams,
): Promise<SystemHistoryResponse> {
  try {
    const raw = await postJson<unknown>("/api/history/log-monitor/system", {
      from: params.from,
      to: params.to,
      type: params.type,
      level: params.level,
      module: params.module,
      limit: params.limit,
      offset: params.offset,
    });
    const { data, total } = normalizeResponse<unknown>(raw);
    return {
      data: data as SystemHistoryResponse["data"],
      total: typeof total === "number" ? total : data.length,
    };
  } catch (err) {
    logger.error("logMonitorApi", "queryLogMonitorSystem failed", {
      error: err,
      params,
    });
    throw err;
  }
}

/** POST /api/history/log-monitor/sensors —— 按场景设备池查询传感器历史 */
export async function queryLogMonitorSensors(
  params: LogMonitorSensorsParams,
): Promise<SensorHistoryResponse> {
  try {
    const raw = await postJson<unknown>(
      "/api/history/log-monitor/sensors",
      {
        from: params.from,
        to: params.to,
        scope: params.scope,
        type: params.type,
        agg: params.agg,
        step: params.step,
        limit: params.limit,
        offset: params.offset,
      },
    );
    const { data, total } = normalizeResponse<unknown>(raw);
    return {
      data: data as SensorHistoryResponse["data"],
      total: typeof total === "number" ? total : data.length,
    };
  } catch (err) {
    logger.error("logMonitorApi", "queryLogMonitorSensors failed", {
      error: err,
      params,
    });
    throw err;
  }
}

/**
 * POST /api/history/log-monitor/export —— 日志监控专用 CSV 导出
 *
 * 复用后端 LogMonitorService 的 `device_id IN (...)` 多设备过滤，严格等于"本场景设备"日志，
 * 避免通用 /api/history/export 只能单设备 `=` 过滤、导出全矿噪声（这是"导出不重要数据"的根因）。
 */
export async function exportLogMonitorCsv(
  params: ExportParams,
  deviceIds: string[],
): Promise<Blob> {
  const cfg = getBackendConfig();
  if (!cfg) throw new Error("未配置数据源，无法导出数据");
  if (!params.source) {
    throw new Error("导出请求缺少 source（operation/event/system/sensor）");
  }
  const url = `${cfg.baseUrl}/api/history/log-monitor/export`;
  // system 视图无 device_id 概念 → 仍按 Scene 多设备过滤（system_events 表无 device_id 列，
  // 后端 IN 过滤对 system 不生效，行为等同全量，与查询一致）。
  const scope =
    deviceIds.length > 0
      ? { mode: "scene", device_ids: deviceIds }
      : { mode: "global" };
  const body = {
    kind: params.source,
    from: params.from,
    to: params.to,
    scope,
    action: params.action,
    result: params.result,
    type: params.type,
    level: params.level,
    sensor_type: params.type,
    limit: params.limit ?? 10000,
  };
  const resp = await fetch(url, {
    method: "POST",
    headers: { ...cfg.headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(
      `HTTP ${resp.status}: ${resp.statusText}${text ? ` - ${text}` : ""}`,
    );
  }
  return await resp.blob();
}

// ═══════════════════════════════════════════════════════════════════
// 工具
// ═══════════════════════════════════════════════════════════════════

/** 构造一个 Global scope（常用默认） */
export const GLOBAL_SCOPE: LogScope = SCOPE_GLOBAL;

/** 从设备 ID 列表构造 Scene scope（空数组会自动退化为 Global） */
export function sceneScope(deviceIds: string[]): LogScope {
  return deviceIds.length > 0 ? { mode: "scene", device_ids: deviceIds } : SCOPE_GLOBAL;
}

/** 提取当前 scope 内的 device ID 列表（便于回显 / 调试） */
export function getScopeDeviceIds(scope: LogScope): string[] {
  return emptyDeviceIds(scope) ?? [];
}

// ═══════════════════════════════════════════════════════════════════
// 分析洞察报告
// ═══════════════════════════════════════════════════════════════════

/** 分析洞察报告请求参数 */
export interface LogMonitorReportParams {
  from: string;
  to: string;
  scope: LogScope;
  /** 粉尘报警阈值 mg/m³（默认 10） */
  dustThreshold?: number;
  /** 关联命中窗口秒（默认 300） */
  sprayWindowSec?: number;
}

/** 报告结构化返回（与后端 LogAnalysisReport 对齐） */
export interface LogAnalysisReport {
  health_score: number;
  health_level: string;
  summary: {
    fault_count: number;
    fault_devices: number;
    alarm_count: number;
    dust_exceed_minutes: number;
    dust_avg: number;
    dust_peak: number;
    cmd_success_rate: number;
    total_ops: number;
  };
  correlation: {
    dust_exceed_events: number;
    spray_triggered_within_window: number;
    hit_rate: number | null;
  };
  device_health: {
    most_stable: string[];
    most_attention: string[];
  };
  recommendations: string[];
}

/**
 * POST /api/history/log-monitor/report —— 聚合生成分析洞察报告 JSON
 */
export async function queryLogMonitorReport(
  params: LogMonitorReportParams,
): Promise<LogAnalysisReport> {
  const cfg = getBackendConfig();
  if (!cfg) throw new Error("未配置数据源，无法生成报告");
  const url = `${cfg.baseUrl}/api/history/log-monitor/report`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...cfg.headers },
    body: JSON.stringify({
      from: params.from,
      to: params.to,
      scope: params.scope,
      dust_threshold: params.dustThreshold ?? 10.0,
      spray_window_sec: params.sprayWindowSec ?? 300,
    }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`报告生成失败 HTTP ${resp.status}: ${text}`);
  }
  return (await resp.json()) as LogAnalysisReport;
}
