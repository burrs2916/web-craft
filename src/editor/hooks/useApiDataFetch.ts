/**
 * useApiDataFetch — 统一的数据获取 Hook
 *
 * 所有组件通过此 Hook 接入数据，支持：
 *   - 静态数据模式（dataMode: "static"）：直接返回 staticData，不发请求
 *   - API 动态数据模式（dataMode: "api"）：fetch + base URL 拼接 + 认证注入 + 轮询
 *
 * 认证逻辑：
 *   - authEnabled === true  → 始终注入认证 header
 *   - authEnabled === false → 始终不注入
 *   - authEnabled === null  → 跟随全局 apiConfig.authEnabled（默认 false）
 *
 * URL 拼接规则（与发布端 codegen `__wc_buildUrl` 严格一致）：
 *   - apiUrl 以 http:// 或 https:// 开头 → 直接使用（跳过 baseUrl 拼接）
 *   - apiUrl 有值但不以 http 开头 → 作为路径，与 baseUrl 拼接（baseUrl 为空则原样返回）
 *   - apiPath 有值 → 与 baseUrl 拼接（baseUrl 为空则原样返回）
 *   - apiUrl 与 apiPath 均为空 → 返回 baseUrl 本身（未配置则为空串）
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useWebsiteAuthStore } from "../../store/websiteAuthStore";
import { useEditorStore } from "../../store/editorStore";
import { resolveEffectiveDataConfig } from "../../shared/resolveDataConfig";
import type { SceneApiConfig } from "../../types/scene";

/* ──────────────────────────────────────────────
 * 类型定义
 * ────────────────────────────────────────────── */
export interface ApiDataFetchConfig {
  /** 数据模式 */
  dataMode?: "static" | "api";
  /** 静态数据 */
  staticData?: unknown;
  /** API 路径，与全局 baseUrl 拼接 */
  apiPath?: string;
  /** 完整 URL（以 http 开头时跳过 baseUrl 拼接），优先级高于 apiPath */
  apiUrl?: string;
  /** 请求方法 */
  apiMethod?: "GET" | "POST";
  /** POST 请求体（JSON 字符串或对象） */
  apiBody?: unknown;
  /** 组件级额外 headers（JSON 字符串或对象） */
  apiHeaders?: unknown;
  /** 轮询间隔（秒），0 = 只拉取一次 */
  apiInterval?: number;
  /** 响应取值路径，如 "data.metrics.cpu" */
  apiDataPath?: string;
  /** 是否注入认证 header：true=启用, false=禁用, null=跟随全局 */
  authEnabled?: boolean | null;
  /** 绑定的全局数据源 id：非空时以该数据源配置覆盖本组件自带的 dataMode/staticData/api* */
  dataSourceId?: string;
}

export interface ApiDataFetchResult<T = unknown> {
  /** 当前数据值 */
  data: T | null;
  /** 是否正在加载 */
  loading: boolean;
  /** 错误信息 */
  error: string | null;
  /** 是否因站点静态模式被禁用（动态接口不发起请求） */
  blocked: boolean;
  /** 手动重新拉取 */
  refetch: () => void;
}

/* ──────────────────────────────────────────────
 * 工具函数
 * ────────────────────────────────────────────── */

/** 从嵌套对象按点号路径取值 */
function getNestedValue(obj: unknown, path: string): unknown {
  if (!path || !obj) return undefined;
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/** 安全解析 JSON 字符串，失败时返回 fallback */
function safeParseJSON(value: unknown, fallback: unknown): unknown {
  if (value == null || value === "") return fallback;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return value;
}

/**
 * 构建 URL：apiUrl 优先，其次 baseUrl + apiPath
 *
 * 与发布端 codegen 运行时 __wc_buildUrl 完全一致的拼接规则：
 *   - apiUrl 为完整 http(s) URL → 直接使用，跳过 baseUrl 拼接
 *   - apiUrl 为相对路径 → 与 baseUrl 拼接（baseUrl 未配置时原样返回）
 *   - apiPath 有值 → 与 baseUrl 拼接（baseUrl 未配置时原样返回）
 *   - apiUrl 与 apiPath 均为空 → 返回 baseUrl 本身（未配置则为空串）
 */
export function buildApiUrl(
  apiUrl: string,
  apiPath: string,
  baseUrl: string,
): string {
  // apiUrl 以 http 开头 → 完整 URL，直接用
  if (apiUrl && /^https?:\/\//i.test(apiUrl)) return apiUrl;
  // apiUrl 有值但不是 http 开头 → 作为路径与 baseUrl 拼接
  if (apiUrl) {
    return joinUrl(baseUrl, apiUrl);
  }
  // apiPath 有值 → 与 baseUrl 拼接
  if (apiPath) {
    return joinUrl(baseUrl, apiPath);
  }
  // 两者皆空 → baseUrl 即最终地址（apiUrl 为空时与 baseUrl 拼接的语义）
  return baseUrl || "";
}

/** 拼接 baseUrl + path，处理斜杠 */
function joinUrl(base: string, path: string): string {
  if (!base) return path;
  const cleanBase = base.replace(/\/+$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${cleanBase}${cleanPath}`;
}

/* ──────────────────────────────────────────────
 * 全局配置读取
 *
 * 从 editorStore 的 apiConfig 字段读取全局 API 配置。
 * useEditorStore 是 reactive 的——apiConfig 变化时 hook 会自动重新拉取。
 * ────────────────────────────────────────────── */
function useGlobalApiConfig(): SceneApiConfig {
  const apiConfig = useEditorStore((s) => s.apiConfig);
  return apiConfig ?? {
    baseUrl: "",
    authEnabled: false,
    defaultHeaders: {},
    timeout: 10000,
  };
}

/* ──────────────────────────────────────────────
 * 主 Hook
 * ────────────────────────────────────────────── */
export function useApiDataFetch<T = unknown>(
  config: ApiDataFetchConfig,
): ApiDataFetchResult<T> {
  // ── 全局数据源绑定：dataSourceId 非空时，以该数据源配置覆盖本组件自带的取数配置 ──
  // dataSources 来自 editorStore（reactive），数据源被编辑时绑定组件自动联动刷新。
  // 覆盖语义由共享函数 resolveEffectiveDataConfig 统一保证（与发布端 codegen 一致）。
  const dataSources = useEditorStore((s) => s.dataSources);
  const boundSourceId = String(config.dataSourceId ?? "");
  const boundSource = boundSourceId
    ? dataSources.find((d) => d.id === boundSourceId)
    : undefined;
  const effective: ApiDataFetchConfig = resolveEffectiveDataConfig(config, boundSource);

  const {
    dataMode = "static",
    staticData,
    apiPath = "",
    apiUrl = "",
    apiMethod = "GET",
    apiBody,
    apiHeaders,
    apiInterval = 0,
    apiDataPath = "",
    authEnabled = null,
  } = effective;

  // ── 认证 store ──
  const buildAuthHeaders = useWebsiteAuthStore((s) => s.buildAuthHeaders);

  // ── 全局 API 配置（reactive — apiConfig 变化时自动重拉） ──
  const globalConfig = useGlobalApiConfig();

  // ── 运行时状态 ──
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 静态模式下动态接口被停用
  const isStaticBlocked = dataMode === "api" && globalConfig.siteMode === "static";

  // ── 用于取消过期请求和清理定时器 ──
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── 静态模式：直接返回 staticData ──
  useEffect(() => {
    if (dataMode !== "static") return;
    setData(staticData as T);
    setLoading(false);
    setError(null);
  }, [dataMode, staticData]);

  // ── fetch 核心逻辑 ──
  const doFetch = useCallback(async () => {
    // 静态模式下禁止动态接口请求（孤儿 API 数据不拉取）
    if (isStaticBlocked) {
      setError("站点为静态模式，动态接口已停用。请切换为「动态」或改回静态数据源。");
      setLoading(false);
      setData(null);
      return;
    }

    // 取消上一个请求
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    // 读取全局配置（已通过 useGlobalApiConfig() reactive 获取）
    // 构建 URL（与发布端 __wc_buildUrl 同规则：完整 URL 直连 / 相对路径拼 baseUrl / 空则回退 baseUrl）
    const finalUrl = buildApiUrl(apiUrl, apiPath, globalConfig.baseUrl);
    if (!finalUrl) {
      setError("未配置 API 地址");
      return;
    }

    // 确定是否启用认证
    const useAuth = authEnabled === null ? globalConfig.authEnabled : authEnabled;

    // 构建 headers
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...globalConfig.defaultHeaders,
    };

    // 合并组件级额外 headers
    const extraHeaders = safeParseJSON(apiHeaders, {}) as Record<string, string>;
    if (extraHeaders && typeof extraHeaders === "object") {
      Object.assign(headers, extraHeaders);
    }

    // 注入认证 header
    if (useAuth) {
      try {
        const authHeaders = buildAuthHeaders(extraHeaders);
        Object.assign(headers, authHeaders);
      } catch (err) {
        console.warn("[useApiDataFetch] Failed to build auth headers:", err);
      }
    }

    // 构建 fetch 选项
    const fetchOptions: RequestInit = {
      method: apiMethod,
      headers,
      signal: controller.signal,
    };

    // POST 请求体
    if (apiMethod === "POST" && apiBody) {
      const body = safeParseJSON(apiBody, apiBody);
      fetchOptions.body = typeof body === "string" ? body : JSON.stringify(body);
    }

    // 超时控制
    const timeoutId = setTimeout(() => controller.abort(), globalConfig.timeout);

    try {
      setLoading(true);
      setError(null);

      const res = await fetch(finalUrl, fetchOptions);

      if (!res.ok) {
        setError(`HTTP ${res.status}: ${res.statusText}`);
        setLoading(false);
        return;
      }

      const json = await res.json();
      const extracted = apiDataPath ? getNestedValue(json, apiDataPath) : json;
      setData(extracted as T);
      setLoading(false);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // 被取消的请求不算错误
        return;
      }
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    } finally {
      clearTimeout(timeoutId);
    }
  }, [apiUrl, apiPath, apiMethod, apiBody, apiHeaders, apiDataPath, authEnabled, buildAuthHeaders, globalConfig, isStaticBlocked]);

  // ── API 模式：首次拉取 + 轮询 ──
  useEffect(() => {
    if (dataMode !== "api") return;

    // 首次立即拉取
    doFetch();

    // 定时轮询
    if (apiInterval > 0) {
      timerRef.current = setInterval(() => {
        doFetch();
      }, apiInterval * 1000);
    }

    // 清理
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
  }, [dataMode, apiInterval, doFetch]);

  // ── 认证态翻转（登录/登出）→ 立即重取（与发布端 auth-state-change 监听一致） ──
  const isAuthenticated = useWebsiteAuthStore((s) => s.isAuthenticated);
  const prevAuthRef = useRef(isAuthenticated);
  useEffect(() => {
    if (prevAuthRef.current === isAuthenticated) return;
    prevAuthRef.current = isAuthenticated;
    if (dataMode === "api") doFetch();
  }, [isAuthenticated, dataMode, doFetch]);

  // ── 手动 refetch ──
  const refetch = useCallback(() => {
    if (dataMode === "api") {
      doFetch();
    }
  }, [dataMode, doFetch]);

  return { data, loading, error, blocked: isStaticBlocked, refetch };
}
