import type { StateCreator } from "zustand";
import type { ComponentCategory } from "../../types/component";
import { BUILTIN_CATEGORY_IDS } from "../../types/component";
import { buildCategoryTree, isPluginInCategory } from "../../utils/componentTree";
import { logger } from "../../utils/logger";
import type { ComponentStore } from "./types";

type CategorySlice = Pick<
  ComponentStore,
  "createCategory" | "updateCategory" | "deleteCategory" | "deleteCategoryWithMigrate"
>;

export const createCategorySlice: StateCreator<ComponentStore, [], [], CategorySlice> = (set, get) => ({
  createCategory: async (partial?: Partial<ComponentCategory>) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const id = partial?.id ?? `ccat_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const payload = {
        id,
        name: partial?.name ?? "新分组",
        icon: partial?.icon,
        color: partial?.color ?? "#90CAF9",
        sortOrder: partial?.sortOrder ?? get().categories.length,
        parentId: partial?.parentId ?? null,
        description: partial?.description,
      };
      await invoke("create_component_category", { payload });

      await get().loadCategories();
      const created = get().categories.find((c) => c.id === id);
      return created ?? null;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  },

  updateCategory: async (id: string, updates: Partial<ComponentCategory>) => {
    const { categories, plugins } = get();
    const index = categories.findIndex((c) => c.id === id);
    if (index === -1) {
      logger.warn("ComponentStore", `updateCategory: category ${id} not found`);
      return;
    }

    const nextCategories = categories.map((c) =>
      c.id === id ? { ...c, ...updates, updatedAt: Math.floor(Date.now() / 1000) } : c
    );
    const nextTree = buildCategoryTree(nextCategories, plugins);
    set({ categories: nextCategories, categoryTree: nextTree });

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("update_component_category", {
        payload: {
          id,
          name: updates.name,
          icon: updates.icon,
          color: updates.color,
          sortOrder: updates.sortOrder,
          parentId: updates.parentId,
          description: updates.description,
        },
      });
      // 乐观更新已生效，不再 loadCategories（避免覆盖刚提交的 icon/color）
      // 万一持久化数据与本地不一致，下次手动 refresh() 时会矫正
    } catch (err) {
      logger.error("ComponentStore", `updateCategory: Tauri command failed`, { error: String(err) });
      set({
        categories,
        categoryTree: buildCategoryTree(categories, plugins),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  deleteCategory: async (id: string) => {
    if (BUILTIN_CATEGORY_IDS.has(id)) {
      set({ error: "无法删除内置分组" });
      return;
    }

    const { categories, plugins } = get();
    const prev = categories.find((c) => c.id === id);
    if (!prev) return;

    // 只允许删除没有组件的分组（使用统一的匹配逻辑）
    const categoryPlugins = plugins.filter((p) => isPluginInCategory(p, id));
    if (categoryPlugins.length > 0) {
      set({ error: `分组「${prev.name}」下还有 ${categoryPlugins.length} 个组件，请先移除或移动组件后再删除` });
      return;
    }

    const nextCategories = categories.filter((c) => c.id !== id);
    const nextTree = buildCategoryTree(nextCategories, plugins);
    set({ categories: nextCategories, categoryTree: nextTree });

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("delete_component_category", { id });
    } catch (err) {
      // 回滚
      set({
        categories: [...categories].sort((a, b) => a.sortOrder - b.sortOrder),
        categoryTree: buildCategoryTree(categories, plugins),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  deleteCategoryWithMigrate: async (id: string, targetCatId: string) => {
    if (BUILTIN_CATEGORY_IDS.has(id)) {
      set({ error: "无法删除内置分组" });
      return;
    }
    const { categories, plugins } = get();
    if (!categories.some((c) => c.id === id)) return;

    // 收集需迁移的组件
    const toMigrate = plugins.filter((p) => isPluginInCategory(p, id)).map((p) => p.type);

    // 1. 先迁移组件
    if (toMigrate.length > 0) {
      await get().movePluginsToCategory(toMigrate, targetCatId);
    }

    // 2. 再删分组
    const { categories: latestCategories, plugins: latestPlugins } = get();
    const nextCategories = latestCategories.filter((c) => c.id !== id);
    const nextTree = buildCategoryTree(nextCategories, latestPlugins);
    set({ categories: nextCategories, categoryTree: nextTree });

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("delete_component_category", { id });
    } catch (err) {
      // 回滚
      set({
        categories: [...latestCategories].sort((a, b) => a.sortOrder - b.sortOrder),
        categoryTree: buildCategoryTree(latestCategories, latestPlugins),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
});