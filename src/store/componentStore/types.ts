import type { ComponentCategory, ComponentCategoryNode, ComponentPluginItem } from "../../types/component";
import type { ComponentDefinition } from "../../types/editor";

export interface ComponentStore {
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

export interface DbCategoryRecord {
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

export interface DbPluginRecord {
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

export interface DbPluginModel {
  id: string;
  type: string;
  category: string;
  enabled: boolean;
  builtIn: boolean;
  dbIcon?: string;
  name?: string;
  description?: string;
  author?: string;
}