import type { AuthConfig, AuthPreset } from "../../../services/tauri";
import { authApi } from "../../../services/tauri";
import { cleanupDisallowedKeys } from "../../../utils/cacheWhitelist";
import { defaultLogin, defaultWebhook, type AuthGet, type AuthSet } from "../shared";
import type { AuthState } from "../types";

type ConfigActionKeys =
  | "init"
  | "getConfig"
  | "getEnabled"
  | "isAuthenticated"
  | "getCurrentUser"
  | "updateConfig"
  | "setCurrentUser"
  | "clearCurrentUser"
  | "reset"
  | "loadPresetConfig";

/**
 * 配置 / 生命周期类 action：初始化、配置读写、当前用户、重置、预设加载。
 * 另含 getTokenExpiresIn / getIsRefreshing / getRefreshStatus 三个派生读取器
 * （拆分前即已实现但未纳入 AuthState 接口，此处按原样保留）。
 */
export function createConfigActions(
  set: AuthSet,
  get: AuthGet,
): Pick<AuthState, ConfigActionKeys> & {
  getTokenExpiresIn: () => number | null;
  getIsRefreshing: () => boolean;
  getRefreshStatus: () => AuthState["refreshStatus"];
} {
  return {
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
  };
}