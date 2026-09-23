import { useEffect, useCallback, useRef } from "react";
import { useComponentDataBridge } from "../context/SceneEditorContext";
import { useEditorStore } from "../../store/editorStore";

// 实时数据合并窗口：窗口内的多次属性更新合并为一次 store 写入。
// 避免 4K 大屏每 tick 对每个组件触发重渲染/重光栅（含设备卡 30+ 发光圆点），是刷新风暴的主要抑制点。
const REALTIME_COALESCE_MS = 220;

export function useComponentDataBinding(componentId: string) {
  const bridge = useComponentDataBridge();
  const updateComponent = useEditorStore((s) => s.updateComponent);
  const applyRealtimeData = useEditorStore((s) => s.applyRealtimeData);
  const latestDataRef = useRef<Record<string, unknown>>({});
  // 窗口内待写入的属性（合并为一次 store 更新）
  const pendingRef = useRef<Record<string, unknown>>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    timerRef.current = null;
    const pending = pendingRef.current;
    pendingRef.current = {};
    if (Object.keys(pending).length === 0) return;
    applyRealtimeData(componentId, pending);
  }, [componentId, applyRealtimeData]);

  useEffect(() => {
    if (!bridge || !componentId) return;

    const unregister = bridge.registerUpdater(componentId, (property: string, value: unknown) => {
      latestDataRef.current[property] = value;

      if (property === "visible") {
        // 布局相关、罕见，立即生效（保留原语义）
        updateComponent(componentId, { visible: value as boolean });
        return;
      }

      // 其余属性（data/option/value/...）合并到窗口内一次性写入；
      // applyRealtimeData 跳过历史/脏标记，避免撤销栈被淹没 + 保存状态抖动 + 额外重渲染。
      pendingRef.current[property] = value;
      if (timerRef.current == null) {
        timerRef.current = setTimeout(flush, REALTIME_COALESCE_MS);
      }
    });

    return () => {
      if (timerRef.current != null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      // 卸载时丢弃未 flush 的实时数据（组件已不存在）
      pendingRef.current = {};
      unregister();
    };
  }, [bridge, componentId, updateComponent, flush]);

  const pushData = useCallback(
    (property: string, value: unknown) => {
      if (!bridge || !componentId) return;
      bridge.updateComponent(componentId, property, value);
    },
    [bridge, componentId]
  );

  const getData = useCallback(
    (property: string): unknown => {
      if (!bridge || !componentId) return undefined;
      return bridge.getComponentProperty(componentId, property);
    },
    [bridge, componentId]
  );

  return { pushData, getData, latestData: latestDataRef.current };
}
