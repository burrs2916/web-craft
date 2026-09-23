/**
 * useThrottledDevices — 节流版 deviceStore.devices 快照
 *
 * 为什么需要它：
 *   `useDeviceStore((s) => s.devices)` 会在**每一条**设备消息到达时让消费者重渲染
 *   （edge-conductor 每秒推送多条 device_status / tagValues，每次都替换 devices 引用）。
 *   对纯展示/聚合类组件（统计卡、趋势图、状态面板等），这种"每消息一次整树重渲染"是
 *   4K 大屏卡顿的主要隐藏来源之一，且完全绕开了实时数据合并节流。
 *
 * 本 hook 把设备更新**合并**为最多每 `intervalMs`（默认 500ms）一次 React state 提交：
 *   - 同步缓存最新 devices 引用（latestRef，不触发渲染）
 *   - 窗口内仅起一个定时器，到点才 setState 一次
 *
 * 视觉/功能无损：展示类聚合值（在线数、流量和、告警数、趋势点等）仅需"秒级"新鲜度，
 * 500ms 节流对肉眼不可感知，且与实时数据合并节流（P1）同量级。交互类组件
 * （点击下发命令的 toolbar、需要即时定位的 overlay）请勿使用本 hook。
 */
import { useEffect, useRef, useState } from "react";
import { useDeviceStore } from "../store/deviceStore";

export function useThrottledDevices<T = Record<string, unknown>>(
  intervalMs = 500,
): Record<string, T> {
  const [snapshot, setSnapshot] = useState<Record<string, T>>(
    () => useDeviceStore.getState().devices as unknown as Record<string, T>,
  );
  const latestRef = useRef<Record<string, T>>(snapshot);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const commit = () => {
      timerRef.current = null;
      setSnapshot(latestRef.current);
    };

    const unsub = useDeviceStore.subscribe((state, prev) => {
      if (state.devices === prev.devices) return; // 引用未变，跳过
      latestRef.current = state.devices as unknown as Record<string, T>;
      if (timerRef.current == null) {
        timerRef.current = setTimeout(commit, intervalMs);
      }
    });

    return () => {
      unsub();
      if (timerRef.current != null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [intervalMs]);

  return snapshot;
}

/**
 * useThrottledDeviceStates — 节流版 deviceStore.deviceStates 快照
 *
 * 与 useThrottledDevices 同源，针对 `deviceStates`（状态机计算的设备状态映射）。
 * 状态机每次跳变都 set deviceStates → 引用变化 → 订阅它的组件（尤其是多实例的
 * 设备卡 CardVariantRenderer、滚动表 ScrollingTableRenderer）全部重渲染。
 * 对纯展示状态查表（取状态名/行状态色）只需秒级新鲜度，合并为每 `intervalMs` 一次提交即可。
 */
export function useThrottledDeviceStates<T = string>(
  intervalMs = 500,
): Record<string, T> {
  const [snapshot, setSnapshot] = useState<Record<string, T>>(
    () => useDeviceStore.getState().deviceStates as unknown as Record<string, T>,
  );
  const latestRef = useRef<Record<string, T>>(snapshot);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const commit = () => {
      timerRef.current = null;
      setSnapshot(latestRef.current);
    };

    const unsub = useDeviceStore.subscribe((state, prev) => {
      if (state.deviceStates === prev.deviceStates) return; // 引用未变，跳过
      latestRef.current = state.deviceStates as unknown as Record<string, T>;
      if (timerRef.current == null) {
        timerRef.current = setTimeout(commit, intervalMs);
      }
    });

    return () => {
      unsub();
      if (timerRef.current != null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [intervalMs]);

  return snapshot;
}
