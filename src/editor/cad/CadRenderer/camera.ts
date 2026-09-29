import type { CadRenderer } from './core';
import type { CadRendererInternal } from './internal';
import type { CameraInfo, FitMode } from './types';
import type { BoundingBox } from '../cad_runtime/scene_node';
import { isValidNumber } from '../rendering/GeometryFactory';
import { logger } from '../../../utils/logger';

declare module './core' {
  interface CadRenderer {
    /** 当前相机视图信息（中心点、世界宽高、缩放） */
    getCameraInfo(): CameraInfo;
    zoomIn(): void;
    zoomOut(): void;
    /** 按当前 fitMode 重新适配视图 */
    fitToView(): void;
    /** 设置适配模式；非 custom 模式会立即重新适配 */
    setFitMode(mode: FitMode): void;
    getFitMode(): FitMode;
    getCameraState(): { centerX: number; centerY: number; halfW: number; halfH: number };
    setCameraState(state: { centerX: number; centerY: number; halfW: number; halfH: number }): void;
    /** 当前绘图范围（优先外部 bounds，其次实体包围盒） */
    getDrawingBounds(): BoundingBox | null;

    _fitToView(): void;
    _computeNodeBounds(): BoundingBox | null;
    _boundsForView(externalBounds: BoundingBox | null): BoundingBox | null;
  }
}

export const cameraMethods = {
  getCameraInfo(this: CadRenderer): CameraInfo {
    const f = this as unknown as CadRendererInternal;
    return f._cameraController.getCameraInfo() as CameraInfo;
  },

  zoomIn(this: CadRenderer): void {
    const f = this as unknown as CadRendererInternal;
    f._cameraController.zoomIn();
    f._requestRender();
  },

  zoomOut(this: CadRenderer): void {
    const f = this as unknown as CadRendererInternal;
    f._cameraController.zoomOut();
    f._requestRender();
  },

  fitToView(this: CadRenderer): void {
    (this as unknown as CadRendererInternal)._fitToView();
  },

  setFitMode(this: CadRenderer, mode: FitMode): void {
    const f = this as unknown as CadRendererInternal;
    if (f._fitMode === mode) return;
    f._fitMode = mode;
    f._cameraController.setFitMode(mode);
    if (mode === 'custom') {
      f._requestRender();
    } else {
      f._fitToView();
    }
  },

  getFitMode(this: CadRenderer): FitMode {
    return (this as unknown as CadRendererInternal)._fitMode;
  },

  getCameraState(this: CadRenderer): { centerX: number; centerY: number; halfW: number; halfH: number } {
    return (this as unknown as CadRendererInternal)._cameraController.getCameraState();
  },

  setCameraState(this: CadRenderer, state: { centerX: number; centerY: number; halfW: number; halfH: number }): void {
    const f = this as unknown as CadRendererInternal;
    if (!isValidNumber(state.centerX) || !isValidNumber(state.centerY) ||
        !isValidNumber(state.halfW) || !isValidNumber(state.halfH) ||
        state.halfW <= 0 || state.halfH <= 0) {
      logger.warn('CadRenderer', 'setCameraState: invalid state', state);
      return;
    }
    f._cameraController.setCameraState(state);
    f._viewportCuller.schedule();
    f._requestRender();
  },

  getDrawingBounds(this: CadRenderer): BoundingBox | null {
    const f = this as unknown as CadRendererInternal;
    return f._boundsForView(f._externalBounds);
  },

  _fitToView(this: CadRenderer): void {
    const f = this as unknown as CadRendererInternal;
    const nodeBounds = f._computeNodeBounds();
    f._cameraController.fitToView(nodeBounds, f._externalBounds);
    f._interactionController.setInitialSpan(
      Math.max(
        f._cameraController.camera.right - f._cameraController.camera.left,
        f._cameraController.camera.top - f._cameraController.camera.bottom,
      ),
    );
    f._requestRender();
  },

  _computeNodeBounds(this: CadRenderer): BoundingBox | null {
    const f = this as unknown as CadRendererInternal;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const node of f._entityStore.getAllNodes()) {
      if (node.bbox) {
        minX = Math.min(minX, node.bbox.minX);
        minY = Math.min(minY, node.bbox.minY);
        maxX = Math.max(maxX, node.bbox.maxX);
        maxY = Math.max(maxY, node.bbox.maxY);
      }
    }
    if (!isFinite(minX)) return null;
    return { minX, minY, maxX, maxY };
  },

  _boundsForView(this: CadRenderer, externalBounds: BoundingBox | null): BoundingBox | null {
    if (externalBounds) return externalBounds;
    return (this as unknown as CadRendererInternal)._computeNodeBounds();
  },
};