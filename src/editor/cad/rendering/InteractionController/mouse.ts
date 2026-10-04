import type { InteractionController } from './core';
import type { InteractionControllerInternal } from './internal';
import { logger } from '../../../../utils/logger';

declare module './core' {
  interface InteractionController {
    _setupMouseInteraction(): void;
    _attachDocumentPanListeners(): void;
    _detachDocumentPanListeners(): void;
    _clientToWorldCoord(e: MouseEvent): { x: number; y: number };
    _updateLastWorldCoord(e: MouseEvent): void;
  }
}

/**
 * 鼠标/键盘事件装配：wheel（委托给 wheelZoom）、contextmenu、mousedown/move/up、
 * document 级平移监听、mouseleave、keydown，以及坐标换算辅助。
 * 原 InteractionController 的 `_setupMouseInteraction` 与坐标换算逻辑保持不变。
 */
export const mouseMethods = {
  _setupMouseInteraction(this: InteractionController): void {
    const f = this as unknown as InteractionControllerInternal;
    const canvas = f._sceneManager.canvas;

    // ── Wheel zoom (debounced) ──
    f._setupWheelZoom();

    // ── Context menu ──
    f._contextMenuHandler = (e: MouseEvent) => {
      e.preventDefault();
      if (f._interactionMode !== 'select') return;
      const hitId = f.pickEntityIdAt(e.clientX, e.clientY);
      if (hitId) {
        const node = f._entityStore.getNode(hitId);
        const layer = node?.layer || '';
        f._onEntityContextMenu?.(hitId, layer, e.clientX, e.clientY);
      }
    };
    canvas.addEventListener('contextmenu', f._contextMenuHandler);

    // ── Mouse down ──
    f._mouseDownHandler = (e: MouseEvent) => {
      logger.info('InteractionController', 'mousedown', { button: e.button, mode: f._interactionMode, isPanning: f._isPanning });
      if (e.button === 2) return;

      const camera = f._cameraController.camera;

      // 绘图模式
      if (f._interactionMode === 'draw_line' || f._interactionMode === 'draw_circle' || f._interactionMode === 'draw_text') {
        if (e.button === 0 && f._drawingManager) {
          let wx: number, wy: number;
          if (f._lastSnapPoint) {
            wx = f._lastSnapPoint.x;
            wy = f._lastSnapPoint.y;
          } else {
            const wc = f._clientToWorldCoord(e);
            wx = wc.x;
            wy = wc.y;
          }
          f._drawingManager.handleMouseDown(wx, wy);
        }
        return;
      }

      // 平移模式
      if (f._interactionMode === 'pan' || e.button === 1) {
        e.preventDefault();
        f._isPanning = true;
        f._panStart.set(e.clientX, e.clientY);
        f._cameraStart.set(camera.position.x, camera.position.y);
        f._attachDocumentPanListeners();
        f._updateCursor('grabbing');
        return;
      }

      // 选择模式
      if (e.button === 0 && f._interactionMode === 'select') {
        const hitId = f.pickEntityIdAt(e.clientX, e.clientY);
        if (hitId) {
          const node = f._entityStore.getNode(hitId);
          const layer = node?.layer || '';
          if (f._entityStore.isLayerLocked(layer)) {
            e.preventDefault();
            f._isPanning = true;
            f._panStart.set(e.clientX, e.clientY);
            f._cameraStart.set(camera.position.x, camera.position.y);
            f._attachDocumentPanListeners();
            f._updateCursor('not-allowed');
            return;
          }
          if (!f._selectionManager.getSelectedEntityIds().includes(hitId)) {
            f._selectionManager.selectEntity(hitId);
            f._onEntityClick?.(hitId, layer);
            f._onSelectionChanged?.(f._selectionManager.getSelectedEntityIds());
          }

          f._isDraggingEntity = true;
          f._dragEntityId = hitId;
          const wc = f._clientToWorldCoord(e);
          f._dragStartWorld.set(wc.x, wc.y);
          f._prepareSelectedEntitiesForDrag();
          for (const selId of f._selectionManager.getSelectedEntityIds()) {
            if (f._sdfTextRenderer.has(selId)) {
              f._sdfTextRenderer.startDrag(selId);
            }
          }
          f._updateCursor('grabbing');
        } else {
          f._selectionManager.deselectAll();
          f._onSelectionChanged?.([]);
          f._isBoxSelecting = true;
          f._boxSelectStart.set(e.clientX, e.clientY);
          f._boxSelectEnd.set(e.clientX, e.clientY);
          f._showBoxSelectOverlay(e.clientX, e.clientY);
          canvas.style.cursor = 'crosshair';
        }
      }
    };
    canvas.addEventListener('mousedown', f._mouseDownHandler);

    // ── Mouse move ──
    f._mouseMoveHandler = (e: MouseEvent) => {
      f._updateLastWorldCoord(e);
      f._handleSnap(e);

      if (f._drawingManager && (f._drawingManager.isDrawing() || f._drawingManager.isTextPlacing())) {
        const wc = f._clientToWorldCoord(e);
        f._drawingManager.handleMouseMove(wc.x, wc.y);
        return;
      }

      if (f._isBoxSelecting) {
        f._boxSelectEnd.set(e.clientX, e.clientY);
        f._updateBoxSelectOverlay();
        return;
      }

      if (f._isDraggingEntity && f._dragEntityId) {
        const wc = f._clientToWorldCoord(e);
        const dx = wc.x - f._dragStartWorld.x;
        const dy = wc.y - f._dragStartWorld.y;
        for (const selId of f._selectionManager.getSelectedEntityIds()) {
          f._applyDragPreview(selId, dx, dy);
          if (f._sdfTextRenderer.has(selId)) {
            const node = f._entityStore.getNode(selId);
            if (node) {
              const baseX = (node as any).posX ?? 0;
              const baseY = (node as any).posY ?? 0;
              f._sdfTextRenderer.updateDragPosition(selId, baseX + dx, baseY + dy);
            }
          }
          // 高亮框（填充+边框）跟随拖动
          f._selectionManager.setHighlightOverlayOffset(selId, dx, dy);
        }
        f._onRequestRender();
        return;
      }

      if (f._isPanning) {
        const camera = f._cameraController.camera;
        const dx = e.clientX - f._panStart.x;
        const dy = e.clientY - f._panStart.y;
        const renderRect = canvas.getBoundingClientRect();
        const worldDx = -dx * (camera.right - camera.left) / renderRect.width;
        const worldDy = dy * (camera.top - camera.bottom) / renderRect.height;
        camera.position.x = f._cameraStart.x + worldDx;
        camera.position.y = f._cameraStart.y + worldDy;
        camera.updateProjectionMatrix();
        f._onRequestRender();
        f._onScheduleViewportCulling();
        f._emitCameraChanged();
        return;
      }

      if (f._interactionMode === 'select') {
        const hitId = f.pickEntityIdAt(e.clientX, e.clientY);
        if (hitId) {
          f._updateCursor(f._selectionManager.getSelectedEntityIds().includes(hitId) ? 'move' : 'hover');
        } else {
          f._updateCursor();
        }
      }
    };
    canvas.addEventListener('mousemove', f._mouseMoveHandler);

    // ── Mouse up ──
    f._mouseUpHandler = (e: MouseEvent) => {
      if (f._isBoxSelecting) {
        f._completeBoxSelect(e.clientX, e.clientY);
        return;
      }

      if (f._isDraggingEntity && f._dragEntityId) {
        const wc = f._clientToWorldCoord(e);
        const dx = wc.x - f._dragStartWorld.x;
        const dy = wc.y - f._dragStartWorld.y;
        f._finishEntityDrag(dx, dy, false);

        f._isDraggingEntity = false;
        f._dragEntityId = null;
        const hoverId = f.pickEntityIdAt(e.clientX, e.clientY);
        if (hoverId && f._selectionManager.getSelectedEntityIds().includes(hoverId)) {
          f._updateCursor('move');
        } else if (hoverId) {
          f._updateCursor('hover');
        } else {
          f._updateCursor();
        }
        return;
      }

      if (f._isPanning) {
        f._isPanning = false;
        f._detachDocumentPanListeners();
        f._emitCameraInteractionEnd();
        if (f._interactionMode === 'select') {
          const panHoverId = f.pickEntityIdAt(e.clientX, e.clientY);
          if (panHoverId && f._selectionManager.getSelectedEntityIds().includes(panHoverId)) {
            f._updateCursor('move');
          } else if (panHoverId) {
            f._updateCursor('hover');
          } else {
            f._updateCursor();
          }
        } else {
          f._updateCursor();
        }
      }
    };
    canvas.addEventListener('mouseup', f._mouseUpHandler);

    // ── Document pan listeners ──
    f._documentPanMouseMoveHandler = (e: MouseEvent) => {
      if (!f._isPanning) return;
      e.preventDefault();
      e.stopPropagation();
      f._mouseMoveHandler(e);
    };

    f._documentPanMouseUpHandler = (e: MouseEvent) => {
      if (!f._isPanning) return;
      e.preventDefault();
      e.stopPropagation();
      f._mouseUpHandler(e);
    };

    // ── Mouse leave ──
    f._mouseLeaveHandler = () => {
      if (f._isDraggingEntity && f._dragEntityId) {
        const dx = f._lastWorldX - f._dragStartWorld.x;
        const dy = f._lastWorldY - f._dragStartWorld.y;
        f._finishEntityDrag(dx, dy, true);

        f._isDraggingEntity = false;
        f._dragEntityId = null;
        f._onRequestRender();
      }
      if (f._isBoxSelecting) {
        f._isBoxSelecting = false;
        f._hideBoxSelectOverlay();
      }
      if (f._isPanning && f._documentPanListenersAttached) {
        return;
      }
      if (f._isPanning && !f._documentPanListenersAttached) {
        f._isPanning = false;
        f._emitCameraInteractionEnd();
      }
      f._updateCursor();
    };
    canvas.addEventListener('mouseleave', f._mouseLeaveHandler);

    // ── Keyboard ──
    f._keyDownHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (f._drawingManager && (f._drawingManager.isDrawing() || f._drawingManager.isTextPlacing())) {
          f._drawingManager.cancelDrawing();
        }
      }
    };
    document.addEventListener('keydown', f._keyDownHandler);
  },

  _attachDocumentPanListeners(this: InteractionController): void {
    const f = this as unknown as InteractionControllerInternal;
    if (f._documentPanListenersAttached) return;
    document.addEventListener('mousemove', f._documentPanMouseMoveHandler, true);
    document.addEventListener('mouseup', f._documentPanMouseUpHandler, true);
    f._documentPanListenersAttached = true;
  },

  _detachDocumentPanListeners(this: InteractionController): void {
    const f = this as unknown as InteractionControllerInternal;
    if (!f._documentPanListenersAttached) return;
    document.removeEventListener('mousemove', f._documentPanMouseMoveHandler, true);
    document.removeEventListener('mouseup', f._documentPanMouseUpHandler, true);
    f._documentPanListenersAttached = false;
  },

  _clientToWorldCoord(this: InteractionController, e: MouseEvent): { x: number; y: number } {
    const f = this as unknown as InteractionControllerInternal;
    const canvas = f._sceneManager.canvas;
    const camera = f._cameraController.camera;
    const rect = canvas.getBoundingClientRect();
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    const worldX = camera.position.x + ndcX * (camera.right - camera.left) / 2;
    const worldY = camera.position.y + ndcY * (camera.top - camera.bottom) / 2;
    return { x: worldX, y: worldY };
  },

  _updateLastWorldCoord(this: InteractionController, e: MouseEvent): void {
    const f = this as unknown as InteractionControllerInternal;
    const canvas = f._sceneManager.canvas;
    const camera = f._cameraController.camera;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    f._lastWorldX = camera.position.x + ndcX * (camera.right - camera.left) / 2;
    f._lastWorldY = camera.position.y + ndcY * (camera.top - camera.bottom) / 2;
  },
};