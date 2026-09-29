import { cleanupDisallowedKeys } from "../../../utils/cacheWhitelist";
import { parseExpireTime, type AuthGet, type AuthSet } from "../shared";
import type { AuthState } from "../types";

type SessionActionKeys = "performLogin" | "performLogout";

/**
 * 会话生命周期：登录（执行登录端点、落令牌与用户信息、启动刷新计时器）
 * 与登出（执行注销端点、清空令牌/缓存/用户并停止计时器）。
 */
export function createSessionActions(
  set: AuthSet,
  get: AuthGet,
): Pick<AuthState, SessionActionKeys> {
  return {
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
  };
}