import type { ComponentCodegenFn } from "../types";
import { escapeHTML } from "../layout";

/**
 * 分割线组件 -> HTML（divider 水平 / divider-vertical 垂直 共用）
 * 相对容器居中：水平线垂直居中，垂直线水平居中，支持内边距与对齐。
 * 水平配置：variant(solid/dashed/dotted/gradient), color, gradientColor, thickness,
 *       widthMode(full/fixed), widthValue, align(left/center/right),
 *       paddingX, paddingY, gap,
 *       text, textAlign, fontSize, textColor, textBg
 * 垂直配置：orientation=vertical, variant, color, gradientColor, thickness,
 *       heightMode(full/fixed), heightValue, align(top/center/bottom),
 *       paddingX, paddingY
 */
export const dividerCodegen: ComponentCodegenFn = (component) => {
  const c = component.config;
  const isVertical = String(c.orientation ?? "horizontal") === "vertical";

  const variant = String(c.variant ?? "solid");
  const color = String(c.color ?? "rgba(255,255,255,0.12)");
  const gradientColor = String(c.gradientColor ?? color);
  const thickness = Number(c.thickness ?? 1);
  const isGradient = variant === "gradient";
  const borderStyle = variant === "dashed" ? "dashed" : variant === "dotted" ? "dotted" : "solid";

  // ── 垂直分割线 ──
  if (isVertical) {
    const heightMode = String(c.heightMode ?? "full");
    const heightValue = Number(c.heightValue ?? 120);
    const height = heightMode === "fixed" ? `${heightValue}px` : "100%";
    const paddingX = Number(c.paddingX ?? 8);
    const paddingY = Number(c.paddingY ?? 0);
    const align = String(c.align ?? "center");
    const alignSelf = align === "top" ? "flex-start" : align === "bottom" ? "flex-end" : "center";
    const line = isGradient
      ? `width:${thickness}px;height:${height};flex-shrink:0;background:linear-gradient(to bottom, transparent, ${color} 20%, ${gradientColor} 50%, ${color} 80%, transparent);border-radius:${thickness}px`
      : `width:${thickness}px;height:${height};flex-shrink:0;border-left:${thickness}px ${borderStyle} ${color};box-sizing:border-box`;
    return `<div style="width:100%;height:100%;display:flex;justify-content:center;align-items:center;overflow:hidden;box-sizing:border-box;padding:${paddingY}px ${paddingX}px"><div style="${line};align-self:${alignSelf}"></div></div>`;
  }

  // ── 水平分割线 ──
  const widthMode = String(c.widthMode ?? "full");
  const widthValue = Number(c.widthValue ?? 320);
  const width = widthMode === "fixed" ? `${widthValue}px` : "100%";
  const paddingX = Number(c.paddingX ?? 8);
  const paddingY = Number(c.paddingY ?? 0);
  const gap = Number(c.gap ?? 12);
  const align = String(c.align ?? "center");
  const rowAlign = align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";
  const text = String(c.text ?? "");

  const wrapper = (inner: string) =>
    `<div style="width:100%;height:100%;display:flex;flex-direction:column;justify-content:center;align-items:${rowAlign};overflow:hidden;box-sizing:border-box;padding:${paddingY}px ${paddingX}px">${inner}</div>`;

  const lineStyle = (flex: string): string => isGradient
    ? `flex:${flex};min-width:0;height:${thickness}px;background:linear-gradient(to right, transparent, ${color} 20%, ${gradientColor} 50%, ${color} 80%, transparent);border-radius:${thickness}px`
    : `flex:${flex};min-width:0;border-top:${thickness}px ${borderStyle} ${color}`;

  // 带文字
  if (text) {
    const textAlign = String(c.textAlign ?? "center");
    const fontSize = Number(c.fontSize ?? 14);
    const textColor = String(c.textColor ?? "rgba(255,255,255,0.6)");
    const textBg = String(c.textBg ?? "transparent");
    const txtStyle = `font-size:${fontSize}px;color:${textColor};background:${textBg};padding:${textBg !== "transparent" ? "2px 8px" : "0"};border-radius:${textBg !== "transparent" ? 4 : 0};white-space:nowrap;flex-shrink:0`;

    let inner = "";
    if (textAlign !== "left") inner += `<div style="${lineStyle("1")}"></div>`;
    inner += `<span style="${txtStyle}">${escapeHTML(text)}</span>`;
    if (textAlign !== "right") inner += `<div style="${lineStyle("1")}"></div>`;
    return wrapper(`<div style="width:${width};display:flex;align-items:center;gap:${gap}px;flex-shrink:0;max-width:100%">${inner}</div>`);
  }

  // 纯水平线：垂直居中 + 水平对齐
  const line = isGradient
    ? `width:${width};min-height:0;height:${thickness}px;background:linear-gradient(to right, transparent, ${color} 20%, ${gradientColor} 50%, ${color} 80%, transparent);border-radius:${thickness}px`
    : `width:${width};min-height:0;border-top:${thickness}px ${borderStyle} ${color}`;
  return wrapper(`<div style="${line}"></div>`);
};