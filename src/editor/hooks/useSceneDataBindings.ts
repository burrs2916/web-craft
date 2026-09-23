import { useEffect, useRef } from "react";
import { useDataOrchestrator } from "../context/SceneEditorContext";
import { useSceneStore } from "../../store/sceneStore";
import { useDataSourceStore } from "../../store/datasourceStore";
import type { SceneBinding } from "../../types/scene";

function enrichBindingWithDatasource(binding: SceneBinding): SceneBinding {
  if (binding.dataSourceConfig) return binding;

  const ds = useDataSourceStore.getState().getDataSource(binding.dataSource);
  if (!ds || !ds.connection?.url) return binding;

  const headers: Record<string, string> = {};
  for (const h of ds.connection.headers) {
    if (h.enabled && h.key) {
      headers[h.key] = h.value;
    }
  }

  return {
    ...binding,
    adapterType: binding.adapterType || ds.type,
    dataSourceConfig: {
      url: ds.connection.url,
      method: 'GET',
      headers,
      timeout: ds.connection.timeout,
      responseMapping: ds.responseMapping?.map((r: { sourcePath: string; targetKey: string }) => ({
        sourcePath: r.sourcePath,
        targetKey: r.targetKey,
      })),
    },
  };
}

export function useSceneDataBindings() {
  const dataOrchestrator = useDataOrchestrator();
  const prevBindingIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!dataOrchestrator) return;

    const unsub = useSceneStore.subscribe((state) => {
      const activeSceneId = state.activeSceneId;
      if (!activeSceneId) return;

      const scene = state.scenes.find(s => s.id === activeSceneId);
      if (!scene) return;

      const currentBindings = (scene.bindings ?? []).map(enrichBindingWithDatasource);
      const currentIds = new Set(currentBindings.map(b => b.id));

      if (scene.variables && scene.variables.length > 0) {
        dataOrchestrator.setVariables(scene.variables);
      }

      for (const id of prevBindingIdsRef.current) {
        if (!currentIds.has(id)) {
          dataOrchestrator.removeSceneBinding(id);
        }
      }

      for (const binding of currentBindings) {
        if (!prevBindingIdsRef.current.has(binding.id)) {
          dataOrchestrator.addSceneBinding(binding);
        }
      }

      prevBindingIdsRef.current = currentIds;
    });

    const state = useSceneStore.getState();
    const activeSceneId = state.activeSceneId;
    if (activeSceneId) {
      const scene = state.scenes.find(s => s.id === activeSceneId);
      if (scene) {
        if (scene.variables && scene.variables.length > 0) {
          dataOrchestrator.setVariables(scene.variables);
        }
        if (scene.bindings && scene.bindings.length > 0) {
          const enriched = scene.bindings.map(enrichBindingWithDatasource);
          dataOrchestrator.setupFromSceneBindings(enriched);
          prevBindingIdsRef.current = new Set(enriched.map(b => b.id));
        }
      }
    }

    return () => {
      dataOrchestrator.clearAll();
      prevBindingIdsRef.current.clear();
      unsub();
    };
  }, [dataOrchestrator]);
}
