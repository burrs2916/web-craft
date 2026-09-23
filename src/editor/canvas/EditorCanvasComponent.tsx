import Box from "@mui/material/Box";
import { useCallback, useRef, useState, useEffect, memo, useMemo } from "react";
import Moveable from "react-moveable";
import type { SceneComponent, ComponentRendererProps, EventBinding } from "../../types/editor";
import { getEffectiveTransform } from "../../types/editor";
import { resolveInteractivity } from "../utils/resolveInteractivity";
import { useEditorStore } from "../../store/editorStore";
import { componentRegistry } from "../registry";
import { rendererCache } from "../plugins/PluginLoader";
import { FallbackRenderer } from "../renderers/FallbackRenderer";
import { ComponentFrame } from "../renderers/ComponentFrame";
import { EditorContextMenu } from "../components/EditorContextMenu";
import { useComponentDataBinding } from "../hooks/useComponentDataBinding";
import { useSpatialRendererContext } from "../hooks/useSpatialRendererContext";
import { useEventDispatcher } from "../context/SceneEditorContext";
import { setDragInfo } from "../utils/alignmentGuides";

interface EditorCanvasComponentProps {
  component: SceneComponent;
  layerLocked: boolean;
  isCanvasDragOver: boolean;
  previewMode: boolean;
  eventBindings?: EventBinding[];
  onSelect: (id: string, multi?: boolean) => void;
  onHover: (id: string | null) => void;
  childComponents: SceneComponent[];
  childrenMap: Map<string, SceneComponent[]>;
}

export const EditorCanvasComponent = memo(function EditorCanvasComponent({
  component,
  layerLocked,
  isCanvasDragOver,
  previewMode,
  eventBindings,
  onSelect,
  onHover,
  childComponents,
  childrenMap,
}: EditorCanvasComponentProps) {
  const updateComponentConfig = useEditorStore((s) => s.updateComponentConfig);
  const updateComponentTransform = useEditorStore((s) => s.updateComponentTransform);
  const activeBreakpoint = useEditorStore((s) => s.activeBreakpoint);
  const zoom = useEditorStore((s) => s.zoom);
  const isSelectedFromStore = useEditorStore((s) => s.selection.selectedIds.includes(component.id));
  const isHoveredFromStore = useEditorStore((s) => s.selection.hoveredId === component.id);
  const isSelected = !previewMode && isSelectedFromStore;
  const isHovered = !previewMode && isHoveredFromStore;

  useComponentDataBinding(component.id);

  const definition = componentRegistry.get(component.type);

  const { isInteractive } = useMemo(
    () => resolveInteractivity(component.id, eventBindings ?? []),
    [component.id, eventBindings],
  );
  const effectiveInteractive = isInteractive || !!definition?.requiresInteraction;

  const spatialContext = useSpatialRendererContext(component.config.crs as import("../../types/spatial").CRSType | undefined);

  const handleConfigChange = useCallback(
    (key: string, value: unknown) => {
      updateComponentConfig(component.id, { [key]: value });
    },
    [component.id, updateComponentConfig],
  );

  const targetRef = useRef<HTMLDivElement>(null);
  const moveableRef = useRef<Moveable>(null);
  const [contextMenu, setContextMenu] = useState<{ mouseX: number; mouseY: number } | null>(null);
  // frame 状态：Moveable 的本地镜像，拖拽/缩放过程中先更新本地，结束时提交 store
  const [frame, setFrame] = useState({
    translate: [component.transform.x, component.transform.y] as [number, number],
    size: [component.transform.width, component.transform.height] as [number, number],
  });
  // 拖拽/缩放过程同步写入的镜像，避免 onDragEnd/onResizeEnd 读到 React 异步滞后一帧的闭包值
  const frameRef = useRef({
    translate: [component.transform.x, component.transform.y] as [number, number],
    size: [component.transform.width, component.transform.height] as [number, number],
  });

  const { x, y, width, height, rotation } = getEffectiveTransform(component, activeBreakpoint);
  const isLocked = layerLocked || component.locked;
  const showBorder = isSelected || isHovered;
  // isInteractable：综合判断组件是否可被 Moveable 操作
  const isInteractable = !isLocked && isSelected && !isCanvasDragOver;

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelect(component.id, e.shiftKey);
    },
    [component.id, onSelect],
  );

  const eventDispatcher = useEventDispatcher();

  const handlePreviewClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (eventDispatcher) {
        eventDispatcher.emitComponentEvent(component.id, "onClick", {
          componentId: component.id,
          type: "click",
          screenX: e.clientX,
          screenY: e.clientY,
        });
      }
    },
    [component.id, eventDispatcher],
  );

  const handlePreviewDblClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (eventDispatcher) {
        eventDispatcher.emitComponentEvent(component.id, "onDblClick", {
          componentId: component.id,
          type: "dblclick",
          screenX: e.clientX,
          screenY: e.clientY,
        });
      }
    },
    [component.id, eventDispatcher],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onSelect(component.id);
      setContextMenu({ mouseX: e.clientX, mouseY: e.clientY });
    },
    [component.id, onSelect],
  );

  // ─── Renderer 动态加载 ───
  const [Renderer, setRenderer] = useState<React.ComponentType<ComponentRendererProps> | null>(
    () => rendererCache.get(component.type) || definition?.renderer.cached || null,
  );
  // 记录加载失败原因，用于兜底提示给出可诊断信息
  const [loadError, setLoadError] = useState<string | null>(() => rendererCache.getError(component.type));

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const maxRegistryRetries = 25; // 注册表就绪等待：25 × 200ms = 5s
    // 渲染器加载失败后的自愈重试：覆盖构建/HMR 期间浏览器持有旧 chunk 导致的瞬态失败
    const maxLoadFailRetries = 12;
    let registryRetryCount = 0;
    let failRetryCount = 0;

    const attemptLoad = () => {
      if (cancelled) return;

      const cached = rendererCache.get(component.type);
      if (cached) {
        setRenderer(() => cached);
        setLoadError(null);
        return;
      }

      const currentDefinition = componentRegistry.get(component.type);
      if (currentDefinition?.renderer.loader) {
        rendererCache.load(component.type).then((loaded) => {
          if (cancelled) return;
          if (loaded) {
            setRenderer(() => loaded);
            setLoadError(null);
          } else if (failRetryCount < maxLoadFailRetries) {
            // 瞬态失败（多为 stale chunk / 构建未就绪）：清除错误缓存并延时重试，避免钉死在兜底框
            failRetryCount++;
            retryTimer = setTimeout(attemptLoad, 500);
          } else {
            setRenderer(() => FallbackRenderer);
            setLoadError(rendererCache.getError(component.type));
          }
        });
        return;
      }

      // 注册表尚未就绪（definition 为 undefined）——重试而非立即放弃
      if (registryRetryCount < maxRegistryRetries) {
        registryRetryCount++;
        retryTimer = setTimeout(attemptLoad, 200);
        return;
      }

      // 超过最大重试次数，放弃
      setRenderer(() => FallbackRenderer);
      setLoadError(
        currentDefinition
          ? null
          : `组件类型 "${component.type}" 未注册，请检查该组件插件是否已安装/启用或重新加载`,
      );
    };

    attemptLoad();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [component.type, component.id, definition?.type]);

  // ─── react-moveable 拖拽/缩放/旋转 ───

  // store 值变化时同步 frame 并刷新 Moveable 内部矩形
  useEffect(() => {
    setFrame({
      translate: [x, y],
      size: [width, height],
    });
    frameRef.current = { translate: [x, y], size: [width, height] };
    if (moveableRef.current) {
      moveableRef.current.updateRect();
    }
  }, [x, y, width, height, rotation]);

  const handleDragStart = useCallback(
    ({ set }: any) => {
      set?.(frame.translate);
    },
    [frame.translate],
  );

  const handleDrag = useCallback(
    ({ target, beforeTranslate }: any) => {
      const newX = beforeTranslate[0];
      const newY = beforeTranslate[1];
      target.style.transform = `translate(${newX}px, ${newY}px) rotate(${rotation}deg)`;
      // 注意：拖拽过程中【不】调用 setFrame。frame 状态仅用于 store 值变化时的同步，
      // 此处若触发重渲染，外层 Box 的 sx 会用旧 store 值把 Moveable 刚写的 inline transform 覆盖回去，
      // 造成「拖动框走、组件不动」。实时位置只写 frameRef，结束再提交 store。
      frameRef.current = { ...frameRef.current, translate: [newX, newY] };
      // 上报拖拽位置用于智能对齐参考线（仅根级组件，嵌套组件坐标是相对父容器的）
      if (!component.parentId) {
        setDragInfo({
          id: component.id,
          x: newX,
          y: newY,
          w: width,
          h: height,
        });
      }
    },
    [rotation, component.id, width, height, component.parentId],
  );

  const handleDragEnd = useCallback(() => {
    setDragInfo(null);
    const t = frameRef.current.translate;
    updateComponentTransform(component.id, {
      x: Math.round(t[0]),
      y: Math.round(t[1]),
    });
  }, [component.id, updateComponentTransform]);

  const handleResizeStart = useCallback(
    ({ setOrigin, dragStart }: any) => {
      setOrigin?.(["%", "%"]);
      dragStart?.set(frame.translate);
    },
    [frame.translate],
  );

  const handleResize = useCallback(
    ({ target, width: newW, height: newH, drag }: any) => {
      const beforeTranslate = drag.beforeTranslate;
      const newX = beforeTranslate[0];
      const newY = beforeTranslate[1];
      const minW = definition?.minSize?.width ?? 20;
      const minH = definition?.minSize?.height ?? 20;
      const finalW = Math.max(newW, minW);
      const finalH = Math.max(newH, minH);
      target.style.width = `${finalW}px`;
      target.style.height = `${finalH}px`;
      target.style.transform = `translate(${newX}px, ${newY}px) rotate(${rotation}deg)`;
      const next: { translate: [number, number]; size: [number, number] } = { translate: [newX, newY], size: [finalW, finalH] };
      // 同拖拽：缩放过程中不调用 setFrame，避免重渲染把 width/height/transform 覆盖回旧 store 值
      // （表现为「高度/宽度不跟随缩放手柄」）。实时值只写 frameRef，结束再提交 store。
      frameRef.current = next;
    },
    [rotation, definition?.minSize],
  );

  const handleResizeEnd = useCallback(() => {
    const minW = definition?.minSize?.width ?? 20;
    const minH = definition?.minSize?.height ?? 20;
    const cur = frameRef.current;
    const finalW = Math.max(cur.size[0], minW);
    const finalH = Math.max(cur.size[1], minH);
    updateComponentTransform(component.id, {
      x: Math.round(cur.translate[0]),
      y: Math.round(cur.translate[1]),
      width: Math.round(finalW),
      height: Math.round(finalH),
    });
  }, [component.id, definition?.minSize, updateComponentTransform]);

  const handleRotateStart = useCallback(
    ({ set }: any) => {
      set?.(rotation);
    },
    [rotation],
  );

  const handleRotate = useCallback(
    ({ target, rotation: newRot }: any) => {
      const t = frameRef.current.translate;
      target.style.transform = `translate(${t[0]}px, ${t[1]}px) rotate(${newRot}deg)`;
    },
    [],
  );

  const handleRotateEnd = useCallback(
    ({ lastEvent }: any) => {
      if (lastEvent) {
        updateComponentTransform(component.id, {
          rotation: Math.round(lastEvent.rotation * 100) / 100,
        });
      }
    },
    [component.id, updateComponentTransform],
  );

  const canEdit = !previewMode && !isLocked;

  return (
    <>
      <Box
        ref={targetRef}
        data-comp-id={component.id}
        sx={{
          position: "absolute",
          left: 0,
          top: 0,
          width,
          height,
          transform: `translate(${x}px, ${y}px) rotate(${rotation}deg)`,
          outline: previewMode
            ? "none"
            : showBorder
              ? isSelected
                ? "2px solid #1976d2"
                : "1px dashed rgba(25,118,210,0.4)"
              : "none",
          outlineOffset: previewMode ? 0 : 0,
          userSelect: "none",
          pointerEvents: isCanvasDragOver
            ? "none"
            : previewMode
              ? "auto" // P0-3：预览态恒 auto（对齐发布端 layout.ts 恒 auto）；内部按钮/输入才能接收事件
              : "auto",
          cursor: previewMode
            ? (effectiveInteractive ? "pointer" : "default")
            : canEdit ? "move" : "default",
          "&:hover": previewMode
            ? (effectiveInteractive ? { filter: "brightness(1.08)", transition: "filter 0.15s" } : {})
            : canEdit ? {
                outline: "1px dashed rgba(25,118,210,0.4)",
              } : {},
        }}
        onClick={previewMode ? (effectiveInteractive ? handlePreviewClick : undefined) : handleClick}
        onDoubleClick={previewMode ? (effectiveInteractive ? handlePreviewDblClick : undefined) : undefined}
        onContextMenu={previewMode ? undefined : handleContextMenu}
        onMouseEnter={previewMode ? undefined : () => onHover(component.id)}
        onMouseLeave={previewMode ? undefined : () => onHover(null)}
      >
        {/* 表单族控件的帮助文字 / 校验错误提示落在设计盒**下方**，必须允许溢出，否则被
            overflow:hidden 裁掉；发布端没有这层裁剪 → 不放开就会出现「编辑区看不到提示、
            发布页却有」的两端不一致。新增带 helperText 的表单控件时务必同步加入此白名单。 */}
        <Box sx={{ position: "relative", width: "100%", height: "100%", overflow: [
          "navbar-horizontal",
          "form-input", "form-textarea", "form-select",
          "form-checkbox", "form-radio", "form-switch", "form-slider",
          "form-date", "form-time", "form-number", "form-file",
          // 评分：星条按自然尺寸排布，星数/图标调大后可超出设计盒宽度（缩放系数恒 1 时尤其明显），
          // 且键盘聚焦环画在缩放内层上；发布端没有这层裁剪 → 必须放开，否则"编辑区被裁、发布页完整" ← P2-4
          "form-rate",
          // 级联选择的展开面板挂在字段层内（与发布端 .cas-panel-* 同构），必须在设计盒下沿可见
          "form-cascader", "form-label",
        ].includes(component.type) ? "visible" : "hidden" }}>
          {Renderer ? (
            <Renderer
              config={component.config}
              componentId={component.id}
              mode={previewMode ? "preview" : "edit"}
              width={width}
              height={height}
              onConfigChange={handleConfigChange}
              spatialContext={spatialContext}
              editorSelected={isSelected}
              childComponents={childComponents}
            />
          ) : (
            <FallbackRenderer
              config={component.config}
              componentId={component.id}
              componentType={component.type}
              error={loadError}
            />
          )}

          {/* 嵌套子组件（容器内绝对定位，子组件 position:absolute 相对此 Box）；隐藏的子组件不渲染 */}
          {childComponents.filter((child) => child.visible).map((child) => (
            <EditorCanvasComponent
              key={child.id}
              component={child}
              layerLocked={layerLocked}
              isCanvasDragOver={isCanvasDragOver}
              previewMode={previewMode}
              eventBindings={eventBindings}
              onSelect={onSelect}
              onHover={onHover}
              childComponents={childrenMap.get(child.id) || []}
              childrenMap={childrenMap}
            />
          ))}
        </Box>

        {/* 组件级边框装饰覆盖层 */}
        <Box
          sx={{
            position: "absolute",
            left: 0,
            top: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
            zIndex: 2,
          }}
        >
          <ComponentFrame frameConfig={component.config?.frame as Record<string, unknown> | undefined} componentId={component.id} width={width} height={height} />
        </Box>

        {/* 选中时显示组件名称 */}
        {!previewMode && isSelected && (
          <Box
            sx={{
              position: "absolute",
              top: -22,
              left: 0,
              fontSize: 11,
              color: "#fff",
              backgroundColor: "#1976d2",
              px: 0.75,
              py: 0.25,
              borderRadius: 0.5,
              whiteSpace: "nowrap",
              maxWidth: width,
              overflow: "hidden",
              textOverflow: "ellipsis",
              pointerEvents: "none",
            }}
          >
            {component.name}
          </Box>
        )}
      </Box>

      {/* react-moveable 拖拽/缩放/旋转手柄 */}
      {canEdit && isSelected && targetRef.current && (
        <Moveable
          ref={moveableRef as any}
          target={targetRef.current}
          draggable={definition?.capabilities?.draggable !== false && isInteractable}
          resizable={definition?.capabilities?.resizable !== false && isInteractable}
          rotatable={definition?.capabilities?.rotatable === true && isInteractable}
          throttleDrag={0}
          throttleResize={0}
          throttleRotate={0}
          zoom={zoom}
          keepRatio={false}
          origin={false}
          edge={false}
          minWidth={definition?.minSize?.width ?? 20}
          minHeight={definition?.minSize?.height ?? 20}
          onDragStart={handleDragStart}
          onDrag={handleDrag}
          onDragEnd={handleDragEnd}
          onResizeStart={handleResizeStart}
          onResize={handleResize}
          onResizeEnd={handleResizeEnd}
          onRotateStart={handleRotateStart}
          onRotate={handleRotate}
          onRotateEnd={handleRotateEnd}
        />
      )}

      {!previewMode && (
        <EditorContextMenu
          position={contextMenu}
          componentId={component.id}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
});
