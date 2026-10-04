/**
 * datav 装饰族（13 个边框 + 12 个装饰）的**唯一取值口径**。
 *
 * 此前这张元数据表在仓库里有**三份互不相同的副本**：
 *   1. `editor/registerDecorationComponents/`（面板 schema / defaultConfig / 尺寸）
 *   2. `editor/renderers/DataVRenderer.tsx` 的 `BORDER_DEFAULTS` / `DECO_DEFAULTS`
 *   3. `editor/renderers/DataVRenderer.tsx` 的 `*_WITH_REVERSE` / `*_WITH_DUR` 开关集合
 * 三份已经实际漂移：
 *   - 装饰 7/8/9/10 的默认主/副色，注册表与渲染器**各写一套不同颜色**；
 *   - `reverse` 开关：面板按 `{2,4,8,11}` 显示，渲染器按 `{2,4,8,10}` 传递 →
 *     装饰 11 面板上的「反转方向」是假能力，装饰 10 想反转却没有入口。
 *
 * 现在两者都只读本文件，禁止再写第二张表。
 * 本文件是**纯数据 + 纯函数**（不 import React），所以编辑区渲染器、组件注册与发布端
 * codegen 三方都能安全消费。
 */

export type DatavKind = "border" | "decoration";

export interface DatavMeta {
  idx: number;
  name: string;
  desc: string;
  icon: string;
  defaultSize: { width: number; height: number };
  minSize: { width: number; height: number };
  defaultColors: [string, string];
  hasReverse: boolean;
  hasDur: boolean;
  durDefault?: number;
  hasScanDur?: boolean;
}

/** 13 个 datav 边框 */
export const DATAV_BORDER_META: DatavMeta[] = [
  { idx: 1, name: "科技感角标边框", desc: "科技感角标边框", icon: "crop_free", defaultSize: { width: 400, height: 300 }, minSize: { width: 100, height: 80 }, defaultColors: ["#4fd2dd", "#235fa7"], hasReverse: false, hasDur: false },
  { idx: 2, name: "线段角标边框", desc: "线段角标边框", icon: "check_box_outline_blank", defaultSize: { width: 400, height: 300 }, minSize: { width: 100, height: 80 }, defaultColors: ["#fff", "rgba(255,255,255,0.6)"], hasReverse: false, hasDur: false },
  { idx: 3, name: "渐变线段边框", desc: "渐变线段边框", icon: "gradient", defaultSize: { width: 400, height: 300 }, minSize: { width: 80, height: 80 }, defaultColors: ["#2862b7", "#2862b7"], hasReverse: false, hasDur: false },
  { idx: 4, name: "流星边框", desc: "流星边框", icon: "flare", defaultSize: { width: 400, height: 300 }, minSize: { width: 100, height: 80 }, defaultColors: ["red", "rgba(0,0,255,0.8)"], hasReverse: true, hasDur: false },
  { idx: 5, name: "切角边框", desc: "切角边框", icon: "crop_square", defaultSize: { width: 400, height: 300 }, minSize: { width: 100, height: 80 }, defaultColors: ["rgba(255,255,255,0.35)", "rgba(255,255,255,0.20)"], hasReverse: true, hasDur: false },
  { idx: 6, name: "三角角标边框", desc: "三角角标边框", icon: "change_history", defaultSize: { width: 400, height: 300 }, minSize: { width: 100, height: 80 }, defaultColors: ["rgba(255,255,255,0.35)", "gray"], hasReverse: false, hasDur: false },
  { idx: 7, name: "光晕边框", desc: "光晕边框", icon: "blur_on", defaultSize: { width: 400, height: 300 }, minSize: { width: 100, height: 80 }, defaultColors: ["rgba(128,128,128,0.3)", "rgba(128,128,128,0.5)"], hasReverse: false, hasDur: false },
  { idx: 8, name: "流光边框", desc: "流光边框", icon: "linear_scale", defaultSize: { width: 400, height: 300 }, minSize: { width: 100, height: 80 }, defaultColors: ["#235fa7", "#4fd2dd"], hasReverse: true, hasDur: true, durDefault: 3 },
  { idx: 9, name: "微光边框", desc: "微光边框", icon: "gradient", defaultSize: { width: 400, height: 300 }, minSize: { width: 100, height: 80 }, defaultColors: ["#11eefd", "#0078d2"], hasReverse: false, hasDur: false },
  { idx: 10, name: "钻石角标边框", desc: "钻石角标边框", icon: "diamond", defaultSize: { width: 400, height: 300 }, minSize: { width: 100, height: 80 }, defaultColors: ["#1d48c4", "#d3e1f8"], hasReverse: false, hasDur: false },
  { idx: 11, name: "金箔雕花边框", desc: "四周带雕花卷曲装饰的标题边框（继承自 SVG 参考，标题位置可灵活调整）", icon: "auto_awesome", defaultSize: { width: 500, height: 320 }, minSize: { width: 240, height: 180 }, defaultColors: ["#e1b86c", "#8c5c00"], hasReverse: true, hasDur: false },
  { idx: 12, name: "扫描边框", desc: "扫描边框", icon: "view_stream", defaultSize: { width: 400, height: 300 }, minSize: { width: 100, height: 80 }, defaultColors: ["#2e6099", "#7ce7fd"], hasReverse: false, hasDur: false },
  { idx: 13, name: "折线角标边框", desc: "折线角标边框", icon: "show_chart", defaultSize: { width: 400, height: 300 }, minSize: { width: 100, height: 80 }, defaultColors: ["#6586ec", "#2cf7fe"], hasReverse: false, hasDur: false },
];

/** 12 个 datav 装饰 */
export const DATAV_DECO_META: DatavMeta[] = [
  { idx: 1, name: "点阵装饰", desc: "点阵装饰", icon: "blur_on", defaultSize: { width: 400, height: 50 }, minSize: { width: 100, height: 30 }, defaultColors: ["#fff", "#0de7c2"], hasReverse: false, hasDur: false },
  { idx: 2, name: "扫描线装饰", desc: "扫描线装饰", icon: "linear_scale", defaultSize: { width: 400, height: 6 }, minSize: { width: 60, height: 4 }, defaultColors: ["#3faacb", "#fff"], hasReverse: true, hasDur: true, durDefault: 6 },
  { idx: 3, name: "闪烁点阵装饰", desc: "闪烁点阵装饰", icon: "grid_on", defaultSize: { width: 400, height: 35 }, minSize: { width: 100, height: 20 }, defaultColors: ["#7acaec", "transparent"], hasReverse: false, hasDur: false },
  { idx: 4, name: "渐变边框装饰", desc: "渐变边框装饰", icon: "gradient", defaultSize: { width: 400, height: 300 }, minSize: { width: 20, height: 60 }, defaultColors: ["rgba(255,255,255,0.3)", "rgba(255,255,255,0.3)"], hasReverse: true, hasDur: true, durDefault: 3 },
  { idx: 5, name: "折线装饰", desc: "折线装饰", icon: "show_chart", defaultSize: { width: 400, height: 60 }, minSize: { width: 100, height: 30 }, defaultColors: ["#3f96a5", "#3f96a5"], hasReverse: false, hasDur: true, durDefault: 1.2 },
  { idx: 6, name: "柱状跳动装饰", desc: "柱状跳动装饰", icon: "bar_chart", defaultSize: { width: 400, height: 35 }, minSize: { width: 100, height: 20 }, defaultColors: ["#7acaec", "#7acaec"], hasReverse: false, hasDur: false },
  { idx: 7, name: "双翼装饰", desc: "双翼装饰（左右对角张开 + 中间弧形带）", icon: "arrow_outward", defaultSize: { width: 540, height: 180 }, minSize: { width: 360, height: 120 }, defaultColors: ["#FF0000", "#750000"], hasReverse: false, hasDur: false },
  /* 缠枝纹饰带：CurlingBranchBand 不消费 reverse（徽章形对称，无反向语义）→ hasReverse 必须为 false，
     否则面板出现假开关（2026-09-20 诚实性扫描实证） */
  { idx: 8, name: "缠枝纹饰带", desc: "缠枝纹饰带（徽章形双环 + 四角缠枝纹）", icon: "change_history", defaultSize: { width: 300, height: 50 }, minSize: { width: 60, height: 30 }, defaultColors: ["#C89F49", "#C89F49"], hasReverse: false, hasDur: false },
  { idx: 9, name: "流光飘带", desc: "流光飘带（细弧放射 + 金色渐变上下水流动）", icon: "auto_awesome", defaultSize: { width: 300, height: 450 }, minSize: { width: 120, height: 180 }, defaultColors: ["#8C5C00", "#FFE680"], hasReverse: false, hasDur: true, durDefault: 3 },
  { idx: 10, name: "雕花边框", desc: "雕花边框（4 角花 + 左/右各 3 边花，矩形装饰）", icon: "auto_awesome_motion", defaultSize: { width: 300, height: 450 }, minSize: { width: 120, height: 180 }, defaultColors: ["#00AEEF", "rgba(0,174,239,0.3)"], hasReverse: false, hasDur: false },
  { idx: 11, name: "金色卷草花纹边框", desc: "金色卷草花纹边框（对角线 L 形饰带 + 右上左下卷草花纹，参考古典金箔雕花风格）", icon: "auto_awesome", defaultSize: { width: 400, height: 300 }, minSize: { width: 80, height: 40 }, defaultColors: ["#C89F49", "#8c5c00"], hasReverse: true, hasDur: false },
  { idx: 12, name: "雷达装饰", desc: "雷达装饰", icon: "trip_origin", defaultSize: { width: 200, height: 200 }, minSize: { width: 80, height: 80 }, defaultColors: ["#2783ce", "#2cf7fe"], hasReverse: false, hasDur: false, hasScanDur: true },
];

export function datavMetaTable(kind: DatavKind): DatavMeta[] {
  return kind === "border" ? DATAV_BORDER_META : DATAV_DECO_META;
}

export function datavMetaOf(kind: DatavKind, idx: number | string): DatavMeta | undefined {
  const n = Number(idx);
  return datavMetaTable(kind).find((m) => m.idx === n);
}

/** 面板 / 注册表 / 渲染器统一的组件 type */
export function datavTypeOf(kind: DatavKind, idx: number): string {
  return `datav-${kind}-${idx}`;
}

/** `datav-border-8` → `{ kind: "border", idx: 8 }`；非法返回 null */
export function parseDatavType(type: string): { kind: DatavKind; idx: number } | null {
  const m = /^datav-(border|decoration)-(\d+)$/.exec(type);
  if (!m) return null;
  return { kind: m[1] as DatavKind, idx: Number(m[2]) };
}

/** 全部 datav 组件 type（注册处、codegen 注册与回归锁共用同一份清单） */
export const DATAV_DECOR_TYPES: string[] = [
  ...DATAV_BORDER_META.map((m) => datavTypeOf("border", m.idx)),
  ...DATAV_DECO_META.map((m) => datavTypeOf("decoration", m.idx)),
];

/** 默认配色（渲染器缺省值 = 面板缺省值，只有一份） */
export function datavDefaultColors(kind: DatavKind, idx: number | string): [string, string] {
  return datavMetaOf(kind, idx)?.defaultColors ?? ["#4fd2dd", "#235fa7"];
}

export function datavDefaultDur(kind: DatavKind, idx: number | string): number {
  return datavMetaOf(kind, idx)?.durDefault ?? 3;
}

function keysWhere(pred: (m: DatavMeta) => boolean): Set<string> {
  const out = new Set<string>();
  for (const [kind, table] of [["border", DATAV_BORDER_META], ["decoration", DATAV_DECO_META]] as const) {
    for (const m of table) {
      if (pred(m)) out.add(datavTypeOf(kind, m.idx));
    }
  }
  return out;
}

/** 支持「反转方向」的 type 集合（由元数据派生，不再手写第二份） */
export const DATAV_WITH_REVERSE: Set<string> = keysWhere((m) => m.hasReverse);

/** 支持「动画时长」的 type 集合 */
export const DATAV_WITH_DUR: Set<string> = keysWhere((m) => m.hasDur);

/** 需要承载子节点的编组（边框天然可放内容；装饰中只有 7/9/12 需要 children 容器） */
export const DATAV_WITH_CHILDREN: Set<string> = new Set([
  "datav-decoration-7",
  "datav-decoration-9",
  "datav-decoration-12",
]);

export interface StrokeRule {
  selector: string;
  baseWidth: number;
}

/**
 * 线条粗细按「倍率」缩放时需要通过 CSS 覆盖的 SVG 元素。
 *
 * **只收「静态线宽字面量」**——即那个 `stroke-width` 不随 `strokeWidth` 配置变化、
 * 只认死值的元素。反过来，凡是几何内部已经 `× strokeWidth` 的元素（例如雷达的
 * `strokeWidth={RADAR_CENTER * sw}`）**绝对不能**写进这张表：再叠一层 CSS 覆盖会变成
 * 平方级放大。
 *
 * 这张表此前是手写的，而且**全部失效**——选择器指向的元素早已在重写组件时被换掉
 * （例如 deco-7 的 `polyline` 改成了 `path`），于是「线条粗细」在 deco-11 上是个
 * 完全没反应的假控件。现在由 `datav-decor.test.ts` 的契约用例**从真实产物里重算**并
 * 与本节比对：任何组件改了 SVG 而没同步本表，测试立刻红。
 */
export const DATAV_STROKE_RULES: Record<string, StrokeRule[]> = {
  "border-2": [{ selector: "polyline[stroke-width='1']", baseWidth: 1 }],
  "border-3": [{ selector: "polyline[stroke-width='3']", baseWidth: 3 }, { selector: "polyline[stroke-width='1']", baseWidth: 1 }],
  "border-4": [{ selector: "polyline[stroke-width='1']", baseWidth: 1 }, { selector: "polyline[stroke-width='3']", baseWidth: 3 }],
  "border-5": [{ selector: "polyline[stroke-width='1']", baseWidth: 1 }, { selector: "polyline[stroke-width='5']", baseWidth: 5 }, { selector: "polyline[stroke-width='2']", baseWidth: 2 }],
  "border-6": [{ selector: "polyline[stroke-width='1']", baseWidth: 1 }],
  "border-7": [{ selector: "polyline[stroke-width='2']", baseWidth: 2 }, { selector: "polyline[stroke-width='5']", baseWidth: 5 }],
  "border-8": [{ selector: "use[stroke-width='1']", baseWidth: 1 }, { selector: "use[stroke-width='3']", baseWidth: 3 }, { selector: "use[stroke-width='1.5']", baseWidth: 1.5 }],
  "border-9": [{ selector: "polyline[stroke-width='3']", baseWidth: 3 }],
  "border-10": [{ selector: "rect[stroke-width='2']", baseWidth: 2 }, { selector: "rect[stroke-width='1']", baseWidth: 1 }, { selector: "path[stroke-width='3']", baseWidth: 3 }],
  "border-11": [{ selector: "path[stroke-width='14']", baseWidth: 14 }, { selector: "path[stroke-width='6']", baseWidth: 6 }],
  "deco-11": [{ selector: "polygon[stroke-width='1']", baseWidth: 1 }],
};

/**
 * 「线条粗细」这个面板控件在该组件上是否**真的有效果**。
 *
 * 判据是实测而非猜测（`datav-decor.test.ts` 有一条契约用例逐组件验证
 * 「面板显示了它，就一定能改变产物」）：
 *   - 装饰族：1/2/3/4/5/6/7/8/9/11/12 都把 `strokeWidth` 吃进几何或静态线宽表 → 有效；
 *     **10 雕花边框是纯填充路径（参考 SVG 明确「无描边」）**，没有任何线宽可调 → 隐藏控件；
 *   - 边框族：12/13 由几何驱动，2..11 靠静态线宽表 → 有效；
 *     **1 科技感角标边框是纯填充多边形**（13 个 polygon 全无描边）→ 隐藏控件。
 */
export function datavStrokeWidthSupported(kind: DatavKind, idx: number | string): boolean {
  if (kind === "border") return Number(idx) >= 2;
  return Number(idx) !== 10;
}

/** `deco-7` / `border-12` 形式的 stroke 规则键 */
export function datavStrokeKey(kind: DatavKind, idx: number | string): string {
  return `${kind === "decoration" ? "deco" : "border"}-${idx}`;
}

function strokeSelector(uid: string, selector: string): string {
  if (selector.startsWith(".dv-border-svg-container")) {
    return `#${uid} ${selector}`;
  }
  return `#${uid} svg ${selector}`;
}

/**
 * 线条粗细覆盖 CSS。**编辑区与发布端共用本函数**：
 * 编辑区把它塞进容器内的 <style>，发布端把同一份文本推进页面样式表。
 */
export function datavStrokeCss(uid: string, kind: DatavKind, idx: number | string, multiplier: number): string {
  const rules = DATAV_STROKE_RULES[datavStrokeKey(kind, idx)];
  if (!rules || rules.length === 0 || multiplier === 1) return "";
  return rules
    .map((rule) => `${strokeSelector(uid, rule.selector)}{stroke-width:${rule.baseWidth * multiplier}px!important}`)
    .join("");
}

/** 组件本体不吃鼠标事件（编辑区的选中/拖动由外层接管） */
export function datavPointerEventsCss(uid: string): string {
  return `#${uid}>*{pointer-events:none!important}`;
}

/**
 * 发布端 / 编辑区共用的「容器挂载 CSS」。
 *
 * 编辑区目前把它注入容器内的 `<style data-datav-inject>`，发布端把**同一份文本**推进
 * 页面样式表 —— 两端线条粗细表现必然一致。
 */
export function datavMountedCss(uid: string, kind: DatavKind, idx: number | string, strokeWidth: number): string {
  return datavPointerEventsCss(uid) + datavStrokeCss(uid, kind, idx, strokeWidth);
}
