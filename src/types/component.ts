export interface ComponentPluginItem {
  id: string;
  type: string;
  name: string;
  version: string;
  description?: string;
  icon?: string;
  iconOverride?: string;
  category: string;
  builtIn: boolean;
  enabled: boolean;
  author?: string;
  source?: "registry" | "db" | "merged";
}

export interface ComponentCategory {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  sortOrder: number;
  parentId?: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ComponentCategoryNode {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  sortOrder: number;
  parentId?: string;
  description?: string;
  children: ComponentCategoryNode[];
  plugins: ComponentPluginItem[];
}

/** 内置分组 ID 集合，不可删除 */
export const BUILTIN_CATEGORY_IDS = new Set([
  "ccat_basic",
  "ccat_layout",
  "ccat_form",
  "ccat_auth",
  "ccat_media",
  "ccat_table",
  "ccat_chart",
  "ccat_shape",
  "ccat_decoration",
  "ccat_icon",
]);
