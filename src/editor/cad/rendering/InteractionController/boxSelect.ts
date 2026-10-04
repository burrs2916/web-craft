import type { InteractionController } from './core';
import type { InteractionControllerInternal } from './internal';

declare module './core' {
  interface InteractionController {
    _showBoxSelectOverlay(startX: number, startY: number): void;
    _updateBoxSelectOverlay(): void;
    _hideBoxSelectOverlay(): void;
    _completeBoxSelect(clientX: number, clientY: number): void;
  }
}

/**
 * 框选：overlay 元素的创建/更新/隐藏，以及 mouseup 时的命中矩形选择。
 * 原 InteractionController 中 overlay 三方法与 mouseup 框选段落保持不变。
 */
export const boxSelectMethods = {
  _showBoxSelectOverlay(this: InteractionController, startX: number, startY: number): void {
    const f = this as unknown as InteractionControllerInternal;
    const container = f._sceneManager.container;
    if (!f._boxSelectOverlay) {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:absolute;border:1px dashed #4fc3f7;background:rgba(79,195,247,0.1);pointer-events:none;z-index:1000;display:none;';
      container.style.position = 'relative';
      container.appendChild(overlay);
      f._boxSelectOverlay = overlay;
    }
    const rect = container.getBoundingClientRect();
    f._boxSelectOverlay.style.left = `${startX - rect.left}px`;
    f._boxSelectOverlay.style.top = `${startY - rect.top}px`;
    f._boxSelectOverlay.style.width = '0px';
    f._boxSelectOverlay.style.height = '0px';
    f._boxSelectOverlay.style.display = 'block';
  },

  _updateBoxSelectOverlay(this: InteractionController): void {
    const f = this as unknown as InteractionControllerInternal;
    if (!f._boxSelectOverlay) return;
    const container = f._sceneManager.container;
    const rect = container.getBoundingClientRect();
    const x1 = Math.min(f._boxSelectStart.x, f._boxSelectEnd.x) - rect.left;
    const y1 = Math.min(f._boxSelectStart.y, f._boxSelectEnd.y) - rect.top;
    const x2 = Math.max(f._boxSelectStart.x, f._boxSelectEnd.x) - rect.left;
    const y2 = Math.max(f._boxSelectStart.y, f._boxSelectEnd.y) - rect.top;
    f._boxSelectOverlay.style.left = `${x1}px`;
    f._boxSelectOverlay.style.top = `${y1}px`;
    f._boxSelectOverlay.style.width = `${x2 - x1}px`;
    f._boxSelectOverlay.style.height = `${y2 - y1}px`;
  },

  _hideBoxSelectOverlay(this: InteractionController): void {
    const f = this as unknown as InteractionControllerInternal;
    if (f._boxSelectOverlay) {
      f._boxSelectOverlay.style.display = 'none';
    }
  },

  /** mouseup 收尾：隐藏 overlay、更新光标、按拖拽矩形选择实体。 */
  _completeBoxSelect(this: InteractionController, clientX: number, clientY: number): void {
    const f = this as unknown as InteractionControllerInternal;
    f._isBoxSelecting = false;
    f._hideBoxSelectOverlay();
    const hoverId = f.pickEntityIdAt(clientX, clientY);
    if (hoverId && f._selectionManager.getSelectedEntityIds().includes(hoverId)) {
      f._updateCursor('move');
    } else if (hoverId) {
      f._updateCursor('hover');
    } else {
      f._updateCursor();
    }

    const canvas = f._sceneManager.canvas;
    const sx = Math.min(f._boxSelectStart.x, f._boxSelectEnd.x);
    const sy = Math.min(f._boxSelectStart.y, f._boxSelectEnd.y);
    const ex = Math.max(f._boxSelectStart.x, f._boxSelectEnd.x);
    const ey = Math.max(f._boxSelectStart.y, f._boxSelectEnd.y);

    if (ex - sx > 3 && ey - sy > 3) {
      const camera = f._cameraController.camera;
      const rect = canvas.getBoundingClientRect();
      const ndcMinX = ((sx - rect.left) / rect.width) * 2 - 1;
      const ndcMinY = -((ey - rect.top) / rect.height) * 2 + 1;
      const ndcMaxX = ((ex - rect.left) / rect.width) * 2 - 1;
      const ndcMaxY = -((sy - rect.top) / rect.height) * 2 + 1;
      const worldMinX = camera.position.x + ndcMinX * (camera.right - camera.left) / 2;
      const worldMinY = camera.position.y + ndcMinY * (camera.top - camera.bottom) / 2;
      const worldMaxX = camera.position.x + ndcMaxX * (camera.right - camera.left) / 2;
      const worldMaxY = camera.position.y + ndcMaxY * (camera.top - camera.bottom) / 2;
      f._selectionManager.selectEntitiesInRect(worldMinX, worldMinY, worldMaxX, worldMaxY);
      f._onSelectionChanged?.(f._selectionManager.getSelectedEntityIds());
    }
  },
};