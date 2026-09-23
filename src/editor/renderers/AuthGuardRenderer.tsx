import { useCallback, useState, useEffect } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import ShieldIcon from "@mui/icons-material/Shield";
import type { ComponentRendererProps } from "../../types/editor";
import { useWebsiteAuthStore } from "../../store/websiteAuthStore";

/**
 * 路由守卫渲染器 v6（完整闭环）
 *
 * 修复清单：
 * - P0: hideWhenAuthenticated 三元 Bug → 修复为隐藏 fallback 样式而非内容
 * - P0: showLoginDialog 与 codegen 不一致 → renderer 实现 MUI Dialog
 * - P0: webcraft-show-login 死代码 → 已从 codegen 移除
 * - P1: 初始认证检查不完整 → codegen 增加 token 存在 + 过期检查
 * - P1: 新增 autoRedirect 选项
 * - P2: 编辑模式下内容区可见（子组件可见）
 * - P2: authMode 感知
 */
export function AuthGuardRenderer({ config, componentId, mode }: ComponentRendererProps) {
  const isEdit = mode === "edit";
  const isAuthenticated = useWebsiteAuthStore((s) => s.isAuthenticated);
  const setAuthConfig = useWebsiteAuthStore((s) => s.setConfig);
  const [dialogOpen, setDialogOpen] = useState(false);

  // 预览模式下监听认证状态变化，已认证时关闭弹窗
  useEffect(() => {
    if (!dialogOpen) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { isAuthenticated?: boolean } | undefined;
      if (detail?.isAuthenticated) {
        setDialogOpen(false);
      }
    };
    window.addEventListener("auth-state-change", handler);
    return () => window.removeEventListener("auth-state-change", handler);
  }, [dialogOpen]);

  const fallbackText = (config.fallbackText as string) || "请先登录后查看内容";
  const fallbackButtonText = (config.fallbackButtonText as string) || "去登录";
  const loginRedirectUrl = (config.loginRedirectUrl as string) || "/login";
  const showLoginButton = (config.showLoginButton as boolean) ?? true;
  const onUnauthenticatedAction = (config.onUnauthenticatedAction as string) || "none";
  const loginFormId = (config.loginFormId as string) || "";
  const autoRedirect = (config.autoRedirect as boolean) ?? false;
  const autoRedirectUrl = (config.autoRedirectUrl as string) || "/login";
  const hideWhenAuthenticated = (config.hideWhenAuthenticated as boolean) ?? true;

  const bgColor = (config.bgColor as string) || "#f5f5f5";
  const textColor = (config.textColor as string) || "#666666";
  const buttonBgColor = (config.buttonBgColor as string) || "#1976d2";
  const buttonTextColor = (config.buttonTextColor as string) || "#ffffff";
  const borderRadius = (config.borderRadius as number) ?? 8;
  const fontSize = (config.fontSize as number) || 14;
  const tokenKey = (config.tokenKey as string) || "auth_token";
  const tokenStorage = (config.tokenStorage as string) || "localStorage";

  // P0: 同步 token 配置到 store（单一配置源）
  useEffect(() => {
    setAuthConfig({ token: { key: tokenKey, storage: tokenStorage as "localStorage" | "sessionStorage" | "memory" } });
  }, [tokenKey, tokenStorage, setAuthConfig]);

  // ─── 门禁拦截：唤起登录表单 ───
  const triggerLogin = useCallback(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("webcraft-show-login", {
        detail: { loginFormId, guardId: componentId },
      }),
    );
  }, [loginFormId, componentId]);

  const handleLoginButtonClick = useCallback(() => {
    if (onUnauthenticatedAction === "dispatchEvent") {
      triggerLogin();
    } else if (onUnauthenticatedAction === "showLoginDialog") {
      setDialogOpen(true);
    } else {
      // 默认行为：跳转到登录页
      window.location.href = loginRedirectUrl;
    }
  }, [onUnauthenticatedAction, triggerLogin, loginRedirectUrl]);

  // ─── 预览模式下 autoRedirect ───
  useEffect(() => {
    if (isEdit) return;
    if (autoRedirect && !isAuthenticated && autoRedirectUrl) {
      // 延迟 100ms 避免初始化闪烁
      const timer = setTimeout(() => {
        window.location.href = autoRedirectUrl;
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isEdit, autoRedirect, isAuthenticated, autoRedirectUrl]);

  // 编辑模式下：
  // - 内容区始终可见（子组件由编辑器作为兄弟节点渲染到外层）
  // - fallback 作为视觉预览显示在内容区上方（半透明 + pointerEvents:none，不遮挡子组件交互）
  // - 外层虚线边框标识为容器
  // 预览模式下：
  // - 已认证显示内容，隐藏 fallback
  // - 未认证隐藏内容，显示 fallback
  const showContent = isEdit || isAuthenticated;
  const showFallback = isEdit || !isAuthenticated;

  return (
    <Box sx={{
      width: "100%", height: "100%", position: "relative",
    }}>
      {/* 受保护内容区（子组件渲染在这里） */}
      <Box
        sx={{
          width: "100%",
          height: "100%",
          display: showContent ? "block" : "none",
          position: "relative",
        }}
      />

      {/* 已认证时的守卫标识（hideWhenAuthenticated=false 时显示） */}
      {!isEdit && isAuthenticated && !hideWhenAuthenticated && (
        <Box
          sx={{
            position: "absolute",
            top: 4,
            left: 4,
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            px: 1,
            py: 0.25,
            fontSize: 10,
            fontWeight: 600,
            color: "success.main",
            bgcolor: "rgba(76, 175, 80, 0.08)",
            borderRadius: "4px",
            pointerEvents: "none",
            zIndex: 10,
          }}
        >
          <ShieldIcon sx={{ fontSize: 12 }} />
          已认证
        </Box>
      )}

      {/* 未登录时的 fallback（编辑模式 + 预览模式未认证） */}
      {showFallback && (
        <Box
          sx={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: bgColor,
            color: textColor,
            borderRadius: `${borderRadius}px`,
            fontSize,
            position: "absolute",
            top: 0,
            left: 0,
            // 编辑模式下半透明 + 不拦截交互，子组件（兄弟节点）仍可选中拖拽
            ...(isEdit ? { opacity: 0.3, pointerEvents: "none" as const } : {}),
          }}
        >
          <Typography
            sx={{ mb: 2, textAlign: "center", fontSize, color: textColor }}
          >
            {fallbackText}
          </Typography>
          {showLoginButton && (
            <Button
              variant="contained"
              onClick={handleLoginButtonClick}
              sx={{
                textTransform: "none",
                fontSize,
                borderRadius,
                backgroundColor: buttonBgColor,
                color: buttonTextColor,
                "&:hover": { backgroundColor: buttonBgColor, opacity: 0.9 },
              }}
            >
              {fallbackButtonText}
            </Button>
          )}
        </Box>
      )}

      {/* showLoginDialog 模式的 MUI Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        slotProps={{
          paper: {
            sx: { borderRadius: 3, p: 1 },
          }
        }}
      >
        <DialogTitle sx={{ textAlign: "center", fontWeight: 600, fontSize: 16, pb: 0 }}>
          {fallbackText}
        </DialogTitle>
        <DialogContent>
          <Button
            fullWidth
            variant="contained"
            onClick={() => {
              setDialogOpen(false);
              triggerLogin();
            }}
            sx={{
              textTransform: "none",
              borderRadius: `${borderRadius}px`,
              backgroundColor: buttonBgColor,
              color: buttonTextColor,
              "&:hover": { backgroundColor: buttonBgColor, opacity: 0.9 },
            }}
          >
            {fallbackButtonText}
          </Button>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
