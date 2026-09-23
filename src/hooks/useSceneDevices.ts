/**
 * useSceneDevices —— 派生"本场景设备 ID 集合"
 *
 * 优先级（与 DustTrendRenderer 既有 `globalFallback = rawSelectedIds.length===0` 同义）：
 *   1. union(scene.globalComponents[].config.selectedDeviceIds)
 *            ∪ union(scene.views[].components[].config.selectedDeviceIds)
 *      —— 场景级显式绑定。
 *   2. 全空 → 复用 deviceStore 全集（与 LogFilterPanel 当前下拉行为 1:1 对齐，零行为变化）。
 *
 * 不破坏既有：
 * - 不写 deviceStore / sceneStore（纯派生）。
 * - 不读全局 componentRegistry / 渲染器 config 细节（仅读 selectedDeviceIds）。
 *
 * 使用方：logMonitorStore（自动同步场景设备池 → 注入到 LogScope）
 */
import { useMemo } from "react";
import { useSceneStore } from "../store/sceneStore";
import { useDeviceStore } from "../store/deviceStore";

/** 从 component 对象读取 selectedDeviceIds（兼容 string[] / undefined / null） */
function readSelectedIds(comp: unknown): string[] {
  if (!comp || typeof comp !== "object") return [];
  const cfg = (comp as { config?: unknown }).config;
  if (!cfg || typeof cfg !== "object") return [];
  const ids = (cfg as { selectedDeviceIds?: unknown }).selectedDeviceIds;
  if (!Array.isArray(ids)) return [];
  return ids.filter((x): x is string => typeof x === "string" && x.length > 0);
}

export interface UseSceneDevicesOptions {
  /** 显式指定 sceneId；不传则取当前激活场景 */
  sceneId?: string;
  /**
   * 是否在 selectedDeviceIds 全空时回退到 deviceStore 全集（默认 true，与既有
   * `globalFallback` 自动发现约定对齐，保持向前兼容）。
   */
  fallbackToDeviceStore?: boolean;
}

/**
 * 派生本场景的设备 ID 集合，去重。
 *
 * 返回值去重后是数组，**绝不含空字符串**。
 * 如果显式收集为空且 `fallbackToDeviceStore !== false`，返回 deviceStore 全集。
 */
export function useSceneDevices(
  options: UseSceneDevicesOptions = {},
): string[] {
  const { sceneId, fallbackToDeviceStore = true } = options;
  const activeSceneId = useSceneStore((s) => s.activeSceneId);
  const scene = useSceneStore((s) =>
    sceneId
      ? s.scenes.find((sc) => sc.id === sceneId)
      : s.scenes.find((sc) => sc.id === activeSceneId),
  );
  const allDeviceIds = useDeviceStore((s) =>
    Object.keys(s.devices ?? {}),
  );

  return useMemo(() => {
    const collected = new Set<string>();
    if (scene) {
      // 1) scene.globalComponents[].config.selectedDeviceIds
      for (const c of scene.globalComponents ?? []) {
        for (const id of readSelectedIds(c)) collected.add(id);
      }
      // 2) scene.views[].components[].config.selectedDeviceIds
      for (const v of scene.views ?? []) {
        for (const c of v.components ?? []) {
          for (const id of readSelectedIds(c)) collected.add(id);
        }
      }
    }

    if (collected.size > 0) {
      return Array.from(collected);
    }

    // fallback：与 LogFilterPanel 当前下拉 / DustTrendRenderer globalFallback 同义。
    if (!fallbackToDeviceStore) return [];
    return allDeviceIds.filter((id) => typeof id === "string" && id.length > 0);
  }, [scene, allDeviceIds, fallbackToDeviceStore]);
}
