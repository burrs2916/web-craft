import type * as THREE from 'three';
import type { CadDocument } from '../types';
import type { SceneNode, BoundingBox } from '../cad_runtime/scene_node';
import type { RenderProfile } from '../cad_runtime/scene_graph';
import type { BatchedLayerBuilder } from '../cad_runtime/batched_layer_builder';
import type { EntityRendererRegistry } from '../cad_runtime/entity_renderers/EntityRenderer';
import type { ToolRegistry } from '../../tools/Tool';
import type { GridSpatialIndex } from '../cad_runtime/grid_spatial_index';
import type { SdfTextRenderer } from '../cad_runtime/sdf_text_renderer';
import type { SceneManager } from '../rendering/SceneManager';
import type { CameraController } from '../rendering/CameraController';
import type { EntityStore } from '../rendering/EntityStore';
import type { SelectionManager } from '../rendering/SelectionManager';
import type { ViewportCuller } from '../rendering/ViewportCuller';
import type { GeometryFactory } from '../rendering/GeometryFactory';
import type { InteractionController } from '../rendering/InteractionController';
import type { FitMode } from './types';

/**
 * CadRenderer 的内部状态视图。
 *
 * 拆分后各 mixin 模块（camera/background/selection/layers/entities/sceneGraph/pipeline）
 * 需要访问核心类的私有字段与私有方法，但又不希望把这些实现细节提升为 public API。
 * 此接口仅用于模块内 `this` 的类型断言，运行时不产生任何开销。
 */
export interface CadRendererInternal {
  // ── Modules ──
  _sceneManager: SceneManager;
  _cameraController: CameraController;
  _entityStore: EntityStore;
  _selectionManager: SelectionManager;
  _viewportCuller: ViewportCuller;
  _geometryFactory: GeometryFactory;
  _interactionController: InteractionController;

  // ── Shared mutable state ──
  _document: CadDocument | null;
  _debugMode: boolean;
  _transparentBackground: boolean;
  _externalBounds: BoundingBox | null;
  _renderProfile: RenderProfile;
  _complexFlags: number;
  _isProgressiveLoading: boolean;
  _sdfTextRenderer: SdfTextRenderer;
  _batchedBuilder: BatchedLayerBuilder;
  _spatialIndex: GridSpatialIndex;
  _clippingPlanes: THREE.Plane[];
  _documentExtents: { minX: number; minY: number; maxX: number; maxY: number } | null;
  _useBatchedRendering: boolean;
  _useBatchedText: boolean;
  _entityRendererRegistry: EntityRendererRegistry | null;
  _toolRegistry: ToolRegistry | null;
  _fitMode: FitMode;

  // ── Animation / render loop ──
  _animationId: number | null;
  _needsRender: boolean;
  _isRecoveringCamera: boolean;
  _isDisposed: boolean;

  // ── Progressive loading ──
  _deferredNodes: SceneNode[];
  _deferredTimer: number | null;

  // ── Event callbacks ──
  _onSelectionChanged?: (entityIds: string[]) => void;

  // ── Core methods ──
  _requestRender(): void;
  _animate(): void;

  // ── Cross-module methods ──
  _fitToView(): void;
  _computeNodeBounds(): BoundingBox | null;
  _boundsForView(externalBounds: BoundingBox | null): BoundingBox | null;
  _refreshAllEntityColors(): void;
  _addNodeToScene(node: SceneNode, enableLwPolyDecimation?: boolean): boolean;
  _addCloneToScene(newId: string, clone: SceneNode): void;
  _rebuildEntityMesh(entityId: string): boolean;
  _extractEntityFromBatch(entityId: string): void;
  _mergeEntityBackToBatch(entityId: string): void;
  _decimateLwPolylineNode(node: SceneNode): SceneNode;
  _addSegmentsToSpatialIndex(entityId: string, positions: number[]): void;
  _addEntityToSpatialIndex(entityId: string, node: SceneNode): void;
  _nextEntityId(): string;
  _clearEntities(): void;
  _setupGPUPicking(): void;
  _syncTextRenderer(): void;
  _processDeferredNodes(): void;
  _renderNodesSimple(nodes: SceneNode[]): void;
  _renderNodesStandard(nodes: SceneNode[]): void;
  _renderNodesHeavy(nodes: SceneNode[]): void;
  _renderNodesWithLod(nodes: SceneNode[]): void;
  _renderNodesWithHatchOpt(nodes: SceneNode[]): void;
  _renderNodesWithCoordOpt(nodes: SceneNode[]): void;

  // ── Public methods cross-called between modules ──
  getSelectedEntityIds(): string[];
  deleteEntityLocally(entityId: string): boolean;
  copyEntityLocally(entityId: string, dx: number, dy: number): string | null;
}