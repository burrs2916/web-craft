import type { EditorState, EditorActions } from "../types";
import type { EditorSet, EditorGet } from "../shared";
import { useDirtyStore } from "../dirtyStore";
import type { EventBinding } from "../../../types/editor";

export function createEventBindingActions(set: EditorSet, get: EditorGet): Pick<EditorActions, "addEventBinding" | "removeEventBinding" | "updateEventBinding"> {
  return {
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
  };
}
