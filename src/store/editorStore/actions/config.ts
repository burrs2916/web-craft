import type { EditorState, EditorActions } from "../types";
import type { EditorSet, EditorGet } from "../shared";
import { useDirtyStore } from "../dirtyStore";
import { MIN_CANVAS_H, MAX_CANVAS_H } from "../../../editor/utils/canvasConstants";
import { computeContentBottom } from "../../../editor/utils/contentBounds";
import { createDefaultApiConfig, createDefaultDataSource } from "../../../types/scene";
import { getBreakpointConfig } from "../../../types/editor";
import { DEFAULT_CANVAS_CONFIG } from "../../../types/canvasConfig";

export function createConfigActions(set: EditorSet, get: EditorGet): Pick<EditorActions, "setCanvasConfig" | "setApiConfig" | "getDataSources" | "addDataSource" | "updateDataSource" | "removeDataSource" | "fitCanvasHeightToContent" | "setActiveBreakpoint"> {
  return {
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
  };
}
