/**
 * 表单滑块（form-slider）配置的**唯一取值口径** —— 编辑区渲染器与发布端 codegen 共用。
 *
 * 为什么需要这个文件：滑块是"多部件"控件（标签行 / 轨道 / 填充条 / 滑块 / 端点数值 / 数值气泡），
 * 每个部件都有一组样式声明。此前这些声明分散在两处各自书写：
 *   - 编辑区渲染器自己写 `#333333` / `14` / `#8a8f98`，并且**另抄了一份** `SLIDER_SIZES`；
 *   - 发布端 codegen 走 `resolveFieldStyle` + 自己那份 `SLIDER_SIZES`。
 * 结果"同一份面板配置在两端保持一致"全靠人眼比对。
 * 本文件把尺寸档、标签排版、数值/端点/气泡声明与百分比公式收成一份纯函数，两端只读它。
 *
 * 与同族组件的关系：基础排版（字号/字重/文字色/辅助文字色/禁用态）仍然来自
 * `resolveFieldStyle`，本文件不重复造这些字段，只在其之上补滑块特有的部分。
 */

import type { CssDecls } from "./cssDecls";
import { HELPER_COLOR, resolveFieldStyle, type FieldStyle } from "./fieldStyle";

/**
 * 滑块尺寸档（轨道高 / 填充条高 / 滑块直径 / 交互行高）。
 * 编辑区渲染器与发布端 codegen **共读这一份**；此前两端各写一份，一致与否全靠人眼。
 */
export const SLIDER_SIZES: Record<string, { track: number; fill: number; thumb: number; row: number }> = {
  small: { track: 3, fill: 4, thumb: 12, row: 22 },
  medium: { track: 4, fill: 6, thumb: 16, row: 29 },
  large: { track: 5, fill: 8, thumb: 20, row: 34 },
};

/** 数值气泡开启时，轨道行上方预留的高度（两端必须同值，否则垂直位置会差一截） */
export const SLIDER_BUBBLE_RESERVE = 24;

export interface SliderStyle {
  /** 同族字段样式（标签/字号/字重/文字色/辅助色/禁用态） */
  field: FieldStyle;
  /** 滑块与轨道、数值回显共用的强调色 */
  accent: string;
  /** 标签文字色：未配置时跟随控件文字色 */
  labelColor: string;
  /** 标签字号：0/未配置时跟随控件字号 */
  labelFontSize: number;
  showValue: boolean;
  valueSuffix: string;
  /** 轨道两端显示 min/max 数值 */
  showMinMax: boolean;
  /** 滑块上方实时数值气泡 */
  valueBubble: boolean;
  /** 轨道上的刻度标记 */
  showTicks: boolean;
  /** 刻度下方标注对应数值（IoT 档位场景：拖到第 3 格 = 风量 3 级） */
  showTickLabels: boolean;
  /** 刻度数量（含两端；≥2） */
  tickCount: number;
  /** 刻度线高度（px） */
  tickSize: number;
  /** 刻度颜色；空串=跟随滑块强调色 */
  tickColor: string;
  size: { track: number; fill: number; thumb: number; row: number };
  /** 收敛后的取值（越界一律夹紧，两端同值） */
  min: number;
  max: number;
  step: number;
  value: number;
  /** 当前值在轨道上的百分比（两端同一公式，填充条/滑块/气泡共用） */
  pct: number;
}

export function resolveSliderStyle(c: Record<string, unknown>): SliderStyle {
  const field = resolveFieldStyle(c);
  const min = Number(c.min ?? 0);
  const maxRaw = Number(c.max ?? 100);
  const max = Number.isFinite(maxRaw) && maxRaw > min ? maxRaw : min + 100;
  const step = Number(c.step ?? 1) || 1;
  let value = Number(c.value ?? 50);
  if (!Number.isFinite(value)) value = min;
  value = Math.min(max, Math.max(min, value));
  const rawLabelFontSize = Number(c.labelFontSize);
  const labelFontSize =
    Number.isFinite(rawLabelFontSize) && rawLabelFontSize > 0 ? rawLabelFontSize : field.fontSize;
  return {
    field,
    accent: String(c.accentColor ?? "").trim() || "#1976d2",
    labelColor: String(c.labelColor ?? "").trim() || field.textColor,
    labelFontSize,
    showValue: c.showValue !== false,
    valueSuffix: String(c.valueSuffix ?? ""),
    showMinMax: c.showMinMax === true,
    valueBubble: c.valueBubble === true,
    showTicks: c.showTicks === true,
    showTickLabels: c.showTickLabels === true,
    // 刻度数量至少 2（两端各一个）；非整数一律取整，避免"9.5 个刻度"
    tickCount: Math.max(2, Math.min(21, Math.round(Number(c.tickCount ?? 5)) || 5)),
    tickSize: (() => {
      const n = Number(c.tickSize);
      return Number.isFinite(n) && n >= 4 && n <= 20 ? n : 8;
    })(),
    tickColor: String(c.tickColor ?? "").trim(),
    size: SLIDER_SIZES[String(c.size ?? "medium")] ?? SLIDER_SIZES.medium,
    min,
    max,
    step,
    value,
    pct: max > min ? ((value - min) / (max - min)) * 100 : 0,
  };
}

/* ──────────────────────────────────────────────
 * 部件声明构建函数（编辑区 sx 与发布端 style 读同一份，勿在两端各写一份字面量）
 * ────────────────────────────────────────────── */

/** 标签行容器：两端对齐 + 8px 间距（标签在左、数值回显在右） */
export function sliderLabelRowCss(): CssDecls {
  return {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "8px",
    marginBottom: "4px",
    userSelect: "none",
  };
}

/** 标签文字（可单独配色/号/字重；截断而不换行，避免撑高整行） */
export function sliderLabelCss(s: SliderStyle): CssDecls {
  return {
    color: s.labelColor,
    fontSize: `${s.labelFontSize}px`,
    fontWeight: s.field.fontWeight,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };
}

/** 标签行右侧的数值回显（恒为强调色 + 中等字重） */
export function sliderValueCss(s: SliderStyle): CssDecls {
  return { color: s.accent, fontWeight: "500", flexShrink: "0" };
}

/**
 * 轨道行容器：气泡开启时上方预留空间，禁用态整体降透明度。
 *
 * `boxSizing` 必须显式声明 border-box：编辑区（MUI CssBaseline）与发布页的默认盒模型可能不同，
 * 一旦不同，`height + paddingTop` 会算出两种内容高度 → 轨道在两端的垂直位置差一截。
 * 显式声明后 `height = 行高 + 气泡预留` 与 `paddingTop = 气泡预留` 的差值恒等于行高。
 */
export function sliderRowCss(s: SliderStyle): CssDecls {
  const reserve = s.valueBubble ? SLIDER_BUBBLE_RESERVE : 0;
  return {
    position: "relative",
    boxSizing: "border-box",
    height: `${s.size.row + reserve}px`,
    display: "flex",
    alignItems: "center",
    ...(reserve ? { paddingTop: `${reserve}px` } : null),
    ...(s.field.disabled ? { opacity: "0.38" } : null),
  };
}

/** 底部 min/max 端点数值 */
export function sliderEndpointCss(): CssDecls {
  return {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "12px",
    lineHeight: "1.4",
    marginTop: "2px",
    color: HELPER_COLOR,
    userSelect: "none",
  };
}

/**
 * 数值气泡：位置由 `left` 百分比给出，不参与布局流。
 * `pct` 可覆盖（交互中传当前值算出的百分比），缺省用配置里的默认值 — 两端取值路径一致。
 */
export function sliderBubbleCss(s: SliderStyle, pct: number = s.pct): CssDecls {
  return {
    position: "absolute",
    top: "0",
    left: `${pct}%`,
    transform: "translateX(-50%)",
    padding: "2px 6px",
    borderRadius: "4px",
    background: s.accent,
    color: "#ffffff",
    fontSize: "11px",
    lineHeight: "1.5",
    whiteSpace: "nowrap",
    pointerEvents: "none",
    userSelect: "none",
  };
}

/** 滑块左偏移：`calc(pct% - thumb/2)`（渲染器/产物/脚本三处共用同一表达式） */
export function sliderThumbLeft(pct: number, thumb: number): string {
  return `calc(${pct}% - ${thumb / 2}px)`;
}

/* ──────────────────────────────────────────────
 * 按压反馈（pressing）
 *
 * 拖动瞬间滑块放大 + 强调色光环，给"我按住它了"的触觉暗示（IoT 调参场景高频拖动，反馈必须有）。
 * 两端共用同一组声明：编辑区挂 MUI thumb 的 `:active/.Mui-active`，发布端挂
 * `.uid.sl-pressing [data-slider-thumb]` 类规则（状态类由 pointerdown/up/cancel/blur 切换）。
 * 声明只进类规则层 —— 状态属性禁写 inline 的铁律在此同样适用。
 * ────────────────────────────────────────────── */

/** 按压态过渡（静态声明，随滑块本体一起输出；只过渡 transform/box-shadow，不碰定位用的 left） */
export const SLIDER_PRESS_TRANSITION = "transform .15s ease, box-shadow .15s ease";

/** 按压态声明：轻微放大 + 强调色光环（环宽随拇指直径缩放，尺寸档越小环越收） */
export function sliderPressCssOf(s: SliderStyle): CssDecls {
  const ring = Math.max(4, Math.round(s.size.thumb * 0.5));
  return {
    transform: "scale(1.2)",
    boxShadow: `0 0 0 ${ring}px ${s.accent}26`,
  };
}

/* ──────────────────────────────────────────────
 * 刻度标记（showTicks）
 *
 * 位置口径与「填充条 / 滑块 / 气泡」完全一致：都以轨道宽度为 100% 的百分比定位，
 * 因此三者在拖动时不会与刻度错位。两端共用 `sliderTicksOf` 生成同一组百分比。
 * ────────────────────────────────────────────── */

/** 刻度百分比序列（含两端；数量已收敛到 ≥2） */
export function sliderTicksOf(s: SliderStyle): number[] {
  const n = s.tickCount;
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push((i / (n - 1)) * 100);
  return out;
}

/**
 * 刻度层：铺满轨道行、以行为垂直中心对齐、不参与布局、不吃指针事件
 * （下层是隐形的原生 range 覆盖层，吃事件会破坏拖动）。
 */
export function sliderTickLayerCss(s: SliderStyle): CssDecls {
  return {
    position: "absolute",
    left: "0",
    right: "0",
    top: "50%",
    height: "0",
    pointerEvents: "none",
    ...(s.field.disabled ? { opacity: "0.38" } : null),
  };
}

/** 单条刻度：位于 `pct%` 处、以自身中心对齐（与滑块中心同一坐标原点） */
export function sliderTickCss(s: SliderStyle, pct: number): CssDecls {
  return {
    position: "absolute",
    left: `${pct}%`,
    top: "50%",
    width: "2px",
    height: `${s.tickSize}px`,
    marginLeft: "-1px",
    marginTop: `${-s.tickSize / 2}px`,
    borderRadius: "1px",
    background: s.tickColor || s.accent,
    opacity: "0.45",
  };
}

/**
 * 刻度数值标注（showTickLabels）：挂在刻度线下方，与刻度同一百分比原点。
 * 标签值 = min + pct% × (max - min)；整数直接显示，非整数最多保留两位小数（去尾零）。
 */
export function sliderTickLabelCss(s: SliderStyle, pct: number): CssDecls {
  return {
    position: "absolute",
    left: `${pct}%`,
    top: `${s.tickSize / 2 + 2}px`,
    transform: "translateX(-50%)",
    fontSize: "10px",
    lineHeight: "1.2",
    whiteSpace: "nowrap",
    color: s.tickColor || s.accent,
    opacity: "0.6",
    userSelect: "none",
    pointerEvents: "none",
  };
}

/** 刻度处对应数值文本（两端共用同一公式，勿在 codegen 里另写一份） */
export function sliderTickLabelText(s: SliderStyle, pct: number): string {
  const raw = s.min + (pct / 100) * (s.max - s.min);
  const v = parseFloat(raw.toFixed(2));
  return String(v);
}

/** 当前值文本：数值 + 单位（标签行回显与气泡共用同一份拼法） */
export function sliderValueText(s: SliderStyle, value: number = s.value): string {
  return `${value}${s.valueSuffix}`;
}
