import type { ComponentDefinition, RendererLoader, PluginManifest } from "../../types/editor";
import { componentRegistry } from "../registry";

type LoadingStatus = "idle" | "loading" | "loaded" | "error";

interface CacheEntry {
  status: LoadingStatus;
  renderer: React.ComponentType<any> | null;
  error: string | null;
  promise: Promise<void> | null;
}

class RendererCacheImpl {
  private cache = new Map<string, CacheEntry>();

  get(type: string): React.ComponentType<any> | null {
    const entry = this.cache.get(type);
    return entry?.renderer ?? null;
  }

  set(type: string, renderer: React.ComponentType<any>): void {
    this.cache.set(type, {
      status: "loaded",
      renderer,
      error: null,
      promise: null,
    });
  }

  getStatus(type: string): LoadingStatus {
    return this.cache.get(type)?.status ?? "idle";
  }

  getError(type: string): string | null {
    return this.cache.get(type)?.error ?? null;
  }

  async load(type: string): Promise<React.ComponentType<any> | null> {
    const existing = this.cache.get(type);
    if (existing) {
      if (existing.status === "loaded") return existing.renderer;
      if (existing.status === "loading" && existing.promise) {
        await existing.promise;
        return this.cache.get(type)?.renderer ?? null;
      }
      // error 状态不永久缓存：清除错误条目，重新尝试加载
      // 这修复了组件注册表未就绪时 load() 被调用并缓存 error，
      // 导致后续即使注册表就绪也永远返回 null 的问题
      if (existing.status === "error") {
        this.cache.delete(type);
      }
    }

    const definition = componentRegistry.get(type);
    if (!definition) {
      this.cache.set(type, {
        status: "error",
        renderer: null,
        error: `Component type "${type}" not registered`,
        promise: null,
      });
      return null;
    }

    let resolveLoad: () => void;
    const loadPromise = new Promise<void>((resolve) => {
      resolveLoad = resolve;
    });

    this.cache.set(type, {
      status: "loading",
      renderer: null,
      error: null,
      promise: loadPromise,
    });

    try {
      const mod = await definition.renderer.loader();
      definition.renderer.cached = mod.default;
      this.cache.set(type, {
        status: "loaded",
        renderer: mod.default,
        error: null,
        promise: null,
      });
      resolveLoad!();
      return mod.default;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.cache.set(type, {
        status: "error",
        renderer: null,
        error: errorMsg,
        promise: null,
      });
      resolveLoad!();
      return null;
    }
  }

  invalidate(type: string): void {
    this.cache.delete(type);
    const definition = componentRegistry.get(type);
    if (definition) {
      definition.renderer.cached = undefined;
    }
  }

  clear(): void {
    this.cache.clear();
  }
}

export const rendererCache = new RendererCacheImpl();


class PluginLoaderImpl {
  private initialized = false;
  private initializing: Promise<void> | null = null;
  private dbPlugins: ComponentDefinition[] = [];

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initializing) return this.initializing;

    this.initializing = (async () => {
      await this.loadBuiltinPlugins();

      try {
        await this.syncBuiltinPluginsToDatabase();
      } catch (err) {
        console.warn("[PluginLoader] Failed to sync built-in plugins to database:", err);
      }

      try {
        await this.loadDatabasePlugins();
      } catch (err) {
        console.warn("[PluginLoader] Failed to load database plugins:", err);
      }

      this.initialized = true;
    })().finally(() => {
      this.initializing = null;
    });

    return this.initializing;
  }

  private async loadBuiltinPlugins(): Promise<void> {
    const { registerBuiltinComponents } = await import("../registry");
    registerBuiltinComponents();
    console.log("[PluginLoader] Built-in plugins loaded");
  }

  private async syncBuiltinPluginsToDatabase(): Promise<void> {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const existing = await invoke<any[]>("get_all_component_plugins");
      const existingMap = new Map<string, any>(existing.map((p: any) => [p.type ?? p.pluginType, p]));

      const allDefs = componentRegistry.getAll();
      let synced = 0;
      let updated = 0;
      for (const def of allDefs) {
        if (!def.builtIn) continue;

        const existingRecord = existingMap.get(def.type);

        if (!existingRecord) {
          // 不存在：创建新记录
          const payload = {
            pluginType: def.type,
            name: def.name,
            version: def.version || "1.0.0",
            description: def.description,
            icon: typeof def.icon === "string" ? `material:${def.icon}` : "material:widgets",
            category: def.category.startsWith("ccat_") ? def.category : `ccat_${def.category}`,
            defaultSize: JSON.stringify(def.defaultSize),
            defaultConfig: JSON.stringify(def.defaultConfig),
            capabilities: JSON.stringify(def.capabilities),
            configSchema: def.configSchema ? JSON.stringify(def.configSchema) : "[]",
            events: def.events ? JSON.stringify(def.events) : "[]",
            actions: def.actions ? JSON.stringify(def.actions) : "[]",
            dataSchema: def.dataSchema ? JSON.stringify(def.dataSchema) : undefined,
            rendererEntry: undefined,
            rendererFormat: "builtin",
            dependencies: "[]",
            permissions: "[]",
            builtIn: true,
          };

          try {
            await invoke("create_component_plugin", { payload });
            synced++;
          } catch (err) {
            console.warn(`[PluginLoader] Failed to sync built-in plugin "${def.type}":`, err);
          }
        } else {
          // 已存在：修复名称和分类不一致的记录
          const dbName = existingRecord.name;
          const isDirtyName = dbName === def.type || /^(DataV边框|DataV装饰)\d+$/.test(dbName);

          const defCategory = def.category.startsWith("ccat_") ? def.category : `ccat_${def.category}`;
          const dbCategory = existingRecord.category ?? "";
          const isDirtyCategory = dbCategory !== defCategory;

          if (isDirtyName || isDirtyCategory) {
            try {
              const updates: Record<string, unknown> = { id: existingRecord.id };
              if (isDirtyName) updates.name = def.name;
              if (isDirtyCategory) updates.category = defCategory;
              await invoke("update_component_plugin", {
                payload: updates,
              });
              updated++;
            } catch (err) {
              console.warn(`[PluginLoader] Failed to fix built-in plugin "${def.type}":`, err);
            }
          }
        }
      }

      if (synced > 0 || updated > 0) {
        console.log(`[PluginLoader] Synced ${synced} new, fixed ${updated} names for built-in plugins`);
      }
    } catch (err) {
      console.warn("[PluginLoader] Built-in plugin sync skipped:", err);
    }
  }

  private async loadDatabasePlugins(): Promise<void> {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const plugins = await invoke<any[]>("get_enabled_component_plugins");

      for (const plugin of plugins) {
        if (plugin.builtIn) continue;

        const definition = this.dbPluginToDefinition(plugin);
        if (definition) {
          componentRegistry.register(definition);
          this.dbPlugins.push(definition);
        }
      }

      console.log(`[PluginLoader] Loaded ${this.dbPlugins.length} database plugins`);
    } catch (err) {
      console.warn("[PluginLoader] Database plugin loading skipped:", err);
    }
  }

  private dbPluginToDefinition(plugin: any): ComponentDefinition | null {
    try {
      let defaultSize = { width: 200, height: 150 };
      try {
        defaultSize = JSON.parse(plugin.defaultSize || "{}");
      } catch {}

      let defaultConfig: Record<string, unknown> = {};
      try {
        defaultConfig = JSON.parse(plugin.defaultConfig || "{}");
      } catch {}

      let capabilities = {
        resizable: true,
        rotatable: true,
        draggable: true,
        connectable: false,
        embeddable: false,
      };
      try {
        capabilities = JSON.parse(plugin.capabilities || "{}");
      } catch {}

      let configSchema = undefined;
      try {
        const parsed = JSON.parse(plugin.configSchema || "[]");
        if (Array.isArray(parsed) && parsed.length > 0) configSchema = parsed;
      } catch {}

      let events = undefined;
      try {
        const parsed = JSON.parse(plugin.events || "[]");
        if (Array.isArray(parsed) && parsed.length > 0) events = parsed;
      } catch {}

      let actions = undefined;
      try {
        const parsed = JSON.parse(plugin.actions || "[]");
        if (Array.isArray(parsed) && parsed.length > 0) actions = parsed;
      } catch {}

      let dataSchema = undefined;
      try {
        if (plugin.dataSchema) dataSchema = JSON.parse(plugin.dataSchema);
      } catch {}

      const rendererEntry = plugin.rendererEntry;
      const rendererFormat = plugin.rendererFormat;

      let loader: RendererLoader;
      if (rendererEntry && rendererFormat === 'external') {
        loader = () => this.loadExternalRenderer(rendererEntry);
      } else if (rendererEntry && rendererFormat === 'builtin') {
        loader = () => this.loadBuiltinRenderer(rendererEntry);
      } else if (rendererFormat === "schema" || !rendererEntry) {
        loader = () =>
          import("../renderers/SchemaDrivenRenderer").then((m) => ({
            default: m.SchemaDrivenRenderer,
          }));
      } else {
        loader = () =>
          import("../renderers/FallbackRenderer").then((m) => ({
            default: m.FallbackRenderer,
          }));
      }

      if (configSchema && configSchema.length > 0) {
        defaultConfig.__configSchema = configSchema;
        defaultConfig.__componentName = plugin.name;
      }

      return {
        type: plugin.type,
        name: plugin.name,
        icon: plugin.icon || "widgets",
        description: plugin.description,
        category: plugin.category || "custom",
        version: plugin.version || "1.0.0",
        defaultSize,
        defaultConfig,
        capabilities,
        configSchema,
        renderer: { loader },
        events,
        actions,
        dataSchema,
        builtIn: plugin.builtIn || false,
        enabled: plugin.enabled !== false,
      };
    } catch (err) {
      console.error(`[PluginLoader] Failed to parse plugin "${plugin?.type}":`, err);
      return null;
    }
  }

  async installPlugin(manifest: PluginManifest): Promise<ComponentDefinition | null> {
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
        rendererEntry: manifest.renderer.entry,
        rendererFormat: manifest.renderer.format,
        dependencies: manifest.dependencies ? JSON.stringify(manifest.dependencies) : undefined,
        permissions: manifest.permissions ? JSON.stringify(manifest.permissions) : undefined,
        author: manifest.author,
        homepage: manifest.homepage,
        thumbnail: manifest.thumbnail,
      };

      const saved = await invoke<any>("create_component_plugin", { payload });

      const definition = this.dbPluginToDefinition(saved);
      if (definition) {
        componentRegistry.register(definition);
        this.dbPlugins.push(definition);
      }

      return definition;
    } catch (err) {
      console.error("[PluginLoader] Failed to install plugin:", err);
      return null;
    }
  }

  async uninstallPlugin(pluginId: string): Promise<boolean> {
    try {
      const { invoke } = await import("@tauri-apps/api/core");

      // pluginId 可能是 type（如 "echart"），需要先查找 DB 记录获取正确的 id
      const existing = await invoke<{ id: string } | null>("get_component_plugin_by_type", { pluginType: pluginId });
      const dbId = existing?.id ?? pluginId; // fallback 到原始值

      await invoke("delete_component_plugin", { id: dbId });

      const idx = this.dbPlugins.findIndex((d) => d.type === pluginId);
      if (idx >= 0) {
        const def = this.dbPlugins[idx];
        componentRegistry.unregister(def.type);
        rendererCache.invalidate(def.type);
        this.dbPlugins.splice(idx, 1);
      }

      return true;
    } catch (err) {
      console.error("[PluginLoader] Failed to uninstall plugin:", err);
      return false;
    }
  }

  async togglePlugin(pluginId: string, enabled: boolean): Promise<boolean> {
    try {
      const { invoke } = await import("@tauri-apps/api/core");

      // 查找 DB 记录获取正确的 id
      const existing = await invoke<{ id: string } | null>("get_component_plugin_by_type", { pluginType: pluginId });

      if (existing) {
        await invoke("update_component_plugin", {
          payload: { id: existing.id, enabled },
        });
      } else {
        // 记录不存在，创建一条
        const def = componentRegistry.get(pluginId);
        await invoke("create_component_plugin", {
          payload: {
            pluginType: pluginId,
            name: def?.name ?? pluginId,
            category: def?.category,
            enabled,
            builtIn: def?.builtIn ?? false,
          },
        });
      }

      const def = componentRegistry.get(pluginId);
      if (def) {
        def.enabled = enabled;
      }

      return true;
    } catch (err) {
      console.error("[PluginLoader] Failed to toggle plugin:", err);
      return false;
    }
  }

  getDatabasePlugins(): ComponentDefinition[] {
    return [...this.dbPlugins];
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  private async loadExternalRenderer(entryPath: string): Promise<{ default: React.ComponentType<any> }> {
    try {
      if (entryPath.startsWith('http://') || entryPath.startsWith('https://')) {
        const module = await import(/* @vite-ignore */ entryPath);
        return { default: module.default ?? module };
      }

      if (entryPath.startsWith('./') || entryPath.startsWith('../') || entryPath.startsWith('/')) {
        const module = await import(/* @vite-ignore */ entryPath);
        return { default: module.default ?? module };
      }

      const { invoke } = await import("@tauri-apps/api/core");
      const pluginCode = await invoke<string>("read_plugin_file", { path: entryPath });
      if (!pluginCode) {
        throw new Error(`Plugin file "${entryPath}" is empty or not found`);
      }

      const blob = new Blob([pluginCode], { type: 'text/javascript' });
      const blobUrl = URL.createObjectURL(blob);
      try {
        const module = await import(/* @vite-ignore */ blobUrl);
        return { default: module.default ?? module };
      } finally {
        URL.revokeObjectURL(blobUrl);
      }
    } catch (err) {
      console.error(`[PluginLoader] Failed to load external renderer from "${entryPath}":`, err);
      const { FallbackRenderer } = await import("../renderers/FallbackRenderer");
      return { default: FallbackRenderer };
    }
  }

  private async loadBuiltinRenderer(entryPath: string): Promise<{ default: React.ComponentType<any> }> {
    try {
      const builtinRenderers: Record<string, () => Promise<{ default: React.ComponentType<any> }>> = {
        'TextRenderer': () => import("../renderers/TextRenderer").then(m => ({ default: m.TextRenderer })),
        'ImageRenderer': () => import("../renderers/ImageRenderer").then(m => ({ default: m.ImageRenderer })),
        'ShapeRenderer': () => import("../renderers/ShapeRenderer").then(m => ({ default: m.ShapeRenderer })),
        'EchartRenderer': () => import("../renderers/EchartRenderer").then(m => ({ default: m.EchartRenderer })),
        'MetricRenderer': () => import("../renderers/MetricRenderer").then(m => ({ default: m.MetricRenderer })),
        'MapRenderer': () => import("../renderers/MapRenderer").then(m => ({ default: m.MapRenderer })),
        'TileMapRenderer': () => import("../renderers/TileMapRenderer").then(m => ({ default: m.TileMapRenderer })),
        'CADMapRenderer': () => import("../renderers/CADMapRenderer").then(m => ({ default: m.CADMapRenderer })),
        'BlueprintMapRenderer': () => import("../renderers/BlueprintMapRenderer").then(m => ({ default: m.BlueprintMapRenderer })),
        'GlobeMapRenderer': () => import("../renderers/GlobeMapRenderer").then(m => ({ default: m.GlobeMapRenderer })),
        'HeatmapMapRenderer': () => import("../renderers/HeatmapMapRenderer").then(m => ({ default: m.HeatmapMapRenderer })),
        'VideoRenderer': () => import("../renderers/VideoRenderer").then(m => ({ default: m.VideoRenderer })),
        'SchemaDrivenRenderer': () => import("../renderers/SchemaDrivenRenderer").then(m => ({ default: m.SchemaDrivenRenderer })),
        'FallbackRenderer': () => import("../renderers/FallbackRenderer").then(m => ({ default: m.FallbackRenderer })),
      };

      const loader = builtinRenderers[entryPath];
      if (loader) {
        return loader();
      }

      const module = await import(/* @vite-ignore */ entryPath);
      return { default: module.default ?? module };
    } catch (err) {
      console.error(`[PluginLoader] Failed to load builtin renderer "${entryPath}":`, err);
      const { FallbackRenderer } = await import("../renderers/FallbackRenderer");
      return { default: FallbackRenderer };
    }
  }
}

export const pluginLoader = new PluginLoaderImpl();
