import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import type { EditorStore } from "./types";
import { createInitialState } from "./initialState";
import { createComponentActions } from "./actions/components";
import { createLayerActions } from "./actions/layers";
import { createEventBindingActions } from "./actions/eventBindings";
import { createSelectionActions } from "./actions/selection";
import { createViewportActions } from "./actions/viewport";
import { createConfigActions } from "./actions/config";
import { createHistoryActions } from "./actions/history";
import { createClipboardActions } from "./actions/clipboard";
import { createSceneActions } from "./actions/scene";
import { createViewActions } from "./actions/views";

// re-export for backward compatibility
export type { CanvasPadding, CanvasMetadata, CanvasConfig } from "../../types/canvasConfig";
export { DEFAULT_CANVAS_CONFIG, normalizeCanvasConfig } from "../../types/canvasConfig";
export type { DirtyState, EditorTool, EditorState, EditorActions, EditorStore } from "./types";
export { useDirtyStore } from "./dirtyStore";

export const useEditorStore = create<EditorStore>()(
  immer((set, get) => ({
    ...createInitialState(),

    ...createComponentActions(set, get),
    ...createLayerActions(set, get),
    ...createEventBindingActions(set, get),
    ...createSelectionActions(set, get),
    ...createViewportActions(set, get),
    ...createConfigActions(set, get),
    ...createHistoryActions(set, get),
    ...createClipboardActions(set, get),
    ...createSceneActions(set, get),
    ...createViewActions(set, get),
  }))
);

// 开发模式暴露到 window，方便 Console 调试
if (typeof window !== "undefined") {
  (window as any).__editorStore = useEditorStore;
}