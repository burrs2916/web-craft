/**
 * 表单标签（form-label）配置的**唯一取值口径**——编辑区渲染器与发布端 codegen 共用。
 *
 * 为什么必须有这个文件：同一批样式字面量写在三处（编辑面板 defaultConfig / 编辑区渲染器 /
 * 发布端 codegen）时必然漂移。form-label 就真实发生过：
 *   - 编辑区走 MUI `Typography` 默认 `body1` → 行高 1.5、字间距 0.15px
 *     （@mui/material/styles/createTypography.js:72）
 *   - 发布端 codegen 写死 `line-height: 1.4375`
 *   → 同一份配置在编辑区与发布页渲染不同。把「默认值与取值口径」收口到这里后，
 *     两端只读同一份结果，结构上不可能再漂移；同时渲染器不再自带任何字面量。
 *
 * 口径说明（与 MUI 设计约定对齐）：
 * - lineHeight 默认 1.4375：MUI `FormLabel` 的既定行高
 *   （@mui/material/FormLabel/FormLabel.js:53 `lineHeight: '1.4375em'`），也是表单族的标签口径；
 *   不再继承 `Typography body1` 的 1.5。
 * - letterSpacing 默认 0 = **不输出该声明**（等价于 CSS `normal`）；同样不再继承 body1 的 0.15px。
 * - text 为空字符串视为「用户主动清空」→ **保持为空**，绝不回退默认文案
 *   （旧渲染器写 `|| "标签"`，导致面板里永远清不空这块文字，且与发布端不一致）。
 * - 星号色默认 #f44336，与表单族其它控件的默认 errorColor 一致。
 */

import type { CssDecls } from "./cssDecls";
import { STAGE_ALIGN_DEFAULT, STAGE_VALIGN_DEFAULT } from "./scaleFit";
import { SHAPE_RADIUS } from "./fieldStyle";

/** 圆角口径：与同族字段控件一致（面板档位 × 主题 shape.borderRadius） */
export { SHAPE_RADIUS };

export interface LabelStyle {
  /** 显示文案（空串=主动清空，保持为空） */
  text: string;
  /** 后缀文字（如「：」），排在必填星号之前；空串=不输出（默认） */
  suffix: string;
  required: boolean;
  textColor: string;
  fontSize: number;
  fontWeight: string;
  /** 文字装饰；`none` 两端一致地省略该声明 */
  textDecoration: "none" | "underline" | "line-through";
  /**
   * 文字（自然尺寸）在**拖动框内**的水平位置 —— 即缩放舞台的 `justify-content` 口径。
   *
   * 刻意不再派生一个 `justify` 字段：内层是 `nowrap` 的收缩盒（宽度=文字宽），
   * 内层自己的 `justify-content` 永远无可见效果，属于空操作；舞台才是唯一有意义的摆放层。
   */
  align: "left" | "center" | "right";
  /** 垂直摆放（缩放舞台的 align-items 口径） */
  vAlign: "top" | "center" | "bottom";
  lineHeight: number;
  /** 单位 px；0 表示不调整（两端都不输出该声明） */
  letterSpacing: number;
  /** 必填星号颜色 */
  errorColor: string;
  /**
   * ── 外观层（内容盒，随内容一起被 transform 缩放）──
   * 让标签可以做「小节标题 / 胶囊标签」，而不只是裸文字。
   */
  bgColor: string;
  paddingX: number;
  paddingY: number;
  /** 圆角档位；输出时 × SHAPE_RADIUS（表单族统一口径） */
  borderRadius: number;
  /** 不透明度（0 合法，故不能用 `||` 兜底） */
  opacity: number;
}

const ALIGNS = ["left", "center", "right"] as const;
const V_ALIGNS = ["top", "center", "bottom"] as const;
const TEXT_DECOS = ["underline", "line-through"] as const;

/** 正数取值：非法/非正数回退默认值（0、NaN、"" 均视为未设置） */
function positive(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** 非负取值：0 是合法值（与 positive 的区别就在这——内边距/圆角可以真的是 0） */
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

export function resolveLabelStyle(c: Record<string, unknown>): LabelStyle {
  const rawAlign = String(c.align ?? STAGE_ALIGN_DEFAULT);
  const align = (ALIGNS as readonly string[]).includes(rawAlign)
    ? (rawAlign as LabelStyle["align"])
    : (STAGE_ALIGN_DEFAULT as LabelStyle["align"]);
  const rawV = String(c.vAlign ?? STAGE_VALIGN_DEFAULT);
  const vAlign = (V_ALIGNS as readonly string[]).includes(rawV)
    ? (rawV as LabelStyle["vAlign"])
    : (STAGE_VALIGN_DEFAULT as LabelStyle["vAlign"]);
  const rawDeco = String(c.textDecoration ?? "");
  const textDecoration: LabelStyle["textDecoration"] = (TEXT_DECOS as readonly string[]).includes(rawDeco)
    ? (rawDeco as LabelStyle["textDecoration"])
    : "none";
  return {
    text: String(c.text ?? "标签"),
    suffix: String(c.suffix ?? ""),
    required: c.required === true,
    textColor: String(c.textColor ?? "") || "#333333",
    fontSize: positive(c.fontSize, 14),
    fontWeight: String(c.fontWeight ?? "").trim() || "normal",
    textDecoration,
    align,
    vAlign,
    lineHeight: positive(c.lineHeight, 1.4375),
    letterSpacing: positive(c.letterSpacing, 0),
    errorColor: String(c.errorColor ?? "") || "#f44336",
    bgColor: String(c.bgColor ?? "").trim(),
    paddingX: nonNeg(c.paddingX, 0),
    paddingY: nonNeg(c.paddingY, 0),
    borderRadius: nonNeg(c.borderRadius, 0),
    opacity: unit(c.opacity, 1),
  };
}

/* ──────────────────────────────────────────────
 * 声明构建函数（编辑区 sx 与发布端 style 读同一份，勿在两端各写一份字面量）
 * ────────────────────────────────────────────── */

/**
 * 文字 `<span>` 的声明。
 * 值一律带单位（`14px` / `1.4375`）——MUI `sx` 与 `cssText()` 都接受这种形态，
 * 于是同一份对象既能被渲染器展开进 sx，也能被发布端序列化进 `style="…"`，
 * 结构上不可能再出现「编辑区 15px、发布端 14px」这类漂移。
 */
export function labelTextCss(s: LabelStyle): CssDecls {
  return {
    color: s.textColor,
    fontSize: `${s.fontSize}px`,
    fontWeight: s.fontWeight,
    lineHeight: String(s.lineHeight),
    // 0 = 不调整间距：两端一致地省略该声明（等价 CSS normal）
    ...(s.letterSpacing > 0 ? { letterSpacing: `${s.letterSpacing}px` } : null),
    // none 是 CSS 初值：两端一致地省略，产物里不出现无意义的 text-decoration:none
    ...(s.textDecoration !== "none" ? { textDecoration: s.textDecoration } : null),
  };
}

/**
 * 缩放内层（= 内容盒）的声明：自然尺寸、不换行（换行会让等比缩放基准随框宽漂移），
 * 外加**外观层**（背景色 / 内边距 / 圆角 / 不透明度）——它们必须挂在被 transform 缩放
 * 的这一层上，才能随着拖动框一起等比放大缩小；挂到外层就等于"框变大、标签框纹丝不动"。
 *
 * 舞台声明仍走 `scaleFit.ts` 的 `scaleStageCss(s.align, s.vAlign)`。
 * 不传 `s` 时只给结构声明（保持历史调用方可用的同时，行为与旧版逐字一致）。
 */
export function labelInnerCss(s?: LabelStyle): CssDecls {
  const base: CssDecls = { display: "flex", alignItems: "center", whiteSpace: "nowrap" };
  if (!s) return base;
  return {
    ...base,
    boxSizing: "border-box",
    ...(s.bgColor ? { backgroundColor: s.bgColor } : null),
    ...(s.paddingX > 0 ? { paddingLeft: `${s.paddingX}px`, paddingRight: `${s.paddingX}px` } : null),
    ...(s.paddingY > 0 ? { paddingTop: `${s.paddingY}px`, paddingBottom: `${s.paddingY}px` } : null),
    // 表单族圆角口径：面板档位 × SHAPE_RADIUS（与 fieldStyle 的 radiusCss 同一约定）
    ...(s.borderRadius > 0 ? { borderRadius: `${s.borderRadius * SHAPE_RADIUS}px` } : null),
    ...(s.opacity < 1 ? { opacity: String(s.opacity) } : null),
  };
}
