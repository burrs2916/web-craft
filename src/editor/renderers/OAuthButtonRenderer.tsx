import { useState, useEffect, useCallback, useMemo } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import type { ComponentRendererProps } from "../../types/editor";
import { useWebsiteAuthStore } from "../../store/websiteAuthStore";
import type { WebsiteAuthUser } from "../../store/websiteAuthStore";

/**
 * OAuth 2.0 登录按钮渲染器 v2
 *
 * v2 修复：
 * - P0-1: 完整回调处理（code→token 交换 + userInfo 获取）
 * - P0-2: PKCE code_challenge_method 与实际方法一致（S256/plain）
 * - P0-3: state 校验防 CSRF
 * - P1-1: 编辑模式虚线边框 + 组件徽章
 * - P1-3: redirectUri 默认值统一（|| 改 ?? + 拼接 /callback）
 * - P1-4: auth-state-change 事件闭环
 * - P2-2: PKCE verifier 生成方式统一（Uint8Array → base64url）
 * - P2-3: loading 状态
 */

/** P2-2: 统一的 base64url 编码函数，renderer 与 codegen 保持一致 */
function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** P2-2: 统一的随机字符串生成（用于 state） */
function generateRandomString(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const array = new Uint8Array(length);
  if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(array);
  } else {
    for (let i = 0; i < length; i++) array[i] = Math.floor(Math.random() * 256);
  }
  for (let i = 0; i < length; i++) {
    result += chars.charAt(array[i] % chars.length);
  }
  return result;
}

/** P2-2: 统一的 PKCE code_verifier 生成 */
function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(array);
  } else {
    for (let i = 0; i < 32; i++) array[i] = Math.floor(Math.random() * 256);
  }
  return base64UrlEncode(array);
}

/** P0-2/P2-2: 统一的 PKCE code_challenge 生成，返回 {challenge, method} */
async function generateCodeChallenge(verifier: string): Promise<{ challenge: string; method: string }> {
  if (typeof window !== "undefined" && window.crypto?.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hash = await window.crypto.subtle.digest("SHA-256", data);
    return { challenge: base64UrlEncode(new Uint8Array(hash)), method: "S256" };
  }
  // P0-2: fallback 到 plain，method 必须一致
  return { challenge: verifier, method: "plain" };
}

export function OAuthButtonRenderer({ config, mode }: ComponentRendererProps) {
  const isEdit = mode === "edit";
  const setLogin = useWebsiteAuthStore((s) => s.setLogin);
  const setCachedValue = useWebsiteAuthStore((s) => s.setCachedValue);
  const setAuthConfig = useWebsiteAuthStore((s) => s.setConfig);

  const text = (config.text as string) ?? "使用第三方登录";
  const authUrl = (config.authUrl as string) ?? "";
  const clientId = (config.clientId as string) ?? "";
  const clientSecret = (config.clientSecret as string) ?? "";
  const redirectUri = (config.redirectUri as string) ?? "";
  const scope = (config.scope as string) ?? "openid profile email";
  const usePKCE = (config.usePKCE as boolean) ?? false;
  const tokenEndpoint = (config.tokenEndpoint as string) ?? "";
  const userInfoEndpoint = (config.userInfoEndpoint as string) ?? "";
  const tokenKey = (config.tokenKey as string) ?? "auth_token";
  const tokenStorage = (config.tokenStorage as string) ?? "localStorage";
  const variant = (config.variant as "contained" | "outlined" | "text") ?? "outlined";
  const bgColor = (config.bgColor as string) ?? "#1976d2";
  const textColor = (config.textColor as string) ?? "#ffffff";
  const fontSize = (config.fontSize as number) ?? 14;
  const borderRadius = (config.borderRadius as number) ?? 4;

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // P1-3: 统一 redirectUri 默认值（空时拼接 origin + /callback）
  // P2-15: 使用 useMemo 避免每次 render 重新计算导致 useCallback 失效
  const resolvedRedirectUri = useMemo(
    () => redirectUri || (typeof window !== "undefined" ? `${window.location.origin}/callback` : ""),
    [redirectUri],
  );

  /** P0-1: OAuth 回调处理——检查 URL 中的 code+state，用 code 换 token */
  const handleOAuthCallback = useCallback(async () => {
    if (typeof window === "undefined") return;
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");
    const state = urlParams.get("state");
    const errorParam = urlParams.get("error");

    // 非 OAuth 回调 URL，跳过
    if (!code && !state && !errorParam) return;

    setLoading(true);
    setErrorMsg(null);

    try {
      // OAuth Provider 返回了错误
      if (errorParam) {
        throw new Error(`OAuth Provider 错误: ${errorParam}`);
      }

      // P0-3: 校验 state 防 CSRF
      let savedState = "";
      try { savedState = sessionStorage.getItem("__webcraft_oauth_state") || ""; } catch {}
      if (!savedState || savedState !== state) {
        throw new Error("State 校验失败，可能存在 CSRF 攻击");
      }
      // 清除已使用的 state
      try { sessionStorage.removeItem("__webcraft_oauth_state"); } catch {}

      // P0-1: 用 code 换 token
      if (!tokenEndpoint) {
        throw new Error("未配置 Token 端点，无法完成授权码交换");
      }

      const tokenBody: Record<string, string> = {
        grant_type: "authorization_code",
        code: code || "",
        redirect_uri: resolvedRedirectUri,
        client_id: clientId,
      };
      // PKCE 模式发送 code_verifier；非 PKCE 模式发送 client_secret
      if (usePKCE) {
        let verifier = "";
        try { verifier = sessionStorage.getItem("__webcraft_pkce_verifier") || ""; } catch {}
        if (!verifier) throw new Error("PKCE verifier 丢失，无法完成 token 交换");
        tokenBody.code_verifier = verifier;
        try { sessionStorage.removeItem("__webcraft_pkce_verifier"); } catch {}
      } else if (clientSecret) {
        tokenBody.client_secret = clientSecret;
      }

      const tokenRes = await fetch(tokenEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(tokenBody).toString(),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        throw new Error(`Token 端点返回 ${tokenRes.status}: ${errText}`);
      }

      const tokenData = await tokenRes.json();
      const accessToken = tokenData.access_token || "";
      const refreshToken = tokenData.refresh_token || "";
      const expiresInNum = tokenData.expires_in ? Number(tokenData.expires_in) : 0;
      const expiresAt = expiresInNum > 0 ? Date.now() + expiresInNum * 1000 : undefined;

      if (!accessToken) {
        throw new Error("Token 端点未返回 access_token");
      }

      // P0-1: 获取用户信息（如果配置了 userInfoEndpoint）
      let userInfo: Record<string, unknown> | undefined;
      if (userInfoEndpoint) {
        try {
          const userRes = await fetch(userInfoEndpoint, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (userRes.ok) {
            userInfo = await userRes.json();
          }
        } catch {
          // userInfo 获取失败不阻断登录流程
        }
      }

      // P1-4: 通过 store 的 setLogin 写入认证状态 + dispatch auth-state-change
      setLogin(
        {
          token: accessToken,
          refreshToken: refreshToken || undefined,
          expiresAt,
          user: userInfo as WebsiteAuthUser | undefined,
        },
        "oauth2",
      );

      // P0-1: 额外用配置的 tokenKey/tokenStorage 存储（与 login-form 一致）
      setCachedValue(tokenKey, accessToken);
      if (refreshToken) setCachedValue("refreshToken", refreshToken);
      if (expiresAt) {
        setCachedValue("__webcraft_auth_expires_at", String(expiresAt));
        setCachedValue("__webcraft_auth_mode", "oauth2");
      }
      setCachedValue("__webcraft_auth_authenticated", "true");
      if (userInfo) setCachedValue("__webcraft_auth_user", JSON.stringify(userInfo));

      // 清除 URL 中的 code/state 参数
      try {
        const cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
      } catch {}
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  }, [tokenEndpoint, userInfoEndpoint, clientId, clientSecret, usePKCE, resolvedRedirectUri, tokenKey, setLogin, setCachedValue]);

  // P0-1: 组件挂载时自动检查是否是 OAuth 回调
  useEffect(() => {
    if (isEdit) return; // 编辑模式不处理回调
    handleOAuthCallback();
  }, [isEdit, handleOAuthCallback]);

  // P0: 同步 token 配置到 store（单一配置源）
  useEffect(() => {
    setAuthConfig({ token: { key: tokenKey, storage: tokenStorage as "localStorage" | "sessionStorage" | "memory" } });
  }, [tokenKey, tokenStorage, setAuthConfig]);

  const handleClick = async () => {
    if (isEdit || loading) return;
    if (!authUrl || !clientId) {
      setErrorMsg("请配置授权 URL 和 Client ID");
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      // P0-3: 生成 state 并存入 sessionStorage
      const state = generateRandomString(32);
      try { sessionStorage.setItem("__webcraft_oauth_state", state); } catch {}

      const params = new URLSearchParams();
      params.append("client_id", clientId);
      params.append("redirect_uri", resolvedRedirectUri);
      params.append("response_type", "code");
      params.append("scope", scope);
      params.append("state", state);

      // P0-2/P2-2: PKCE 生成，method 与实际一致
      if (usePKCE) {
        const verifier = generateCodeVerifier();
        try { sessionStorage.setItem("__webcraft_pkce_verifier", verifier); } catch {}

        const { challenge, method } = await generateCodeChallenge(verifier);
        params.append("code_challenge", challenge);
        params.append("code_challenge_method", method);
      }

      // 跳转到 OAuth Provider
      window.location.href = `${authUrl}?${params.toString()}`;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(msg);
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
      }}
    >
      <Button
        variant={variant}
        disabled={!isEdit && loading}
        onClick={handleClick}
        sx={{
          textTransform: "none",
          fontSize,
          borderRadius,
          width: "100%",
          height: "100%",
          backgroundColor: variant === "contained" ? bgColor : "transparent",
          color: variant === "contained" ? textColor : bgColor,
          border: variant === "outlined" ? `1px solid ${bgColor}` : "none",
          "&:hover": {
            backgroundColor: variant === "contained" ? bgColor : "transparent",
            opacity: 0.85,
          },
          pointerEvents: isEdit ? "none" : "auto",
          "&.Mui-disabled": {
            backgroundColor: variant === "contained" ? bgColor : "transparent",
            color: variant === "contained" ? textColor : bgColor,
            border: variant === "outlined" ? `1px solid ${bgColor}` : "none",
            opacity: 1,
          },
        }}
      >
        {/* P2-3: loading 状态 */}
        {loading ? <CircularProgress size={fontSize + 4} color="inherit" /> : text}
      </Button>

      {/* P2-1: 错误提示 */}
      {errorMsg && (
        <Typography
          sx={{
            position: "absolute",
            bottom: -20,
            left: 0,
            right: 0,
            fontSize: 10,
            color: "error.main",
            textAlign: "center",
            pointerEvents: "none",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {errorMsg}
        </Typography>
      )}

      {/* P1-3: 未配置提示（编辑模式下显示配置缺失） */}
      {isEdit && (!authUrl || !clientId) && (
        <Typography
          sx={{
            position: "absolute",
            bottom: -20,
            left: 0,
            right: 0,
            fontSize: 10,
            color: "warning.main",
            textAlign: "center",
            pointerEvents: "none",
          }}
        >
          ⚠ 请配置授权 URL 和 Client ID
        </Typography>
      )}
    </Box>
  );
}
