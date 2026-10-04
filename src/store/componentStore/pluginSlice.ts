import type { StateCreator } from "zustand";
import { buildCategoryTree } from "../../utils/componentTree";
import { componentRegistry } from "../../editor/registry";
import { clearIconCache } from "../../editor/plugins/IconResolver";
import { rendererCache } from "../../editor/plugins/PluginLoader";
import { logger } from "../../utils/logger";
import { upsertPluginRecord } from "./upsertPluginRecord";
import type { ComponentStore } from "./types";

type PluginSlice = Pick<
  ComponentStore,
  | "togglePlugin"
  | "movePluginToCategory"
  | "movePluginsToCategory"
  | "togglePluginsBatch"
  | "updatePluginMeta"
  | "installPlugin"
  | "uninstallPlugin"
>;

export const createPluginSlice: StateCreator<ComponentStore, [], [], PluginSlice> = (set, get) => ({
  togglePlugin: async (id: string, enabled: boolean) => {
    const { plugins } = get();
    const target = plugins.find((p) => p.id === id || p.type === id);
    if (!target) return;
    const typeKey = target.type;

    // 乐观更新 UI
    const updatedPlugins = plugins.map((p) => (p.type === typeKey ? { ...p, enabled } : p));
    set({
      plugins: updatedPlugins,
      enabledPlugins: updatedPlugins.filter((p) => p.enabled),
    });

    try {
      await upsertPluginRecord(typeKey, { enabled }, {
        name: target.name,
        category: target.category,
        builtIn: target.builtIn,
      });

      const def = componentRegistry.get(typeKey);
      if (def) def.enabled = enabled;
    } catch (err) {
      // 回滚
      set({
        plugins,
        enabledPlugins: plugins.filter((p) => p.enabled),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  movePluginToCategory: async (pluginId: string, categoryId: string) => {
    const { plugins, categories } = get();
    const target = plugins.find((p) => p.id === pluginId || p.type === pluginId);
    if (!target) return;
    const typeKey = target.type;

    // 乐观更新 UI
    const nextPlugins = plugins.map((p) =>
      p.type === typeKey ? { ...p, category: categoryId } : p
    );
    const nextTree = buildCategoryTree(categories, nextPlugins);
    set({ plugins: nextPlugins, enabledPlugins: nextPlugins.filter((p) => p.enabled), categoryTree: nextTree });

    try {
      await upsertPluginRecord(typeKey, { category: categoryId }, {
        name: target.name,
        category: categoryId,
        builtIn: target.builtIn,
        enabled: target.enabled,
      });
    } catch (err) {
      // 回滚
      set({
        plugins,
        enabledPlugins: plugins.filter((p) => p.enabled),
        categoryTree: buildCategoryTree(categories, plugins),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  movePluginsToCategory: async (pluginTypes: string[], categoryId: string) => {
    if (pluginTypes.length === 0) return;
    const { plugins, categories } = get();
    const typeSet = new Set(pluginTypes);

    // 乐观更新
    const nextPlugins = plugins.map((p) =>
      typeSet.has(p.type) ? { ...p, category: categoryId } : p
    );
    const nextTree = buildCategoryTree(categories, nextPlugins);
    set({ plugins: nextPlugins, enabledPlugins: nextPlugins.filter((p) => p.enabled), categoryTree: nextTree });

    // 并行持久化（失败不回滚单条，整体回滚太复杂；后续 refresh 会矫正）
    const results = await Promise.allSettled(
      pluginTypes.map((type) => {
        const target = plugins.find((p) => p.type === type);
        return upsertPluginRecord(type, { category: categoryId }, {
          name: target?.name,
          category: categoryId,
          builtIn: target?.builtIn,
          enabled: target?.enabled,
        });
      })
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) {
      logger.warn("componentStore", `批量移动: ${failed}/${pluginTypes.length} 个组件持久化失败`);
    }
  },

  togglePluginsBatch: async (pluginTypes: string[], enabled: boolean) => {
    if (pluginTypes.length === 0) return;
    const { plugins, categories } = get();
    const typeSet = new Set(pluginTypes);

    const nextPlugins = plugins.map((p) =>
      typeSet.has(p.type) ? { ...p, enabled } : p
    );
    const nextTree = buildCategoryTree(categories, nextPlugins);
    set({ plugins: nextPlugins, enabledPlugins: nextPlugins.filter((p) => p.enabled), categoryTree: nextTree });

    // 同步到 registry（场景编辑器组件库需要）
    for (const type of pluginTypes) {
      const def = componentRegistry.get(type);
      if (def) def.enabled = enabled;
    }

    const results = await Promise.allSettled(
      pluginTypes.map((type) => {
        const target = plugins.find((p) => p.type === type);
        return upsertPluginRecord(type, { enabled }, {
          name: target?.name,
          category: target?.category,
          builtIn: target?.builtIn,
          enabled,
        });
      })
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) {
      logger.warn("componentStore", `批量切换启用: ${failed}/${pluginTypes.length} 个组件持久化失败`);
    }
  },

  updatePluginMeta: async (pluginType: string, updates: { name?: string; icon?: string | null; description?: string | null }) => {
    const { plugins } = get();
    const target = plugins.find((p) => p.type === pluginType);
    if (!target) return;
    const prev = { ...target };

    const nextIcon =
      updates.icon === null
        ? undefined
        : updates.icon !== undefined
        ? updates.icon
        : target.iconOverride;

    componentRegistry.setIconOverride(pluginType, nextIcon ?? null);
    clearIconCache(); // 清除图标缓存，确保 UI 立即刷新

    // 同步更新 store 中的 name/description/iconOverride
    const updatedPlugins = plugins.map((p) =>
      p.type === pluginType
        ? {
            ...p,
            iconOverride: nextIcon,
            source: "merged" as const,
            ...(updates.name !== undefined ? { name: updates.name } : {}),
            ...(updates.description !== undefined ? { description: updates.description ?? "" } : {}),
          }
        : p
    );
    set({
      plugins: updatedPlugins,
      enabledPlugins: updatedPlugins.filter((p) => p.enabled),
    });

    try {
      const fields: Record<string, unknown> = {
        icon: nextIcon ?? null,
      };
      if (updates.name !== undefined) fields.name = updates.name;
      if (updates.description !== undefined) fields.description = updates.description ?? null;

      await upsertPluginRecord(pluginType, fields, {
        name: updates.name ?? target.name,
        icon: nextIcon ?? undefined,
        description: updates.description ?? target.description ?? undefined,
        category: target.category,
        builtIn: target.builtIn,
        enabled: target.enabled,
      });
    } catch (err) {
      componentRegistry.setIconOverride(pluginType, prev.iconOverride ?? null);
      set({
        plugins: plugins.map((p) => (p.type === pluginType ? prev : p)),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  installPlugin: async (manifest: any) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const payload = {
        pluginType: manifest.type,
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        icon: manifest.icon,
        category: manifest.category,
        defaultSize: JSON.stringify(manifest.defaultSize),
        defaultConfig: JSON.stringify(manifest.defaultConfig),
        capabilities: JSON.stringify(manifest.capabilities),
        configSchema: manifest.configSchema ? JSON.stringify(manifest.configSchema) : undefined,
        events: manifest.events ? JSON.stringify(manifest.events) : undefined,
        actions: manifest.actions ? JSON.stringify(manifest.actions) : undefined,
        dataSchema: manifest.dataSchema ? JSON.stringify(manifest.dataSchema) : undefined,
        rendererEntry: manifest.renderer?.entry,
        rendererFormat: manifest.renderer?.format,
        dependencies: manifest.dependencies ? JSON.stringify(manifest.dependencies) : undefined,
        permissions: manifest.permissions ? JSON.stringify(manifest.permissions) : undefined,
        author: manifest.author,
        homepage: manifest.homepage,
        thumbnail: manifest.thumbnail,
      };
      await invoke("create_component_plugin", { payload });
      await get().refresh();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  uninstallPlugin: async (id: string) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const { plugins } = get();
      const plugin = plugins.find((p) => p.id === id || p.type === id);
      const typeKey = plugin?.type ?? id;

      // 通过 type 查找 DB 记录获取正确的 id
      try {
        const existing = await invoke<{ id: string } | null>("get_component_plugin_by_type", { pluginType: typeKey });
        if (existing) {
          await invoke("delete_component_plugin", { id: existing.id });
        }
      } catch {
        // fallback: 直接用传入的 id
        await invoke("delete_component_plugin", { id });
      }
      if (plugin) {
        componentRegistry.unregister(typeKey);
        rendererCache.invalidate(typeKey);
      }
      await get().refresh();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },
});