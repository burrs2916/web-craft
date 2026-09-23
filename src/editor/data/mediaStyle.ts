/**
 * 媒体组件（图片 / 视频 / 音频）的**唯一取值口径** —— 编辑区渲染器与发布端 codegen 共用。
 *
 * 为什么必须有这个文件（沿用 `fieldStyle.ts` / `labelStyle.ts` 已确立的范式）：
 * 同一批样式字面量写在三处（面板 defaultConfig / 编辑区渲染器 / 发布端 codegen）必然漂移。
 * 媒体组已真实发生过：图片的圆角在编辑区走 MUI sx 的「数字 × 主题 shape.borderRadius(=10)」
 * 口径（面板写 4 → 实际 40px），发布端却把面板值直接当 px 输出（4px）——
 * 同一份配置两端圆角差 10 倍。现两端都只读 `resolveMediaStyle().radiusCss`。
 *
 * 同时把「边框 / 阴影 / 透明度 / 填充模式 / 悬浮放大」等媒体族共有的派生规则收口，
 * 新增媒体类组件一律复用本解析器，不再自带第二份默认值。
 */

import { SHAPE_RADIUS } from "./fieldStyle";

export type MediaFit = "cover" | "contain" | "fill" | "none" | "scale-down";

const FITS: readonly MediaFit[] = ["cover", "contain", "fill", "none", "scale-down"];

export interface MediaStyle {
  /** 可直接写进 CSS 的圆角（面板值 × 主题 shape.borderRadius，与表单族同一口径） */
  radiusCss: string;
  /** 圆角数值（面板值原样，供需要数字的场合） */
  radius: number;
  /** 容器底色（占位/留白区域可见） */
  bgColor: string;
  /** 完整边框声明（无边框时为空串） */
  borderCss: string;
  /** 完整阴影声明（无阴影时为空串） */
  boxShadow: string;
  /** 整体不透明度 0~1 */
  opacity: number;
  /** 内容填充模式 */
  fit: MediaFit;
  /** object-position（仅 cover/contain/none/scale-down 有意义） */
  objectPosition: string;
  /** 悬浮放大倍数（1 = 不放大） */
  hoverScale: number;
  /** 悬浮缓动/时长（两条动画链路共用同一串，避免两端速度不一致） */
  transitionCss: string;
  /** 空态底色 */
  emptyBg: string;
  /** 空态文字色 */
  emptyColor: string;
  /** 空态提示文字 */
  emptyText: string;
  /** 说明文字（图片题注 / 视频标题） */
  caption: string;
  captionColor: string;
  captionBg: string;
  captionFontSize: number;
}

function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function nonNeg(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function str(v: unknown, fallback = ""): string {
  const s = String(v ?? "").trim();
  return s || fallback;
}

export interface MediaStyleDefaults {
  radius?: number;
  bgColor?: string;
  fit?: MediaFit;
  emptyText?: string;
  emptyBg?: string;
  emptyColor?: string;
}

/**
 * 解析媒体组件样式口径。所有字段都做了「未设置 → 默认值」归一，
 * 调用方**不得**再写任何默认字面量。
 */
export function resolveMediaStyle(
  c: Record<string, unknown>,
  defaults?: MediaStyleDefaults,
): MediaStyle {
  const radius = nonNeg(c.borderRadius, defaults?.radius ?? 0);
  const borderWidth = nonNeg(c.borderWidth, 0);
  const borderColor = str(c.borderColor, "#d0d0d8");
  const borderStyle = str(c.borderStyle, "solid");
  const shadow = str(c.boxShadow, "");

  const rawFit = String(c.fit ?? c.objectFit ?? defaults?.fit ?? "cover");
  const fit: MediaFit = (FITS as readonly string[]).includes(rawFit) ? (rawFit as MediaFit) : "cover";

  const objectPosition = str(c.objectPosition, "center center");
  const hoverScale = Math.max(1, num(c.hoverScale, c.hoverZoom === true ? 1.05 : 1));
  const duration = nonNeg(c.hoverDuration, 0.3);

  return {
    radius,
    radiusCss: `${radius * SHAPE_RADIUS}px`,
    bgColor: str(c.bgColor, defaults?.bgColor ?? "transparent"),
    borderCss: borderWidth > 0 ? `${borderWidth}px ${borderStyle} ${borderColor}` : "",
    boxShadow: shadow,
    opacity: Math.min(1, Math.max(0, num(c.opacity, 1))),
    fit,
    objectPosition,
    hoverScale,
    transitionCss: `transform ${duration}s cubic-bezier(0, 0, 0.2, 1)`,
    emptyBg: str(c.emptyBg, defaults?.emptyBg ?? "rgba(128,128,128,0.10)"),
    emptyColor: str(c.emptyColor, defaults?.emptyColor ?? "#999999"),
    emptyText: str(c.emptyText, defaults?.emptyText ?? "未设置资源"),
    caption: String(c.caption ?? ""),
    captionColor: str(c.captionColor, "rgba(255,255,255,0.92)"),
    captionBg: str(c.captionBg, "linear-gradient(transparent, rgba(0,0,0,0.62))"),
    captionFontSize: nonNeg(c.captionFontSize, 13),
  };
}

/** 媒体容器的公共内层样式（图片/视频共用；悬浮放大挂在**内容层**而不是容器，避免容器溢出裁剪） */
export function mediaContentCss(s: MediaStyle): string {
  return (
    `width:100%;height:100%;display:block;object-fit:${s.fit};object-position:${s.objectPosition};` +
    `transition:${s.transitionCss};` +
    (s.hoverScale > 1 ? `transform-origin:center center` : "")
  );
}
