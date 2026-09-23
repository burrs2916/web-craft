import type { DataSource, DataSourceStatus } from "../../types/dataSource";
import type { DataSourceAdapter, AdapterFetchResult, AdapterConnectOptions, FetchRequestConfig } from "./types";
import { extractData } from "./types";
import { getWebsiteAuthState, parseExpireTime, resolveResponseError, encodeAuthBody } from "../../store/websiteAuthStore";

interface ActiveConnection {
  controller: AbortController | null;
  status: DataSourceStatus;
}

let refreshRetryCount = 0;
const MAX_REFRESH_RETRY = 3;

const getRetryDelay = (retryCount: number): number => {
  const delays = [5, 15, 30];
  return (delays[retryCount] ?? 30) * 1000;
};

export class HttpAdapter implements DataSourceAdapter {
  readonly type = "http";

  private connections: Record<string, ActiveConnection> = {};
  private tokenExpiredHandler: ((e: Event) => void) | null = null;

  async connect(ds: DataSource, options: AdapterConnectOptions): Promise<void> {
    this.disconnect(ds.id);

    // P0-4: 监听 webcraft-token-expired 事件，触发 token 自动刷新
    if (!this.tokenExpiredHandler && typeof window !== "undefined") {
      this.tokenExpiredHandler = ((e: Event) => {
        const detail = (e as CustomEvent).detail as { refreshToken?: string };
        if (detail?.refreshToken) {
          this.tryRefreshToken();
        }
      }) as EventListener;
      window.addEventListener("webcraft-token-expired", this.tokenExpiredHandler);
    }

    if (!ds.connection.url) {
      options.onStatusChange("error", "HTTP 未配置 URL");
      return;
    }

    this.connections[ds.id] = { controller: null, status: "connecting" };
    options.onStatusChange("connecting");

    try {
      const baseUrl = ds.connection.url.replace(/\/+$/, "");
      const testApi = ds.testApis.length > 0 ? ds.testApis[0] : null;
      const testPath = testApi?.path
        ? (testApi.path.startsWith("/") ? testApi.path : `/${testApi.path}`)
        : "";
      const fullUrl = testPath ? `${baseUrl}${testPath}` : baseUrl;

      const method = testApi?.method || "GET";
      const body = testApi?.body;

      const headers: Record<string, string> = {};
      ds.connection.headers
        .filter((h) => h.enabled && h.key)
        .forEach((h) => { headers[h.key] = h.value; });
      if (body && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), ds.connection.timeout);

      const response = await fetch(fullUrl, {
        method,
        headers,
        body: method !== "GET" ? body : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        this.connections[ds.id] = { controller: null, status: "connected" };
        options.onStatusChange("connected");
      } else {
        const errorText = await response.text().catch(() => "");
        this.connections[ds.id] = { controller: null, status: "failed" };
        options.onStatusChange("failed", `HTTP ${response.status}: ${errorText}`);
      }
    } catch (error) {
      this.connections[ds.id] = { controller: null, status: "error" };
      options.onStatusChange("error", error instanceof Error ? error.message : "连接测试失败");
    }
  }

  disconnect(dsId: string): void {
    const conn = this.connections[dsId];
    if (conn?.controller) {
      conn.controller.abort();
    }
    delete this.connections[dsId];
  }

  async fetch(config: FetchRequestConfig): Promise<AdapterFetchResult> {
    if (!config.url) {
      throw new Error("HTTP 请求未配置 URL");
    }

    const authState = getWebsiteAuthState();

    // ─── 认证 header 注入（配置驱动） ───
    // 使用 buildAuthHeaders() 读取 token + headerConfigs（支持多租户等自定义 header）
    // 用户手动在 config.headers 设置的 header 优先
    const authHeaders = authState.isAuthenticated
      ? authState.buildAuthHeaders()
      : {};

    const headers: Record<string, string> = {
      ...authHeaders,
      ...config.headers,
    };

    const queryParams: Record<string, string> = {};
    const bodyParams: Record<string, string> = {};
    config.params
      .filter((p) => p.key)
      .forEach((p) => {
        if (p.location === "query") {
          queryParams[p.key] = p.value;
        } else if (p.location === "body") {
          bodyParams[p.key] = p.value;
        } else if (p.location === "header") {
          headers[p.key] = p.value;
        }
      });

    let requestUrl = config.url;
    if (Object.keys(queryParams).length > 0) {
      const searchParams = new URLSearchParams(queryParams);
      requestUrl = `${requestUrl}${requestUrl.includes("?") ? "&" : "?"}${searchParams.toString()}`;
    }

    let requestBody: string | undefined;
    if (config.method !== "GET") {
      if (config.body) {
        requestBody = config.body;
      } else if (Object.keys(bodyParams).length > 0) {
        requestBody = JSON.stringify(bodyParams);
        if (!headers["Content-Type"]) {
          headers["Content-Type"] = "application/json";
        }
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeout);

    try {
      const response = await fetch(requestUrl, {
        method: config.method,
        headers,
        body: config.method !== "GET" ? requestBody : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        // ─── 401 自动刷新 token（配置驱动） ───
        if (response.status === 401) {
          const refreshed = await this.tryRefreshToken();
          if (refreshed) {
            const newAuthState = getWebsiteAuthState();
            const newAuthHeaders = newAuthState.isAuthenticated
              ? newAuthState.buildAuthHeaders()
              : {};
            Object.assign(headers, newAuthHeaders, config.headers);

            const retryResponse = await fetch(requestUrl, {
              method: config.method,
              headers,
              body: config.method !== "GET" ? requestBody : undefined,
              signal: controller.signal,
            });
            if (retryResponse.ok) {
              const retryContentType = retryResponse.headers.get("content-type") || "";
              let retryData: unknown;
              if (retryContentType.includes("application/json")) {
                retryData = await retryResponse.json();
              } else {
                retryData = await retryResponse.text();
              }
              const retryExtracted = extractData(retryData, config.responseMapping);
              return {
                raw: retryData,
                extracted: retryExtracted,
                timestamp: new Date().toISOString(),
              };
            }
          }
        }
        const errorText = await response.text();
        throw new Error(`请求失败 (${response.status}): ${errorText}`);
      }

      const contentType = response.headers.get("content-type") || "";
      let responseData: unknown;
      if (contentType.includes("application/json")) {
        responseData = await response.json();
      } else {
        responseData = await response.text();
      }
      const extracted = extractData(responseData, config.responseMapping);

      return {
        raw: responseData,
        extracted,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * 尝试刷新 access token（配置驱动）
   * 支持：
   * - POST body 方式（传统 JWT）
   * - GET query 参数方式（Token 放 URL query）
   * - 从 config.endpoints 查找 endpointType="refresh" 的端点
   * - 使用 responseMapping 提取新 token
   * - parseExpireTime 智能识别过期时间格式
   * - 3 次指数退避重试
   * - 业务码检测（code=400 无效令牌 → 强制登出）
   */
  private async tryRefreshToken(): Promise<boolean> {
    const authState = getWebsiteAuthState();
    if (authState.isRefreshing) return false;

    const refreshToken = authState.getRefreshToken();
    if (!refreshToken) return false;

    const { config } = authState;
    const refreshEndpoint = config.endpoints.find(
      (e) => e.endpointType === "refresh",
    );
    if (!refreshEndpoint) return false;

    authState.setRefreshing(true);
    try {
      let requestUrl = refreshEndpoint.path;
      const method = refreshEndpoint.method || "POST";

      const headers = authState.buildAuthHeaders();
      let requestBody: string | undefined;

      if (method === "GET") {
        // Token 放 query 参数
        if (refreshToken) {
          const sep = requestUrl.includes("?") ? "&" : "?";
          requestUrl = `${requestUrl}${sep}refreshToken=${encodeURIComponent(refreshToken)}`;
        }
      } else {
        // v7: 按 refresh 端点的 content-type 配置编码请求体（默认 json）
        const enc = encodeAuthBody({ refreshToken }, [], refreshEndpoint.contentType);
        Object.assign(headers, enc.headers);
        if (enc.forceNoContentType) delete headers["Content-Type"];
        requestBody = enc.body as string | undefined;
      }

      const response = await fetch(requestUrl, {
        method,
        headers,
        body: method !== "GET" ? requestBody : undefined,
      });

      if (!response.ok) {
        authState.setError("Token 刷新失败");
        authState.logout();
        return false;
      }

      const data = await response.json() as Record<string, unknown>;

      // 业务成败判断（配置驱动，v6）：成功 → 继续提取新 token；业务失败 → 会话失效强制登出
      const businessError = resolveResponseError(data, config.validation);
      if (businessError) {
        authState.setError(businessError);
        authState.stopRefreshTimer();
        authState.logout();
        return false;
      }

      // 使用 responseMapping 提取新 token
      // v4: 优先使用端点的 responseMapping，为空时回退到全局 responseMappings
      const effectiveMappings = refreshEndpoint.responseMapping?.length
        ? refreshEndpoint.responseMapping
        : config.responseMappings;
      authState.extractAndCacheResponse(data, effectiveMappings);

      const tokenKey = config.token.key || "auth_token";
      const newToken = authState.getCachedValue(tokenKey);
      if (newToken) {
        authState.setToken(newToken);
      }

      // P0-5: 刷新成功后 dispatch webcraft-token-refreshed，通知 AuthGuard 更新 UI
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("webcraft-token-refreshed", {
            detail: { token: newToken },
          }),
        );
      }

      // 智能过期时间解析
      const expInfo = authState.findExpirationTimeMapping();
      if (expInfo?.expiresInStr) {
        const newExpiresIn = parseExpireTime(expInfo.expiresInStr);
        if (newExpiresIn > 0 && config.refresh.enabled) {
          authState.startRefreshTimer(newExpiresIn);
        }
      }

      refreshRetryCount = 0;
      return true;
    } catch {
      // 指数退避重试
      if (refreshRetryCount < MAX_REFRESH_RETRY) {
        const retryDelay = getRetryDelay(refreshRetryCount);
        refreshRetryCount++;
        setTimeout(() => {
          if (authState.isAuthenticated) {
            this.tryRefreshToken();
          }
        }, retryDelay);
      } else {
        authState.setError("Token 刷新达到最大重试次数");
        authState.logout();
      }
      return false;
    } finally {
      authState.setRefreshing(false);
    }
  }

  isConnected(dsId: string): boolean {
    return this.connections[dsId]?.status === "connected";
  }

  getStatus(dsId: string): DataSourceStatus | undefined {
    return this.connections[dsId]?.status;
  }

  destroy(): void {
    // P0-4: 移除 token 过期事件监听
    if (this.tokenExpiredHandler && typeof window !== "undefined") {
      window.removeEventListener("webcraft-token-expired", this.tokenExpiredHandler);
      this.tokenExpiredHandler = null;
    }
    Object.keys(this.connections).forEach((id) => this.disconnect(id));
  }
}
