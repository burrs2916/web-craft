import { useDeviceStore } from "../deviceStore";
import { useSceneStore } from "../sceneStore";
import { useEditorStore } from "../editorStore";
import { useLogMonitorStore } from "./store";
import type { SceneView } from "../../types/scene";
import type { SceneComponent } from "../../types/editor";

// ═══════════════════════════════════════════════════════════════════
// 自动同步场景设备池（外部可在 App 启动时调用一次）
// ═══════════════════════════════════════════════════════════════════

let subscribed = false;

/** 设备树节点（仅取日志监控派生需要的字段） */
type DeviceNode = {
  deviceId: string;
  parentDeviceId?: string | null;
  productCode?: string | number;
};

/** 当前渲染场景的组件容器（editorStore / sceneStore 都满足此结构） */
type SceneComponentsLike = {
  globalComponents?: SceneComponent[];
  views?: SceneView[];
};

/**
 * 从当前渲染场景中找到主视图(view_default)的喷雾控制工具栏
 * （industrial-spray-control-toolbar）。每个场景都有该工具栏，它是"当前场景所选集控器"的唯一权威来源。
 * 同时在 globalComponents 与主视图组件里查找，命中即返回。
 */
function findSprayControlToolbar(scene: SceneComponentsLike): SceneComponent | undefined {
  const comps: SceneComponent[] = [];
  if (Array.isArray(scene.globalComponents)) comps.push(...scene.globalComponents);
  if (Array.isArray(scene.views)) {
    for (const v of scene.views) {
      if (v.id === "view_default" && Array.isArray(v.components)) {
        comps.push(...v.components);
      }
    }
  }
  return comps.find((c) => c.type === "industrial-spray-control-toolbar");
}

/**
 * 工具栏集控器绑定的稳定签名：用于订阅时廉价比对"绑定是否变化"。
 * 仅提取主视图喷雾控制工具栏的 selectedDeviceIds（排序后 join），无工具栏/无绑定返回 ""。
 */
function toolbarBindingSignature(scene: SceneComponentsLike): string {
  const tb = findSprayControlToolbar(scene);
  const sd = tb?.config?.selectedDeviceIds;
  if (!Array.isArray(sd)) return "";
  return sd
    .filter((x): x is string => typeof x === "string" && x.length > 0)
    .sort()
    .join(",");
}

/**
 * 判定某设备是否为集控器根（productCode="18" 且为顶层 / 无 parent）。
 * 与 DustAlarmPanelRenderer / SensorMonitorRenderer 等渲染器对"集控器"的定义一致。
 */
function isControllerRoot(d: DeviceNode | undefined): boolean {
  return !!d && !d.parentDeviceId && String(d.productCode ?? "") === "18";
}

/**
 * 从某设备 ID 向上回溯 parentDeviceId，定位其所属集控器根
 * （无 parentDeviceId 的顶层节点，即 productCode="18"）。
 * 找不到 / 设备不存在 / 非集控器 / 成环返回 undefined。
 */
function findControllerRoot(
  deviceId: string,
  devices: Record<string, DeviceNode>,
): string | undefined {
  const start = devices[deviceId];
  if (!start) return undefined;
  // 当前节点本身就是集控器根
  if (isControllerRoot(start)) return start.deviceId;
  let pid: string | undefined | null = start.parentDeviceId;
  const seen = new Set<string>([deviceId]);
  while (pid) {
    const parent: DeviceNode | undefined = devices[pid];
    if (!parent) return undefined;
    // 顶层节点（无 parent）即集控器根
    if (isControllerRoot(parent)) return parent.deviceId;
    if (seen.has(pid)) return undefined; // 防环
    seen.add(pid);
    pid = parent.parentDeviceId;
  }
  return undefined;
}

/**
 * 订阅 `useSceneStore.activeSceneId` 变化，自动从对应 scene 派生设备 ID 集合
 * 并 setSceneDeviceIds()。多次调用幂等（仅订阅一次）。
 *
 * 设计：日志监控视图**不重复绑定设备**——它只消费当前场景主视图
 * （view_default）中 **喷雾控制工具栏（industrial-spray-control-toolbar）**
 * 已选中的集控器下的设备。具体：
 *  1. 取当前场景主视图的喷雾控制工具栏组件（每个场景都有，作为"当前场景所选集控器"的唯一来源）。
 *  2. 读其 `selectedDeviceIds`（当前场景被选中的集控器 + 分控器）。
 *  3. 向上回溯 parentDeviceId 至集控器根（productCode="18" / 无 parent）。
 *  4. 从 deviceStore 展开该集控器根完整子树（集控器 → 分控器 → 传感器）
 *     → sceneDeviceIds 即"当前场景所选集控器下的全部数据"。
 *  5. 工具栏未绑集控器 / 找不到工具栏 → sceneDeviceIds 留空（空状态），
 *     不回退 deviceStore 全集，避免混入其他集控器噪声。
 *
 * 渲染层（6 个日志组件）只从 useLogMonitorStore.sceneDeviceIds 取 scope 做分析/渲染/导出。
 */
export function subscribeLogMonitorToScene(): void {
  if (subscribed) return;
  subscribed = true;

  // 场景设备池变化时立即重查所有 scope 依赖查询。
  // 原实现只靠 LogFilterPanel 挂载 + 30s 定时器重查，导致"切场景 / 改工具栏集控器"后
  // 卡片最长 30s 停在旧数据，看起来像'写死'。这里在设备池实际变化时主动重查。
  let firstRun = true;
  const refetchScopeDependent = () => {
    const st = useLogMonitorStore.getState();
    void st.queryReport();
    void st.queryEventsForStats();
    void st.queryOpsForStats();
    void st.queryActiveTab();
    st.bumpRefresh();
  };

  const recomputeAndSet = () => {
    // 当前渲染场景的组件实时态在 editorStore（编辑器 / 预览均由此渲染：
    // ScenePreviewPage.loadSceneWithViews 把场景载入 editorStore；用户在属性面板改工具栏集控器
    // 走 editorStore.updateComponentConfig）。sceneStore 仅持有载入时的快照，编辑态下会滞后，
    // 因此这里以 editorStore 为权威来源。
    const editorState = useEditorStore.getState();
    const allDevices =
      (useDeviceStore.getState().devices ?? {}) as Record<string, DeviceNode>;

    // 1. 取当前渲染场景主视图的喷雾控制工具栏（当前场景所选集控器的权威来源）
    const toolbar = findSprayControlToolbar(editorState);
    const boundIds: string[] = [];
    if (toolbar?.config) {
      const sd = toolbar.config.selectedDeviceIds;
      if (Array.isArray(sd)) {
        for (const x of sd) if (typeof x === "string" && x.length > 0) boundIds.push(x);
      }
    }

    // 2. 定位集控器根集合
    // 工具"绑定集控器"字段（deviceMultiSelect）只会写入集控器根，但历史/误操作数据里
    // 常混入子设备 ID（如 1234567891_1 / 1234567891_2，它们挂在别的集控器下）。
    // 若对每个 ID 都 findControllerRoot 回溯，子设备会回溯出额外集控器根，
    // 导致日志面板多渲集控器卡 + 其名下分控器。
    // 因此：优先只采用"本身即集控器根"的 ID；丢弃混入的子设备（不再回溯）。
    // 回退：若用户只选了子设备（无一为根），再回溯到其集控器根（兼容旧数据）。
    const controllerRoots = new Set<string>();
    let anyRootChosen = false;
    for (const id of boundIds) {
      const dev = allDevices[id];
      if (isControllerRoot(dev)) {
        controllerRoots.add(id);
        anyRootChosen = true;
      }
    }
    if (!anyRootChosen) {
      for (const id of boundIds) {
        const root = findControllerRoot(id, allDevices);
        if (root) controllerRoots.add(root);
      }
    }

    const prevIds = useLogMonitorStore.getState().sceneDeviceIds;

    if (controllerRoots.size === 0) {
      // 工具栏未绑集控器 / 找不到工具栏 → 空状态，不混入全矿噪声。
      // 仅当由"有绑定"变"无绑定"时才重查（让旧数据清空为 __NO_BINDING__ 空结果）。
      if (prevIds.length !== 0) {
        useLogMonitorStore.getState().setSceneDeviceIds([]);
        useLogMonitorStore.getState().setSelectedControllerIds([]);
        if (!firstRun) refetchScopeDependent();
      }
      firstRun = false;
      return;
    }

    // 3. 展开每个集控器根的完整子树（集控器本身 + 全部后代），
    //    覆盖 operation_logs(集控器) 与 device_events / sensor_samples(子设备) 查询。
    const subtree = new Set<string>();
    for (const rootId of controllerRoots) {
      subtree.add(rootId);
      for (const d of Object.values(allDevices)) {
        let pid = d.parentDeviceId;
        while (pid) {
          if (pid === rootId) {
            subtree.add(d.deviceId);
            break;
          }
          const parent: DeviceNode | undefined = allDevices[pid];
          pid = parent?.parentDeviceId;
        }
      }
    }
    const newIds = Array.from(subtree).sort();
    const sortedRoots = Array.from(controllerRoots).sort();
    const changed =
      prevIds.length !== newIds.length ||
      !prevIds.every((v, i) => v === newIds[i]);
    useLogMonitorStore.getState().setSceneDeviceIds(newIds);
    // 同步暴露当前绑定的集控器根，供日志面板渲染"当前监控集控器"卡片（与 sceneDeviceIds 同源更新）。
    useLogMonitorStore.getState().setSelectedControllerIds(sortedRoots);
    // 首跑交给 LogFilterPanel 挂载时的初始查询；其后仅当设备池实际变化才重查，
    // 避免每次拖拽 / 选区 / 变换都重查。
    if (changed && !firstRun) refetchScopeDependent();
    firstRun = false;
  };

  // 初始化一次
  recomputeAndSet();
  // 订阅场景切换（sceneStore.activeSceneId 变化 → 预览会重新 loadSceneWithViews 到 editorStore）
  useSceneStore.subscribe((state, prev) => {
    if (state.activeSceneId !== prev.activeSceneId) {
      // 场景切换：重置分页（避免带上个场景的页数 offset 查新场景越界），
      // 并 recompute 设备池（setSceneDeviceIds 变化会触发三表 + 图表自动重查）。
      useLogMonitorStore.getState().setCurrentPage(0);
      recomputeAndSet();
    }
  });
  // 订阅编辑器组件 config 变更：用户在属性面板改喷雾控制工具栏的集控器绑定 → editorStore 变化。
  // 用绑定签名比对，仅在"工具栏 selectedDeviceIds 实际变化"时重算（避免每次拖拽/选区/变换都重算）。
  useEditorStore.subscribe((state, prev) => {
    if (toolbarBindingSignature(state) !== toolbarBindingSignature(prev)) {
      recomputeAndSet();
    }
  });
  // 同时订阅设备列表加载完成（集控器根出现后需重算）
  useDeviceStore.subscribe((state, prev) => {
    const before = Object.keys(prev.devices ?? {}).length;
    const now = Object.keys(state.devices ?? {}).length;
    if (before !== now) {
      recomputeAndSet();
    }
  });
}