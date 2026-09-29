import type { LoginFormScriptVars } from "./scriptVars";

/**
 * auth-login-form 发布端脚本片段：动态参数登录与 auth-guard 门禁联动。
 * 从 loginForm.ts 迁出，模板内容逐字保留。
 */
export function buildLoginFormScriptFlow(v: LoginFormScriptVars): string {
  const { cid, authMode, apiUrl, method, userField, initiallyHidden, tenantRequired } = v;
  return `
  // ─── v5 动态参数模式登录 ───
  function handleDynamicLogin() {
    var bodyParams = {};
    var queryParams = {};
    var formDataParts = [];

    for (var i = 0; i < AUTH_PARAMS.length; i++) {
      var p = AUTH_PARAMS[i];
      var input = document.getElementById("login-dyn-" + p.id + "-${cid}");
      var val = input ? input.value : (p.value || "");
      if (p.required && !val) {
        showError("\u8bf7\u8f93\u5165" + p.label);
        return;
      }
      if (!val) continue;
      if (p.location === "query") {
        queryParams[p.key] = val;
      } else if (p.location === "formData") {
        formDataParts.push({ key: p.key, value: val });
      } else {
        bodyParams[p.key] = val;
      }
    }

    clearError();
    setLoading(true);

    var loginEp = findEndpoint("login");
    var apiUrl = (loginEp && loginEp.path) ? loginEp.path : "${apiUrl}";
    var method = (loginEp && loginEp.method) ? loginEp.method : "${method}";

    // query params
    var qs = Object.keys(queryParams).map(function(k) {
      return encodeURIComponent(k) + "=" + encodeURIComponent(queryParams[k]);
    }).join("&");
    if (qs) {
      apiUrl += (apiUrl.includes("?") ? "&" : "?") + qs;
    }

    var headers = buildAuthHeaders();

    // v7：按登录端点的 content-type 配置统一编码请求体
    var enc = encodeAuthBody(bodyParams, formDataParts, loginEp ? loginEp.contentType : "");
    for (var eh in enc.headers) if (Object.prototype.hasOwnProperty.call(enc.headers, eh)) headers[eh] = enc.headers[eh];
    if (enc.forceNoContentType) delete headers["Content-Type"];
    var body = enc.body;

    var authMode = "${authMode}";

    // ─── Basic Auth 模式：将参数中的用户名和密码 btoa 后存入缓存，不发起请求 ───
    if (authMode === "basic") {
      var dynUsername = bodyParams["username"] || bodyParams["user"] || bodyParams["email"] || "";
      var dynPassword = bodyParams["password"] || bodyParams["passwd"] || bodyParams["pass"] || "";
      // 若未在 bodyParams 找到，从 queryParams 和 formData 中查找
      if (!dynUsername) dynUsername = queryParams["username"] || queryParams["user"] || queryParams["email"] || "";
      if (!dynPassword) dynPassword = queryParams["password"] || queryParams["passwd"] || queryParams["pass"] || "";
      if (!dynUsername || !dynPassword) {
        showError("\\u8bf7\\u8f93\\u5165\\u7528\\u6237\\u540d\\u548c\\u5bc6\\u7801");
        setLoading(false);
        return;
      }
      var dynCredentials = btoa(dynUsername + ":" + dynPassword);
      var dynUserObj = { username: dynUsername, name: dynUsername };
      try {
        setCachedValue(TOKEN_KEY, dynCredentials);
        setCachedValue("__webcraft_auth_mode", "basic");
        setCachedValue("__webcraft_auth_user", JSON.stringify(dynUserObj));
        setCachedValue("__webcraft_auth_authenticated", "true");
        // 缓存所有 authParams 的值（供 UserProfile 展示）
        for (var pi = 0; pi < AUTH_PARAMS.length; pi++) {
          var ap = AUTH_PARAMS[pi];
          var apVal = bodyParams[ap.key] || queryParams[ap.key] || "";
          if (apVal) setCachedValue(ap.key, apVal);
        }
      } catch(e) {}
      dispatchAuthState({ token: dynCredentials, user: dynUserObj, isAuthenticated: true, authMode: "basic" });
      setLoading(false);
      return;
    }

    fetch(apiUrl, {
      method: method,
      headers: headers,
      body: body,
      credentials: authMode === "session" ? "include" : "same-origin"
    })
      .then(function(response) {
        if (!response.ok) {
          return response.text().then(function(t) { throw new Error("\u767b\u5f55\u5931\u8d25 (" + response.status + "): " + t); });
        }
        return response.json();
      })
      .then(function(data) {
        var rspErr = __webcraftRspErr(data);
        if (rspErr) { showError(rspErr); setLoading(false); return; }
        if (authMode === "session") {
          var user = data || {};
          try {
            setCachedValue("__webcraft_auth_mode", "session");
            setCachedValue("__webcraft_auth_user", JSON.stringify(user));
            setCachedValue("__webcraft_auth_authenticated", "true");
          } catch(e) {}
          dispatchAuthState({ cookieBased: true, user: user, isAuthenticated: true, authMode: "session" });
        } else {
          extractAndCacheResponse(data);
          var token = getCachedValue(TOKEN_KEY);
          if (!token) {
            var detected = autoDetectMappings(data);
            if (detected.length > 0) {
              extractAndCacheResponse(data, detected);
              token = getCachedValue(TOKEN_KEY);
            }
          }
          if (!token) {
            showError("\u767b\u5f55\u54cd\u5e94\u4e2d\u672a\u627e\u5230 token");
            setLoading(false);
            return;
          }
          var refreshToken = getCachedValue("refreshToken");
          var expiresInStr = getCachedValue("expiresIn");
          var expiresAt = 0;
          if (expiresInStr) {
            var expiresInSec = parseExpireTime(expiresInStr);
            if (expiresInSec > 0) {
              expiresAt = Date.now() + expiresInSec * 1000;
              if (REFRESH_ENABLED) startRefreshTimer(expiresInSec);
            }
          }
          // 从缓存构建 user 对象
          var userObj = {};
          Object.keys(memoryCache).forEach(function(k) {
            if (k !== TOKEN_KEY && k !== "refreshToken" && k !== "expiresIn" && k.indexOf("__webcraft_auth_") !== 0) {
              userObj[k] = memoryCache[k];
            }
          });
          if (Object.keys(userObj).length === 0) {
            var userField = getNested(data, "${userField}");
            if (userField && typeof userField === "object") userObj = userField;
          }
          try {
            setCachedValue("__webcraft_auth_user", JSON.stringify(userObj));
            setCachedValue("__webcraft_auth_expires_at", String(expiresAt));
            setCachedValue("__webcraft_auth_mode", authMode);
            setCachedValue("__webcraft_auth_authenticated", "true");
          } catch(e) {}
          dispatchAuthState({ token: token, refreshToken: refreshToken, expiresAt: expiresAt, user: userObj, isAuthenticated: true, authMode: authMode });
        }
        setLoading(false);
      })
      .catch(function(err) {
        showError(err.message || "\u767b\u5f55\u8bf7\u6c42\u5f02\u5e38");
        setLoading(false);
      });
  }

  function handleLogin() {
    var username = userInput ? userInput.value : "";
    var password = passInput ? passInput.value : "";
    var remember = rememberInput ? rememberInput.checked : false;

    // v5 多租户值
    var tenantVal = SHOW_TENANT ? ((tenantInput ? tenantInput.value : "") || TENANT_DEFAULT) : "";
    // v5 验证码值
    var captchaVal = (SHOW_CAPTCHA && captchaInput) ? captchaInput.value : "";

    // v5 SMS 模式
    if (activeTab === "sms" || LOGIN_TYPE === "sms") {
      var phone = smsPhoneInput ? smsPhoneInput.value : "";
      var code = smsCodeInput ? smsCodeInput.value : "";
      if (!phone) { showError("\u8bf7\u8f93\u5165\u624b\u673a\u53f7"); return; }
      if (!code) { showError("\u8bf7\u8f93\u5165\u9a8c\u8bc1\u7801"); return; }

      clearError();
      setLoading(true);

      var loginEp = findEndpoint("login");
      var apiUrl = (loginEp && loginEp.path) ? loginEp.path : "${apiUrl}";
      var method = (loginEp && loginEp.method) ? loginEp.method : "${method}";

      var smsHeaders = { "Content-Type": "application/json" };
      if (SHOW_TENANT && TENANT_HEADER && tenantVal) smsHeaders[TENANT_HEADER] = tenantVal;

      var smsBody = { phone: phone, code: code };
      if (captchaVal) smsBody.captcha = captchaVal;

      fetch(apiUrl, { method: method, headers: smsHeaders, body: JSON.stringify(smsBody), credentials: "${authMode}" === "session" ? "include" : "same-origin" })
        .then(function(response) {
          if (!response.ok) { return response.text().then(function(t) { throw new Error("\u767b\u5f55\u5931\u8d25 (" + response.status + "): " + t); }); }
          return response.json();
        })
        .then(function(data) {
          var rspErr = __webcraftRspErr(data);
          if (rspErr) { showError(rspErr); setLoading(false); return; }
          extractAndCacheResponse(data);
          var token = getCachedValue(TOKEN_KEY);
          if (!token) {
            var detected = autoDetectMappings(data);
            if (detected.length > 0) { extractAndCacheResponse(data, detected); token = getCachedValue(TOKEN_KEY); }
          }
          if (!token && "${authMode}" !== "session" && "${authMode}" !== "basic") {
            showError("\u767b\u5f55\u54cd\u5e94\u4e2d\u672a\u627e\u5230 token");
            setLoading(false);
            return;
          }
          var userObj = getNested(data, "${userField}") || {};
          if (!userObj || typeof userObj !== "object") userObj = {};
          try {
            if (token) setCachedValue(TOKEN_KEY, token);
            setCachedValue("__webcraft_auth_user", JSON.stringify(userObj));
            setCachedValue("__webcraft_auth_mode", "${authMode}");
            setCachedValue("__webcraft_auth_authenticated", "true");
          } catch(e) {}
          dispatchAuthState({ token: token, user: userObj, isAuthenticated: true, authMode: "${authMode}" });
          setLoading(false);
        })
        .catch(function(err) {
          showError(err.message || "\u767b\u5f55\u8bf7\u6c42\u5f02\u5e38");
          setLoading(false);
        });
      return;
    }

    // ─── 密码模式 ───
    if (!username || !password) {
      showError("\u8bf7\u8f93\u5165\u7528\u6237\u540d\u548c\u5bc6\u7801");
      return;
    }
    if (SHOW_CAPTCHA && !captchaVal) {
      showError("\u8bf7\u8f93\u5165\u9a8c\u8bc1\u7801");
      return;
    }
    if (SHOW_TENANT && ${tenantRequired} && !tenantVal) {
      showError("\u8bf7\u8f93\u5165\u79df\u6237ID");
      return;
    }

    clearError();
    setLoading(true);

    var authMode = "${authMode}";
    // v4: 优先从 endpoints 数组查找登录端点，兼容旧的 apiUrl 字段
    var loginEp = findEndpoint("login");
    var apiUrl = (loginEp && loginEp.path) ? loginEp.path : "${apiUrl}";
    var method = (loginEp && loginEp.method) ? loginEp.method : "${method}";

    // ─── Basic Auth 模式 ───
    if (authMode === "basic") {
      var credentials = btoa(username + ":" + password);
      var userObj = { username: username, name: username };
      try {
        setCachedValue(TOKEN_KEY, credentials);
        setCachedValue("__webcraft_auth_mode", "basic");
        setCachedValue("__webcraft_auth_user", JSON.stringify(userObj));
        setCachedValue("__webcraft_auth_authenticated", "true");
      } catch(e) {}
      dispatchAuthState({ token: credentials, user: userObj, isAuthenticated: true, authMode: "basic" });
      setLoading(false);
      return;
    }

    // ─── Session / JWT 模式 ───
    var headers = { "Content-Type": "application/json" };
    // v5 多租户注入 header
    if (SHOW_TENANT && TENANT_HEADER && tenantVal) {
      headers[TENANT_HEADER] = tenantVal;
    }
    var loginBody = { username: username, password: password, remember: remember };
    // v5 验证码注入
    if (captchaVal) loginBody.captcha = captchaVal;
    // v5 多租户注入 body
    if (SHOW_TENANT && tenantVal) loginBody.tenantId = tenantVal;

    var fetchOpts = {
      method: method,
      headers: headers,
      body: JSON.stringify(loginBody),
      credentials: authMode === "session" ? "include" : "same-origin"
    };

    fetch(apiUrl, fetchOpts)
      .then(function(response) {
        if (!response.ok) {
          return response.text().then(function(errText) {
            throw new Error("\u767b\u5f55\u5931\u8d25 (" + response.status + "): " + errText);
          });
        }
        return response.json();
      })
      .then(function(data) {
        var rspErr = __webcraftRspErr(data);
        if (rspErr) { showError(rspErr); setLoading(false); return; }
        if (authMode === "session") {
          var user = getNested(data, "${userField}") || {};
          try {
            setCachedValue("__webcraft_auth_mode", "session");
            setCachedValue("__webcraft_auth_user", JSON.stringify(user));
            setCachedValue("__webcraft_auth_authenticated", "true");
          } catch(e) {}
          dispatchAuthState({ cookieBased: true, user: user, isAuthenticated: true, authMode: "session" });
        } else {
          // JWT / OAuth2 模式 — v4 配置驱动字段提取 + 自动探测兜底
          extractAndCacheResponse(data);

          var token = getCachedValue(TOKEN_KEY);
          var refreshToken = getCachedValue("refreshToken");
          var expiresInStr = getCachedValue("expiresIn");
          var user = getNested(data, "${userField}");

          // v4 自动探测兜底：配置映射未找到 token 时，尝试从响应中自动探测
          if (!token) {
            var detected = autoDetectMappings(data);
            if (detected.length > 0) {
              extractAndCacheResponse(data, detected);
              token = getCachedValue(TOKEN_KEY);
              refreshToken = getCachedValue("refreshToken");
              expiresInStr = getCachedValue("expiresIn");
              var detectedUser = detected.find(function(m) { return m.targetKey === "user"; });
              if (detectedUser && !user) user = getNested(data, detectedUser.sourcePath);
            }
          }

          if (!token) {
            showError("\u767b\u5f55\u54cd\u5e94\u4e2d\u672a\u627e\u5230 token");
            setLoading(false);
            return;
          }

          var userObj = (user && typeof user === "object") ? user : {};
          var expiresAt = 0;
          if (expiresInStr) {
            var expiresInSec = parseExpireTime(expiresInStr);
            if (expiresInSec > 0) {
              expiresAt = Date.now() + expiresInSec * 1000;
              if (REFRESH_ENABLED && REFRESH_ENDPOINT_PATH) {
                startRefreshTimer(expiresInSec);
              }
            }
          }

          try {
            setCachedValue("__webcraft_auth_user", JSON.stringify(userObj));
            setCachedValue("__webcraft_auth_expires_at", String(expiresAt));
            setCachedValue("__webcraft_auth_mode", authMode);
            setCachedValue("__webcraft_auth_authenticated", "true");
          } catch(e) {}
          dispatchAuthState({ token: token, refreshToken: refreshToken, expiresAt: expiresAt, user: userObj, isAuthenticated: true, authMode: authMode });
        }
        setLoading(false);
      })
      .catch(function(err) {
        showError(err.message || "\u767b\u5f55\u8bf7\u6c42\u5f02\u5e38");
        setLoading(false);
      });
  }

  if (btn) btn.addEventListener("click", function() {
    if (USE_DYNAMIC_PARAMS) { handleDynamicLogin(); return; }
    handleLogin();
  });
  if (passInput) passInput.addEventListener("keydown", function(e) {
    if (e.key === "Enter") {
      if (USE_DYNAMIC_PARAMS) { handleDynamicLogin(); return; }
      handleLogin();
    }
  });
  if (userInput) userInput.addEventListener("keydown", function(e) {
    if (e.key === "Enter" && passInput) passInput.focus();
  });
  if (USE_DYNAMIC_PARAMS) {
    AUTH_PARAMS.forEach(function(p) {
      var input = document.getElementById("login-dyn-" + p.id + "-${cid}");
      if (input) input.addEventListener("keydown", function(e) {
        if (e.key === "Enter") handleDynamicLogin();
      });
    });
  }
  if (smsCodeInput) smsCodeInput.addEventListener("keydown", function(e) {
    if (e.key === "Enter") handleLogin();
  });
  if (smsPhoneInput) smsPhoneInput.addEventListener("keydown", function(e) {
    if (e.key === "Enter" && smsCodeInput) smsCodeInput.focus();
  });

  // ─── v3 门禁联动：监听 auth-guard 唤起事件 ───
  var INITIALLY_HIDDEN = ${initiallyHidden};
  if (INITIALLY_HIDDEN && form) {
    window.addEventListener("webcraft-show-login", function(e) {
      form.style.display = "flex";
      // 尝试滚动到表单
      if (form.scrollIntoView) {
        try { form.scrollIntoView({ behavior: "smooth", block: "center" }); } catch(ex) {}
      }
    });

    // v5 联动闭环：登录成功后自动隐藏
    window.addEventListener("auth-state-change", function(e) {
      var detail = e.detail || {};
      if (detail.isAuthenticated && form) {
        form.style.display = "none";
      }
    });

    // v6 联动闭环：监听 guard 的 token 过期事件，触发刷新
    window.addEventListener("webcraft-token-expired", function(e) {
      if (typeof performRefresh === "function") {
        performRefresh();
      }
    });
  }
})();
`;
}
