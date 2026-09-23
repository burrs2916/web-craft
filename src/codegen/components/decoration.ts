import type { ComponentCodegenFn, CodegenContext } from "../types";
import { cssText } from "../../editor/data/cssDecls";
import { decorationShape, svgDefText, svgPrimitiveText, type DecorPrimitive, type DecorShapeSpec } from "../../editor/data/decorationShape";
import {
  DECORATION_ANIMATION_CSS,
  buildDecorationContainerDecls,
  decorationOverlayAttrs,
  decorationOverlayCss,
  getSvgLineEffectProps,
  isDecorationAnimationIdle,
  SVG_OVERLAY_EFFECTS,
  toAnimationConfig,
  type LineEffectType,
} from "../../editor/renderers/decorationAnimation";

/**
 * 装饰组件组的发布端实现（本轮从 0 到 1）。
 *
 * 修复的真实缺陷：本文件此前**不存在**，`codegen/components/index.ts` 里也没有任何
 * `decoration-*` 注册，于是 20 个原生装饰 + 25 个 datav 装饰在发布端走了
 * `generateUnsupportedComponent`：
 *   - 预览：橙色「codegen 待实现」占位块；
 *   - 发布：**一个空 div** —— 组件在正式站点上彻底消失（"发布与编辑一致"直接失效）。
 *
 * 几何与配色的唯一来源是 `editor/data/decorationShape.ts`：编辑区渲染器把图元映射成
 * React 元素，这里把同一批图元拼成 SVG 字符串，两端不各写一份字面量。
 * 形状组件组（`shape`）经 `shapeSpec` 复用同一套图元与本文件同一个发射器。
 */

/** 组件 id 可能含 `:` 等字符，进 SVG id / url(#…) 前清洗 */
function safeId(id: string): string {
  return `d${String(id).replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

/**
 * 图元声明 → 发布端 HTML 片段。**装饰组与形状组共用同一个发射器**，
 * 保证"同一份图元"在发布端只有一套字符串化规则。
 */
export function renderDecorSpec(
  spec: DecorShapeSpec,
  ctx: CodegenContext,
  extraBoxCss: Record<string, string> = {},
  /**
   * 组件 config：提供时按其中的 animation / lineEffect 输出容器动画与描边克隆图元。
   * 不提供 = 完全保持旧行为（形状组件组无需动画面板，行为逐字不变）。
   */
  animationConfig?: Record<string, unknown>,
): string {
  // 渐变动画的关键帧：同页多个组件共用同一份，注入一次即可
  if (spec.keyframes && !ctx.pageStyles.some((s) => s.includes("deco-grad-shift"))) {
    ctx.pageStyles.push(spec.keyframes);
  }

  const animConfig = animationConfig ? toAnimationConfig(animationConfig) : null;
  const animated = !!animConfig && !isDecorationAnimationIdle(animConfig);
  if (animated && !ctx.pageStyles.some((s) => s.includes("deco-pulse"))) {
    /* 与编辑区 injectAnimationKeyframes 注入的是同一段文本 */
    ctx.pageStyles.push(DECORATION_ANIMATION_CSS);
  }

  const defs = spec.defs && spec.defs.length > 0
    ? `<defs>${spec.defs.map(svgDefText).join("")}</defs>`
    : "";

  let body = spec.primitives.map(svgPrimitiveText).join("");
  if (animated) {
    const overlays = decorationOverlayPrims(spec, animationConfig!);
    if (overlays.length > 0) {
      body += `<g data-datav-effect-overlay="true" pointer-events="none">${overlays.map(svgPrimitiveText).join("")}</g>`;
    }
  }

  const svgStyle: Record<string, string> = {
    ...(spec.overflowVisible ? { overflow: "visible" } : {}),
    ...(spec.svgCss ?? {}),
  };
  const svgStyleAttr = Object.keys(svgStyle).length > 0 ? ` style="${cssText(svgStyle)}"` : "";

  /* 动画开启时容器声明走公共口径（含 overflow:visible），否则保持旧的四行声明 */
  const baseBox = { width: "100%", height: "100%", ...(spec.boxCss ?? {}), ...extraBoxCss };
  const boxStyle = animated
    ? cssText(buildDecorationContainerDecls(animConfig!, baseBox))
    : cssText(baseBox);

  return `<div style="${boxStyle}"><svg width="100%" height="100%" viewBox="${spec.viewBox}" preserveAspectRatio="${spec.preserveAspectRatio}"${svgStyleAttr}>${defs}${body}</svg></div>`;
}

/* ──────────────────────────────────────────────
 * 动画 / 线条特效的发布端落地
 *
 * 修复的真实缺陷：装饰组的「动画」12 种与「线条特效」14 种此前**只有编辑区生效**
 * （`DecorationWrapper` 是 React 层实现），发布端完全没有这段逻辑 —— 面板上改了动画，
 * 编辑区动、正式站点一动不动。这里用 `decorationAnimation.ts` 暴露的同一批纯函数
 * 生成等价的容器声明与描边克隆图元，两端口径同源。
 * ────────────────────────────────────────────── */

/** 描边图元的标签（与 DecorationWrapper 的 STROKE_ELEMENTS 同一批） */
const STROKE_PRIM_TAGS: ReadonlySet<string> = new Set(["line", "rect", "circle", "ellipse", "polygon", "polyline", "path"]);

/** 与编辑区一致的判据：有 stroke 且不是 none/transparent */
function isStrokedPrimitive(p: { tag: string; attrs: Record<string, string | number> }): boolean {
  if (!STROKE_PRIM_TAGS.has(p.tag)) return false;
  const stroke = p.attrs.stroke;
  return !!stroke && stroke !== "none" && stroke !== "transparent";
}

/**
 * 线条特效需要的「描边克隆图元组」。
 * 对应编辑区 `DecorationWrapper.addSvgOverlay` / `DataVRenderer.applyDataVLineEffectOverlays`：
 * 把每个描边图元复制一份、换成特效的描边样式并叠加在原件之上。
 */
export function decorationOverlayPrims(
  spec: DecorShapeSpec,
  config: Record<string, unknown>,
): DecorPrimitive[] {
  const animConfig = toAnimationConfig(config);
  const effect = (animConfig.lineEffect as LineEffectType) || "none";
  if (!SVG_OVERLAY_EFFECTS.has(effect)) return [];
  const effectProps = getSvgLineEffectProps(animConfig);
  if (!effectProps) return [];

  return spec.primitives.filter(isStrokedPrimitive).map((p) => ({
    tag: p.tag,
    attrs: {
      ...p.attrs,
      ...decorationOverlayAttrs(effectProps, { stroke: p.attrs.stroke, strokeWidth: p.attrs.strokeWidth }),
    },
    css: decorationOverlayCss(effectProps),
  }));
}

/** 从组件派生 uid（编辑区用 useId，发布端用组件 id —— 两者只需页内唯一） */
export function decorUid(componentId: string): string {
  return safeId(componentId);
}

function renderDecoration(component: Parameters<ComponentCodegenFn>[0], ctx: CodegenContext): string {
  const t = component.transform as { width?: number; height?: number } | undefined;
  const config = (component.config ?? {}) as Record<string, unknown>;
  const spec = decorationShape(component.type, config, {
    width: t?.width,
    height: t?.height,
    uid: decorUid(component.id),
  });
  return renderDecorSpec(spec, ctx, {}, config);
}

/**
 * 20 个原生装饰形状共用同一个 codegen —— 形状种类由 `component.type` 决定，
 * 因此无需为每个类型各写一个函数（写了就又是 20 份会漂移的副本）。
 */
export const decorationShapeCodegen: ComponentCodegenFn = (component, ctx) => renderDecoration(component, ctx);

/** 原生装饰形状的全部类型（注册处与测试共用同一份清单） */
export const DECORATION_SHAPE_KINDS: string[] = [
  "decoration-rect",
  "decoration-circle",
  "decoration-ellipse",
  "decoration-triangle",
  "decoration-polygon",
  "decoration-star",
  "decoration-ring",
  "decoration-diamond",
  "decoration-cross",
  "decoration-divider",
  "decoration-wave",
  "decoration-dashed-box",
  "decoration-gradient",
  "decoration-corner",
  "decoration-dot",
  "decoration-grid",
  "decoration-diagonal",
  "decoration-dots-pattern",
  "decoration-line",
  "decoration-arrow",
];
