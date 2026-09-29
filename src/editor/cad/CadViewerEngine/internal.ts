import type { TransformParams } from '../coordinate/TransformCalculator';
import type { CadRenderer } from '../CadRenderer';
import type { SceneGraph } from '../cad_runtime/scene_graph';
import type { SceneNode } from '../cad_runtime/scene_node';
import type { CadLayer } from '../types';
import type { CadDocumentInfo, CadEngineEventHandler, CadEngineEventType } from './types';

/** 图层属性补丁（color/visible/locked/frozen 的任意子集）。 */
export type LayerPropsPatch = {
  color?: number;
  visible?: boolean;
  locked?: boolean;
  frozen?: boolean;
};

/**
 * CadViewerEngine 的内部状态视图。
 *
 * 拆分后各 mixin 模块（documentLoading/entityEditing/layers/viewControls）
 * 需要访问核心类的私有字段与私有方法，但又不希望把这些实现细节提升为 public API。
 * 此接口仅用于模块内 `this` 的类型断言，运行时不产生任何开销。
 */
export interface CadViewerEngineInternal {
  // ── 核心状态 ──
  _id: string;
  _isInitialized: boolean;
  _isDocumentLoaded: boolean;
  _currentDocument: CadDocumentInfo | null;
  _transformParams: TransformParams | null;
  _eventHandlers: Map<CadEngineEventType, Set<CadEngineEventHandler>>;
  _container: HTMLElement | null;
  _renderer: CadRenderer | null;
  _destroyed: boolean;
  _resizeObserver: ResizeObserver | null;
  _sceneGraph: SceneGraph | null;
  _libraryId: string | null;
  _pendingLayerProps: Map<string, LayerPropsPatch>;
  _layerPropsFlushTimer: ReturnType<typeof setTimeout> | null;
  _documentLayers: CadLayer[];

  // ── 核心私有方法（跨模块调用） ──
  _waitForContainerSize(el: HTMLElement, maxFrames: number): Promise<{ width: number; height: number }>;
  _assertInitialized(action: string): void;
  _toNumericEntityId(entityId: string): number;
  _emit(event: CadEngineEventType, data: unknown): void;
  readFileAsArrayBuffer(file: File): Promise<ArrayBuffer>;
  _handleDrawComplete(entityJson: string): Promise<void>;
  _cadEntityJsonToSceneNode(entityJson: string, numericId: number): SceneNode | null;
  _sceneNodePropsToCadEntityProps(entityId: string, sceneNodeProps: Record<string, unknown>): Record<string, unknown>;
  _flushLayerProps(): Promise<void>;

  // ── 跨模块公共方法 ──
  flushPendingChanges(): Promise<void>;
  batchUpdateLayerProps(updates: Array<{ layerName: string; props: LayerPropsPatch }>): Promise<void>;
}