/**
 * 描边口径：颜色 / 粗细 / 虚线节奏 / 端点 / 转折，以及对应的面板选项清单。
 *
 * 线型选项（面板 select 的**唯一来源**）
 *
 * 背景：`borderStyle` 的 4 行选项数组在 8 个注册里各抄一遍、`lineStyle` 的 3 行在 6 个注册里
 * 各抄一遍（共 14 份）。抄写副本的必然结局是漂移：给其中 3 个加上「点划线」而另外几个漏掉，
 * 用户看到"同样是边框样式，A 形状有 4 档、B 形状只有 3 档"。现收成一份常量，
 * 并在 `decor-options.test.ts` 里锁死「选项值集合 ⊇ 几何真正识别的集合」。
 */

import { num, str } from "../cssDecls";
import type { DecorStroke } from "./types";

/**
 * 描边口径（矩形/圆/椭圆/三角/多边形/星/菱形 共用）。
 * `borderStyle: "none"` 与 `strokeWidth <= 0` 都视为不描边。
 */
export function resolveDecorStroke(config: Record<string, unknown>, fallback: { stroke?: string; width?: number } = {}): DecorStroke {
  const stroke = str(config.stroke) || fallback.stroke || "#2196F3";
  const strokeWidth = num(config.strokeWidth, fallback.width ?? 2);
  const borderStyle = str(config.borderStyle) || "solid";
  const hasStroke = strokeWidth > 0 && borderStyle !== "none";
  /* 节奏只此一份：本函数此前自带一张 `dashed→8 4 / dotted→2 4` 的表，与 `decorBorderDash`
     是同一映射的第二份实现 → 圆环用后者、其余形状用前者，两边能独立漂移。
     （真实后果：给 `borderStyle` 加「点划线」选项时，只有圆环会动、其余 7 个形状静默变实线。） */
  const dashArray = decorBorderDash(borderStyle);
  return { stroke, strokeWidth, hasStroke, dashArray };
}

/** `borderStyle` 含 dash-dot 的扩展节奏（圆环/内环用） */
export function decorBorderDash(borderStyle: string): string {
  return borderStyle === "dashed"
    ? "8 4"
    : borderStyle === "dotted"
      ? "2 4"
      : borderStyle === "dash-dot"
        ? "12 4 2 4"
        : "none";
}

/** 线型（lineStyle，与 borderStyle 同一套节奏） */
export function decorLineDash(lineStyle: string): string {
  return lineStyle === "dashed" ? "8 4" : lineStyle === "dotted" ? "2 4" : lineStyle === "dash-dot" ? "12 4 2 4" : "none";
}

/** 边框样式选项（描边类形状共用；`dash-dot` 由 `decorBorderDash` 消费） */
export const DECOR_BORDER_STYLE_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "实线", value: "solid" },
  { label: "虚线", value: "dashed" },
  { label: "点线", value: "dotted" },
  { label: "点划线", value: "dash-dot" },
  { label: "无边框", value: "none" },
];

/** 线条样式选项（线条/箭头/分隔线/波浪/网格/斜线共用；由 `decorLineDash` 消费） */
export const DECOR_LINE_STYLE_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "实线", value: "solid" },
  { label: "虚线", value: "dashed" },
  { label: "点线", value: "dotted" },
  { label: "点划线", value: "dash-dot" },
];

/* ──────────────────────────────────────────────
 * 描边端点 / 转折样式
 *
 * 背景：`strokeLinecap: "round"` / `strokeLinejoin: "round"` 此前是**硬编码**在几何里的
 * （三角/多边形/星/菱形/十字/箭头/线条/分隔线/波浪/角标 共 10 处），面板上没有任何控件 ——
 * 也就是说"尖角 / 圆角"这类最常被设计师调整的描边细节，用户根本改不了。
 *
 * 同族几何写死一个视觉决策 = 少一份能力，因此这里把它升级成可配置项，并把
 * **改动前硬编码的那个值作为该项的默认值**（默认态产物逐字不变 → 零回归）。
 *
 * 能力判据（避免"面板有控件、画面不动"的假能力）：
 *   - `linecap` 只在"描边是一条开放路径、或每段虚线是独立子路径"的形状上可见；
 *     闭合且实线的矩形/圆/椭圆/多边形改它画面不动 → 不给。
 *   - `linejoin` 只在"描边路径上存在真实拐角"的形状上可见；
 *     矩形/圆/椭圆没有拐角（圆角靠 `borderRadius`）、线条没有拐角 → 不给。
 * 值 → 默认值 的映射即能力清单，因此"哪些形状支持"与"默认值是多少"不可能各写一份。
 * ────────────────────────────────────────────── */

/** 端点样式选项（面板 select 与取值白名单共用） */
export const DECOR_LINECAP_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "平头", value: "butt" },
  { label: "圆头", value: "round" },
  { label: "方头", value: "square" },
];

/** 转折样式选项 */
export const DECOR_LINEJOIN_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "尖角", value: "miter" },
  { label: "圆角", value: "round" },
  { label: "斜角", value: "bevel" },
];

/**
 * 支持端点样式的形状 → **改动前硬编码的值**（默认值必须等于历史产物，否则默认态就变了）。
 * `decoration-dashed-box` 此前未写 linecap（SVG 缺省即 `butt`），故默认值是 `butt` 而非 `round`。
 */
export const DECOR_LINECAP_DEFAULTS: Readonly<Record<string, string>> = {
  "decoration-line": "round",
  "decoration-arrow": "round",
  "decoration-divider": "round",
  "decoration-wave": "round",
  "decoration-corner": "round",
  "decoration-dashed-box": "butt",
};

/** 支持转折样式的形状 → 改动前硬编码的值（这 7 个此前全是 `round`） */
export const DECOR_LINEJOIN_DEFAULTS: Readonly<Record<string, string>> = {
  "decoration-triangle": "round",
  "decoration-polygon": "round",
  "decoration-star": "round",
  "decoration-diamond": "round",
  "decoration-cross": "round",
  "decoration-arrow": "round",
  "decoration-corner": "round",
};

export function decorSupportsLineCap(kind: string): boolean {
  return kind in DECOR_LINECAP_DEFAULTS;
}

export function decorSupportsLineJoin(kind: string): boolean {
  return kind in DECOR_LINEJOIN_DEFAULTS;
}

const LINECAP_VALUES = new Set(DECOR_LINECAP_OPTIONS.map((o) => o.value));
const LINEJOIN_VALUES = new Set(DECOR_LINEJOIN_OPTIONS.map((o) => o.value));

/** 端点样式取值：未配置 / 非法值 → 该形状的历史值（形状不支持时回退 SVG 缺省 `butt`） */
export function decorLineCapOf(config: Record<string, unknown>, kind: string): string {
  const v = str(config.lineCap);
  if (LINECAP_VALUES.has(v)) return v;
  return DECOR_LINECAP_DEFAULTS[kind] ?? "butt";
}

/** 转折样式取值：未配置 / 非法值 → 该形状的历史值（形状不支持时回退 SVG 缺省 `miter`） */
export function decorLineJoinOf(config: Record<string, unknown>, kind: string): string {
  const v = str(config.lineJoin);
  if (LINEJOIN_VALUES.has(v)) return v;
  return DECOR_LINEJOIN_DEFAULTS[kind] ?? "miter";
}

/** 端点/转折的默认值（注册处写入 defaultConfig，保证面板显示的档位就是几何的历史值） */
export function decorStrokeDetailDefaults(kind: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (decorSupportsLineCap(kind)) out.lineCap = DECOR_LINECAP_DEFAULTS[kind];
  if (decorSupportsLineJoin(kind)) out.lineJoin = DECOR_LINEJOIN_DEFAULTS[kind];
  return out;
}