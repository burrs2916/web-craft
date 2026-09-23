/**
 * 表单「字段型」控件配置的**唯一取值口径**——编辑区渲染器与发布端 codegen 共用。
 *
 * 为什么必须有这个文件（沿用 `labelStyle.ts` 已确立的范式）：
 * 同一批样式字面量一旦写在三处（面板 defaultConfig / 编辑区渲染器 / 发布端 codegen）
 * 就必然漂移——form-label 已真实发生过（编辑器走 MUI body1 行高 1.5、发布端写死 1.4375）。
 * 把「默认值与取值口径」收口到这里后，两端只读同一份结果，结构上不可能再漂移；
 * 渲染器与 codegen 都不再自带任何字面量默认值。
 *
 * 圆角口径（本仓库既定约定，勿改）：
 * 编辑区主题 `shape: { borderRadius: 10 }`（`src/theme/AppTheme.tsx:54`），MUI 的 sx
 * 遇到「数字」圆角会乘以主题值 → 面板里写 4 实际渲染 40px。form-input / form-textarea /
 * form-select 全部按此口径（codegen 侧用 `sxRadius()` 复刻），故本解析器统一输出
 * `radiusCss = 面板值 × 10`，保证表单组件组内所有控件圆角语义一致。
 */

import { parseColor } from "./colorValue";

/** 编辑区 MUI 主题 shape.borderRadius（AppTheme.tsx:54）——sx 数字圆角的乘数 */
export const SHAPE_RADIUS = 10;

/**
 * 下拉/弹出面板的圆角（form-cascader 弹层等）——**与触发器圆角口径解耦**。
 * 依据：MUI 的 Menu/Popover 圆角恒等于主题 shape.borderRadius（10px），不随触发控件的
 * borderRadius 缩放；form-select 编辑区下拉走的也是这个值。曾把触发器的 `radiusCss`
 * （默认 4 × 10 = 40px）直接挂到级联弹层上，大面板 40px 圆角视觉严重失真。
 */
export const POPUP_RADIUS_CSS = "10px";

/** 编辑区固定字体栈（不受画布字体影响，发布端必须显式钉住） */
export const MUI_FONT =
  "'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

/** 未激活/次要文字色（MUI text.secondary 派生的既定值，两端共用） */
export const SECONDARY_TEXT = "#94A3B8";
/** 悬浮标签聚焦色（MUI primary.main 派生） */
export const FOCUS_LABEL_COLOR = "#60A5FA";
/** 帮助文字默认色 */
export const HELPER_COLOR = "#8a8f98";

export type FieldPlacement = "inside" | "top" | "none";

export interface FieldStyle {
  // ── 内容 ──
  /** 标签文案（空串=主动清空，保持为空） */
  label: string;
  /** 标签文案 + 必填星号（两端同一份拼接口径） */
  labelText: string;
  placeholder: string;
  placement: FieldPlacement;
  /** 内置悬浮标签（徽章贴边框左上沿） */
  hasFloat: boolean;
  /** 外部上方标签 */
  hasTop: boolean;
  required: boolean;
  disabled: boolean;
  helperText: string;

  // ── 颜色 ──
  bgColor: string;
  textColor: string;
  borderColor: string;
  borderWidth: number;
  focusBorderColor: string;
  errorColor: string;
  /** 帮助文字色：优先跟随自定义标签色，否则用次要文字色 */
  helperColor: string;

  // ── 几何 ──
  /** 面板里的圆角数值（原样） */
  radius: number;
  /** 可直接写进 CSS 的圆角（面板值 × SHAPE_RADIUS） */
  radiusCss: string;
  fontSize: number;
  fontWeight: string;

  // ── 标签 ──
  /** 标签文字色（labelColor 留空则跟随控件文字色） */
  labelColor: string;
  /** 标签字号（留空/0 则跟随控件字号） */
  labelFontSize: number;
  /** 悬浮标签底色（留空则跟随控件背景色，形成无缝缺口） */
  labelBgColor: string;
  labelRadius: number;
  /** 外部上方标签与控件之间的间距 */
  labelGap: number;
}

/** 非负取值：非法/负数回退默认值（0 合法） */
function nonNeg(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** 正数取值：非法/非正数回退默认值（0、NaN、"" 均视为未设置） */
function positive(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** 颜色/文本取值：空串视作未设置 → 回退默认 */
function str(v: unknown, fallback = ""): string {
  const s = String(v ?? "").trim();
  return s || fallback;
}

/**
 * 按背景色明度推断 `color-scheme`（编辑区与发布端共用同一判定）。
 * 原生 date/time 控件的日历/时钟指示图标由浏览器按 color-scheme 绘制：
 * 深色底若不声明 dark，会得到「黑图标压黑底」而完全不可见。
 *
 * hex 解析统一走 `parseColor`（不在这里再写一份）：本函数历史约定接受不带 `#` 的裸 hex（如 "333"），
 * 故补上前缀后再交给口径函数。明度阈值仍是原来的 `0.299r+0.587g+0.114b < 140`，判定结果不变。
 */
export function colorSchemeOf(bgColor: string): "light" | "dark" {
  const raw = String(bgColor ?? "").trim();
  const c = parseColor(raw.charAt(0) === "#" ? raw : "#" + raw);
  if (!c) return "light";
  return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b < 140 ? "dark" : "light";
}

const PLACEMENTS: readonly FieldPlacement[] = ["inside", "top", "none"];

/**
 * 解析表单字段型控件的样式口径。
 * 所有字段都做了「未设置 → 默认值」的归一，调用方**不得**再写任何默认字面量。
 */
export function resolveFieldStyle(
  c: Record<string, unknown>,
  defaults?: Partial<{ bgColor: string; borderColor: string; radius: number; placement: FieldPlacement }>,
): FieldStyle {
  const rawPlacement = String(c.labelPlacement ?? defaults?.placement ?? "inside");
  const placement = (PLACEMENTS as readonly string[]).includes(rawPlacement)
    ? (rawPlacement as FieldPlacement)
    : "inside";

  const label = String(c.label ?? "");
  const required = c.required === true;
  const bgColor = str(c.bgColor, defaults?.bgColor ?? "#ffffff");
  const textColor = str(c.textColor, "#333333");
  const radius = nonNeg(c.borderRadius, defaults?.radius ?? 4);

  return {
    label,
    // 星号口径：与编辑区 `${label} *` / 发布端 `reqTail` 一致，仅一处拼接
    labelText: required && label ? `${label} *` : label,
    placeholder: String(c.placeholder ?? ""),
    placement,
    hasFloat: placement === "inside" && !!label,
    hasTop: placement === "top" && !!label,
    required,
    disabled: c.disabled === true,
    helperText: String(c.helperText ?? "").trim(),

    bgColor,
    textColor,
    borderColor: str(c.borderColor, defaults?.borderColor ?? "#d0d0d8"),
    borderWidth: positive(c.borderWidth, 1),
    focusBorderColor: str(c.focusBorderColor, "#1976d2"),
    errorColor: str(c.errorColor, "#f44336"),
    helperColor: str(c.labelColor, HELPER_COLOR),

    radius,
    radiusCss: `${radius * SHAPE_RADIUS}px`,
    fontSize: positive(c.fontSize, 14),
    fontWeight: str(c.fontWeight, "normal"),

    labelColor: str(c.labelColor, textColor),
    labelFontSize: positive(c.labelFontSize, positive(c.fontSize, 14)),
    labelBgColor: str(c.labelBgColor, bgColor),
    labelRadius: nonNeg(c.labelRadius, 4),
    labelGap: nonNeg(c.labelGap, 4),
  };
}
