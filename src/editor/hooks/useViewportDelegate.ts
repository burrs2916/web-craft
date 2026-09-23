import { useCallback } from "react";
import { useLayerRegistry, useViewportSyncService } from "../context/SceneEditorContext";
import type { ViewportDelegate } from "../layers/ComponentLayerAdapter";

export function useViewportDelegate(componentId: string): (delegate: ViewportDelegate | null) => void {
  const layerRegistry = useLayerRegistry();
  const viewportSyncService = useViewportSyncService();

  return useCallback((delegate: ViewportDelegate | null) => {
    if (!layerRegistry) return;

    const layer = layerRegistry.get(componentId);
    if (!layer) return;

    const adapter = layer as unknown as import("../layers/ComponentLayerAdapter").ComponentLayerAdapter;
    if (typeof adapter.setViewportDelegate === 'function') {
      if (delegate) {
        adapter.setViewportSyncService(viewportSyncService);
        adapter.setViewportDelegate(delegate);
      } else {
        adapter.removeViewportDelegate();
      }
    }
  }, [layerRegistry, viewportSyncService, componentId]);
}
