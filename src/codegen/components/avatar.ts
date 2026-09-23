import type { ComponentCodegenFn } from "../types";
import { escapeHTML } from "../layout";
import { readAuthEnabled } from "../../editor/data/authMode";

/**
 * avatar 组件 -> HTML (v1.2 — 无侵入式数据源)
 *
 * 语义（与 AvatarRenderer 严格一致）：
 * - sourceMode:
 *   direct → 静态渲染远程图片链接（src），无图时 name 首字母 → PersonIcon
 *   api    → 内联 fetch 动态请求 API：
 *             - apiUrl 完整地址直连 / 相对路径拼 window.__WC_API_BASE
 *             - authEnabled 开启时自动携带认证 Token（__wc_getToken 同规则）
 *             - 按 apiDataPath 定位响应对象
 *             - 勾选 avatarField（图片字段）/ nameField（名称字段）映射渲染
 * - 兼容：
 *   - v1.1 bindMode="user"（读登录缓存 "user" 键）→ api 模式，apiUrl 为空时回退读缓存
 *   - v1.0 text 字段 → name 回退；showBadge → badgeMode 映射
 * - 徽章：badgeMode none / static / auth（登录态灰色→彩色）
 * - 尺寸：sizeMode fill = 跟随组件容器；fixed = 固定像素
 * - 监听 auth-state-change / webcraft-token-refreshed 自动刷新
 */
export const avatarCodegen: ComponentCodegenFn = (component) => {
  const c = component.config;
  const uid = `avt-${Math.random().toString(36).slice(2, 9)}`;

  // ── 数据源解析（含旧配置兼容） ──
  const sourceMode =
    String(c.sourceMode ?? "") || (c.bindMode === "user" ? "api" : "direct");
  const isApi = sourceMode === "api";
  const apiUrl = String(c.apiUrl ?? "");
  const hasApiUrl = !!apiUrl;
  // 旧 v1.1 bindMode=user：无 API 地址时回退读登录缓存
  const fallbackToCache = isApi && !hasApiUrl;
  const apiMethod = String(c.apiMethod ?? "GET") || "GET";
  const apiDataPath = String(c.apiDataPath ?? "");
  const authEnabled = readAuthEnabled(c.authEnabled);
  const avatarField = String(c.avatarField ?? "avatar");
  const nameField = String(c.nameField ?? "name");
  // 认证 token 配置（全局优先，组件级回退，兼容 v1.1）
  const tokenKey = String(c.tokenKey ?? "auth_token");
  const tokenStorage = String(c.tokenStorage ?? "localStorage");

  const src = String(c.src ?? "");
  const alt = String(c.alt ?? "");
  const staticName = String(c.name ?? c.text ?? "");
  const fixedSize = Number(c.size ?? 48);
  const sizeMode = String(c.sizeMode ?? "fill");
  const shape = String(c.shape ?? "circle");
  const bgColor = String(c.bgColor ?? "rgba(255,152,0,0.15)");
  const textColor = String(c.textColor ?? "#FF9800");
  const fontSize = Number(c.fontSize ?? 18);
  const fontWeight = String(c.fontWeight ?? "600");
  const borderEnabled = c.borderEnabled === true;
  const borderColor = String(c.borderColor ?? "rgba(255,255,255,0.2)");
  const borderWidth = Number(c.borderWidth ?? 2);
  const objectFit = String(c.objectFit ?? "cover");

  const badgeMode = String(c.badgeMode ?? (c.showBadge === true ? "static" : "none"));
  const badgeColor = String(c.badgeColor ?? "#4CAF50");
  const badgeSize = Number(c.badgeSize ?? 12);
  const badgePosition = String(c.badgePosition ?? "bottom-right");

  // 圆角百分比（与 renderer 一致，尺寸无关）
  const radius = shape === "circle" ? "50%" : shape === "rounded" ? "22%" : "12%";

  // 头像尺寸：fill 跟随容器 / fixed 固定像素
  const avatarSizeStyle = sizeMode === "fixed"
    ? `width:${fixedSize}px;height:${fixedSize}px;`
    : "width:100%;height:100%;max-width:100%;max-height:100%;min-width:0;min-height:0;";

  // PersonIcon 占位（SVG，与 MUI PersonIcon 同轮廓）
  const personIconSvg =
    '<svg viewBox="0 0 24 24" style="width:1em;height:1em;flex-shrink:0" fill="currentColor" aria-hidden="true">' +
    '<path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';

  // getNested：支持 a.b 与 a[0].b（与 auth.ts 内联实现同规则）
  const getNestedJs = `
  function __wcGetNested(obj, path) {
    if (!obj || !path) return undefined;
    var keys = path.replace(/\\[(\\d+)\\]/g, ".$1").split(".");
    var cur = obj;
    for (var i = 0; i < keys.length; i++) {
      if (cur === null || cur === undefined) return undefined;
      cur = cur[keys[i]];
    }
    return cur;
  }`;

  // ─── 静态渲染（服务端生成，JS 仅在 api 模式运行时覆写） ───
  const showStaticImage = !isApi && !!src;
  const initials = staticName ? String(staticName).charAt(0).toUpperCase() : "";
  const showPlaceholder = !initials;

  let inner = "";
  // 占位基础层（字母首字 / Person 图标），默认始终可见 —— 保证任何时候都不空圆
  if (showPlaceholder) {
    inner += `<span data-avatar-icon style="display:flex;align-items:center;justify-content:center;font-size:${fontSize}px;color:inherit;flex-shrink:0">${personIconSvg}</span>`;
  } else {
    inner += `<span data-avatar-fallback style="display:flex;font-size:${fontSize}px;font-weight:${fontWeight};line-height:1;user-select:none;color:inherit">${escapeHTML(initials)}</span>`;
  }
  // 图片覆盖层：始终生成。静态直接模式带 src 并显示；api 模式 src 为空，由运行时填入
  // 安全守卫：
  //  - onload 仅在「src 非空且确实加载成功」时才隐藏占位（避免空 <img> 误触 onload 把占位清掉）
  //  - onerror 失败时先隐藏图片，再把占位显式恢复可见 —— 保证任何时刻都不空圆
  inner += `<img data-avatar-img src="${showStaticImage ? escapeHTML(src) : ""}" alt="${escapeHTML(alt)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:${objectFit};border-radius:${radius};display:${showStaticImage ? "block" : "none"}" onload="if(!this.getAttribute('src'))return;var p=this.parentElement,q=p.querySelector('[data-avatar-fallback]'),i=p.querySelector('[data-avatar-icon]');if(q)q.style.display='none';if(i)i.style.display='none';" onerror="this.style.display='none';var p2=this.parentElement,q2=p2.querySelector('[data-avatar-fallback]'),i2=p2.querySelector('[data-avatar-icon]');if(q2){q2.style.display='flex';}if(i2){i2.style.display='flex';}" />`;

  const badgeIsNone = badgeMode === "none";
  const badgePosStyle: Record<string, string> = {
    "top-right": "top:0;right:0;transform:translate(30%, -30%)",
    "top-left": "top:0;left:0;transform:translate(-30%, -30%)",
    "bottom-right": "bottom:0;right:0;transform:translate(30%, 30%)",
    "bottom-left": "bottom:0;left:0;transform:translate(-30%, 30%)",
  };
  const badgePos = badgePosStyle[badgePosition] || badgePosStyle["bottom-right"];
  const badgeStaticColor = badgeMode === "auth" ? "rgba(255,255,255,0.35)" : badgeColor;

  let html = `<div id="${uid}" style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;position:relative">`;
  html += `<div data-avatar-box style="${avatarSizeStyle}position:relative;box-sizing:border-box;border-radius:${radius};background:${bgColor};color:${textColor};display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;border:${borderEnabled ? `${borderWidth}px solid ${borderColor}` : "none"}">${inner}</div>`;

  if (!badgeIsNone) {
    html += `<div data-avatar-badge style="position:absolute;width:${badgeSize}px;height:${badgeSize}px;border-radius:50%;background:${badgeStaticColor};border:2px solid rgba(0,0,0,0.3);box-sizing:border-box;${badgePos}"></div>`;
  }

  html += `</div>`;

  // ─── api 模式运行时注入：fetch / 读缓存 → 字段映射 → 覆写 ───
  let script = "";
  if (isApi) {
    script = `
<script>
(function() {
  var container = document.getElementById("${uid}");
  if (!container) return;

  var API_URL = ${JSON.stringify(apiUrl)};
  var API_METHOD = ${JSON.stringify(apiMethod)};
  var API_DATA_PATH = ${JSON.stringify(apiDataPath)};
  var AVATAR_FIELD = ${JSON.stringify(avatarField)};
  var NAME_FIELD = ${JSON.stringify(nameField)};
  var USE_AUTH = ${authEnabled};
  var CACHE_MODE = ${fallbackToCache};
  var TOKEN_KEY = window.__WC_TOKEN_KEY || ${JSON.stringify(tokenKey)};
  var TOKEN_STORAGE = window.__WC_TOKEN_STORAGE || ${JSON.stringify(tokenStorage)};
  var OFF_COLOR = ${JSON.stringify(badgeStaticColor)};
  var ON_COLOR = ${JSON.stringify(badgeColor)};
  var IS_AUTH_MODE = ${badgeMode === "auth"};
  var FALLBACK_FONT_SIZE = ${fontSize};
  var FALLBACK_WEIGHT = ${JSON.stringify(fontWeight)};

  function getStorage() {
    if (TOKEN_STORAGE === "localStorage") return window.localStorage;
    if (TOKEN_STORAGE === "sessionStorage") return window.sessionStorage;
    if (TOKEN_STORAGE === "memory") return (window.__webcraft_memory_cache || {});
    return window.localStorage;
  }

  function readUserCache() {
    try {
      var storage = getStorage();
      var raw = storage.getItem("user");
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  function hasToken() {
    try {
      var storage = getStorage();
      return !!storage.getItem(TOKEN_KEY);
    } catch (e) { return false; }
  }

  // 认证头（与 __wc_getToken 同规则：全局配置优先）
  function buildAuthHeaders() {
    if (!USE_AUTH) return {};
    var storage = window.__WC_TOKEN_STORAGE || ${JSON.stringify(tokenStorage)};
    var key = window.__WC_TOKEN_KEY || ${JSON.stringify(tokenKey)};
    var header = window.__WC_TOKEN_HEADER || "Authorization";
    var prefix = window.__WC_TOKEN_PREFIX !== undefined ? window.__WC_TOKEN_PREFIX : "Bearer ";
    var token = null;
    if (storage === "localStorage") { try { token = localStorage.getItem(key); } catch(e) {} }
    else if (storage === "sessionStorage") { try { token = sessionStorage.getItem(key); } catch(e) {} }
    else if (storage === "memory") { token = (window.__webcraft_memory_cache || {})[key]; }
    var out = {};
    if (token) out[header] = prefix + token;
    return out;
  }

  // 完整地址直连 / 相对路径拼全局 baseUrl（与 __wc_buildUrl 同规则）
  function buildUrl() {
    if (!API_URL) return "";
    if (/^https?:\\/\\//i.test(API_URL)) return API_URL;
    var base = window.__WC_API_BASE || "";
    if (!base) return API_URL;
    return base.replace(/\\/+$/, "") + (API_URL.charAt(0) === "/" ? API_URL : "/" + API_URL);
  }

  ${getNestedJs}

  // 将解析出的 url/name 渲染到头像（共享 paint 核心）
  // 占位默认可见；图片在 onload 成功后才盖住占位，onerror 失败则隐藏图片保持占位可见
  function applyAvatar(url, nameVal) {
    var box = container.querySelector("[data-avatar-box]");
    if (!box) return;
    var img = box.querySelector("[data-avatar-img]");
    var fb = box.querySelector("[data-avatar-fallback]");
    var icon = box.querySelector("[data-avatar-icon]");
    var initial = nameVal ? String(nameVal).charAt(0).toUpperCase() : "";

    if (url) {
      if (img) { img.src = url; img.style.display = "block"; }
      // 不立即隐藏占位：待图片 onload 成功后才由 handler 隐藏
    } else if (initial) {
      if (img) img.style.display = "none";
      if (fb) { fb.style.display = "flex"; fb.textContent = initial; }
      if (icon) icon.style.display = "none";
    } else {
      if (img) img.style.display = "none";
      if (fb) fb.style.display = "none";
      if (icon) icon.style.display = "flex";
    }
  }

  function paintBadge() {
    var badge = container.querySelector("[data-avatar-badge]");
    if (!badge || !IS_AUTH_MODE) return;
    badge.style.background = hasToken() ? ON_COLOR : OFF_COLOR;
  }

  function paint() {
    paintBadge();
    if (CACHE_MODE) {
      // 旧 v1.1 bindMode=user：读登录缓存
      var user = readUserCache();
      var cUrl = user ? __wcGetNested(user, AVATAR_FIELD) : undefined;
      var cName = user ? __wcGetNested(user, NAME_FIELD) : undefined;
      if (!cName && user && user.username !== undefined) cName = user.username;
      if (!cName && user && user.name !== undefined) cName = user.name;
      applyAvatar(cUrl, cName);
      return;
    }
    var fullUrl = buildUrl();
    if (!fullUrl) return;
    var headers = {};
    headers["Content-Type"] = "application/json";
    var authHeaders = buildAuthHeaders();
    for (var k in authHeaders) { headers[k] = authHeaders[k]; }
    var init = { method: API_METHOD, headers: headers };
    fetch(fullUrl, init)
      .then(function(res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function(data) {
        var target = API_DATA_PATH ? __wcGetNested(data, API_DATA_PATH) : data;
        var url = target ? __wcGetNested(target, AVATAR_FIELD) : undefined;
        var nameVal = target ? __wcGetNested(target, NAME_FIELD) : undefined;
        if (!nameVal && target && target.username !== undefined) nameVal = target.username;
        if (!nameVal && target && target.name !== undefined) nameVal = target.name;
        applyAvatar(url, nameVal);
      })
      .catch(function(e) {
        // 请求失败：保留静态 fallback（name 首字母 / PersonIcon）
      });
  }

  paint();
  window.addEventListener("auth-state-change", paint);
  window.addEventListener("webcraft-token-refreshed", paint);
})();
</script>`;
  }

  return html + script;
};