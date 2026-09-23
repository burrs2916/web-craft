import { useEffect, useRef } from "react";
import { useLayerRegistry, useViewportSyncService } from "../context/SceneEditorContext";
import { useEditorStore, type EditorState } from "../../store/editorStore";
import { ComponentLayerAdapter, type ComponentLayerState } from "../layers/ComponentLayerAdapter";
import { componentRegistry } from "../registry";

const SPATIAL_COMPONENT_PREFIXES = ['map-', 'globe-', 'cad-', '3d-'];

function resolveLayerType(componentType: string): 'spatial' | 'overlay' | 'widget' {
  const definition = componentRegistry.get(componentType);
  if (definition?.layerType) return definition.layerType;
  if (SPATIAL_COMPONENT_PREFIXES.some(prefix => componentType.startsWith(prefix))) return 'spatial';
  return 'overlay';
}

interface ComponentFingerprint {
  id: string;
  type: string;
  visible: boolean;
  zIndex: number;
  locked: boolean;
  configHash: string;
}

function computeFingerprints(components: EditorState["components"]): ComponentFingerprint[] {
  return components.map((c) => ({
    id: c.id,
    type: c.type,
    visible: c.visible,
    zIndex: c.zIndex,
    locked: c.locked,
    configHash: "",
  }));
}

function fingerprintsEqual(a: ComponentFingerprint[], b: ComponentFingerprint[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const fa = a[i];
    const fb = b[i];
    if (fa.id !== fb.id || fa.type !== fb.type || fa.visible !== fb.visible || fa.zIndex !== fb.zIndex || fa.locked !== fb.locked) {
      return false;
    }
  }
  return true;
}

export function useComponentLayerSync() {
  const layerRegistry = useLayerRegistry();
  const viewportSyncService = useViewportSyncService();
  const registeredRef = useRef<Map<string, ComponentLayerAdapter>>(new Map());
  const prevFingerprintsRef = useRef<ComponentFingerprint[]>([]);

  useEffect(() => {
    if (!layerRegistry) return;

    const unsub = useEditorStore.subscribe((state: EditorState, prevState: EditorState) => {
      if (state.components === prevState.components) return;

      const newFingerprints = computeFingerprints(state.components);
      const oldFingerprints = prevFingerprintsRef.current;

      if (fingerprintsEqual(newFingerprints, oldFingerprints)) {
        prevFingerprintsRef.current = newFingerprints;
        return;
      }
      prevFingerprintsRef.current = newFingerprints;

      const registered = registeredRef.current;
      const components = state.components;
      const currentIds = new Set(components.map((c) => c.id));

      for (const [id] of registered) {
        if (!currentIds.has(id)) {
          if (viewportSyncService) {
            viewportSyncService.unregisterProvider(id);
          }
          layerRegistry.unregister(id);
          registered.delete(id);
        }
      }

      for (const comp of components) {
        const existing = registered.get(comp.id);
        if (existing) {
          existing.updateConfig(comp.config as Record<string, unknown>);
          existing.visible = comp.visible;
          existing.zIndex = comp.zIndex;
        } else {
          const layerState: ComponentLayerState = {
            componentId: comp.id,
            componentType: comp.type,
            config: comp.config as Record<string, unknown>,
            data: comp.config?.data,
          };

          const adapter = new ComponentLayerAdapter(comp.id, comp.name || comp.type, layerState, {
            type: resolveLayerType(comp.type),
            zIndex: comp.zIndex,
            visible: comp.visible,
            locked: comp.locked,
          });

          adapter.setViewportSyncService(viewportSyncService);
          layerRegistry.register(adapter);
          registered.set(comp.id, adapter);
        }
      }
    });

    const components = useEditorStore.getState().components;
    const registered = registeredRef.current;

    for (const comp of components) {
      if (!registered.has(comp.id)) {
        const layerState: ComponentLayerState = {
          componentId: comp.id,
          componentType: comp.type,
          config: comp.config as Record<string, unknown>,
          data: comp.config?.data,
        };

        const adapter = new ComponentLayerAdapter(comp.id, comp.name || comp.type, layerState, {
          type: resolveLayerType(comp.type),
          zIndex: comp.zIndex,
          visible: comp.visible,
          locked: comp.locked,
        });

        adapter.setViewportSyncService(viewportSyncService);
        layerRegistry.register(adapter);
        registered.set(comp.id, adapter);
      }
    }
    prevFingerprintsRef.current = computeFingerprints(components);

    return () => {
      unsub();
      for (const [id] of registered) {
        if (viewportSyncService) {
          viewportSyncService.unregisterProvider(id);
        }
        layerRegistry.unregister(id);
      }
      registered.clear();
    };
  }, [layerRegistry, viewportSyncService]);
}
