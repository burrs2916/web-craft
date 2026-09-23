import { useId, useEffect, useRef } from "react";
import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../types/editor";
import { DecorationWrapper } from "./DecorationWrapper";

export function ProgressBarDecorationRenderer({ config, onConfigChange }: ComponentRendererProps) {
  const stroke = (config.stroke as string) || "#2196F3";
  const trackColor = (config.trackColor as string) || "rgba(255,255,255,0.1)";
  const strokeWidth = (config.strokeWidth as number) ?? 8;
  const progress = (config.progress as number) ?? 60;
  const direction = (config.direction as string) || "horizontal";
  const showLabel = (config.showLabel as boolean) ?? true;
  const borderRadius = (config.borderRadius as number) ?? 4;
  const opacity = (config.opacity as number) ?? 1;

  const uid = useId().replace(/:/g, "");
  const gradId = `progress-grad-${uid}`;

  const p = Math.max(0, Math.min(100, progress));
  const r = borderRadius;

  const isVertical = direction === "vertical";
  const autoFitH = isVertical ? undefined : Math.ceil(strokeWidth + (showLabel ? 14 : 0) + 4);
  const autoFitW = isVertical ? Math.ceil(strokeWidth + (showLabel ? 14 : 0) + 4) : undefined;

  const lastReported = useRef({ h: 0, w: 0 });
  useEffect(() => {
    if (!onConfigChange) return;
    const size: { width?: number; height?: number } = {};
    if (autoFitH != null && autoFitH !== lastReported.current.h) {
      lastReported.current.h = autoFitH;
      size.height = autoFitH;
    }
    if (autoFitW != null && autoFitW !== lastReported.current.w) {
      lastReported.current.w = autoFitW;
      size.width = autoFitW;
    }
    if (size.width || size.height) {
      onConfigChange("_autoFitSize", size);
    }
  }, [autoFitH, autoFitW, onConfigChange]);

  const renderHorizontal = () => {
    const barH = strokeWidth;
    const cy = 50;
    return (
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.7" />
            <stop offset="100%" stopColor={stroke} stopOpacity="1" />
          </linearGradient>
        </defs>
        <rect x="5" y={cy - barH / 2} width="90" height={barH} rx={r} ry={r} fill={trackColor} />
        <rect x="5" y={cy - barH / 2} width={90 * p / 100} height={barH} rx={r} ry={r} fill={`url(#${gradId})`} />
        {showLabel && <text x="92" y={cy + 4} textAnchor="end" fill={stroke} fontSize="10" fontFamily="sans-serif" fontWeight="bold">{`${p}%`}</text>}
      </svg>
    );
  };

  const renderVertical = () => {
    const barW = strokeWidth;
    const cx = 50;
    return (
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.7" />
            <stop offset="100%" stopColor={stroke} stopOpacity="1" />
          </linearGradient>
        </defs>
        <rect x={cx - barW / 2} y="5" width={barW} height="90" rx={r} ry={r} fill={trackColor} />
        <rect x={cx - barW / 2} y={95 - 90 * p / 100} width={barW} height={90 * p / 100} rx={r} ry={r} fill={`url(#${gradId})`} />
        {showLabel && <text x={cx} y="98" textAnchor="middle" fill={stroke} fontSize="9" fontFamily="sans-serif" fontWeight="bold">{`${p}%`}</text>}
      </svg>
    );
  };

  return (
    <DecorationWrapper config={config}>
      <Box sx={{ width: "100%", height: "100%", opacity }}>
        {direction === "vertical" ? renderVertical() : renderHorizontal()}
      </Box>
    </DecorationWrapper>
  );
}
