import type { ComponentCodegenFn } from "../../types";
import { escapeHTML } from "../../layout";

/**
 * auth-register-form 组件 → HTML (v3 — 非侵入式动态字段)
 *
 * v3 改造核心：
 * - 字段列表完全由 config.fields 驱动，不再硬编码 username/password/confirmPassword/email
 * - 支持字段类型：text / password / email / number
 * - 每个字段可配置：name/label/type/required/placeholder/minLength/showToggle
 * - 验证逻辑完全从 fields 配置动态生成
 * - 防注入：所有配置值用 escapeHTML(JSON.stringify(value)) 双重防护
 *
 * 配置：apiUrl, method, title, buttonText, fields[], bgColor, textColor, borderColor,
 *        borderRadius, fontSize, buttonBgColor, buttonTextColor,
 *        tokenField, refreshTokenField, expiresInField, userField, autoLoginAfterRegister,
 *        tokenKey, tokenStorage, successText, redirectUrl, redirectDelay
 */
export const registerFormCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config;
  const apiUrl = String(c.apiUrl ?? "");
  const method = String(c.method ?? "POST");
  const title = String(c.title ?? "注册");
  const buttonText = String(c.buttonText ?? "注册");
  const bgColor = String(c.bgColor ?? "#ffffff");
  const textColor = String(c.textColor ?? "#333333");
  const borderColor = String(c.borderColor ?? "#e0e0e0");
  const borderRadius = Number(c.borderRadius ?? 8);
  const fontSize = Number(c.fontSize ?? 14);
  const buttonBgColor = String(c.buttonBgColor ?? "#1976d2");
  const buttonTextColor = String(c.buttonTextColor ?? "#ffffff");
  const tokenField = String(c.tokenField ?? "token");
  const refreshTokenField = String(c.refreshTokenField ?? "refreshToken");
  const expiresInField = String(c.expiresInField ?? "expiresIn");
  const userField = String(c.userField ?? "user");
  const autoLoginAfterRegister = Boolean(c.autoLoginAfterRegister ?? false);
  const tokenKey = String(c.tokenKey ?? "auth_token");
  const tokenStorage = String(c.tokenStorage ?? "localStorage");
  const successText = String(c.successText ?? "注册成功");
  const redirectUrl = String(c.redirectUrl ?? "/login");
  const redirectDelay = Number(c.redirectDelay ?? 1500);

  // 从 config 读取动态字段列表
  const rawFields = Array.isArray(c.fields) ? c.fields as Array<Record<string, unknown>> : [];
  const fields = rawFields.map((f, i) => ({
    name: String(f?.name ?? `field_${i}`),
    label: String(f?.label ?? f?.name ?? `字段${i + 1}`),
    type: (["text", "password", "email", "number"].includes(String(f?.type)) ? String(f?.type) : "text") as "text" | "password" | "email" | "number",
    required: Boolean(f?.required ?? false),
    placeholder: String(f?.placeholder ?? ""),
    minLength: parseInt(String(f?.minLength ?? "0"), 10),
    showToggle: Boolean(f?.showToggle ?? false),
  }));

  const cid = component.id;
  const focusColor = "#1976d2";

  const wrapperStyle = [
    "width: 100%",
    "height: 100%",
    "display: flex",
    "flex-direction: column",
    "justify-content: flex-start",
    `background: ${bgColor}`,
    `color: ${textColor}`,
    `border: 1px solid ${borderColor}`,
    `border-radius: ${borderRadius}px`,
    "padding: 24px",
    "box-sizing: border-box",
    "overflow: auto",
    "position: relative",
  ];

  let html = `<div style="${wrapperStyle.join("; ")}">`;

  if (title) {
    html += `<div style="font-size:${fontSize + 6}px;font-weight:600;text-align:center;margin-bottom:16px">${escapeHTML(title)}</div>`;
  }

  html += `<div id="register-error-${cid}" style="display:none;color:#f44336;background:rgba(244,67,54,0.08);border-radius:${borderRadius}px;padding:8px 12px;margin-bottom:12px;font-size:${fontSize - 1}px"></div>`;
  html += `<div id="register-success-${cid}" style="display:none;color:#4caf50;background:rgba(76,175,80,0.08);border-radius:${borderRadius}px;padding:8px 12px;margin-bottom:12px;font-size:${fontSize - 1}px"></div>`;

  // focus 样式
  const focusAttr = `onfocus="this.style.borderColor='${focusColor}'" onblur="this.style.borderColor='${borderColor}'"`;
  const inputStyle = `width:100%;padding:8px 12px;border:1px solid ${borderColor};border-radius:${borderRadius}px;font-size:${fontSize}px;margin-bottom:12px;box-sizing:border-box;outline:none;background:${bgColor};color:${textColor}`;

  // 动态生成表单字段 HTML
  for (const field of fields) {
    const inputId = `reg-f-${field.name}-${cid}`;
    const safePlaceholder = escapeHTML(field.placeholder || field.label);

    if (field.type === "password" && field.showToggle) {
      const pwdContainerStyle = `position:relative;margin-bottom:12px`;
      const eyeOnSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${fontSize + 4}" height="${fontSize + 4}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
      const eyeOffSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${fontSize + 4}" height="${fontSize + 4}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><path d="M2 2l20 20"/></svg>`;
      const toggleBtnStyle = `position:absolute;right:8px;top:50%;transform:translateY(-50%);border:none;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;color:${borderColor};padding:2px 4px`;
      const pwdInputStyle = inputStyle.replace("margin-bottom:12px", "margin-bottom:0");
      html += `<div style="${pwdContainerStyle}">`;
      html += `<input type="password" id="${inputId}" data-field-name="${escapeHTML(field.name)}" placeholder="${safePlaceholder}" style="${pwdInputStyle}" ${focusAttr} />`;
      html += `<button type="button" id="${inputId}-toggle" data-target="${inputId}" data-eye-on='${eyeOnSvg}' data-eye-off='${eyeOffSvg}' style="${toggleBtnStyle}">${eyeOnSvg}</button>`;
      html += `</div>`;
    } else {
      html += `<input type="${field.type}" id="${inputId}" data-field-name="${escapeHTML(field.name)}" placeholder="${safePlaceholder}" style="${inputStyle}" ${focusAttr} />`;
    }
  }

  // 按钮
  const btnId = `reg-btn-${cid}`;
  html += `<button id="${btnId}" style="width:100%;padding:8px 0;border:none;border-radius:${borderRadius}px;background:${buttonBgColor};color:${buttonTextColor};font-size:${fontSize}px;cursor:pointer;transition:opacity 0.2s">${escapeHTML(buttonText)}</button>`;
  html += `</div>`;

  // 防注入：所有配置值用 escapeHTML + JSON.stringify 双重防护
  const safeApiUrl = escapeHTML(JSON.stringify(apiUrl));
  const safeMethod = escapeHTML(JSON.stringify(method));
  const safeSuccessText = escapeHTML(JSON.stringify(successText));
  const safeRedirectUrl = escapeHTML(JSON.stringify(redirectUrl));
  const safeTokenField = escapeHTML(JSON.stringify(tokenField));
  const safeRefreshTokenField = escapeHTML(JSON.stringify(refreshTokenField));
  const safeExpiresInField = escapeHTML(JSON.stringify(expiresInField));
  const safeUserField = escapeHTML(JSON.stringify(userField));
  const safeTokenKey = escapeHTML(JSON.stringify(tokenKey));
  const safeTokenStorage = escapeHTML(JSON.stringify(tokenStorage));
  // 字段配置序列化注入到前端脚本
  const safeFieldsJson = escapeHTML(JSON.stringify(fields.map(f => ({
    name: f.name, label: f.label, type: f.type, required: f.required,
    minLength: f.minLength, showToggle: f.showToggle,
  }))));

  const regScript = `
(function() {
  var btn = document.getElementById("${btnId}");
  var errDiv = document.getElementById("register-error-${cid}");
  var succDiv = document.getElementById("register-success-${cid}");

  // 字段配置（从 codegen 注入，已防注入）
  var fieldConfigs = ${safeFieldsJson};
  var fieldInputs = {};
  fieldConfigs.forEach(function(fc) {
    var input = document.getElementById("reg-f-" + fc.name + "-${cid}");
    if (input) fieldInputs[fc.name] = input;
  });

  // loading 状态
  var isLoading = false;
  var originalText = btn ? btn.textContent : "";
  function setLoading(loading) {
    isLoading = loading;
    if (!btn) return;
    if (loading) {
      btn.disabled = true;
      btn.style.opacity = "0.6";
      btn.textContent = "\u52a0\u8f7d\u4e2d...";
    } else {
      btn.disabled = false;
      btn.style.opacity = "";
      btn.textContent = originalText;
    }
  }

  // 存储缓存值（token 配置优先读全局统一配置，未注入时回退组件自身配置）
  var TOKEN_KEY = window.__WC_TOKEN_KEY || ${safeTokenKey};
  var TOKEN_STORAGE = window.__WC_TOKEN_STORAGE || ${safeTokenStorage};
  var memoryCache = window.__webcraft_memory_cache = window.__webcraft_memory_cache || {};
  function getStorage() {
    if (TOKEN_STORAGE === "sessionStorage") { try { return sessionStorage; } catch(e) { return null; } }
    if (TOKEN_STORAGE === "localStorage") { try { return localStorage; } catch(e) { return null; } }
    return null;
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

  // dispatch auth-state-change 事件
  function dispatchAuthStateChange(detail) {
    window.dispatchEvent(new CustomEvent("auth-state-change", { detail: detail }));
  }

  // 密码可见性切换
  function setupToggle(toggleId) {
    var toggle = document.getElementById(toggleId);
    if (!toggle) return;
    toggle.addEventListener("click", function(e) {
      e.preventDefault();
      var targetId = toggle.getAttribute("data-target");
      var input = document.getElementById(targetId);
      if (!input) return;
      if (input.type === "password") {
        input.type = "text";
        toggle.innerHTML = toggle.getAttribute("data-eye-off");
      } else {
        input.type = "password";
        toggle.innerHTML = toggle.getAttribute("data-eye-on");
      }
    });
  }
  // 为所有有 showToggle 的字段注册切换
  fieldConfigs.forEach(function(fc) {
    if (fc.type === "password" && fc.showToggle) {
      setupToggle("reg-f-" + fc.name + "-${cid}-toggle");
    }
  });

  function showError(msg) { if (errDiv) { errDiv.textContent = msg; errDiv.style.display = "block"; } }
  function showSuccess(msg) { if (succDiv) { succDiv.textContent = msg; succDiv.style.display = "block"; } }
  function hideError() { if (errDiv) { errDiv.style.display = "none"; } }

  btn.addEventListener("click", function() {
    hideError();
    if (isLoading) return;

    // 动态验证：遍历 fields 配置
    var values = {};
    var firstError = null;
    var passwordFields = [];

    fieldConfigs.forEach(function(fc) {
      var input = fieldInputs[fc.name];
      var val = input ? input.value : "";
      values[fc.name] = val;

      if (fc.required && !val) {
        if (!firstError) firstError = "\u8bf7\u586b\u5199" + fc.label;
      }
      if (fc.minLength > 0 && val && val.length < fc.minLength) {
        if (!firstError) firstError = fc.label + "\u81f3\u5c11 " + fc.minLength + " \u4e2a\u5b57\u7b26";
      }
      if (fc.type === "email" && val) {
        var emailRegex = /[^\\s@]+@[^\\s@]+\\.[^\\s@]+/;
        if (!emailRegex.test(val)) {
          if (!firstError) firstError = fc.label + "\u683c\u5f0f\u4e0d\u6b63\u786e";
        }
      }
      if (fc.type === "password") {
        passwordFields.push(fc);
      }
    });

    if (firstError) {
      showError(firstError);
      return;
    }

    // 确认密码匹配：如果有 2 个密码字段
    if (passwordFields.length >= 2) {
      var v1 = values[passwordFields[0].name] || "";
      var v2 = values[passwordFields[1].name] || "";
      if (v1 && v2 && v1 !== v2) {
        showError(passwordFields[0].label + "\u4e0e" + passwordFields[1].label + "\u4e0d\u4e00\u81f4");
        return;
      }
    }

    var api = ${safeApiUrl};
    if (!api) {
      showError("\u672a\u914d\u7f6e\u6ce8\u518c API \u5730\u5740");
      return;
    }

    setLoading(true);

    // 动态构建请求体：只包含有值的字段
    var body = {};
    fieldConfigs.forEach(function(fc) {
      var val = values[fc.name];
      if (val) body[fc.name] = val;
    });

    fetch(api, {
      method: ${safeMethod},
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(function(res) {
      if (!res.ok) {
        return res.text().then(function(t) { throw new Error(t); });
      }
      var autoLogin = ${autoLoginAfterRegister};
      if (autoLogin) {
        return res.json().then(function(data) {
          var token = data[${safeTokenField}] || "";
          var refreshToken = data[${safeRefreshTokenField}] || "";
          var expiresInNum = data[${safeExpiresInField}] ? Number(data[${safeExpiresInField}]) : 0;
          var expiresAt = expiresInNum > 0 ? Date.now() + expiresInNum * 1000 : 0;
          var user = data[${safeUserField}] || null;

          if (token) {
            setCachedValue(TOKEN_KEY, token);
            if (refreshToken) setCachedValue("refreshToken", refreshToken);
            if (expiresAt) {
              setCachedValue("__webcraft_auth_expires_at", String(expiresAt));
              setCachedValue("__webcraft_auth_mode", "jwt");
            }
            setCachedValue("__webcraft_auth_authenticated", "true");
            if (user) setCachedValue("__webcraft_auth_user", JSON.stringify(user));

            dispatchAuthStateChange({
              token: token,
              user: user,
              isAuthenticated: true,
              authMode: "jwt"
            });
          }
        }).catch(function() {
          // 响应不是 JSON——不阻断成功流程
        });
      } else {
        return Promise.resolve();
      }
    }).then(function() {
      showSuccess(${safeSuccessText});
      setLoading(false);
      var redirect = ${safeRedirectUrl};
      var delay = ${redirectDelay};
      if (redirect && redirect !== "none") {
        if (delay > 0) {
          setTimeout(function() { window.location.href = redirect; }, delay);
        } else {
          window.location.href = redirect;
        }
      }
    }).catch(function(err) {
      showError(err.message || "\u6ce8\u518c\u5931\u8d25");
      setLoading(false);
    });
  });
})();
`;

  ctx.pageScripts.push(regScript);

  return html;
};
