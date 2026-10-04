import { create } from "zustand";
import type { ComponentStore } from "./types";
import { createLoadSlice } from "./loadSlice";
import { createCategorySlice } from "./categorySlice";
import { createPluginSlice } from "./pluginSlice";
import { createUiSlice } from "./uiSlice";

export type { ComponentStore } from "./types";

export const useComponentStore = create<ComponentStore>()((...a) => ({
  categories: [],
  categoryTree: [],
  plugins: [],
  enabledPlugins: [],
  isLoading: false,
  error: null,
  activeCategoryId: null,
  thumbnailUpdatedAt: {},

  ...createLoadSlice(...a),
  ...createCategorySlice(...a),
  ...createPluginSlice(...a),
  ...createUiSlice(...a),
}));