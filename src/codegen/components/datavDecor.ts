import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentCodegenFn, CodegenContext } from "../types";
import type { SceneComponent } from "../../types/editor";
import { DataVRenderer } from "../../editor/renderers/DataVRenderer";
import { DECORATION_ANIMATION_CSS } from "../../editor/renderers/decorationAnimation";
import {
  DATAV_DECOR_TYPES,
  datavMetaOf,
  datavMountedCss,
  parseDatavType,
  type DatavKind,
} from "../../editor/data/datavDecor";

/**
 * datav 装饰族（13 边框 + 12 装饰 = 25 个组件）的**发布端实现**。
 *
 * 修复的真实缺陷：这 25 个组件此前在 `codegen/components/index.ts` 里**一个都没注册**，
 * 于是 `engine.ts` 走 `generateUnsupportedComponent` —— 预览是橙色「codegen 待实现」占位，
 * **发布产物是一个空 div**，装饰在正式站点上彻底消失。
 *
 * 为什么不做「把 1900 行手写 SVG 再抄一份字符串版」：
 * 那必然产生第二份会漂移的几何（这个仓库已经因为同类做法栽过多次）。这里复用
 * **编辑区同一个 React 组件**做静态渲染（`renderToStaticMarkup`），几何/配色/SVG 属性
 * 与编辑区由构造保证逐字一致：唯一的差别是尺寸来源 —— 编辑区用 ResizeObserver 实测，
 * 发布端把组件 transform 的宽高经 `DatavRenderSizeContext` 注入（见 `datavRenderSize.ts`）。
 *
 * 三处必须与编辑区同源，因此都从共享模块读取，不写字面量：
 *   - 动画关键帧：`DECORATION_ANIMATION_CSS`（编辑区 injectAnimationKeyframes 用的同一份文本）
 *   - 容器 CSS（pointer-events + 线条粗细覆盖）：`datavMountedCss`（编辑区 <style data-datav-inject> 同一份）
 *   - 默认尺寸/配色：`editor/data/datavDecor.ts`
 *
 * 动画本身是 SVG SMIL（`<animate>`）与 CSS keyframes，都是声明式的 → 静态 HTML 里照常播放。
 */

/** 组件 id 可能含 `:` 等字符，进 id 前清洗（与装饰组的 safeId 同规则） */
function safeUid(componentId: string): string {
  return `datv${String(componentId).replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

/** 静态渲染尺寸：优先 transform，回退到元数据默认尺寸（保证永不出现 0×0） */
export function datavRenderSizeOf(component: SceneComponent): { width: number; height: number } {
  const parsed = parseDatavType(component.type);
  const meta = parsed ? datavMetaOf(parsed.kind, parsed.idx) : undefined;
  const t = component.transform as { width?: number; height?: number } | undefined;
  const w = Math.round(Number(t?.width) || 0);
  const h = Math.round(Number(t?.height) || 0);
  return {
    width: w > 0 ? w : (meta?.defaultSize.width ?? 400),
    height: h > 0 ? h : (meta?.defaultSize.height ?? 300),
  };
}

/**
 * 25 个 datav 组件共用同一个 codegen —— 具体是哪一种由 `component.type` 决定，
 * 因此不需要写 25 个会各自漂移的函数。
 */
export const datavDecorCodegen: ComponentCodegenFn = (component, ctx: CodegenContext): string => {
  const parsed = parseDatavType(component.type);
  if (!parsed) return "";

  const { kind, idx } = parsed as { kind: DatavKind; idx: number };
  const uid = safeUid(component.id);
  const size = datavRenderSizeOf(component);
  const config = (component.config ?? {}) as Record<string, unknown>;

  const markup = renderToStaticMarkup(
    createElement(DataVRenderer, {
      config,
      componentId: component.id,
      mode: "preview" as const,
      sizeOverride: size,
      uidOverride: uid,
    } as never),
  );

  /* 动画关键帧：全页一份（编辑区 injectAnimationKeyframes 注入的是同一段文本） */
  if (!ctx.pageStyles.some((s) => s.includes("deco-pulse"))) {
    ctx.pageStyles.push(DECORATION_ANIMATION_CSS);
  }
  /* 容器 CSS：pointer-events + 线条粗细覆盖（与编辑区容器内 <style> 同源） */
  const strokeWidth = Number(config.strokeWidth) || 1;
  const mountedCss = datavMountedCss(uid, kind, idx, strokeWidth);
  if (mountedCss && !ctx.pageStyles.includes(mountedCss)) {
    ctx.pageStyles.push(mountedCss);
  }

  return markup;
};

/** 注册清单（注册处与回归锁共用；顺序即边框 1..13 → 装饰 1..12） */
export { DATAV_DECOR_TYPES };
