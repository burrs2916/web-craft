import type { ComponentCodegenFn } from "../../types";
import { escapeHTML } from "../../layout";

/**
 * auth-logout-button 组件 → HTML
 *
 * 配置：text, redirectUrl, variant, bgColor, textColor, fontSize, borderRadius,
 *        confirmBeforeLogout, confirmText, callLogoutApi, logoutApiUrl, logoutMethod
 *
 * 发布产物中：清除 localStorage + dispatch auth-state-change
 */
export const logoutButtonCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config;
  const text = String(c.text ?? "退出登录");
  const redirectUrl = String(c.redirectUrl ?? "/login");
  const variant = String(c.variant ?? "contained");
  const bgColor = String(c.bgColor ?? "#f44336");
  const textColor = String(c.textColor ?? "#ffffff");
  const fontSize = Number(c.fontSize ?? 14);
  const borderRadius = Number(c.borderRadius ?? 4);
  const confirmBeforeLogout = Boolean(c.confirmBeforeLogout ?? false);
  const confirmText = String(c.confirmText ?? "确定要退出登录吗？");
  const callLogoutApi = Boolean(c.callLogoutApi ?? false);
  const logoutApiUrl = String(c.logoutApiUrl ?? "");
  const logoutMethod = String(c.logoutMethod ?? "POST");
  // v5 联动：与 login-form 的 tokenKey/tokenStorage 一致
  const tokenKey = String(c.tokenKey ?? "auth_token");
  const tokenStorage = String(c.tokenStorage ?? "localStorage");

  const btnId = `logout-btn-${component.id}`;
  const dialogId = `logout-dialog-${component.id}`;
  const errorId = `logout-error-${component.id}`;

  const btnStyle: string[] = [
    "width: 100%",
    "height: 100%",
    "display: flex",
    "align-items: center",
    "justify-content: center",
    `font-size: ${fontSize}px`,
    "padding: 8px 20px",
    `border-radius: ${borderRadius}px`,
    "cursor: pointer",
    "border: none",
    "user-select: none",
    "text-align: center",
  ];

  if (variant === "contained") {
    btnStyle.push(`background: ${bgColor}`);
    btnStyle.push(`color: ${textColor}`);
  } else if (variant === "outlined") {
    btnStyle.push("background: transparent");
    btnStyle.push(`color: ${bgColor}`);
    btnStyle.push(`border: 1px solid ${bgColor}`);
  } else {
    btnStyle.push("background: transparent");
    btnStyle.push(`color: ${bgColor}`);
  }

  // P1-3: 未认证时按钮禁用（检查 __webcraft_auth_authenticated 标志）
  let html = `<button id="${btnId}" style="${btnStyle.join("; ")}">${escapeHTML(text)}</button>`;
  // P2-1: API 错误提示区域（默认隐藏）
  html += `<div id="${errorId}" style="display:none;color:#f44336;font-size:${Math.max(fontSize - 3, 10)}px;text-align:center;margin-top:4px"></div>`;

  // P0-1: 确认弹窗 HTML（MUI 风格的自定义 Dialog）
  if (confirmBeforeLogout) {
    const dialogOverlayStyle = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:none;align-items:center;justify-content:center;z-index:9999";
    const dialogBoxStyle = `background:#fff;border-radius:12px;padding:24px;max-width:320px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.15);text-align:center`;
    const dialogTitleStyle = `font-size:16px;font-weight:600;color:#1a1a2e;margin-bottom:20px`;
    const cancelBtnStyle = `padding:8px 20px;border:1px solid #ddd;border-radius:8px;background:transparent;color:#666;font-size:14px;cursor:pointer;margin:0 4px`;
    const confirmBtnStyle = `padding:8px 20px;border:none;border-radius:8px;background:${bgColor};color:${textColor};font-size:14px;cursor:pointer;margin:0 4px`;

    html += `<div id="${dialogId}" style="${dialogOverlayStyle}">`;
    html += `<div style="${dialogBoxStyle}">`;
    html += `<div style="${dialogTitleStyle}">${escapeHTML(confirmText)}</div>`;
    html += `<div style="display:flex;justify-content:center">`;
    html += `<button id="${dialogId}-cancel" style="${cancelBtnStyle}">取消</button>`;
    html += `<button id="${dialogId}-confirm" style="${confirmBtnStyle}">确认退出</button>`;
    html += `</div></div></div>`;
  }

  // ─── 注入退出逻辑（v2: 动态键清除 + MUI 风格弹窗 + API 错误反馈） ───
  const logoutScript = `
(function() {
  var btn = document.getElementById("${btnId}");
  var errorEl = document.getElementById("${errorId}");

  // v5: 配置驱动的 Token 存储（优先读全局统一配置，未注入时回退组件自身配置）
  var TOKEN_KEY = window.__WC_TOKEN_KEY || ${JSON.stringify(tokenKey)};
  var TOKEN_STORAGE = window.__WC_TOKEN_STORAGE || ${JSON.stringify(tokenStorage)};

  var FIXED_KEYS = ["__webcraft_auth_user", "__webcraft_auth_expires_at", "__webcraft_auth_mode", "__webcraft_auth_authenticated"];

  function getStorage() {
    if (typeof window === "undefined") return null;
    if (TOKEN_STORAGE === "localStorage") return window.localStorage;
    if (TOKEN_STORAGE === "sessionStorage") return window.sessionStorage;
    // P1-2: memory 模式——返回 null，但 clearAuthCache 仍清除内存缓存
    return null;
  }

  // P1-2: 内存缓存对象（与 login-form codegen 的 memoryCache 保持一致）
  var memoryCache = window.__webcraft_memory_cache = window.__webcraft_memory_cache || {};

  function clearAuthCache() {
    // P2-9: 清除所有 storage 类型（localStorage + sessionStorage + memoryCache）
    // 不只清自身配置的 storage，防止跨 storage 模式残留
    var knownKeys = [TOKEN_KEY].concat(FIXED_KEYS, ["refreshToken", "expiresIn"]);
    var storages = [window.localStorage, window.sessionStorage];

    // 1. 清除已知固定键 + 配置的 tokenKey（从所有 storage + memoryCache）
    for (var i = 0; i < knownKeys.length; i++) {
      if (knownKeys[i]) {
        delete memoryCache[knownKeys[i]];
        for (var si = 0; si < storages.length; si++) {
          try { storages[si].removeItem(knownKeys[i]); } catch(e) {}
        }
      }
    }

    // 2. 动态扫描——枚举所有 storage 中 __webcraft_ 前缀键并清除
    for (var sIdx = 0; sIdx < storages.length; sIdx++) {
      try {
        var keysToRemove = [];
        for (var j = storages[sIdx].length - 1; j >= 0; j--) {
          var sk = storages[sIdx].key(j);
          if (sk && sk.indexOf("__webcraft_") === 0) keysToRemove.push(sk);
        }
        for (var k = 0; k < keysToRemove.length; k++) {
          delete memoryCache[keysToRemove[k]];
          try { storages[sIdx].removeItem(keysToRemove[k]); } catch(e) {}
        }
      } catch(e) {}
    }

    // 3. 清除 memoryCache 中所有 __webcraft_ 前缀键
    var memKeys = Object.keys(memoryCache);
    for (var m = 0; m < memKeys.length; m++) {
      if (memKeys[m].indexOf("__webcraft_") === 0) delete memoryCache[memKeys[m]];
    }

    // 4. 清除 sessionStorage 中 OAuth/SSO 流程的 state/verifier
    var sessionOnlyKeys = ["__webcraft_oauth_state", "__webcraft_pkce_verifier", "__webcraft_sso_state"];
    try {
      for (var so = 0; so < sessionOnlyKeys.length; so++) {
        sessionStorage.removeItem(sessionOnlyKeys[so]);
        delete memoryCache[sessionOnlyKeys[so]];
      }
    } catch(e) {}
  }

  function showError(msg) {
    if (errorEl) {
      errorEl.textContent = msg;
      errorEl.style.display = "block";
    }
  }

  function performLogout() {
    var doLogout = function() {
      var logoutApi = ${JSON.stringify(callLogoutApi ? logoutApiUrl : "")};
      var logoutMethod = ${JSON.stringify(logoutMethod)};
      var token = null;
      try { token = (getStorage() || {}).getItem(TOKEN_KEY); } catch(e) {}

      var finishLogout = function() {
        clearAuthCache();
        window.dispatchEvent(new CustomEvent("auth-state-change", {
          detail: { isAuthenticated: false, token: null, user: null }
        }));
        // P2-2: escapeHTML 已在构建时应用，redirectUrl 在此处为已转义字符串
        var redirect = ${JSON.stringify(escapeHTML(redirectUrl))};
        if (redirect && redirect !== "none") {
          window.location.href = redirect;
        }
      };

      if (logoutApi) {
        var headers = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = "Bearer " + token;
        fetch(logoutApi, { method: logoutMethod, headers: headers, credentials: "include" })
          .then(function(res) {
            if (!res.ok) {
              // P2-1: API 返回非 200，提示但继续退出
              showError("\\u9000\\u51fa\\u63a5\\u53e3\\u8fd4\\u56de " + res.status + "\\uff0c\\u672c\\u5730\\u767b\\u5f55\\u72b6\\u6001\\u5df2\\u6e05\\u9664");
            }
            finishLogout();
          })
          .catch(function(e) {
            // P2-1: API 调用失败，提示但继续退出
            showError("\\u9000\\u51fa\\u63a5\\u53e3\\u8c03\\u7528\\u5931\\u8d25\\uff0c\\u672c\\u5730\\u767b\\u5f55\\u72b6\\u6001\\u5df2\\u6e05\\u9664");
            finishLogout();
          });
      } else {
        finishLogout();
      }
    };

    // P0-1: MUI 风格弹窗替代原生 confirm()
    if (${confirmBeforeLogout}) {
      var dialog = document.getElementById("${dialogId}");
      if (dialog) {
        dialog.style.display = "flex";
        var cancelBtn = document.getElementById("${dialogId}-cancel");
        var confirmBtn = document.getElementById("${dialogId}-confirm");
        if (cancelBtn) {
          cancelBtn.onclick = function() {
            dialog.style.display = "none";
          };
        }
        if (confirmBtn) {
          confirmBtn.onclick = function() {
            dialog.style.display = "none";
            doLogout();
          };
        }
        // 点击遮罩关闭
        dialog.onclick = function(e) {
          if (e.target === dialog) {
            dialog.style.display = "none";
          }
        };
      } else {
        // 兜底：dialog 元素不存在时直接退出
        doLogout();
      }
    } else {
      doLogout();
    }
  }

  // P1-3: 未认证时按钮禁用
  var authed = false;
  var storage = getStorage();
  try {
    if (storage) {
      authed = storage.getItem("__webcraft_auth_authenticated") === "true";
    }
  } catch(e) {}
  if (!authed) {
    btn.style.opacity = "0.4";
    btn.style.cursor = "not-allowed";
    btn.addEventListener("click", function(e) {
      e.preventDefault();
      return false;
    });
  } else {
    btn.addEventListener("click", performLogout);
  }
})();
`;

  ctx.pageScripts.push(logoutScript);

  return html;
};
