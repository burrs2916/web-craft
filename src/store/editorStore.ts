import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import logger from "../utils/logger";
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
} from "../types/editor";
import {
  createDefaultSceneComponent,
  createDefaultLayer,
  getLayerDescendants,
  getBreakpointConfig,
} from "../types/editor";
import type {
  CanvasConfig,
} from "../types/canvasConfig";
import {
  DEFAULT_CANVAS_CONFIG,
  normalizeCanvasConfig,
} from "../types/canvasConfig";
import { componentRegistry } from "../editor/registry";
import { generateResponsiveCSS } from "../editor/utils/responsiveCSS";
import { clampZoom, MIN_CANVAS_H, MAX_CANVAS_H } from "../editor/utils/canvasConstants";
import { createDefaultApiConfig, createDefaultDataSource } from "../types/scene";
import { computeContentBottom } from "../editor/utils/contentBounds";

// re-export for backward compatibility
export type { CanvasPadding, CanvasMetadata, CanvasConfig } from "../types/canvasConfig";
export { DEFAULT_CANVAS_CONFIG, normalizeCanvasConfig } from "../types/canvasConfig";

interface DirtyState {
  isDirty: boolean;
  markDirty: () => void;
  markClean: () => void;
}

export const useDirtyStore = create<DirtyState>()((set) => ({
  isDirty: false,
  markDirty: () => set({ isDirty: true }),
  markClean: () => set({ isDirty: false }),
}));

export type EditorTool = "select";

export interface EditorState {
  components: SceneComponent[];
  layers: LayerNode[];
  /** @deprecated viewport 变换已废弃，仅保留用于 views 序列化兼容 */
  viewport: ViewportState;
  selection: SelectionState;
  activeTool: EditorTool;
  /** 画布缩放比例（1 = 100%） */
  zoom: number;
  activeLayerId: string | null;
  draggedComponentType: string | null;
  canvasConfig: CanvasConfig;
  /** 全局 API 配置 — 统一数据接入层的项目级配置 */
  apiConfig: import("../types/scene").SceneApiConfig;
  /** 全局数据源列表 — 场景层统一定义，多个组件通过 dataSourceId 绑定读取 */
  dataSources: import("../types/scene").SceneDataSource[];
  containerSize: { width: number; height: number };
  history: HistoryEntry[];
  historyIndex: number;
  maxHistory: number;
  clipboard: SceneComponent[];
  eventBindings: EventBinding[];
  previewMode: boolean;
  views: import("../types/scene").SceneView[];
  activeViewId: string;
  globalComponents: SceneComponent[];
  /** 当前响应式断点（默认 desktop） */
  activeBreakpoint: BreakpointId;
  /** 属性面板 action 按钮的处理器注册表 */
  actionHandlers: Record<string, (cfg: Record<string, unknown>, onCh: (k: string, v: unknown) => void) => void>;
}

export interface EditorActions {
  addComponent: (type: string, layerId?: string, position?: Partial<Point>, parentId?: string | null) => SceneComponent | null;
  removeComponent: (id: string) => void;
  updateComponent: (id: string, updates: Partial<SceneComponent>) => void;
  updateComponentTransform: (id: string, transform: Partial<Transform>) => void;
  updateComponentConfig: (id: string, config: Record<string, unknown>) => void;
  // 实时数据专用写入：只合并 config，不记历史、不标脏（非用户编辑，避免撤销栈被淹没 + 保存状态抖动 + 额外重渲染）
  applyRealtimeData: (id: string, data: Record<string, unknown>) => void;
  batchUpdateComponent: (id: string, updates: { config?: Record<string, unknown>; transform?: Partial<Transform> }) => void;
  /** 切换响应式断点（desktop/tablet/mobile），自动调整画布宽度 */
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
  setApiConfig: (updates: Partial<import("../types/scene").SceneApiConfig>) => void;
  /** 新增全局数据源，返回创建的完整对象 */
  addDataSource: (source?: Partial<import("../types/scene").SceneDataSource>) => import("../types/scene").SceneDataSource;
  /** 更新全局数据源 */
  updateDataSource: (id: string, updates: Partial<import("../types/scene").SceneDataSource>, opts?: { silent?: boolean }) => void;
  /** 删除全局数据源 */
  removeDataSource: (id: string) => void;
  /** 读取全部全局数据源 */
  getDataSources: () => import("../types/scene").SceneDataSource[];
  fitCanvasHeightToContent: () => void;

  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  pushHistory: (type: HistoryEntry["type"]) => void;

  copySelected: () => void;
  pasteClipboard: () => void;

  loadScene: (components: SceneComponent[], layers: LayerNode[]) => void;
  loadSceneWithViews: (views: import("../types/scene").SceneView[], globalComponents: SceneComponent[], activeViewId: string) => void;
  exportScene: () => { components: SceneComponent[]; layers: LayerNode[] };
  exportSceneWithViews: () => { views: import("../types/scene").SceneView[]; globalComponents: SceneComponent[]; activeViewId: string };
  /** 生成当前场景所有组件的响应式 @media 查询 CSS */
  getResponsiveCSS: () => string;
  clearScene: () => void;
  setPreviewMode: (preview: boolean) => void;

  addView: (name: string) => string;
  removeView: (viewId: string) => void;
  switchView: (viewId: string) => void;
  renameView: (viewId: string, name: string) => void;
  getActiveView: () => import("../types/scene").SceneView | undefined;
}

const DEFAULT_VIEWPORT: ViewportState = {
  scale: 1,
  offset: { x: 0, y: 0 },
};

function deepClone<T>(obj: T): T {
  return structuredClone(obj);
}

let _configHistoryTimer: ReturnType<typeof setTimeout> | null = null;
let _transformHistoryTimer: ReturnType<typeof setTimeout> | null = null;
const TRANSFORM_HISTORY_DELAY = 400;

export type EditorStore = EditorState & EditorActions;

export const useEditorStore = create<EditorStore>()(
  immer((set, get) => ({
    components: [] as SceneComponent[],
    layers: [] as LayerNode[],
    viewport: { ...DEFAULT_VIEWPORT },
    selection: { selectedIds: [] as string[], hoveredId: null as string | null, isMultiSelect: false },
    activeTool: "select" as EditorTool,
    zoom: 1,
    activeLayerId: null as string | null,
    draggedComponentType: null as string | null,
    canvasConfig: { ...DEFAULT_CANVAS_CONFIG },
    apiConfig: createDefaultApiConfig(),
    dataSources: [],
    containerSize: { width: 0, height: 0 },
    history: [] as HistoryEntry[],
    historyIndex: -1,
    maxHistory: 50,
    clipboard: [] as SceneComponent[],
    eventBindings: [] as EventBinding[],
    previewMode: false,
    views: [{ id: "default", name: "默认视图", components: [], layers: [], canvasConfig: deepClone(DEFAULT_CANVAS_CONFIG), viewport: deepClone(DEFAULT_VIEWPORT), eventBindings: [] }],
    activeViewId: "default",
    globalComponents: [],
    activeBreakpoint: "desktop" as BreakpointId,

    // ─── 属性面板 action 处理器 ───
    actionHandlers: {
      // 保存当前认证配置为自定义预设
      saveAuthPreset: (cfg, onCh) => {
        const name = (cfg.savePresetName as string || "").trim();
        if (!name) {
          alert("请先填写预设名称");
          return;
        }
        // 收集需要保存的认证配置字段
        const fieldsToSave = [
          "authMode", "apiUrl", "method", "mappingTemplate",
          "tokenField", "refreshTokenField", "expiresInField", "userField",
          "tokenStorage", "tokenKey", "tokenHeader", "tokenPrefix",
          "refreshEnabled", "refreshThreshold", "refreshEndpointPath", "refreshEndpointMethod",
          "headerConfigs", "endpoints", "responseMappings",
        ];
        const savedConfig: Record<string, unknown> = {};
        for (const f of fieldsToSave) {
          if (f in cfg) savedConfig[f] = cfg[f];
        }
        try {
          const key = "webcraft_auth_presets";
          const existing = JSON.parse(localStorage.getItem(key) || "{}");
          existing[name] = {
            label: name,
            description: `自定义预设（${new Date().toLocaleDateString()}）`,
            config: savedConfig,
          };
          localStorage.setItem(key, JSON.stringify(existing));
          // 切换到刚保存的预设
          onCh("authPreset", name);
          alert(`预设 "${name}" 已保存，可在下拉中复用`);
        } catch {
          alert("保存失败，localStorage 不可用");
        }
      },
    },

    addComponent: (type, layerId, position, parentId) => {
      const definition = componentRegistry.get(type);
      if (!definition) return null;

      const state = get();
      let targetLayerId: string | undefined = layerId;
      
      if (!targetLayerId) {
        targetLayerId = state.activeLayerId || undefined;
      }

      if (targetLayerId) {
        const targetLayer = state.layers.find(l => l.id === targetLayerId);
        if (targetLayer?.type === "group") {
          const firstChildLayer = state.layers.find(
            l => l.type === "layer" && l.parentId === targetLayerId
          );
          if (firstChildLayer) {
            targetLayerId = firstChildLayer.id;
          } else {
            targetLayerId = state.layers.find(l => l.type === "layer")?.id;
          }
        }
      }
      
      if (!targetLayerId && state.layers.length > 0) {
        targetLayerId = state.layers.find(l => l.type === "layer")?.id;
      }
      
      if (!targetLayerId) return null;

      // If adding to a parent container, inherit the parent's layerId
      if (parentId) {
        const parent = state.components.find(c => c.id === parentId);
        if (parent) {
          targetLayerId = parent.layerId;
        }
      }

      const component = createDefaultSceneComponent(definition, targetLayerId, position, parentId);

      get().pushHistory("add");

      set((draft: EditorState) => {
        const maxZ = draft.components
          .filter((c: SceneComponent) => c.layerId === targetLayerId)
          .reduce((max: number, c: SceneComponent) => Math.max(max, c.zIndex), 0);
        component.zIndex = maxZ + 1;
        draft.components.push(component);
        
        // If has parent, add to parent's children array
        if (parentId) {
          const parentComp = draft.components.find((c: SceneComponent) => c.id === parentId);
          if (parentComp) {
            if (!parentComp.children) parentComp.children = [];
            parentComp.children.push(component.id);
          }
        }

        // 整块拖入：若组件定义了 defaultChildren 预置模板，自动创建子组件挂到其下
        const templates = definition.defaultChildren;
        if (templates && templates.length > 0) {
          const padX = Number(component.config.paddingX ?? 16);
          const padY = Number(component.config.paddingY ?? 12);
          const gap = 10;
          const contentW = Math.max(120, component.transform.width - padX * 2);
          let baseZ = maxZ + 1;
          let cursorY = padY;
          for (const tpl of templates) {
            const childDef = componentRegistry.get(tpl.type);
            if (!childDef) continue;
            baseZ += 1;
            const height = tpl.height ?? childDef.defaultSize.height ?? 56;
            const child = createDefaultSceneComponent(childDef, targetLayerId, { x: padX, y: cursorY }, component.id);
            child.zIndex = baseZ;
            child.transform.width = contentW;
            child.transform.height = height;
            child.config = JSON.parse(JSON.stringify({ ...childDef.defaultConfig, ...tpl.config }));
            draft.components.push(child);
            if (!component.children) component.children = [];
            component.children.push(child.id);
            cursorY += height + gap;
          }
        }
        
        draft.selection.selectedIds = [component.id];
        useDirtyStore.getState().markDirty();
      });

      // 网页模式：添加组件后自动增长画布高度
      setTimeout(() => get().fitCanvasHeightToContent(), 0);

      return component;
    },

    removeComponent: (id) => {
      get().pushHistory("delete");
      set((draft: EditorState) => {
        // Collect all descendant IDs for cascade delete
        const toDelete = new Set<string>([id]);
        const collectChildren = (parentId: string) => {
          for (const comp of draft.components) {
            if (comp.parentId === parentId) {
              toDelete.add(comp.id);
              collectChildren(comp.id);
            }
          }
        };
        collectChildren(id);
        
        // Remove from parent's children array
        const comp = draft.components.find((c: SceneComponent) => c.id === id);
        if (comp?.parentId) {
          const parent = draft.components.find((c: SceneComponent) => c.id === comp.parentId);
          if (parent?.children) {
            parent.children = parent.children.filter((cid: string) => cid !== id);
          }
        }
        
        draft.components = draft.components.filter((c: SceneComponent) => !toDelete.has(c.id));
        draft.selection.selectedIds = draft.selection.selectedIds.filter((sid: string) => !toDelete.has(sid));
        useDirtyStore.getState().markDirty();
      });

      // 网页模式：删除组件后自动收回多余高度（undo 会恢复快照高度，安全）
      setTimeout(() => get().fitCanvasHeightToContent(), 0);
    },

    updateComponent: (id, updates) => {
      get().pushHistory("update");
      set((draft: EditorState) => {
        const idx = draft.components.findIndex((c: SceneComponent) => c.id === id);
        if (idx !== -1) {
          Object.assign(draft.components[idx], updates);
          useDirtyStore.getState().markDirty();
        }
      });
    },

    updateComponentTransform: (id, transform) => {
      const bp = get().activeBreakpoint;
      set((draft: EditorState) => {
        const comp = draft.components.find((c: SceneComponent) => c.id === id);
        if (comp) {
          if (bp === "desktop") {
            Object.assign(comp.transform, transform);
          } else {
            // tablet/mobile：写入 responsiveOverrides，只存覆盖值
            if (!comp.responsiveOverrides) comp.responsiveOverrides = {};
            if (!comp.responsiveOverrides[bp]) comp.responsiveOverrides[bp] = {};
            if (!comp.responsiveOverrides[bp]!.transform) comp.responsiveOverrides[bp]!.transform = {};
            Object.assign(comp.responsiveOverrides[bp]!.transform!, transform);
          }
          useDirtyStore.getState().markDirty();
        }
      });
      // 网页模式：组件移动/缩放后自动增长画布高度
      setTimeout(() => get().fitCanvasHeightToContent(), 0);
      if (_transformHistoryTimer) clearTimeout(_transformHistoryTimer);
      _transformHistoryTimer = setTimeout(() => {
        get().pushHistory("update");
        _transformHistoryTimer = null;
      }, TRANSFORM_HISTORY_DELAY);
    },

    updateComponentConfig: (id, config) => {
      set((draft: EditorState) => {
        const comp = draft.components.find((c: SceneComponent) => c.id === id);
        if (comp) {
          comp.config = { ...comp.config, ...config };
          useDirtyStore.getState().markDirty();
        }
      });
      if (_configHistoryTimer) clearTimeout(_configHistoryTimer);
      _configHistoryTimer = setTimeout(() => {
        get().pushHistory("update");
        _configHistoryTimer = null;
      }, 300);
    },

    batchUpdateComponent: (id, updates) => {
      set((draft: EditorState) => {
        const comp = draft.components.find((c: SceneComponent) => c.id === id);
        if (!comp) return;
        if (updates.config) {
          comp.config = { ...comp.config, ...updates.config };
        }
        if (updates.transform) {
          Object.assign(comp.transform, updates.transform);
        }
        useDirtyStore.getState().markDirty();
      });
      if (_configHistoryTimer) clearTimeout(_configHistoryTimer);
      _configHistoryTimer = setTimeout(() => {
        get().pushHistory("update");
        _configHistoryTimer = null;
      }, 300);
    },

    // 实时数据写入：合并 config，但跳过 pushHistory / markDirty（实时馈送不是用户编辑，
    // 否则 4K 大屏每 tick 都会污染撤销栈、抖动保存状态并触发额外重渲染 → 卡顿）。
    applyRealtimeData: (id, data) => {
      set((draft: EditorState) => {
        const comp = draft.components.find((c: SceneComponent) => c.id === id);
        if (comp) {
          comp.config = { ...comp.config, ...data };
        }
      });
    },

    moveComponentToLayer: (id, layerId) => {
      get().pushHistory("update");
      set((draft: EditorState) => {
        const comp = draft.components.find((c: SceneComponent) => c.id === id);
        if (comp) {
          comp.layerId = layerId;
          useDirtyStore.getState().markDirty();
        }
      });
    },

    reorderComponent: (id, zIndex) => {
      get().pushHistory("update");
      set((draft: EditorState) => {
        const comp = draft.components.find((c: SceneComponent) => c.id === id);
        if (comp) {
          comp.zIndex = zIndex;
          useDirtyStore.getState().markDirty();
        }
      });
    },

    duplicateComponent: (id) => {
      const state = get();
      const comp = state.components.find((c: SceneComponent) => c.id === id);
      if (!comp) return null;

      // Recursively collect component and all descendants
      const collectSubtree = (rootId: string): SceneComponent[] => {
        const result: SceneComponent[] = [];
        const root = state.components.find((c: SceneComponent) => c.id === rootId);
        if (!root) return result;
        result.push(root);
        if (root.children) {
          for (const childId of root.children) {
            result.push(...collectSubtree(childId));
          }
        }
        return result;
      };

      const subtree = collectSubtree(id);
      
      // Create ID mapping: oldId -> newId
      const idMap = new Map<string, string>();
      for (const c of subtree) {
        idMap.set(c.id, `comp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`);
      }

      // Create new components with new IDs, remap parent-child relationships
      const newComps: SceneComponent[] = subtree.map(c => ({
        ...JSON.parse(JSON.stringify(c)),
        id: idMap.get(c.id)!,
        name: c.id === id ? `${c.name} (副本)` : c.name,
        transform: {
          ...c.transform,
          x: c.transform.x + (c.id === id ? 20 : 0),
          y: c.transform.y + (c.id === id ? 20 : 0),
        },
        parentId: c.parentId ? (idMap.get(c.parentId) ?? null) : null,
        children: c.children?.map(cid => idMap.get(cid) ?? cid) ?? [],
      }));

      get().pushHistory("add");

      set((draft: EditorState) => {
        draft.components.push(...newComps);
        draft.selection.selectedIds = [newComps[0].id];
        useDirtyStore.getState().markDirty();
      });

      // 网页模式：复制组件后自动增长画布高度
      setTimeout(() => get().fitCanvasHeightToContent(), 0);

      return newComps[0];
    },

    getComponentsByLayer: (layerId) => {
      const state = get();
      const descendantIds = getLayerDescendants(state.layers, layerId);
      return state.components.filter((c: SceneComponent) => descendantIds.includes(c.layerId));
    },

    getComponent: (id) => {
      return get().components.find((c: SceneComponent) => c.id === id);
    },

    addLayer: (name, parentId = null) => {
      const layer = createDefaultLayer(name, "layer", parentId);
      get().pushHistory("add");
      set((draft: EditorState) => {
        const siblings = parentId
          ? draft.layers.filter((l: LayerNode) => l.parentId === parentId)
          : draft.layers.filter((l: LayerNode) => l.parentId === null);
        layer.order = siblings.length;
        draft.layers.push(layer);
        if (parentId) {
          const parent = draft.layers.find((l: LayerNode) => l.id === parentId);
          if (parent) {
            parent.children.push(layer.id);
          }
        }
        useDirtyStore.getState().markDirty();
      });
      return layer;
    },

    addLayerGroup: (name, parentId = null) => {
      const layer = createDefaultLayer(name, "group", parentId);
      get().pushHistory("add");
      set((draft: EditorState) => {
        const siblings = parentId
          ? draft.layers.filter((l: LayerNode) => l.parentId === parentId)
          : draft.layers.filter((l: LayerNode) => l.parentId === null);
        layer.order = siblings.length;
        draft.layers.push(layer);
        if (parentId) {
          const parent = draft.layers.find((l: LayerNode) => l.id === parentId);
          if (parent) {
            parent.children.push(layer.id);
          }
        }
        useDirtyStore.getState().markDirty();
      });
      return layer;
    },

    removeLayer: (id) => {
      get().pushHistory("delete");
      set((draft: EditorState) => {
        const layer = draft.layers.find((l: LayerNode) => l.id === id);
        if (layer?.isDefault) return;
        
        const descendantIds = getLayerDescendants(draft.layers, id);
        draft.components = draft.components.filter(
          (c: SceneComponent) => !descendantIds.includes(c.layerId)
        );
        const parent = draft.layers.find((l: LayerNode) => l.children.includes(id));
        if (parent) {
          parent.children = parent.children.filter((cid: string) => cid !== id);
        }
        draft.layers = draft.layers.filter(
          (l: LayerNode) => !descendantIds.includes(l.id)
        );
        
        if (draft.activeLayerId === id) {
          const defaultLayer = draft.layers.find((l: LayerNode) => l.isDefault);
          draft.activeLayerId = defaultLayer?.id || null;
        }
        
        useDirtyStore.getState().markDirty();
      });
    },

    updateLayer: (id, updates) => {
      get().pushHistory("update");
      set((draft: EditorState) => {
        const idx = draft.layers.findIndex((l: LayerNode) => l.id === id);
        if (idx !== -1) {
          Object.assign(draft.layers[idx], updates);
          useDirtyStore.getState().markDirty();
        }
      });
    },

    moveLayerToParent: (id, parentId, order) => {
      get().pushHistory("update");
      set((draft: EditorState) => {
        const layer = draft.layers.find((l: LayerNode) => l.id === id);
        if (!layer) return;

        const oldParent = draft.layers.find((l: LayerNode) => l.children.includes(id));
        if (oldParent) {
          oldParent.children = oldParent.children.filter((cid: string) => cid !== id);
        }

        layer.parentId = parentId;
        if (parentId) {
          const newParent = draft.layers.find((l: LayerNode) => l.id === parentId);
          if (newParent) {
            newParent.children.push(id);
            newParent.children.sort((a: string, b: string) => {
              const childA = draft.layers.find((l: LayerNode) => l.id === a);
              const childB = draft.layers.find((l: LayerNode) => l.id === b);
              return (childA?.order ?? 0) - (childB?.order ?? 0);
            });
          }
        }

        if (order !== undefined) {
          layer.order = order;
        } else {
          const siblings = parentId
            ? draft.layers.filter((l: LayerNode) => l.parentId === parentId)
            : draft.layers.filter((l: LayerNode) => l.parentId === null);
          layer.order = siblings.length - 1;
        }

        useDirtyStore.getState().markDirty();
      });
    },

    reorderLayer: (id, order) => {
      get().pushHistory("update");
      set((draft: EditorState) => {
        const layer = draft.layers.find((l: LayerNode) => l.id === id);
        if (layer) {
          layer.order = order;
          useDirtyStore.getState().markDirty();
        }
      });
    },

    toggleLayerVisibility: (id) => {
      get().pushHistory("update");
      set((draft: EditorState) => {
        const layer = draft.layers.find((l: LayerNode) => l.id === id);
        if (layer) {
          const newVisible = !layer.visible;
          layer.visible = newVisible;
          if (layer.type === "group") {
            const descendantIds = getLayerDescendants(draft.layers, id);
            for (const did of descendantIds) {
              if (did === id) continue;
              const child = draft.layers.find((l: LayerNode) => l.id === did);
              if (child) child.visible = newVisible;
            }
          }
          useDirtyStore.getState().markDirty();
        }
      });
    },

    toggleLayerLock: (id) => {
      get().pushHistory("update");
      set((draft: EditorState) => {
        const layer = draft.layers.find((l: LayerNode) => l.id === id);
        if (layer) {
          const newLocked = !layer.locked;
          layer.locked = newLocked;
          if (layer.type === "group") {
            const descendantIds = getLayerDescendants(draft.layers, id);
            for (const did of descendantIds) {
              if (did === id) continue;
              const child = draft.layers.find((l: LayerNode) => l.id === did);
              if (child) child.locked = newLocked;
            }
          }
          useDirtyStore.getState().markDirty();
        }
      });
    },

    toggleLayerExpanded: (id) => {
      set((draft: EditorState) => {
        const layer = draft.layers.find((l: LayerNode) => l.id === id);
        if (layer) {
          layer.expanded = !layer.expanded;
        }
      });
    },

    getLayer: (id) => {
      return get().layers.find((l: LayerNode) => l.id === id);
    },

    getRootLayers: () => {
      return get().layers
        .filter((l: LayerNode) => l.parentId === null)
        .sort((a: LayerNode, b: LayerNode) => a.order - b.order);
    },

    getLayerTree: () => {
      return get().layers;
    },

    addEventBinding: (binding) => {
      get().pushHistory("add");
      set((draft: EditorState) => {
        draft.eventBindings.push(binding);
        useDirtyStore.getState().markDirty();
      });
    },

    removeEventBinding: (id) => {
      get().pushHistory("delete");
      set((draft: EditorState) => {
        draft.eventBindings = draft.eventBindings.filter((b: EventBinding) => b.id !== id);
        useDirtyStore.getState().markDirty();
      });
    },

    updateEventBinding: (id, updates) => {
      get().pushHistory("update");
      set((draft: EditorState) => {
        const idx = draft.eventBindings.findIndex((b: EventBinding) => b.id === id);
        if (idx !== -1) {
          Object.assign(draft.eventBindings[idx], updates);
          useDirtyStore.getState().markDirty();
        }
      });
    },

    selectComponent: (id, multi = false) => {
      set((draft: EditorState) => {
        if (multi) {
          const idx = draft.selection.selectedIds.indexOf(id);
          if (idx !== -1) {
            draft.selection.selectedIds.splice(idx, 1);
          } else {
            draft.selection.selectedIds.push(id);
          }
          draft.selection.isMultiSelect = true;
        } else {
          draft.selection.selectedIds = [id];
          draft.selection.isMultiSelect = false;
        }
      });
    },

    deselectAll: () => {
      set((draft: EditorState) => {
        draft.selection.selectedIds = [];
        draft.selection.isMultiSelect = false;
      });
    },

    selectAll: () => {
      set((draft: EditorState) => {
        draft.selection.selectedIds = draft.components.map((c: SceneComponent) => c.id);
        draft.selection.isMultiSelect = true;
      });
    },

    setHoveredComponent: (id) => {
      logger.debug("EditorStore", "setHoveredComponent", { id });
      set((draft: EditorState) => {
        draft.selection.hoveredId = id;
      });
    },

    getSelectedComponents: () => {
      const state = get();
      return state.components.filter((c: SceneComponent) => state.selection.selectedIds.includes(c.id));
    },

    setContainerSize: (width, height) => {
      set((draft: EditorState) => {
        draft.containerSize = { width, height };
      });
    },

    setZoom: (zoom) => {
      const clamped = clampZoom(zoom);
      set((draft: EditorState) => {
        draft.zoom = clamped;
      });
    },

    zoomIn: () => {
      const current = get().zoom;
      get().setZoom(current + 0.1);
    },

    zoomOut: () => {
      const current = get().zoom;
      get().setZoom(current - 0.1);
    },

    zoomToFit: () => {
      const cs = get().containerSize;
      const cc = get().canvasConfig;
      if (!cs.width || !cs.height) return;
      // 宽度铺满模式：画布宽度跟随浏览器/容器宽度（允许放大到 ≥100%），
      // 高度超出部分靠垂直滚动承载。这是固定画布设计宽的前提下的自适应策略，
      // 解决宽屏下画布 100% 居中两侧留白、不利用多余宽度的问题。
      const scaleX = (cs.width - 64) / cc.width;
      get().setZoom(scaleX);
    },

    resetZoom: () => {
      set((draft: EditorState) => {
        draft.zoom = 1;
      });
    },

    setActiveTool: (tool) => {
      set((draft: EditorState) => {
        draft.activeTool = tool;
      });
    },

    setDraggedComponentType: (type) => {
      set((draft: EditorState) => {
        draft.draggedComponentType = type;
      });
    },

    setActiveLayer: (layerId) => {
      set((draft: EditorState) => {
        draft.activeLayerId = layerId;
      });
    },

    setCanvasConfig: (updates) => {
      get().pushHistory("update");
      set((draft: EditorState) => {
        const merged = { ...DEFAULT_CANVAS_CONFIG, ...draft.canvasConfig, ...updates };
        merged.background = { ...DEFAULT_CANVAS_CONFIG.background, ...draft.canvasConfig.background, ...updates.background };
        if (updates.background?.gradient || draft.canvasConfig.background?.gradient) {
          merged.background.gradient = { ...DEFAULT_CANVAS_CONFIG.background.gradient, ...draft.canvasConfig.background.gradient, ...updates.background?.gradient };
        }
        merged.padding = { ...DEFAULT_CANVAS_CONFIG.padding, ...draft.canvasConfig.padding, ...updates.padding };
        merged.metadata = { ...DEFAULT_CANVAS_CONFIG.metadata, ...draft.canvasConfig.metadata, ...updates.metadata };
        draft.canvasConfig = merged;
        useDirtyStore.getState().markDirty();
      });
    },

    setApiConfig: (updates) => {
      get().pushHistory("update");
      set((draft: EditorState) => {
        const defaults = createDefaultApiConfig();
        draft.apiConfig = {
          ...defaults,
          ...draft.apiConfig,
          ...updates,
          defaultHeaders: {
            ...defaults.defaultHeaders,
            ...draft.apiConfig?.defaultHeaders,
            ...updates.defaultHeaders,
          },
        };
        useDirtyStore.getState().markDirty();
      });
    },

    getDataSources: () => get().dataSources,

    addDataSource: (source) => {
      const base = createDefaultDataSource(source?.name);
      const created = { ...base, ...source, id: source?.id ?? base.id };
      get().pushHistory("update");
      set((draft: EditorState) => {
        draft.dataSources = [...draft.dataSources, created];
        useDirtyStore.getState().markDirty();
      });
      return created;
    },

    updateDataSource: (id, updates, opts) => {
      if (!opts?.silent) get().pushHistory("update");
      set((draft: EditorState) => {
        draft.dataSources = draft.dataSources.map((d) => (d.id === id ? { ...d, ...updates } : d));
        useDirtyStore.getState().markDirty();
      });
    },

    removeDataSource: (id) => {
      get().pushHistory("update");
      set((draft: EditorState) => {
        draft.dataSources = draft.dataSources.filter((d) => d.id !== id);
        useDirtyStore.getState().markDirty();
      });
    },

    /**
     * 根据内容自动适配画布高度（网页模式）。
     * 宽度固定为断点宽度；高度 = max(最小高度, 内容底部)，画布底边始终贴合最底部的内容。
     * 内容恰好贴底时高度不变——满高组件（如侧边栏）稳定贴底，不会触发"追底"。
     */
    fitCanvasHeightToContent: () => {
      const state = get();
      const bpConfig = getBreakpointConfig(state.activeBreakpoint);
      const fixedW = bpConfig.canvasWidth;
      const minH = Math.max(MIN_CANVAS_H, state.canvasConfig.minHeight);
      const contentBottom = Math.round(computeContentBottom(state.components, state.activeBreakpoint));
      const newHeight = Math.min(MAX_CANVAS_H, Math.max(minH, contentBottom));

      if (newHeight === state.canvasConfig.height) return;

      set((draft: EditorState) => {
        draft.canvasConfig.height = newHeight;
        draft.canvasConfig.width = fixedW;
        useDirtyStore.getState().markDirty();
      });
    },

    setActiveBreakpoint: (bp) => {
      set({ activeBreakpoint: bp });
      // 网页模式：宽度 = 断点宽度，高度 = 自动适配内容
      const config = getBreakpointConfig(bp);
      set((draft: EditorState) => {
        draft.canvasConfig.width = config.canvasWidth;
        // 修正超出宽度的组件位置
        for (const comp of draft.components) {
          const compRight = comp.transform.x + (comp.transform.width || 0);
          if (compRight > config.canvasWidth) {
            comp.transform.x = Math.max(0, config.canvasWidth - (comp.transform.width || 0));
          }
        }
        useDirtyStore.getState().markDirty();
      });
      // 高度自动适配
      setTimeout(() => get().fitCanvasHeightToContent(), 0);
    },

    undo: () => {
      const state = get();
      if (state.historyIndex < 0) return;
      const entry = state.history[state.historyIndex];
      if (!entry) return;

      const currentComponents = JSON.parse(JSON.stringify(state.components));
      const currentLayers = JSON.parse(JSON.stringify(state.layers)) as LayerNode[];
      const currentCanvasConfig = JSON.parse(JSON.stringify(state.canvasConfig)) as CanvasConfig;

      set((draft: EditorState) => {
        draft.history[draft.historyIndex].after = currentComponents;
        draft.history[draft.historyIndex].layersAfter = currentLayers;
        draft.history[draft.historyIndex].canvasConfigAfter = currentCanvasConfig;

        draft.components = JSON.parse(JSON.stringify(entry.before));
        if (entry.layersBefore) {
          draft.layers = JSON.parse(JSON.stringify(entry.layersBefore));
        }
        if (entry.canvasConfigBefore) {
          draft.canvasConfig = JSON.parse(JSON.stringify(entry.canvasConfigBefore));
        }
        draft.historyIndex = draft.historyIndex - 1;
        useDirtyStore.getState().markDirty();
        const validIds = new Set(draft.components.map((c: SceneComponent) => c.id));
        draft.selection.selectedIds = draft.selection.selectedIds.filter((id: string) => validIds.has(id));
      });
    },

    redo: () => {
      const state = get();
      const newIndex = state.historyIndex + 1;
      if (newIndex >= state.history.length) return;
      const entry = state.history[newIndex];
      if (!entry) return;
      set((draft: EditorState) => {
        draft.components = JSON.parse(JSON.stringify(entry.after));
        if (entry.layersAfter) {
          draft.layers = JSON.parse(JSON.stringify(entry.layersAfter));
        }
        if (entry.canvasConfigAfter) {
          draft.canvasConfig = JSON.parse(JSON.stringify(entry.canvasConfigAfter));
        }
        draft.historyIndex = newIndex;
        useDirtyStore.getState().markDirty();
        const validIds = new Set(draft.components.map((c: SceneComponent) => c.id));
        draft.selection.selectedIds = draft.selection.selectedIds.filter((id: string) => validIds.has(id));
      });
    },

    canUndo: () => get().historyIndex >= 0,
    canRedo: () => {
      const state = get();
      return state.historyIndex < state.history.length - 1;
    },

    pushHistory: (type) => {
      const state = get();
      const snapshot = structuredClone(state.components);
      const layersSnapshot = structuredClone(state.layers) as LayerNode[];
      const canvasConfigSnapshot = structuredClone(state.canvasConfig) as CanvasConfig;
      const entry: HistoryEntry = {
        id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        timestamp: Date.now(),
        type,
        before: snapshot,
        after: snapshot,
        layersBefore: layersSnapshot,
        layersAfter: layersSnapshot,
        canvasConfigBefore: canvasConfigSnapshot,
        canvasConfigAfter: canvasConfigSnapshot,
      };
      const newIndex = state.historyIndex + 1;
      const truncated = state.history.slice(0, newIndex);
      truncated.push(entry);
      if (truncated.length > state.maxHistory) {
        truncated.shift();
      }
      set((draft: EditorState) => {
        draft.history = truncated;
        draft.historyIndex = draft.history.length - 1;
      });
    },

    copySelected: () => {
      const state = get();
      const selectedIds = state.selection.selectedIds;
      // Collect selected components AND their descendants
      const toCopy = new Set<string>();
      const collectDescendants = (id: string) => {
        toCopy.add(id);
        const comp = state.components.find(c => c.id === id);
        if (comp?.children) {
          for (const childId of comp.children) {
            collectDescendants(childId);
          }
        }
      };
      for (const id of selectedIds) {
        collectDescendants(id);
      }
      const selected = state.components.filter((c: SceneComponent) => toCopy.has(c.id));
      set((draft: EditorState) => {
        draft.clipboard = JSON.parse(JSON.stringify(selected));
      });
    },

    pasteClipboard: () => {
      const state = get();
      if (!state.clipboard || state.clipboard.length === 0) return;

      // Create ID mapping for all pasted components and their descendants
      const idMap = new Map<string, string>();
      for (const c of state.clipboard) {
        idMap.set(c.id, `comp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`);
      }

      const newComps: SceneComponent[] = state.clipboard.map((c: SceneComponent) => ({
        ...JSON.parse(JSON.stringify(c)),
        id: idMap.get(c.id)!,
        name: `${c.name} (副本)`,
        transform: {
          ...c.transform,
          x: c.transform.x + 20,
          y: c.transform.y + 20,
        },
        parentId: c.parentId ? (idMap.get(c.parentId) ?? null) : null,
        children: c.children?.map(cid => idMap.get(cid) ?? cid) ?? [],
      }));

      // Also remap parent references for components whose parent was in the clipboard
      for (const nc of newComps) {
        if (nc.parentId && !idMap.has(nc.parentId)) {
          // Parent was not in clipboard, set to null (paste at root level)
          nc.parentId = null;
        }
      }

      get().pushHistory("add");

      set((draft: EditorState) => {
        draft.components.push(...newComps);
        draft.selection.selectedIds = newComps.map(c => c.id);
        useDirtyStore.getState().markDirty();
      });
    },

    loadScene: (components, layers) => {
      logger.warn("EditorStore", "loadScene called, clearing selection", { componentCount: components.length });
      set((draft: EditorState) => {
        const layerIds = new Set(layers.map((l) => l.id));
        const validComponents = components.filter((c) => layerIds.has(c.layerId));
        draft.components = validComponents;
        draft.layers = layers;
        draft.selection = { selectedIds: [], hoveredId: null, isMultiSelect: false };
        draft.history = [];
        draft.historyIndex = -1;
        useDirtyStore.getState().markClean();
        draft.eventBindings = [];
        draft.canvasConfig = deepClone(DEFAULT_CANVAS_CONFIG);
        draft.viewport = deepClone(DEFAULT_VIEWPORT);
        draft.views = [{ id: "default", name: "默认视图", components: validComponents, layers, canvasConfig: deepClone(DEFAULT_CANVAS_CONFIG), viewport: deepClone(DEFAULT_VIEWPORT), eventBindings: [] }];
        draft.activeViewId = "default";
        draft.globalComponents = [];

        const defaultLayer = layers.find(l => l.isDefault);
        if (defaultLayer) {
          draft.activeLayerId = defaultLayer.id;
        } else if (layers.length > 0) {
          draft.activeLayerId = layers[0].id;
        } else {
          draft.activeLayerId = null;
        }
      });
      // 网页模式：加载场景后自动适配画布高度
      setTimeout(() => get().fitCanvasHeightToContent(), 0);
    },

    exportScene: () => {
      const state = get();
      return {
        components: JSON.parse(JSON.stringify(state.components)),
        layers: JSON.parse(JSON.stringify(state.layers)),
      };
    },

    clearScene: () => {
      logger.warn("EditorStore", "clearScene called, clearing selection");
      set((draft: EditorState) => {
        const defaultLayer = createDefaultLayer("默认图层", "layer", null, true);
        draft.components = [];
        draft.layers = [defaultLayer];
        draft.selection = { selectedIds: [], hoveredId: null, isMultiSelect: false };
        draft.activeLayerId = defaultLayer.id;
        useDirtyStore.getState().markClean();
        draft.eventBindings = [];
        draft.canvasConfig = deepClone(DEFAULT_CANVAS_CONFIG);
        draft.viewport = deepClone(DEFAULT_VIEWPORT);
        draft.previewMode = false;
        draft.views = [{ id: "default", name: "默认视图", components: [], layers: [defaultLayer], canvasConfig: deepClone(DEFAULT_CANVAS_CONFIG), viewport: deepClone(DEFAULT_VIEWPORT), eventBindings: [] }];
        draft.activeViewId = "default";
        draft.globalComponents = [];
      });
    },

    setPreviewMode: (preview) => {
      if (preview) logger.warn("EditorStore", "setPreviewMode(true) called, clearing selection");
      set((draft: EditorState) => {
        draft.previewMode = preview;
        if (preview) {
          draft.selection = { selectedIds: [], hoveredId: null, isMultiSelect: false };
        }
      });
    },

    loadSceneWithViews: (views, globalComponents, activeViewId) => {
      logger.info("EditorStore", "loadSceneWithViews called", {
        viewsCount: views.length,
        globalComponentsCount: globalComponents.length,
        activeViewId,
      });
      set((draft: EditorState) => {
        draft.views = views;
        draft.globalComponents = globalComponents;
        draft.activeViewId = activeViewId;
        const activeView = views.find((v) => v.id === activeViewId) || views[0];
        if (activeView) {
          draft.components = activeView.components;
          draft.layers = activeView.layers;
          draft.canvasConfig = activeView.canvasConfig ? normalizeCanvasConfig(activeView.canvasConfig) : { ...DEFAULT_CANVAS_CONFIG };
          draft.viewport = activeView.viewport ? deepClone(activeView.viewport) : { ...DEFAULT_VIEWPORT };
          draft.eventBindings = activeView.eventBindings ? deepClone(activeView.eventBindings) : [];
          // 🔍 DIAGNOSTIC: 输出每个组件的类型信息
          logger.info("EditorStore", "Active view components loaded", {
            viewId: activeView.id,
            viewName: activeView.name,
            componentsCount: activeView.components.length,
            componentTypes: activeView.components.map((c) => ({ id: c.id, type: c.type, name: c.name })),
          });
        } else {
          draft.components = [];
          draft.layers = [];
          draft.canvasConfig = deepClone(DEFAULT_CANVAS_CONFIG);
          draft.viewport = deepClone(DEFAULT_VIEWPORT);
          draft.eventBindings = [];
        }
        draft.selection = { selectedIds: [], hoveredId: null, isMultiSelect: false };
        draft.history = [];
        draft.historyIndex = -1;
        useDirtyStore.getState().markClean();
        const defaultLayer = draft.layers.find((l) => l.isDefault);
        draft.activeLayerId = defaultLayer?.id || (draft.layers.length > 0 ? draft.layers[0].id : null);
      });
    },

    exportSceneWithViews: () => {
      const state = get();
      const views = state.views.map((v) => {
        if (v.id === state.activeViewId) {
          return {
            ...v,
            components: deepClone(state.components),
            layers: deepClone(state.layers),
            canvasConfig: deepClone(state.canvasConfig),
            viewport: deepClone(state.viewport),
            eventBindings: deepClone(state.eventBindings),
          };
        }
        return {
          ...v,
          components: v.components ? deepClone(v.components) : [],
          layers: v.layers ? deepClone(v.layers) : [],
          canvasConfig: v.canvasConfig ? deepClone(v.canvasConfig) : undefined,
          viewport: v.viewport ? deepClone(v.viewport) : undefined,
          eventBindings: v.eventBindings ? deepClone(v.eventBindings) : [],
        };
      });
      return {
        views,
        globalComponents: deepClone(state.globalComponents),
        activeViewId: state.activeViewId,
      };
    },

    getResponsiveCSS: () => {
      return generateResponsiveCSS(get().components);
    },

    addView: (name) => {
      set((draft: EditorState) => {
        const currentView = draft.views.find((v) => v.id === draft.activeViewId);
        if (currentView) {
          currentView.components = draft.components;
          currentView.layers = draft.layers;
          currentView.canvasConfig = draft.canvasConfig;
          currentView.viewport = draft.viewport;
          currentView.eventBindings = draft.eventBindings;
        }
        const viewId = `view-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        const defaultLayer = createDefaultLayer("默认图层", "layer", null, true);
        const newCanvasConfig = draft.canvasConfig;
        const newViewport = draft.viewport;
        draft.views.push({ id: viewId, name, components: [], layers: [defaultLayer], canvasConfig: newCanvasConfig, viewport: newViewport, eventBindings: [] });
        draft.activeViewId = viewId;
        draft.components = [];
        draft.layers = [defaultLayer];
        draft.canvasConfig = newCanvasConfig;
        draft.viewport = newViewport;
        draft.eventBindings = [];
        draft.selection = { selectedIds: [], hoveredId: null, isMultiSelect: false };
        draft.history = [];
        draft.historyIndex = -1;
        draft.activeLayerId = defaultLayer.id;
        useDirtyStore.getState().markDirty();
      });
      return get().activeViewId;
    },

    removeView: (viewId) => {
      set((draft: EditorState) => {
        if (draft.views.length <= 1) return;
        const idx = draft.views.findIndex((v) => v.id === viewId);
        if (idx === -1) return;
        if (draft.activeViewId === viewId) {
          draft.views.splice(idx, 1);
          const nextView = draft.views[Math.min(idx, draft.views.length - 1)];
          draft.activeViewId = nextView.id;
          draft.components = nextView.components || [];
          draft.layers = nextView.layers || [];
            draft.canvasConfig = nextView.canvasConfig ? normalizeCanvasConfig(nextView.canvasConfig) : { ...DEFAULT_CANVAS_CONFIG };
          draft.viewport = nextView.viewport ? { ...nextView.viewport, offset: { ...nextView.viewport.offset } } : { ...DEFAULT_VIEWPORT };
          draft.eventBindings = nextView.eventBindings ? [...nextView.eventBindings] : [];
          draft.selection = { selectedIds: [], hoveredId: null, isMultiSelect: false };
          const defaultLayer = draft.layers.find((l) => l.isDefault);
          draft.activeLayerId = defaultLayer?.id || (draft.layers.length > 0 ? draft.layers[0].id : null);
        } else {
          const activeView = draft.views.find((v) => v.id === draft.activeViewId);
          if (activeView) {
            activeView.components = draft.components;
            activeView.layers = draft.layers;
            activeView.canvasConfig = draft.canvasConfig;
            activeView.viewport = draft.viewport;
            activeView.eventBindings = draft.eventBindings;
          }
          draft.views.splice(idx, 1);
        }
        useDirtyStore.getState().markDirty();
      });
    },

    switchView: (viewId) => {
      const prevViewId = get().activeViewId;
      set((draft: EditorState) => {
        const currentView = draft.views.find((v) => v.id === draft.activeViewId);
        if (currentView) {
          currentView.components = draft.components;
          currentView.layers = draft.layers;
          currentView.canvasConfig = { ...draft.canvasConfig };
        }
        const targetView = draft.views.find((v) => v.id === viewId);
        if (!targetView) return;
        draft.activeViewId = viewId;
        draft.components = targetView.components || [];
        draft.layers = targetView.layers || [];
        if (targetView.canvasConfig) {
          draft.canvasConfig = { ...targetView.canvasConfig };
        }
        draft.selection = { selectedIds: [], hoveredId: null, isMultiSelect: false };
        draft.history = [];
        draft.historyIndex = -1;
        const defaultLayer = draft.layers.find((l) => l.isDefault);
        draft.activeLayerId = defaultLayer?.id || (draft.layers.length > 0 ? draft.layers[0].id : null);
      });
      logger.info("EditorStore", "switchView", {
        from: prevViewId,
        to: viewId,
        newViewport: get().viewport,
        newCanvasConfig: { width: get().canvasConfig.width, height: get().canvasConfig.height },
        componentCount: get().components.length,
      });
    },

    renameView: (viewId, name) => {
      set((draft: EditorState) => {
        const view = draft.views.find((v) => v.id === viewId);
        if (view) {
          view.name = name;
          useDirtyStore.getState().markDirty();
        }
      });
    },

    getActiveView: () => {
      const state = get();
      return state.views.find((v) => v.id === state.activeViewId);
    },
  }))
);

// 开发模式暴露到 window，方便 Console 调试
if (typeof window !== "undefined") {
  (window as any).__editorStore = useEditorStore;
}
