import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import type { SceneNode } from '../cad_runtime/scene_node';
import type { BatchedLayerBuilder } from '../cad_runtime/batched_layer_builder';
import type { SdfTextRenderer } from '../cad_runtime/sdf_text_renderer';
import type { GridSpatialIndex } from '../cad_runtime/grid_spatial_index';
import type { SceneManager } from './SceneManager';
import type { CameraController, CameraInfo } from './CameraController';
import type { EntityStore } from './EntityStore';
import type { SelectionManager } from './SelectionManager';
import type { GeometryFactory } from './GeometryFactory';
import { DrawingManager } from '../drawing/DrawingManager';
import { SnapManager } from '../snap/SnapManager';
import { logger } from '../../../utils/logger';

// ── Types ──

export type InteractionMode = 'select' | 'pan' | 'draw_line' | 'draw_circle' | 'draw_text';

export interface InteractionControllerConfig {
  sceneManager: SceneManager;
  cameraController: CameraController;
  entityStore: EntityStore;
  selectionManager: SelectionManager;
  geometryFactory: GeometryFactory;
  sdfTextRenderer: SdfTextRenderer;
  batchedBuilder: BatchedLayerBuilder;
  spatialIndex: GridSpatialIndex;

  // Callbacks
  onRequestRender: () => void;
  onScheduleViewportCulling: () => void;
  onRebuildEntityMesh: (entityId: string) => void;
  onTranslateNode: (node: SceneNode, dx: number, dy: number) => void;

  // Event callbacks
  onEntityClick?: (entityId: string, layer: string) => void;
  onSelectionChanged?: (entityIds: string[]) => void;
  onCameraChanged?: (info: CameraInfo) => void;
  onCameraInteractionEnd?: (info: CameraInfo) => void;
  onEntityMoved?: (entityId: string, dx: number, dy: number) => void;
  onEntityContextMenu?: (entityId: string, layer: string, clientX: number, clientY: number) => void;
  onDrawComplete?: (entityJson: string) => void;
}

// ── InteractionController ──

/**
 * InteractionController — 鼠标/键盘/触摸交互
 *
 * 职责：
 * - wheel 缩放（防抖 + 钳位）
 * - 平移（含 document 级监听）
 * - 点击/框选
 * - 实体拖动
 * - 绘图工具集成 (DrawingManager)
 * - 捕捉集成 (SnapManager)
 * - 光标管理
 * - 相机变更通知
 */
export class InteractionController {
  // ── Dependencies ──
  private _sceneManager: SceneManager;
  private _cameraController: CameraController;
  private _entityStore: EntityStore;
  private _selectionManager: SelectionManager;
  private _geometryFactory: GeometryFactory;
  private _sdfTextRenderer: SdfTextRenderer;
  private _batchedBuilder: BatchedLayerBuilder;
  private _spatialIndex: GridSpatialIndex;

  // ── Render callbacks ──
  private _onRequestRender: () => void;
  private _onScheduleViewportCulling: () => void;
  private _onRebuildEntityMesh: (entityId: string) => void;
  private _onTranslateNode: (node: SceneNode, dx: number, dy: number) => void;

  // ── Event callbacks ──
  private _onEntityClick?: (entityId: string, layer: string) => void;
  private _onSelectionChanged?: (entityIds: string[]) => void;
  private _onCameraChanged?: (info: CameraInfo) => void;
  private _onCameraInteractionEnd?: (info: CameraInfo) => void;
  private _onEntityMoved?: (entityId: string, dx: number, dy: number) => void;
  private _onEntityContextMenu?: (entityId: string, layer: string, clientX: number, clientY: number) => void;
  private _onDrawComplete?: (entityJson: string) => void;

  // ── Interaction state ──
  private _isPanning = false;
  private _isBoxSelecting = false;
  private _boxSelectStart = new THREE.Vector2();
  private _boxSelectEnd = new THREE.Vector2();
  private _boxSelectOverlay: HTMLDivElement | null = null;
  private _isDraggingEntity = false;
  private _dragEntityId: string | null = null;
  private _dragStartWorld = new THREE.Vector2();
  private _dragLineSnapshots: Map<string, number[]> = new Map();

  // ── Pan state ──
  private _panStart = new THREE.Vector2();
  private _cameraStart = new THREE.Vector2();
  private _documentPanListenersAttached = false;

  // ── Event handler refs ──
  private _wheelHandler!: (e: WheelEvent) => void;
  private _contextMenuHandler!: (e: MouseEvent) => void;
  private _mouseDownHandler!: (e: MouseEvent) => void;
  private _mouseMoveHandler!: (e: MouseEvent) => void;
  private _mouseUpHandler!: (e: MouseEvent) => void;
  private _mouseLeaveHandler!: () => void;
  private _keyDownHandler!: (e: KeyboardEvent) => void;
  private _documentPanMouseMoveHandler!: (e: MouseEvent) => void;
  private _documentPanMouseUpHandler!: (e: MouseEvent) => void;

  // ── Wheel debounce ──
  private _wheelPending = false;
  private _wheelZoomFactor = 1.0;
  private _wheelWorldX = 0;
  private _wheelWorldY = 0;
  private _initialSpan = 0;
  private readonly _MIN_SPAN_RATIO = 0.01;
  private readonly _MAX_SPAN_RATIO = 100;

  // ── Interaction mode ──
  private _interactionMode: InteractionMode = 'select';

  // ── Camera change notification ──
  private _lastCameraEmit = 0;
  private _cameraInteractionEndTimer: ReturnType<typeof setTimeout> | null = null;

  // ── World coords ──
  private _lastWorldX = 0;
  private _lastWorldY = 0;

  // ── Snap ──
  private _snapManager: SnapManager | null = null;
  private _snapMarker: THREE.Object3D | null = null;
  private _lastSnapPoint: { x: number; y: number } | null = null;

  // ── Drawing ──
  private _drawingManager: DrawingManager | null = null;

  // ── Dispose guard ──
  private _isDisposed = false;

  constructor(config: InteractionControllerConfig) {
    this._sceneManager = config.sceneManager;
    this._cameraController = config.cameraController;
    this._entityStore = config.entityStore;
    this._selectionManager = config.selectionManager;
    this._geometryFactory = config.geometryFactory;
    this._sdfTextRenderer = config.sdfTextRenderer;
    this._batchedBuilder = config.batchedBuilder;
    this._spatialIndex = config.spatialIndex;

    this._onRequestRender = config.onRequestRender;
    this._onScheduleViewportCulling = config.onScheduleViewportCulling;
    this._onRebuildEntityMesh = config.onRebuildEntityMesh;
    this._onTranslateNode = config.onTranslateNode;

    this._onEntityClick = config.onEntityClick;
    this._onSelectionChanged = config.onSelectionChanged;
    this._onCameraChanged = config.onCameraChanged;
    this._onCameraInteractionEnd = config.onCameraInteractionEnd;
    this._onEntityMoved = config.onEntityMoved;
    this._onEntityContextMenu = config.onEntityContextMenu;
    this._onDrawComplete = config.onDrawComplete;

    this._setupMouseInteraction();
  }

  // ═══════════════════════════════════════════════════
  // Public API
  // ═══════════════════════════════════════════════════

  setInteractionMode(mode: InteractionMode): void {
    if (mode !== this._interactionMode) {
      this._selectionManager.deselectAll();
      this._onSelectionChanged?.([]);
    }
    this._interactionMode = mode;

    if (mode === 'draw_line' || mode === 'draw_circle' || mode === 'draw_text') {
      if (!this._drawingManager) {
        this._drawingManager = new DrawingManager();
        this._drawingManager.setScene(this._sceneManager.scene);
        this._drawingManager.setOnDrawComplete((entityJson: string) => {
          this._onDrawComplete?.(entityJson);
        });
        this._drawingManager.setOnDrawPreview((_preview: any) => {
          // 预览已由 DrawingManager 处理
        });
      }
      this._drawingManager.startDrawing(mode);
      this._updateCursor();
    } else {
      if (this._drawingManager) {
        this._drawingManager.cancelDrawing();
      }
      this._updateCursor();
    }
  }

  getInteractionMode(): InteractionMode {
    return this._interactionMode;
  }

  setTextDrawParams(params: { content: string; height: number; layer: string; color: number }): void {
    if (this._drawingManager) {
      this._drawingManager.setTextParams(params);
    }
  }

  setOnDrawComplete(callback: (entityJson: string) => void): void {
    this._onDrawComplete = callback;
  }

  initSnapManager(settings?: any): void {
    if (!this._snapManager) {
      this._snapManager = new SnapManager(settings);
    }
  }

  setSnapEnabled(type: string, enabled: boolean): void {
    if (!this._snapManager) {
      this._snapManager = new SnapManager();
    }
    if (enabled) {
      this._snapManager.enableSnap(type);
    } else {
      this._snapManager.disableSnap(type);
    }
  }

  getSnapManager(): SnapManager | null {
    return this._snapManager;
  }

  getSnapWorldPoint(): { x: number; y: number } | null {
    return this._lastSnapPoint;
  }

  getLastWorldCoord(): { x: number; y: number } {
    return { x: this._lastWorldX, y: this._lastWorldY };
  }

  getCameraInfo(): CameraInfo {
    return this._cameraController.getCameraInfo();
  }

  setInitialSpan(span: number): void {
    this._initialSpan = span;
  }

  /** 合成拾取：空间索引 → SDF 文字 → GPU */
  pickEntityIdAt(clientX: number, clientY: number, includeHidden: boolean = false): string | null {
    const canvas = this._sceneManager.canvas;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;

    const canvasX = clientX - rect.left;
    const canvasY = clientY - rect.top;
    const camera = this._cameraController.camera;

    const ndcX = (canvasX / rect.width) * 2 - 1;
    const ndcY = -(canvasY / rect.height) * 2 + 1;
    const worldPoint = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(camera);

    const pixelSize = Math.max(
      (camera.right - camera.left) / rect.width,
      (camera.top - camera.bottom) / rect.height,
    );
    const tolerance = pixelSize * 8;

    // 1) 空间索引
    const candidates = this._spatialIndex.queryPointCandidates(worldPoint.x, worldPoint.y, tolerance);
    for (const { entityId } of candidates) {
      if (includeHidden) return entityId;
      const node = this._entityStore.getNode(entityId);
      const layerName = node?.layer;
      if (layerName && !this._entityStore.isLayerVisible(layerName)) continue;
      if (this._entityStore.isLogicallyHidden(entityId)) continue;
      return entityId;
    }

    // 2) SDF 文字
    if (this._sdfTextRenderer.size > 0) {
      const hiddenLayers = new Set(this._entityStore.getHiddenLayersSet());
      const hiddenEntities = new Set(this._entityStore.getLogicallyHiddenSet());
      const textHit = this._sdfTextRenderer.pickTextAt(
        worldPoint.x, worldPoint.y, tolerance,
        hiddenLayers,
        hiddenEntities,
      );
      if (textHit) return textHit;
    }

    // 3) GPU 拾取
    const gpuHit = this._selectionManager.pickAt(canvasX, canvasY, camera);
    if (gpuHit) return gpuHit;

    return null;
  }

  // ═══════════════════════════════════════════════════
  // Mouse interaction setup
  // ═══════════════════════════════════════════════════

  private _setupMouseInteraction(): void {
    const canvas = this._sceneManager.canvas;

    // ── Wheel zoom (debounced) ──
    this._wheelHandler = (e: WheelEvent) => {
      e.preventDefault();
      const camera = this._cameraController.camera;
      const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
      this._wheelZoomFactor *= zoomFactor;

      const rect = canvas.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this._wheelWorldX = camera.position.x + mouseX * (camera.right - camera.left) / 2;
      this._wheelWorldY = camera.position.y + mouseY * (camera.top - camera.bottom) / 2;

      if (!this._wheelPending) {
        this._wheelPending = true;
        requestAnimationFrame(() => {
          this._wheelPending = false;
          const zf = this._wheelZoomFactor;
          this._wheelZoomFactor = 1.0;
          if (zf === 1.0) return;

          // 相机退化 → fitToView
          if (camera.left >= camera.right || camera.bottom >= camera.top) {
            this._cameraController.checkDegenerateAndRecover(null, null);
            this._onRequestRender();
            return;
          }

          const oldSpanX = camera.right - camera.left;
          const oldSpanY = camera.top - camera.bottom;

          if (this._initialSpan <= 0) {
            this._initialSpan = Math.max(oldSpanX, oldSpanY, 1.0);
          }

          const minSpan = this._initialSpan * this._MIN_SPAN_RATIO;
          const maxSpan = this._initialSpan * this._MAX_SPAN_RATIO;
          const minZf = minSpan / Math.min(oldSpanX, oldSpanY);
          const maxZf = maxSpan / Math.max(oldSpanX, oldSpanY);
          const appliedZf = Math.max(minZf, Math.min(maxZf, zf));

          const newLeft = this._wheelWorldX + (camera.left - this._wheelWorldX) * appliedZf;
          const newRight = this._wheelWorldX + (camera.right - this._wheelWorldX) * appliedZf;
          const newTop = this._wheelWorldY + (camera.top - this._wheelWorldY) * appliedZf;
          const newBottom = this._wheelWorldY + (camera.bottom - this._wheelWorldY) * appliedZf;

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

          this._onRequestRender();
          this._onScheduleViewportCulling();
          this._emitCameraChanged();
          this._scheduleCameraInteractionEnd();
        });
      }
    };
    canvas.addEventListener('wheel', this._wheelHandler, { passive: false });

    // ── Context menu ──
    this._contextMenuHandler = (e: MouseEvent) => {
      e.preventDefault();
      if (this._interactionMode !== 'select') return;
      const hitId = this.pickEntityIdAt(e.clientX, e.clientY);
      if (hitId) {
        const node = this._entityStore.getNode(hitId);
        const layer = node?.layer || '';
        this._onEntityContextMenu?.(hitId, layer, e.clientX, e.clientY);
      }
    };
    canvas.addEventListener('contextmenu', this._contextMenuHandler);

    // ── Mouse down ──
    this._mouseDownHandler = (e: MouseEvent) => {
      logger.info('InteractionController', 'mousedown', { button: e.button, mode: this._interactionMode, isPanning: this._isPanning });
      if (e.button === 2) return;

      const camera = this._cameraController.camera;

      // 绘图模式
      if (this._interactionMode === 'draw_line' || this._interactionMode === 'draw_circle' || this._interactionMode === 'draw_text') {
        if (e.button === 0 && this._drawingManager) {
          let wx: number, wy: number;
          if (this._lastSnapPoint) {
            wx = this._lastSnapPoint.x;
            wy = this._lastSnapPoint.y;
          } else {
            const wc = this._clientToWorldCoord(e);
            wx = wc.x;
            wy = wc.y;
          }
          this._drawingManager.handleMouseDown(wx, wy);
        }
        return;
      }

      // 平移模式
      if (this._interactionMode === 'pan' || e.button === 1) {
        e.preventDefault();
        this._isPanning = true;
        this._panStart.set(e.clientX, e.clientY);
        this._cameraStart.set(camera.position.x, camera.position.y);
        this._attachDocumentPanListeners();
        this._updateCursor('grabbing');
        return;
      }

      // 选择模式
      if (e.button === 0 && this._interactionMode === 'select') {
        const hitId = this.pickEntityIdAt(e.clientX, e.clientY);
        if (hitId) {
          const node = this._entityStore.getNode(hitId);
          const layer = node?.layer || '';
          if (this._entityStore.isLayerLocked(layer)) {
            e.preventDefault();
            this._isPanning = true;
            this._panStart.set(e.clientX, e.clientY);
            this._cameraStart.set(camera.position.x, camera.position.y);
            this._attachDocumentPanListeners();
            this._updateCursor('not-allowed');
            return;
          }
          if (!this._selectionManager.getSelectedEntityIds().includes(hitId)) {
            this._selectionManager.selectEntity(hitId);
            this._onEntityClick?.(hitId, layer);
            this._onSelectionChanged?.(this._selectionManager.getSelectedEntityIds());
          }

          this._isDraggingEntity = true;
          this._dragEntityId = hitId;
          const wc = this._clientToWorldCoord(e);
          this._dragStartWorld.set(wc.x, wc.y);
          this._prepareSelectedEntitiesForDrag();
          for (const selId of this._selectionManager.getSelectedEntityIds()) {
            if (this._sdfTextRenderer.has(selId)) {
              this._sdfTextRenderer.startDrag(selId);
            }
          }
          this._updateCursor('grabbing');
        } else {
          this._selectionManager.deselectAll();
          this._onSelectionChanged?.([]);
          this._isBoxSelecting = true;
          this._boxSelectStart.set(e.clientX, e.clientY);
          this._boxSelectEnd.set(e.clientX, e.clientY);
          this._showBoxSelectOverlay(e.clientX, e.clientY);
          canvas.style.cursor = 'crosshair';
        }
      }
    };
    canvas.addEventListener('mousedown', this._mouseDownHandler);

    // ── Mouse move ──
    this._mouseMoveHandler = (e: MouseEvent) => {
      this._updateLastWorldCoord(e);
      this._handleSnap(e);

      if (this._drawingManager && (this._drawingManager.isDrawing() || this._drawingManager.isTextPlacing())) {
        const wc = this._clientToWorldCoord(e);
        this._drawingManager.handleMouseMove(wc.x, wc.y);
        return;
      }

      if (this._isBoxSelecting) {
        this._boxSelectEnd.set(e.clientX, e.clientY);
        this._updateBoxSelectOverlay();
        return;
      }

      if (this._isDraggingEntity && this._dragEntityId) {
        const wc = this._clientToWorldCoord(e);
        const dx = wc.x - this._dragStartWorld.x;
        const dy = wc.y - this._dragStartWorld.y;
        for (const selId of this._selectionManager.getSelectedEntityIds()) {
          this._applyDragPreview(selId, dx, dy);
          if (this._sdfTextRenderer.has(selId)) {
            const node = this._entityStore.getNode(selId);
            if (node) {
              const baseX = (node as any).posX ?? 0;
              const baseY = (node as any).posY ?? 0;
              this._sdfTextRenderer.updateDragPosition(selId, baseX + dx, baseY + dy);
            }
          }
          // 高亮框（填充+边框）跟随拖动
          this._selectionManager.setHighlightOverlayOffset(selId, dx, dy);
        }
        this._onRequestRender();
        return;
      }

      if (this._isPanning) {
        const camera = this._cameraController.camera;
        const dx = e.clientX - this._panStart.x;
        const dy = e.clientY - this._panStart.y;
        const renderRect = canvas.getBoundingClientRect();
        const worldDx = -dx * (camera.right - camera.left) / renderRect.width;
        const worldDy = dy * (camera.top - camera.bottom) / renderRect.height;
        camera.position.x = this._cameraStart.x + worldDx;
        camera.position.y = this._cameraStart.y + worldDy;
        camera.updateProjectionMatrix();
        this._onRequestRender();
        this._onScheduleViewportCulling();
        this._emitCameraChanged();
        return;
      }

      if (this._interactionMode === 'select') {
        const hitId = this.pickEntityIdAt(e.clientX, e.clientY);
        if (hitId) {
          this._updateCursor(this._selectionManager.getSelectedEntityIds().includes(hitId) ? 'move' : 'hover');
        } else {
          this._updateCursor();
        }
      }
    };
    canvas.addEventListener('mousemove', this._mouseMoveHandler);

    // ── Mouse up ──
    this._mouseUpHandler = (e: MouseEvent) => {
      if (this._isBoxSelecting) {
        this._isBoxSelecting = false;
        this._hideBoxSelectOverlay();
        const hoverId = this.pickEntityIdAt(e.clientX, e.clientY);
        if (hoverId && this._selectionManager.getSelectedEntityIds().includes(hoverId)) {
          this._updateCursor('move');
        } else if (hoverId) {
          this._updateCursor('hover');
        } else {
          this._updateCursor();
        }

        const sx = Math.min(this._boxSelectStart.x, this._boxSelectEnd.x);
        const sy = Math.min(this._boxSelectStart.y, this._boxSelectEnd.y);
        const ex = Math.max(this._boxSelectStart.x, this._boxSelectEnd.x);
        const ey = Math.max(this._boxSelectStart.y, this._boxSelectEnd.y);

        if (ex - sx > 3 && ey - sy > 3) {
          const camera = this._cameraController.camera;
          const rect = canvas.getBoundingClientRect();
          const ndcMinX = ((sx - rect.left) / rect.width) * 2 - 1;
          const ndcMinY = -((ey - rect.top) / rect.height) * 2 + 1;
          const ndcMaxX = ((ex - rect.left) / rect.width) * 2 - 1;
          const ndcMaxY = -((sy - rect.top) / rect.height) * 2 + 1;
          const worldMinX = camera.position.x + ndcMinX * (camera.right - camera.left) / 2;
          const worldMinY = camera.position.y + ndcMinY * (camera.top - camera.bottom) / 2;
          const worldMaxX = camera.position.x + ndcMaxX * (camera.right - camera.left) / 2;
          const worldMaxY = camera.position.y + ndcMaxY * (camera.top - camera.bottom) / 2;
          this._selectionManager.selectEntitiesInRect(worldMinX, worldMinY, worldMaxX, worldMaxY);
          this._onSelectionChanged?.(this._selectionManager.getSelectedEntityIds());
        }
        return;
      }

      if (this._isDraggingEntity && this._dragEntityId) {
        const wc = this._clientToWorldCoord(e);
        const dx = wc.x - this._dragStartWorld.x;
        const dy = wc.y - this._dragStartWorld.y;
        const significant = Math.abs(dx) > 2 || Math.abs(dy) > 2;

        if (significant) {
          for (const selId of this._selectionManager.getSelectedEntityIds()) {
            const node = this._entityStore.getNode(selId);
            if (!node) continue;
            if (this._sdfTextRenderer.has(selId)) {
              this._sdfTextRenderer.endDrag(selId);
              this._onTranslateNode(node, dx, dy);
              this._sdfTextRenderer.updatePosition(selId, (node as any).posX ?? 0, (node as any).posY ?? 0);
              // 仅文字需要在新位置重建高亮框；线条走 rebuildEntityMesh 后由选中流程处理。
              this._selectionManager.refreshHighlightOverlay(selId);
            } else {
              this._onTranslateNode(node, dx, dy);
              this._onRebuildEntityMesh(selId);
            }
            this._onEntityMoved?.(selId, dx, dy);
          }
          this._dragLineSnapshots.clear();
          this._sdfTextRenderer.sync().then(() => { if (!this._isDisposed) this._onRequestRender(); });
          this._onRequestRender();
        } else {
          for (const selId of this._selectionManager.getSelectedEntityIds()) {
            if (this._sdfTextRenderer.has(selId)) {
              this._sdfTextRenderer.endDrag(selId);
              const n = this._entityStore.getNode(selId);
              if (n) {
                this._sdfTextRenderer.updatePosition(selId, (n as any).posX ?? 0, (n as any).posY ?? 0);
              }
            }
            this._restoreDragPreview(selId);
            // 微小移动视为未移动，高亮框归位
            this._selectionManager.setHighlightOverlayOffset(selId, 0, 0);
          }
          this._dragLineSnapshots.clear();
          this._sdfTextRenderer.sync().then(() => { if (!this._isDisposed) this._onRequestRender(); });
          this._onRequestRender();
        }

        this._isDraggingEntity = false;
        this._dragEntityId = null;
        const hoverId = this.pickEntityIdAt(e.clientX, e.clientY);
        if (hoverId && this._selectionManager.getSelectedEntityIds().includes(hoverId)) {
          this._updateCursor('move');
        } else if (hoverId) {
          this._updateCursor('hover');
        } else {
          this._updateCursor();
        }
        return;
      }

      if (this._isPanning) {
        this._isPanning = false;
        this._detachDocumentPanListeners();
        this._emitCameraInteractionEnd();
        if (this._interactionMode === 'select') {
          const panHoverId = this.pickEntityIdAt(e.clientX, e.clientY);
          if (panHoverId && this._selectionManager.getSelectedEntityIds().includes(panHoverId)) {
            this._updateCursor('move');
          } else if (panHoverId) {
            this._updateCursor('hover');
          } else {
            this._updateCursor();
          }
        } else {
          this._updateCursor();
        }
      }
    };
    canvas.addEventListener('mouseup', this._mouseUpHandler);

    // ── Document pan listeners ──
    this._documentPanMouseMoveHandler = (e: MouseEvent) => {
      if (!this._isPanning) return;
      e.preventDefault();
      e.stopPropagation();
      this._mouseMoveHandler(e);
    };

    this._documentPanMouseUpHandler = (e: MouseEvent) => {
      if (!this._isPanning) return;
      e.preventDefault();
      e.stopPropagation();
      this._mouseUpHandler(e);
    };

    // ── Mouse leave ──
    this._mouseLeaveHandler = () => {
      if (this._isDraggingEntity && this._dragEntityId) {
        const dx = this._lastWorldX - this._dragStartWorld.x;
        const dy = this._lastWorldY - this._dragStartWorld.y;
        const significant = Math.abs(dx) > 2 || Math.abs(dy) > 2;

        if (significant) {
          for (const selId of this._selectionManager.getSelectedEntityIds()) {
            const node = this._entityStore.getNode(selId);
            if (!node) continue;
            if (this._sdfTextRenderer.has(selId)) {
              this._sdfTextRenderer.endDrag(selId);
              this._onTranslateNode(node, dx, dy);
              this._sdfTextRenderer.updatePosition(selId, (node as any).posX ?? 0, (node as any).posY ?? 0);
              // 仅文字重建高亮框；线条走 rebuildEntityMesh 后由选中流程处理。
              this._selectionManager.refreshHighlightOverlay(selId);
            } else {
              this._onTranslateNode(node, dx, dy);
              this._onRebuildEntityMesh(selId);
            }
            this._onEntityMoved?.(selId, dx, dy);
          }
          this._dragLineSnapshots.clear();
          this._batchedBuilder.rebuildAll(this._sceneManager.scene);
          this._sdfTextRenderer.sync().then(() => { if (!this._isDisposed) this._onRequestRender(); });
          this._onRequestRender();
        } else {
          for (const selId of this._selectionManager.getSelectedEntityIds()) {
            if (this._sdfTextRenderer.has(selId)) {
              this._sdfTextRenderer.endDrag(selId);
              const n = this._entityStore.getNode(selId);
              if (n) {
                this._sdfTextRenderer.updatePosition(selId, (n as any).posX ?? 0, (n as any).posY ?? 0);
              }
            }
            this._restoreDragPreview(selId);
            this._selectionManager.setHighlightOverlayOffset(selId, 0, 0);
          }
          this._dragLineSnapshots.clear();
          this._batchedBuilder.rebuildAll(this._sceneManager.scene);
          this._sdfTextRenderer.sync().then(() => { if (!this._isDisposed) this._onRequestRender(); });
          this._onRequestRender();
        }

        this._isDraggingEntity = false;
        this._dragEntityId = null;
        this._onRequestRender();
      }
      if (this._isBoxSelecting) {
        this._isBoxSelecting = false;
        this._hideBoxSelectOverlay();
      }
      if (this._isPanning && this._documentPanListenersAttached) {
        return;
      }
      if (this._isPanning && !this._documentPanListenersAttached) {
        this._isPanning = false;
        this._emitCameraInteractionEnd();
      }
      this._updateCursor();
    };
    canvas.addEventListener('mouseleave', this._mouseLeaveHandler);

    // ── Keyboard ──
    this._keyDownHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (this._drawingManager && (this._drawingManager.isDrawing() || this._drawingManager.isTextPlacing())) {
          this._drawingManager.cancelDrawing();
        }
      }
    };
    document.addEventListener('keydown', this._keyDownHandler);
  }

  // ═══════════════════════════════════════════════════
  // Box select overlay
  // ═══════════════════════════════════════════════════

  private _showBoxSelectOverlay(startX: number, startY: number): void {
    const container = this._sceneManager.container;
    if (!this._boxSelectOverlay) {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:absolute;border:1px dashed #4fc3f7;background:rgba(79,195,247,0.1);pointer-events:none;z-index:1000;display:none;';
      container.style.position = 'relative';
      container.appendChild(overlay);
      this._boxSelectOverlay = overlay;
    }
    const rect = container.getBoundingClientRect();
    this._boxSelectOverlay.style.left = `${startX - rect.left}px`;
    this._boxSelectOverlay.style.top = `${startY - rect.top}px`;
    this._boxSelectOverlay.style.width = '0px';
    this._boxSelectOverlay.style.height = '0px';
    this._boxSelectOverlay.style.display = 'block';
  }

  private _updateBoxSelectOverlay(): void {
    if (!this._boxSelectOverlay) return;
    const container = this._sceneManager.container;
    const rect = container.getBoundingClientRect();
    const x1 = Math.min(this._boxSelectStart.x, this._boxSelectEnd.x) - rect.left;
    const y1 = Math.min(this._boxSelectStart.y, this._boxSelectEnd.y) - rect.top;
    const x2 = Math.max(this._boxSelectStart.x, this._boxSelectEnd.x) - rect.left;
    const y2 = Math.max(this._boxSelectStart.y, this._boxSelectEnd.y) - rect.top;
    this._boxSelectOverlay.style.left = `${x1}px`;
    this._boxSelectOverlay.style.top = `${y1}px`;
    this._boxSelectOverlay.style.width = `${x2 - x1}px`;
    this._boxSelectOverlay.style.height = `${y2 - y1}px`;
  }

  private _hideBoxSelectOverlay(): void {
    if (this._boxSelectOverlay) {
      this._boxSelectOverlay.style.display = 'none';
    }
  }

  // ═══════════════════════════════════════════════════
  // Coordinate conversion
  // ═══════════════════════════════════════════════════

  private _clientToWorldCoord(e: MouseEvent): { x: number; y: number } {
    const canvas = this._sceneManager.canvas;
    const camera = this._cameraController.camera;
    const rect = canvas.getBoundingClientRect();
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    const worldX = camera.position.x + ndcX * (camera.right - camera.left) / 2;
    const worldY = camera.position.y + ndcY * (camera.top - camera.bottom) / 2;
    return { x: worldX, y: worldY };
  }

  private _updateLastWorldCoord(e: MouseEvent): void {
    const canvas = this._sceneManager.canvas;
    const camera = this._cameraController.camera;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this._lastWorldX = camera.position.x + ndcX * (camera.right - camera.left) / 2;
    this._lastWorldY = camera.position.y + ndcY * (camera.top - camera.bottom) / 2;
  }

  // ═══════════════════════════════════════════════════
  // Snap
  // ═══════════════════════════════════════════════════

  private _handleSnap(e: MouseEvent): void {
    if (!this._snapManager) return;
    const canvas = this._sceneManager.canvas;
    const camera = this._cameraController.camera;

    this._snapManager.setNodeIndex(this._buildNodeIndex());
    this._snapManager.setEntityLayers(this._buildEntityLayers());
    this._snapManager.setHiddenLayers(this._buildHiddenSet());

    const rect = canvas.getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;
    const snapPoint = this._snapManager.findSnapPoint(
      canvasX, canvasY,
      camera,
      rect.width, rect.height,
    );

    this._clearSnapMarker();

    if (snapPoint) {
      this._lastSnapPoint = { x: snapPoint.x, y: snapPoint.y };
      this._showSnapMarker(snapPoint.x, snapPoint.y, snapPoint.type);
    } else {
      this._lastSnapPoint = null;
    }
  }

  private _showSnapMarker(worldX: number, worldY: number, type: string): void {
    const scene = this._sceneManager.scene;
    const camera = this._cameraController.camera;
    const canvasW = this._sceneManager.width;
    const size = (camera.right - camera.left) / canvasW * 8;
    const color = type === 'endpoint' ? 0x00ff00 : type === 'midpoint' ? 0x00ffff : 0xff00ff;
    const geometry = new THREE.BufferGeometry();
    const verts: number[] = [];
    if (type === 'endpoint') {
      verts.push(worldX - size, worldY, 0.1, worldX + size, worldY, 0.1);
      verts.push(worldX, worldY - size, 0.1, worldX, worldY + size, 0.1);
    } else if (type === 'midpoint') {
      verts.push(worldX - size, worldY - size, 0.1, worldX + size, worldY + size, 0.1);
      verts.push(worldX + size, worldY - size, 0.1, worldX - size, worldY + size, 0.1);
    } else {
      const segs = 16;
      for (let i = 0; i < segs; i++) {
        const a1 = (i / segs) * Math.PI * 2;
        const a2 = ((i + 1) / segs) * Math.PI * 2;
        verts.push(worldX + Math.cos(a1) * size, worldY + Math.sin(a1) * size, 0.1);
        verts.push(worldX + Math.cos(a2) * size, worldY + Math.sin(a2) * size, 0.1);
      }
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
    const material = new THREE.LineBasicMaterial({ color, linewidth: 2, depthTest: false });
    const lines = new THREE.LineSegments(geometry, material);
    lines.renderOrder = 9999;
    scene.add(lines);
    this._snapMarker = lines;
    this._onRequestRender();
  }

  private _clearSnapMarker(): void {
    if (this._snapMarker) {
      this._sceneManager.scene.remove(this._snapMarker);
      this._disposeObject3D(this._snapMarker);
      this._snapMarker = null;
    }
  }

  // ═══════════════════════════════════════════════════
  // Drag preview
  // ═══════════════════════════════════════════════════

  private _prepareSelectedEntitiesForDrag(): void {
    this._dragLineSnapshots.clear();
    for (const entityId of this._selectionManager.getSelectedEntityIds()) {
      if (this._sdfTextRenderer.has(entityId)) continue;

      if (this._batchedBuilder.hasEntity(entityId)) {
        this._extractFromBatchForDrag(entityId);
      }

      const node = this._entityStore.getNode(entityId);
      const mesh = this._entityStore.getMesh(entityId);
      if (!node || !mesh) continue;

      mesh.position.set(0, 0, 0);
      const positions = this._geometryFactory.extractLinePositions(node);
      if (positions && mesh instanceof Line2) {
        this._dragLineSnapshots.set(entityId, positions);
      }
    }
    this._batchedBuilder.rebuildDirty(this._sceneManager.scene);
    this._batchedBuilder.pruneOrphanedLineSegments(this._sceneManager.scene);
    this._onRequestRender();
  }

  private _applyDragPreview(entityId: string, dx: number, dy: number): void {
    const snapshot = this._dragLineSnapshots.get(entityId);
    const mesh = this._entityStore.getMesh(entityId);
    if (snapshot && mesh instanceof Line2) {
      mesh.position.set(0, 0, 0);
      mesh.geometry.setPositions(this._offsetLinePositions(snapshot, dx, dy));
      mesh.computeLineDistances();
      return;
    }
    if (mesh) {
      mesh.position.set(dx, dy, 0);
    }
  }

  private _restoreDragPreview(entityId: string): void {
    const snapshot = this._dragLineSnapshots.get(entityId);
    const mesh = this._entityStore.getMesh(entityId);
    if (snapshot && mesh instanceof Line2) {
      mesh.position.set(0, 0, 0);
      mesh.geometry.setPositions(snapshot);
      mesh.computeLineDistances();
      return;
    }
    if (mesh) {
      mesh.position.set(0, 0, 0);
    }
  }

  private _extractFromBatchForDrag(entityId: string): void {
    if (!this._batchedBuilder.hasEntity(entityId)) return;
    this._batchedBuilder.removeEntity(entityId, this._sceneManager.scene);
    this._spatialIndex.removeEntity(entityId);

    const node = this._entityStore.getNode(entityId);
    if (!node) {
      this._batchedBuilder.pruneOrphanedLineSegments(this._sceneManager.scene);
      return;
    }

    const mesh = this._geometryFactory.createSceneNodeMesh(node);
    if (mesh) {
      this._entityStore.setMesh(entityId, mesh);
      this._entityStore.addIndividualEntity(entityId);
      if (this._entityStore.isLogicallyHidden(entityId) || !this._entityStore.isLayerVisible(node.layer)) {
        mesh.visible = false;
      }
      // 必须加入场景，否则拖动预览的 Line2 不会被渲染，导致残影/元素消失。
      this._sceneManager.add(mesh);
    }
    this._batchedBuilder.rebuildDirty(this._sceneManager.scene);
    this._batchedBuilder.pruneOrphanedLineSegments(this._sceneManager.scene);
  }

  private _offsetLinePositions(positions: number[], dx: number, dy: number): number[] {
    const out = new Array<number>(positions.length);
    for (let i = 0; i < positions.length; i += 3) {
      out[i] = positions[i] + dx;
      out[i + 1] = positions[i + 1] + dy;
      out[i + 2] = positions[i + 2] ?? 0;
    }
    return out;
  }

  // ═══════════════════════════════════════════════════
  // Cursor management
  // ═══════════════════════════════════════════════════

  private _updateCursor(hint?: 'hover' | 'grabbing' | 'move' | 'not-allowed'): void {
    const canvas = this._sceneManager.canvas;
    if (!canvas) return;

    if (this._interactionMode === 'draw_text') {
      canvas.style.cursor = 'text';
      return;
    }
    if (this._interactionMode === 'draw_line' || this._interactionMode === 'draw_circle') {
      canvas.style.cursor = 'crosshair';
      return;
    }
    if (this._interactionMode === 'pan') {
      canvas.style.cursor = hint === 'grabbing' ? 'grabbing' : 'grab';
      return;
    }

    switch (hint) {
      case 'grabbing': canvas.style.cursor = 'grabbing'; break;
      case 'move': canvas.style.cursor = 'move'; break;
      case 'not-allowed': canvas.style.cursor = 'not-allowed'; break;
      case 'hover': canvas.style.cursor = 'pointer'; break;
      default: canvas.style.cursor = 'default'; break;
    }
  }

  // ═══════════════════════════════════════════════════
  // Camera change notification
  // ═══════════════════════════════════════════════════

  private _emitCameraChanged(): void {
    if (!this._onCameraChanged) return;
    const now = performance.now();
    if (now - this._lastCameraEmit < 50) return; // 20Hz 节流
    this._lastCameraEmit = now;
    this._onCameraChanged(this.getCameraInfo());
  }

  private _emitCameraInteractionEnd(): void {
    this._onCameraInteractionEnd?.(this.getCameraInfo());
  }

  private _scheduleCameraInteractionEnd(): void {
    if (this._cameraInteractionEndTimer !== null) {
      clearTimeout(this._cameraInteractionEndTimer);
    }
    this._cameraInteractionEndTimer = setTimeout(() => {
      this._cameraInteractionEndTimer = null;
      this._emitCameraInteractionEnd();
    }, 350);
  }

  // ═══════════════════════════════════════════════════
  // Document pan listeners
  // ═══════════════════════════════════════════════════

  private _attachDocumentPanListeners(): void {
    if (this._documentPanListenersAttached) return;
    document.addEventListener('mousemove', this._documentPanMouseMoveHandler, true);
    document.addEventListener('mouseup', this._documentPanMouseUpHandler, true);
    this._documentPanListenersAttached = true;
  }

  private _detachDocumentPanListeners(): void {
    if (!this._documentPanListenersAttached) return;
    document.removeEventListener('mousemove', this._documentPanMouseMoveHandler, true);
    document.removeEventListener('mouseup', this._documentPanMouseUpHandler, true);
    this._documentPanListenersAttached = false;
  }

  // ═══════════════════════════════════════════════════
  // Helper: build indices for SnapManager
  // ═══════════════════════════════════════════════════

  private _buildNodeIndex(): Map<string, SceneNode> {
    return new Map(this._entityStore.getNodeEntries());
  }

  private _buildEntityLayers(): Map<string, string> {
    const map = new Map<string, string>();
    for (const [id, node] of this._entityStore.getNodeEntries()) {
      map.set(id, node.layer);
    }
    return map;
  }

  private _buildHiddenSet(): Set<string> {
    return new Set(this._entityStore.getLogicallyHiddenSet());
  }

  // ═══════════════════════════════════════════════════
  // Dispose
  // ═══════════════════════════════════════════════════

  private _disposeObject3D(obj: THREE.Object3D, disposeMaterial: boolean = true): void {
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments || child instanceof THREE.Line || child instanceof Line2) {
        if (child.geometry) child.geometry.dispose();
        if (disposeMaterial) {
          const mat = child.material;
          if (Array.isArray(mat)) {
            mat.forEach(m => m.dispose());
          } else if (mat) {
            mat.dispose();
          }
        }
      }
    });
  }

  dispose(): void {
    this._isDisposed = true;
    const canvas = this._sceneManager.canvas;

    canvas.removeEventListener('wheel', this._wheelHandler);
    canvas.removeEventListener('contextmenu', this._contextMenuHandler);
    canvas.removeEventListener('mousedown', this._mouseDownHandler);
    canvas.removeEventListener('mousemove', this._mouseMoveHandler);
    canvas.removeEventListener('mouseup', this._mouseUpHandler);
    canvas.removeEventListener('mouseleave', this._mouseLeaveHandler);
    document.removeEventListener('keydown', this._keyDownHandler);
    this._detachDocumentPanListeners();

    this._clearSnapMarker();
    this._hideBoxSelectOverlay();
    if (this._boxSelectOverlay && this._boxSelectOverlay.parentNode) {
      this._boxSelectOverlay.parentNode.removeChild(this._boxSelectOverlay);
      this._boxSelectOverlay = null;
    }

    if (this._cameraInteractionEndTimer !== null) {
      clearTimeout(this._cameraInteractionEndTimer);
      this._cameraInteractionEndTimer = null;
    }

    logger.info('InteractionController', 'Disposed');
  }
}
