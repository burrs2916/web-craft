import type { StateCreator } from "zustand";
import { buildCategoryTree } from "../../utils/componentTree";
import { componentRegistry } from "../../editor/registry";
import { clearIconCache } from "../../editor/plugins/IconResolver";
import { logger } from "../../utils/logger";
import { upsertPluginRecord } from "./upsertPluginRecord";
import type { ComponentStore } from "./types";

type UiSlice = Pick<
  ComponentStore,
  | "setActiveCategoryId"
  | "setThumbnailUpdatedAt"
  | "getDefinition"
  | "getPluginByType"
  | "syncIconFromPreviewWindow"
>;

export const createUiSlice: StateCreator<ComponentStore, [], [], UiSlice> = (set, get) => ({
  setActiveCategoryId: (id: string | null) => {
    set({ activeCategoryId: id });
  },

  setThumbnailUpdatedAt: (componentType: string, timestamp: number) => {
    set((state) => ({
      thumbnailUpdatedAt: {
        ...state.thumbnailUpdatedAt,
        [componentType]: timestamp,
      },
    }));
  },

  getDefinition: (type: string) => {
    return componentRegistry.get(type);
  },

  getPluginByType: (type: string) => {
    return get().plugins.find((p) => p.type === type);
  },

  syncIconFromPreviewWindow: (pluginType: string, icon: string, name?: string, description?: string | null) => {
    componentRegistry.setIconOverride(pluginType, icon);
    clearIconCache(); // 清除图标缓存，确保 UI 立即刷新
    const { plugins, categories } = get();
    const now = Date.now();
    const updatedPlugins = plugins.map((p) =>
      p.type === pluginType
        ? {
            ...p,
            iconOverride: icon,
            source: "merged" as const,
            ...(name != null ? { name } : {}),
            ...(description !== undefined ? { description: description ?? "" } : {}),
          }
        : p
    );
    set({
      plugins: updatedPlugins,
      enabledPlugins: updatedPlugins.filter((p) => p.enabled),
      categoryTree: buildCategoryTree(categories, updatedPlugins),
      thumbnailUpdatedAt: {
        ...get().thumbnailUpdatedAt,
        [pluginType]: now,
      },
    });

    // 持久化到数据库（异步，不阻塞 UI）
    (async () => {
      try {
        const fields: Record<string, unknown> = { icon };
        if (name !== undefined) fields.name = name;
        if (description !== undefined) fields.description = description ?? null;

        const target = get().plugins.find((p) => p.type === pluginType);
        await upsertPluginRecord(pluginType, fields, {
          name: name ?? target?.name ?? pluginType,
          icon,
          description: description ?? target?.description ?? undefined,
          category: target?.category,
          builtIn: target?.builtIn ?? false,
          enabled: target?.enabled ?? true,
        });
      } catch (err) {
        logger.warn("ComponentStore", "syncIconFromPreviewWindow: failed to persist", { error: String(err) });
      }
    })();
  },
});