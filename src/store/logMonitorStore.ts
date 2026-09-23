/**
 * logMonitorStore — 日志监控视图专用 store
 *
 * 与 `logQueryStore` **并行存在**，互不影响：
 * - `logQueryStore` 保留供其它潜在业务使用（零回归）。
 * - 本 store 仅服务于"日志监控" 6 个视图组件（LogFilterPanel + 4 tables + 趋势图）。
 *
 * 设计差异（vs logQueryStore）：
 * 1. 新增 `scopeMode: "scene" | "global"` —— 默认 scene（隔离是产品诉求，global 是逃生口）。
 * 2. 新增 `sceneDeviceIds: string[]` + `setSceneDeviceIds()` —— 由 `subscribeLogMonitorToScene()`
 *    监听 sceneStore.activeSceneId 变化自动灌入（无需 6 组件各自 useEffect）。
 * 3. 所有 query* actions 自动根据 scopeMode + sceneDeviceIds 派生 `LogScope` 发给
 *    logMonitorApi（使用 selectedDeviceIds 多值字段——支持分控器多选过滤日志）。
 *
 * 不破坏既有：
 * - 不修改 logQueryStore（保留）。
 * - 不修改任何 6 渲染器外的渲染器（见 Task #78 一次性 swap）。
 */
import { create } from "zustand";
import { useDeviceStore } from "./deviceStore";
import { useSceneStore } from "./sceneStore";
import {
  queryLogMonitorOperations,
  queryLogMonitorEvents,
  queryLogMonitorEventsForStats,
  queryLogMonitorSystem,
  queryLogMonitorSensors,
  exportLogMonitorCsv,
  queryLogMonitorReport,
  GLOBAL_SCOPE,
  sceneScope,
  type LogScope,
  type LogAnalysisReport,
} from "../services/logMonitorApi";
import type {
  ExportParams,
  OperationLog,
  DeviceEvent,
  SystemEvent,
  SensorRecord,
} from "../services/historyApi";
import { logger } from "../utils/logger";
import { useEditorStore } from "./editorStore";
import type { SceneView } from "../types/scene";
import type { SceneComponent } from "../types/editor";

// ═══════════════════════════════════════════════════════════════════
// 类型镜像（与 logQueryStore 对齐，方便替换时的视觉对齐）
// ═══════════════════════════════════════════════════════════════════

export type LogTab = "operation" | "event" | "system" | "sensor";

export interface TimeRange {
  from: string;
  to: string;
}

export interface QueryResult<T> {
  data: T[];
  total: number;
}

export interface LogQueryParams {
  timeRange: TimeRange;
  /** 多选设备画像：点选分控器卡时填入，scope 收窄为这些设备（支持分控器多选过滤） */
  selectedDeviceIds: string[];
  logLevel: string;
  eventType: string;
  /** 命令码过滤（如 0x0619 / 0x061b / 0x0628 喷雾触发类），从概览卡跳转时设置 */
  commandCode: string;
  currentPage: number;
  pageSize: number;
}

interface LogMonitorState extends LogQueryParams {
  // ── Tab ──
  activeTab: LogTab;

  // ── 场景作用域 ──
  scopeMode: "scene" | "global";
  sceneDeviceIds: string[];
  /** 主视图喷雾控制工具栏当前绑定的集控器根（deviceId 列表），用于日志面板渲染"当前监控集控器"卡片 */
  selectedControllerIds: string[];

  // ── 查询结果（4 类：与 historyApi 一致的强类型）──
  operationLogs: QueryResult<OperationLog>;
  deviceEvents: QueryResult<DeviceEvent>;
  systemEvents: QueryResult<SystemEvent>;
  sensorData: QueryResult<SensorRecord>;

  // ── 概览卡统计样本（足量，不进表格分页）──
  statsEvents: QueryResult<DeviceEvent>;
  /** 概览卡指令统计：近 24h 总量 + 成功数（不进表格分页） */
  statsOps: QueryResult<OperationLog>;

  // ── 分析洞察报告（Task #110，消费 /api/history/log-monitor/report）──
  report: LogAnalysisReport | null;
  reportLoading: boolean;
  reportError: string | null;
  /** 报告参数：粉尘报警阈值 mg/m³（默认 10） */
  dustThreshold: number;
  /** 报告参数：关联命中窗口秒（默认 300） */
  sprayWindowSec: number;

  // ── 加载状态 ──
  loading: boolean;
  error: string | null;
  exporting: boolean;

  // ── 中央自动刷新 nonce（每 30s bump 一次，3 图表订阅自刷新）──
  refreshNonce: number;

  // ── Actions：参数设置 ──
  setQueryParams: (params: Partial<LogQueryParams>) => void;
  setActiveTab: (tab: LogTab) => void;
  setCurrentPage: (page: number) => void;
  setPageSize: (size: number) => void;

  // ── Actions：作用域 ──
  setScopeMode: (mode: "scene" | "global") => void;
  /** 由 subscribeLogMonitorToScene() 自动调用（外部也可手填） */
  setSceneDeviceIds: (ids: string[]) => void;
  /** 由 subscribeLogMonitorToScene() 自动调用，写入当前工具栏绑定的集控器根 */
  setSelectedControllerIds: (ids: string[]) => void;

  // ── Actions：查询 ──
  queryOperationLogs: () => Promise<void>;
  queryDeviceEvents: () => Promise<void>;
  /** 概览卡统计：近 24h 足量样本（limit=1000），不进表格分页 */
  queryEventsForStats: () => Promise<void>;
  /** 概览卡指令统计：近 24h 总量+成功数（limit=1000），不进表格分页 */
  queryOpsForStats: () => Promise<void>;
  querySystemEvents: () => Promise<void>;
  querySensorData: () => Promise<void>;
  queryActiveTab: () => Promise<void>;

  // ── Actions：导出 ──
  exportCsv: (source?: ExportParams["source"]) => Promise<void>;
  /** 生成分析洞察报告（调 report 端点，写 report 状态） */
  queryReport: () => Promise<void>;
  /** 导出分析洞察报告为 Markdown 文件（走 Tauri save dialog） */
  exportReport: () => Promise<void>;

  // ── Actions：重置 ──
  resetQuery: () => void;

  /** 中央定时器每 30s 调用：bump nonce 触发 3 图表(load) 自刷新 */
  bumpRefresh: () => void;
}

// ═══════════════════════════════════════════════════════════════════
// 常量默认值
// ═══════════════════════════════════════════════════════════════════

const recentTimeRange = (hours: number) => {
  const now = new Date();
  const from = new Date(now.getTime() - hours * 60 * 60 * 1000);
  return { from: from.toISOString(), to: now.toISOString() };
};

const DEFAULT_TIME_RANGE = recentTimeRange(24);
const DEFAULT_PAGE_SIZE = 20;

// 与 legacy logQueryStore 对齐：`{ data: [], total: 0 }` 由 spread 推断为 `{ data: never[], total: number }`，
// never[] 可赋给任意 T[]，故对所有 4 类 QueryResult<T> 都兼容。
const EMPTY_RESULT = { data: [], total: 0 };

// ═══════════════════════════════════════════════════════════════════
// 构造当前 scope：根据 scopeMode + sceneDeviceIds 计算 LogScope
// ═══════════════════════════════════════════════════════════════════

export function deriveScope(
  mode: "scene" | "global",
  sceneDeviceIds: string[],
): LogScope {
  if (mode === "global") return GLOBAL_SCOPE;
  // 严格消费主视图结果：scene 模式但主视图未绑定设备 → 发一个无效 ID 使后端 IN 过滤返回空，
  // 绝不回退为全矿查询（append_device_id_filter 空数组会 return = 全矿，必须避免）。
  if (sceneDeviceIds.length === 0) return sceneScope(["__NO_BINDING__"]);
  return sceneScope(sceneDeviceIds);
}

/**
 * 查询用作用域：多选设备画像优先。
 * 用户在日志筛选面板点选若干台分控器画像时（selectedDeviceIds 非空），把 scope 的
 * device_ids 收窄为这些设备（被选项必在 scene 子树 / 全矿范围内），实现"点哪几台按
 * 哪几台过滤日志（支持多选）"。未选设备时回退到 deriveScope（scene 子树或 global 全矿逃生口）。
 * 同时供图表组件复用（传入同样的字段），保证全视图一致跟随多选设备。
 */
export function buildQueryScope(opts: {
  selectedDeviceIds: string[];
  scopeMode: "scene" | "global";
  sceneDeviceIds: string[];
}): LogScope {
  if (opts.selectedDeviceIds.length > 0) {
    return sceneScope(opts.selectedDeviceIds);
  }
  return deriveScope(opts.scopeMode, opts.sceneDeviceIds);
}

/** 主视图是否已绑定数据源（sceneDeviceIds 非空） */
export function isSceneBound(sceneDeviceIds: string[]): boolean {
  return sceneDeviceIds.length > 0;
}

// ═══════════════════════════════════════════════════════════════════
// Store
// ═══════════════════════════════════════════════════════════════════

export const useLogMonitorStore = create<LogMonitorState>((set, get) => ({
  // ── 查询参数 ──
  timeRange: DEFAULT_TIME_RANGE,
  selectedDeviceIds: [],
  logLevel: "all",
  eventType: "all",
  commandCode: "",
  currentPage: 0,
  pageSize: DEFAULT_PAGE_SIZE,

  // ── Tab ──
  activeTab: "operation",

  // ── 作用域（默认 scene）──
  scopeMode: "scene",
  sceneDeviceIds: [],
  selectedControllerIds: [],

  // ── 查询结果 ──
  operationLogs: { ...EMPTY_RESULT },
  deviceEvents: { ...EMPTY_RESULT },
  systemEvents: { ...EMPTY_RESULT },
  sensorData: { ...EMPTY_RESULT },
  statsEvents: { ...EMPTY_RESULT },
  statsOps: { ...EMPTY_RESULT },

  // ── 分析洞察报告 ──
  report: null,
  reportLoading: false,
  reportError: null,
  dustThreshold: 10.0,
  sprayWindowSec: 300,

  // ── 状态 ──
  loading: false,
  error: null,
  exporting: false,
  refreshNonce: 0,

  // ═════ 参数设置 ═════

  setQueryParams: (params) => {
    set((state) => ({ ...state, ...params, currentPage: 0 }));
  },

  setActiveTab: (tab) => {
    set({ activeTab: tab, currentPage: 0, error: null });
  },

  setCurrentPage: (page) => {
    set({ currentPage: page });
  },

  setPageSize: (size) => {
    set({ pageSize: size, currentPage: 0 });
  },

  // ═════ 作用域 ═════

  setScopeMode: (mode) => {
    set({ scopeMode: mode, currentPage: 0, error: null });
  },

  setSceneDeviceIds: (ids) => {
    set({ sceneDeviceIds: ids });
  },

  setSelectedControllerIds: (ids) => {
    set({ selectedControllerIds: ids });
  },

  // ═════ 查询 ═════

  queryOperationLogs: async () => {
    const s = get();
    set({ loading: true, error: null });
    try {
      const scope = buildQueryScope(s);
      const resp = await queryLogMonitorOperations({
        from: s.timeRange.from,
        to: s.timeRange.to,
        scope,
        action: undefined,
        result: undefined,
        commandCode: s.commandCode || undefined,
        limit: s.pageSize,
        offset: s.currentPage * s.pageSize,
      });
      set({ operationLogs: resp as QueryResult<OperationLog>, loading: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("logMonitorStore", "queryOperationLogs failed", { error: msg });
      set({ loading: false, error: msg });
    }
  },

  queryDeviceEvents: async () => {
    const s = get();
    set({ loading: true, error: null });
    try {
      const scope = buildQueryScope(s);
      const resp = await queryLogMonitorEvents({
        from: s.timeRange.from,
        to: s.timeRange.to,
        scope,
        type: s.eventType !== "all" ? s.eventType : undefined,
        level: s.logLevel !== "all" ? s.logLevel : undefined,
        limit: s.pageSize,
        offset: s.currentPage * s.pageSize,
      });
      set({ deviceEvents: resp as QueryResult<DeviceEvent>, loading: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("logMonitorStore", "queryDeviceEvents failed", { error: msg });
      set({ loading: false, error: msg });
    }
  },

  queryEventsForStats: async () => {
    const s = get();
    try {
      const scope = buildQueryScope(s);
      const resp = await queryLogMonitorEventsForStats({
        from: s.timeRange.from,
        to: s.timeRange.to,
        scope,
        type: s.eventType !== "all" ? s.eventType : undefined,
        level: s.logLevel !== "all" ? s.logLevel : undefined,
        statsLimit: 1000,
      });
      set({ statsEvents: resp as QueryResult<DeviceEvent> });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("logMonitorStore", "queryEventsForStats failed", { error: msg });
      // 统计失败不阻塞主表格，保留空结果
      set({ statsEvents: { ...EMPTY_RESULT } });
    }
  },

  queryOpsForStats: async () => {
    const s = get();
    try {
      const scope = buildQueryScope(s);
      const resp = await queryLogMonitorOperations({
        from: s.timeRange.from,
        to: s.timeRange.to,
        scope,
        limit: 1000,
        offset: 0,
      });
      set({ statsOps: resp as QueryResult<OperationLog> });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("logMonitorStore", "queryOpsForStats failed", { error: msg });
      set({ statsOps: { ...EMPTY_RESULT } });
    }
  },

  querySystemEvents: async () => {
    const s = get();
    set({ loading: true, error: null });
    try {
      // system 表无 device_id —— 沿用原 endpoint 的"全量"语义，不应用 scope。
      const resp = await queryLogMonitorSystem({
        from: s.timeRange.from,
        to: s.timeRange.to,
        type: s.eventType !== "all" ? s.eventType : undefined,
        level: s.logLevel !== "all" ? s.logLevel : undefined,
        limit: s.pageSize,
        offset: s.currentPage * s.pageSize,
      });
      set({ systemEvents: resp as QueryResult<SystemEvent>, loading: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("logMonitorStore", "querySystemEvents failed", { error: msg });
      set({ loading: false, error: msg });
    }
  },

  querySensorData: async () => {
    const s = get();
    set({ loading: true, error: null });
    try {
      const scope = buildQueryScope(s);
      const resp = await queryLogMonitorSensors({
        from: s.timeRange.from,
        to: s.timeRange.to,
        scope,
        type: s.eventType !== "all" ? s.eventType : undefined,
        limit: s.pageSize,
        offset: s.currentPage * s.pageSize,
      });
      set({ sensorData: resp as QueryResult<SensorRecord>, loading: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("logMonitorStore", "querySensorData failed", { error: msg });
      set({ loading: false, error: msg });
    }
  },

  queryActiveTab: async () => {
    const tab = get().activeTab;
    switch (tab) {
      case "operation":
        await get().queryOperationLogs();
        break;
      case "event":
        await get().queryDeviceEvents();
        break;
      case "system":
        await get().querySystemEvents();
        break;
      case "sensor":
        await get().querySensorData();
        break;
    }
  },

  // ═════ 导出 ═════

  exportCsv: async (source) => {
    const s = get();
    const src = source ?? s.activeTab;
    set({ exporting: true, error: null });
    try {
      // 导出 CSV 沿用通用 endpoint（保持前端 UX 一致）；
      // scope 过滤交给 GreptimeDB 的 `device_id = '{...}'` 字面量拼接（与 historyApi 同源），
      // 系统事件无 device_id 故 system 路径不变。
      const params: ExportParams = {
        source: src,
        from: s.timeRange.from,
        to: s.timeRange.to,
        device_id: undefined,
        type: s.eventType !== "all" ? s.eventType : undefined,
        level: s.logLevel !== "all" ? s.logLevel : undefined,
        limit: 10000,
        offset: 0,
      };
      // 导出也遵循多选设备画像选择：选中若干台设备时只导出这些设备日志
      const exportDeviceIds =
        s.selectedDeviceIds.length > 0 ? s.selectedDeviceIds : s.sceneDeviceIds;
      const blob = await exportLogMonitorCsv(params, exportDeviceIds);

      // Tauri 2 WebView 默认拦截浏览器原生下载（Content-Disposition 不触发 save dialog，
      // URL.createObjectURL + a.click() 静默失败）。正确流程：
      //   1) 调 @tauri-apps/plugin-dialog 的 save() 取用户选择的文件路径
      //   2) 调后端 save_text_to_path 命令写文件
      // 用户取消保存时 save() 返回 null，静默退出（不算错误）。
      const { save } = await import("@tauri-apps/plugin-dialog");
      const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      // 日志类型中文标签（与 SceneTabBar / LogFilterPanel tab 一致）
      const typeLabel: Record<string, string> = {
        operation: "操作日志",
        event: "设备事件",
        system: "系统事件",
        sensor: "传感器数据",
      };
      // 场景名（从 sceneStore 取当前激活场景，区分三场景导出文件）
      const sceneName =
        useSceneStore.getState().getActiveScene()?.name?.trim() || "日志监控";
      const defaultName = `${sceneName}-${typeLabel[src] ?? src}-${ts}.csv`;
      const target = await save({
        defaultPath: defaultName,
        filters: [{ name: "CSV", extensions: ["csv"] }],
        title: "导出日志 CSV",
      });
      if (!target) {
        // 用户主动取消
        set({ exporting: false });
        return;
      }
      const content = await blob.text();
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("save_text_to_path", { path: target, content });

      set({ exporting: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("logMonitorStore", "exportCsv failed", { error: msg });
      set({ exporting: false, error: msg });
    }
  },

  // ═════ 分析洞察报告 ═════

  queryReport: async () => {
    const s = get();
    set({ reportLoading: true, reportError: null });
    try {
      const scope = buildQueryScope(s);
      const report = await queryLogMonitorReport({
        from: s.timeRange.from,
        to: s.timeRange.to,
        scope,
        dustThreshold: s.dustThreshold,
        sprayWindowSec: s.sprayWindowSec,
      });
      set({ report, reportLoading: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("logMonitorStore", "queryReport failed", { error: msg });
      set({ reportLoading: false, reportError: msg });
    }
  },

  exportReport: async () => {
    const s = get();
    const r = s.report;
    if (!r) {
      set({ reportError: "请先生成报告再导出" });
      return;
    }
    set({ exporting: true, reportError: null });
    try {
      const md = buildReportMarkdown(r, {
        scopeMode: s.scopeMode,
        sceneDeviceIds: s.sceneDeviceIds,
        timeRange: s.timeRange,
        dustThreshold: s.dustThreshold,
        sprayWindowSec: s.sprayWindowSec,
      });
      const { save } = await import("@tauri-apps/plugin-dialog");
      const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const sceneName =
        useSceneStore.getState().getActiveScene()?.name?.trim() || "日志监控";
      const defaultName = `${sceneName}-分析洞察报告-${ts}.md`;
      const target = await save({
        defaultPath: defaultName,
        filters: [{ name: "Markdown", extensions: ["md"] }],
        title: "导出分析洞察报告",
      });
      if (!target) {
        set({ exporting: false });
        return;
      }
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("save_text_to_path", { path: target, content: md });
      set({ exporting: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("logMonitorStore", "exportReport failed", { error: msg });
      set({ exporting: false, reportError: msg });
    }
  },

  bumpRefresh: () => {
    set((s) => ({ refreshNonce: s.refreshNonce + 1 }));
  },

  resetQuery: () => {
    set({
      timeRange: recentTimeRange(24),
      selectedDeviceIds: [],
      logLevel: "all",
      eventType: "all",
      currentPage: 0,
      pageSize: DEFAULT_PAGE_SIZE,
      activeTab: "operation",
      operationLogs: { ...EMPTY_RESULT },
      deviceEvents: { ...EMPTY_RESULT },
      systemEvents: { ...EMPTY_RESULT },
      sensorData: { ...EMPTY_RESULT },
      statsEvents: { ...EMPTY_RESULT },
      statsOps: { ...EMPTY_RESULT },
      loading: false,
      error: null,
      report: null,
      reportLoading: false,
      reportError: null,
    });
  },
}));

// ═══════════════════════════════════════════════════════════════════
// 分析洞察报告 → Markdown 生成（导出用）
// ═══════════════════════════════════════════════════════════════════

interface ReportMeta {
  scopeMode: "scene" | "global";
  sceneDeviceIds: string[];
  timeRange: TimeRange;
  dustThreshold: number;
  sprayWindowSec: number;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("zh-CN", { hour12: false });
}

function buildReportMarkdown(r: LogAnalysisReport, meta: ReportMeta): string {
  const s = r.summary;
  const c = r.correlation;
  const lines: string[] = [];
  lines.push(`# 日志分析洞察报告`);
  lines.push("");
  lines.push(`- **生成时间**：${fmtTime(new Date().toISOString())}`);
  lines.push(
    `- **分析区间**：${fmtTime(meta.timeRange.from)} ~ ${fmtTime(meta.timeRange.to)}`,
  );
  lines.push(
    `- **作用域**：${
      meta.scopeMode === "global"
        ? "全矿"
        : meta.sceneDeviceIds.length > 0
          ? `本场景 ${meta.sceneDeviceIds.length} 台设备`
          : "未绑定数据源"
    }`,
  );
  lines.push(
    `- **粉尘报警阈值**：${meta.dustThreshold} mg/m³　**关联窗口**：${meta.sprayWindowSec}s`,
  );
  lines.push("");
  lines.push(`## 一、综合健康评分`);
  lines.push("");
  lines.push(`- **健康评分**：${r.health_score} / 100`);
  lines.push(`- **等级**：${r.health_level}`);
  lines.push("");
  lines.push(`## 二、异常摘要`);
  lines.push("");
  lines.push(`| 指标 | 数值 |`);
  lines.push(`| --- | --- |`);
  lines.push(`| 故障次数 | ${s.fault_count} |`);
  lines.push(`| 故障涉及设备 | ${s.fault_devices} 台 |`);
  lines.push(`| 重要告警 | ${s.alarm_count} 条 |`);
  lines.push(`| 粉尘超标时长 | ${s.dust_exceed_minutes} min |`);
  lines.push(`| 粉尘平均浓度 | ${s.dust_avg} mg/m³ |`);
  lines.push(`| 粉尘峰值浓度 | ${s.dust_peak} mg/m³ |`);
  lines.push(`| 指令成功率 | ${s.cmd_success_rate}% |`);
  lines.push(`| 指令总数 | ${s.total_ops} |`);
  lines.push("");
  lines.push(`## 三、粉尘—喷雾关联分析`);
  lines.push("");
  lines.push(`- 粉尘超标时刻事件数：${c.dust_exceed_events}`);
  lines.push(`- 窗口内触发喷雾次数：${c.spray_triggered_within_window}`);
  lines.push(
    `- 关联命中率：${c.hit_rate === null ? "无超标事件（N/A）" : `${c.hit_rate}%`}`,
  );
  lines.push("");
  lines.push(`## 四、设备健康榜`);
  lines.push("");
  lines.push(
    `- **最需关注**：${r.device_health.most_attention.length > 0 ? r.device_health.most_attention.join("、") : "无"}`,
  );
  lines.push(
    `- **最稳定**：${r.device_health.most_stable.length > 0 ? r.device_health.most_stable.join("、") : "无"}`,
  );
  lines.push("");
  lines.push(`## 五、决策建议`);
  lines.push("");
  if (r.recommendations.length === 0) {
    lines.push(`- 无`);
  } else {
    for (const rec of r.recommendations) lines.push(`- ${rec}`);
  }
  lines.push("");
  lines.push(`---`);
  lines.push(`*本报告由 WebCraft 日志监控视图自动生成*`);
  lines.push("");
  return lines.join("\n");
}

// ═══════════════════════════════════════════════════════════════════
// 自动同步场景设备池（外部可在 App 启动时调用一次）
// ═══════════════════════════════════════════════════════════════════

let subscribed = false;

/** 设备树节点（仅取日志监控派生需要的字段） */
type DeviceNode = {
  deviceId: string;
  parentDeviceId?: string | null;
  productCode?: string | number;
};

/** 当前渲染场景的组件容器（editorStore / sceneStore 都满足此结构） */
type SceneComponentsLike = {
  globalComponents?: SceneComponent[];
  views?: SceneView[];
};

/**
 * 从当前渲染场景中找到主视图(view_default)的喷雾控制工具栏
 * （industrial-spray-control-toolbar）。每个场景都有该工具栏，它是"当前场景所选集控器"的唯一权威来源。
 * 同时在 globalComponents 与主视图组件里查找，命中即返回。
 */
function findSprayControlToolbar(scene: SceneComponentsLike): SceneComponent | undefined {
  const comps: SceneComponent[] = [];
  if (Array.isArray(scene.globalComponents)) comps.push(...scene.globalComponents);
  if (Array.isArray(scene.views)) {
    for (const v of scene.views) {
      if (v.id === "view_default" && Array.isArray(v.components)) {
        comps.push(...v.components);
      }
    }
  }
  return comps.find((c) => c.type === "industrial-spray-control-toolbar");
}

/**
 * 工具栏集控器绑定的稳定签名：用于订阅时廉价比对"绑定是否变化"。
 * 仅提取主视图喷雾控制工具栏的 selectedDeviceIds（排序后 join），无工具栏/无绑定返回 ""。
 */
function toolbarBindingSignature(scene: SceneComponentsLike): string {
  const tb = findSprayControlToolbar(scene);
  const sd = tb?.config?.selectedDeviceIds;
  if (!Array.isArray(sd)) return "";
  return sd
    .filter((x): x is string => typeof x === "string" && x.length > 0)
    .sort()
    .join(",");
}

/**
 * 判定某设备是否为集控器根（productCode="18" 且为顶层 / 无 parent）。
 * 与 DustAlarmPanelRenderer / SensorMonitorRenderer 等渲染器对"集控器"的定义一致。
 */
function isControllerRoot(d: DeviceNode | undefined): boolean {
  return !!d && !d.parentDeviceId && String(d.productCode ?? "") === "18";
}

/**
 * 从某设备 ID 向上回溯 parentDeviceId，定位其所属集控器根
 * （无 parentDeviceId 的顶层节点，即 productCode="18"）。
 * 找不到 / 设备不存在 / 非集控器 / 成环返回 undefined。
 */
function findControllerRoot(
  deviceId: string,
  devices: Record<string, DeviceNode>,
): string | undefined {
  const start = devices[deviceId];
  if (!start) return undefined;
  // 当前节点本身就是集控器根
  if (isControllerRoot(start)) return start.deviceId;
  let pid: string | undefined | null = start.parentDeviceId;
  const seen = new Set<string>([deviceId]);
  while (pid) {
    const parent: DeviceNode | undefined = devices[pid];
    if (!parent) return undefined;
    // 顶层节点（无 parent）即集控器根
    if (isControllerRoot(parent)) return parent.deviceId;
    if (seen.has(pid)) return undefined; // 防环
    seen.add(pid);
    pid = parent.parentDeviceId;
  }
  return undefined;
}

/**
 * 订阅 `useSceneStore.activeSceneId` 变化，自动从对应 scene 派生设备 ID 集合
 * 并 setSceneDeviceIds()。多次调用幂等（仅订阅一次）。
 *
 * 设计：日志监控视图**不重复绑定设备**——它只消费当前场景主视图
 * （view_default）中 **喷雾控制工具栏（industrial-spray-control-toolbar）**
 * 已选中的集控器下的设备。具体：
 *  1. 取当前场景主视图的喷雾控制工具栏组件（每个场景都有，作为"当前场景所选集控器"的唯一来源）。
 *  2. 读其 `selectedDeviceIds`（当前场景被选中的集控器 + 分控器）。
 *  3. 向上回溯 parentDeviceId 至集控器根（productCode="18" / 无 parent）。
 *  4. 从 deviceStore 展开该集控器根完整子树（集控器 → 分控器 → 传感器）
 *     → sceneDeviceIds 即"当前场景所选集控器下的全部数据"。
 *  5. 工具栏未绑集控器 / 找不到工具栏 → sceneDeviceIds 留空（空状态），
 *     不回退 deviceStore 全集，避免混入其他集控器噪声。
 *
 * 渲染层（6 个日志组件）只从 useLogMonitorStore.sceneDeviceIds 取 scope 做分析/渲染/导出。
 */
export function subscribeLogMonitorToScene(): void {
  if (subscribed) return;
  subscribed = true;

  // 场景设备池变化时立即重查所有 scope 依赖查询。
  // 原实现只靠 LogFilterPanel 挂载 + 30s 定时器重查，导致"切场景 / 改工具栏集控器"后
  // 卡片最长 30s 停在旧数据，看起来像'写死'。这里在设备池实际变化时主动重查。
  let firstRun = true;
  const refetchScopeDependent = () => {
    const st = useLogMonitorStore.getState();
    void st.queryReport();
    void st.queryEventsForStats();
    void st.queryOpsForStats();
    void st.queryActiveTab();
    st.bumpRefresh();
  };

  const recomputeAndSet = () => {
    // 当前渲染场景的组件实时态在 editorStore（编辑器 / 预览均由此渲染：
    // ScenePreviewPage.loadSceneWithViews 把场景载入 editorStore；用户在属性面板改工具栏集控器
    // 走 editorStore.updateComponentConfig）。sceneStore 仅持有载入时的快照，编辑态下会滞后，
    // 因此这里以 editorStore 为权威来源。
    const editorState = useEditorStore.getState();
    const allDevices =
      (useDeviceStore.getState().devices ?? {}) as Record<string, DeviceNode>;

    // 1. 取当前渲染场景主视图的喷雾控制工具栏（当前场景所选集控器的权威来源）
    const toolbar = findSprayControlToolbar(editorState);
    const boundIds: string[] = [];
    if (toolbar?.config) {
      const sd = toolbar.config.selectedDeviceIds;
      if (Array.isArray(sd)) {
        for (const x of sd) if (typeof x === "string" && x.length > 0) boundIds.push(x);
      }
    }

    // 2. 定位集控器根集合
    // 工具"绑定集控器"字段（deviceMultiSelect）只会写入集控器根，但历史/误操作数据里
    // 常混入子设备 ID（如 1234567891_1 / 1234567891_2，它们挂在别的集控器下）。
    // 若对每个 ID 都 findControllerRoot 回溯，子设备会回溯出额外集控器根，
    // 导致日志面板多渲集控器卡 + 其名下分控器。
    // 因此：优先只采用"本身即集控器根"的 ID；丢弃混入的子设备（不再回溯）。
    // 回退：若用户只选了子设备（无一为根），再回溯到其集控器根（兼容旧数据）。
    const controllerRoots = new Set<string>();
    let anyRootChosen = false;
    for (const id of boundIds) {
      const dev = allDevices[id];
      if (isControllerRoot(dev)) {
        controllerRoots.add(id);
        anyRootChosen = true;
      }
    }
    if (!anyRootChosen) {
      for (const id of boundIds) {
        const root = findControllerRoot(id, allDevices);
        if (root) controllerRoots.add(root);
      }
    }

    const prevIds = useLogMonitorStore.getState().sceneDeviceIds;

    if (controllerRoots.size === 0) {
      // 工具栏未绑集控器 / 找不到工具栏 → 空状态，不混入全矿噪声。
      // 仅当由"有绑定"变"无绑定"时才重查（让旧数据清空为 __NO_BINDING__ 空结果）。
      if (prevIds.length !== 0) {
        useLogMonitorStore.getState().setSceneDeviceIds([]);
        useLogMonitorStore.getState().setSelectedControllerIds([]);
        if (!firstRun) refetchScopeDependent();
      }
      firstRun = false;
      return;
    }

    // 3. 展开每个集控器根的完整子树（集控器本身 + 全部后代），
    //    覆盖 operation_logs(集控器) 与 device_events / sensor_samples(子设备) 查询。
    const subtree = new Set<string>();
    for (const rootId of controllerRoots) {
      subtree.add(rootId);
      for (const d of Object.values(allDevices)) {
        let pid = d.parentDeviceId;
        while (pid) {
          if (pid === rootId) {
            subtree.add(d.deviceId);
            break;
          }
          const parent: DeviceNode | undefined = allDevices[pid];
          pid = parent?.parentDeviceId;
        }
      }
    }
    const newIds = Array.from(subtree).sort();
    const sortedRoots = Array.from(controllerRoots).sort();
    const changed =
      prevIds.length !== newIds.length ||
      !prevIds.every((v, i) => v === newIds[i]);
    useLogMonitorStore.getState().setSceneDeviceIds(newIds);
    // 同步暴露当前绑定的集控器根，供日志面板渲染"当前监控集控器"卡片（与 sceneDeviceIds 同源更新）。
    useLogMonitorStore.getState().setSelectedControllerIds(sortedRoots);
    // 首跑交给 LogFilterPanel 挂载时的初始查询；其后仅当设备池实际变化才重查，
    // 避免每次拖拽 / 选区 / 变换都重查。
    if (changed && !firstRun) refetchScopeDependent();
    firstRun = false;
  };

  // 初始化一次
  recomputeAndSet();
  // 订阅场景切换（sceneStore.activeSceneId 变化 → 预览会重新 loadSceneWithViews 到 editorStore）
  useSceneStore.subscribe((state, prev) => {
    if (state.activeSceneId !== prev.activeSceneId) {
      // 场景切换：重置分页（避免带上个场景的页数 offset 查新场景越界），
      // 并 recompute 设备池（setSceneDeviceIds 变化会触发三表 + 图表自动重查）。
      useLogMonitorStore.getState().setCurrentPage(0);
      recomputeAndSet();
    }
  });
  // 订阅编辑器组件 config 变更：用户在属性面板改喷雾控制工具栏的集控器绑定 → editorStore 变化。
  // 用绑定签名比对，仅在"工具栏 selectedDeviceIds 实际变化"时重算（避免每次拖拽/选区/变换都重算）。
  useEditorStore.subscribe((state, prev) => {
    if (toolbarBindingSignature(state) !== toolbarBindingSignature(prev)) {
      recomputeAndSet();
    }
  });
  // 同时订阅设备列表加载完成（集控器根出现后需重算）
  useDeviceStore.subscribe((state, prev) => {
    const before = Object.keys(prev.devices ?? {}).length;
    const now = Object.keys(state.devices ?? {}).length;
    if (before !== now) {
      recomputeAndSet();
    }
  });
}
