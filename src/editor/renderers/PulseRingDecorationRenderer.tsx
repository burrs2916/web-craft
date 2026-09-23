import { useEffect } from "react";
import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../types/editor";
import { DecorationWrapper } from "./DecorationWrapper";

const KEYFRAMES = `
@keyframes deco-ring-pulse {
  0% { r: 10; opacity: 1; }
  100% { r: 48; opacity: 0; }
}
@keyframes deco-ring-center-pulse {
  0%, 100% { r: 4; opacity: 1; }
  50% { r: 6; opacity: 0.7; }
}
`;

let styleInjected = false;
function injectPulseStyle() {
  if (styleInjected || typeof document === "undefined") return;
  const style = document.createElement("style");
  style.setAttribute("data-deco-pulse-ring", "true");
  style.textContent = KEYFRAMES;
  document.head.appendChild(style);
  styleInjected = true;
}

export function PulseRingDecorationRenderer({ config }: ComponentRendererProps) {
  const stroke = (config.stroke as string) || "#2196F3";
  const strokeWidth = (config.strokeWidth as number) ?? 2;
  const ringCount = (config.ringCount as number) ?? 3;
  const opacity = (config.opacity as number) ?? 1;
  const speed = (config.speed as number) ?? 2000;

  useEffect(() => { injectPulseStyle(); }, []);

  const count = Math.max(1, Math.min(6, ringCount));
  const duration = speed;

  const rings = [];
  for (let i = 0; i < count; i++) {
    const delay = (i * duration) / count;
    rings.push(
      <circle
        key={`pulse-${i}`}
        cx="50"
        cy="50"
        r="10"
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        opacity="0"
        vectorEffect="non-scaling-stroke"
        style={{
          animation: `deco-ring-pulse ${duration}ms ease-out ${delay}ms infinite`,
        }}
      />
    );
  }

  const staticRings = [];
  for (let i = 0; i < count; i++) {
    const r = 15 + i * 12;
    const op = 0.15 - i * 0.02;
    staticRings.push(
      <circle
        key={`static-${i}`}
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth * 0.5}
        opacity={Math.max(0.03, op)}
        vectorEffect="non-scaling-stroke"
      />
    );
  }

  return (
    <DecorationWrapper config={config}>
      <Box sx={{ width: "100%", height: "100%", opacity, overflow: "visible" }}>
        <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" style={{ overflow: "visible" }}>
          {staticRings}
          {rings}
          <circle
            cx="50"
            cy="50"
            r="5"
            fill={stroke}
            style={{
              animation: `deco-ring-center-pulse ${duration * 0.8}ms ease-in-out infinite`,
            }}
          />
        </svg>
      </Box>
    </DecorationWrapper>
  );
}
