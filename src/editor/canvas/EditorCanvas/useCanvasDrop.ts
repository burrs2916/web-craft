import { useCallback, useEffect, useMemo, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { useEditorStore } from '../../../store/editorStore';
import { componentRegistry } from '../../registry';
import { parseTabs, getActiveTabId } from '../../utils/tabsConfig';
import { getDragInfo, computeGuides } from '../../utils/alignmentGuides';
import { getEffectiveTransform, type SceneComponent } from '../../../types/editor';
import { getAbsoluteBounds, hitTestContainer } from './hitTest';
import type { DragPreview, DropTargetPreview, GuideLine } from './types';

/**
 * 画布拖放子系统：从组件库拖入的落点命中、投放预览、容器高亮与智能对齐参考线。
 */
export function useCanvasDrop({
  containerRef,
  screenToCanvas,
  cursorPos,
  setCursorPos,
  isPreview,
  visibleComponents,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  screenToCanvas: (clientX: number, clientY: number) => { x: number; y: number } | null;
  cursorPos: { x: number; y: number } | null;
  setCursorPos: Dispatch<SetStateAction<{ x: number; y: number } | null>>;
  isPreview: boolean;
  visibleComponents: { comp: SceneComponent }[];
}) {
  const components = useEditorStore((s) => s.components);
  const activeBreakpoint = useEditorStore((s) => s.activeBreakpoint);
  const canvasWidth = useEditorStore((s) => s.canvasConfig.width);
  const canvasHeight = useEditorStore((s) => s.canvasConfig.height);

  const [isDragOver, setIsDragOver] = useState(false);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [guides, setGuides] = useState<GuideLine[]>([]);

  const ensureDefaultLayer = useCallback(() => {
    const state = useEditorStore.getState();
    // 优先查找名为"默认图层"的图层，避免每次拖放都新建
    const firstLayer = state.layers.find((l) => l.type === 'layer');
    if (firstLayer) return firstLayer.id;
    const addLayer = state.addLayer;
    const newLayer = addLayer('默认图层');
    return newLayer.id;
  }, []);

  // 全局 dragend 清理：拖拽结束（无论成功/取消/越界）时重置状态，
  // 防止 draggedComponentType 残留导致下次拖拽行为异常
  useEffect(() => {
    const handleGlobalDragEnd = () => {
      const store = useEditorStore.getState();
      if (store.draggedComponentType) {
        store.setDraggedComponentType(null);
      }
      setIsDragOver(false);
      setCursorPos(null);
      setDropTargetId(null);
    };
    document.addEventListener('dragend', handleGlobalDragEnd);
    return () => document.removeEventListener('dragend', handleGlobalDragEnd);
  }, [setCursorPos]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    // 从 store 读取（dragStart 时写入，dragenter 阶段可靠），
    // dataTransfer.getData() 在 dragenter 阶段可能为空（浏览器安全限制）
    const compType =
      useEditorStore.getState().draggedComponentType ||
      e.dataTransfer?.getData('application/x-component-type') ||
      '';
    if (!compType) return;
    setIsDragOver(true);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      // preventDefault 必须在 compType 校验之前调用，确保 drop 始终被允许
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
      const compType =
        useEditorStore.getState().draggedComponentType ||
        e.dataTransfer?.getData('application/x-component-type') ||
        '';
      if (!compType) return;
      // 同步更新光标位置，驱动拖放预览
      const pos = screenToCanvas(e.clientX, e.clientY);
      if (pos) {
        setCursorPos({ x: Math.round(pos.x), y: Math.round(pos.y) });
        // 坐标 hit-test：找最深的可嵌入容器作为投放目标
        const storeState = useEditorStore.getState();
        const targetId = hitTestContainer(pos.x, pos.y, storeState.components, storeState.activeBreakpoint);
        setDropTargetId(targetId);
      }
    },
    [screenToCanvas, setCursorPos],
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const relatedTarget = e.relatedTarget as Node | null;
      if (relatedTarget && containerRef.current && containerRef.current.contains(relatedTarget)) {
        return;
      }
      setIsDragOver(false);
      setCursorPos(null);
      setDropTargetId(null);
    },
    [containerRef, setCursorPos],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      setCursorPos(null);
      setDropTargetId(null);

      const storeState = useEditorStore.getState();

      const compType =
        storeState.draggedComponentType ||
        e.dataTransfer?.getData('application/x-component-type') ||
        '';
      storeState.setDraggedComponentType(null);
      if (!compType) {
        console.warn('[EditorCanvas] Drop rejected: no component type (store + dataTransfer both empty)');
        return;
      }

      const definition = componentRegistry.get(compType);
      if (!definition) {
        console.warn(`[EditorCanvas] Drop rejected: "${compType}" not found in componentRegistry. Did pluginLoader.initialize() run?`);
        return;
      }

      const pos = screenToCanvas(e.clientX, e.clientY);
      if (!pos) {
        console.warn('[EditorCanvas] Drop rejected: screenToCanvas returned null (canvasContentRef not ready)');
        return;
      }

      let dw = definition.defaultSize.width;
      let dh = definition.defaultSize.height;
      let extraConfig: Record<string, unknown> | undefined;

      const cc = storeState.canvasConfig;

      // 自适应尺寸的组件类型：text 和 decoration-title-* 根据画布比例调整
      const adaptiveTypes: Record<string, (cw: number, ch: number) => { w: number; h: number; config?: Record<string, unknown> }> = {
        text: (cw, ch) => ({
          w: Math.round(cw * 0.5),
          h: Math.round(ch * 0.08),
          config: { fontSize: Math.max(10, Math.round(Math.min(cw, ch) / 60)) },
        }),
        'decoration-title-center-diamond': (cw, ch) => {
          const w = Math.round(cw * 0.35);
          const h = Math.max(40, Math.round(ch * 0.055));
          return {
            w, h,
            config: {
              diamondSizeX: Math.max(4, Math.round(h * 0.11)),
              diamondSizeY: Math.max(6, Math.round(h * 0.18)),
              diamondGap: Math.max(12, Math.round(w * 0.055)),
              decoLineLength: Math.max(6, Math.round(h * 0.25)),
            },
          };
        },
      };

      // 匹配 decoration-title-* 通用规则
      if (compType === 'text') {
        const result = adaptiveTypes.text(cc.width, cc.height);
        dw = result.w; dh = result.h; extraConfig = result.config;
      } else if (compType.startsWith('decoration-title-')) {
        const fn = adaptiveTypes[compType];
        if (fn) {
          const result = fn(cc.width, cc.height);
          dw = result.w; dh = result.h; extraConfig = result.config;
        } else {
          // 其他 decoration-title 变体：通用比例
          dw = Math.round(cc.width * 0.35);
          dh = Math.max(40, Math.round(cc.height * 0.055));
        }
      }

      // 坐标 hit-test：判断是否拖入容器
      const targetId = hitTestContainer(pos.x, pos.y, storeState.components, storeState.activeBreakpoint);
      setDropTargetId(null);

      let parentId: string | null = null;
      let targetLayerId: string | undefined;
      let dropX = Math.max(0, Math.round(pos.x - dw / 2));
      let dropY = Math.max(0, Math.round(pos.y - dh / 2));

      if (targetId) {
        parentId = targetId;
        const targetComp = storeState.components.find((c) => c.id === targetId);
        if (targetComp) {
          targetLayerId = targetComp.layerId;
          // 画布坐标 → 容器相对坐标（减去容器的绝对偏移）
          const bounds = getAbsoluteBounds(targetComp, storeState.components, storeState.activeBreakpoint);
          dropX = Math.max(0, Math.round(pos.x - bounds.x - dw / 2));
          dropY = Math.max(0, Math.round(pos.y - bounds.y - dh / 2));
        }
      }

      if (!targetLayerId) {
        targetLayerId = ensureDefaultLayer();
      }
      if (!targetLayerId) {
        console.warn('[EditorCanvas] Drop rejected: ensureDefaultLayer() returned null (no layers and creation failed)');
        return;
      }

      const newComponent = storeState.addComponent(compType, targetLayerId, {
        x: dropX,
        y: dropY,
      }, parentId);

      if (newComponent) {
        storeState.setActiveLayer(targetLayerId);

        if (extraConfig) {
          storeState.updateComponentConfig(newComponent.id, extraConfig);
        }

        // 拖入 Tabs 容器时，设置子组件的 __tabId（关联到父组件当前激活标签）
        if (parentId) {
          const parentComp = storeState.components.find((c) => c.id === parentId);
          if (parentComp?.type === 'tabs') {
            const tabs = parseTabs(parentComp.config);
            const activeTabId = getActiveTabId(parentComp.config, tabs);
            storeState.updateComponentConfig(newComponent.id, { __tabId: activeTabId });
          }
        }

        if (dw !== definition.defaultSize.width || dh !== definition.defaultSize.height) {
          storeState.updateComponentTransform(newComponent.id, {
            width: dw,
            height: dh,
          });
        }
      }
    },
    [screenToCanvas, setCursorPos, ensureDefaultLayer],
  );

  /** 拖放预览：当从组件库拖拽时，显示投放位置预览框 */
  const dragPreview = useMemo<DragPreview | null>(() => {
    if (!isDragOver || !cursorPos) return null;
    const compType = useEditorStore.getState().draggedComponentType;
    if (!compType) return null;
    const def = componentRegistry.get(compType);
    if (!def) return null;
    // 自适应尺寸的组件类型使用简化估算
    let dw = def.defaultSize.width;
    let dh = def.defaultSize.height;
    if (compType === 'text') {
      dw = Math.round(canvasWidth * 0.5);
      dh = Math.round(canvasHeight * 0.08);
    } else if (compType.startsWith('decoration-title-')) {
      dw = Math.round(canvasWidth * 0.35);
      dh = Math.max(40, Math.round(canvasHeight * 0.055));
    }
    const x = Math.max(0, Math.round(cursorPos.x - dw / 2));
    const y = Math.max(0, Math.round(cursorPos.y - dh / 2));
    return { x, y, w: dw, h: dh, label: def.name };
  }, [isDragOver, cursorPos, canvasWidth, canvasHeight]);

  /** 容器投放高亮：拖拽时高亮目标容器 */
  const dropTargetPreview = useMemo<DropTargetPreview | null>(() => {
    if (!isDragOver || !dropTargetId) return null;
    const targetComp = components.find((c) => c.id === dropTargetId);
    if (!targetComp) return null;
    const bounds = getAbsoluteBounds(targetComp, components, activeBreakpoint);
    return { ...bounds, id: dropTargetId };
  }, [isDragOver, dropTargetId, components, activeBreakpoint]);

  // ─── 智能对齐参考线：rAF 轮询 dragInfo 并计算参考线 ───
  useEffect(() => {
    if (isPreview) return;
    let raf = 0;
    const tick = () => {
      const drag = getDragInfo();
      if (drag) {
        // 构建其他组件矩形
        const others = visibleComponents
          .filter(({ comp }) => comp.id !== drag.id)
          .map(({ comp }) => {
            const tf = getEffectiveTransform(comp, activeBreakpoint);
            return { x: tf.x, y: tf.y, w: tf.width, h: tf.height };
          });
        const newGuides = computeGuides(drag, others, canvasWidth, canvasHeight);
        setGuides((prev) => {
          // 浅比较避免无意义 setState
          if (prev.length === newGuides.length && prev.every((g, i) => g.type === newGuides[i].type && g.position === newGuides[i].position)) {
            return prev;
          }
          return newGuides;
        });
      } else if (guides.length > 0) {
        setGuides([]);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPreview, visibleComponents, activeBreakpoint, canvasWidth, canvasHeight, guides.length]);

  return {
    isDragOver,
    dragPreview,
    dropTargetPreview,
    guides,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  };
}