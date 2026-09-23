/**
 * 「开关 / 复选框」这一族的**唯一取值口径** —— 编辑区渲染器与发布端 codegen 共用。
 *
 * 为什么必须有：
 * 这两个组件的结构完全同形（隐藏 input + 自绘控件 + 标签文字 + 错误/帮助文字，
 * 外套「外形 → 缩放舞台 → 缩放内层」三层骨架），此前样式字面量分散在三处
 * （面板 defaultConfig / 编辑区渲染器 / 发布端 codegen），任何一处加字段都要手抄两遍。
 * 本文件把「外观层 + 标签排版」收成一份声明对象：
 *
 *   - 编辑区：`toggleShellCss()` 展开进 MUI `sx`
 *   - 发布端：`cssText(...)` 拼进 `style="…"`
 *
 * 两端读同一个函数，结构上不可能再漂移（与 `labelStyle.ts` / `sliderStyle.ts` 同一范式）。
 *
 * ── 外观层为什么挂在「缩放内层」 ──
 * 底色 / 边框 / 内边距 / 圆角 / 不透明度必须落在被 `transform:scale()` 缩放的那一层，
 * 才会跟着拖动框一起等比放大缩小。挂在最外层（铺满拖动框的那层）会变成「框变而底色不动」。
 *
 * ── 默认值护栏 ──
 * 本文件刻意**不引入会改变默认观感的字段**（如"标签与控件间距"）：MUI Switch / Checkbox
 * 自带内距，再加一层 gap 会让所有既有场景的间距变样，属于无谓回归。新增字段一律
 * 满足「未配置时产物与历史逐字相同」。
 */

import { type CssDecls, clampNum, num, str } from "./cssDecls";
import { SHAPE_RADIUS } from "./fieldStyle";

/** 开关 / 复选框共用的外壳与排版取值 */
export interface ToggleShellStyle {
  /** 底色；空串 = 透明（默认，与历史产物一致） */
  bgColor: string;
  /** 边框色；空串 = 无边框（默认） */
  borderColor: string;
  borderWidth: number;
  /** 面板里的圆角数值（原样，供面板回显） */
  radius: number;
  /** 可直接写进 CSS 的圆角（面板值 × SHAPE_RADIUS，与表单组其他组件同一口径） */
  radiusCss: string;
  paddingX: number;
  paddingY: number;
  opacity: number;
  /** 标签文字字重（数字，直接写进 CSS；默认 400 = CSS `normal`，与历史观感一致） */
  fontWeight: number;
}

/**
 * 面板圆角默认值。
 *
 * 刻意取 0（直角）而不是字段型控件的 4：本族**默认没有底色也没有边框**，
 * 圆角在无底色时根本不可见 —— 若默认给 40px 就等于往产物里塞一条永远看不见的声明。
 * 面板 help 已写明「设置底色或边框后可见」，用户配了底色再调圆角即可生效。
 */
export const TOGGLE_RADIUS_DEFAULT = 0;
/** 标签字重默认值（= CSS `normal`，历史产物继承的即此值） */
export const TOGGLE_FONT_WEIGHT_DEFAULT = 400;

/** 字重选项（面板与产物共用同一张表，避免出现表里没有的值） */
export const TOGGLE_FONT_WEIGHT_OPTIONS: Array<{ label: string; value: number }> = [
  { label: "常规", value: 400 },
  { label: "中等", value: 500 },
  { label: "半粗", value: 600 },
  { label: "加粗", value: 700 },
];

/**
 * 解析开关 / 复选框的外壳与排版口径。
 * 所有字段都做「未设置 → 默认值」归一，调用方**不得**再写任何默认字面量。
 */
export function resolveToggleShell(c: Record<string, unknown>): ToggleShellStyle {
  const radius = clampNum(c.borderRadius, TOGGLE_RADIUS_DEFAULT, 0, 24);
  const rawOpacity = num(c.opacity, 1);
  const rawWeight = num(c.fontWeight, TOGGLE_FONT_WEIGHT_DEFAULT);
  return {
    bgColor: str(c.bgColor, ""),
    borderColor: str(c.borderColor, ""),
    borderWidth: clampNum(c.borderWidth, 1, 0, 12),
    radius,
    radiusCss: `${radius * SHAPE_RADIUS}px`,
    paddingX: clampNum(c.paddingX, 0, 0, 80),
    paddingY: clampNum(c.paddingY, 0, 0, 80),
    // 不透明度：0 是合法值（完全透明），只在越界时兜底 → 用 clampNum 会吞掉 0 的语义差异，故单独判
    opacity: rawOpacity >= 0 && rawOpacity <= 1 ? rawOpacity : 1,
    fontWeight: TOGGLE_FONT_WEIGHT_OPTIONS.some((o) => o.value === rawWeight)
      ? rawWeight
      : TOGGLE_FONT_WEIGHT_DEFAULT,
  };
}

/**
 * 外壳（缩放内层）的样式声明。
 *
 * 只输出**用户显式配置过**的声明：默认状态下返回空对象，产物与历史逐字一致
 * （不写 `background:transparent` 这类"看起来等价"的声明，避免多余 diff 与
 * 「面板没配过却多出一条声明」的困惑）。
 */
export function toggleShellCss(s: ToggleShellStyle): CssDecls {
  const out: CssDecls = {};
  if (s.bgColor) out.background = s.bgColor;
  if (s.borderColor && s.borderWidth > 0) out.border = `${s.borderWidth}px solid ${s.borderColor}`;
  if (s.paddingX > 0 || s.paddingY > 0) out.padding = `${s.paddingY}px ${s.paddingX}px`;
  if (s.radius > 0) out.borderRadius = s.radiusCss;
  if (s.opacity !== 1) out.opacity = String(s.opacity);
  return out;
}

/** 标签字重声明：默认（400 = CSS `normal`）不输出，保证默认产物与历史逐字一致 */
export function toggleLabelTextCss(s: ToggleShellStyle): CssDecls {
  return s.fontWeight === TOGGLE_FONT_WEIGHT_DEFAULT ? {} : { fontWeight: String(s.fontWeight) };
}

/* ──────────────────────────────────────────────
 * 开关专属
 * ────────────────────────────────────────────── */

/** 开关轨道/滑块的配色与透明度（默认值 = MUI Switch 实测观感，与历史产物逐字一致） */
export interface SwitchSkin {
  /** 关闭态轨道色 */
  trackOffColor: string;
  /** 关闭态轨道不透明度 */
  trackOffOpacity: number;
  /** 开启态轨道不透明度（轨道色恒为强调色） */
  trackOnOpacity: number;
  /** 关闭态滑块色（开启态滑块色恒为强调色） */
  thumbOffColor: string;
}

export const SWITCH_TRACK_OFF_COLOR = "#ffffff";
export const SWITCH_TRACK_OFF_OPACITY = 0.3;
export const SWITCH_TRACK_ON_OPACITY = 0.5;
export const SWITCH_THUMB_OFF_COLOR = "#E0E0E0";

export function resolveSwitchSkin(c: Record<string, unknown>): SwitchSkin {
  const clamp01 = (v: unknown, fallback: number) => {
    const n = num(v, fallback);
    return n >= 0 && n <= 1 ? n : fallback;
  };
  return {
    trackOffColor: str(c.trackOffColor, SWITCH_TRACK_OFF_COLOR),
    trackOffOpacity: clamp01(c.trackOffOpacity, SWITCH_TRACK_OFF_OPACITY),
    trackOnOpacity: clamp01(c.trackOnOpacity, SWITCH_TRACK_ON_OPACITY),
    thumbOffColor: str(c.thumbOffColor, SWITCH_THUMB_OFF_COLOR),
  };
}

/* ──────────────────────────────────────────────
 * 复选框专属
 * ────────────────────────────────────────────── */

/**
 * 复选框未选中态颜色。默认跟随强调色（MUI 观感：未选中边框与选中底色同色），
 * 留空即回退强调色 —— 因此"未配置"与历史产物完全一致。
 */
export function resolveCheckboxUncheckedColor(c: Record<string, unknown>, accent: string): string {
  return str(c.uncheckedColor, accent);
}
