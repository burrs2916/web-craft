import * as THREE from 'three';
import type { SceneNode } from '../../cad_runtime/scene_node';
import type { BatchedLayerBuilder } from '../../cad_runtime/batched_layer_builder';
import type { SdfTextRenderer } from '../../cad_runtime/sdf_text_renderer';
import type { GridSpatialIndex } from '../../cad_runtime/grid_spatial_index';
import type { SceneManager } from '../SceneManager';
import type { CameraController, CameraInfo } from '../CameraController';
import type { EntityStore } from '../EntityStore';
import type { SelectionManager } from '../SelectionManager';
import type { GeometryFactory } from '../GeometryFactory';
import { DrawingManager } from '../../drawing/DrawingManager';
import { SnapManager } from '../../snap/SnapManager';
import { logger } from '../../../../utils/logger';
import type { InteractionMode, InteractionControllerConfig } from './types';
import type { InteractionControllerInternal } from './internal';

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
 *
 * 实现按职责拆分到同目录各 mixin 模块（mouse / wheelZoom / boxSelect /
 * dragPreview / snap / cursor / cameraNotify），在 index.ts 中通过 Object.assign
 * 装配到原型上；本文件只保留核心状态、构造装配与公共 API。
 */
export class InteractionController {
  // ── Dependencies ──
  protected _sceneManager: SceneManager;
  protected _cameraController: CameraController;
  protected _entityStore: EntityStore;
  protected _selectionManager: SelectionManager;
  protected _geometryFactory: GeometryFactory;
  protected _sdfTextRenderer: SdfTextRenderer;
  protected _batchedBuilder: BatchedLayerBuilder;
  protected _spatialIndex: GridSpatialIndex;

  // ── Render callbacks ──
  protected _onRequestRender: () => void;
  protected _onScheduleViewportCulling: () => void;
  protected _onRebuildEntityMesh: (entityId: string) => void;
  protected _onTranslateNode: (node: SceneNode, dx: number, dy: number) => void;

  // ── Event callbacks ──
  protected _onEntityClick?: (entityId: string, layer: string) => void;
  protected _onSelectionChanged?: (entityIds: string[]) => void;
  protected _onCameraChanged?: (info: CameraInfo) => void;
  protected _onCameraInteractionEnd?: (info: CameraInfo) => void;
  protected _onEntityMoved?: (entityId: string, dx: number, dy: number) => void;
  protected _onEntityContextMenu?: (entityId: string, layer: string, clientX: number, clientY: number) => void;
  protected _onDrawComplete?: (entityJson: string) => void;

  // ── Interaction state ──
  protected _isPanning = false;
  protected _isBoxSelecting = false;
  protected _boxSelectStart = new THREE.Vector2();
  protected _boxSelectEnd = new THREE.Vector2();
  protected _boxSelectOverlay: HTMLDivElement | null = null;
  protected _isDraggingEntity = false;
  protected _dragEntityId: string | null = null;
  protected _dragStartWorld = new THREE.Vector2();
  protected _dragLineSnapshots: Map<string, number[]> = new Map();

  // ── Pan state ──
  protected _panStart = new THREE.Vector2();
  protected _cameraStart = new THREE.Vector2();
  protected _documentPanListenersAttached = false;

  // ── Event handler refs ──
  protected _wheelHandler!: (e: WheelEvent) => void;
  protected _contextMenuHandler!: (e: MouseEvent) => void;
  protected _mouseDownHandler!: (e: MouseEvent) => void;
  protected _mouseMoveHandler!: (e: MouseEvent) => void;
  protected _mouseUpHandler!: (e: MouseEvent) => void;
  protected _mouseLeaveHandler!: () => void;
  protected _keyDownHandler!: (e: KeyboardEvent) => void;
  protected _documentPanMouseMoveHandler!: (e: MouseEvent) => void;
  protected _documentPanMouseUpHandler!: (e: MouseEvent) => void;

  // ── Wheel debounce ──
  protected _wheelPending = false;
  protected _wheelZoomFactor = 1.0;
  protected _wheelWorldX = 0;
  protected _wheelWorldY = 0;
  protected _initialSpan = 0;
  protected readonly _MIN_SPAN_RATIO = 0.01;
  protected readonly _MAX_SPAN_RATIO = 100;

  // ── Interaction mode ──
  protected _interactionMode: InteractionMode = 'select';

  // ── Camera change notification ──
  protected _lastCameraEmit = 0;
  protected _cameraInteractionEndTimer: ReturnType<typeof setTimeout> | null = null;

  // ── World coords ──
  protected _lastWorldX = 0;
  protected _lastWorldY = 0;

  // ── Snap ──
  protected _snapManager: SnapManager | null = null;
  protected _snapMarker: THREE.Object3D | null = null;
  protected _lastSnapPoint: { x: number; y: number } | null = null;

  // ── Drawing ──
  protected _drawingManager: DrawingManager | null = null;

  // ── Dispose guard ──
  protected _isDisposed = false;

  constructor(config: InteractionControllerConfig) {
    const f = this as unknown as InteractionControllerInternal;

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

    f._setupMouseInteraction();
  }

  // ═══════════════════════════════════════════════════
  // Public API
  // ═══════════════════════════════════════════════════

  setInteractionMode(mode: InteractionMode): void {
    const f = this as unknown as InteractionControllerInternal;
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
      f._updateCursor();
    } else {
      if (this._drawingManager) {
        this._drawingManager.cancelDrawing();
      }
      f._updateCursor();
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
  // Dispose
  // ═══════════════════════════════════════════════════

  dispose(): void {
    const f = this as unknown as InteractionControllerInternal;
    this._isDisposed = true;
    const canvas = this._sceneManager.canvas;

    canvas.removeEventListener('wheel', this._wheelHandler);
    canvas.removeEventListener('contextmenu', this._contextMenuHandler);
    canvas.removeEventListener('mousedown', this._mouseDownHandler);
    canvas.removeEventListener('mousemove', this._mouseMoveHandler);
    canvas.removeEventListener('mouseup', this._mouseUpHandler);
    canvas.removeEventListener('mouseleave', this._mouseLeaveHandler);
    document.removeEventListener('keydown', this._keyDownHandler);
    f._detachDocumentPanListeners();

    f._clearSnapMarker();
    f._hideBoxSelectOverlay();
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