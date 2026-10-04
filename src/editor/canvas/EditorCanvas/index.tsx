import Box from '@mui/material/Box';
import { useCallback, useRef } from 'react';
import { useEditorStore } from '../../../store/editorStore';
import { useSceneEventBridge } from '../../hooks/useSceneEventBridge';
import { toAssetUrl } from '../../utils/assetUrl';
import { CanvasErrorBoundary } from '../CanvasErrorBoundary';
import { EditorCanvasComponent } from '../EditorCanvasComponent';
import { EditorRuler } from '../EditorRuler';
import { CanvasContentOverlays } from './CanvasContentOverlays';
import { CanvasFloatingHud } from './CanvasFloatingHud';
import type { EditorCanvasProps } from './types';
import { useCanvasDrop } from './useCanvasDrop';
import { useCanvasScene } from './useCanvasScene';
import { useCanvasViewport } from './useCanvasViewport';

export function EditorCanvas({ previewMode: previewModeProp }: EditorCanvasProps = {}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasContentRef = useRef<HTMLDivElement>(null);

  const canvasConfig = useEditorStore((s) => s.canvasConfig);
  const previewModeState = useEditorStore((s) => s.previewMode);
  const eventBindings = useEditorStore((s) => s.eventBindings);
  const zoom = useEditorStore((s) => s.zoom);
  const selectComponent = useEditorStore((s) => s.selectComponent);
  const setHoveredComponent = useEditorStore((s) => s.setHoveredComponent);
  const zoomIn = useEditorStore((s) => s.zoomIn);
  const zoomOut = useEditorStore((s) => s.zoomOut);
  const resetZoom = useEditorStore((s) => s.resetZoom);

  const isPreview = previewModeProp ?? previewModeState;

  const { visibleComponents, childrenMap, canvasContentHeight } = useCanvasScene();

  useSceneEventBridge(containerRef);

  const viewport = useCanvasViewport({ containerRef, canvasContentRef, isPreview });
  const drop = useCanvasDrop({
    containerRef,
    screenToCanvas: viewport.screenToCanvas,
    cursorPos: viewport.cursorPos,
    setCursorPos: viewport.setCursorPos,
    isPreview,
    visibleComponents,
  });

  const getCanvasBackgroundStyle = useCallback(() => {
    const bg = canvasConfig.background;
    if (bg.type === 'solid') return { backgroundColor: bg.color };
    if (bg.type === 'gradient') {
      const dir = bg.gradient.direction;
      if (dir === 'radial') return { background: `radial-gradient(circle, ${bg.gradient.colors[0]}, ${bg.gradient.colors[1]})` };
      const cssDir = dir.replace(/-/g, ' ');
      return { background: `linear-gradient(${cssDir}, ${bg.gradient.colors[0]}, ${bg.gradient.colors[1]})` };
    }
    if (bg.type === 'image' && bg.imageUrl) return { backgroundImage: `url(${toAssetUrl(bg.imageUrl)})`, backgroundSize: bg.imageFit || 'cover', backgroundPosition: 'center' };
    // video 类型由 <video> 元素提供背景，容器本身设为透明
    if (bg.type === 'video') return { backgroundColor: 'transparent' };
    return { backgroundColor: '#ffffff' };
  }, [canvasConfig.background]);

  const hasBackgroundVideo = canvasConfig.background.type === 'video' && canvasConfig.background.videoUrl;

  // 缩放后的视觉尺寸
  const scaledWidth = Math.round(canvasConfig.width * zoom);
  const scaledHeight = Math.round(canvasContentHeight * zoom);

  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
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
          onWheel={viewport.handleWheel}
          onMouseDown={viewport.handleMouseDown}
          onMouseMove={viewport.handleMouseMove}
          onMouseUp={viewport.handleMouseUp}
          onMouseLeave={viewport.handleMouseLeave}
          onClick={isPreview ? undefined : viewport.handleCanvasClick}
          onDragEnter={isPreview ? undefined : drop.handleDragEnter}
          onDragOver={isPreview ? undefined : drop.handleDragOver}
          onDragLeave={isPreview ? undefined : drop.handleDragLeave}
          onDrop={isPreview ? undefined : drop.handleDrop}
          sx={{
            width: '100%',
            height: '100%',
            overflow: 'auto',
            position: 'relative',
            backgroundColor: (t) =>
              t.palette.mode === 'dark'
                ? drop.isDragOver ? '#2e2e42' : '#1a1a24'
                : drop.isDragOver ? '#d0d0da' : '#e0e0e8',
            cursor: viewport.spaceHeld ? 'grab' : 'default',
            outline: !isPreview && drop.isDragOver
              ? (t) => `2px dashed ${t.palette.primary.main}`
              : 'none',
            outlineOffset: -2,
            // flex column + 上下弹性 spacer 实现双向居中
            // 画布比容器小时居中，比容器大时 spacer 收缩到 0 允许正常滚动
            display: 'flex',
            flexDirection: 'column',
            '&::-webkit-scrollbar': { width: 10, height: 10 },
            '&::-webkit-scrollbar-thumb': {
              backgroundColor: 'rgba(128,128,128,0.3)',
              borderRadius: 5,
              '&:hover': { backgroundColor: 'rgba(128,128,128,0.5)' },
            },
            '&::-webkit-scrollbar-track': { backgroundColor: 'transparent' },
          }}
        >
          {/* Sizer — 撑开滚动区域到缩放后的尺寸 */}
          <Box
            sx={{
              width: scaledWidth,
              height: scaledHeight,
              minWidth: 'fit-content',
              minHeight: 'fit-content',
              flexShrink: 0,
              position: 'relative',
              // margin auto 在 flex 中实现水平+垂直居中，内容超出时 margin 归 0
              margin: 'auto',
            }}
          >
            {/* 画布内容区：原始尺寸 + scale 变换 */}
            <Box
              ref={canvasContentRef}
              sx={{
                width: canvasConfig.width,
                minHeight: canvasContentHeight,
                position: 'absolute',
                top: 0,
                left: 0,
                transform: `scale(${zoom})`,
                transformOrigin: 'top left',
                fontFamily: canvasConfig.fontFamily || undefined,
                paddingTop: canvasConfig.padding?.top || 0,
                paddingRight: canvasConfig.padding?.right || 0,
                paddingBottom: canvasConfig.padding?.bottom || 0,
                paddingLeft: canvasConfig.padding?.left || 0,
                ...getCanvasBackgroundStyle(),
                boxShadow: isPreview
                  ? 'none'
                  : (t) =>
                      t.palette.mode === 'dark'
                        ? '0 0 0 1px rgba(255,255,255,0.06), 0 4px 24px rgba(0,0,0,0.6)'
                        : '0 0 0 1px rgba(0,0,0,0.06), 0 4px 24px rgba(0,0,0,0.1)',
              }}
            >
              {/* 视频背景 */}
              {hasBackgroundVideo && (
                <Box
                  sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    overflow: 'hidden',
                    zIndex: 0,
                    pointerEvents: 'none',
                  }}
                >
                  <video
                    src={toAssetUrl(canvasConfig.background.videoUrl!)}
                    autoPlay={canvasConfig.background.videoAutoplay}
                    muted={canvasConfig.background.videoMuted}
                    loop={canvasConfig.background.videoLoop}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </Box>
              )}

              {/* 组件渲染（绝对定位，仅根级；嵌套子组件由 EditorCanvasComponent 递归渲染） */}
              {visibleComponents.map(({ comp, layer }) => (
                <CanvasErrorBoundary key={comp.id} componentId={comp.id}>
                  <EditorCanvasComponent
                    component={comp}
                    layerLocked={layer.locked}
                    isCanvasDragOver={drop.isDragOver}
                    previewMode={isPreview}
                    eventBindings={eventBindings}
                    onSelect={selectComponent}
                    onHover={setHoveredComponent}
                    childComponents={childrenMap.get(comp.id) || []}
                    childrenMap={childrenMap}
                  />
                </CanvasErrorBoundary>
              ))}

              <CanvasContentOverlays
                isPreview={isPreview}
                visibleCount={visibleComponents.length}
                isDragOver={drop.isDragOver}
                dragPreview={drop.dragPreview}
                dropTargetPreview={drop.dropTargetPreview}
                guides={drop.guides}
              />
            </Box>
          </Box>
        </Box>
      </EditorRuler>

      <CanvasFloatingHud
        isPreview={isPreview}
        spaceHeld={viewport.spaceHeld}
        cursorPos={viewport.cursorPos}
        zoom={zoom}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onResetZoom={resetZoom}
        onZoomToFit={viewport.handleZoomToFit}
      />
    </Box>
  );
}