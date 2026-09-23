import { useEffect, useRef } from "react";
import { openComponentPreviewWindow } from "../../utils/previewWindow";
import type { ComponentPluginItem } from "../../types/component";

interface PreviewWindowProps {
  plugin: ComponentPluginItem;
  definition: any;
  onClose: () => void;
}

export function PreviewWindow({ plugin, definition, onClose }: PreviewWindowProps) {
  const defaultConfig = definition?.defaultConfig ?? {};
  const openedRef = useRef(false);

  useEffect(() => {
    if (openedRef.current) return;
    openedRef.current = true;

    console.log("[PreviewWindow] Opening component preview window for:", plugin?.type);

    openComponentPreviewWindow({
      pluginType: plugin.type,
      pluginName: plugin.name,
      pluginDescription: plugin.description ?? "",
      pluginIcon: plugin.iconOverride ?? "",
      defaultConfig,
      defaultSize: null,
    }).then(() => {
      console.log("[PreviewWindow] Window opened, closing current dialog");
      onClose();
    }).catch((err) => {
      console.error("[PreviewWindow] Failed to open window:", err);
      onClose();
    });
  }, [plugin.type, plugin.name, defaultConfig, onClose]);

  return null;
}
