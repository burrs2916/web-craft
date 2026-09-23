import { useEffect, useRef } from "react";
import { useLayerRegistry, useViewportSyncService } from "../context/SceneEditorContext";
import { useEditorStore, type EditorState } from "../../store/editorStore";
import { ComponentLayerAdapter, type ComponentLayerState } from "../layers/ComponentLayerAdapter";
import type { LayerNode } from "../../types/editor";

export function useEditorLayerSync() {
  const layerRegistry = useLayerRegistry();
  const viewportSyncService = useViewportSyncService();
  const registeredRef = useRef<Map<string, ComponentLayerAdapter>>(new Map());

  useEffect(() => {
    if (!layerRegistry) return;

    const unsub = useEditorStore.subscribe((state: EditorState, prevState: EditorState) => {
      if (state.layers === prevState.layers) return;

      syncLayers(state.layers, layerRegistry, viewportSyncService, registeredRef.current);
    });

    syncLayers(useEditorStore.getState().layers, layerRegistry, viewportSyncService, registeredRef.current);

    return () => {
      unsub();
      for (const [id] of registeredRef.current) {
        if (viewportSyncService) {
          viewportSyncService.unregisterProvider(id);
        }
        layerRegistry.unregister(id);
      }
      registeredRef.current.clear();
    };
  }, [layerRegistry, viewportSyncService]);
}

function syncLayers(
  layers: LayerNode[],
  registry: import("../layers/SpatialLayerRegistry").SpatialLayerRegistry,
  viewportSyncService: import("../spatial/ViewportSyncService").ViewportSyncService | null,
  registered: Map<string, ComponentLayerAdapter>
) {
  const currentIds = new Set(layers.filter(l => l.type === "layer").map(l => l.id));

  for (const [id] of registered) {
    if (!currentIds.has(id)) {
      if (viewportSyncService) {
        viewportSyncService.unregisterProvider(id);
      }
      registry.unregister(id);
      registered.delete(id);
    }
  }

  for (const layerNode of layers) {
    if (layerNode.type !== "layer") continue;

    const existing = registered.get(layerNode.id);
    if (existing) {
      existing.visible = layerNode.visible;
      existing.locked = layerNode.locked;
      existing.zIndex = layerNode.order;
    } else {
      const layerState: ComponentLayerState = {
        componentId: layerNode.id,
        componentType: "layer-group",
        config: { name: layerNode.name },
        data: null,
      };

      const adapter = new ComponentLayerAdapter(layerNode.id, layerNode.name, layerState, {
        type: "overlay",
        zIndex: layerNode.order,
        visible: layerNode.visible,
        locked: layerNode.locked,
      });

      registry.register(adapter);
      registered.set(layerNode.id, adapter);
    }
  }
}
