import { invoke as _tInvoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { logger } from "../utils/logger";
import type { Dashboard, LayoutItem, ComponentConfig } from "../store";
import type { MetricData } from "../store";
import type { DataSource, PersistedDataSource } from "../types/dataSource";
import type { DatabaseConnectionConfig } from "../types/database";
import type { MqttConnectionConfig } from "../types/mqtt";
import type { SceneDSL, SceneCategory } from "../types/scene";

// ─── Tauri 环境守卫 ──────────────────────────────────────────────
// Tauri 2.x 在 webview 启动时才注入 `window.__TAURI_INTERNALS__`，
// 在纯浏览器（vite dev 直接打开 / dist 静态文件 / webview 还没初始化完）
// 环境下 `invoke` 函数内部会访问 `undefined.invoke` 抛 TypeError。
// 这里包一层守卫，浏览器模式下拒绝调用并给出明确提示，store 侧
// 仍按 reject 处理（不污染控制台），不影响 UI 渲染。
function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

const invoke = <T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
  if (!isTauri()) {
    const msg = `[tauri] command "${cmd}" unavailable: not running inside Tauri webview. Use "npm run tauri dev" or "tauri dev".`;
    if (typeof window !== "undefined") {
      console.warn(msg);
    }
    return Promise.reject(new Error(msg));
  }
  return _tInvoke<T>(cmd, args);
};

export type AuthPreset = "keycloak" | "auth0" | "internal" | "custom";

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

export type ParamLocation = "body" | "query" | "formData";

export type HeaderUsage = "auth" | "api" | "both";

export interface AuthParam {
  id: string;
  key: string;
  label: string;
  value: string;
  location: ParamLocation;
  required: boolean;
  description?: string;
}

export interface ResponseMapping {
  sourcePath: string;
  targetKey: string;
  saveToCache: boolean;
  isExpirationTime?: boolean;
}

export type MenuIcon = 
  | "login" 
  | "logout" 
  | "refresh" 
  | "verify" 
  | "userInfo" 
  | "settings" 
  | "key" 
  | "shield"
  | string; // 支持自定义图标 ID

export type EndpointType = "login" | "logout" | "refresh" | "other";

export interface ApiEndpoint {
  id: string;
  name: string;
  path: string;
  method: HttpMethod;
  responseMapping: ResponseMapping[];
  bindToMenu: boolean;
  menuIcon?: string;
  endpointType?: EndpointType;
}

export interface HeaderConfig {
  id: string;
  headerName: string;
  valueTemplate: string;
  usage: HeaderUsage;
}

export type UserDisplayType = "none" | "avatar" | "name" | "email" | "tenant" | "role" | "custom";

export interface UserDisplayConfig {
  cacheKey: string;
  displayType: UserDisplayType;
  customLabel?: string;
}

export interface IconGroup {
  id: string;
  name: string;
  description?: string;
  parent_id?: string;
  updated_at: number;
}

export type IconFileType = "svg" | "png" | "jpg";

/** 后端 CustomIconDto 以 camelCase 序列化 */
export interface SystemIcon {
  id: string;
  name: string;
  filePath: string;
  fileType: string;
  groupId: string;
  createdAt: number;
  updatedAt: number;
}

export interface AuthConfig {
  enabled: boolean;
  preset: AuthPreset;
  baseUrl: string;
  authParams: AuthParam[];
  endpoints: ApiEndpoint[];
  headerConfig: HeaderConfig[];
  userDisplayConfig: UserDisplayConfig[];
  timeout: number;
  tokenStorage: string;
  tokenKey?: string; // 已废弃，保留兼容旧配置
  tokenHeader: string;
  tokenPrefix: string;
  refreshEnabled: boolean;
  refreshThreshold: number;
  loginRedirectPath: string;
  loginRedirectParam: string;
  loginAutoRedirect: boolean;
  whitelist: string[];
}

export interface SuggestedParam {
  key: string;
  label: string;
  location: ParamLocation;
  required: boolean;
  description?: string;
}

export interface SuggestedEndpoint {
  name: string;
  path: string;
  method: HttpMethod;
  suggestedMappings: { sourcePath: string; targetKey: string }[];
  bindToMenu: boolean;
  menuIcon?: MenuIcon;
}

export interface SuggestedHeader {
  headerName: string;
  valueTemplate: string;
  label: string;
  description?: string;
  category?: string;
}

export const SUGGESTED_HEADERS: Record<string, SuggestedHeader> = {
  authorization: {
    headerName: "Authorization",
    valueTemplate: "Bearer ${auth_token}",
    label: "认证令牌",
    description: "自动添加认证令牌到请求头",
    category: "认证"
  },
  tenantId: {
    headerName: "tenant-id",
    valueTemplate: "${tenant_id}",
    label: "租户ID",
    description: "多租户系统的租户标识",
    category: "租户"
  },
  visitTenantId: {
    headerName: "visit-tenant-id",
    valueTemplate: "${visit_tenant_id}",
    label: "访问租户ID",
    description: "访问租户的标识",
    category: "租户"
  },
  cacheControl: {
    headerName: "Cache-Control",
    valueTemplate: "no-cache",
    label: "禁用缓存",
    description: "防止GET请求被缓存",
    category: "缓存"
  },
  pragma: {
    headerName: "Pragma",
    valueTemplate: "no-cache",
    label: "Pragma",
    description: "HTTP/1.0 缓存控制",
    category: "缓存"
  },
  contentType: {
    headerName: "Content-Type",
    valueTemplate: "application/json",
    label: "JSON格式",
    description: "请求体为JSON格式",
    category: "内容类型"
  },
  formData: {
    headerName: "Content-Type",
    valueTemplate: "application/x-www-form-urlencoded",
    label: "表单数据",
    description: "请求体为表单数据",
    category: "内容类型"
  },
  apiKey: {
    headerName: "X-API-Key",
    valueTemplate: "${api_key}",
    label: "API Key",
    description: "API密钥认证",
    category: "认证"
  }
};

export const AUTH_PRESETS: Record<AuthPreset, {
  label: string;
  description: string;
  suggestedParams: SuggestedParam[];
  suggestedEndpoints: SuggestedEndpoint[];
}> = {
  keycloak: {
    label: "Keycloak",
    description: "Keycloak 多租户认证",
    suggestedParams: [
      { key: "tenant", label: "租户ID", location: "body", required: true, description: "租户标识" },
      { key: "client_id", label: "客户端ID", location: "body", required: true },
      { key: "client_secret", label: "客户端密钥", location: "body", required: true },
      { key: "username", label: "用户名", location: "body", required: true },
      { key: "password", label: "密码", location: "body", required: true },
      { key: "grant_type", label: "授权类型", location: "body", required: true },
      { key: "scope", label: "作用域", location: "body", required: false }
    ],
    suggestedEndpoints: [
      {
        name: "登录接口",
        path: "/realms/{tenant}/protocol/openid-connect/token",
        method: "POST",
        suggestedMappings: [
          { sourcePath: "access_token", targetKey: "accessToken" },
          { sourcePath: "refresh_token", targetKey: "refreshToken" },
          { sourcePath: "expires_in", targetKey: "expiresIn" },
        ],
        bindToMenu: true,
        menuIcon: "login",
      },
      {
        name: "注销接口",
        path: "/realms/{tenant}/protocol/openid-connect/logout",
        method: "POST",
        suggestedMappings: [],
        bindToMenu: true,
        menuIcon: "logout",
      },
      {
        name: "验证接口",
        path: "/realms/{tenant}/protocol/openid-connect/userinfo",
        method: "GET",
        suggestedMappings: [],
        bindToMenu: false,
        menuIcon: "verify",
      },
      {
        name: "刷新接口",
        path: "/realms/{tenant}/protocol/openid-connect/token",
        method: "POST",
        suggestedMappings: [],
        bindToMenu: true,
        menuIcon: "refresh",
      },
      {
        name: "用户信息",
        path: "/realms/{tenant}/protocol/openid-connect/userinfo",
        method: "GET",
        suggestedMappings: [],
        bindToMenu: true,
        menuIcon: "userInfo",
      },
      {
        name: "租户信息",
        path: "/admin/realms",
        method: "GET",
        suggestedMappings: [],
        bindToMenu: false,
        menuIcon: "settings",
      },
    ],
  },
  auth0: {
    label: "Auth0",
    description: "Auth0 OAuth2 认证",
    suggestedParams: [
      { key: "client_id", label: "客户端ID", location: "body", required: true },
      { key: "client_secret", label: "客户端密钥", location: "body", required: true },
      { key: "domain", label: "域名", location: "body", required: true },
      { key: "username", label: "用户名", location: "body", required: true },
      { key: "password", label: "密码", location: "body", required: true },
      { key: "grant_type", label: "授权类型", location: "body", required: true },
      { key: "scope", label: "作用域", location: "body", required: false },
      { key: "audience", label: "受众", location: "body", required: false }
    ],
    suggestedEndpoints: [
      {
        name: "登录接口",
        path: "/oauth/token",
        method: "POST",
        suggestedMappings: [
          { sourcePath: "access_token", targetKey: "accessToken" },
          { sourcePath: "refresh_token", targetKey: "refreshToken" },
          { sourcePath: "expires_in", targetKey: "expiresIn" },
        ],
        bindToMenu: true,
        menuIcon: "login",
      },
      {
        name: "注销接口",
        path: "/v2/logout",
        method: "GET",
        suggestedMappings: [],
        bindToMenu: true,
        menuIcon: "logout",
      },
      {
        name: "验证接口",
        path: "/userinfo",
        method: "GET",
        suggestedMappings: [],
        bindToMenu: false,
        menuIcon: "verify",
      },
      {
        name: "刷新接口",
        path: "/oauth/token",
        method: "POST",
        suggestedMappings: [],
        bindToMenu: true,
        menuIcon: "refresh",
      },
      {
        name: "用户信息",
        path: "/userinfo",
        method: "GET",
        suggestedMappings: [],
        bindToMenu: true,
        menuIcon: "userInfo",
      },
    ],
  },
  internal: {
    label: "自定义认证",
    description: "通用自定义认证服务",
    suggestedParams: [
      { key: "username", label: "用户名", location: "body", required: true },
      { key: "password", label: "密码", location: "body", required: true },
      { key: "tenantId", label: "租户ID", location: "body", required: false, description: "多租户场景必填" },
      { key: "email", label: "邮箱", location: "body", required: false },
      { key: "phone", label: "手机号", location: "body", required: false },
    ],
    suggestedEndpoints: [
      {
        name: "登录接口",
        path: "/auth/login",
        method: "POST",
        suggestedMappings: [
          { sourcePath: "data.accessToken", targetKey: "accessToken" },
          { sourcePath: "data.refreshToken", targetKey: "refreshToken" },
          { sourcePath: "data.expiresIn", targetKey: "expiresIn" },
          { sourcePath: "data.userId", targetKey: "userId" },
        ],
        bindToMenu: true,
        menuIcon: "login",
      },
      {
        name: "注销接口",
        path: "/auth/logout",
        method: "POST",
        suggestedMappings: [],
        bindToMenu: true,
        menuIcon: "logout",
      },
      {
        name: "验证接口",
        path: "/auth/validate",
        method: "GET",
        suggestedMappings: [],
        bindToMenu: false,
        menuIcon: "verify",
      },
      {
        name: "刷新接口",
        path: "/auth/refresh",
        method: "POST",
        suggestedMappings: [],
        bindToMenu: true,
        menuIcon: "refresh",
      },
      {
        name: "用户信息",
        path: "/auth/userinfo",
        method: "GET",
        suggestedMappings: [],
        bindToMenu: true,
        menuIcon: "userInfo",
      },
    ],
  },
  custom: {
    label: "自定义",
    description: "自定义认证配置",
    suggestedParams: [
      { key: "username", label: "用户名", location: "body", required: true },
      { key: "password", label: "密码", location: "body", required: true },
      { key: "email", label: "邮箱", location: "body", required: false },
      { key: "phone", label: "手机号", location: "body", required: false },
      { key: "api_key", label: "API Key", location: "body", required: false },
      { key: "client_id", label: "客户端ID", location: "body", required: false },
      { key: "client_secret", label: "客户端密钥", location: "body", required: false },
      { key: "grant_type", label: "授权类型", location: "body", required: false },
      { key: "scope", label: "作用域", location: "body", required: false }
    ],
    suggestedEndpoints: [
      {
        name: "登录接口",
        path: "/auth/login",
        method: "POST",
        suggestedMappings: [
          { sourcePath: "token", targetKey: "auth_token" },
        ],
        bindToMenu: true,
        menuIcon: "login",
      },
      {
        name: "注销接口",
        path: "/auth/logout",
        method: "POST",
        suggestedMappings: [],
        bindToMenu: true,
        menuIcon: "logout",
      },
      {
        name: "验证接口",
        path: "/auth/validate",
        method: "GET",
        suggestedMappings: [],
        bindToMenu: false,
        menuIcon: "verify",
      },
      {
        name: "刷新接口",
        path: "/auth/refresh",
        method: "POST",
        suggestedMappings: [
          { sourcePath: "token", targetKey: "auth_token" },
        ],
        bindToMenu: true,
        menuIcon: "refresh",
      },
    ],
  },
};

export const authApi = {
  async getConfig(): Promise<AuthConfig> {
    return invoke("get_auth_config");
  },

  async updateConfig(config: AuthConfig): Promise<void> {
    return invoke("update_auth_config", { config });
  },

  async resetConfig(): Promise<void> {
    return invoke("reset_auth_config");
  },

  async getPresetConfig(preset: string): Promise<AuthConfig | null> {
    return invoke("get_preset_config", { preset });
  },

  async savePresetConfig(preset: string, config: AuthConfig): Promise<void> {
    return invoke("save_preset_config", { preset, config });
  },

  async deletePresetConfig(preset: string): Promise<void> {
    return invoke("delete_preset_config", { preset });
  },
};

export const iconsApi = {
  async listCustomIcons(groupId?: string): Promise<SystemIcon[]> {
    return invoke("list_custom_icons", { groupId: groupId ?? null });
  },

  async listIconGroups(): Promise<Array<{ id: string; name: string }>> {
    return invoke("list_icon_groups");
  },

  async createIconGroup(name: string): Promise<{ id: string; name: string }> {
    return invoke("create_icon_group", { name, parentId: null, sortOrder: 0 });
  },

  async uploadCustomIcon(
    groupId: string,
    fileData: Uint8Array,
    fileName: string,
    name?: string,
    description?: string | null
  ): Promise<SystemIcon> {
    return invoke("upload_custom_icon", {
      name: name ?? fileName,
      description: description ?? null,
      groupId,
      fileData,
      fileName,
    });
  },

  async deleteCustomIcon(id: string): Promise<void> {
    return invoke("delete_custom_icon", { id });
  },

  /** 单个图标 → data URL（懒加载用，大图标按需取） */
  async getCustomIconUrl(id: string): Promise<string | null> {
    return invoke("get_custom_icon_url", { id });
  },

  /** 批量图标 → data URL 表（小图标打包返回，大图标跳过需按需再取） */
  async getCustomIconUrls(): Promise<Record<string, string>> {
    return invoke("get_custom_icon_urls");
  },
};

export const settingsApi = {
  async get(key: string): Promise<string | null> {
    return invoke("get_setting", { key });
  },

  async set(key: string, value: string): Promise<void> {
    return invoke("set_setting", { key, value });
  },

  async delete(key: string): Promise<void> {
    return invoke("delete_setting", { key });
  },
};

export const dashboardApi = {
  async list(): Promise<Dashboard[]> {
    return invoke("list_dashboards");
  },

  async get(id: string): Promise<Dashboard> {
    return invoke("get_dashboard", { id });
  },

  async create(data: {
    name: string;
    width: number;
    height: number;
    description?: string;
  }): Promise<Dashboard> {
    return invoke("create_dashboard", data);
  },

  async update(
    id: string,
    data: Partial<{
      name: string;
      description: string;
      width: number;
      height: number;
      layout: LayoutItem[];
      components: ComponentConfig[];
      theme: string;
    }>
  ): Promise<Dashboard> {
    return invoke("update_dashboard", { id, dashboard: data });
  },

  async delete(id: string): Promise<void> {
    return invoke("delete_dashboard", { id });
  },

  async export(id: string, format: "json" | "png" | "pdf"): Promise<string> {
    return invoke("export_dashboard", { id, format });
  },
};

export const datasourceApi = {
  async list(): Promise<DataSource[]> {
    const result = await invoke<Record<string, unknown>[]>("get_all_datasources");
    return result.map((ds) => ({
      ...ds,
      createdAt: typeof ds.createdAt === "number" ? new Date(ds.createdAt * 1000).toISOString() : String(ds.createdAt),
      updatedAt: typeof ds.updatedAt === "number" ? new Date(ds.updatedAt * 1000).toISOString() : String(ds.updatedAt),
    })) as DataSource[];
  },

  async get(id: string): Promise<DataSource | null> {
    const result = await invoke<Record<string, unknown> | null>("get_datasource", { id });
    if (!result) return null;
    return {
      ...result,
      createdAt: typeof result.createdAt === "number" ? new Date(result.createdAt * 1000).toISOString() : String(result.createdAt),
      updatedAt: typeof result.updatedAt === "number" ? new Date(result.updatedAt * 1000).toISOString() : String(result.updatedAt),
    } as DataSource;
  },

  async save(ds: PersistedDataSource): Promise<void> {
    return invoke("save_datasource", { ds });
  },

  async delete(id: string): Promise<void> {
    return invoke("delete_datasource", { id });
  },
};

export const databaseApi = {
  async testConnection(config: DatabaseConnectionConfig, testQuery?: string): Promise<{ success: boolean; message: string; data?: unknown }> {
    return invoke("db_test_connection", { config, testQuery: testQuery || null });
  },

  async executeQuery(config: DatabaseConnectionConfig, query: string): Promise<{ success: boolean; message: string; data?: unknown; rows?: Record<string, unknown>[]; columns?: string[] }> {
    const result = await invoke<{ success: boolean; message: string; data?: unknown }>("db_execute_query", { config, query });
    // 后端返回 { success, message, data: { rows, columns, rowsAffected } }
    // 提取 rows 和 columns 到顶层，方便调用方使用
    const data = result.data as Record<string, unknown> | undefined;
    return {
      ...result,
      rows: (data?.rows as Record<string, unknown>[]) || (Array.isArray(data) ? data as Record<string, unknown>[] : undefined),
      columns: data?.columns as string[] | undefined,
    };
  },

  /** 获取数据库所有表列表 */
  async getTables(config: DatabaseConnectionConfig): Promise<string[]> {
    const dbType = config.dbType;
    // 不同数据库的表列表查询 SQL
    const tableQueries: Record<string, string> = {
      mysql: `SHOW TABLES`,
      postgresql: `SELECT tablename as name FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
      greptimedb: `SHOW TABLES`,
      clickhouse: `SHOW TABLES`,
      influxdb: `SHOW MEASUREMENTS`,
      mongodb: `SELECT name FROM system.collections`,
      redis: `SELECT 1`,
    };
    const query = tableQueries[dbType] || tableQueries.mysql;
    console.log('[getTables] dbType:', dbType, 'query:', query);
    const result = await this.executeQuery(config, query);
    console.log('[getTables] result:', JSON.stringify(result).slice(0, 500));
    if (!result.success) return [];

    // executeQuery 已将 rows 提取到顶层
    const rows = result.rows || [];
    console.log('[getTables] rows count:', rows.length, 'first row:', rows[0] ? JSON.stringify(rows[0]) : 'empty');

    return rows.map((row) => {
      // SHOW TABLES 返回格式：MySQL 返回 { "Tables_in_xxx": "tablename" }
      // 尝试所有可能的字段名
      const name = row.name || row.TABLE_NAME || row.tablename || row.measurement ||
        row.Tables_in_database || row[`Tables_in_${config.database}`] ||
        Object.values(row)[0];
      return String(name);
    }).filter(Boolean);
  },

  /** 获取表的所有字段列表 */
  async getColumns(config: DatabaseConnectionConfig, table: string): Promise<Array<{ name: string; type: string }>> {
    const dbType = config.dbType;
    const columnQueries: Record<string, string> = {
      mysql: `SHOW COLUMNS FROM \`${table}\``,
      postgresql: `SELECT column_name as name, data_type as type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${table}' ORDER BY ordinal_position`,
      greptimedb: `DESC ${table}`,
      clickhouse: `DESC ${table}`,
      influxdb: `SHOW FIELD KEYS FROM ${table}`,
      mongodb: `SELECT * FROM ${table} LIMIT 1`,
      redis: `SELECT 1`,
    };
    const query = columnQueries[dbType] || columnQueries.mysql;
    console.log('[getColumns] dbType:', dbType, 'table:', table, 'query:', query);
    const result = await this.executeQuery(config, query);
    console.log('[getColumns] result:', JSON.stringify(result).slice(0, 500));
    if (!result.success) return [];

    // executeQuery 已将 rows 提取到顶层
    const rows = result.rows || [];
    console.log('[getColumns] rows count:', rows.length, 'first row:', rows[0] ? JSON.stringify(rows[0]) : 'empty');

    return rows.map((row) => {
      // SHOW COLUMNS FROM 返回：{ Field: "id", Type: "int(11)", ... }
      // INFORMATION_SCHEMA 返回：{ name: "id", type: "int" }
      const name = String(row.name || row.column_name || row.COLUMN_NAME || row.Field || row.field || Object.keys(row)[0] || "");
      const type = String(row.type || row.data_type || row.DATA_TYPE || row.Type || "unknown");
      return { name, type };
    }).filter(c => c.name);
  },
};

export const mqttApi = {
  async connect(sourceId: string, config: MqttConnectionConfig): Promise<{ success: boolean; message: string; data?: unknown }> {
    return invoke("mqtt_connect", { sourceId, config });
  },

  async disconnect(sourceId: string): Promise<{ success: boolean; message: string; data?: unknown }> {
    return invoke("mqtt_disconnect", { sourceId });
  },

  async subscribe(sourceId: string, topic: string, qos: number): Promise<{ success: boolean; message: string; data?: unknown }> {
    return invoke("mqtt_subscribe", { sourceId, topic, qos });
  },

  async unsubscribe(sourceId: string, topic: string): Promise<{ success: boolean; message: string; data?: unknown }> {
    return invoke("mqtt_unsubscribe", { sourceId, topic });
  },

  async publish(sourceId: string, topic: string, payload: string, qos: number, retain: boolean): Promise<{ success: boolean; message: string; data?: unknown }> {
    return invoke("mqtt_publish", { sourceId, topic, payload, qos, retain });
  },

  async getState(sourceId: string): Promise<{ success: boolean; message: string; data?: unknown }> {
    return invoke("mqtt_get_state", { sourceId });
  },

  async testConnection(config: MqttConnectionConfig): Promise<{ success: boolean; message: string; data?: unknown }> {
    return invoke("mqtt_test_connection", { config });
  },

  onMessage(handler: (event: { sourceId: string; topic: string; payload: string; qos: number; retain: boolean }) => void): Promise<UnlistenFn> {
    return listen("mqtt-message", (e) => {
      handler(e.payload as { sourceId: string; topic: string; payload: string; qos: number; retain: boolean });
    });
  },

  onStatusChange(handler: (event: { sourceId: string; connected: boolean; error?: string }) => void): Promise<UnlistenFn> {
    return listen("mqtt-status", (e) => {
      handler(e.payload as { sourceId: string; connected: boolean; error?: string });
    });
  },
};

export const metricApi = {
  async query(params: {
    sourceId: string;
    metricName: string;
    startTime: number;
    endTime: number;
    interval?: string;
  }): Promise<MetricData[]> {
    return invoke("query_metrics", params);
  },

  async getLatest(sourceId: string): Promise<Record<string, number>> {
    return invoke("get_latest_metrics", { sourceId });
  },

  async subscribe(params: {
    sourceId: string;
    metricNames: string[];
  }): Promise<void> {
    return invoke("subscribe_metrics", params);
  },
};

export const alertApi = {
  async listRules(): Promise<unknown[]> {
    return invoke("list_alert_rules");
  },

  async createRule(rule: {
    name: string;
    sourceId?: string;
    metricName: string;
    condition: string;
    severity: string;
  }): Promise<unknown> {
    return invoke("create_alert_rule", { rule });
  },

  async getHistory(params: { ruleId?: string; limit: number }): Promise<unknown[]> {
    return invoke("get_alert_history", params);
  },

  async acknowledge(alertId: number): Promise<void> {
    return invoke("acknowledge_alert", { alertId });
  },
};

export const systemApi = {
  async getSettings(): Promise<Record<string, unknown>> {
    return invoke("get_settings");
  },

  async updateSettings(settings: Record<string, unknown>): Promise<void> {
    return invoke("update_settings", { settings });
  },

  async getSystemInfo(): Promise<{
    version: string;
    platform: string;
    memory: number;
    cpu: number;
  }> {
    return invoke("get_system_info");
  },
};

interface PersistedScene {
  id: string;
  name: string;
  description?: string;
  coordinateSystem: string;
  camera: string;
  bounds?: string;
  layers: string;
  bindings: string;
  variables?: string;
  layout: string;
  editorComponents?: string;
  editorLayers?: string;
  canvasConfig?: string;
  globalComponents?: string;
  views?: string;
  activeViewId?: string;
  viewportSyncRules?: string;
  categoryId?: string;
  tags: string;
  thumbnail?: string;
  status: string;
  publishedAt?: number;
  metadata: string;
  createdAt: number;
  updatedAt: number;
}

function toPersistedScene(scene: SceneDSL): PersistedScene {
  return {
    id: scene.id,
    name: scene.name,
    description: scene.description,
    coordinateSystem: scene.coordinateSystem ?? "",
    camera: JSON.stringify(scene.camera ?? {}),
    bounds: scene.bounds ? JSON.stringify(scene.bounds) : undefined,
    layers: JSON.stringify(scene.layers ?? []),
    bindings: JSON.stringify(scene.bindings ?? []),
    variables: scene.variables ? JSON.stringify(scene.variables) : undefined,
    layout: JSON.stringify(scene.layout ?? []),
    editorComponents: scene.editorComponents ? JSON.stringify(scene.editorComponents) : undefined,
    editorLayers: scene.editorLayers ? JSON.stringify(scene.editorLayers) : undefined,
    canvasConfig: scene.canvasConfig ? JSON.stringify(scene.canvasConfig) : undefined,
    globalComponents: scene.globalComponents ? JSON.stringify(scene.globalComponents) : undefined,
    views: scene.views ? JSON.stringify(scene.views) : undefined,
    activeViewId: scene.activeViewId || undefined,
    viewportSyncRules: scene.viewportSyncRules ? JSON.stringify(scene.viewportSyncRules) : undefined,
    categoryId: scene.categoryId,
    tags: JSON.stringify(scene.tags ?? []),
    thumbnail: scene.thumbnail,
    status: scene.status,
    publishedAt: scene.publishedAt,
    metadata: JSON.stringify(scene.metadata ?? {}),
    createdAt: scene.createdAt,
    updatedAt: scene.updatedAt,
  };
}

function toSceneDSL(persisted: PersistedScene): SceneDSL {
  return {
    id: persisted.id,
    name: persisted.name,
    description: persisted.description,
    coordinateSystem: persisted.coordinateSystem as SceneDSL["coordinateSystem"],
    camera: JSON.parse(persisted.camera || "{}"),
    bounds: persisted.bounds ? JSON.parse(persisted.bounds) : undefined,
    layers: JSON.parse(persisted.layers || "[]"),
    bindings: JSON.parse(persisted.bindings || "[]"),
    variables: persisted.variables ? JSON.parse(persisted.variables) : undefined,
    layout: JSON.parse(persisted.layout || "[]"),
    editorComponents: persisted.editorComponents ? JSON.parse(persisted.editorComponents) : undefined,
    editorLayers: persisted.editorLayers ? JSON.parse(persisted.editorLayers) : undefined,
    canvasConfig: persisted.canvasConfig ? JSON.parse(persisted.canvasConfig) : undefined,
    globalComponents: persisted.globalComponents ? JSON.parse(persisted.globalComponents) : undefined,
    views: persisted.views ? JSON.parse(persisted.views) : undefined,
    activeViewId: persisted.activeViewId || undefined,
    viewportSyncRules: persisted.viewportSyncRules ? JSON.parse(persisted.viewportSyncRules) : undefined,
    categoryId: persisted.categoryId,
    tags: JSON.parse(persisted.tags || "[]"),
    thumbnail: persisted.thumbnail,
    status: (persisted.status || "draft") as SceneDSL["status"],
    publishedAt: persisted.publishedAt,
    metadata: JSON.parse(persisted.metadata || "{}"),
    createdAt: persisted.createdAt,
    updatedAt: persisted.updatedAt,
  };
}

export const sceneApi = {
  async list(): Promise<SceneDSL[]> {
    const result = await invoke<PersistedScene[]>("get_all_scenes");
    return result.map(toSceneDSL);
  },

  async get(id: string): Promise<SceneDSL | null> {
    const result = await invoke<PersistedScene | null>("get_scene", { id });
    if (!result) return null;
    return toSceneDSL(result);
  },

  async listByCategory(categoryId: string): Promise<SceneDSL[]> {
    const result = await invoke<PersistedScene[]>("get_scenes_by_category", { categoryId });
    return result.map(toSceneDSL);
  },

  async create(scene: SceneDSL): Promise<void> {
    const persisted = toPersistedScene(scene);
    logger.info("SceneApi", "Invoking create_scene", { id: persisted.id, name: persisted.name, thumbnail: persisted.thumbnail });
    return invoke("create_scene", { scene: persisted });
  },

  async update(scene: SceneDSL): Promise<void> {
    const persisted = toPersistedScene(scene);
    logger.info("SceneApi", "Invoking update_scene", { id: persisted.id, name: persisted.name, thumbnail: persisted.thumbnail });
    return invoke("update_scene", { scene: persisted });
  },

  async delete(id: string): Promise<void> {
    logger.info("SceneApi", "Invoking delete_scene", { id });
    return invoke("delete_scene", { id });
  },

  async listCategories(): Promise<SceneCategory[]> {
    return invoke("get_all_categories");
  },

  async getCategory(id: string): Promise<SceneCategory | null> {
    return invoke("get_category", { id });
  },

  async saveCategory(category: SceneCategory): Promise<void> {
    return invoke("save_category", { category });
  },

  async deleteCategory(id: string): Promise<void> {
    return invoke("delete_category", { id });
  },

  async readFileAsDataUrl(filePath: string): Promise<string> {
    return invoke<string>("read_file_as_data_url", { filePath });
  },
};
