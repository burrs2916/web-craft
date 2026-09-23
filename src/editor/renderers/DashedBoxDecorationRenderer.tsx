import { createDecorationShapeRenderer } from "./DecorationShapeRenderer";

/**
 * 虚线框装饰（编辑区）。
 *
 * 几何 / 配色 / 描边节奏等字面量已收口到 `editor/data/decorationShape.ts`，
 * 编辑区与发布端 codegen 读同一份声明（同批字面量写两处必然漂移，本仓库已多次踩坑）。
 * 本文件只保留「形状种类 → 编辑区渲染器」这一条绑定。
 */
export const DashedBoxDecorationRenderer = createDecorationShapeRenderer("decoration-dashed-box");
