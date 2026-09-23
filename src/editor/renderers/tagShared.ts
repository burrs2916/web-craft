/**
 * 标签组件共享的纯逻辑（无 React 依赖）
 * 编辑器渲染器与发布端 codegen 共用，保证双端缩放/配色语义一致。
 */

export interface TagPreset { bg: string; color: string; border: string }

export const TAG_PRESETS: Record<string, TagPreset> = {
  default: { bg: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.65)", border: "rgba(255,255,255,0.15)" },
  primary: { bg: "rgba(33,150,243,0.15)", color: "#64B5F6", border: "rgba(33,150,243,0.3)" },
  success: { bg: "rgba(76,175,80,0.15)", color: "#81C784", border: "rgba(76,175,80,0.3)" },
  warning: { bg: "rgba(255,152,0,0.15)", color: "#FFB74D", border: "rgba(255,152,0,0.3)" },
  error: { bg: "rgba(244,67,54,0.15)", color: "#E57373", border: "rgba(244,67,54,0.3)" },
  info: { bg: "rgba(158,158,158,0.15)", color: "#BDBDBD", border: "rgba(158,158,158,0.3)" },
  purple: { bg: "rgba(156,39,176,0.15)", color: "#BA68C8", border: "rgba(156,39,176,0.3)" },
  cyan: { bg: "rgba(0,188,212,0.15)", color: "#4DD0E1", border: "rgba(0,188,212,0.3)" },
};

export interface TagDims { height: number; padY: number; padX: number; fs: number }

export const TAG_SIZE_MAP: Record<string, TagDims> = {
  small: { height: 20, padY: 0, padX: 6, fs: 11 },
  medium: { height: 26, padY: 2, padX: 8, fs: 12 },
  large: { height: 32, padY: 4, padX: 12, fs: 14 },
};

/** 缩放的基准高度（等价编辑器默认槽位高 26 = medium 自然高） */
export const TAG_SCALE_REF = 26;

/** 由画布槽位高度推导等比缩放系数；无尺寸时返回 1（保持固有大小） */
export function tagScale(height?: number): number {
  if (typeof height !== "number" || !Number.isFinite(height) || height <= 0) return 1;
  const s = height / TAG_SCALE_REF;
  return Math.min(Math.max(s, 0.4), 4);
}

export interface ResolvedColors { bgStyle: string; borderStr: string; color: string }

/** 由预设 + 风格 + 自定义覆盖，解析最终三段颜色 */
export function resolveTagColors(
  presetName: string,
  variant: string,
  customBg: string,
  customColor: string,
  customBorder: string,
): ResolvedColors {
  const p = TAG_PRESETS[presetName] ?? TAG_PRESETS.default;
  const bg = customBg || p.bg;
  const color = customColor || p.color;
  const borderColor = customBorder || p.border;
  const bgStyle = variant === "outlined" ? "transparent" : variant === "filled" ? borderColor : bg;
  const borderStr = variant === "outlined" ? `1px solid ${borderColor}` : "1px solid transparent";
  return { bgStyle, borderStr, color };
}