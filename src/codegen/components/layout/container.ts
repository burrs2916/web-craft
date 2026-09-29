import type { ComponentCodegenFn } from "../../types";
import { generateChildHTML } from "../../engine";
import { escapeHTML } from "../../layout";
import { applyOpacity } from "./shared";

/**
 * container 组件 → HTML
 * 配置：backgroundEnabled/backgroundColor/backgroundOpacity,
 *       borderEnabled/borderColor/borderWidth/borderStyle,
 *       borderRadius, paddingX/paddingY,
 *       shadowEnabled/shadowOffsetX/shadowOffsetY/shadowBlur/shadowSpread/shadowColor,
 *       overflow, showLabel/labelText
 */
export const containerCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config;

  // 随框等比缩放：基准 400×300，与编辑端 ContainerRenderer 一致（scaleFit 关闭则为 1）
  const tf = component.transform as { width?: number; height?: number } | undefined;
  const cw = typeof tf?.width === "number" ? tf.width : 0;
  const ch = typeof tf?.height === "number" ? tf.height : 0;
  const scaleFit = c.scaleFit !== false;
  const fit =
    scaleFit && cw > 0 && ch > 0
      ? Math.min(Math.max(Math.min(cw / 400, ch / 300), 0.4), 4)
      : 1;
  const s = cw > 0 && ch > 0 ? (v: number) => v * fit : (v: number) => v;

  const styles: string[] = [
    "width: 100%",
    "height: 100%",
    "box-sizing: border-box",
  ];

  if (c.backgroundEnabled) {
    const opacity = c.backgroundOpacity ?? 100;
    styles.push(`background: ${applyOpacity(String(c.backgroundColor ?? "rgba(255,255,255,0.05)"), Number(opacity))}`);
  }

  if (c.borderEnabled) {
    styles.push(`border: ${s(Number(c.borderWidth ?? 1))}px ${c.borderStyle ?? "solid"} ${c.borderColor ?? "#3a3a5c"}`);
  }

  if (c.borderRadius !== undefined) {
    styles.push(`border-radius: ${s(Number(c.borderRadius))}px`);
  }

  // 内边距：优先使用新的 paddingX/paddingY，兼容旧的 padding
  if (c.paddingX !== undefined || c.paddingY !== undefined) {
    const py = s(Number(c.paddingY ?? 16));
    const px = s(Number(c.paddingX ?? 16));
    styles.push(`padding: ${py}px ${px}px`);
  } else if (c.padding !== undefined) {
    styles.push(`padding: ${c.padding}px`);
  }

  if (c.shadowEnabled) {
    const offsetX = s(Number(c.shadowOffsetX ?? 0));
    const offsetY = s(Number(c.shadowOffsetY ?? 0));
    const blur = s(Number(c.shadowBlur ?? 12));
    const spread = s(Number(c.shadowSpread ?? 0));
    const color = c.shadowColor ?? "rgba(0,0,0,0.3)";
    styles.push(`box-shadow: ${offsetX}px ${offsetY}px ${blur}px ${spread}px ${color}`);
  }

  if (c.overflow !== undefined) {
    styles.push(`overflow: ${c.overflow}`);
  } else {
    styles.push("overflow: hidden");
  }

  const children = ctx.childrenByParent?.get(component.id) ?? [];
  const labelHTML = c.showLabel && c.labelText
    ? `<span style="position:absolute;top:4px;left:8px;font-size:11px;color:rgba(255,255,255,0.35);pointer-events:none;user-select:none">${escapeHTML(String(c.labelText))}</span>`
    : "";
  const childrenHTML = children.map((ch) => generateChildHTML(ch, ctx)).join("\n");
  return `<div style="${styles.join("; ")}; position: relative">${labelHTML}${childrenHTML}</div>`;
};

