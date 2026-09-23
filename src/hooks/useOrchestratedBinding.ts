import { useState, useCallback, useEffect, useRef } from "react";
import type { DataOrchestrator, ComponentDataUpdater } from "../datasource/orchestration/DataOrchestrator";

export interface UseOrchestratedBindingOptions {
  orchestrator: DataOrchestrator | null;
  componentId: string;
}

export interface UseOrchestratedBindingReturn {
  data: Record<string, unknown>;
  updateData: (property: string, value: unknown) => void;
  isBound: boolean;
  getProperty: (property: string) => unknown;
}

export function useOrchestratedBinding(
  options: UseOrchestratedBindingOptions
): UseOrchestratedBindingReturn {
  const { orchestrator, componentId } = options;
  const [data, setData] = useState<Record<string, unknown>>({});
  const unsubRef = useRef<(() => void) | null>(null);

  const updater: ComponentDataUpdater = useCallback(
    (property: string, value: unknown) => {
      setData((prev) => ({ ...prev, [property]: value }));
    },
    []
  );

  useEffect(() => {
    if (!orchestrator) return;

    const bridge = orchestrator.getBridge();
    const existingData = bridge.getComponentData(componentId);
    if (existingData && typeof existingData === 'object') {
      setData((prev) => ({ ...prev, ...(existingData as Record<string, unknown>) }));
    }

    unsubRef.current = orchestrator.registerComponentUpdater(componentId, updater);

    return () => {
      if (unsubRef.current) {
        unsubRef.current();
        unsubRef.current = null;
      }
    };
  }, [orchestrator, componentId, updater]);

  const updateData = useCallback(
    (property: string, value: unknown) => {
      setData((prev) => ({ ...prev, [property]: value }));
      if (orchestrator) {
        orchestrator.getBridge().updateComponent(componentId, property, value);
      }
    },
    [orchestrator, componentId]
  );

  const getProperty = useCallback(
    (property: string): unknown => {
      return data[property];
    },
    [data]
  );

  return {
    data,
    updateData,
    getProperty,
    isBound: !!orchestrator,
  };
}
