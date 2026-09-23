import { useState, useEffect, useRef, useCallback, useLayoutEffect } from "react";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import { CadViewerEngine } from "../cad/CadViewerEngine";
import type { ComponentRendererProps } from "../../types/editor";
import type { MapLibrary } from "../../types/mapLibrary";
import { logger } from "../../utils/logger";
import { useSceneEditorCore } from "../context/SceneEditorContext";
import { useViewportDelegate } from "../hooks/useViewportDelegate";
import type { ViewportDelegate } from "../layers/ComponentLayerAdapter";

type FitMode = "contain" | "cover" | "stretch" | "custom";

interface CameraState {
  centerX: number;
  centerY: number;
  halfW: number;
  halfH: number;
}

interface DrawingBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

type TransformHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

const TRANSFORM_HANDLES: TransformHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const MIN_TRANSFORM_RECT_SIZE = 24;

function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value);
}

function rectWidth(rect: ScreenRect): number {
  return rect.right - rect.left;
}

function rectHeight(rect: ScreenRect): number {
  return rect.bottom - rect.top;
}

function cameraStateToScreenRect(state: CameraState, bounds: DrawingBounds, containerW: number, containerH: number): ScreenRect | null {
  if (containerW <= 0 || containerH <= 0 || state.halfW <= 0 || state.halfH <= 0) return null;
  const left = ((bounds.minX - (state.centerX - state.halfW)) / (state.halfW * 2)) * containerW;
  const right = ((bounds.maxX - (state.centerX - state.halfW)) / (state.halfW * 2)) * containerW;
  const top = (((state.centerY + state.halfH) - bounds.maxY) / (state.halfH * 2)) * containerH;
  const bottom = (((state.centerY + state.halfH) - bounds.minY) / (state.halfH * 2)) * containerH;
  if (![left, right, top, bottom].every(isFiniteNumber)) return null;
  return { left, top, right, bottom };
}

function screenRectToCameraState(rect: ScreenRect, bounds: DrawingBounds, containerW: number, containerH: number): CameraState | null {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const normalizedW = rectWidth(rect) / containerW;
  const normalizedH = rectHeight(rect) / containerH;
  if (width <= 0 || height <= 0 || normalizedW <= 0 || normalizedH <= 0) return null;

  const halfW = width / (normalizedW * 2);
  const halfH = height / (normalizedH * 2);
  const sx0 = rect.left / containerW;
  const sy0 = rect.top / containerH;
  const centerX = bounds.minX + halfW * (1 - sx0 * 2);
  const centerY = bounds.maxY + halfH * (sy0 * 2 - 1);
  if (![centerX, centerY, halfW, halfH].every(isFiniteNumber)) return null;
  return { centerX, centerY, halfW, halfH };
}

function resizeScreenRect(start: ScreenRect, handle: TransformHandle, dx: number, dy: number): ScreenRect {
  const next = { ...start };
  if (handle.includes("w")) next.left += dx;
  if (handle.includes("e")) next.right += dx;
  if (handle.includes("n")) next.top += dy;
  if (handle.includes("s")) next.bottom += dy;

  if (rectWidth(next) < MIN_TRANSFORM_RECT_SIZE) {
    if (handle.includes("w")) next.left = next.right - MIN_TRANSFORM_RECT_SIZE;
    else next.right = next.left + MIN_TRANSFORM_RECT_SIZE;
  }
  if (rectHeight(next) < MIN_TRANSFORM_RECT_SIZE) {
    if (handle.includes("n")) next.top = next.bottom - MIN_TRANSFORM_RECT_SIZE;
    else next.bottom = next.top + MIN_TRANSFORM_RECT_SIZE;
  }
  return next;
}

function handlePosition(rect: ScreenRect, handle: TransformHandle): { x: number; y: number } {
  const cx = (rect.left + rect.right) / 2;
  const cy = (rect.top + rect.bottom) / 2;
  switch (handle) {
    case "nw": return { x: rect.left, y: rect.top };
    case "n": return { x: cx, y: rect.top };
    case "ne": return { x: rect.right, y: rect.top };
    case "e": return { x: rect.right, y: cy };
    case "se": return { x: rect.right, y: rect.bottom };
    case "s": return { x: cx, y: rect.bottom };
    case "sw": return { x: rect.left, y: rect.bottom };
    case "w": return { x: rect.left, y: cy };
  }
}

function handleCursor(handle: TransformHandle): string {
  switch (handle) {
    case "nw":
    case "se":
      return "nwse-resize";
    case "ne":
    case "sw":
      return "nesw-resize";
    case "n":
    case "s":
      return "ns-resize";
    case "e":
    case "w":
      return "ew-resize";
  }
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function CADMapRenderer({ config, componentId, width, height, mode, onConfigChange, contentInteractionActive, onInteractionLockChange }: ComponentRendererProps) {
  const mapLibraryId = (config.mapLibraryId as string) || "";
  const backgroundColor = (config.backgroundColor as string) || "#1a1a2e";
  const lineColor = (config.lineColor as string) || "#4fc3f7";
  const backgroundOpacity = Number(config.backgroundOpacity ?? 1);
  const contentOpacity = Number(config.contentOpacity ?? 1);
  const fitMode = (config.fitMode as FitMode) || "contain";
  const showBorder = Boolean(config.showBorder);
  const borderColor = (config.borderColor as string) || "#666666";
  const borderWidth = Number(config.borderWidth ?? 1);
  const cameraState = config.cameraState as CameraState | null | undefined;
  const isEditMode = mode === "edit";

  const [publishedMaps, setPublishedMaps] = useState<MapLibrary[]>([]);
  const [mapsLoaded, setMapsLoaded] = useState(false);

  const loadPublishedMaps = useCallback(async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const maps = await invoke<MapLibrary[]>("get_published_map_libraries_by_type", { mapType: "cad" });
      setPublishedMaps(maps);
    } catch (err) {
      logger.warn("CADMapRenderer", "Failed to load published maps", { error: String(err) });
    } finally {
      setMapsLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadPublishedMaps();

    let unsubscribeFn: (() => void) | undefined;
    let cancelled = false;
    import("@tauri-apps/api/event").then(({ listen }) => {
      if (cancelled) return;
      listen("map-library-published", () => {
        loadPublishedMaps();
      }).then((fn) => {
        if (cancelled) {
          fn();
          return;
        }
        unsubscribeFn = fn;
      });
    });

    return () => {
      cancelled = true;
      unsubscribeFn?.();
    };
  }, [loadPublishedMaps]);

  if (mapLibraryId) {
    if (!mapsLoaded) {
      return (
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", backgroundColor: hexToRgba(backgroundColor, backgroundOpacity) }}>
          <CircularProgress size={20} />
        </Box>
      );
    }
    const selectedMap = publishedMaps.find((m) => m.id === mapLibraryId);
    if (selectedMap?.cadbinPath) {
      return (
        <CadViewer
          componentId={componentId}
          mapLibraryId={selectedMap.id}
          fileName={selectedMap.name}
          backgroundColor={backgroundColor}
          backgroundOpacity={backgroundOpacity}
          lineColor={lineColor}
          contentOpacity={contentOpacity}
          fitMode={fitMode}
          showBorder={showBorder}
          borderColor={borderColor}
          borderWidth={borderWidth}
            cameraState={cameraState}
            containerWidth={width}
            containerHeight={height}
            isEditMode={isEditMode}
            onConfigChange={onConfigChange}
            contentInteractionActive={contentInteractionActive}
            onInteractionLockChange={onInteractionLockChange}
        />
      );
    }
    return (
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", flexDirection: "column", gap: 0.5, backgroundColor: hexToRgba(backgroundColor, backgroundOpacity) }}>
        <Typography sx={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>地图未找到或未发布</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", flexDirection: "column", gap: 0.5, backgroundColor: hexToRgba(backgroundColor, backgroundOpacity) }}>
      <Typography sx={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>请在图库管理中导入并发布CAD图纸</Typography>
      <Typography sx={{ fontSize: 9, color: "rgba(255,255,255,0.25)" }}>或在属性面板中选择已发布的地图</Typography>
    </Box>
  );
}

interface CadViewerProps {
  componentId: string;
  mapLibraryId: string;
  fileName?: string;
  backgroundColor: string;
  backgroundOpacity: number;
  lineColor: string;
  contentOpacity: number;
  fitMode: FitMode;
  showBorder: boolean;
  borderColor: string;
  borderWidth: number;
  cameraState?: CameraState | null;
  containerWidth?: number;
  containerHeight?: number;
  isEditMode: boolean;
  onConfigChange?: (key: string, value: unknown) => void;
  contentInteractionActive?: boolean;
  onInteractionLockChange?: (locked: boolean) => void;
}

function CadViewer({
  componentId,
  mapLibraryId,
  fileName,
  backgroundColor,
  backgroundOpacity,
  lineColor,
  contentOpacity,
  fitMode,
  showBorder,
  borderColor,
  borderWidth,
  cameraState,
  containerWidth,
  containerHeight,
  isEditMode,
  onConfigChange,
  contentInteractionActive,
  onInteractionLockChange,
}: CadViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<CadViewerEngine | null>(null);
  const editorCore = useSceneEditorCore();
  const setViewportDelegate = useViewportDelegate(componentId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [engineReadyVersion, setEngineReadyVersion] = useState(0);
  const [transformRevision, setTransformRevision] = useState(0);
  const onConfigChangeRef = useRef(onConfigChange);
  const latestCameraStateRef = useRef<CameraState | null>(cameraState ?? null);
  const wasCadViewActiveRef = useRef(false);
  onConfigChangeRef.current = onConfigChange;
  const isCadViewActive = fitMode === "custom" && isEditMode && Boolean(contentInteractionActive);

  const refreshTransformFrame = useCallback(() => {
    setTransformRevision((value) => value + 1);
  }, []);

  const commitCameraState = useCallback(() => {
    if (fitMode !== "custom") return;
    const state = engineRef.current?.getCameraState() ?? latestCameraStateRef.current;
    if (!state) return;
    latestCameraStateRef.current = state;
    onConfigChangeRef.current?.("cameraState", state);
  }, [fitMode]);

  useEffect(() => {
    if (cameraState) {
      latestCameraStateRef.current = cameraState;
      if (fitMode === "custom" && !isCadViewActive) {
        engineRef.current?.setCameraState(cameraState);
        refreshTransformFrame();
      }
    }
  }, [cameraState, fitMode, isCadViewActive, refreshTransformFrame]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setBackgroundColor(backgroundColor, backgroundOpacity);
  }, [backgroundColor, backgroundOpacity]);

  useLayoutEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    el.style.backgroundColor = hexToRgba(backgroundColor, backgroundOpacity);
  }, [backgroundColor, backgroundOpacity]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const canvas = el.querySelector("canvas");
    if (canvas) {
      canvas.style.opacity = String(contentOpacity);
    }
  }, [contentOpacity]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setLineColor(lineColor);
  }, [lineColor]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!(fitMode === "custom" && isEditMode)) {
      onInteractionLockChange?.(false);
    }
    if (!engine) return;
    logger.info("CadViewer", "fitMode/isEditMode changed", { fitMode, isEditMode, contentInteractionActive: isCadViewActive, willSetPan: isCadViewActive, pointerEvents: isCadViewActive ? "auto" : "none" });
    engine.setFitMode(fitMode);
    if (isCadViewActive) {
      engine.setInteractionMode("pan");
    } else {
      engine.setInteractionMode("select");
      if (onConfigChangeRef.current) {
        if (fitMode !== "custom") {
          onConfigChangeRef.current("cameraState", null);
        }
      }
    }
  }, [fitMode, isEditMode, isCadViewActive, onInteractionLockChange]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    const updateLatestCameraState = () => {
      const state = engine.getCameraState();
      if (state) latestCameraStateRef.current = state;
      if (isCadViewActive) refreshTransformFrame();
    };

    const unsubscribeChanged = engine.on("cameraChanged", updateLatestCameraState);
    const unsubscribeInteractionEnd = engine.on("cameraInteractionEnd", () => {
      updateLatestCameraState();
      if (isCadViewActive) {
        commitCameraState();
      }
    });

    const delegate: ViewportDelegate = {
      getViewport: () => {
        const state = engine.getCameraState() ?? latestCameraStateRef.current;
        const cW = containerWidth ?? 0;
        const cH = containerHeight ?? 0;
        const zoom = state ? Math.max(cW, cH) / (state.halfW * 2 || 1) : 1;
        return {
          centerX: state?.centerX ?? 0,
          centerY: state?.centerY ?? 0,
          zoom,
          bearing: 0,
          pitch: 0,
          width: cW,
          height: cH,
          crs: 'local',
        };
      },
      setViewport: (snapshot) => {
        const cW = containerWidth ?? 0;
        const cH = containerHeight ?? 0;
        const halfW = cW / (snapshot.zoom || 1) / 2;
        const halfH = cH / (snapshot.zoom || 1) / 2;
        engine.setCameraState({
          centerX: snapshot.centerX,
          centerY: snapshot.centerY,
          halfW,
          halfH,
        });
      },
      onViewportChange: (handler) => {
        const unsub = engine.on("cameraChanged", () => {
          const state = engine.getCameraState() ?? latestCameraStateRef.current;
          const cW = containerWidth ?? 0;
          const cH = containerHeight ?? 0;
          const zoom = state ? Math.max(cW, cH) / (state.halfW * 2 || 1) : 1;
          handler({
            centerX: state?.centerX ?? 0,
            centerY: state?.centerY ?? 0,
            zoom,
            bearing: 0,
            pitch: 0,
            width: cW,
            height: cH,
            crs: 'local',
          }, componentId);
        });
        return unsub;
      },
    };
    setViewportDelegate(delegate);

    return () => {
      setViewportDelegate(null);
      unsubscribeChanged();
      unsubscribeInteractionEnd();
    };
  }, [engineReadyVersion, isCadViewActive, commitCameraState, refreshTransformFrame]);

  useEffect(() => {
    if (wasCadViewActiveRef.current && !isCadViewActive) {
      commitCameraState();
    }
    wasCadViewActiveRef.current = isCadViewActive;
  }, [isCadViewActive, commitCameraState]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (!isCadViewActive) return;

    const handlePointerDown = (e: PointerEvent) => {
      e.stopPropagation();
    };

    const handlePointerMove = (e: PointerEvent) => {
      e.stopPropagation();
    };

    const handlePointerUp = (e: PointerEvent) => {
      e.stopPropagation();
    };

    const handleMouseDown = (e: MouseEvent) => {
      e.stopPropagation();
    };

    const handleMouseMove = (e: MouseEvent) => {
      e.stopPropagation();
    };

    const handleMouseUp = (e: MouseEvent) => {
      e.stopPropagation();
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    container.addEventListener("mousedown", handleMouseDown);
    container.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("mouseup", handleMouseUp);
    container.addEventListener("pointerdown", handlePointerDown);
    container.addEventListener("pointermove", handlePointerMove);
    container.addEventListener("pointerup", handlePointerUp);
    container.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      container.removeEventListener("mousedown", handleMouseDown);
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mouseup", handleMouseUp);
      container.removeEventListener("pointerdown", handlePointerDown);
      container.removeEventListener("pointermove", handlePointerMove);
      container.removeEventListener("pointerup", handlePointerUp);
      container.removeEventListener("wheel", handleWheel);
    };
  }, [isCadViewActive]);

  useEffect(() => {
    let destroyed = false;

    async function initAndLoad() {
      if (!containerRef.current) return;

      setLoading(true);
      setError(null);

      const el = containerRef.current;
      const rect = { width: el.clientWidth, height: el.clientHeight };

      if (rect.width < 10 || rect.height < 10) {
        if (containerWidth && containerHeight && containerWidth > 0 && containerHeight > 0) {
          el.style.width = `${containerWidth}px`;
          el.style.height = `${containerHeight}px`;
        } else {
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          const newRect = { width: el.clientWidth, height: el.clientHeight };
          if (newRect.width < 10 || newRect.height < 10) {
            setError(`容器尺寸异常 (${Math.round(newRect.width)}x${Math.round(newRect.height)})`);
            setLoading(false);
            return;
          }
        }
      }

      try {
        const engine = new CadViewerEngine();
        engineRef.current = engine;

        // 注册 renderer getter，供 PerformanceMonitor 读取 drawCall
        editorCore?.registerRendererGetter(() => engineRef.current?.renderer?.glRenderer ?? null);

        await engine.initialize({
          container: el,
          autoResize: true,
          backgroundColor,
          lineColor,
          transparentBackground: true,
        });

        if (destroyed) {
          engine.destroy();
          return;
        }
        setEngineReadyVersion((value) => value + 1);

        engine.setInteractionMode(isCadViewActive ? "pan" : "select");
        engine.setFitMode(fitMode);
        logger.info("CadViewer", "engine initialized", { fitMode, isEditMode, interactionMode: isCadViewActive ? "pan" : "select" });

        const success = await engine.openFromMapLibrary(mapLibraryId, fileName);

        if (!success && !destroyed) {
          setError("无法加载CAD图纸");
        }
        if (!destroyed && success) {
          if (fitMode === "custom" && cameraState) {
            engine.setCameraState(cameraState);
          } else {
            engine.fitToView();
          }
          const state = engine.getCameraState();
          if (state) latestCameraStateRef.current = state;
          refreshTransformFrame();
        }
        if (!destroyed) {
          setLoading(false);
        }
      } catch (err) {
        if (!destroyed) {
          setError(String(err));
          setLoading(false);
        }
      }
    }

    initAndLoad();

    return () => {
      destroyed = true;
      if (engineRef.current) {
        const eng = engineRef.current;
        if (wasCadViewActiveRef.current) {
          const state = eng.getCameraState();
          if (state) onConfigChangeRef.current?.("cameraState", state);
        }
        engineRef.current = null;
        editorCore?.registerRendererGetter(null);
        eng.destroy();
      }
      onInteractionLockChange?.(false);
    };
  }, [mapLibraryId]);

  const resolveTransformContext = useCallback(() => {
    const engine = engineRef.current;
    const container = containerRef.current;
    if (!engine || !container) return null;

    const state = engine.getCameraState() ?? latestCameraStateRef.current;
    const bounds = engine.getDrawingBounds();
    const containerW = container.clientWidth;
    const containerH = container.clientHeight;
    if (!state || !bounds || containerW <= 0 || containerH <= 0) return null;
    if (
      ![bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].every(isFiniteNumber) ||
      bounds.maxX <= bounds.minX ||
      bounds.maxY <= bounds.minY
    ) {
      return null;
    }

    const rect = cameraStateToScreenRect(state, bounds, containerW, containerH);
    if (!rect || rectWidth(rect) <= 0 || rectHeight(rect) <= 0) return null;
    return { engine, container, bounds, rect, containerW, containerH };
  }, []);

  const handleTransformHandlePointerDown = useCallback((handle: TransformHandle, e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const context = resolveTransformContext();
    if (!context) return;

    const startRect = context.rect;
    const startX = e.clientX;
    const startY = e.clientY;
    const rendered = context.container.getBoundingClientRect();
    const scaleX = context.containerW / Math.max(rendered.width, 1);
    const scaleY = context.containerH / Math.max(rendered.height, 1);

    const cleanup = () => {
      window.removeEventListener("pointermove", handlePointerMove, true);
      window.removeEventListener("pointerup", handlePointerEnd, true);
      window.removeEventListener("pointercancel", handlePointerEnd, true);
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      moveEvent.stopPropagation();
      const dx = (moveEvent.clientX - startX) * scaleX;
      const dy = (moveEvent.clientY - startY) * scaleY;
      const nextRect = resizeScreenRect(startRect, handle, dx, dy);
      const nextState = screenRectToCameraState(nextRect, context.bounds, context.containerW, context.containerH);
      if (!nextState) return;
      latestCameraStateRef.current = nextState;
      context.engine.setCameraState(nextState);
      refreshTransformFrame();
    };

    const handlePointerEnd = (endEvent: PointerEvent) => {
      endEvent.preventDefault();
      endEvent.stopPropagation();
      cleanup();
      commitCameraState();
      refreshTransformFrame();
    };

    window.addEventListener("pointermove", handlePointerMove, { capture: true, passive: false });
    window.addEventListener("pointerup", handlePointerEnd, { capture: true, passive: false });
    window.addEventListener("pointercancel", handlePointerEnd, { capture: true, passive: false });
  }, [commitCameraState, refreshTransformFrame, resolveTransformContext]);

  if (error) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", backgroundColor: hexToRgba(backgroundColor, backgroundOpacity) }}>
        <Typography sx={{ fontSize: 11, color: "error.main" }}>加载失败: {error}</Typography>
      </Box>
    );
  }

  const contentTransformRect = (() => {
    void transformRevision;
    if (!isCadViewActive || loading) return null;
    return resolveTransformContext()?.rect ?? null;
  })();

  return (
    <Box
      ref={wrapperRef}
      sx={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        border: showBorder ? `${borderWidth}px solid ${borderColor}` : "none",
        boxSizing: "border-box",
        "& canvas": {
          width: "100% !important",
          height: "100% !important",
          display: "block",
        },
      }}
    >
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "100%",
          pointerEvents: isCadViewActive ? "auto" : "none",
        }}
      />
      {loading && (
        <Box sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.4)", zIndex: 10 }}>
          <CircularProgress size={20} />
        </Box>
      )}
      {contentTransformRect && (
        <Box sx={{ position: "absolute", inset: 0, zIndex: 8, pointerEvents: "none" }}>
          <Box
            sx={{
              position: "absolute",
              left: contentTransformRect.left,
              top: contentTransformRect.top,
              width: rectWidth(contentTransformRect),
              height: rectHeight(contentTransformRect),
              border: "1px solid rgba(79,195,247,0.95)",
              boxShadow: "0 0 0 1px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(0,0,0,0.35)",
              boxSizing: "border-box",
              pointerEvents: "none",
            }}
          />
          {TRANSFORM_HANDLES.map((handle) => {
            const pos = handlePosition(contentTransformRect, handle);
            return (
              <Box
                key={handle}
                onPointerDown={(e) => handleTransformHandlePointerDown(handle, e)}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                sx={{
                  position: "absolute",
                  left: pos.x - 5,
                  top: pos.y - 5,
                  width: 10,
                  height: 10,
                  borderRadius: 0.5,
                  backgroundColor: "#ffffff",
                  border: "1px solid #1976d2",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.35)",
                  cursor: handleCursor(handle),
                  pointerEvents: "auto",
                  touchAction: "none",
                }}
              />
            );
          })}
        </Box>
      )}
      {!loading && (
        <Box
          sx={{
            position: "absolute",
            top: 4,
            right: 4,
            px: 0.5,
            py: 0.15,
            borderRadius: 0.5,
            backgroundColor: "rgba(0,0,0,0.5)",
            zIndex: 5,
            pointerEvents: "none",
          }}
        >
          <Typography sx={{ fontSize: 8, color: "rgba(255,255,255,0.4)", letterSpacing: 0.5 }}>
            {!isEditMode ? "只读" : isCadViewActive ? "调整中" : fitMode === "custom" ? "自定义" : "编辑"}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
