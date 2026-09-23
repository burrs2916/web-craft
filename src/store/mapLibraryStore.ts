import { create } from "zustand";
import type { MapLibrary, MapLibraryGroup, MapLibraryType } from "../types/mapLibrary";
import type { CadDocument } from "../editor/cad/types";
import { logger } from "../utils/logger";

interface MapLibraryStore {
  libraries: MapLibrary[];
  groups: MapLibraryGroup[];
  isLoading: boolean;
  error: string | null;
  activeLibraryId: string | null;
  activeTypeFilter: MapLibraryType | null;

  loadLibraries: () => Promise<void>;
  loadByType: (mapType: MapLibraryType) => Promise<void>;
  loadPublished: () => Promise<void>;
  loadPublishedByType: (mapType: MapLibraryType) => Promise<void>;

  loadGroups: (mapType: MapLibraryType) => Promise<void>;
  createGroup: (name: string, description: string | null, mapType: MapLibraryType, parentId?: string) => Promise<MapLibraryGroup | null>;
  updateGroup: (id: string, name: string, description: string | null) => Promise<MapLibraryGroup | null>;
  deleteGroup: (id: string) => Promise<void>;
  moveLibraryToGroup: (libraryId: string, groupId: string | null) => Promise<void>;

  importCadFile: (data: number[], fileName: string, name: string, targetCrs?: string) => Promise<MapLibrary | null>;
  importCadFilePath: (filePath: string, name: string) => Promise<MapLibrary | null>;
  importCadDoc: (doc: CadDocument, fileName: string, name: string, sourceBytes?: number[] | null, targetCrs?: string) => Promise<MapLibrary | null>;
  createTileLibrary: (name: string, description: string | null, tileUrl: string, tileType: string | null, minZoom: number | null, maxZoom: number | null, coordinateSystem: string | null, apiKey: string | null) => Promise<MapLibrary | null>;
  createBlueprintLibrary: (name: string, description: string | null, imagePath: string, bounds: string, coordinateSystem: string | null) => Promise<MapLibrary | null>;

  saveLibrary: (library: MapLibrary) => Promise<void>;
  deleteLibrary: (id: string) => Promise<void>;
  publishLibrary: (id: string) => Promise<MapLibrary | null>;
  unpublishLibrary: (id: string) => Promise<MapLibrary | null>;

  setActiveLibraryId: (id: string | null) => void;
  setActiveTypeFilter: (mapType: MapLibraryType | null) => void;
}

export const useMapLibraryStore = create<MapLibraryStore>((set, get) => ({
  libraries: [],
  groups: [],
  isLoading: false,
  error: null,
  activeLibraryId: null,
  activeTypeFilter: null,

  loadLibraries: async () => {
    set({ isLoading: true, error: null });
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const libraries = await invoke<MapLibrary[]>("get_all_map_libraries");
      set({ libraries, isLoading: false });
    } catch (err) {
      logger.warn("MapLibraryStore", "Failed to load libraries", { error: String(err) });
      set({ error: String(err), isLoading: false });
    }
  },

  loadByType: async (mapType: MapLibraryType) => {
    set({ isLoading: true, error: null });
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const libraries = await invoke<MapLibrary[]>("get_map_libraries_by_type", { mapType });
      set({ libraries, isLoading: false });
    } catch (err) {
      logger.warn("MapLibraryStore", "Failed to load libraries by type", { error: String(err) });
      set({ error: String(err), isLoading: false });
    }
  },

  loadPublished: async () => {
    set({ isLoading: true, error: null });
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const libraries = await invoke<MapLibrary[]>("get_published_map_libraries");
      set({ libraries, isLoading: false });
    } catch (err) {
      logger.warn("MapLibraryStore", "Failed to load published libraries", { error: String(err) });
      set({ error: String(err), isLoading: false });
    }
  },

  loadPublishedByType: async (mapType: MapLibraryType) => {
    set({ isLoading: true, error: null });
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const libraries = await invoke<MapLibrary[]>("get_published_map_libraries_by_type", { mapType });
      set({ libraries, isLoading: false });
    } catch (err) {
      logger.warn("MapLibraryStore", "Failed to load published libraries by type", { error: String(err) });
      set({ error: String(err), isLoading: false });
    }
  },

  loadGroups: async (mapType: MapLibraryType) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const groups = await invoke<MapLibraryGroup[]>("get_map_library_groups", { mapType });
      set({ groups });
    } catch (err) {
      logger.warn("MapLibraryStore", "Failed to load groups", { error: String(err) });
    }
  },

  createGroup: async (name, description, mapType, parentId) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const group = await invoke<MapLibraryGroup>("create_map_library_group", {
        name,
        description: description || null,
        mapType,
        parentId: parentId || null,
      });
      await get().loadGroups(mapType);
      return group;
    } catch (err) {
      logger.error("MapLibraryStore", "Failed to create group", { error: String(err) });
      set({ error: String(err) });
      return null;
    }
  },

  updateGroup: async (id, name, description) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const group = await invoke<MapLibraryGroup>("update_map_library_group", {
        id,
        name,
        description: description || null,
      });
      const activeType = get().activeTypeFilter || "cad";
      await get().loadGroups(activeType as MapLibraryType);
      return group;
    } catch (err) {
      logger.error("MapLibraryStore", "Failed to update group", { error: String(err) });
      set({ error: String(err) });
      return null;
    }
  },

  deleteGroup: async (id: string) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("delete_map_library_group", { id });
      const activeType = get().activeTypeFilter || "cad";
      await get().loadGroups(activeType as MapLibraryType);
      await get().loadLibraries();
    } catch (err) {
      logger.error("MapLibraryStore", "Failed to delete group", { error: String(err) });
      set({ error: String(err) });
    }
  },

  moveLibraryToGroup: async (libraryId: string, groupId: string | null) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("move_library_to_group", { libraryId, groupId });
      await get().loadLibraries();
    } catch (err) {
      logger.error("MapLibraryStore", "Failed to move library", { error: String(err) });
      set({ error: String(err) });
    }
  },

  importCadFile: async (data: number[], fileName: string, name: string, targetCrs?: string) => {
    set({ isLoading: true, error: null });
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const library = await invoke<MapLibrary>("import_cad_to_map_library", {
        data,
        fileName,
        name,
        targetCrs: targetCrs || null,
      });
      await get().loadLibraries();
      set({ isLoading: false });
      return library;
    } catch (err) {
      logger.error("MapLibraryStore", "Failed to import CAD file", { error: String(err) });
      set({ error: String(err), isLoading: false });
      return null;
    }
  },

  importCadFilePath: async (filePath: string, name: string) => {
    set({ isLoading: true, error: null });
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const library = await invoke<MapLibrary>("import_cad_file_to_map_library", {
        filePath,
        name,
      });
      await get().loadLibraries();
      set({ isLoading: false });
      return library;
    } catch (err) {
      logger.error("MapLibraryStore", "Failed to import CAD file path", { error: String(err) });
      set({ error: String(err), isLoading: false });
      return null;
    }
  },

  importCadDoc: async (doc, fileName, name, sourceBytes, targetCrs) => {
    set({ isLoading: true, error: null });
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const library = await invoke<MapLibrary>("import_cad_doc_to_map_library", {
        doc,
        fileName,
        name,
        targetCrs: targetCrs || null,
        sourceBytes: sourceBytes ?? null,
      });
      await get().loadLibraries();
      set({ isLoading: false });
      return library;
    } catch (err) {
      logger.error("MapLibraryStore", "Failed to import CAD doc", { error: String(err) });
      set({ error: String(err), isLoading: false });
      return null;
    }
  },

  createTileLibrary: async (name, description, tileUrl, tileType, minZoom, maxZoom, coordinateSystem, apiKey) => {
    set({ isLoading: true, error: null });
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const library = await invoke<MapLibrary>("create_tile_map_library", {
        name,
        description: description || null,
        tileUrl,
        tileType: tileType || null,
        minZoom: minZoom ?? null,
        maxZoom: maxZoom ?? null,
        coordinateSystem: coordinateSystem || null,
        apiKey: apiKey || null,
      });
      await get().loadLibraries();
      set({ isLoading: false });
      return library;
    } catch (err) {
      logger.error("MapLibraryStore", "Failed to create tile library", { error: String(err) });
      set({ error: String(err), isLoading: false });
      return null;
    }
  },

  createBlueprintLibrary: async (name, description, imagePath, bounds, coordinateSystem) => {
    set({ isLoading: true, error: null });
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const library = await invoke<MapLibrary>("create_blueprint_map_library", {
        name,
        description: description || null,
        imagePath,
        bounds,
        coordinateSystem: coordinateSystem || null,
      });
      await get().loadLibraries();
      set({ isLoading: false });
      return library;
    } catch (err) {
      logger.error("MapLibraryStore", "Failed to create blueprint library", { error: String(err) });
      set({ error: String(err), isLoading: false });
      return null;
    }
  },

  saveLibrary: async (library: MapLibrary) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("save_map_library", { library });
      await get().loadLibraries();
    } catch (err) {
      logger.error("MapLibraryStore", "Failed to save library", { error: String(err) });
      set({ error: String(err) });
    }
  },

  deleteLibrary: async (id: string) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("delete_map_library", { id });
      await get().loadLibraries();
      if (get().activeLibraryId === id) {
        set({ activeLibraryId: null });
      }
    } catch (err) {
      logger.error("MapLibraryStore", "Failed to delete library", { error: String(err) });
      set({ error: String(err) });
    }
  },

  publishLibrary: async (id: string) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const updated = await invoke<MapLibrary>("publish_map_library", { id });
      await get().loadLibraries();
      return updated;
    } catch (err) {
      logger.error("MapLibraryStore", "Failed to publish library", { error: String(err) });
      set({ error: String(err) });
      return null;
    }
  },

  unpublishLibrary: async (id: string) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const updated = await invoke<MapLibrary>("unpublish_map_library", { id });
      await get().loadLibraries();
      return updated;
    } catch (err) {
      logger.error("MapLibraryStore", "Failed to unpublish library", { error: String(err) });
      set({ error: String(err) });
      return null;
    }
  },

  setActiveLibraryId: (id: string | null) => set({ activeLibraryId: id }),
  setActiveTypeFilter: (mapType: MapLibraryType | null) => set({ activeTypeFilter: mapType }),
}));
