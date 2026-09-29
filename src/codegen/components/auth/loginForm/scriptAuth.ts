import type { LoginFormScriptVars } from "./scriptVars";

/**
 * auth-login-form 发布端脚本片段：存储工具、认证 Header、响应校验与 Token 刷新。
 * 从 loginForm.ts 迁出，模板内容逐字保留。
 */
export function buildLoginFormScriptAuth(v: LoginFormScriptVars): string {
  const { c, validationCodePath, validationMsgPath, validationSuccessCodes, validationMsgFallback } = v;
  return `
  // ─── v3 配置驱动：存储工具函数 ───
  function getStorage() {
    if (typeof window === "undefined") return null;
    if (TOKEN_STORAGE === "localStorage") return window.localStorage;
    if (TOKEN_STORAGE === "sessionStorage") return window.sessionStorage;
    return null;
  }

  var memoryCache = window.__webcraft_memory_cache = window.__webcraft_memory_cache || {};
  function getCachedValue(key) {
    if (memoryCache[key] !== undefined) return memoryCache[key];
    var storage = getStorage();
    if (!storage) return null;
    var val = storage.getItem(key);
    if (val !== null) memoryCache[key] = val;
    return val;
  }
  function setCachedValue(key, value) {
    memoryCache[key] = value;
    var storage = getStorage();
    if (storage) storage.setItem(key, value);
  }
  function clearAllCachedValues() {
    Object.keys(memoryCache).forEach(function(key) {
      delete memoryCache[key];
      var storage = getStorage();
      if (storage) storage.removeItem(key);
    });
  }

  // ─── v3 配置驱动：构建认证 header ───
  function buildAuthHeaders() {
    var headers = { "Content-Type": "application/json" };
    var accessToken = getCachedValue(TOKEN_KEY);
    var tokenHeaderName = TOKEN_HEADER || "Authorization";

    // 注入自定义 header（多租户等）
    HEADER_CONFIGS.forEach(function(hc) {
      if (hc.headerName === tokenHeaderName) return;
      var value = hc.valueTemplate || "";
      var matches = value.match(/\\$\\{([^}]+)\\}/g);
      if (matches) {
        matches.forEach(function(match) {
          var cacheKey = match.slice(2, -1);
          var cachedValue = getCachedValue(cacheKey);
          if (cachedValue) {
            value = value.replace(match, cachedValue);
          }
        });
      }
      headers[hc.headerName] = value;
    });

    if (accessToken) {
      var prefix = TOKEN_PREFIX || "";
      headers[tokenHeaderName] = prefix + accessToken;
    }
    return headers;
  }

  // ─── v6 响应成败判断（配置驱动，通用化） ───
  var RESP_CODE_PATH = ${JSON.stringify(validationCodePath)};
  var RESP_MSG_PATH = ${JSON.stringify(validationMsgPath)};
  var RESP_SUCCESS_CODES = ${JSON.stringify(validationSuccessCodes)};
  var RESP_MSG_FALLBACK = ${JSON.stringify(validationMsgFallback)};
  // 业务失败 → 返回错误文案；成功或未配置/未识别 → 返回 null
  function __webcraftRspErr(data) {
    if (!RESP_CODE_PATH) return null; // 未配置业务码检查 → HTTP 200 即成功
    if (!data || typeof data !== "object") return null;
    var code = getNested(data, RESP_CODE_PATH);
    if (code === undefined || code === null) return null; // 无业务码字段 → 视为成功
    var numeric = Number(code);
    if (!isNaN(numeric) && RESP_SUCCESS_CODES.indexOf(numeric) >= 0) return null;
    var msg = getNested(data, RESP_MSG_PATH);
    return (msg !== undefined && msg !== null ? String(msg) : "") || RESP_MSG_FALLBACK;
  }

  // ─── v3 配置驱动：从响应中提取并缓存字段 ───
  var responseMappings = ${JSON.stringify([
    { sourcePath: String(c.tokenField ?? "token"), targetKey: String(c.tokenKey ?? "auth_token"), saveToCache: true },
    { sourcePath: String(c.refreshTokenField ?? "refreshToken"), targetKey: "refreshToken", saveToCache: true },
    { sourcePath: String(c.expiresInField ?? "expiresIn"), targetKey: "expiresIn", saveToCache: true, isExpirationTime: true },
    { sourcePath: String(c.userField ?? "user"), targetKey: "user", saveToCache: false },
  ])};

  // v4 自动探测：从响应中探测常见 token 字段名
  var TOKEN_CANDIDATES = ["token","accessToken","access_token","jwt","id_token","authToken","auth_token"];
  var REFRESH_CANDIDATES = ["refreshToken","refresh_token"];
  var EXPIRES_CANDIDATES = ["expiresIn","expires_in","expiresTime","expiresAt","expiry","exp"];
  var USER_CANDIDATES = ["user","userInfo","user_info","profile","currentUser","data.user","data.userInfo"];

  function autoDetectMappings(data) {
    var detected = [];
    for (var i = 0; i < TOKEN_CANDIDATES.length; i++) {
      var val = getNested(data, TOKEN_CANDIDATES[i]);
      if (typeof val === "string" && val.length > 10) {
        detected.push({ sourcePath: TOKEN_CANDIDATES[i], targetKey: TOKEN_KEY, saveToCache: true });
        break;
      }
    }
    for (var i = 0; i < REFRESH_CANDIDATES.length; i++) {
      var val = getNested(data, REFRESH_CANDIDATES[i]);
      if (typeof val === "string" && val.length > 5) {
        detected.push({ sourcePath: REFRESH_CANDIDATES[i], targetKey: "refreshToken", saveToCache: true });
        break;
      }
    }
    for (var i = 0; i < EXPIRES_CANDIDATES.length; i++) {
      var val = getNested(data, EXPIRES_CANDIDATES[i]);
      if (val !== undefined && val !== null) {
        detected.push({ sourcePath: EXPIRES_CANDIDATES[i], targetKey: "expiresIn", saveToCache: true, isExpirationTime: true });
        break;
      }
    }
    for (var i = 0; i < USER_CANDIDATES.length; i++) {
      var val = getNested(data, USER_CANDIDATES[i]);
      if (val !== undefined && val !== null && typeof val === "object") {
        detected.push({ sourcePath: USER_CANDIDATES[i], targetKey: "user", saveToCache: false });
        break;
      }
    }
    return detected;
  }

  function extractAndCacheResponse(data, mappings) {
    var effective = mappings || responseMappings;
    effective.forEach(function(mapping) {
      if (mapping.saveToCache) {
        var value = getNested(data, mapping.sourcePath);
        if (value !== undefined && value !== null) {
          setCachedValue(mapping.targetKey, String(value));
        }
      }
    });
  }

  // ─── v3 配置驱动：智能过期时间解析 ───
  function parseExpireTime(value) {
    if (!value) return 0;
    var n = typeof value === "number" ? value : Number(value);
    if (!isNaN(n)) {
      if (n > 1000000000000) {
        var expiresAtSec = Math.floor(n / 1000);
        var nowSec = Math.floor(Date.now() / 1000);
        return Math.max(0, expiresAtSec - nowSec);
      }
      return Math.max(0, n);
    }
    var date = new Date(String(value));
    if (!isNaN(date.getTime())) {
      var expiresAtSec2 = Math.floor(date.getTime() / 1000);
      var nowSec2 = Math.floor(Date.now() / 1000);
      return Math.max(0, expiresAtSec2 - nowSec2);
    }
    return 0;
  }

  // ─── v3 配置驱动：Token 自动刷新 ───
  var refreshTimer = null;
  var refreshRetryCount = 0;
  var MAX_REFRESH_RETRY = 3;

  function startRefreshTimer(expiresIn) {
    if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
    refreshRetryCount = 0;
    if (expiresIn <= 0) return;
    var delayMs = (expiresIn - REFRESH_THRESHOLD) * 1000;
    if (delayMs <= 0) delayMs = 1000;
    refreshTimer = setTimeout(function() {
      performRefresh();
    }, delayMs);
  }

  function performRefresh() {
    // v4: 优先从 endpoints 数组查找 refresh 端点，兼容旧的 REFRESH_ENDPOINT_PATH
    var refreshEp = findEndpoint("refresh");
    var url = refreshEp ? refreshEp.path : REFRESH_ENDPOINT_PATH;
    var method = refreshEp ? refreshEp.method : REFRESH_ENDPOINT_METHOD;
    var epMappings = refreshEp && refreshEp.responseMapping ? refreshEp.responseMapping : null;

    if (!url) return;
    var refreshToken = getCachedValue("refreshToken");
    if (!refreshToken) return;

    var headers = buildAuthHeaders();
    var body = undefined;

    if (method === "GET") {
      if (refreshToken) {
        var sep = url.includes("?") ? "&" : "?";
        url = url + sep + "refreshToken=" + encodeURIComponent(refreshToken);
      }
    } else {
      // v7：按 refresh 端点的 content-type 配置编码请求体
      var enc = encodeAuthBody({ refreshToken: refreshToken }, [], refreshEp ? refreshEp.contentType : "");
      for (var eh in enc.headers) if (Object.prototype.hasOwnProperty.call(enc.headers, eh)) headers[eh] = enc.headers[eh];
      if (enc.forceNoContentType) delete headers["Content-Type"];
      body = enc.body;
    }

    fetch(url, { method: method, headers: headers, body: method !== "GET" ? body : undefined })
      .then(function(res) {
        if (!res.ok) throw new Error("Refresh failed (" + res.status + ")");
        return res.json();
      })
      .then(function(data) {
        var rspErr = __webcraftRspErr(data);
        if (rspErr) {
          clearAllCachedValues();
          dispatchAuthState({ isAuthenticated: false, token: null, user: null });
          return;
        }
        // v4: 使用端点的 responseMapping 提取响应字段，否则用默认 mappings
        extractAndCacheResponse(data, epMappings || undefined);
        var newToken = getCachedValue(TOKEN_KEY);

        // v4 自动探测兜底：刷新后未提取到新 token 时尝试自动探测
        if (!newToken) {
          var detected = autoDetectMappings(data);
          if (detected.length > 0) {
            extractAndCacheResponse(data, detected);
            newToken = getCachedValue(TOKEN_KEY);
          }
        }
        if (newToken) {
          dispatchAuthState({ token: newToken, isAuthenticated: true });
          // v6 闭环：通知 guard token 刷新成功
          window.dispatchEvent(new CustomEvent("webcraft-token-refreshed", { detail: { token: newToken } }));
        }
        var expStr = getCachedValue("expiresIn");
        if (expStr) {
          var newExpiresIn = parseExpireTime(expStr);
          if (newExpiresIn > 0) startRefreshTimer(newExpiresIn);
        }
        refreshRetryCount = 0;
      })
      .catch(function(err) {
        // P2-17: 重试策略与 HttpAdapter 对齐（[5, 15, 30] 秒指数退避）
        // 注意：HttpAdapter 监听 webcraft-token-expired 也会独立触发 tryRefreshToken
        // 两套重试不冲突——HttpAdapter 在 401 时触发，此处在 webcraft-token-expired 事件时触发
        if (refreshRetryCount < MAX_REFRESH_RETRY) {
          var delays = [5, 15, 30];
          var delay = (delays[refreshRetryCount] || 30) * 1000;
          refreshRetryCount++;
          setTimeout(function() { performRefresh(); }, delay);
        } else {
          // 达到最大重试次数后登出，同时 dispatch auth-state-change 通知 AuthGuard/UserProfile
          clearAllCachedValues();
          dispatchAuthState({ isAuthenticated: false, token: null, user: null });
        }
      });
  }

  function setLoading(loading) {
    if (loading) {
      btnText.style.display = "none";
      btnSpinner.style.display = "inline";
      btn.disabled = true;
    } else {
      btnText.style.display = "inline";
      btnSpinner.style.display = "none";
      btn.disabled = false;
    }
  }

  function showError(msg) {
    if (errDiv) {
      errDiv.textContent = msg;
      errDiv.style.display = "block";
    }
  }

  function clearError() {
    if (errDiv) {
      errDiv.style.display = "none";
    }
  }
`;
}
