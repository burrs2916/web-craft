export type TokenStorage = "localStorage" | "sessionStorage" | "memory";

export interface WebhookEndpoints {
  login: string;
  logout: string;
  validate: string;
  refresh?: string;
  user?: string;
}

export interface WebhookRequestConfig {
  timeout: number;
  headers: Record<string, string>;
  withCredentials?: boolean;
}

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

export interface WebhookConfig {
  baseUrl: string;
  endpoints: WebhookEndpoints;
  request: WebhookRequestConfig;
  token: TokenConfig;
  refresh: RefreshConfig;
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
  role?: string;
  permissions?: string[];
  avatar?: string;
}

export interface AuthConfigTable {
  enabled: boolean;
  webhook: WebhookConfig;
  login: LoginConfig;
  whitelist: string[];
  currentUser?: UserInfo;
  extra?: Record<string, any>;
}

export interface LoginCredentials {
  username: string;
  password: string;
  [key: string]: any;
}

export interface AuthResult {
  success: boolean;
  token?: string;
  tokenType?: string;
  expiresIn?: number;
  refreshToken?: string;
  user?: UserInfo;
  error?: {
    code: string;
    message: string;
  };
}

export interface ValidateResult {
  valid: boolean;
  expiresAt?: number;
  user?: UserInfo;
}
