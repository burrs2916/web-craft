import type { AuthConfig, AuthPreset, ApiEndpoint, HeaderConfig, AuthParam, UserDisplayConfig } from "../../services/tauri";

export interface WebhookConfig {
  baseUrl: string;
  endpoints: ApiEndpoint[];
  headerConfig: HeaderConfig[];
  userDisplayConfig: UserDisplayConfig[];
  request: {
    timeout: number;
    headers: Record<string, string>;
  };
  token: {
    storage: "localStorage" | "sessionStorage" | "memory";
    key?: string;
    header: string;
    prefix: string;
  };
  refresh: {
    enabled: boolean;
    threshold: number;
  };
}

export interface LoginConfig {
  path: string;
  redirectParam: string;
  autoRedirect: boolean;
}

export interface UserInfo {
  id: string;
  username: string;
  displayName?: string;
  email?: string;
  role?: string;
  permissions?: string[];
  avatar?: string;
}

export interface AuthState {
  initialized: boolean;
  enabled: boolean;
  preset: AuthPreset;
  authParams: AuthParam[];
  webhook: WebhookConfig;
  login: LoginConfig;
  whitelist: string[];
  currentUser: UserInfo | undefined;
  tokenExpiresIn: number | null;
  isRefreshing: boolean;
  refreshStatus: "idle" | "success" | "error" | null;

  init: () => Promise<void>;
  getConfig: () => {
    enabled: boolean;
    preset: AuthPreset;
    authParams: AuthParam[];
    webhook: WebhookConfig;
    login: LoginConfig;
    whitelist: string[];
    currentUser?: UserInfo;
  };
  getEnabled: () => boolean;
  isAuthenticated: () => boolean;
  getCurrentUser: () => UserInfo | undefined;

  updateConfig: (partial: Partial<{
    enabled: boolean;
    preset: AuthPreset;
    authParams: AuthParam[];
    webhook: Partial<WebhookConfig>;
    login: Partial<LoginConfig>;
    whitelist: string[];
  }>) => Promise<void>;
  setCurrentUser: (user: UserInfo | undefined) => void;
  clearCurrentUser: () => void;
  reset: () => Promise<void>;

  getToken: () => string | null;
  setToken: (token: string) => void;
  clearToken: () => void;

  getRefreshToken: () => string | null;
  setRefreshToken: (token: string) => void;
  clearRefreshToken: () => void;
  clearAllTokens: () => void;

  getEndpointByName: (name: string) => ApiEndpoint | undefined;
  getEndpointUrl: (endpoint: ApiEndpoint) => string;
  isWhitelisted: (path: string) => boolean;
  getAllCachedKeys: () => string[];
  isExpirationTimeKey: (key: string) => boolean;

  getCachedValue: (key: string) => string | null;
  setCachedValue: (key: string, value: string) => void;
  clearCachedValue: (key: string) => void;
  clearAllCachedValues: () => void;

  buildHeaders: () => Record<string, string>;
  extractAndCacheResponse: (endpoint: ApiEndpoint, responseData: Record<string, unknown>) => void;

  getMenuEndpoints: () => ApiEndpoint[];
  executeEndpoint: (endpoint: ApiEndpoint) => Promise<Record<string, unknown>>;
  performLogin: () => Promise<void>;
  performLogout: () => Promise<void>;
  performRefresh: () => Promise<void>;
  startRefreshTimer: (expiresIn: number) => void;
  stopRefreshTimer: () => void;
  findExpirationTimeMapping: () => { targetKey: string; expiresInStr: string | null } | null;
  loadPresetConfig: (preset: AuthPreset) => Promise<AuthConfig | null>;
}