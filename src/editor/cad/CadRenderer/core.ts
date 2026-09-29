import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { CadDocument } from '../types';
import type { SceneNode, BoundingBox } from '../cad_runtime/scene_node';
import { RenderProfile } from '../cad_runtime/scene_graph';
import { BatchedLayerBuilder } from '../cad_runtime/batched_layer_builder';
import type { EntityRendererRegistry } from '../cad_runtime/entity_renderers/EntityRenderer';
import type { ToolRegistry } from '../../tools/Tool';
import { GridSpatialIndex } from '../cad_runtime/grid_spatial_index';
import { SdfTextRenderer } from '../cad_runtime/sdf_text_renderer';
import { SnapManager } from '../snap/SnapManager';
import type { TransformParams } from '../coordinate/TransformCalculator';
import { logger } from '../../../utils/logger';

// ── Modules ──
import { SceneManager } from '../rendering/SceneManager';
import { CameraController } from '../rendering/CameraController';
import type { CameraInfo as CameraInfoType } from '../rendering/CameraController';
import { EntityStore } from '../rendering/EntityStore';
import { SelectionManager } from '../rendering/SelectionManager';
import { ViewportCuller } from '../rendering/ViewportCuller';
import { GeometryFactory } from '../rendering/GeometryFactory';
import { InteractionController } from '../rendering/InteractionController';

import type { CadRendererConfig, CameraInfo, FitMode } from './types';
import type { CadRendererInternal } from './internal';

// ═══════════════════════════════════════════════════════════════════
// CadRenderer — thin Facade coordinating 7 extracted modules
//
// 实现按职责拆分到同目录各 mixin 模块（camera / background / selection /
// layers / entities / sceneGraph / pipeline），在 index.ts 中通过 Object.assign
// 装配到原型上；本文件只保留核心状态、构造装配、渲染循环与生命周期。
// ═══════════════════════════════════════════════════════════════════

export class CadRenderer {
  // ── Modules ──
  // 以下状态由同目录 mixin 模块共享访问（见 internal.ts），故为 protected 而非 private。
  protected _sceneManager!: SceneManager;
  protected _cameraController!: CameraController;
  protected _entityStore!: EntityStore;
  protected _selectionManager!: SelectionManager;
  protected _viewportCuller!: ViewportCuller;
  protected _geometryFactory!: GeometryFactory;
  protected _interactionController!: InteractionController;

  // ── Shared mutable state (not owned by any single module) ──
  protected _document: CadDocument | null = null;
  protected _debugMode = false;
  protected _transparentBackground = false;
  protected _externalBounds: BoundingBox | null = null;
  protected _renderProfile: RenderProfile = RenderProfile.Simple;
  protected _complexFlags = 0;
  protected _isProgressiveLoading = false;
  protected _sdfTextRenderer: SdfTextRenderer;
  protected _batchedBuilder!: BatchedLayerBuilder;
  protected _spatialIndex: GridSpatialIndex;
  protected _clippingPlanes: THREE.Plane[] = [];
  protected _documentExtents: { minX: number; minY: number; maxX: number; maxY: number } | null = null;
  protected _useBatchedRendering = true;
  protected _useBatchedText = true;
  protected _entityRendererRegistry: EntityRendererRegistry | null = null;
  protected _toolRegistry: ToolRegistry | null = null;
  protected _fitMode: FitMode = 'contain';

  // ── Animation / render loop ──
  protected _animationId: number | null = null;
  protected _needsRender = false;
  protected _isRecoveringCamera = false;
  protected _isDisposed = false;

  // ── Progressive loading ──
  protected _deferredNodes: SceneNode[] = [];
  protected _deferredTimer: number | null = null;

  // ── Event callbacks (stored for late binding) ──
  protected _onSelectionChanged?: (entityIds: string[]) => void;

  constructor(config: CadRendererConfig) {
    const f = this as unknown as CadRendererInternal;

    this._debugMode = config.debugMode || false;
    this._transparentBackground = config.transparentBackground || false;
    this._onSelectionChanged = config.onSelectionChanged;

    const bgColorStr = config.backgroundColor || '#1a1a2e';

    // 1) SceneManager
    this._sceneManager = new SceneManager({
      container: config.container,
      backgroundColor: bgColorStr,
      transparentBackground: this._transparentBackground,
    });
    // 将 SceneManager 的渲染请求（如 ViewportCuller 在文字 sync 完成后触发的重渲染）
    // 桥接到 CadRenderer 自己的渲染循环，否则这些 requestRender 会落到 SceneManager
    // 未注册回调的空循环里，导致文字剔除后无法重新绘制（文字消失）。
    this._sceneManager.setRenderCallback(() => f._requestRender());

    // 2) CameraController
    this._cameraController = new CameraController({
      canvasEl: this._sceneManager.canvas,
      getContainerSize: () => ({
        width: this._sceneManager.width || config.container.clientWidth || 1,
        height: this._sceneManager.height || config.container.clientHeight || 1,
      }),
    });
    this._cameraController.onCameraChanged((info: CameraInfoType) => config.onCameraChanged?.(info as CameraInfo));
    this._cameraController.onCameraInteractionEnd((info: CameraInfoType) => config.onCameraInteractionEnd?.(info as CameraInfo));

    // 3) SdfTextRenderer + BatchedLayerBuilder
    this._sdfTextRenderer = new SdfTextRenderer();
    this._sdfTextRenderer.addToScene(this._sceneManager.scene);
    this._sdfTextRenderer.onBboxesUpdated = (bboxes) => {
      for (const [id, bbox] of bboxes) {
        const node = this._entityStore?.getNode(id);
        if (node) node.bbox = { ...bbox };
      }
    };

    const dpr = this._sceneManager.dpr;
    const resolution = this._sceneManager.resolution;
    this._batchedBuilder = new BatchedLayerBuilder(resolution, dpr);
    this._spatialIndex = new GridSpatialIndex(100);

    // 4) EntityStore
    this._entityStore = new EntityStore(this._sceneManager.scene, this._batchedBuilder);

    // 5) SelectionManager
    this._selectionManager = new SelectionManager({
      sceneManager: this._sceneManager,
      entityStore: this._entityStore,
      batchedBuilder: this._batchedBuilder,
      sdfTextRenderer: this._sdfTextRenderer,
      spatialIndex: this._spatialIndex,
    });

    // 实体删除时自动清理其高亮框，收口所有删除入口，避免 overlay 残留。
    this._entityStore.onEntityRemoved((id) => {
      this._selectionManager.notifyEntityRemoved(id);
    });

    // 注入合批提取/回退逻辑：选中合批实体时重建独立 mesh（否则会因移出合批而消失），
    // 取消选中时再合批回去。复用 GeometryFactory，避免 SelectionManager 内的简化实现丢失 mesh。
    this._selectionManager.setBatchDelegates(
      (id) => f._extractEntityFromBatch(id),
      (id) => f._mergeEntityBackToBatch(id),
    );

    // 6) ViewportCuller
    this._viewportCuller = new ViewportCuller({
      sceneManager: this._sceneManager,
      entityStore: this._entityStore,
      cameraController: this._cameraController,
      spatialIndex: this._spatialIndex,
      sdfTextRenderer: this._sdfTextRenderer,
      batchedBuilder: this._batchedBuilder,
      useBatchedText: this._useBatchedText,
    });

    // 7) GeometryFactory
    this._geometryFactory = new GeometryFactory({
      sceneManager: this._sceneManager,
      entityStore: this._entityStore,
      sdfTextRenderer: this._sdfTextRenderer,
      defaultLineColor: new THREE.Color(config.lineColor || '#4fc3f7'),
      onRequestRender: () => f._requestRender(),
    });
    this._geometryFactory.setClippingPlanes(this._clippingPlanes);
    this._geometryFactory.setUseBatchedText(this._useBatchedText);

    // 8) InteractionController
    this._interactionController = new InteractionController({
      sceneManager: this._sceneManager,
      cameraController: this._cameraController,
      entityStore: this._entityStore,
      selectionManager: this._selectionManager,
      geometryFactory: this._geometryFactory,
      sdfTextRenderer: this._sdfTextRenderer,
      batchedBuilder: this._batchedBuilder,
      spatialIndex: this._spatialIndex,
      onRequestRender: () => f._requestRender(),
      onScheduleViewportCulling: () => this._viewportCuller.schedule(),
      onRebuildEntityMesh: (id) => f._rebuildEntityMesh(id),
      onTranslateNode: (node, dx, dy) => this._geometryFactory.translateNode(node, dx, dy),
      onEntityClick: config.onEntityClick,
      onSelectionChanged: config.onSelectionChanged,
      onCameraChanged: (info: CameraInfoType) => config.onCameraChanged?.(info as CameraInfo),
      onCameraInteractionEnd: (info: CameraInfoType) => config.onCameraInteractionEnd?.(info as CameraInfo),
      onEntityMoved: config.onEntityMoved,
      onEntityContextMenu: config.onEntityContextMenu,
      onDrawComplete: config.onDrawComplete,
    });

    // Start render loop
    this._animate();
  }

  // ═══════════════════════════════════════════════════
  // Debug / Config
  // ═══════════════════════════════════════════════════

  setDebugMode(enabled: boolean): void {
    this._debugMode = enabled;
    logger.info('CadRenderer', `Debug mode ${enabled ? 'enabled' : 'disabled'}`);
  }

  getDebugMode(): boolean { return this._debugMode; }

  setTransformParams(params: TransformParams | null): void {
    this._geometryFactory.setTransformParams(params);
  }

  setEntityRendererRegistry(registry: EntityRendererRegistry | null): void {
    this._entityRendererRegistry = registry;
    this._geometryFactory.setEntityRendererRegistry(registry);
  }

  getEntityRendererRegistry(): EntityRendererRegistry | null {
    return this._entityRendererRegistry;
  }

  setToolRegistry(registry: ToolRegistry | null): void { this._toolRegistry = registry; }
  getToolRegistry(): ToolRegistry | null { return this._toolRegistry; }

  // ═══════════════════════════════════════════════════
  // Interaction (→ InteractionController)
  // ═══════════════════════════════════════════════════

  setInteractionMode(mode: 'select' | 'pan' | 'draw_line' | 'draw_circle' | 'draw_text'): void {
    this._interactionController.setInteractionMode(mode);
  }

  getInteractionMode(): 'select' | 'pan' | 'draw_line' | 'draw_circle' | 'draw_text' {
    return this._interactionController.getInteractionMode();
  }

  setTextDrawParams(params: { content: string; height: number; layer: string; color: number }): void {
    this._interactionController.setTextDrawParams(params);
  }

  setOnDrawComplete(callback: (entityJson: string) => void): void {
    this._interactionController.setOnDrawComplete(callback);
  }

  initSnapManager(settings?: any): void { this._interactionController.initSnapManager(settings); }
  setSnapEnabled(type: string, enabled: boolean): void { this._interactionController.setSnapEnabled(type, enabled); }
  getSnapManager(): SnapManager | null { return this._interactionController.getSnapManager(); }
  getSnapWorldPoint(): { x: number; y: number } | null { return this._interactionController.getSnapWorldPoint(); }
  getLastWorldCoord(): { x: number; y: number } { return this._interactionController.getLastWorldCoord(); }

  /** 获取底层 WebGLRenderer（供性能监控等外部读取） */
  get glRenderer(): THREE.WebGLRenderer { return this._sceneManager.renderer; }

  // ═══════════════════════════════════════════════════
  // Render loop
  // ═══════════════════════════════════════════════════

  private _animate(): void {
    if (this._isDisposed) return;
    const f = this as unknown as CadRendererInternal;

    if (this._needsRender) {
      this._needsRender = false;
      // 开发期不变量：SDF 文字的 BatchedText 必须始终在被渲染的场景中，
      // 否则文字将不可见（历史回归点）。这里检测并自愈，同时在控制台报警，
      // 让未来任何误移除 BatchedText 的改动"当场暴露"。
      if (import.meta.env.DEV && this._sdfTextRenderer.size > 0) {
        const batched = this._sdfTextRenderer.batchedText;
        if (batched && !this._sceneManager.scene.children.includes(batched)) {
          console.error(
            '[CadRenderer] 不变量违背：BatchedText 已脱离场景，文字将不可见。已自动重新挂载。请检查最近对 clearScene / scene.remove 的改动。',
          );
          this._sdfTextRenderer.addToScene(this._sceneManager.scene);
        }
      }
      this._sceneManager.renderNow(this._cameraController.camera);
    }

    // Progressive loading
    if (this._deferredNodes.length > 0 && !this._deferredTimer) {
      this._deferredTimer = window.setTimeout(() => {
        this._deferredTimer = null;
        f._processDeferredNodes();
      }, 16);
    }

    if (this._needsRender || this._deferredNodes.length > 0) {
      this._animationId = requestAnimationFrame(() => this._animate());
    } else {
      this._animationId = null;
    }
  }

  private _requestRender(): void {
    if (this._isDisposed) return;
    if (!this._isRecoveringCamera &&
        (this._cameraController.camera.left >= this._cameraController.camera.right ||
         this._cameraController.camera.bottom >= this._cameraController.camera.top)) {
      logger.warn('CadRenderer', 'Degenerate camera, recovering');
      this._isRecoveringCamera = true;
      try { (this as unknown as CadRendererInternal)._fitToView(); } finally { this._isRecoveringCamera = false; }
      return;
    }
    this._needsRender = true;
    if (this._animationId === null) {
      this._animationId = requestAnimationFrame(() => this._animate());
    }
  }

  // ═══════════════════════════════════════════════════
  // Resize
  // ═══════════════════════════════════════════════════

  resize(): void {
    const f = this as unknown as CadRendererInternal;
    this._sceneManager.resize();
    this._cameraController.onResize();
    this._batchedBuilder.setResolution(this._sceneManager.resolution, this._sceneManager.dpr);

    // Update LineMaterial resolutions
    this._sceneManager.scene.traverse((child) => {
      if (child instanceof Line2) {
        (child.material as LineMaterial).resolution.copy(this._sceneManager.resolution);
      }
    });

    if (this._document || this._entityStore.getAllMeshes().size > 0) {
      f._fitToView();
    }
    this._viewportCuller.schedule();
    this._requestRender();
  }

  // ═══════════════════════════════════════════════════
  // Dispose
  // ═══════════════════════════════════════════════════

  dispose(): void {
    this._isDisposed = true;
    if (this._animationId !== null) {
      cancelAnimationFrame(this._animationId);
      this._animationId = null;
    }
    if (this._deferredTimer !== null) {
      clearTimeout(this._deferredTimer);
    }
    this._interactionController.dispose();
    this._sceneManager.dispose();
    logger.info('CadRenderer', 'Disposed');
  }
}