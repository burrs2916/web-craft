import { useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
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
 * Tooltip 文字提示组件
 * 悬浮展示一段提示文字，支持四方向、箭头、触发形态（图标+文字/仅图标/仅文字）、自定义图标、数据源
 */
export function TooltipRenderer({ config, mode }: ComponentRendererProps) {
  const isPreview = mode === "preview";
  const isThumb = config._thumbnail === true;
  const [visible, setVisible] = useState(false);

  const text = (config.text as string) ?? "提示文字";
  const placement = (config.placement as string) ?? "top"; // top/bottom/left/right
  const trigger = (config.trigger as string) ?? "hover"; // hover/click
  const showArrow = (config.showArrow as boolean) ?? true;
  const bgColor = (config.bgColor as string) || "rgba(50,50,50,0.9)";
  const textColor = (config.textColor as string) || "#ffffff";
  const fontSize = isThumb ? 10 : ((config.fontSize as number) ?? 12);
  const padding = isThumb ? 3 : ((config.padding as number) ?? 6);
  const borderRadius = (config.borderRadius as number) ?? 4;
  const maxWidth = (config.maxWidth as number) ?? 200;

  const triggerStyle = (config.triggerStyle as string) ?? "icon-text"; // icon-text/icon/text
  const triggerText = (config.triggerText as string) ?? "悬停查看";
  const triggerColor = (config.triggerColor as string) || "rgba(255,255,255,0.7)";
  const iconColor = (config.iconColor as string) || triggerColor;
  const triggerIconSize = isThumb ? 14 : ((config.triggerIconSize as number) ?? 16);
  const triggerUnderline = (config.triggerUnderline as boolean) ?? true;

  // ── 数据源（提示内容动态绑定，与其他组件一致）──
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
  const textField = (config.textField as string) || "text";
  const fetchedText = useFetched ? deepGet(fetchedData, textField) : undefined;
  const tipText = (fetchedText !== undefined ? toText(fetchedText) : "") || String(text);

  const handleEnter = () => { if (isPreview && trigger === "hover") setVisible(true); };
  const handleLeave = () => { if (isPreview && trigger === "hover") setVisible(false); };
  const handleClick = () => { if (isPreview && trigger === "click") setVisible(!visible); };

  // 箭头方向定位
  const arrowMap: Record<string, { pos: React.CSSProperties; border: string }> = {
    top: { pos: { bottom: -5, left: "50%", transform: "translateX(-50%)" }, border: `border-top: 6px solid ${bgColor};border-left:6px solid transparent;border-right:6px solid transparent` },
    bottom: { pos: { top: -5, left: "50%", transform: "translateX(-50%)" }, border: `border-bottom: 6px solid ${bgColor};border-left:6px solid transparent;border-right:6px solid transparent` },
    left: { pos: { right: -5, top: "50%", transform: "translateY(-50%)" }, border: `border-left: 6px solid ${bgColor};border-top:6px solid transparent;border-bottom:6px solid transparent` },
    right: { pos: { left: -5, top: "50%", transform: "translateY(-50%)" }, border: `border-right: 6px solid ${bgColor};border-top:6px solid transparent;border-bottom:6px solid transparent` },
  };
  const arrow = arrowMap[placement] ?? arrowMap.top;

  // 浮层定位
  const tooltipPos: Record<string, React.CSSProperties> = {
    top: { bottom: "100%", left: "50%", transform: "translateX(-50%)", marginBottom: "8px" },
    bottom: { top: "100%", left: "50%", transform: "translateX(-50%)", marginTop: "8px" },
    left: { right: "100%", top: "50%", transform: "translateY(-50%)", marginRight: "8px" },
    right: { left: "100%", top: "50%", transform: "translateY(-50%)", marginLeft: "8px" },
  };

  const iconKey = (config.triggerIcon as string) || "material:info";
  const triggerIconEl = resolveIcon(iconKey, undefined, triggerIconSize);

  return (
    <Box
      sx={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        width: "100%",
        height: "100%",
      }}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onClick={handleClick}
    >
      <Box
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          color: triggerColor,
          lineHeight: 1,
        }}
      >
        {triggerStyle !== "text" && (
          <Box sx={{ display: "inline-flex", alignItems: "center", color: iconColor, "& svg": { fontSize: `${triggerIconSize}px` } }}>
            {triggerIconEl}
          </Box>
        )}
        {triggerStyle !== "icon" && (
          <Typography
            sx={{
              fontSize: isThumb ? "11px" : "13px",
              color: triggerColor,
              textDecoration: triggerUnderline ? "underline" : "none",
              textDecorationStyle: "dotted",
              cursor: isPreview ? "pointer" : "default",
              userSelect: "none",
            }}
          >
            {triggerText}
          </Typography>
        )}
      </Box>
      {visible && (
        <Box
          sx={{
            position: "absolute",
            ...tooltipPos[placement],
            backgroundColor: bgColor,
            color: textColor,
            fontSize: `${fontSize}px`,
            padding: `${padding}px 10px`,
            borderRadius: `${borderRadius}px`,
            maxWidth: `${maxWidth}px`,
            whiteSpace: "normal",
            wordBreak: "break-word",
            zIndex: 9999,
            boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
            pointerEvents: "none",
          }}
        >
          <Typography sx={{ fontSize: "inherit", color: "inherit", lineHeight: 1.4 }}>
            {tipText}
          </Typography>
          {showArrow && (
            <Box
              component="span"
              sx={{
                position: "absolute",
                ...arrow.pos,
                width: 0,
                height: 0,
                ...(() => {
                  const s: Record<string, string> = {};
                  const parts = arrow.border.split(";");
                  for (const p of parts) {
                    const [k, v] = p.split(":").map((x) => x.trim());
                    if (k && v) s[k] = v;
                  }
                  return s;
                })(),
              }}
            />
          )}
        </Box>
      )}
    </Box>
  );
}