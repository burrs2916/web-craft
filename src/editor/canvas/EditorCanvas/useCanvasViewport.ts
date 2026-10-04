import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useEditorStore } from '../../../store/editorStore';
import { ZOOM_STEP, clampZoom } from '../../utils/canvasConstants';

/**
 * 画布视口交互：居中、ResizeObserver 自动 re-fit、空格平移、Ctrl+滚轮锚定缩放、
 * 屏幕→画布坐标换算，以及鼠标坐标标签的 rAF 节流。
 */
export function useCanvasViewport({
  containerRef,
  canvasContentRef,
  isPreview,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  canvasContentRef: RefObject<HTMLDivElement | null>;
  isPreview: boolean;
}) {
  const zoom = useEditorStore((s) => s.zoom);
  const canvasWidth = useEditorStore((s) => s.canvasConfig.width);
  const canvasHeight = useEditorStore((s) => s.canvasConfig.height);
  const setZoom = useEditorStore((s) => s.setZoom);
  const zoomToFit = useEditorStore((s) => s.zoomToFit);
  const setContainerSize = useEditorStore((s) => s.setContainerSize);
  const deselectAll = useEditorStore((s) => s.deselectAll);

  const [spaceHeld, setSpaceHeld] = useState(false);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);

  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });
  const pendingCenterRef = useRef(false);

  // ─── 居中画布 ───
  const centerCanvas = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const sw = canvasWidth * zoom;
    const sh = canvasHeight * zoom;
    container.scrollLeft = Math.max(0, (sw - cw) / 2);
    container.scrollTop = Math.max(0, (sh - ch) / 2);
  }, [containerRef, canvasWidth, canvasHeight, zoom]);

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
  }, [containerRef, setContainerSize, isPreview, zoomToFit]);

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
      if (e.code === 'Space' && !e.repeat) {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
        e.preventDefault();
        setSpaceHeld(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setSpaceHeld(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isPreview]);

  // ─── Ctrl+滚轮缩放（锚定光标位置，函数式读取 store，避免闭包丢帧）───
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
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
    },
    [containerRef, canvasContentRef, setZoom],
  );

  /** 将屏幕坐标转换为画布内容坐标（考虑缩放） */
  const screenToCanvas = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasContentRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      return {
        x: (clientX - rect.left) / zoom,
        y: (clientY - rect.top) / zoom,
      };
    },
    [canvasContentRef, zoom],
  );

  // ─── 鼠标坐标标签：rAF 节流 + 值不变时复用引用（避免全画布重渲染）───
  const cursorRafRef = useRef(0);
  const pendingCursorRef = useRef<{ x: number; y: number } | null>(null);
  const queueCursorUpdate = useCallback(
    (clientX: number, clientY: number) => {
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
    },
    [screenToCanvas],
  );
  useEffect(
    () => () => {
      if (cursorRafRef.current) cancelAnimationFrame(cursorRafRef.current);
    },
    [],
  );

  // ─── 空格+拖动平移 ───
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
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
      (e.target as HTMLElement).style.cursor = 'grabbing';
    },
    [containerRef, spaceHeld],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
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
    },
    [containerRef, queueCursorUpdate],
  );

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (isPanningRef.current) {
      isPanningRef.current = false;
      (e.target as HTMLElement).style.cursor = '';
    }
  }, []);

  const handleMouseLeave = useCallback((e: React.MouseEvent) => {
    // 复用 mouseup 的清理逻辑，防止操作状态卡住
    if (isPanningRef.current) {
      isPanningRef.current = false;
      (e.target as HTMLElement).style.cursor = '';
    }
    // 鼠标离开画布时隐藏坐标
    setCursorPos(null);
  }, []);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      if (isPanningRef.current) return;
      const target = e.target as HTMLElement;
      const isComp = !!target.closest('[data-comp-id]');
      if (isComp) return;
      deselectAll();
    },
    [deselectAll],
  );

  // ─── 缩放控制按钮：fit + 居中 ───
  const handleZoomToFit = useCallback(() => {
    zoomToFit();
    pendingCenterRef.current = true;
  }, [zoomToFit]);

  return {
    spaceHeld,
    cursorPos,
    setCursorPos,
    screenToCanvas,
    handleWheel,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleMouseLeave,
    handleCanvasClick,
    handleZoomToFit,
  };
}