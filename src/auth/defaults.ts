import type { AuthConfigTable } from "./types";

export const defaultAuthConfig: AuthConfigTable = {
  enabled: false,

  webhook: {
    baseUrl: "",
    endpoints: {
      login: "/auth/login",
      logout: "/auth/logout",
      validate: "/auth/validate",
      refresh: "/auth/refresh",
      user: "/auth/user",
    },
    request: {
      timeout: 10000,
      headers: {
        "Content-Type": "application/json",
      },
    },
    token: {
      storage: "localStorage",
      key: "auth_token",
      header: "Authorization",
      prefix: "Bearer ",
    },
    refresh: {
      enabled: true,
      threshold: 300,
    },
  },

  login: {
    path: "/login",
    redirectParam: "redirect",
    autoRedirect: true,
  },

  whitelist: ["/login", "/public/*"],

  currentUser: undefined,
};

export const STORAGE_KEY = "spatial_auth_config";
