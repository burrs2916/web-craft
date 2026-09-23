/**
 * 颜色口径（零依赖纯函数）：解析 / 混入透明度 / 选取可读前景色。
 *
 * 收成一份的原因：
 * 级联弹出框在两端各有一处「悬浮 / 已选 / 键盘光标」高亮，原先都写死「满 accent 底 + 白字」。
 * 一旦 accent 是浅色（如 #ffc107），白字对比度只有 1.6:1 —— 远低于可读下限。
 * 修它需要两件在编辑区（MUI sx）与发布端（CSS 串）都会被调用的事：
 *   1. 给任意颜色混 alpha（悬浮/光标用浅色底，不再铺满 accent）；
 *   2. 在给定底色上判断白字还读不读得清。
 * 按项目铁律「同批字面量必漂移 → 收成纯函数」，两者都放这里，codegen 反向 import。
 *
 * 写法约束：本文件所有函数都用字符串拼接、不用模板字符串，也不出现反引号或美元花括号 ——
 * 便于将来被 toString() 内联进发布端脚本时仍然合法（源码含反引号会让内联产物语法出错）。
 */

export interface RGB {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** 白字在给定底色上达到该对比度即沿用白字（保住品牌色的既定白字语言） */
const MIN_WHITE_CONTRAST = 3;

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

/**
 * 解析颜色为 RGBA。
 * 支持：#rgb / #rgba / #rrggbb / #rrggbbaa / rgb() / rgba()（逗号或空格分隔，通道可带百分号）。
 * 无法解析返回 null —— **绝不**回退成某个"猜的颜色"，把非法值如实交给调用方处置。
 */
export function parseColor(input: unknown): RGB | null {
  const raw = String(input ?? "").trim().toLowerCase();
  if (!raw) return null;

  if (raw.charAt(0) === "#") {
    const hex = raw.slice(1);
    if (/^[0-9a-f]{3}$/.test(hex) || /^[0-9a-f]{4}$/.test(hex)) {
      const r = parseInt(hex.charAt(0) + hex.charAt(0), 16);
      const g = parseInt(hex.charAt(1) + hex.charAt(1), 16);
      const b = parseInt(hex.charAt(2) + hex.charAt(2), 16);
      const a = hex.length === 4 ? parseInt(hex.charAt(3) + hex.charAt(3), 16) / 255 : 1;
      return { r: r, g: g, b: b, a: a };
    }
    if (/^[0-9a-f]{6}$/.test(hex) || /^[0-9a-f]{8}$/.test(hex)) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
      return { r: r, g: g, b: b, a: a };
    }
    return null;
  }

  const m = raw.match(/^rgba?\(([^)]*)\)$/);
  if (!m) return null;
  const parts = m[1].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) return null;

  const channel = (s: string): number => {
    const pct = s.charAt(s.length - 1) === "%";
    const n = Number(pct ? s.slice(0, -1) : s);
    if (!Number.isFinite(n)) return NaN;
    return pct ? Math.round((clamp(n, 0, 100) / 100) * 255) : Math.round(clamp(n, 0, 255));
  };
  const r = channel(parts[0]);
  const g = channel(parts[1]);
  const b = channel(parts[2]);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;

  let a = 1;
  if (parts.length > 3) {
    const s = parts[3];
    const pct = s.charAt(s.length - 1) === "%";
    const n = Number(pct ? s.slice(0, -1) : s);
    if (Number.isFinite(n)) a = pct ? clamp(n / 100, 0, 1) : clamp(n, 0, 1);
  }
  return { r: r, g: g, b: b, a: a };
}

/**
 * 给任意颜色混入透明度（0~1）。
 * - 原色自带 alpha 时按乘法叠加（写 #00000000 不会因为再混一次就变回不透明）；
 * - 解析失败或 alpha 非法时**原样返回输入**，不在颜色这件事上做静默替换。
 */
export function withAlpha(input: unknown, alpha: number): string {
  const raw = String(input ?? "");
  const c = parseColor(input);
  const a = Number(alpha);
  if (!c || !isFinite(a)) return raw;
  const out = Math.round(c.a * clamp(a, 0, 1) * 1000) / 1000;
  return "rgba(" + c.r + ", " + c.g + ", " + c.b + ", " + out + ")";
}

function channelLuminance(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** WCAG 相对亮度（0~1） */
export function relativeLuminance(c: RGB): number {
  return 0.2126 * channelLuminance(c.r) + 0.7152 * channelLuminance(c.g) + 0.0722 * channelLuminance(c.b);
}

/**
 * 在给定底色上返回可读的前景色。
 *
 * 判定：白字对比度 >= 3:1 就沿用白字，否则换深色。
 * 为什么不用「严格取对比度更高的一侧」：MUI 品牌色（#1976d2 4.27:1、#f44336 3.68:1）按严格计算
 * 深色略高，但那会让所有既定白字的高亮块翻转成黑字，视觉语言被无谓改写。
 * 3:1 这条线恰好把「白字真的读不清」的浅色 accent 挑出来（#ffc107 1.6:1、#9e9e9e 2.7:1 → 转深色），
 * 同时保住品牌色。底色无法解析时按白字处理（与历史表现一致）。
 */
export function contrastTextOn(bg: unknown, light = "#ffffff", dark = "rgba(0,0,0,.87)"): string {
  const c = parseColor(bg);
  if (!c) return light;
  const onWhite = 1.05 / (relativeLuminance(c) + 0.05);
  return onWhite >= MIN_WHITE_CONTRAST ? light : dark;
}
