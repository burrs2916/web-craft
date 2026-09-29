import type { EditorState, EditorActions } from "../types";
import type { EditorSet, EditorGet } from "../shared";
import { useDirtyStore } from "../dirtyStore";
import type { SceneComponent, LayerNode, HistoryEntry } from "../../../types/editor";
import type { CanvasConfig } from "../../../types/canvasConfig";

export function createHistoryActions(set: EditorSet, get: EditorGet): Pick<EditorActions, "undo" | "redo" | "canUndo" | "canRedo" | "pushHistory"> {
  return {
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
  };
}
