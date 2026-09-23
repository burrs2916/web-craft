import { useState, useCallback, useEffect, useRef } from "react";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import InputAdornment from "@mui/material/InputAdornment";
import IconButton from "@mui/material/IconButton";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Link from "@mui/material/Link";
import Alert from "@mui/material/Alert";
import type { ComponentRendererProps } from "../../types/editor";
import { useWebsiteAuthStore, extractUserFromJwt, RESPONSE_MAPPING_TEMPLATES, encodeAuthBody } from "../../store/websiteAuthStore";
import type { AuthParam } from "../../store/websiteAuthStore";
import { AUTH_PRESETS, getAllAuthPresets } from "../registerAuthComponents";

/**
 * 解析成功业务码配置：兼容逗号分隔字符串（"0,200"）与数字数组两种形态。
 */
function parseSuccessCodes(value: unknown): number[] {
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
 * 登录表单渲染器 v2
 *
 * 每个元素（标题 / 副标题 / 用户名输入框 / 密码输入框 / 按钮 / 记住我 / 忘记密码）
 * 均可独立配置颜色、字体、边框、圆角、高度等样式。
 * 编辑区显示修复：
 * - 移除 justifyContent: center（避免内容超出容器时顶部被裁切）
 * - 编辑模式 overflow: visible（画布外框 hidden 不会裁切编辑态）
 * - 预览模式 overflow: auto（内容溢出时可滚动）
 */
export function LoginFormRenderer({ config, mode, onConfigChange }: ComponentRendererProps) {
  const isEdit = mode === "edit";

  // ─── 预设模板（v3） ───
  const authPreset = (config.authPreset as string) || "custom";
  const lastAppliedPreset = useRef<string>("custom");

  // ─── API 配置 ───
  const authMode = (config.authMode as "session" | "jwt" | "basic" | "oauth2") || "jwt";
  const apiUrl = (config.apiUrl as string) || "";
  const method = (config.method as string) || "POST";
  const tokenField = (config.tokenField as string) || "token";
  const refreshTokenField = (config.refreshTokenField as string) || "refreshToken";
  const expiresInField = (config.expiresInField as string) || "expiresIn";
  const userField = (config.userField as string) || "user";

  // ─── Token 存储配置（v3 配置驱动） ───
  const tokenStorage = (config.tokenStorage as "localStorage" | "sessionStorage" | "memory") || "localStorage";
  const tokenKey = (config.tokenKey as string) || "auth_token";
  const tokenHeader = (config.tokenHeader as string) || "Authorization";
  const tokenPrefix = (config.tokenPrefix as string) ?? "Bearer ";

  // ─── Token 刷新配置（v3 配置驱动） ───
  const refreshEnabled = (config.refreshEnabled as boolean) ?? false;
  const refreshThreshold = (config.refreshThreshold as number) ?? 30;
  const refreshEndpointPath = (config.refreshEndpointPath as string) || "";
  const refreshEndpointMethod = (config.refreshEndpointMethod as string) || "POST";

  // ─── 自定义 Header 配置（v3 配置驱动） ───
  const headerConfigs = (config.headerConfigs as Array<{ headerName: string; valueTemplate: string }>) ?? [];

  // ─── 响应映射模板（v4） ───
  const mappingTemplate = (config.mappingTemplate as string) || "standard-jwt";
  const applyMappingTemplate = useWebsiteAuthStore((s) => s.applyMappingTemplate);

  // ─── 端点编排（v4 统一管理） ───
  const endpoints = (config.endpoints as Array<{
    id: string; name: string; path: string; method: string;
    endpointType?: string; contentType?: string;
    responseMapping?: Array<{ sourcePath: string; targetKey: string; saveToCache: boolean; isExpirationTime?: boolean }>;
  }>) ?? [];

  // ─── 容器样式 ───
  const containerBgColor = (config.containerBgColor as string) || "#ffffff";
  const containerBorderColor = (config.containerBorderColor as string) || "#e0e0e0";
  const containerBorderRadius = (config.containerBorderRadius as number) ?? 12;
  const containerPadding = (config.containerPadding as number) ?? 32;
  const containerShadow = (config.containerShadow as string) || "none";
  const fieldGap = (config.fieldGap as number) ?? 16;
  const initiallyHidden = (config.initiallyHidden as boolean) ?? false;

  // ─── 标题 ───
  const showTitle = (config.showTitle as boolean) ?? true;
  const titleText = (config.titleText as string) || "登录";
  const titleFontSize = (config.titleFontSize as number) ?? 22;
  const titleColor = (config.titleColor as string) || "#1a1a2e";
  const titleFontWeight = (config.titleFontWeight as number) ?? 700;
  const titleAlign = (config.titleAlign as string) || "center";
  const titleMarginBottom = (config.titleMarginBottom as number) ?? 4;

  // ─── 副标题 ───
  const showSubtitle = (config.showSubtitle as boolean) ?? false;
  const subtitleText = (config.subtitleText as string) || "请输入您的账号信息";
  const subtitleFontSize = (config.subtitleFontSize as number) ?? 13;
  const subtitleColor = (config.subtitleColor as string) || "#999999";
  const subtitleAlign = (config.subtitleAlign as string) || "center";

  // ─── 用户名输入框 ───
  const usernameLabel = (config.usernameLabel as string) || "用户名";
  const usernameLabelColor = (config.usernameLabelColor as string) || "#666666";
  const usernamePlaceholder = (config.usernamePlaceholder as string) || "请输入用户名";
  const usernameBgColor = (config.usernameBgColor as string) || "#f5f5f5";
  const usernameTextColor = (config.usernameTextColor as string) || "#333333";
  const usernameBorderColor = (config.usernameBorderColor as string) || "#d0d0d8";
  const usernameFocusColor = (config.usernameFocusColor as string) || "#1976d2";
  const usernameBorderRadius = (config.usernameBorderRadius as number) ?? 8;
  const usernameHeight = (config.usernameHeight as number) ?? 42;
  const usernameFontSize = (config.usernameFontSize as number) ?? 14;

  // ─── 密码输入框 ───
  const passwordLabel = (config.passwordLabel as string) || "密码";
  const passwordLabelColor = (config.passwordLabelColor as string) || "#666666";
  const passwordPlaceholder = (config.passwordPlaceholder as string) || "请输入密码";
  const passwordBgColor = (config.passwordBgColor as string) || "#f5f5f5";
  const passwordTextColor = (config.passwordTextColor as string) || "#333333";
  const passwordBorderColor = (config.passwordBorderColor as string) || "#d0d0d8";
  const passwordFocusColor = (config.passwordFocusColor as string) || "#1976d2";
  const passwordBorderRadius = (config.passwordBorderRadius as number) ?? 8;
  const passwordHeight = (config.passwordHeight as number) ?? 42;
  const passwordFontSize = (config.passwordFontSize as number) ?? 14;
  const passwordShowToggle = (config.passwordShowToggle as boolean) ?? true;

  // ─── 登录按钮 ───
  const buttonText = (config.buttonText as string) || "登录";
  const buttonBgColor = (config.buttonBgColor as string) || "#1976d2";
  const buttonTextColor = (config.buttonTextColor as string) || "#ffffff";
  const buttonHoverColor = (config.buttonHoverColor as string) || "#1565c0";
  const buttonFontSize = (config.buttonFontSize as number) ?? 15;
  const buttonBorderRadius = (config.buttonBorderRadius as number) ?? 8;
  const buttonHeight = (config.buttonHeight as number) ?? 44;
  const buttonFullWidth = (config.buttonFullWidth as boolean) ?? true;

  // ─── 记住我 ───
  const showRemember = (config.showRemember as boolean) ?? false;
  const rememberLabel = (config.rememberLabel as string) || "记住我";
  const rememberFontSize = (config.rememberFontSize as number) ?? 13;
  const rememberColor = (config.rememberColor as string) || "#666666";
  const rememberAccentColor = (config.rememberAccentColor as string) || "#1976d2";

  // ─── 忘记密码 ───
  const showForgot = (config.showForgot as boolean) ?? false;
  const forgotText = (config.forgotText as string) || "忘记密码？";
  const forgotUrl = (config.forgotUrl as string) || "";
  const forgotLinkColor = (config.forgotLinkColor as string) || "#1976d2";
  const forgotFontSize = (config.forgotFontSize as number) ?? 13;

  // ─── 错误提示 ───
  const errorBgColor = (config.errorBgColor as string) || "#fff3f3";
  const errorTextColor = (config.errorTextColor as string) || "#f44336";
  const errorBorderRadius = (config.errorBorderRadius as number) ?? 8;

  // ═══ v5 多租户 ═══
  const showTenantField = (config.showTenantField as boolean) ?? false;
  const tenantLabel = (config.tenantLabel as string) || "租户ID";
  const tenantPlaceholder = (config.tenantPlaceholder as string) || "请输入租户ID";
  const tenantRequired = (config.tenantRequired as boolean) ?? false;
  const tenantHeaderName = (config.tenantHeaderName as string) || "tenant-id";
  const tenantDefaultValue = (config.tenantDefaultValue as string) || "";
  const tenantBgColor = (config.tenantBgColor as string) || "#f5f5f5";
  const tenantTextColor = (config.tenantTextColor as string) || "#333333";
  const tenantBorderColor = (config.tenantBorderColor as string) || "#d0d0d8";
  const tenantFocusColor = (config.tenantFocusColor as string) || "#1976d2";
  const tenantBorderRadius = (config.tenantBorderRadius as number) ?? 8;
  const tenantHeight = (config.tenantHeight as number) ?? 42;
  const tenantFontSize = (config.tenantFontSize as number) ?? 14;
  const tenantLabelColor = (config.tenantLabelColor as string) || "#666666";

  // ═══ v5 验证码 ═══
  const showCaptcha = (config.showCaptcha as boolean) ?? false;
  const captchaType = (config.captchaType as string) || "image";
  const captchaLabel = (config.captchaLabel as string) || "图形验证码";
  const captchaPlaceholder = (config.captchaPlaceholder as string) || "请输入验证码";
  const captchaEndpoint = (config.captchaEndpoint as string) || "";
  const captchaWidth = (config.captchaWidth as number) ?? 120;
  const captchaHeight = (config.captchaHeight as number) ?? 40;
  const captchaBgColor = (config.captchaBgColor as string) || "#f5f5f5";
  const captchaTextColor = (config.captchaTextColor as string) || "#333333";
  const captchaBorderColor = (config.captchaBorderColor as string) || "#d0d0d8";
  const captchaBorderRadius = (config.captchaBorderRadius as number) ?? 8;
  const captchaFontSize = (config.captchaFontSize as number) ?? 14;
  const captchaRefreshColor = (config.captchaRefreshColor as string) || "#1976d2";

  // ═══ v5 短信登录 ═══
  const loginType = (config.loginType as string) || "password";
  const smsLabel = (config.smsLabel as string) || "手机号";
  const smsPlaceholder = (config.smsPlaceholder as string) || "请输入手机号";
  const smsCodeLabel = (config.smsCodeLabel as string) || "验证码";
  const smsCodePlaceholder = (config.smsCodePlaceholder as string) || "请输入验证码";
  const smsCodeLength = (config.smsCodeLength as number) ?? 6;
  const smsButtonText = (config.smsButtonText as string) || "获取验证码";
  const smsEndpoint = (config.smsEndpoint as string) || "";
  const smsCooldown = (config.smsCooldown as number) ?? 60;
  const smsBgColor = (config.smsBgColor as string) || "#f5f5f5";
  const smsTextColor = (config.smsTextColor as string) || "#333333";
  const smsBorderColor = (config.smsBorderColor as string) || "#d0d0d8";
  const smsBorderRadius = (config.smsBorderRadius as number) ?? 8;
  const smsHeight = (config.smsHeight as number) ?? 42;
  const smsFontSize = (config.smsFontSize as number) ?? 14;
  const smsLabelColor = (config.smsLabelColor as string) || "#666666";
  const smsCodeBgColor = (config.smsCodeBgColor as string) || "#f5f5f5";
  const smsCodeTextColor = (config.smsCodeTextColor as string) || "#333333";
  const smsCodeBorderColor = (config.smsCodeBorderColor as string) || "#d0d0d8";
  const smsCodeBorderRadius = (config.smsCodeBorderRadius as number) ?? 8;
  const smsCodeHeight = (config.smsCodeHeight as number) ?? 42;
  const smsCodeFontSize = (config.smsCodeFontSize as number) ?? 14;
  const smsCodeLabelColor = (config.smsCodeLabelColor as string) || "#666666";
  const smsButtonBgColor = (config.smsButtonBgColor as string) || "#1976d2";
  const smsButtonTextColor = (config.smsButtonTextColor as string) || "#ffffff";
  const smsButtonFontSize = (config.smsButtonFontSize as number) ?? 13;
  const smsButtonBorderRadius = (config.smsButtonBorderRadius as number) ?? 8;
  const smsButtonHoverColor = (config.smsButtonHoverColor as string) || "#1565c0";

  // ═══ v5 社交登录 ═══
  const showSocialLogin = (config.showSocialLogin as boolean) ?? false;
  const socialLoginTitle = (config.socialLoginTitle as string) || "其他登录方式";
  const socialLoginTitleColor = (config.socialLoginTitleColor as string) || "#999999";
  const socialLoginTitleFontSize = (config.socialLoginTitleFontSize as number) ?? 12;
  const socialLoginGap = (config.socialLoginGap as number) ?? 12;
  const socialLoginBgColor = (config.socialLoginBgColor as string) || "#f8f8f8";
  const socialLoginBorderRadius = (config.socialLoginBorderRadius as number) ?? 20;
  const socialLoginSize = (config.socialLoginSize as number) ?? 40;
  const socialLoginLayout = (config.socialLoginLayout as string) || "row";
  const socialButtons = (config.socialButtons as Array<{
    id: string; label: string; icon: string; authUrl: string; bgColor: string; textColor: string;
  }>) ?? [];

  // ═══ v5 动态认证参数（配置驱动，彻底替代硬编码字段） ═══
  const useDynamicParams = (config.useDynamicParams as boolean) ?? false;
  const authParams = (config.authParams as AuthParam[]) ?? [];

  // ─── v5 状态 ───
  const [tenant, setTenant] = useState("");
  const [captchaValue, setCaptchaValue] = useState("");
  const [smsPhone, setSmsPhone] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [smsCountdown, setSmsCountdown] = useState(0);
  const [smsSending, setSmsSending] = useState(false);
  const [activeTab, setActiveTab] = useState<"password" | "sms">("password");
  const showPasswordMode = loginType === "password" || (loginType === "both" && activeTab === "password");
  const showSmsMode = loginType === "sms" || (loginType === "both" && activeTab === "sms");

  // ─── 表单状态 ───
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // v5 动态参数表单值和密码可见性
  const [dynamicValues, setDynamicValues] = useState<Record<string, string>>({});
  const [showPasswordMap, setShowPasswordMap] = useState<Record<string, boolean>>({});
  // v3 门禁联动：初始隐藏时由 auth-guard 唤起
  const [visible, setVisible] = useState(!initiallyHidden);

  const setLogin = useWebsiteAuthStore((s) => s.setLogin);
  const setAuthError = useWebsiteAuthStore((s) => s.setError);
  const setAuthConfig = useWebsiteAuthStore((s) => s.setConfig);
  const buildAuthHeaders = useWebsiteAuthStore((s) => s.buildAuthHeaders);
  const setCachedValue = useWebsiteAuthStore((s) => s.setCachedValue);
  const findExpirationTimeMapping = useWebsiteAuthStore((s) => s.findExpirationTimeMapping);
  const getCachedValue = useWebsiteAuthStore((s) => s.getCachedValue);
  const extractAndCacheResponse = useWebsiteAuthStore((s) => s.extractAndCacheResponse);
  const getUserProfileCandidateKeys = useWebsiteAuthStore((s) => s.getUserProfileCandidateKeys);

  // ─── 同步配置到 authStore（v4 端点编排 + 配置驱动） ───
  // 将组件 config 中的 token/refresh/header/endpoints 配置写入 websiteAuthStore
  // 使 HttpAdapter.buildAuthHeaders() 和 tryRefreshToken() 能读取到配置
  // v4: 优先使用 endpoints 数组，同时从散落字段补齐兼容
  useEffect(() => {
    // 构建端点列表：优先使用 endpoints 数组，补充 responseMapping
    const defaultMapping = [
      { sourcePath: tokenField, targetKey: tokenKey, saveToCache: true },
      { sourcePath: refreshTokenField, targetKey: "refreshToken", saveToCache: true },
      { sourcePath: expiresInField, targetKey: "expiresIn", saveToCache: true, isExpirationTime: true },
    ];

    // 如果 endpoints 数组有内容，使用它；否则从散落字段构建兼容端点
    const effectiveEndpoints = endpoints.length > 0
      ? endpoints.map(ep => ({
          id: ep.id,
          name: ep.name,
          path: ep.path,
          method: ep.method,
          endpointType: (ep.endpointType || "other") as "login" | "logout" | "refresh" | "userInfo" | "register" | "other",
          responseMapping: ep.responseMapping?.length ? ep.responseMapping : defaultMapping,
        }))
      : refreshEnabled && refreshEndpointPath
        ? [{
            id: "refresh",
            name: "refresh",
            path: refreshEndpointPath,
            method: refreshEndpointMethod,
            endpointType: "refresh" as const,
            responseMapping: defaultMapping,
          }]
        : [];

    setAuthConfig({
      token: {
        storage: tokenStorage,
        key: tokenKey,
        header: tokenHeader,
        prefix: tokenPrefix,
      },
      refresh: {
        enabled: refreshEnabled,
        threshold: refreshThreshold,
      },
      headerConfigs,
      endpoints: effectiveEndpoints,
      validation: {
        codePath: String(config.codeField ?? ""),
        msgPath: String(config.msgField ?? "msg"),
        successCodes: parseSuccessCodes(config.successCodes),
        msgFallback: String(config.msgFallback ?? "请求失败"),
      },
      responseMappings: [
        { sourcePath: tokenField, targetKey: tokenKey, saveToCache: true },
        { sourcePath: refreshTokenField, targetKey: "refreshToken", saveToCache: true },
        { sourcePath: expiresInField, targetKey: "expiresIn", saveToCache: true, isExpirationTime: true },
        { sourcePath: userField, targetKey: "user", saveToCache: false },
      ],
      authParams: authParams.length > 0 ? authParams : undefined,
    });
  }, [tokenStorage, tokenKey, tokenHeader, tokenPrefix, refreshEnabled, refreshThreshold, refreshEndpointPath, refreshEndpointMethod, headerConfigs, tokenField, refreshTokenField, expiresInField, userField, endpoints, setAuthConfig]);

  // ─── v3 门禁联动：监听 auth-guard 唤起事件 ───
  useEffect(() => {
    if (!initiallyHidden) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { loginFormId?: string } | undefined;
      // 如果指定了 loginFormId 但不是自己，则忽略（目前 renderer 拿不到自己的 id，所以接受所有）
      void detail;
      setVisible(true);
    };
    window.addEventListener("webcraft-show-login", handler);
    return () => window.removeEventListener("webcraft-show-login", handler);
  }, [initiallyHidden]);

  // ─── v5 联动闭环：登录成功后自动隐藏（initiallyHidden 模式） ───
  useEffect(() => {
    if (!initiallyHidden) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { isAuthenticated?: boolean } | undefined;
      if (detail?.isAuthenticated) {
        setVisible(false);
      }
    };
    window.addEventListener("auth-state-change", handler);
    return () => window.removeEventListener("auth-state-change", handler);
  }, [initiallyHidden]);

  // ─── v3 预设模板：选择预设后自动填充各字段 ───
  useEffect(() => {
    if (authPreset === lastAppliedPreset.current) return;
    lastAppliedPreset.current = authPreset;
    if (authPreset === "custom") return;
    const allPresets = getAllAuthPresets();
    const preset = allPresets[authPreset] || AUTH_PRESETS[authPreset];
    if (!preset || !onConfigChange) return;
    // 选预设后自动折叠高级选项
    onConfigChange("showAdvanced", false);
    // 逐字段应用预设值
    for (const [key, value] of Object.entries(preset.config)) {
      onConfigChange(key, value);
    }
  }, [authPreset, onConfigChange]);

  // ─── v4 响应映射模板：选择模板后自动同步到 store ───
  useEffect(() => {
    if (mappingTemplate === "custom") return;
    const tpl = RESPONSE_MAPPING_TEMPLATES.find(t => t.id === mappingTemplate);
    if (!tpl) return;
    // 同步模板的 mappings 到 store 的 config.responseMappings
    // 同时通过 onConfigChange 同步到组件 config 的 responseMappings
    if (onConfigChange && tpl.mappings.length > 0) {
      onConfigChange("responseMappings", tpl.mappings);
      // 同步派生字段到 tokenField/refreshTokenField/expiresInField/userField
      const tokenMapping = tpl.mappings.find(m => m.targetKey.includes("token") || m.targetKey.includes("Token"));
      if (tokenMapping) onConfigChange("tokenField", tokenMapping.sourcePath);
      const refreshMapping = tpl.mappings.find(m => m.targetKey === "refreshToken");
      if (refreshMapping) onConfigChange("refreshTokenField", refreshMapping.sourcePath);
      const expMapping = tpl.mappings.find(m => m.isExpirationTime);
      if (expMapping) onConfigChange("expiresInField", expMapping.sourcePath);
      const userMapping = tpl.mappings.find(m => m.targetKey === "user" || m.targetKey === "userId");
      if (userMapping) onConfigChange("userField", userMapping.sourcePath);
    }
    applyMappingTemplate(mappingTemplate);
  }, [mappingTemplate, onConfigChange, applyMappingTemplate]);

  // ─── 从响应中按路径取值 ───
  const getNested = useCallback((obj: unknown, path: string): unknown => {
    const keys = path.replace(/\[(\d+)]/g, ".$1").split(".");
    let cur: unknown = obj;
    for (const k of keys) {
      if (cur === null || cur === undefined) return undefined;
      cur = (cur as Record<string, unknown>)[k];
    }
    return cur;
  }, []);

  const parseExpiresIn = useCallback((val: unknown): number => {
    if (val === undefined || val === null) return 0;
    const n = typeof val === "number" ? val : Number(val);
    if (!isNaN(n)) {
      if (n > 1e12) return n;
      return Date.now() + n * 1000;
    }
    const d = new Date(String(val));
    if (!isNaN(d.getTime())) return d.getTime();
    return 0;
  }, []);

  const handleLogin = async () => {
    if (!apiUrl) {
      setError("未配置 API 地址");
      return;
    }

    // SMS 模式
    if (showSmsMode) {
      if (!smsPhone) { setError("请输入手机号"); return; }
      if (!smsCode) { setError("请输入验证码"); return; }
      setLoading(true);
      setError(null);
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        // 注入多租户
        if (showTenantField && tenantHeaderName) {
          const tv = tenant || tenantDefaultValue;
          if (tv) headers[tenantHeaderName] = tv;
        }
        const response = await fetch(apiUrl, {
          method,
          headers,
          body: JSON.stringify({ phone: smsPhone, code: smsCode, captcha: captchaValue || undefined }),
          credentials: authMode === "session" ? "include" : "same-origin",
        });
        if (!response.ok) {
          const errText = await response.text().catch(() => "");
          setError(`登录失败 (${response.status}): ${errText}`);
          setLoading(false);
          return;
        }
        const data = await response.json().catch(() => ({}));
        const token = getNested(data, tokenField) as string | undefined;
        if (!token && authMode !== "session") {
          setError("登录响应中未找到 token");
          setLoading(false);
          return;
        }
        if (authMode === "session") {
          const user = getNested(data, userField);
          setLogin({ cookieBased: true, user: (user as Record<string, unknown>) as never }, "session");
        } else {
          const refreshToken = getNested(data, refreshTokenField) as string | undefined;
          const expiresInRaw = getNested(data, expiresInField);
          const expiresAt = parseExpiresIn(expiresInRaw);
          const user = getNested(data, userField);
          const userObj = (user && typeof user === "object") ? (user as Record<string, unknown>) : (token ? extractUserFromJwt(token) : {});
          setLogin({ token, refreshToken, expiresAt, user: userObj as never }, "jwt");
        }
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "登录请求异常");
        setLoading(false);
      }
      return;
    }

    // 密码模式
    if (!username || !password) {
      setError("请输入用户名和密码");
      return;
    }
    if (showCaptcha && captchaType === "image" && !captchaValue) {
      setError("请输入验证码");
      return;
    }
    if (showTenantField && tenantRequired && !tenant && !tenantDefaultValue) {
      setError("请输入租户ID");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (authMode === "basic") {
        const credentials = btoa(`${username}:${password}`);
        setLogin(
          { token: credentials, user: { username, name: username } },
          "basic",
        );
        setLoading(false);
        return;
      }

      const loginBody: Record<string, unknown> = { username, password, remember };
      // v5 验证码注入
      if (showCaptcha && captchaValue) {
        loginBody.captcha = captchaValue;
      }
      // v5 多租户注入到 body（部分后端需要 body 中的 tenantId）
      if (showTenantField) {
        loginBody.tenantId = tenant || tenantDefaultValue;
      }
      const loginEp = endpoints.find((e) => e.endpointType === "login");
      // v7：按登录端点的 content-type 配置编码请求体
      const enc = encodeAuthBody(loginBody, [], loginEp?.contentType);
      const headers: Record<string, string> = { ...enc.headers };
      // v5 多租户注入
      if (showTenantField && tenantHeaderName) {
        const tv = tenant || tenantDefaultValue;
        if (tv) headers[tenantHeaderName] = tv;
      }
      const response = await fetch(apiUrl, {
        method,
        headers,
        body: enc.body,
        credentials: authMode === "session" ? "include" : "same-origin",
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        setError(`登录失败 (${response.status}): ${errText}`);
        setLoading(false);
        return;
      }

      const data = await response.json().catch(() => ({}));

      if (authMode === "session") {
        const user = getNested(data, userField);
        setLogin(
          { cookieBased: true, user: (user as Record<string, unknown>) as never },
          "session",
        );
      } else {
        const token = getNested(data, tokenField) as string | undefined;
        const refreshToken = getNested(data, refreshTokenField) as string | undefined;
        const expiresInRaw = getNested(data, expiresInField);
        const expiresAt = parseExpiresIn(expiresInRaw);
        const user = getNested(data, userField);

        if (!token) {
          setError("登录响应中未找到 token");
          setLoading(false);
          return;
        }

        const userObj = (user && typeof user === "object")
          ? (user as Record<string, unknown>)
          : extractUserFromJwt(token);

        setLogin(
          { token, refreshToken, expiresAt, user: userObj as never },
          "jwt",
        );
      }
      setLoading(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "登录请求异常";
      setError(msg);
      setAuthError(msg);
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isEdit) {
      if (useDynamicParams && authParams.length > 0) handleDynamicLogin();
      else handleLogin();
    }
  };

  // ─── v5 动态参数模式：从 authParams 构建请求 ───
  async function handleDynamicLogin() {
    if (!apiUrl) { setError("未配置 API 地址"); return; }

    // 校验必填
    for (const p of authParams) {
      const val = dynamicValues[p.id] ?? p.value ?? "";
      if (p.required && !val) {
        setError(`请输入${p.label}`);
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      // 从 authParams 按 location 分组构建请求
      const bodyParams: Record<string, unknown> = {};
      const queryParams: Record<string, string> = {};
      const formDataParts: Array<{ key: string; value: string }> = [];

      authParams.forEach((p) => {
        const val = dynamicValues[p.id] ?? p.value ?? "";
        if (!val) return;
        if (p.location === "query") queryParams[p.key] = val;
        else if (p.location === "formData") formDataParts.push({ key: p.key, value: val });
        else bodyParams[p.key] = val;
      });

      // 构建 URL（含 query 参数）
      let url = apiUrl;
      if (Object.keys(queryParams).length > 0) {
        const sep = url.includes("?") ? "&" : "?";
        url += sep + new URLSearchParams(queryParams).toString();
      }

      // 构建 headers（使用 store 的 buildAuthHeaders 注入多租户等）
      // P1-12: 使用响应式 hook 而非 getWebsiteAuthState() 非响应式读取
      const headers = buildAuthHeaders();

      // v7：按登录端点的 content-type 配置统一编码请求体
      // 兼容旧行为：默认 json；纯 formData 用 FormData；配置 form/formData 时完全按配置编码
      const loginEp = endpoints.find((e) => e.endpointType === "login");
      const enc = encodeAuthBody(bodyParams, formDataParts, loginEp?.contentType);
      Object.assign(headers, enc.headers);
      if (enc.forceNoContentType) delete headers["Content-Type"];
      const body: string | FormData | undefined = enc.body;

      // ─── Basic Auth 模式：btoa(user:pass) 存缓存，不发起请求 ───
      if (authMode === "basic") {
        const dynUsername = (bodyParams["username"] ?? bodyParams["user"] ?? bodyParams["email"] ?? queryParams["username"] ?? "") as string;
        const dynPassword = (bodyParams["password"] ?? bodyParams["passwd"] ?? bodyParams["pass"] ?? queryParams["password"] ?? "") as string;
        if (!dynUsername || !dynPassword) {
          setError("请输入用户名和密码");
          setLoading(false);
          return;
        }
        const credentials = btoa(`${dynUsername}:${dynPassword}`);
        const dynUserObj: Record<string, unknown> = { username: dynUsername, name: dynUsername };
        // 缓存所有 authParams 的值（供 UserProfile 展示）
        authParams.forEach((p) => {
          const v = bodyParams[p.key] ?? queryParams[p.key];
          if (v) setCachedValue(p.key, v as string);
        });
        setLogin(
          { token: credentials, user: dynUserObj as never },
          "basic",
        );
        setLoading(false);
        return;
      }

      const response = await fetch(url, {
        method,
        headers,
        body,
        credentials: authMode === "session" ? "include" : "same-origin",
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        setError(`登录失败 (${response.status}): ${errText}`);
        setLoading(false);
        return;
      }

      const data = await response.json().catch(() => ({}));

      if (authMode === "session") {
        setLogin({ cookieBased: true, user: data as Record<string, unknown> as never }, "session");
      } else {
        // 使用 store 的 extractAndCacheResponse 自动提取并缓存响应字段
        extractAndCacheResponse(data as Record<string, unknown>);

        // 从缓存读取 token
        const token = getCachedValue(tokenKey);
        const refreshToken = getCachedValue("refreshToken");
        const expiresInStr = findExpirationTimeMapping()?.expiresInStr;
        const expiresAt = expiresInStr ? parseExpiresIn(expiresInStr) : undefined;

        if (!token) {
          setError("登录响应中未找到 token");
          setLoading(false);
          return;
        }

        // 从缓存构建 user 对象
        const candidateKeys = getUserProfileCandidateKeys();
        const userObj: Record<string, unknown> = {};
        candidateKeys.forEach((k) => {
          const v = getCachedValue(k);
          if (v) userObj[k] = v;
        });

        // 如果没有从缓存提取到用户信息，尝试从 JWT 解码
        const user = Object.keys(userObj).length > 0 ? userObj : extractUserFromJwt(token);

        setLogin(
          { token, refreshToken: refreshToken ?? undefined, expiresAt, user: user as never },
          authMode as "jwt" | "basic" | "oauth2" | "sso" | "api-key",
        );
      }
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录请求异常");
      setAuthError(err instanceof Error ? err.message : "登录请求异常");
      setLoading(false);
    }
  }

  // ─── v5 短信验证码发送 ───
  const handleSendSms = async () => {
    if (!smsPhone) { setError("请输入手机号"); return; }
    if (!smsEndpoint) { setError("未配置短信发送 API"); return; }
    setSmsSending(true);
    setError(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (showTenantField && tenantHeaderName) {
        const tv = tenant || tenantDefaultValue;
        if (tv) headers[tenantHeaderName] = tv;
      }
      const resp = await fetch(smsEndpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({ phone: smsPhone }),
      });
      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        setError(`发送验证码失败 (${resp.status}): ${errText}`);
        setSmsSending(false);
        return;
      }
      // 启动倒计时
      setSmsCountdown(smsCooldown);
      const timer = setInterval(() => {
        setSmsCountdown((prev) => {
          if (prev <= 1) { clearInterval(timer); return 0; }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "发送验证码异常");
    }
    setSmsSending(false);
  };

  // ─── v5 社交登录 SVG 图标 ───
  const socialIcons: Record<string, string> = {
    wechat: "M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.186 3.002 5.486L2.5 17l2.937-1.526c.574.158 1.183.234 1.804.234.179 0 .356-.012.534-.024-.113-.348-.177-.715-.177-1.096 0-3.708 3.291-6.714 7.354-6.714.179 0 .355.012.531.024C14.729 4.218 11.949 2.188 8.691 2.188zm-2.6 3.476c.43 0 .778.347.778.778 0 .43-.349.778-.778.778-.43 0-.778-.348-.778-.778 0-.43.349-.778.778-.778zm5.182 0c.43 0 .778.347.778.778 0 .43-.349.778-.778.778-.43 0-.778-.348-.778-.778 0-.43.349-.778.778-.778z",
    github: "M12 2C6.477 2 2 6.486 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.012-1.7-2.782.603-3.369-1.342-3.369-1.342-.455-1.157-1.11-1.465-1.11-1.465-.908-.621.069-.608.069-.608 1.003.071 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.349-1.087.633-1.337-2.221-.252-4.555-1.11-4.555-4.942 0-1.091.39-1.984 1.029-2.684-.103-.252-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.114 2.502.334 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.395.1 2.647.64.7 1.028 1.593 1.028 2.684 0 3.842-2.337 4.687-4.565 4.935.359.309.679.918.679 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.138 20.163 22 16.418 22 12c0-5.514-4.477-10-10-10z",
    google: "M12.545 12l3.955-3.956-3.955-3.955-1.414 1.414L13.672 12l-2.541 2.541z M21 12c0-4.971-4.029-9-9-9s-9 4.029-9 9 4.029 9 9 9c2.553 0 4.862-1.055 6.513-2.746l-1.414-1.414C15.81 17.156 14.022 18 12 18c-3.314 0-6-2.686-6-6s2.686-6 6-6c1.657 0 3.157.671 4.243 1.757L18 6l-1.757 4.243z",
    qq: "M12.001 2c2.5 0 4.5 2 4.5 4.5 0 .5-.1 1-.2 1.5 1 .5 2 1.5 2.5 3 .5 1.5.5 3 .5 4.5 0 0 0 .5-.5 1l-.5.5c0 .5-.5 1-1 1.5-.5.5-1 .5-1.5 0 0 0-.5 1-1 1.5-.5.5-1 .5-1.5.5h-2c-.5 0-1 0-1.5-.5-.5-.5-1-1.5-1-1.5-.5.5-1 .5-1.5 0-.5-.5-1-1-1-1.5l-.5-.5c-.5-.5-.5-1-.5-1 0-1.5 0-3 .5-4.5.5-1.5 1.5-2.5 2.5-3-.1-.5-.2-1-.2-1.5 0-2.5 2-4.5 4.5-4.5z",
    weibo: "M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm3.5 14c-1 1-3 1.5-4.5 1s-3-2-2.5-3.5c.5-1.5 2.5-2 4-1.5s3 1 3 2-.5 1-1 2z",
    apple: "M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.243 0-1.432.62-2.198.44-3.127-.35C2.966 15.5 3.5 7.5 7.84 7.5c1.5 0 2.5 1 3.5 1 1 0 2.5-1 4-1 1.5 0 3 .5 3.5 2.5-2 1.5-2.5 4.5-.79 7.28.28.35.56.65.79 1zM12.5 6.5c.5-2 2-3.5 3.5-3.5.5 2-1 3.5-3.5 3.5z",
  };

  const getSocialIcon = (iconName: string) => {
    const path = socialIcons[iconName] || socialIcons.github;
    return (
      <svg width={socialLoginSize * 0.5} height={socialLoginSize * 0.5} viewBox="0 0 24 24" fill="currentColor">
        <path d={path} />
      </svg>
    );
  };

  // ─── v5 验证码图片刷新 ───
  const [captchaImgSrc, setCaptchaImgSrc] = useState("");
  const refreshCaptcha = useCallback(() => {
    if (!captchaEndpoint) return;
    const sep = captchaEndpoint.includes("?") ? "&" : "?";
    setCaptchaImgSrc(`${captchaEndpoint}${sep}_t=${Date.now()}`);
  }, [captchaEndpoint]);

  useEffect(() => {
    if (showCaptcha && captchaType === "image" && captchaEndpoint) {
      refreshCaptcha();
    }
  }, [showCaptcha, captchaType, captchaEndpoint, refreshCaptcha]);

  // ─── 共享输入框 sx 工厂 ───
  const inputSx = (opts: {
    bgColor: string;
    textColor: string;
    borderColor: string;
    focusColor: string;
    radius: number;
    height: number;
    fontSize: number;
    labelColor: string;
  }) => ({
    "& .MuiOutlinedInput-root": {
      backgroundColor: opts.bgColor,
      color: opts.textColor,
      borderRadius: `${opts.radius}px`,
      height: `${opts.height}px`,
      fontSize: `${opts.fontSize}px`,
      "& fieldset": { borderColor: opts.borderColor },
      "&:hover fieldset": { borderColor: opts.borderColor },
      "&.Mui-focused fieldset": { borderColor: opts.focusColor, borderWidth: 2 },
      "&.Mui-disabled fieldset": { borderColor: opts.borderColor },
      "&.Mui-disabled": { backgroundColor: opts.bgColor, color: opts.textColor, opacity: 1, WebkitTextFillColor: opts.textColor },
    },
    "& .MuiInputLabel-root": {
      color: opts.labelColor,
      fontSize: `${opts.fontSize}px`,
      "&.Mui-focused": { color: opts.focusColor },
      "&.Mui-disabled": { color: opts.labelColor, opacity: 0.6 },
    },
    "& .MuiInputBase-input::placeholder": {
      opacity: 0.6,
    },
  });

  // ─── 阴影映射 ───
  const shadowMap: Record<string, string> = {
    "none": "none",
    "0 2px 8px rgba(0,0,0,0.08)": "0 2px 8px rgba(0,0,0,0.08)",
    "0 4px 16px rgba(0,0,0,0.12)": "0 4px 16px rgba(0,0,0,0.12)",
    "0 8px 32px rgba(0,0,0,0.16)": "0 8px 32px rgba(0,0,0,0.16)",
  };
  const shadowValue = shadowMap[containerShadow] || "none";

  // ─── flex 布局间隙 ───
  const gapStr = `${fieldGap}px`;

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        display: visible ? "flex" : "none",
        flexDirection: "column",
        // 修复：移除 justifyContent: center，避免内容超出容器时顶部被裁切
        justifyContent: "flex-start",
        background: containerBgColor,
        border: `1px solid ${containerBorderColor}`,
        borderRadius: `${containerBorderRadius}px`,
        padding: `${containerPadding}px`,
        boxSizing: "border-box",
        boxShadow: shadowValue,
        // 修复：编辑模式 visible 防止裁切；预览模式 auto 可滚动
        overflow: isEdit ? "visible" : "auto",
        gap: gapStr,
      }}
    >
      {/* ─── 标题 ─── */}
      {showTitle && (
        <Typography
          sx={{
            fontSize: `${titleFontSize}px`,
            fontWeight: titleFontWeight,
            color: titleColor,
            textAlign: titleAlign as "left" | "center" | "right",
            margin: 0,
            marginBottom: `${titleMarginBottom}px`,
            lineHeight: 1.3,
          }}
        >
          {titleText}
        </Typography>
      )}

      {/* ─── 副标题 ─── */}
      {showSubtitle && (
        <Typography
          sx={{
            fontSize: `${subtitleFontSize}px`,
            color: subtitleColor,
            textAlign: subtitleAlign as "left" | "center" | "right",
            margin: 0,
            lineHeight: 1.4,
          }}
        >
          {subtitleText}
        </Typography>
      )}

      {/* ─── 错误提示 ─── */}
      {error && (
        <Alert
          severity="error"
          icon={false}
          sx={{
            backgroundColor: errorBgColor,
            color: errorTextColor,
            borderRadius: `${errorBorderRadius}px`,
            fontSize: `${Math.max(usernameFontSize - 1, 11)}px`,
            margin: 0,
          }}
        >
          {error}
        </Alert>
      )}

      {/* ─── v5 Tab 切换（loginType=both 时显示） ─── */}
      {loginType === "both" && (
        <Box sx={{ display: "flex", gap: "4px", borderBottom: `1px solid ${usernameBorderColor}`, flexShrink: 0 }}>
          {(["password", "sms"] as const).map((tab) => (
            <Box
              key={tab}
              onClick={() => !isEdit && setActiveTab(tab)}
              sx={{
                padding: "6px 16px",
                cursor: isEdit ? "default" : "pointer",
                fontSize: `${usernameFontSize}px`,
                fontWeight: activeTab === tab ? 600 : 400,
                color: activeTab === tab ? usernameFocusColor : usernameLabelColor,
                borderBottom: activeTab === tab ? `2px solid ${usernameFocusColor}` : "2px solid transparent",
                marginBottom: "-1px",
              }}
            >
              {tab === "password" ? "账号密码" : "手机验证码"}
            </Box>
          ))}
        </Box>
      )}

      {/* ─── v5 多租户输入框 ─── */}
      {showTenantField && !useDynamicParams && (
        <TextField
          label={tenantLabel + (tenantRequired ? " *" : "")}
          placeholder={tenantPlaceholder}
          value={tenant || tenantDefaultValue}
          onChange={(e) => setTenant(e.target.value)}
          disabled={!isEdit && loading}
          fullWidth
          variant="outlined"
          sx={inputSx({
            bgColor: tenantBgColor,
            textColor: tenantTextColor,
            borderColor: tenantBorderColor,
            focusColor: tenantFocusColor,
            radius: tenantBorderRadius,
            height: tenantHeight,
            fontSize: tenantFontSize,
            labelColor: tenantLabelColor,
          })}
        />
      )}

      {/* ═══ v5 动态参数模式：从 authParams 渲染输入框 ═══ */}
      {useDynamicParams && authParams.length > 0 && (
        <>
          {authParams.map((param) => {
            const val = dynamicValues[param.id] ?? param.value ?? "";
            const showPw = showPasswordMap[param.id] ?? false;
            return (
              <TextField
                key={param.id}
                label={param.label + (param.required ? " *" : "")}
                placeholder={param.description || `请输入${param.label}`}
                type={param.isSecret ? (showPw ? "text" : "password") : "text"}
                value={val}
                onChange={(e) => setDynamicValues((prev) => ({ ...prev, [param.id]: e.target.value }))}
                onKeyDown={handleKeyDown}
                disabled={!isEdit && loading}
                fullWidth
                variant="outlined"
                sx={inputSx({
                  bgColor: usernameBgColor,
                  textColor: usernameTextColor,
                  borderColor: usernameBorderColor,
                  focusColor: usernameFocusColor,
                  radius: usernameBorderRadius,
                  height: usernameHeight,
                  fontSize: usernameFontSize,
                  labelColor: usernameLabelColor,
                })}
                slotProps={param.isSecret ? {
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setShowPasswordMap((prev) => ({ ...prev, [param.id]: !(prev[param.id] ?? false) }));
                          }}
                          edge="end"
                          tabIndex={-1}
                          sx={{ color: usernameBorderColor }}
                        >
                          {showPw
                            ? <VisibilityOffIcon fontSize="small" />
                            : <VisibilityIcon fontSize="small" />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                } : undefined}
              />
            );
          })}
        </>
      )}

      {/* ═══ 密码模式字段（硬编码模式，useDynamicParams=false 时显示） ═══ */}
      {showPasswordMode && !useDynamicParams && (
        <>
          {/* ─── 用户名输入框 ─── */}
          <TextField
            label={usernameLabel}
            placeholder={usernamePlaceholder}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!isEdit && loading}
            fullWidth
            variant="outlined"
            sx={inputSx({
              bgColor: usernameBgColor,
              textColor: usernameTextColor,
              borderColor: usernameBorderColor,
              focusColor: usernameFocusColor,
              radius: usernameBorderRadius,
              height: usernameHeight,
              fontSize: usernameFontSize,
              labelColor: usernameLabelColor,
            })}
          />

          {/* ─── 密码输入框 ─── */}
          <TextField
            label={passwordLabel}
            placeholder={passwordPlaceholder}
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!isEdit && loading}
            fullWidth
            variant="outlined"
            sx={inputSx({
              bgColor: passwordBgColor,
              textColor: passwordTextColor,
              borderColor: passwordBorderColor,
              focusColor: passwordFocusColor,
              radius: passwordBorderRadius,
              height: passwordHeight,
              fontSize: passwordFontSize,
              labelColor: passwordLabelColor,
            })}
            slotProps={{
              input: passwordShowToggle ? {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                      tabIndex={-1}
                      sx={{ color: passwordBorderColor }}
                    >
                      {showPassword
                        ? <VisibilityOffIcon fontSize="small" />
                        : <VisibilityIcon fontSize="small" />}
                    </IconButton>
                  </InputAdornment>
                ),
              } : undefined,
            }}
          />

          {/* ─── v5 验证码（图形） ─── */}
          {showCaptcha && captchaType === "image" && (
            <Box sx={{ display: "flex", gap: "8px", alignItems: "flex-end", flexShrink: 0 }}>
              <TextField
                label={captchaLabel}
                placeholder={captchaPlaceholder}
                value={captchaValue}
                onChange={(e) => setCaptchaValue(e.target.value)}
                disabled={!isEdit && loading}
                variant="outlined"
                sx={inputSx({
                  bgColor: captchaBgColor,
                  textColor: captchaTextColor,
                  borderColor: captchaBorderColor,
                  focusColor: usernameFocusColor,
                  radius: captchaBorderRadius,
                  height: captchaHeight,
                  fontSize: captchaFontSize,
                  labelColor: usernameLabelColor,
                })}
              />
              <Box
                onClick={() => !isEdit && refreshCaptcha()}
                sx={{
                  width: `${captchaWidth}px`,
                  height: `${captchaHeight}px`,
                  flexShrink: 0,
                  cursor: isEdit ? "default" : "pointer",
                  background: captchaEndpoint ? `url(${captchaImgSrc || ""}) center/cover` : "#e0e0e0",
                  border: `1px solid ${captchaBorderColor}`,
                  borderRadius: `${captchaBorderRadius}px`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: captchaRefreshColor,
                  fontSize: `${captchaFontSize - 2}px`,
                }}
              >
                {!captchaEndpoint && "验证码"}
              </Box>
            </Box>
          )}

          {/* ─── v5 验证码（滑块/点选，编辑态占位） ─── */}
          {showCaptcha && captchaType !== "image" && (
            <Box
              sx={{
                height: `${captchaHeight}px`,
                background: "#f0f0f0",
                border: `1px dashed ${captchaBorderColor}`,
                borderRadius: `${captchaBorderRadius}px`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#999",
                fontSize: `${captchaFontSize}px`,
                flexShrink: 0,
              }}
            >
              {captchaType === "slider" ? "滑块验证码（发布环境显示）" : "点选验证码（发布环境显示）"}
            </Box>
          )}
        </>
      )}

      {/* ═══ 短信模式字段 ═══ */}
      {showSmsMode && !useDynamicParams && (
        <>
          {/* ─── 手机号输入框 ─── */}
          <TextField
            label={smsLabel}
            placeholder={smsPlaceholder}
            value={smsPhone}
            onChange={(e) => setSmsPhone(e.target.value)}
            disabled={!isEdit && loading}
            fullWidth
            variant="outlined"
            sx={inputSx({
              bgColor: smsBgColor,
              textColor: smsTextColor,
              borderColor: smsBorderColor,
              focusColor: usernameFocusColor,
              radius: smsBorderRadius,
              height: smsHeight,
              fontSize: smsFontSize,
              labelColor: smsLabelColor,
            })}
          />

          {/* ─── 短信验证码 + 发送按钮 ─── */}
          <Box sx={{ display: "flex", gap: "8px", alignItems: "flex-end", flexShrink: 0 }}>
            <TextField
              label={smsCodeLabel}
              placeholder={smsCodePlaceholder}
              value={smsCode}
              onChange={(e) => setSmsCode(e.target.value)}
              disabled={!isEdit && loading}
              variant="outlined"
              sx={inputSx({
                bgColor: smsCodeBgColor,
                textColor: smsCodeTextColor,
                borderColor: smsCodeBorderColor,
                focusColor: usernameFocusColor,
                radius: smsCodeBorderRadius,
                height: smsCodeHeight,
                fontSize: smsCodeFontSize,
                labelColor: smsCodeLabelColor,
              })}
              style={{ flex: 1 }}
              slotProps={{ htmlInput: { maxLength: smsCodeLength } }}
            />
            <Button
              variant="contained"
              disabled={!isEdit && (loading || smsSending || smsCountdown > 0)}
              onClick={handleSendSms}
              disableElevation
              sx={{
                textTransform: "none",
                fontSize: `${smsButtonFontSize}px`,
                fontWeight: 600,
                borderRadius: `${smsButtonBorderRadius}px`,
                height: `${smsCodeHeight}px`,
                minWidth: "100px",
                backgroundColor: smsButtonBgColor,
                color: smsButtonTextColor,
                "&:hover": { backgroundColor: smsButtonHoverColor },
                "&.Mui-disabled": { backgroundColor: smsButtonBgColor, color: smsButtonTextColor, opacity: 0.5 },
                flexShrink: 0,
              }}
            >
              {smsCountdown > 0 ? `${smsCountdown}s` : smsButtonText}
            </Button>
          </Box>
        </>
      )}

      {/* ─── 记住我 + 忘记密码 ─── */}
      {(showRemember || showForgot) && (
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          {showRemember ? (
            <FormControlLabel
              control={
                <Checkbox
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  size="small"
                  sx={{
                    color: rememberAccentColor,
                    "&.Mui-checked": { color: rememberAccentColor },
                  }}
                />
              }
              label={rememberLabel}
              sx={{
                margin: 0,
                "& .MuiFormControlLabel-label": {
                  fontSize: `${rememberFontSize}px`,
                  color: rememberColor,
                },
              }}
            />
          ) : (
            <span />
          )}
          {showForgot && (
            <Link
              href={forgotUrl || "#"}
              underline="none"
              sx={{
                color: forgotLinkColor,
                fontSize: `${forgotFontSize}px`,
                "&:hover": { textDecoration: "underline" },
              }}
            >
              {forgotText}
            </Link>
          )}
        </Box>
      )}

      {/* ─── 登录按钮 ─── */}
      <Button
        variant="contained"
        fullWidth={buttonFullWidth}
        disabled={!isEdit && loading}
        onClick={() => {
          if (useDynamicParams && authParams.length > 0) handleDynamicLogin();
          else handleLogin();
        }}
        disableElevation
        sx={{
          textTransform: "none",
          fontSize: `${buttonFontSize}px`,
          fontWeight: 600,
          borderRadius: `${buttonBorderRadius}px`,
          height: `${buttonHeight}px`,
          width: buttonFullWidth ? "100%" : "auto",
          backgroundColor: buttonBgColor,
          color: buttonTextColor,
          "&:hover": {
            backgroundColor: buttonHoverColor,
          },
          "&.Mui-disabled": {
            backgroundColor: buttonBgColor,
            color: buttonTextColor,
            opacity: 0.6,
          },
          flexShrink: 0,
        }}
      >
        {loading ? (
          <CircularProgress size={buttonFontSize + 4} color="inherit" />
        ) : (
          buttonText
        )}
      </Button>

      {/* ─── v5 社交登录按钮区 ─── */}
      {showSocialLogin && socialButtons.length > 0 && (
        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", flexShrink: 0, marginTop: "4px" }}>
          <Typography sx={{ fontSize: `${socialLoginTitleFontSize}px`, color: socialLoginTitleColor, textAlign: "center" }}>
            {socialLoginTitle}
          </Typography>
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: `${socialLoginGap}px`,
              flexDirection: socialLoginLayout === "row" ? "row" : "row",
            }}
          >
            {socialButtons.map((btn) => (
              <Box
                key={btn.id}
                onClick={() => {
                  if (!isEdit && btn.authUrl) {
                    window.open(btn.authUrl, "_blank");
                  }
                }}
                sx={{
                  width: `${socialLoginSize}px`,
                  height: `${socialLoginSize}px`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: `${socialLoginBorderRadius}px`,
                  background: btn.bgColor || socialLoginBgColor,
                  color: btn.textColor || "#333",
                  cursor: isEdit ? "default" : (btn.authUrl ? "pointer" : "default"),
                  border: `1px solid ${captchaBorderColor}`,
                  transition: "opacity 0.2s",
                  "&:hover": { opacity: 0.85 },
                }}
                title={btn.label}
              >
                {getSocialIcon(btn.icon)}
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}
