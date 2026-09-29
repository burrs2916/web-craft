import type { AuthState, LoginConfig, WebhookConfig } from "./types";

/** 非 immer store 下 `set` / `get` 的最小契约。 */
export type AuthSet = (partial: Partial<AuthState>) => void;

export type AuthGet = () => AuthState;

export const defaultWebhook: WebhookConfig = {
  baseUrl: "",
  endpoints: [],
  headerConfig: [],
  userDisplayConfig: [],
  request: {
    timeout: 10000,
    headers: {
      "Content-Type": "application/json",
    },
  },
  token: {
    storage: "localStorage",
    key: "accessToken",
    header: "Authorization",
    prefix: "Bearer ",
  },
  refresh: {
    enabled: true,
    threshold: 30, // 默认提前30秒刷新
  },
};

export const defaultLogin: LoginConfig = {
  path: "/login",
  redirectParam: "redirect",
  autoRedirect: true,
};

export const memoryCache: Record<string, string> = {};

export const MAX_REFRESH_RETRY = 3;

export const getRetryDelay = (retryCount: number): number => {
  const delays = [5, 15, 30];
  return (delays[retryCount] ?? 30) * 1000;
};

export const getNestedValue = (obj: Record<string, unknown>, path: string): unknown => {
  const keys = path.split(".");
  let current: unknown = obj;
  
  for (const key of keys) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current === "object") {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  
  return current;
};

/**
 * 智能识别过期时间格式并转换为距离过期的秒数
 * 支持格式：
 * - 相对秒数：7200
 * - 绝对时间戳（秒级）：1775800792
 * - 绝对时间戳（毫秒级）：1775800792671
 * - ISO日期字符串："2026-04-10T12:00:00Z"
 */
export const parseExpireTime = (value: string | number): number => {
  // 如果是数字类型
  if (typeof value === "number") {
    // 大数字判断（超过 1e12（1万亿）说明是毫秒级时间戳）
    if (value > 1000000000000) {
      const expiresAtSeconds = Math.floor(value / 1000);
      const nowSeconds = Math.floor(Date.now() / 1000);
      return Math.max(0, expiresAtSeconds - nowSeconds);
    }
    // 小数字说明是相对秒数
    return Math.max(0, value);
  }
  
  // 如果是字符串类型
  if (typeof value === "string") {
    // 尝试解析为数字
    const numValue = Number(value);
    if (!isNaN(numValue)) {
      // 字符串数字，同上逻辑
      if (numValue > 1000000000000) {
        const expiresAtSeconds = Math.floor(numValue / 1000);
        const nowSeconds = Math.floor(Date.now() / 1000);
        return Math.max(0, expiresAtSeconds - nowSeconds);
      }
      return Math.max(0, numValue);
    }
    
    // 尝试解析为日期
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      const expiresAtSeconds = Math.floor(date.getTime() / 1000);
      const nowSeconds = Math.floor(Date.now() / 1000);
      return Math.max(0, expiresAtSeconds - nowSeconds);
    }
  }
  
  console.warn("[Refresh] 无法识别的过期时间格式:", value);
  return 0;
};