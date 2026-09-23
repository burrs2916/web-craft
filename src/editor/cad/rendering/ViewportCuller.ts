import type { SceneManager } from './SceneManager';
import type { EntityStore } from './EntityStore';
import type { CameraController } from './CameraController';
import { GridSpatialIndex } from '../cad_runtime/grid_spatial_index';
import { SdfTextRenderer } from '../cad_runtime/sdf_text_renderer';
import { BatchedLayerBuilder } from '../cad_runtime/batched_layer_builder';
import { logger } from '../../../utils/logger';

/**
 * ViewportCuller — 视口裁剪
 *
 * 职责：基于相机视口计算可见实体，隐藏不可见的 mesh
 * 依赖：SceneManager（渲染请求）、EntityStore（节点/图层查询）、CameraController（视口范围）
 */
export class ViewportCuller {
  private _sceneManager: SceneManager;
  private _entityStore: EntityStore;
  private _cameraController: CameraController;
  private _spatialIndex: GridSpatialIndex;
  private _sdfTextRenderer: SdfTextRenderer;
  private _batchedBuilder: BatchedLayerBuilder;
  private _useBatchedText: boolean;

  private _cullingScheduled = false;
  private _lastCullingTime = 0;
  private static readonly CULLING_THROTTLE_MS = 50;

  constructor(config: {
    sceneManager: SceneManager;
    entityStore: EntityStore;
    cameraController: CameraController;
    spatialIndex: GridSpatialIndex;
    sdfTextRenderer: SdfTextRenderer;
    batchedBuilder: BatchedLayerBuilder;
    useBatchedText: boolean;
  }) {
    this._sceneManager = config.sceneManager;
    this._entityStore = config.entityStore;
    this._cameraController = config.cameraController;
    this._spatialIndex = config.spatialIndex;
    this._sdfTextRenderer = config.sdfTextRenderer;
    this._batchedBuilder = config.batchedBuilder;
    this._useBatchedText = config.useBatchedText;
  }

  setUseBatchedText(enabled: boolean): void {
    this._useBatchedText = enabled;
  }

  /** 请求节流的视口裁剪 */
  schedule(): void {
    if (this._cullingScheduled) return;

    const now = performance.now();
    if (now - this._lastCullingTime < ViewportCuller.CULLING_THROTTLE_MS) {
      // 延迟到节流窗口结束
      setTimeout(() => this._doSchedule(), ViewportCuller.CULLING_THROTTLE_MS);
      return;
    }
    this._doSchedule();
  }

  private _doSchedule(): void {
    if (this._cullingScheduled) return;
    this._cullingScheduled = true;
    requestAnimationFrame(() => {
      this._cullingScheduled = false;
      this.performCulling();
    });
  }

  /** 立即执行视口裁剪 */
  performCulling(): void {
    const entityMeshes = this._entityStore.getAllMeshes();
    if (entityMeshes.size === 0 && this._batchedBuilder.getEntityCount() === 0 && this._sdfTextRenderer.size === 0) return;

    const camera = this._cameraController.camera;

    // 验证相机参数
    if (!this._isValidNum(camera.left) || !this._isValidNum(camera.right) ||
        !this._isValidNum(camera.bottom) || !this._isValidNum(camera.top) ||
        !this._isValidNum(camera.position.x) || !this._isValidNum(camera.position.y)) {
      logger.warn('ViewportCuller', 'invalid camera parameters');
      return;
    }

    const viewMinX = camera.left + camera.position.x;
    const viewMaxX = camera.right + camera.position.x;
    const viewMinY = camera.bottom + camera.position.y;
    const viewMaxY = camera.top + camera.position.y;

    const viewW = viewMaxX - viewMinX;
    const viewH = viewMaxY - viewMinY;

    if (!this._isValidNum(viewW) || !this._isValidNum(viewH) || viewW <= 0 || viewH <= 0) {
      logger.warn('ViewportCuller', 'invalid view dimensions', { viewW, viewH });
      return;
    }

    const rawMargin = Math.max(viewW, viewH) * 0.02;
    const margin = Math.max(0.001, Math.min(Math.max(viewW, viewH) * 0.5, rawMargin));

    const extMinX = viewMinX - margin;
    const extMaxX = viewMaxX + margin;
    const extMinY = viewMinY - margin;
    const extMaxY = viewMaxY + margin;

    if (!this._isValidNum(extMinX) || !this._isValidNum(extMaxX) ||
        !this._isValidNum(extMinY) || !this._isValidNum(extMaxY)) {
      logger.warn('ViewportCuller', 'invalid extended bounds');
      return;
    }

    const visibleInSpatial = this._spatialIndex.queryRect(extMinX, extMinY, extMaxX, extMaxY);
    const visibleSet = new Set<string>(visibleInSpatial);

    let changed = false;
    for (const [id, mesh] of entityMeshes) {
      if (this._entityStore.isLogicallyHidden(id)) {
        if (mesh.visible) { mesh.visible = false; changed = true; }
        continue;
      }
      const node = this._entityStore.getNode(id);
      const layerName = node?.layer;
      if (layerName && !this._entityStore.isLayerVisible(layerName)) {
        if (mesh.visible) { mesh.visible = false; changed = true; }
        continue;
      }
      const shouldShow = visibleSet.has(id) || !this._spatialIndex.hasEntity(id);
      if (mesh.visible !== shouldShow) {
        mesh.visible = shouldShow;
        changed = true;
      }
    }

    const batchedChanged = this._batchedBuilder.applyCulling(visibleSet);
    if (batchedChanged) {
      this._batchedBuilder.rebuildCulled();
      changed = true;
    }

    if (this._useBatchedText) {
      const hiddenLayers = this._getHiddenLayerSet();
      const textChanged = this._sdfTextRenderer.applyCulling(extMinX, extMinY, extMaxX, extMaxY, hiddenLayers, this._getLogicallyHiddenSet());
      if (textChanged) {
        this._sdfTextRenderer.sync().then(() => {
          if (!this._sceneManager.isDisposed) this._sceneManager.requestRender();
        });
        changed = true;
      }
    }

    this._lastCullingTime = performance.now();

    if (changed) {
      this._sceneManager.requestRender();
    }
  }

  private _getHiddenLayerSet(): Set<string> {
    const result = new Set<string>();
    for (const name of this._entityStore.getLayers()) {
      if (!this._entityStore.isLayerVisible(name)) {
        result.add(name);
      }
    }
    return result;
  }

  private _getLogicallyHiddenSet(): Set<string> {
    const result = new Set<string>();
    for (const node of this._entityStore.getAllNodes()) {
      if (this._entityStore.isLogicallyHidden(String(node.id))) {
        result.add(String(node.id));
      }
    }
    return result;
  }

  private _isValidNum(n: unknown): n is number {
    return typeof n === 'number' && isFinite(n) && !isNaN(n);
  }

  dispose(): void {
    this._cullingScheduled = false;
  }
}
