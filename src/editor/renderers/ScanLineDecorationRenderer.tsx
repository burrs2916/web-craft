import { useId, useEffect } from "react";
import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../types/editor";
import { DecorationWrapper } from "./DecorationWrapper";

const KEYFRAMES = `
@keyframes deco-scan-h {
  0% { transform: translateY(-100%); }
  100% { transform: translateY(100%); }
}
@keyframes deco-scan-v {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
@keyframes deco-scan-line-h {
  0% { y1: 0; y2: 0; }
  100% { y1: 100; y2: 100; }
}
`;

let styleInjected = false;
function injectScanLineStyle() {
  if (styleInjected || typeof document === "undefined") return;
  const style = document.createElement("style");
  style.setAttribute("data-deco-scan-line", "true");
  style.textContent = KEYFRAMES;
  document.head.appendChild(style);
  styleInjected = true;
}

export function ScanLineDecorationRenderer({ config }: ComponentRendererProps) {
  const stroke = (config.stroke as string) || "#2196F3";
  const strokeWidth = (config.strokeWidth as number) ?? 2;
  const direction = (config.direction as string) || "horizontal";
  const lineCount = (config.lineCount as number) ?? 5;
  const opacity = (config.opacity as number) ?? 1;
  const speed = (config.speed as number) ?? 3000;

  const uid = useId().replace(/:/g, "");
  const gradId = `scan-${uid}`;
  const scanGradId = `scan-light-${uid}`;

  useEffect(() => { injectScanLineStyle(); }, []);

  const count = Math.max(1, Math.min(20, lineCount));

  const renderHorizontal = () => {
    const lines = [];
    for (let i = 0; i < count; i++) {
      const y = ((i + 1) / (count + 1)) * 100;
      lines.push(
        <line key={i} x1="0" y1={y} x2="100" y2={y} stroke={stroke} strokeWidth={strokeWidth} opacity={0.3 + 0.7 * (1 - Math.abs(y - 50) / 50)} vectorEffect="non-scaling-stroke" />
      );
    }
    return (
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.05" />
            <stop offset="50%" stopColor={stroke} stopOpacity="0.15" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id={scanGradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0" />
            <stop offset="40%" stopColor={stroke} stopOpacity="0.6" />
            <stop offset="50%" stopColor={stroke} stopOpacity="1" />
            <stop offset="60%" stopColor={stroke} stopOpacity="0.6" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="100" height="100" fill={`url(#${gradId})`} />
        {lines}
        <rect
          x="0"
          y="-15"
          width="100"
          height="15"
          fill={`url(#${scanGradId})`}
          style={{
            animation: `deco-scan-h ${speed}ms linear infinite`,
          }}
        />
        <line
          x1="0"
          y1="0"
          x2="100"
          y2="0"
          stroke={stroke}
          strokeWidth={strokeWidth * 1.5}
          opacity="0.9"
          vectorEffect="non-scaling-stroke"
          style={{
            animation: `deco-scan-h ${speed}ms linear infinite`,
            filter: `drop-shadow(0 0 4px ${stroke})`,
          }}
        />
      </svg>
    );
  };

  const renderVertical = () => {
    const lines = [];
    for (let i = 0; i < count; i++) {
      const x = ((i + 1) / (count + 1)) * 100;
      lines.push(
        <line key={i} x1={x} y1="0" x2={x} y2="100" stroke={stroke} strokeWidth={strokeWidth} opacity={0.3 + 0.7 * (1 - Math.abs(x - 50) / 50)} vectorEffect="non-scaling-stroke" />
      );
    }
    return (
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.05" />
            <stop offset="50%" stopColor={stroke} stopOpacity="0.15" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id={scanGradId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={stroke} stopOpacity="0" />
            <stop offset="40%" stopColor={stroke} stopOpacity="0.6" />
            <stop offset="50%" stopColor={stroke} stopOpacity="1" />
            <stop offset="60%" stopColor={stroke} stopOpacity="0.6" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="100" height="100" fill={`url(#${gradId})`} />
        {lines}
        <rect
          x="-15"
          y="0"
          width="15"
          height="100"
          fill={`url(#${scanGradId})`}
          style={{
            animation: `deco-scan-v ${speed}ms linear infinite`,
          }}
        />
        <line
          x1="0"
          y1="0"
          x2="0"
          y2="100"
          stroke={stroke}
          strokeWidth={strokeWidth * 1.5}
          opacity="0.9"
          vectorEffect="non-scaling-stroke"
          style={{
            animation: `deco-scan-v ${speed}ms linear infinite`,
            filter: `drop-shadow(0 0 4px ${stroke})`,
          }}
        />
      </svg>
    );
  };

  return (
    <DecorationWrapper config={config}>
      <Box sx={{ width: "100%", height: "100%", opacity, overflow: "visible" }}>
        {direction === "vertical" ? renderVertical() : renderHorizontal()}
      </Box>
    </DecorationWrapper>
  );
}
