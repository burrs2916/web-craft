/**
 * useChartData — ECharts 组件统一数据适配 Hook
 *
 * 基于 useApiDataFetch 封装，为所有 ECharts 组件提供一致的统一数据层接入：
 *   - dataMode: "static"    → 静态模式。staticData 非空时作为图表数据集覆盖组件静态字段；
 *                             为空时完全保持原行为（向后兼容旧字段 categories/values/data 等）
 *   - dataMode: "api"       → API 模式。通过 useApiDataFetch 拉取数据，结果覆盖图表数据字段
 *
 * 数据格式约定（与 codegen 端 __WC_* 运行时一致）：
 *   - 对象   → 字段级合并：API/staticData 返回 { categories, values, data, seriesData,
 *              xAxisData, seriesNames, nodes, links, ... } 时，逐字段覆盖到 config
 *   - 数组   → 作为整体放入 config.data（适配 Pie / Funnel / Scatter / Heatmap 等消费 data 的组件）
 *
 * 特殊语义组件（LineChart 的 batch/stream、Gauge 的 realtime）不受影响：
 *   此处仅处理 "api" 与 "static" 两种 Mixin 数据模式，batch/stream/realtime 由各组件旧逻辑处理。
 */

import { useMemo } from "react";
import { useApiDataFetch, type ApiDataFetchConfig } from "../../hooks/useApiDataFetch";

/** 判断是否为可用于字段级合并的图表数据集（对象且非数组、非 null） */
function isDatasetObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** 安全解析 JSON 字符串，失败时返回原值 */
function tryParse(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * ECharts 组件统一数据适配
 *
 * @param config 组件原始 config（含 Mixin 注入的 dataMode/staticData/apiPath 等字段）
 * @returns 合并后的 config：直接传给后续渲染逻辑即可，原组件字段读取无需改动
 */
export function useChartData(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const dataMode = String(config.dataMode ?? "static");

  // 统一数据层只处理 Mixin 两种模式；batch/stream/realtime 由组件旧逻辑自行消费
  const mixinMode: "static" | "api" = dataMode === "api" ? "api" : "static";

  // 仅当 Mixin 模式为 api 时才真正拉取；static / 特殊模式返回 data=null，不触发网络请求
  const apiConfig: ApiDataFetchConfig = mixinMode === "api"
    ? {
        dataMode: "api",
        apiPath: config.apiPath as string | undefined,
        apiUrl: config.apiUrl as string | undefined,
        apiMethod: (config.apiMethod as "GET" | "POST" | undefined) ?? "GET",
        apiBody: config.apiBody,
        apiHeaders: config.apiHeaders,
        apiInterval: config.apiInterval as number | undefined,
        apiDataPath: config.apiDataPath as string | undefined,
        authEnabled: config.authEnabled as boolean | null | undefined,
      }
    : { dataMode: "static", staticData: null };

  const { data: apiData } = useApiDataFetch(apiConfig);

  return useMemo(() => {
    // ── 1. staticData 覆盖（static 与 api 模式共用：staticData 非空时优先） ──
    let merged = config;
    const staticData = config.staticData;

    if (staticData != null && staticData !== "") {
      const parsed = tryParse(staticData);
      if (isDatasetObject(parsed)) {
        merged = { ...merged, ...parsed };
      } else if (Array.isArray(parsed)) {
        merged = { ...merged, data: parsed };
      } else {
        // 标量 → 作为 value（适配 Gauge 等按数值取数的组件）
        merged = { ...merged, value: parsed };
      }
    }

    // ── 2. API 数据覆盖（api 模式且有数据时，优先于 staticData） ──
    if (mixinMode === "api" && apiData != null) {
      if (isDatasetObject(apiData)) {
        merged = { ...merged, ...apiData };
      } else if (Array.isArray(apiData)) {
        merged = { ...merged, data: apiData };
      } else {
        merged = { ...merged, value: apiData };
      }
    }

    return merged;
  }, [config, mixinMode, apiData]);
}

/** 供 ECharts 系列组件复用：返回统一数据层的加载/错误状态（供需要 UI 提示的组件使用） */
export function useChartDataStatus(config: Record<string, unknown>): {
  loading: boolean;
  error: string | null;
} {
  const dataMode = String(config.dataMode ?? "static");
  const mixinMode: "static" | "api" = dataMode === "api" ? "api" : "static";

  const apiConfig: ApiDataFetchConfig = mixinMode === "api"
    ? {
        dataMode: "api",
        apiPath: config.apiPath as string | undefined,
        apiUrl: config.apiUrl as string | undefined,
        apiMethod: (config.apiMethod as "GET" | "POST" | undefined) ?? "GET",
        apiBody: config.apiBody,
        apiHeaders: config.apiHeaders,
        apiInterval: config.apiInterval as number | undefined,
        apiDataPath: config.apiDataPath as string | undefined,
        authEnabled: config.authEnabled as boolean | null | undefined,
      }
    : { dataMode: "static", staticData: null };

  const { loading, error } = useApiDataFetch(apiConfig);
  return { loading, error };
}