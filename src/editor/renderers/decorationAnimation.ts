import type { SxProps, Theme } from "@mui/material/styles";

export type AnimationType =
  | "none" | "pulse" | "blink" | "rotate" | "bounce" | "fadeIn"
  | "swing" | "jelly" | "shake" | "breathe" | "flip" | "float" | "heartbeat" | "vortex";

export type LineEffectType =
  | "none" | "glow" | "flow" | "neon" | "fluorescent" | "lightWave"
  | "draw" | "rainbow" | "electric" | "breatheGlow" | "gradientFlow" | "pulseWave" | "sparkle" | "dashFlow";

export interface AnimationConfig {
  animation: AnimationType;
  animationDuration: number;
  lineEffect: LineEffectType;
  lineEffectColor?: string;
  lineEffectIntensity?: number;
  lineEffectSpeed?: number;
  lineEffectWidth?: number;
}

const keyframesDefs = `
@keyframes deco-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.92); }
}
@keyframes deco-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.15; }
}
@keyframes deco-rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes deco-bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}
@keyframes deco-fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes deco-swing {
  0%, 100% { transform: rotate(0deg); }
  25% { transform: rotate(15deg); }
  75% { transform: rotate(-15deg); }
}
@keyframes deco-jelly {
  0%, 100% { transform: scale(1, 1); }
  25% { transform: scale(0.9, 1.1); }
  50% { transform: scale(1.1, 0.9); }
  75% { transform: scale(0.95, 1.05); }
}
@keyframes deco-shake {
  0%, 100% { transform: translateX(0); }
  10% { transform: translateX(-4px); }
  20% { transform: translateX(4px); }
  30% { transform: translateX(-3px); }
  40% { transform: translateX(3px); }
  50% { transform: translateX(-2px); }
  60% { transform: translateX(2px); }
  70% { transform: translateX(-1px); }
  80% { transform: translateX(1px); }
}
@keyframes deco-breathe {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.05); opacity: 0.85; }
}
@keyframes deco-flip {
  0% { transform: perspective(400px) rotateY(0deg); }
  50% { transform: perspective(400px) rotateY(180deg); }
  100% { transform: perspective(400px) rotateY(360deg); }
}
@keyframes deco-float {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  25% { transform: translateY(-6px) rotate(1deg); }
  50% { transform: translateY(-3px) rotate(0deg); }
  75% { transform: translateY(-7px) rotate(-1deg); }
}
@keyframes deco-heartbeat {
  0%, 100% { transform: scale(1); }
  14% { transform: scale(1.15); }
  28% { transform: scale(1); }
  42% { transform: scale(1.1); }
  56% { transform: scale(1); }
}
@keyframes deco-vortex {
  0% { transform: rotate(0deg) scale(1); }
  25% { transform: rotate(90deg) scale(0.9); }
  50% { transform: rotate(180deg) scale(1); }
  75% { transform: rotate(270deg) scale(0.9); }
  100% { transform: rotate(360deg) scale(1); }
}
@keyframes deco-neon-flicker {
  0%, 19%, 21%, 23%, 25%, 54%, 56%, 100% { opacity: 1; }
  20%, 24%, 55% { opacity: 0.6; }
}
@keyframes deco-neon-glow {
  0%, 100% {
    filter: drop-shadow(0 0 4px var(--neon-color)) drop-shadow(0 0 11px var(--neon-color)) drop-shadow(0 0 19px var(--neon-color)) drop-shadow(0 0 40px var(--neon-color));
  }
  50% {
    filter: drop-shadow(0 0 2px var(--neon-color)) drop-shadow(0 0 6px var(--neon-color)) drop-shadow(0 0 12px var(--neon-color)) drop-shadow(0 0 24px var(--neon-color));
  }
}
@keyframes deco-fluorescent-pulse {
  0%, 100% {
    filter: drop-shadow(0 0 3px var(--neon-color)) drop-shadow(0 0 8px var(--neon-color)) drop-shadow(0 0 16px var(--neon-color));
    opacity: 1;
  }
  50% {
    filter: drop-shadow(0 0 6px var(--neon-color)) drop-shadow(0 0 14px var(--neon-color)) drop-shadow(0 0 28px var(--neon-color));
    opacity: 0.9;
  }
}
@keyframes deco-breathe-glow {
  0%, 100% {
    filter: drop-shadow(0 0 2px var(--neon-color)) drop-shadow(0 0 6px var(--neon-color));
    opacity: 1;
  }
  50% {
    filter: drop-shadow(0 0 8px var(--neon-color)) drop-shadow(0 0 20px var(--neon-color)) drop-shadow(0 0 36px var(--neon-color));
    opacity: 0.95;
  }
}
@keyframes deco-electric {
  0%, 5%, 10%, 15%, 20%, 25%, 30%, 100% { opacity: 1; }
  3% { opacity: 0.3; }
  7% { opacity: 0.7; }
  12% { opacity: 0.4; }
  17% { opacity: 0.8; }
  22% { opacity: 0.35; }
  27% { opacity: 0.6; }
}
@keyframes deco-electric-glow {
  0%, 100% {
    filter: drop-shadow(0 0 3px var(--neon-color)) drop-shadow(0 0 8px var(--neon-color));
  }
  3% {
    filter: drop-shadow(0 0 12px var(--neon-color)) drop-shadow(0 0 24px var(--neon-color)) drop-shadow(0 0 40px var(--neon-color));
  }
  7% {
    filter: drop-shadow(0 0 2px var(--neon-color));
  }
  12% {
    filter: drop-shadow(0 0 10px var(--neon-color)) drop-shadow(0 0 30px var(--neon-color)) drop-shadow(0 0 50px var(--neon-color));
  }
  17% {
    filter: drop-shadow(0 0 4px var(--neon-color));
  }
  22% {
    filter: drop-shadow(0 0 14px var(--neon-color)) drop-shadow(0 0 28px var(--neon-color)) drop-shadow(0 0 44px var(--neon-color));
  }
}
@keyframes deco-sparkle-blink {
  0%, 100% { opacity: 0.2; }
  10% { opacity: 1; }
  20% { opacity: 0.1; }
  35% { opacity: 0.9; }
  50% { opacity: 0.15; }
  65% { opacity: 1; }
  80% { opacity: 0.3; }
}
@keyframes deco-rainbow-hue {
  from { filter: hue-rotate(0deg); }
  to { filter: hue-rotate(360deg); }
}
@keyframes deco-draw-line {
  from { stroke-dashoffset: var(--draw-len); }
  to { stroke-dashoffset: 0; }
}
@keyframes deco-dash-flow {
  from { stroke-dashoffset: 0; }
  to { stroke-dashoffset: var(--dash-flow-step); }
}
@keyframes deco-lightwave {
  from { stroke-dashoffset: var(--lw-total); }
  to { stroke-dashoffset: 0; }
}
@keyframes deco-pulse-wave {
  0% { stroke-dashoffset: var(--pw-total); opacity: 1; }
  80% { opacity: 0.6; }
  100% { stroke-dashoffset: 0; opacity: 1; }
}

@keyframes dv11-pulse-1 {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}
@keyframes dv11-pulse-2 {
  0%, 100% { opacity: 0.7; }
  50% { opacity: 0.4; }
}
@keyframes dv11-pulse-3 {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 0.2; }
}
.dv11-pulse-1 { opacity: 1; animation: dv11-pulse-1 2s ease-in-out infinite; }
.dv11-pulse-2 { opacity: 0.7; animation: dv11-pulse-2 2s ease-in-out infinite; }
.dv11-pulse-3 { opacity: 0.5; animation: dv11-pulse-3 2s ease-in-out infinite; }
`;

let styleInjected = false;

/**
 * 关键帧 + 附属类规则的 CSS 文本。
 * 编辑区通过 `injectAnimationKeyframes()` 塞进 document.head；
 * **发布端 codegen 直接引用同一份文本**推进页面样式表 —— 动画表现两端同源。
 */
export const DECORATION_ANIMATION_CSS = keyframesDefs;

export function injectAnimationKeyframes(): void {
  if (styleInjected || typeof document === "undefined") return;
  const style = document.createElement("style");
  style.setAttribute("data-deco-animations", "true");
  style.textContent = keyframesDefs;
  document.head.appendChild(style);
  styleInjected = true;
}

export function getAnimationSx(config: Partial<AnimationConfig>): SxProps<Theme> {
  const animation = (config.animation as AnimationType) || "none";
  const duration = config.animationDuration ?? 2000;

  if (animation === "none") return {};

  const animMap: Record<string, string> = {
    pulse: `deco-pulse ${duration}ms ease-in-out infinite`,
    blink: `deco-blink ${duration}ms ease-in-out infinite`,
    rotate: `deco-rotate ${duration}ms linear infinite`,
    bounce: `deco-bounce ${duration}ms ease-in-out infinite`,
    fadeIn: `deco-fadeIn ${duration}ms ease-out forwards`,
    swing: `deco-swing ${duration}ms ease-in-out infinite`,
    jelly: `deco-jelly ${duration}ms ease-in-out infinite`,
    shake: `deco-shake ${duration}ms ease-in-out infinite`,
    breathe: `deco-breathe ${duration * 1.5}ms ease-in-out infinite`,
    flip: `deco-flip ${duration * 1.5}ms ease-in-out infinite`,
    float: `deco-float ${duration}ms ease-in-out infinite`,
    heartbeat: `deco-heartbeat ${duration}ms ease-in-out infinite`,
    vortex: `deco-vortex ${duration * 2}ms linear infinite`,
  };

  return {
    animation: animMap[animation] || "none",
  };
}

/**
 * `#RRGGBB` → rgb。
 *
 * **修掉的真实缺陷**：原实现写的是 `parseInt(...) || 33`，于是任何**通道值为 0** 的颜色
 * 都会被 `||` 兜底覆盖 —— `#00ff00` 解析成 rgb(33,255,243)（绿色变青色）、
 * `#ff0000` 解析成 rgb(255,150,243)（红色变粉色）。线条特效的颜色一直是不对的，
 * 编辑区与发布端一起错（所以没人发现）。现在只在**格式非法**时才用兜底色。
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const FALLBACK = { r: 33, g: 150, b: 243 };
  if (!hex || !hex.startsWith("#") || hex.length < 7) return FALLBACK;
  const v = parseInt(hex.slice(1, 7), 16);
  if (Number.isNaN(v)) return FALLBACK;
  return { r: (v >> 16) & 0xff, g: (v >> 8) & 0xff, b: v & 0xff };
}

export function getLineEffectFilter(config: Partial<AnimationConfig>): string {
  const effect = (config.lineEffect as LineEffectType) || "none";
  const color = config.lineEffectColor || "";
  const intensity = config.lineEffectIntensity ?? 4;

  if (effect === "none") return "";

  const { r, g, b } = hexToRgb(color);

  if (effect === "glow") {
    return `drop-shadow(0 0 ${intensity}px rgba(${r},${g},${b},0.8)) drop-shadow(0 0 ${intensity * 2}px rgba(${r},${g},${b},0.4))`;
  }

  if (effect === "neon") {
    return `drop-shadow(0 0 ${intensity}px rgba(${r},${g},${b},1)) drop-shadow(0 0 ${intensity * 2}px rgba(${r},${g},${b},0.8)) drop-shadow(0 0 ${intensity * 4}px rgba(${r},${g},${b},0.6)) drop-shadow(0 0 ${intensity * 6}px rgba(${r},${g},${b},0.3))`;
  }

  if (effect === "fluorescent") {
    return `drop-shadow(0 0 ${intensity}px rgba(${r},${g},${b},0.9)) drop-shadow(0 0 ${intensity * 3}px rgba(${r},${g},${b},0.6)) drop-shadow(0 0 ${intensity * 5}px rgba(${r},${g},${b},0.3))`;
  }

  if (effect === "lightWave") {
    return `drop-shadow(0 0 ${intensity * 2}px rgba(${r},${g},${b},1)) drop-shadow(0 0 ${intensity * 4}px rgba(${r},${g},${b},0.5))`;
  }

  if (effect === "breatheGlow") {
    return `drop-shadow(0 0 ${intensity}px rgba(${r},${g},${b},0.6)) drop-shadow(0 0 ${intensity * 2}px rgba(${r},${g},${b},0.3))`;
  }

  if (effect === "electric") {
    return `drop-shadow(0 0 ${intensity}px rgba(${r},${g},${b},0.9)) drop-shadow(0 0 ${intensity * 3}px rgba(${r},${g},${b},0.5))`;
  }

  if (effect === "pulseWave") {
    return `drop-shadow(0 0 ${intensity}px rgba(${r},${g},${b},0.8)) drop-shadow(0 0 ${intensity * 2}px rgba(${r},${g},${b},0.4))`;
  }

  if (effect === "sparkle") {
    return `drop-shadow(0 0 ${intensity * 2}px rgba(${r},${g},${b},1)) drop-shadow(0 0 ${intensity * 3}px rgba(${r},${g},${b},0.5))`;
  }

  if (effect === "draw") {
    return `drop-shadow(0 0 ${intensity}px rgba(${r},${g},${b},0.6))`;
  }

  if (effect === "dashFlow") {
    return `drop-shadow(0 0 ${intensity}px rgba(${r},${g},${b},0.5))`;
  }

  if (effect === "rainbow") {
    return `drop-shadow(0 0 ${intensity}px rgba(255,255,255,0.3))`;
  }

  if (effect === "gradientFlow") {
    return `drop-shadow(0 0 ${intensity}px rgba(${r},${g},${b},0.5))`;
  }

  return "";
}

export function getLineEffectSx(config: Partial<AnimationConfig>): Record<string, any> {
  const effect = (config.lineEffect as LineEffectType) || "none";
  const color = config.lineEffectColor || "";
  const { r, g, b } = hexToRgb(color);

  const sx: Record<string, any> = {};

  if (effect === "neon") {
    sx["--neon-color"] = `rgba(${r},${g},${b},0.9)`;
  }

  if (effect === "fluorescent") {
    sx["--neon-color"] = `rgba(${r},${g},${b},0.9)`;
  }

  if (effect === "breatheGlow") {
    sx["--neon-color"] = `rgba(${r},${g},${b},0.9)`;
  }

  if (effect === "electric") {
    sx["--neon-color"] = `rgba(${r},${g},${b},0.9)`;
  }

  return sx;
}

export function getLineEffectAnimations(config: Partial<AnimationConfig>): string[] {
  const effect = (config.lineEffect as LineEffectType) || "none";
  const speed = config.lineEffectSpeed ?? 2000;

  const animations: string[] = [];

  if (effect === "neon") {
    animations.push(`deco-neon-flicker ${speed * 1.5}ms ease-in-out infinite`);
    animations.push(`deco-neon-glow ${speed}ms ease-in-out infinite`);
  }

  if (effect === "fluorescent") {
    animations.push(`deco-fluorescent-pulse ${speed}ms ease-in-out infinite`);
  }

  if (effect === "breatheGlow") {
    animations.push(`deco-breathe-glow ${speed * 1.5}ms ease-in-out infinite`);
  }

  if (effect === "electric") {
    animations.push(`deco-electric ${speed * 0.8}ms ease-in-out infinite`);
    animations.push(`deco-electric-glow ${speed}ms ease-in-out infinite`);
  }

  if (effect === "rainbow") {
    animations.push(`deco-rainbow-hue ${speed * 2}ms linear infinite`);
  }

  if (effect === "sparkle") {
    animations.push(`deco-sparkle-blink ${speed * 0.6}ms ease-in-out infinite`);
  }

  return animations;
}

export function getSvgLineEffectProps(config: Partial<AnimationConfig>): {
  strokeDasharray?: string;
  strokeDashoffset?: number;
  animationName?: string;
  animationDuration?: string;
  animationTimingFunction?: string;
  animationIterationCount?: string;
  style?: Record<string, any>;
  stroke?: string;
  strokeWidth?: number;
  fill?: string;
  vectorEffect?: string;
  strokeLinecap?: string;
  strokeLinejoin?: string;
} | null {
  const effect = (config.lineEffect as LineEffectType) || "none";
  const speed = config.lineEffectSpeed ?? 2000;
  const intensity = config.lineEffectIntensity ?? 4;
  const width = config.lineEffectWidth ?? 0;
  const color = config.lineEffectColor || "";
  const { r, g, b } = hexToRgb(color);

  if (effect === "flow") {
    return {
      strokeDasharray: "12 6",
      animationName: "deco-dash-flow",
      animationDuration: `${speed}ms`,
      animationTimingFunction: "linear",
      animationIterationCount: "infinite",
      style: { "--dash-flow-step": "-18" } as any,
      stroke: `rgba(${r},${g},${b},0.9)`,
      strokeWidth: width || intensity,
      fill: "none",
      vectorEffect: "non-scaling-stroke",
      strokeLinecap: "round",
      strokeLinejoin: "round",
    };
  }

  if (effect === "dashFlow") {
    return {
      strokeDasharray: "20 10",
      animationName: "deco-dash-flow",
      animationDuration: `${speed}ms`,
      animationTimingFunction: "linear",
      animationIterationCount: "infinite",
      style: { "--dash-flow-step": "-30" } as any,
      stroke: `rgba(${r},${g},${b},0.9)`,
      strokeWidth: width || intensity,
      fill: "none",
      vectorEffect: "non-scaling-stroke",
      strokeLinecap: "round",
      strokeLinejoin: "round",
    };
  }

  if (effect === "draw") {
    return {
      strokeDasharray: "9999",
      animationName: "deco-draw-line",
      animationDuration: `${speed}ms`,
      animationTimingFunction: "ease-in-out",
      animationIterationCount: "infinite",
      style: { "--draw-len": "9999" } as any,
      stroke: `rgba(${r},${g},${b},1)`,
      strokeWidth: width || intensity * 1.5,
      fill: "none",
      vectorEffect: "non-scaling-stroke",
      strokeLinecap: "round",
      strokeLinejoin: "round",
    };
  }

  if (effect === "lightWave") {
    const lwTotal = 200;
    return {
      strokeDasharray: "40 160",
      animationName: "deco-lightwave",
      animationDuration: `${speed}ms`,
      animationTimingFunction: "linear",
      animationIterationCount: "infinite",
      style: { "--lw-total": `${lwTotal}` } as any,
      stroke: `rgba(${r},${g},${b},1)`,
      strokeWidth: width || intensity * 2,
      fill: "none",
      vectorEffect: "non-scaling-stroke",
      strokeLinecap: "round",
      strokeLinejoin: "round",
    };
  }

  if (effect === "pulseWave") {
    const pwTotal = 200;
    return {
      strokeDasharray: "30 170",
      animationName: "deco-pulse-wave",
      animationDuration: `${speed}ms`,
      animationTimingFunction: "linear",
      animationIterationCount: "infinite",
      style: { "--pw-total": `${pwTotal}` } as any,
      stroke: `rgba(${r},${g},${b},0.8)`,
      strokeWidth: width || intensity * 1.5,
      fill: "none",
      vectorEffect: "non-scaling-stroke",
      strokeLinecap: "round",
      strokeLinejoin: "round",
    };
  }

  if (effect === "sparkle") {
    return {
      strokeDasharray: "3 15",
      animationName: "deco-dash-flow",
      animationDuration: `${speed}ms`,
      animationTimingFunction: "linear",
      animationIterationCount: "infinite",
      style: { "--dash-flow-step": "-18" } as any,
      stroke: `rgba(${r},${g},${b},1)`,
      strokeWidth: width || intensity,
      fill: "none",
      vectorEffect: "non-scaling-stroke",
      strokeLinecap: "round",
      strokeLinejoin: "round",
    };
  }

  if (effect === "gradientFlow") {
    return {
      strokeDasharray: "50 150",
      animationName: "deco-lightwave",
      animationDuration: `${speed}ms`,
      animationTimingFunction: "linear",
      animationIterationCount: "infinite",
      style: { "--lw-total": "200" } as any,
      stroke: `rgba(${r},${g},${b},0.7)`,
      strokeWidth: width || intensity * 1.5,
      fill: "none",
      vectorEffect: "non-scaling-stroke",
      strokeLinecap: "round",
      strokeLinejoin: "round",
    };
  }

  return null;
}

export const ANIMATION_SCHEMA = [
  {
    key: "animation",
    label: "动画",
    type: "select" as const,
    options: [
      { label: "无", value: "none" },
      { label: "脉冲", value: "pulse" },
      { label: "闪烁", value: "blink" },
      { label: "旋转", value: "rotate" },
      { label: "弹跳", value: "bounce" },
      { label: "淡入", value: "fadeIn" },
      { label: "摇摆", value: "swing" },
      { label: "果冻", value: "jelly" },
      { label: "抖动", value: "shake" },
      { label: "呼吸", value: "breathe" },
      { label: "翻转", value: "flip" },
      { label: "浮动", value: "float" },
      { label: "心跳", value: "heartbeat" },
      { label: "漩涡", value: "vortex" },
    ],
    group: "动画",
  },
  {
    key: "animationDuration",
    label: "动画时长(ms)",
    type: "number" as const,
    min: 200,
    max: 10000,
    group: "动画",
    hidden: (c: any) => c.animation === "none",
  },
  {
    key: "lineEffect",
    label: "线条效果",
    type: "select" as const,
    options: [
      { label: "无", value: "none" },
      { label: "发光", value: "glow" },
      { label: "流动", value: "flow" },
      { label: "霓虹灯", value: "neon" },
      { label: "荧光棒", value: "fluorescent" },
      { label: "光波", value: "lightWave" },
      { label: "描边绘制", value: "draw" },
      { label: "彩虹", value: "rainbow" },
      { label: "电弧", value: "electric" },
      { label: "呼吸光", value: "breatheGlow" },
      { label: "渐变流动", value: "gradientFlow" },
      { label: "脉冲波", value: "pulseWave" },
      { label: "闪烁点", value: "sparkle" },
      { label: "虚线流动", value: "dashFlow" },
    ],
    group: "线条效果",
  },
  {
    key: "lineEffectColor",
    label: "效果颜色",
    type: "color" as const,
    group: "线条效果",
    hidden: (c: any) => c.lineEffect === "none",
  },
  {
    key: "lineEffectIntensity",
    label: "效果强度",
    type: "number" as const,
    min: 1,
    max: 20,
    group: "线条效果",
    hidden: (c: any) => c.lineEffect === "none",
  },
  {
    key: "lineEffectSpeed",
    label: "效果速度(ms)",
    type: "number" as const,
    min: 200,
    max: 10000,
    group: "线条效果",
    hidden: (c: any) => c.lineEffect === "none" || c.lineEffect === "glow",
  },
  {
    key: "lineEffectWidth",
    label: "效果线宽",
    type: "number" as const,
    min: 0,
    max: 30,
    group: "线条效果",
    hidden: (c: any) =>
      c.lineEffect === "none" || c.lineEffect === "glow" || c.lineEffect === "neon" ||
      c.lineEffect === "fluorescent" || c.lineEffect === "breatheGlow" || c.lineEffect === "electric" ||
      c.lineEffect === "rainbow",
  },
];

export const ANIMATION_DEFAULTS = {
  animation: "none" as AnimationType,
  animationDuration: 2000,
  lineEffect: "none" as LineEffectType,
  lineEffectColor: "",
  lineEffectIntensity: 4,
  lineEffectSpeed: 2000,
  lineEffectWidth: 0,
};

/* ──────────────────────────────────────────────
 * 编辑区 ↔ 发布端：动画口径的公共出口
 *
 * 背景（修复的真实缺陷）：装饰组的「动画」12 种与「线条特效」14 种**只有编辑区落地**——
 * `DecorationWrapper`（React 层）负责它们，而发布端 `codegen/components/decoration.ts`
 * 完全没有这段逻辑，于是面板上改了动画/特效，编辑区动、发布产物一动不动。
 *
 * 收口方式：把「config → 容器 CSS 声明」「config → SVG 描边克隆属性」抽成纯函数，
 * 编辑区（DecorationWrapper / DataVRenderer）与发布端（codegen）都只读这一份。
 * ────────────────────────────────────────────── */

/** 需要用「克隆描边图元」实现的特效（其余靠容器 filter / 关键帧） */
export const SVG_OVERLAY_EFFECTS: ReadonlySet<LineEffectType> = new Set<LineEffectType>([
  "flow", "dashFlow", "draw", "lightWave", "pulseWave", "sparkle", "gradientFlow",
]);

/** 组件 config → 动画配置（三处调用方共用同一个映射，避免各写一份字段名） */
export function toAnimationConfig(config: Record<string, unknown>): Partial<AnimationConfig> {
  return {
    animation: config.animation as AnimationType,
    animationDuration: config.animationDuration as number,
    lineEffect: config.lineEffect as LineEffectType,
    lineEffectColor: config.lineEffectColor as string,
    lineEffectIntensity: config.lineEffectIntensity as number,
    lineEffectSpeed: config.lineEffectSpeed as number,
    lineEffectWidth: config.lineEffectWidth as number,
  };
}

/** 该动画配置是否什么都不做（发布端可以据此完全跳过动画相关输出） */
export function isDecorationAnimationIdle(config: Partial<AnimationConfig>): boolean {
  const animation = (config.animation as AnimationType) || "none";
  const effect = (config.lineEffect as LineEffectType) || "none";
  return animation === "none" && effect === "none";
}

/**
 * 装饰容器（编辑区是 DecorationWrapper 的 Box，发布端是对应外层 div）的完整 CSS 声明。
 *
 * 值的来源与 DecorationWrapper 逐项对应：动画名 + filter + `--neon-color` + 追加的
 * 线条特效动画；`overflow: visible` 也在这里统一（旧发布端缺这一条，光晕会被裁掉）。
 */
export function buildDecorationContainerDecls(
  config: Partial<AnimationConfig>,
  base: Record<string, string> = {},
): Record<string, string> {
  const decls: Record<string, string> = {
    width: "100%",
    height: "100%",
    overflow: "visible",
    ...base,
    ...(getAnimationSx(config) as Record<string, string>),
  };

  const filterStr = getLineEffectFilter(config);
  if (filterStr) decls.filter = filterStr;

  Object.assign(decls, getLineEffectSx(config));

  const lineAnimations = getLineEffectAnimations(config);
  if (lineAnimations.length > 0) {
    decls.animation = [decls.animation, ...lineAnimations].filter(Boolean).join(", ");
  }

  return decls;
}

/**
 * 描边克隆图元的属性：以源图元的 stroke / stroke-width 为底，被特效属性覆盖。
 * 编辑区是在真实 DOM/React 元素上做 clone，发布端在纯图元声明上做同一件事 —— 规则只有这一份。
 */
export function decorationOverlayAttrs(
  effectProps: NonNullable<ReturnType<typeof getSvgLineEffectProps>>,
  source: { stroke?: string | number; strokeWidth?: string | number },
): Record<string, string | number> {
  return {
    stroke: effectProps.stroke || source.stroke || "#fff",
    strokeWidth: effectProps.strokeWidth ?? source.strokeWidth ?? 2,
    fill: effectProps.fill || "none",
    ...(effectProps.strokeDasharray ? { strokeDasharray: effectProps.strokeDasharray } : {}),
    ...(effectProps.strokeDashoffset != null ? { strokeDashoffset: effectProps.strokeDashoffset } : {}),
    ...(effectProps.vectorEffect ? { vectorEffect: effectProps.vectorEffect } : {}),
    ...(effectProps.strokeLinecap ? { strokeLinecap: effectProps.strokeLinecap } : {}),
    ...(effectProps.strokeLinejoin ? { strokeLinejoin: effectProps.strokeLinejoin } : {}),
    pointerEvents: "none",
  };
}

/** 克隆图元的图元级 CSS（动画节奏 + 自定义属性） */
export function decorationOverlayCss(
  effectProps: NonNullable<ReturnType<typeof getSvgLineEffectProps>>,
): Record<string, string> {
  return {
    ...(effectProps.animationName ? { animationName: effectProps.animationName } : {}),
    ...(effectProps.animationDuration ? { animationDuration: effectProps.animationDuration } : {}),
    ...(effectProps.animationTimingFunction ? { animationTimingFunction: effectProps.animationTimingFunction } : {}),
    ...(effectProps.animationIterationCount ? { animationIterationCount: effectProps.animationIterationCount } : {}),
    ...((effectProps.style ?? {}) as Record<string, string>),
  };
}
