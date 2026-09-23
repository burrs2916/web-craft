import type { SpatialCoordinate, CRSType } from "../../types/spatial";

export interface SpatialLayerInfo {
  id: string;
  name: string;
  type: string;
  crs: CRSType;
  visible: boolean;
  locked: boolean;
  zIndex: number;
}

export interface ViewportInfo {
  centerX: number;
  centerY: number;
  zoom: number;
  bearing: number;
  pitch: number;
  crs: CRSType;
}

export interface HostAPI {
  getComponentConfig(componentId: string): Record<string, unknown> | null;
  setComponentConfig(componentId: string, config: Record<string, unknown>): void;
  updateComponentConfig(componentId: string, partial: Record<string, unknown>): void;
  getComponentData(componentId: string): unknown;
  setComponentData(componentId: string, data: unknown): void;
  emitEvent(componentId: string, eventName: string, payload?: unknown): void;
  subscribeEvent(componentId: string, eventName: string, handler: (payload: unknown) => void): () => void;
  requestDataSource(sourceId: string, params?: Record<string, unknown>): Promise<unknown>;
  getSceneState(): SceneStateInfo;
  logger: PluginLogger;

  transformCoordinate(coord: SpatialCoordinate, fromCRS: CRSType | string, toCRS: CRSType | string): SpatialCoordinate;
  getLayers(): SpatialLayerInfo[];
  getLayerById(layerId: string): SpatialLayerInfo | null;
  setLayerVisibility(layerId: string, visible: boolean): void;
  getViewport(layerId?: string): ViewportInfo | null;
  onViewportChange(handler: (viewport: ViewportInfo, layerId: string) => void): () => void;
  onTimeChange(handler: (time: number, deltaTime: number) => void): () => void;
  getCurrentTime(): number;
  setTimeSpeed(speed: number): void;
}

export interface SceneStateInfo {
  sceneId: string;
  viewport: { width: number; height: number; scale: number };
  activeLayerId: string | null;
  selectedComponentIds: string[];
}

export interface SceneStateProvider {
  getSceneId(): string;
  getViewport(): { width: number; height: number; scale: number };
  getActiveLayerId(): string | null;
  getSelectedComponentIds(): string[];
}

export interface PluginLogger {
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
}

type EventHandler = (payload: unknown) => void;

class HostAPIImpl implements HostAPI {
  private componentConfigs = new Map<string, Record<string, unknown>>();
  private componentData = new Map<string, unknown>();
  private eventHandlers = new Map<string, Set<EventHandler>>();
  private pluginName: string;
  private sceneStateProvider: SceneStateProvider | null = null;
  private storeUpdater: ((componentId: string, property: string, value: unknown) => void) | null = null;
  private _coordinateEngine: import("../spatial/CoordinateEngine").CoordinateEngine | null = null;
  private _layerRegistry: import("../layers/SpatialLayerRegistry").SpatialLayerRegistry | null = null;
  private _viewportChangeHandlers: Set<(viewport: ViewportInfo, layerId: string) => void> = new Set();
  private _timeChangeHandlers: Set<(time: number, deltaTime: number) => void> = new Set();
  private _clockUnsub: (() => void) | null = null;
  private _clock: { subscribe: (listener: (time: { elapsed: number; delta: number }) => void) => (() => void); setSpeed: (speed: number) => void; getTime: () => { elapsed: number; delta: number; tick: number; timestamp: number; isPaused: boolean; speed: number } } | null = null;
  private _viewportSyncUnsub: (() => void) | null = null;
  private _dataOrchestrator: import("../../datasource/orchestration/DataOrchestrator").DataOrchestrator | null = null;
  private _eventDispatcher: import("../events/SceneEventDispatcher").SceneEventDispatcher | null = null;

  constructor(pluginName: string) {
    this.pluginName = pluginName;
  }

  setSceneStateProvider(provider: SceneStateProvider): void {
    this.sceneStateProvider = provider;
  }

  setStoreUpdater(updater: (componentId: string, property: string, value: unknown) => void): void {
    this.storeUpdater = updater;
  }

  setCoordinateEngine(engine: import("../spatial/CoordinateEngine").CoordinateEngine): void {
    this._coordinateEngine = engine;
  }

  setLayerRegistry(registry: import("../layers/SpatialLayerRegistry").SpatialLayerRegistry): void {
    this._layerRegistry = registry;
  }

  setClock(clock: { subscribe: (listener: (time: { elapsed: number; delta: number }) => void) => (() => void); setSpeed: (speed: number) => void; getTime: () => { elapsed: number; delta: number; tick: number; timestamp: number; isPaused: boolean; speed: number } }): void {
    this._clock = clock;
    if (this._clockUnsub) {
      this._clockUnsub();
    }
    this._clockUnsub = clock.subscribe((time) => {
      this._timeChangeHandlers.forEach(handler => {
        try {
          handler(time.elapsed, time.delta);
        } catch (err) {
          this.logger.error('Time change handler error:', err);
        }
      });
    });
  }

  setViewportSyncService(service: import("../spatial/ViewportSyncService").ViewportSyncService): void {
    if (this._viewportSyncUnsub) {
      this._viewportSyncUnsub();
    }
    this._viewportSyncUnsub = service.onGlobalViewportChange((snapshot, sourceId) => {
      const viewportInfo: ViewportInfo = {
        centerX: snapshot.centerX,
        centerY: snapshot.centerY,
        zoom: snapshot.zoom,
        bearing: snapshot.bearing,
        pitch: snapshot.pitch,
        crs: snapshot.crs,
      };
      this._viewportChangeHandlers.forEach(handler => {
        try {
          handler(viewportInfo, sourceId);
        } catch (err) {
          this.logger.error('Viewport change handler error:', err);
        }
      });
    });
  }

  setDataOrchestrator(orchestrator: import("../../datasource/orchestration/DataOrchestrator").DataOrchestrator): void {
    this._dataOrchestrator = orchestrator;
  }

  setEventDispatcher(dispatcher: import("../events/SceneEventDispatcher").SceneEventDispatcher): void {
    this._eventDispatcher = dispatcher;
  }

  getComponentConfig(componentId: string): Record<string, unknown> | null {
    if (this._dataOrchestrator) {
      const bridgeData = this._dataOrchestrator.getBridge().getComponentData(componentId);
      if (bridgeData && typeof bridgeData === 'object') {
        return { ...this.componentConfigs.get(componentId), ...(bridgeData as Record<string, unknown>) };
      }
    }
    return this.componentConfigs.get(componentId) ?? null;
  }

  setComponentConfig(componentId: string, config: Record<string, unknown>): void {
    this.componentConfigs.set(componentId, config);
    if (this._dataOrchestrator) {
      for (const [key, value] of Object.entries(config)) {
        this._dataOrchestrator.getBridge().updateComponent(componentId, key, value);
      }
    }
    if (this.storeUpdater) {
      for (const [key, value] of Object.entries(config)) {
        this.storeUpdater(componentId, key, value);
      }
    }
  }

  updateComponentConfig(componentId: string, partial: Record<string, unknown>): void {
    const existing = this.componentConfigs.get(componentId) ?? {};
    const merged = { ...existing, ...partial };
    this.componentConfigs.set(componentId, merged);
    if (this._dataOrchestrator) {
      for (const [key, value] of Object.entries(partial)) {
        this._dataOrchestrator.getBridge().updateComponent(componentId, key, value);
      }
    }
    if (this.storeUpdater) {
      for (const [key, value] of Object.entries(partial)) {
        this.storeUpdater(componentId, key, value);
      }
    }
  }

  getComponentData(componentId: string): unknown {
    if (this._dataOrchestrator) {
      const bridgeData = this._dataOrchestrator.getBridge().getComponentData(componentId);
      if (bridgeData !== undefined) return bridgeData;
    }
    return this.componentData.get(componentId);
  }

  setComponentData(componentId: string, data: unknown): void {
    this.componentData.set(componentId, data);
    if (this._dataOrchestrator) {
      this._dataOrchestrator.getBridge().setComponentData(componentId, data);
      this._dataOrchestrator.getBridge().updateComponent(componentId, 'data', data);
    }
    if (this.storeUpdater) {
      this.storeUpdater(componentId, 'data', data);
    }
  }

  emitEvent(componentId: string, eventName: string, payload?: unknown): void {
    const key = `${componentId}:${eventName}`;
    const handlers = this.eventHandlers.get(key);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(payload);
        } catch (err) {
          this.logger.error(`Event handler error for ${key}:`, err);
        }
      });
    }

    if (this._eventDispatcher) {
      this._eventDispatcher.emitToolEvent(`${componentId}:${eventName}`, payload);
    }
  }

  subscribeEvent(componentId: string, eventName: string, handler: EventHandler): () => void {
    const key = `${componentId}:${eventName}`;
    if (!this.eventHandlers.has(key)) {
      this.eventHandlers.set(key, new Set<EventHandler>());
    }
    this.eventHandlers.get(key)!.add(handler);

    let globalUnsub: (() => void) | null = null;
    if (this._eventDispatcher) {
      globalUnsub = this._eventDispatcher.on(`${componentId}:${eventName}`, (payload: unknown) => {
        handler(payload);
      });
    }

    return () => {
      const handlers = this.eventHandlers.get(key);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.eventHandlers.delete(key);
        }
      }
      if (globalUnsub) {
        globalUnsub();
        globalUnsub = null;
      }
    };
  }

  async requestDataSource(sourceId: string, _params?: Record<string, unknown>): Promise<unknown> {
    if (this._dataOrchestrator) {
      try {
        const bridge = this._dataOrchestrator.getBridge();
        await this._dataOrchestrator.refreshBindingsForSource(sourceId);
        return bridge.getComponentData(sourceId);
      } catch (err) {
        this.logger.error(`Failed to request data source via orchestrator "${sourceId}":`, err);
      }
    }

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      return await invoke("get_datasource", { id: sourceId });
    } catch (err) {
      this.logger.error(`Failed to request data source "${sourceId}":`, err);
      return null;
    }
  }

  getSceneState(): SceneStateInfo {
    if (this.sceneStateProvider) {
      return {
        sceneId: this.sceneStateProvider.getSceneId(),
        viewport: this.sceneStateProvider.getViewport(),
        activeLayerId: this.sceneStateProvider.getActiveLayerId(),
        selectedComponentIds: this.sceneStateProvider.getSelectedComponentIds(),
      };
    }

    return {
      sceneId: '',
      viewport: { width: 0, height: 0, scale: 1 },
      activeLayerId: null,
      selectedComponentIds: [],
    };
  }

  logger: PluginLogger = {
    info: (message: string, data?: unknown) => {
      console.log(`[Plugin:${this.pluginName}] ${message}`, data ?? "");
    },
    warn: (message: string, data?: unknown) => {
      console.warn(`[Plugin:${this.pluginName}] ${message}`, data ?? "");
    },
    error: (message: string, data?: unknown) => {
      console.error(`[Plugin:${this.pluginName}] ${message}`, data ?? "");
    },
  };

  transformCoordinate(coord: SpatialCoordinate, fromCRS: CRSType | string, toCRS: CRSType | string): SpatialCoordinate {
    if (!this._coordinateEngine) {
      this.logger.warn('CoordinateEngine not available, returning raw coordinate');
      return { ...coord };
    }
    return this._coordinateEngine.transform(coord, fromCRS, toCRS);
  }

  getLayers(): SpatialLayerInfo[] {
    if (!this._layerRegistry) return [];
    return this._layerRegistry.getAll().map(layer => ({
      id: layer.id,
      name: layer.name,
      type: layer.type,
      crs: (layer as any).crs ?? 'local',
      visible: layer.visible,
      locked: layer.locked,
      zIndex: layer.zIndex,
    }));
  }

  getLayerById(layerId: string): SpatialLayerInfo | null {
    if (!this._layerRegistry) return null;
    const layer = this._layerRegistry.get(layerId);
    if (!layer) return null;
    return {
      id: layer.id,
      name: layer.name,
      type: layer.type,
      crs: (layer as any).crs ?? 'local',
      visible: layer.visible,
      locked: layer.locked,
      zIndex: layer.zIndex,
    };
  }

  setLayerVisibility(layerId: string, visible: boolean): void {
    if (!this._layerRegistry) return;
    const layer = this._layerRegistry.get(layerId);
    if (layer) {
      layer.visible = visible;
    }
  }

  getViewport(layerId?: string): ViewportInfo | null {
    if (!this._layerRegistry) return null;
    const layers = this._layerRegistry.getVisibleLayers();
    const target = layerId
      ? layers.find(l => l.id === layerId)
      : layers[layers.length - 1];
    if (!target || typeof (target as any).getViewport !== 'function') return null;
    try {
      const snapshot = (target as any).getViewport();
      return {
        centerX: snapshot.centerX,
        centerY: snapshot.centerY,
        zoom: snapshot.zoom,
        bearing: snapshot.bearing ?? 0,
        pitch: snapshot.pitch ?? 0,
        crs: snapshot.crs ?? 'local',
      };
    } catch {
      return null;
    }
  }

  onViewportChange(handler: (viewport: ViewportInfo, layerId: string) => void): () => void {
    this._viewportChangeHandlers.add(handler);
    return () => {
      this._viewportChangeHandlers.delete(handler);
    };
  }

  onTimeChange(handler: (time: number, deltaTime: number) => void): () => void {
    this._timeChangeHandlers.add(handler);
    return () => {
      this._timeChangeHandlers.delete(handler);
    };
  }

  getCurrentTime(): number {
    return this._clock?.getTime().elapsed ?? Date.now();
  }

  setTimeSpeed(speed: number): void {
    if (this._clock) {
      this._clock.setSpeed(speed);
    } else {
      this.logger.warn('Clock not available, cannot set time speed');
    }
  }
}

const hostAPIInstances = new Map<string, HostAPIImpl>();

export function createHostAPI(pluginName: string): HostAPI {
  if (!hostAPIInstances.has(pluginName)) {
    hostAPIInstances.set(pluginName, new HostAPIImpl(pluginName));
  }
  return hostAPIInstances.get(pluginName)!;
}

export function getHostAPI(pluginName: string): HostAPI | null {
  return hostAPIInstances.get(pluginName) ?? null;
}

export function setSceneStateProvider(pluginName: string, provider: SceneStateProvider): void {
  const instance = hostAPIInstances.get(pluginName);
  if (instance) {
    instance.setSceneStateProvider(provider);
  }
}

export function setGlobalSceneStateProvider(provider: SceneStateProvider): void {
  hostAPIInstances.forEach((instance) => {
    instance.setSceneStateProvider(provider);
  });
}

export function setGlobalStoreUpdater(updater: (componentId: string, property: string, value: unknown) => void): void {
  hostAPIInstances.forEach((instance) => {
    instance.setStoreUpdater(updater);
  });
}

export function injectGlobalCoordinateEngine(engine: import("../spatial/CoordinateEngine").CoordinateEngine): void {
  hostAPIInstances.forEach((instance) => {
    instance.setCoordinateEngine(engine);
  });
}

export function injectGlobalLayerRegistry(registry: import("../layers/SpatialLayerRegistry").SpatialLayerRegistry): void {
  hostAPIInstances.forEach((instance) => {
    instance.setLayerRegistry(registry);
  });
}

export function injectGlobalClock(clock: { subscribe: (listener: (time: { elapsed: number; delta: number }) => void) => (() => void); setSpeed: (speed: number) => void; getTime: () => { elapsed: number; delta: number; tick: number; timestamp: number; isPaused: boolean; speed: number } }): void {
  hostAPIInstances.forEach((instance) => {
    instance.setClock(clock);
  });
}

export function injectGlobalViewportSyncService(service: import("../spatial/ViewportSyncService").ViewportSyncService): void {
  hostAPIInstances.forEach((instance) => {
    instance.setViewportSyncService(service);
  });
}

export function injectGlobalDataOrchestrator(orchestrator: import("../../datasource/orchestration/DataOrchestrator").DataOrchestrator): void {
  hostAPIInstances.forEach((instance) => {
    instance.setDataOrchestrator(orchestrator);
  });
}

export function injectGlobalEventDispatcher(dispatcher: import("../events/SceneEventDispatcher").SceneEventDispatcher): void {
  hostAPIInstances.forEach((instance) => {
    instance.setEventDispatcher(dispatcher);
  });
}

export function destroyHostAPI(pluginName: string): void {
  hostAPIInstances.delete(pluginName);
}
