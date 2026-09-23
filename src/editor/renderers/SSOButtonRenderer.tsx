import { useState, useEffect, useCallback } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import type { ComponentRendererProps } from "../../types/editor";
import { useWebsiteAuthStore } from "../../store/websiteAuthStore";
import type { WebsiteAuthUser } from "../../store/websiteAuthStore";

/**
 * SSO 单点登录按钮渲染器 v2
 *
 * v2 改造核心：
 * - P0-1: 完整 SSO 回调处理链（URL ticket/code+state 检测 → fetch tokenEndpoint → fetch userInfoEndpoint → store.setLogin + dispatch auth-state-change）
 * - P0-2: state 防 CSRF（跳转前生成 state 存 sessionStorage，回调时校验）
 * - P1-1: variant:"text" 完整处理（之前只处理 contained/outlined）
 * - P1-2: ssoUrl 为空时显式提示（之前静默失败）
 * - P1-3: loading 状态（跳转和回调期间）
 * - P1-4: borderColor 独立配置（之前 outlined 用 bgColor 做边框色）
 * - P1-5: borderRadius 用 || 而非 ??
 * - P1-6: 编辑模式与预览模式渲染一致（不加虚线边框和徽章）
 * - P1-7: auth-state-change 事件闭环
 * - P1-8: redirectOnSuccess/redirectDelay 登录后跳转
 * - P1-9: fullWidth 配置
 *
 * 三种协议的回调参数差异：
 * - OIDC: code + state（与 OAuth 一致）
 * - CAS: ticket + state（CAS 协议用 ticket 而非 code）
 * - SAML: SAMLResponse + state（SAML 协议用 SAMLResponse）
 *
 * 统一处理：检测 URL 中的 code/ticket/SAMLResponse 任一 + state，用第一个非空值作为授权凭证去换 token
 */

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

export function SSOButtonRenderer({ config, mode }: ComponentRendererProps) {
  const isEdit = mode === "edit";
  const setLogin = useWebsiteAuthStore((s) => s.setLogin);
  const setCachedValue = useWebsiteAuthStore((s) => s.setCachedValue);
  const setAuthConfig = useWebsiteAuthStore((s) => s.setConfig);

  const text = (config.text as string) || "SSO 登录";
  const ssoUrl = (config.ssoUrl as string) || "";
  const protocol = (config.protocol as "oidc" | "cas" | "saml") || "oidc";
  const tokenEndpoint = (config.tokenEndpoint as string) || "";
  const userInfoEndpoint = (config.userInfoEndpoint as string) || "";
  const redirectUri = (config.redirectUri as string) || "";
  const tokenKey = (config.tokenKey as string) || "auth_token";
  const tokenStorage = (config.tokenStorage as string) || "localStorage";
  const tokenField = (config.tokenField as string) || "access_token";
  const userField = (config.userField as string) || "user";
  const redirectOnSuccess = (config.redirectOnSuccess as string) || "";
  const redirectDelay = (config.redirectDelay as number) || 1500;
  const variant = (config.variant as "contained" | "outlined" | "text") || "outlined";
  const bgColor = (config.bgColor as string) || "#1976d2";
  const textColor = (config.textColor as string) || "#ffffff";
  const borderColor = (config.borderColor as string) || bgColor;
  const fontSize = (config.fontSize as number) || 14;
  const borderRadius = (config.borderRadius as number) || 4;
  const fullWidth = (config.fullWidth as boolean) ?? true;

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const resolvedRedirectUri = redirectUri || (typeof window !== "undefined" ? `${window.location.origin}/callback` : "");

  /** P0-1: SSO 回调处理——检测 URL 中的授权凭证（code/ticket/SAMLResponse）+ state，换 token */
  const handleSSOCallback = useCallback(async () => {
    if (typeof window === "undefined") return;
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");
    const ticket = urlParams.get("ticket");
    const samlResponse = urlParams.get("SAMLResponse");
    const state = urlParams.get("state");
    const errorParam = urlParams.get("error");

    const authzCredential = code || ticket || samlResponse || "";

    if (!authzCredential && !state && !errorParam) return;

    setLoading(true);
    setErrorMsg(null);

    try {
      if (errorParam) {
        throw new Error(`SSO Provider 错误: ${errorParam}`);
      }

      // P0-2: 校验 state 防 CSRF
      let savedState = "";
      try { savedState = sessionStorage.getItem("__webcraft_sso_state") || ""; } catch {}
      if (!savedState || savedState !== state) {
        throw new Error("State 校验失败，可能存在 CSRF 攻击");
      }
      try { sessionStorage.removeItem("__webcraft_sso_state"); } catch {}

      // P0-1: 用授权凭证换 token
      if (!tokenEndpoint) {
        throw new Error("未配置 Token 端点，无法完成 SSO 回调");
      }

      const tokenBody: Record<string, string> = {
        grant_type: "authorization_code",
        code: authzCredential,
        redirect_uri: resolvedRedirectUri,
        protocol,
      };

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
      const accessToken = String(tokenData[tokenField] || tokenData.access_token || tokenData.token || "");
      const refreshToken = String(tokenData.refresh_token || tokenData.refreshToken || "");
      const expiresInNum = tokenData.expires_in ? Number(tokenData.expires_in) : (tokenData.expiresIn ? Number(tokenData.expiresIn) : 0);
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
            const userData = await userRes.json();
            userInfo = (userField && userData[userField]) ? userData[userField] as Record<string, unknown> : userData;
          }
        } catch {
          // userInfo 获取失败不阻断登录流程
        }
      }

      // P1-7: 通过 store 的 setLogin 写入认证状态 + dispatch auth-state-change
      setLogin(
        {
          token: accessToken,
          refreshToken: refreshToken || undefined,
          expiresAt,
          user: userInfo as WebsiteAuthUser | undefined,
        },
        tokenStorage === "sessionStorage" ? "session" : "jwt",
      );

      // P0-1: 用配置的 tokenKey/tokenStorage 存储
      setCachedValue(tokenKey, accessToken);
      if (refreshToken) setCachedValue("refreshToken", refreshToken);
      if (expiresAt) {
        setCachedValue("__webcraft_auth_expires_at", String(expiresAt));
      }
      setCachedValue("__webcraft_auth_mode", tokenStorage === "sessionStorage" ? "session" : "jwt");
      setCachedValue("__webcraft_auth_authenticated", "true");
      if (userInfo) setCachedValue("__webcraft_auth_user", JSON.stringify(userInfo));

      // 清除 URL 中的回调参数
      try {
        const cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
      } catch {}

      // P1-8: 登录后跳转
      if (redirectOnSuccess) {
        setTimeout(() => { window.location.href = redirectOnSuccess; }, redirectDelay);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  }, [tokenEndpoint, userInfoEndpoint, tokenField, userField, protocol, resolvedRedirectUri, tokenKey, tokenStorage, redirectOnSuccess, redirectDelay, setLogin, setCachedValue]);

  // P0-1: 组件挂载时自动检查是否是 SSO 回调
  useEffect(() => {
    if (isEdit) return;
    handleSSOCallback();
  }, [isEdit, handleSSOCallback]);

  // P0: 同步 token 配置到 store（单一配置源）
  useEffect(() => {
    setAuthConfig({ token: { key: tokenKey, storage: tokenStorage as "localStorage" | "sessionStorage" | "memory" } });
  }, [tokenKey, tokenStorage, setAuthConfig]);

  const handleClick = async () => {
    if (isEdit || loading) return;
    if (!ssoUrl) {
      setErrorMsg("请配置 SSO 授权地址");
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      // P0-2: 生成 state 并存入 sessionStorage
      const state = generateRandomString(32);
      try { sessionStorage.setItem("__webcraft_sso_state", state); } catch {}

      const params = new URLSearchParams();
      params.append("redirect_uri", resolvedRedirectUri);
      params.append("protocol", protocol);
      params.append("state", state);

      const sep = ssoUrl.includes("?") ? "&" : "?";
      window.location.href = `${ssoUrl}${sep}${params.toString()}`;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(msg);
      setLoading(false);
    }
  };

  // P1-1: variant:"text" 完整处理
  const buttonStyle: React.CSSProperties = {
    textTransform: "none",
    fontSize,
    borderRadius,
    width: fullWidth ? "100%" : "auto",
    height: "100%",
    cursor: "pointer",
  };

  if (variant === "contained") {
    buttonStyle.backgroundColor = bgColor;
    buttonStyle.color = textColor;
    buttonStyle.border = "none";
  } else if (variant === "outlined") {
    buttonStyle.backgroundColor = "transparent";
    buttonStyle.color = bgColor;
    buttonStyle.border = `1px solid ${borderColor}`;
  } else {
    // text
    buttonStyle.backgroundColor = "transparent";
    buttonStyle.color = bgColor;
    buttonStyle.border = "none";
  }

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
          ...buttonStyle,
          "&:hover": {
            backgroundColor: variant === "contained" ? bgColor : "transparent",
            opacity: 0.85,
          },
          pointerEvents: isEdit ? "none" : "auto",
          "&.Mui-disabled": {
            ...buttonStyle,
            opacity: 1,
          },
        }}
      >
        {loading ? <CircularProgress size={fontSize + 4} color="inherit" /> : text}
      </Button>

      {/* 错误提示 */}
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

      {/* 未配置提示（编辑模式下显示配置缺失） */}
      {isEdit && !ssoUrl && (
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
          请配置 SSO 授权地址
        </Typography>
      )}
    </Box>
  );
}
