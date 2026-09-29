import { getNestedValue, type AuthGet, type AuthSet } from "../shared";
import type { AuthState } from "../types";

type RequestActionKeys = "buildHeaders" | "extractAndCacheResponse" | "executeEndpoint";

/**
 * 请求构建与执行：组装请求头（含令牌与模板占位符）、按响应映射落缓存，
 * 以及发起端点请求（支持 body / query / formData 三种参数位置）。
 */
export function createRequestActions(
  _set: AuthSet,
  get: AuthGet,
): Pick<AuthState, RequestActionKeys> {
  return {
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
  };
}