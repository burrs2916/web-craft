import { getEffectiveTransform, type SceneComponent, type BreakpointId } from '../../../types/editor';
import { componentRegistry } from '../../registry';

/**
 * 计算组件在画布中的绝对位置（沿父链累加 transform 偏移）。
 * 用于坐标 hit-test 和投放坐标转换。
 */
export function getAbsoluteBounds(
  comp: SceneComponent,
  components: SceneComponent[],
  activeBreakpoint: BreakpointId,
): { x: number; y: number; width: number; height: number } {
  const tf = getEffectiveTransform(comp, activeBreakpoint);
  let absX = tf.x;
  let absY = tf.y;
  let pid: string | null = comp.parentId ?? null;
  while (pid) {
    const parent = components.find((c) => c.id === pid);
    if (!parent) break;
    const parentTf = getEffectiveTransform(parent, activeBreakpoint);
    absX += parentTf.x;
    absY += parentTf.y;
    pid = parent.parentId ?? null;
  }
  return { x: absX, y: absY, width: tf.width, height: tf.height };
}

/**
 * 坐标 hit-test：找到光标下最深的可嵌入容器。
 * 遍历所有 embeddable 组件，计算绝对 bounds，返回嵌套最深的命中容器 ID。
 */
export function hitTestContainer(
  canvasX: number,
  canvasY: number,
  components: SceneComponent[],
  activeBreakpoint: BreakpointId,
): string | null {
  const embeddables = components.filter((c) => {
    const def = componentRegistry.get(c.type);
    return def?.capabilities?.embeddable && c.visible;
  });

  const hits: { id: string; depth: number }[] = [];
  for (const comp of embeddables) {
    const bounds = getAbsoluteBounds(comp, components, activeBreakpoint);
    if (
      canvasX >= bounds.x &&
      canvasX <= bounds.x + bounds.width &&
      canvasY >= bounds.y &&
      canvasY <= bounds.y + bounds.height
    ) {
      let depth = 0;
      let pid: string | null = comp.parentId ?? null;
      while (pid) {
        depth++;
        const parent = components.find((c) => c.id === pid);
        if (!parent) break;
        pid = parent.parentId ?? null;
      }
      hits.push({ id: comp.id, depth });
    }
  }

  if (hits.length === 0) return null;
  hits.sort((a, b) => b.depth - a.depth);
  return hits[0].id;
}