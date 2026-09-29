import type {
  SceneComponent,
  LayerNode,
  ViewportState,
  SelectionState,
  HistoryEntry,
  Point,
  Transform,
  EventBinding,
  BreakpointId,
} from "../../types/editor";
import type { CanvasConfig } from "../../types/canvasConfig";

interface DirtyState {
  isDirty: boolean;
  markDirty: () => void;
  markClean: () => void;
}

export type EditorTool = "select";

export interface EditorState {
  components: SceneComponent[];
  layers: LayerNode[];

  viewport: ViewportState;
  selection: SelectionState;
  activeTool: EditorTool;

  zoom: number;
  activeLayerId: string | null;
  draggedComponentType: string | null;
  canvasConfig: CanvasConfig;

  apiConfig: import("../../types/scene").SceneApiConfig;

  dataSources: import("../../types/scene").SceneDataSource[];
  containerSize: { width: number; height: number };
  history: HistoryEntry[];
  historyIndex: number;
  maxHistory: number;
  clipboard: SceneComponent[];
  eventBindings: EventBinding[];
  previewMode: boolean;
  views: import("../../types/scene").SceneView[];
  activeViewId: string;
  globalComponents: SceneComponent[];

  activeBreakpoint: BreakpointId;

  actionHandlers: Record<string, (cfg: Record<string, unknown>, onCh: (k: string, v: unknown) => void) => void>;
}

export interface EditorActions {
  addComponent: (type: string, layerId?: string, position?: Partial<Point>, parentId?: string | null) => SceneComponent | null;
  removeComponent: (id: string) => void;
  updateComponent: (id: string, updates: Partial<SceneComponent>) => void;
  updateComponentTransform: (id: string, transform: Partial<Transform>) => void;
  updateComponentConfig: (id: string, config: Record<string, unknown>) => void;

  applyRealtimeData: (id: string, data: Record<string, unknown>) => void;
  batchUpdateComponent: (id: string, updates: { config?: Record<string, unknown>; transform?: Partial<Transform> }) => void;

  setActiveBreakpoint: (bp: BreakpointId) => void;
  moveComponentToLayer: (id: string, layerId: string) => void;
  reorderComponent: (id: string, zIndex: number) => void;
  duplicateComponent: (id: string) => SceneComponent | null;
  getComponentsByLayer: (layerId: string) => SceneComponent[];
  getComponent: (id: string) => SceneComponent | undefined;

  addLayer: (name?: string, parentId?: string | null) => LayerNode;
  addLayerGroup: (name?: string, parentId?: string | null) => LayerNode;
  removeLayer: (id: string) => void;
  updateLayer: (id: string, updates: Partial<LayerNode>) => void;
  moveLayerToParent: (id: string, parentId: string | null, order?: number) => void;
  reorderLayer: (id: string, order: number) => void;
  toggleLayerVisibility: (id: string) => void;
  toggleLayerLock: (id: string) => void;
  toggleLayerExpanded: (id: string) => void;
  getLayer: (id: string) => LayerNode | undefined;
  getRootLayers: () => LayerNode[];
  getLayerTree: () => LayerNode[];

  addEventBinding: (binding: EventBinding) => void;
  removeEventBinding: (id: string) => void;
  updateEventBinding: (id: string, updates: Partial<EventBinding>) => void;

  selectComponent: (id: string, multi?: boolean) => void;
  deselectAll: () => void;
  selectAll: () => void;
  setHoveredComponent: (id: string | null) => void;
  getSelectedComponents: () => SceneComponent[];

  setContainerSize: (width: number, height: number) => void;

  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomToFit: () => void;
  resetZoom: () => void;

  setActiveTool: (tool: EditorTool) => void;
  setDraggedComponentType: (type: string | null) => void;
  setActiveLayer: (layerId: string | null) => void;
  setCanvasConfig: (updates: Partial<CanvasConfig>) => void;
  /** 更新全局 API 配置（base URL / 认证开关 / 默认 headers / 超时） */
  setApiConfig: (updates: Partial<import("../../types/scene").SceneApiConfig>) => void;
  /** 新增全局数据源，返回创建的完整对象 */
  addDataSource: (source?: Partial<import("../../types/scene").SceneDataSource>) => import("../../types/scene").SceneDataSource;
  /** 更新全局数据源 */
  updateDataSource: (id: string, updates: Partial<import("../../types/scene").SceneDataSource>, opts?: { silent?: boolean }) => void;
  /** 删除全局数据源 */
  removeDataSource: (id: string) => void;
  /** 读取全部全局数据源 */
  getDataSources: () => import("../../types/scene").SceneDataSource[];
  fitCanvasHeightToContent: () => void;

  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  pushHistory: (type: HistoryEntry["type"]) => void;

  copySelected: () => void;
  pasteClipboard: () => void;

  loadScene: (components: SceneComponent[], layers: LayerNode[]) => void;
  loadSceneWithViews: (views: import("../../types/scene").SceneView[], globalComponents: SceneComponent[], activeViewId: string) => void;
  exportScene: () => { components: SceneComponent[]; layers: LayerNode[] };
  exportSceneWithViews: () => { views: import("../../types/scene").SceneView[]; globalComponents: SceneComponent[]; activeViewId: string };
  /** 生成当前场景所有组件的响应式 @media 查询 CSS */
  getResponsiveCSS: () => string;
  clearScene: () => void;
  setPreviewMode: (preview: boolean) => void;

  addView: (name: string) => string;
  removeView: (viewId: string) => void;
  switchView: (viewId: string) => void;
  renameView: (viewId: string, name: string) => void;
  getActiveView: () => import("../../types/scene").SceneView | undefined;
}

export type EditorStore = EditorState & EditorActions;

export type { DirtyState };