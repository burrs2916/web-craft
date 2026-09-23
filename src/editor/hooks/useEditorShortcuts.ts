import { useEffect } from "react";
import { useEditorStore } from "../../store/editorStore";
import logger from "../../utils/logger";

export function useEditorShortcuts() {
  const removeComponent = useEditorStore((s) => s.removeComponent);
  const duplicateComponent = useEditorStore((s) => s.duplicateComponent);
  const copySelected = useEditorStore((s) => s.copySelected);
  const pasteClipboard = useEditorStore((s) => s.pasteClipboard);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const selectAll = useEditorStore((s) => s.selectAll);
  const deselectAll = useEditorStore((s) => s.deselectAll);
  const selection = useEditorStore((s) => s.selection);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isEditable = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
      const isMuiControl = !!target.closest('[role="slider"], [role="switch"], [role="button"], [role="tab"], [role="combobox"], [role="listbox"], .MuiSlider-thumb, .MuiSwitch-root, .MuiButtonBase-root');
      if (isEditable || isMuiControl) {
        return;
      }

      const isMod = e.metaKey || e.ctrlKey;

      if (e.key === "Delete" || e.key === "Backspace") {
        logger.warn("Shortcuts", "Delete/Backspace key pressed", { tagName: target.tagName, isEditable, isMuiControl });
        e.preventDefault();
        selection.selectedIds.forEach((id) => removeComponent(id));
        return;
      }

      if (isMod && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }

      if (isMod && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
        return;
      }

      if (isMod && e.key === "c") {
        e.preventDefault();
        copySelected();
        return;
      }

      if (isMod && e.key === "v") {
        e.preventDefault();
        pasteClipboard();
        return;
      }

      if (isMod && e.key === "d") {
        e.preventDefault();
        selection.selectedIds.forEach((id) => duplicateComponent(id));
        return;
      }

      if (isMod && e.key === "a") {
        e.preventDefault();
        selectAll();
        return;
      }

      if (e.key === "Escape") {
        logger.warn("Shortcuts", "Escape key pressed, calling deselectAll");
        deselectAll();
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selection.selectedIds, removeComponent, duplicateComponent, copySelected, pasteClipboard, undo, redo, selectAll, deselectAll]);
}
