import type { AuthConfigTable, UserInfo } from "./types";
import { defaultAuthConfig, STORAGE_KEY } from "./defaults";

class AuthConfigManager {
  private config: AuthConfigTable;
  private memoryToken: string | null = null;

  constructor() {
    this.config = this.loadOrCreate();
  }

  private loadOrCreate(): AuthConfigTable {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return this.mergeWithDefaults(parsed);
      }
    } catch (e) {
      console.warn("Failed to load auth config:", e);
    }
    return this.deepClone(defaultAuthConfig);
  }

  private deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }

  private mergeWithDefaults(saved: Partial<AuthConfigTable>): AuthConfigTable {
    return {
      ...this.deepClone(defaultAuthConfig),
      ...saved,
      webhook: {
        ...this.deepClone(defaultAuthConfig.webhook),
        ...saved.webhook,
        endpoints: {
          ...defaultAuthConfig.webhook.endpoints,
          ...saved.webhook?.endpoints,
        },
        request: {
          ...defaultAuthConfig.webhook.request,
          ...saved.webhook?.request,
        },
        token: {
          ...defaultAuthConfig.webhook.token,
          ...saved.webhook?.token,
        },
        refresh: {
          ...defaultAuthConfig.webhook.refresh,
          ...saved.webhook?.refresh,
        },
      },
      login: {
        ...defaultAuthConfig.login,
        ...saved.login,
      },
    };
  }

  getConfig(): AuthConfigTable {
    return this.config;
  }

  get<K extends keyof AuthConfigTable>(key: K): AuthConfigTable[K] {
    return this.config[key];
  }

  update(partial: Partial<AuthConfigTable>): void {
    this.config = {
      ...this.config,
      ...partial,
      webhook: partial.webhook
        ? {
            ...this.config.webhook,
            ...partial.webhook,
            endpoints: {
              ...this.config.webhook.endpoints,
              ...partial.webhook.endpoints,
            },
            request: {
              ...this.config.webhook.request,
              ...partial.webhook.request,
            },
            token: {
              ...this.config.webhook.token,
              ...partial.webhook.token,
            },
            refresh: {
              ...this.config.webhook.refresh,
              ...partial.webhook.refresh,
            },
          }
        : this.config.webhook,
      login: partial.login
        ? {
            ...this.config.login,
            ...partial.login,
          }
        : this.config.login,
    };
    this.save();
  }

  save(): void {
    try {
      const { currentUser, ...toSave } = this.config;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch (e) {
      console.error("Failed to save auth config:", e);
    }
  }

  reset(): void {
    this.config = this.deepClone(defaultAuthConfig);
    this.memoryToken = null;
    localStorage.removeItem(STORAGE_KEY);
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  isAuthenticated(): boolean {
    return !!this.config.currentUser;
  }

  getCurrentUser(): UserInfo | undefined {
    return this.config.currentUser;
  }

  setCurrentUser(user: UserInfo | undefined): void {
    this.config.currentUser = user;
  }

  clearCurrentUser(): void {
    this.config.currentUser = undefined;
  }

  isWhitelisted(path: string): boolean {
    return this.config.whitelist.some((pattern) => {
      if (pattern.endsWith("/*")) {
        return path.startsWith(pattern.slice(0, -1));
      }
      return path === pattern;
    });
  }

  getEndpointUrl(
    endpoint: keyof AuthConfigTable["webhook"]["endpoints"]
  ): string {
    const { baseUrl, endpoints } = this.config.webhook;
    const path = endpoints[endpoint];
    if (!path) return "";
    if (!baseUrl) return path;
    return `${baseUrl}${path}`;
  }

  getToken(): string | null {
    const { storage, key } = this.config.webhook.token;

    switch (storage) {
      case "localStorage":
        return localStorage.getItem(key);
      case "sessionStorage":
        return sessionStorage.getItem(key);
      case "memory":
        return this.memoryToken;
      default:
        return null;
    }
  }

  setToken(token: string): void {
    const { storage, key } = this.config.webhook.token;

    switch (storage) {
      case "localStorage":
        localStorage.setItem(key, token);
        break;
      case "sessionStorage":
        sessionStorage.setItem(key, token);
        break;
      case "memory":
        this.memoryToken = token;
        break;
    }
  }

  clearToken(): void {
    const { storage, key } = this.config.webhook.token;

    switch (storage) {
      case "localStorage":
        localStorage.removeItem(key);
        break;
      case "sessionStorage":
        sessionStorage.removeItem(key);
        break;
      case "memory":
        this.memoryToken = null;
        break;
    }
  }

  getRefreshToken(): string | null {
    const key = `${this.config.webhook.token.key}_refresh`;
    const storage = this.config.webhook.token.storage;

    switch (storage) {
      case "localStorage":
        return localStorage.getItem(key);
      case "sessionStorage":
        return sessionStorage.getItem(key);
      case "memory":
        return this.memoryRefreshToken;
      default:
        return null;
    }
  }

  private memoryRefreshToken: string | null = null;

  setRefreshToken(token: string): void {
    const key = `${this.config.webhook.token.key}_refresh`;
    const storage = this.config.webhook.token.storage;

    switch (storage) {
      case "localStorage":
        localStorage.setItem(key, token);
        break;
      case "sessionStorage":
        sessionStorage.setItem(key, token);
        break;
      case "memory":
        this.memoryRefreshToken = token;
        break;
    }
  }

  clearRefreshToken(): void {
    const key = `${this.config.webhook.token.key}_refresh`;
    const storage = this.config.webhook.token.storage;

    switch (storage) {
      case "localStorage":
        localStorage.removeItem(key);
        break;
      case "sessionStorage":
        sessionStorage.removeItem(key);
        break;
      case "memory":
        this.memoryRefreshToken = null;
        break;
    }
  }

  clearAllTokens(): void {
    this.clearToken();
    this.clearRefreshToken();
    this.clearCurrentUser();
  }
}

export const authConfig = new AuthConfigManager();
