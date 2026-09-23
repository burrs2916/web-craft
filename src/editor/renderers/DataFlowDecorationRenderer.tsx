import { useId, useEffect } from "react";
import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../types/editor";
import { DecorationWrapper } from "./DecorationWrapper";

const SEED = 17;
function seededRandom(i: number) {
  const x = Math.sin(SEED + i * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const KEYFRAMES = `
@keyframes deco-dataflow-dash {
  from { stroke-dashoffset: 0; }
  to { stroke-dashoffset: -40; }
}
@keyframes deco-dataflow-glow {
  0%, 100% { filter: none; }
  50% { filter: drop-shadow(0 0 3px var(--flow-color)); }
}
`;

let styleInjected = false;
function injectDataFlowStyle() {
  if (styleInjected || typeof document === "undefined") return;
  const style = document.createElement("style");
  style.setAttribute("data-deco-data-flow", "true");
  style.textContent = KEYFRAMES;
  document.head.appendChild(style);
  styleInjected = true;
}

export function DataFlowDecorationRenderer({ config }: ComponentRendererProps) {
  const stroke = (config.stroke as string) || "#2196F3";
  const strokeWidth = (config.strokeWidth as number) ?? 1.5;
  const direction = (config.direction as string) || "horizontal";
  const lineCount = (config.lineCount as number) ?? 5;
  const opacity = (config.opacity as number) ?? 1;
  const speed = (config.speed as number) ?? 2000;

  const uid = useId().replace(/:/g, "");
  const gradId = `flow-${uid}`;

  useEffect(() => { injectDataFlowStyle(); }, []);

  const count = Math.max(1, Math.min(15, lineCount));

  const renderHorizontal = () => {
    const lines = [];
    for (let i = 0; i < count; i++) {
      const y = ((i + 1) / (count + 1)) * 100;
      const startX = seededRandom(i * 5) * 20;
      const endX = 80 + seededRandom(i * 5 + 1) * 20;
      const midX1 = startX + (endX - startX) * 0.33;
      const midX2 = startX + (endX - startX) * 0.66;
      const dy1 = (seededRandom(i * 5 + 2) - 0.5) * 10;
      const dy2 = (seededRandom(i * 5 + 3) - 0.5) * 10;
      const baseOp = 0.4 + seededRandom(i * 5 + 4) * 0.6;
      const animDelay = seededRandom(i * 5 + 6) * speed * 0.5;
      lines.push(
        <path
          key={i}
          d={`M ${startX} ${y} C ${midX1} ${y + dy1}, ${midX2} ${y + dy2}, ${endX} ${y}`}
          stroke={stroke}
          strokeWidth={strokeWidth}
          fill="none"
          opacity={baseOp}
          strokeDasharray="8 12"
          vectorEffect="non-scaling-stroke"
          style={{
            "--flow-color": stroke,
            animation: `deco-dataflow-dash ${speed}ms linear ${animDelay}ms infinite, deco-dataflow-glow ${speed * 2}ms ease-in-out ${animDelay}ms infinite`,
          } as React.CSSProperties}
        />
      );
    }
    return (
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={stroke} stopOpacity="0" />
            <stop offset="20%" stopColor={stroke} stopOpacity="0.1" />
            <stop offset="80%" stopColor={stroke} stopOpacity="0.1" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="100" height="100" fill={`url(#${gradId})`} />
        {lines}
      </svg>
    );
  };

  const renderVertical = () => {
    const lines = [];
    for (let i = 0; i < count; i++) {
      const x = ((i + 1) / (count + 1)) * 100;
      const startY = seededRandom(i * 5) * 20;
      const endY = 80 + seededRandom(i * 5 + 1) * 20;
      const midY1 = startY + (endY - startY) * 0.33;
      const midY2 = startY + (endY - startY) * 0.66;
      const dx1 = (seededRandom(i * 5 + 2) - 0.5) * 10;
      const dx2 = (seededRandom(i * 5 + 3) - 0.5) * 10;
      const baseOp = 0.4 + seededRandom(i * 5 + 4) * 0.6;
      const animDelay = seededRandom(i * 5 + 6) * speed * 0.5;
      lines.push(
        <path
          key={i}
          d={`M ${x} ${startY} C ${x + dx1} ${midY1}, ${x + dx2} ${midY2}, ${x} ${endY}`}
          stroke={stroke}
          strokeWidth={strokeWidth}
          fill="none"
          opacity={baseOp}
          strokeDasharray="8 12"
          vectorEffect="non-scaling-stroke"
          style={{
            "--flow-color": stroke,
            animation: `deco-dataflow-dash ${speed}ms linear ${animDelay}ms infinite, deco-dataflow-glow ${speed * 2}ms ease-in-out ${animDelay}ms infinite`,
          } as React.CSSProperties}
        />
      );
    }
    return (
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0" />
            <stop offset="20%" stopColor={stroke} stopOpacity="0.1" />
            <stop offset="80%" stopColor={stroke} stopOpacity="0.1" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="100" height="100" fill={`url(#${gradId})`} />
        {lines}
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
