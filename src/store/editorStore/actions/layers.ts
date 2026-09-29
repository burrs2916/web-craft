import type { EditorState, EditorActions } from "../types";
import type { EditorSet, EditorGet } from "../shared";
import { useDirtyStore } from "../dirtyStore";
import { createDefaultLayer, getLayerDescendants } from "../../../types/editor";
import type { SceneComponent, LayerNode } from "../../../types/editor";

export function createLayerActions(set: EditorSet, get: EditorGet): Pick<EditorActions, "addLayer" | "addLayerGroup" | "removeLayer" | "updateLayer" | "moveLayerToParent" | "reorderLayer" | "toggleLayerVisibility" | "toggleLayerLock" | "toggleLayerExpanded" | "getLayer" | "getRootLayers" | "getLayerTree"> {
  return {
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
  };
}
