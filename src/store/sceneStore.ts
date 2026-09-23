import { create } from "zustand";
import type { SceneDSL, SceneCategory } from "../types/scene";
import { createDefaultScene } from "../types/scene";
import { sceneApi } from "../services/tauri";
import { logger } from "../utils/logger";
import { getSite, updateSite } from "../core/services/cms.service";

const DEFAULT_CATEGORY_ID = "cat_default";

/** 防重入：并发 loadScenes 调用复用同一个 Promise */
let _loadScenesPromise: Promise<void> | null = null;

const DEFAULT_CATEGORY: SceneCategory = {
  id: DEFAULT_CATEGORY_ID,
  name: "默认分组",
  icon: "folder",
  color: "#757575",
  sortOrder: -1,
  description: "未指定分类的网站",
  createdAt: Math.floor(Date.now() / 1000),
  updatedAt: Math.floor(Date.now() / 1000),
};

interface SceneState {
  scenes: SceneDSL[];
  categories: SceneCategory[];
  activeSceneId: string | null;
  isLoading: boolean;
  initialized: boolean;
  error: string | null;

  loadScenes: () => Promise<void>;
  loadCategories: () => Promise<void>;
  init: () => Promise<void>;
  setActiveScene: (id: string) => void;
  getActiveScene: () => SceneDSL | null;

  createScene: (partial?: Partial<SceneDSL>) => Promise<SceneDSL>;
  updateScene: (id: string, updates: Partial<SceneDSL>) => Promise<void>;
  deleteScene: (id: string) => Promise<void>;
  duplicateScene: (id: string) => Promise<SceneDSL | null>;

  createCategory: (partial?: Partial<SceneCategory>) => Promise<SceneCategory>;
  updateCategory: (id: string, updates: Partial<SceneCategory>) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;

  saveScene: (scene: SceneDSL) => Promise<void>;
  publishScene: (id: string) => Promise<void>;
  unpublishScene: (id: string) => Promise<void>;
  bindSite: (sceneId: string, siteId: string | null) => Promise<void>;
  setLocalWorkDir: (sceneId: string, dir: string | null) => Promise<void>;
}

export const useSceneStore = create<SceneState>((set, get) => ({
  scenes: [],
  categories: [],
  activeSceneId: null,
  isLoading: false,
  initialized: false,
  error: null,

  /** 一次性初始化：加载分类 + 加载场景(含缩略图迁移) + 如果无场景则自动创建默认场景 */
  init: async () => {
    if (get().initialized) return;
    set({ isLoading: true, error: null });

    try {
      // 1. 加载分类
      let categories: SceneCategory[] = [];
      try {
        categories = await sceneApi.listCategories();
        const hasDefault = categories.some((c) => c.id === DEFAULT_CATEGORY_ID);
        if (!hasDefault) {
          try {
            await sceneApi.saveCategory(DEFAULT_CATEGORY);
            categories = [DEFAULT_CATEGORY, ...categories];
          } catch {
            categories = [DEFAULT_CATEGORY, ...categories];
          }
        }
      } catch {
        categories = [DEFAULT_CATEGORY];
      }
      set({ categories });

      // 2. 加载场景（含缩略图迁移，复用 loadScenes）
      await get().loadScenes();
      const scenes = get().scenes;

      // 3. 如果无场景，自动创建默认场景
      if (scenes.length === 0) {
        logger.info("SceneStore", "No scenes found, creating default scene");
        const defaultScene = createDefaultScene({
          name: "我的网站",
          categoryId: DEFAULT_CATEGORY_ID,
        });
        try {
          await sceneApi.create(defaultScene);
          set({
            scenes: [defaultScene],
            activeSceneId: defaultScene.id,
          });
        } catch (err) {
          logger.error("SceneStore", "Failed to create default scene", { error: String(err) });
        }
      } else if (!get().activeSceneId) {
        // 4. 如果有场景但无 active scene，选中第一个
        set({ activeSceneId: scenes[0].id });
      }

      set({ initialized: true, isLoading: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("SceneStore", "init failed", { error: msg });
      set({ error: msg, isLoading: false, initialized: true });
    }
  },

  loadScenes: async () => {
    // 防重入：如果已有 loadScenes 在进行中，复用同一个 Promise
    if (_loadScenesPromise) return _loadScenesPromise;

    _loadScenesPromise = (async () => {
      set({ isLoading: true, error: null });
      try {
        const scenes = await sceneApi.list();
        // 缩略图迁移：本地路径 → data URL（使用守卫版 invoke）
        const migrated = await Promise.all(
          scenes.map(async (scene) => {
            if (
              scene.thumbnail &&
              !scene.thumbnail.startsWith("data:") &&
              !scene.thumbnail.startsWith("linear-gradient(") &&
              (scene.thumbnail.startsWith("/") || scene.thumbnail.startsWith("file://"))
            ) {
              try {
                const dataUrl = await sceneApi.readFileAsDataUrl(scene.thumbnail);
                return { ...scene, thumbnail: dataUrl };
              } catch {
                // 忽略，保留原值
              }
            }
            return scene;
          })
        );
        logger.info("SceneStore", "Scenes loaded", { count: migrated.length });
        set({ scenes: migrated, isLoading: false });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error("SceneStore", "Failed to load scenes", { error: msg });
        set({ error: msg, isLoading: false });
      } finally {
        _loadScenesPromise = null;
      }
    })();

    return _loadScenesPromise;
  },

  loadCategories: async () => {
    try {
      let categories = await sceneApi.listCategories();
      const hasDefault = categories.some((c) => c.id === DEFAULT_CATEGORY_ID);
      if (!hasDefault) {
        try {
          await sceneApi.saveCategory(DEFAULT_CATEGORY);
          categories = [DEFAULT_CATEGORY, ...categories];
        } catch {
          categories = [DEFAULT_CATEGORY, ...categories];
        }
      }
      set({ categories });
    } catch (err) {
      set({ categories: [DEFAULT_CATEGORY], error: err instanceof Error ? err.message : String(err) });
    }
  },

  setActiveScene: (id: string) => {
    set({ activeSceneId: id });
  },

  getActiveScene: () => {
    const { scenes, activeSceneId } = get();
    if (!activeSceneId) return null;
    return scenes.find((s) => s.id === activeSceneId) ?? null;
  },

  createScene: async (partial?: Partial<SceneDSL>) => {
    const scene = createDefaultScene(partial);
    if (!scene.categoryId) {
      scene.categoryId = DEFAULT_CATEGORY_ID;
    }

    try {
      await sceneApi.create(scene);
      logger.info("SceneStore", "Scene created", { sceneId: scene.id, name: scene.name });
      set((state) => ({
        scenes: [scene, ...state.scenes],
        activeSceneId: scene.id,
      }));
      return scene;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  },

  updateScene: async (id: string, updates: Partial<SceneDSL>) => {
    const { scenes } = get();
    const index = scenes.findIndex((s) => s.id === id);
    if (index === -1) return;

    const originalScene = scenes[index];
    const updatedScene: SceneDSL = {
      ...originalScene,
      ...updates,
      updatedAt: Math.floor(Date.now() / 1000),
    };

    set((state) => ({
      scenes: state.scenes.map((s) => (s.id === id ? updatedScene : s)),
    }));

    try {
      await sceneApi.update(updatedScene);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("SceneStore", "Failed to update scene", { sceneId: id, error: msg });
      // 回滚
      set((state) => ({
        scenes: state.scenes.map((s) => (s.id === id ? originalScene : s)),
        error: msg,
      }));
      throw err;
    }
  },

  deleteScene: async (id: string) => {
    const { scenes, activeSceneId } = get();
    const sceneToDelete = scenes.find((s) => s.id === id);
    if (!sceneToDelete) return;

    const remainingScenes = scenes.filter((s) => s.id !== id);
    set({
      scenes: remainingScenes,
      activeSceneId: activeSceneId === id ? (remainingScenes[0]?.id ?? null) : activeSceneId,
    });

    try {
      await sceneApi.delete(id);
    } catch (err) {
      // 回滚
      set({
        scenes: [sceneToDelete, ...remainingScenes].sort((a, b) => b.updatedAt - a.updatedAt),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  duplicateScene: async (id: string) => {
    const { scenes } = get();
    const source = scenes.find((s) => s.id === id);
    if (!source) return null;

    const now = Date.now();
    const duplicated: SceneDSL = {
      ...source,
      id: `scene_${now}_${Math.random().toString(36).substring(2, 8)}`,
      name: `${source.name} (副本)`,
      status: "draft",
      publishedAt: undefined,
      createdAt: Math.floor(now / 1000),
      updatedAt: Math.floor(now / 1000),
      views: source.views ? JSON.parse(JSON.stringify(source.views)) : undefined,
      globalComponents: source.globalComponents ? JSON.parse(JSON.stringify(source.globalComponents)) : undefined,
      editorComponents: source.editorComponents ? JSON.parse(JSON.stringify(source.editorComponents)) : undefined,
      editorLayers: source.editorLayers ? JSON.parse(JSON.stringify(source.editorLayers)) : undefined,
      canvasConfig: source.canvasConfig ? JSON.parse(JSON.stringify(source.canvasConfig)) : undefined,
    };

    try {
      await sceneApi.create(duplicated);
      set((state) => ({
        scenes: [duplicated, ...state.scenes],
      }));
      return duplicated;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  },

  createCategory: async (partial?: Partial<SceneCategory>) => {
    const now = Math.floor(Date.now() / 1000);
    const category: SceneCategory = {
      id: `cat_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      name: "新分组",
      icon: "folder",
      sortOrder: get().categories.length,
      createdAt: now,
      updatedAt: now,
      ...partial,
    };

    try {
      await sceneApi.saveCategory(category);
      set((state) => ({
        categories: [...state.categories, category],
      }));
      return category;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  },

  updateCategory: async (id: string, updates: Partial<SceneCategory>) => {
    const { categories } = get();
    const index = categories.findIndex((c) => c.id === id);
    if (index === -1) return;

    const updatedCategory = {
      ...categories[index],
      ...updates,
      updatedAt: Math.floor(Date.now() / 1000),
    };

    set((state) => ({
      categories: state.categories.map((c) => (c.id === id ? updatedCategory : c)),
    }));

    try {
      await sceneApi.saveCategory(updatedCategory);
    } catch (err) {
      set((state) => ({
        categories: state.categories.map((c) => (c.id === id ? categories[index] : c)),
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  },

  deleteCategory: async (id: string) => {
    if (id === DEFAULT_CATEGORY_ID) return;

    const { categories, scenes } = get();
    const categoryToDelete = categories.find((c) => c.id === id);
    if (!categoryToDelete) return;

    const affectedScenes = scenes.filter((s) => s.categoryId === id);
    const updatedScenes = affectedScenes.map((s) => ({
      ...s,
      categoryId: DEFAULT_CATEGORY_ID,
    }));

    set((state) => ({
      categories: state.categories.filter((c) => c.id !== id),
      scenes: state.scenes.map((s) => {
        const updated = updatedScenes.find((u) => u.id === s.id);
        return updated || s;
      }),
    }));

    try {
      await sceneApi.deleteCategory(id);
      for (const scene of updatedScenes) {
        await sceneApi.update(scene);
      }
    } catch (err) {
      set((state) => ({
        categories: [categoryToDelete, ...state.categories].sort((a, b) => a.sortOrder - b.sortOrder),
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  },

  saveScene: async (scene: SceneDSL) => {
    try {
      const synced: SceneDSL = {
        ...scene,
        updatedAt: Math.floor(Date.now() / 1000),
      };
      await sceneApi.update(synced);
      set((state) => ({
        scenes: state.scenes.map((s) => (s.id === synced.id ? synced : s)),
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  },

  publishScene: async (id: string) => {
    const { scenes } = get();
    const scene = scenes.find((s) => s.id === id);
    if (!scene) return;

    const now = Math.floor(Date.now() / 1000);
    const updatedScene: SceneDSL = {
      ...scene,
      status: "published",
      publishedAt: now,
      updatedAt: now,
    };

    set((state) => ({
      scenes: state.scenes.map((s) => (s.id === id ? updatedScene : s)),
    }));

    try {
      await sceneApi.update(updatedScene);
      logger.info("SceneStore", "Scene published", { sceneId: id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("SceneStore", "Failed to publish scene", { sceneId: id, error: msg });
      set((state) => ({
        scenes: state.scenes.map((s) => (s.id === id ? scene : s)),
        error: msg,
      }));
    }
  },

  unpublishScene: async (id: string) => {
    const { scenes } = get();
    const scene = scenes.find((s) => s.id === id);
    if (!scene) return;

    const updatedScene: SceneDSL = {
      ...scene,
      status: "draft",
      updatedAt: Math.floor(Date.now() / 1000),
    };

    set((state) => ({
      scenes: state.scenes.map((s) => (s.id === id ? updatedScene : s)),
    }));

    try {
      await sceneApi.update(updatedScene);
      logger.info("SceneStore", "Scene unpublished", { sceneId: id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("SceneStore", "Failed to unpublish scene", { sceneId: id, error: msg });
      set((state) => ({
        scenes: state.scenes.map((s) => (s.id === id ? scene : s)),
        error: msg,
      }));
    }
  },

  bindSite: async (sceneId: string, siteId: string | null) => {
    const { scenes } = get();
    const scene = scenes.find((s) => s.id === sceneId);
    if (!scene) return;
    const updated: SceneDSL = {
      ...scene,
      metadata: { ...scene.metadata, boundSiteId: siteId ?? undefined },
      updatedAt: Math.floor(Date.now() / 1000),
    };
    set((state) => ({
      scenes: state.scenes.map((s) => (s.id === sceneId ? updated : s)),
    }));
    try {
      await sceneApi.update(updated);

      // 联动：绑定时把场景的 localWorkDir 同步到站点（场景是源头）
      const sceneWorkDir = updated.metadata?.localWorkDir as string | undefined;
      if (siteId && sceneWorkDir) {
        try {
          const site = await getSite(siteId);
          if (site && site.local_workdir !== sceneWorkDir) {
            await updateSite({ ...site, local_workdir: sceneWorkDir });
            logger.info("SceneStore", "Site local_workdir synced on bind", { sceneId, siteId, sceneWorkDir });
          }
        } catch (err) {
          logger.warn("SceneStore", "Failed to sync site local_workdir on bind", { error: String(err) });
        }
      }

      logger.info("SceneStore", "Site bound", { sceneId, siteId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set((state) => ({
        scenes: state.scenes.map((s) => (s.id === sceneId ? scene : s)),
        error: msg,
      }));
    }
  },

  setLocalWorkDir: async (sceneId: string, dir: string | null) => {
    const { scenes } = get();
    const scene = scenes.find((s) => s.id === sceneId);
    if (!scene) return;
    const updated: SceneDSL = {
      ...scene,
      metadata: { ...scene.metadata, localWorkDir: dir ?? undefined },
      updatedAt: Math.floor(Date.now() / 1000),
    };
    set((state) => ({
      scenes: state.scenes.map((s) => (s.id === sceneId ? updated : s)),
    }));
    try {
      await sceneApi.update(updated);

      // 联动：同步更新已绑定站点的 local_workdir
      const boundSiteId = updated.metadata?.boundSiteId as string | undefined;
      if (boundSiteId && dir) {
        try {
          const site = await getSite(boundSiteId);
          if (site && site.local_workdir !== dir) {
            await updateSite({ ...site, local_workdir: dir });
            logger.info("SceneStore", "Site local_workdir synced", { sceneId, boundSiteId, dir });
          }
        } catch (err) {
          logger.warn("SceneStore", "Failed to sync site local_workdir", { error: String(err) });
        }
      }

      logger.info("SceneStore", "Local work dir set", { sceneId, dir });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set((state) => ({
        scenes: state.scenes.map((s) => (s.id === sceneId ? scene : s)),
        error: msg,
      }));
    }
  },
}));
