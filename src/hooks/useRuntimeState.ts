// @ts-nocheck
import { useState, useCallback, useEffect, useRef } from "react";
import type { RuntimeState } from "../types";

interface UseRuntimeStateReturn {
  state: RuntimeState | null;
  values: Map<string, unknown>;
  status: "active" | "paused" | "error";
  isLoading: boolean;
  error: string | null;
  subscribe: (keys: string[]) => void;
  unsubscribe: (keys: string[]) => void;
  pause: () => void;
  resume: () => void;
  refresh: () => Promise<void>;
  getValue: <T = unknown>(key: string) => T | undefined;
  setValue: (key: string, value: unknown) => void;
}

export function useRuntimeState(sceneId?: string): UseRuntimeStateReturn {
  const [state] = useState<RuntimeState | null>(null);
  const [values, setValues] = useState<Map<string, unknown>>(new Map());
  const [status, setStatus] = useState<"active" | "paused" | "error">("active");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subscriptionKeys = useRef<Set<string>>(new Set());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const subscribe = useCallback((keys: string[]) => {
    keys.forEach((key) => subscriptionKeys.current.add(key));
  }, []);

  const unsubscribe = useCallback((keys: string[]) => {
    keys.forEach((key) => subscriptionKeys.current.delete(key));
  }, []);

  const pause = useCallback(() => {
    setStatus("paused");
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const resume = useCallback(() => {
    setStatus("active");
  }, []);

  const refresh = useCallback(async () => {
    if (!sceneId) return;
    setIsLoading(true);
    setError(null);
    try {
      console.log(`Refreshing runtime state for scene: ${sceneId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh state");
      setStatus("error");
    } finally {
      setIsLoading(false);
    }
  }, [sceneId]);

  const getValue = useCallback(
    <T = unknown,>(key: string): T | undefined => {
      return values.get(key) as T | undefined;
    },
    [values]
  );

  const setValue = useCallback((key: string, value: unknown) => {
    setValues((prev) => {
      const newValues = new Map(prev);
      newValues.set(key, value);
      return newValues;
    });
  }, []);

  useEffect(() => {
    if (sceneId && status === "active") {
      refresh();
      intervalRef.current = setInterval(refresh, 5000);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [sceneId, status, refresh]);

  return {
    state,
    values,
    status,
    isLoading,
    error,
    subscribe,
    unsubscribe,
    pause,
    resume,
    refresh,
    getValue,
    setValue,
  };
}
