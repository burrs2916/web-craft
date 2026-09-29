import { cleanupDisallowedKeys } from "../../../utils/cacheWhitelist";
import {
  MAX_REFRESH_RETRY,
  getRetryDelay,
  memoryCache,
  parseExpireTime,
  type AuthGet,
  type AuthSet,
} from "../shared";
import type { AuthState } from "../types";

let refreshTimer: number | null = null;
let countdownTimer: number | null = null;
let retryTimer: number | null = null;
let statusClearTimer: number | null = null;
let refreshRetryCount = 0;

type RefreshActionKeys =
  | "findExpirationTimeMapping"
  | "performRefresh"
  | "startRefreshTimer"
  | "stopRefreshTimer";

/**
 * 令牌刷新：查找过期时间映射、执行刷新请求（含失败重试与强制登出）、
 * 以及刷新计时器（到期前 threshold 秒触发）与倒计时秒数的启停。
 */
export function createRefreshActions(
  set: AuthSet,
  get: AuthGet,
): Pick<AuthState, RefreshActionKeys> {
  return {
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
  };
}