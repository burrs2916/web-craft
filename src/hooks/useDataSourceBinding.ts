import { useEffect, useMemo, useCallback, useRef } from "react";
import { useDataSourceStore } from "../store/datasourceStore";
import { dataSourceEventBus } from "../datasource/events";
import { useDataOrchestrator } from "../editor/context/SceneEditorContext";

export function useDataSourceBinding(componentId: string, dataSourceIds?: string[]) {
  const {
    dataSources,
    dataCache,
  } = useDataSourceStore();

  const orchestrator = useDataOrchestrator();
  const orchestratorDataRef = useRef<Record<string, unknown>>({});

  useEffect(() => {
    if (!dataSourceIds || dataSourceIds.length === 0) return;

    const handler = (event: { sourceId: string }) => {
      if (dataSourceIds.includes(event.sourceId)) {
        // data will be available via dataCache
      }
    };

    dataSourceEventBus.on("data:updated", handler);

    return () => {
      dataSourceEventBus.off("data:updated", handler);
    };
  }, [dataSourceIds]);

  useEffect(() => {
    if (!orchestrator || !dataSourceIds || dataSourceIds.length === 0) return;

    const unsub = orchestrator.getBridge().subscribe((cid, property, value) => {
      if (cid === componentId) {
        orchestratorDataRef.current = {
          ...orchestratorDataRef.current,
          [property]: value,
        };
      }
    });

    return unsub;
  }, [orchestrator, componentId, dataSourceIds]);

  useEffect(() => {
    if (!orchestrator || !dataSourceIds || dataSourceIds.length === 0) return;

    const refreshAll = async () => {
      for (const sourceId of dataSourceIds) {
        try {
          await orchestrator.refreshBindingsForSource(sourceId);
        } catch {
          // skip failed refresh
        }
      }
    };

    refreshAll();
  }, [orchestrator, dataSourceIds]);

  const refresh = useCallback(async (sourceId: string) => {
    if (!orchestrator) return;
    try {
      await orchestrator.refreshBindingsForSource(sourceId);
    } catch {
      // skip failed refresh
    }
  }, [orchestrator]);

  const boundDataSources = useMemo(
    () => dataSources.filter((ds) => dataSourceIds?.includes(ds.id)),
    [dataSourceIds, dataSources]
  );

  const componentData = useMemo(() => {
    const result: Record<string, unknown> = {};
    dataSourceIds?.forEach((id) => {
      const cached = dataCache[id];
      if (cached) {
        result[id] = cached;
      }
    });

    const bridge = orchestrator?.getBridge();
    if (bridge) {
      const bridgeData = bridge.getComponentData(componentId);
      if (bridgeData && typeof bridgeData === 'object') {
        Object.assign(result, bridgeData as Record<string, unknown>);
      }
    }

    if (Object.keys(orchestratorDataRef.current).length > 0) {
      Object.assign(result, orchestratorDataRef.current);
    }

    return result;
  }, [dataSourceIds, dataCache, orchestrator, componentId]);

  return {
    boundDataSources,
    componentData,
    refresh,
    on: dataSourceEventBus.on.bind(dataSourceEventBus),
  };
}
