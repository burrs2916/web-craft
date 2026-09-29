import type { EditorState, EditorActions } from "../types";
import type { EditorSet, EditorGet } from "../shared";
import { clampZoom } from "../../../editor/utils/canvasConstants";

export function createViewportActions(set: EditorSet, get: EditorGet): Pick<EditorActions, "setContainerSize" | "setZoom" | "zoomIn" | "zoomOut" | "zoomToFit" | "resetZoom" | "setActiveTool" | "setDraggedComponentType" | "setActiveLayer"> {
  return {
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
  };
}
