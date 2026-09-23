import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { CadDocument } from './types';
import type { SceneGraph } from './cad_runtime/scene_graph';
import { RenderProfile } from './cad_runtime/scene_graph';
import type { SceneNode, BoundingBox } from './cad_runtime/scene_node';
import { BatchedLayerBuilder } from './cad_runtime/batched_layer_builder';
import type { EntityRendererRegistry } from './cad_runtime/entity_renderers/EntityRenderer';
import type { ToolRegistry } from '../tools/Tool';
import { GridSpatialIndex, type LineSegment } from './cad_runtime/grid_spatial_index';
import { SdfTextRenderer } from './cad_runtime/sdf_text_renderer';
import { SnapManager } from './snap/SnapManager';
import type { TransformParams } from './coordinate/TransformCalculator';
import { logger } from '../../utils/logger';

// ── Modules ──
import { SceneManager } from './rendering/SceneManager';
import { CameraController } from './rendering/CameraController';
import type { CameraInfo as CameraInfoType } from './rendering/CameraController';
import { EntityStore } from './rendering/EntityStore';
import { SelectionManager } from './rendering/SelectionManager';
import { ViewportCuller } from './rendering/ViewportCuller';
import {
  GeometryFactory,
  isValidNumber,
  validateObject3D,
  DELETED_LAYER_NAME,
} from './rendering/GeometryFactory';
import { InteractionController } from './rendering/InteractionController';

// ── Exported types (backward compatibility) ──

export interface CadRendererConfig {
  container: HTMLElement;
  backgroundColor?: string;
  lineColor?: string;
  debugMode?: boolean;
  transparentBackground?: boolean;
  onEntityClick?: (entityId: string, layer: string) => void;
  onSelectionChanged?: (entityIds: string[]) => void;
  onCameraChanged?: (info: CameraInfo) => void;
  onCameraInteractionEnd?: (info: CameraInfo) => void;
  onEntityMoved?: (entityId: string, dx: number, dy: number) => void;
  onEntityContextMenu?: (entityId: string, layer: string, clientX: number, clientY: number) => void;
  onDrawComplete?: (entityJson: string) => void;
}

export interface CameraInfo {
  centerX: number;
  centerY: number;
  worldWidth: number;
  worldHeight: number;
  zoom: number;
}

// ═══════════════════════════════════════════════════════════════════
// CadRenderer — thin Facade coordinating 7 extracted modules
// ═══════════════════════════════════════════════════════════════════

export class CadRenderer {
  // ── Modules ──
  private _sceneManager!: SceneManager;
  private _cameraController!: CameraController;
  private _entityStore!: EntityStore;
  private _selectionManager!: SelectionManager;
  private _viewportCuller!: ViewportCuller;
  private _geometryFactory!: GeometryFactory;
  private _interactionController!: InteractionController;

  // ── Shared mutable state (not owned by any single module) ──
  private _document: CadDocument | null = null;
  private _debugMode = false;
  private _transparentBackground = false;
  private _externalBounds: BoundingBox | null = null;
  private _renderProfile: RenderProfile = RenderProfile.Simple;
  private _complexFlags = 0;
  private _isProgressiveLoading = false;
  private _sdfTextRenderer: SdfTextRenderer;
  private _batchedBuilder!: BatchedLayerBuilder;
  private _spatialIndex: GridSpatialIndex;
  private _clippingPlanes: THREE.Plane[] = [];
  private _documentExtents: { minX: number; minY: number; maxX: number; maxY: number } | null = null;
  private _useBatchedRendering = true;
  private _useBatchedText = true;
  private _entityRendererRegistry: EntityRendererRegistry | null = null;
  private _toolRegistry: ToolRegistry | null = null;
  private _fitMode: 'contain' | 'cover' | 'stretch' | 'custom' = 'contain';

  // ── Animation / render loop ──
  private _animationId: number | null = null;
  private _needsRender = false;
  private _isRecoveringCamera = false;
  private _isDisposed = false;

  // ── Progressive loading ──
  private _deferredNodes: SceneNode[] = [];
  private _deferredTimer: number | null = null;

  // ── Event callbacks (stored for late binding) ──
  private _onSelectionChanged?: (entityIds: string[]) => void;

  constructor(config: CadRendererConfig) {
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
    this._sceneManager.setRenderCallback(() => this._requestRender());

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
      (id) => this._extractEntityFromBatch(id),
      (id) => this._mergeEntityBackToBatch(id),
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
      onRequestRender: () => this._requestRender(),
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
      onRequestRender: () => this._requestRender(),
      onScheduleViewportCulling: () => this._viewportCuller.schedule(),
      onRebuildEntityMesh: (id) => this._rebuildEntityMesh(id),
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

  // ═══════════════════════════════════════════════════
  // Camera (→ CameraController)
  // ═══════════════════════════════════════════════════

  getCameraInfo(): CameraInfo {
    return this._cameraController.getCameraInfo() as CameraInfo;
  }

  zoomIn(): void {
    this._cameraController.zoomIn();
    this._requestRender();
  }

  zoomOut(): void {
    this._cameraController.zoomOut();
    this._requestRender();
  }

  fitToView(): void { this._fitToView(); }

  setFitMode(mode: 'contain' | 'cover' | 'stretch' | 'custom'): void {
    if (this._fitMode === mode) return;
    this._fitMode = mode;
    this._cameraController.setFitMode(mode);
    if (mode === 'custom') {
      this._requestRender();
    } else {
      this._fitToView();
    }
  }

  getFitMode(): 'contain' | 'cover' | 'stretch' | 'custom' { return this._fitMode; }

  getCameraState(): { centerX: number; centerY: number; halfW: number; halfH: number } {
    return this._cameraController.getCameraState();
  }

  setCameraState(state: { centerX: number; centerY: number; halfW: number; halfH: number }): void {
    if (!isValidNumber(state.centerX) || !isValidNumber(state.centerY) ||
        !isValidNumber(state.halfW) || !isValidNumber(state.halfH) ||
        state.halfW <= 0 || state.halfH <= 0) {
      logger.warn('CadRenderer', 'setCameraState: invalid state', state);
      return;
    }
    this._cameraController.setCameraState(state);
    this._viewportCuller.schedule();
    this._requestRender();
  }

  getDrawingBounds(): BoundingBox | null {
    return this._boundsForView(this._externalBounds);
  }

  // ═══════════════════════════════════════════════════
  // Selection (→ SelectionManager)
  // ═══════════════════════════════════════════════════

  selectEntity(entityId: string, additive: boolean = false): void {
    this._selectionManager.selectEntity(entityId, additive);
  }

  deselectEntity(entityId: string): void {
    this._selectionManager.deselectEntity(entityId);
  }

  deselectAll(): void {
    this._selectionManager.deselectAll();
  }

  getSelectedEntityIds(): string[] {
    return this._selectionManager.getSelectedEntityIds();
  }

  getSelectedEntityId(): string | null {
    return this._selectionManager.getSelectedEntityId();
  }

  selectEntitiesInRect(minX: number, minY: number, maxX: number, maxY: number, additive: boolean = false): string[] {
    return this._selectionManager.selectEntitiesInRect(minX, minY, maxX, maxY, additive);
  }

  // ═══════════════════════════════════════════════════
  // Entity query
  // ═══════════════════════════════════════════════════

  getEntityNode(entityId: string): SceneNode | undefined {
    return this._entityStore.getNode(entityId);
  }

  getAllEntityNodes(): SceneNode[] {
    return this._entityStore.getAllNodes();
  }

  pickEntityIdAt(clientX: number, clientY: number, includeHidden: boolean = false): string | null {
    return this._interactionController.pickEntityIdAt(clientX, clientY, includeHidden);
  }

  // ═══════════════════════════════════════════════════
  // Background / colors
  // ═══════════════════════════════════════════════════

  setBackgroundColor(color: string, opacity?: number): void {
    this._sceneManager.setBackgroundColor(new THREE.Color(color), opacity);
    this._geometryFactory.adjustColorForBackground(new THREE.Color(color));
    this._refreshAllEntityColors();
    this._requestRender();
  }

  isDarkBackground(): boolean {
    return this._sceneManager.isDarkBackground;
  }

  setLineColor(color: string): void {
    this._geometryFactory.setDefaultLineColor(new THREE.Color(color));
    this._refreshAllEntityColors();
  }

  getBackgroundColor(): string {
    return '#' + this._sceneManager.backgroundColor.getHexString();
  }

  /** 获取底层 WebGLRenderer（供性能监控等外部读取） */
  get glRenderer(): THREE.WebGLRenderer { return this._sceneManager.renderer; }

  // ═══════════════════════════════════════════════════
  // Layer management (→ EntityStore + modules)
  // ═══════════════════════════════════════════════════

  setLayerVisible(layerName: string, visible: boolean): void {
    this._entityStore.setLayerVisible(layerName, visible);
    this._batchedBuilder.setLayerVisible(layerName, visible);
    this._sdfTextRenderer.setLayerVisible(layerName, visible);
    if (this._sdfTextRenderer.needsSync) {
      this._sdfTextRenderer.sync().then(() => { if (!this._isDisposed) this._requestRender(); });
    }
    // Update logically hidden for individual entities
    const entitySet = this._entityStore.getLayerEntities(layerName);
    for (const id of entitySet) {
      this._entityStore.setLogicallyHidden(id, !visible);
    }
    this._requestRender();
  }

  setMultipleLayersVisible(changes: Array<{ layerName: string; visible: boolean }>): void {
    for (const { layerName, visible } of changes) {
      this._entityStore.setLayerVisible(layerName, visible);
      this._batchedBuilder.setLayerVisible(layerName, visible);
      this._sdfTextRenderer.setLayerVisible(layerName, visible);
    }
    if (this._sdfTextRenderer.needsSync) {
      this._sdfTextRenderer.sync().then(() => { if (!this._isDisposed) this._requestRender(); });
    }
    for (const { layerName, visible } of changes) {
      const entitySet = this._entityStore.getLayerEntities(layerName);
      for (const id of entitySet) {
        this._entityStore.setLogicallyHidden(id, !visible);
      }
    }
    this._requestRender();
  }

  setLayerLocked(layerName: string, locked: boolean): void {
    this._entityStore.setLayerLocked(layerName, locked);
    if (locked) {
      for (const id of this._selectionManager.getSelectedEntityIds()) {
        const node = this._entityStore.getNode(id);
        if (node?.layer === layerName) {
          this._selectionManager.deselectEntity(id);
        }
      }
      this._onSelectionChanged?.(this.getSelectedEntityIds());
    }
  }

  isLayerVisible(layerName: string): boolean {
    return this._entityStore.isLayerVisible(layerName);
  }

  isLayerLocked(layerName: string): boolean {
    return this._entityStore.isLayerLocked(layerName);
  }

  getLayers(): string[] {
    return this._entityStore.getLayers();
  }

  setLayerColor(layerName: string, newColorRgb: number): void {
    this._entityStore.setLayerColor(layerName, newColorRgb);
    this._refreshAllEntityColors();
  }

  removeLayer(layerName: string, deleteEntities: boolean): void {
    const entitySet = this._entityStore.getLayerEntities(layerName);
    for (const id of Array.from(entitySet)) {
      if (deleteEntities) {
        this.deleteEntityLocally(id);
      } else {
        const node = this._entityStore.getNode(id);
        if (node) {
          (node as { layer: string }).layer = '0';
          this._rebuildEntityMesh(id);
        }
      }
    }
    this._requestRender();
  }

  renameLayer(oldName: string, newName: string): void {
    // Update all entities in the old layer
    const entitySet = this._entityStore.getLayerEntities(oldName);
    for (const id of Array.from(entitySet)) {
      const node = this._entityStore.getNode(id);
      if (node) {
        (node as { layer: string }).layer = newName;
        this._rebuildEntityMesh(id);
      }
    }
    this._requestRender();
  }

  // ═══════════════════════════════════════════════════
  // Entity CRUD (orchestration)
  // ═══════════════════════════════════════════════════

  updateTextContent(entityId: string, newContent: string): boolean {
    const node = this._entityStore.getNode(entityId);
    if (!node) return false;
    if (node.type !== 'text' && node.type !== 'mText') return false;

    (node as unknown as { content: string }).content = newContent;
    this._geometryFactory.recomputeBbox(node);
    this._geometryFactory.expandDegenerateBbox(node);

    if (this._useBatchedText && this._sdfTextRenderer.has(entityId)) {
      this._sdfTextRenderer.removeText(entityId);
      this._geometryFactory.addTextToBatchedRenderer(entityId, node, node.layer);
      if (!this._entityStore.isLayerVisible(node.layer) || node.visible === false) {
        this._sdfTextRenderer.setTextVisible(entityId, false);
      }
      this._requestRender();
      return true;
    }

    const oldMesh = this._entityStore.getMesh(entityId);
    if (oldMesh) {
      this._sceneManager.remove(oldMesh);
      this._entityStore.getAllMeshes().delete(entityId);
    }
    const newMesh = this._geometryFactory.createSceneNodeMesh(node);
    if (!newMesh) return false;
    this._entityStore.setMesh(entityId, newMesh);
    this._sceneManager.add(newMesh);
    if (!this._entityStore.isLayerVisible(node.layer) || node.visible === false) {
      newMesh.visible = false;
    }
    this._requestRender();
    return true;
  }

  updateEntityColor(entityId: string, newColorRgb: number): boolean {
    const node = this._entityStore.getNode(entityId);
    if (!node) return false;
    (node as { color: number }).color = newColorRgb;
    return this._rebuildEntityMesh(entityId);
  }

  updateEntityLayer(entityId: string, newLayer: string): boolean {
    const node = this._entityStore.getNode(entityId);
    if (!node) return false;
    (node as { layer: string }).layer = newLayer;
    return this._rebuildEntityMesh(entityId);
  }

  moveEntity(entityId: string, dx: number, dy: number): boolean {
    const node = this._entityStore.getNode(entityId);
    if (!node) return false;
    this._geometryFactory.translateNode(node, dx, dy);
    return this._rebuildEntityMesh(entityId);
  }

  copyEntityLocally(entityId: string, dx: number, dy: number): string | null {
    const node = this._entityStore.getNode(entityId);
    if (!node) return null;
    const newId = this._nextEntityId();
    const clone = JSON.parse(JSON.stringify(node)) as SceneNode;
    (clone as any).id = parseInt(newId, 10);
    this._geometryFactory.translateNode(clone, dx, dy);
    this._geometryFactory.expandDegenerateBbox(clone);
    this._addCloneToScene(newId, clone);
    return newId;
  }

  copyEntitiesLocally(entityIds: string[], dx: number, dy: number): string[] {
    const newIds: string[] = [];
    for (const id of entityIds) {
      const newId = this.copyEntityLocally(id, dx, dy);
      if (newId) newIds.push(newId);
    }
    return newIds;
  }

  updateEntityFromProps(entityId: string, props: Record<string, unknown>): boolean {
    const node = this._entityStore.getNode(entityId);
    if (!node) return false;
    Object.assign(node, props);
    this._geometryFactory.recomputeBbox(node);
    return this._rebuildEntityMesh(entityId);
  }

  deleteEntityLocally(entityId: string): boolean {
    const node = this._entityStore.getNode(entityId);
    if (!node) return false;
    // 逻辑删除同样要通知实体移除事件，让 SelectionManager 等模块清理
    // 依附于该实体的资源（如高亮框），避免删除后残留。
    this._entityStore.notifyEntityRemoved(entityId);
    if (this._batchedBuilder.hasEntity(entityId)) {
      this._batchedBuilder.removeEntity(entityId, this._sceneManager.scene);
      this._batchedBuilder.rebuildDirty(this._sceneManager.scene);
    }
    if (this._sdfTextRenderer.has(entityId)) {
      this._sdfTextRenderer.removeText(entityId);
      this._sdfTextRenderer.sync().then(() => { if (!this._isDisposed) this._requestRender(); });
    }
    const mesh = this._entityStore.getMesh(entityId);
    if (mesh) {
      this._sceneManager.remove(mesh);
    }
    this._entityStore.setLogicallyHidden(entityId, true);
    this._spatialIndex.removeEntity(entityId);
    this._requestRender();
    return true;
  }

  restoreEntityLocally(node: SceneNode): boolean {
    const idStr = String((node as any).id ?? this._nextEntityId());
    this._entityStore.setLogicallyHidden(idStr, false);
    return this._addNodeToScene(node) || true;
  }

  addEntityLocally(node: SceneNode): boolean {
    return this._addNodeToScene(node);
  }

  // ═══════════════════════════════════════════════════
  // Document / SceneGraph loading (orchestration)
  // ═══════════════════════════════════════════════════

  loadDocument(doc: CadDocument): void {
    this._clearEntities();
    this._document = doc;

    if (doc.blocks && doc.blocks.length > 0) {
      for (const block of doc.blocks) {
        this._entityStore.addBlock(block.name, block);
      }
    }

    if (doc.extents) {
      const margin = Math.max(doc.extents.max.x - doc.extents.min.x, doc.extents.max.y - doc.extents.min.y) * 0.05;
      this._documentExtents = {
        minX: doc.extents.min.x - margin, minY: doc.extents.min.y - margin,
        maxX: doc.extents.max.x + margin, maxY: doc.extents.max.y + margin,
      };
      this._clippingPlanes = [
        new THREE.Plane(new THREE.Vector3(1, 0, 0), -(this._documentExtents.minX)),
        new THREE.Plane(new THREE.Vector3(-1, 0, 0), this._documentExtents.maxX),
        new THREE.Plane(new THREE.Vector3(0, 1, 0), -(this._documentExtents.minY)),
        new THREE.Plane(new THREE.Vector3(0, -1, 0), this._documentExtents.maxY),
      ];
      this._geometryFactory.setClippingPlanes(this._clippingPlanes);
      this._sceneManager.renderer.localClippingEnabled = true;
    } else {
      this._documentExtents = null;
      this._clippingPlanes = [];
      this._sceneManager.renderer.localClippingEnabled = false;
    }

    for (const entity of doc.entities) {
      try {
        const mesh = this._geometryFactory.createEntityMesh(entity);
        if (mesh && validateObject3D(mesh)) {
          this._entityStore.setMesh(entity.id, mesh);
          if (!this._entityStore.isLayerVisible(entity.layer)) {
            mesh.visible = false;
          }
          this._sceneManager.add(mesh);
        }
      } catch (_e) { /* skip invalid */ }
    }

    this._fitToView();
    this._setupGPUPicking();
    this._requestRender();
  }

  loadFromSceneGraph(sceneGraph: SceneGraph): void {
    this._clearEntities();
    this._document = null;
    this._externalBounds = sceneGraph.bounds;
    this._renderProfile = sceneGraph.renderProfile;
    this._complexFlags = sceneGraph.complexFlags;

    if (sceneGraph.bounds) {
      const maxExtent = Math.max(sceneGraph.bounds.maxX - sceneGraph.bounds.minX, sceneGraph.bounds.maxY - sceneGraph.bounds.minY);
      this._spatialIndex.setCellSize(Math.max(10, maxExtent / 200));
    }

    // Register layers
    for (const layer of sceneGraph.allLayers) {
      this._entityStore.addLayer(layer.name, layer);
      if (!layer.visible || layer.frozen || layer.name === DELETED_LAYER_NAME) {
        this._entityStore.setLayerVisible(layer.name, false);
      }
    }

    const nodes = sceneGraph.allNodes;

    // Dispatch to render profile
    switch (this._renderProfile) {
      case RenderProfile.Light:
      case RenderProfile.Simple:
      default:
        this._renderNodesSimple(nodes);
        break;
      case RenderProfile.Standard:
        this._renderNodesStandard(nodes);
        break;
      case RenderProfile.Heavy:
      case RenderProfile.Mega:
      case RenderProfile.Ultra:
        this._renderNodesHeavy(nodes);
        break;
      case RenderProfile.HeavyLwPolyline:
      case RenderProfile.HeavyEntity:
      case RenderProfile.MediumEntity:
        this._renderNodesWithLod(nodes);
        break;
      case RenderProfile.HeavyHatch:
        this._renderNodesWithHatchOpt(nodes);
        break;
      case RenderProfile.LargeCoordinates:
        this._renderNodesWithCoordOpt(nodes);
        break;
      case RenderProfile.Complex:
        this._renderNodesWithLod(nodes);
        break;
    }

    if (!this._isProgressiveLoading) {
      this._batchedBuilder.rebuildAll(this._sceneManager.scene);
      if (this._sdfTextRenderer.needsSync) {
        this._sdfTextRenderer.sync().then(() => { if (!this._isDisposed) this._requestRender(); });
      }
      this._fitToView();
      this._viewportCuller.schedule();
      this._requestRender();
    }
    this._cameraController.emitCameraChanged();
  }

  // ═══════════════════════════════════════════════════
  // Resize
  // ═══════════════════════════════════════════════════

  resize(): void {
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
      this._fitToView();
    }
    this._viewportCuller.schedule();
    this._requestRender();
  }

  // ═══════════════════════════════════════════════════
  // Render loop
  // ═══════════════════════════════════════════════════

  private _animate(): void {
    if (this._isDisposed) return;

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
        this._processDeferredNodes();
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
      try { this._fitToView(); } finally { this._isRecoveringCamera = false; }
      return;
    }
    this._needsRender = true;
    if (this._animationId === null) {
      this._animationId = requestAnimationFrame(() => this._animate());
    }
  }

  // ═══════════════════════════════════════════════════
  // Private: scene graph rendering
  // ═══════════════════════════════════════════════════

  private _renderNodesSimple(nodes: SceneNode[]): void {
    for (const node of nodes) {
      if (node.layer === DELETED_LAYER_NAME) continue;
      this._addNodeToScene(node);
    }
    this._syncTextRenderer();
  }

  private _renderNodesWithLod(nodes: SceneNode[]): void {
    for (const node of nodes) {
      if (node.layer === DELETED_LAYER_NAME) continue;
      this._addNodeToScene(node, true);
    }
    this._syncTextRenderer();
  }

  private _renderNodesWithHatchOpt(nodes: SceneNode[]): void {
    for (const node of nodes) {
      if (node.layer === DELETED_LAYER_NAME) continue;
      if (node.type === 'hatch') {
        const h = node as any;
        const boundaries = h.boundaries ?? [];
        const totalV = boundaries.reduce((s: number, b: any[]) => s + b.length, 0);
        if (boundaries.some((b: any[]) => b.length > 100) || boundaries.length > 50 || totalV > 500) continue;
      }
      this._addNodeToScene(node);
    }
    this._syncTextRenderer();
  }

  private _renderNodesWithCoordOpt(nodes: SceneNode[]): void {
    this._renderNodesWithLod(nodes);
  }

  private _renderNodesStandard(nodes: SceneNode[]): void {
    const FLAG_HEAVY_LWPOLY = 0b0010;
    const FLAG_MEDIUM_ENTITY = 0b100000;
    const enableDecimation = (this._complexFlags & FLAG_HEAVY_LWPOLY) !== 0;
    for (const node of nodes) {
      if (node.layer === DELETED_LAYER_NAME) continue;
      if ((this._complexFlags & FLAG_MEDIUM_ENTITY) && (node.type === 'text' || node.type === 'mText')) {
        if ((node as any).height !== undefined && (node as any).height < 0.5) continue;
      }
      this._addNodeToScene(node, enableDecimation);
    }
    this._syncTextRenderer();
  }

  private _renderNodesHeavy(nodes: SceneNode[]): void {
    this._isProgressiveLoading = true;
    this._deferredNodes = [];
    const FLAG_HEAVY_HATCH = 0b0100;
    for (const node of nodes) {
      if (node.layer === DELETED_LAYER_NAME) continue;
      if ((this._complexFlags & FLAG_HEAVY_HATCH) && node.type === 'hatch') {
        this._deferredNodes.push(node);
        continue;
      }
      this._addNodeToScene(node);
    }
    this._syncTextRenderer();
    // Schedule deferred processing
    if (this._deferredNodes.length > 0) {
      this._requestRender();
    }
  }

  private _processDeferredNodes(): void {
    const batch = this._deferredNodes.splice(0, 50);
    for (const node of batch) {
      this._addNodeToScene(node);
    }
    this._batchedBuilder.rebuildDirty(this._sceneManager.scene);
    this._syncTextRenderer();
    this._requestRender();
  }

  private _syncTextRenderer(): void {
    if (this._sdfTextRenderer.needsSync) {
      this._sdfTextRenderer.sync().then(() => { if (!this._isDisposed) this._requestRender(); });
    }
  }

  /** Core: add a SceneNode to the rendering pipeline */
  private _addNodeToScene(node: SceneNode, enableLwPolyDecimation = false): boolean {
    if (node.layer === DELETED_LAYER_NAME) return false;
    try {
      const idStr = String(node.id);
      this._geometryFactory.expandDegenerateBbox(node);

      const hiddenByLayer = !this._entityStore.isLayerVisible(node.layer);
      const hiddenByNode = node.visible === false;
      if (hiddenByLayer || hiddenByNode) {
        this._entityStore.setLogicallyHidden(idStr, true);
      }

      let effectiveNode = node;
      if (enableLwPolyDecimation && node.type === 'lwPolyline') {
        effectiveNode = this._decimateLwPolylineNode(node);
      }
      this._entityStore.addNode(idStr, effectiveNode);

      // Text batching
      if (this._useBatchedText && (effectiveNode.type === 'text' || effectiveNode.type === 'mText')) {
        const added = this._geometryFactory.addTextToBatchedRenderer(idStr, effectiveNode, effectiveNode.layer);
        if (added) {
          if (hiddenByLayer || hiddenByNode) {
            this._sdfTextRenderer.setTextVisible(idStr, false);
          }
          return true;
        }
      }

      // Line batching
      if (this._useBatchedRendering && this._geometryFactory.isBatchableType(effectiveNode.type)) {
        const positions = this._geometryFactory.extractLinePositions(effectiveNode);
        if (positions && positions.length >= 6) {
          const color = this._geometryFactory.resolveColor(effectiveNode.color, effectiveNode.layer);
          const lineWidth = this._geometryFactory.resolveLineWidth((effectiveNode as any).lineWeight);
          this._batchedBuilder.addLineSegments(idStr, effectiveNode.layer, color, lineWidth, positions, this._sceneManager.scene);
          this._addSegmentsToSpatialIndex(idStr, positions);
          return true;
        }
      }

      // Individual mesh
      const mesh = this._geometryFactory.createSceneNodeMesh(effectiveNode);
      if (mesh && validateObject3D(mesh)) {
        this._entityStore.setMesh(idStr, mesh);
        this._entityStore.addIndividualEntity(idStr);
        this._addEntityToSpatialIndex(idStr, effectiveNode);
        if (hiddenByLayer || hiddenByNode) mesh.visible = false;
        this._sceneManager.add(mesh);
        return true;
      }
    } catch (_e) { /* skip */ }
    return false;
  }

  private _addCloneToScene(newId: string, clone: SceneNode): void {
    this._entityStore.addNode(newId, clone);
    this._entityStore.setEntityColor(newId, this._geometryFactory.resolveColor(clone.color, clone.layer));

    const hiddenByLayer = !this._entityStore.isLayerVisible(clone.layer);
    const hiddenByNode = clone.visible === false;
    if (hiddenByLayer || hiddenByNode) {
      this._entityStore.setLogicallyHidden(newId, true);
    }

    if (this._useBatchedRendering && this._geometryFactory.isBatchableType(clone.type)) {
      const positions = this._geometryFactory.extractLinePositions(clone);
      if (positions && positions.length >= 6) {
        const color = this._geometryFactory.resolveColor(clone.color, clone.layer);
        const lineWidth = this._geometryFactory.resolveLineWidth((clone as any).lineWeight);
        this._batchedBuilder.addLineSegments(newId, clone.layer, color, lineWidth, positions, this._sceneManager.scene);
        this._addSegmentsToSpatialIndex(newId, positions);
        this._batchedBuilder.rebuildDirty(this._sceneManager.scene);
        this._requestRender();
        return;
      }
    }

    if (this._useBatchedText && (clone.type === 'text' || clone.type === 'mText')) {
      const added = this._geometryFactory.addTextToBatchedRenderer(newId, clone, clone.layer);
      if (added) {
        if (hiddenByLayer || hiddenByNode) this._sdfTextRenderer.setTextVisible(newId, false);
        this._sdfTextRenderer.sync().then(() => { if (!this._isDisposed) this._requestRender(); });
        return;
      }
    }

    const mesh = this._geometryFactory.createSceneNodeMesh(clone);
    if (mesh && validateObject3D(mesh)) {
      this._entityStore.setMesh(newId, mesh);
      this._entityStore.addIndividualEntity(newId);
      this._addEntityToSpatialIndex(newId, clone);
      if (hiddenByLayer || hiddenByNode) mesh.visible = false;
      this._sceneManager.add(mesh);
    }
    this._requestRender();
  }

  private _decimateLwPolylineNode(node: SceneNode): SceneNode {
    return this._geometryFactory.decimateLwPolylineNode(node);
  }

  private _addSegmentsToSpatialIndex(entityId: string, positions: number[]): void {
    const segments: LineSegment[] = [];
    for (let i = 0; i < positions.length - 5; i += 6) {
      segments.push({
        entityId,
        x1: positions[i], y1: positions[i + 1],
        x2: positions[i + 3], y2: positions[i + 4],
      });
    }
    this._spatialIndex.addSegments(segments);
  }

  private _addEntityToSpatialIndex(entityId: string, node: SceneNode): void {
    if (node.bbox) {
      this._spatialIndex.addEntity(entityId, node.bbox);
    }
  }

  private _rebuildEntityMesh(entityId: string): boolean {
    const node = this._entityStore.getNode(entityId);
    if (!node) return false;

    const isSelected = this._selectionManager.isSelected(entityId);

    // 文字：重建 SDF 文字，选中态则重建高亮框
    if (this._useBatchedText && this._sdfTextRenderer.has(entityId)) {
      this._sdfTextRenderer.removeText(entityId);
      const added = this._geometryFactory.addTextToBatchedRenderer(entityId, node, node.layer);
      if (added) {
        if (!this._entityStore.isLayerVisible(node.layer) || node.visible === false) {
          this._sdfTextRenderer.setTextVisible(entityId, false);
        }
        if (isSelected) {
          this._selectionManager.refreshHighlightOverlay(entityId);
        }
        this._sdfTextRenderer.sync().then(() => { if (!this._isDisposed) this._requestRender(); });
        return true;
      }
    }

    // 合批线条：未选中才合批回去；选中的保持独立 mesh 以便高亮
    if (this._batchedBuilder.hasEntity(entityId)) {
      this._batchedBuilder.removeEntity(entityId, this._sceneManager.scene);
      this._spatialIndex.removeEntity(entityId);
      if (this._useBatchedRendering && this._geometryFactory.isBatchableType(node.type) && !isSelected) {
        const positions = this._geometryFactory.extractLinePositions(node);
        if (positions && positions.length >= 6) {
          const color = this._geometryFactory.resolveColor(node.color, node.layer);
          const lineWidth = this._geometryFactory.resolveLineWidth((node as any).lineWeight);
          this._batchedBuilder.addLineSegments(entityId, node.layer, color, lineWidth, positions, this._sceneManager.scene);
          this._addSegmentsToSpatialIndex(entityId, positions);
          this._batchedBuilder.rebuildDirty(this._sceneManager.scene);
          this._batchedBuilder.pruneOrphanedLineSegments(this._sceneManager.scene);
          this._requestRender();
          return true;
        }
      }
      this._batchedBuilder.rebuildDirty(this._sceneManager.scene);
      this._batchedBuilder.pruneOrphanedLineSegments(this._sceneManager.scene);
    }

    // 独立 mesh：移除旧的，重建新的
    const oldMesh = this._entityStore.getMesh(entityId);
    if (oldMesh) {
      this._sceneManager.remove(oldMesh);
      this._entityStore.getAllMeshes().delete(entityId);
      this._entityStore.removeIndividualEntity(entityId);
    }
    this._spatialIndex.removeEntity(entityId);

    const newMesh = this._geometryFactory.createSceneNodeMesh(node);
    if (!newMesh || !validateObject3D(newMesh)) return false;
    this._entityStore.setMesh(entityId, newMesh);
    this._entityStore.addIndividualEntity(entityId);
    this._addEntityToSpatialIndex(entityId, node);
    if (this._entityStore.isLogicallyHidden(entityId) || !this._entityStore.isLayerVisible(node.layer)) {
      newMesh.visible = false;
    }
    this._sceneManager.add(newMesh);
    // 选中态：重新应用高亮材质
    if (isSelected) {
      this._selectionManager.reapplyHighlightForMesh(entityId, newMesh);
    }
    this._requestRender();
    this._batchedBuilder.pruneOrphanedLineSegments(this._sceneManager.scene);
    return true;
  }

  /**
   * 选中合批实体时：将其从合批移除并重建为独立 mesh，以便单独高亮。
   * 注入给 SelectionManager 使用（避免其重复实现且丢失 mesh 重建）。
   */
  private _extractEntityFromBatch(entityId: string): void {
    if (!this._batchedBuilder.hasEntity(entityId)) return;
    const node = this._entityStore.getNode(entityId);
    if (!node) return;

    this._batchedBuilder.removeEntity(entityId, this._sceneManager.scene);
    this._spatialIndex.removeEntity(entityId);

    const mesh = this._geometryFactory.createSceneNodeMesh(node);
    if (mesh && validateObject3D(mesh)) {
      this._entityStore.setMesh(entityId, mesh);
      this._entityStore.addIndividualEntity(entityId);
      this._addEntityToSpatialIndex(entityId, node);
      if (this._entityStore.isLogicallyHidden(entityId) || !this._entityStore.isLayerVisible(node.layer)) {
        mesh.visible = false;
      }
      this._sceneManager.add(mesh);
    }
    this._batchedBuilder.rebuildDirty(this._sceneManager.scene);
    this._batchedBuilder.pruneOrphanedLineSegments(this._sceneManager.scene);
  }

  /**
   * 取消选中时：将独立 mesh 合批回去，恢复原始批量渲染。
   * 注入给 SelectionManager 使用。
   */
  private _mergeEntityBackToBatch(entityId: string): void {
    const node = this._entityStore.getNode(entityId);
    if (!node || !this._geometryFactory.isBatchableType(node.type)) return;
    if (!this._entityStore.isIndividualEntity(entityId)) return;

    const positions = this._geometryFactory.extractLinePositions(node);
    if (!positions || positions.length < 6) return;

    // 移除独立 mesh
    const mesh = this._entityStore.getMesh(entityId);
    if (mesh) {
      this._sceneManager.remove(mesh);
      this._entityStore.getAllMeshes().delete(entityId);
    }
    this._entityStore.removeIndividualEntity(entityId);
    this._spatialIndex.removeEntity(entityId);

    const color = this._geometryFactory.resolveColor(node.color, node.layer);
    const lineWidth = this._geometryFactory.resolveLineWidth((node as any).lineWeight);
    this._batchedBuilder.addLineSegments(entityId, node.layer, color, lineWidth, positions, this._sceneManager.scene);
    this._addSegmentsToSpatialIndex(entityId, positions);
    this._batchedBuilder.rebuildDirty(this._sceneManager.scene);
    this._batchedBuilder.pruneOrphanedLineSegments(this._sceneManager.scene);
  }

  private _nextEntityId(): string {
    let maxId = 0;
    for (const key of this._entityStore.getNodeEntries()) {
      const num = parseInt(key[0], 10);
      if (!isNaN(num) && num > maxId) maxId = num;
    }
    return String(maxId + 1);
  }

  private _refreshAllEntityColors(): void {
    for (const [id, node] of this._entityStore.getNodeEntries()) {
      const newColor = this._geometryFactory.resolveColor(node.color, node.layer);
      this._entityStore.setEntityColor(id, newColor);

      if (this._batchedBuilder.hasEntity(id)) {
        const positions = this._geometryFactory.extractLinePositions(node);
        if (positions && positions.length >= 6) {
          this._batchedBuilder.removeEntity(id, this._sceneManager.scene);
          const lineWidth = this._geometryFactory.resolveLineWidth((node as any).lineWeight);
          this._batchedBuilder.addLineSegments(id, node.layer, newColor, lineWidth, positions, this._sceneManager.scene);
        }
      } else {
        const mesh = this._entityStore.getMesh(id);
        if (mesh && !this._selectionManager.getSelectedEntityIds().includes(id)) {
          mesh.traverse((child) => {
            if (child instanceof Line2) {
              (child.material as LineMaterial).color.copy(newColor);
            } else if ('color' in (child as any).material) {
              ((child as any).material as any).color.copy(newColor);
            }
          });
        }
      }
    }
    this._batchedBuilder.rebuildDirty(this._sceneManager.scene);
    this._requestRender();
  }

  private _fitToView(): void {
    const nodeBounds = this._computeNodeBounds();
    this._cameraController.fitToView(nodeBounds, this._externalBounds);
    this._interactionController.setInitialSpan(
      Math.max(
        this._cameraController.camera.right - this._cameraController.camera.left,
        this._cameraController.camera.top - this._cameraController.camera.bottom,
      ),
    );
    this._requestRender();
  }

  private _computeNodeBounds(): BoundingBox | null {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const node of this._entityStore.getAllNodes()) {
      if (node.bbox) {
        minX = Math.min(minX, node.bbox.minX);
        minY = Math.min(minY, node.bbox.minY);
        maxX = Math.max(maxX, node.bbox.maxX);
        maxY = Math.max(maxY, node.bbox.maxY);
      }
    }
    if (!isFinite(minX)) return null;
    return { minX, minY, maxX, maxY };
  }

  private _boundsForView(externalBounds: BoundingBox | null): BoundingBox | null {
    if (externalBounds) return externalBounds;
    return this._computeNodeBounds();
  }

  private _clearEntities(): void {
    // Clear all rendering state
    this._entityStore.clearAll();
    this._batchedBuilder.clear(this._sceneManager.scene);
    this._sdfTextRenderer.clear();
    this._spatialIndex.clear();
    this._selectionManager.deselectAll();
    this._isProgressiveLoading = false;
    this._deferredNodes = [];
    if (this._deferredTimer !== null) {
      clearTimeout(this._deferredTimer);
      this._deferredTimer = null;
    }
    this._sceneManager.clearScene();
    // clearScene() 会移除 scene 中所有 children（含 SDF 文字的 BatchedText）。
    // batchedBuilder 会在 rebuildAll 时重新 add，但 SDF 文字不会，必须在此重新挂回，
    // 否则后续 addText 的文字都挂在脱离 scene 的 BatchedText 上，永远渲染不出来。
    this._sdfTextRenderer.addToScene(this._sceneManager.scene);
  }

  private _setupGPUPicking(): void {
    this._selectionManager.rebuildPickingScene();
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
