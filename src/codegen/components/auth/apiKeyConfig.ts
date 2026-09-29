import type { ComponentCodegenFn } from "../../types";
import { escapeHTML } from "../../layout";

/**
 * auth-api-key-config 组件 → HTML
 *
 * 配置：headerName, position(header/query), placeholder, buttonText, bgColor, textColor,
 *        borderColor, borderRadius, fontSize, redirectOnSuccess
 */
/**
 * api-key-config 组件 → HTML (v2)
 *
 * v2 改造：
 * - P0-1: escapeHTML(JSON.stringify(value)) 双重防注入 headerName/position 等所有配置值
 * - P1-1: tokenKey/tokenStorage 配置驱动，不再硬编码 __webcraft_api_key
 * - P1-2: 按钮颜色由 buttonBgColor/buttonTextColor 配置驱动
 * - P1-3: variant 支持 contained/outlined/text
 * - P1-4: loading 状态
 * - P1-5: borderRadius 用 || 而非 ??
 * - P1-8: redirectOnSuccess/redirectDelay 登录后跳转
 * - P2-1: 密码可见性切换（showPasswordToggle 配置驱动）
 * - auth-state-change 事件闭环
 * - 三层字段名与 defaultConfig 严格一致
 */
export const apiKeyConfigCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config;

  // ─── 配置取值（字符串用 || 穿透空字符串，数值用 || 穿透 0） ───
  const headerName = String(c.headerName || "X-API-Key");
  const position = String(c.position || "header");
  const placeholder = String(c.placeholder || "输入 API Key");
  const buttonText = String(c.buttonText || "保存");
  const tokenKey = String(c.tokenKey || "auth_token");
  const tokenStorage = String(c.tokenStorage || "localStorage");
  const redirectOnSuccess = String(c.redirectOnSuccess || "");
  const redirectDelay = Number(c.redirectDelay || 1500);
  const bgColor = String(c.bgColor || "#ffffff");
  const textColor = String(c.textColor || "#333333");
  const borderColor = String(c.borderColor || "#d0d0d8");
  const buttonBgColor = String(c.buttonBgColor || "#1976d2");
  const buttonTextColor = String(c.buttonTextColor || "#ffffff");
  const variant = String(c.variant || "contained");
  const fontSize = Number(c.fontSize || 14);
  const borderRadius = Number(c.borderRadius || 8);
  const fullWidth = c.fullWidth !== false;
  const showPasswordToggle = c.showPasswordToggle !== false;

  // ─── 防注入：所有配置值用 escapeHTML(JSON.stringify(value)) 双重防护 ───
  const safeHeaderName = escapeHTML(JSON.stringify(headerName));
  const safePosition = escapeHTML(JSON.stringify(position));
  const safeTokenKey = escapeHTML(JSON.stringify(tokenKey));
  const safeTokenStorage = escapeHTML(JSON.stringify(tokenStorage));
  const safeRedirectOnSuccess = escapeHTML(JSON.stringify(redirectOnSuccess));
  const safeRedirectDelay = escapeHTML(JSON.stringify(String(redirectDelay)));
  const safeShowPasswordToggle = escapeHTML(JSON.stringify(String(showPasswordToggle)));

  const wrapperId = `apikey-config-${component.id}`;

  // ─── 按钮样式按 variant 分支 ───
  let btnStyle: string;
  if (variant === "outlined") {
    btnStyle = `padding:8px 16px;border:1px solid ${buttonBgColor};border-radius:${borderRadius}px;background:transparent;color:${buttonBgColor};font-size:${fontSize}px;cursor:pointer;white-space:nowrap`;
  } else if (variant === "text") {
    btnStyle = `padding:8px 16px;border:none;border-radius:${borderRadius}px;background:transparent;color:${buttonBgColor};font-size:${fontSize}px;cursor:pointer;white-space:nowrap`;
  } else {
    btnStyle = `padding:8px 16px;border:none;border-radius:${borderRadius}px;background:${buttonBgColor};color:${buttonTextColor};font-size:${fontSize}px;cursor:pointer;white-space:nowrap`;
  }

  // ─── input flex ───
  const inputFlex = fullWidth ? "flex:1;min-width:0" : "flex:none;min-width:120px";

  let html = `<div id="${wrapperId}" style="width:100%;height:100%;display:flex;align-items:center;gap:8px;background:${bgColor};color:${textColor};padding:8px;box-sizing:border-box;overflow:hidden">`;
  html += `<input type="password" id="${wrapperId}-input" placeholder="${escapeHTML(placeholder)}" style="${inputFlex};padding:8px 12px;border:1px solid ${borderColor};border-radius:${borderRadius}px;font-size:${fontSize}px;outline:none;background:${bgColor};color:${textColor}" />`;

  // 密码可见性切换图标（与 LoginForm 一致的 Lucide 风格 SVG）
  if (showPasswordToggle) {
    const eyeOn = `<svg xmlns="http://www.w3.org/2000/svg" width="${fontSize + 4}" height="${fontSize + 4}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
    const eyeOff = `<svg xmlns="http://www.w3.org/2000/svg" width="${fontSize + 4}" height="${fontSize + 4}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><path d="M2 2l20 20"/></svg>`;
    html += `<span id="${wrapperId}-toggle" data-eye-on='${eyeOn}' data-eye-off='${eyeOff}' style="cursor:pointer;user-select:none;display:flex;align-items:center;justify-content:center;color:${borderColor};padding:0 4px;flex-shrink:0">${eyeOn}</span>`;
  }

  html += `<button id="${wrapperId}-btn" style="${btnStyle};flex-shrink:0;min-width:auto">${escapeHTML(buttonText)}</button>`;
  html += `<span id="${wrapperId}-msg" style="font-size:${Math.max(fontSize - 2, 10)}px;display:none"></span>`;
  html += `</div>`;

  const apiKeyScript = `
(function() {
  var input = document.getElementById("${wrapperId}-input");
  var btn = document.getElementById("${wrapperId}-btn");
  var msg = document.getElementById("${wrapperId}-msg");
  var toggle = document.getElementById("${wrapperId}-toggle");

  var headerName = JSON.parse(${safeHeaderName});
  var position = JSON.parse(${safePosition});
  var tokenKey = window.__WC_TOKEN_KEY || JSON.parse(${safeTokenKey});
  var tokenStorage = window.__WC_TOKEN_STORAGE || JSON.parse(${safeTokenStorage});
  var redirectOnSuccess = JSON.parse(${safeRedirectOnSuccess});
  var redirectDelay = parseInt(JSON.parse(${safeRedirectDelay}), 10) || 1500;
  var showPasswordToggle = JSON.parse(${safeShowPasswordToggle}) === "true" || JSON.parse(${safeShowPasswordToggle}) === true;

  var memoryCache = window.__webcraft_memory_cache = window.__webcraft_memory_cache || {};
  function getStorage() {
    if (tokenStorage === "sessionStorage") {
      try { return sessionStorage; } catch(e) { return null; }
    }
    if (tokenStorage === "memory") return null;
    try { return localStorage; } catch(e) { return null; }
  }
  function setCachedValue(key, value) {
    memoryCache[key] = value;
    var storage = getStorage();
    if (storage) { try { storage.setItem(key, value); } catch(e) {} }
  }
  function getCachedValue(key) {
    if (memoryCache[key] !== undefined) return memoryCache[key];
    var storage = getStorage();
    if (storage) { try { var val = storage.getItem(key); if (val !== null) memoryCache[key] = val; return val; } catch(e) { return null; } }
    return null;
  }

  // 密码可见性切换
  if (toggle && showPasswordToggle) {
    toggle.addEventListener("click", function() {
      if (input.type === "password") {
        input.type = "text";
        toggle.innerHTML = toggle.getAttribute("data-eye-off");
      } else {
        input.type = "password";
        toggle.innerHTML = toggle.getAttribute("data-eye-on");
      }
    });
  }

  function showMsg(text, isError) {
    if (!msg) return;
    msg.textContent = text;
    msg.style.color = isError ? "#d32f2f" : "#388e3c";
    msg.style.display = "inline";
    setTimeout(function() { msg.style.display = "none"; }, 2000);
  }

  btn.addEventListener("click", function() {
    var apiKey = input.value;
    if (!apiKey) {
      showMsg("请输入 API Key", true);
      return;
    }

    var origText = btn.textContent;
    btn.textContent = "...";
    btn.disabled = true;

    try {
      setCachedValue(tokenKey, apiKey);
      setCachedValue("__webcraft_api_key_header", headerName);
      setCachedValue("__webcraft_api_key_position", position);
      setCachedValue("__webcraft_auth_mode", "api-key");
      setCachedValue("__webcraft_auth_authenticated", "true");

      window.dispatchEvent(new CustomEvent("auth-state-change", {
        detail: {
          token: apiKey,
          isAuthenticated: true,
          authMode: "api-key"
        }
      }));

      showMsg("API Key 保存成功", false);
      btn.textContent = origText;
      btn.disabled = false;

      if (redirectOnSuccess) {
        setTimeout(function() {
          window.location.href = redirectOnSuccess;
        }, redirectDelay);
      }
    } catch(e) {
      showMsg(String(e && e.message || e), true);
      btn.textContent = origText;
      btn.disabled = false;
    }
  });
})();
`;

  ctx.pageScripts.push(apiKeyScript);

  return html;
};
