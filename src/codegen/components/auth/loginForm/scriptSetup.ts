import type { LoginFormScriptVars } from "./scriptVars";

/**
 * auth-login-form 发布端脚本片段：元素引用、Tab 切换、验证码与短信发送。
 * 从 loginForm.ts 迁出，模板内容逐字保留。
 */
export function buildLoginFormScriptSetup(v: LoginFormScriptVars): string {
  const { cid, tokenStorage, tokenKey, tokenHeader, tokenPrefix, refreshEnabled, refreshThreshold, refreshEndpointPath, refreshEndpointMethod, headerConfigsJson, endpointsJson, usernameLabelColor, usernameFocusColor, usernameFontSize, passwordFontSize, showTenantField, tenantHeaderName, tenantDefaultValue, showCaptcha, captchaEndpoint, loginType, smsCodeLength, smsButtonText, smsEndpoint, smsCooldown, useDynamicParams, authParams, authParamsJson, escapeHTML } = v;
  return `
(function() {
  var form = document.getElementById("login-form-${cid}");
  var btn = document.getElementById("login-btn-${cid}");
  var userInput = document.getElementById("login-user-${cid}");
  var passInput = document.getElementById("login-pass-${cid}");
  var errDiv = document.getElementById("login-error-${cid}");
  var btnText = document.getElementById("login-btn-text-${cid}");
  var btnSpinner = document.getElementById("login-btn-spinner-${cid}");
  var rememberInput = document.getElementById("login-remember-${cid}");
  var passToggle = document.getElementById("login-pass-toggle-${cid}");

  // ─── v5 新增元素引用 ───
  var tenantInput = document.getElementById("login-tenant-${cid}");
  var captchaInput = document.getElementById("login-captcha-${cid}");
  var captchaImg = document.getElementById("login-captcha-img-${cid}");
  var pwdSection = document.getElementById("login-pwd-section-${cid}");
  var smsSection = document.getElementById("login-sms-section-${cid}");
  var tabPwd = document.getElementById("login-tab-pwd-${cid}");
  var tabSms = document.getElementById("login-tab-sms-${cid}");
  var smsPhoneInput = document.getElementById("login-sms-phone-${cid}");
  var smsCodeInput = document.getElementById("login-sms-code-${cid}");
  var smsBtn = document.getElementById("login-sms-btn-${cid}");
  var rememberSmsInput = document.getElementById("login-remember-sms-${cid}");

  // v5 配置
  var SHOW_TENANT = ${showTenantField && !useDynamicParams};
  var TENANT_HEADER = ${JSON.stringify(tenantHeaderName)};
  var TENANT_DEFAULT = ${JSON.stringify(tenantDefaultValue)};
  var SHOW_CAPTCHA = ${showCaptcha && !useDynamicParams};
  var CAPTCHA_ENDPOINT = ${JSON.stringify(captchaEndpoint)};
  var LOGIN_TYPE = "${loginType}";
  var SMS_ENDPOINT = ${JSON.stringify(smsEndpoint)};
  var SMS_COOLDOWN = ${smsCooldown};
  var SMS_CODE_LENGTH = ${smsCodeLength};
  var activeTab = "password";

  // v5 动态参数模式
  var USE_DYNAMIC_PARAMS = ${useDynamicParams && authParams.length > 0};
  var AUTH_PARAMS = ${authParamsJson};

  // 密码 show/hide SVG（动态参数模式也需要）
  var EYE_ON_DYN = '<svg xmlns="http://www.w3.org/2000/svg" width="${usernameFontSize + 4}" height="${usernameFontSize + 4}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
  var EYE_OFF_DYN = '<svg xmlns="http://www.w3.org/2000/svg" width="${usernameFontSize + 4}" height="${usernameFontSize + 4}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><path d="M2 2l20 20"/></svg>';

  // 动态参数密码切换
  if (USE_DYNAMIC_PARAMS) {
    AUTH_PARAMS.forEach(function(p) {
      if (!p.isSecret) return;
      var input = document.getElementById("login-dyn-" + p.id + "-${cid}");
      var toggle = document.getElementById("login-dyn-toggle-" + p.id + "-${cid}");
      if (!input || !toggle) return;
      toggle.innerHTML = EYE_ON_DYN;
      toggle.addEventListener("click", function(e) {
        e.preventDefault();
        e.stopPropagation();
        if (input.type === "password") {
          input.type = "text";
          toggle.innerHTML = EYE_OFF_DYN;
        } else {
          input.type = "password";
          toggle.innerHTML = EYE_ON_DYN;
        }
      });
    });
  }

  // ─── v3 配置驱动：Token 存储配置（优先读全局统一配置，未注入时回退组件自身配置） ───
  var TOKEN_STORAGE = window.__WC_TOKEN_STORAGE || "${tokenStorage}";
  var TOKEN_KEY = window.__WC_TOKEN_KEY || "${tokenKey}";
  var TOKEN_HEADER = window.__WC_TOKEN_HEADER || "${tokenHeader}";
  var TOKEN_PREFIX = window.__WC_TOKEN_PREFIX ?? ${JSON.stringify(tokenPrefix)};

  // ─── v3 配置驱动：自定义 Header 配置（多租户等） ───
  var HEADER_CONFIGS = ${headerConfigsJson};

  // ─── v4 端点编排：统一管理 login/logout/refresh/userInfo ───
  var ENDPOINTS = ${endpointsJson};

  // 查找端点
  function findEndpoint(type) {
    for (var i = 0; i < ENDPOINTS.length; i++) {
      if (ENDPOINTS[i].endpointType === type) return ENDPOINTS[i];
    }
    return null;
  }

  // ─── v7 请求内容类型编码（与编辑器运行时 encodeAuthBody 语义一致） ───
  // 兼容旧行为：默认 json；纯 formData 用 FormData；配置 form/formData 时完全按配置编码。
  // 返回 { headers, body, forceNoContentType }
  function encodeAuthBody(bodyParams, formDataParts, contentType) {
    var kind = (contentType || "").trim().toLowerCase();
    var isForm = kind === "form" || kind === "application/x-www-form-urlencoded";
    var isFormData = kind === "formdata" || kind === "multipart/form-data" || kind === "multipart";

    bodyParams = bodyParams || {};
    formDataParts = formDataParts || [];

    // form：显式表单编码
    if (isForm) {
      var sp = new URLSearchParams();
      for (var k in bodyParams) if (Object.prototype.hasOwnProperty.call(bodyParams, k)) sp.append(k, bodyParams[k] == null ? "" : String(bodyParams[k]));
      for (var fi = 0; fi < formDataParts.length; fi++) sp.append(formDataParts[fi].key, formDataParts[fi].value);
      return { headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: sp.toString(), forceNoContentType: false };
    }

    // formData：多部分表单，浏览器自动 boundary
    if (isFormData) {
      var fd = new FormData();
      for (var bk in bodyParams) if (Object.prototype.hasOwnProperty.call(bodyParams, bk)) fd.append(bk, bodyParams[bk] == null ? "" : String(bodyParams[bk]));
      for (var fj = 0; fj < formDataParts.length; fj++) fd.append(formDataParts[fj].key, formDataParts[fj].value);
      return { headers: {}, body: fd, forceNoContentType: true };
    }

    // 默认 JSON（兼容旧行为：纯 formData 用 FormData，否则打平为 JSON body）
    var pureFormData = formDataParts.length > 0 && Object.keys(bodyParams).length === 0;
    if (pureFormData) {
      var fd2 = new FormData();
      for (var fk = 0; fk < formDataParts.length; fk++) fd2.append(formDataParts[fk].key, formDataParts[fk].value);
      return { headers: {}, body: fd2, forceNoContentType: true };
    }
    var merged = {};
    for (var mk in bodyParams) if (Object.prototype.hasOwnProperty.call(bodyParams, mk)) merged[mk] = bodyParams[mk];
    for (var mj = 0; mj < formDataParts.length; mj++) merged[formDataParts[mj].key] = formDataParts[mj].value;
    return { headers: { "Content-Type": "application/json" }, body: JSON.stringify(merged), forceNoContentType: false };
  }

  // ─── v3 配置驱动：Token 刷新配置 ───
  var REFRESH_ENABLED = ${refreshEnabled};
  var REFRESH_THRESHOLD = ${refreshThreshold};
  var REFRESH_ENDPOINT_PATH = ${JSON.stringify(refreshEndpointPath)};
  var REFRESH_ENDPOINT_METHOD = "${refreshEndpointMethod}";

  // 密码 show/hide 切换（SVG 字符串内联在 JS 中）
  var EYE_ON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="${passwordFontSize + 4}" height="${passwordFontSize + 4}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
  var EYE_OFF_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="${passwordFontSize + 4}" height="${passwordFontSize + 4}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><path d="M2 2l20 20"/></svg>';
  if (passToggle && passInput) {
    passToggle.innerHTML = EYE_ON_SVG;
    passToggle.addEventListener("click", function(e) {
      e.preventDefault();
      e.stopPropagation();
      if (passInput.type === "password") {
        passInput.type = "text";
        passToggle.innerHTML = EYE_OFF_SVG;
      } else {
        passInput.type = "password";
        passToggle.innerHTML = EYE_ON_SVG;
      }
    });
  }

  // ─── v5 Tab 切换逻辑 ───
  function switchTab(tab) {
    activeTab = tab;
    if (tab === "password") {
      if (pwdSection) pwdSection.style.display = "flex";
      if (smsSection) smsSection.style.display = "none";
      if (tabPwd) { tabPwd.style.fontWeight = "600"; tabPwd.style.color = "${usernameFocusColor}"; tabPwd.style.borderBottom = "2px solid ${usernameFocusColor}"; }
      if (tabSms) { tabSms.style.fontWeight = "400"; tabSms.style.color = "${usernameLabelColor}"; tabSms.style.borderBottom = "2px solid transparent"; }
    } else {
      if (pwdSection) pwdSection.style.display = "none";
      if (smsSection) smsSection.style.display = "flex";
      if (tabPwd) { tabPwd.style.fontWeight = "400"; tabPwd.style.color = "${usernameLabelColor}"; tabPwd.style.borderBottom = "2px solid transparent"; }
      if (tabSms) { tabSms.style.fontWeight = "600"; tabSms.style.color = "${usernameFocusColor}"; tabSms.style.borderBottom = "2px solid ${usernameFocusColor}"; }
    }
  }
  if (tabPwd) tabPwd.addEventListener("click", function() { switchTab("password"); });
  if (tabSms) tabSms.addEventListener("click", function() { switchTab("sms"); });

  // ─── v5 验证码图片刷新 ───
  function refreshCaptchaImage() {
    if (!captchaImg || !CAPTCHA_ENDPOINT) return;
    var sep = CAPTCHA_ENDPOINT.includes("?") ? "&" : "?";
    captchaImg.src = CAPTCHA_ENDPOINT + sep + "_t=" + Date.now();
  }
  if (captchaImg) {
    refreshCaptchaImage();
    captchaImg.addEventListener("click", refreshCaptchaImage);
  }

  // ─── v5 短信验证码发送 ───
  var smsCountdown = 0;
  var smsTimer = null;
  function startSmsCountdown() {
    smsCountdown = SMS_COOLDOWN;
    if (smsBtn) {
      smsBtn.disabled = true;
      smsBtn.textContent = smsCountdown + "s";
    }
    smsTimer = setInterval(function() {
      smsCountdown--;
      if (smsBtn) smsBtn.textContent = smsCountdown + "s";
      if (smsCountdown <= 0) {
        clearInterval(smsTimer);
        if (smsBtn) {
          smsBtn.disabled = false;
          smsBtn.textContent = "${escapeHTML(smsButtonText)}";
        }
      }
    }, 1000);
  }

  function sendSms() {
    if (!smsPhoneInput || !smsPhoneInput.value) {
      showError("\u8bf7\u8f93\u5165\u624b\u673a\u53f7");
      return;
    }
    if (!SMS_ENDPOINT) {
      showError("\u672a\u914d\u7f6e\u77ed\u4fe1\u53d1\u9001 API");
      return;
    }
    var headers = { "Content-Type": "application/json" };
    if (SHOW_TENANT && TENANT_HEADER) {
      var tv = (tenantInput ? tenantInput.value : "") || TENANT_DEFAULT;
      if (tv) headers[TENANT_HEADER] = tv;
    }
    if (smsBtn) { smsBtn.disabled = true; smsBtn.textContent = "\u53d1\u9001\u4e2d..."; }
    fetch(SMS_ENDPOINT, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({ phone: smsPhoneInput.value })
    })
      .then(function(res) {
        if (!res.ok) {
          return res.text().then(function(t) { throw new Error("\u53d1\u9001\u5931\u8d25 (" + res.status + "): " + t); });
        }
        return res.json().catch(function() { return {}; });
      })
      .then(function() {
        startSmsCountdown();
      })
      .catch(function(err) {
        showError(err.message || "\u53d1\u9001\u5f02\u5e38");
        if (smsBtn) { smsBtn.disabled = false; smsBtn.textContent = "${escapeHTML(smsButtonText)}"; }
      });
  }
  if (smsBtn) smsBtn.addEventListener("click", sendSms);

  // 按点号路径从响应对象取值（登录/刷新/自动探测共用）
  function getNested(obj, path) {
    if (!obj || !path) return undefined;
    var keys = path.replace(/\\[(\\d+)\\]/g, ".$1").split(".");
    var cur = obj;
    for (var i = 0; i < keys.length; i++) {
      if (cur === null || cur === undefined) return undefined;
      cur = cur[keys[i]];
    }
    return cur;
  }

  function parseExpiresIn(val) {
    if (val === undefined || val === null) return 0;
    var n = typeof val === "number" ? val : Number(val);
    if (!isNaN(n)) {
      if (n > 1e12) return n;
      return Date.now() + n * 1000;
    }
    var d = new Date(String(val));
    if (!isNaN(d.getTime())) return d.getTime();
    return 0;
  }

  function dispatchAuthState(detail) {
    window.dispatchEvent(new CustomEvent("auth-state-change", { detail: detail }));
  }
`;
}
