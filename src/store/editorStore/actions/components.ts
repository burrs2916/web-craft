import type { EditorState, EditorActions } from "../types";
import type { EditorSet, EditorGet } from "../shared";
import { useDirtyStore } from "../dirtyStore";
import { componentRegistry } from "../../../editor/registry";
import { createDefaultSceneComponent, getLayerDescendants } from "../../../types/editor";
import type { SceneComponent } from "../../../types/editor";

let _configHistoryTimer: ReturnType<typeof setTimeout> | null = null;
let _transformHistoryTimer: ReturnType<typeof setTimeout> | null = null;
const TRANSFORM_HISTORY_DELAY = 400;

export function createComponentActions(set: EditorSet, get: EditorGet): Pick<EditorActions, "addComponent" | "removeComponent" | "updateComponent" | "updateComponentTransform" | "updateComponentConfig" | "batchUpdateComponent" | "applyRealtimeData" | "moveComponentToLayer" | "reorderComponent" | "duplicateComponent" | "getComponentsByLayer" | "getComponent"> {
  return {
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
  };
}
