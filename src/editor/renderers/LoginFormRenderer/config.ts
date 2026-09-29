import type { AuthParam } from "../../../store/websiteAuthStore";

/**
 * 端点编排配置（v4 统一管理）
 */
export interface AuthEndpointConfig {
  id: string;
  name: string;
  path: string;
  method: string;
  endpointType?: string;
  contentType?: string;
  responseMapping?: Array<{ sourcePath: string; targetKey: string; saveToCache: boolean; isExpirationTime?: boolean }>;
}

/**
 * 社交登录按钮配置
 */
export interface SocialButtonConfig {
  id: string;
  label: string;
  icon: string;
  authUrl: string;
  bgColor: string;
  textColor: string;
}

/**
 * 登录表单渲染器从组件 config 中提取的全部配置值。
 * 每个元素（标题 / 副标题 / 用户名 / 密码 / 按钮 / 记住我 / 忘记密码）均可独立配置样式。
 */
export interface LoginFormConfigValues {
  // 预设模板（v3）
  authPreset: string;

  // API 配置
  authMode: "session" | "jwt" | "basic" | "oauth2";
  apiUrl: string;
  method: string;
  tokenField: string;
  refreshTokenField: string;
  expiresInField: string;
  userField: string;

  // Token 存储配置（v3）
  tokenStorage: "localStorage" | "sessionStorage" | "memory";
  tokenKey: string;
  tokenHeader: string;
  tokenPrefix: string;

  // Token 刷新配置（v3）
  refreshEnabled: boolean;
  refreshThreshold: number;
  refreshEndpointPath: string;
  refreshEndpointMethod: string;

  // 自定义 Header 配置（v3）
  headerConfigs: Array<{ headerName: string; valueTemplate: string }>;

  // 响应映射模板（v4）
  mappingTemplate: string;

  // 端点编排（v4）
  endpoints: AuthEndpointConfig[];

  // 容器样式
  containerBgColor: string;
  containerBorderColor: string;
  containerBorderRadius: number;
  containerPadding: number;
  containerShadow: string;
  fieldGap: number;
  initiallyHidden: boolean;

  // 标题
  showTitle: boolean;
  titleText: string;
  titleFontSize: number;
  titleColor: string;
  titleFontWeight: number;
  titleAlign: string;
  titleMarginBottom: number;

  // 副标题
  showSubtitle: boolean;
  subtitleText: string;
  subtitleFontSize: number;
  subtitleColor: string;
  subtitleAlign: string;

  // 用户名输入框
  usernameLabel: string;
  usernameLabelColor: string;
  usernamePlaceholder: string;
  usernameBgColor: string;
  usernameTextColor: string;
  usernameBorderColor: string;
  usernameFocusColor: string;
  usernameBorderRadius: number;
  usernameHeight: number;
  usernameFontSize: number;

  // 密码输入框
  passwordLabel: string;
  passwordLabelColor: string;
  passwordPlaceholder: string;
  passwordBgColor: string;
  passwordTextColor: string;
  passwordBorderColor: string;
  passwordFocusColor: string;
  passwordBorderRadius: number;
  passwordHeight: number;
  passwordFontSize: number;
  passwordShowToggle: boolean;

  // 登录按钮
  buttonText: string;
  buttonBgColor: string;
  buttonTextColor: string;
  buttonHoverColor: string;
  buttonFontSize: number;
  buttonBorderRadius: number;
  buttonHeight: number;
  buttonFullWidth: boolean;

  // 记住我
  showRemember: boolean;
  rememberLabel: string;
  rememberFontSize: number;
  rememberColor: string;
  rememberAccentColor: string;

  // 忘记密码
  showForgot: boolean;
  forgotText: string;
  forgotUrl: string;
  forgotLinkColor: string;
  forgotFontSize: number;

  // 错误提示
  errorBgColor: string;
  errorTextColor: string;
  errorBorderRadius: number;

  // v5 多租户
  showTenantField: boolean;
  tenantLabel: string;
  tenantPlaceholder: string;
  tenantRequired: boolean;
  tenantHeaderName: string;
  tenantDefaultValue: string;
  tenantBgColor: string;
  tenantTextColor: string;
  tenantBorderColor: string;
  tenantFocusColor: string;
  tenantBorderRadius: number;
  tenantHeight: number;
  tenantFontSize: number;
  tenantLabelColor: string;

  // v5 验证码
  showCaptcha: boolean;
  captchaType: string;
  captchaLabel: string;
  captchaPlaceholder: string;
  captchaEndpoint: string;
  captchaWidth: number;
  captchaHeight: number;
  captchaBgColor: string;
  captchaTextColor: string;
  captchaBorderColor: string;
  captchaBorderRadius: number;
  captchaFontSize: number;
  captchaRefreshColor: string;

  // v5 短信登录
  loginType: string;
  smsLabel: string;
  smsPlaceholder: string;
  smsCodeLabel: string;
  smsCodePlaceholder: string;
  smsCodeLength: number;
  smsButtonText: string;
  smsEndpoint: string;
  smsCooldown: number;
  smsBgColor: string;
  smsTextColor: string;
  smsBorderColor: string;
  smsBorderRadius: number;
  smsHeight: number;
  smsFontSize: number;
  smsLabelColor: string;
  smsCodeBgColor: string;
  smsCodeTextColor: string;
  smsCodeBorderColor: string;
  smsCodeBorderRadius: number;
  smsCodeHeight: number;
  smsCodeFontSize: number;
  smsCodeLabelColor: string;
  smsButtonBgColor: string;
  smsButtonTextColor: string;
  smsButtonFontSize: number;
  smsButtonBorderRadius: number;
  smsButtonHoverColor: string;

  // v5 社交登录
  showSocialLogin: boolean;
  socialLoginTitle: string;
  socialLoginTitleColor: string;
  socialLoginTitleFontSize: number;
  socialLoginGap: number;
  socialLoginBgColor: string;
  socialLoginBorderRadius: number;
  socialLoginSize: number;
  socialLoginLayout: string;
  socialButtons: SocialButtonConfig[];

  // v5 动态认证参数（配置驱动，彻底替代硬编码字段）
  useDynamicParams: boolean;
  authParams: AuthParam[];
}

/**
 * 解析成功业务码配置：兼容逗号分隔字符串（"0,200"）与数字数组两种形态。
 */
export function parseSuccessCodes(value: unknown): number[] {
  if (Array.isArray(value)) {
    const nums = value.map(Number).filter((n) => !isNaN(n));
    return nums.length > 0 ? nums : [0, 200];
  }
  if (typeof value === "string" && value.trim() !== "") {
    const nums = value.split(",").map((s) => Number(s.trim())).filter((n) => !isNaN(n));
    return nums.length > 0 ? nums : [0, 200];
  }
  return [0, 200];
}

/**
 * 从组件 config 中提取登录表单的全部配置值（含默认值回退）。
 */
export function extractLoginFormConfig(config: Record<string, unknown>): LoginFormConfigValues {
  return {
    // ─── 预设模板（v3） ───
    authPreset: (config.authPreset as string) || "custom",

    // ─── API 配置 ───
    authMode: (config.authMode as "session" | "jwt" | "basic" | "oauth2") || "jwt",
    apiUrl: (config.apiUrl as string) || "",
    method: (config.method as string) || "POST",
    tokenField: (config.tokenField as string) || "token",
    refreshTokenField: (config.refreshTokenField as string) || "refreshToken",
    expiresInField: (config.expiresInField as string) || "expiresIn",
    userField: (config.userField as string) || "user",

    // ─── Token 存储配置（v3 配置驱动） ───
    tokenStorage: (config.tokenStorage as "localStorage" | "sessionStorage" | "memory") || "localStorage",
    tokenKey: (config.tokenKey as string) || "auth_token",
    tokenHeader: (config.tokenHeader as string) || "Authorization",
    tokenPrefix: (config.tokenPrefix as string) ?? "Bearer ",

    // ─── Token 刷新配置（v3 配置驱动） ───
    refreshEnabled: (config.refreshEnabled as boolean) ?? false,
    refreshThreshold: (config.refreshThreshold as number) ?? 30,
    refreshEndpointPath: (config.refreshEndpointPath as string) || "",
    refreshEndpointMethod: (config.refreshEndpointMethod as string) || "POST",

    // ─── 自定义 Header 配置（v3 配置驱动） ───
    headerConfigs: (config.headerConfigs as Array<{ headerName: string; valueTemplate: string }>) ?? [],

    // ─── 响应映射模板（v4） ───
    mappingTemplate: (config.mappingTemplate as string) || "standard-jwt",

    // ─── 端点编排（v4 统一管理） ───
    endpoints: (config.endpoints as AuthEndpointConfig[]) ?? [],

    // ─── 容器样式 ───
    containerBgColor: (config.containerBgColor as string) || "#ffffff",
    containerBorderColor: (config.containerBorderColor as string) || "#e0e0e0",
    containerBorderRadius: (config.containerBorderRadius as number) ?? 12,
    containerPadding: (config.containerPadding as number) ?? 32,
    containerShadow: (config.containerShadow as string) || "none",
    fieldGap: (config.fieldGap as number) ?? 16,
    initiallyHidden: (config.initiallyHidden as boolean) ?? false,

    // ─── 标题 ───
    showTitle: (config.showTitle as boolean) ?? true,
    titleText: (config.titleText as string) || "登录",
    titleFontSize: (config.titleFontSize as number) ?? 22,
    titleColor: (config.titleColor as string) || "#1a1a2e",
    titleFontWeight: (config.titleFontWeight as number) ?? 700,
    titleAlign: (config.titleAlign as string) || "center",
    titleMarginBottom: (config.titleMarginBottom as number) ?? 4,

    // ─── 副标题 ───
    showSubtitle: (config.showSubtitle as boolean) ?? false,
    subtitleText: (config.subtitleText as string) || "请输入您的账号信息",
    subtitleFontSize: (config.subtitleFontSize as number) ?? 13,
    subtitleColor: (config.subtitleColor as string) || "#999999",
    subtitleAlign: (config.subtitleAlign as string) || "center",

    // ─── 用户名输入框 ───
    usernameLabel: (config.usernameLabel as string) || "用户名",
    usernameLabelColor: (config.usernameLabelColor as string) || "#666666",
    usernamePlaceholder: (config.usernamePlaceholder as string) || "请输入用户名",
    usernameBgColor: (config.usernameBgColor as string) || "#f5f5f5",
    usernameTextColor: (config.usernameTextColor as string) || "#333333",
    usernameBorderColor: (config.usernameBorderColor as string) || "#d0d0d8",
    usernameFocusColor: (config.usernameFocusColor as string) || "#1976d2",
    usernameBorderRadius: (config.usernameBorderRadius as number) ?? 8,
    usernameHeight: (config.usernameHeight as number) ?? 42,
    usernameFontSize: (config.usernameFontSize as number) ?? 14,

    // ─── 密码输入框 ───
    passwordLabel: (config.passwordLabel as string) || "密码",
    passwordLabelColor: (config.passwordLabelColor as string) || "#666666",
    passwordPlaceholder: (config.passwordPlaceholder as string) || "请输入密码",
    passwordBgColor: (config.passwordBgColor as string) || "#f5f5f5",
    passwordTextColor: (config.passwordTextColor as string) || "#333333",
    passwordBorderColor: (config.passwordBorderColor as string) || "#d0d0d8",
    passwordFocusColor: (config.passwordFocusColor as string) || "#1976d2",
    passwordBorderRadius: (config.passwordBorderRadius as number) ?? 8,
    passwordHeight: (config.passwordHeight as number) ?? 42,
    passwordFontSize: (config.passwordFontSize as number) ?? 14,
    passwordShowToggle: (config.passwordShowToggle as boolean) ?? true,

    // ─── 登录按钮 ───
    buttonText: (config.buttonText as string) || "登录",
    buttonBgColor: (config.buttonBgColor as string) || "#1976d2",
    buttonTextColor: (config.buttonTextColor as string) || "#ffffff",
    buttonHoverColor: (config.buttonHoverColor as string) || "#1565c0",
    buttonFontSize: (config.buttonFontSize as number) ?? 15,
    buttonBorderRadius: (config.buttonBorderRadius as number) ?? 8,
    buttonHeight: (config.buttonHeight as number) ?? 44,
    buttonFullWidth: (config.buttonFullWidth as boolean) ?? true,

    // ─── 记住我 ───
    showRemember: (config.showRemember as boolean) ?? false,
    rememberLabel: (config.rememberLabel as string) || "记住我",
    rememberFontSize: (config.rememberFontSize as number) ?? 13,
    rememberColor: (config.rememberColor as string) || "#666666",
    rememberAccentColor: (config.rememberAccentColor as string) || "#1976d2",

    // ─── 忘记密码 ───
    showForgot: (config.showForgot as boolean) ?? false,
    forgotText: (config.forgotText as string) || "忘记密码？",
    forgotUrl: (config.forgotUrl as string) || "",
    forgotLinkColor: (config.forgotLinkColor as string) || "#1976d2",
    forgotFontSize: (config.forgotFontSize as number) ?? 13,

    // ─── 错误提示 ───
    errorBgColor: (config.errorBgColor as string) || "#fff3f3",
    errorTextColor: (config.errorTextColor as string) || "#f44336",
    errorBorderRadius: (config.errorBorderRadius as number) ?? 8,

    // ═══ v5 多租户 ═══
    showTenantField: (config.showTenantField as boolean) ?? false,
    tenantLabel: (config.tenantLabel as string) || "租户ID",
    tenantPlaceholder: (config.tenantPlaceholder as string) || "请输入租户ID",
    tenantRequired: (config.tenantRequired as boolean) ?? false,
    tenantHeaderName: (config.tenantHeaderName as string) || "tenant-id",
    tenantDefaultValue: (config.tenantDefaultValue as string) || "",
    tenantBgColor: (config.tenantBgColor as string) || "#f5f5f5",
    tenantTextColor: (config.tenantTextColor as string) || "#333333",
    tenantBorderColor: (config.tenantBorderColor as string) || "#d0d0d8",
    tenantFocusColor: (config.tenantFocusColor as string) || "#1976d2",
    tenantBorderRadius: (config.tenantBorderRadius as number) ?? 8,
    tenantHeight: (config.tenantHeight as number) ?? 42,
    tenantFontSize: (config.tenantFontSize as number) ?? 14,
    tenantLabelColor: (config.tenantLabelColor as string) || "#666666",

    // ═══ v5 验证码 ═══
    showCaptcha: (config.showCaptcha as boolean) ?? false,
    captchaType: (config.captchaType as string) || "image",
    captchaLabel: (config.captchaLabel as string) || "图形验证码",
    captchaPlaceholder: (config.captchaPlaceholder as string) || "请输入验证码",
    captchaEndpoint: (config.captchaEndpoint as string) || "",
    captchaWidth: (config.captchaWidth as number) ?? 120,
    captchaHeight: (config.captchaHeight as number) ?? 40,
    captchaBgColor: (config.captchaBgColor as string) || "#f5f5f5",
    captchaTextColor: (config.captchaTextColor as string) || "#333333",
    captchaBorderColor: (config.captchaBorderColor as string) || "#d0d0d8",
    captchaBorderRadius: (config.captchaBorderRadius as number) ?? 8,
    captchaFontSize: (config.captchaFontSize as number) ?? 14,
    captchaRefreshColor: (config.captchaRefreshColor as string) || "#1976d2",

    // ═══ v5 短信登录 ═══
    loginType: (config.loginType as string) || "password",
    smsLabel: (config.smsLabel as string) || "手机号",
    smsPlaceholder: (config.smsPlaceholder as string) || "请输入手机号",
    smsCodeLabel: (config.smsCodeLabel as string) || "验证码",
    smsCodePlaceholder: (config.smsCodePlaceholder as string) || "请输入验证码",
    smsCodeLength: (config.smsCodeLength as number) ?? 6,
    smsButtonText: (config.smsButtonText as string) || "获取验证码",
    smsEndpoint: (config.smsEndpoint as string) || "",
    smsCooldown: (config.smsCooldown as number) ?? 60,
    smsBgColor: (config.smsBgColor as string) || "#f5f5f5",
    smsTextColor: (config.smsTextColor as string) || "#333333",
    smsBorderColor: (config.smsBorderColor as string) || "#d0d0d8",
    smsBorderRadius: (config.smsBorderRadius as number) ?? 8,
    smsHeight: (config.smsHeight as number) ?? 42,
    smsFontSize: (config.smsFontSize as number) ?? 14,
    smsLabelColor: (config.smsLabelColor as string) || "#666666",
    smsCodeBgColor: (config.smsCodeBgColor as string) || "#f5f5f5",
    smsCodeTextColor: (config.smsCodeTextColor as string) || "#333333",
    smsCodeBorderColor: (config.smsCodeBorderColor as string) || "#d0d0d8",
    smsCodeBorderRadius: (config.smsCodeBorderRadius as number) ?? 8,
    smsCodeHeight: (config.smsCodeHeight as number) ?? 42,
    smsCodeFontSize: (config.smsCodeFontSize as number) ?? 14,
    smsCodeLabelColor: (config.smsCodeLabelColor as string) || "#666666",
    smsButtonBgColor: (config.smsButtonBgColor as string) || "#1976d2",
    smsButtonTextColor: (config.smsButtonTextColor as string) || "#ffffff",
    smsButtonFontSize: (config.smsButtonFontSize as number) ?? 13,
    smsButtonBorderRadius: (config.smsButtonBorderRadius as number) ?? 8,
    smsButtonHoverColor: (config.smsButtonHoverColor as string) || "#1565c0",

    // ═══ v5 社交登录 ═══
    showSocialLogin: (config.showSocialLogin as boolean) ?? false,
    socialLoginTitle: (config.socialLoginTitle as string) || "其他登录方式",
    socialLoginTitleColor: (config.socialLoginTitleColor as string) || "#999999",
    socialLoginTitleFontSize: (config.socialLoginTitleFontSize as number) ?? 12,
    socialLoginGap: (config.socialLoginGap as number) ?? 12,
    socialLoginBgColor: (config.socialLoginBgColor as string) || "#f8f8f8",
    socialLoginBorderRadius: (config.socialLoginBorderRadius as number) ?? 20,
    socialLoginSize: (config.socialLoginSize as number) ?? 40,
    socialLoginLayout: (config.socialLoginLayout as string) || "row",
    socialButtons: (config.socialButtons as SocialButtonConfig[]) ?? [],

    // ═══ v5 动态认证参数（配置驱动，彻底替代硬编码字段） ═══
    useDynamicParams: (config.useDynamicParams as boolean) ?? false,
    authParams: (config.authParams as AuthParam[]) ?? [],
  };
}