import { create } from "zustand";

/**
 * 网站认证状态管理（区别于 authStore.ts 后端配置型认证）
 *
 * v3 配置驱动架构：
 * - TokenConfig：存储方式/键名/Header名/前缀全可配
 * - ResponseMapping[]：从任意 API 响应路径提取字段存入缓存
 * - HeaderConfig[]：用 ${cacheKey} 模板把任意缓存值注入任意 header（多租户等）
 * - AuthEndpoint[]：端点类型编排（login/logout/refresh/other）
 * - parseExpireTime：智能识别过期时间格式（秒/毫秒/ISO）
 *
 * 本 Store 面向「认证组件」在编辑器预览中的运行时状态：
 * - login-form 组件调用 API 后，通过 extractAndCacheResponse 提取字段
 * - auth-guard 组件从此 Store 读取 isAuthenticated 决定是否渲染子内容
 * - user-profile 组件从此 Store 读取 user 信息
 * - logout-button 组件调用此 Store 的 logout()
 * - HttpAdapter 从此 Store 的 buildAuthHeaders() 获取注入 header
 *
 * 发布产物中：
 * - codegen 生成等价的 localStorage + CustomEvent 驱动的纯 JS 逻辑
 * - 不依赖 React/Zustand，而是用 window.__webcraftAuth__ 全局对象
 */

// ═══════════════════════════════════════════════════════════════
// 类型定义（配置驱动模型）
// ═══════════════════════════════════════════════════════════════

export type WebsiteAuthMode = "session" | "jwt" | "basic" | "oauth" | "sso" | "api-key" | "oauth2";

export type TokenStorage = "localStorage" | "sessionStorage" | "memory";

export interface TokenConfig {
  storage: TokenStorage;
  key: string;
  header: string;
  prefix: string;
}

export interface RefreshConfig {
  enabled: boolean;
  threshold: number;
}

export interface ResponseMapping {
  sourcePath: string;
  targetKey: string;
  saveToCache: boolean;
  isExpirationTime?: boolean;
}

/**
 * v4 响应映射模板：预定义常见认证响应结构的字段映射
 * 选择模板后自动生成 responseMappings 数组，减少手工逐字段配置
 */
export interface ResponseMappingTemplate {
  id: string;
  label: string;
  description: string;
  mappings: ResponseMapping[];
}

export const RESPONSE_MAPPING_TEMPLATES: ResponseMappingTemplate[] = [
  {
    id: "standard-jwt",
    label: "标准 JWT (token/refreshToken/expiresIn)",
    description: "响应顶层包含 token, refreshToken, expiresIn, user 字段",
    mappings: [
      { sourcePath: "token", targetKey: "auth_token", saveToCache: true },
      { sourcePath: "refreshToken", targetKey: "refreshToken", saveToCache: true },
      { sourcePath: "expiresIn", targetKey: "expiresIn", saveToCache: true, isExpirationTime: true },
      { sourcePath: "user", targetKey: "user", saveToCache: false },
    ],
  },
  {
    id: "nested-jwt",
    label: "嵌套 JWT (data.token/data.refreshToken)",
    description: "响应在 data 对象下包含 token, refreshToken, expiresIn, user",
    mappings: [
      { sourcePath: "data.token", targetKey: "auth_token", saveToCache: true },
      { sourcePath: "data.refreshToken", targetKey: "refreshToken", saveToCache: true },
      { sourcePath: "data.expiresIn", targetKey: "expiresIn", saveToCache: true, isExpirationTime: true },
      { sourcePath: "data.user", targetKey: "user", saveToCache: false },
    ],
  },
  {
    id: "oidc",
    label: "OIDC (access_token/refresh_token/expires_in)",
    description: "OpenID Connect / OAuth2 标准字段名（下划线命名）",
    mappings: [
      { sourcePath: "access_token", targetKey: "auth_token", saveToCache: true },
      { sourcePath: "refresh_token", targetKey: "refreshToken", saveToCache: true },
      { sourcePath: "expires_in", targetKey: "expiresIn", saveToCache: true, isExpirationTime: true },
      { sourcePath: "user", targetKey: "user", saveToCache: false },
    ],
  },
  {
    id: "custom",
    label: "自定义映射",
    description: "不使用模板，手动配置每个字段路径",
    mappings: [],
  },
];

/**
 * v4 自动探测：从 API 响应中自动识别常见 token 字段名
 * 支持：token/accessToken/access_token/jwt/id_token
 *       refreshToken/refresh_token
 *       expiresIn/expires_in/expiresTime/expiresAt
 *       user/userInfo/userInfo/profile
 */
const TOKEN_FIELD_CANDIDATES = [
  "token", "accessToken", "access_token", "jwt", "id_token", "authToken", "auth_token",
];
const REFRESH_TOKEN_CANDIDATES = [
  "refreshToken", "refresh_token",
];
const EXPIRES_FIELD_CANDIDATES = [
  "expiresIn", "expires_in", "expiresTime", "expiresAt", "expiry", "exp",
];
const USER_FIELD_CANDIDATES = [
  "user", "userInfo", "user_info", "profile", "currentUser", "data.user", "data.userInfo",
];

export function autoDetectResponseMappings(data: Record<string, unknown>): ResponseMapping[] {
  const mappings: ResponseMapping[] = [];

  // 探测 token
  for (const path of TOKEN_FIELD_CANDIDATES) {
    const val = getNestedValue(data, path);
    if (typeof val === "string" && val.length > 10) {
      mappings.push({ sourcePath: path, targetKey: "auth_token", saveToCache: true });
      break;
    }
  }

  // 探测 refreshToken
  for (const path of REFRESH_TOKEN_CANDIDATES) {
    const val = getNestedValue(data, path);
    if (typeof val === "string" && val.length > 5) {
      mappings.push({ sourcePath: path, targetKey: "refreshToken", saveToCache: true });
      break;
    }
  }

  // 探测过期时间
  for (const path of EXPIRES_FIELD_CANDIDATES) {
    const val = getNestedValue(data, path);
    if (val !== undefined && val !== null) {
      mappings.push({ sourcePath: path, targetKey: "expiresIn", saveToCache: true, isExpirationTime: true });
      break;
    }
  }

  // 探测 user
  for (const path of USER_FIELD_CANDIDATES) {
    const val = getNestedValue(data, path);
    if (val !== undefined && val !== null && typeof val === "object") {
      mappings.push({ sourcePath: path, targetKey: "user", saveToCache: false });
      break;
    }
  }

  return mappings;
}

export type EndpointType = "login" | "logout" | "refresh" | "userInfo" | "register" | "other";

export interface AuthEndpoint {
  id: string;
  name: string;
  path: string;
  method: string;
  responseMapping: ResponseMapping[];
  endpointType?: EndpointType;
  /** v7 请求内容类型："json" | "form" | "formData" | 自定义 MIME，空=默认 json（向后兼容） */
  contentType?: string;
}

export interface HeaderConfig {
  headerName: string;
  valueTemplate: string;
}

/**
 * v5 AuthParam：动态认证参数
 * 用户配置登录需要提交哪些参数，表单运行时按参数列表渲染输入框
 * 彻底替代硬编码的 username/password/captcha/sms/tenant 字段
 */
export interface AuthParam {
  id: string;
  key: string;          // 字段名，如 "username"、"password"、"client_id"、"tenant"
  label: string;        // 显示标签，如 "用户名"、"密码"
  value: string;        // 默认值（通常为空，用户运行时填写）
  location: "body" | "query" | "formData"; // 参数位置
  required: boolean;
  description?: string;
  isSecret?: boolean;   // 为 true 时渲染为 password 类型输入框
}

/**
 * v5 UserDisplayConfig：用户信息展示配置
 * 指定哪些缓存键映射到 avatar/name/email/tenant/role 等显示类型
 * 彻底替代 UserProfileRenderer 硬编码读取固定字段
 */
export type UserDisplayType = "none" | "avatar" | "name" | "email" | "tenant" | "role" | "custom";

export interface UserDisplayConfig {
  cacheKey: string;      // 从缓存读取的键名（storage key）
  objectPath?: string;   // 对象嵌套路径（如 "name" 或 "profile.email"），留空则回退到 cacheKey
  displayType: UserDisplayType;
  customLabel?: string;
}

/**
 * v5 推荐映射组（SUGGESTED_MAPPING_GROUPS）
 * 用户可一键添加整组常见字段映射，不必逐个手动配置
 */
export const SUGGESTED_MAPPING_GROUPS = [
  {
    id: "token-group",
    label: "令牌映射组",
    mappings: [
      { sourcePath: "", targetKey: "auth_token", saveToCache: true },
      { sourcePath: "", targetKey: "refreshToken", saveToCache: true },
      { sourcePath: "", targetKey: "expiresIn", saveToCache: true, isExpirationTime: true },
    ],
  },
  {
    id: "user-group",
    label: "用户信息映射组",
    mappings: [
      { sourcePath: "", targetKey: "userId", saveToCache: true },
      { sourcePath: "", targetKey: "username", saveToCache: true },
      { sourcePath: "", targetKey: "avatar", saveToCache: true },
    ],
  },
  {
    id: "tenant-group",
    label: "租户信息映射组",
    mappings: [
      { sourcePath: "", targetKey: "tenantId", saveToCache: true },
      { sourcePath: "", targetKey: "tenantName", saveToCache: true },
    ],
  },
] as const;

/**
 * v5 推荐请求头（SUGGESTED_HEADERS）
 * 用户可一键添加常见的 Header 配置
 */
export const SUGGESTED_HEADERS: Record<string, { headerName: string; valueTemplate: string; label: string; description: string }> = {
  authorization: {
    headerName: "Authorization",
    valueTemplate: "Bearer ${auth_token}",
    label: "认证令牌",
    description: "自动添加认证令牌到请求头",
  },
  tenantId: {
    headerName: "tenant-id",
    valueTemplate: "${tenantId}",
    label: "租户ID",
    description: "多租户系统的租户标识",
  },
  visitTenantId: {
    headerName: "visit-tenant-id",
    valueTemplate: "${visit_tenant_id}",
    label: "访问租户ID",
    description: "访问租户的标识",
  },
  apiKey: {
    headerName: "X-API-Key",
    valueTemplate: "${api_key}",
    label: "API Key",
    description: "API 密钥认证",
  },
  contentType: {
    headerName: "Content-Type",
    valueTemplate: "application/json",
    label: "JSON 格式",
    description: "请求体为 JSON 格式",
  },
};

export interface WebsiteAuthUser {
  id?: string;
  username?: string;
  email?: string;
  name?: string;
  displayName?: string;
  avatar?: string;
  role?: string;
  permissions?: string[];
  [key: string]: unknown;
}

export interface WebsiteLoginResult {
  token?: string;
  refreshToken?: string;
  expiresAt?: number;
  user?: WebsiteAuthUser;
  cookieBased?: boolean;
}

/**
 * v6 响应成败判断配置（通用化：不绑定任何特定后端的业务码/错误字段）
 *
 * 用于判定"业务成功/失败"。与 HTTP 传输层状态码(response.ok)相互独立——
 * 很多后端业务失败也返回 HTTP 200，错误信息放在某个业务字段里。
 *
 * - codePath:      业务码字段路径（点号分隔）。"" = 不检查外层业务码（宽松模式，
 *                  HTTP 200 即成功，兼容返回纯数据的后端）。默认关闭以保持零迁移。
 * - successCodes:  codePath 取值命中这些数字即成功。
 * - msgPath:       错误信息字段路径。
 * - msgFallback:   错误信息缺失时的兜底文案。
 *
 * 判断结果：业务失败 → 返回错误文案；成功或未识别（无业务码字段）→ 返回 null。
 */
export interface ResponseValidationConfig {
  codePath: string;
  successCodes: number[];
  msgPath: string;
  msgFallback: string;
}

export const DEFAULT_RESPONSE_VALIDATION: ResponseValidationConfig = {
  codePath: "",
  successCodes: [0, 200],
  msgPath: "msg",
  msgFallback: "请求失败",
};

export interface WebsiteAuthConfig {
  token: TokenConfig;
  refresh: RefreshConfig;
  headerConfigs: HeaderConfig[];
  endpoints: AuthEndpoint[];
  responseMappings: ResponseMapping[];
  /** v6 响应成败判断配置 */
  validation: ResponseValidationConfig;
  /** v5 动态认证参数：登录表单运行时按此列表渲染输入框 */
  authParams: AuthParam[];
  /** v5 用户信息展示配置：指定哪些缓存键映射到哪种显示类型 */
  userDisplayConfig: UserDisplayConfig[];
}

/**
 * 纯函数：按 ResponseValidationConfig 判定响应是否为"业务失败"，成功返回 null。
 * 分享给编辑器运行时(HttpAdapter)与发布产物(codegen 生成的页面 JS)使用，语义一致。
 */
export function resolveResponseError(
  data: unknown,
  validation: ResponseValidationConfig | undefined,
): string | null {
  if (!validation || !validation.codePath) return null; // 未配置业务码检查 → 视为成功
  const obj = data as Record<string, unknown>;
  if (obj === null || typeof obj !== "object") return null;
  const code = getNestedValue(obj, validation.codePath);
  // 响应里没有业务码字段 → 视为成功（宽松；后续自动探测可增强）
  if (code === undefined || code === null) return null;
  const numeric = Number(code);
  if (!isNaN(numeric) && (validation.successCodes ?? [0, 200]).includes(numeric)) return null;
  const msg = getNestedValue(obj, validation.msgPath);
  const message = msg !== undefined && msg !== null ? String(msg) : "";
  return message || validation.msgFallback || "请求失败";
}

/**
 * v7 请求内容类型配置（通用化：不绑定 JSON）
 *
 * 按端点/请求配置请求体的编码方式，默认 JSON 零迁移。
 * 输入支持简述关键字与完整 MIME：
 *   "" / "json" / "application/json"                 → JSON 编码
 *   "form" / "application/x-www-form-urlencoded"     → URLSearchParams 编码
 *   "formData" / "multipart/form-data"               → FormData（浏览器自动 boundary）
 *   其它字符串                                        → 自定义 MIME
 */
export type ContentTypeChoice =
  | "json"
  | "form"
  | "formData"
  | "custom";

export function resolveContentTypeChoice(contentType?: string): ContentTypeChoice {
  const ct = (contentType ?? "").trim().toLowerCase();
  if (ct === "form" || ct === "application/x-www-form-urlencoded") return "form";
  if (ct === "formdata" || ct === "multipart/form-data" || ct === "multipart") return "formData";
  if (ct === "" || ct === "json" || ct === "application/json") return "json";
  return "custom";
}

export interface EncodedAuthBody {
  /** 需合并的附加请求头（含 Content-Type 时以它为准） */
  headers: Record<string, string>;
  /** 编码后的请求体 */
  body: string | FormData | undefined;
  /** 是否需要移除 Content-Type（multipart/form-data，浏览器自动设置 boundary） */
  forceNoContentType: boolean;
}

/**
 * v7 按内容类型编码认证请求体
 * 统一 bodyParams(JSON 语义) 与 formDataParts(任意追加字段) 的编码逻辑，
 * 编辑器运行时(LoginFormRenderer / HttpAdapter)与发布产物(codegen)共用同一套语义。
 *
 * @param bodyParams      JSON body 字段
 * @param formDataParts   追加的表单字段
 * @param contentType     端点配置的内容类型（resolveContentTypeChoice 可解析的输入）
 * @param defaultType     未配置时的兜底（默认 json）
 */
export function encodeAuthBody(
  bodyParams: Record<string, unknown>,
  formDataParts: Array<{ key: string; value: string }>,
  contentType?: string,
  defaultType?: ContentTypeChoice,
): EncodedAuthBody {
  const kind = contentType
    ? resolveContentTypeChoice(contentType)
    : (defaultType ?? "json");

  // form：显式表单编码
  if (kind === "form") {
    const sp = new URLSearchParams();
    Object.entries(bodyParams).forEach(([k, v]) => sp.append(k, v == null ? "" : String(v)));
    formDataParts.forEach(({ key, value }) => sp.append(key, value));
    return {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: sp.toString(),
      forceNoContentType: false,
    };
  }

  // formData：多部分表单，浏览器自动 boundary
  if (kind === "formData") {
    const fd = new FormData();
    Object.entries(bodyParams).forEach(([k, v]) => fd.append(k, v == null ? "" : String(v)));
    formDataParts.forEach(({ key, value }) => fd.append(key, value));
    return { headers: {}, body: fd, forceNoContentType: true };
  }

  // 默认 JSON（兼容旧行为：纯 formData 用 FormData，否则打平为 JSON body）
  if (formDataParts.length > 0 && Object.keys(bodyParams).length === 0) {
    const fd = new FormData();
    formDataParts.forEach(({ key, value }) => fd.append(key, value));
    return { headers: {}, body: fd, forceNoContentType: true };
  }
  const merged: Record<string, unknown> = { ...bodyParams };
  formDataParts.forEach(({ key, value }) => { merged[key] = value; });
  return {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(merged),
    forceNoContentType: false,
  };
}

// ═══════════════════════════════════════════════════════════════
// 工具函数（配置驱动工具集）
// ═══════════════════════════════════════════════════════════════

const memoryCache: Record<string, string> = {};

let refreshTimer: ReturnType<typeof setTimeout> | null = null;

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const keys = path.split(".");
  let current: unknown = obj;
  for (const key of keys) {
    if (current === null || current === undefined) return undefined;
    if (typeof current === "object") {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return current;
}

function checkExpired(expiresAt: number): boolean {
  if (!expiresAt || expiresAt === 0) return false;
  return Date.now() >= expiresAt;
}

/**
 * 智能识别过期时间格式并转换为距离过期的秒数
 * 支持格式：相对秒数(7200) / 绝对时间戳秒级 / 毫秒级 / ISO日期字符串
 */
function parseExpireTime(value: string | number): number {
  if (typeof value === "number") {
    if (value > 1000000000000) {
      const expiresAtSeconds = Math.floor(value / 1000);
      const nowSeconds = Math.floor(Date.now() / 1000);
      return Math.max(0, expiresAtSeconds - nowSeconds);
    }
    return Math.max(0, value);
  }
  if (typeof value === "string") {
    const numValue = Number(value);
    if (!isNaN(numValue)) {
      if (numValue > 1000000000000) {
        const expiresAtSeconds = Math.floor(numValue / 1000);
        const nowSeconds = Math.floor(Date.now() / 1000);
        return Math.max(0, expiresAtSeconds - nowSeconds);
      }
      return Math.max(0, numValue);
    }
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      const expiresAtSeconds = Math.floor(date.getTime() / 1000);
      const nowSeconds = Math.floor(Date.now() / 1000);
      return Math.max(0, expiresAtSeconds - nowSeconds);
    }
  }
  return 0;
}

function getStorage(storage: TokenStorage): Storage | null {
  if (typeof window === "undefined") return null;
  switch (storage) {
    case "localStorage":
      return window.localStorage;
    case "sessionStorage":
      return window.sessionStorage;
    case "memory":
      return null;
    default:
      return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// Store 接口
// ═══════════════════════════════════════════════════════════════

export interface WebsiteAuthState {
  token: string | null;
  refreshToken: string | null;
  user: WebsiteAuthUser | null;
  expiresAt: number;
  authMode: WebsiteAuthMode | null;
  isAuthenticated: boolean;
  isRefreshing: boolean;
  error: string | null;
  tokenExpiresIn: number | null;

  config: WebsiteAuthConfig;

  setLogin: (result: WebsiteLoginResult, mode: WebsiteAuthMode) => void;
  setToken: (token: string, expiresAt?: number) => void;
  setUser: (user: WebsiteAuthUser | null) => void;
  setRefreshing: (refreshing: boolean) => void;
  setError: (error: string | null) => void;
  logout: () => void;
  isTokenExpired: () => boolean;
  getAuthHeader: () => string | null;

  setConfig: (config: Partial<Omit<WebsiteAuthConfig, 'token'>> & { token?: Partial<TokenConfig> }) => void;
  applyMappingTemplate: (templateId: string) => void;
  autoDetectAndApplyMappings: (data: Record<string, unknown>) => ResponseMapping[];
  getToken: () => string | null;
  getRefreshToken: () => string | null;
  clearAllTokens: () => void;
  getCachedValue: (key: string) => string | null;
  setCachedValue: (key: string, value: string) => void;
  clearCachedValue: (key: string) => void;
  clearAllCachedValues: () => void;
  buildAuthHeaders: (extraHeaders?: Record<string, string>) => Record<string, string>;
  extractAndCacheResponse: (responseData: Record<string, unknown>, mappings?: ResponseMapping[]) => void;
  startRefreshTimer: (expiresIn: number) => void;
  stopRefreshTimer: () => void;
  findExpirationTimeMapping: () => { targetKey: string; expiresInStr: string | null } | null;
  /** v5 端点 URL 构建，支持 ${cacheKey} 路径插值 */
  getEndpointUrl: (endpoint: AuthEndpoint) => string;
  /** v5 动态计算可用于用户信息展示的缓存键列表 */
  getUserProfileCandidateKeys: () => string[];
  /** v5 按端点类型提取并缓存响应（使用端点自身的 responseMapping） */
  extractAndCacheByEndpoint: (endpoint: AuthEndpoint, responseData: Record<string, unknown>) => void;
  /** A-P0：编辑器启动恢复登录态（从 storage 读回 token/user/过期时间）；cookie 会话型无法本地恢复 */
  restoreSession: () => boolean;
}

// ═══════════════════════════════════════════════════════════════
// 默认配置
// ═══════════════════════════════════════════════════════════════

const defaultConfig: WebsiteAuthConfig = {
  token: {
    storage: "localStorage",
    key: "auth_token",
    header: "Authorization",
    prefix: "Bearer ",
  },
  refresh: {
    enabled: false,
    threshold: 30,
  },
  headerConfigs: [],
  endpoints: [],
  validation: { ...DEFAULT_RESPONSE_VALIDATION },
  responseMappings: [
    { sourcePath: "token", targetKey: "auth_token", saveToCache: true },
    { sourcePath: "refreshToken", targetKey: "refreshToken", saveToCache: true },
    { sourcePath: "expiresIn", targetKey: "expiresIn", saveToCache: true, isExpirationTime: true },
    { sourcePath: "user", targetKey: "user", saveToCache: false },
  ],
  authParams: [
    { id: "param_username", key: "username", label: "用户名", value: "", location: "body", required: true, isSecret: false },
    { id: "param_password", key: "password", label: "密码", value: "", location: "body", required: true, isSecret: true },
  ],
  userDisplayConfig: [
    { cacheKey: "username", displayType: "name" },
    { cacheKey: "avatar", displayType: "avatar" },
    { cacheKey: "email", displayType: "email" },
  ],
};

// ═══════════════════════════════════════════════════════════════
// Store 实现
// ═══════════════════════════════════════════════════════════════

export const useWebsiteAuthStore = create<WebsiteAuthState>((set, get) => ({
  token: null,
  refreshToken: null,
  user: null,
  expiresAt: 0,
  authMode: null,
  isAuthenticated: false,
  isRefreshing: false,
  error: null,
  tokenExpiresIn: null,
  config: defaultConfig,

  setConfig: (partial) => {
    set((state) => ({
      config: {
        token: { ...state.config.token, ...partial.token },
        refresh: { ...state.config.refresh, ...partial.refresh },
        headerConfigs: partial.headerConfigs ?? state.config.headerConfigs,
        endpoints: partial.endpoints ?? state.config.endpoints,
        validation: { ...state.config.validation, ...(partial.validation ?? {}) },
        responseMappings: partial.responseMappings ?? state.config.responseMappings,
        authParams: partial.authParams ?? state.config.authParams,
        userDisplayConfig: partial.userDisplayConfig ?? state.config.userDisplayConfig,
      },
    }));
  },

  applyMappingTemplate: (templateId) => {
    const tpl = RESPONSE_MAPPING_TEMPLATES.find((t) => t.id === templateId);
    if (!tpl) return;
    set((state) => ({
      config: {
        ...state.config,
        responseMappings: tpl.mappings.length > 0 ? tpl.mappings : state.config.responseMappings,
      },
    }));
  },

  autoDetectAndApplyMappings: (data) => {
    const detected = autoDetectResponseMappings(data);
    if (detected.length > 0) {
      set((state) => ({
        config: {
          ...state.config,
          responseMappings: detected,
        },
      }));
    }
    return detected;
  },

  setLogin: (result, mode) => {
    const token = result.token ?? null;
    const refreshToken = result.refreshToken ?? null;
    const expiresAt = result.expiresAt ?? 0;
    const user = result.user ?? null;
    const authenticated = !!token || !!result.cookieBased;

    set({
      token,
      refreshToken,
      user,
      expiresAt,
      authMode: mode,
      isAuthenticated: authenticated,
      isRefreshing: false,
      error: null,
    });

    const { config } = get();
    if (token) {
      get().setCachedValue(config.token.key, token);
    }
    if (refreshToken) {
      get().setCachedValue("refreshToken", refreshToken);
    }
    if (expiresAt) {
      get().setCachedValue("__webcraft_auth_expires_at", String(expiresAt));
    }
    // A-P0：user 落缓存（__webcraft_ 前缀，clearAllCachedValues 会一并清除），供刷新后恢复
    if (user) {
      get().setCachedValue("__webcraft_auth_user", JSON.stringify(user));
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("auth-state-change", {
          detail: { token, user, isAuthenticated: authenticated, authMode: mode },
        }),
      );
    }

    if (expiresAt && config.refresh.enabled) {
      const expiresIn = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      if (expiresIn > 0) {
        get().startRefreshTimer(expiresIn);
      }
    }
  },

  setToken: (token, expiresAt) => {
    const prevExpiresAt = get().expiresAt;
    set({ token, expiresAt: expiresAt ?? prevExpiresAt, isRefreshing: false });

    const { config } = get();
    get().setCachedValue(config.token.key, token);

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("auth-token", { detail: { token } }));
    }
  },

  setUser: (user) => {
    set({ user });
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("auth-state-change", {
          detail: { user, isAuthenticated: get().isAuthenticated },
        }),
      );
    }
  },

  setRefreshing: (refreshing) => set({ isRefreshing: refreshing }),
  setError: (error) => set({ error }),

  logout: () => {
    get().stopRefreshTimer();
    get().clearAllCachedValues();

    set({
      token: null,
      refreshToken: null,
      user: null,
      expiresAt: 0,
      authMode: null,
      isAuthenticated: false,
      isRefreshing: false,
      error: null,
      tokenExpiresIn: null,
    });

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("auth-state-change", {
          detail: { isAuthenticated: false, token: null, user: null },
        }),
      );
    }
  },

  isTokenExpired: () => {
    const { expiresAt } = get();
    return checkExpired(expiresAt);
  },

  getAuthHeader: () => {
    const { token, authMode, config } = get();
    if (!token) return null;
    if (authMode === "basic") return `Basic ${token}`;
    return `${config.token.prefix}${token}`;
  },

  getToken: () => {
    const { config } = get();
    const tokenKey = config.token.key || "auth_token";
    if (memoryCache[tokenKey] !== undefined) return memoryCache[tokenKey];
    const storage = getStorage(config.token.storage);
    return storage?.getItem(tokenKey) ?? null;
  },

  getRefreshToken: () => {
    const { config } = get();
    const refreshKey = "refreshToken";
    if (memoryCache[refreshKey] !== undefined) return memoryCache[refreshKey];
    const storage = getStorage(config.token.storage);
    return storage?.getItem(refreshKey) ?? null;
  },

  clearAllTokens: () => {
    get().clearAllCachedValues();
  },

  getCachedValue: (key) => {
    if (memoryCache[key] !== undefined) return memoryCache[key];
    const { config } = get();
    const storage = getStorage(config.token.storage);
    if (!storage) return null;
    const value = storage.getItem(key);
    if (value !== null) memoryCache[key] = value;
    return value;
  },

  setCachedValue: (key, value) => {
    const { config } = get();
    memoryCache[key] = value;
    const storage = getStorage(config.token.storage);
    storage?.setItem(key, value);
  },

  clearCachedValue: (key) => {
    delete memoryCache[key];
    const { config } = get();
    const storage = getStorage(config.token.storage);
    storage?.removeItem(key);
  },

  clearAllCachedValues: () => {
    const { config } = get();
    const storage = getStorage(config.token.storage);
    // v5: 完全动态清除，遍历所有内存缓存键
    Object.keys(memoryCache).forEach((key) => {
      delete memoryCache[key];
      storage?.removeItem(key);
    });
    // P2-14: 扫描 storage 中所有以 __webcraft_ 为前缀的键（codegen 写入但可能未在 memoryCache 中）
    if (storage) {
      const keysToRemove: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key && key.startsWith("__webcraft_")) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => {
        delete memoryCache[key];
        storage.removeItem(key);
      });
    }
    // P2-14: 同时清除配置的 tokenKey（可能不以 __webcraft_ 为前缀）
    if (config.token.key) {
      delete memoryCache[config.token.key];
      storage?.removeItem(config.token.key);
    }
  },

  buildAuthHeaders: (extraHeaders) => {
    const { config } = get();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...extraHeaders,
    };

    const tokenKey = config.token.key || "auth_token";
    const accessToken = get().getCachedValue(tokenKey);
    const tokenHeaderName = config.token.header || "Authorization";

    config.headerConfigs.forEach((hc) => {
      if (hc.headerName === tokenHeaderName) return;
      let value = hc.valueTemplate;
      const matches = value.match(/\$\{([^}]+)\}/g);
      if (matches) {
        matches.forEach((match) => {
          const cacheKey = match.slice(2, -1);
          const cachedValue = get().getCachedValue(cacheKey);
          if (cachedValue) {
            value = value.replace(match, cachedValue);
          }
        });
      }
      headers[hc.headerName] = value;
    });

    if (accessToken) {
      const prefix = config.token.prefix ?? "Bearer ";
      headers[tokenHeaderName] = prefix + accessToken;
    }

    return headers;
  },

  extractAndCacheResponse: (responseData, mappings) => {
    const { config } = get();
    const effectiveMappings = mappings ?? config.responseMappings;
    effectiveMappings.forEach((mapping) => {
      if (mapping.saveToCache) {
        const value = getNestedValue(responseData, mapping.sourcePath);
        if (value !== undefined && value !== null) {
          get().setCachedValue(mapping.targetKey, String(value));
        }
      }
    });
  },

  findExpirationTimeMapping: () => {
    const { config } = get();
    const expMapping = config.responseMappings.find((m) => m.isExpirationTime);
    if (!expMapping) return null;
    const expiresInStr = get().getCachedValue(expMapping.targetKey);
    return { targetKey: expMapping.targetKey, expiresInStr };
  },

  startRefreshTimer: (expiresIn) => {
    if (refreshTimer !== null) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }

    const { config } = get();
    const threshold = config.refresh.threshold ?? 30;

    if (expiresIn <= 0) return;

    set({ tokenExpiresIn: expiresIn });

    let delayMs = (expiresIn - threshold) * 1000;
    if (delayMs <= 0) delayMs = 1000;

    refreshTimer = setTimeout(() => {
      const state = get();
      if (state.config.endpoints.length > 0) {
        const refreshEndpoint = state.config.endpoints.find(
          (e) => e.endpointType === "refresh",
        );
        if (refreshEndpoint) {
          state.setRefreshing(true);
        }
      }
    }, delayMs);
  },

  stopRefreshTimer: () => {
    if (refreshTimer !== null) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
    set({ tokenExpiresIn: null, isRefreshing: false });
  },

  // ─── v5 完全配置驱动方法 ───

  getEndpointUrl: (endpoint) => {
    let finalPath = endpoint.path || "";

    // 支持 ${cacheKey} 占位符动态替换
    const matches = finalPath.match(/\$\{([^}]+)\}/g);
    if (matches) {
      matches.forEach((match) => {
        const cacheKey = match.slice(2, -1);
        const cachedValue = get().getCachedValue(cacheKey);
        if (cachedValue) {
          finalPath = finalPath.replace(match, cachedValue);
        }
      });
    }

    return finalPath;
  },

  getUserProfileCandidateKeys: () => {
    const s = get();
    const tokenKey = s.config.token.key || "auth_token";
    const keys = new Set<string>();

    // 从所有端点的 responseMapping 中提取 saveToCache=true 的 targetKey
    (Array.isArray(s.config.endpoints) ? s.config.endpoints : []).forEach((endpoint) => {
      (Array.isArray(endpoint.responseMapping) ? endpoint.responseMapping : []).forEach((mapping) => {
        if (!mapping.targetKey) return;
        if (!mapping.saveToCache) return;
        if (mapping.isExpirationTime) return;
        if (mapping.targetKey === tokenKey) return;
        keys.add(mapping.targetKey);
      });
    });

    // 从全局 responseMappings 中也提取
    (Array.isArray(s.config.responseMappings) ? s.config.responseMappings : []).forEach((mapping) => {
      if (!mapping.targetKey) return;
      if (!mapping.saveToCache) return;
      if (mapping.isExpirationTime) return;
      if (mapping.targetKey === tokenKey) return;
      keys.add(mapping.targetKey);
    });

    // 已配置的 userDisplayConfig 中的 cacheKey 始终保留
    (Array.isArray(s.config.userDisplayConfig) ? s.config.userDisplayConfig : []).forEach((c) => {
      if (c.cacheKey) keys.add(c.cacheKey);
    });

    return Array.from(keys).sort();
  },

  extractAndCacheByEndpoint: (endpoint, responseData) => {
    const mappings = Array.isArray(endpoint.responseMapping) && endpoint.responseMapping.length > 0
      ? endpoint.responseMapping
      : get().config.responseMappings;

    mappings.forEach((mapping) => {
      if (mapping.saveToCache) {
        const value = getNestedValue(responseData, mapping.sourcePath);
        if (value !== undefined && value !== null) {
          get().setCachedValue(mapping.targetKey, String(value));
        }
      }
    });
  },

  // ─── A-P0：编辑器启动恢复登录态 ───

  restoreSession: () => {
    const { config } = get();
    const tokenKey = config.token.key || "auth_token";
    const token = get().getCachedValue(tokenKey);
    if (!token) return false;

    const expiresAtStr = get().getCachedValue("__webcraft_auth_expires_at");
    const expiresAt = expiresAtStr ? Number(expiresAtStr) : 0;
    if (expiresAt && checkExpired(expiresAt)) {
      // 已过期：清缓存，按未登录处理（不静默带过期 token）
      get().clearAllCachedValues();
      return false;
    }

    // user 恢复：优先 storage 缓存（setLogin 落盘），否则 JWT 解码（不验签，仅展示用）
    let user: WebsiteAuthUser | null = null;
    const userStr = get().getCachedValue("__webcraft_auth_user");
    if (userStr) {
      try { user = JSON.parse(userStr) as WebsiteAuthUser; } catch { user = null; }
    }
    if (!user) user = extractUserFromJwt(token);

    set({
      token,
      refreshToken: get().getRefreshToken(),
      user,
      expiresAt,
      isAuthenticated: true,
    });

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("auth-state-change", {
          detail: { token, user, isAuthenticated: true, authMode: get().authMode },
        }),
      );
    }

    if (expiresAt && config.refresh.enabled) {
      const expiresIn = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      if (expiresIn > 0) {
        get().startRefreshTimer(expiresIn);
      }
    }
    return true;
  },
}));

// 模块加载即恢复一次（编辑器刷新后不再丢登录态）。
// 非 DOM 环境（vitest/SSR）getStorage 返回 null → getCachedValue 走空 memoryCache → 安全返回 false。
// cookie 会话型（cookieBased，无本地 token）无法恢复，属后端会话语义，超出本次范围。
if (typeof window !== "undefined") {
  try {
    useWebsiteAuthStore.getState().restoreSession();
  } catch {
    /* 恢复失败按未登录处理，不阻塞启动 */
  }
}

/** 非 React 上下文获取认证状态（供 HttpAdapter 等使用） */
export function getWebsiteAuthState(): WebsiteAuthState {
  return useWebsiteAuthStore.getState();
}

/** JWT payload 解码（不验签，仅解码 payload） */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = parts[1];
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const jsonStr = atob(base64);
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

/** 从 JWT payload 提取用户信息 */
export function extractUserFromJwt(token: string): WebsiteAuthUser {
  const payload = decodeJwtPayload(token);
  if (!payload) return {};
  return {
    id: payload.sub as string | undefined,
    username: (payload.username as string) || (payload.preferred_username as string) || undefined,
    email: payload.email as string | undefined,
    name: payload.name as string | undefined,
    avatar: payload.avatar as string | undefined,
    role: payload.role as string | undefined,
    permissions: Array.isArray(payload.permissions) ? (payload.permissions as string[]) : undefined,
  };
}

/** 导出工具函数供 codegen 和 HttpAdapter 使用 */
export { getNestedValue, parseExpireTime };
