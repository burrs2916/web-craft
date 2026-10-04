import { invoke } from "./invoke";
import { logger } from "../../utils/logger";
import type { SceneDSL, SceneCategory } from "../../types/scene";

interface PersistedScene {
  id: string;
  name: string;
  description?: string;
  coordinateSystem: string;
  camera: string;
  bounds?: string;
  layers: string;
  bindings: string;
  variables?: string;
  layout: string;
  editorComponents?: string;
  editorLayers?: string;
  canvasConfig?: string;
  globalComponents?: string;
  views?: string;
  activeViewId?: string;
  viewportSyncRules?: string;
  categoryId?: string;
  tags: string;
  thumbnail?: string;
  status: string;
  publishedAt?: number;
  metadata: string;
  createdAt: number;
  updatedAt: number;
}

function toPersistedScene(scene: SceneDSL): PersistedScene {
  return {
    id: scene.id,
    name: scene.name,
    description: scene.description,
    coordinateSystem: scene.coordinateSystem ?? "",
    camera: JSON.stringify(scene.camera ?? {}),
    bounds: scene.bounds ? JSON.stringify(scene.bounds) : undefined,
    layers: JSON.stringify(scene.layers ?? []),
    bindings: JSON.stringify(scene.bindings ?? []),
    variables: scene.variables ? JSON.stringify(scene.variables) : undefined,
    layout: JSON.stringify(scene.layout ?? []),
    editorComponents: scene.editorComponents ? JSON.stringify(scene.editorComponents) : undefined,
    editorLayers: scene.editorLayers ? JSON.stringify(scene.editorLayers) : undefined,
    canvasConfig: scene.canvasConfig ? JSON.stringify(scene.canvasConfig) : undefined,
    globalComponents: scene.globalComponents ? JSON.stringify(scene.globalComponents) : undefined,
    views: scene.views ? JSON.stringify(scene.views) : undefined,
    activeViewId: scene.activeViewId || undefined,
    viewportSyncRules: scene.viewportSyncRules ? JSON.stringify(scene.viewportSyncRules) : undefined,
    categoryId: scene.categoryId,
    tags: JSON.stringify(scene.tags ?? []),
    thumbnail: scene.thumbnail,
    status: scene.status,
    publishedAt: scene.publishedAt,
    metadata: JSON.stringify(scene.metadata ?? {}),
    createdAt: scene.createdAt,
    updatedAt: scene.updatedAt,
  };
}

function toSceneDSL(persisted: PersistedScene): SceneDSL {
  return {
    id: persisted.id,
    name: persisted.name,
    description: persisted.description,
    coordinateSystem: persisted.coordinateSystem as SceneDSL["coordinateSystem"],
    camera: JSON.parse(persisted.camera || "{}"),
    bounds: persisted.bounds ? JSON.parse(persisted.bounds) : undefined,
    layers: JSON.parse(persisted.layers || "[]"),
    bindings: JSON.parse(persisted.bindings || "[]"),
    variables: persisted.variables ? JSON.parse(persisted.variables) : undefined,
    layout: JSON.parse(persisted.layout || "[]"),
    editorComponents: persisted.editorComponents ? JSON.parse(persisted.editorComponents) : undefined,
    editorLayers: persisted.editorLayers ? JSON.parse(persisted.editorLayers) : undefined,
    canvasConfig: persisted.canvasConfig ? JSON.parse(persisted.canvasConfig) : undefined,
    globalComponents: persisted.globalComponents ? JSON.parse(persisted.globalComponents) : undefined,
    views: persisted.views ? JSON.parse(persisted.views) : undefined,
    activeViewId: persisted.activeViewId || undefined,
    viewportSyncRules: persisted.viewportSyncRules ? JSON.parse(persisted.viewportSyncRules) : undefined,
    categoryId: persisted.categoryId,
    tags: JSON.parse(persisted.tags || "[]"),
    thumbnail: persisted.thumbnail,
    status: (persisted.status || "draft") as SceneDSL["status"],
    publishedAt: persisted.publishedAt,
    metadata: JSON.parse(persisted.metadata || "{}"),
    createdAt: persisted.createdAt,
    updatedAt: persisted.updatedAt,
  };
}

export const sceneApi = {
  async list(): Promise<SceneDSL[]> {
    const result = await invoke<PersistedScene[]>("get_all_scenes");
    return result.map(toSceneDSL);
  },

  async get(id: string): Promise<SceneDSL | null> {
    const result = await invoke<PersistedScene | null>("get_scene", { id });
    if (!result) return null;
    return toSceneDSL(result);
  },

  async listByCategory(categoryId: string): Promise<SceneDSL[]> {
    const result = await invoke<PersistedScene[]>("get_scenes_by_category", { categoryId });
    return result.map(toSceneDSL);
  },

  async create(scene: SceneDSL): Promise<void> {
    const persisted = toPersistedScene(scene);
    logger.info("SceneApi", "Invoking create_scene", { id: persisted.id, name: persisted.name, thumbnail: persisted.thumbnail });
    return invoke("create_scene", { scene: persisted });
  },

  async update(scene: SceneDSL): Promise<void> {
    const persisted = toPersistedScene(scene);
    logger.info("SceneApi", "Invoking update_scene", { id: persisted.id, name: persisted.name, thumbnail: persisted.thumbnail });
    return invoke("update_scene", { scene: persisted });
  },

  async delete(id: string): Promise<void> {
    logger.info("SceneApi", "Invoking delete_scene", { id });
    return invoke("delete_scene", { id });
  },

  async listCategories(): Promise<SceneCategory[]> {
    return invoke("get_all_categories");
  },

  async getCategory(id: string): Promise<SceneCategory | null> {
    return invoke("get_category", { id });
  },

  async saveCategory(category: SceneCategory): Promise<void> {
    return invoke("save_category", { category });
  },

  async deleteCategory(id: string): Promise<void> {
    return invoke("delete_category", { id });
  },

  async readFileAsDataUrl(filePath: string): Promise<string> {
    return invoke<string>("read_file_as_data_url", { filePath });
  },
};