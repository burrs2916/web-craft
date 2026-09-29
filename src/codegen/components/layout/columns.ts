import type { ComponentCodegenFn } from "../../types";
import { generateChildHTML } from "../../engine";
import { applyOpacity } from "./shared";

/**
 * columns 组件 → HTML
 * 配置：count, gap, alignItems,
 *       col1Type/col1Value ... col6Type/col6Value,
 *       showLines/lineColor/lineStyle/lineWidth,
 *       showCellBg/cellBg,
 *       backgroundEnabled/backgroundColor/backgroundOpacity,
 *       borderEnabled/borderColor/borderWidth/borderStyle,
 *       borderRadius, paddingX/paddingY,
 *       shadowEnabled/shadowOffsetX/shadowOffsetY/shadowBlur/shadowSpread/shadowColor,
 *       overflow
 */
export const columnsCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config;
  const count = Math.max(1, Math.min(6, Number(c.count ?? 3)));
  const gap = c.gap ?? 12;
  const alignItems = c.alignItems ?? "stretch";

  // —— 每栏样式 ——
  const getColStyle = (index: number): string => {
    const type = (c as any)[`col${index + 1}Type`] ?? "fr";
    const value = (c as any)[`col${index + 1}Value`] ?? 1;

    const styles: string[] = ["height: 100%", "box-sizing: border-box", "min-width: 0", "min-height: 0"];

    switch (type) {
      case "px":
        styles.push("flex: 0 0 auto", `width: ${value}px`);
        break;
      case "auto":
        styles.push("flex: 0 0 auto", "width: auto");
        break;
      case "fr":
      default:
        styles.push(`flex: ${value} 1 0`, "width: auto");
    }

    // 栏背景
    if (c.showCellBg) {
      styles.push(`background: ${c.cellBg ?? "rgba(255,255,255,0.03)"}`);
    }
    // 栏线
    if (c.showLines) {
      styles.push(`border: ${c.lineWidth ?? 1}px ${c.lineStyle ?? "dashed"} ${c.lineColor ?? "rgba(255,255,255,0.12)"}`);
      styles.push("border-radius: 2px");
    }
    return styles.join("; ");
  };

  // —— 外层样式 ——
  const outerStyles: string[] = [
    "width: 100%",
    "height: 100%",
    "box-sizing: border-box",
  ];

  // 背景
  if (c.backgroundEnabled) {
    outerStyles.push(`background: ${applyOpacity(String(c.backgroundColor ?? "rgba(255,255,255,0.02)"), Number(c.backgroundOpacity ?? 100))}`);
  }

  // 边框
  if (c.borderEnabled) {
    outerStyles.push(`border: ${c.borderWidth ?? 1}px ${c.borderStyle ?? "solid"} ${c.borderColor ?? "rgba(255,255,255,0.1)"}`);
  }

  // 圆角
  if (c.borderRadius !== undefined) {
    outerStyles.push(`border-radius: ${c.borderRadius}px`);
  }

  // 内边距
  if (c.paddingX !== undefined || c.paddingY !== undefined) {
    const py = c.paddingY ?? 0;
    const px = c.paddingX ?? 0;
    outerStyles.push(`padding: ${py}px ${px}px`);
  }

  // 阴影
  if (c.shadowEnabled) {
    const sx = c.shadowOffsetX ?? 0;
    const sy = c.shadowOffsetY ?? 4;
    const blur = c.shadowBlur ?? 12;
    const spread = c.shadowSpread ?? 0;
    const color = c.shadowColor ?? "rgba(0,0,0,0.3)";
    outerStyles.push(`box-shadow: ${sx}px ${sy}px ${blur}px ${spread}px ${color}`);
  }

  // 溢出
  outerStyles.push(`overflow: ${c.overflow ?? "hidden"}`);

  // —— inner flex 容器 ——
  const innerStyles: string[] = [
    "width: 100%",
    "height: 100%",
    "display: flex",
    "flex-direction: row",
    `gap: ${gap}px`,
    `align-items: ${alignItems}`,
  ];

  // —— 生成 HTML ——
  const children = ctx.childrenByParent?.get(component.id) ?? [];
  let html = `<div style="${outerStyles.join("; ")}${children.length > 0 ? "; position: relative" : ""}">`;
  html += `<div style="${innerStyles.join("; ")}">`;
  for (let i = 0; i < count; i++) {
    html += `<div style="${getColStyle(i)}"></div>`;
  }
  html += `</div>`;
  // 渲染嵌入的子组件（绝对定位，相对此容器）
  for (const child of children) {
    html += generateChildHTML(child, ctx);
  }
  html += `</div>`;
  return html;
};

