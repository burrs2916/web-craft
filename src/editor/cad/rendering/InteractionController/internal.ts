import type * as THREE from 'three';
import type { SceneNode } from '../../cad_runtime/scene_node';
import type { BatchedLayerBuilder } from '../../cad_runtime/batched_layer_builder';
import type { SdfTextRenderer } from '../../cad_runtime/sdf_text_renderer';
import type { GridSpatialIndex } from '../../cad_runtime/grid_spatial_index';
import type { SceneManager } from '../SceneManager';
import type { CameraController, CameraInfo } from '../CameraController';
import type { EntityStore } from '../EntityStore';
import type { SelectionManager } from '../SelectionManager';
import type { GeometryFactory } from '../GeometryFactory';
import type { DrawingManager } from '../../drawing/DrawingManager';
import type { SnapManager } from '../../snap/SnapManager';
import type { InteractionMode } from './types';

/**
 * InteractionController 的内部状态视图。
 *
 * 拆分后各 mixin 模块（mouse / wheelZoom / boxSelect / dragPreview / snap /
 * cursor / cameraNotify）需要访问核心类的私有字段与私有方法，但又不希望把这些
 * 实现细节提升为 public API。此接口仅用于模块内 `this` 的类型断言，运行时不产生任何开销。
 */
export interface InteractionControllerInternal {
  // ── 依赖模块 ──
  _sceneManager: SceneManager;
  _cameraController: CameraController;
  _entityStore: EntityStore;
  _selectionManager: SelectionManager;
  _geometryFactory: GeometryFactory;
  _sdfTextRenderer: SdfTextRenderer;
  _batchedBuilder: BatchedLayerBuilder;
  _spatialIndex: GridSpatialIndex;

  // ── 渲染回调 ──
  _onRequestRender: () => void;
  _onScheduleViewportCulling: () => void;
  _onRebuildEntityMesh: (entityId: string) => void;
  _onTranslateNode: (node: SceneNode, dx: number, dy: number) => void;

  // ── 事件回调 ──
  _onEntityClick?: (entityId: string, layer: string) => void;
  _onSelectionChanged?: (entityIds: string[]) => void;
  _onCameraChanged?: (info: CameraInfo) => void;
  _onCameraInteractionEnd?: (info: CameraInfo) => void;
  _onEntityMoved?: (entityId: string, dx: number, dy: number) => void;
  _onEntityContextMenu?: (entityId: string, layer: string, clientX: number, clientY: number) => void;
  _onDrawComplete?: (entityJson: string) => void;

  // ── 交互状态 ──
  _isPanning: boolean;
  _isBoxSelecting: boolean;
  _boxSelectStart: THREE.Vector2;
  _boxSelectEnd: THREE.Vector2;
  _boxSelectOverlay: HTMLDivElement | null;
  _isDraggingEntity: boolean;
  _dragEntityId: string | null;
  _dragStartWorld: THREE.Vector2;
  _dragLineSnapshots: Map<string, number[]>;

  // ── 平移状态 ──
  _panStart: THREE.Vector2;
  _cameraStart: THREE.Vector2;
  _documentPanListenersAttached: boolean;

  // ── 事件处理器引用 ──
  _wheelHandler: (e: WheelEvent) => void;
  _contextMenuHandler: (e: MouseEvent) => void;
  _mouseDownHandler: (e: MouseEvent) => void;
  _mouseMoveHandler: (e: MouseEvent) => void;
  _mouseUpHandler: (e: MouseEvent) => void;
  _mouseLeaveHandler: () => void;
  _keyDownHandler: (e: KeyboardEvent) => void;
  _documentPanMouseMoveHandler: (e: MouseEvent) => void;
  _documentPanMouseUpHandler: (e: MouseEvent) => void;

  // ── 滚轮缩放状态 ──
  _wheelPending: boolean;
  _wheelZoomFactor: number;
  _wheelWorldX: number;
  _wheelWorldY: number;
  _initialSpan: number;
  _MIN_SPAN_RATIO: number;
  _MAX_SPAN_RATIO: number;

  // ── 交互模式 ──
  _interactionMode: InteractionMode;

  // ── 相机变更通知 ──
  _lastCameraEmit: number;
  _cameraInteractionEndTimer: ReturnType<typeof setTimeout> | null;

  // ── 世界坐标 ──
  _lastWorldX: number;
  _lastWorldY: number;

  // ── 捕捉 ──
  _snapManager: SnapManager | null;
  _snapMarker: THREE.Object3D | null;
  _lastSnapPoint: { x: number; y: number } | null;

  // ── 绘图 ──
  _drawingManager: DrawingManager | null;

  // ── Dispose 守卫 ──
  _isDisposed: boolean;

  // ── 跨模块方法 ──
  pickEntityIdAt(clientX: number, clientY: number, includeHidden?: boolean): string | null;
  _setupMouseInteraction(): void;
  _setupWheelZoom(): void;
  _attachDocumentPanListeners(): void;
  _detachDocumentPanListeners(): void;
  _updateCursor(hint?: 'hover' | 'grabbing' | 'move' | 'not-allowed'): void;
  _clientToWorldCoord(e: MouseEvent): { x: number; y: number };
  _updateLastWorldCoord(e: MouseEvent): void;
  _handleSnap(e: MouseEvent): void;
  _showSnapMarker(worldX: number, worldY: number, type: string): void;
  _clearSnapMarker(): void;
  _showBoxSelectOverlay(startX: number, startY: number): void;
  _updateBoxSelectOverlay(): void;
  _hideBoxSelectOverlay(): void;
  _completeBoxSelect(clientX: number, clientY: number): void;
  _prepareSelectedEntitiesForDrag(): void;
  _applyDragPreview(entityId: string, dx: number, dy: number): void;
  _restoreDragPreview(entityId: string): void;
  _extractFromBatchForDrag(entityId: string): void;
  _offsetLinePositions(positions: number[], dx: number, dy: number): number[];
  _finishEntityDrag(dx: number, dy: number, rebuildAllBatched: boolean): void;
  _buildNodeIndex(): Map<string, SceneNode>;
  _buildEntityLayers(): Map<string, string>;
  _buildHiddenSet(): Set<string>;
  _disposeObject3D(obj: THREE.Object3D, disposeMaterial?: boolean): void;
  _emitCameraChanged(): void;
  _emitCameraInteractionEnd(): void;
  _scheduleCameraInteractionEnd(): void;
}