const ALLOWED_CACHE_KEYS: string[] = [
  "icon-settings",
];

const DYNAMIC_KEY_PATTERNS: RegExp[] = [
  /^auth_token$/,
  /^auth_token_refresh$/,
  /^accessToken$/,
  /^accessToken_refresh$/,
  /^refreshToken$/,
  /^expiresIn$/,
  /^userId$/,
  /^username$/,
  /^nickname$/,
  /^email$/,
  /^avatar$/,
  /^tenantId$/,
  /^tenantName$/,
  /^roles$/,
  /^permissions$/,
];

export function isCacheKeyAllowed(key: string): boolean {
  if (ALLOWED_CACHE_KEYS.includes(key)) return true;
  return DYNAMIC_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

export function registerDynamicKey(key: string): void {
  if (!isCacheKeyAllowed(key)) {
    ALLOWED_CACHE_KEYS.push(key);
  }
}

export function cleanupDisallowedKeys(): void {
  if (typeof window === "undefined") return;

  const storages = [window.localStorage, window.sessionStorage];
  for (const storage of storages) {
    const keysToRemove: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && !isCacheKeyAllowed(key)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => storage.removeItem(key));
  }
}

export function getDisallowedKeys(): string[] {
  if (typeof window === "undefined") return [];

  const result: string[] = [];
  const storages = [window.localStorage, window.sessionStorage];
  for (const storage of storages) {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && !isCacheKeyAllowed(key)) {
        result.push(key);
      }
    }
  }
  return result;
}
