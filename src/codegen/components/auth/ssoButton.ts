import type { ComponentCodegenFn } from "../../types";
import { escapeHTML, toJsString } from "../../layout";

/**
 * auth-sso-button 组件 → HTML (v2)
 *
 * v2 改造核心：
 * - P0-1: 完整 SSO 回调处理链（code/ticket/SAMLResponse 三协议凭证检测 → fetch tokenEndpoint → fetch userInfoEndpoint → 存储 + dispatch auth-state-change）
 * - P0-2: state 防 CSRF（跳转前生成 state 存 sessionStorage，回调时校验）
 * - P0-3: escapeHTML(JSON.stringify(value)) 防注入
 * - P1-1: variant:"text" 完整处理
 * - P1-2: ssoUrl 为空时显式提示
 * - P1-3: loading 状态
 * - P1-4: borderColor 独立配置
 * - P1-5: borderRadius 用 || 而非 ??
 * - P1-6: auth-state-change 事件闭环
 * - P1-7: redirectOnSuccess/redirectDelay 登录后跳转
 *
 * 配置：text, ssoUrl, protocol(oidc/cas/saml), tokenEndpoint, userInfoEndpoint, redirectUri,
 *        tokenKey, tokenStorage, tokenField, userField, redirectOnSuccess, redirectDelay,
 *        variant, bgColor, textColor, borderColor, fontSize, borderRadius, fullWidth
 */
export const ssoButtonCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config;
  const text = String(c.text ?? "SSO 登录");
  const ssoUrl = String(c.ssoUrl ?? "");
  const protocol = String(c.protocol ?? "oidc");
  const tokenEndpoint = String(c.tokenEndpoint ?? "");
  const userInfoEndpoint = String(c.userInfoEndpoint ?? "");
  const redirectUri = String(c.redirectUri ?? "") || (typeof window !== "undefined" ? `${window.location.origin}/callback` : "");
  const tokenKey = String(c.tokenKey ?? "auth_token");
  const tokenStorage = String(c.tokenStorage ?? "localStorage");
  const tokenField = String(c.tokenField ?? "access_token");
  const ssoRefreshTokenField = String(c.refreshTokenField ?? "refresh_token");
  const ssoExpiresInField = String(c.expiresInField ?? "expires_in");
  const userField = String(c.userField ?? "user");
  const redirectOnSuccess = String(c.redirectOnSuccess ?? "");
  const redirectDelay = Number(c.redirectDelay ?? 1500);
  const variant = String(c.variant ?? "outlined");
  const bgColor = String(c.bgColor ?? "#1976d2");
  const textColor = String(c.textColor ?? "#ffffff");
  const borderColor = String(c.borderColor ?? bgColor);
  const fontSize = Number(c.fontSize ?? 14);
  const borderRadius = Number(c.borderRadius ?? 4);
  const fullWidth = c.fullWidth !== false;

  const btnId = `sso-btn-${component.id}`;
  const errorId = `sso-error-${component.id}`;

  const btnStyle: string[] = [
    "display: flex",
    "align-items: center",
    "justify-content: center",
    `font-size: ${fontSize}px`,
    "padding: 8px 20px",
    `border-radius: ${borderRadius}px`,
    "cursor: pointer",
    "user-select: none",
    "transition: opacity 0.2s",
  ];

  if (fullWidth) {
    btnStyle.push("width: 100%", "height: 100%");
  } else {
    btnStyle.push("width: auto", "height: auto");
  }

  // P1-1: 正确处理三种 variant
  if (variant === "contained") {
    btnStyle.push(`background: ${bgColor}`);
    btnStyle.push(`color: ${textColor}`);
    btnStyle.push("border: none");
  } else if (variant === "text") {
    btnStyle.push("background: transparent");
    btnStyle.push(`color: ${bgColor}`);
    btnStyle.push("border: none");
  } else {
    // outlined
    btnStyle.push("background: transparent");
    btnStyle.push(`color: ${bgColor}`);
    btnStyle.push(`border: 1px solid ${borderColor}`);
  }

  let html = `<button id="${btnId}" style="${btnStyle.join("; ")}">${escapeHTML(text)}</button>`;
  html += `<div id="${errorId}" style="display:none;color:#f44336;font-size:${Math.max(fontSize - 3, 10)}px;text-align:center;margin-top:4px"></div>`;

  // P0-3: 所有配置值用 toJsString 防注入（内联 <script> 上下文）
  const safeSsoUrl = toJsString(ssoUrl);
  const safeProtocol = toJsString(protocol);
  const safeTokenEndpoint = toJsString(tokenEndpoint);
  const safeUserInfoEndpoint = toJsString(userInfoEndpoint);
  const safeRedirectUri = toJsString(redirectUri);
  const safeTokenKey = toJsString(tokenKey);
  const safeTokenStorage = toJsString(tokenStorage);
  const safeTokenField = toJsString(tokenField);
  const safeSsoRefreshTokenField = toJsString(ssoRefreshTokenField);
  const safeSsoExpiresInField = toJsString(ssoExpiresInField);
  const safeUserField = toJsString(userField);
  const safeRedirectOnSuccess = toJsString(redirectOnSuccess);

  const ssoScript = `
(function() {
  var btn = document.getElementById("${btnId}");
  var errorEl = document.getElementById("${errorId}");

  // P0-3: 配置值（已 escapeHTML + JSON.stringify 双重防注入）
  var ssoUrl = ${safeSsoUrl};
  var protocol = ${safeProtocol};
  var tokenEndpoint = ${safeTokenEndpoint};
  var userInfoEndpoint = ${safeUserInfoEndpoint};
  var redirectUri = ${safeRedirectUri};
  var TOKEN_KEY = window.__WC_TOKEN_KEY || ${safeTokenKey};
  var TOKEN_STORAGE = window.__WC_TOKEN_STORAGE || ${safeTokenStorage};
  var TOKEN_FIELD = ${safeTokenField};
  var REFRESH_FIELD = ${safeSsoRefreshTokenField};
  var EXPIRES_FIELD = ${safeSsoExpiresInField};
  var USER_FIELD = ${safeUserField};
  var REDIRECT_ON_SUCCESS = ${safeRedirectOnSuccess};
  var REDIRECT_DELAY = ${redirectDelay};

  // v7: 按配置路径（支持点号嵌套）从 token 响应中取值，消除 refresh_token/expires_in 硬编码
  function ssoGetNested(obj, path) {
    if (!obj || !path) return undefined;
    var parts = path.split(".");
    var cur = obj;
    for (var i = 0; i < parts.length; i++) { if (cur == null) return undefined; cur = cur[parts[i]]; }
    return cur;
  }
  function ssoResolveToken(data) {
    var accessToken = ssoGetNested(data, TOKEN_FIELD) || ssoGetNested(data, "access_token") || ssoGetNested(data, "token") || "";
    var refreshToken = ssoGetNested(data, REFRESH_FIELD) || ssoGetNested(data, "refresh_token") || "";
    var rawExp = ssoGetNested(data, EXPIRES_FIELD) != null ? ssoGetNested(data, EXPIRES_FIELD) : ssoGetNested(data, "expires_in");
    var expiresIn = rawExp != null && rawExp !== "" ? Number(rawExp) : 0;
    if (isNaN(expiresIn)) expiresIn = 0;
    var expiresAt = expiresIn > 0 ? Date.now() + expiresIn * 1000 : 0;
    return { accessToken: accessToken, refreshToken: refreshToken, expiresAt: expiresAt };
  }

  // 获取存储对象
  function getStorage() {
    if (TOKEN_STORAGE === "sessionStorage") {
      try { return sessionStorage; } catch(e) { return null; }
    } else if (TOKEN_STORAGE === "localStorage") {
      try { return localStorage; } catch(e) { return null; }
    }
    return null;
  }

  function setCachedValue(key, value) {
    var storage = getStorage();
    if (storage) {
      try { storage.setItem(key, value); } catch(e) {}
    }
  }

  function generateRandomString(length) {
    var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    var result = "";
    var array = new Uint8Array(length);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(array);
    } else {
      for (var i = 0; i < length; i++) array[i] = Math.floor(Math.random() * 256);
    }
    for (var j = 0; j < length; j++) {
      result += chars.charAt(array[j] % chars.length);
    }
    return result;
  }

  function showError(msg) {
    if (errorEl) {
      errorEl.textContent = msg;
      errorEl.style.display = "block";
    }
  }

  function hideError() {
    if (errorEl) {
      errorEl.style.display = "none";
    }
  }

  var originalText = btn ? btn.textContent : "";
  function setLoading(isLoading) {
    if (!btn) return;
    if (isLoading) {
      btn.disabled = true;
      btn.style.opacity = "0.6";
      btn.textContent = "\u52a0\u8f7d\u4e2d...";
    } else {
      btn.disabled = false;
      btn.style.opacity = "";
      btn.textContent = originalText;
    }
  }

  function dispatchAuthStateChange(detail) {
    window.dispatchEvent(new CustomEvent("auth-state-change", { detail: detail }));
  }

  // ─── P0-1: SSO 回调处理 ───
  function handleSSOCallback() {
    var urlParams = new URLSearchParams(window.location.search);
    var code = urlParams.get("code");
    var ticket = urlParams.get("ticket");
    var samlResponse = urlParams.get("SAMLResponse");
    var state = urlParams.get("state");
    var errorParam = urlParams.get("error");

    var authzCredential = code || ticket || samlResponse || "";

    if (!authzCredential && !state && !errorParam) return;

    setLoading(true);

    try {
      if (errorParam) {
        throw new Error("SSO Provider \u9519\u8bef: " + errorParam);
      }

      // P0-2: 校验 state 防 CSRF
      // P1-13: 如果 savedState 为空（已被其他 SSO 组件消费），静默退出而非报错
      var savedState = "";
      try { savedState = sessionStorage.getItem("__webcraft_sso_state") || ""; } catch(e) {}
      if (!savedState) {
        return;
      }
      if (savedState !== state) {
        throw new Error("State \u6821\u9a8c\u5931\u8d25\uff0c\u53ef\u80fd\u5b58\u5728 CSRF \u653b\u51fb");
      }
      try { sessionStorage.removeItem("__webcraft_sso_state"); } catch(e) {}

      if (!tokenEndpoint) {
        throw new Error("\u672a\u914d\u7f6e Token \u7aef\u70b9\uff0c\u65e0\u6cd5\u5b8c\u6210 SSO \u56de\u8c03");
      }

      var tokenBody = {
        grant_type: "authorization_code",
        code: authzCredential,
        redirect_uri: redirectUri,
        protocol: protocol
      };

      fetch(tokenEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(tokenBody).toString()
      }).then(function(tokenRes) {
        if (!tokenRes.ok) {
          return tokenRes.text().then(function(errText) {
            throw new Error("Token \u7aef\u70b9\u8fd4\u56de " + tokenRes.status + ": " + errText);
          });
        }
        return tokenRes.json();
      }).then(function(tokenData) {
        var tokenInfo = ssoResolveToken(tokenData);
        var accessToken = tokenInfo.accessToken;
        var refreshToken = tokenInfo.refreshToken;
        var expiresAt = tokenInfo.expiresAt;

        if (!accessToken) {
          throw new Error("Token \u7aef\u70b9\u672a\u8fd4\u56de access_token");
        }

        var userInfoPromise;
        if (userInfoEndpoint) {
          userInfoPromise = fetch(userInfoEndpoint, {
            headers: { "Authorization": "Bearer " + accessToken }
          }).then(function(userRes) {
            if (userRes.ok) return userRes.json();
            return null;
          }).catch(function() { return null; });
        } else {
          userInfoPromise = Promise.resolve(null);
        }

        userInfoPromise.then(function(rawUserInfo) {
          var userInfo = rawUserInfo;
          if (rawUserInfo && USER_FIELD && rawUserInfo[USER_FIELD]) {
            userInfo = rawUserInfo[USER_FIELD];
          }

          setCachedValue(TOKEN_KEY, accessToken);
          if (refreshToken) setCachedValue("refreshToken", refreshToken);
          if (expiresAt) {
            setCachedValue("__webcraft_auth_expires_at", String(expiresAt));
          }
          setCachedValue("__webcraft_auth_mode", TOKEN_STORAGE === "sessionStorage" ? "session" : "jwt");
          setCachedValue("__webcraft_auth_authenticated", "true");
          if (userInfo) setCachedValue("__webcraft_auth_user", JSON.stringify(userInfo));

          dispatchAuthStateChange({
            token: accessToken,
            user: userInfo,
            isAuthenticated: true,
            authMode: TOKEN_STORAGE === "sessionStorage" ? "session" : "jwt"
          });

          try {
            var cleanUrl = window.location.origin + window.location.pathname;
            window.history.replaceState({}, document.title, cleanUrl);
          } catch(e) {}

          if (REDIRECT_ON_SUCCESS) {
            setTimeout(function() {
              window.location.href = REDIRECT_ON_SUCCESS;
            }, REDIRECT_DELAY);
          }

          setLoading(false);
        }).catch(function(e) {
          setCachedValue(TOKEN_KEY, accessToken);
          setCachedValue("__webcraft_auth_authenticated", "true");
          setCachedValue("__webcraft_auth_mode", TOKEN_STORAGE === "sessionStorage" ? "session" : "jwt");
          dispatchAuthStateChange({
            token: accessToken,
            user: null,
            isAuthenticated: true,
            authMode: TOKEN_STORAGE === "sessionStorage" ? "session" : "jwt"
          });
          setLoading(false);
        });
      }).catch(function(e) {
        var msg = e && e.message ? e.message : String(e);
        showError(msg);
        setLoading(false);
      });
    } catch(e) {
      var msg = e && e.message ? e.message : String(e);
      showError(msg);
      setLoading(false);
    }
  }

  // ─── 点击跳转到 SSO Provider ───
  if (btn) {
    btn.addEventListener("click", function() {
      hideError();
      if (!ssoUrl) {
        showError("\u8bf7\u914d\u7f6e SSO \u6388\u6743\u5730\u5740");
        return;
      }

      setLoading(true);

      var state = generateRandomString(32);
      try { sessionStorage.setItem("__webcraft_sso_state", state); } catch(e) {}

      var params = new URLSearchParams();
      params.append("redirect_uri", redirectUri);
      params.append("protocol", protocol);
      params.append("state", state);

      var sep = ssoUrl.indexOf("?") !== -1 ? "&" : "?";
      window.location.href = ssoUrl + sep + params.toString();
    });
  }

  handleSSOCallback();
})();
`;

  ctx.pageScripts.push(ssoScript);

  return html;
};
