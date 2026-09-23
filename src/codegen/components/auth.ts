import type { ComponentCodegenFn } from "../types";
import { escapeHTML, toJsString } from "../layout";
import { generateChildHTML } from "../engine";

/**
 * auth-login-form 组件 → HTML (v2 分元素配置)
 *
 * 每个元素独立配置样式：容器 / 标题 / 副标题 / 用户名输入框 / 密码输入框 /
 * 登录按钮 / 记住我 / 忘记密码 / 错误提示。
 *
 * 三层字段名与 defaultConfig 严格一致。
 *
 * 发布产物中：
 * - Session 模式：fetch credentials:include，从响应提取 user
 * - JWT 模式：fetch 后从响应提取 token/refreshToken/user/expiresIn，存入 localStorage
 * - Basic 模式：btoa(user:pass) 存入 localStorage
 * - 登录成功后 dispatch CustomEvent("auth-state-change")
 * - HttpAdapter 401 自动刷新通过监听 auth-token 事件实现
 */
export const loginFormCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config;
  const cid = component.id;

  // ─── API 配置 ───
  const authMode = String(c.authMode ?? "jwt");
  const apiUrl = String(c.apiUrl ?? "");
  const method = String(c.method ?? "POST");
  const tokenField = String(c.tokenField ?? "token");
  const refreshTokenField = String(c.refreshTokenField ?? "refreshToken");
  const expiresInField = String(c.expiresInField ?? "expiresIn");
  const userField = String(c.userField ?? "user");

  // ─── Token 存储配置（v3 配置驱动） ───
  const tokenStorage = String(c.tokenStorage ?? "localStorage");
  const tokenKey = String(c.tokenKey ?? "auth_token");
  const tokenHeader = String(c.tokenHeader ?? "Authorization");
  const tokenPrefix = String(c.tokenPrefix ?? "Bearer ");

  // ─── Token 刷新配置（v3 配置驱动） ───
  const refreshEnabled = Boolean(c.refreshEnabled ?? false);
  const refreshThreshold = Number(c.refreshThreshold ?? 30);
  const refreshEndpointPath = String(c.refreshEndpointPath ?? "");
  const refreshEndpointMethod = String(c.refreshEndpointMethod ?? "POST");

  // ─── v6 响应成败判断配置（通用化：不绑定任何特定后端的业务码） ───
  const validationCodePath = String(c.codeField ?? "");
  const validationMsgPath = String(c.msgField ?? "msg");
  const validationSuccessCodes = (() => {
    const raw = c.successCodes;
    const nums = typeof raw === "string"
      ? raw.split(",").map(s => Number(s.trim())).filter(n => !isNaN(n))
      : Array.isArray(raw)
        ? raw.map(Number).filter((n: number) => !isNaN(n))
        : [];
    return nums.length > 0 ? nums : [0, 200];
  })();
  const validationMsgFallback = String(c.msgFallback ?? "请求失败");

  // ─── 自定义 Header 配置（v3 配置驱动，多租户等） ───
  const headerConfigsRaw = c.headerConfigs as Array<{ headerName: string; valueTemplate: string }> | undefined;
  const headerConfigs = headerConfigsRaw ?? [];

  // ─── 端点编排（v4 统一管理） ───
  const endpointsRaw = c.endpoints as Array<{
    id: string; name: string; path: string; method: string;
    endpointType?: string; contentType?: string;
    responseMapping?: Array<{ sourcePath: string; targetKey: string; saveToCache: boolean; isExpirationTime?: boolean }>;
  }> | undefined;
  const endpoints = endpointsRaw ?? [];

  // ─── JSON 序列化的配置（用于 JS 中读取） ───
  const headerConfigsJson = JSON.stringify(headerConfigs.map(h => ({ headerName: h.headerName, valueTemplate: h.valueTemplate })));
  const endpointsJson = JSON.stringify(endpoints.map(ep => ({
    id: ep.id, name: ep.name, path: ep.path, method: ep.method,
    endpointType: ep.endpointType || "other",
    contentType: ep.contentType || "",
    responseMapping: ep.responseMapping || [
      { sourcePath: tokenField, targetKey: tokenKey, saveToCache: true },
      { sourcePath: refreshTokenField, targetKey: "refreshToken", saveToCache: true },
      { sourcePath: expiresInField, targetKey: "expiresIn", saveToCache: true, isExpirationTime: true },
    ],
  })));

  // ─── 容器样式 ───
  const containerBgColor = String(c.containerBgColor ?? "#ffffff");
  const containerBorderColor = String(c.containerBorderColor ?? "#e0e0e0");
  const containerBorderRadius = Number(c.containerBorderRadius ?? 12);
  const containerPadding = Number(c.containerPadding ?? 32);
  const containerShadow = String(c.containerShadow ?? "none");
  const fieldGap = Number(c.fieldGap ?? 16);
  const initiallyHidden = Boolean(c.initiallyHidden ?? false);

  // ─── 标题 ───
  const showTitle = Boolean(c.showTitle ?? true);
  const titleText = String(c.titleText ?? "登录");
  const titleFontSize = Number(c.titleFontSize ?? 22);
  const titleColor = String(c.titleColor ?? "#1a1a2e");
  const titleFontWeight = Number(c.titleFontWeight ?? 700);
  const titleAlign = String(c.titleAlign ?? "center");
  const titleMarginBottom = Number(c.titleMarginBottom ?? 4);

  // ─── 副标题 ───
  const showSubtitle = Boolean(c.showSubtitle ?? false);
  const subtitleText = String(c.subtitleText ?? "请输入您的账号信息");
  const subtitleFontSize = Number(c.subtitleFontSize ?? 13);
  const subtitleColor = String(c.subtitleColor ?? "#999999");
  const subtitleAlign = String(c.subtitleAlign ?? "center");

  // ─── 用户名输入框 ───
  const usernameLabel = String(c.usernameLabel ?? "用户名");
  const usernameLabelColor = String(c.usernameLabelColor ?? "#666666");
  const usernamePlaceholder = String(c.usernamePlaceholder ?? "请输入用户名");
  const usernameBgColor = String(c.usernameBgColor ?? "#f5f5f5");
  const usernameTextColor = String(c.usernameTextColor ?? "#333333");
  const usernameBorderColor = String(c.usernameBorderColor ?? "#d0d0d8");
  const usernameFocusColor = String(c.usernameFocusColor ?? "#1976d2");
  const usernameBorderRadius = Number(c.usernameBorderRadius ?? 8);
  const usernameHeight = Number(c.usernameHeight ?? 42);
  const usernameFontSize = Number(c.usernameFontSize ?? 14);

  // ─── 密码输入框 ───
  const passwordLabel = String(c.passwordLabel ?? "密码");
  const passwordLabelColor = String(c.passwordLabelColor ?? "#666666");
  const passwordPlaceholder = String(c.passwordPlaceholder ?? "请输入密码");
  const passwordBgColor = String(c.passwordBgColor ?? "#f5f5f5");
  const passwordTextColor = String(c.passwordTextColor ?? "#333333");
  const passwordBorderColor = String(c.passwordBorderColor ?? "#d0d0d8");
  const passwordFocusColor = String(c.passwordFocusColor ?? "#1976d2");
  const passwordBorderRadius = Number(c.passwordBorderRadius ?? 8);
  const passwordHeight = Number(c.passwordHeight ?? 42);
  const passwordFontSize = Number(c.passwordFontSize ?? 14);
  const passwordShowToggle = Boolean(c.passwordShowToggle ?? true);

  // ─── 登录按钮 ───
  const buttonText = String(c.buttonText ?? "登录");
  const buttonBgColor = String(c.buttonBgColor ?? "#1976d2");
  const buttonTextColor = String(c.buttonTextColor ?? "#ffffff");
  const buttonHoverColor = String(c.buttonHoverColor ?? "#1565c0");
  const buttonFontSize = Number(c.buttonFontSize ?? 15);
  const buttonBorderRadius = Number(c.buttonBorderRadius ?? 8);
  const buttonHeight = Number(c.buttonHeight ?? 44);
  const buttonFullWidth = Boolean(c.buttonFullWidth ?? true);

  // ─── 记住我 ───
  const showRemember = Boolean(c.showRemember ?? false);
  const rememberLabel = String(c.rememberLabel ?? "记住我");
  const rememberFontSize = Number(c.rememberFontSize ?? 13);
  const rememberColor = String(c.rememberColor ?? "#666666");
  const rememberAccentColor = String(c.rememberAccentColor ?? "#1976d2");

  // ─── 忘记密码 ───
  const showForgot = Boolean(c.showForgot ?? false);
  const forgotText = String(c.forgotText ?? "忘记密码？");
  const forgotUrl = String(c.forgotUrl ?? "");
  const forgotLinkColor = String(c.forgotLinkColor ?? "#1976d2");
  const forgotFontSize = Number(c.forgotFontSize ?? 13);

  // ─── 错误提示 ───
  const errorBgColor = String(c.errorBgColor ?? "#fff3f3");
  const errorTextColor = String(c.errorTextColor ?? "#f44336");
  const errorBorderRadius = Number(c.errorBorderRadius ?? 8);

  // ═══ v5 多租户 ═══
  const showTenantField = Boolean(c.showTenantField ?? false);
  const tenantLabel = String(c.tenantLabel ?? "租户ID");
  const tenantPlaceholder = String(c.tenantPlaceholder ?? "请输入租户ID");
  const tenantRequired = Boolean(c.tenantRequired ?? false);
  const tenantHeaderName = String(c.tenantHeaderName ?? "tenant-id");
  const tenantDefaultValue = String(c.tenantDefaultValue ?? "");
  const tenantBgColor = String(c.tenantBgColor ?? "#f5f5f5");
  const tenantTextColor = String(c.tenantTextColor ?? "#333333");
  const tenantBorderColor = String(c.tenantBorderColor ?? "#d0d0d8");
  const tenantFocusColor = String(c.tenantFocusColor ?? "#1976d2");
  const tenantBorderRadius = Number(c.tenantBorderRadius ?? 8);
  const tenantHeight = Number(c.tenantHeight ?? 42);
  const tenantFontSize = Number(c.tenantFontSize ?? 14);
  const tenantLabelColor = String(c.tenantLabelColor ?? "#666666");

  // ═══ v5 验证码 ═══
  const showCaptcha = Boolean(c.showCaptcha ?? false);
  const captchaType = String(c.captchaType ?? "image");
  const captchaLabel = String(c.captchaLabel ?? "图形验证码");
  const captchaPlaceholder = String(c.captchaPlaceholder ?? "请输入验证码");
  const captchaEndpoint = String(c.captchaEndpoint ?? "");
  const captchaWidth = Number(c.captchaWidth ?? 120);
  const captchaHeight = Number(c.captchaHeight ?? 40);
  const captchaBgColor = String(c.captchaBgColor ?? "#f5f5f5");
  const captchaTextColor = String(c.captchaTextColor ?? "#333333");
  const captchaBorderColor = String(c.captchaBorderColor ?? "#d0d0d8");
  const captchaBorderRadius = Number(c.captchaBorderRadius ?? 8);
  const captchaFontSize = Number(c.captchaFontSize ?? 14);
  const captchaRefreshColor = String(c.captchaRefreshColor ?? "#1976d2");

  // ═══ v5 短信登录 ═══
  const loginType = String(c.loginType ?? "password");
  const smsLabel = String(c.smsLabel ?? "手机号");
  const smsPlaceholder = String(c.smsPlaceholder ?? "请输入手机号");
  const smsCodeLabel = String(c.smsCodeLabel ?? "验证码");
  const smsCodePlaceholder = String(c.smsCodePlaceholder ?? "请输入验证码");
  const smsCodeLength = Number(c.smsCodeLength ?? 6);
  const smsButtonText = String(c.smsButtonText ?? "获取验证码");
  const smsEndpoint = String(c.smsEndpoint ?? "");
  const smsCooldown = Number(c.smsCooldown ?? 60);
  const smsBgColor = String(c.smsBgColor ?? "#f5f5f5");
  const smsTextColor = String(c.smsTextColor ?? "#333333");
  const smsBorderColor = String(c.smsBorderColor ?? "#d0d0d8");
  const smsBorderRadius = Number(c.smsBorderRadius ?? 8);
  const smsHeight = Number(c.smsHeight ?? 42);
  const smsFontSize = Number(c.smsFontSize ?? 14);
  const smsLabelColor = String(c.smsLabelColor ?? "#666666");
  const smsCodeBgColor = String(c.smsCodeBgColor ?? "#f5f5f5");
  const smsCodeTextColor = String(c.smsCodeTextColor ?? "#333333");
  const smsCodeBorderColor = String(c.smsCodeBorderColor ?? "#d0d0d8");
  const smsCodeBorderRadius = Number(c.smsCodeBorderRadius ?? 8);
  const smsCodeHeight = Number(c.smsCodeHeight ?? 42);
  const smsCodeFontSize = Number(c.smsCodeFontSize ?? 14);
  const smsCodeLabelColor = String(c.smsCodeLabelColor ?? "#666666");
  const smsButtonBgColor = String(c.smsButtonBgColor ?? "#1976d2");
  const smsButtonTextColor = String(c.smsButtonTextColor ?? "#ffffff");
  const smsButtonFontSize = Number(c.smsButtonFontSize ?? 13);
  const smsButtonBorderRadius = Number(c.smsButtonBorderRadius ?? 8);
  const smsButtonHoverColor = String(c.smsButtonHoverColor ?? "#1565c0");

  // ═══ v5 社交登录 ═══
  const showSocialLogin = Boolean(c.showSocialLogin ?? false);
  const socialLoginTitle = String(c.socialLoginTitle ?? "其他登录方式");
  const socialLoginTitleColor = String(c.socialLoginTitleColor ?? "#999999");
  const socialLoginTitleFontSize = Number(c.socialLoginTitleFontSize ?? 12);
  const socialLoginGap = Number(c.socialLoginGap ?? 12);
  const socialLoginBgColor = String(c.socialLoginBgColor ?? "#f8f8f8");
  const socialLoginBorderRadius = Number(c.socialLoginBorderRadius ?? 20);
  const socialLoginSize = Number(c.socialLoginSize ?? 40);
  const socialLoginLayout = String(c.socialLoginLayout ?? "row");
  const socialButtonsRaw = c.socialButtons as Array<{
    id: string; label: string; icon: string; authUrl: string; bgColor: string; textColor: string;
  }> | undefined;
  const socialButtons = socialButtonsRaw ?? [];

  // v5 派生
  const showPasswordMode = loginType === "password" || loginType === "both";
  const showSmsMode = loginType === "sms" || loginType === "both";

  // ═══ v5 动态认证参数 ═══
  const useDynamicParams = Boolean(c.useDynamicParams ?? false);
  const authParamsRaw = c.authParams as Array<{
    id: string; key: string; label: string; value: string;
    location: string; required: boolean; isSecret?: boolean; description?: string;
  }> | undefined;
  const authParams = authParamsRaw ?? [];
  const authParamsJson = JSON.stringify(authParams);

  // ─── 构建内联 CSS 输入框工厂 ───
  const inputStyle = (opts: {
    bgColor: string; textColor: string; borderColor: string;
    radius: number; height: number; fontSize: number;
  }) => [
    `width:100%`,
    `height:${opts.height}px`,
    `padding:0 12px`,
    `border:1px solid ${opts.borderColor}`,
    `border-radius:${opts.radius}px`,
    `font-size:${opts.fontSize}px`,
    `box-sizing:border-box`,
    `outline:none`,
    `background:${opts.bgColor}`,
    `color:${opts.textColor}`,
    `transition:border-color 0.2s`,
  ].join(";");

  const focusHandler = (origColor: string, focusColor: string) =>
    `onfocus="this.style.borderColor='${focusColor}'" onblur="this.style.borderColor='${origColor}'"`;

  const labelStyle = (color: string, fontSize: number) =>
    `display:block;font-size:${fontSize}px;color:${color};margin-bottom:4px`;

  // ─── 容器 ───
  const wrapperStyle = [
    "width: 100%",
    "height: 100%",
    "display: " + (initiallyHidden ? "none" : "flex"),
    "flex-direction: column",
    "justify-content: flex-start",
    `background: ${containerBgColor}`,
    `border: 1px solid ${containerBorderColor}`,
    `border-radius: ${containerBorderRadius}px`,
    `padding: ${containerPadding}px`,
    "box-sizing: border-box",
    `box-shadow: ${containerShadow}`,
    "overflow: auto",
    `gap: ${fieldGap}px`,
  ];

  let html = `<div id="login-form-${cid}" style="${wrapperStyle.join("; ")}">`;

  // ─── 标题 ───
  if (showTitle) {
    html += `<div style="font-size:${titleFontSize}px;font-weight:${titleFontWeight};color:${titleColor};text-align:${titleAlign};margin:0 0 ${titleMarginBottom}px 0;line-height:1.3">${escapeHTML(titleText)}</div>`;
  }

  // ─── 副标题 ───
  if (showSubtitle) {
    html += `<div style="font-size:${subtitleFontSize}px;color:${subtitleColor};text-align:${subtitleAlign};margin:0;line-height:1.4">${escapeHTML(subtitleText)}</div>`;
  }

  // ─── 错误提示 ───
  html += `<div id="login-error-${cid}" style="display:none;color:${errorTextColor};background:${errorBgColor};border-radius:${errorBorderRadius}px;padding:8px 12px;font-size:${Math.max(usernameFontSize - 1, 11)}px"></div>`;

  // ─── v5 Tab 切换（loginType=both 时显示） ───
  if (loginType === "both") {
    html += `<div id="login-tabs-${cid}" style="display:flex;gap:4px;border-bottom:1px solid ${usernameBorderColor};flex-shrink:0">`;
    html += `<div id="login-tab-pwd-${cid}" data-tab="password" style="padding:6px 16px;font-size:${usernameFontSize}px;font-weight:600;color:${usernameFocusColor};border-bottom:2px solid ${usernameFocusColor};margin-bottom:-1px;cursor:pointer">账号密码</div>`;
    html += `<div id="login-tab-sms-${cid}" data-tab="sms" style="padding:6px 16px;font-size:${usernameFontSize}px;font-weight:400;color:${usernameLabelColor};border-bottom:2px solid transparent;margin-bottom:-1px;cursor:pointer">手机验证码</div>`;
    html += `</div>`;
  }

  // ─── v5 多租户输入框 ───
  if (showTenantField && !useDynamicParams) {
    html += `<label for="login-tenant-${cid}" style="${labelStyle(tenantLabelColor, tenantFontSize)}">${escapeHTML(tenantLabel)}${tenantRequired ? " *" : ""}</label>`;
    html += `<input type="text" id="login-tenant-${cid}" placeholder="${escapeHTML(tenantPlaceholder)}" value="${escapeHTML(tenantDefaultValue)}" style="${inputStyle({ bgColor: tenantBgColor, textColor: tenantTextColor, borderColor: tenantBorderColor, radius: tenantBorderRadius, height: tenantHeight, fontSize: tenantFontSize })}" ${focusHandler(tenantBorderColor, tenantFocusColor)} />`;
  }

  // ═══ v5 动态参数模式区域 ═══
  if (useDynamicParams && authParams.length > 0) {
    html += `<div id="login-dynamic-section-${cid}" style="display:flex;flex-direction:column;gap:${fieldGap}px">`;
    for (const param of authParams) {
      const pType = param.isSecret ? "password" : "text";
      const pLabel = escapeHTML(param.label) + (param.required ? " *" : "");
      const pPlaceholder = escapeHTML(param.description || `请输入${param.label}`);
      const pStyle = inputStyle({ bgColor: usernameBgColor, textColor: usernameTextColor, borderColor: usernameBorderColor, radius: usernameBorderRadius, height: usernameHeight, fontSize: usernameFontSize });
      const pFocus = focusHandler(usernameBorderColor, usernameFocusColor);
      html += `<label for="login-dyn-${param.id}-${cid}" style="${labelStyle(usernameLabelColor, usernameFontSize)}">${pLabel}</label>`;
      if (param.isSecret) {
        const eyeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${usernameFontSize + 4}" height="${usernameFontSize + 4}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
        html += `<div style="position:relative">`;
        html += `<input type="password" id="login-dyn-${param.id}-${cid}" data-param-id="${param.id}" data-param-key="${escapeHTML(param.key)}" data-param-location="${param.location}" data-param-required="${param.required}" placeholder="${pPlaceholder}" style="${pStyle};padding-right:40px" ${pFocus} />`;
        html += `<span id="login-dyn-toggle-${param.id}-${cid}" data-toggle-for="${param.id}" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);cursor:pointer;user-select:none;display:flex;align-items:center;justify-content:center;color:${usernameBorderColor}">${eyeSvg}</span>`;
        html += `</div>`;
      } else {
        html += `<input type="${pType}" id="login-dyn-${param.id}-${cid}" data-param-id="${param.id}" data-param-key="${escapeHTML(param.key)}" data-param-location="${param.location}" data-param-required="${param.required}" placeholder="${pPlaceholder}" style="${pStyle}" ${pFocus} />`;
      }
    }
    html += `</div>`;
  }

  // ═══ v5 密码模式区域 ═══
  if (showPasswordMode && !useDynamicParams) {
    const pwdDisplay = loginType === "both" ? "" : "";
    html += `<div id="login-pwd-section-${cid}" style="display:${pwdDisplay};flex-direction:column;gap:${fieldGap}px">`;

    // ─── 用户名输入框 ───
    html += `<label for="login-user-${cid}" style="${labelStyle(usernameLabelColor, usernameFontSize)}">${escapeHTML(usernameLabel)}</label>`;
    html += `<input type="text" id="login-user-${cid}" placeholder="${escapeHTML(usernamePlaceholder)}" style="${inputStyle({ bgColor: usernameBgColor, textColor: usernameTextColor, borderColor: usernameBorderColor, radius: usernameBorderRadius, height: usernameHeight, fontSize: usernameFontSize })}" ${focusHandler(usernameBorderColor, usernameFocusColor)} />`;

    // ─── 密码输入框 ───
    html += `<label for="login-pass-${cid}" style="${labelStyle(passwordLabelColor, passwordFontSize)}">${escapeHTML(passwordLabel)}</label>`;
    const pwdStyle = inputStyle({ bgColor: passwordBgColor, textColor: passwordTextColor, borderColor: passwordBorderColor, radius: passwordBorderRadius, height: passwordHeight, fontSize: passwordFontSize });
    const pwdFocus = focusHandler(passwordBorderColor, passwordFocusColor);
    if (passwordShowToggle) {
      const eyeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${passwordFontSize + 4}" height="${passwordFontSize + 4}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
      html += `<div style="position:relative">`;
      html += `<input type="password" id="login-pass-${cid}" placeholder="${escapeHTML(passwordPlaceholder)}" style="${pwdStyle};padding-right:40px" ${pwdFocus} />`;
      html += `<span id="login-pass-toggle-${cid}" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);cursor:pointer;user-select:none;display:flex;align-items:center;justify-content:center;color:${passwordBorderColor}">${eyeSvg}</span>`;
      html += `</div>`;
    } else {
      html += `<input type="password" id="login-pass-${cid}" placeholder="${escapeHTML(passwordPlaceholder)}" style="${pwdStyle}" ${pwdFocus} />`;
    }

    // ─── v5 验证码（图形） ───
    if (showCaptcha && captchaType === "image") {
      html += `<div style="display:flex;gap:8px;align-items:flex-end;flex-shrink:0">`;
      html += `<div style="flex:1">`;
      html += `<label for="login-captcha-${cid}" style="${labelStyle(tenantLabelColor, captchaFontSize)}">${escapeHTML(captchaLabel)}</label>`;
      html += `<input type="text" id="login-captcha-${cid}" placeholder="${escapeHTML(captchaPlaceholder)}" style="${inputStyle({ bgColor: captchaBgColor, textColor: captchaTextColor, borderColor: captchaBorderColor, radius: captchaBorderRadius, height: captchaHeight, fontSize: captchaFontSize })}" />`;
      html += `</div>`;
      html += `<img id="login-captcha-img-${cid}" src="" alt="${escapeHTML(captchaLabel)}" style="width:${captchaWidth}px;height:${captchaHeight}px;flex-shrink:0;border:1px solid ${captchaBorderColor};border-radius:${captchaBorderRadius}px;cursor:pointer;background:${captchaRefreshColor}22" title="点击刷新验证码" />`;
      html += `</div>`;
    }

    // ─── v5 验证码（滑块/点选） ───
    if (showCaptcha && captchaType !== "image") {
      html += `<div id="login-captcha-${captchaType}-${cid}" style="height:${captchaHeight}px;background:#f0f0f0;border:1px dashed ${captchaBorderColor};border-radius:${captchaBorderRadius}px;display:flex;align-items:center;justify-content:center;color:#999;font-size:${captchaFontSize}px;flex-shrink:0">${captchaType === "slider" ? "滑块验证码" : "点选验证码"}</div>`;
    }

    // ─── 记住我 + 忘记密码 ───
    if (showRemember || showForgot) {
      html += `<div style="display:flex;justify-content:space-between;align-items:center;flex-shrink:0">`;
      if (showRemember) {
        html += `<label style="display:flex;align-items:center;cursor:pointer;color:${rememberColor};font-size:${rememberFontSize}px"><input type="checkbox" id="login-remember-${cid}" style="margin-right:6px;accent-color:${rememberAccentColor}" />${escapeHTML(rememberLabel)}</label>`;
      } else {
        html += `<span></span>`;
      }
      if (showForgot) {
        html += `<a href="${escapeHTML(forgotUrl || "#")}" style="color:${forgotLinkColor};text-decoration:none;font-size:${forgotFontSize}px">${escapeHTML(forgotText)}</a>`;
      }
      html += `</div>`;
    }

    html += `</div>`; // end pwd-section
  }

  // ═══ v5 短信模式区域 ═══
  if (showSmsMode && !useDynamicParams) {
    const smsDisplay = loginType === "both" ? "none" : "";
    html += `<div id="login-sms-section-${cid}" style="display:${smsDisplay};flex-direction:column;gap:${fieldGap}px">`;

    // 手机号
    html += `<label for="login-sms-phone-${cid}" style="${labelStyle(smsLabelColor, smsFontSize)}">${escapeHTML(smsLabel)}</label>`;
    html += `<input type="tel" id="login-sms-phone-${cid}" placeholder="${escapeHTML(smsPlaceholder)}" style="${inputStyle({ bgColor: smsBgColor, textColor: smsTextColor, borderColor: smsBorderColor, radius: smsBorderRadius, height: smsHeight, fontSize: smsFontSize })}" ${focusHandler(smsBorderColor, usernameFocusColor)} />`;

    // 验证码 + 发送按钮
    html += `<div style="display:flex;gap:8px;align-items:flex-end;flex-shrink:0">`;
    html += `<div style="flex:1">`;
    html += `<label for="login-sms-code-${cid}" style="${labelStyle(smsCodeLabelColor, smsCodeFontSize)}">${escapeHTML(smsCodeLabel)}</label>`;
    html += `<input type="text" id="login-sms-code-${cid}" maxlength="${smsCodeLength}" placeholder="${escapeHTML(smsCodePlaceholder)}" style="${inputStyle({ bgColor: smsCodeBgColor, textColor: smsCodeTextColor, borderColor: smsCodeBorderColor, radius: smsCodeBorderRadius, height: smsCodeHeight, fontSize: smsCodeFontSize })}" ${focusHandler(smsCodeBorderColor, usernameFocusColor)} />`;
    html += `</div>`;
    html += `<button id="login-sms-btn-${cid}" style="min-width:100px;height:${smsCodeHeight}px;border:none;border-radius:${smsButtonBorderRadius}px;background:${smsButtonBgColor};color:${smsButtonTextColor};font-size:${smsButtonFontSize}px;font-weight:600;cursor:pointer;text-transform:none;flex-shrink:0;transition:background 0.2s" onmouseover="this.style.background='${smsButtonHoverColor}'" onmouseout="this.style.background='${smsButtonBgColor}'">${escapeHTML(smsButtonText)}</button>`;
    html += `</div>`;

    // 记住我 + 忘记密码（短信模式也显示）
    if (showRemember || showForgot) {
      html += `<div style="display:flex;justify-content:space-between;align-items:center;flex-shrink:0">`;
      if (showRemember) {
        html += `<label style="display:flex;align-items:center;cursor:pointer;color:${rememberColor};font-size:${rememberFontSize}px"><input type="checkbox" id="login-remember-sms-${cid}" style="margin-right:6px;accent-color:${rememberAccentColor}" />${escapeHTML(rememberLabel)}</label>`;
      } else {
        html += `<span></span>`;
      }
      if (showForgot) {
        html += `<a href="${escapeHTML(forgotUrl || "#")}" style="color:${forgotLinkColor};text-decoration:none;font-size:${forgotFontSize}px">${escapeHTML(forgotText)}</a>`;
      }
      html += `</div>`;
    }

    html += `</div>`; // end sms-section
  }

  // ─── 登录按钮 ───
  const btnWidth = buttonFullWidth ? "100%" : "auto";
  html += `<button id="login-btn-${cid}" style="width:${btnWidth};height:${buttonHeight}px;border:none;border-radius:${buttonBorderRadius}px;background:${buttonBgColor};color:${buttonTextColor};font-size:${buttonFontSize}px;font-weight:600;cursor:pointer;text-transform:none;flex-shrink:0;transition:background 0.2s" onmouseover="this.style.background='${buttonHoverColor}'" onmouseout="this.style.background='${buttonBgColor}'">`;
  html += `<span id="login-btn-text-${cid}">${escapeHTML(buttonText)}</span>`;
  html += `<span id="login-btn-spinner-${cid}" style="display:none">...</span>`;
  html += `</button>`;

  // ─── v5 社交登录按钮区 ───
  if (showSocialLogin && socialButtons.length > 0) {
    const socialIconPaths: Record<string, string> = {
      wechat: "M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.186 3.002 5.486L2.5 17l2.937-1.526c.574.158 1.183.234 1.804.234.179 0 .356-.012.534-.024-.113-.348-.177-.715-.177-1.096 0-3.708 3.291-6.714 7.354-6.714.179 0 .355.012.531.024C14.729 4.218 11.949 2.188 8.691 2.188zm-2.6 3.476c.43 0 .778.347.778.778 0 .43-.349.778-.778.778-.43 0-.778-.348-.778-.778 0-.43.349-.778.778-.778zm5.182 0c.43 0 .778.347.778.778 0 .43-.349.778-.778.778-.43 0-.778-.348-.778-.778 0-.43.349-.778.778-.778z",
      github: "M12 2C6.477 2 2 6.486 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.012-1.7-2.782.603-3.369-1.342-3.369-1.342-.455-1.157-1.11-1.465-1.11-1.465-.908-.621.069-.608.069-.608 1.003.071 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.349-1.087.633-1.337-2.221-.252-4.555-1.11-4.555-4.942 0-1.091.39-1.984 1.029-2.684-.103-.252-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.114 2.502.334 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.395.1 2.647.64.7 1.028 1.593 1.028 2.684 0 3.842-2.337 4.687-4.565 4.935.359.309.679.918.679 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.138 20.163 22 16.418 22 12c0-5.514-4.477-10-10-10z",
      google: "M12.545 12l3.955-3.956-3.955-3.955-1.414 1.414L13.672 12l-2.541 2.541z M21 12c0-4.971-4.029-9-9-9s-9 4.029-9 9 4.029 9 9 9c2.553 0 4.862-1.055 6.513-2.746l-1.414-1.414C15.81 17.156 14.022 18 12 18c-3.314 0-6-2.686-6-6s2.686-6 6-6c1.657 0 3.157.671 4.243 1.757L18 6l-1.757 4.243z",
      qq: "M12.001 2c2.5 0 4.5 2 4.5 4.5 0 .5-.1 1-.2 1.5 1 .5 2 1.5 2.5 3 .5 1.5.5 3 .5 4.5 0 0 0 .5-.5 1l-.5.5c0 .5-.5 1-1 1.5-.5.5-1 .5-1.5 0 0 0-.5 1-1 1.5-.5.5-1 .5-1.5.5h-2c-.5 0-1 0-1.5-.5-.5-.5-1-1.5-1-1.5-.5.5-1 .5-1.5 0-.5-.5-1-1-1-1.5l-.5-.5c-.5-.5-.5-1-.5-1 0-1.5 0-3 .5-4.5.5-1.5 1.5-2.5 2.5-3-.1-.5-.2-1-.2-1.5 0-2.5 2-4.5 4.5-4.5z",
      weibo: "M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm3.5 14c-1 1-3 1.5-4.5 1s-3-2-2.5-3.5c.5-1.5 2.5-2 4-1.5s3 1 3 2-.5 1-1 2z",
      apple: "M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.243 0-1.432.62-2.198.44-3.127-.35C2.966 15.5 3.5 7.5 7.84 7.5c1.5 0 2.5 1 3.5 1 1 0 2.5-1 4-1 1.5 0 3 .5 3.5 2.5-2 1.5-2.5 4.5-.79 7.28.28.35.56.65.79 1zM12.5 6.5c.5-2 2-3.5 3.5-3.5.5 2-1 3.5-3.5 3.5z",
    };
    const iconSize = Math.floor(socialLoginSize * 0.5);
    html += `<div style="display:flex;flex-direction:column;align-items:center;gap:8px;flex-shrink:0;margin-top:4px">`;
    html += `<div style="font-size:${socialLoginTitleFontSize}px;color:${socialLoginTitleColor};text-align:center">${escapeHTML(socialLoginTitle)}</div>`;
    const socialFlexDir = socialLoginLayout === "grid" ? "row" : "row";
    html += `<div style="display:flex;flex-wrap:wrap;justify-content:center;gap:${socialLoginGap}px;flex-direction:${socialFlexDir}">`;
    for (const btn of socialButtons) {
      const iconPath = socialIconPaths[btn.icon] || socialIconPaths.github;
      const bg = btn.bgColor || socialLoginBgColor;
      const tc = btn.textColor || "#333";
      const href = btn.authUrl ? `href="${escapeHTML(btn.authUrl)}"` : "";
      const tag = btn.authUrl ? "a" : "div";
      html += `<${tag} ${href} title="${escapeHTML(btn.label)}" style="width:${socialLoginSize}px;height:${socialLoginSize}px;display:flex;align-items:center;justify-content:center;border-radius:${socialLoginBorderRadius}px;background:${bg};color:${tc};border:1px solid ${captchaBorderColor};cursor:${btn.authUrl ? "pointer" : "default"};text-decoration:none;transition:opacity 0.2s" onmouseover="this.style.opacity=0.85" onmouseout="this.style.opacity=1"><svg width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" fill="currentColor"><path d="${iconPath}"/></svg></${tag}>`;
    }
    html += `</div>`;
    html += `</div>`;
  }

  html += `</div>`;

  // ─── 注入登录逻辑 JS（v3 配置驱动） ───
  const script = `
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


  ctx.pageScripts.push(script);

  return html;
};

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

/**
 * auth-user-profile 组件 → HTML
 *
 * 配置：showAvatar, showName, showRole, showEmail, avatarSize, fontSize,
 *        nameField, avatarField, roleField, emailField, bgColor, textColor,
 *        avatarBgColor, layout(horizontal/vertical), placeholderName, placeholderText
 *
 * 发布产物中：从 localStorage 读取 user 信息，监听 auth-state-change 更新
 */
export const userProfileCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config;
  const showAvatar = Boolean(c.showAvatar ?? true);
  const showName = Boolean(c.showName ?? true);
  const showRole = Boolean(c.showRole ?? false);
  const showEmail = Boolean(c.showEmail ?? false);
  const avatarSize = Number(c.avatarSize ?? 40);
  const fontSize = Number(c.fontSize ?? 14);
  const nameField = String(c.nameField ?? "name");
  const avatarField = String(c.avatarField ?? "avatar");
  const roleField = String(c.roleField ?? "role");
  const emailField = String(c.emailField ?? "email");
  const bgColor = String(c.bgColor ?? "transparent");
  const textColor = String(c.textColor ?? "#333333");
  const avatarBgColor = String(c.avatarBgColor ?? "#1976d2");
  const layout = String(c.layout ?? "horizontal");
  const placeholderName = String(c.placeholderName ?? "未登录");

  // v5 动态用户信息展示配置
  const userDisplayConfigRaw = c.userDisplayConfig as Array<{
    cacheKey: string; objectPath?: string; displayType: string; customLabel?: string;
  }> | undefined;
  const userDisplayConfig = userDisplayConfigRaw ?? [];
  const useDynamicProfile = userDisplayConfig.length > 0;
  const userDisplayConfigJson = JSON.stringify(userDisplayConfig);

  const wrapperId = `user-profile-${component.id}`;

  const layoutStyle = layout === "vertical"
    ? "flex-direction:column;align-items:center;text-align:center"
    : "flex-direction:row;align-items:center";

  let html = `<div id="${wrapperId}" style="width:100%;height:100%;display:flex;${layoutStyle};background:${bgColor};color:${textColor};padding:8px;box-sizing:border-box">`;

  // v5: 动态模式下也显示 avatar
  if (useDynamicProfile || showAvatar) {
    html += `<div id="${wrapperId}-avatar" style="width:${avatarSize}px;height:${avatarSize}px;border-radius:50%;background:${avatarBgColor};display:flex;align-items:center;justify-content:center;color:#fff;font-size:${avatarSize * 0.4}px;font-weight:bold;flex-shrink:0;margin-right:${layout === "horizontal" ? "12px" : "0"};margin-bottom:${layout === "vertical" ? "8px" : "0"};overflow:hidden"><svg width="${avatarSize * 0.5}" height="${avatarSize * 0.5}" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg></div>`;
  }

  const infoStyle = layout === "vertical" ? "text-align:center" : "flex:1;min-width:0";
  html += `<div id="${wrapperId}-info" style="${infoStyle}">`;

  if (useDynamicProfile) {
    // v5: 动态生成展示元素
    html += `<div id="${wrapperId}-name" style="font-size:${fontSize}px;font-weight:600;color:${textColor};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHTML(placeholderName)}</div>`;
    html += `<div id="${wrapperId}-extra" style="display:flex;flex-direction:column;gap:2px"></div>`;
  } else {
    // v1: 硬编码模式
    if (showName) {
      html += `<div id="${wrapperId}-name" style="font-size:${fontSize}px;font-weight:600;color:${textColor};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHTML(placeholderName)}</div>`;
    }
    if (showRole) {
      html += `<div id="${wrapperId}-role" style="font-size:${fontSize - 2}px;color:#999;margin-top:2px"></div>`;
    }
    if (showEmail) {
      html += `<div id="${wrapperId}-email" style="font-size:${fontSize - 2}px;color:#999;margin-top:2px"></div>`;
    }
  }
  html += `</div>`;

  html += `</div>`;

  // ─── 注入用户信息更新逻辑 ───
  const profileScript = `
(function() {
  var wrapper = document.getElementById("${wrapperId}");
  var avatarEl = document.getElementById("${wrapperId}-avatar");
  var nameEl = document.getElementById("${wrapperId}-name");
  var extraEl = document.getElementById("${wrapperId}-extra");
  var roleEl = document.getElementById("${wrapperId}-role");
  var emailEl = document.getElementById("${wrapperId}-email");

  var USE_DYNAMIC = ${useDynamicProfile};
  var DISPLAY_CONFIG = ${userDisplayConfigJson};
  var TOKEN_KEY = window.__WC_TOKEN_KEY || "${String(c.tokenKey ?? "auth_token")}";
  var TOKEN_STORAGE = window.__WC_TOKEN_STORAGE || "${String(c.tokenStorage ?? "localStorage")}";

  function getStorage() {
    if (typeof window === "undefined") return null;
    if (TOKEN_STORAGE === "localStorage") return window.localStorage;
    if (TOKEN_STORAGE === "sessionStorage") return window.sessionStorage;
    return null;
  }

  function getNested(obj, path) {
    if (!obj || !path) return undefined;
    var keys = path.split(".");
    var cur = obj;
    for (var i = 0; i < keys.length; i++) {
      if (cur === null || cur === undefined) return undefined;
      cur = cur[keys[i]];
    }
    return cur;
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

  function showGuestAvatar() {
    if (!avatarEl) return;
    avatarEl.innerHTML = '<svg width="' + (${avatarSize} * 0.5) + '" height="' + (${avatarSize} * 0.5) + '" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';
  }

  function updateProfile(user) {
    if (!user) {
      if (nameEl) nameEl.textContent = ${JSON.stringify(placeholderName)};
      showGuestAvatar();
      if (extraEl) extraEl.innerHTML = "";
      return;
    }

    if (USE_DYNAMIC) {
      // v5: 从缓存读取用户信息
      var displayName = ${JSON.stringify(placeholderName)};
      var avatarUrl = null;
      var avatarFound = false; // P2-2: 只取第一条 avatar
      var extraHtml = "";

      DISPLAY_CONFIG.forEach(function(cfg) {
        // P0-2: cacheKey 作为 storage key 读取缓存值
        var val = getCachedValue(cfg.cacheKey);
        // P0-2: objectPath 作为对象嵌套路径（留空回退到 cacheKey）
        if (!val) {
          var path = cfg.objectPath || cfg.cacheKey;
          var nested = getNested(user, path);
          if (nested !== undefined && nested !== null) val = String(nested);
        }
        if (!val) return;

        if (cfg.displayType === "avatar") {
          // P2-2: 只取第一条 avatar
          if (!avatarFound) {
            avatarUrl = val;
            avatarFound = true;
          }
        } else if (cfg.displayType === "name") {
          displayName = val;
        } else if (cfg.displayType !== "none") {
          var label = cfg.customLabel ? (cfg.customLabel + ": ") : "";
          extraHtml += '<div style="font-size:' + (${fontSize} - 2) + 'px;color:#999;margin-top:2px">' + label + escapeHtml(val) + '</div>';
        }
      });

      if (nameEl) nameEl.textContent = displayName;
      if (extraEl) extraEl.innerHTML = extraHtml;
      if (avatarEl) {
        if (avatarUrl) {
          avatarEl.innerHTML = '<img src="' + avatarUrl + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%" />';
        } else {
          var initials = String(displayName).charAt(0).toUpperCase();
          if (initials) {
            avatarEl.textContent = initials;
          } else {
            showGuestAvatar();
          }
        }
      }
    } else {
      // v1: 硬编码模式
      var name = getNested(user, "${nameField}") || getNested(user, "username") || ${JSON.stringify(placeholderName)};
      var avatar = getNested(user, "${avatarField}");
      var role = getNested(user, "${roleField}");
      var email = getNested(user, "${emailField}");

      if (nameEl) nameEl.textContent = String(name);
      if (avatarEl) {
        if (avatar) {
          avatarEl.innerHTML = '<img src="' + avatar + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%" />';
        } else {
          var initials = String(name).charAt(0).toUpperCase();
          if (initials) {
            avatarEl.textContent = initials;
          } else {
            showGuestAvatar();
          }
        }
      }
      if (roleEl) roleEl.textContent = role ? String(role) : "";
      if (emailEl) emailEl.textContent = email ? String(email) : "";
    }
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
  }

  // 初始加载：从可配置 storage 读取，并检查 authenticated 标志
  try {
    var storage = getStorage();
    if (storage) {
      var isAuth = storage.getItem("__webcraft_auth_authenticated") === "true";
      if (isAuth) {
        var userStr = storage.getItem("__webcraft_auth_user");
        if (userStr) {
          updateProfile(JSON.parse(userStr));
        }
      }
    }
  } catch(e) {}

  // 监听认证状态变化
  window.addEventListener("auth-state-change", function(e) {
    var detail = e.detail || {};
    if (detail.user) {
      updateProfile(detail.user);
    } else if (detail.isAuthenticated === false) {
      // 登出：重置为未登录态
      if (nameEl) nameEl.textContent = ${JSON.stringify(placeholderName)};
      showGuestAvatar();
      if (extraEl) extraEl.innerHTML = "";
    } else if (detail.isAuthenticated === true) {
      // 登录成功但 detail 中无 user 对象（如 refresh），从 storage 读取
      try {
        var storage = getStorage();
        if (storage) {
          var userStr = storage.getItem("__webcraft_auth_user");
          if (userStr) updateProfile(JSON.parse(userStr));
        }
      } catch(e) {}
    }
  });
})();
`;

  ctx.pageScripts.push(profileScript);

  return html;
};

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
