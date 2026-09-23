import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import Chip from "@mui/material/Chip";
import type { ComponentRendererProps } from "../../types/editor";

const AFTER_ACTION_LABEL: Record<string, string> = {
  none: "无动作",
  redirect: "跳转链接",
  message: "成功提示",
  writeVar: "写入变量",
  refresh: "刷新组件",
  event: "触发事件",
};

const AUTH_LABEL: Record<string, string> = {
  enabled: "强制认证",
  disabled: "公开访问",
  follow: "跟随全局",
};

/**
 * form-container 表单容器（编辑器侧结构示意）
 * 支持：标题/副标题头部、多列栅格编排、提交+重置按钮、认证三级、loading 态。
 * 真正收集/校验/提交在发布端（codegen 输出 <form> 包裹子控件并注入脚本）。
 * 编辑器仅呈现布局结构示意。
 */
export function FormContainerRenderer({ config, childComponents }: ComponentRendererProps) {
  const bgEnabled = (config.bgEnabled as boolean) ?? true;
  const bgColor = (config.bgColor as string) || "rgba(255,255,255,0.04)";
  const borderEnabled = (config.borderEnabled as boolean) ?? true;
  const borderColor = (config.borderColor as string) || "#4c5b70";
  const borderRadius = (config.borderRadius as number) ?? 6;
  const paddingY = (config.paddingY as number) ?? 12;
  const paddingX = (config.paddingX as number) ?? 16;
  const fieldGap = (config.fieldGap as number) ?? 10;

  // 头部
  const showHeader = (config.showHeader as boolean) ?? false;
  const title = (config.title as string) || "";
  const subtitle = (config.subtitle as string) || "";

  // 布局列数
  const columns = Number(config.columns ?? 1) || 1;

  // 按钮
  const showSubmit = (config.showSubmit as boolean) ?? true;
  const submitText = (config.submitText as string) || "提交";
  const submitWidthMode = (config.submitWidthMode as string) ?? "full";
  const submitWidth = (config.submitWidth as number) ?? 180;
  const submitAlign = (config.submitAlign as string) ?? "center";
  const submitBgColor = (config.submitBgColor as string) || "#1976d2";
  const submitTextColor = (config.submitTextColor as string) || "#ffffff";
  const showReset = (config.showReset as boolean) ?? false;
  const resetText = (config.resetText as string) || "重置";
  const resetVariant = (config.resetVariant as string) ?? "outlined";

  // 提交语义
  const method = (config.submitMethod as string) ?? "POST";
  const url = (config.submitUrl as string) ?? "";
  const afterAction = (config.afterAction as string) ?? "none";

  // 认证三级：select value 为 follow / enabled / disabled
  const authVal = String(config.authToken ?? "follow");
  const auth = authVal === "enabled" ? true : authVal === "disabled" ? false : null;

  const alignMap: Record<string, string> = { left: "flex-start", center: "center", right: "flex-end" };
  const align = alignMap[submitAlign] ?? "center";
  const widthCss = submitWidthMode === "full" ? "100%" : submitWidthMode === "fixed" ? `${Math.max(40, submitWidth)}px` : "auto";

  const showLoadingHint = (config.loadingHint as boolean) ?? true;

  // 是否有真实子控件：有则隐藏"字段 N"占位框与拖入提示（真实控件由画布以容器内定位叠加显示）
  const hasChildren = (childComponents?.length ?? 0) > 0;

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: `${fieldGap}px`,
        padding: `${paddingY}px ${paddingX}px`,
        borderRadius,
        border: borderEnabled ? `1px dashed ${borderColor}` : "none",
        background: bgEnabled ? bgColor : "transparent",
        overflow: "hidden",
      }}
    >
      {/* 头部 */}
      {showHeader && (title || subtitle) && (
        <Box sx={{ flexShrink: 0, mb: -0.5 }}>
          {title && (
            <Typography sx={{ fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.85)", userSelect: "none" }}>
              {title}
            </Typography>
          )}
          {subtitle && (
            <Typography sx={{ fontSize: 11, color: "rgba(255,255,255,0.5)", mt: 0.3, userSelect: "none" }}>
              {subtitle}
            </Typography>
          )}
        </Box>
      )}

      {/* 字段区域（多列栅格示意图）；有真实子控件时隐藏占位与提示 */}
      <Box sx={{ flex: 1, minHeight: 40, display: "flex", flexDirection: "column" }}>
        {!hasChildren && (
          <>
            <Box
              sx={{
                width: "100%",
                borderRadius: 0.5,
                border: "1px dashed rgba(120,140,170,0.35)",
                display: "grid",
                gridTemplateColumns: `repeat(${columns}, 1fr)`,
                gap: `${fieldGap}px`,
                alignItems: "center",
                justifyItems: "stretch",
                minHeight: 56,
                px: 1,
                py: 1,
              }}
            >
              {Array.from({ length: Math.min(4, columns * 2) }).map((_, i) => (
                <Box
                  key={i}
                  sx={{
                    height: 42,
                    borderRadius: 0.5,
                    border: "1px dashed rgba(180,190,210,0.4)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    bgcolor: "rgba(255,255,255,0.02)",
                  }}
                >
                  <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.3)", fontSize: 10 }}>
                    字段 {i + 1}
                  </Typography>
                </Box>
              ))}
            </Box>
            <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.4)", fontSize: 10.5, textAlign: "center", mt: 1, userSelect: "none" }}>
              将输入框/下拉等控件拖入此区域（发布后自动收集并提交）
            </Typography>
          </>
        )}
      </Box>

      {/* 提交 + 重置按钮行 */}
      {(showSubmit || showReset) && (
        <Box sx={{ display: "flex", gap: 1, alignSelf: align, width: widthCss, flexShrink: 0 }}>
          {showReset && (
            <Box
              sx={{
                width: showSubmit ? "49%" : "100%",
                height: 40,
                borderRadius: 2,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: resetVariant === "outlined" ? "1px solid rgba(180,180,190,0.4)" : "none",
                background: resetVariant === "contained" ? "rgba(120,130,150,0.5)" : "transparent",
                color: "#cfd6e3",
                fontSize: 14,
                flexShrink: 0,
                userSelect: "none",
              }}
            >
              {resetText}
            </Box>
          )}
          {showSubmit && (
            <Box
              sx={{
                width: showReset ? "49%" : "100%",
                height: 40,
                borderRadius: 2,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 0.5,
                background: submitBgColor,
                color: submitTextColor,
                fontSize: 14,
                flexShrink: 0,
                userSelect: "none",
              }}
            >
              {showLoadingHint && <CircularProgress size={14} sx={{ color: "inherit" }} />}
              {submitText}
            </Box>
          )}
        </Box>
      )}

      {/* 提交语义摘要 */}
      <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.35)", fontSize: 9.5, mt: 0.3, display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap" }}>
        {method === "GET" ? "提交: GET" : "提交: POST"}
        {url ? ` · ${url}` : " · 未配置提交地址"}
        {afterAction !== "none" ? ` · 成功${AFTER_ACTION_LABEL[afterAction] ?? afterAction}` : ""}
        {columns > 1 ? ` · ${columns} 列` : ""}
        <Chip
          size="small"
          label={auth === false ? AUTH_LABEL.disabled : auth ? AUTH_LABEL.enabled : AUTH_LABEL.follow}
          sx={{
            fontSize: 9,
            height: 16,
            ml: 0.5,
            bgcolor: auth === false ? "rgba(120,130,150,0.25)" : auth ? "rgba(255,152,0,0.2)" : "rgba(0,200,180,0.18)",
            color: auth === false ? "#9aa5b5" : auth ? "#ffb74d" : "#4dd0b7",
          }}
        />
      </Typography>
    </Box>
  );
}