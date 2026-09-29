/**
 * datav 线条特效叠加：SVG 描边克隆、CSS 变量样式与动画样式构建。
 * 从 DataVRenderer.tsx 迁出，仅做代码搬迁。
 */
import React from "react";
import {
  getAnimationSx,
  getLineEffectAnimations,
  getLineEffectFilter,
  getLineEffectSx,
  getSvgLineEffectProps,
  type AnimationConfig,
  type LineEffectType,
} from "../decorationAnimation";

const SVG_NS = "http://www.w3.org/2000/svg";
const DATAV_EFFECT_OVERLAY_ATTR = "data-datav-effect-overlay";
const DATAV_STROKE_SELECTOR = "line[stroke],rect[stroke],circle[stroke],ellipse[stroke],polygon[stroke],polyline[stroke],path[stroke]";
export const DATAV_SVG_OVERLAY_EFFECTS: Set<LineEffectType> = new Set([
  "flow", "dashFlow", "draw", "lightWave", "pulseWave", "sparkle", "gradientFlow",
]);

export function clearDataVLineEffectOverlays(container: HTMLElement): void {
  container.querySelectorAll(`[${DATAV_EFFECT_OVERLAY_ATTR}="true"]`).forEach((node) => node.remove());
}

function toCssName(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function applyOverlayStyle(el: SVGElement, style?: Record<string, any>): void {
  if (!style) return;
  for (const [key, value] of Object.entries(style)) {
    if (value == null) continue;
    el.style.setProperty(key.startsWith("--") ? key : toCssName(key), String(value));
  }
}

function createDataVLineEffectClone(
  source: SVGElement,
  effectProps: NonNullable<ReturnType<typeof getSvgLineEffectProps>>
): SVGElement | null {
  const tagName = source.tagName.toLowerCase();
  if (!["line", "rect", "circle", "ellipse", "polygon", "polyline", "path"].includes(tagName)) return null;

  const clone = source.cloneNode(false) as SVGElement;
  clone.removeAttribute("id");
  clone.removeAttribute("class");
  clone.removeAttribute("filter");
  clone.setAttribute(DATAV_EFFECT_OVERLAY_ATTR, "true");
  clone.setAttribute("pointer-events", "none");
  clone.setAttribute("stroke", effectProps.stroke || source.getAttribute("stroke") || "#fff");
  clone.setAttribute("stroke-width", String(effectProps.strokeWidth ?? source.getAttribute("stroke-width") ?? 2));
  clone.setAttribute("fill", effectProps.fill || "none");

  if (effectProps.strokeDasharray) clone.setAttribute("stroke-dasharray", effectProps.strokeDasharray);
  if (effectProps.strokeDashoffset != null) clone.setAttribute("stroke-dashoffset", String(effectProps.strokeDashoffset));
  if (effectProps.vectorEffect) clone.setAttribute("vector-effect", effectProps.vectorEffect);
  if (effectProps.strokeLinecap) clone.setAttribute("stroke-linecap", effectProps.strokeLinecap);
  if (effectProps.strokeLinejoin) clone.setAttribute("stroke-linejoin", effectProps.strokeLinejoin);
  if (effectProps.animationName) clone.style.animationName = effectProps.animationName;
  if (effectProps.animationDuration) clone.style.animationDuration = effectProps.animationDuration;
  if (effectProps.animationTimingFunction) clone.style.animationTimingFunction = effectProps.animationTimingFunction;
  if (effectProps.animationIterationCount) clone.style.animationIterationCount = effectProps.animationIterationCount;
  applyOverlayStyle(clone, effectProps.style);

  return clone;
}

export function applyDataVLineEffectOverlays(
  container: HTMLElement,
  effectProps: NonNullable<ReturnType<typeof getSvgLineEffectProps>> | null
): void {
  clearDataVLineEffectOverlays(container);
  if (!effectProps) return;

  container.querySelectorAll("svg").forEach((svg) => {
    const group = document.createElementNS(SVG_NS, "g");
    group.setAttribute(DATAV_EFFECT_OVERLAY_ATTR, "true");
    group.setAttribute("pointer-events", "none");

    svg.querySelectorAll<SVGElement>(DATAV_STROKE_SELECTOR).forEach((source) => {
      if (source.closest(`[${DATAV_EFFECT_OVERLAY_ATTR}]`)) return;
      const stroke = source.getAttribute("stroke");
      if (!stroke || stroke === "none" || stroke === "transparent") return;
      const clone = createDataVLineEffectClone(source, effectProps);
      if (clone) group.appendChild(clone);
    });

    if (group.childNodes.length > 0) {
      svg.appendChild(group);
    }
  });
}

export function buildDataVAnimationStyle(config: Partial<AnimationConfig>): React.CSSProperties {
  const style: React.CSSProperties & Record<string, any> = {};
  const animationSx = getAnimationSx(config);
  if (animationSx && typeof animationSx === "object" && !Array.isArray(animationSx)) {
    Object.assign(style, animationSx);
  }

  const filterStr = getLineEffectFilter(config);
  if (filterStr) {
    style.filter = [style.filter, filterStr].filter(Boolean).join(" ");
  }

  Object.assign(style, getLineEffectSx(config));

  const lineAnimations = getLineEffectAnimations(config);
  if (lineAnimations.length > 0) {
    const current = style.animation || "";
    style.animation = [current, ...lineAnimations].filter(Boolean).join(", ");
  }

  return style;
}

/**
 * 已删除的死代码：`buildFillStrokeCss` / `removeFillStrokeColors` /
 * `applyFillStrokeWithTracking` 三件套的前提是 `FILL_STROKE_COMPONENTS` 非空，
 * 而该集合**自建立起就是空集**（`new Set<string>([])`）→ 所有分支恒不可达，
 * 却带着一个 `MutationObserver` 常驻监听。随本次口径收口一并移除。
 */
