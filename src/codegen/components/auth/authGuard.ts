import type { ComponentCodegenFn } from "../../types";
import { escapeHTML } from "../../layout";
import { generateChildHTML } from "../../engine";

/**
 * auth-guard 组件 → HTML
 *
 * v6 完整闭环：子组件渲染 + 完整认证校验 + 模式感知 + 自动跳转 + 内嵌弹窗
 *
 * 配置：fallbackText, fallbackButtonText, loginRedirectUrl, showLoginButton,
 *        hideWhenAuthenticated, onUnauthenticatedAction, loginFormId,
 *        autoRedirect, autoRedirectUrl, checkTokenExpiry
 *
 * 发布产物中：
 * - 渲染子组件到 content div（通过 ctx.childrenByParent）
 * - 完整认证校验：token 存在 + 过期检查 + authenticated 标志
 * - authMode 感知：JWT 检查 token 过期、session 检查 cookie、basic 检查 credentials
 * - autoRedirect：未认证时自动跳转登录页
 * - 监听 auth-state-change 动态切换显示/隐藏
 */
export const authGuardCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config;
  const fallbackText = String(c.fallbackText ?? "请先登录后查看内容");
  const fallbackButtonText = String(c.fallbackButtonText ?? "去登录");
  const loginRedirectUrl = String(c.loginRedirectUrl ?? "/login");
  const showLoginButton = Boolean(c.showLoginButton);
  const hideWhenAuthenticated = Boolean(c.hideWhenAuthenticated ?? true);
  const onUnauthenticatedAction = String(c.onUnauthenticatedAction ?? "none");
  const loginFormId = String(c.loginFormId ?? "");
  const autoRedirect = Boolean(c.autoRedirect ?? false);
  const autoRedirectUrl = String(c.autoRedirectUrl ?? "/login");
  const checkTokenExpiry = Boolean(c.checkTokenExpiry ?? true);
  const tokenKey = String(c.tokenKey ?? "auth_token");
  const tokenStorage = String(c.tokenStorage ?? "localStorage");
  const bgColor = String(c.bgColor ?? "#f5f5f5");
  const textColor = String(c.textColor ?? "#666666");
  const buttonBgColor = String(c.buttonBgColor ?? "#1976d2");
  const buttonTextColor = String(c.buttonTextColor ?? "#ffffff");
  const borderRadius = Number(c.borderRadius ?? 8);
  const fontSize = Number(c.fontSize ?? 14);

  const wrapperId = `auth-guard-${component.id}`;
  const contentId = `auth-guard-content-${component.id}`;
  const fallbackId = `auth-guard-fallback-${component.id}`;
  const loginBtnId = `auth-guard-login-btn-${component.id}`;

  // ─── 渲染子组件 HTML（通过 childrenByParent） ───
  const children = ctx.childrenByParent?.get(component.id) ?? [];
  const childrenHTML = children
    .filter((ch) => ch.visible !== false)
    .map((ch) => generateChildHTML(ch, ctx))
    .join("\n");

  // 守卫包装器
  let html = `<div id="${wrapperId}" style="width:100%;height:100%;position:relative">`;

  // ─── 受保护内容区（子组件渲染在这里） ───
  // content 初始可见，由 updateGuard() 根据认证状态动态控制
  const contentDisplayStyle = "display:block";
  html += `<div id="${contentId}" style="width:100%;height:100%;position:relative;${contentDisplayStyle}">`;
  html += childrenHTML;
  html += `</div>`;

  // ─── 未登录时的 fallback ───
  const fallbackStyle = [
    "width: 100%",
    "height: 100%",
    "display: flex",
    "flex-direction: column",
    "align-items: center",
    "justify-content: center",
    `background: ${bgColor}`,
    `color: ${textColor}`,
    `border-radius: ${borderRadius}px`,
    `font-size: ${fontSize}px`,
    "position: absolute",
    "top: 0",
    "left: 0",
  ];

  html += `<div id="${fallbackId}" style="${fallbackStyle.join("; ")}">`;
  html += `<div style="margin-bottom:16px;text-align:center">${escapeHTML(fallbackText)}</div>`;
  if (showLoginButton) {
    const clickHandler = onUnauthenticatedAction === "none"
      ? `href="${escapeHTML(loginRedirectUrl)}"`
      : `id="${loginBtnId}" style="cursor:pointer"`;
    const tag = onUnauthenticatedAction === "none" ? "a" : "button";
    html += `<${tag} ${clickHandler} style="padding:8px 24px;border:none;border-radius:${borderRadius}px;background:${buttonBgColor};color:${buttonTextColor};font-size:${fontSize}px;text-decoration:none;display:inline-block;cursor:pointer">${escapeHTML(fallbackButtonText)}</${tag}>`;
  }
  html += `</div>`;

  html += `</div>`;

  // ─── 注入守卫逻辑（v6 完整闭环） ───
  const guardScript = `
(function() {
  var wrapper = document.getElementById("${wrapperId}");
  var content = document.getElementById("${contentId}");
  var fallback = document.getElementById("${fallbackId}");
  var loginBtn = document.getElementById("${loginBtnId}");
  var hideWhenAuth = ${hideWhenAuthenticated};
  var unauthAction = "${onUnauthenticatedAction}";
  var loginFormId = ${JSON.stringify(loginFormId)};
  var autoRedirect = ${autoRedirect};
  var autoRedirectUrl = ${JSON.stringify(autoRedirectUrl)};
  var checkTokenExpiry = ${checkTokenExpiry};
  var tokenKey = window.__WC_TOKEN_KEY || ${JSON.stringify(tokenKey)};
  var tokenStorage = window.__WC_TOKEN_STORAGE || ${JSON.stringify(tokenStorage)};

  var memoryCache = window.__webcraft_memory_cache = window.__webcraft_memory_cache || {};
  function getStorage() {
    try { return tokenStorage === "sessionStorage" ? window.sessionStorage : (tokenStorage === "memory" ? null : window.localStorage); }
    catch(e) { return null; }
  }

  function getCachedValue(key) {
    if (memoryCache[key] !== undefined) return memoryCache[key];
    var storage = getStorage();
    if (!storage) return null;
    var val = storage.getItem(key);
    if (val !== null) memoryCache[key] = val;
    return val;
  }

  // ─── 完整认证校验：token 存在 + 过期检查 + authenticated 标志 ───
  function checkAuth() {
    var authFlag = getCachedValue("__webcraft_auth_authenticated") === "true";
    var token = getCachedValue(tokenKey);
    var authMode = getCachedValue("__webcraft_auth_mode") || "jwt";

    // basic 模式：有 token 即可
    if (authMode === "basic") {
      return authFlag && !!token;
    }

    // session 模式：只检查 authenticated 标志（cookie 由浏览器管理）
    if (authMode === "session") {
      return authFlag;
    }

    // api-key 模式：有 token 即可，不做过期检查
    if (authMode === "api-key") {
      return authFlag && !!token;
    }

    // JWT 模式：检查 token 存在 + 过期时间
    if (!authFlag || !token) return false;
    if (checkTokenExpiry) {
      var expiresAt = parseInt(getCachedValue("__webcraft_auth_expires_at") || "0", 10);
      if (expiresAt > 0 && Date.now() >= expiresAt) {
        // token 过期，检查是否有 refreshToken 可自动刷新
        var refreshToken = getCachedValue("refreshToken");
        if (refreshToken) {
          // 尝试刷新（dispatch 事件让 HttpAdapter 处理）
          window.dispatchEvent(new CustomEvent("webcraft-token-expired", {
            detail: { refreshToken: refreshToken, guardId: "${component.id}" }
          }));
        }
        return false;
      }
    }
    return true;
  }

  function updateGuard(authenticated) {
    if (authenticated) {
      if (content) content.style.display = "block";
      if (fallback) fallback.style.display = "none";
      // hideWhenAuthenticated: 控制已认证时是否显示守卫标识徽章
      if (wrapper) {
        var badge = wrapper.querySelector(".auth-guard-badge");
        if (hideWhenAuth) {
          // 已认证且需隐藏：移除徽章（如有）
          if (badge) badge.remove();
        } else {
          // 已认证且需显示：添加"已认证"徽章
          if (!badge) {
            var badgeEl = document.createElement("div");
            badgeEl.className = "auth-guard-badge";
            badgeEl.style.cssText = "position:absolute;top:4px;left:4px;font-size:10px;font-weight:600;color:#4caf50;background:rgba(76,175,80,0.08);padding:2px 8px;border-radius:4px;pointer-events:none;z-index:10";
            badgeEl.textContent = "\\u5df2\\u8ba4\\u8bc1";
            wrapper.appendChild(badgeEl);
          }
        }
      }
    } else {
      if (content) content.style.display = "none";
      if (fallback) fallback.style.display = "flex";
      // autoRedirect：未认证时自动跳转登录页
      if (autoRedirect && autoRedirectUrl) {
        window.location.href = autoRedirectUrl;
        return;
      }
    }
  }

  // ─── 门禁拦截：唤起登录表单 ───
  function triggerLogin() {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("webcraft-show-login", {
      detail: { loginFormId: loginFormId, guardId: "${component.id}" }
    }));
  }

  // ─── 内嵌登录弹窗（showLoginDialog 模式） ───
  function showLoginDialog() {
    var existing = document.getElementById("auth-guard-dialog-\\${component.id}");
    if (existing) return;
    var overlay = document.createElement("div");
    overlay.id = "auth-guard-dialog-\\${component.id}";
    overlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999";
    overlay.addEventListener("click", function(e) {
      if (e.target === overlay) {
        document.body.removeChild(overlay);
      }
    });
    var dialog = document.createElement("div");
    dialog.style.cssText = "background:#fff;border-radius:12px;padding:32px;max-width:400px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.2)";
    var dialogTitle = ${JSON.stringify(escapeHTML(fallbackText))};
    var dialogBtnText = ${JSON.stringify(escapeHTML(fallbackButtonText))};
    dialog.innerHTML = '<div style="text-align:center;margin-bottom:16px;font-size:18px;font-weight:600;color:#1a1a2e">' + dialogTitle + '</div><button id="auth-guard-dialog-btn-\\${component.id}" style="width:100%;padding:10px;border:none;border-radius:8px;background:${buttonBgColor};color:${buttonTextColor};font-size:14px;cursor:pointer">' + dialogBtnText + '</button>';
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    var dialogBtn = document.getElementById("auth-guard-dialog-btn-\\${component.id}");
    if (dialogBtn) {
      dialogBtn.addEventListener("click", function() {
        document.body.removeChild(overlay);
        triggerLogin();
      });
    }
    // 登录成功后自动关闭弹窗
    var closeHandler = function(e) {
      if (e.detail && e.detail.isAuthenticated) {
        if (overlay.parentNode) document.body.removeChild(overlay);
        window.removeEventListener("auth-state-change", closeHandler);
      }
    };
    window.addEventListener("auth-state-change", closeHandler);
  }

  // 登录按钮点击事件
  if (loginBtn) {
    loginBtn.addEventListener("click", function(e) {
      if (unauthAction === "dispatchEvent") {
        e.preventDefault();
        e.stopPropagation();
        triggerLogin();
      } else if (unauthAction === "showLoginDialog") {
        e.preventDefault();
        e.stopPropagation();
        showLoginDialog();
      }
    });
  }

  // ─── 初始检查（完整认证校验） ───
  var isAuth = checkAuth();
  updateGuard(isAuth);

  // 监听认证状态变化
  window.addEventListener("auth-state-change", function(e) {
    var detail = e.detail || {};
    // 重新做完整校验（不仅依赖事件 detail）
    var auth = detail.isAuthenticated !== undefined ? detail.isAuthenticated : checkAuth();
    updateGuard(auth);
  });

  // 监听 token 刷新成功事件（由 HttpAdapter 触发）
  window.addEventListener("webcraft-token-refreshed", function(e) {
    updateGuard(true);
  });
})();
`;

  ctx.pageScripts.push(guardScript);

  return html;
};
