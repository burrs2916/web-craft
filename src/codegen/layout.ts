import type { SceneComponent, Transform } from "../types/editor";
import type { CanvasBackground } from "../types/editor";
import type { BackgroundStyle } from "./types";

/**
 * 将 transform 转为绝对定位 CSS 字符串
 *
 * 策略 A：直接输出 position:absolute + left/top/width/height + rotation + scale
 * 1:1 还原画布效果
 */
export function transformToAbsoluteCSS(tf: Transform): string {
  const parts: string[] = [
    "position: absolute",
    `left: ${tf.x}px`,
    `top: ${tf.y}px`,
    `width: ${tf.width}px`,
    `height: ${tf.height}px`,
  ];

  if (tf.rotation !== 0) {
    parts.push(`transform: rotate(${tf.rotation}deg)`);
  }

  if (tf.scale.x !== 1 || tf.scale.y !== 1) {
    const scaleStr = `scale(${tf.scale.x}, ${tf.scale.y})`;
    const existing = parts.find((p) => p.startsWith("transform:"));
    if (existing) {
      const idx = parts.indexOf(existing);
      parts[idx] = `transform: ${scaleStr} ${existing.replace("transform:", "").trim()}`;
    } else {
      parts.push(`transform: ${scaleStr}`);
    }
  }

  return parts.join("; ");
}

/**
 * 将组件的 style 字段转为 CSS 字符串
 * style 是 Record<string, unknown>，支持 CSS 属性
 */
export function styleRecordToCSS(
  style: Record<string, unknown> | undefined,
): string {
  if (!style) return "";
  const parts: string[] = [];
  for (const [key, value] of Object.entries(style)) {
    if (value == null || value === "") continue;
    const cssKey = camelToKebab(key);
    parts.push(`${cssKey}: ${formatCSSValue(key, value)}`);
  }
  return parts.join("; ");
}

/**
 * 将组件的 zIndex 转为 CSS
 */
export function zIndexCSS(component: SceneComponent): string {
  if (component.zIndex === 0) return "";
  return `z-index: ${component.zIndex}`;
}

/**
 * 生成完整的组件定位 + 样式包装
 * 返回外层 div 的 style 属性值
 */
export function componentWrapperStyle(
  component: SceneComponent,
  extraCSS?: string,
): string {
  const parts: string[] = [
    transformToAbsoluteCSS(component.transform),
  ];

  const z = zIndexCSS(component);
  if (z) parts.push(z);

  if (!component.visible) parts.push("display: none");

  // 图层模式外层为 pointer-events:none（空区域点击穿透下层），
  // 组件包装必须重开 auto，否则整层所有交互（点击/悬停）都被禁用。
  parts.push("pointer-events: auto");

  if (component.style) {
    const s = styleRecordToCSS(component.style);
    if (s) parts.push(s);
  }

  if (extraCSS) parts.push(extraCSS);

  return parts.join("; ");
}

/**
 * 生成画布背景 CSS + 可选 HTML
 */
export function canvasBackgroundToStyle(bg: CanvasBackground): BackgroundStyle {
  const parts: string[] = [];

  switch (bg.type) {
    case "solid":
      parts.push(`background-color: ${bg.color}`);
      break;

    case "gradient": {
      const dir = bg.gradient.direction;
      if (dir === "radial") {
        parts.push(`background: radial-gradient(${bg.gradient.colors[0]}, ${bg.gradient.colors[1]})`);
      } else {
        const dirCSS = gradientDirectionToCSS(dir);
        parts.push(`background: linear-gradient(${dirCSS}, ${bg.gradient.colors[0]}, ${bg.gradient.colors[1]})`);
      }
      break;
    }

    case "image":
      if (bg.imageUrl) {
        parts.push(`background-image: url(${bg.imageUrl})`);
        parts.push(`background-size: ${bg.imageFit}`);
        parts.push("background-position: center");
        parts.push("background-repeat: no-repeat");
      }
      break;

    case "video":
      if (bg.videoUrl) {
        return {
          css: "position: relative; overflow: hidden",
          html: `<video autoplay=${bg.videoAutoplay ? "autoplay" : ""} ${bg.videoMuted ? "muted" : ""} ${bg.videoLoop ? "loop" : ""} playsinline style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;pointer-events:none"><source src="${bg.videoUrl}"></video>`,
        };
      }
      break;
  }

  return { css: parts.join("; ") };
}

/**
 * 渐变方向转 CSS
 */
function gradientDirectionToCSS(dir: string): string {
  const map: Record<string, string> = {
    "to-right": "to right",
    "to-left": "to left",
    "to-bottom": "to bottom",
    "to-top": "to top",
    "to-bottom-right": "to bottom right",
    "to-bottom-left": "to bottom left",
    "to-top-right": "to top right",
    "to-top-left": "to top left",
    "radial": "radial",
  };
  return map[dir] || "to bottom";
}

/**
 * camelCase → kebab-case
 */
function camelToKebab(s: string): string {
  return s.replace(/([A-Z])/g, "-$1").toLowerCase();
}

/**
 * 格式化 CSS 值（处理特殊字段）
 */
function formatCSSValue(key: string, value: unknown): string {
  const str = String(value);
  if (typeof value === "number" && !isUnitlessProperty(key)) {
    return `${str}px`;
  }
  return str;
}

/**
 * 不需要单位的 CSS 属性
 */
function isUnitlessProperty(key: string): boolean {
  const unitless = [
    "zIndex", "opacity", "fontWeight", "lineHeight",
    "flexGrow", "flexShrink", "order",
  ];
  return unitless.includes(key);
}

/**
 * HTML 转义
 */
/**
 * 预览窗口 Tauri IPC 拦截脚本 — 在 <head> 最早期注入
 * 
 * Tauri v2 在 webview 创建时注入 IPC 初始化脚本（先于 HTML 解析），
 * notification 插件可能在此时自动调用 is_permission_granted，
 * 而 ACL 在 Rust 侧拒绝该调用，产生 Unhandled Promise Rejection。
 * 
 * 本脚本通过 Object.defineProperty 拦截 window.__TAURI_INTERNALS__ 的赋值，
 * 在 Tauri 设置该对象时包裹 invoke 函数，从源头阻断 notification 相关 IPC 调用，
 * 返回 Promise.resolve 而非 reject，不产生未捕获的 rejection。
 */
export const REJECTION_GUARD_SCRIPT = `<script>(function(){var _t;if(window.__TAURI_INTERNALS__){_t=window.__TAURI_INTERNALS__;if(_t&&_t.invoke){var oi=_t.invoke;_t.invoke=function(c){if(typeof c==='string'&&c.indexOf('notification')>=0){return Promise.resolve('{"granted":false}')};return oi.apply(_t,arguments)}}}else{Object.defineProperty(window,'__TAURI_INTERNALS__',{get:function(){return _t},set:function(v){_t=v;if(v&&v.invoke){var oi=v.invoke;v.invoke=function(c){if(typeof c==='string'&&c.indexOf('notification')>=0){return Promise.resolve('{"granted":false}')};return oi.apply(v,arguments)}}Object.defineProperty(window,'__TAURI_INTERNALS__',{value:v,writable:true,configurable:true,enumerable:true})},configurable:true,enumerable:true})}window.addEventListener('unhandledrejection',function(e){var m='';try{m=e.reason&&(e.reason.message||String(e.reason))||''}catch(_){}if(m.indexOf('notification')>=0||m.indexOf('is_permission_granted')>=0){e.preventDefault()}})})();</script>`;

export function escapeHTML(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * 把字符串编码为可直接内联进 <script> 的 JS 字符串字面量。
 *
 * 与 escapeHTML 不同（后者用于 HTML 属性/文本上下文，会把引号转成 &quot;，
 * 在 <script> 里不会解码、会破坏 JS），内联脚本里的字符串必须保持 JSON 引号，
 * 只需把 < 转义为 \u003c 防止 </script> 提前闭合。&、>、' 保留即可。
 */
export function toJsString(str: string): string {
  return JSON.stringify(str).replace(/</g, "\\u003c");
}

/**
 * 生成唯一 ID（用于 codegen 中的 DOM 元素）
 */
let idCounter = 0;
export function genId(prefix: string = "el"): string {
  idCounter++;
  return `${prefix}-${idCounter}`;
}

/**
 * 将脚本数组安全拼接进同一个 <script> 块。
 * 每个脚本补齐收尾分号，避免相邻 IIFE "})()\n(function(){" 被 ASI
 * 解析成链式调用（A()(function(){})）而报 "is not a function"。
 */
export function joinScripts(scripts: string[]): string {
  return scripts.map((s) => s.trim().replace(/;+\s*$/, "") + ";").join("\n");
}
