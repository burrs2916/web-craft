import type { ComponentCodegenFn } from "../../types";
import { escapeHTML } from "../../layout";

/**
 * 间距 codegen
 * 两种类型：blank（空白留白）和 divider（分隔线）
 * blank：配置 bgEnabled/bgColor/borderEnabled/borderStyle/borderColor/borderWidth/radius/showPlaceholder...
 * divider：配置 orientation/borderStyle/borderColor/borderWidth/label/labelAlign/labelColor/labelFontSize
 */
export const spaceCodegen: ComponentCodegenFn = (component) => {
  const c = component.config;
  const type = String(c.type ?? "blank");

  // —— 分隔线类型 ——
  if (type === "divider") {
    const orientation = String(c.orientation ?? "horizontal");
    const borderStyle = String(c.borderStyle ?? "dashed");
    const borderColor = String(c.borderColor ?? "rgba(255,255,255,0.15)");
    const borderWidth = Number(c.borderWidth ?? 1);
    const label = c.label ? String(c.label) : "";
    const labelAlign = String(c.labelAlign ?? "center");
    const labelColor = String(c.labelColor ?? "rgba(255,255,255,0.5)");
    const labelFontSize = Number(c.labelFontSize ?? 12);

    const lineBorder = `${borderWidth}px ${borderStyle} ${borderColor}`;

    // 垂直分隔线
    if (orientation === "vertical") {
      if (!label) {
        return `<div style="width:100%;height:100%;display:flex;justify-content:center"><div style="height:100%;border-left:${lineBorder}"></div></div>`;
      }
      const showTop = labelAlign !== "left";
      const showBottom = labelAlign !== "right";
      let inner = "";
      if (showTop) inner += `<div style="flex:1;border-left:${lineBorder}"></div>`;
      inner += `<span style="color:${labelColor};font-size:${labelFontSize}px;white-space:nowrap;padding:4px 0">${escapeHTML(label)}</span>`;
      if (showBottom) inner += `<div style="flex:1;border-left:${lineBorder}"></div>`;
      return `<div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center">${inner}</div>`;
    }

    // 水平分隔线
    if (!label) {
      return `<div style="width:100%;height:100%;display:flex;align-items:center"><div style="width:100%;border-top:${lineBorder}"></div></div>`;
    }
    const showLeft = labelAlign !== "left";
    const showRight = labelAlign !== "right";
    let inner = "";
    if (showLeft) inner += `<div style="flex:1;border-top:${lineBorder}"></div>`;
    inner += `<span style="color:${labelColor};font-size:${labelFontSize}px;white-space:nowrap;padding:0 8px">${escapeHTML(label)}</span>`;
    if (showRight) inner += `<div style="flex:1;border-top:${lineBorder}"></div>`;
    return `<div style="width:100%;height:100%;display:flex;align-items:center">${inner}</div>`;
  }

  // —— 空白类型（原有逻辑） ——
  const bgEnabled = c.bgEnabled === true;
  const bgColor = String(c.bgColor ?? "rgba(255,255,255,0.04)");

  const borderEnabled = c.borderEnabled === true;
  const borderStyle = String(c.borderStyle ?? "dashed");
  const borderColor = String(c.borderColor ?? "rgba(255,255,255,0.15)");
  const borderWidth = Number(c.borderWidth ?? 1);

  const radius = Number(c.radius ?? 0);

  const showPlaceholder = c.showPlaceholder === true;
  const placeholderText = String(c.placeholderText ?? "间距");
  const placeholderColor = String(c.placeholderColor ?? "rgba(255,255,255,0.3)");
  const placeholderFontSize = Number(c.placeholderFontSize ?? 12);
  const placeholderBgColor = String(c.placeholderBgColor ?? "rgba(255,255,255,0.08)");

  const styles: string[] = [
    "width: 100%",
    "height: 100%",
    "display: flex",
    "align-items: center",
    "justify-content: center",
    "box-sizing: border-box",
    "overflow: hidden",
  ];

  if (bgEnabled) {
    styles.push(`background: ${bgColor}`);
  }
  if (borderEnabled) {
    styles.push(`border: ${borderWidth}px ${borderStyle} ${borderColor}`);
  }
  if (radius > 0) {
    styles.push(`border-radius: ${radius}px`);
  }

  let innerHTML = "";
  if (showPlaceholder) {
    innerHTML = `<span style="font-size:${placeholderFontSize}px;color:${placeholderColor};background:${placeholderBgColor};padding:2px 8px;border-radius:4px;line-height:1.4;white-space:nowrap">${escapeHTML(placeholderText)}</span>`;
  }

  return `<div style="${styles.join("; ")}">${innerHTML}</div>`;
};

