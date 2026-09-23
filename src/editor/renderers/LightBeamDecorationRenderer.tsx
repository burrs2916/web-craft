import { useId, useEffect, useRef } from "react";
import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../types/editor";
import { DecorationWrapper } from "./DecorationWrapper";

const KEYFRAMES = `
@keyframes deco-beam-pulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}
@keyframes deco-beam-scan-h {
  0% { transform: translateX(-30%); opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { transform: translateX(30%); opacity: 0; }
}
@keyframes deco-beam-scan-v {
  0% { transform: translateY(-30%); opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { transform: translateY(30%); opacity: 0; }
}
@keyframes deco-beam-scan-d {
  0% { transform: translate(-30%, -30%); opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { transform: translate(30%, 30%); opacity: 0; }
}
`;

let styleInjected = false;
function injectBeamStyle() {
  if (styleInjected || typeof document === "undefined") return;
  const style = document.createElement("style");
  style.setAttribute("data-deco-light-beam", "true");
  style.textContent = KEYFRAMES;
  document.head.appendChild(style);
  styleInjected = true;
}

export function LightBeamDecorationRenderer({ config, onConfigChange }: ComponentRendererProps) {
  const stroke = (config.stroke as string) || "#2196F3";
  const strokeWidth = (config.strokeWidth as number) ?? 3;
  const direction = (config.direction as string) || "horizontal";
  const beamWidth = (config.beamWidth as number) ?? 30;
  const opacity = (config.opacity as number) ?? 1;
  const animated = (config.animated as boolean) ?? true;
  const speed = (config.speed as number) ?? 3000;

  const uid = useId().replace(/:/g, "");
  const gradId = `beam-${uid}`;
  const scanGradId = `beam-scan-${uid}`;

  useEffect(() => { injectBeamStyle(); }, []);

  const bw = beamWidth;
  const isVertical = direction === "vertical";
  const autoFitH = isVertical ? undefined : Math.ceil(beamWidth + strokeWidth + 4);
  const autoFitW = isVertical ? Math.ceil(beamWidth + strokeWidth + 4) : undefined;

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

  const renderHorizontal = () => (
    <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0" />
          <stop offset={`${50 - bw / 2}%`} stopColor={stroke} stopOpacity="0" />
          <stop offset="50%" stopColor={stroke} stopOpacity="0.8" />
          <stop offset={`${50 + bw / 2}%`} stopColor={stroke} stopOpacity="0" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
        <linearGradient id={scanGradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={stroke} stopOpacity="0" />
          <stop offset="40%" stopColor={stroke} stopOpacity="0.4" />
          <stop offset="50%" stopColor={stroke} stopOpacity="1" />
          <stop offset="60%" stopColor={stroke} stopOpacity="0.4" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="100" height="100" fill={`url(#${gradId})`} />
      <line x1="0" y1="50" x2="100" y2="50" stroke={stroke} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" style={animated ? { animation: `deco-beam-pulse ${speed}ms ease-in-out infinite` } : undefined} />
      {animated && (
        <rect x="-10" y={`${50 - bw / 2}`} width="20" height={bw} fill={`url(#${scanGradId})`} style={{ animation: `deco-beam-scan-h ${speed}ms ease-in-out infinite` }} />
      )}
    </svg>
  );

  const renderVertical = () => (
    <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={stroke} stopOpacity="0" />
          <stop offset={`${50 - bw / 2}%`} stopColor={stroke} stopOpacity="0" />
          <stop offset="50%" stopColor={stroke} stopOpacity="0.8" />
          <stop offset={`${50 + bw / 2}%`} stopColor={stroke} stopOpacity="0" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
        <linearGradient id={scanGradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0" />
          <stop offset="40%" stopColor={stroke} stopOpacity="0.4" />
          <stop offset="50%" stopColor={stroke} stopOpacity="1" />
          <stop offset="60%" stopColor={stroke} stopOpacity="0.4" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="100" height="100" fill={`url(#${gradId})`} />
      <line x1="50" y1="0" x2="50" y2="100" stroke={stroke} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" style={animated ? { animation: `deco-beam-pulse ${speed}ms ease-in-out infinite` } : undefined} />
      {animated && (
        <rect x={`${50 - bw / 2}`} y="-10" width={bw} height="20" fill={`url(#${scanGradId})`} style={{ animation: `deco-beam-scan-v ${speed}ms ease-in-out infinite` }} />
      )}
    </svg>
  );

  const renderDiagonal = () => (
    <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0" />
          <stop offset="40%" stopColor={stroke} stopOpacity="0" />
          <stop offset="50%" stopColor={stroke} stopOpacity="0.8" />
          <stop offset="60%" stopColor={stroke} stopOpacity="0" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
        <linearGradient id={scanGradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0" />
          <stop offset="40%" stopColor={stroke} stopOpacity="0.4" />
          <stop offset="50%" stopColor={stroke} stopOpacity="1" />
          <stop offset="60%" stopColor={stroke} stopOpacity="0.4" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="100" height="100" fill={`url(#${gradId})`} />
      <line x1="0" y1="0" x2="100" y2="100" stroke={stroke} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" style={animated ? { animation: `deco-beam-pulse ${speed}ms ease-in-out infinite` } : undefined} />
      {animated && (
        <rect x="-10" y="-10" width="20" height="20" fill={`url(#${scanGradId})`} style={{ animation: `deco-beam-scan-d ${speed}ms ease-in-out infinite` }} />
      )}
    </svg>
  );

  return (
    <DecorationWrapper config={config}>
      <Box sx={{ width: "100%", height: "100%", opacity, overflow: "visible" }}>
        {direction === "vertical" && renderVertical()}
        {direction === "diagonal" && renderDiagonal()}
        {direction === "horizontal" && renderHorizontal()}
      </Box>
    </DecorationWrapper>
  );
}
