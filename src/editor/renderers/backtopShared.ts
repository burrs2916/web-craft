/**
 * 返回顶部按钮组件共享的纯逻辑（无 React 依赖）
 * 编辑器渲染器与发布端 codegen 共用，保证双端缩放语义一致。
 *
 * 缩放采用「收进框内」策略：取 宽、高 两个方向里更紧的缩放比，保证
 * 按钮在任意框比例下都完整、不被 overflow 裁切（默认框 44×44 → scale=1）。
 */
export function backtopScale(
  boxWidth: number | undefined,
  boxHeight: number | undefined,
  size: number,
  fullHeight: number,
): number {
  const naturalW = size > 0 ? size : 44;
  const naturalH = fullHeight > 0 ? fullHeight : size;
  const sw = typeof boxWidth === "number" && Number.isFinite(boxWidth) && boxWidth > 0 ? boxWidth / naturalW : 1;
  const sh = typeof boxHeight === "number" && Number.isFinite(boxHeight) && boxHeight > 0 ? boxHeight / naturalH : 1;
  const s = Math.min(sw, sh);
  if (!Number.isFinite(s)) return 1;
  return Math.min(Math.max(s, 0.5), 3);
}