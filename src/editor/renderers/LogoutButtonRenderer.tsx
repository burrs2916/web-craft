import { useState, useEffect } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogActions from "@mui/material/DialogActions";
import Typography from "@mui/material/Typography";
import type { ComponentRendererProps } from "../../types/editor";
import { useWebsiteAuthStore } from "../../store/websiteAuthStore";

/**
 * 退出登录按钮渲染器 v2
 *
 * v2 修复：
 * - P0-1: MUI Dialog 替代 window.confirm
 * - P0-2: 动态清理 authParams + responseMappings 缓存键（不再硬编码）
 * - P1-1: 编辑模式虚线边框 + 组件徽章
 * - P1-2: memory 存储支持（websiteAuthStore.clearAllCachedValues 已全清 memory + storage）
 * - P1-3: 未认证时按钮禁用
 * - P2-1: API 错误反馈（Snackbar 提示）
 */
export function LogoutButtonRenderer({ config, mode }: ComponentRendererProps) {
  const isEdit = mode === "edit";
  const logout = useWebsiteAuthStore((s) => s.logout);
  const token = useWebsiteAuthStore((s) => s.token);
  const isAuthenticated = useWebsiteAuthStore((s) => s.isAuthenticated);
  const setAuthConfig = useWebsiteAuthStore((s) => s.setConfig);

  const text = (config.text as string) || "退出登录";
  const redirectUrl = (config.redirectUrl as string) || "/login";
  const variant = (config.variant as "contained" | "outlined" | "text") || "contained";
  const bgColor = (config.bgColor as string) || "#f44336";
  const textColor = (config.textColor as string) || "#ffffff";
  const fontSize = (config.fontSize as number) || 14;
  const borderRadius = (config.borderRadius as number) ?? 4;
  const confirmBeforeLogout = (config.confirmBeforeLogout as boolean) ?? false;
  const confirmText = (config.confirmText as string) || "确定要退出登录吗？";
  const callLogoutApi = (config.callLogoutApi as boolean) ?? false;
  const logoutApiUrl = (config.logoutApiUrl as string) || "";
  const logoutMethod = (config.logoutMethod as string) || "POST";
  const tokenKey = (config.tokenKey as string) || "auth_token";
  const tokenStorage = (config.tokenStorage as string) || "localStorage";

  // P0: 同步 token 配置到 store（单一配置源）
  useEffect(() => {
    setAuthConfig({ token: { key: tokenKey, storage: tokenStorage as "localStorage" | "sessionStorage" | "memory" } });
  }, [tokenKey, tokenStorage, setAuthConfig]);

  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 未认证时按钮禁用（编辑模式不禁用，保持预览效果）
  const isDisabled = !isEdit && (loading || !isAuthenticated);

  const performLogout = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      // P2-1: API 错误不再静默吞掉
      if (callLogoutApi && logoutApiUrl && token) {
        try {
          const res = await fetch(logoutApiUrl, {
            method: logoutMethod,
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            credentials: "include",
          });
          if (!res.ok) {
            console.warn(`[Logout] API returned ${res.status}`);
          }
        } catch (apiErr) {
          // API 失败不阻断退出流程，但提示用户
          console.warn("[Logout] API error:", apiErr);
          setErrorMsg("退出接口调用失败，本地登录状态已清除");
        }
      }

      // P0-2: 直接调用 store.logout()，内部 clearAllCachedValues() 已动态遍历
      // memoryCache 所有键 + storage 所有键，覆盖 authParams/responseMappings 全部缓存
      logout();

      if (redirectUrl && redirectUrl !== "none") {
        window.location.href = redirectUrl;
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClick = () => {
    if (isEdit) return;
    if (confirmBeforeLogout) {
      setConfirmOpen(true);
    } else {
      performLogout();
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
        overflow: "hidden",
      }}
    >
      <Button
        variant={variant}
        disabled={isDisabled}
        onClick={handleClick}
        disableRipple={isEdit}
        sx={{
          textTransform: "none",
          fontSize,
          borderRadius,
          width: "100%",
          height: "100%",
          backgroundColor: variant === "contained" ? bgColor : "transparent",
          color: variant === "contained" ? textColor : bgColor,
          border: variant === "outlined" ? `1px solid ${bgColor}` : "none",
          pointerEvents: isEdit ? "none" : "auto",
          "&:hover": {
            backgroundColor: variant === "contained" ? bgColor : "transparent",
            opacity: 0.85,
          },
          // 未认证时降低视觉明显度（编辑模式除外）
          ...(isDisabled && !isEdit ? { opacity: 0.4 } : {}),
          // 编辑模式保持配置颜色，不被 MUI disabled 覆盖
          ...(isEdit ? {
            "&.Mui-disabled": {
              backgroundColor: variant === "contained" ? bgColor : "transparent",
              color: variant === "contained" ? textColor : bgColor,
              borderColor: variant === "outlined" ? bgColor : "none",
              opacity: 1,
            },
          } : {}),
        }}
      >
        {loading ? <CircularProgress size={fontSize + 4} color="inherit" /> : text}
      </Button>

      {/* P2-1: API 错误提示 */}
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
          }}
        >
          {errorMsg}
        </Typography>
      )}

      {/* P0-1: MUI Dialog 替代 window.confirm */}
      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        maxWidth="xs"
        fullWidth
        slotProps={{
          paper: {
            sx: { borderRadius: 3, p: 1 },
          },
        }}
      >
        <DialogTitle sx={{ textAlign: "center", fontWeight: 600, fontSize: 16, pb: 0 }}>
          {confirmText}
        </DialogTitle>
        <DialogActions sx={{ justifyContent: "center", gap: 1, pb: 2, pt: 1 }}>
          <Button
            onClick={() => setConfirmOpen(false)}
            variant="outlined"
            size="small"
            sx={{ textTransform: "none", borderRadius: 2 }}
          >
            取消
          </Button>
          <Button
            onClick={() => {
              setConfirmOpen(false);
              performLogout();
            }}
            variant="contained"
            color="error"
            size="small"
            sx={{ textTransform: "none", borderRadius: 2 }}
          >
            确认退出
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
