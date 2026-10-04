import { useMemo } from 'react';
import { useEditorStore } from '../../../store/editorStore';
import { flattenLayerTree, type SceneComponent } from '../../../types/editor';
import { computeContentBottom } from '../../utils/contentBounds';
import { CANVAS_BOTTOM_PADDING } from '../../utils/canvasConstants';

/**
 * 画布场景的派生数据：可见根组件、父子关系映射与内容区高度。
 * 拆出后 EditorCanvas 只负责把这些数据接到视图上。
 */
export function useCanvasScene() {
  const components = useEditorStore((s) => s.components);
  const layers = useEditorStore((s) => s.layers);
  const canvasHeight = useEditorStore((s) => s.canvasConfig.height);
  const activeBreakpoint = useEditorStore((s) => s.activeBreakpoint);

  const sortedLayers = useMemo(
    () => flattenLayerTree(layers).filter((l) => l.type === 'layer'),
    [layers],
  );

  /** 只渲染根级组件（parentId 为空的），嵌套子组件由 EditorCanvasComponent 递归渲染 */
  const visibleComponents = useMemo(() => {
    return sortedLayers
      .filter((layer) => layer.visible)
      .flatMap((layer) =>
        components
          .filter((comp) => comp.layerId === layer.id && comp.visible && !comp.parentId)
          .map((comp) => ({ comp, layer })),
      );
  }, [sortedLayers, components]);

  /** 父子关系映射：parentId → 子组件数组（用于递归渲染） */
  const childrenMap = useMemo(() => {
    const map = new Map<string, SceneComponent[]>();
    for (const comp of components) {
      if (comp.parentId) {
        const siblings = map.get(comp.parentId);
        if (siblings) {
          siblings.push(comp);
        } else {
          map.set(comp.parentId, [comp]);
        }
      }
    }
    return map;
  }, [components]);

  /** 画布内容区高度：配置高度与内容绝对底部（响应式覆盖 + 嵌套）的最大值 */
  const canvasContentHeight = useMemo(() => {
    const maxBottom = computeContentBottom(components, activeBreakpoint);
    return Math.max(canvasHeight, maxBottom) + CANVAS_BOTTOM_PADDING;
  }, [components, canvasHeight, activeBreakpoint]);

  return { visibleComponents, childrenMap, canvasContentHeight };
}