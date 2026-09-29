import type { EditorState, EditorActions } from "../types";
import type { EditorSet, EditorGet } from "../shared";
import { useDirtyStore } from "../dirtyStore";
import type { SceneComponent } from "../../../types/editor";

export function createClipboardActions(set: EditorSet, get: EditorGet): Pick<EditorActions, "copySelected" | "pasteClipboard"> {
  return {
  copySelected: () => {
    const state = get();
    const selectedIds = state.selection.selectedIds;
    // Collect selected components AND their descendants
    const toCopy = new Set<string>();
    const collectDescendants = (id: string) => {
      toCopy.add(id);
      const comp = state.components.find(c => c.id === id);
      if (comp?.children) {
        for (const childId of comp.children) {
          collectDescendants(childId);
        }
      }
    };
    for (const id of selectedIds) {
      collectDescendants(id);
    }
    const selected = state.components.filter((c: SceneComponent) => toCopy.has(c.id));
    set((draft: EditorState) => {
      draft.clipboard = JSON.parse(JSON.stringify(selected));
    });
  },

  pasteClipboard: () => {
    const state = get();
    if (!state.clipboard || state.clipboard.length === 0) return;

    // Create ID mapping for all pasted components and their descendants
    const idMap = new Map<string, string>();
    for (const c of state.clipboard) {
      idMap.set(c.id, `comp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`);
    }

    const newComps: SceneComponent[] = state.clipboard.map((c: SceneComponent) => ({
      ...JSON.parse(JSON.stringify(c)),
      id: idMap.get(c.id)!,
      name: `${c.name} (副本)`,
      transform: {
        ...c.transform,
        x: c.transform.x + 20,
        y: c.transform.y + 20,
      },
      parentId: c.parentId ? (idMap.get(c.parentId) ?? null) : null,
      children: c.children?.map(cid => idMap.get(cid) ?? cid) ?? [],
    }));

    // Also remap parent references for components whose parent was in the clipboard
    for (const nc of newComps) {
      if (nc.parentId && !idMap.has(nc.parentId)) {
        // Parent was not in clipboard, set to null (paste at root level)
        nc.parentId = null;
      }
    }

    get().pushHistory("add");

    set((draft: EditorState) => {
      draft.components.push(...newComps);
      draft.selection.selectedIds = newComps.map(c => c.id);
      useDirtyStore.getState().markDirty();
    });
  },
  };
}
