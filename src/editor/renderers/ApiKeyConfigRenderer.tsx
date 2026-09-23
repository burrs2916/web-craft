import { useState, useEffect } from "react";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import InputAdornment from "@mui/material/InputAdornment";
import IconButton from "@mui/material/IconButton";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import type { ComponentRendererProps } from "../../types/editor";
import { useWebsiteAuthStore } from "../../store/websiteAuthStore";

/**
 * API Key 配置渲染器 v2
 *
 * v2 改造核心：
 * - P0-1: 修复 expiresAt:0 导致立即过期 → 不传 expiresAt（undefined）
 * - P0-2: renderer 侧补 setCachedValue + dispatch auth-state-change 事件闭环
 * - P1-1: position 配置在 renderer 侧生效（存入 __webcraft_api_key_position）
 * - P1-2: 按钮颜色由 buttonBgColor/buttonTextColor 配置驱动，不再硬编码
 * - P1-3: variant 支持 contained/outlined/text 三种变体
 * - P1-4: loading 状态
 * - P1-5: borderRadius 用 || 而非 ??
 * - P1-6: 编辑模式与预览模式渲染一致（不灰显，pointerEvents none 替代 disabled）
 * - P1-7: tokenKey/tokenStorage 配置驱动，与 LoginForm/SSO/OAuth 体系一致
 * - P1-8: redirectOnSuccess/redirectDelay 登录后跳转
 * - P2-1: 密码可见性切换（showPasswordToggle 配置驱动）
 * - P2-2: 保存提示用 Alert 替代 setTimeout 文字切换
 * - P2-3: 版本号 2.0.0
 */
export function ApiKeyConfigRenderer({ config, mode }: ComponentRendererProps) {
  const isEdit = mode === "edit";
  const setLogin = useWebsiteAuthStore((s) => s.setLogin);
  const setCachedValue = useWebsiteAuthStore((s) => s.setCachedValue);
  const setAuthConfig = useWebsiteAuthStore((s) => s.setConfig);

  const headerName = (config.headerName as string) || "X-API-Key";
  const position = (config.position as "header" | "query") || "header";
  const placeholder = (config.placeholder as string) || "输入 API Key";
  const buttonText = (config.buttonText as string) || "保存";
  const tokenKey = (config.tokenKey as string) || "auth_token";
  const tokenStorage = (config.tokenStorage as string) || "localStorage";
  const redirectOnSuccess = (config.redirectOnSuccess as string) || "";
  const redirectDelay = (config.redirectDelay as number) || 1500;
  const bgColor = (config.bgColor as string) || "#ffffff";
  const textColor = (config.textColor as string) || "#333333";
  const borderColor = (config.borderColor as string) || "#d0d0d8";
  const buttonBgColor = (config.buttonBgColor as string) || "#1976d2";
  const buttonTextColor = (config.buttonTextColor as string) || "#ffffff";
  const variant = (config.variant as "contained" | "outlined" | "text") || "contained";
  const fontSize = (config.fontSize as number) || 14;
  const borderRadius = (config.borderRadius as number) || 8;
  const fullWidth = (config.fullWidth as boolean) ?? true;
  const showPasswordToggle = (config.showPasswordToggle as boolean) ?? true;

  const [apiKey, setApiKey] = useState("");
  // P0: 同步 token 配置到 store（单一配置源）
  useEffect(() => {
    setAuthConfig({ token: { key: tokenKey, storage: tokenStorage as "localStorage" | "sessionStorage" | "memory" } });
  }, [tokenKey, tokenStorage, setAuthConfig]);

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSave = async () => {
    if (isEdit || loading) return;
    if (!apiKey) {
      setErrorMsg("请输入 API Key");
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      // P0-1: 不传 expiresAt（undefined），避免 0 被当成已过期
      setLogin(
        {
          token: apiKey,
          user: {},
        },
        "api-key",
      );

      // P0-2: 用配置的 tokenKey/tokenStorage 持久化
      setCachedValue(tokenKey, apiKey);
      setCachedValue("__webcraft_api_key_header", headerName);
      setCachedValue("__webcraft_api_key_position", position);
      setCachedValue("__webcraft_auth_mode", "api-key");
      setCachedValue("__webcraft_auth_authenticated", "true");

      // P0-2: auth-state-change 事件由 store.setLogin 内部 dispatch，无需重复

      setSuccessMsg("API Key 保存成功");

      // P1-8: 登录后跳转
      if (redirectOnSuccess) {
        setTimeout(() => {
          window.location.href = redirectOnSuccess;
        }, redirectDelay);
      }

      // 2s 后清除成功提示
      setTimeout(() => setSuccessMsg(null), 2000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  // P2-18: 编辑模式使用 disabled + sx 覆盖（opacity:1）替代 pointerEvents:none
  // 与 LoginForm/RegisterForm/SSO 等组件的编辑模式禁用方式统一
  const inputDisabled = isEdit || loading;
  const buttonDisabled = isEdit || loading;

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 0.5,
        background: bgColor,
        color: textColor,
        padding: "8px",
        boxSizing: "border-box",
        position: "relative",
        // P2-18: 不再用 pointerEvents:none，改为 disabled + sx 覆盖 opacity:1
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        <TextField
          type={showPasswordToggle ? (showPassword ? "text" : "password") : "password"}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={placeholder}
          disabled={inputDisabled}
          size="small"
          fullWidth={false}
          sx={{
            flex: fullWidth ? 1 : "none",
            minWidth: fullWidth ? 0 : 120,
            "& .MuiOutlinedInput-root": {
              fontSize,
              borderRadius,
              backgroundColor: bgColor,
              color: textColor,
              "& fieldset": { borderColor },
              "&.Mui-focused fieldset": { borderColor: buttonBgColor, borderWidth: 2 },
              "&.Mui-disabled fieldset": { borderColor },
              "&.Mui-disabled": { opacity: 1, WebkitTextFillColor: textColor },
            },
          }}
          slotProps={
            showPasswordToggle
              ? {
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => setShowPassword(!showPassword)}
                          edge="end"
                          size="small"
                          tabIndex={-1}
                        >
                          {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }
              : undefined
          }
        />
        <Button
          variant={variant}
          disabled={buttonDisabled}
          onClick={handleSave}
          sx={{
            textTransform: "none",
            fontSize,
            borderRadius,
            padding: "6px 14px",
            whiteSpace: "nowrap",
            flexShrink: 0,
            minWidth: "auto",
            ...(variant === "contained"
              ? { backgroundColor: buttonBgColor, color: buttonTextColor, border: "none" }
              : variant === "outlined"
                ? { backgroundColor: "transparent", color: buttonBgColor, border: `1px solid ${buttonBgColor}` }
                : { backgroundColor: "transparent", color: buttonBgColor, border: "none" }),
            "&:hover": {
              opacity: 0.85,
              ...(variant === "contained" ? { backgroundColor: buttonBgColor } : {}),
            },
            "&.Mui-disabled": {
              opacity: 1,
              ...(variant === "contained" ? { backgroundColor: buttonBgColor, color: buttonTextColor } : {}),
            },
          }}
        >
          {loading ? <CircularProgress size={fontSize + 4} color="inherit" /> : buttonText}
        </Button>
      </Box>

      {/* 成功提示 */}
      {successMsg && (
        <Alert
          severity="success"
          icon={false}
          sx={{ fontSize: Math.max(fontSize - 2, 10), py: 0.25, "& .MuiAlert-message": { padding: 0 } }}
        >
          {successMsg}
        </Alert>
      )}

      {/* 错误提示 */}
      {errorMsg && (
        <Alert
          severity="error"
          icon={false}
          sx={{ fontSize: Math.max(fontSize - 2, 10), py: 0.25, "& .MuiAlert-message": { padding: 0 } }}
        >
          {errorMsg}
        </Alert>
      )}
    </Box>
  );
}
