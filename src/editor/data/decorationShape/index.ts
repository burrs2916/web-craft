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
 * 因此本目录把「形状 → SVG 图元」的推导收口成纯函数：
 *   - 编辑区 `DecorationShapeRenderer` 把图元映射为 React 元素；
 *   - 发布端 `codegen/components/decoration.ts` 把同一批图元拼成 SVG 字符串。
 * 两端不写任何几何字面量，逐字一致由此获得。
 *
 * 与既有约定保持一致：
 *   - 面板值 `borderRadius` 在装饰族按**像素**直接进 SVG `rx/ry`（与 tableStyle 同口径）；
 *   - 描边宽度、虚线节奏、`vector-effect: non-scaling-stroke` 全部保留原实现语义。
 *
 * 拆分说明（本目录）：
 *   - `types.ts`     图元/规格的类型定义
 *   - `stroke.ts`    描边口径与端点/转折选项
 *   - `fill.ts`      填充（纯色/渐变）与阴影口径
 *   - `geometry.ts`  各形状几何（`decorationShape` / `buildDecorationShape`）
 *   - `shapeSpec.ts` 形状组面板语义 → 装饰组图元
 *   - `svg.ts`       发布端字符串化与编辑区 props 映射
 */

export * from "./types";
export * from "./stroke";
export * from "./fill";
export * from "./geometry";
export * from "./shapeSpec";
export * from "./svg";