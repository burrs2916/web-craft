/**
 * 装饰形状的**唯一取值口径** —— 编辑区渲染器与发布端 codegen 共用。
 *
 * 背景（本轮修复的真实缺陷）：`ccat_decoration` 组此前**在发布端完全没有实现**。
 * `src/codegen/components/index.ts` 里没有任何 `decoration-*` 注册，于是
 *   - 预览：走到 `generateUnsupportedComponent` 显示橙色「codegen 待实现」占位块；
 *   - 发布：同一函数在非预览分支输出**一个空 div** —— 装饰组件在正式站点上彻底消失。
 * 与此同时 20 个形状的几何/配色字面量各自写在 20 个 `*DecorationRenderer.tsx` 里，
 * 即便补上 codegen 也必然与编辑区漂移（同批字面量写两处 = 必然分叉，本仓库已多次踩坑）。
 *
 * 因此本文件把「形状 → SVG 图元」的推导收口成纯函数：
 *   - 编辑区 `DecorationShapeRenderer` 把图元映射为 React 元素；
 *   - 发布端 `codegen/components/decoration.ts` 把同一批图元拼成 SVG 字符串。
 * 两端不写任何几何字面量，逐字一致由此获得。
 *
 * 与既有约定保持一致：
 *   - 面板值 `borderRadius` 在装饰族按**像素**直接进 SVG `rx/ry`（与 tableStyle 同口径）；
 *   - 描边宽度、虚线节奏、`vector-effect: non-scaling-stroke` 全部保留原实现语义。
 */

import { type CssDecls, cssText, num, str } from "./cssDecls";

/* ──────────────────────────────────────────────
 * 图元模型
 * ────────────────────────────────────────────── */

export type DecorPrimTag = "rect" | "circle" | "ellipse" | "polygon" | "path" | "line";

export interface DecorPrimitive {
  tag: DecorPrimTag;
  /** SVG 属性（**camelCase**，与 React 一致；发布端由 `svgAttrText` 转 kebab） */
  attrs: Record<string, string | number>;
  /** 图元级 CSS（渐变动画的 animation / transform-origin 等） */
  css?: CssDecls;
}

export interface DecorStop {
  offset: string;
  color: string;
  opacity?: number;
}

export interface DecorDef {
  kind: "linear" | "radial" | "clip";
  id: string;
  attrs: Record<string, string | number>;
  stops?: DecorStop[];
  /** kind === "clip" 时的裁剪矩形 */
  rect?: Record<string, string | number>;
}

export interface DecorShapeSpec {
  viewBox: string;
  preserveAspectRatio: string;
  /** svg 样式表是否显式给 overflow: visible（原实现逐形状不同，保持不动） */
  overflowVisible?: boolean;
  /** svg 的**父容器**附加声明（居中/相对定位等） */
  boxCss?: CssDecls;
  /** svg 自身的 CSS（很少用） */
  svgCss?: CssDecls;
  defs?: DecorDef[];
  primitives: DecorPrimitive[];
  /**
   * 「自动贴合尺寸」：把该尺寸回写面板，避免"改粗细后拖动框远大于线"。
   * 与旧实现逐形状逐字一致（线/箭头/分隔线/波浪才需要）。
   */
  autoFit?: { width?: number; height?: number };
  /** 需要注入页面 `<style>` 的关键帧（渐变动画） */
  keyframes?: string;
}

/* ──────────────────────────────────────────────
 * 公共取值
 * ────────────────────────────────────────────── */

/** 形状描边样式的公共取值：颜色 / 粗细 / 是否描边 / 虚线节奏 */
export interface DecorStroke {
  stroke: string;
  strokeWidth: number;
  hasStroke: boolean;
  dashArray: string;
}

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

/* ──────────────────────────────────────────────
 * 线型选项（面板 select 的**唯一来源**）
 *
 * 背景：`borderStyle` 的 4 行选项数组在 8 个注册里各抄一遍、`lineStyle` 的 3 行在 6 个注册里
 * 各抄一遍（共 14 份）。抄写副本的必然结局是漂移：给其中 3 个加上「点划线」而另外几个漏掉，
 * 用户看到"同样是边框样式，A 形状有 4 档、B 形状只有 3 档"。现收成一份常量，
 * 并在 `decor-options.test.ts` 里锁死「选项值集合 ⊇ 几何真正识别的集合」。
 * ────────────────────────────────────────────── */

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
 * 描边端点 / 转折样式（本轮新增的面板能力）
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

/* ──────────────────────────────────────────────
 * 填充（纯色 / 渐变）与阴影 —— 装饰组与形状组的**共用口径**
 *
 * 背景：形状组（`shape`）早就有"渐变填充 + 阴影"，装饰组 20 个原生形状却只有纯色填充，
 * 属性栏也没有这两组控件。若在装饰组各写一份，必然出现"同一档阴影两个数值"的漂移，
 * 所以这里把取值口径收成纯函数，两端（编辑区渲染器 / 发布端 codegen）与本文件各形状共用。
 * ────────────────────────────────────────────── */

/** 阴影档位 → CSS filter 的唯一映射（形状组历史上就叫 SHAPE_SHADOWS，保留该名字避免破坏引用） */
export const SHAPE_SHADOWS: Record<string, string> = {
  none: "",
  soft: "drop-shadow(0 2px 4px rgba(0,0,0,0.18))",
  medium: "drop-shadow(0 4px 10px rgba(0,0,0,0.28))",
  strong: "drop-shadow(0 8px 20px rgba(0,0,0,0.38))",
};

/** 阴影档位 → CSS filter（未知/缺省 → 空串，即无阴影） */
export function decorShadowFilter(value: unknown): string {
  return SHAPE_SHADOWS[str(value) || "none"] ?? "";
}

/** 阴影档位的面板选项（装饰组与形状组共用，避免两处写两份 label） */
export const DECOR_SHADOW_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "无", value: "none" },
  { label: "浅", value: "soft" },
  { label: "中", value: "medium" },
  { label: "深", value: "strong" },
];

/** 渐变方向 → linearGradient 坐标（与 `decoration-gradient` 静态档同一映射） */
export function decorGradientAttrs(direction: string): Record<string, string | number> {
  switch (direction) {
    case "to-left": return { x1: 1, y1: 0, x2: 0, y2: 0 };
    case "to-bottom": return { x1: 0, y1: 0, x2: 0, y2: 1 };
    case "to-top": return { x1: 0, y1: 1, x2: 0, y2: 0 };
    case "to-right-bottom": return { x1: 0, y1: 0, x2: 1, y2: 1 };
    case "to-left-bottom": return { x1: 1, y1: 0, x2: 0, y2: 1 };
    default: return { x1: 0, y1: 0, x2: 1, y2: 0 };
  }
}

/** 渐变方向的面板选项（与上面的坐标映射一一对应） */
export const DECOR_GRADIENT_DIRECTIONS: Array<{ label: string; value: string }> = [
  { label: "向右", value: "to-right" },
  { label: "向左", value: "to-left" },
  { label: "向下", value: "to-bottom" },
  { label: "向上", value: "to-top" },
  { label: "右下对角", value: "to-right-bottom" },
  { label: "左下对角", value: "to-left-bottom" },
  { label: "径向", value: "radial" },
];

/** `gradientEnabled` 关闭时用 `fill`，开启时改用一个按组件隔离的 linearGradient/radialGradient */
export interface DecorFillResult {
  fill: string;
  defs: DecorDef[];
}

export function decorFillOf(
  config: Record<string, unknown>,
  uid: string,
  fallback: string,
): DecorFillResult {
  const plain = str(config.fill) || fallback;
  if (config.gradientEnabled !== true) return { fill: plain, defs: [] };
  const from = str(config.gradientFrom) || plain || "#2196F3";
  const to = str(config.gradientTo) || "#FF9800";
  const direction = str(config.gradientDirection) || "to-right";
  const isRadial = direction === "radial";
  const id = `deco-fill-${uid}`;
  return {
    fill: `url(#${id})`,
    defs: [{
      kind: isRadial ? "radial" : "linear",
      id,
      attrs: isRadial
        ? { cx: "50%", cy: "50%", r: "50%", fx: "50%", fy: "50%" }
        : decorGradientAttrs(direction),
      stops: [{ offset: "0%", color: from }, { offset: "100%", color: to }],
    }],
  };
}

/**
 * 哪些装饰形状支持"渐变填充"：只给**默认就有可见填充**的形状，否则开关拨过去看不见任何变化
 * （圆环/波浪/虚线框默认 fill=none，属"按需填充"，不给渐变开关，避免属性栏出现假能力）。
 */
export const DECOR_GRADIENT_KINDS: ReadonlySet<string> = new Set([
  "decoration-rect",
  "decoration-circle",
  "decoration-ellipse",
  "decoration-triangle",
  "decoration-polygon",
  "decoration-star",
  "decoration-diamond",
  "decoration-cross",
]);

export function decorSupportsGradient(kind: string): boolean {
  return DECOR_GRADIENT_KINDS.has(kind);
}

/** 填充 + 描边图形（rect/circle/ellipse/polygon/path 共用） */
function filledAttrs(fill: string, s: DecorStroke, extra: Record<string, string | number> = {}): Record<string, string | number> {
  return {
    ...extra,
    fill,
    stroke: s.hasStroke ? s.stroke : "none",
    strokeWidth: s.hasStroke ? s.strokeWidth : 0,
    strokeDasharray: s.hasStroke ? s.dashArray : "none",
    vectorEffect: "non-scaling-stroke",
  };
}

/* ──────────────────────────────────────────────
 * 各形状几何
 * ────────────────────────────────────────────── */

/** 正多边形顶点（半径 45、圆心 50,50，与旧实现一致） */
function polygonPoints(sides: number): string {
  const cx = 50;
  const cy = 50;
  const r = 45;
  return Array.from({ length: Math.max(3, sides) }, (_, i) => {
    const angle = (2 * Math.PI * i) / Math.max(3, sides) - Math.PI / 2;
    return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
  }).join(" ");
}

/** 星形路径（外径 45） */
function starPath(points: number, innerRatio: number): string {
  const cx = 50;
  const cy = 50;
  const outerR = 45;
  const innerR = outerR * innerRatio;
  const parts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const angle = (Math.PI * i) / points - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    parts.push(`${i === 0 ? "M" : "L"} ${cx + r * Math.cos(angle)} ${cy + r * Math.sin(angle)}`);
  }
  parts.push("Z");
  return parts.join(" ");
}

/** 十字路径（臂宽 thickness） */
function crossPath(thickness: number): string {
  const ht = thickness / 2;
  return [
    `M ${50 - ht} 5`,
    `L ${50 + ht} 5`,
    `L ${50 + ht} ${50 - ht}`,
    `L 95 ${50 - ht}`,
    `L 95 ${50 + ht}`,
    `L ${50 + ht} ${50 + ht}`,
    `L ${50 + ht} 95`,
    `L ${50 - ht} 95`,
    `L ${50 - ht} ${50 + ht}`,
    `L 5 ${50 + ht}`,
    `L 5 ${50 - ht}`,
    `L ${50 - ht} ${50 - ht}`,
    "Z",
  ].join(" ");
}

/** 箭头翼（tip 为尖端，reverse 用于双向上游那支） */
function arrowHeadPath(tipX: number, tipY: number, size: number, reverse: boolean, shape: string): string {
  if (shape === "diamond") {
    const half = size / 2;
    const back = reverse ? half : -half;
    return `M ${tipX + back} ${tipY - half / 2} L ${tipX} ${tipY} L ${tipX + back} ${tipY + half / 2} L ${tipX + back * 2} ${tipY} Z`;
  }
  const halfAngle = (30 * Math.PI) / 180;
  const dx = size * Math.cos(halfAngle);
  const dy = size * Math.sin(halfAngle);
  return reverse
    ? `M ${tipX + dx} ${tipY - dy} L ${tipX} ${tipY} L ${tipX + dx} ${tipY + dy} Z`
    : `M ${tipX - dx} ${tipY - dy} L ${tipX} ${tipY} L ${tipX - dx} ${tipY + dy} Z`;
}

const GRADIENT_KEYFRAMES = `
@keyframes deco-grad-shift {
  0% { transform: translateX(-50%); }
  100% { transform: translateX(0%); }
}
@keyframes deco-grad-shift-v {
  0% { transform: translateY(-50%); }
  100% { transform: translateY(0%); }
}
@keyframes deco-grad-rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
`;

/** 支持等比缩放的 viewBox（保持长宽比，内容不会被拉伸变形） */
const VB_FIT = "0 0 100 100";
const PAR_MEET = "xMidYMid meet";
/** 铺满 viewBox（形状按拖动框拉伸，矩形/椭圆/线条/网格等） */
const PAR_NONE = "none";

/* ──────────────────────────────────────────────
 * 主入口
 * ────────────────────────────────────────────── */

export interface DecorShapeOptions {
  /** 拖动框尺寸（椭圆需要真实比例；缺省用设计基准） */
  width?: number;
  height?: number;
  /** 需要 id 隔离的渐变用（编辑区传 useId，发布端传组件 id） */
  uid?: string;
}

/**
 * 形状 → 图元声明。**未知类型返回空图元**（不抛错，避免一个坏组件炸掉整页预览）。
 *
 * 对外入口只做一件事：在 `buildDecorationShape` 的几何之上叠加"轮廓阴影"这一层
 * （写进 `boxCss.filter`，编辑区与发布端都把 boxCss 铺在最外层容器上 → 两端同层）。
 */
export function decorationShape(
  kind: string,
  config: Record<string, unknown>,
  opts: DecorShapeOptions = {},
): DecorShapeSpec {
  const spec = buildDecorationShape(kind, config, opts);
  const filter = decorShadowFilter(config.shadow);
  if (!filter) return spec;
  return { ...spec, boxCss: { ...(spec.boxCss ?? {}), filter } };
}

function buildDecorationShape(
  kind: string,
  config: Record<string, unknown>,
  opts: DecorShapeOptions = {},
): DecorShapeSpec {
  const plain = kind.replace(/^decoration-/, "");
  const uid = opts.uid || "deco";
  const opacity = num(config.opacity, 1);
  /* 纯色 / 渐变填充：只有在本形状真的画填充时才被消费 */
  const fillSpec = decorFillOf(config, uid, "rgba(33, 150, 243, 0.3)");

  switch (plain) {
    case "rect": {
      const s = resolveDecorStroke(config);
      const sw = s.hasStroke ? s.strokeWidth / 2 : 0;
      const r = num(config.borderRadius, 0);
      return {
        viewBox: VB_FIT,
        preserveAspectRatio: PAR_NONE,
        overflowVisible: true,
        boxCss: { opacity: String(opacity) },
        defs: fillSpec.defs,
        primitives: [{
          tag: "rect",
          attrs: filledAttrs(fillSpec.fill, s, {
            x: sw, y: sw, width: 100 - sw * 2, height: 100 - sw * 2, rx: r, ry: r,
          }),
        }],
      };
    }

    case "circle": {
      const s = resolveDecorStroke(config);
      const sw = s.hasStroke ? s.strokeWidth / 2 : 0;
      return {
        viewBox: VB_FIT,
        preserveAspectRatio: PAR_MEET,
        boxCss: { opacity: String(opacity) },
        defs: fillSpec.defs,
        primitives: [{
          tag: "circle",
          attrs: filledAttrs(fillSpec.fill, s, { cx: 50, cy: 50, r: 50 - sw }),
        }],
      };
    }

    case "ellipse": {
      const s = resolveDecorStroke(config);
      const w = opts.width || 200;
      const h = opts.height || 120;
      const cx = w / 2;
      const cy = h / 2;
      const sw = s.hasStroke ? s.strokeWidth / 2 : 0;
      return {
        viewBox: `0 0 ${w} ${h}`,
        preserveAspectRatio: PAR_NONE,
        overflowVisible: true,
        boxCss: { opacity: String(opacity) },
        defs: fillSpec.defs,
        primitives: [{
          tag: "ellipse",
          attrs: filledAttrs(fillSpec.fill, s, {
            cx, cy, rx: Math.max(1, cx - sw), ry: Math.max(1, cy - sw),
          }),
        }],
      };
    }

    case "triangle": {
      const s = resolveDecorStroke(config);
      const direction = str(config.direction) || "up";
      const points =
        direction === "down" ? "5,5 95,5 50,95"
          : direction === "left" ? "95,5 95,95 5,50"
            : direction === "right" ? "5,5 5,95 95,50"
              : "50,5 95,95 5,95";
      return {
        viewBox: VB_FIT,
        preserveAspectRatio: PAR_MEET,
        boxCss: { opacity: String(opacity) },
        defs: fillSpec.defs,
        primitives: [{
          tag: "polygon",
          attrs: filledAttrs(fillSpec.fill, s, { points, strokeLinejoin: decorLineJoinOf(config, "decoration-triangle") }),
        }],
      };
    }

    case "polygon": {
      const s = resolveDecorStroke(config);
      return {
        viewBox: VB_FIT,
        preserveAspectRatio: PAR_MEET,
        boxCss: { opacity: String(opacity) },
        defs: fillSpec.defs,
        primitives: [{
          tag: "polygon",
          attrs: filledAttrs(fillSpec.fill, s, {
            points: polygonPoints(num(config.sides, 6)),
            strokeLinejoin: decorLineJoinOf(config, "decoration-polygon"),
          }),
        }],
      };
    }

    case "star": {
      const s = resolveDecorStroke(config);
      return {
        viewBox: VB_FIT,
        preserveAspectRatio: PAR_MEET,
        boxCss: { opacity: String(opacity) },
        defs: fillSpec.defs,
        primitives: [{
          tag: "path",
          attrs: filledAttrs(fillSpec.fill, s, {
            d: starPath(Math.max(3, num(config.points, 5)), num(config.innerRatio, 0.4)),
            strokeLinejoin: decorLineJoinOf(config, "decoration-star"),
          }),
        }],
      };
    }

    case "ring": {
      const stroke = str(config.stroke) || "#2196F3";
      const ringWidth = num(config.ringWidth, 6);
      const borderStyle = str(config.borderStyle) || "solid";
      const fill = str(config.fill) || "none";
      const strokeWidth = num(config.strokeWidth, 0);
      const dash = decorBorderDash(borderStyle);
      const primitives: DecorPrimitive[] = [{
        tag: "circle",
        attrs: {
          cx: 50, cy: 50,
          r: Math.max(1, 50 - ringWidth / 2),
          fill,
          stroke,
          strokeWidth: ringWidth,
          strokeDasharray: dash,
          vectorEffect: "non-scaling-stroke",
        },
      }];
      if (strokeWidth > 0) {
        primitives.push({
          tag: "circle",
          attrs: {
            cx: 50, cy: 50,
            r: Math.max(1, 50 - ringWidth - strokeWidth / 2),
            fill: "none",
            stroke,
            strokeWidth,
            opacity: 0.5,
            vectorEffect: "non-scaling-stroke",
          },
        });
      }
      return { viewBox: VB_FIT, preserveAspectRatio: PAR_MEET, overflowVisible: true, boxCss: { opacity: String(opacity) }, primitives };
    }

    case "diamond": {
      const s = resolveDecorStroke(config);
      return {
        viewBox: VB_FIT,
        preserveAspectRatio: PAR_MEET,
        boxCss: { opacity: String(opacity) },
        defs: fillSpec.defs,
        primitives: [{
          tag: "polygon",
          attrs: filledAttrs(fillSpec.fill, s, {
            points: "50,5 95,50 50,95 5,50",
            strokeLinejoin: decorLineJoinOf(config, "decoration-diamond"),
          }),
        }],
      };
    }

    case "cross": {
      const crossFill = decorFillOf(config, uid, "#2196F3");
      const fill = crossFill.fill;
      const stroke = str(config.stroke) || "transparent";
      const strokeWidth = num(config.strokeWidth, 0);
      const hasStroke = strokeWidth > 0 && stroke !== "transparent";
      return {
        viewBox: VB_FIT,
        preserveAspectRatio: PAR_MEET,
        boxCss: { opacity: String(opacity) },
        defs: crossFill.defs,
        primitives: [{
          tag: "path",
          attrs: {
            d: crossPath(num(config.thickness, 10)),
            fill,
            stroke: hasStroke ? stroke : "none",
            strokeWidth,
            strokeLinejoin: decorLineJoinOf(config, "decoration-cross"),
            vectorEffect: "non-scaling-stroke",
          },
        }],
      };
    }

    case "divider": {
      const stroke = str(config.stroke) || "#2196F3";
      const strokeWidth = num(config.strokeWidth, 2);
      const style = str(config.style) || "single";
      const gap = num(config.gap, 3);
      const dash = decorLineDash(str(config.lineStyle) || "solid");
      const defs: DecorDef[] = [];
      const primitives: DecorPrimitive[] = [];
      const lineCommon = { stroke, strokeWidth, strokeLinecap: decorLineCapOf(config, "decoration-divider"), vectorEffect: "non-scaling-stroke" };

      if (style === "double") {
        primitives.push({ tag: "line", attrs: { x1: 0, y1: 50 - gap / 2, x2: 100, y2: 50 - gap / 2, strokeDasharray: dash, ...lineCommon } });
        primitives.push({ tag: "line", attrs: { x1: 0, y1: 50 + gap / 2, x2: 100, y2: 50 + gap / 2, strokeDasharray: dash, ...lineCommon } });
      } else if (style === "gradient") {
        const id = `divider-grad-${uid}`;
        defs.push({
          kind: "linear",
          id,
          attrs: { x1: 0, y1: 0, x2: 1, y2: 0 },
          stops: [
            { offset: "0%", color: stroke, opacity: 0 },
            { offset: "50%", color: stroke, opacity: 1 },
            { offset: "100%", color: stroke, opacity: 0 },
          ],
        });
        primitives.push({ tag: "line", attrs: { x1: 0, y1: 50, x2: 100, y2: 50, ...lineCommon, stroke: `url(#${id})` } });
      } else {
        primitives.push({ tag: "line", attrs: { x1: 0, y1: 50, x2: 100, y2: 50, strokeDasharray: dash, ...lineCommon } });
      }

      return {
        viewBox: VB_FIT,
        preserveAspectRatio: PAR_NONE,
        overflowVisible: true,
        boxCss: { opacity: String(opacity) },
        defs,
        primitives,
        autoFit: { height: style === "double" ? Math.ceil(strokeWidth * 2 + gap + 4) : Math.ceil(strokeWidth + 4) },
      };
    }

    case "wave": {
      const stroke = str(config.stroke) || "#2196F3";
      const strokeWidth = num(config.strokeWidth, 2);
      const amplitude = Math.min(num(config.amplitude, 10), 45);
      const wavelength = num(config.wavelength, 30);
      const dash = decorLineDash(str(config.lineStyle) || "solid");
      const fill = str(config.fill) || "none";

      const vbW = 100;
      const vbH = 100;
      const midY = 50;
      const numWaves = Math.max(2, Math.ceil(vbW / wavelength));
      const effectiveWL = vbW / numWaves;

      let d = `M 0 ${midY}`;
      for (let x = 0; x <= vbW; x += 0.5) {
        const y = midY + amplitude * Math.sin((2 * Math.PI * x) / effectiveWL);
        d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
      }
      const fillPath = fill && fill !== "none" ? d + ` L ${vbW} ${vbH} L 0 ${vbH} Z` : "";

      const primitives: DecorPrimitive[] = [];
      if (fillPath) primitives.push({ tag: "path", attrs: { d: fillPath, fill } });
      primitives.push({
        tag: "path",
        attrs: {
          d, stroke, strokeWidth, strokeDasharray: dash, fill: "none",
          strokeLinecap: decorLineCapOf(config, "decoration-wave"), strokeLinejoin: "round", vectorEffect: "non-scaling-stroke",
        },
      });

      return {
        viewBox: `0 0 ${vbW} ${vbH}`,
        preserveAspectRatio: PAR_NONE,
        overflowVisible: true,
        boxCss: { opacity: String(opacity) },
        primitives,
        autoFit: { height: Math.ceil(amplitude * 2 + strokeWidth + 4) },
      };
    }

    case "dashed-box": {
      const stroke = str(config.stroke) || "#2196F3";
      const strokeWidth = num(config.strokeWidth, 2);
      const dashLength = num(config.dashLength, 8);
      const gapLength = num(config.gapLength, 4);
      const borderRadius = num(config.borderRadius, 0);
      const sw = strokeWidth / 2;
      const r = borderRadius;
      return {
        viewBox: VB_FIT,
        preserveAspectRatio: PAR_NONE,
        overflowVisible: true,
        boxCss: { opacity: String(opacity) },
        primitives: [{
          tag: "rect",
          attrs: {
            x: sw, y: sw,
            width: 100 - strokeWidth, height: 100 - strokeWidth,
            rx: r, ry: r,
            fill: str(config.fill) || "none",
            stroke,
            strokeWidth,
            strokeDasharray: `${dashLength} ${gapLength}`,
            strokeLinecap: decorLineCapOf(config, "decoration-dashed-box"),
            vectorEffect: "non-scaling-stroke",
          },
        }],
      };
    }

    case "gradient": {
      const from = str(config.gradientFrom) || "#2196F3";
      const to = str(config.gradientTo) || "#FF9800";
      const direction = str(config.direction) || "to-right";
      const borderRadius = num(config.borderRadius, 0);
      const stroke = str(config.stroke) || "none";
      const strokeWidth = num(config.strokeWidth, 0);
      const animated = config.animated === true;
      const speed = num(config.speed, 3000);

      const r = borderRadius;
      const hasStroke = strokeWidth > 0 && stroke !== "none";
      const sw = hasStroke ? strokeWidth / 2 : 0;
      const isRadial = direction === "radial";
      const isVertical = direction === "to-bottom" || direction === "to-top";

      const rectAttrs = (fill: string): Record<string, string | number> => ({
        x: sw, y: sw, width: 100 - sw * 2, height: 100 - sw * 2, rx: r, ry: r,
        fill,
        stroke: hasStroke ? stroke : "none",
        strokeWidth: hasStroke ? strokeWidth : 0,
        vectorEffect: "non-scaling-stroke",
      });

      const staticId = `deco-grad-${uid}`;
      const animId = `deco-grad-anim-${uid}`;
      let defs: DecorDef[] = [];
      let primitives: DecorPrimitive[] = [];

      if (!animated) {
        defs = [{
          kind: isRadial ? "radial" : "linear",
          id: staticId,
          attrs: isRadial
            ? { cx: "50%", cy: "50%", r: "50%", fx: "50%", fy: "50%" }
            : direction === "to-left" ? { x1: 1, y1: 0, x2: 0, y2: 0 }
              : direction === "to-bottom" ? { x1: 0, y1: 0, x2: 0, y2: 1 }
                : direction === "to-top" ? { x1: 0, y1: 1, x2: 0, y2: 0 }
                  : direction === "to-right-bottom" ? { x1: 0, y1: 0, x2: 1, y2: 1 }
                    : direction === "to-left-bottom" ? { x1: 1, y1: 0, x2: 0, y2: 1 }
                      : { x1: 0, y1: 0, x2: 1, y2: 0 },
          stops: [{ offset: "0%", color: from }, { offset: "100%", color: to }],
        }];
        primitives = [{ tag: "rect", attrs: rectAttrs(`url(#${staticId})`) }];
      } else if (isRadial) {
        defs = [{
          kind: "radial",
          id: animId,
          attrs: { cx: "50%", cy: "50%", r: "50%", fx: "50%", fy: "50%" },
          stops: [
            { offset: "0%", color: from }, { offset: "33%", color: to },
            { offset: "66%", color: from }, { offset: "100%", color: to },
          ],
        }];
        primitives = [{
          tag: "rect",
          attrs: rectAttrs(`url(#${animId})`),
          css: { animation: `deco-grad-rotate ${speed * 3}ms linear infinite`, transformOrigin: "50% 50%" },
        }];
      } else {
        const shift = isVertical ? "deco-grad-shift-v" : "deco-grad-shift";
        const clipId = `clip-${uid}`;
        defs = [
          {
            kind: "linear",
            id: animId,
            attrs: { x1: 0, y1: 0, x2: 1, y2: 0 },
            stops: [
              { offset: "0%", color: from }, { offset: "25%", color: to },
              { offset: "50%", color: from }, { offset: "75%", color: to },
              { offset: "100%", color: from },
            ],
          },
          { kind: "clip", id: clipId, attrs: {}, rect: { x: sw, y: sw, width: 100 - sw * 2, height: 100 - sw * 2, rx: r, ry: r } },
        ];
        primitives = [{
          tag: "rect",
          attrs: {
            x: isVertical ? sw : -50,
            y: isVertical ? -50 : sw,
            width: isVertical ? 100 - sw * 2 : 200,
            height: isVertical ? 200 : 100 - sw * 2,
            fill: `url(#${animId})`,
            clipPath: `url(#${clipId})`,
          },
          css: { animation: `${shift} ${speed}ms linear infinite` },
        }];
        if (hasStroke) primitives.push({ tag: "rect", attrs: rectAttrs("none") });
      }

      return {
        viewBox: VB_FIT,
        preserveAspectRatio: PAR_NONE,
        overflowVisible: true,
        boxCss: { opacity: String(opacity) },
        defs,
        primitives,
        keyframes: animated ? GRADIENT_KEYFRAMES : undefined,
      };
    }

    case "corner": {
      const stroke = str(config.stroke) || "#2196F3";
      const s = num(config.size, 15);
      const strokeWidth = num(config.strokeWidth, 2);
      const position = str(config.position) || "all";
      const style = str(config.style) || "bracket";
      const show = {
        tl: ["all", "top-left", "top", "left"].includes(position),
        tr: ["all", "top-right", "top", "right"].includes(position),
        bl: ["all", "bottom-left", "bottom", "left"].includes(position),
        br: ["all", "bottom-right", "bottom", "right"].includes(position),
      };
      const cornerPath = (corner: "tl" | "tr" | "bl" | "br"): string => {
        if (style === "l-shape") {
          switch (corner) {
            case "tl": return `M 0 0 L ${s} 0 L ${s} ${s}`;
            case "tr": return `M 100 0 L ${100 - s} 0 L ${100 - s} ${s}`;
            case "bl": return `M 0 100 L ${s} 100 L ${s} ${100 - s}`;
            case "br": return `M 100 100 L ${100 - s} 100 L ${100 - s} ${100 - s}`;
          }
        }
        switch (corner) {
          case "tl": return `M 0 ${s} L ${s} ${s} L ${s} 0`;
          case "tr": return `M 100 ${s} L ${100 - s} ${s} L ${100 - s} 0`;
          case "bl": return `M 0 ${100 - s} L ${s} ${100 - s} L ${s} 100`;
          case "br": return `M 100 ${100 - s} L ${100 - s} ${100 - s} L ${100 - s} 100`;
        }
        return "";
      };
      const attrs = {
        stroke, strokeWidth, fill: "none",
        strokeLinecap: decorLineCapOf(config, "decoration-corner"),
        strokeLinejoin: decorLineJoinOf(config, "decoration-corner"),
        vectorEffect: "non-scaling-stroke",
      };
      const primitives: DecorPrimitive[] = [];
      for (const corner of ["tl", "tr", "bl", "br"] as const) {
        if (show[corner]) primitives.push({ tag: "path", attrs: { d: cornerPath(corner), ...attrs } });
      }
      return {
        viewBox: VB_FIT,
        preserveAspectRatio: PAR_NONE,
        boxCss: { opacity: String(opacity), position: "relative" },
        primitives,
      };
    }

    case "dot": {
      const fill = str(config.fill) || "#2196F3";
      const stroke = str(config.stroke) || "transparent";
      const strokeWidth = num(config.strokeWidth, 0);
      const shape = str(config.shape) || "circle";
      const hasStroke = strokeWidth > 0 && stroke !== "transparent";
      const base = {
        fill,
        stroke: hasStroke ? stroke : "none",
        strokeWidth,
        vectorEffect: "non-scaling-stroke",
      };
      let primitive: DecorPrimitive;
      switch (shape) {
        case "square":
          primitive = {
            tag: "rect",
            attrs: {
              x: hasStroke ? strokeWidth : 0, y: hasStroke ? strokeWidth : 0,
              width: hasStroke ? 100 - strokeWidth * 2 : 100,
              height: hasStroke ? 100 - strokeWidth * 2 : 100,
              ...base,
            },
          };
          break;
        case "triangle":
          primitive = { tag: "polygon", attrs: { points: "50,5 95,95 5,95", strokeLinejoin: "round", ...base } };
          break;
        case "diamond":
          primitive = { tag: "polygon", attrs: { points: "50,5 95,50 50,95 5,50", strokeLinejoin: "round", ...base } };
          break;
        case "cross":
          primitive = { tag: "path", attrs: { d: crossPath(25), strokeLinejoin: "round", ...base } };
          break;
        case "star": {
          primitive = { tag: "path", attrs: { d: starPath(5, 18 / 45), strokeLinejoin: "round", ...base } };
          break;
        }
        default:
          primitive = { tag: "circle", attrs: { cx: 50, cy: 50, r: hasStroke ? 50 - strokeWidth / 2 : 50, ...base } };
      }
      return {
        viewBox: VB_FIT,
        preserveAspectRatio: PAR_MEET,
        boxCss: { opacity: String(opacity), display: "flex", alignItems: "center", justifyContent: "center" },
        primitives: [primitive],
      };
    }

    case "grid": {
      const stroke = str(config.stroke) || "rgba(255,255,255,0.1)";
      const strokeWidth = num(config.strokeWidth, 1);
      // 步长护栏：面板 min=0，用户填 0 时 x += 0 是死循环（发布端直接挂死）
      const spacing = Math.max(num(config.spacing, 20), 1);
      const dash = decorLineDash(str(config.lineStyle) || "solid");
      const primitives: DecorPrimitive[] = [];
      for (let x = spacing; x < 100; x += spacing) {
        primitives.push({ tag: "line", attrs: { x1: x, y1: 0, x2: x, y2: 100, stroke, strokeWidth, strokeDasharray: dash, vectorEffect: "non-scaling-stroke" } });
      }
      for (let y = spacing; y < 100; y += spacing) {
        primitives.push({ tag: "line", attrs: { x1: 0, y1: y, x2: 100, y2: y, stroke, strokeWidth, strokeDasharray: dash, vectorEffect: "non-scaling-stroke" } });
      }
      return { viewBox: VB_FIT, preserveAspectRatio: PAR_NONE, boxCss: { opacity: String(opacity) }, primitives };
    }

    case "diagonal": {
      const stroke = str(config.stroke) || "rgba(255,255,255,0.1)";
      const strokeWidth = num(config.strokeWidth, 1);
      const spacing = num(config.spacing, 10);
      const angle = num(config.angle, 45);
      const dash = decorLineDash(str(config.lineStyle) || "solid");
      const rad = (angle * Math.PI) / 180;
      const tanA = Math.abs(Math.tan(rad));
      const effectiveSpacing = Math.max(spacing, strokeWidth + 2);
      const primitives: DecorPrimitive[] = [];
      const push = (x1: number, y1: number, x2: number, y2: number) => {
        primitives.push({ tag: "line", attrs: { x1, y1, x2, y2, stroke, strokeWidth, strokeDasharray: dash, vectorEffect: "non-scaling-stroke" } });
      };

      if (angle > 0 && angle < 90) {
        const step = effectiveSpacing / Math.sin(rad);
        const stepY = effectiveSpacing / Math.cos(rad);
        const totalStep = Math.min(step, stepY);
        for (let offset = -200; offset <= 300; offset += totalStep) {
          push(offset, 0, offset + 100 * tanA, 100);
        }
      } else if (angle === 90) {
        for (let x = 0; x <= 100; x += effectiveSpacing) push(x, 0, x, 100);
      } else if (angle === 0) {
        for (let y = 0; y <= 100; y += effectiveSpacing) push(0, y, 100, y);
      } else {
        const absAngle = ((angle % 360) + 360) % 360;
        const normalizedAngle = absAngle > 180 ? absAngle - 360 : absAngle;
        const nRad = (normalizedAngle * Math.PI) / 180;
        const step = effectiveSpacing / Math.abs(Math.sin(nRad));
        for (let offset = -200; offset <= 300; offset += step) {
          push(offset, 0, offset - 100 * Math.abs(tanA), 100);
        }
      }
      return { viewBox: VB_FIT, preserveAspectRatio: PAR_NONE, overflowVisible: true, boxCss: { opacity: String(opacity) }, primitives };
    }

    case "dots-pattern": {
      const fill = str(config.fill) || "rgba(255,255,255,0.15)";
      const dotSize = num(config.dotSize, 2);
      // 步长护栏：同 grid，spacing=0 会让双层 for 死循环
      const spacing = Math.max(num(config.spacing, 12), 1);
      const shape = str(config.shape) || "circle";
      const r = dotSize;
      const s = dotSize * 2;
      const primitives: DecorPrimitive[] = [];
      for (let x = spacing; x < 100; x += spacing) {
        for (let y = spacing; y < 100; y += spacing) {
          if (shape === "square") {
            primitives.push({ tag: "rect", attrs: { x: x - r, y: y - r, width: s, height: s, fill } });
          } else if (shape === "diamond") {
            primitives.push({ tag: "rect", attrs: { x: x - r, y: y - r, width: s, height: s, fill, transform: `rotate(45 ${x} ${y})` } });
          } else {
            primitives.push({ tag: "circle", attrs: { cx: x, cy: y, r, fill } });
          }
        }
      }
      return { viewBox: VB_FIT, preserveAspectRatio: PAR_NONE, boxCss: { opacity: String(opacity) }, primitives };
    }

    case "line": {
      const stroke = str(config.stroke) || "#2196F3";
      const strokeWidth = num(config.strokeWidth, 3);
      const dash = decorLineDash(str(config.lineStyle) || "solid");
      const direction = str(config.direction) || "horizontal";
      const attrs = {
        stroke, strokeWidth, strokeDasharray: dash,
        strokeLinecap: decorLineCapOf(config, "decoration-line"), vectorEffect: "non-scaling-stroke",
      };
      const coords =
        direction === "vertical" ? { x1: 50, y1: 0, x2: 50, y2: 100 }
          : direction === "diagonal-tl-br" ? { x1: 0, y1: 0, x2: 100, y2: 100 }
            : direction === "diagonal-tr-bl" ? { x1: 100, y1: 0, x2: 0, y2: 100 }
              : { x1: 0, y1: 50, x2: 100, y2: 50 };
      const isVertical = direction === "vertical";
      return {
        viewBox: VB_FIT,
        preserveAspectRatio: PAR_NONE,
        overflowVisible: true,
        boxCss: { opacity: String(opacity) },
        primitives: [{ tag: "line", attrs: { ...coords, ...attrs } }],
        autoFit: isVertical
          ? { width: Math.ceil(strokeWidth + 4) }
          : { height: Math.ceil(strokeWidth + 4) },
      };
    }

    case "arrow": {
      const stroke = str(config.color1) || str(config.color) || "#2196F3";
      const strokeWidth = num(config.strokeWidth, 2);
      const direction = str(config.direction) || "right";
      const arrowType = str(config.arrowType) || "single";
      const arrowSize = num(config.arrowSize, 10);
      const dash = decorLineDash(str(config.lineStyle) || "solid");
      const arrowShape = str(config.arrowShape) || "triangle";
      const arrowCount = Math.max(1, num(config.arrowCount, 1));

      const rotation = direction === "up" ? -90 : direction === "down" ? 90 : direction === "left" ? 180 : 0;
      const startX = arrowType === "double" ? 15 : 0;
      const endX = arrowType === "double" ? 85 : 100;
      // 「连续」＝沿线均匀排布 arrowCount 个箭头，尖端朝前；单/双向沿用首尾布局
      const spread = arrowType === "chain" ? arrowCount : 1;
      const isMulti = spread > 1;
      const lineStart = isMulti ? 0 : startX;
      const lineEnd = isMulti ? 100 : endX;

      const primitives: DecorPrimitive[] = [];
      const group: DecorPrimitive[] = [];

      group.push({
        tag: "path",
        attrs: {
          d: `M ${lineStart} 50 L ${lineEnd} 50`,
          stroke, strokeWidth, strokeDasharray: dash, fill: "none",
          strokeLinecap: decorLineCapOf(config, "decoration-arrow"), vectorEffect: "non-scaling-stroke",
        },
      });

      if (isMulti) {
        for (let i = 0; i < spread; i++) {
          const tip = ((i + 1) * 100) / spread;
          group.push({
            tag: "path",
            attrs: {
              d: arrowHeadPath(tip, 50, arrowSize, false, arrowShape),
              stroke, strokeWidth, fill: stroke, strokeLinejoin: decorLineJoinOf(config, "decoration-arrow"), vectorEffect: "non-scaling-stroke",
            },
          });
        }
      } else {
        group.push({
          tag: "path",
          attrs: {
            d: arrowHeadPath(endX, 50, arrowSize, false, arrowShape),
            stroke, strokeWidth, fill: stroke, strokeLinejoin: "round", vectorEffect: "non-scaling-stroke",
          },
        });
        if (arrowType === "double") {
          group.push({
            tag: "path",
            attrs: {
              d: arrowHeadPath(startX, 50, arrowSize, true, arrowShape),
              stroke, strokeWidth, fill: stroke, strokeLinejoin: decorLineJoinOf(config, "decoration-arrow"), vectorEffect: "non-scaling-stroke",
            },
          });
        }
      }

      if (rotation !== 0) {
        for (const p of group) p.attrs = { ...p.attrs, transform: `rotate(${rotation} 50 50)` };
      }
      primitives.push(...group);

      const isVertical = direction === "up" || direction === "down";
      return {
        viewBox: VB_FIT,
        preserveAspectRatio: PAR_NONE,
        overflowVisible: true,
        boxCss: { opacity: String(opacity), display: "flex", alignItems: "center", justifyContent: "center" },
        primitives,
        autoFit: isVertical
          ? { width: Math.ceil(arrowSize + strokeWidth + 4) }
          : { height: Math.ceil(arrowSize + strokeWidth + 4) },
      };
    }

    default:
      return { viewBox: VB_FIT, preserveAspectRatio: PAR_MEET, primitives: [] };
  }
}

/* ──────────────────────────────────────────────
 * 形状组件组（ccat_shape 的 `shape`）：多形状 + 渐变填充 + 阴影
 *
 * 与装饰组的区别是**面板语义**（shapeType/fill/stroke/...），不是几何 ——
 * 因此这里做的是"面板配置 → 装饰组图元"的映射，几何仍然只此一份，
 * 不会出现"形状组一套字面量、装饰组另一套"的分叉。
 * ────────────────────────────────────────────── */

/** `shape` 组件可选的形状种类（面板选项与实现共用同一份清单） */
export const SHAPE_KIND_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "矩形", value: "rect" },
  { label: "圆形", value: "circle" },
  { label: "椭圆", value: "ellipse" },
  { label: "线条", value: "line" },
  { label: "三角形", value: "triangle" },
  { label: "菱形", value: "diamond" },
  { label: "五角星", value: "star" },
  { label: "正多边形", value: "polygon" },
  { label: "十字", value: "cross" },
  { label: "虚线框", value: "dashed-box" },
];

/** `shape` 面板配置 → 装饰组图元声明（几何单一来源） */
export function shapeSpec(config: Record<string, unknown>, opts: DecorShapeOptions = {}): DecorShapeSpec {
  const shapeType = str(config.shapeType) || "rect";
  const gradient = config.gradientEnabled === true;
  const stroke = str(config.stroke) || "#2196F3";
  const strokeWidth = num(config.strokeWidth, 2);
  const borderStyle = str(config.borderStyle) || "solid";
  const opacity = num(config.opacity, 1);
  /* shadow 一并透传 → 由 decorationShape 统一写进 boxCss.filter（与装饰组同一层、同一映射） */
  /* lineCap / lineJoin 同样透传：形状组与装饰组共用几何，描边细节口径必须只有一份 */
  const base = {
    stroke, strokeWidth, borderStyle, opacity, shadow: config.shadow,
    lineCap: config.lineCap, lineJoin: config.lineJoin,
  };

  if (gradient) {
    return decorationShape("decoration-gradient", {
      gradientFrom: str(config.gradientFrom) || str(config.fill) || "#2196F3",
      gradientTo: str(config.gradientTo) || "#FF9800",
      direction: str(config.gradientDirection) || "to-right",
      borderRadius: num(config.borderRadius, 0),
      stroke: borderStyle === "none" ? "none" : stroke,
      strokeWidth: borderStyle === "none" ? 0 : strokeWidth,
      opacity,
      shadow: config.shadow,
    }, opts);
  }

  const fill = str(config.fill) || "rgba(33, 150, 243, 0.3)";

  switch (shapeType) {
    case "circle":
      return decorationShape("decoration-circle", { ...base, fill }, opts);
    case "ellipse":
      return decorationShape("decoration-ellipse", { ...base, fill }, opts);
    case "line":
      return decorationShape("decoration-line", {
        stroke,
        strokeWidth,
        lineStyle: borderStyle === "none" ? "solid" : borderStyle,
        direction: str(config.lineDirection) || "horizontal",
        opacity,
        shadow: config.shadow,
        lineCap: config.lineCap,
      }, opts);
    case "triangle":
      return decorationShape("decoration-triangle", { ...base, fill }, opts);
    case "diamond":
      return decorationShape("decoration-diamond", { ...base, fill }, opts);
    case "star":
      return decorationShape("decoration-star", {
        ...base, fill,
        points: num(config.points, 5),
        innerRatio: num(config.innerRatio, 0.4),
      }, opts);
    case "polygon":
      return decorationShape("decoration-polygon", { ...base, fill, sides: num(config.sides, 6) }, opts);
    case "cross":
      return decorationShape("decoration-cross", {
        fill,
        stroke: borderStyle === "none" ? "transparent" : stroke,
        strokeWidth: borderStyle === "none" ? 0 : strokeWidth,
        thickness: num(config.thickness, 10),
        opacity,
        shadow: config.shadow,
      }, opts);
    case "dashed-box":
      return decorationShape("decoration-dashed-box", {
        ...base,
        fill,
        dashLength: num(config.dashLength, 8),
        gapLength: num(config.gapLength, 4),
        borderRadius: num(config.borderRadius, 0),
      }, opts);
    case "rect":
    default:
      return decorationShape("decoration-rect", { ...base, fill, borderRadius: num(config.borderRadius, 0) }, opts);
  }
}

/* ──────────────────────────────────────────────
 * 发布端字符串化（编辑区不用；仅为 codegen 提供唯一命名口径）
 * ────────────────────────────────────────────── */

/**
 * camelCase 属性名 → SVG 属性名。
 *
 * 绝大多数只差一个连字符，但 `viewBox` / `preserveAspectRatio` / `clipPath` 这类
 * 有专名的必须显式列出（否则会被机械转换毁掉）。
 */
const SVG_ATTR_NAMES: Record<string, string> = {
  className: "class",
  viewBox: "viewBox",
  preserveAspectRatio: "preserveAspectRatio",
  gradientUnits: "gradientUnits",
  gradientTransform: "gradientTransform",
  clipPathUnits: "clipPathUnits",
  clipPath: "clip-path",
  stopColor: "stop-color",
  stopOpacity: "stop-opacity",
  strokeWidth: "stroke-width",
  strokeDasharray: "stroke-dasharray",
  strokeLinejoin: "stroke-linejoin",
  strokeLinecap: "stroke-linecap",
  vectorEffect: "vector-effect",
  markerWidth: "markerWidth",
  markerHeight: "markerHeight",
};

export function svgAttrName(key: string): string {
  if (SVG_ATTR_NAMES[key]) return SVG_ATTR_NAMES[key];
  if (key.startsWith("data-") || key.startsWith("aria-")) return key;
  return key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

function escapeAttrValue(value: string | number): string {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** 属性表 → SVG 属性串（发布端用；排序稳定，便于快照比对） */
export function svgAttrText(attrs: Record<string, string | number>): string {
  return Object.keys(attrs)
    .filter((k) => attrs[k] !== undefined && attrs[k] !== null)
    .map((k) => `${svgAttrName(k)}="${escapeAttrValue(attrs[k])}"`)
    .join(" ");
}

/** 图元 → SVG 字符串（发布端用） */
export function svgPrimitiveText(p: DecorPrimitive): string {
  const css = p.css && Object.keys(p.css).length > 0 ? ` style="${cssText(p.css)}"` : "";
  return `<${p.tag} ${svgAttrText(p.attrs)}${css}/>`;
}

/** 定义（渐变/裁剪） → SVG 字符串（发布端用） */
export function svgDefText(d: DecorDef): string {
  if (d.kind === "clip") {
    const r = d.rect ?? {};
    return `<clipPath id="${escapeAttrValue(d.id)}"><rect ${svgAttrText(r)}/></clipPath>`;
  }
  const stops = (d.stops ?? [])
    .map((s) => `<stop offset="${escapeAttrValue(s.offset)}" stop-color="${escapeAttrValue(s.color)}"${s.opacity === undefined ? "" : ` stop-opacity="${s.opacity}"`}/>`)
    .join("");
  const tag = d.kind === "radial" ? "radialGradient" : "linearGradient";
  return `<${tag} id="${escapeAttrValue(d.id)}" ${svgAttrText(d.attrs)}>${stops}</${tag}>`;
}

/** 图元 → React 元素（编辑区用） */
export function svgPrimitiveProps(p: DecorPrimitive): { tag: DecorPrimTag; attrs: Record<string, string | number>; style?: CssDecls } {
  return { tag: p.tag, attrs: p.attrs, style: p.css && Object.keys(p.css).length > 0 ? p.css : undefined };
}
