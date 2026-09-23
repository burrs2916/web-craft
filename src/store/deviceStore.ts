/**
 * deviceStore — 全局设备库
 *
 * 职责：
 * - 维护当前激活 Provider 加载的设备和产品定义
 * - 提供查询/分组/筛选能力
 * - 编辑态手动 CRUD（V2 加入）
 * - 跨场景共享（设备本身是全局的，摆位才是场景级）
 * - 启动时自动检测已启用的 DeviceAdapter 并创建 Provider
 */
import { create } from "zustand";
import type { DeviceInstance, DeviceCategory, ProductDefinition } from "../types/device";
import type { DeviceProvider, CommandResult } from "../types/deviceProvider";
import { logger } from "../utils/logger";
import { deviceStateMachine, type DeviceStateName } from "./deviceStateMachine";

interface DeviceState {
  devices: Record<string, DeviceInstance>;
  products: Record<string, ProductDefinition>;
  /** 状态机计算出的设备状态（deviceId → stateName），驱动 UI 响应式更新 */
  deviceStates: Record<string, DeviceStateName>;
  activeProvider: DeviceProvider | null;
  activeAdapterId: string | null;
  /** 当前 provider 绑定的数据源 ID —— 用于把 loadDevices 的成功/失败同步到 connectionStatuses */
  activeDataSourceId: string | null;
  isLoading: boolean;
  error: string | null;
  lastLoadedAt: number | null;
  setProvider(provider: DeviceProvider, dataSourceId?: string): Promise<void>;
  reload(): Promise<void>;
  /** 从已启用的 DeviceAdapter 自动创建 Provider 并加载 */
  autoLoadFromAdapters(): Promise<void>;

  // 查询
  getDevice(deviceId: string): DeviceInstance | undefined;
  getProduct(productCode: string): ProductDefinition | undefined;
  getDevicesByCategory(category: DeviceCategory): DeviceInstance[];
  getChildren(parentId: string): DeviceInstance[];
  getRootDevices(): DeviceInstance[];
  getAllDevices(): DeviceInstance[];

  /**
   * 🔗 级联在线判定（与 edge-conductor is_device_online() 对齐）
   *
   * 协议层级：服务器(2) → 喷雾集控器(18) → 分控器(18001) → 传感器(18010-18031)
   * 规则：父设备离线 → 子设备 effectiveOnline = false，无论子设备自身 online 值如何
   * fault 状态视为在线（通讯故障但物理连接仍在，与 edge-conductor 一致）
   */
  getEffectiveOnline(deviceId: string): boolean;

  // 手动维护（V1 只读，V2 可写）
  addDevice(device: DeviceInstance): void;
  removeDevice(deviceId: string): void;
  updateDevice(deviceId: string, patch: Partial<DeviceInstance>): void;

  // === 增强：实时数据 + 控制命令转发（activeProvider 有则转发，没有返回 noop） ===
  subscribeData(deviceId: string, tagId: string, cb: (value: unknown) => void): () => void;
  writeTag(deviceId: string, tagId: string, value: unknown): Promise<void>;
  /** 下发结构化协议命令，返回结构化回执（供 UI 呈现已下发/离线/参数错误） */
  sendCommand(deviceId: string, command: string, params?: Record<string, unknown>): Promise<CommandResult>;

  /** 启动定时主动获取传感器实时状态（0x061d），30s 周期 */
  startRealtimePolling(): void;
  /** 停止定时主动获取 */
  stopRealtimePolling(): void;
}

/** 空的默认 Provider，设备列表为空，等待配置数据源后切换 */
const defaultProvider: DeviceProvider = {
  id: "empty-default",
  name: "未配置数据源",
  type: "mock" as const,
  async loadDevices() { return []; },
  async loadProducts() { return []; },
  // === 增强：实时设备 + 控制命令 noop 实现（不破坏旧调用方） ===
  subscribeData() { return () => undefined; },
  async writeTag() { /* noop */ },
};

let providerUnsubscribe: (() => void) | null = null;
let realtimePollingTimer: ReturnType<typeof setInterval> | null = null;
let isPolling = false; // 并发保护：防止多轮重叠执行
let reloadPromise: Promise<void> | null = null; // 并发保护：防止多个 reload 互相覆盖

// ─── 设备过滤器代码版本号 ─────────────────────────────────────
// 每次修改 EdgeConductorProvider 过滤逻辑时手动 +1。
// 启动时若 localStorage 中保存的版本号不等于当前版本，自动清空内存中的设备列表 + 重新拉取，
// 避免 HMR 推送新过滤代码后 tauri webview 内存里仍是老数据（采集器/过期产品码残留）。
const DEVICE_FILTER_VERSION = "2026-07-09.1";
const DEVICE_FILTER_VERSION_KEY = "__device_filter_version__";
let pendingForceReload = false;
try {
  const stored = localStorage.getItem(DEVICE_FILTER_VERSION_KEY);
  if (stored !== DEVICE_FILTER_VERSION) {
    // 不能在模块顶层直接 reload（provider 还没初始化），仅记录标记
    localStorage.setItem(DEVICE_FILTER_VERSION_KEY, DEVICE_FILTER_VERSION);
    // eslint-disable-next-line no-console
    console.info(
      "[deviceStore] filter version changed",
      { from: stored, to: DEVICE_FILTER_VERSION },
      "— will force reload on first provider init",
    );
    // 任何版本变化（含首次安装 stored=null）都强制 reload，
    // 避免 HMR 推送新过滤代码后 tauri webview 内存里仍是老数据
    pendingForceReload = stored !== DEVICE_FILTER_VERSION;
  }
} catch {
  // localStorage 不可用（SSR/隐私模式）— 不强制 reload
}

export const useDeviceStore = create<DeviceState>((set, get) => ({
  devices: {},
  products: {},
  deviceStates: {},
  activeProvider: defaultProvider,
  activeAdapterId: null,
  activeDataSourceId: null,
  isLoading: false,
  lastLoadedAt: null,
  error: null,

  async setProvider(provider: DeviceProvider, dataSourceId?: string) {
    providerUnsubscribe?.();
    providerUnsubscribe = null;
    const prevProvider = get().activeProvider;
    if (prevProvider && prevProvider !== provider) {
      prevProvider.destroy?.();
    }

    set({ activeProvider: provider, activeDataSourceId: dataSourceId ?? null });
    await get().reload();

    if (provider.subscribeChanges) {
        providerUnsubscribe = provider.subscribeChanges((event) => {
          // ─── WebSocket 实时状态更新（edge-conductor 推送 "device_status"） ───
          // 直接更新 deviceStore 中的设备状态，不触发 reload()
          // 确保左侧面板、表格等所有组件看到的 online 状态一致
          if (event.type === "device_status" || event.type === "status_changed") {
            const existing = get().devices[event.deviceId];
            // 通用 tagValues 到达日志（覆盖 workTimeSlots、联动等所有非 controllerState 字段）
            if (event.tagValues && Object.keys(event.tagValues).length > 0) {
              const nonStateKeys = Object.keys(event.tagValues).filter(k => k !== "controllerState" && k !== "batteryWarning");
              if (nonStateKeys.length > 0) {
                console.info('[deviceStore WS] tagValues 收到:', {
                  deviceId: event.deviceId,
                  keys: Object.keys(event.tagValues),
                  workTimeSlots: event.tagValues.workTimeSlots ? '✅有' : '❌无',
                  dustLinkage: event.tagValues.dustLinkage ? '✅有' : '❌无',
                  temperatureLinkage: event.tagValues.temperatureLinkage ? '✅有' : '❌无',
                  coLinkage: event.tagValues.coLinkage ? '✅有' : '❌无',
                });
              }
              // 粉尘传感器数据专用日志（finalValue / sensorValue / sensorFrequency / sensorStatusCode）
              const tv = event.tagValues!;
              const dustTags = ["finalValue", "sensorValue", "sensorFrequency", "sensorStatusCode", "alarm"];
              const dustHit = dustTags.filter(k => k in tv);
              if (dustHit.length > 0) {
                logger.warn("DeviceStore", "WS 粉尘传感器数据", {
                  deviceId: event.deviceId,
                  tagKeys: Object.keys(tv),
                  dustTags: dustHit,
                  finalValue: tv.finalValue,
                  sensorValue: tv.sensorValue,
                  sensorFrequency: tv.sensorFrequency,
                  sensorStatusCode: tv.sensorStatusCode,
                  alarm: tv.alarm,
                  online: event.online,
                  found: !!existing,
                });
              }
              // 🚨 [SMOKE_ALARM] 烟雾传感器(18024)独特日志标记
              if (Number(event.productCode) === 18024 && tv.alarm !== undefined) {
                if (tv.alarm === true) {
                  logger.warn("DeviceStore", "🚨 [SMOKE_ALARM_MERGED] 烟雾传感器触发告警数据合并!", {
                    deviceId: event.deviceId,
                    productCode: event.productCode,
                    alarm: tv.alarm,
                    batteryWarning: tv.batteryWarning,
                    online: event.online,
                    found: !!existing,
                  });
                } else {
                  console.info("🚨 [SMOKE_ALARM_MERGED] 烟雾传感器状态正常数据合并", {
                    deviceId: event.deviceId,
                    productCode: event.productCode,
                    alarm: tv.alarm,
                  });
                }
              }
            }
            if (!existing) {
              // 新设备（不在 store 中）-> 需要全量 reload
              // ⚠️ P0 修复：不再直接 return 丢弃 tagValues！
              // reload 完成后，将本次推送的 tagValues 应用到对应设备
              const pendingTagValues = event.tagValues;
              const pendingDeviceId = event.deviceId;
              const pendingOnline = event.online;
              const pendingFault = event.fault;
              const pendingAlarm = event.alarm;
              const pendingLastHeartbeat = event.lastHeartbeat;
              const pendingStatus = event.status;
              const pendingConnectionId = event.connectionId;
              const pendingParentDeviceId = event.parentDeviceId;
              const pendingParentProductCode = event.parentProductCode;

              console.info('[deviceStore WS] !existing 分支：设备不在 store，reload 后补推 tagValues', {
                deviceId: pendingDeviceId,
                hasTagValues: !!pendingTagValues && Object.keys(pendingTagValues).length > 0,
                tagValueKeys: pendingTagValues ? Object.keys(pendingTagValues) : [],
              });

              get().reload().then(() => {
                // reload 完成后，检查设备是否已在 store 中
                const reloaded = get().devices[pendingDeviceId];
                if (!reloaded) {
                  console.warn('[deviceStore WS] !existing 分支：reload 后设备仍不在 store，丢弃 tagValues', {
                    deviceId: pendingDeviceId,
                    tagValueKeys: pendingTagValues ? Object.keys(pendingTagValues) : [],
                  });
                  return;
                }

                // 将本次推送的数据 patch 到设备上
                const metadata = {
                  ...reloaded.metadata,
                  ...(pendingOnline !== undefined ? { online: pendingOnline } : {}),
                  ...(pendingLastHeartbeat !== undefined ? { lastHeartbeat: pendingLastHeartbeat } : {}),
                  ...(pendingConnectionId !== undefined ? { connectionId: pendingConnectionId } : {}),
                  ...(pendingAlarm !== undefined ? { alarm: pendingAlarm } : {}),
                  ...(pendingFault !== undefined ? { fault: pendingFault } : {}),
                  ...(pendingStatus !== undefined ? { status: pendingStatus } : {}),
                  // 🔧 修复 fault 粘滞：设备离线时若 WS 未显式携带 fault 字段，清除残留的 fault=true
                  ...((pendingOnline === false && pendingFault === undefined)
                    ? { fault: false, faultReason: undefined }
                    : {}),
                  ...(pendingTagValues && Object.keys(pendingTagValues).length > 0
                    ? {
                        realtime: {
                          ...((reloaded.metadata as any)?.realtime ?? {}),
                          ...Object.fromEntries(
                            Object.entries(pendingTagValues).map(([k, v]) => [k, { value: v, timestamp: Date.now(), quality: "good" }]),
                          ),
                        },
                      }
                    : {}),
                };

                const deviceUpdate: Partial<DeviceInstance> = {
                  online: pendingOnline ?? reloaded.online,
                  metadata,
                  ...(pendingParentDeviceId !== undefined ? { parentDeviceId: pendingParentDeviceId } : {}),
                  ...(pendingParentProductCode !== undefined ? { parentProductCode: pendingParentProductCode } : {}),
                };

                get().updateDevice(pendingDeviceId, deviceUpdate);

                console.info('[deviceStore WS] !existing 分支：reload 后成功补推 tagValues', {
                  deviceId: pendingDeviceId,
                  tagValueKeys: pendingTagValues ? Object.keys(pendingTagValues) : [],
                  workTimeSlots: pendingTagValues?.workTimeSlots ? '✅有' : '❌无',
                });

                // 状态机同步
                const changed = deviceStateMachine.updateDeviceState(pendingDeviceId, metadata as any, pendingOnline ?? reloaded.online);
                if (changed) {
                  const stateName = deviceStateMachine.getDeviceStateName(pendingDeviceId);
                  set((s) => ({ deviceStates: { ...s.deviceStates, [pendingDeviceId]: stateName } }));
                }
              }).catch((err) => {
                console.error('[deviceStore WS] !existing 分支：reload 失败，tagValues 丢失', {
                  deviceId: pendingDeviceId,
                  error: err,
                });
              });
              return;
            }

            // 直接更新 DeviceInstance 的 online 和 metadata
            const metadata = {
              ...existing.metadata,
              ...(event.online !== undefined ? { online: event.online } : {}),
              ...(event.lastHeartbeat !== undefined ? { lastHeartbeat: event.lastHeartbeat } : {}),
              ...(event.connectionId !== undefined ? { connectionId: event.connectionId } : {}),
              ...(event.alarm !== undefined ? { alarm: event.alarm } : {}),
              ...(event.fault !== undefined ? { fault: event.fault } : {}),
              ...(event.faultReason !== undefined ? { faultReason: event.faultReason } : {}),
              ...(event.status !== undefined ? { status: event.status } : {}),
              // 🔧 修复 fault 粘滞：设备离线时若 WS 未显式携带 fault 字段，清除残留的 fault=true
              // 协议语义：fault=true 表示"在线但有故障"，离线设备不应保持 fault 状态
              // edge-conductor 离线推送时 fault=None（不包含该字段），导致旧值残留
              ...((event.online === false && event.fault === undefined)
                ? { fault: false, faultReason: undefined }
                : {}),
              ...(event.tagValues
                ? {
                    realtime: {
                      ...((existing.metadata as any)?.realtime ?? {}),
                      ...Object.fromEntries(
                        Object.entries(event.tagValues).map(([k, v]) => [k, { value: v, timestamp: Date.now(), quality: "good" }]),
                      ),
                    },
                  }
                : {}),
            };

            // 🔗 级联补判：如果设备自身离线，但后端推 online=true（残留数据），强制纠正
            // 协议规则：父设备离线 → 子设备必离线（集控器是子设备的通信网关）
            let newOnline = event.online ?? existing.online;
            const effectiveOnline = get().getEffectiveOnline(event.deviceId);
            // 只在级联判定结果为离线时强制覆盖（不会把实际离线的设备改为在线）
            if (newOnline && !effectiveOnline) {
              newOnline = false;
              metadata.status = "offline";
            }

            // 2026-07-13: 更新设备层级信息（顶层字段，不放在metadata中）
            // 确保树形结构展示能正确识别设备的父子关系
            const deviceUpdate: Partial<DeviceInstance> = {
              online: newOnline,
              metadata,
              // 设备层级信息（后端推送的parentDeviceId等字段）
              ...(event.parentDeviceId !== undefined ? { parentDeviceId: event.parentDeviceId } : {}),
              ...(event.parentProductCode !== undefined ? { parentProductCode: event.parentProductCode } : {}),
            };
            
            get().updateDevice(event.deviceId, deviceUpdate);

            // 粉尘传感器数据更新日志（确认 tagValues 已合并到 metadata.realtime）
            if (event.tagValues && Object.keys(event.tagValues).length > 0) {
              const tv2 = event.tagValues;
              const dustTags = ["finalValue", "sensorValue", "sensorFrequency", "sensorStatusCode"];
              const hasDustTag = dustTags.some(k => k in tv2);
              if (hasDustTag) {
                logger.warn("DeviceStore", "WS 粉尘数据已合并", {
                  deviceId: event.deviceId,
                  mergedKeys: Object.keys(tv2),
                  realtimeAfter: Object.keys(metadata?.realtime ?? {}),
                  online: newOnline,
                });
              }
            }

            // 🔗 级联联动：如果该设备是集控器且刚离线，级联将所有子设备也标记离线
            // 协议：集控器(productCode=18)离线 → 分控器、传感器全部离线
            if (!newOnline && !existing.parentDeviceId) {
              const allDevices = get().devices;
              const childIds = Object.values(allDevices)
                .filter((d) => d.parentDeviceId === event.deviceId)
                .map((d) => d.deviceId);
              if (childIds.length > 0) {
                // 批量更新子设备为离线
                set((state) => {
                  const nextDevices = { ...state.devices };
                  for (const childId of childIds) {
                    const child = nextDevices[childId];
                    if (child && child.online) {
                      nextDevices[childId] = {
                        ...child,
                        online: false,
                        // 🔧 级联离线时清除子设备的残留 fault（离线设备不应保持 fault 状态）
                        metadata: { ...child.metadata, status: "offline", fault: false, faultReason: undefined },
                      };
                    }
                  }
                  return { devices: nextDevices };
                });
                // 同步更新子设备状态机
                for (const childId of childIds) {
                  const childMeta = get().devices[childId]?.metadata;
                  if (childMeta) {
                    const changed = deviceStateMachine.updateDeviceState(childId, childMeta as any, false);
                    if (changed) {
                      const stateName = deviceStateMachine.getDeviceStateName(childId);
                      set((s) => ({ deviceStates: { ...s.deviceStates, [childId]: stateName } }));
                    }
                  }
                }
                logger.info("DeviceStore", "🔗 级联联动：集控器离线，子设备同步离线", {
                  parentId: event.deviceId,
                  childCount: childIds.length,
                });
              }
            }

            // 状态机同步
            const changed = deviceStateMachine.updateDeviceState(event.deviceId, metadata as any, newOnline);
            if (changed) {
              const stateName = deviceStateMachine.getDeviceStateName(event.deviceId);
              set((s) => ({ deviceStates: { ...s.deviceStates, [event.deviceId]: stateName } }));
            }
            return;
          }

          // 其他类型（added/removed/updated）-> 全量 reload
          void get().reload();
        });
      }
  },

  async reload() {
    // 并发保护：如果已有 reload 在进行中，复用其 Promise
    if (reloadPromise) return reloadPromise;
    reloadPromise = (async () => {
    const provider = get().activeProvider;
    if (!provider) {
      logger.warn("DeviceStore", "No active provider");
      return;
    }
    set({ isLoading: true, error: null });
    try {
      const invalidate = (provider as any).invalidateDiscoveryCache;
      if (typeof invalidate === "function") invalidate.call(provider);
    } catch { /* swallow */ }
    try {
      const [devices, products] = await Promise.all([
        provider.loadDevices(),
        provider.loadProducts(),
      ]);
      const deviceMap: Record<string, DeviceInstance> = {};
      for (const d of devices) deviceMap[d.deviceId] = d;

      // 🔗 级联补判：加载后立即纠正子设备在线状态
      // 协议规则：父设备离线 → 子设备 effectiveOnline = false
      // edge-conductor /api/devices 已做级联，但 WebSocket 初始推送可能残留，前端兜底
      for (const d of devices) {
        if (d.parentDeviceId && d.online) {
          // 递归检查父设备链
          let parentId: string | undefined = d.parentDeviceId;
          let parentOnline = true;
          const visited = new Set<string>();
          while (parentId && !visited.has(parentId)) {
            visited.add(parentId);
            const parent: DeviceInstance | undefined = deviceMap[parentId];
            if (!parent) break;
            const parentStatus = (parent.metadata as Record<string, unknown>)?.status as string | undefined;
            const isOnline = parent.online || parentStatus === "fault";
            if (!isOnline) { parentOnline = false; break; }
            parentId = parent.parentDeviceId;
          }
          if (!parentOnline) {
            deviceMap[d.deviceId] = {
              ...d,
              online: false,
              metadata: { ...d.metadata, status: "offline" },
            };
          }
        }
      }

      const productMap: Record<string, ProductDefinition> = {};
      for (const p of products) productMap[p.productCode] = p;
      set({
        devices: deviceMap,
        products: productMap,
        isLoading: false,
        lastLoadedAt: Date.now(),
      });

      // === 状态机：设备加载后批量初始化状态 ===
      deviceStateMachine.initFromDevices(devices.map((d) => ({ id: d.deviceId, online: d.online, metadata: d.metadata })));
      // 同步 deviceStates 到 store，驱动 UI 响应式更新
      const initStates: Record<string, DeviceStateName> = {};
      for (const d of devices) {
        initStates[d.deviceId] = deviceStateMachine.getDeviceStateName(d.deviceId);
      }
      set({ deviceStates: initStates });

      logger.info("DeviceStore", "Loaded devices", {
        providerId: provider.id,
        devices: devices.length,
        products: products.length,
      });

      // 加载成功 → 同步"已连接"状态到 dataSourceStore
      const dsId = get().activeDataSourceId;
      if (dsId) {
        try {
          const { useDataSourceStore } = await import("./datasourceStore");
          useDataSourceStore.getState()._handleStatusChange(dsId, "connected");
        } catch { /* swallow */ }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isNetworkError = /Failed to fetch|NetworkError|Load failed|timeout|aborted|ECONNREFUSED|Could not connect/i.test(msg);
      if (isNetworkError) {
        logger.warn("DeviceStore", "数据源未连接，设备进入离线态", { error: msg });
      } else {
        logger.error("DeviceStore", "Failed to load", { error: msg });
      }
      set({ error: msg, isLoading: false });

      const dsId = get().activeDataSourceId;
      if (dsId) {
        try {
          const { useDataSourceStore } = await import("./datasourceStore");
          useDataSourceStore.getState()._handleStatusChange(dsId, "failed", msg);
        } catch { /* swallow */ }
      }
    } finally {
      reloadPromise = null;
    }
  })(); // reloadPromise
  return reloadPromise;
  },

  async autoLoadFromAdapters() {
    try {
      // ─── 设备过滤器代码版本号变更时强制清空内存中的设备 ───
      // 避免 HMR 推送新过滤代码后 tauri webview 内存里仍是老数据（采集器/过期产品码残留）
      if (pendingForceReload) {
        pendingForceReload = false;
        const prevProvider = get().activeProvider;
        if (prevProvider && prevProvider !== defaultProvider) {
          prevProvider.destroy?.();
        }
        providerUnsubscribe?.();
        providerUnsubscribe = null;
        set({ activeProvider: defaultProvider, devices: {}, products: {}, deviceStates: {} });
        logger.warn("DeviceStore", "Force-cleared devices due to filter version change");
      }

      // 动态导入避免循环依赖
      const { useDeviceAdapterStore } = await import("./deviceAdapterStore");
      const { useDataSourceStore } = await import("./datasourceStore");
      const { EdgeConductorProvider } = await import("../devices/EdgeConductorProvider");

      const adapterStore = useDeviceAdapterStore.getState();
      const adapters = adapterStore.getEnabledAdapters();
      if (adapters.length === 0) {
        logger.info("DeviceStore", "No enabled adapters, using default empty provider");
        return;
      }

      // 取第一个启用的适配器
      const adapter = adapters[0];

      // 通过 dataSourceId 直接获取关联的数据源
      const ds = adapter.dataSourceId
        ? useDataSourceStore.getState().getDataSource(adapter.dataSourceId)
        : undefined;
      if (!ds) {
        logger.warn("DeviceStore", "No linked data source for adapter", { id: adapter.id, dataSourceId: adapter.dataSourceId });
        return;
      }

      const provider = new EdgeConductorProvider(adapter, ds);

      // 同步"connecting"状态到 dataSourceStore —— 用户能看到我们正在尝试连接
      useDataSourceStore.getState()._handleStatusChange(ds.id, "connecting");

      set({ activeAdapterId: adapter.id });
      await get().setProvider(provider, ds.id);
      logger.info("DeviceStore", "Auto-loaded from adapter", {
        adapterId: adapter.id,
        dataSourceId: ds.id,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("DeviceStore", "Auto-load from adapters failed", { error: msg });
    }
  },

  getDevice(deviceId) {
    return get().devices[deviceId];
  },
  getProduct(productCode) {
    return get().products[productCode];
  },
  getDevicesByCategory(category) {
    return Object.values(get().devices).filter((d) => d.category === category);
  },
  getChildren(parentId) {
    return Object.values(get().devices).filter((d) => d.parentDeviceId === parentId);
  },
  getRootDevices() {
    return Object.values(get().devices).filter((d) => !d.parentDeviceId);
  },
  getAllDevices() {
    return Object.values(get().devices);
  },

  /**
   * 🔗 级联在线判定（与 edge-conductor is_device_online() 对齐）
   *
   * 协议层级：服务器(2) → 喷雾集控器(18) → 分控器(18001) → 传感器(18010-18031)
   * 规则：父设备离线 → 子设备 effectiveOnline = false
   * fault 状态视为在线（通讯故障但物理连接仍在，与 edge-conductor 一致）
   *
   * 递归向上查父设备链，任一祖先离线则返回 false。
   * 集控器（无 parentDeviceId）直接返回自身 online。
   */
  getEffectiveOnline(deviceId: string): boolean {
    const devices = get().devices;
    const device = devices[deviceId];
    if (!device) return false;

    // 递归检查父设备链
    let current: DeviceInstance | undefined = device;
    const visited = new Set<string>(); // 防环
    while (current) {
      if (visited.has(current.deviceId)) break; // 检测到环，终止
      visited.add(current.deviceId);

      // fault 视为在线（与 edge-conductor is_device_online 一致）
      const status = (current.metadata as Record<string, unknown>)?.status as string | undefined;
      const isConsideredOnline = current.online || status === "fault";

      if (!isConsideredOnline) return false; // 某级祖先离线 → 子设备强制离线

      // 无父设备（集控器/根设备）→ 在线性已确认
      if (!current.parentDeviceId) break;
      current = devices[current.parentDeviceId];
    }
    return true;
  },

  addDevice(device) {
    set((state) => ({ devices: { ...state.devices, [device.deviceId]: device } }));
  },
  removeDevice(deviceId) {
    set((state) => {
      const next = { ...state.devices };
      delete next[deviceId];
      return { devices: next };
    });
  },
  updateDevice(deviceId, patch) {
    set((state) => {
      const existing = state.devices[deviceId];
      if (!existing) return {};
      return { devices: { ...state.devices, [deviceId]: { ...existing, ...patch } } };
    });
  },

  // === 增强：实时数据订阅转发（activeProvider 有则转发，没有返回 noop） ===
  subscribeData(deviceId, tagId, cb) {
    const provider = get().activeProvider;
    if (!provider || typeof (provider as any).subscribeData !== "function") {
      return () => undefined;
    }
    try {
      return (provider as any).subscribeData(deviceId, tagId, cb);
    } catch (err) {
      logger.debug("DeviceStore", "subscribeData forward failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      return () => undefined;
    }
  },

  // === 增强：控制命令转发（activeProvider 有则转发，否则 noop） ===
  async writeTag(deviceId, tagId, value) {
    const provider = get().activeProvider;
    if (!provider || typeof (provider as any).writeTag !== "function") {
      logger.debug("DeviceStore", "writeTag: provider has no writeTag", { deviceId, tagId });
      return;
    }
    try {
      await (provider as any).writeTag(deviceId, tagId, value);
    } catch (err) {
      logger.warn("DeviceStore", "writeTag forward failed", {
        error: err instanceof Error ? err.message : String(err),
        deviceId, tagId,
      });
    }
  },

  async sendCommand(deviceId, command, params = {}) {
    const provider = get().activeProvider;
    if (!provider || typeof (provider as any).sendCommand !== "function") {
      logger.debug("DeviceStore", "sendCommand: provider 不支持结构化命令", { deviceId, command });
      return { success: false, code: 501, msg: "当前数据源不支持结构化命令下发", commandCode: command, deviceId };
    }
    try {
      return await (provider as any).sendCommand(deviceId, command, params);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn("DeviceStore", "sendCommand forward failed", { error: msg, deviceId, command });
      return { success: false, code: 500, msg, commandCode: command, deviceId };
    }
  },

  // ─── 定时主动获取传感器实时状态（0x061d） ───
  // 周期 30s，遍历所有在线集控器(productCode=18)，发送 0x061d 命令
  // 设备收到后以 0x061e 返回完整实时状态，WebSocket 推送到前端
  // 这样即使设备不主动上报，前端也能定时获取最新传感器数据
  startRealtimePolling() {
    // 先停止已有定时器
    get().stopRealtimePolling();

    const POLL_INTERVAL = 30_000; // 30s
    const timer = setInterval(async () => {
      // 并发保护：上一轮还在执行时跳过本轮
      if (isPolling) return;
      isPolling = true;
      try {
      const devices = get().devices;
      const mcIds: string[] = [];
      for (const [id, d] of Object.entries(devices)) {
        const pc = String(d.productCode ?? "");
        if (pc === "18" || pc === "FY002-MainController") {
          const online = get().getEffectiveOnline(id);
          if (online) mcIds.push(id);
        }
      }
      if (mcIds.length === 0) return;

      logger.info("DeviceStore", "定时主动获取传感器实时状态", {
        mainControllerCount: mcIds.length,
        deviceIds: mcIds,
      });

      // 并行发送，不阻塞
      await Promise.allSettled(mcIds.map(id => get().sendCommand(id, "061d").catch(() => {})));
      } finally {
        isPolling = false;
      }
    }, POLL_INTERVAL);

    realtimePollingTimer = timer;
    logger.info("DeviceStore", "实时状态定时获取已启动", { intervalSec: 30 });
  },

  stopRealtimePolling() {
    if (realtimePollingTimer) {
      clearInterval(realtimePollingTimer);
      realtimePollingTimer = null;
      logger.info("DeviceStore", "实时状态定时获取已停止");
    }
  },
}));

/** 启动时自动加载：先尝试从适配器加载，否则用默认空 Provider */
let _autoLoaded = false;

export async function ensureDevicesLoaded() {
  if (_autoLoaded) return;
  _autoLoaded = true;
  // DEV 模式下交叉验证前端命令定义与协议文档一致性
  try {
    const { validateCommandDefsAgainstProtocol } = await import("../devices/deviceCommands");
    validateCommandDefsAgainstProtocol();
  } catch { /* swallow */ }
  // === 增强 P4：启动报警历史订阅（幂等；不阻塞主流程） ===
  // 非主窗口（组件预览/场景预览）不需要报警订阅和通知
  const path = typeof window !== "undefined" ? window.location.pathname : "";
  const isMainWindow = !path.startsWith("/component-preview/") && !path.startsWith("/preview/") && !path.startsWith("/map-editor/");
  if (isMainWindow) {
    try {
      const { useAlarmHistoryStore, loadAlarmPreferences } = await import("./alarmHistoryStore");
      useAlarmHistoryStore.getState().startSubscription();
      void useAlarmHistoryStore.getState().loadFromBackend();
      void loadAlarmPreferences();
    } catch { /* swallow */ }
  }
  await useDeviceStore.getState().autoLoadFromAdapters();
  // 启动定时主动获取传感器实时状态（30s 周期发送 0x061d）
  if (isMainWindow) {
    useDeviceStore.getState().startRealtimePolling();
  }
}
