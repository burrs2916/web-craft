import type { KeyboardEvent } from "react";
import { useWebsiteAuthStore, extractUserFromJwt, encodeAuthBody } from "../../../store/websiteAuthStore";
import type { LoginFormConfigValues } from "./config";
import type { LoginFormState } from "./useLoginFormState";
import { getNested, parseExpiresIn } from "./shared";

export interface LoginFormActions {
  handleLogin: () => Promise<void>;
  handleDynamicLogin: () => Promise<void>;
  handleSendSms: () => Promise<void>;
  handleKeyDown: (e: KeyboardEvent) => void;
}

/**
 * 登录表单的全部交互动作：密码/短信/动态参数登录、发送短信验证码、回车提交。
 */
export function useLoginActions(
  cfg: LoginFormConfigValues,
  st: LoginFormState,
  isEdit: boolean,
): LoginFormActions {
  const {
    authMode, apiUrl, method, tokenField, refreshTokenField, expiresInField, userField,
    endpoints, showTenantField, tenantHeaderName, tenantDefaultValue, tenantRequired,
    showCaptcha, captchaType, smsEndpoint, smsCooldown, useDynamicParams, authParams,
  } = cfg;
  const {
    setError, setLoading, setSmsSending, setSmsCountdown,
    username, password, remember, showSmsMode, tenant, captchaValue,
    smsPhone, smsCode, dynamicValues,
  } = st;

  const setLogin = useWebsiteAuthStore((s) => s.setLogin);
  const setAuthError = useWebsiteAuthStore((s) => s.setError);
  const buildAuthHeaders = useWebsiteAuthStore((s) => s.buildAuthHeaders);
  const setCachedValue = useWebsiteAuthStore((s) => s.setCachedValue);
  const findExpirationTimeMapping = useWebsiteAuthStore((s) => s.findExpirationTimeMapping);
  const getCachedValue = useWebsiteAuthStore((s) => s.getCachedValue);
  const extractAndCacheResponse = useWebsiteAuthStore((s) => s.extractAndCacheResponse);
  const getUserProfileCandidateKeys = useWebsiteAuthStore((s) => s.getUserProfileCandidateKeys);

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
        const token = getCachedValue(cfg.tokenKey);
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

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !isEdit) {
      if (useDynamicParams && authParams.length > 0) handleDynamicLogin();
      else handleLogin();
    }
  };

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

  return { handleLogin, handleDynamicLogin, handleSendSms, handleKeyDown };
}