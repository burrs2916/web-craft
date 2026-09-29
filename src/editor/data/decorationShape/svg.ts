/**
 * 发布端字符串化（编辑区不用；仅为 codegen 提供唯一命名口径）
 */

import { cssText } from "../cssDecls";
import type { CssDecls } from "../cssDecls";
import type { DecorDef, DecorPrimitive, DecorPrimTag } from "./types";

/**
 * camelCase 属性名 → SVG 属性名。
 *
 * 绝大多数只差一个连字符，但 `viewBox` / `preserveAspectRatio` / `clipPath` 这类
 * 有专名的必须显式列出（否则会被机械转换毁掉）。
 */
const SVG_ATTR_NAMES: Record<string, string> = {
  className: "class",
  viewBox: "viewBox",
  preserveAspectRatio: "preserveAspectRatio",
  gradientUnits: "gradientUnits",
  gradientTransform: "gradientTransform",
  clipPathUnits: "clipPathUnits",
  clipPath: "clip-path",
  stopColor: "stop-color",
  stopOpacity: "stop-opacity",
  strokeWidth: "stroke-width",
  strokeDasharray: "stroke-dasharray",
  strokeLinejoin: "stroke-linejoin",
  strokeLinecap: "stroke-linecap",
  vectorEffect: "vector-effect",
  markerWidth: "markerWidth",
  markerHeight: "markerHeight",
};

export function svgAttrName(key: string): string {
  if (SVG_ATTR_NAMES[key]) return SVG_ATTR_NAMES[key];
  if (key.startsWith("data-") || key.startsWith("aria-")) return key;
  return key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

function escapeAttrValue(value: string | number): string {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** 属性表 → SVG 属性串（发布端用；排序稳定，便于快照比对） */
export function svgAttrText(attrs: Record<string, string | number>): string {
  return Object.keys(attrs)
    .filter((k) => attrs[k] !== undefined && attrs[k] !== null)
    .map((k) => `${svgAttrName(k)}="${escapeAttrValue(attrs[k])}"`)
    .join(" ");
}

/** 图元 → SVG 字符串（发布端用） */
export function svgPrimitiveText(p: DecorPrimitive): string {
  const css = p.css && Object.keys(p.css).length > 0 ? ` style="${cssText(p.css)}"` : "";
  return `<${p.tag} ${svgAttrText(p.attrs)}${css}/>`;
}

/** 定义（渐变/裁剪） → SVG 字符串（发布端用） */
export function svgDefText(d: DecorDef): string {
  if (d.kind === "clip") {
    const r = d.rect ?? {};
    return `<clipPath id="${escapeAttrValue(d.id)}"><rect ${svgAttrText(r)}/></clipPath>`;
  }
  const stops = (d.stops ?? [])
    .map((s) => `<stop offset="${escapeAttrValue(s.offset)}" stop-color="${escapeAttrValue(s.color)}"${s.opacity === undefined ? "" : ` stop-opacity="${s.opacity}"`}/>`)
    .join("");
  const tag = d.kind === "radial" ? "radialGradient" : "linearGradient";
  return `<${tag} id="${escapeAttrValue(d.id)}" ${svgAttrText(d.attrs)}>${stops}</${tag}>`;
}

/** 图元 → React 元素（编辑区用） */
export function svgPrimitiveProps(p: DecorPrimitive): { tag: DecorPrimTag; attrs: Record<string, string | number>; style?: CssDecls } {
  return { tag: p.tag, attrs: p.attrs, style: p.css && Object.keys(p.css).length > 0 ? p.css : undefined };
}