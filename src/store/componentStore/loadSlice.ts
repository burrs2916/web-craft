import type { StateCreator } from "zustand";
import type { ComponentCategory, ComponentPluginItem } from "../../types/component";
import { buildCategoryTree } from "../../utils/componentTree";
import { componentRegistry } from "../../editor/registry";
import { logger } from "../../utils/logger";
import { parseIconSource } from "../../utils/iconSource";
import { ensureBuiltinCategories } from "./builtinCategories";
import { dbCategoryToModel, dbRecordToDbPlugin, mergePluginWithRegistry } from "./dbMappers";
import type { ComponentStore, DbCategoryRecord, DbPluginRecord, DbPluginModel } from "./types";

type LoadSlice = Pick<ComponentStore, "loadCategories" | "loadPlugins" | "refresh">;

export const createLoadSlice: StateCreator<ComponentStore, [], [], LoadSlice> = (set, get) => ({
  loadCategories: async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const raw = await invoke<DbCategoryRecord[]>("get_component_categories");
      const categories = raw.map(dbCategoryToModel);

      // 注入全部内置分类（网站编辑器）
      ensureBuiltinCategories(categories);

      const { plugins } = get();
      const categoryTree = buildCategoryTree(categories, plugins);

      set({ categories, categoryTree });
    } catch (err) {
      logger.warn("ComponentStore", "Failed to load categories from DB", { error: String(err) });
      const { plugins } = get();
      const categories: ComponentCategory[] = [];
      ensureBuiltinCategories(categories);
      const categoryTree = buildCategoryTree(categories, plugins);
      set({ categories, categoryTree });
    }
  },

  loadPlugins: async () => {
    const registryDefs = componentRegistry.getAll();
    const dbRecordMap = new Map<string, DbPluginModel>();

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const [allRaw] = await Promise.all([
        invoke<DbPluginRecord[]>("get_all_component_plugins"),
      ]);
      for (const p of allRaw ?? []) {
        const normalized = dbRecordToDbPlugin(p);
        if (normalized.type) {
          dbRecordMap.set(normalized.type, normalized);
        }
      }
    } catch (err) {
      logger.warn("ComponentStore", "Failed to load plugin preferences from DB, using registry defaults", { error: String(err) });
    }

    const plugins: ComponentPluginItem[] = registryDefs.map((def) => {
      const dbRecord = dbRecordMap.get(def.type);
      // 设置 iconOverride 到 registry，用于 resolveIcon
      // 使用与 mergePluginWithRegistry 相同的归一化比较逻辑
      const regIcon = typeof def.icon === "string" ? def.icon : "widgets";
      let iconOvr: string | null = null;
      if (dbRecord?.dbIcon) {
        const regParsed = parseIconSource(regIcon);
        const dbParsed = parseIconSource(dbRecord.dbIcon);
        let isSameIcon = false;
        if (regParsed.kind === dbParsed.kind) {
          if (regParsed.kind === "material" && dbParsed.kind === "material") isSameIcon = regParsed.name === dbParsed.name;
          else if (regParsed.kind === "thumbnail" && dbParsed.kind === "thumbnail") isSameIcon = true;
          else if (regParsed.kind === "text" && dbParsed.kind === "text") isSameIcon = regParsed.content === dbParsed.content;
          else if (regParsed.kind === "color" && dbParsed.kind === "color") isSameIcon = regParsed.color === dbParsed.color;
        }
        iconOvr = isSameIcon ? null : dbRecord.dbIcon;
      }
      componentRegistry.setIconOverride(def.type, iconOvr);
      return mergePluginWithRegistry(def, dbRecord);
    });

    // 清理数据库中旧的 EC-* 孤立记录（productCodeMapping 未匹配时生成的临时组件）
    const registryTypes = new Set(registryDefs.map((d) => d.type));
    const orphanTypes: string[] = [];
    for (const [type] of dbRecordMap) {
      if (!registryTypes.has(type) && type.startsWith("device:EC-")) {
        orphanTypes.push(type);
      }
    }
    if (orphanTypes.length > 0) {
      logger.info("ComponentStore", "Cleaning up orphan EC-* device records from DB", { count: orphanTypes.length, types: orphanTypes });
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const deleteOps = orphanTypes
          .map((type) => dbRecordMap.get(type)?.id)
          .filter((id): id is string => !!id)
          .map((id) => invoke("delete_component_plugin", { id }).catch(() => {}));
        await Promise.allSettled(deleteOps);
      } catch (err) {
        logger.warn("ComponentStore", "Failed to clean up orphan EC-* records", { error: String(err) });
      }
    }

    const enabledPlugins = plugins.filter((p) => p.enabled);

    const { categories } = get();
    // categories 通常由 loadCategories 预加载，仅在为空时 fallback
    const categoryTree = buildCategoryTree(categories, plugins);
    set({ plugins, enabledPlugins, categories, categoryTree });
  },

  refresh: async () => {
    set({ isLoading: true, error: null });
    try {
      // 确保内置组件已注册到 componentRegistry
      // 否则 loadPlugins() 看不到任何组件，所有分组都会为空
      const { pluginLoader } = await import("../../editor/plugins");
      await pluginLoader.initialize().catch((err) => {
        logger.warn("ComponentStore", "pluginLoader.initialize failed, continuing with registry as-is", { error: String(err) });
      });

      await get().loadCategories();
      await get().loadPlugins();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      set({ isLoading: false });
    }
  },
});