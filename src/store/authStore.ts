import { create } from "zustand";
import type { AuthConfig, AuthPreset, ApiEndpoint, HeaderConfig, AuthParam, UserDisplayConfig } from "../services/tauri";
import { authApi, AUTH_PRESETS } from "../services/tauri";
import { cleanupDisallowedKeys, registerDynamicKey } from "../utils/cacheWhitelist";

interface WebhookConfig {
  baseUrl: string;
  endpoints: ApiEndpoint[];
  headerConfig: HeaderConfig[];
  userDisplayConfig: UserDisplayConfig[];
  request: {
    timeout: number;
    headers: Record<string, string>;
  };
  token: {
    storage: "localStorage" | "sessionStorage" | "memory";
    key?: string;
    header: string;
    prefix: string;
  };
  refresh: {
    enabled: boolean;
    threshold: number;
  };
}

interface LoginConfig {
  path: string;
  redirectParam: string;
  autoRedirect: boolean;
}

interface UserInfo {
  id: string;
  username: string;
  displayName?: string;
  email?: string;
  role?: string;
  permissions?: string[];
  avatar?: string;
}

interface AuthState {
  initialized: boolean;
  enabled: boolean;
  preset: AuthPreset;
  authParams: AuthParam[];
  webhook: WebhookConfig;
  login: LoginConfig;
  whitelist: string[];
  currentUser: UserInfo | undefined;
  tokenExpiresIn: number | null;
  isRefreshing: boolean;
  refreshStatus: "idle" | "success" | "error" | null;

  init: () => Promise<void>;
  getConfig: () => {
    enabled: boolean;
    preset: AuthPreset;
    authParams: AuthParam[];
    webhook: WebhookConfig;
    login: LoginConfig;
    whitelist: string[];
    currentUser?: UserInfo;
  };
  getEnabled: () => boolean;
  isAuthenticated: () => boolean;
  getCurrentUser: () => UserInfo | undefined;

  updateConfig: (partial: Partial<{
    enabled: boolean;
    preset: AuthPreset;
    authParams: AuthParam[];
    webhook: Partial<WebhookConfig>;
    login: Partial<LoginConfig>;
    whitelist: string[];
  }>) => Promise<void>;
  setCurrentUser: (user: UserInfo | undefined) => void;
  clearCurrentUser: () => void;
  reset: () => Promise<void>;

  getToken: () => string | null;
  setToken: (token: string) => void;
  clearToken: () => void;

  getRefreshToken: () => string | null;
  setRefreshToken: (token: string) => void;
  clearRefreshToken: () => void;
  clearAllTokens: () => void;

  getEndpointByName: (name: string) => ApiEndpoint | undefined;
  getEndpointUrl: (endpoint: ApiEndpoint) => string;
  isWhitelisted: (path: string) => boolean;
  getAllCachedKeys: () => string[];
  isExpirationTimeKey: (key: string) => boolean;

  getCachedValue: (key: string) => string | null;
  setCachedValue: (key: string, value: string) => void;
  clearCachedValue: (key: string) => void;
  clearAllCachedValues: () => void;

  buildHeaders: () => Record<string, string>;
  extractAndCacheResponse: (endpoint: ApiEndpoint, responseData: Record<string, unknown>) => void;

  getMenuEndpoints: () => ApiEndpoint[];
  executeEndpoint: (endpoint: ApiEndpoint) => Promise<Record<string, unknown>>;
  performLogin: () => Promise<void>;
  performLogout: () => Promise<void>;
  performRefresh: () => Promise<void>;
  startRefreshTimer: (expiresIn: number) => void;
  stopRefreshTimer: () => void;
  findExpirationTimeMapping: () => { targetKey: string; expiresInStr: string | null } | null;
  loadPresetConfig: (preset: AuthPreset) => Promise<AuthConfig | null>;
}

const defaultWebhook: WebhookConfig = {
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

const defaultLogin: LoginConfig = {
  path: "/login",
  redirectParam: "redirect",
  autoRedirect: true,
};

const memoryCache: Record<string, string> = {};

let refreshTimer: number | null = null;
let countdownTimer: number | null = null;
let retryTimer: number | null = null;
let statusClearTimer: number | null = null;
let refreshRetryCount = 0;
const MAX_REFRESH_RETRY = 3;

const getRetryDelay = (retryCount: number): number => {
  const delays = [5, 15, 30];
  return (delays[retryCount] ?? 30) * 1000;
};

const getNestedValue = (obj: Record<string, unknown>, path: string): unknown => {
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
const parseExpireTime = (value: string | number): number => {
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

export const useAuthStore = create<AuthState>()((set, get) => ({
  initialized: false,
  enabled: false,
  preset: "custom",
  authParams: [],
  webhook: defaultWebhook,
  login: defaultLogin,
  whitelist: ["/login", "/public/*"],
  currentUser: undefined,
  tokenExpiresIn: null,
  isRefreshing: false,
  refreshStatus: null,

  init: async () => {
    try {
      // 系统重启时首先清空所有缓存和状态
      get().clearAllTokens();
      get().clearAllCachedValues();
      get().clearCurrentUser();
      
      // 通过白名单机制清理非预期缓存键
      cleanupDisallowedKeys();
      
      // 强制清理所有可能的用户相关的存储（防止重启时内存为空清理不到）
      if (typeof window !== "undefined") {
        // 清理 localStorage
        if (window.localStorage) {
          // 清理 token
          localStorage.removeItem(get().webhook.token.key || "auth_token");
          localStorage.removeItem("accessToken");
          localStorage.removeItem("accessToken_refresh");
          localStorage.removeItem("refreshToken");
          localStorage.removeItem("expiresIn");
          
          // 清理用户信息
          localStorage.removeItem("userId");
          localStorage.removeItem("username");
          localStorage.removeItem("nickname");
          localStorage.removeItem("email");
          localStorage.removeItem("avatar");
          localStorage.removeItem("tenantId");
          localStorage.removeItem("tenantName");
          localStorage.removeItem("roles");
          localStorage.removeItem("permissions");

          // 清理非预期缓存键（已迁移至 SQLite 的数据源存储等）
          localStorage.removeItem("datasource-store");
          localStorage.removeItem("auth_cache_keys");
        }
        
        // 清理 sessionStorage
        if (window.sessionStorage) {
          // 清理 token
          sessionStorage.removeItem(get().webhook.token.key || "auth_token");
          sessionStorage.removeItem("accessToken");
          sessionStorage.removeItem("accessToken_refresh");
          sessionStorage.removeItem("refreshToken");
          sessionStorage.removeItem("expiresIn");
          
          // 清理用户信息
          sessionStorage.removeItem("userId");
          sessionStorage.removeItem("username");
          sessionStorage.removeItem("nickname");
          sessionStorage.removeItem("email");
          sessionStorage.removeItem("avatar");
          sessionStorage.removeItem("tenantId");
          sessionStorage.removeItem("tenantName");
          sessionStorage.removeItem("roles");
          sessionStorage.removeItem("permissions");
        }
      }
      
      // 重置所有状态
      set({
        currentUser: undefined,
        tokenExpiresIn: null,
        isRefreshing: false,
        refreshStatus: null,
      });
      
      const config = await authApi.getConfig();
      
      if (!config) {
        throw new Error("Received empty config from backend");
      }

      const processedEndpoints = Array.isArray(config.endpoints) 
        ? config.endpoints.map((e) => ({
            ...e,
            bindToMenu: e.bindToMenu ?? false,
            menuIcon: e.menuIcon,
          }))
        : [];

      const processedAuthParams = Array.isArray(config.authParams) ? config.authParams : [];
      const processedHeaderConfig = Array.isArray(config.headerConfig) ? config.headerConfig : [];
      const processedUserDisplayConfig = Array.isArray(config.userDisplayConfig) ? config.userDisplayConfig : [];

      set({
        initialized: true,
        enabled: config.enabled ?? false,
        preset: config.preset ?? "custom",
        authParams: processedAuthParams,
        webhook: {
          baseUrl: config.baseUrl ?? "",
          endpoints: processedEndpoints,
          headerConfig: processedHeaderConfig,
          userDisplayConfig: processedUserDisplayConfig,
          request: {
            timeout: config.timeout ?? 10000,
            headers: {
              "Content-Type": "application/json",
            },
          },
          token: {
            storage: (config.tokenStorage as "localStorage" | "sessionStorage" | "memory") ?? "localStorage",
            key: config.tokenKey ?? "auth_token",
            header: config.tokenHeader ?? "Authorization",
            prefix: config.tokenPrefix ?? "Bearer ",
          },
          refresh: {
            enabled: config.refreshEnabled ?? true,
            threshold: config.refreshThreshold ?? 300,
          },
        },
        login: {
          path: config.loginRedirectPath ?? "/login",
          redirectParam: config.loginRedirectParam ?? "redirect",
          autoRedirect: config.loginAutoRedirect ?? true,
        },
        whitelist: Array.isArray(config.whitelist) ? config.whitelist : ["/login", "/public/*"],
      });

      cleanupDisallowedKeys();
    } catch (error) {
      console.error("[authStore] Failed to initialize:", error);
      // 即使初始化失败也要设置 initialized 为 true，防止界面一直加载
      set({ initialized: true });
    }
  },

  getConfig: () => {
    const state = get();
    return {
      enabled: state.enabled,
      preset: state.preset,
      authParams: state.authParams,
      webhook: state.webhook,
      login: state.login,
      whitelist: state.whitelist,
      currentUser: state.currentUser,
    };
  },

  getEnabled: () => get().enabled,

  isAuthenticated: () => !!get().currentUser,

  getCurrentUser: () => get().currentUser,

  getTokenExpiresIn: () => get().tokenExpiresIn,
  getIsRefreshing: () => get().isRefreshing,
  getRefreshStatus: () => get().refreshStatus,

  updateConfig: async (partial) => {
    const state = get();

    const newEnabled = partial.enabled ?? state.enabled;
    const newPreset = partial.preset ?? state.preset;
    const newAuthParams = partial.authParams ?? state.authParams;
    const newWebhook = partial.webhook
      ? {
          ...state.webhook,
          ...partial.webhook,
          endpoints: partial.webhook.endpoints ? partial.webhook.endpoints.map(e => ({
            ...e,
            bindToMenu: e.bindToMenu ?? false,
            menuIcon: e.menuIcon,
          })) : state.webhook.endpoints,
          headerConfig: partial.webhook.headerConfig ?? state.webhook.headerConfig,
          request: {
            ...state.webhook.request,
            ...partial.webhook?.request,
          },
          token: {
            ...state.webhook.token,
            ...partial.webhook?.token,
          },
          refresh: {
            ...state.webhook.refresh,
            ...partial.webhook?.refresh,
          },
        }
      : state.webhook;
    const newLogin = partial.login
      ? {
          ...state.login,
          ...partial.login,
        }
      : state.login;
    const newWhitelist = partial.whitelist ?? state.whitelist;

    const config: AuthConfig = {
      enabled: newEnabled,
      preset: newPreset,
      baseUrl: newWebhook.baseUrl,
      authParams: newAuthParams,
      endpoints: newWebhook.endpoints,
      headerConfig: newWebhook.headerConfig,
      userDisplayConfig: newWebhook.userDisplayConfig,
      timeout: newWebhook.request.timeout,
      tokenStorage: newWebhook.token.storage,
      tokenKey: newWebhook.token.key,
      tokenHeader: newWebhook.token.header,
      tokenPrefix: newWebhook.token.prefix,
      refreshEnabled: newWebhook.refresh.enabled,
      refreshThreshold: newWebhook.refresh.threshold,
      loginRedirectPath: newLogin.path,
      loginRedirectParam: newLogin.redirectParam,
      loginAutoRedirect: newLogin.autoRedirect,
      whitelist: newWhitelist,
    };

    await authApi.updateConfig(config);

    set({
      enabled: newEnabled,
      preset: newPreset,
      authParams: newAuthParams,
      webhook: newWebhook,
      login: newLogin,
      whitelist: newWhitelist,
    });
  },

  setCurrentUser: (user) => set({ currentUser: user }),

  clearCurrentUser: () => set({ currentUser: undefined }),

  reset: async () => {
    await authApi.resetConfig();
    set({
      enabled: false,
      preset: "custom",
      authParams: [],
      webhook: defaultWebhook,
      login: defaultLogin,
      whitelist: ["/login", "/public/*"],
      currentUser: undefined,
    });
  },

  getToken: () => {
    const { storage, key } = get().webhook.token;
    const tokenKey = key || "accessToken";
    switch (storage) {
      case "localStorage":
        return localStorage.getItem(tokenKey);
      case "sessionStorage":
        return sessionStorage.getItem(tokenKey);
      case "memory":
        return memoryCache[tokenKey] ?? null;
      default:
        return null;
    }
  },

  setToken: (token) => {
    const { storage, key } = get().webhook.token;
    const tokenKey = key || "accessToken";
    registerDynamicKey(tokenKey);
    switch (storage) {
      case "localStorage":
        localStorage.setItem(tokenKey, token);
        break;
      case "sessionStorage":
        sessionStorage.setItem(tokenKey, token);
        break;
      case "memory":
        memoryCache[tokenKey] = token;
        break;
    }
  },

  clearToken: () => {
    const { storage, key } = get().webhook.token;
    const tokenKey = key || "accessToken";
    switch (storage) {
      case "localStorage":
        localStorage.removeItem(tokenKey);
        break;
      case "sessionStorage":
        sessionStorage.removeItem(tokenKey);
        break;
      case "memory":
        delete memoryCache[tokenKey];
        break;
    }
  },

  getRefreshToken: () => {
    const { storage } = get().webhook.token;
    const refreshKey = "refreshToken";
    switch (storage) {
      case "localStorage":
        return localStorage.getItem(refreshKey);
      case "sessionStorage":
        return sessionStorage.getItem(refreshKey);
      case "memory":
        return memoryCache[refreshKey] ?? null;
      default:
        return null;
    }
  },

  setRefreshToken: (token) => {
    const { storage } = get().webhook.token;
    const refreshKey = "refreshToken";
    switch (storage) {
      case "localStorage":
        localStorage.setItem(refreshKey, token);
        break;
      case "sessionStorage":
        sessionStorage.setItem(refreshKey, token);
        break;
      case "memory":
        memoryCache[refreshKey] = token;
        break;
    }
  },

  clearRefreshToken: () => {
    const { storage } = get().webhook.token;
    const refreshKey = "refreshToken";
    switch (storage) {
      case "localStorage":
        localStorage.removeItem(refreshKey);
        break;
      case "sessionStorage":
        sessionStorage.removeItem(refreshKey);
        break;
      case "memory":
        delete memoryCache[refreshKey];
        break;
    }
  },

  clearAllTokens: () => {
    const tokenKey = get().webhook.token.key || "accessToken";
    const refreshTokenKey = `${tokenKey}_refresh`;
    
    // 清除localStorage
    if (typeof window !== "undefined" && window.localStorage) {
      localStorage.removeItem(tokenKey);
      localStorage.removeItem(refreshTokenKey);
      localStorage.removeItem("refreshToken");
      localStorage.removeItem("expiresIn");
      localStorage.removeItem("userId");
      localStorage.removeItem("username");
      localStorage.removeItem("nickname");
      localStorage.removeItem("avatar");
      localStorage.removeItem("tenantId");
      localStorage.removeItem("tenantName");
      localStorage.removeItem("roles");
      localStorage.removeItem("permissions");
    }

    // 清除sessionStorage
    if (typeof window !== "undefined" && window.sessionStorage) {
      sessionStorage.removeItem(tokenKey);
      sessionStorage.removeItem(refreshTokenKey);
      sessionStorage.removeItem("refreshToken");
      sessionStorage.removeItem("expiresIn");
      sessionStorage.removeItem("userId");
      sessionStorage.removeItem("username");
      sessionStorage.removeItem("nickname");
      sessionStorage.removeItem("avatar");
      sessionStorage.removeItem("tenantId");
      sessionStorage.removeItem("tenantName");
      sessionStorage.removeItem("roles");
      sessionStorage.removeItem("permissions");
    }

    // 清除内存缓存
    Object.keys(memoryCache).forEach(key => delete memoryCache[key]);
  },

  getEndpointByName: (name) => {
    const { endpoints } = get().webhook;
    return endpoints.find((e) => e.name === name);
  },

  getEndpointUrl: (endpoint) => {
    const { baseUrl } = get().webhook;
    if (!endpoint.path) return "";
    
    // 支持接口路径里的${key}占位符动态替换
    let finalPath = endpoint.path;
    const matches = finalPath.match(/\$\{([^}]+)\}/g);
    if (matches) {
      matches.forEach((match) => {
        const key = match.slice(2, -1);
        const cachedValue = get().getCachedValue(key);
        if (cachedValue) {
          finalPath = finalPath.replace(match, cachedValue);
        }
      });
    }
    
    if (!baseUrl) return finalPath;
    return `${baseUrl}${finalPath}`;
  },

  isWhitelisted: (path) => {
    const { whitelist } = get();
    return whitelist.some((pattern) => {
      if (pattern.endsWith("/*")) {
        return path.startsWith(pattern.slice(0, -1));
      }
      return path === pattern;
    });
  },

  getAllCachedKeys: () => {
    const { storage } = get().webhook.token;
    const keys: string[] = [];
    
    switch (storage) {
      case "localStorage":
        if (typeof window !== "undefined" && window.localStorage) {
          for (let i = 0; i < window.localStorage.length; i++) {
            const key = window.localStorage.key(i);
            if (key) {
              keys.push(key);
            }
          }
        }
        break;
      case "sessionStorage":
        if (typeof window !== "undefined" && window.sessionStorage) {
          for (let i = 0; i < window.sessionStorage.length; i++) {
            const key = window.sessionStorage.key(i);
            if (key) {
              keys.push(key);
            }
          }
        }
        break;
      case "memory":
        keys.push(...Object.keys(memoryCache));
        break;
    }
    
    return keys.sort();
  },

  isExpirationTimeKey: (key) => {
    // 检查所有端点的响应映射，看有没有这个 key 被标记为 isExpirationTime
    return get().webhook.endpoints.some((endpoint) =>
      endpoint.responseMapping.some(
        (mapping) => mapping.targetKey === key && mapping.isExpirationTime
      )
    );
  },

  getCachedValue: (key) => {
    // 优先从 memoryCache 读取（内存缓存），这样注销时可以快速清空
    if (memoryCache[key] !== undefined) {
      return memoryCache[key];
    }
    
    // 如果 memoryCache 中没有，再从配置的存储中读取
    const { storage } = get().webhook.token;
    switch (storage) {
      case "localStorage":
        const lsValue = localStorage.getItem(key);
        if (lsValue !== null) {
          memoryCache[key] = lsValue;
        }
        return lsValue;
      case "sessionStorage":
        const ssValue = sessionStorage.getItem(key);
        if (ssValue !== null) {
          memoryCache[key] = ssValue;
        }
        return ssValue;
      case "memory":
        return null;
      default:
        return null;
    }
  },

  setCachedValue: (key, value) => {
    const { storage } = get().webhook.token;
    memoryCache[key] = value;
    registerDynamicKey(key);
    
    switch (storage) {
      case "localStorage":
        if (typeof window !== "undefined" && window.localStorage) {
          localStorage.setItem(key, value);
        }
        break;
      case "sessionStorage":
        if (typeof window !== "undefined" && window.sessionStorage) {
          sessionStorage.setItem(key, value);
        }
        break;
      case "memory":
        break;
    }
  },

  clearCachedValue: (key) => {
    // 从 memoryCache 中删除
    delete memoryCache[key];
    
    // 从持久化存储中删除
    const { storage } = get().webhook.token;
    switch (storage) {
      case "localStorage":
        localStorage.removeItem(key);
        break;
      case "sessionStorage":
        sessionStorage.removeItem(key);
        break;
      case "memory":
        break;
    }
  },

  clearAllCachedValues: () => {
    const { storage } = get().webhook.token;
    
    // 遍历所有内存缓存的键，同时清理持久化存储
    Object.keys(memoryCache).forEach(key => {
      switch (storage) {
        case "localStorage":
          if (typeof window !== "undefined" && window.localStorage) {
            localStorage.removeItem(key);
          }
          break;
        case "sessionStorage":
          if (typeof window !== "undefined" && window.sessionStorage) {
            sessionStorage.removeItem(key);
          }
          break;
        case "memory":
          break;
      }
      
      // 最后清理内存缓存
      delete memoryCache[key];
    });
  },

  buildHeaders: () => {
    const { headerConfig, token } = get().webhook;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // 从配置里读取主令牌键名，完全动态
    const tokenKey = token.key || "accessToken";
    const accessToken = get().getCachedValue(tokenKey);
    
    const tokenHeaderName = token.header || "Authorization";
    
    headerConfig.forEach((config) => {
      if (config.headerName === tokenHeaderName) {
        return;
      }
      
      let value = config.valueTemplate;
      const matches = value.match(/\$\{([^}]+)\}/g);
      if (matches) {
        matches.forEach((match) => {
          const key = match.slice(2, -1);
          const cachedValue = get().getCachedValue(key);
          if (cachedValue) {
            value = value.replace(match, cachedValue);
          }
        });
      }
      headers[config.headerName] = value;
    });
    
    if (accessToken) {
      const prefix = token.prefix ?? "Bearer ";
      headers[tokenHeaderName] = prefix + accessToken;
    }

    return headers;
  },

  extractAndCacheResponse: (endpoint, responseData) => {
    endpoint.responseMapping.forEach((mapping) => {
      if (mapping.saveToCache) {
        const value = getNestedValue(responseData, mapping.sourcePath);
        if (value !== undefined && value !== null) {
          get().setCachedValue(mapping.targetKey, String(value));
        }
      }
    });
  },

  getMenuEndpoints: () => {
    return get().webhook.endpoints.filter((e) => e.bindToMenu);
  },

  executeEndpoint: async (endpoint) => {
    const { webhook, buildHeaders, extractAndCacheResponse } = get();
    const url = get().getEndpointUrl(endpoint);

    if (!url) {
      throw new Error(`Endpoint ${endpoint.name} has no URL configured`);
    }

    const headers = buildHeaders();
    const body: Record<string, string> = {};
    const queryParams: Record<string, string> = {};
    const formData: Record<string, string> = {};

    get().authParams.forEach((param) => {
      if (!param.value) return;
      switch (param.location) {
        case "body":
          body[param.key] = param.value;
          break;
        case "query":
          queryParams[param.key] = param.value;
          break;
        case "formData":
          formData[param.key] = param.value;
          break;
      }
    });

    let requestUrl = url;
    if (Object.keys(queryParams).length > 0) {
      const searchParams = new URLSearchParams(queryParams);
      requestUrl = `${url}${url.includes("?") ? "&" : "?"}${searchParams.toString()}`;
    }

    let requestBody: string | FormData | undefined;
    if (endpoint.method !== "GET") {
      if (Object.keys(formData).length > 0) {
        const fd = new FormData();
        Object.entries(formData).forEach(([k, v]) => fd.append(k, v));
        Object.entries(body).forEach(([k, v]) => fd.append(k, v));
        requestBody = fd;
        delete headers["Content-Type"];
      } else if (Object.keys(body).length > 0) {
        requestBody = JSON.stringify(body);
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), webhook.request.timeout);

    try {
      const response = await fetch(requestUrl, {
        method: endpoint.method,
        headers,
        body: requestBody,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Request failed (${response.status}): ${errorText}`);
      }

      const responseData = await response.json();
      extractAndCacheResponse(endpoint, responseData);

      return responseData;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  },

  performLogin: async () => {
    // 查找登录端点：优先找 endpointType === "login" 的，如果没有，找第一个绑定到菜单且非注销的端点
    let loginEndpoint = get().webhook.endpoints.find(
      (e) => e.bindToMenu && e.endpointType === "login"
    );
    
    // 如果没找到，找任意一个绑定到菜单的非注销端点
    if (!loginEndpoint) {
      loginEndpoint = get().webhook.endpoints.find(
        (e) => e.bindToMenu && e.endpointType !== "logout"
      );
    }

    if (!loginEndpoint) {
      throw new Error("No login endpoint configured");
    }

    await get().executeEndpoint(loginEndpoint);
    
    const tokenKey = get().webhook.token.key || "accessToken";
    const token = get().getCachedValue(tokenKey);
    if (token) {
      get().setToken(token);
    }

    // 兼容旧键名和新键名
    const username = 
      get().getCachedValue("username") || 
      get().getCachedValue("preferred_username") || 
      "";
    const email = get().getCachedValue("email") || "";
    const userId = 
      get().getCachedValue("userId") || 
      get().getCachedValue("user_id") || 
      get().getCachedValue("sub") || 
      "";

    get().setCurrentUser({
      id: userId,
      username,
      displayName: username,
      email,
    });
    
    const expInfo = get().findExpirationTimeMapping();
    if (expInfo && expInfo.expiresInStr) {
      const expiresIn = parseExpireTime(expInfo.expiresInStr);
      if (expiresIn > 0) {
        get().startRefreshTimer(expiresIn);
      }
    }
  },

  performLogout: async () => {
    get().stopRefreshTimer();
    
    const logoutEndpoint = get().webhook.endpoints.find(
      (e) => e.bindToMenu && e.endpointType === "logout"
    );

    if (logoutEndpoint) {
      try {
        await get().executeEndpoint(logoutEndpoint);
      } catch (error) {
        console.warn("[Logout] 退出接口调用失败，将继续本地登出:", error);
      }
    }

    get().clearAllTokens();
    get().clearAllCachedValues();
    get().clearCurrentUser();
    
    cleanupDisallowedKeys();
    
    set({
      tokenExpiresIn: null,
      isRefreshing: false,
      refreshStatus: null,
    });
  },

  findExpirationTimeMapping: () => {
    const expMapping = get().webhook.endpoints
      .find((e) => e.responseMapping.some((m) => m.isExpirationTime))
      ?.responseMapping.find((m) => m.isExpirationTime);
    
    if (!expMapping) return null;
    
    const expiresInStr = get().getCachedValue(expMapping.targetKey);
    return { targetKey: expMapping.targetKey, expiresInStr };
  },

  performRefresh: async () => {
    const refreshEndpoint = get().webhook.endpoints.find(
      (e) => e.endpointType === "refresh"
    );

    if (!refreshEndpoint) {
      console.warn("[Refresh] 未配置刷新端点，跳过刷新");
      return;
    }

    set({ isRefreshing: true, refreshStatus: "idle" });

    try {
      const url = get().getEndpointUrl(refreshEndpoint);
      if (!url) {
        throw new Error("刷新端点未配置 URL");
      }

      const headers = get().buildHeaders();
      const refreshToken = get().getRefreshToken();

      let requestUrl = url;
      let requestBody: string | FormData | undefined;

      if (refreshEndpoint.method === "GET") {
        if (refreshToken) {
          const sep = requestUrl.includes("?") ? "&" : "?";
          requestUrl = `${requestUrl}${sep}refreshToken=${encodeURIComponent(refreshToken)}`;
        }
      } else {
        const body: Record<string, string> = {};
        const formData: Record<string, string> = {};
        const queryParams: Record<string, string> = {};

        get().authParams.forEach((param) => {
          if (!param.value) return;
          switch (param.location) {
            case "body":
              body[param.key] = param.value;
              break;
            case "query":
              queryParams[param.key] = param.value;
              break;
            case "formData":
              formData[param.key] = param.value;
              break;
          }
        });

        if (refreshToken) {
          queryParams["refreshToken"] = refreshToken;
        }

        if (Object.keys(queryParams).length > 0) {
          const searchParams = new URLSearchParams(queryParams);
          requestUrl = `${url}${url.includes("?") ? "&" : "?"}${searchParams.toString()}`;
        }

        if (Object.keys(formData).length > 0) {
          const fd = new FormData();
          Object.entries(formData).forEach(([k, v]) => fd.append(k, v));
          Object.entries(body).forEach(([k, v]) => fd.append(k, v));
          requestBody = fd;
          delete headers["Content-Type"];
        } else if (Object.keys(body).length > 0) {
          requestBody = JSON.stringify(body);
        }
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), get().webhook.request.timeout);

      const response = await fetch(requestUrl, {
        method: refreshEndpoint.method,
        headers,
        body: refreshEndpoint.method !== "GET" ? requestBody : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`刷新请求失败 (${response.status}): ${errorText}`);
      }

      const responseData = await response.json();
      console.log("[Refresh] ============== 刷新请求开始 ==============");
      console.log("[Refresh] 刷新端点信息:", refreshEndpoint);
      console.log("[Refresh] 刷新端点响应映射:", refreshEndpoint.responseMapping);
      console.log("[Refresh] 刷新响应原始数据:", responseData);

      // 检查业务状态码
      if (responseData.code !== 0 && responseData.code !== undefined) {
        const errorMsg = responseData.msg || "刷新请求业务失败";
        console.error("[Refresh] 刷新请求业务失败:", errorMsg, "code:", responseData.code);
        
        // 如果是无效刷新令牌，直接登出
        if (responseData.code === 400 && responseData.msg?.includes("无效的刷新令牌")) {
          console.warn("[Refresh] 检测到无效刷新令牌，执行强制登出");
          get().stopRefreshTimer();
          get().clearAllTokens();
          get().clearAllCachedValues();
          get().clearCurrentUser();
          cleanupDisallowedKeys();
          set({ tokenExpiresIn: null, isRefreshing: false, refreshStatus: null });
          return;
        }
        
        throw new Error(errorMsg);
      }

      get().extractAndCacheResponse(refreshEndpoint, responseData);

      const tokenKey = get().webhook.token.key || "accessToken";
      const newToken = get().getCachedValue(tokenKey);
      console.log("[Refresh] 新的 accessToken:", newToken ? "已获取" : "未获取", "key:", tokenKey);
      if (newToken) {
        get().setToken(newToken);
      }

      const refreshTokenKey = "refreshToken";
      const newRefreshToken = get().getCachedValue(refreshTokenKey);
      console.log("[Refresh] 新的 refreshToken:", newRefreshToken ? "已获取" : "未获取");
      if (newRefreshToken) {
        get().setRefreshToken(newRefreshToken);
      }

      refreshRetryCount = 0;
      set({ refreshStatus: "success" });

      console.log("[Refresh] 当前所有缓存值:", memoryCache);
      
      // 查找所有端点中标记了 isExpirationTime 的映射
      const allEndpoints = get().webhook.endpoints;
      const allExpMappings = allEndpoints.flatMap(e => 
        e.responseMapping.filter(m => m.isExpirationTime).map(m => ({ endpoint: e.name, mapping: m }))
      );
      console.log("[Refresh] 所有标记了'用于刷新'的映射:", allExpMappings);
      
      const expInfo = get().findExpirationTimeMapping();
      console.log("[Refresh] 过期时间映射信息:", expInfo);
      if (expInfo && expInfo.expiresInStr) {
        const newExpiresIn = parseExpireTime(expInfo.expiresInStr);
        console.log("[Refresh] 解析出的新过期时间(秒):", newExpiresIn, "原始值:", expInfo.expiresInStr);
        if (newExpiresIn > 0) {
          get().startRefreshTimer(newExpiresIn);
        } else {
          console.warn("[Refresh] 刷新成功但解析出的过期时间无效:", newExpiresIn, "尝试从刷新端点响应映射中查找");
          const refreshExpMapping = refreshEndpoint.responseMapping.find((m) => m.isExpirationTime);
          if (refreshExpMapping) {
            const rawValue = get().getCachedValue(refreshExpMapping.targetKey);
            console.log("[Refresh] 刷新端点过期时间缓存值:", rawValue);
          }
        }
      } else {
        console.warn("[Refresh] 未找到过期时间映射，尝试从刷新端点响应映射中查找");
        const refreshExpMapping = refreshEndpoint.responseMapping.find((m) => m.isExpirationTime);
        if (refreshExpMapping) {
          const rawValue = get().getCachedValue(refreshExpMapping.targetKey);
          console.log("[Refresh] 刷新端点过期时间缓存值:", rawValue);
          if (rawValue) {
            const newExpiresIn = parseExpireTime(rawValue);
            if (newExpiresIn > 0) {
              get().startRefreshTimer(newExpiresIn);
            }
          }
        }
      }

      if (statusClearTimer !== null) {
        clearTimeout(statusClearTimer);
        statusClearTimer = null;
      }
      statusClearTimer = window.setTimeout(() => {
        statusClearTimer = null;
        if (get().refreshStatus === "success") {
          set({ refreshStatus: null });
        }
      }, 3000);

    } catch (error) {
      console.error("[Refresh] 刷新失败:", error);
      set({ refreshStatus: "error" });

      const currentExpiresIn = get().tokenExpiresIn;
      if (currentExpiresIn !== null && currentExpiresIn <= 0) {
        console.warn("[Refresh] Token 已过期且刷新失败，执行强制登出");
        get().stopRefreshTimer();
        get().clearAllTokens();
        get().clearAllCachedValues();
        get().clearCurrentUser();
        cleanupDisallowedKeys();
        set({ tokenExpiresIn: null, isRefreshing: false, refreshStatus: null });
        return;
      }

      if (refreshRetryCount < MAX_REFRESH_RETRY) {
        const retryDelay = getRetryDelay(refreshRetryCount);
        refreshRetryCount++;
        console.log(`[Refresh] 第 ${refreshRetryCount}/${MAX_REFRESH_RETRY} 次重试，${retryDelay / 1000} 秒后执行...`);
        if (retryTimer !== null) {
          clearTimeout(retryTimer);
        }
        retryTimer = window.setTimeout(() => {
          retryTimer = null;
          if (get().isAuthenticated() && get().tokenExpiresIn !== null) {
            get().performRefresh();
          }
        }, retryDelay);
      } else {
        console.warn("[Refresh] 已达最大重试次数，停止重试");
      }

      if (statusClearTimer !== null) {
        clearTimeout(statusClearTimer);
        statusClearTimer = null;
      }
      statusClearTimer = window.setTimeout(() => {
        statusClearTimer = null;
        if (get().refreshStatus === "error") {
          set({ refreshStatus: null });
        }
      }, 5000);

    } finally {
      set({ isRefreshing: false });
    }
  },

  startRefreshTimer: (expiresIn: number) => {
    if (refreshTimer !== null) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
    if (countdownTimer !== null) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
    refreshRetryCount = 0;

    const { refresh } = get().webhook;
    const threshold = refresh.threshold ?? 30;

    if (expiresIn <= 0) {
      console.warn("[RefreshTimer] expiresIn <= 0, 无法启动计时器:", expiresIn);
      return;
    }

    set({ tokenExpiresIn: expiresIn, refreshStatus: "idle" });

    countdownTimer = window.setInterval(() => {
      const currentExpiresIn = get().tokenExpiresIn;
      if (currentExpiresIn !== null && currentExpiresIn > 0) {
        set({ tokenExpiresIn: currentExpiresIn - 1 });
      } else {
        if (countdownTimer !== null) {
          clearInterval(countdownTimer);
          countdownTimer = null;
        }
        set({ tokenExpiresIn: 0 });
      }
    }, 1000);

    let delayMs = (expiresIn - threshold) * 1000;

    if (delayMs <= 0) {
      delayMs = 1000;
    }

    refreshTimer = window.setTimeout(async () => {
      await get().performRefresh();
    }, delayMs);
  },

  stopRefreshTimer: () => {
    if (refreshTimer !== null) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
    if (countdownTimer !== null) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    if (statusClearTimer !== null) {
      clearTimeout(statusClearTimer);
      statusClearTimer = null;
    }
    refreshRetryCount = 0;
    set({ tokenExpiresIn: null, isRefreshing: false, refreshStatus: null });
  },

  loadPresetConfig: async (preset: AuthPreset) => {
    try {
      const config = await authApi.getPresetConfig(preset);
      if (config) {
        return config;
      }
      return null;
    } catch (error) {
      console.error("[Preset] Failed to load preset config:", error);
      return null;
    }
  },
}));

export { AUTH_PRESETS };
