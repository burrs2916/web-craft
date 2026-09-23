/**
 * 共享 API 层 · 生成器（前后端分离）
 *
 * 让四种发布模板统一产出前端 API 骨架：
 *   - `.env`            环境配置（API 基地址、鉴权头/前缀），服务器地址不入代码
 *   - `src/api/http.*`  统一 http 客户端（拦截器：自动拼 base、注入 token、统一 JSON 与错误）
 *   - `src/api/index.*` 类型化业务接口入口
 *
 * 设计模式：Facade + 拦截器（Interceptor）+ 服务分层。
 * 运行期暴露 window.__wc_http，事件脚本（callApi）/ 表单提交 / 数据源统一走鉴权与相对路径。
 */

/** .env 内容模板 */
export function buildEnvContent(): string {
  return [
    "# 环境变量 · 前端 API 配置（前后端分离：服务器地址不入代码）",
    "# API 基地址：相对路径走同源部署；可填 https://api.example.com 指向独立后端",
    "VITE_API_BASE_URL=",
    "",
    "# 鉴权头：注入 http 客户端（默认 Authorization Bearer）",
    "VITE_API_TOKEN_HEADER=Authorization",
    "VITE_API_TOKEN_PREFIX=Bearer ",
    "# 令牌存储位置与键名（localStorage / sessionStorage / memory）",
    "VITE_AUTH_STORAGE=localStorage",
    "VITE_AUTH_TOKEN_KEY=auth_token",
  ].join("\n");
}

/** Angular 标准环境文件（Angular CLI 不读 .env，环境配置走 src/environments/） */
export function buildAngularEnvironmentContent(): string {
  return [
    "/**",
    " * 环境配置 · web-craft 生成（Angular 标准模式：src/environments/）",
    " * Angular CLI 不加载 .env；改 base 地址请编辑此文件后重新构建。",
    " * 运行期 window.__WC_*（index.html 全局配置脚本）优先级低于此文件的显式非空值。",
    " */",
    "export const environment = {",
    "  production: true,",
    "  // API 基地址：留空走同源；或填 https://api.example.com 指向独立后端",
    "  apiBaseUrl: '',",
    "  // 鉴权头：注入 http 客户端（默认 Authorization Bearer）",
    "  tokenHeader: 'Authorization',",
    "  tokenPrefix: 'Bearer ',",
    "  // 令牌存储位置与键名（localStorage / sessionStorage / memory）",
    "  tokenStorage: 'localStorage',",
    "  tokenKey: 'auth_token',",
    "};",
    "",
  ].join("\n");
}

/** http 客户端源码（Fetch 封装 + 拦截器），lang 控制 TS/JS 语法，variant 控制配置来源 */
export function buildHttpClientSource(
  lang: "ts" | "js",
  variant: "vite" | "angular-env" = "vite",
): string {
  const ts = lang === "ts";

  // 配置解析：构建期配置（Vite .env / Angular environment）优先，运行期 window.__WC_* 兜底，最后默认值。
  // 注意：resolveUrl 只豁免绝对 URL（与事件层 callApi、数据层 __wc_buildUrl 行为一致），
  // 相对路径一律拼基地址——否则 .env 里配置的 base 对业务接口不生效。
  const configResolve = variant === "vite"
    ? [
        "const env = (typeof import.meta !== 'undefined' && (import.meta as any).env) || {};",
        "const cfg = {",
        "  base: env.VITE_API_BASE_URL || (typeof window !== 'undefined' && window.__WC_API_BASE) || '',",
        "  tokenHeader: env.VITE_API_TOKEN_HEADER || (typeof window !== 'undefined' && window.__WC_TOKEN_HEADER) || 'Authorization',",
        "  tokenPrefix: env.VITE_API_TOKEN_PREFIX !== undefined && env.VITE_API_TOKEN_PREFIX !== null && env.VITE_API_TOKEN_PREFIX !== '' ? env.VITE_API_TOKEN_PREFIX : ((typeof window !== 'undefined' && window.__WC_TOKEN_PREFIX !== undefined) ? window.__WC_TOKEN_PREFIX : 'Bearer '),",
        "  tokenStorage: env.VITE_AUTH_STORAGE || (typeof window !== 'undefined' && window.__WC_TOKEN_STORAGE) || 'localStorage',",
        "  tokenKey: env.VITE_AUTH_TOKEN_KEY || (typeof window !== 'undefined' && window.__WC_TOKEN_KEY) || 'auth_token',",
        "};",
      ]
    : [
        "const cfg = {",
        "  base: environment.apiBaseUrl || (typeof window !== 'undefined' && window.__WC_API_BASE) || '',",
        "  tokenHeader: environment.tokenHeader || (typeof window !== 'undefined' && window.__WC_TOKEN_HEADER) || 'Authorization',",
        "  tokenPrefix: environment.tokenPrefix || ((typeof window !== 'undefined' && window.__WC_TOKEN_PREFIX !== undefined) ? window.__WC_TOKEN_PREFIX : 'Bearer '),",
        "  tokenStorage: environment.tokenStorage || (typeof window !== 'undefined' && window.__WC_TOKEN_STORAGE) || 'localStorage',",
        "  tokenKey: environment.tokenKey || (typeof window !== 'undefined' && window.__WC_TOKEN_KEY) || 'auth_token',",
        "};",
      ];

  const lines: string[] = [
    "/**",
    " * 统一 http 客户端 · web-craft 生成",
    " * 基于 Fetch，内置拦截器：相对路径拼基地址、自动注入鉴权头、JSON 序列化、统一错误。",
    variant === "vite"
      ? " * 配置来源：Vite .env（VITE_*）→ window.__WC_* 全局配置 → 默认值。"
      : " * 配置来源：src/environments/environment.ts → window.__WC_* 全局配置 → 默认值。",
    " * 暴露为 window.__wc_http，供事件/数据脚本走统一鉴权。",
    " */",
  ];
  if (variant === "angular-env") {
    lines.push("import { environment } from '../environments/environment';");
  }
  if (ts) {
    lines.push(
      "type ReqOptions = {",
      "  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';",
      "  params?: Record<string, string | number | boolean>;",
      "  data?: unknown;",
      "  headers?: Record<string, string>;",
      "  auth?: boolean;",
      "  responsePath?: string;",
      "};",
      "type HttpResponse<T = unknown> = { ok: boolean; status: number; data: T };",
    );
  }
  // 函数签名：TS 变体带完整类型注解（产物需通过 tsc --strict），JS 变体保持无注解
  const sig = (tsSig: string, jsSig: string) => (ts ? tsSig : jsSig);
  const memoryCacheRead = ts
    ? "    else if (cfg.tokenStorage === 'memory') raw = (window as any).__webcraft_memory_cache?.[cfg.tokenKey];"
    : "    else if (cfg.tokenStorage === 'memory') raw = (window.__webcraft_memory_cache || {})[cfg.tokenKey];";

  lines.push(
    ...configResolve,
    "",
    sig("function resolveUrl(path: string, options: ReqOptions): string {", "function resolveUrl(path, options) {"),
    "  let url = path || '';",
    "  // 仅绝对 URL 豁免拼基地址；相对路径（含 /api/*）一律拼，保证 base 配置生效",
    "  if (!/^(https?:)?\\/\\//i.test(url)) {",
    "    url = cfg.base + (url.startsWith('/') ? '' : '/') + url;",
    "  }",
    "  if (options.params) {",
    "    const params = options.params;",
    "    const qs = Object.keys(params).map((k) => k + '=' + encodeURIComponent(String(params[k])));",
    "    url = url.indexOf('?') >= 0 ? url + '&' + qs.join('&') : url + '?' + qs.join('&');",
    "  }",
    "  return url;",
    "}",
    "",
    sig("function buildHeaders(options: ReqOptions): Record<string, string> {", "function buildHeaders(options) {"),
    "  const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});",
    "  if (options.auth !== false) {",
    "    const token = getToken();",
    "    if (token && token.header) headers[token.header] = token.value;",
    "  }",
    "  return headers;",
    "}",
    "",
    sig("function getToken(): { header: string; value: string } | null {", "function getToken() {"),
    "  if (typeof window === 'undefined') return null;",
    "  if (typeof window.__wc_getToken === 'function') return window.__wc_getToken();",
    "  let raw: string | null = null;",
    "  try {",
    "    if (cfg.tokenStorage === 'sessionStorage') raw = window.sessionStorage.getItem(cfg.tokenKey);",
    memoryCacheRead,
    "    else raw = window.localStorage.getItem(cfg.tokenKey);",
    "  } catch { return null; }",
    "  return raw ? { header: cfg.tokenHeader, value: cfg.tokenPrefix + raw } : null;",
    "}",
    "",
    sig("async function request(path: string, options: ReqOptions): Promise<HttpResponse> {", "async function request(path, options) {"),
    "  const method = (options.method || 'GET').toUpperCase();",
    ts ? "  const init: RequestInit = {" : "  const init = {",
    ts ? "    method: method as RequestInit['method']," : "    method: method,",
    "    headers: buildHeaders(options),",
    ts ? "    credentials: 'same-origin' as const," : "    credentials: 'same-origin',",
    "  };",
    "  if (options.data && method !== 'GET') init.body = JSON.stringify(options.data);",
    "  const res = await fetch(resolveUrl(path, options), init);",
    "  if (!res.ok) throw new Error('HTTP ' + res.status);",
    "  let payload: any = null;",
    "  if (res.status !== 204) payload = await res.json().catch(() => res.text());",
    "  let extracted: any = payload;",
    "  if (options.responsePath && payload != null) {",
    "    const segs = String(options.responsePath).split('.');",
    "    for (const seg of segs) { if (extracted != null) extracted = extracted[seg]; }",
    "  }",
    "  return { ok: true, status: res.status, data: extracted };",
    "}",
    "",
    "export const http = {",
    ts
      ? "  get: (path: string, opts?: ReqOptions) => request(path, Object.assign({}, opts, { method: 'GET' })),"
      : "  get: (path, opts) => request(path, Object.assign({}, opts, { method: 'GET' })),",
    ts
      ? "  post: (path: string, data?: unknown, opts?: ReqOptions) => request(path, Object.assign({}, opts, { method: 'POST', data })),"
      : "  post: (path, data, opts) => request(path, Object.assign({}, opts, { method: 'POST', data })),",
    ts
      ? "  put: (path: string, data?: unknown, opts?: ReqOptions) => request(path, Object.assign({}, opts, { method: 'PUT', data })),"
      : "  put: (path, data, opts) => request(path, Object.assign({}, opts, { method: 'PUT', data })),",
    ts
      ? "  del: (path: string, opts?: ReqOptions) => request(path, Object.assign({}, opts, { method: 'DELETE' })),"
      : "  del: (path, opts) => request(path, Object.assign({}, opts, { method: 'DELETE' })),",
    "  request: request",
    "};",
    "",
    "if (typeof window !== 'undefined') {",
    "  window.__wc_http = http;",
    "}",
    "",
    "export default http;",
    "",
  );

  if (ts) {
    lines.push(
      "declare global {",
      "  interface Window {",
      "    __wc_http: typeof http;",
      "    __WC_API_BASE?: string;",
      "    __WC_TOKEN_HEADER?: string;",
      "    __WC_TOKEN_PREFIX?: string | undefined;",
      "    __WC_TOKEN_STORAGE?: string;",
      "    __WC_TOKEN_KEY?: string;",
      "    __wc_getToken?: () => { header: string; value: string } | null;",
      "  }",
      "}",
      "export {};",
    );
  }
  return lines.join("\n");
}

/**
 * 静态站专用 http 客户端（非模块版，IIFE 暴露 window.__wc_http）
 * 无构建步骤、无 ES module，直接以 <script src="assets/js/http.js"> 加载。
 * 读取 window.__WC_* 全局配置（由 globalConfig 脚本注入），走统一鉴权 + 相对路径拼 base。
 */
export function buildStaticHttpClientSource(): string {
  return [
    `/*`,
    ` * 统一 http 客户端 · web-craft 生成（静态站版）`,
    ` * 拦截器：相对路径拼基地址、自动注入鉴权头、JSON 序列化、统一错误。`,
    ` * 配置源为全局 window.__WC_*（见 index.html <head> 的 globalConfig 脚本）。`,
    ` * 暴露 window.__wc_http.request，供事件/数据脚本 callApi 走统一鉴权。`,
    ` */`,
    `(function (global) {`,
    `  var BASE_URL = global.__WC_API_BASE || '';`,
    ``,
    `  function getToken() {`,
    `    if (typeof global.__wc_getToken === 'function') return global.__wc_getToken();`,
    `    var storage = global.__WC_TOKEN_STORAGE || 'localStorage';`,
    `    var key = global.__WC_TOKEN_KEY || 'auth_token';`,
    `    var header = global.__WC_TOKEN_HEADER || 'Authorization';`,
    `    var pfx = global.__WC_TOKEN_PREFIX !== undefined ? global.__WC_TOKEN_PREFIX : 'Bearer ';`,
    `    var raw = null;`,
    `    try {`,
    `      if (storage === 'sessionStorage') raw = global.sessionStorage.getItem(key);`,
    `      else if (storage === 'memory') raw = (global.__webcraft_memory_cache || {})[key];`,
    `      else raw = global.localStorage.getItem(key);`,
    `    } catch (e) { return null; }`,
    `    return raw ? { header: header, value: pfx + raw } : null;`,
    `  }`,
    ``,
    `  function resolveUrl(path, options) {`,
    `    var url = path || '';`,
    `    // 仅绝对 URL 豁免拼基地址；相对路径（含 /api/*）一律拼，与模块版行为一致`,
    `    if (!/^(https?:)?\\/\\//i.test(url)) {`,
    `      url = BASE_URL + (url.charAt(0) === '/' ? '' : '/') + url;`,
    `    }`,
    `    if (options.params) {`,
    `      var qs = Object.keys(options.params).map(function (k) {`,
    `        return k + '=' + encodeURIComponent(String(options.params[k]));`,
    `      });`,
    `      url = url.indexOf('?') >= 0 ? url + '&' + qs.join('&') : url + '?' + qs.join('&');`,
    `    }`,
    `    return url;`,
    `  }`,
    ``,
    `  function buildHeaders(options) {`,
    `    var headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});`,
    `    if (options.auth !== false) {`,
    `      var token = getToken();`,
    `      if (token && token.header) headers[token.header] = token.value;`,
    `    }`,
    `    return headers;`,
    `  }`,
    ``,
    `  async function request(path, options) {`,
    `    options = options || {};`,
    `    var method = (options.method || 'GET').toUpperCase();`,
    `    var init = { method: method, headers: buildHeaders(options), credentials: 'same-origin' };`,
    `    if (options.data && method !== 'GET') init.body = JSON.stringify(options.data);`,
    `    var res = await fetch(resolveUrl(path, options), init);`,
    `    if (!res.ok) throw new Error('HTTP ' + res.status);`,
    `    var payload = null;`,
    `    if (res.status !== 204) payload = await res.json().catch(function () { return res.text(); });`,
    `    var extracted = payload;`,
    `    if (options.responsePath && payload != null) {`,
    `      var segs = String(options.responsePath).split('.');`,
    `      for (var i = 0; i < segs.length; i++) { if (extracted != null) extracted = extracted[segs[i]]; }`,
    `    }`,
    `    return { ok: true, status: res.status, data: extracted };`,
    `  }`,
    ``,
    `  global.__wc_http = {`,
    `    get: function (path, opts) { return request(path, Object.assign({}, opts, { method: 'GET' })); },`,
    `    post: function (path, data, opts) { return request(path, Object.assign({}, opts, { method: 'POST', data: data })); },`,
    `    put: function (path, data, opts) { return request(path, Object.assign({}, opts, { method: 'PUT', data: data })); },`,
    `    del: function (path, opts) { return request(path, Object.assign({}, opts, { method: 'DELETE' })); },`,
    `    request: request`,
    `  };`,
    `})(window);`,
    ``,
  ].join("\n");
}

/** api 入口源码（类型化业务接口骨架） */
export function buildApiIndexSource(_lang: "ts" | "js" = "ts"): string {
  const ts = _lang === "ts";
  const lines: string[] = [
    "/**",
    " * API 入口 · web-craft 生成",
    " * 前置分层：页面组件/交互只调用这里暴露的业务函数，不直接 fetch。",
    " * 新增业务接口在此按模块扩展（如 userApi / articleApi）。",
    " */",
    "import http from './http';",
    "",
    "export const userApi = {",
    "  list: () => http.get('/api/users'),",
    ts
      ? "  detail: (id: string | number) => http.get('/api/users/' + id),"
      : "  detail: (id) => http.get('/api/users/' + id),",
    ts
      ? "  create: (data: unknown) => http.post('/api/users', data)"
      : "  create: (data) => http.post('/api/users', data)",
    "};",
    "",
  ];
  return lines.join("\n");
}