import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import type { UnifiedBinding, DataStatus, WidgetDataResult, TransformStep } from "../types/widget";
import { useDataSourceStore } from "../store/datasourceStore";
import { dataSourceEventBus } from "../datasource/events";
import { safeTransform, safeFilter, safeAggregate, createSafeFunction } from "../datasource/utils/safeEval";

function applyTransformSteps(raw: unknown, steps: TransformStep[]): unknown {
  let result = raw;
  for (const step of steps) {
    switch (step.type) {
      case "map": {
        if (typeof result === "object" && result !== null && step.expression) {
          const fn = safeTransform(step.expression);
          if (fn) {
            try {
              result = fn(result);
            } catch {
              // keep previous result
            }
          }
        }
        break;
      }
      case "filter": {
        if (Array.isArray(result) && step.expression) {
          const fn = safeFilter(step.expression);
          if (fn) {
            try {
              result = result.filter(fn);
            } catch {
              // keep previous result
            }
          }
        }
        break;
      }
      case "aggregate": {
        if (Array.isArray(result) && step.expression) {
          const fn = safeAggregate(step.expression);
          if (fn) {
            try {
              result = fn(result);
            } catch {
              // keep previous result
            }
          }
        }
        break;
      }
      case "format": {
        if (step.params?.["template"] && typeof result !== "undefined") {
          const template = step.params["template"] as string;
          result = template.replace(/\{value\}/g, String(result));
        }
        break;
      }
      case "custom": {
        if (step.function) {
          const fn = createSafeFunction<[unknown, Record<string, unknown>], unknown>(['value', 'params'], step.function);
          if (fn) {
            try {
              result = fn(result, step.params || {});
            } catch {
              // keep previous result
            }
          }
        }
        break;
      }
    }
  }
  return result;
}

function extractByPath(obj: unknown, path: string): unknown {
  if (!obj || !path) return obj;
  const keys = path.replace(/\[(\d+)]/g, ".$1").split(".");
  let current: unknown = obj;
  for (const key of keys) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

export function useWidgetData<T = unknown>(
  _widgetId: string,
  binding?: UnifiedBinding
): WidgetDataResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [status, setStatus] = useState<DataStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const { dataCache } = useDataSourceStore();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bindingRef = useRef(binding);
  bindingRef.current = binding;

  const refresh = useCallback(async () => {
    const currentBinding = bindingRef.current;
    if (!currentBinding || !currentBinding.sourceId) {
      setStatus("idle");
      return;
    }

    setStatus("loading");
    setError(null);

    try {
      const cached = dataCache[currentBinding.sourceId];
      if (cached) {
        let extracted = extractByPath(cached, currentBinding.metricPath);

        if (currentBinding.transform?.steps && currentBinding.transform.steps.length > 0) {
          extracted = applyTransformSteps(extracted, currentBinding.transform.steps);
        }

        setData(extracted as T);
        setStatus("success");
        setLastUpdated(new Date().toISOString());
      } else if (currentBinding.fallback !== undefined) {
        setData(currentBinding.fallback as T);
        setStatus("success");
        setLastUpdated(new Date().toISOString());
      } else {
        setData(null);
        setStatus("idle");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "数据获取失败";
      setError(message);
      setStatus("error");

      if (currentBinding.fallback !== undefined) {
        setData(currentBinding.fallback as T);
      }
    }
  }, [dataCache]);

  useEffect(() => {
    if (!binding?.sourceId) {
      setData(null);
      setStatus("idle");
      setError(null);
      return;
    }

    refresh();

    const interval = binding.refreshInterval || 5000;
    intervalRef.current = setInterval(refresh, interval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [binding?.sourceId, binding?.metricPath, binding?.refreshInterval, refresh]);

  useEffect(() => {
    if (!binding?.sourceId) return;

    const handler = (event: { sourceId: string; data: unknown; extracted: Record<string, unknown>; timestamp: string }) => {
      if (event.sourceId === binding.sourceId) {
        let extracted = extractByPath(event.extracted, binding.metricPath);

        if (binding.transform?.steps && binding.transform.steps.length > 0) {
          extracted = applyTransformSteps(extracted, binding.transform.steps);
        }

        setData(extracted as T);
        setStatus("success");
        setLastUpdated(event.timestamp);
      }
    };

    const unsubscribe = dataSourceEventBus.on("data:updated", handler);

    return () => {
      unsubscribe();
    };
  }, [binding?.sourceId, binding?.metricPath, binding?.transform]);

  return {
    data,
    status,
    error,
    lastUpdated,
    refresh,
  };
}

export function useWidgetDataSourceStatus(sourceId?: string) {
  const { connectionStatuses } = useDataSourceStore();

  return useMemo(() => {
    if (!sourceId) return { connected: false, status: "disconnected" as const, message: undefined };
    const info = connectionStatuses[sourceId];
    return {
      connected: info?.status === "connected",
      status: info?.status || "disconnected",
      message: info?.message,
    };
  }, [sourceId, connectionStatuses]);
}
