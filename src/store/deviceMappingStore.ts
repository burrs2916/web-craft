/**
 * deviceMappingStore — 设备映射配置管理
 *
 * 职责：
 * - 维护产品级别的 DeviceMapping 配置
 * - 提供映射的 CRUD 操作
 * - 映射与 ProductDefinition 一一对应（productCode 为键）
 */
import { create } from "zustand";
import type { DeviceMapping, TagBinding, ControlBinding } from "../types/deviceMapping";
import { createDefaultTagBinding, createDefaultControlBinding } from "../types/deviceMapping";
import { settingsApi } from "../services/tauri";
import { logger } from "../utils/logger";

const SETTINGS_KEY = "device_mappings";

interface DeviceMappingState {
  /** 按 productCode 索引的映射配置 */
  mappings: Record<string, DeviceMapping>;

  // CRUD
  getMapping(productCode: string): DeviceMapping | undefined;
  setMapping(mapping: DeviceMapping): void;
  removeMapping(productCode: string): void;

  // Tag 绑定操作
  addTagBinding(productCode: string): TagBinding;
  updateTagBinding(productCode: string, bindingId: string, patch: Partial<TagBinding>): void;
  removeTagBinding(productCode: string, bindingId: string): void;

  // 控制绑定操作
  addControlBinding(productCode: string): ControlBinding;
  updateControlBinding(productCode: string, bindingId: string, patch: Partial<ControlBinding>): void;
  removeControlBinding(productCode: string, bindingId: string): void;

  // 批量操作
  importMappings(mappings: DeviceMapping[]): void;
  exportMappings(): DeviceMapping[];

  // 持久化
  loadFromBackend(): Promise<void>;
  saveToBackend(): Promise<void>;
}

export const useDeviceMappingStore = create<DeviceMappingState>((set, get) => ({
  mappings: {},

  getMapping(productCode) {
    return get().mappings[productCode];
  },

  setMapping(mapping) {
    set((state) => ({
      mappings: { ...state.mappings, [mapping.productCode]: mapping },
    }));
    void get().saveToBackend();
    logger.info("DeviceMappingStore", "Mapping saved", { productCode: mapping.productCode, componentType: mapping.componentType });
  },

  removeMapping(productCode) {
    set((state) => {
      const next = { ...state.mappings };
      delete next[productCode];
      return { mappings: next };
    });
    void get().saveToBackend();
  },

  addTagBinding(productCode) {
    const binding = createDefaultTagBinding();
    set((state) => {
      const existing = state.mappings[productCode];
      if (!existing) return {};
      return {
        mappings: {
          ...state.mappings,
          [productCode]: {
            ...existing,
            tagBindings: [...existing.tagBindings, binding],
          },
        },
      };
    });
    return binding;
  },

  updateTagBinding(productCode, bindingId, patch) {
    set((state) => {
      const existing = state.mappings[productCode];
      if (!existing) return {};
      return {
        mappings: {
          ...state.mappings,
          [productCode]: {
            ...existing,
            tagBindings: existing.tagBindings.map((b) =>
              b.id === bindingId ? { ...b, ...patch } : b
            ),
          },
        },
      };
    });
  },

  removeTagBinding(productCode, bindingId) {
    set((state) => {
      const existing = state.mappings[productCode];
      if (!existing) return {};
      return {
        mappings: {
          ...state.mappings,
          [productCode]: {
            ...existing,
            tagBindings: existing.tagBindings.filter((b) => b.id !== bindingId),
          },
        },
      };
    });
  },

  addControlBinding(productCode) {
    const binding = createDefaultControlBinding();
    set((state) => {
      const existing = state.mappings[productCode];
      if (!existing) return {};
      return {
        mappings: {
          ...state.mappings,
          [productCode]: {
            ...existing,
            controlBindings: [...existing.controlBindings, binding],
          },
        },
      };
    });
    return binding;
  },

  updateControlBinding(productCode, bindingId, patch) {
    set((state) => {
      const existing = state.mappings[productCode];
      if (!existing) return {};
      return {
        mappings: {
          ...state.mappings,
          [productCode]: {
            ...existing,
            controlBindings: existing.controlBindings.map((b) =>
              b.id === bindingId ? { ...b, ...patch } : b
            ),
          },
        },
      };
    });
  },

  removeControlBinding(productCode, bindingId) {
    set((state) => {
      const existing = state.mappings[productCode];
      if (!existing) return {};
      return {
        mappings: {
          ...state.mappings,
          [productCode]: {
            ...existing,
            controlBindings: existing.controlBindings.filter((b) => b.id !== bindingId),
          },
        },
      };
    });
  },

  importMappings(mappings) {
    set((state) => {
      const next = { ...state.mappings };
      for (const m of mappings) {
        next[m.productCode] = m;
      }
      return { mappings: next };
    });
    void get().saveToBackend();
  },

  exportMappings() {
    return Object.values(get().mappings);
  },

  async loadFromBackend() {
    try {
      const raw = await settingsApi.get(SETTINGS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as DeviceMapping[] | Record<string, DeviceMapping>;
      const list = Array.isArray(parsed) ? parsed : Object.values(parsed);
      const mappings: Record<string, DeviceMapping> = {};
      for (const mapping of list) {
        if (mapping?.productCode) mappings[mapping.productCode] = mapping;
      }
      set({ mappings });
      logger.info("DeviceMappingStore", "Loaded from backend", { count: list.length });
    } catch (err) {
      logger.debug("DeviceMappingStore", "Load failed, starting empty", { error: String(err) });
    }
  },

  async saveToBackend() {
    try {
      await settingsApi.set(SETTINGS_KEY, JSON.stringify(Object.values(get().mappings)));
    } catch (err) {
      logger.debug("DeviceMappingStore", "Save failed", { error: String(err) });
    }
  },
}));
