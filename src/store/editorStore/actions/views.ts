import type { EditorState, EditorActions } from "../types";
import type { EditorSet, EditorGet } from "../shared";
import { DEFAULT_VIEWPORT } from "../shared";
import { useDirtyStore } from "../dirtyStore";
import { createDefaultLayer } from "../../../types/editor";
import { DEFAULT_CANVAS_CONFIG, normalizeCanvasConfig } from "../../../types/canvasConfig";
import logger from "../../../utils/logger";

export function createViewActions(set: EditorSet, get: EditorGet): Pick<EditorActions, "addView" | "removeView" | "switchView" | "renameView" | "getActiveView"> {
  return {
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
  };
}
