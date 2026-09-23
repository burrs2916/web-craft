import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { ComponentRendererProps } from "../../types/editor";
import { parsePanes, normalizeActivePaneId, interpolateContent } from "../utils/panes";
import { useApiDataFetch } from "../hooks/useApiDataFetch";
import { readAuthEnabled } from "../data/authMode";

export function ContentPanelRenderer({ config, mode }: ComponentRendererProps) {
  const isPreview = mode === "preview";

  // —— 面板数据（共享解析，与编辑器/codegen/菜单绑定一致）——
  const panes = useMemo(() => parsePanes(config.panes), [config.panes]);
  const configActivePaneId = normalizeActivePaneId(panes, config.activePaneId);
  // 预览标签栏的临时切换（不写回 config）
  const [overridePaneId, setOverridePaneId] = useState<string | null>(null);
  useEffect(() => setOverridePaneId(null), [configActivePaneId]);
  const activePaneId = overridePaneId ?? configActivePaneId;
  const activeIndex = Math.max(0, panes.findIndex((p) => p.id === activePaneId));
  const activePane = panes[activeIndex] ?? null;

  // —— 样式配置 ——
  const contentBg = (config.contentBg as string) ?? "transparent";
  const contentColor = (config.contentColor as string) ?? "rgba(255,255,255,0.85)";
  const contentFontSize = (config.contentFontSize as number) ?? 14;
  const contentLineHeight = (config.contentLineHeight as number) ?? 1.6;
  const contentPaddingX = (config.contentPaddingX as number) ?? 12;
  const contentPaddingY = (config.contentPaddingY as number) ?? 12;
  const animationEnabled = (config.animationEnabled as boolean) ?? true;
  const animationType = (config.animationType as string) ?? "fade";
  const animation = animationEnabled && animationType !== "none" ? `wc-pane-fade 0.3s ease` : "none";

  // —— 容器样式 ——
  const backgroundEnabled = (config.backgroundEnabled as boolean) ?? true;
  const backgroundColor = (config.backgroundColor as string) ?? "rgba(30,30,50,0.6)";
  const backgroundOpacity = (config.backgroundOpacity as number) ?? 100;
  const borderEnabled = (config.borderEnabled as boolean) ?? false;
  const borderColor = (config.borderColor as string) ?? "rgba(255,255,255,0.12)";
  const borderWidth = (config.borderWidth as number) ?? 1;
  const borderStyle = (config.borderStyle as string) ?? "solid";
  const borderRadius = (config.borderRadius as number) ?? 0;
  const paddingX = (config.paddingX as number) ?? 16;
  const paddingY = (config.paddingY as number) ?? 16;
  const overflow = (config.overflow as string) ?? "hidden";
  const shadowEnabled = (config.shadowEnabled as boolean) ?? false;
  const shadowOffsetX = (config.shadowOffsetX as number) ?? 0;
  const shadowOffsetY = (config.shadowOffsetY as number) ?? 4;
  const shadowBlur = (config.shadowBlur as number) ?? 12;
  const shadowSpread = (config.shadowSpread as number) ?? 0;
  const shadowColor = (config.shadowColor as string) ?? "rgba(0,0,0,0.3)";

  const containerStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    background: backgroundEnabled ? backgroundColor : "transparent",
    opacity: backgroundEnabled ? Math.max(0, Math.min(100, backgroundOpacity)) / 100 : 1,
    borderRadius,
    padding: `${paddingY}px ${paddingX}px`,
    border: borderEnabled ? `${borderWidth}px ${borderStyle} ${borderColor}` : "none",
    boxShadow: shadowEnabled
      ? `${shadowOffsetX}px ${shadowOffsetY}px ${shadowBlur}px ${shadowSpread}px ${shadowColor}`
      : "none",
    overflow,
    boxSizing: "border-box",
    position: "relative",
  };

  // —— 数据绑定：API 模式下预览时拉取数据，{字段} 插值进面板内容（统一 useApiDataFetch 钩子）——
  const dataMode = (config.dataMode as string) ?? "static";
  const isApiMode = isPreview && dataMode === "api";

  const { data: fetchedData, error: apiError } = useApiDataFetch<unknown>({
    dataMode: isApiMode ? "api" : "static",
    staticData: null,
    apiUrl: (config.apiUrl as string) || "",
    apiPath: (config.apiPath as string) || "",
    apiMethod: ((config.apiMethod as string) || "GET") as "GET" | "POST",
    apiHeaders: config.apiHeaders,
    apiBody: config.apiBody,
    apiInterval: (config.apiInterval as number) ?? 0,
    apiDataPath: (config.apiDataPath as string) || "",
    authEnabled: readAuthEnabled(config.authEnabled),
  });

  const dataObj = isApiMode ? fetchedData : null;
  const dataError = isApiMode ? apiError : null;

  return (
    <Box sx={containerStyle}>
      {/* 预览模式标签栏：允许面板间切换 */}
      {isPreview && panes.length > 1 && (
        <Box
          sx={{
            display: "flex",
            gap: 0.5,
            mb: 1,
            flexWrap: "wrap",
            flexShrink: 0,
          }}
        >
          {panes.map((p) => (
            <Box
              key={p.id}
              data-wc-pane-tab={p.id}
              onClick={() => setOverridePaneId(p.id)}
              sx={{
                px: 1.25,
                py: 0.4,
                fontSize: 12,
                borderRadius: 0.75,
                cursor: "pointer",
                bgcolor: p.id === activePaneId ? "rgba(13,148,136,0.25)" : "rgba(255,255,255,0.06)",
                color: p.id === activePaneId ? "#5eead4" : "rgba(255,255,255,0.6)",
                border: "1px solid",
                borderColor: p.id === activePaneId ? "rgba(13,148,136,0.5)" : "rgba(255,255,255,0.1)",
                transition: "all 0.15s",
              }}
            >
              {p.name || "未命名面板"}
            </Box>
          ))}
        </Box>
      )}

      {/* 面板内容区 */}
      {panes.length === 0 ? (
        <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Typography sx={{ fontSize: 12, color: "rgba(255,255,255,0.35)", fontStyle: "italic" }}>
            未配置面板，请在属性栏「面板列表」中添加
          </Typography>
        </Box>
      ) : (
        <Box
          key={activePane?.id}
          sx={{
            flex: 1,
            minHeight: 0,
            background: activePane?.bgColor ?? contentBg,
            color: contentColor,
            fontSize: contentFontSize,
            lineHeight: contentLineHeight,
            padding: `${contentPaddingY}px ${contentPaddingX}px`,
            borderRadius: borderRadius > 0 ? Math.max(0, borderRadius - 2) : 0,
            overflow: overflow,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            animation,
            "@keyframes wc-pane-fade": {
              from: { opacity: 0 },
              to: { opacity: 1 },
            },
          }}
          data-wc-pane-content={activePane?.id}
        >
          {activePane
            ? interpolateContent(activePane.content, dataObj)
            : ""}
          {dataError && (
            <Typography component="span" sx={{ fontSize: 11, color: "#f87171", ml: 1 }}>
              {dataError}
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}
