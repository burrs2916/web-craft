/**
 * 图标 codegen 管线（纯函数，不依赖 Tauri）
 *
 * 数据流：codegenService 扫描场景收集 custom-{id} 引用 → 后端取 data URL →
 * 以 iconData 注入 CodegenContext → 组件 codegen 通过 renderMenuIcon 消费。
 *
 * 三种图标值：
 * - custom-{id}  → iconData 查 data URL：SVG 内联（currentColor 跟随文字色），位图 <img>
 * - material:xxx → Material 图标本地 SVG path（见 materialIcons.ts，不依赖在线字体）
 * - 其余（emoji / data: / http:）→ 原样输出文本或 <img>
 */

import type { SceneDSL } from "../types/scene";
import { MATERIAL_ICON_PATHS, renderMaterialPathSvg } from "./materialIcons";

/** 扫描场景中所有 custom-{id} 图标引用（含嵌套 config / menuItems JSON） */
export function collectCustomIconIds(scene: SceneDSL): string[] {
  const ids = new Set<string>();
  const re = /custom-[a-zA-Z0-9_-]+/g;
  const scan = (value: unknown) => {
    if (typeof value === "string") {
      for (const m of value.matchAll(re)) ids.add(m[0]);
    } else if (Array.isArray(value)) {
      value.forEach(scan);
    } else if (value && typeof value === "object") {
      Object.values(value).forEach(scan);
    }
  };
  for (const view of scene.views ?? []) {
    for (const comp of view.components ?? []) scan(comp.config);
  }
  for (const comp of scene.globalComponents ?? []) scan(comp.config);
  return [...ids];
}

/* ─── SVG 处理 ─── */

function decodeDataUrl(url: string): string | null {
  const base64 = /^data:[^;]*;base64,(.*)$/s.exec(url);
  if (base64) {
    try {
      const bin = atob(base64[1]);
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    } catch {
      return null;
    }
  }
  const utf8 = /^data:image\/svg\+xml[,;](.*)$/s.exec(url);
  if (utf8) {
    try {
      return decodeURIComponent(utf8[1]);
    } catch {
      return utf8[1];
    }
  }
  return null;
}

/** 剔除 script 标签、on* 事件属性、javascript: 链接 */
function sanitizeSvg(svg: string): string {
  return svg
    .replace(/<script[\s\S]*?<\/script\s*>/gi, "")
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|xlink:href)\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi, "");
}

/** SVG 源码 → 尺寸受控、currentColor 的内联 <svg> */
function inlineSvg(svgStr: string, size: number): string {
  let s = sanitizeSvg(svgStr)
    .replace(/<\?xml[^>]*\?>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
  s = s.replace(/<svg([^>]*?)>/i, (_m, attrs: string) => {
    const cleaned = attrs.replace(/\s(width|height)\s*=\s*("[^"]*"|'[^']*')/gi, "");
    return `<svg${cleaned} style="width:${size}px;height:${size}px;fill:currentColor;flex-shrink:0">`;
  });
  return `<span style="display:inline-flex;align-items:center;justify-content:center;line-height:1">${s}</span>`;
}

/* ─── 统一渲染入口 ─── */

/**
 * 渲染菜单项图标为 HTML 片段。
 * material 图标首次使用时向 ctx 注册字体依赖（去重）。
 * ctx 只需提供 iconData（自定义图标表）；完整 CodegenContext 亦可传入。
 */
export function renderMenuIcon(
  icon: string,
  size: number,
  ctx?: { iconData?: Record<string, string> },
): string {
  if (!icon) return "";

  // 自定义图标库引用
  if (icon.startsWith("custom-")) {
    const dataUrl = ctx?.iconData?.[icon];
    if (!dataUrl) return "";
    if (dataUrl.startsWith("data:image/svg+xml")) {
      const svg = decodeDataUrl(dataUrl);
      return svg ? inlineSvg(svg, size) : "";
    }
    return `<img src="${dataUrl}" alt="" style="width:${size}px;height:${size}px;object-fit:contain;flex-shrink:0">`;
  }

  // Material 图标：本地 SVG path 内联（不依赖在线字体，离线/外网受限也能显示）
  if (icon.startsWith("material:")) {
    const name = icon.slice(9);
    return renderMaterialPathSvg(name, size);
  }

  // 直接 URL / data URL
  if (icon.startsWith("data:") || icon.startsWith("http://") || icon.startsWith("https://")) {
    return `<img src="${icon}" alt="" style="width:${size}px;height:${size}px;object-fit:contain;flex-shrink:0">`;
  }

  if (icon.startsWith("text:")) {
    return iconTextSpan(icon.slice(5), size);
  }
  // 裸图标名（无前缀）：与编辑端 parseIconString 的 material fallback 一致，
  // 先查本地库，未命中也回退到默认图标（widgets）而非显示文字
  if (!/^\p{Emoji}/u.test(icon)) {
    if (MATERIAL_ICON_PATHS[icon]) {
      return renderMaterialPathSvg(icon, size);
    }
    return renderMaterialPathSvg("widgets", size);
  }
  return iconTextSpan(icon, size);
}

function iconTextSpan(text: string, size: number): string {
  return `<span style="font-size:${size}px;line-height:1;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">${text}</span>`;
}

/**
 * 运行时的图标渲染片段（JS 源码，供接口驱动的组件在浏览器里按数据重建图标）。
 *
 * 为什么需要它：编译期的 `renderMenuIcon` 在 Node 侧执行、把 Material 图标内联成 SVG；
 * 接口模式下数据在浏览器里才到，必须有一份**与 renderMenuIcon 行为对齐**的运行时实现。
 *
 * 使用约定（片段假设外层作用域已有 `iconPaths` 与 `esc`）：
 *   - `iconPaths` = `MATERIAL_ICON_PATHS`（编译期用 JSON.stringify 注入）
 *   - 返回的函数名固定为 `renderIcon`，签名 `(icon, size) => string`
 *
 * 与 renderMenuIcon 的唯一差异：`custom-{id}` 无法在运行时解析（data URL 只在编译期由
 * 后端提供），返回空串而不是显示错误内容 —— 与既有 list/carousel 的处理一致。
 */
export const RUNTIME_ICON_RENDERER_JS = `
  function renderIcon(icon, size){
    if (!icon) return "";
    icon = String(icon);
    if (icon.indexOf("custom-") === 0) return "";
    if (/^data:|^https?:\\/\\//i.test(icon)) return '<img src="' + esc(icon) + '" alt="" style="width:' + size + 'px;height:' + size + 'px;object-fit:contain;flex-shrink:0">';
    if (icon.indexOf("text:") === 0) return '<span style="font-size:' + size + 'px;line-height:1;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">' + esc(icon.slice(5)) + '</span>';
    var name = icon.indexOf("material:") === 0 ? icon.slice(9) : icon;
    if (iconPaths[name]) return '<svg viewBox="0 0 24 24" style="width:' + size + 'px;height:' + size + 'px;fill:currentColor;flex-shrink:0" aria-hidden="true">' + iconPaths[name] + '</svg>';
    if (!/^\\p{Emoji}/u.test(name)) return '<svg viewBox="0 0 24 24" style="width:' + size + 'px;height:' + size + 'px;fill:currentColor;flex-shrink:0" aria-hidden="true">' + iconPaths.widgets + '</svg>';
    return '<span style="font-size:' + size + 'px;line-height:1;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">' + esc(name) + '</span>';
  }
  function esc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
`;

/**
 * 运行时把任意形态的接口数据归一成图标条目数组（与 `editor/data/iconStyle.ts`
 * 的 `normalizeIconItems` 同规则：字符串 / 对象 / 对象数组 / 键值对象）。
 */
export const RUNTIME_ICON_ITEMS_JS = `
  function toItems(data){
    if (data == null) return [];
    if (typeof data === "string") {
      var t = data.trim();
      if (!t) return [];
      try { return toItems(JSON.parse(t)); } catch (e) { return [{ icon: "", label: t }]; }
    }
    if (!Array.isArray(data)) {
      if (typeof data === "object") {
        var out = [];
        for (var k in data) { if (Object.prototype.hasOwnProperty.call(data, k)) out.push({ icon: "", label: k, value: String(data[k]) }); }
        return out;
      }
      return [];
    }
    var res = [];
    for (var i = 0; i < data.length; i++) {
      var raw = data[i];
      if (typeof raw === "string") { res.push({ icon: "", label: raw }); continue; }
      if (!raw || typeof raw !== "object") continue;
      var icon = raw.icon != null ? raw.icon : (raw.src != null ? raw.src : (raw.image != null ? raw.image : ""));
      var label = raw.label != null ? raw.label : (raw.title != null ? raw.title : (raw.name != null ? raw.name : (raw.text != null ? raw.text : "")));
      var it = { icon: String(icon || ""), label: String(label || "") };
      if (raw.value != null) it.value = String(raw.value);
      if (raw.color != null) it.color = String(raw.color);
      res.push(it);
    }
    return res;
  }
`;
