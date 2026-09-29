import { create } from "zustand";
import { AUTH_PRESETS } from "../../services/tauri";
import { createCacheActions } from "./actions/cache";
import { createConfigActions } from "./actions/config";
import { createEndpointActions } from "./actions/endpoint";
import { createRefreshActions } from "./actions/refresh";
import { createRequestActions } from "./actions/request";
import { createSessionActions } from "./actions/session";
import { createTokenActions } from "./actions/token";
import { defaultLogin, defaultWebhook } from "./shared";
import type { AuthState } from "./types";

export const useAuthStore = create<AuthState>()((set, get) => ({
  initialized: false,
  enabled: false,
  preset: "custom",
  authParams: [],
  webhook: defaultWebhook,
  login: defaultLogin,
  whitelist: ["/login", "/public/*"],
  currentUser: undefined,
  tokenExpiresIn: null,
  isRefreshing: false,
  refreshStatus: null,

  ...createConfigActions(set, get),
  ...createTokenActions(set, get),
  ...createEndpointActions(set, get),
  ...createCacheActions(set, get),
  ...createRequestActions(set, get),
  ...createSessionActions(set, get),
  ...createRefreshActions(set, get),
}));

export { AUTH_PRESETS };
export type { AuthState, LoginConfig, UserInfo, WebhookConfig } from "./types";