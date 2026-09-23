import { useEffect, useRef } from "react";
import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../types/editor";
import { DecorationWrapper } from "./DecorationWrapper";

export function LineCapDecorationRenderer({ config, onConfigChange }: ComponentRendererProps) {
  const stroke = (config.stroke as string) || "#2196F3";
  const strokeWidth = (config.strokeWidth as number) ?? 2;
  const capStyle = (config.capStyle as string) || "diamond";
  const lineStyle = (config.lineStyle as string) || "solid";
  const opacity = (config.opacity as number) ?? 1;

  const dashArray =
    lineStyle === "dashed" ? "8 4"
      : lineStyle === "dotted" ? "2 4"
        : "none";

  const capSize = 8;
  const autoFitH = Math.ceil(capSize * 2 + strokeWidth + 4);

  const lastReportedH = useRef(0);
  useEffect(() => {
    if (!onConfigChange) return;
    if (autoFitH !== lastReportedH.current) {
      lastReportedH.current = autoFitH;
      onConfigChange("_autoFitSize", { height: autoFitH });
    }
  }, [autoFitH, onConfigChange]);

  const renderCap = (cx: number, cy: number, flip = false) => {
    const s = 8;
    const dir = flip ? -1 : 1;
    switch (capStyle) {
      case "arrow":
        return `M ${cx - s * dir} ${cy - s} L ${cx} ${cy} L ${cx - s * dir} ${cy + s}`;
      case "circle":
        return null;
      case "square": {
        const hs = s * 0.7;
        return `M ${cx - hs} ${cy - hs} L ${cx + hs} ${cy - hs} L ${cx + hs} ${cy + hs} L ${cx - hs} ${cy + hs} Z`;
      }
      case "diamond":
        return `M ${cx} ${cy - s} L ${cx + s * dir} ${cy} L ${cx} ${cy + s} L ${cx - s * dir} ${cy} Z`;
      default:
        return `M ${cx - s * dir} ${cy - s} L ${cx} ${cy} L ${cx - s * dir} ${cy + s}`;
    }
  };

  const leftCapD = renderCap(8, 50, true);
  const rightCapD = renderCap(92, 50, false);

  const isFilledCap = capStyle === "diamond" || capStyle === "square";

  return (
    <DecorationWrapper config={config}>
      <Box sx={{ width: "100%", height: "100%", opacity }}>
        <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ overflow: "visible" }}>
          <line x1="8" y1="50" x2="92" y2="50" stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={dashArray} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {leftCapD && !isFilledCap && <path d={leftCapD} stroke={stroke} strokeWidth={strokeWidth} fill="none" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
          {rightCapD && !isFilledCap && <path d={rightCapD} stroke={stroke} strokeWidth={strokeWidth} fill="none" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
          {leftCapD && isFilledCap && <path d={leftCapD} fill={stroke} stroke="none" />}
          {rightCapD && isFilledCap && <path d={rightCapD} fill={stroke} stroke="none" />}
          {capStyle === "circle" && (
            <>
              <circle cx="8" cy="50" r="5" fill={stroke} />
              <circle cx="92" cy="50" r="5" fill={stroke} />
            </>
          )}
        </svg>
      </Box>
    </DecorationWrapper>
  );
}
