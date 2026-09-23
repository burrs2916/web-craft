/**
 * CanvasConfig 类型与工具函数
 *
 * 从 editorStore.ts 提取，避免 codegen 模块间接依赖 zustand / logger。
 * editorStore.ts 重新导出这些类型以保持兼容。
 */

import type { CanvasBackground } from "../types/editor";

export interface CanvasPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface CanvasMetadata {
  title: string;
  description: string;
  keywords: string[];
  favicon: string;
}

export interface CanvasConfig {
  width: number;
  height: number;
  /** 内容不足时画布保持的最小高度（px），模拟真实网页的首屏高度 */
  minHeight: number;
  background: CanvasBackground;
  /** 画布内边距 */
  padding: CanvasPadding;
  /** 全局默认字体 */
  fontFamily: string;
  /** 内容区最大宽度约束（null = 跟随画布宽度） */
  maxWidth: number | null;
  /** 页面 SEO 元数据 */
  metadata: CanvasMetadata;
}

export const DEFAULT_CANVAS_CONFIG: CanvasConfig = {
  width: 1920,
  height: 1080,
  minHeight: 768,
  background: {
    type: "solid",
    color: "#ffffff",
    gradient: {
      direction: "to-bottom",
      colors: ["#1a1a2e", "#16213e"],
    },
    imageUrl: "",
    imageFit: "cover",
    videoUrl: "",
    videoAutoplay: true,
    videoMuted: true,
    videoLoop: true,
  },
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
  maxWidth: null,
  metadata: {
    title: "",
    description: "",
    keywords: [],
    favicon: "",
  },
};

export function normalizeCanvasConfig(raw: Partial<CanvasConfig> | undefined): CanvasConfig {
  if (!raw) return { ...DEFAULT_CANVAS_CONFIG };
  return {
    ...DEFAULT_CANVAS_CONFIG,
    ...raw,
    minHeight: clampNumber(raw.minHeight, 200, 8640, DEFAULT_CANVAS_CONFIG.minHeight),
    background: { ...DEFAULT_CANVAS_CONFIG.background, ...raw.background,
      gradient: { ...DEFAULT_CANVAS_CONFIG.background.gradient, ...raw.background?.gradient } },
    padding: { ...DEFAULT_CANVAS_CONFIG.padding, ...raw.padding },
    metadata: { ...DEFAULT_CANVAS_CONFIG.metadata, ...raw.metadata },
  };
}

function clampNumber(value: number | undefined, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}
