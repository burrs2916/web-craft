import type { ComponentRendererProps } from "../../types/editor";
import { DecorationSvg } from "./DecorationShapeRenderer";
import { shapeSpec } from "../data/decorationShape";

/**
 * 形状（ccat_shape）：多形状 + 渐变填充 + 描边细节 + 透明度 + 阴影。
 *
 * 几何不在这里实现 —— 由 `editor/data/decorationShape.ts` 的 `shapeSpec` 映射到形状图元，
 * 与装饰组件组共用同一套几何和同一个 SVG 渲染器：
 * `shape` 与 `decoration-rect` 画同一个矩形时**必然**长得一样，不存在两套字面量。
 *
 * 阴影同理：`decorationShape` 已按 `shadow` 档位写进 `spec.boxCss.filter`，
 * `DecorationSvg` 把 boxCss 铺在最外层容器上 → 与发布端 `renderDecorSpec` 落在同一层。
 */
export function ShapeRenderer({ config }: ComponentRendererProps) {
  return <DecorationSvg spec={shapeSpec(config)} />;
}
