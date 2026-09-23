/**
 * 统一的"数据加载脚本"生成器（发布端 codegen 用）。
 *
 * 编辑器渲染器走 React 的 useApiDataFetch；发布端是静态 HTML，必须生成一段内嵌脚本
 * 在浏览器里 fetch 后动态重渲染。本模块抽取 fetch 的公共骨架（URL 拼接、认证注入、
 * 请求头、路径取值、轮询），供各组件 codegen 复用，避免各处复制大段 JS。
 *
 * 两种使用方式：
 *  - dataLoaderScript()：标准场景 —— 立即执行 + 轮询，数据到达后执行 renderBody（作用域：data、el、escapeHtml）
 *  - dataFetchParts()：需要自定义渲染时机/调度时机的组件（如 echarts 需等图表库
 *    加载完成后再取数）—— 返回 vars/helpers/doFetch 三段源码，由调用方自行组装与调度
 *
 * 约定：生成的 JS 不含反引号与 ${ 字面量（可安全内嵌到外层模板字符串）。
 */

import { readAuthEnabled } from "../editor/data/authMode";

export interface DataLoaderOptions {
  /** 一段 JS 语句，用来获取要填充的容器元素，且该元素变量名必须是 el */
  container: string;
  apiUrl: string;
  apiPath?: string;
  apiMethod: string;
  apiHeaders?: string;
  /** POST/PUT/PATCH 请求体（JSON 字符串，按原文发送并自动补 Content-Type） */
  apiBody?: string;
  apiInterval: number;
  apiDataPath: string;
  authEnabled?: boolean | null;
  /** 渲染函数体（不含 function 包装、不含括号）。作用域：data、el、escapeHtml */
  renderBody: string;
  /** fetch 前执行的 JS 语句（如显示"加载中"），作用域：el */
  onFetchStart?: string;
  /** 响应非 ok / JSON 为空时执行的 JS 语句，作用域：el */
  onFetchFail?: string;
  /** 网络错误 / 解析异常时执行的 JS 语句，作用域：el */
  onFetchError?: string;
}

/** API 配置变量声明（apiUrl/apiPath/apiMethod/…/authEnabled/apiInterval） */
function apiConfigVars(o: {
  apiUrl: string;
  apiPath?: string;
  apiMethod: string;
  apiHeaders?: string;
  apiBody?: string;
  apiInterval: number;
  apiDataPath: string;
  authEnabled?: boolean | null;
}): string {
  // 统一口径解析（历史配置里可能残留字符串 "true"/"false"，见 editor/data/fieldSelect.ts），
  // 再字面量化成 JS 布尔/ null —— 生成的运行时里只认真布尔，避免"编辑区当真值、发布端不认"的分叉。
  const authTri = readAuthEnabled(o.authEnabled);
  const authLiteral = authTri === null ? "null" : String(authTri);
  const apiInterval = Number(o.apiInterval) || 0;
  return `  var apiUrl = ${JSON.stringify(o.apiUrl)};
  var apiPath = ${JSON.stringify(o.apiPath ?? "")};
  var apiMethod = ${JSON.stringify(o.apiMethod)};
  var apiDataPath = ${JSON.stringify(o.apiDataPath)};
  var apiHeadersRaw = ${JSON.stringify(o.apiHeaders ?? "")};
  var apiBodyRaw = ${JSON.stringify(o.apiBody ?? "")};
  var authEnabled = ${authLiteral};
  var apiInterval = ${apiInterval};`;
}

/** 共享工具函数（getNestedValue/buildFetchUrl/buildFetchHeaders/escapeHtml） */
function apiFetchHelpers(): string {
  return `  function getNestedValue(obj, path) {
    if (!path || !obj) return obj;
    var parts = path.split(".");
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function buildFetchUrl() {
    var baseUrl = window.__WC_API_BASE || "";
    if (apiUrl && /^https?:\\/\\//i.test(apiUrl)) return apiUrl;
    if (apiUrl) return baseUrl ? baseUrl.replace(/\\/+$/, "") + (apiUrl.charAt(0) === "/" ? apiUrl : "/" + apiUrl) : apiUrl;
    if (apiPath) return baseUrl ? baseUrl.replace(/\\/+$/, "") + (apiPath.charAt(0) === "/" ? apiPath : "/" + apiPath) : apiPath;
    return baseUrl;
  }

  function buildFetchHeaders() {
    var headers = {};
    var defaultHeaders = window.__WC_DEFAULT_HEADERS || {};
    for (var k in defaultHeaders) { headers[k] = defaultHeaders[k]; }
    if (apiHeadersRaw) {
      try {
        var extra = JSON.parse(apiHeadersRaw);
        for (var k2 in extra) { headers[k2] = extra[k2]; }
      } catch(e) {}
    }
    var useAuth = authEnabled === null ? (window.__WC_AUTH_ENABLED || false) : authEnabled === true;
    if (useAuth) {
      var storage = window.__WC_TOKEN_STORAGE || "localStorage";
      var key = window.__WC_TOKEN_KEY || "auth_token";
      var hdr = window.__WC_TOKEN_HEADER || "Authorization";
      var prefix = window.__WC_TOKEN_PREFIX !== undefined ? window.__WC_TOKEN_PREFIX : "Bearer ";
      var token = null;
      if (storage === "localStorage") { try { token = localStorage.getItem(key); } catch(e) {} }
      else if (storage === "sessionStorage") { try { token = sessionStorage.getItem(key); } catch(e) {} }
      else if (storage === "memory") { token = (window.__webcraft_memory_cache || {})[key]; }
      if (token) headers[hdr] = prefix + token;
    }
    return headers;
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\\"/g,"&quot;");
  }`;
}

/** doFetch 函数体（onData 为数据到达后的语句，作用域：data） */
function apiDoFetch(o: {
  onFetchStart?: string;
  onData: string;
  onFetchFail?: string;
  onFetchError?: string;
}): string {
  return `  function doFetch() {
    // 站点静态模式守卫：不发起任何动态接口请求（纯净静态产物可离线）
    if ((window.__WC_SITE_MODE || "auto") === "static") { return; }
    var fullUrl = buildFetchUrl();
    if (!fullUrl) return;
    ${o.onFetchStart ?? ""}
    var headers = buildFetchHeaders();
    var body = null;
    if (apiBodyRaw && apiMethod !== "GET" && apiMethod !== "HEAD") {
      body = apiBodyRaw;
      if (headers["Content-Type"] === undefined) headers["Content-Type"] = "application/json";
    }
    fetch(fullUrl, { method: apiMethod, headers: headers, body: (apiMethod === "GET" || apiMethod === "HEAD") ? undefined : body })
      .then(function(res) { if (!res.ok) return null; return res.json(); })
      .then(function(json) {
        if (json == null) { ${o.onFetchFail ?? ""} return; }
        var data = apiDataPath ? getNestedValue(json, apiDataPath) : json;
        if (data != null) { ${o.onData} }
      })
      .catch(function(e) { ${o.onFetchError ?? ""} });
  }`;
}

export function dataLoaderScript(o: DataLoaderOptions): string {
  return `<script>
(function(){
  ${o.container}
  if (!el) return;
${apiConfigVars(o)}
${apiFetchHelpers()}

  function render(data) {
    ${o.renderBody}
  }

${apiDoFetch({ onFetchStart: o.onFetchStart, onData: "render(data);", onFetchFail: o.onFetchFail, onFetchError: o.onFetchError })}

  doFetch();
  if (apiInterval > 0) {
    setInterval(doFetch, apiInterval * 1000);
  }
  // 登录/登出后认证态变化 → 立即重取（先渲染后登录的页面也能带上 Token）
  window.addEventListener("auth-state-change", function() { doFetch(); });
})();
</script>`;
}

export interface DataFetchPartsOptions {
  apiUrl: string;
  apiPath?: string;
  apiMethod: string;
  apiHeaders?: string;
  apiBody?: string;
  apiInterval: number;
  apiDataPath: string;
  authEnabled?: boolean | null;
  /** 数据到达后的语句体（作用域：data；可调用调用方自己的渲染函数） */
  onData: string;
}

/**
 * 统一取数骨架的部件版：供需要自定义渲染/调度时机的组件（如 echarts）复用，
 * 与 dataLoaderScript 输出完全同源（同一份 URL/认证/请求头/请求体逻辑）。
 * 调用方负责自行调用 doFetch() 与轮询调度。
 */
export function dataFetchParts(o: DataFetchPartsOptions): {
  vars: string;
  helpers: string;
  doFetch: string;
} {
  return {
    vars: apiConfigVars(o),
    helpers: apiFetchHelpers(),
    doFetch: apiDoFetch({ onData: o.onData }),
  };
}

export interface BindVisibilityOptions {
  /** 获取宿主元素的 JS 语句（赋值给变量 host），如 var host = document.getElementById("x") */
  hostExpr: string;
  /** loaded：接口成功返回即隐藏；empty：按判空规则显隐 */
  mode: "loaded" | "empty";
  bindUrl: string;
  bindMethod: string;
  bindHeaders?: string;
  bindBody?: string;
  bindInterval: number;
  bindAuthEnabled?: boolean | null;
  /** empty 模式专用 */
  bindDataPath?: string;
  emptyWhen?: string;
  showWhenEmpty?: boolean;
  hideOnError: boolean;
}

/**
 * 数据感知显隐脚本（骨架屏 / 加载动画 / 空态占位共用）：
 * 轮询探测接口并切换 host.style.display。取数逻辑与 dataLoaderScript 同源
 * （URL 拼接 / 全局默认请求头 / 认证注入 / POST 请求体 / 数据路径取值）。
 * 失败（非 2xx / 网络错误 / 解析失败）时按 hideOnError 决定显隐。
 */
export function bindVisibilityScript(o: BindVisibilityOptions): string {
  const onData = o.mode === "loaded" ? 'host.style.display="none";' : "applyEmpty(data);";
  const emptyFn = o.mode === "loaded" ? "" : `  function isEmpty(v,m){if(m==="emptyArray")return Array.isArray(v)&&v.length===0;if(m==="zero")return Number(v)===0;if(m==="falsy")return !v;if(v===undefined||v===null||v==="")return true;if(Array.isArray(v))return v.length===0;if(typeof v==="object")return Object.keys(v).length===0;return false;}
  function applyEmpty(v){var e=isEmpty(v,${JSON.stringify(o.emptyWhen ?? "emptyValue")});host.style.display=(e===${String(o.showWhenEmpty ?? true)})?"":"none";}`;
  const onFail = `host.style.display=${o.hideOnError ? '"none"' : '""'};`;
  return `<script>
(function(){
  ${o.hostExpr}
  if (!host) return;
${apiConfigVars({
    apiUrl: o.bindUrl,
    apiMethod: o.bindMethod,
    apiHeaders: o.bindHeaders,
    apiBody: o.bindBody,
    apiInterval: o.bindInterval,
    apiDataPath: o.bindDataPath ?? "",
    authEnabled: o.bindAuthEnabled,
  })}
${apiFetchHelpers()}
${emptyFn}
${apiDoFetch({ onData, onFetchFail: onFail, onFetchError: onFail })}
  doFetch();
  if (apiInterval > 0) {
    setInterval(doFetch, apiInterval * 1000);
  }
  // 登录/登出后认证态变化 → 立即重新探测
  window.addEventListener("auth-state-change", function() { doFetch(); });
})();
</script>`;
}
