import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Divider from "@mui/material/Divider";
import AddIcon from "@mui/icons-material/Add";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import FitScreenIcon from "@mui/icons-material/FitScreen";
import { useRef, useCallback, useState, useMemo, useEffect } from "react";
import { useEditorStore } from "../../store/editorStore";
import { useSceneEventBridge } from "../hooks/useSceneEventBridge";
import { EditorCanvasComponent } from "./EditorCanvasComponent";
import { CanvasErrorBoundary } from "./CanvasErrorBoundary";
import { EditorRuler } from "./EditorRuler";
import { flattenLayerTree, getEffectiveTransform, type SceneComponent, type BreakpointId } from "../../types/editor";
import { componentRegistry } from "../registry";
import { toAssetUrl } from "../utils/assetUrl";
import { parseTabs, getActiveTabId } from "../utils/tabsConfig";
import {
  MIN_ZOOM,
  MAX_ZOOM,
  ZOOM_STEP,
  CANVAS_BOTTOM_PADDING,
  clampZoom,
} from "../utils/canvasConstants";
import { computeContentBottom } from "../utils/contentBounds";
import { getDragInfo, computeGuides, type GuideLine } from "../utils/alignmentGuides";

/**
 * 计算组件在画布中的绝对位置（沿父链累加 transform 偏移）。
 * 用于坐标 hit-test 和投放坐标转换。
 */
function getAbsoluteBounds(
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
function hitTestContainer(
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

interface EditorCanvasProps {
  previewMode?: boolean;
}

export function EditorCanvas({ previewMode: previewModeProp }: EditorCanvasProps = {}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasContentRef = useRef<HTMLDivElement>(null);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });
  const pendingCenterRef = useRef(false);

  const components = useEditorStore((s) => s.components);
  const layers = useEditorStore((s) => s.layers);
  const canvasConfig = useEditorStore((s) => s.canvasConfig);
  const previewModeState = useEditorStore((s) => s.previewMode);
  const eventBindings = useEditorStore((s) => s.eventBindings);
  const zoom = useEditorStore((s) => s.zoom);
  const activeBreakpoint = useEditorStore((s) => s.activeBreakpoint);

  const isPreview = previewModeProp ?? previewModeState;

  const deselectAll = useEditorStore((s) => s.deselectAll);
  const selectComponent = useEditorStore((s) => s.selectComponent);
  const setHoveredComponent = useEditorStore((s) => s.setHoveredComponent);
  const setZoom = useEditorStore((s) => s.setZoom);
  const zoomIn = useEditorStore((s) => s.zoomIn);
  const zoomOut = useEditorStore((s) => s.zoomOut);
  const zoomToFit = useEditorStore((s) => s.zoomToFit);
  const resetZoom = useEditorStore((s) => s.resetZoom);
  const setContainerSize = useEditorStore((s) => s.setContainerSize);

  const sortedLayers = useMemo(
    () => flattenLayerTree(layers).filter((l) => l.type === "layer"),
    [layers],
  );

  useSceneEventBridge(containerRef);

  const [isDragOver, setIsDragOver] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [guides, setGuides] = useState<GuideLine[]>([]);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  // ─── 居中画布 ───
  const centerCanvas = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const sw = canvasConfig.width * zoom;
    const sh = canvasConfig.height * zoom;
    container.scrollLeft = Math.max(0, (sw - cw) / 2);
    container.scrollTop = Math.max(0, (sh - ch) / 2);
  }, [canvasConfig.width, canvasConfig.height, zoom]);

  // ─── ResizeObserver：窗口拖动时自动 re-fit + 居中 ───
  const initializedRef = useRef(false);
  useEffect(() => {
    const container = containerRef.current;
    if (!container || isPreview) return;

    let prevW = 0;
    let prevH = 0;
    let fitTimer: ReturnType<typeof setTimeout> | null = null;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      setContainerSize(rect.width, rect.height);

      // 首次：直接 fit
      if (!initializedRef.current && rect.width > 0 && rect.height > 0) {
        initializedRef.current = true;
        zoomToFit();
        pendingCenterRef.current = true;
        prevW = rect.width;
        prevH = rect.height;
        return;
      }

      // 后续变化：尺寸差异 > 2px 时 debounce 200ms 重新 fit + 居中
      if (Math.abs(rect.width - prevW) > 2 || Math.abs(rect.height - prevH) > 2) {
        prevW = rect.width;
        prevH = rect.height;
        if (fitTimer) clearTimeout(fitTimer);
        fitTimer = setTimeout(() => {
          zoomToFit();
          pendingCenterRef.current = true;
        }, 200);
      }
    };

    updateSize();

    const ro = new ResizeObserver(() => updateSize());
    ro.observe(container);

    return () => {
      ro.disconnect();
      if (fitTimer) clearTimeout(fitTimer);
    };
  }, [setContainerSize, isPreview, zoomToFit]);

  // zoom 变化后如果需要居中
  useEffect(() => {
    if (!pendingCenterRef.current) return;
    const raf = requestAnimationFrame(() => {
      centerCanvas();
      pendingCenterRef.current = false;
    });
    return () => cancelAnimationFrame(raf);
  }, [zoom, centerCanvas]);

  // ─── 键盘：空格键平移模式 ───
  useEffect(() => {
    if (isPreview) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat) {
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
        e.preventDefault();
        setSpaceHeld(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        setSpaceHeld(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [isPreview]);

  // ─── Ctrl+滚轮缩放（锚定光标位置，函数式读取 store，避免闭包丢帧）───
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const container = containerRef.current;
    const canvas = canvasContentRef.current;
    const oldZoom = useEditorStore.getState().zoom;
    const newZoom = clampZoom(oldZoom + (e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP));
    if (newZoom === oldZoom) return;
    if (!container || !canvas) {
      setZoom(newZoom);
      return;
    }

    // 记录光标下的内容坐标（缩放无关）
    const rect = canvas.getBoundingClientRect();
    const contentX = (e.clientX - rect.left) / oldZoom;
    const contentY = (e.clientY - rect.top) / oldZoom;

    setZoom(newZoom);

    // 重绘后修正 scroll，使光标下的内容点保持在原视觉位置（居中 margin 变化已被新 rect 吸收）
    requestAnimationFrame(() => {
      const newRect = canvas.getBoundingClientRect();
      container.scrollLeft += newRect.left - (e.clientX - contentX * newZoom);
      container.scrollTop += newRect.top - (e.clientY - contentY * newZoom);
    });
  }, [setZoom]);

  /** 将屏幕坐标转换为画布内容坐标（考虑缩放） */
  const screenToCanvas = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasContentRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / zoom,
      y: (clientY - rect.top) / zoom,
    };
  }, [zoom]);

  // ─── 鼠标坐标标签：rAF 节流 + 值不变时复用引用（避免全画布重渲染）───
  const cursorRafRef = useRef(0);
  const pendingCursorRef = useRef<{ x: number; y: number } | null>(null);
  const queueCursorUpdate = useCallback((clientX: number, clientY: number) => {
    pendingCursorRef.current = { x: clientX, y: clientY };
    if (cursorRafRef.current) return;
    cursorRafRef.current = requestAnimationFrame(() => {
      cursorRafRef.current = 0;
      const pending = pendingCursorRef.current;
      pendingCursorRef.current = null;
      if (!pending) return;
      const pos = screenToCanvas(pending.x, pending.y);
      if (!pos) return;
      const x = Math.round(pos.x);
      const y = Math.round(pos.y);
      setCursorPos((prev) => (prev && prev.x === x && prev.y === y ? prev : { x, y }));
    });
  }, [screenToCanvas]);
  useEffect(() => () => { if (cursorRafRef.current) cancelAnimationFrame(cursorRafRef.current); }, []);

  // ─── 空格+拖动平移 ───
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!spaceHeld && e.button !== 1) return; // 中键或空格
    const container = containerRef.current;
    if (!container) return;
    isPanningRef.current = true;
    panStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      scrollLeft: container.scrollLeft,
      scrollTop: container.scrollTop,
    };
    (e.target as HTMLElement).style.cursor = "grabbing";
  }, [spaceHeld]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    // 始终更新鼠标在画布中的坐标（rAF 节流）
    queueCursorUpdate(e.clientX, e.clientY);

    if (isPanningRef.current) {
      const container = containerRef.current;
      if (!container) return;
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      container.scrollLeft = panStartRef.current.scrollLeft - dx;
      container.scrollTop = panStartRef.current.scrollTop - dy;
    }
  }, [queueCursorUpdate]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (isPanningRef.current) {
      isPanningRef.current = false;
      (e.target as HTMLElement).style.cursor = "";
    }
  }, []);

  const handleMouseLeave = useCallback((e: React.MouseEvent) => {
    // 复用 mouseup 的清理逻辑，防止操作状态卡住
    if (isPanningRef.current) {
      isPanningRef.current = false;
      (e.target as HTMLElement).style.cursor = "";
    }
    // 鼠标离开画布时隐藏坐标
    setCursorPos(null);
  }, []);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      if (isPanningRef.current) return;
      const target = e.target as HTMLElement;
      const isComp = !!target.closest("[data-comp-id]");
      if (isComp) return;
      deselectAll();
    },
    [deselectAll],
  );

  const ensureDefaultLayer = useCallback(() => {
    const state = useEditorStore.getState();
    // 优先查找名为"默认图层"的图层，避免每次拖放都新建
    let firstLayer = state.layers.find((l) => l.type === "layer");
    if (firstLayer) return firstLayer.id;
    const addLayer = state.addLayer;
    const newLayer = addLayer("默认图层");
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
    document.addEventListener("dragend", handleGlobalDragEnd);
    return () => document.removeEventListener("dragend", handleGlobalDragEnd);
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    // 从 store 读取（dragStart 时写入，dragenter 阶段可靠），
    // dataTransfer.getData() 在 dragenter 阶段可能为空（浏览器安全限制）
    const compType =
      useEditorStore.getState().draggedComponentType ||
      e.dataTransfer?.getData("application/x-component-type") ||
      "";
    if (!compType) return;
    setIsDragOver(true);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    // preventDefault 必须在 compType 校验之前调用，确保 drop 始终被允许
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "copy";
    }
    const compType =
      useEditorStore.getState().draggedComponentType ||
      e.dataTransfer?.getData("application/x-component-type") ||
      "";
    if (!compType) return;
    // 同步更新光标位置，驱动拖放预览
    const pos = screenToCanvas(e.clientX, e.clientY);
    if (pos) {
      setCursorPos({ x: Math.round(pos.x), y: Math.round(pos.y) });
      // 坐标 hit-test：找最深的可嵌入容器作为投放目标
      const storeState = useEditorStore.getState();
      const targetId = hitTestContainer(
        pos.x, pos.y,
        storeState.components,
        storeState.activeBreakpoint,
      );
      setDropTargetId(targetId);
    }
  }, [screenToCanvas]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const relatedTarget = e.relatedTarget as Node | null;
    if (relatedTarget && containerRef.current && containerRef.current.contains(relatedTarget)) {
      return;
    }
    setIsDragOver(false);
    setCursorPos(null);
    setDropTargetId(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    setCursorPos(null);
    setDropTargetId(null);

    const storeState = useEditorStore.getState();

    const compType =
      storeState.draggedComponentType ||
      e.dataTransfer?.getData("application/x-component-type") ||
      "";
    storeState.setDraggedComponentType(null);
    if (!compType) {
      console.warn("[EditorCanvas] Drop rejected: no component type (store + dataTransfer both empty)");
      return;
    }

    const definition = componentRegistry.get(compType);
    if (!definition) {
      console.warn(`[EditorCanvas] Drop rejected: "${compType}" not found in componentRegistry. Did pluginLoader.initialize() run?`);
      return;
    }

    const pos = screenToCanvas(e.clientX, e.clientY);
    if (!pos) {
      console.warn("[EditorCanvas] Drop rejected: screenToCanvas returned null (canvasContentRef not ready)");
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
      "decoration-title-center-diamond": (cw, ch) => {
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
    if (compType === "text") {
      const result = adaptiveTypes.text(cc.width, cc.height);
      dw = result.w; dh = result.h; extraConfig = result.config;
    } else if (compType.startsWith("decoration-title-")) {
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
    const targetId = hitTestContainer(
      pos.x, pos.y,
      storeState.components,
      storeState.activeBreakpoint,
    );
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
      console.warn("[EditorCanvas] Drop rejected: ensureDefaultLayer() returned null (no layers and creation failed)");
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
        const parentComp = storeState.components.find(c => c.id === parentId);
        if (parentComp?.type === "tabs") {
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
  }, [screenToCanvas, ensureDefaultLayer]);

  const getCanvasBackgroundStyle = useCallback(() => {
    const bg = canvasConfig.background;
    if (bg.type === "solid") return { backgroundColor: bg.color };
    if (bg.type === "gradient") {
      const dir = bg.gradient.direction;
      if (dir === "radial") return { background: `radial-gradient(circle, ${bg.gradient.colors[0]}, ${bg.gradient.colors[1]})` };
      const cssDir = dir.replace(/-/g, " ");
      return { background: `linear-gradient(${cssDir}, ${bg.gradient.colors[0]}, ${bg.gradient.colors[1]})` };
    }
    if (bg.type === "image" && bg.imageUrl) return { backgroundImage: `url(${toAssetUrl(bg.imageUrl)})`, backgroundSize: bg.imageFit || "cover", backgroundPosition: "center" };
    // video 类型由 <video> 元素提供背景，容器本身设为透明
    if (bg.type === "video") return { backgroundColor: "transparent" };
    return { backgroundColor: "#ffffff" };
  }, [canvasConfig.background]);

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

  /** 拖放预览：当从组件库拖拽时，显示投放位置预览框 */
  const dragPreview = useMemo(() => {
    if (!isDragOver || !cursorPos) return null;
    const compType = useEditorStore.getState().draggedComponentType;
    if (!compType) return null;
    const def = componentRegistry.get(compType);
    if (!def) return null;
    // 自适应尺寸的组件类型使用简化估算
    let dw = def.defaultSize.width;
    let dh = def.defaultSize.height;
    if (compType === "text") {
      dw = Math.round(canvasConfig.width * 0.5);
      dh = Math.round(canvasConfig.height * 0.08);
    } else if (compType.startsWith("decoration-title-")) {
      dw = Math.round(canvasConfig.width * 0.35);
      dh = Math.max(40, Math.round(canvasConfig.height * 0.055));
    }
    const x = Math.max(0, Math.round(cursorPos.x - dw / 2));
    const y = Math.max(0, Math.round(cursorPos.y - dh / 2));
    return { x, y, w: dw, h: dh, label: def.name };
  }, [isDragOver, cursorPos, canvasConfig.width, canvasConfig.height]);

  /** 容器投放高亮：拖拽时高亮目标容器 */
  const dropTargetPreview = useMemo(() => {
    if (!isDragOver || !dropTargetId) return null;
    const targetComp = components.find((c) => c.id === dropTargetId);
    if (!targetComp) return null;
    const bounds = getAbsoluteBounds(targetComp, components, activeBreakpoint);
    return { ...bounds, id: dropTargetId };
  }, [isDragOver, dropTargetId, components, activeBreakpoint]);

  /** 画布内容区高度：配置高度与内容绝对底部（响应式覆盖 + 嵌套）的最大值 */
  const canvasContentHeight = useMemo(() => {
    const maxBottom = computeContentBottom(components, activeBreakpoint);
    return Math.max(canvasConfig.height, maxBottom) + CANVAS_BOTTOM_PADDING;
  }, [components, canvasConfig.height, activeBreakpoint]);

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
        const newGuides = computeGuides(drag, others, canvasConfig.width, canvasConfig.height);
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
  }, [isPreview, visibleComponents, activeBreakpoint, canvasConfig.width, canvasConfig.height, guides.length]);

  const hasBackgroundVideo = canvasConfig.background.type === "video" && canvasConfig.background.videoUrl;

  // 缩放后的视觉尺寸
  const scaledWidth = Math.round(canvasConfig.width * zoom);
  const scaledHeight = Math.round(canvasContentHeight * zoom);

  // ─── 缩放控制按钮：fit + 居中 ───
  const handleZoomToFit = useCallback(() => {
    zoomToFit();
    pendingCenterRef.current = true;
  }, [zoomToFit]);

  return (
    <Box
      sx={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <EditorRuler
        scrollContainerRef={containerRef}
        canvasContentRef={canvasContentRef}
        zoom={zoom}
        rulerVisible={!isPreview}
      >
        {/* 可滚动容器 */}
        <Box
          ref={containerRef}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onClick={isPreview ? undefined : handleCanvasClick}
          onDragEnter={isPreview ? undefined : handleDragEnter}
          onDragOver={isPreview ? undefined : handleDragOver}
          onDragLeave={isPreview ? undefined : handleDragLeave}
          onDrop={isPreview ? undefined : handleDrop}
          sx={{
            width: "100%",
            height: "100%",
            overflow: "auto",
            position: "relative",
            backgroundColor: (t) =>
              t.palette.mode === "dark"
                ? isDragOver ? "#2e2e42" : "#1a1a24"
                : isDragOver ? "#d0d0da" : "#e0e0e8",
            cursor: spaceHeld ? "grab" : "default",
            outline: !isPreview && isDragOver
              ? (t) => `2px dashed ${t.palette.primary.main}`
              : "none",
            outlineOffset: -2,
            // flex column + 上下弹性 spacer 实现双向居中
            // 画布比容器小时居中，比容器大时 spacer 收缩到 0 允许正常滚动
            display: "flex",
            flexDirection: "column",
            "&::-webkit-scrollbar": { width: 10, height: 10 },
            "&::-webkit-scrollbar-thumb": {
              backgroundColor: "rgba(128,128,128,0.3)",
              borderRadius: 5,
              "&:hover": { backgroundColor: "rgba(128,128,128,0.5)" },
            },
            "&::-webkit-scrollbar-track": { backgroundColor: "transparent" },
          }}
        >
          {/* Sizer — 撑开滚动区域到缩放后的尺寸 */}
          <Box
            sx={{
              width: scaledWidth,
              height: scaledHeight,
              minWidth: "fit-content",
              minHeight: "fit-content",
              flexShrink: 0,
              position: "relative",
              // margin auto 在 flex 中实现水平+垂直居中，内容超出时 margin 归 0
              margin: "auto",
            }}
          >
            {/* 画布内容区：原始尺寸 + scale 变换 */}
            <Box
              ref={canvasContentRef}
              sx={{
                width: canvasConfig.width,
                minHeight: canvasContentHeight,
                position: "absolute",
                top: 0,
                left: 0,
                transform: `scale(${zoom})`,
                transformOrigin: "top left",
                fontFamily: canvasConfig.fontFamily || undefined,
                paddingTop: canvasConfig.padding?.top || 0,
                paddingRight: canvasConfig.padding?.right || 0,
                paddingBottom: canvasConfig.padding?.bottom || 0,
                paddingLeft: canvasConfig.padding?.left || 0,
                ...getCanvasBackgroundStyle(),
                boxShadow: isPreview
                  ? "none"
                  : (t) =>
                      t.palette.mode === "dark"
                        ? "0 0 0 1px rgba(255,255,255,0.06), 0 4px 24px rgba(0,0,0,0.6)"
                        : "0 0 0 1px rgba(0,0,0,0.06), 0 4px 24px rgba(0,0,0,0.1)",
              }}
            >
              {/* 视频背景 */}
              {hasBackgroundVideo && (
                <Box
                  sx={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    overflow: "hidden",
                    zIndex: 0,
                    pointerEvents: "none",
                  }}
                >
                  <video
                    src={toAssetUrl(canvasConfig.background.videoUrl!)}
                    autoPlay={canvasConfig.background.videoAutoplay}
                    muted={canvasConfig.background.videoMuted}
                    loop={canvasConfig.background.videoLoop}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                </Box>
              )}

              {/* 组件渲染（绝对定位，仅根级；嵌套子组件由 EditorCanvasComponent 递归渲染） */}
              {visibleComponents.map(({ comp, layer }) => (
                <CanvasErrorBoundary key={comp.id} componentId={comp.id}>
                  <EditorCanvasComponent
                    component={comp}
                    layerLocked={layer.locked}
                    isCanvasDragOver={isDragOver}
                    previewMode={isPreview}
                    eventBindings={eventBindings}
                    onSelect={selectComponent}
                    onHover={setHoveredComponent}
                    childComponents={childrenMap.get(comp.id) || []}
                    childrenMap={childrenMap}
                  />
                </CanvasErrorBoundary>
              ))}

              {/* 空状态提示：拖拽入库期间也隐藏，避免"拖动组件后提示字还在" */}
              {!isPreview && visibleComponents.length === 0 && !isDragOver && (
                <Box
                  sx={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    textAlign: "center",
                    color: "text.secondary",
                    pointerEvents: "none",
                    zIndex: 2,
                  }}
                >
                  <Box
                    sx={{
                      width: 72,
                      height: 72,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      mx: "auto",
                      mb: 2,
                      backgroundColor: (t) =>
                        t.palette.mode === "dark"
                          ? "rgba(255,255,255,0.04)"
                          : "rgba(0,0,0,0.03)",
                      border: 1,
                      borderColor: (t) =>
                        t.palette.mode === "dark"
                          ? "rgba(255,255,255,0.06)"
                          : "rgba(0,0,0,0.06)",
                    }}
                  >
                    <AddIcon sx={{ fontSize: 32, opacity: 0.3 }} />
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    从左侧组件库拖入元素开始编辑
                  </Typography>
                </Box>
              )}

              {/* 拖放位置预览框 */}
              {!isPreview && dragPreview && (
                <Box
                  sx={{
                    position: "absolute",
                    left: dragPreview.x,
                    top: dragPreview.y,
                    width: dragPreview.w,
                    height: dragPreview.h,
                    border: "2px dashed",
                    borderColor: "primary.main",
                    borderRadius: 1,
                    backgroundColor: (t) =>
                      t.palette.mode === "dark"
                        ? "rgba(100,149,237,0.08)"
                        : "rgba(100,149,237,0.06)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    pointerEvents: "none",
                    zIndex: 3,
                    "&::after": {
                      content: `'${dragPreview.label}'`,
                      fontSize: 11,
                      color: "primary.main",
                      fontWeight: 600,
                      opacity: 0.7,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      maxWidth: "100%",
                    },
                  }}
                />
              )}

              {/* 容器投放高亮 */}
              {!isPreview && dropTargetPreview && (
                <Box
                  sx={{
                    position: "absolute",
                    left: dropTargetPreview.x,
                    top: dropTargetPreview.y,
                    width: dropTargetPreview.width,
                    height: dropTargetPreview.height,
                    border: "2px dashed #4caf50",
                    backgroundColor: "rgba(76,175,80,0.08)",
                    borderRadius: 1,
                    pointerEvents: "none",
                    zIndex: 5,
                  }}
                />
              )}

              {/* 智能对齐参考线 */}
              {!isPreview && guides.length > 0 && (
                <Box sx={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 4 }}>
                  {guides.map((g, i) => {
                    const key = `${g.type}-${g.position}-${i}`;
                    if (g.type === "vertical") {
                      return (
                        <Box key={key} sx={{ position: "absolute", left: g.position, top: g.start, height: g.end - g.start, width: 1, backgroundColor: "#1976d2", opacity: 0.5 }} />
                      );
                    }
                    return (
                      <Box key={key} sx={{ position: "absolute", top: g.position, left: g.start, width: g.end - g.start, height: 1, backgroundColor: "#1976d2", opacity: 0.5 }} />
                    );
                  })}
                </Box>
              )}
            </Box>
          </Box>
        </Box>
      </EditorRuler>

      {/* ─── 空格平移模式提示 ─── */}
      {!isPreview && spaceHeld && (
        <Box
          sx={{
            position: "absolute",
            top: 12,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            px: 1.5,
            py: 0.5,
            borderRadius: 1.5,
            fontSize: 11,
            fontWeight: 600,
            color: "primary.contrastText",
            backgroundColor: "primary.main",
            backdropFilter: "blur(8px)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
            zIndex: 100,
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          平移模式 · 按住拖动
        </Box>
      )}

      {/* ─── 缩放控制浮层 ─── */}
      {!isPreview && (
        <Box
          sx={{
            position: "absolute",
            bottom: 12,
            right: 12,
            display: "flex",
            alignItems: "center",
            gap: 0.25,
            px: 0.5,
            py: 0.25,
            borderRadius: 1.5,
            backgroundColor: (t) =>
              t.palette.mode === "dark"
                ? "rgba(30,30,42,0.9)"
                : "rgba(255,255,255,0.9)",
            backdropFilter: "blur(8px)",
            border: 1,
            borderColor: (t) =>
              t.palette.mode === "dark"
                ? "rgba(255,255,255,0.06)"
                : "rgba(0,0,0,0.06)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            zIndex: 100,
          }}
        >
          <Tooltip title="缩小 (Ctrl+-)">
            <IconButton size="small" onClick={zoomOut} disabled={zoom <= MIN_ZOOM}>
              <ZoomOutIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="点击重置 100%">
            <Box
              onClick={resetZoom}
              sx={{
                cursor: "pointer",
                px: 0.75,
                minWidth: 48,
                textAlign: "center",
                userSelect: "none",
                "&:hover": { opacity: 0.7 },
              }}
            >
              <Typography variant="caption" sx={{ fontSize: 11, fontWeight: 600 }}>
                {Math.round(zoom * 100)}%
              </Typography>
            </Box>
          </Tooltip>
          <Tooltip title="放大 (Ctrl+=)">
            <IconButton size="small" onClick={zoomIn} disabled={zoom >= MAX_ZOOM}>
              <ZoomInIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
          <Tooltip title="宽度自适应（缩放铺满浏览器宽度）">
            <IconButton size="small" onClick={handleZoomToFit}>
              <FitScreenIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        </Box>
      )}

      {/* ─── 鼠标坐标标签 ─── */}
      {!isPreview && cursorPos && (
        <Box
          sx={{
            position: "absolute",
            bottom: 12,
            left: 12,
            display: "flex",
            alignItems: "center",
            gap: 0.25,
            px: 1,
            py: 0.25,
            borderRadius: 0.75,
            fontFamily: "monospace",
            fontSize: 11,
            fontWeight: 500,
            backgroundColor: (t) =>
              t.palette.mode === "dark"
                ? "rgba(30,30,42,0.85)"
                : "rgba(255,255,255,0.85)",
            color: "text.secondary",
            backdropFilter: "blur(8px)",
            border: 1,
            borderColor: (t) =>
              t.palette.mode === "dark"
                ? "rgba(255,255,255,0.06)"
                : "rgba(0,0,0,0.06)",
            pointerEvents: "none",
            zIndex: 100,
          }}
        >
          <Box component="span" sx={{ color: "text.disabled" }}>x</Box>
          <Box component="span" sx={{ fontWeight: 600, color: "text.primary", minWidth: 24 }}>{cursorPos.x}</Box>
          <Box component="span" sx={{ color: "text.disabled", ml: 0.5 }}>y</Box>
          <Box component="span" sx={{ fontWeight: 600, color: "text.primary", minWidth: 24 }}>{cursorPos.y}</Box>
        </Box>
      )}
    </Box>
  );
}
