/**
 * 画布内容边界计算
 *
 * 统一"内容底部"的唯一计算口径：响应式覆盖 + 嵌套父链绝对坐标。
 * store 的 fitCanvasHeightToContent 与 EditorCanvas 的内容区高度均使用此函数。
 */

import { getEffectiveTransform } from "../../types/editor";
import type { SceneComponent, BreakpointId } from "../../types/editor";

/**
 * 计算所有可见组件在指定断点下的绝对底部坐标。
 * 嵌套子组件沿父链累加 y 偏移；transform 取断点有效值（含 responsive overrides）。
 */
export function computeContentBottom(
  components: SceneComponent[],
  breakpoint: BreakpointId,
): number {
  const byId = new Map(components.map((c) => [c.id, c]));
  let maxBottom = 0;
  for (const comp of components) {
    if (!comp.visible) continue;
    const tf = getEffectiveTransform(comp, breakpoint);
    let absY = tf.y;
    let pid: string | null = comp.parentId ?? null;
    while (pid) {
      const parent = byId.get(pid);
      if (!parent) break;
      absY += getEffectiveTransform(parent, breakpoint).y;
      pid = parent.parentId ?? null;
    }
    const bottom = absY + (tf.height || 0);
    if (bottom > maxBottom) maxBottom = bottom;
  }
  return maxBottom;
}
