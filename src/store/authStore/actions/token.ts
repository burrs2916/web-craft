import { registerDynamicKey } from "../../../utils/cacheWhitelist";
import { memoryCache, type AuthGet, type AuthSet } from "../shared";
import type { AuthState } from "../types";

type TokenActionKeys =
  | "getToken"
  | "setToken"
  | "clearToken"
  | "getRefreshToken"
  | "setRefreshToken"
  | "clearRefreshToken"
  | "clearAllTokens";

/**
 * 令牌读写：主令牌（getToken/setToken/clearToken）与刷新令牌
 * （getRefreshToken/setRefreshToken/clearRefreshToken），以及一次性清空全部令牌。
 * 存储介质由 webhook.token.storage 决定（localStorage / sessionStorage / memory）。
 */
export function createTokenActions(
  _set: AuthSet,
  get: AuthGet,
): Pick<AuthState, TokenActionKeys> {
  return {
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
  };
}