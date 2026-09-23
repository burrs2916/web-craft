import { useId, useEffect, useRef } from "react";
import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../types/editor";
import { DecorationWrapper } from "./DecorationWrapper";

export function StatusLightDecorationRenderer({ config, onConfigChange }: ComponentRendererProps) {
  const status = (config.status as string) || "normal";
  const size = (config.size as number) ?? 20;
  const showLabel = (config.showLabel as boolean) ?? false;
  const label = (config.label as string) || "";
  const opacity = (config.opacity as number) ?? 1;

  const uid = useId().replace(/:/g, "");
  const gradId = `sl-grad-${uid}`;

  const colorMap: Record<string, string> = {
    normal: "#4CAF50",
    warning: "#FF9800",
    error: "#F44336",
    info: "#2196F3",
    off: "#666666",
  };
  const color = colorMap[status] || colorMap.normal;
  const r = size / 2;

  const autoFitH = Math.ceil(size + 4);
  const autoFitW = showLabel && label ? undefined : Math.ceil(size + 4);

  const lastReported = useRef({ h: 0, w: 0 });
  useEffect(() => {
    if (!onConfigChange) return;
    const updates: { width?: number; height?: number } = {};
    if (autoFitH !== lastReported.current.h) {
      lastReported.current.h = autoFitH;
      updates.height = autoFitH;
    }
    if (autoFitW != null && autoFitW !== lastReported.current.w) {
      lastReported.current.w = autoFitW;
      updates.width = autoFitW;
    }
    if (updates.width || updates.height) {
      onConfigChange("_autoFitSize", updates);
    }
  }, [autoFitH, autoFitW, onConfigChange]);

  return (
    <DecorationWrapper config={config}>
      <Box sx={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 1, opacity }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <defs>
            <radialGradient id={gradId} cx="40%" cy="40%" r="60%">
              <stop offset="0%" stopColor="white" stopOpacity="0.6" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx={r} cy={r} r={r} fill={color} />
          <circle cx={r} cy={r} r={r} fill={`url(#${gradId})`} />
        </svg>
        {showLabel && label && (
          <Box component="span" sx={{ fontSize: 11, color, fontWeight: "bold", whiteSpace: "nowrap" }}>{label}</Box>
        )}
      </Box>
    </DecorationWrapper>
  );
}
