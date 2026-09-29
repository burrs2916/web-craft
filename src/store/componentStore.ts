import { create } from "zustand";
import type { ComponentCategory, ComponentCategoryNode, ComponentPluginItem } from "../types/component";
import { BUILTIN_CATEGORY_IDS } from "../types/component";
import { buildCategoryTree, isPluginInCategory } from "../utils/componentTree";
import { componentRegistry } from "../editor/registry";
import { clearIconCache } from "../editor/plugins/IconResolver";
import { rendererCache } from "../editor/plugins/PluginLoader";
import { logger } from "../utils/logger";
import { parseIconSource } from "../utils/iconSource";
import type { ComponentDefinition } from "../types/editor";

/** 内置"基础组件"分类 — 纯前端注入 */
const BASIC_CATEGORY: ComponentCategory = {
  id: "ccat_basic",
  name: "基础组件",
  icon: "text_fields",
  color: "#90CAF9",
  sortOrder: 10,
  description: "文本、图片等基础元素",
  createdAt: 0,
  updatedAt: 0,
};

/** 内置"布局组件"分类 — 纯前端注入 */
const LAYOUT_CATEGORY: ComponentCategory = {
  id: "ccat_layout",
  name: "布局组件",
  icon: "view_quilt",
  color: "#A5D6A7",
  sortOrder: 15,
  description: "容器、栅格、导航栏等布局元素",
  createdAt: 0,
  updatedAt: 0,
};

/** 内置"表单组件"分类 — 纯前端注入 */
const FORM_CATEGORY: ComponentCategory = {
  id: "ccat_form",
  name: "表单组件",
  icon: "input",
  color: "#CE93D8",
  sortOrder: 20,
  description: "按钮、输入框、选择器等交互元素",
  createdAt: 0,
  updatedAt: 0,
};

/** 内置"认证组件"分类 — 纯前端注入 */
const AUTH_CATEGORY: ComponentCategory = {
  id: "ccat_auth",
  name: "认证组件",
  icon: "lock",
  color: "#FF7043",
  sortOrder: 25,
  description: "登录、注册、OAuth、SSO 等用户认证组件",
  createdAt: 0,
  updatedAt: 0,
};

/** 内置"媒体组件"分类 — 纯前端注入 */
const MEDIA_CATEGORY: ComponentCategory = {
  id: "ccat_media",
  name: "媒体组件",
  icon: "movie",
  color: "#FFD54F",
  sortOrder: 30,
  description: "图片、视频、音频等原生多媒体元素",
  createdAt: 0,
  updatedAt: 0,
};

/** 内置"外部嵌入"分类 — 纯前端注入 */
const EMBED_CATEGORY: ComponentCategory = {
  id: "ccat_embed",
  name: "外部嵌入",
  icon: "web",
  color: "#81D4FA",
  sortOrder: 35,
  description: "网页嵌入、第三方内容容器等非原生媒体嵌入组件",
  createdAt: 0,
  updatedAt: 0,
};

/** 内置"图表组件"分类 — 纯前端注入 */
const CHART_CATEGORY: ComponentCategory = {
  id: "ccat_chart",
  name: "图表组件",
  icon: "bar_chart",
  color: "#FFAB91",
  sortOrder: 40,
  description: "柱状图、饼图、折线图、仪表盘等数据可视化组件",
  createdAt: 0,
  updatedAt: 0,
};

/** 内置"形状组件"分类 — 纯前端注入 */
const SHAPE_CATEGORY: ComponentCategory = {
  id: "ccat_shape",
  name: "形状组件",
  icon: "category",
  color: "#80DEEA",
  sortOrder: 50,
  description: "矩形、圆形、线条、箭头等基础形状",
  createdAt: 0,
  updatedAt: 0,
};

/** 内置"表格组件"分类 — 纯前端注入 */
const TABLE_CATEGORY: ComponentCategory = {
  id: "ccat_table",
  name: "表格组件",
  icon: "table_chart",
  color: "#AED581",
  sortOrder: 35,
  description: "表格、数据网格等结构化数据展示组件",
  createdAt: 0,
  updatedAt: 0,
};

/** 内置"装饰组件"分类 — 纯前端注入 */
const DECORATION_CATEGORY: ComponentCategory = {
  id: "ccat_decoration",
  name: "装饰组件",
  icon: "auto_awesome",
  color: "#B39DDB",
  sortOrder: 45,
  description: "边框、分割线、渐变、图案等页面装饰元素",
  createdAt: 0,
  updatedAt: 0,
};

/** 内置"图标组件"分类 — 纯前端注入 */
const ICON_CATEGORY: ComponentCategory = {
  id: "ccat_icon",
  name: "图标组件",
  icon: "star",
  color: "#F48FB1",
  sortOrder: 47,
  description: "单图标、图标列表、图标按钮等图标元素",
  createdAt: 0,
  updatedAt: 0,
};

function ensureCategory(categories: ComponentCategory[], cat: ComponentCategory) {
  if (categories.some((c) => c.id === cat.id)) return;
  categories.push({ ...cat });
}

/** 注入全部内置分类（网站编辑器） */
function ensureBuiltinCategories(categories: ComponentCategory[]) {
  ensureCategory(categories, BASIC_CATEGORY);
  ensureCategory(categories, LAYOUT_CATEGORY);
  ensureCategory(categories, FORM_CATEGORY);
  ensureCategory(categories, AUTH_CATEGORY);
  ensureCategory(categories, MEDIA_CATEGORY);
  ensureCategory(categories, EMBED_CATEGORY);
  ensureCategory(categories, TABLE_CATEGORY);
  ensureCategory(categories, CHART_CATEGORY);
  ensureCategory(categories, ICON_CATEGORY);
  ensureCategory(categories, DECORATION_CATEGORY);
  ensureCategory(categories, SHAPE_CATEGORY);
}

/** 统一的插件记录 upsert：先 try update，失败则查找后 update/create */
async function upsertPluginRecord(
  pluginType: string,
  fields: Record<string, unknown>,
  defaults?: { name?: string; category?: string; builtIn?: boolean; enabled?: boolean; icon?: string; description?: string }
): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  try {
    await invoke("update_component_plugin", {
      payload: { id: `plugin_pref_${pluginType}`, ...fields },
    });
  } catch {
    const exists = await invoke<{ id: string } | null>("get_component_plugin_by_type", { pluginType });
    if (exists) {
      await invoke("update_component_plugin", {
        payload: { id: exists.id, ...fields },
      });
    } else {
      await invoke("create_component_plugin", {
        payload: {
          pluginType,
          name: defaults?.name ?? componentRegistry.get(pluginType)?.name ?? pluginType,
          category: defaults?.category,
          builtIn: defaults?.builtIn ?? false,
          enabled: defaults?.enabled ?? true,
          icon: defaults?.icon,
          description: defaults?.description ?? null,
          ...fields,
        },
      });
    }
  }
}

interface ComponentStore {
  categories: ComponentCategory[];
  categoryTree: ComponentCategoryNode[];
  plugins: ComponentPluginItem[];
  enabledPlugins: ComponentPluginItem[];
  isLoading: boolean;
  error: string | null;
  activeCategoryId: string | null;
  thumbnailUpdatedAt: Record<string, number>;

  loadCategories: () => Promise<void>;
  loadPlugins: () => Promise<void>;
  refresh: () => Promise<void>;

  createCategory: (partial?: Partial<ComponentCategory>) => Promise<ComponentCategory | null>;
  updateCategory: (id: string, updates: Partial<ComponentCategory>) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  /** 删除分组并把分组内组件迁移到目标分组（targetCatId 为空字符串则迁移到未分组） */
  deleteCategoryWithMigrate: (id: string, targetCatId: string) => Promise<void>;

  togglePlugin: (id: string, enabled: boolean) => Promise<void>;
  movePluginToCategory: (pluginId: string, categoryId: string) => Promise<void>;
  /** 批量移动组件到指定分组 */
  movePluginsToCategory: (pluginTypes: string[], categoryId: string) => Promise<void>;
  /** 批量启用/禁用组件 */
  togglePluginsBatch: (pluginTypes: string[], enabled: boolean) => Promise<void>;
  updatePluginMeta: (pluginType: string, updates: { name?: string; icon?: string | null; description?: string | null }) => Promise<void>;
  installPlugin: (manifest: any) => Promise<void>;
  uninstallPlugin: (id: string) => Promise<void>;

  setActiveCategoryId: (id: string | null) => void;
  setThumbnailUpdatedAt: (componentType: string, timestamp: number) => void;

  getDefinition: (type: string) => ComponentDefinition | undefined;
  getPluginByType: (type: string) => ComponentPluginItem | undefined;
  syncIconFromPreviewWindow: (pluginType: string, icon: string, name?: string, description?: string | null) => void;
}

interface DbCategoryRecord {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  sort_order?: number;
  sortOrder?: number;
  parent_id?: string;
  parentId?: string;
  description?: string;
  created_at?: number;
  createdAt?: number;
  updated_at?: number;
  updatedAt?: number;
}

interface DbPluginRecord {
  id: string;
  plugin_type?: string;
  pluginType?: string;
  type?: string;
  name?: string;
  version?: string;
  description?: string;
  icon?: string;
  category?: string;
  built_in?: number | boolean;
  builtIn?: number | boolean;
  enabled?: number | boolean;
  author?: string;
  thumbnail?: string;
}

function dbCategoryToModel(c: DbCategoryRecord): ComponentCategory {
  return {
    id: c.id,
    name: c.name,
    icon: c.icon,
    color: c.color,
    sortOrder: c.sortOrder ?? c.sort_order ?? 0,
    parentId: c.parentId ?? c.parent_id ?? undefined,
    description: c.description,
    createdAt: c.createdAt ?? c.created_at ?? 0,
    updatedAt: c.updatedAt ?? c.updated_at ?? 0,
  };
}

function dbRecordToDbPlugin(p: DbPluginRecord): {
  id: string;
  type: string;
  category: string;
  enabled: boolean;
  builtIn: boolean;
  dbIcon?: string;
  name?: string;
  description?: string;
  author?: string;
} {
  return {
    id: p.id,
    type: p.pluginType ?? p.plugin_type ?? p.type ?? "",
    category: p.category ?? "",
    enabled: p.enabled === undefined ? true : Boolean(p.enabled),
    builtIn: p.builtIn === undefined ? Boolean(p.built_in) : Boolean(p.builtIn),
    dbIcon: p.icon || undefined,
    name: p.name || undefined,
    description: p.description || undefined,
    author: p.author || undefined,
  };
}

function mergePluginWithRegistry(
  def: ComponentDefinition,
  dbRecord: ReturnType<typeof dbRecordToDbPlugin> | undefined
): ComponentPluginItem {
  // 只有当数据库的 icon 与注册定义的默认 icon 语义不同时，才视为用户覆盖
  // 使用 parseIconSource 归一化比较：裸字符串 "bar_chart" 和 "material:bar_chart" 等价
  const regIcon = typeof def.icon === "string" ? def.icon : "widgets";
  let iconOverride: string | undefined;
  if (dbRecord?.dbIcon) {
    const regParsed = parseIconSource(regIcon);
    const dbParsed = parseIconSource(dbRecord.dbIcon);
    let isSameIcon = false;
    if (regParsed.kind === dbParsed.kind) {
      if (regParsed.kind === "material" && dbParsed.kind === "material") {
        isSameIcon = regParsed.name === dbParsed.name;
      } else if (regParsed.kind === "thumbnail" && dbParsed.kind === "thumbnail") {
        isSameIcon = true;
      } else if (regParsed.kind === "text" && dbParsed.kind === "text") {
        isSameIcon = regParsed.content === dbParsed.content;
      } else if (regParsed.kind === "color" && dbParsed.kind === "color") {
        isSameIcon = regParsed.color === dbParsed.color;
      }
    }
    iconOverride = isSameIcon ? undefined : dbRecord.dbIcon;
  }
  return {
    id: dbRecord?.id ?? def.type,
    type: def.type,
    // 当数据库 name 等于 pluginType 或匹配脏数据模式（如 "DataV边框1"、"DataV装饰3"）时，
    // 视为"未设置"，fallback 到注册定义名称
    name: (dbRecord?.name && dbRecord.name !== def.type && !/^(DataV边框|DataV装饰)\d+$/.test(dbRecord.name)) ? dbRecord.name : def.name,
    version: def.version,
    description: dbRecord?.description ?? def.description,
    icon: def.icon,
    iconOverride,
    category: dbRecord?.category || def.category,
    builtIn: def.builtIn ?? dbRecord?.builtIn ?? false,
    enabled: dbRecord?.enabled ?? def.enabled !== false,
    author: dbRecord?.author,
    source: dbRecord ? "merged" : "registry",
  };
}

export const useComponentStore = create<ComponentStore>((set, get) => ({
  categories: [],
  categoryTree: [],
  plugins: [],
  enabledPlugins: [],
  isLoading: false,
  error: null,
  activeCategoryId: null,
  thumbnailUpdatedAt: {},

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
    const dbRecordMap = new Map<string, ReturnType<typeof dbRecordToDbPlugin>>();

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
      const { pluginLoader } = await import("../editor/plugins");
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
}));
