import { type AuthGet, type AuthSet } from "../shared";
import type { AuthState } from "../types";

type EndpointActionKeys =
  | "getEndpointByName"
  | "getEndpointUrl"
  | "isWhitelisted"
  | "getMenuEndpoints";

/**
 * 端点查询与 URL 构建，以及路径白名单判断。
 * getEndpointUrl 支持接口路径中的 ${key} 占位符按缓存值动态替换。
 */
export function createEndpointActions(
  _set: AuthSet,
  get: AuthGet,
): Pick<AuthState, EndpointActionKeys> {
  return {
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

    getMenuEndpoints: () => {
      return get().webhook.endpoints.filter((e) => e.bindToMenu);
    },
  };
}