/**
 * 评分（form-rate）配置的**唯一取值口径** —— 编辑区渲染器与发布端 codegen 共用。
 *
 * ── 为什么必须有这个文件 ──
 * 改造前，两张核心表（图标路径 `ICON_PATHS`、尺寸档位 `SIZE_MAP`、分值文案 `TEXT_MAP`）
 * 在 `renderers/RateRenderer.tsx` 与 `codegen/components/rate.ts` 里**各写了一份**，
 * 靠注释「与发布端同一张表」维持一致 —— 这正是本仓库反复翻车的「同批字面量写多份必然漂移」
 * 形态：谁改了一边，另一端只在运行时才会显形。现在两端只 import 本文件。
 *
 * ── 与表单族的横切约定 ──
 * 1. 舞台摆放走 `scaleFit.ts` 的 `stageAlignOf` / `stageVAlignOf`（默认 center），
 *    不再自写 `alignMap` + `?? "left"`——那会让评分成为表单组里唯一默认靠左的控件。
 * 2. 等比缩放基准 `RATE_FIT` 恒等于注册表 `defaultSize`（220×40），与
 *    label/checkbox/radio/switch/segmented/button 同一约定（拖进来即 1 倍）。
 * 3. 外观层（底色/内边距/圆角/不透明度）挂在**缩放内层**上，因此随内容一起被缩放，
 *    与 `labelStyle.labelInnerCss` 结构同构。
 * 4. **发布端运行时的动态重算**（改分后的文案、写回隐藏域的值）读本文件的
 *    `rateTextCore` / `rateSubmitValue` —— 以 `toString()` 内联进脚本，而不是在脚本里再抄一份规则。
 */

import type { CssDecls } from "./cssDecls";
import { SHAPE_RADIUS } from "./fieldStyle";
import { STAGE_ALIGN_DEFAULT, STAGE_VALIGN_DEFAULT } from "./scaleFit";

/** 评分图标（Material Icons 原路径，勿改；编辑区与发布端共用这一张表） */
export const RATE_ICON_PATHS: Record<string, string> = {
  star: "M12 2l2.95 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l7.05-1.01z",
  heart: "M12 21.35l-1.45-1.32C5.4 16.36 2 13.28 2 9.5 2 6.42 4.42 4 7.5 4c1.74 0 3.41.81 4.5 2.09C13.09 4.81 14.76 4 16.5 4 19.58 4 22 6.42 22 9.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z",
  // Material Icons `thumb_up`（filled）官方路径：袖口 4×12、手形起点 y=9。
  // 旧值袖口仅 2 宽且左缘内缩 1px（渲染对比肉眼可见更细），与同一张表里的星/心不同源。
  like: "M1 21h4V9H1v6zM23 10c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.58 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z",
};

/** 面板「图标」下拉的选项（与上面这张表同源，避免出现选得到却无路径的取值） */
export const RATE_ICON_OPTIONS = [
  { label: "星形", value: "star" },
  { label: "心形", value: "heart" },
  { label: "点赞", value: "like" },
];

/** 尺寸档位 → 图标边长（编辑区与发布端共用这一张表） */
export const RATE_SIZE_MAP: Record<string, number> = { small: 16, medium: 22, large: 28 };

/** 面板「尺寸」下拉的选项（同上，与尺寸表同源） */
export const RATE_SIZE_OPTIONS = [
  { label: "小", value: "small" },
  { label: "中", value: "medium" },
  { label: "大", value: "large" },
];

/** 分值 → 文案（编辑区与发布端共用这一张表） */
export const RATE_TEXT_MAP: Record<number, string> = {
  1: "很差",
  2: "不满意",
  3: "一般",
  4: "满意",
  5: "很满意",
};

/**
 * 分值 → 文案的**自包含实现**：只依赖入参，不引用任何模块作用域标识符。
 *
 * 为什么单独抽这一层：发布端运行时脚本必须按分值实时重算文案，而脚本本身是字符串 ——
 * 改造前它把这条规则**又抄了一遍**（`txt.textContent = textMap[Math.ceil(d)] || d+' 分'`），
 * 正是本仓库反复踩的「同一条规则写两份必然漂移」。现在把本函数 `toString()` 内联进脚本，
 * 规则只有这一份（分值表作为参数传入，避免连表也复制一份）。
 * 自包含性由 `segmented-rate.test.ts` 用 `new Function` 脱离模块求值守护。
 */
export function rateTextCore(textMap: Record<number, string>, allowHalf: boolean, displayValue: number): string {
  if (allowHalf && displayValue % 1 !== 0) return String(displayValue) + " 分";
  return textMap[Math.ceil(displayValue)] || String(displayValue) + " 分";
}

/**
 * 分值 → 显示文案（编辑区与发布端初始 HTML 共用）。
 * 半星且为非整数时优先给 `n 分`，否则按向上取整查文案表，查不到再用 `n 分` 兜底。
 */
export function rateTextOf(displayValue: number, allowHalf = false): string {
  return rateTextCore(RATE_TEXT_MAP, allowHalf, displayValue);
}

/**
 * 表单**提交值**：0 分 = 未评分 → 交空串。
 *
 * 与编辑区校验（`displayValue > 0 ? … : ""`）和面板 help「必填 = 必须给出评分（0 分视为未评分）」
 * 同一语义 —— 改造前发布端恒写 `value="0"`，被 `__WCVALIDATE` 判为「非空」而放行，
 * 于是「预览里 0 分报必填错、发布页 0 分提交成功」两端相反。
 * 自包含（可 `toString()` 内联进发布端脚本），是两端唯一实现。
 */
export function rateSubmitValue(value: number): string {
  return value > 0 ? String(value) : "";
}

export type RateSize = "small" | "medium" | "large";
export type RateAlign = "left" | "center" | "right";
export type RateVAlign = "top" | "center" | "bottom";

export interface RateStyle {
  /** 默认/当前分值（0 合法 = 未评分，不能用 `||` 兜底；已夹取到 [0, max]） */
  value: number;
  /** 最大星数（≥1） */
  max: number;
  allowHalf: boolean;
  showText: boolean;
  /** 归一后的图标键（落在表外时取 `star`） */
  icon: string;
  /** 图标 svg path */
  path: string;
  size: RateSize;
  /** 自然尺寸下的图标边长（customSize 优先） */
  baseSize: number;
  gap: number;
  color: string;
  inactiveColor: string;
  fontSize: number;
  textColor: string;
  disabled: boolean;
  align: RateAlign;
  vAlign: RateVAlign;
  /** ── 外观层（挂在缩放内层，随内容一起等比缩放）── */
  bgColor: string;
  paddingX: number;
  paddingY: number;
  /** 圆角档位；输出时 × SHAPE_RADIUS（表单族统一口径） */
  borderRadius: number;
  /** 不透明度（0 合法） */
  opacity: number;
}

const ALIGNS = ["left", "center", "right"] as const;
const V_ALIGNS = ["top", "center", "bottom"] as const;
const SIZES = ["small", "medium", "large"] as const;

/** 非负数取值：0 合法（内边距/圆角可以真的是 0） */
function nonNeg(v: unknown, fallback: number): number {
  if (v === "" || v === null || v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** 0~1 取值：0 合法（全透明），越界夹紧 */
function unit(v: unknown, fallback: number): number {
  if (v === "" || v === null || v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;
}

export function resolveRateStyle(c: Record<string, unknown>): RateStyle {
  const rawAlign = String(c.align ?? STAGE_ALIGN_DEFAULT);
  const align = (ALIGNS as readonly string[]).includes(rawAlign)
    ? (rawAlign as RateAlign)
    : (STAGE_ALIGN_DEFAULT as RateAlign);
  const rawV = String(c.vAlign ?? STAGE_VALIGN_DEFAULT);
  const vAlign = (V_ALIGNS as readonly string[]).includes(rawV)
    ? (rawV as RateVAlign)
    : (STAGE_VALIGN_DEFAULT as RateVAlign);
  const rawSize = String(c.size ?? "medium");
  const size: RateSize = (SIZES as readonly string[]).includes(rawSize)
    ? (rawSize as RateSize)
    : "medium";

  const rawIcon = String(c.icon ?? "star");
  const icon = RATE_ICON_PATHS[rawIcon] ? rawIcon : "star";
  const customSize = nonNeg(c.customSize, 0);

  // 星数先算出来：分值必须夹在 [0, max] 内 —— 面板 `value` 允许 0–10、`max` 允许 1–10，
  // 两者没有联动，于是 `value:8 / max:5` 这种组合随手可得：全亮 5 颗星、文案却写「8 分」、
  // 提交值也是 8。夹取放在口径里，两端（含运行时写值）自动一致。
  const max = Math.max(1, Math.floor(nonNeg(c.max, 5)) || 5);
  const rawValue = nonNeg(c.value, 3);

  return {
    // 0 是合法分值（未评分），故不能用 `|| 默认值`
    value: Math.min(max, rawValue),
    max,
    allowHalf: c.allowHalf === true,
    showText: c.showText === true,
    icon,
    path: RATE_ICON_PATHS[icon],
    size,
    baseSize: customSize > 0 ? customSize : RATE_SIZE_MAP[size],
    gap: nonNeg(c.gap, 4),
    color: String(c.color ?? "").trim() || "#FF9800",
    inactiveColor: String(c.inactiveColor ?? "").trim() || "rgba(148,163,184,0.45)",
    fontSize: nonNeg(c.fontSize, 13) || 13,
    textColor: String(c.textColor ?? "").trim() || "#94A3B8",
    disabled: c.disabled === true,
    align,
    vAlign,
    bgColor: String(c.bgColor ?? "").trim(),
    paddingX: nonNeg(c.paddingX, 0),
    paddingY: nonNeg(c.paddingY, 0),
    borderRadius: nonNeg(c.borderRadius, 0),
    opacity: unit(c.opacity, 1),
  };
}

/* ──────────────────────────────────────────────
 * 声明构建函数（编辑区 sx 与发布端 style 读同一份）
 * ────────────────────────────────────────────── */

/**
 * 缩放内层（= 内容盒）的声明：自然尺寸、两端一致，外加**外观层**。
 *
 * 外观层必须挂在被 `transform: scale()` 缩放的这一层上：挂到外层等于「拖动框放大、
 * 底色纹丝不动」。与 `labelStyle.labelInnerCss` 同一约定。
 */
export function rateInnerCss(s: RateStyle): CssDecls {
  // 只读态整体压暗：与面板不透明度**相乘**后一次性给出，避免"类规则写 opacity、
  // 同时 inline 也写 opacity"这种同类属性两处来源（inline 恒压死类规则）。
  const opacity = s.disabled ? s.opacity * 0.5 : s.opacity;
  return {
    display: "flex",
    alignItems: "center",
    // 星间距按**自然值**给：内层整体被 transform 缩放，间距自动跟着走，
    // 两端都不需要再乘一遍系数（乘数写漏一处就是两端不一致）。
    gap: `${s.gap}px`,
    boxSizing: "border-box",
    ...(s.bgColor ? { backgroundColor: s.bgColor } : null),
    ...(s.paddingX > 0 ? { paddingLeft: `${s.paddingX}px`, paddingRight: `${s.paddingX}px` } : null),
    ...(s.paddingY > 0 ? { paddingTop: `${s.paddingY}px`, paddingBottom: `${s.paddingY}px` } : null),
    // 表单族圆角口径：面板档位 × SHAPE_RADIUS（与 fieldStyle 的 radiusCss 同一约定）
    ...(s.borderRadius > 0 ? { borderRadius: `${s.borderRadius * SHAPE_RADIUS}px` } : null),
    ...(opacity < 1 ? { opacity: String(opacity) } : null),
  };
}

/** 分值文案 `<span>` 的声明（两端同一份） */
export function rateTextCss(s: RateStyle): CssDecls {
  return {
    fontSize: `${s.fontSize}px`,
    color: s.textColor,
    marginLeft: "8px",
    whiteSpace: "nowrap",
    userSelect: "none",
  };
}
