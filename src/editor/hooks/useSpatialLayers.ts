import { useState, useEffect, useCallback } from "react";
import { useLayerRegistry } from "../context/SceneEditorContext";
import type { SpatialLayer } from "../layers/SpatialLayer";

export function useSpatialLayers() {
  const layerRegistry = useLayerRegistry();
  const [layers, setLayers] = useState<SpatialLayer[]>([]);

  const refresh = useCallback(() => {
    if (!layerRegistry) {
      setLayers([]);
      return;
    }
    setLayers(layerRegistry.getAll());
  }, [layerRegistry]);

  useEffect(() => {
    if (!layerRegistry) return;

    refresh();

    const unsub = layerRegistry.onGlobalLayerEvent(() => {
      refresh();
    });

    return unsub;
  }, [layerRegistry, refresh]);

  return { layers, refresh };
}
