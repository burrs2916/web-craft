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