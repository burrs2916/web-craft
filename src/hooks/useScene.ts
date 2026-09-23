// @ts-nocheck
import { useCallback } from "react";
import { useSceneStore } from "../store/sceneStore";
import { sceneApi } from "../services/tauri";
import { createDefaultSceneLayer } from "../types/scene";
import type { SceneDSL, SceneLayer, SceneConfig, SceneBinding } from "../types/scene";
import type { CameraConfig } from "../types/spatial";
import { createDefaultCamera } from "../types/spatial";

interface UseSceneReturn {
  scene: SceneDSL | null;
  layers: SceneLayer[];
  config: SceneConfig;
  isLoading: boolean;
  error: string | null;
  loadScene: (sceneId: string) => Promise<void>;
  saveScene: () => Promise<void>;
  addLayer: (layer?: Partial<SceneLayer>) => void;
  updateLayer: (id: string, updates: Partial<SceneLayer>) => void;
  removeLayer: (id: string) => void;
  toggleLayerVisibility: (id: string) => void;
  reorderLayers: (fromIndex: number, toIndex: number) => void;
  addBinding: (binding: SceneBinding) => void;
  removeBinding: (id: string) => void;
  setCamera: (camera: Partial<CameraConfig>) => void;
  setConfig: (config: Partial<SceneConfig>) => void;
}

export function useScene(sceneId?: string): UseSceneReturn {
  const { scenes, activeSceneId, updateScene, isLoading, error } = useSceneStore();

  const activeSceneIdFinal = sceneId || activeSceneId;
  const scene = scenes.find((s) => s.id === activeSceneIdFinal) ?? null;
  const layers = scene?.layers ?? [];

  const config: SceneConfig = {
    coordinateSystem: scene?.coordinateSystem ?? "EPSG:3857",
    bounds: scene?.bounds,
    camera: scene?.camera ?? createDefaultCamera(),
  };

  const loadScene = useCallback(async (id: string) => {
    try {
      await sceneApi.get(id);
    } catch {
      // error handled in store
    }
  }, []);

  const saveScene = useCallback(async () => {
    if (!scene) return;
    try {
      await sceneApi.update(scene);
    } catch {
      // error handled in store
    }
  }, [scene]);

  const addLayer = useCallback(
    (partial?: Partial<SceneLayer>) => {
      if (!scene) return;
      const layer = createDefaultSceneLayer(partial);
      updateScene(scene.id, { layers: [...scene.layers, layer] });
    },
    [scene, updateScene]
  );

  const updateLayer = useCallback(
    (id: string, updates: Partial<SceneLayer>) => {
      if (!scene) return;
      updateScene(scene.id, {
        layers: scene.layers.map((layer) =>
          layer.id === id ? { ...layer, ...updates } : layer
        ),
      });
    },
    [scene, updateScene]
  );

  const removeLayer = useCallback(
    (id: string) => {
      if (!scene) return;
      updateScene(scene.id, {
        layers: scene.layers.filter((layer) => layer.id !== id),
      });
    },
    [scene, updateScene]
  );

  const toggleLayerVisibility = useCallback(
    (id: string) => {
      if (!scene) return;
      updateScene(scene.id, {
        layers: scene.layers.map((layer) =>
          layer.id === id ? { ...layer, visible: !layer.visible } : layer
        ),
      });
    },
    [scene, updateScene]
  );

  const reorderLayers = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (!scene) return;
      const newLayers = [...scene.layers];
      const [removed] = newLayers.splice(fromIndex, 1);
      newLayers.splice(toIndex, 0, removed);
      updateScene(scene.id, {
        layers: newLayers.map((layer, index) => ({
          ...layer,
          zIndex: index,
        })),
      });
    },
    [scene, updateScene]
  );

  const addBinding = useCallback(
    (binding: SceneBinding) => {
      if (!scene) return;
      updateScene(scene.id, { bindings: [...scene.bindings, binding] });
    },
    [scene, updateScene]
  );

  const removeBinding = useCallback(
    (id: string) => {
      if (!scene) return;
      updateScene(scene.id, {
        bindings: scene.bindings.filter((b) => b.id !== id),
      });
    },
    [scene, updateScene]
  );

  const setCamera = useCallback(
    (camera: Partial<CameraConfig>) => {
      if (!scene) return;
      updateScene(scene.id, {
        camera: { ...scene.camera, ...camera } as CameraConfig,
      });
    },
    [scene, updateScene]
  );

  const setConfig = useCallback(
    (newConfig: Partial<SceneConfig>) => {
      if (!scene) return;
      const updates: Partial<SceneDSL> = {};
      if (newConfig.coordinateSystem) updates.coordinateSystem = newConfig.coordinateSystem;
      if (newConfig.bounds) updates.bounds = newConfig.bounds;
      if (newConfig.camera) updates.camera = { ...scene.camera, ...newConfig.camera } as CameraConfig;
      updateScene(scene.id, updates);
    },
    [scene, updateScene]
  );

  return {
    scene,
    layers,
    config,
    isLoading,
    error,
    loadScene,
    saveScene,
    addLayer,
    updateLayer,
    removeLayer,
    toggleLayerVisibility,
    reorderLayers,
    addBinding,
    removeBinding,
    setCamera,
    setConfig,
  };
}
