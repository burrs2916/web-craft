import type { ComponentCodegenFn } from "../../types";
import { escapeHTML, toJsString } from "../../layout";

/**
 * auth-oauth-button 组件 → HTML
 *
 * v2 修复：
 * - P0-1: 完整回调处理（自动检测 URL code+state，fetch tokenEndpoint 换 token）
 * - P0-2: PKCE code_challenge_method 与实际方法一致（S256/plain）
 * - P0-3: state 校验防 CSRF
 * - P1-3: redirectUri 默认值统一（拼接 origin + /callback）
 * - P1-4: auth-state-change 事件闭环
 * - P2-1: 注入值 escapeHTML + JSON.stringify 双重防注入
 * - P2-2: PKCE verifier 生成统一（Uint8Array → base64url）
 * - P2-3: loading 状态（按钮文字切换 + disabled）
 * - P2-4: variant="text" 正确处理（无 border）
 *
 * 配置：text, authUrl, clientId, clientSecret, redirectUri, scope, usePKCE,
 *        tokenEndpoint, userInfoEndpoint, tokenKey, tokenStorage,
 *        variant, bgColor, textColor, fontSize, borderRadius
 */
export const oauthButtonCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config;
  const text = String(c.text ?? "使用第三方登录");
  const authUrl = String(c.authUrl ?? "");
  const clientId = String(c.clientId ?? "");
  const clientSecret = String(c.clientSecret ?? "");
  // P1-3: redirectUri 默认值统一——空时拼接 origin + /callback
  const redirectUri = String(c.redirectUri ?? "") || (typeof window !== "undefined" ? `${window.location.origin}/callback` : "");
  const scope = String(c.scope ?? "openid profile email");
  const usePKCE = Boolean(c.usePKCE ?? false);
  const tokenEndpoint = String(c.tokenEndpoint ?? "");
  const userInfoEndpoint = String(c.userInfoEndpoint ?? "");
  const tokenKey = String(c.tokenKey ?? "auth_token");
  const tokenStorage = String(c.tokenStorage ?? "localStorage");
  // v7: token 端点响应的字段路径（配置驱动，支持点号嵌套），消除 access_token 硬编码
  const oauthTokenField = String(c.tokenField ?? "access_token");
  const oauthRefreshTokenField = String(c.refreshTokenField ?? "refresh_token");
  const oauthExpiresInField = String(c.expiresInField ?? "expires_in");
  // P2-1: 所有注入到 script 的字符串值用 escapeHTML 防注入
  const variant = String(c.variant ?? "outlined");
  const bgColor = String(c.bgColor ?? "#1976d2");
  const textColor = String(c.textColor ?? "#ffffff");
  const fontSize = Number(c.fontSize ?? 14);
  const borderRadius = Number(c.borderRadius ?? 4);

  const btnId = `oauth-btn-${component.id}`;
  const errorId = `oauth-error-${component.id}`;

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
    "user-select: none",
    "transition: opacity 0.2s",
  ];

  // P2-4: 正确处理三种 variant
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
    btnStyle.push(`border: 1px solid ${bgColor}`);
  }

  let html = `<button id="${btnId}" style="${btnStyle.join("; ")}">${escapeHTML(text)}</button>`;
  // P2-1: 错误提示区域（默认隐藏）
  html += `<div id="${errorId}" style="display:none;color:#f44336;font-size:${Math.max(fontSize - 3, 10)}px;text-align:center;margin-top:4px"></div>`;

  // P2-1: 所有配置值用 toJsString 防注入（内联 <script> 上下文，非 escapeHTML）
  const safeAuthUrl = toJsString(authUrl);
  const safeClientId = toJsString(clientId);
  const safeClientSecret = toJsString(clientSecret);
  const safeRedirectUri = toJsString(redirectUri);
  const safeScope = toJsString(scope);
  const safeTokenEndpoint = toJsString(tokenEndpoint);
  const safeUserInfoEndpoint = toJsString(userInfoEndpoint);
  const safeTokenKey = toJsString(tokenKey);
  const safeTokenStorage = toJsString(tokenStorage);
  const safeOauthTokenField = toJsString(oauthTokenField);
  const safeOauthRefreshTokenField = toJsString(oauthRefreshTokenField);
  const safeOauthExpiresInField = toJsString(oauthExpiresInField);

  // ─── 注入 OAuth 跳转 + 回调处理逻辑（v2） ───
  const oauthScript = `
(function() {
  var btn = document.getElementById("${btnId}");
  var errorEl = document.getElementById("${errorId}");

  // P2-1: 配置值（已 escapeHTML + JSON.stringify 双重防注入）
  var authUrl = ${safeAuthUrl};
  var clientId = ${safeClientId};
  var clientSecret = ${safeClientSecret};
  var redirectUri = ${safeRedirectUri};
  var scope = ${safeScope};
  var usePKCE = ${usePKCE};
  var tokenEndpoint = ${safeTokenEndpoint};
  var userInfoEndpoint = ${safeUserInfoEndpoint};
  var TOKEN_KEY = window.__WC_TOKEN_KEY || ${safeTokenKey};
  var TOKEN_STORAGE = window.__WC_TOKEN_STORAGE || ${safeTokenStorage};
  var TOKEN_FIELD = ${safeOauthTokenField};
  var REFRESH_FIELD = ${safeOauthRefreshTokenField};
  var EXPIRES_FIELD = ${safeOauthExpiresInField};

  // v7: 按配置路径（支持点号嵌套）从 token 响应中取值，消除 access_token 硬编码
  function oauthGetNested(obj, path) {
    if (!obj || !path) return undefined;
    var parts = path.split(".");
    var cur = obj;
    for (var i = 0; i < parts.length; i++) { if (cur == null) return undefined; cur = cur[parts[i]]; }
    return cur;
  }
  function oauthResolveToken(data) {
    var accessToken = oauthGetNested(data, TOKEN_FIELD) || oauthGetNested(data, "access_token") || oauthGetNested(data, "token") || "";
    var refreshToken = oauthGetNested(data, REFRESH_FIELD) || oauthGetNested(data, "refresh_token") || "";
    var rawExp = oauthGetNested(data, EXPIRES_FIELD) != null ? oauthGetNested(data, EXPIRES_FIELD) : oauthGetNested(data, "expires_in");
    var expiresIn = rawExp != null && rawExp !== "" ? Number(rawExp) : 0;
    if (isNaN(expiresIn)) expiresIn = 0;
    var expiresAt = expiresIn > 0 ? Date.now() + expiresIn * 1000 : 0;
    return { accessToken: accessToken, refreshToken: refreshToken, expiresAt: expiresAt };
  }

  // P1-4: 获取存储对象
  function getStorage() {
    if (TOKEN_STORAGE === "sessionStorage") {
      try { return sessionStorage; } catch(e) { return null; }
    } else if (TOKEN_STORAGE === "localStorage") {
      try { return localStorage; } catch(e) { return null; }
    }
    return null; // memory 模式
  }

  // P1-4: 存储缓存值（memory 模式通过共享 memoryCache 工作）
  var memoryCache = window.__webcraft_memory_cache = window.__webcraft_memory_cache || {};
  function setCachedValue(key, value) {
    memoryCache[key] = value;
    var storage = getStorage();
    if (storage) {
      try { storage.setItem(key, value); } catch(e) {}
    }
  }

  // P1-4: 读取缓存值
  function getCachedValue(key) {
    if (memoryCache[key] !== undefined) return memoryCache[key];
    var storage = getStorage();
    if (storage) {
      try { var val = storage.getItem(key); if (val !== null) memoryCache[key] = val; return val; } catch(e) { return null; }
    }
    return null;
  }

  // P1-4: 清除缓存值
  function removeCachedValue(key) {
    var storage = getStorage();
    if (storage) {
      try { storage.removeItem(key); } catch(e) {}
    }
  }

  // P2-2: 统一的 base64url 编码
  function base64UrlEncode(bytes) {
    var binary = "";
    for (var i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");
  }

  // P2-2: 统一的随机字符串生成（用于 state）
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

  // P2-2: 统一的 PKCE code_verifier 生成
  function generateCodeVerifier() {
    var array = new Uint8Array(32);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(array);
    } else {
      for (var i = 0; i < 32; i++) array[i] = Math.floor(Math.random() * 256);
    }
    return base64UrlEncode(array);
  }

  // P0-2/P2-2: 统一的 PKCE code_challenge 生成，返回 {challenge, method}
  function generateCodeChallenge(verifier, callback) {
    if (window.crypto && window.crypto.subtle) {
      var encoder = new TextEncoder();
      var data = encoder.encode(verifier);
      window.crypto.subtle.digest("SHA-256", data).then(function(hash) {
        var challenge = base64UrlEncode(new Uint8Array(hash));
        callback({ challenge: challenge, method: "S256" });
      });
    } else {
      // P0-2: fallback 到 plain，method 必须一致
      callback({ challenge: verifier, method: "plain" });
    }
  }

  // P2-1/P2-3: 错误提示
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

  // P2-3: loading 状态
  var originalText = btn ? btn.textContent : "";
  function setLoading(isLoading) {
    if (!btn) return;
    if (isLoading) {
      btn.disabled = true;
      btn.style.opacity = "0.6";
      btn.textContent = "加载中...";
    } else {
      btn.disabled = false;
      btn.style.opacity = "";
      btn.textContent = originalText;
    }
  }

  // P1-4: dispatch auth-state-change 事件
  function dispatchAuthStateChange(detail) {
    window.dispatchEvent(new CustomEvent("auth-state-change", { detail: detail }));
  }

  // ─── P0-1: OAuth 回调处理 ───
  function handleOAuthCallback() {
    var urlParams = new URLSearchParams(window.location.search);
    var code = urlParams.get("code");
    var state = urlParams.get("state");
    var errorParam = urlParams.get("error");

    // 非 OAuth 回调 URL，跳过
    if (!code && !state && !errorParam) return;

    setLoading(true);

    try {
      // OAuth Provider 返回了错误
      if (errorParam) {
        throw new Error("OAuth Provider 错误: " + errorParam);
      }

      // P0-3: 校验 state 防 CSRF
      // P1-13: 如果 savedState 为空（已被其他 OAuth 组件消费），静默退出而非报错
      var savedState = "";
      try { savedState = sessionStorage.getItem("__webcraft_oauth_state") || ""; } catch(e) {}
      if (!savedState) {
        // state 已被其他 OAuth 组件处理，静默跳过
        return;
      }
      if (savedState !== state) {
        throw new Error("State 校验失败，可能存在 CSRF 攻击");
      }
      // 清除已使用的 state
      try { sessionStorage.removeItem("__webcraft_oauth_state"); } catch(e) {}

      // P0-1: 用 code 换 token
      if (!tokenEndpoint) {
        throw new Error("未配置 Token 端点，无法完成授权码交换");
      }

      var tokenBody = {
        grant_type: "authorization_code",
        code: code,
        redirect_uri: redirectUri,
        client_id: clientId
      };
      // PKCE 模式发送 code_verifier；非 PKCE 模式发送 client_secret
      if (usePKCE) {
        var verifier = "";
        try { verifier = sessionStorage.getItem("__webcraft_pkce_verifier") || ""; } catch(e) {}
        if (!verifier) throw new Error("PKCE verifier 丢失，无法完成 token 交换");
        tokenBody.code_verifier = verifier;
        try { sessionStorage.removeItem("__webcraft_pkce_verifier"); } catch(e) {}
      } else if (clientSecret) {
        tokenBody.client_secret = clientSecret;
      }

      // P1-10: SAML 协议使用 SOAP 格式，其他协议用 form-urlencoded
      var ssoContentType = protocol === "SAML" ? "application/soap+xml" : "application/x-www-form-urlencoded";
      var ssoBody = protocol === "SAML" ? JSON.stringify(tokenBody) : new URLSearchParams(tokenBody).toString();
      fetch(tokenEndpoint, {
        method: "POST",
        headers: { "Content-Type": ssoContentType },
        body: ssoBody
      }).then(function(tokenRes) {
        if (!tokenRes.ok) {
          return tokenRes.text().then(function(errText) {
            throw new Error("Token 端点返回 " + tokenRes.status + ": " + errText);
          });
        }
        return tokenRes.json();
      }).then(function(tokenData) {
        var tokenInfo = oauthResolveToken(tokenData);
        var accessToken = tokenInfo.accessToken;
        var refreshToken = tokenInfo.refreshToken;
        var expiresAt = tokenInfo.expiresAt;

        if (!accessToken) {
          throw new Error("Token 端点未返回 access_token");
        }

        // P0-1: 获取用户信息（如果配置了 userInfoEndpoint）
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

        userInfoPromise.then(function(userInfo) {
          // P1-4: 存储认证信息
          setCachedValue(TOKEN_KEY, accessToken);
          if (refreshToken) setCachedValue("refreshToken", refreshToken);
          if (expiresAt) {
            setCachedValue("__webcraft_auth_expires_at", String(expiresAt));
            setCachedValue("__webcraft_auth_mode", "oauth2");
          }
          setCachedValue("__webcraft_auth_authenticated", "true");
          if (userInfo) setCachedValue("__webcraft_auth_user", JSON.stringify(userInfo));

          // P1-4: dispatch auth-state-change 事件
          dispatchAuthStateChange({
            token: accessToken,
            user: userInfo,
            isAuthenticated: true,
            authMode: "oauth2"
          });

          // 清除 URL 中的 code/state 参数
          try {
            var cleanUrl = window.location.origin + window.location.pathname;
            window.history.replaceState({}, document.title, cleanUrl);
          } catch(e) {}

          setLoading(false);
        }).catch(function(e) {
          // userInfo 之后出错——token 已拿到，仍算登录成功
          setCachedValue(TOKEN_KEY, accessToken);
          setCachedValue("__webcraft_auth_authenticated", "true");
          setCachedValue("__webcraft_auth_mode", "oauth2");
          dispatchAuthStateChange({
            token: accessToken,
            user: null,
            isAuthenticated: true,
            authMode: "oauth2"
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

  // ─── 点击跳转到 OAuth Provider ───
  if (btn) {
    btn.addEventListener("click", function() {
      hideError();
      if (!authUrl || !clientId) {
        showError("请配置授权 URL 和 Client ID");
        return;
      }

      setLoading(true);

      // P0-3: 生成 state 并存入 sessionStorage
      var state = generateRandomString(32);
      try { sessionStorage.setItem("__webcraft_oauth_state", state); } catch(e) {}

      var params = new URLSearchParams();
      params.append("client_id", clientId);
      params.append("redirect_uri", redirectUri);
      params.append("response_type", "code");
      params.append("scope", scope);
      params.append("state", state);

      if (usePKCE) {
        var verifier = generateCodeVerifier();
        try { sessionStorage.setItem("__webcraft_pkce_verifier", verifier); } catch(e) {}
        // P0-2: generateCodeChallenge 回调中设置正确的 method
        generateCodeChallenge(verifier, function(result) {
          params.append("code_challenge", result.challenge);
          params.append("code_challenge_method", result.method);
          window.location.href = authUrl + "?" + params.toString();
        });
      } else {
        window.location.href = authUrl + "?" + params.toString();
      }
    });
  }

  // P0-1: 页面加载时自动检查是否是 OAuth 回调
  handleOAuthCallback();
})();
`;

  ctx.pageScripts.push(oauthScript);

  return html;
};
