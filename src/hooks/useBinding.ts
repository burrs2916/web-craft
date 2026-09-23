// @ts-nocheck
import { useState, useCallback, useEffect } from "react";
import type { SceneBinding, SceneTransformConfig } from "../types/scene";

interface UseBindingReturn {
  bindings: SceneBinding[];
  isLoading: boolean;
  error: string | null;
  createBinding: (binding: Omit<SceneBinding, "id">) => void;
  updateBinding: (id: string, updates: Partial<SceneBinding>) => void;
  removeBinding: (id: string) => void;
  setTransform: (id: string, transform: SceneTransformConfig) => void;
  setRefreshInterval: (id: string, interval: number) => void;
  getBindingsByComponent: (componentId: string) => SceneBinding[];
  getBindingsByDataSource: (dataSource: string) => SceneBinding[];
}

export function useBinding(componentId?: string): UseBindingReturn {
  const [bindings, setBindings] = useState<SceneBinding[]>([]);
  const [isLoading] = useState(false);
  const [error] = useState<string | null>(null);

  const createBinding = useCallback(
    (binding: Omit<SceneBinding, "id">) => {
      const newBinding: SceneBinding = {
        ...binding,
        id: `binding-${Date.now()}`,
      };
      setBindings((prev) => [...prev, newBinding]);
    },
    []
  );

  const updateBinding = useCallback(
    (id: string, updates: Partial<SceneBinding>) => {
      setBindings((prev) =>
        prev.map((binding) =>
          binding.id === id ? { ...binding, ...updates } : binding
        )
      );
    },
    []
  );

  const removeBinding = useCallback((id: string) => {
    setBindings((prev) => prev.filter((binding) => binding.id !== id));
  }, []);

  const setTransform = useCallback(
    (id: string, transform: SceneTransformConfig) => {
      updateBinding(id, { transform });
    },
    [updateBinding]
  );

  const setRefreshInterval = useCallback(
    (id: string, interval: number) => {
      updateBinding(id, { refreshInterval: interval });
    },
    [updateBinding]
  );

  const getBindingsByComponent = useCallback(
    (compId: string) => {
      return bindings.filter((binding) => binding.componentId === compId);
    },
    [bindings]
  );

  const getBindingsByDataSource = useCallback(
    (dataSource: string) => {
      return bindings.filter((binding) => binding.dataSource === dataSource);
    },
    [bindings]
  );

  useEffect(() => {
    if (componentId) {
      console.log(`Loading bindings for component: ${componentId}`);
    }
  }, [componentId]);

  return {
    bindings,
    isLoading,
    error,
    createBinding,
    updateBinding,
    removeBinding,
    setTransform,
    setRefreshInterval,
    getBindingsByComponent,
    getBindingsByDataSource,
  };
}
