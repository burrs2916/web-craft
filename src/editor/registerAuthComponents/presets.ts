/**
 * v3/v5 认证预设：内置预设表（AUTH_PRESETS）与自定义预设的 localStorage 管理。
 * 从 registerAuthComponents.ts 迁出，仅做代码搬迁。
 */

/**
 * v3 预设认证模板
 *
 * 选择预设后自动填充 login-form 的 API/Token/刷新/Header 配置字段。
 * AuthPreset 设计：keycloak / auth0 / internal / custom。
 *
 * 预设覆盖范围：authMode / apiUrl / tokenField / refreshTokenField / expiresInField
 *               / userField / tokenStorage / tokenKey / tokenHeader / tokenPrefix
 *               / refreshEnabled / refreshThreshold / refreshEndpointPath / refreshEndpointMethod
 *               / headerConfigs
 */
export const AUTH_PRESETS: Record<string, {
  label: string;
  description: string;
  config: Record<string, unknown>;
}> = {
  custom: {
    label: "自定义",
    description: "不应用预设，手动配置",
    config: {},
  },
  "standard-jwt": {
    label: "标准 JWT",
    description: "传统 JWT 认证：POST 登录，响应含 token/refreshToken/expiresIn，Bearer 注入",
    config: {
      authMode: "jwt",
      method: "POST",
      mappingTemplate: "standard-jwt",
      tokenField: "token",
      refreshTokenField: "refreshToken",
      expiresInField: "expiresIn",
      userField: "user",
      tokenStorage: "localStorage",
      tokenKey: "auth_token",
      tokenHeader: "Authorization",
      tokenPrefix: "Bearer ",
      refreshEnabled: true,
      refreshThreshold: 30,
      refreshEndpointPath: "/api/refresh-token",
      refreshEndpointMethod: "POST",
      headerConfigs: [],
      endpoints: [
        { id: "ep_login", name: "登录", endpointType: "login", path: "/api/login", method: "POST" },
        { id: "ep_refresh", name: "刷新令牌", endpointType: "refresh", path: "/api/refresh-token", method: "POST" },
        { id: "ep_logout", name: "登出", endpointType: "logout", path: "/api/logout", method: "POST" },
        { id: "ep_userinfo", name: "获取用户信息", endpointType: "userInfo", path: "/api/user", method: "GET" },
      ],
    },
  },
  keycloak: {
    label: "Keycloak (OIDC)",
    description: "Keycloak OpenID Connect：access_token/refresh_token/expires_in，POST body 刷新",
    config: {
      authMode: "oauth2",
      apiUrl: "/realms/{realm}/protocol/openid-connect/token",
      method: "POST",
      mappingTemplate: "oidc",
      tokenField: "access_token",
      refreshTokenField: "refresh_token",
      expiresInField: "expires_in",
      userField: "user",
      tokenStorage: "localStorage",
      tokenKey: "kc_token",
      tokenHeader: "Authorization",
      tokenPrefix: "Bearer ",
      refreshEnabled: true,
      refreshThreshold: 30,
      refreshEndpointPath: "/realms/{realm}/protocol/openid-connect/token",
      refreshEndpointMethod: "POST",
      headerConfigs: [],
      endpoints: [
        { id: "ep_login", name: "获取 Token", endpointType: "login", path: "/realms/{realm}/protocol/openid-connect/token", method: "POST" },
        { id: "ep_refresh", name: "刷新 Token", endpointType: "refresh", path: "/realms/{realm}/protocol/openid-connect/token", method: "POST" },
        { id: "ep_logout", name: "登出", endpointType: "logout", path: "/realms/{realm}/protocol/openid-connect/logout", method: "POST" },
        { id: "ep_userinfo", name: "用户信息", endpointType: "userInfo", path: "/realms/{realm}/protocol/openid-connect/userinfo", method: "GET" },
      ],
    },
  },
  "auth0": {
    label: "Auth0",
    description: "Auth0 OIDC：POST /oauth/token 获取 access_token，/userinfo 获取用户信息，client_id+grant_type=refresh_token 刷新",
    config: {
      authMode: "oauth2",
      apiUrl: "/oauth/token",
      method: "POST",
      mappingTemplate: "oidc",
      tokenField: "access_token",
      refreshTokenField: "refresh_token",
      expiresInField: "expires_in",
      userField: "user",
      tokenStorage: "localStorage",
      tokenKey: "auth0_access_token",
      tokenHeader: "Authorization",
      tokenPrefix: "Bearer ",
      refreshEnabled: true,
      refreshThreshold: 30,
      refreshEndpointPath: "/oauth/token",
      refreshEndpointMethod: "POST",
      headerConfigs: [],
      endpoints: [
        { id: "ep_login", name: "获取 Token", endpointType: "login", path: "/oauth/token", method: "POST" },
        { id: "ep_refresh", name: "刷新 Token", endpointType: "refresh", path: "/oauth/token", method: "POST" },
        { id: "ep_logout", name: "登出", endpointType: "logout", path: "/v2/logout", method: "GET" },
        { id: "ep_userinfo", name: "用户信息", endpointType: "userInfo", path: "/userinfo", method: "GET" },
      ],
    },
  },
  "supabase": {
    label: "Supabase Auth",
    description: "Supabase：POST /auth/v1/token?grant_type=password 获取 access_token/refresh_token，/auth/v1/user 获取用户",
    config: {
      authMode: "oauth2",
      apiUrl: "/auth/v1/token?grant_type=password",
      method: "POST",
      mappingTemplate: "custom",
      tokenField: "access_token",
      refreshTokenField: "refresh_token",
      expiresInField: "expires_in",
      userField: "user",
      tokenStorage: "localStorage",
      tokenKey: "sb_access_token",
      tokenHeader: "Authorization",
      tokenPrefix: "Bearer ",
      refreshEnabled: true,
      refreshThreshold: 60,
      refreshEndpointPath: "/auth/v1/token?grant_type=refresh_token",
      refreshEndpointMethod: "POST",
      headerConfigs: [
        { headerName: "apikey", valueTemplate: "${supabase_anon_key}" },
      ],
      endpoints: [
        { id: "ep_login", name: "密码登录", endpointType: "login", path: "/auth/v1/token?grant_type=password", method: "POST" },
        { id: "ep_refresh", name: "刷新 Token", endpointType: "refresh", path: "/auth/v1/token?grant_type=refresh_token", method: "POST" },
        { id: "ep_logout", name: "登出", endpointType: "logout", path: "/auth/v1/logout", method: "POST" },
        { id: "ep_userinfo", name: "用户信息", endpointType: "userInfo", path: "/auth/v1/user", method: "GET" },
      ],
    },
  },
  "firebase": {
    label: "Firebase Auth (REST)",
    description: "Firebase Auth REST API：POST /accounts:signInWithPassword 获取 idToken/refreshToken，/accounts:lookup 获取用户",
    config: {
      authMode: "oauth2",
      apiUrl: "/accounts:signInWithPassword?key={apiKey}",
      method: "POST",
      mappingTemplate: "custom",
      tokenField: "idToken",
      refreshTokenField: "refreshToken",
      expiresInField: "expiresIn",
      userField: "localId",
      tokenStorage: "localStorage",
      tokenKey: "fb_id_token",
      tokenHeader: "Authorization",
      tokenPrefix: "Bearer ",
      refreshEnabled: true,
      refreshThreshold: 60,
      refreshEndpointPath: "/securetoken.googleapis.com/v1/token?key={apiKey}",
      refreshEndpointMethod: "POST",
      headerConfigs: [],
      endpoints: [
        { id: "ep_login", name: "密码登录", endpointType: "login", path: "/accounts:signInWithPassword?key={apiKey}", method: "POST" },
        { id: "ep_refresh", name: "刷新 Token", endpointType: "refresh", path: "/v1/token?key={apiKey}", method: "POST" },
        { id: "ep_logout", name: "登出", endpointType: "logout", path: "/accounts:update?key={apiKey}", method: "POST" },
        { id: "ep_userinfo", name: "用户信息", endpointType: "userInfo", path: "/accounts:lookup?key={apiKey}", method: "GET" },
      ],
    },
  },
  "authing": {
    label: "Authing",
    description: "Authing 身份云：POST /api/v3/login 获取 accessToken/refreshToken，/api/v3/get-profile 获取用户信息",
    config: {
      authMode: "oauth2",
      apiUrl: "/api/v3/login",
      method: "POST",
      mappingTemplate: "nested-jwt",
      tokenField: "data.accessToken",
      refreshTokenField: "data.refreshToken",
      expiresInField: "data.expiresIn",
      userField: "data.user",
      tokenStorage: "localStorage",
      tokenKey: "authing_access_token",
      tokenHeader: "Authorization",
      tokenPrefix: "Bearer ",
      refreshEnabled: true,
      refreshThreshold: 30,
      refreshEndpointPath: "/api/v3/refresh-token",
      refreshEndpointMethod: "POST",
      headerConfigs: [],
      endpoints: [
        { id: "ep_login", name: "登录", endpointType: "login", path: "/api/v3/login", method: "POST" },
        { id: "ep_refresh", name: "刷新 Token", endpointType: "refresh", path: "/api/v3/refresh-token", method: "POST" },
        { id: "ep_logout", name: "登出", endpointType: "logout", path: "/api/v3/logout", method: "POST" },
        { id: "ep_userinfo", name: "用户信息", endpointType: "userInfo", path: "/api/v3/get-profile", method: "GET" },
      ],
    },
  },
  "authelia": {
    label: "Authelia",
    description: "Authelia 自托管 SSO：POST /api/firstfactor 验证密码，Cookie-Set 认证，/api/user/info 获取用户",
    config: {
      authMode: "session",
      apiUrl: "/api/firstfactor",
      method: "POST",
      mappingTemplate: "custom",
      tokenField: "",
      refreshTokenField: "",
      expiresInField: "",
      userField: "data",
      tokenStorage: "sessionStorage",
      tokenKey: "authelia_session",
      tokenHeader: "Cookie",
      tokenPrefix: "",
      refreshEnabled: false,
      refreshThreshold: 0,
      refreshEndpointPath: "",
      refreshEndpointMethod: "POST",
      headerConfigs: [],
      endpoints: [
        { id: "ep_login", name: "第一因素认证", endpointType: "login", path: "/api/firstfactor", method: "POST" },
        { id: "ep_logout", name: "登出", endpointType: "logout", path: "/api/logout", method: "POST" },
        { id: "ep_userinfo", name: "用户信息", endpointType: "userInfo", path: "/api/user/info", method: "GET" },
      ],
    },
  },
};

/**
 * v5 自定义预设管理
 *
 * 用户可将当前配置保存为自定义预设，存储到 localStorage 键 `webcraft_auth_presets`。
 * 在属性面板下拉中与内置预设合并显示。
 */
const CUSTOM_PRESETS_KEY = "webcraft_auth_presets";

export function loadCustomAuthPresets(): Record<string, { label: string; description: string; config: Record<string, unknown> }> {
  try {
    const raw = localStorage.getItem(CUSTOM_PRESETS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed;
  } catch {
    return {};
  }
}

export function saveCustomAuthPreset(name: string, preset: { label: string; description: string; config: Record<string, unknown> }): void {
  const existing = loadCustomAuthPresets();
  existing[name] = preset;
  try {
    localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(existing));
  } catch {
    // localStorage 不可用时静默失败
  }
}

export function deleteCustomAuthPreset(name: string): void {
  const existing = loadCustomAuthPresets();
  delete existing[name];
  try {
    localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(existing));
  } catch {
    // 静默失败
  }
}

/**
 * 获取所有可用预设（内置 + 自定义），用于属性面板下拉
 */
export function getAllAuthPresets(): Record<string, { label: string; description: string; config: Record<string, unknown> }> {
  const custom = loadCustomAuthPresets();
  return { ...AUTH_PRESETS, ...custom };
}
