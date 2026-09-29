/**
 * 装饰形状图元模型的类型定义。
 *
 * 「形状 → SVG 图元」的推导收口在 `geometry.ts`：
 *   - 编辑区 `DecorationShapeRenderer` 把图元映射为 React 元素；
 *   - 发布端 `codegen/components/decoration.ts` 把同一批图元拼成 SVG 字符串。
 * 两端不写任何几何字面量，逐字一致由此获得。
 */

import type { CssDecls } from "../cssDecls";

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

/** 形状描边样式的公共取值：颜色 / 粗细 / 是否描边 / 虚线节奏 */
export interface DecorStroke {
  stroke: string;
  strokeWidth: number;
  hasStroke: boolean;
  dashArray: string;
}

export interface DecorShapeOptions {
  /** 拖动框尺寸（椭圆需要真实比例；缺省用设计基准） */
  width?: number;
  height?: number;
  /** 需要 id 隔离的渐变用（编辑区传 useId，发布端传组件 id） */
  uid?: string;
}

/** `gradientEnabled` 关闭时用 `fill`，开启时改用一个按组件隔离的 linearGradient/radialGradient */
export interface DecorFillResult {
  fill: string;
  defs: DecorDef[];
}