import type { ComponentCodegenFn } from "../types";
import { escapeHTML } from "../layout";

/**
 * badge 徽标组件 -> HTML
 * 配置：content, variant, position, color, textColor, fontSize, dotSize,
 *       borderRadius, minWidth, height, padding, showBorder, borderColor,
 *       borderWidth, max, offsetX, offsetY, triggerText, triggerColor, triggerFontSize
 */
export const badgeCodegen: ComponentCodegenFn = (component) => {
  const c = component.config;

  const content = String(c.content ?? "5");
  const variant = String(c.variant ?? "number");
  const position = String(c.position ?? "top-right");
  const color = String(c.color ?? "#F44336");
  const gradientEnabled = c.gradientEnabled === true;
  const gradientFrom = String(c.gradientFrom ?? "#0D9488");
  const gradientTo = String(c.gradientTo ?? "#0EA5E9");
  const badgeBg = gradientEnabled ? `linear-gradient(135deg,${gradientFrom},${gradientTo})` : color;
  const textColor = String(c.textColor ?? "#ffffff");
  const fontSize = Number(c.fontSize ?? 11);
  const dotSize = Number(c.dotSize ?? 8);
  const borderRadius = Number(c.borderRadius ?? 10);
  const minWidth = Number(c.minWidth ?? 16);
  const badgeHeight = Number(c.height ?? 16);
  const padding = Number(c.padding ?? 2);
  const showBorder = c.showBorder === true;
  const borderColor = String(c.borderColor ?? "#ffffff");
  const borderWidth = Number(c.borderWidth ?? 2);
  const max = Number(c.max ?? 99);
  const offsetX = Number(c.offsetX ?? 0);
  const offsetY = Number(c.offsetY ?? 0);
  const triggerText = String(c.triggerText ?? "消息");
  const triggerColor = String(c.triggerColor ?? "rgba(255,255,255,0.7)");
  const triggerFontSize = Number(c.triggerFontSize ?? 14);

  // 数字溢出
  let displayContent = "";
  if (variant === "number") {
    const num = parseInt(content, 10);
    displayContent = isNaN(num) ? content : (num > max ? `${max}+` : String(num));
  } else if (variant === "text") {
    displayContent = content;
  }

  const borderStr = showBorder ? `border:${borderWidth}px solid ${borderColor};box-sizing:border-box` : "";
  const badgeShadow = "box-shadow:0 2px 6px rgba(0,0,0,0.25);";
  const dotShadow = "box-shadow:0 1px 4px rgba(0,0,0,0.35);";
  const badgeFont = "line-height:1.2;letter-spacing:0.3px;";

  // 独立显示
  if (position === "standalone") {
    if (variant === "dot") {
      return `<div style="display:inline-flex;align-items:center;justify-content:center;width:100%;height:100%"><span style="width:${dotSize}px;height:${dotSize}px;border-radius:50%;background:${badgeBg};${dotShadow}${borderStr}"></span></div>`;
    }
    return `<div style="display:inline-flex;align-items:center;justify-content:center;width:100%;height:100%"><span style="display:inline-flex;align-items:center;justify-content:center;min-width:${minWidth}px;height:${badgeHeight}px;padding:0 ${padding}px;background:${badgeBg};color:${textColor};font-size:${fontSize}px;font-weight:600;${badgeFont}border-radius:${borderRadius}px;${badgeShadow}${borderStr};white-space:nowrap">${escapeHTML(displayContent)}</span></div>`;
  }

  const triggerWrap = `<span style="position:relative;display:inline-block"><span style="font-size:${triggerFontSize}px;color:${triggerColor};user-select:none;line-height:1.2;display:block">${escapeHTML(triggerText)}</span>`;

  // 圆点（浮在触发文字右上方，不覆盖文字）
  if (variant === "dot") {
    const pos = `position:absolute;top:${offsetY - dotSize * 0.25}px;left:calc(100% + ${offsetX}px)`;
    return `<div style="position:relative;display:inline-flex;align-items:center;justify-content:center;width:100%;height:100%">${triggerWrap}<span style="${pos};width:${dotSize}px;height:${dotSize}px;border-radius:50%;background:${badgeBg};${dotShadow}${borderStr}"></span></span></div>`;
  }

  // 数字/文字（浮在触发文字右上方，不覆盖文字）
  const pos = `position:absolute;top:${offsetY - badgeHeight * 0.25}px;left:calc(100% + ${offsetX}px)`;
  return `<div style="position:relative;display:inline-flex;align-items:center;justify-content:center;width:100%;height:100%">${triggerWrap}<span style="${pos};display:inline-flex;align-items:center;justify-content:center;min-width:${minWidth}px;height:${badgeHeight}px;padding:0 ${padding}px;background:${badgeBg};color:${textColor};font-size:${fontSize}px;font-weight:600;${badgeFont}border-radius:${borderRadius}px;${badgeShadow}${borderStr};white-space:nowrap">${escapeHTML(displayContent)}</span></span></div>`;
};
