/**
 * 数据层代码生成 — 将 DataBinding[] + 组件 config 转为运行时数据获取与绑定逻辑
 *
 * 支持的数据源类型：
 *   - static:   静态数据（内嵌在组件 config 中）
 *   - api:       HTTP API 轮询（fetch + refreshInterval）
 *   - websocket: WebSocket 连接（实时推送）
 *
 * 支持的绑定类型（DataBinding.type）：
 *   - value:      设置组件属性值（textContent, value, src 等）
 *   - style:      设置组件样式
 *   - visibility: 根据布尔值控制显示/隐藏
 *   - action:     触发动作（委托给事件系统）
 *
 * 生成的脚本是框架无关的纯 JavaScript，通过 data-component-id 定位 DOM 元素。
 */

import type { DataBinding } from "../../types/editor";
import type { SceneDSL, SceneDataSource, SceneView } from "../../types/scene";
import { resolveEffectiveDataConfig } from "../../shared/resolveDataConfig";

/**
 * 数据层代码生成结果
 */
export interface DataScriptResult {
  /** 数据服务模块代码（ES module 格式，含 export） */
  module: string;
  /** 数据绑定初始化脚本（IIFE 格式，可直接放入 <script>） */
  inlineScript: string;
  /** 是否有任何数据绑定被生成 */
  hasData: boolean;
  /** 收集到的所有数据绑定数量 */
  bindingCount: number;
}

/**
 * 数据源描述（从组件 config 中提取）
 */
interface DataSourceDesc {
  id: string;
  type: "static" | "api" | "websocket";
  staticData?: unknown;
  apiConfig?: {
    /** 完整 URL（以 http 开头时直接使用） */
    url: string;
    /** API 路径，与全局 baseUrl 拼接 */
    path: string;
    method: string;
    headers?: Record<string, string>;
    body?: unknown;
    refreshInterval?: number;
    /** 响应取值路径，如 "data.metrics.cpu" */
    dataPath?: string;
    /** 是否注入认证 header：true=启用, false=禁用, undefined=跟随全局 */
    authEnabled?: boolean | null;
  };
  wsConfig?: {
    url: string;
    protocols?: string[];
  };
  transform?: string;
}

/**
 * 绑定 + 其所属组件 ID
 */
interface BindingWithContext {
  binding: DataBinding;
  componentId: string;
}

/**
 * 为视图生成数据层脚本
 *
 * @param view 视图
 * @param scene 场景（读取 apiConfig 全局配置）
 * @returns 数据服务模块 + 绑定脚本
 */
export function generateDataScript(
  view: SceneView,
  scene: SceneDSL,
): DataScriptResult {
  const components = view.components ?? [];
  const bindingsWithContext: BindingWithContext[] = [];

  // 全局数据源（场景级）：按 id 索引，组件 dataSourceId 命中时以其配置覆盖本地数据配置
  const globalSources = new Map<string, SceneDataSource>();
  for (const ds of scene.dataSources ?? []) {
    globalSources.set(ds.id, ds);
  }

  // 收集所有组件上的数据绑定，记录所属组件 ID
  for (const comp of components) {
    const cfg = (comp.config ?? {}) as Record<string, unknown>;
    // datasource 模式：由 dataSourceId + field 自动推导组件值绑定
    // （编辑器侧经 useDataSourceBinding 推送；发布端在此生成等价绑定规则，
    //   数据引擎按组件 value 绑定派发 data-update 事件，组件监听后更新自身）
    if (cfg.dataMode === "datasource" && cfg.dataSourceId) {
      const hasExplicit = (comp.bindings ?? []).some(
        (b) => b.sourceId === cfg.dataSourceId,
      );
      if (!hasExplicit) {
        bindingsWithContext.push({
          binding: {
            id: `${comp.id}-datasource`,
            sourceId: String(cfg.dataSourceId),
            field: String(cfg.field ?? ""),
            targetProperty: "value",
            type: "value",
          },
          componentId: comp.id,
        });
      }
    }
    if (comp.bindings) {
      for (const b of comp.bindings) {
        bindingsWithContext.push({ binding: b, componentId: comp.id });
      }
    }
  }

  if (bindingsWithContext.length === 0) {
    return { module: "", inlineScript: "", hasData: false, bindingCount: 0 };
  }

  // 提取数据源配置
  const sourceMap = new Map<string, DataSourceDesc>();

  // 由 sourceId + 原始配置推导运行时数据源描述。
  // 若 sourceId 命中全局数据源，用全局源的 data 配置覆盖组件本地配置（与编辑器本
  // 地运行时 useApiDataFetch 的绑定语义一致：绑定后数据来自全局源，忽略自带配置）。
  const toSourceDesc = (
    sourceId: string,
    rawCfg: Record<string, unknown>,
  ): DataSourceDesc => {
    const gs = globalSources.get(sourceId);
    // 绑定覆盖语义与编辑端 useApiDataFetch 共用 resolveEffectiveDataConfig：
    // 命中全局源 → 以源配置覆盖本地数据字段；否则原样使用本地配置。
    const cfg = gs
      ? (resolveEffectiveDataConfig(rawCfg, gs) as Record<string, unknown>)
      : rawCfg;

    const desc: DataSourceDesc = { id: sourceId, type: "static" };

    // ── 新式 flat 数据配置（来自 dataConfigMixin） ──
    const dataMode = String(cfg.dataMode ?? "static");
    if (dataMode === "api") {
      desc.type = "api";
      const apiUrl = String(cfg.apiUrl ?? "");
      const apiPath = String(cfg.apiPath ?? "");
      // 解析 headers（可能是 JSON 字符串或对象）
      let headers: Record<string, string> | undefined;
      const rawHeaders = cfg.apiHeaders;
      if (rawHeaders != null && rawHeaders !== "") {
        if (typeof rawHeaders === "string") {
          try { headers = JSON.parse(rawHeaders); } catch { /* ignore */ }
        } else if (typeof rawHeaders === "object") {
          headers = rawHeaders as Record<string, string>;
        }
      }
      // 解析 body
      let body: unknown;
      if (cfg.apiBody != null && cfg.apiBody !== "") {
        if (typeof cfg.apiBody === "string") {
          try { body = JSON.parse(cfg.apiBody); } catch { body = cfg.apiBody; }
        } else {
          body = cfg.apiBody;
        }
      }
      desc.apiConfig = {
        url: apiUrl,
        path: apiPath,
        method: String(cfg.apiMethod ?? "GET"),
        headers,
        body,
        refreshInterval: Number(cfg.apiInterval ?? 0) || 0,
        dataPath: String(cfg.apiDataPath ?? ""),
        authEnabled: cfg.authEnabled === undefined ? null : cfg.authEnabled as boolean | null,
      };
    } else {
      // ── 旧式嵌套 API 配置（向后兼容） ──
      const apiCfg = cfg.apiConfig ?? cfg.api ?? cfg.dataSource;
      if (apiCfg && typeof apiCfg === "object" && "url" in apiCfg) {
        const api = apiCfg as Record<string, unknown>;
        desc.type = "api";
        desc.apiConfig = {
          url: String(api.url),
          path: "",
          method: String(api.method ?? "GET"),
          headers: api.headers as Record<string, string> | undefined,
          body: api.body,
          refreshInterval: api.refreshInterval as number | undefined,
          dataPath: "",
          authEnabled: null,
        };
        if (api.transform) desc.transform = String(api.transform);
      }
    }

    // 检测 WebSocket 配置
    const wsCfg = cfg.websocketConfig ?? cfg.websocket;
    if (wsCfg && typeof wsCfg === "object" && "url" in wsCfg) {
      const ws = wsCfg as Record<string, unknown>;
      desc.type = "websocket";
      desc.wsConfig = {
        url: String(ws.url),
        protocols: ws.protocols as string[] | undefined,
      };
    }

    // 静态数据
    if (cfg.staticData !== undefined) {
      desc.staticData = cfg.staticData;
    } else if (desc.type === "static") {
      desc.staticData = cfg;
    }

    return desc;
  };

  for (const comp of components) {
    const cfg = (comp.config ?? {}) as Record<string, unknown>;
    const sourceId = String(cfg.dataSourceId ?? cfg.sourceId ?? comp.id);
    if (sourceMap.has(sourceId)) continue;

    sourceMap.set(sourceId, toSourceDesc(sourceId, cfg));
  }

  // 确保 binding.sourceId 有对应的数据源条目
  // 如果 binding 引用的 sourceId 不在 sourceMap 中（如外部数据源），
  // 创建一个空的静态数据源，避免运行时 ReferenceError
  for (const bwc of bindingsWithContext) {
    if (!sourceMap.has(bwc.binding.sourceId)) {
      const comp = components.find(
        (c) => String(c.config?.dataSourceId ?? c.config?.sourceId) === bwc.binding.sourceId,
      );
      sourceMap.set(bwc.binding.sourceId, {
        id: bwc.binding.sourceId,
        type: "static",
        staticData: comp?.config ?? {},
      });
    }
  }

  const sources = Array.from(sourceMap.values());
  // 读取全局 API 配置
  const globalApiConfig = scene.apiConfig ?? {
    baseUrl: "",
    authEnabled: false,
    defaultHeaders: {},
    timeout: 10000,
  };
  const body = generateDataBody(bindingsWithContext, sources, globalApiConfig);

  return {
    module: body
      ? `// web-craft 自动生成的数据层模块\nexport function initDataLayer() {\n${body}\n}\n`
      : "",
    inlineScript: body
      ? `// web-craft 自动生成的数据层脚本\n(function() {\n${body}\n})();`
      : "",
    hasData: body.length > 0,
    bindingCount: bindingsWithContext.length,
  };
}

/**
 * 生成数据层函数体
 */
function generateDataBody(
  bindings: BindingWithContext[],
  sources: DataSourceDesc[],
  globalApiConfig: { baseUrl: string; authEnabled: boolean; defaultHeaders?: Record<string, string>; timeout?: number },
): string {
  if (bindings.length === 0) return "";

  const lines: string[] = [
    "  function $(id) { return document.querySelector('[data-component-id=\"' + id + '\"]'); }",
    "",
    "  // 获取嵌套字段值（支持 a.b.c 路径）",
    "  function getField(obj, path) {",
    "    if (!path) return obj;",
    "    return path.split('.').reduce(function(o, k) { return o == null ? undefined : o[k]; }, obj);",
    "  }",
    "",
    "  // 应用 transform 表达式",
    "  function applyTransform(value, transform) {",
    "    if (!transform) return value;",
    "    try {",
    "      return new Function('value', 'return (' + transform + ')')(value);",
    "    } catch (e) {",
    "      console.warn('[web-craft] Transform failed:', e);",
    "      return value;",
    "    }",
    "  }",
    "",
    "  // 应用绑定到目标元素",
    "  function applyBinding(targetId, binding, value) {",
    "    var el = $(targetId);",
    "    if (!el) return;",
    "    var transformed = applyTransform(value, binding.transform);",
    "    var isComponent = el.hasAttribute && el.hasAttribute('data-component-id');",
    "    switch (binding.type) {",
    "      case 'value':",
    "        if (isComponent) {",
    "          // 组件级值绑定：派发 data-update 事件，由组件自身消费（如指标卡 field 更新）",
    "          var detail = { value: transformed, field: binding.field || '' };",
    "          try { detail[binding.targetProperty] = transformed; } catch(e) {}",
    "          el.dispatchEvent(new CustomEvent('data-update', { detail: detail }));",
    "        } else if (binding.targetProperty === 'textContent' || binding.targetProperty === 'text') {",
    "          el.textContent = transformed;",
    "        } else if (binding.targetProperty === 'innerHTML') {",
    "          el.innerHTML = transformed;",
    "        } else if (binding.targetProperty === 'value') {",
    "          el.value = transformed;",
    "        } else if (binding.targetProperty === 'src') {",
    "          el.src = transformed;",
    "        } else if (binding.targetProperty.indexOf('config.') === 0) {",
    "          el.setAttribute('data-' + binding.targetProperty.replace('config.', ''), transformed);",
    "        } else {",
    "          el.setAttribute(binding.targetProperty, transformed);",
    "        }",
    "        break;",
    "      case 'style':",
    "        var prop = binding.targetProperty.replace('style.', '');",
    "        el.style[prop] = transformed;",
    "        break;",
    "      case 'visibility':",
    "        el.style.display = transformed ? '' : 'none';",
    "        break;",
    "      case 'action':",
    "        el.dispatchEvent(new CustomEvent('data:' + binding.targetProperty, { detail: transformed }));",
    "        break;",
    "    }",
    "  }",
    "",
    "  // DOM 就绪",
    "  function onReady(fn) {",
    "    if (document.readyState !== 'loading') fn();",
    "    else document.addEventListener('DOMContentLoaded', fn);",
    "  }",
    "",
    "  // ── 全局配置（运行时从 window 读取，发布时由 engine 注入） ──",
    "  var __wc_baseUrl = window.__WC_API_BASE || " + JSON.stringify(globalApiConfig.baseUrl) + ";",
    "  var __wc_authEnabled = window.__WC_AUTH_ENABLED !== undefined ? window.__WC_AUTH_ENABLED : " + JSON.stringify(globalApiConfig.authEnabled) + ";",
    "  var __wc_defaultHeaders = " + JSON.stringify(globalApiConfig.defaultHeaders ?? {}) + ";",
    "",
    "  // ── 构建 URL：apiUrl 优先，其次 path + baseUrl ──",
    "  function __wc_buildUrl(apiUrl, apiPath) {",
    "    if (apiUrl && /^https?:\\/\\//i.test(apiUrl)) return apiUrl;",
    "    if (apiUrl) {",
    "      if (!__wc_baseUrl) return apiUrl;",
    "      return __wc_baseUrl.replace(/\\/+$/, '') + (apiUrl.startsWith('/') ? apiUrl : '/' + apiUrl);",
    "    }",
    "    if (apiPath) {",
    "      if (!__wc_baseUrl) return apiPath;",
    "      return __wc_baseUrl.replace(/\\/+$/, '') + (apiPath.startsWith('/') ? apiPath : '/' + apiPath);",
    "    }",
    "    return __wc_baseUrl || '';",
    "  }",
    "  window.__wc_buildUrl = __wc_buildUrl;",
    "",
    "  // ── 从 storage 读取认证 token ──",
    "  function __wc_getToken() {",
    "    var storage = window.__WC_TOKEN_STORAGE || 'localStorage';",
    "    var key = window.__WC_TOKEN_KEY || 'auth_token';",
    "    var header = window.__WC_TOKEN_HEADER || 'Authorization';",
    "    var prefix = window.__WC_TOKEN_PREFIX !== undefined ? window.__WC_TOKEN_PREFIX : 'Bearer ';",
    "    var token = null;",
    "    if (storage === 'localStorage') { try { token = localStorage.getItem(key); } catch(e) {} }",
    "    else if (storage === 'sessionStorage') { try { token = sessionStorage.getItem(key); } catch(e) {} }",
    "    else if (storage === 'memory') { token = (window.__webcraft_memory_cache || {})[key]; }",
    "    if (token) return { header: header, value: prefix + token };",
    "    return null;",
    "  }",
    "  // 暴露到 window，供跨脚本调用（事件 callApi 等独立 <script> 块复用同一认证源）",
    "  window.__wc_getToken = __wc_getToken;",
    "",
    "  // ── 构建 headers（合并默认 + 组件 + 认证） ──",
    "  function __wc_buildHeaders(staticHeaders, authEnabled) {",
    "    var headers = {};",
    "    // 全局默认 headers",
    "    for (var k in __wc_defaultHeaders) { headers[k] = __wc_defaultHeaders[k]; }",
    "    // 组件级 headers",
    "    if (staticHeaders) { for (var k2 in staticHeaders) { headers[k2] = staticHeaders[k2]; } }",
    "    // 认证 header",
    "    var useAuth = authEnabled === null || authEnabled === undefined ? __wc_authEnabled : authEnabled;",
    "    if (useAuth) {",
    "      var auth = __wc_getToken();",
    "      if (auth) headers[auth.header] = auth.value;",
    "    }",
    "    return headers;",
    "  }",
    "",
  ];

  // 静态数据源
  const staticSources = sources.filter((s) => s.type === "static");
  if (staticSources.length > 0) {
    lines.push("  // 静态数据源");
    for (const src of staticSources) {
      const dataStr = JSON.stringify(src.staticData ?? {});
      lines.push(`  var __data_${safeId(src.id)} = ${dataStr};`);
    }
    lines.push("");
  }

  // API 数据源
  const apiSources = sources.filter((s) => s.type === "api");
  if (apiSources.length > 0) {
    lines.push("  // API 数据源");
    for (const src of apiSources) {
      const cfg = src.apiConfig!;
      const headersStr = cfg.headers ? JSON.stringify(cfg.headers) : "null";
      const bodyStr = cfg.body ? JSON.stringify(cfg.body) : "undefined";
      const dataPath = cfg.dataPath ?? "";
      const authVal = cfg.authEnabled === null ? "null" : String(cfg.authEnabled);
      lines.push(
        `  var __data_${safeId(src.id)} = null;`,
        `  function fetch_${safeId(src.id)}() {`,
        `    var fullUrl = __wc_buildUrl(${JSON.stringify(cfg.url)}, ${JSON.stringify(cfg.path)});`,
        `    if (!fullUrl) { console.warn('[web-craft] No URL for ${src.id}'); return; }`,
        `    var headers = __wc_buildHeaders(${headersStr}, ${authVal});`,
        `    fetch(fullUrl, {`,
        `      method: '${cfg.method}',`,
        `      headers: headers,`,
        `      body: ${cfg.method === "POST" ? bodyStr : "undefined"},`,
        `    })`,
        `      .then(function(res) { return res.json(); })`,
        `      .then(function(data) {`,
        dataPath
          ? `        var extracted = getField(data, ${JSON.stringify(dataPath)});`
          : `        var extracted = data;`,
        `        __data_${safeId(src.id)} = extracted;`,
        `        __applyBindingsForSource('${src.id}');`,
        `      })`,
        `      .catch(function(err) { console.warn('[web-craft] Fetch ${src.id} failed:', err); });`,
        `  }`,
        `  // 暴露到 window，供事件层 callApi 的 refreshSourceIds 触发重拉`,
        `  window['wc_refresh_${safeId(src.id)}'] = function() { fetch_${safeId(src.id)}(); };`,
      );
    }
    lines.push("");
  }

  // WebSocket 数据源
  const wsSources = sources.filter((s) => s.type === "websocket");
  if (wsSources.length > 0) {
    lines.push("  // WebSocket 数据源");
    for (const src of wsSources) {
      const cfg = src.wsConfig!;
      lines.push(
        `  var __data_${safeId(src.id)} = null;`,
        `  function connect_${safeId(src.id)}() {`,
        `    var ws = new WebSocket('${cfg.url}');`,
        `    ws.onmessage = function(event) {`,
        `      try { __data_${safeId(src.id)} = JSON.parse(event.data); }`,
        `      catch(e) { __data_${safeId(src.id)} = event.data; }`,
        `      __applyBindingsForSource('${src.id}');`,
        `    };`,
        `    ws.onerror = function(err) { console.warn('[web-craft] WS ${src.id} error:', err); };`,
        `  }`,
      );
    }
    lines.push("");
  }

  // 按 sourceId 分组绑定
  const bindingsBySource = new Map<string, BindingWithContext[]>();
  for (const bwc of bindings) {
    const arr = bindingsBySource.get(bwc.binding.sourceId) ?? [];
    arr.push(bwc);
    bindingsBySource.set(bwc.binding.sourceId, arr);
  }

  // 生成按数据源应用的绑定函数
  lines.push("  // 按数据源应用绑定");
  lines.push("  function __applyBindingsForSource(sourceId) {");
  for (const [sourceId, bwcList] of bindingsBySource) {
    lines.push(`    if (sourceId === '${sourceId}') {`);
    for (const bwc of bwcList) {
      const sourceVar = `__data_${safeId(bwc.binding.sourceId)}`;
      const transformStr = bwc.binding.transform
        ? JSON.stringify(bwc.binding.transform)
        : "null";
      lines.push(
        `      var value = getField(${sourceVar}, '${bwc.binding.field}');`,
        `      applyBinding('${bwc.componentId}', { type: '${bwc.binding.type}', targetProperty: '${bwc.binding.targetProperty}', transform: ${transformStr} }, value);`,
      );
    }
    lines.push(`    }`);
  }
  lines.push("  }");
  lines.push("");

  // 初始化
  lines.push("  // 初始化");
  lines.push("  onReady(function() {");

  // 静态数据立即应用
  for (const src of staticSources) {
    lines.push(`    __applyBindingsForSource('${src.id}');`);
  }

  // API 轮询
  for (const src of apiSources) {
    lines.push(`    fetch_${safeId(src.id)}();`);
    const interval = src.apiConfig!.refreshInterval;
    if (interval && interval > 0) {
      lines.push(`    setInterval(fetch_${safeId(src.id)}, ${interval});`);
    }
  }

  // WebSocket
  for (const src of wsSources) {
    lines.push(`    connect_${safeId(src.id)}();`);
  }

  lines.push("  });");

  return lines.join("\n");
}

/**
 * 将 ID 转为安全的变量名后缀
 */
function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, "_");
}
