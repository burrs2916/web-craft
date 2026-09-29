import type { EditorState, EditorActions } from "../types";
import type { EditorSet, EditorGet } from "../shared";
import { deepClone, DEFAULT_VIEWPORT } from "../shared";
import { useDirtyStore } from "../dirtyStore";
import { generateResponsiveCSS } from "../../../editor/utils/responsiveCSS";
import { createDefaultLayer } from "../../../types/editor";
import { DEFAULT_CANVAS_CONFIG, normalizeCanvasConfig } from "../../../types/canvasConfig";
import logger from "../../../utils/logger";

export function createSceneActions(set: EditorSet, get: EditorGet): Pick<EditorActions, "loadScene" | "exportScene" | "clearScene" | "setPreviewMode" | "loadSceneWithViews" | "exportSceneWithViews" | "getResponsiveCSS"> {
  return {
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
  };
}
