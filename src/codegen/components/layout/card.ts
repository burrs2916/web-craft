import type { ComponentCodegenFn } from "../../types";
import { renderMenuIcon } from "../../iconPipeline";
import { escapeHTML } from "../../layout";
import { applyOpacity } from "./shared";

/**
 * card 组件 → HTML
 * 配置：title/subtitle/content, titleIcon/titleFontWeight/gap/contentVerticalAlign/titleLineClamp/contentOverflow,
 *       contentBgEnabled/contentBgColor, dividerEnabled/dividerColor/dividerStyle,
 *       imageSource/imagePosition/imageHeight/imageRadius,
 *       backgroundColor/backgroundOpacity, titleColor/titleFontSize, subtitleColor/subtitleFontSize,
 *       contentColor/contentFontSize, padding, borderRadius,
 *       borderEnabled/borderStyle/borderColor/borderWidth,
 *       shadowEnabled/shadowOffsetX/shadowOffsetY/shadowBlur/shadowSpread/shadowColor,
 *       textAlign
 */
export const cardCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config;

  // —— 解析配置（与 CardRenderer 字段名和默认值完全一致） ——
  const imageSource = c.imageSource ? String(c.imageSource) : "";
  const imagePosition = String(c.imagePosition ?? "top");
  const imageHeight = Number(c.imageHeight ?? 120);
  const imageRadius = Number(c.imageRadius ?? 0);
  const borderRadius = Number(c.borderRadius ?? 12);
  const padding = Number(c.padding ?? 16);
  const textAlign = String(c.textAlign ?? "left");
  const bgStr = applyOpacity(String(c.backgroundColor ?? "rgba(40,40,60,0.8)"), Number(c.backgroundOpacity ?? 100));

  // —— 内容区新增配置 ——
  const titleIcon = c.titleIcon ? String(c.titleIcon) : "";
  const titleFontWeight = String(c.titleFontWeight ?? "bold");
  const gap = Number(c.gap ?? 6);
  const contentVerticalAlign = String(c.contentVerticalAlign ?? "top");
  const titleLineClamp = Number(c.titleLineClamp ?? 0);
  const contentOverflow = String(c.contentOverflow ?? "hidden");
  const contentBgEnabled = c.contentBgEnabled === true;
  const contentBgColor = String(c.contentBgColor ?? "rgba(255,255,255,0.06)");
  const dividerEnabled = c.dividerEnabled === true;
  const dividerColor = String(c.dividerColor ?? "rgba(255,255,255,0.12)");
  const dividerStyle = String(c.dividerStyle ?? "solid");

  // —— 边框（支持 borderStyle） ——
  const borderEnabled = c.borderEnabled === true;
  const borderStyle = String(c.borderStyle ?? "solid");
  const borderColor = String(c.borderColor ?? "rgba(255,255,255,0.12)");
  const borderWidth = Number(c.borderWidth ?? 1);

  // —— 阴影（完整 5 字段公式） ——
  const shadowEnabled = c.shadowEnabled === true;
  const shadowOffsetX = Number(c.shadowOffsetX ?? 0);
  const shadowOffsetY = Number(c.shadowOffsetY ?? 4);
  const shadowBlur = Number(c.shadowBlur ?? 16);
  const shadowSpread = Number(c.shadowSpread ?? 0);
  const shadowColor = String(c.shadowColor ?? "rgba(0,0,0,0.4)");

  const isHorizontal = imagePosition === "left" || imagePosition === "right";

  // 垂直对齐映射
  const vAlignMap: Record<string, string> = {
    top: "flex-start",
    center: "center",
    bottom: "flex-end",
  };
  const vAlign = vAlignMap[contentVerticalAlign] || "flex-start";

  // —— 外层容器样式 ——
  const outerStyles: string[] = [
    "width: 100%",
    "height: 100%",
    "display: flex",
    isHorizontal
      ? (imagePosition === "left" ? "flex-direction: row" : "flex-direction: row-reverse")
      : "flex-direction: column",
    `background: ${bgStr}`,
    `border-radius: ${borderRadius}px`,
    "overflow: hidden",
  ];

  if (borderEnabled) {
    outerStyles.push(`border: ${borderWidth}px ${borderStyle} ${borderColor}`);
  }

  if (shadowEnabled) {
    outerStyles.push(`box-shadow: ${shadowOffsetX}px ${shadowOffsetY}px ${shadowBlur}px ${shadowSpread}px ${shadowColor}`);
  }

  let html = `<div style="${outerStyles.join("; ")}">`;

  // —— 图片（top 位置） ——
  if (imageSource && imagePosition === "top") {
    const imgRadius = imageRadius > 0 ? `border-radius:${imageRadius}px;` : "";
    html += `<img src="${escapeHTML(imageSource)}" style="width:100%;height:${imageHeight}px;object-fit:cover;flex-shrink:0;display:block;${imgRadius}" />`;
  }

  // —— 图片（left 位置） ——
  if (imageSource && imagePosition === "left") {
    const imgRadius = imageRadius > 0 ? `border-radius:${imageRadius}px;` : "";
    html += `<img src="${escapeHTML(imageSource)}" style="width:${imageHeight}px;height:100%;object-fit:cover;flex-shrink:0;display:block;${imgRadius}" />`;
  }

  // —— 图片（right 位置） ——
  if (imageSource && imagePosition === "right") {
    const imgRadius = imageRadius > 0 ? `border-radius:${imageRadius}px;` : "";
    html += `<img src="${escapeHTML(imageSource)}" style="width:${imageHeight}px;height:100%;object-fit:cover;flex-shrink:0;display:block;${imgRadius}" />`;
  }

  // —— 文本容器 ——
  const hasText = c.title || c.subtitle || c.content;
  if (hasText) {
    const contentBg = contentBgEnabled ? `background:${contentBgColor};` : "";
    html += `<div style="${contentBg}padding:${padding}px;text-align:${textAlign};flex:1 1 auto;overflow:hidden;display:flex;flex-direction:column;gap:${gap}px;justify-content:${vAlign}">`;

    // 标题行（可选前置图标）
    if (c.title) {
      const titleColor = String(c.titleColor ?? "#ffffff");
      const titleFontSize = Number(c.titleFontSize ?? 16);
      const clampStyle = titleLineClamp > 0
        ? `display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:${titleLineClamp};overflow:hidden;`
        : "";
      const iconHTML = titleIcon ? renderMenuIcon(titleIcon, titleFontSize, ctx) : "";
      html += `<div style="display:flex;align-items:center;gap:6px">`;
      if (iconHTML) {
        html += `<span style="display:inline-flex;flex-shrink:0;color:${titleColor}">${iconHTML}</span>`;
      }
      html += `<span style="color:${titleColor};font-size:${titleFontSize}px;font-weight:${titleFontWeight};line-height:1.3;flex:1 1 auto;${clampStyle}">${escapeHTML(String(c.title))}</span>`;
      html += `</div>`;
    }

    // 副标题
    if (c.subtitle) {
      html += `<div style="color:${String(c.subtitleColor ?? "rgba(255,255,255,0.55)")};font-size:${Number(c.subtitleFontSize ?? 12)}px;line-height:1.3">${escapeHTML(String(c.subtitle))}</div>`;
    }

    // 分隔线（标题/副标题 与 正文 之间）
    if (dividerEnabled && (c.title || c.subtitle) && c.content) {
      html += `<div style="width:100%;border-top:1px ${dividerStyle} ${dividerColor}"></div>`;
    }

    // 正文（支持溢出模式）
    if (c.content) {
      const contentColor = String(c.contentColor ?? "rgba(255,255,255,0.75)");
      const contentFontSize = Number(c.contentFontSize ?? 13);
      let overflowStyle = "overflow:hidden;";
      if (contentOverflow === "ellipsis") {
        overflowStyle = "display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden;";
      } else if (contentOverflow === "scroll") {
        overflowStyle = "overflow-y:auto;flex:1 1 0;min-height:0;";
      }
      html += `<div style="color:${contentColor};font-size:${contentFontSize}px;line-height:1.5;white-space:pre-wrap;${overflowStyle}">${escapeHTML(String(c.content))}</div>`;
    }

    html += `</div>`;
  }

  // —— 图片（bottom 位置） ——
  if (imageSource && imagePosition === "bottom") {
    const imgRadius = imageRadius > 0 ? `border-radius:${imageRadius}px;` : "";
    html += `<img src="${escapeHTML(imageSource)}" style="width:100%;height:${imageHeight}px;object-fit:cover;flex-shrink:0;display:block;${imgRadius}" />`;
  }

  html += `</div>`;
  return html;
};

