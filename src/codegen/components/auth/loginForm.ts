import type { ComponentCodegenFn } from "../../types";
import { escapeHTML } from "../../layout";

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
