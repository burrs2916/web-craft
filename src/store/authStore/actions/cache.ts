import { registerDynamicKey } from "../../../utils/cacheWhitelist";
import { memoryCache, type AuthGet, type AuthSet } from "../shared";
import type { AuthState } from "../types";

type CacheActionKeys =
  | "getAllCachedKeys"
  | "isExpirationTimeKey"
  | "getCachedValue"
  | "setCachedValue"
  | "clearCachedValue"
  | "clearAllCachedValues";

/**
 * 认证缓存读写：以 memoryCache 为一级缓存，并按配置的存储介质落盘。
 * 另含缓存键枚举与「是否过期时间键」判定（依据端点响应映射的 isExpirationTime 标记）。
 */
export function createCacheActions(
  _set: AuthSet,
  get: AuthGet,
): Pick<AuthState, CacheActionKeys> {
  return {
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
  };
}