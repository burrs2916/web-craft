/**
 * 图标组件族（单图标 / 图标列表 / 图标按钮）的**唯一取值口径** ——
 * 编辑区渲染器与发布端 codegen 共用。
 *
 * 与其它「唯一口径」文件同一范式：同一批默认值与派生规则只写一次，
 * 两端只读它，不再各写一份字面量。
 *
 * 图标引用（iconRef）的三种形态（与 `iconPipeline.renderMenuIcon` /
 * `IconResolver.resolveIcon` 两端的解析规则一致）：
 *   - `material:<name>`  → Material 图标（发布端内联本地 SVG path，不依赖在线字体）
 *   - `custom-<id>`      → 自定义图标库条目
 *   - `http(s)://` / `data:` → 直接 URL
 *   - `text:<文字>` / emoji  → 文本图元
 * 空值时两端都落默认图标（`widgets`），保证永不空白。
 */

import { SHAPE_RADIUS } from "./fieldStyle";
import { type CssDecls, clampNum, num, str } from "./cssDecls";
import { scaleStageCss } from "./scaleFit";

/** 图标族默认图标（两端同一份，勿在渲染器/codegen 再写一份） */
export const DEFAULT_ICON_NAME = "widgets";
export const DEFAULT_ICON_REF = `material:${DEFAULT_ICON_NAME}`;

/** 图标列表的默认条目（未配置任何内容时展示，两端同一份） */
export const DEFAULT_ICON_ITEMS = [
  { icon: "material:dashboard", label: "总览" },
  { icon: "material:bar_chart", label: "统计" },
  { icon: "material:settings", label: "设置" },
];

export interface IconStyle {
  /** 归一后的图标引用（空值 → DEFAULT_ICON_REF） */
  iconRef: string;
  /** 图标边长（px，自然尺寸） */
  size: number;
  /** 图标颜色；空串表示跟随文字色（发布端写 currentColor） */
  color: string;
  bgColor: string;
  radius: number;
  radiusCss: string;
  padding: number;
  borderCss: string;
  boxShadow: string;
  opacity: number;
  /** 旋转角度（deg） */
  rotate: number;
  flipH: boolean;
  flipV: boolean;
  /** 持续旋转（类规则驱动，不占 inline） */
  spin: boolean;
  spinDuration: number;
  /** 悬浮放大倍数（1 = 不放大；类规则驱动） */
  hoverScale: number;
  transitionCss: string;
  /** 图标与文字的排布方向 */
  layout: "horizontal" | "vertical";
  gap: number;
  /** 说明文字 */
  labelSize: number;
  labelColor: string;
  /** 容器的水平摆放 */
  align: string;
  /** 点击跳转链接（空串=不可点击） */
  href: string;
  linkTarget: string;
}

export interface IconStyleDefaults {
  size?: number;
  color?: string;
  bgColor?: string;
  radius?: number;
  layout?: "horizontal" | "vertical";
}

/** 归一图标引用：空/纯空白 → 默认图标 */
export function normalizeIconRef(v: unknown): string {
  const s = String(v ?? "").trim();
  return s || DEFAULT_ICON_REF;
}

/**
 * 把十六进制颜色按比例调暗（0~1）。非 hex 输入（rgba / 颜色关键字）原样返回 ——
 * 这类值无法可靠地做数值运算，交给用户在属性栏显式配置悬浮色。
 */
export function darkenHex(hex: string, amount: number): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  const k = 1 - Math.min(Math.max(amount, 0), 1);
  const r = Math.max(0, Math.round(((n >> 16) & 255) * k));
  const g = Math.max(0, Math.round(((n >> 8) & 255) * k));
  const b = Math.max(0, Math.round((n & 255) * k));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

export function resolveIconStyle(
  c: Record<string, unknown>,
  defaults?: IconStyleDefaults,
): IconStyle {
  const radius = clampNum(c.borderRadius, defaults?.radius ?? 0, 0, 60);
  const borderWidth = clampNum(c.borderWidth, 0, 0, 12);
  const borderColor = str(c.borderColor, "#d0d0d8");
  const borderStyle = str(c.borderStyle, "solid");
  const duration = clampNum(c.hoverDuration, 0.25, 0, 5);
  const spinDuration = clampNum(c.spinDuration, 2, 0.2, 20);

  return {
    iconRef: normalizeIconRef(c.icon ?? c.iconRef),
    size: clampNum(c.size, defaults?.size ?? 32, 6, 400),
    color: str(c.color, defaults?.color ?? ""),
    bgColor: str(c.bgColor, defaults?.bgColor ?? "transparent"),
    radius,
    radiusCss: `${radius * SHAPE_RADIUS}px`,
    padding: clampNum(c.padding, 0, 0, 80),
    borderCss: borderWidth > 0 ? `${borderWidth}px ${borderStyle} ${borderColor}` : "",
    boxShadow: str(c.boxShadow, c.shadow === true ? "0 2px 8px rgba(0,0,0,0.25)" : ""),
    opacity: clampNum(c.opacity, 1, 0, 1),
    rotate: clampNum(c.rotate, 0, -360, 360),
    flipH: c.flipH === true,
    flipV: c.flipV === true,
    spin: c.spin === true,
    spinDuration,
    hoverScale: Math.max(1, num(c.hoverScale, 1)),
    transitionCss: `transform ${duration}s cubic-bezier(0, 0, 0.2, 1), background-color ${duration}s ease`,
    layout: String(c.layout ?? defaults?.layout ?? "horizontal") === "vertical" ? "vertical" : "horizontal",
    gap: clampNum(c.gap, 8, 0, 60),
    labelSize: clampNum(c.labelSize, 13, 6, 80),
    labelColor: str(c.labelColor, "rgba(255,255,255,0.85)"),
    align: String(c.align ?? "center"),
    href: String(c.href ?? ""),
    linkTarget: String(c.linkTarget ?? "_blank"),
  };
}

/**
 * 图标自身的**静态**变换（旋转/翻转）。
 *
 * 为什么它不能进 inline：`.{uid}-rot:hover{transform:…}` 是**类规则**，而 inline 恒胜过
 * 任何非 `!important` 的类规则。只要静态 transform 落在 inline 上，悬浮放大就永远压不动
 * （真实浏览器实测复现：rotate=30 + hoverScale 时鼠标悬浮毫无反应）。
 * 所以静态 transform 与悬浮 transform 必须**同处类规则层**，由 `iconStateCss` 成对输出。
 */
export function iconStaticTransform(s: IconStyle): string {
  const parts: string[] = [];
  if (s.rotate) parts.push(`rotate(${s.rotate}deg)`);
  if (s.flipH || s.flipV) parts.push(`scale(${s.flipH ? -1 : 1}, ${s.flipV ? -1 : 1})`);
  return parts.join(" ");
}

/** 悬浮态的完整 transform（静态部分 + 放大倍数） */
export function iconHoverTransform(s: IconStyle): string {
  return `${iconStaticTransform(s)} scale(${s.hoverScale})`.trim();
}

/** 图标族的随框等比缩放基准（默认设计尺寸 64×64） */
export const ICON_FIT = { refW: 64, refH: 64, min: 0.35, max: 8 };
export const ICON_BUTTON_FIT = { refW: 120, refH: 40, min: 0.5, max: 3 };
export const ICON_LIST_FIT = { refW: 320, refH: 80, min: 0.5, max: 3 };

/* ──────────────────────────────────────────────
 * 图标列表数据源
 * ────────────────────────────────────────────── */

export interface IconItem {
  icon: string;
  label: string;
  value?: string;
  color?: string;
}

/** 静态配置文本 → 图标条目。每行 `图标|文字` 或 `图标|文字|提交值`（与选项型组件同一风格） */
export function parseIconItems(input: unknown): IconItem[] {
  if (Array.isArray(input)) return normalizeIconItems(input);
  if (typeof input !== "string") return [];
  const text = input.trim();
  if (!text) return [];

  if (text.startsWith("[")) {
    try {
      return normalizeIconItems(JSON.parse(text));
    } catch {
      /* 落到按行解析 */
    }
  }

  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("|").map((p) => p.trim());
      const item: IconItem = { icon: normalizeIconRef(parts[0]), label: parts[1] ?? "" };
      if (parts[2]) item.value = parts[2];
      return item;
    });
}

/** 接口/静态数据 → 图标条目（字段别名与其它组件一致） */
export function normalizeIconItems(data: unknown): IconItem[] {
  if (data == null) return [];
  let parsed: unknown = data;
  if (typeof parsed === "string") {
    const trimmed = parsed.trim();
    if (!trimmed) return [];
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return parseIconItems(trimmed);
    }
  }
  if (!Array.isArray(parsed)) {
    if (typeof parsed === "object") {
      return Object.entries(parsed as Record<string, unknown>).map(([k, v]) => ({
        icon: DEFAULT_ICON_REF,
        label: k,
        value: v == null ? "" : String(v),
      }));
    }
    return [];
  }
  return (parsed as unknown[])
    .map((raw): IconItem | null => {
      if (typeof raw === "string") return { icon: DEFAULT_ICON_REF, label: raw };
      if (!raw || typeof raw !== "object") return null;
      const rec = raw as Record<string, unknown>;
      const icon = rec.icon ?? rec.src ?? rec.image ?? DEFAULT_ICON_REF;
      const label = rec.label ?? rec.title ?? rec.name ?? rec.text ?? "";
      const item: IconItem = { icon: normalizeIconRef(icon), label: String(label) };
      if (rec.value != null) item.value = String(rec.value);
      if (rec.color != null) item.color = String(rec.color);
      return item;
    })
    .filter((i): i is IconItem => i != null && (!!i.label || !!i.icon));
}

/**
 * 图标列表数据的最终取值口径：接口 > 静态数据 > 内容组 > 默认占位。
 *
 * 接口模式下若数据尚未到达（或返回空），**回落到配置内容占位**而不是空白 ——
 * 这正是发布端的首屏行为（脚本先在编译期内容上打底、数据到达后覆盖），
 * 编辑区若返回空数组就会与发布端分叉（画布空白、发布后有内容）。
 */
export function resolveIconItems(o: {
  config: Record<string, unknown>;
  fetched?: unknown;
}): IconItem[] {
  const { config, fetched } = o;
  const isApi = String(config.dataMode ?? "static") === "api";

  if (isApi) {
    const fromApi = normalizeIconItems(fetched);
    if (fromApi.length > 0) return fromApi;
    // 数据未到达：继续走下面的配置内容占位
  }

  if (config.staticData != null && config.staticData !== "") {
    const fromStatic = normalizeIconItems(config.staticData);
    if (fromStatic.length > 0) return fromStatic;
  }

  const fromContent = parseIconItems(config.items);
  if (fromContent.length > 0) return fromContent;
  return DEFAULT_ICON_ITEMS;
}

/* ──────────────────────────────────────────────
 * 图标族布局声明（编辑区 sx 与发布端 style 属性的同一份字面量）
 *
 * DOM 结构（两端严格同构）：
 *   .{uid}            容器：铺满拖动框、按 align 摆放、裁剪溢出
 *     └ .{uid}-st     缩放舞台：铺满、flex 居中，供发布端脚本读尺寸
 *         └ .{uid}-in 缩放内层：自然尺寸，被 transform: scale(f) 缩放
 *             ├ .{uid}-rot 旋转变换层（静态 rotate/flip 走 inline/类，hover 放大走类）
 *             │   └ .{uid}-fc 图标面色层（底色/边框/圆角/内边距/投影/颜色）
 *             └ .{uid}-lb  说明文字
 *
 * 为什么把 rotate/flip 与 hover 放大分成两类承载：
 *   inline style 恒胜过任何非 `!important` 的类规则。若把静态 transform 写进 inline，
 *   悬浮态的 transform 就永远压不动它；反之若把静态 transform 也交给类规则，
 *   `.{uid}-rot:hover`（特异性更高）可以正常覆盖。故静态旋转写 inline（恒定不变），
 *   悬浮放大只写类规则。
 * ────────────────────────────────────────────── */

/** 容器：铺满拖动框 + 裁剪溢出（对齐交给缩放舞台，保证放大后仍按同一锚点摆放） */
export function iconOuterCss(): CssDecls {
  return {
    width: "100%",
    height: "100%",
    display: "flex",
    overflow: "hidden",
    minWidth: "0",
    minHeight: "0",
  };
}

/** 缩放舞台（发布端脚本读它的 clientWidth/clientHeight 算系数；同时承载水平对齐） */
export function iconStageCss(align: string): CssDecls {
  return scaleStageCss(align);
}

/**
 * 缩放内层（单图标）：自然尺寸盒子（尺寸不受缩放影响，只被 transform 缩放）。
 * 公共部分（transform-origin / flex-shrink）在 `scaleFit.ts` 的 `scaleInnerBaseCss`，
 * 发布端由骨架自动加、编辑区渲染器显式展开 —— 顺序恒为「公共在前、本函数在后」。
 */
export function iconInnerCss(s: IconStyle): CssDecls {
  return {
    display: "flex",
    flexDirection: s.layout === "vertical" ? "column" : "row",
    alignItems: "center",
    justifyContent: "center",
    gap: `${s.gap}px`,
    lineHeight: "0",
  };
}

/**
 * 旋转/翻转变换层：**只承载与状态无关的静态声明**（display / 过渡）。
 * transform 本身由 `iconStateCss`（发布端）或 sx 的 `&:hover`（编辑区）成对给出静态值与悬浮值。
 */
export function iconRotCss(s: IconStyle): CssDecls {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    transition: s.transitionCss,
  };
}

/** 图标面色层：底色/边框/圆角/内边距/投影/透明度 */
export function iconFaceCss(s: IconStyle): CssDecls {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    color: s.color || "inherit",
    backgroundColor: s.bgColor,
    ...(s.padding ? { padding: `${s.padding}px` } : {}),
    ...(s.radius ? { borderRadius: s.radiusCss } : {}),
    ...(s.borderCss ? { border: s.borderCss } : {}),
    ...(s.boxShadow ? { boxShadow: s.boxShadow } : {}),
    ...(s.opacity !== 1 ? { opacity: String(s.opacity) } : {}),
    lineHeight: "0",
  };
}

/** 说明文字 */
export function iconLabelCss(s: IconStyle): CssDecls {
  return {
    fontSize: `${s.labelSize}px`,
    lineHeight: "1.4",
    whiteSpace: "nowrap",
    color: s.labelColor,
  };
}

/**
 * 图标族的**类规则层**（发布端）—— 所有「会随状态变化」的属性都在这里，
 * 一个都不允许出现在 inline 上（inline 恒胜过非 `!important` 的类规则）。
 *
 * 输出三组：
 * - `.{uid}-rot`       静态 rotate/flip（**必须进类规则**：见 iconStaticTransform 的说明）
 * - `.{uid}-rot:hover` 悬浮放大（静态 transform 前缀 + scale，同层才能盖住）
 * - `@keyframes`/`-spin` 持续旋转（animation 覆盖 transform）
 */
export function iconStateCss(uid: string, s: IconStyle): string {
  let out = "";
  const base = iconStaticTransform(s);
  if (base) out += `.${uid}-rot{transform:${base}}`;
  if (s.hoverScale > 1) {
    out += `.${uid}-rot:hover{transform:${iconHoverTransform(s)}}`;
  }
  if (s.spin) {
    out += `@keyframes ${uid}-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`;
    out += `.${uid}-spin{animation:${uid}-spin ${s.spinDuration}s linear infinite}`;
  }
  return out;
}

/* ──────────────────────────────────────────────
 * 图标列表（icon-list）
 * ────────────────────────────────────────────── */

export interface IconListStyle {
  layout: "horizontal" | "vertical";
  columns: number;
  iconSize: number;
  iconColor: string;
  labelSize: number;
  labelColor: string;
  gap: number;
  itemPadding: number;
  itemBgColor: string;
  itemRadius: number;
  itemRadiusCss: string;
  itemBorderCss: string;
  hoverBgColor: string;
  align: string;
  transitionCss: string;
}

export function resolveIconListStyle(c: Record<string, unknown>): IconListStyle {
  const itemRadius = clampNum(c.itemRadius, 0, 0, 60);
  const borderWidth = clampNum(c.itemBorderWidth, 0, 0, 12);
  const duration = clampNum(c.hoverDuration, 0.25, 0, 5);
  return {
    layout: String(c.layout ?? "horizontal") === "vertical" ? "vertical" : "horizontal",
    columns: clampNum(c.columns, 0, 0, 12),
    iconSize: clampNum(c.iconSize, 20, 6, 120),
    iconColor: str(c.iconColor, ""),
    labelSize: clampNum(c.labelSize, 13, 6, 60),
    labelColor: str(c.labelColor, "rgba(255,255,255,0.85)"),
    gap: clampNum(c.gap, 16, 0, 80),
    itemPadding: clampNum(c.itemPadding, 6, 0, 40),
    itemBgColor: str(c.itemBgColor, "transparent"),
    itemRadius,
    itemRadiusCss: `${itemRadius * SHAPE_RADIUS}px`,
    itemBorderCss: borderWidth > 0
      ? `${borderWidth}px solid ${str(c.itemBorderColor, "rgba(255,255,255,0.12)")}`
      : "",
    hoverBgColor: str(c.hoverBgColor, "rgba(255,255,255,0.08)"),
    align: String(c.align ?? "left"),
    transitionCss: `background-color ${duration}s ease`,
  };
}

export function iconListOuterCss(): CssDecls {
  return {
    width: "100%",
    height: "100%",
    display: "flex",
    overflow: "hidden",
    minWidth: "0",
    minHeight: "0",
  };
}

/** 缩放内层（列表）：自然尺寸包装层（条目间距交给条目容器），只被 transform 缩放 */
export function iconListInnerCss(): CssDecls {
  return scaleInnerCss();
}

/** 通用缩放内层：自然尺寸包装层，只被 transform 缩放（图标列表 / 图标按钮共用） */
export function scaleInnerCss(): CssDecls {
  return {
    display: "inline-flex",
    alignItems: "center",
    lineHeight: "0",
  };
}

/** 条目容器：横向 + 指定列数时用 grid，否则用 flex */
export function iconListBodyCss(s: IconListStyle): CssDecls {  if (s.layout === "horizontal" && s.columns > 0) {
    return {
      display: "grid",
      gridTemplateColumns: `repeat(${s.columns}, minmax(0, 1fr))`,
      gap: `${s.gap}px`,
    };
  }
  return {
    display: "flex",
    flexDirection: s.layout === "vertical" ? "column" : "row",
    flexWrap: s.layout === "horizontal" ? "wrap" : "nowrap",
    alignItems: s.layout === "vertical" ? "stretch" : "center",
    gap: `${s.gap}px`,
  };
}

export function iconListItemCss(s: IconListStyle): CssDecls {
  // 注意：条目**底色**不在这里 —— 它同时是悬浮态的切换目标，必须由类规则承载
  // （见 iconListItemBaseRule / iconListStateCss）。inline 恒胜过类规则，
  // 一旦写进 inline，`.{uid}-it:hover` 就永远压不动，悬浮高亮会彻底失效。
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    padding: `${s.itemPadding}px`,
    ...(s.itemRadius ? { borderRadius: s.itemRadiusCss } : {}),
    ...(s.itemBorderCss ? { border: s.itemBorderCss } : {}),
    boxSizing: "border-box",
    lineHeight: "0",
    transition: s.transitionCss,
  };
}

export function iconListLabelCss(s: IconListStyle): CssDecls {
  return {
    fontSize: `${s.labelSize}px`,
    lineHeight: "1.4",
    whiteSpace: "nowrap",
    color: s.labelColor,
  };
}

/**
 * 条目静态底色（状态无关的取值口径只此一份）：`iconListItemCss` 不含它，
 * 编辑区由 sx 承载、发布端由 `iconListItemBaseRule` 承载，两端取同一个值。
 */
export function iconListItemBg(s: IconListStyle): string {
  return s.itemBgColor;
}

/** 条目底色 + 悬浮底色的**类规则**（发布端）。编辑区由 sx / `&:hover` 承载同一对取值。 */
export function iconListRules(uid: string, s: IconListStyle): string {
  let out = `.${uid}-it{background-color:${iconListItemBg(s)}}`;
  if (s.hoverBgColor !== s.itemBgColor) {
    out += `.${uid}-it:hover{background-color:${s.hoverBgColor}}`;
  }
  return out;
}

/* ──────────────────────────────────────────────
 * 图标按钮（icon-button）
 * ────────────────────────────────────────────── */

export const ICON_BUTTON_SIZE_MAP: Record<string, { font: number; padX: number; icon: number; height: number }> = {
  small: { font: 12, padX: 10, icon: 14, height: 28 },
  medium: { font: 13, padX: 16, icon: 16, height: 36 },
  large: { font: 15, padX: 22, icon: 20, height: 44 },
};

export interface IconButtonStyle {
  variant: "solid" | "outline" | "text";
  color: string;
  textColor: string;
  iconColor: string;
  hoverBgColor: string;
  fontSize: number;
  paddingX: number;
  gap: number;
  radius: number;
  radiusCss: string;
  borderCss: string;
  boxShadow: string;
  opacity: number;
  hoverScale: number;
  transitionCss: string;
  disabled: boolean;
  iconSize: number;
  height: number;
  href: string;
  linkTarget: string;
  align: string;
}

export function resolveIconButtonStyle(c: Record<string, unknown>): IconButtonStyle {
  const variant = String(c.variant ?? "solid");
  const sizeKey = String(c.size ?? "medium");
  const dims = ICON_BUTTON_SIZE_MAP[sizeKey] ?? ICON_BUTTON_SIZE_MAP.medium;
  const color = str(c.color, "#2196F3");
  const radius = clampNum(c.borderRadius, 4, 0, 60);
  const borderWidth = clampNum(c.borderWidth, 1, 0, 8);
  const duration = clampNum(c.hoverDuration, 0.25, 0, 5);
  const fontSize = clampNum(c.fontSize, dims.font, 6, 40);
  const paddingX = clampNum(c.paddingX, dims.padX, 0, 80);

  let text = "";
  let border = "";
  if (variant === "solid") {
    // 实心：文字色留空 → 白字（主题色底）
    text = str(c.textColor, "#ffffff");
  } else {
    // 描边/文字形态：文字色留空 → 跟随主题色
    text = str(c.textColor, color);
    if (variant === "outline") border = borderWidth > 0 ? `${borderWidth}px solid ${color}` : "";
  }

  // 悬浮底色派生：实心 = 主题色调暗 12%（否则与底色相同、悬浮毫无反馈）；
  // 描边/文字 = 主题色 12% 透明度薄底。用户显式配置时一律以配置为准。
  const derivedHover = variant === "solid" ? darkenHex(color, 0.12) : `${color}1f`;
  const hoverBg = str(c.hoverBgColor, "") || derivedHover;

  return {
    variant: variant === "outline" || variant === "text" ? variant : "solid",
    color,
    textColor: text,
    iconColor: str(c.iconColor, ""),
    hoverBgColor: hoverBg,
    fontSize,
    paddingX,
    gap: clampNum(c.gap, 6, 0, 40),
    radius,
    radiusCss: `${radius * SHAPE_RADIUS}px`,
    borderCss: border,
    boxShadow: str(c.boxShadow, c.shadow === true ? "0 2px 8px rgba(0,0,0,0.25)" : ""),
    // 禁用时压低不透明度：属于配置态（非交互态），两端读同一个最终值
    opacity: c.disabled === true
      ? Math.min(clampNum(c.opacity, 1, 0, 1), 0.5)
      : clampNum(c.opacity, 1, 0, 1),
    hoverScale: Math.max(1, num(c.hoverScale, 1)),
    transitionCss: `transform ${duration}s cubic-bezier(0, 0, 0.2, 1), background-color ${duration}s ease`,
    disabled: c.disabled === true,
    iconSize: dims.icon,
    height: dims.height,
    href: String(c.href ?? ""),
    linkTarget: String(c.linkTarget ?? "_blank"),
    align: String(c.align ?? "left"),
  };
}

export function iconButtonOuterCss(): CssDecls {
  return {
    width: "100%",
    height: "100%",
    display: "flex",
    overflow: "hidden",
    minWidth: "0",
    minHeight: "0",
  };
}

export function iconButtonCss(s: IconButtonStyle): CssDecls {
  // 注意：**底色**不在这里 —— 它同时是悬浮态的切换目标，必须由类规则承载
  // （见 iconButtonBg / iconButtonBaseRule）。inline 恒胜过类规则，
  // 写进 inline 会让 `.{uid}:hover{background-color:…}` 永远压不动。
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: `${s.gap}px`,
    padding: `0 ${s.paddingX}px`,
    height: `${s.height}px`,
    boxSizing: "border-box",
    fontFamily: "inherit",
    fontSize: `${s.fontSize}px`,
    lineHeight: "1",
    whiteSpace: "nowrap",
    textDecoration: "none",
    cursor: s.disabled ? "not-allowed" : "pointer",
    color: s.textColor,
    ...(s.borderCss ? { border: s.borderCss } : {}),
    ...(s.radius ? { borderRadius: s.radiusCss } : {}),
    ...(s.boxShadow ? { boxShadow: s.boxShadow } : {}),
    ...(s.opacity !== 1 ? { opacity: String(s.opacity) } : {}),
    transition: s.transitionCss,
  };
}

/** 按钮静态底色（实心 = 主题色；描边/文字 = 透明）。取值口径只此一份。 */
export function iconButtonBg(s: IconButtonStyle): string {
  return s.variant === "solid" ? s.color : "transparent";
}

/** 按钮底色 + 悬浮态的**类规则**（发布端）。编辑区由 sx / `&:hover` 承载同一对取值。 */
export function iconButtonRules(uid: string, s: IconButtonStyle): string {
  const base = iconButtonBg(s);
  let out = `.${uid}{background-color:${base}}`;
  if (!s.disabled) {
    // 悬浮底色与底色相同时不产出空规则（避免产物里出现无意义的声明）
    if (s.hoverBgColor !== base) out += `.${uid}:hover{background-color:${s.hoverBgColor}}`;
    if (s.hoverScale > 1) out += `.${uid}:hover{transform:scale(${s.hoverScale})}`;
  }
  return out;
}
