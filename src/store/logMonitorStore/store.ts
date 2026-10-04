import { create } from "zustand";
import { useSceneStore } from "../sceneStore";
import {
  queryLogMonitorOperations,
  queryLogMonitorEvents,
  queryLogMonitorEventsForStats,
  queryLogMonitorSystem,
  queryLogMonitorSensors,
  exportLogMonitorCsv,
  queryLogMonitorReport,
} from "../../services/logMonitorApi";
import type {
  ExportParams,
  OperationLog,
  DeviceEvent,
  SystemEvent,
  SensorRecord,
} from "../../services/historyApi";
import { logger } from "../../utils/logger";
import type { LogMonitorState, QueryResult } from "./types";
import { recentTimeRange, DEFAULT_TIME_RANGE, DEFAULT_PAGE_SIZE, EMPTY_RESULT } from "./defaults";
import { buildQueryScope } from "./scope";
import { buildReportMarkdown } from "./reportMarkdown";

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