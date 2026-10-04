import type { InteractionController } from './core';
import type { InteractionControllerInternal } from './internal';

/**
 * 滚轮缩放：防抖 + 钳位 + 以鼠标位置为缩放中心。
 * 原 `_setupMouseInteraction` 中的 wheel 段落抽离至此，逻辑保持不变。
 */
export const wheelZoomMethods = {
  _setupWheelZoom(this: InteractionController): void {
    const f = this as unknown as InteractionControllerInternal;
    const canvas = f._sceneManager.canvas;

    f._wheelHandler = (e: WheelEvent) => {
      e.preventDefault();
      const camera = f._cameraController.camera;
      const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
      f._wheelZoomFactor *= zoomFactor;

      const rect = canvas.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      f._wheelWorldX = camera.position.x + mouseX * (camera.right - camera.left) / 2;
      f._wheelWorldY = camera.position.y + mouseY * (camera.top - camera.bottom) / 2;

      if (!f._wheelPending) {
        f._wheelPending = true;
        requestAnimationFrame(() => {
          f._wheelPending = false;
          const zf = f._wheelZoomFactor;
          f._wheelZoomFactor = 1.0;
          if (zf === 1.0) return;

          // 相机退化 → fitToView
          if (camera.left >= camera.right || camera.bottom >= camera.top) {
            f._cameraController.checkDegenerateAndRecover(null, null);
            f._onRequestRender();
            return;
          }

          const oldSpanX = camera.right - camera.left;
          const oldSpanY = camera.top - camera.bottom;

          if (f._initialSpan <= 0) {
            f._initialSpan = Math.max(oldSpanX, oldSpanY, 1.0);
          }

          const minSpan = f._initialSpan * f._MIN_SPAN_RATIO;
          const maxSpan = f._initialSpan * f._MAX_SPAN_RATIO;
          const minZf = minSpan / Math.min(oldSpanX, oldSpanY);
          const maxZf = maxSpan / Math.max(oldSpanX, oldSpanY);
          const appliedZf = Math.max(minZf, Math.min(maxZf, zf));

          const newLeft = f._wheelWorldX + (camera.left - f._wheelWorldX) * appliedZf;
          const newRight = f._wheelWorldX + (camera.right - f._wheelWorldX) * appliedZf;
          const newTop = f._wheelWorldY + (camera.top - f._wheelWorldY) * appliedZf;
          const newBottom = f._wheelWorldY + (camera.bottom - f._wheelWorldY) * appliedZf;

          camera.left = newLeft;
          camera.right = newRight;
          camera.top = newTop;
          camera.bottom = newBottom;

          const currentSpan = Math.max(newRight - newLeft, newTop - newBottom);
          const zoomNear = Math.max(0.1, currentSpan / 10000);
          const zoomFar = Math.min(currentSpan * 10, zoomNear * 10000);
          camera.near = zoomNear;
          camera.far = Math.max(zoomFar, zoomNear * 10);
          camera.updateProjectionMatrix();

          f._onRequestRender();
          f._onScheduleViewportCulling();
          f._emitCameraChanged();
          f._scheduleCameraInteractionEnd();
        });
      }
    };
    canvas.addEventListener('wheel', f._wheelHandler, { passive: false });
  },
};