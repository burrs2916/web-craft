import type { EditorState, EditorActions } from "../types";
import type { EditorSet, EditorGet } from "../shared";
import logger from "../../../utils/logger";
import type { SceneComponent } from "../../../types/editor";

export function createSelectionActions(set: EditorSet, get: EditorGet): Pick<EditorActions, "selectComponent" | "deselectAll" | "selectAll" | "setHoveredComponent" | "getSelectedComponents"> {
  return {
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
  };
}
