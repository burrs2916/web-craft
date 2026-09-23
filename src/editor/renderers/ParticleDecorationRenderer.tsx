import { useEffect } from "react";
import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../types/editor";
import { DecorationWrapper } from "./DecorationWrapper";

const SEED = 42;
function seededRandom(i: number) {
  const x = Math.sin(SEED + i * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

const KEYFRAMES = `
@keyframes deco-particle-twinkle {
  0%, 100% { opacity: var(--p-op); }
  50% { opacity: 0.1; }
}
@keyframes deco-particle-drift {
  0%, 100% { transform: translate(0, 0); }
  25% { transform: translate(var(--dx), var(--dy)); }
  75% { transform: translate(calc(var(--dx) * -0.5), calc(var(--dy) * -0.5)); }
}
`;

let styleInjected = false;
function injectParticleStyle() {
  if (styleInjected || typeof document === "undefined") return;
  const style = document.createElement("style");
  style.setAttribute("data-deco-particle", "true");
  style.textContent = KEYFRAMES;
  document.head.appendChild(style);
  styleInjected = true;
}

export function ParticleDecorationRenderer({ config }: ComponentRendererProps) {
  const stroke = (config.stroke as string) || "#2196F3";
  const particleCount = (config.particleCount as number) ?? 20;
  const minSize = (config.minSize as number) ?? 1;
  const maxSize = (config.maxSize as number) ?? 4;
  const opacity = (config.opacity as number) ?? 1;
  const speed = (config.speed as number) ?? 3000;

  useEffect(() => { injectParticleStyle(); }, []);

  const count = Math.max(1, Math.min(100, particleCount));
  const particles = [];
  for (let i = 0; i < count; i++) {
    const x = seededRandom(i * 3) * 100;
    const y = seededRandom(i * 3 + 1) * 100;
    const size = minSize + seededRandom(i * 3 + 2) * (maxSize - minSize);
    const op = 0.3 + seededRandom(i * 3 + 7) * 0.7;
    const twinkleDuration = speed * (0.5 + seededRandom(i * 3 + 4) * 1.0);
    const twinkleDelay = seededRandom(i * 3 + 5) * speed;
    const dx = (seededRandom(i * 3 + 8) - 0.5) * 3;
    const dy = (seededRandom(i * 3 + 9) - 0.5) * 3;
    const driftDuration = speed * (1.5 + seededRandom(i * 3 + 6) * 2.0);

    particles.push(
      <circle
        key={i}
        cx={x}
        cy={y}
        r={size / 2}
        fill={stroke}
        style={{
          "--p-op": op,
          "--dx": `${dx}px`,
          "--dy": `${dy}px`,
          animation: `deco-particle-twinkle ${twinkleDuration}ms ease-in-out ${twinkleDelay}ms infinite, deco-particle-drift ${driftDuration}ms ease-in-out infinite`,
        } as React.CSSProperties}
      />
    );
  }

  return (
    <DecorationWrapper config={config}>
      <Box sx={{ width: "100%", height: "100%", opacity }}>
        <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ overflow: "visible" }}>
          {particles}
        </svg>
      </Box>
    </DecorationWrapper>
  );
}
