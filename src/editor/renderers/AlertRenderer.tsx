import { useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Collapse from "@mui/material/Collapse";
import type { ComponentRendererProps } from "../../types/editor";
import { resolveIcon } from "../plugins/IconResolver";
import { useApiDataFetch } from "../hooks/useApiDataFetch";
import { readAuthEnabled } from "../data/authMode";

function deepGet(source: unknown, path: string | undefined): unknown {
  if (!path) return undefined;
  const keys = String(path).split(".").map((s) => s.trim()).filter(Boolean);
  let cur: unknown = source;
  for (const k of keys) {
    if (cur == null) return undefined;
    const m = k.match(/^(\w+)\[(\d+)\]$/);
    if (m && Array.isArray(cur)) cur = cur[Number(m[2])];
    else if (typeof cur === "object") cur = (cur as Record<string, unknown>)[k];
    else return undefined;
  }
  return cur;
}

function toText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/**
 * Alert 警告提示组件
 * 支持：success/info/warning/error 四种类型、可关闭、自定义图标、标题+描述、数据源绑定
 */
export function AlertRenderer({ config, mode }: ComponentRendererProps) {
  const isPreview = mode === "preview";
  const isThumb = config._thumbnail === true;
  const [open, setOpen] = useState(true);

  const severity = (config.severity as string) ?? "info";
  const showTitle = (config.showTitle as boolean) ?? true;
  const showDescription = (config.showDescription as boolean) ?? true;
  const showIcon = (config.showIcon as boolean) ?? true;
  const iconMode = (config.iconMode as string) ?? "type";
  const closable = (config.closable as boolean) ?? false;
  const variant = (config.variant as string) ?? "standard";
  const iconSize = isThumb ? 16 : ((config.iconSize as number) ?? 22);
  const fontSize = isThumb ? 10 : ((config.fontSize as number) ?? 14);
  const titleFontSize = isThumb ? 11 : ((config.titleFontSize as number) ?? 15);
  const borderRadius = ((config.borderRadius as number) ?? 6);
  const customColors = (config.customColors as boolean) ?? false;

  // 类型色
  const severityColors: Record<string, { bg: string; color: string; border: string; icon: string }> = {
    success: { bg: "rgba(76,175,80,0.12)", color: "#81C784", border: "rgba(76,175,80,0.4)", icon: "check_circle" },
    info: { bg: "rgba(33,150,243,0.12)", color: "#64B5F6", border: "rgba(33,150,243,0.4)", icon: "info" },
    warning: { bg: "rgba(255,152,0,0.12)", color: "#FFB74D", border: "rgba(255,152,0,0.4)", icon: "warning" },
    error: { bg: "rgba(244,67,54,0.12)", color: "#E57373", border: "rgba(244,67,54,0.4)", icon: "error" },
  };
  const sc = severityColors[severity] ?? severityColors.info;

  // 颜色（可定制时覆盖默认）
  const titleColor = customColors ? ((config.titleColor as string) || sc.color) : sc.color;
  const descriptionColor = customColors
    ? ((config.descriptionColor as string) || "rgba(255,255,255,0.5)")
    : "rgba(255,255,255,0.5)";

  const bg = variant === "filled" ? sc.border : variant === "outlined" ? "transparent" : sc.bg;
  const borderStr = variant === "filled" ? "1px solid transparent" : `1px solid ${sc.border}`;

  // ── 数据源（标题/描述动态绑定，与其他组件一致）──
  const dataMode = (config.dataMode as string) || "static";
  const hasExplicitStaticData = config.staticData != null && config.staticData !== "";
  const isApi = dataMode === "api" && (String(config.apiUrl ?? "") || String(config.apiPath ?? ""));
  const { data: fetchedData } = useApiDataFetch<unknown>({
    dataMode: isApi ? "api" : "static",
    staticData: hasExplicitStaticData ? config.staticData : undefined,
    apiPath: (config.apiPath as string) || "",
    apiUrl: (config.apiUrl as string) || "",
    apiMethod: ((config.apiMethod as string) || "GET") as "GET" | "POST",
    apiBody: config.apiBody,
    apiHeaders: config.apiHeaders,
    apiInterval: (config.apiInterval as number) ?? 0,
    apiDataPath: (config.apiDataPath as string) || "",
    authEnabled: readAuthEnabled(config.authEnabled),
  });
  const useFetched = isApi || hasExplicitStaticData;
  const titleField = (config.titleField as string) || "title";
  const descriptionField = (config.descriptionField as string) || "description";
  const fetchedTitle = useFetched ? deepGet(fetchedData, titleField) : undefined;
  const fetchedDescription = useFetched ? deepGet(fetchedData, descriptionField) : undefined;
  const title = (fetchedTitle !== undefined ? toText(fetchedTitle) : "") || String(config.title ?? "") || "提示";
  const description = (fetchedDescription !== undefined ? toText(fetchedDescription) : "") || String(config.description ?? "");

  // 图标：类型自动 或 自定义
  const iconKey = iconMode === "custom" ? (config.icon as string) || sc.icon : `material:${sc.icon}`;
  const iconColor = (config.iconColor as string) || sc.color;
  const iconEl = showIcon ? resolveIcon(iconKey, undefined, iconSize) : null;

  if (!open) return null;

  return (
    <Collapse in={open} sx={{ width: "100%" }}>
      <Box
        sx={{
          width: "100%",
          display: "flex",
          alignItems: "flex-start",
          gap: "10px",
          padding: `${isThumb ? 6 : (config.paddingY as number) ?? 10}px ${isThumb ? 8 : (config.paddingX as number) ?? 14}px`,
          backgroundColor: bg,
          border: borderStr,
          borderRadius: `${borderRadius}px`,
          color: sc.color,
          boxSizing: "border-box",
        }}
      >
        {iconEl && (
          <Box sx={{ display: "flex", alignItems: "center", flexShrink: 0, mt: "1px", color: iconColor, "& svg": { fontSize: `${iconSize}px` } }}>
            {iconEl}
          </Box>
        )}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {showTitle && (
            <Typography sx={{ fontSize: `${titleFontSize}px`, fontWeight: 600, color: titleColor, lineHeight: 1.4 }}>
              {title}
            </Typography>
          )}
          {showDescription && description && (
            <Typography sx={{ fontSize: `${fontSize}px`, color: descriptionColor, mt: showTitle ? "4px" : 0, lineHeight: 1.5 }}>
              {description}
            </Typography>
          )}
        </Box>
        {closable && (
          <IconButton
            size="small"
            onClick={() => isPreview && setOpen(false)}
            sx={{ flexShrink: 0, mt: "-2px", color: "inherit", opacity: 0.6, "&:hover": { opacity: 1 } }}
          >
            <Typography sx={{ fontSize: "16px", lineHeight: 1 }}>✕</Typography>
          </IconButton>
        )}
      </Box>
    </Collapse>
  );
}