/**
 * deviceAdapterStore — 设备接入配置管理
 *
 * 职责：
 * - 维护设备接入配置列表（只有解读规则，无认证）
 * - 提供接入的 CRUD 操作
 * - 通过 settingsApi 持久化到后端
 */
import { create } from "zustand";
import type { DeviceAdapter, DeviceAdapterType } from "../types/deviceAdapter";
import { createDefaultDeviceAdapter, EDGE_CONDUCTOR_DEFAULT_CATEGORY_MAPPING } from "../types/deviceAdapter";
import { settingsApi } from "../services/tauri";
import { logger } from "../utils/logger";

const SETTINGS_KEY = "device_adapters";

interface DeviceAdapterState {
  /** 适配器列表 */
  adapters: DeviceAdapter[];
  /** 是否正在加载 */
  isLoading: boolean;
  /** 错误信息 */
  error: string | null;

  // CRUD
  addAdapter: (type?: DeviceAdapterType, partial?: Partial<DeviceAdapter>) => DeviceAdapter;
  updateAdapter: (id: string, updates: Partial<DeviceAdapter>) => void;
  removeAdapter: (id: string) => void;
  setAdapterEnabled: (id: string, enabled: boolean) => void;

  // 查询
  getAdapter: (id: string) => DeviceAdapter | undefined;
  getEnabledAdapters: () => DeviceAdapter[];

  // 运行时状态
  updateRuntime: (id: string, runtime: Partial<NonNullable<DeviceAdapter["_runtime"]>>) => void;

  // 持久化
  loadFromBackend: () => Promise<void>;
  saveToBackend: () => Promise<void>;
}

export const useDeviceAdapterStore = create<DeviceAdapterState>((set, get) => ({
  adapters: [],
  isLoading: false,
  error: null,

  addAdapter(type = "edge-conductor", partial) {
    const adapter = createDefaultDeviceAdapter(type, partial);
    set((state) => ({ adapters: [...state.adapters, adapter] }));
    void get().saveToBackend();
    logger.info("DeviceAdapterStore", "Adapter added", { id: adapter.id, type: adapter.type });
    return adapter;
  },

  updateAdapter(id, updates) {
    set((state) => ({
      adapters: state.adapters.map((a) => (a.id === id ? { ...a, ...updates } : a)),
    }));
    void get().saveToBackend();
  },

  removeAdapter(id) {
    set((state) => ({ adapters: state.adapters.filter((a) => a.id !== id) }));
    void get().saveToBackend();
  },

  setAdapterEnabled(id, enabled) {
    set((state) => ({
      adapters: state.adapters.map((a) => (a.id === id ? { ...a, enabled } : a)),
    }));
    void get().saveToBackend();
  },

  getAdapter(id) {
    return get().adapters.find((a) => a.id === id);
  },

  getEnabledAdapters() {
    return get().adapters.filter((a) => a.enabled);
  },

  updateRuntime(id, runtime) {
    set((state) => ({
      adapters: state.adapters.map((a) =>
        a.id === id
          ? { ...a, _runtime: { ...a._runtime, ...runtime } }
          : a,
      ),
    }));
  },

  async loadFromBackend() {
    set({ isLoading: true, error: null });
    try {
      const raw = await settingsApi.get(SETTINGS_KEY);
      if (raw) {
        const saved: DeviceAdapter[] = JSON.parse(raw);
        // 合并持久化的 categoryMapping 与最新默认值
        // 后端 discovery API 可能返回新的 frontendCategory 值（如 "sub"/"main"），
        // 必须确保默认映射始终存在，否则 resolveCategory 会退化为 "auxiliary"
        const adapters: DeviceAdapter[] = saved.map((a) => ({
          ...a,
          categoryMapping: {
            ...(a.type === "edge-conductor" ? EDGE_CONDUCTOR_DEFAULT_CATEGORY_MAPPING : {}),
            ...(a.categoryMapping ?? {}),
          },
        }));
        set({ adapters, isLoading: false });
        logger.info("DeviceAdapterStore", "Loaded from backend", { count: adapters.length });
      } else {
        set({ isLoading: false });
        logger.info("DeviceAdapterStore", "No saved data, starting empty");
      }
    } catch (err) {
      logger.debug("DeviceAdapterStore", "Load failed, starting empty", { error: String(err) });
      set({ isLoading: false });
    }
  },

  async saveToBackend() {
    try {
      const adapters = get().adapters.map(({ _runtime, ...rest }) => rest);
      await settingsApi.set(SETTINGS_KEY, JSON.stringify(adapters));
    } catch (err) {
      logger.debug("DeviceAdapterStore", "Save failed", { error: String(err) });
    }
  },
}));
