import type { SpatialCoordinate, GeoPoint, CRSType } from "../../types/spatial";
import type { SpatialLayerRegistry } from "../layers/SpatialLayerRegistry";
import type { SpatialLayerEvent } from "../layers/SpatialLayer";
import type { CoordinateEngine } from "../spatial/CoordinateEngine";
import type { ToolRegistry, ToolPointerEvent, ToolKeyEvent } from "../tools/Tool";
import type { ViewportProvider } from "../spatial/ViewportSyncService";

export type EventRoutePolicy = 'top-only' | 'penetrate' | 'conditional';

export interface ScenePointerEvent {
  type: 'click' | 'dblclick' | 'hover' | 'contextmenu' | 'pointerdown' | 'pointermove' | 'pointerup';
  screenX: number;
  screenY: number;
  worldCoordinate?: SpatialCoordinate;
  geoCoordinate?: GeoPoint;
  button?: number;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  nativeEvent?: Event;
}

export interface SceneKeyboardEvent {
  type: 'keydown' | 'keyup' | 'keypress';
  key: string;
  code: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  nativeEvent?: Event;
}

export type SceneEvent = ScenePointerEvent | SceneKeyboardEvent;

export interface EventRouteConfig {
  policy: EventRoutePolicy;
  stopOnConsumed: boolean;
  priorityOrder?: string[];
  excludedLayers?: string[];
  includedLayers?: string[];
}

export interface SceneEventDispatcherConfig {
  layerRegistry: SpatialLayerRegistry;
  defaultRoutePolicy: EventRoutePolicy;
  crs: CRSType;
  coordinateEngine?: CoordinateEngine;
}

type SceneEventHandler<T extends SceneEvent = SceneEvent> = (event: T) => void;

export class SceneEventDispatcher {
  private layerRegistry: SpatialLayerRegistry;
  private defaultRoutePolicy: EventRoutePolicy;
  private _crs: CRSType;
  private coordinateEngine: CoordinateEngine | null;
  private toolRegistry: ToolRegistry | null = null;
  private routeConfigs: Map<string, EventRouteConfig> = new Map();
  private globalHandlers: Map<string, Set<SceneEventHandler>> = new Map();
  private activeToolId: string | null = null;
  private toolRouteOverrides: Map<string, EventRouteConfig> = new Map();

  get crs(): CRSType {
    return this._crs;
  }

  constructor(config: SceneEventDispatcherConfig) {
    this.layerRegistry = config.layerRegistry;
    this.defaultRoutePolicy = config.defaultRoutePolicy;
    this._crs = config.crs;
    this.coordinateEngine = config.coordinateEngine ?? null;
  }

  setCoordinateEngine(engine: CoordinateEngine): void {
    this.coordinateEngine = engine;
  }

  setToolRegistry(registry: ToolRegistry): void {
    this.toolRegistry = registry;
  }

  dispatchPointerEvent(event: ScenePointerEvent): void {
    const enrichedEvent = this.enrichWithCoordinates(event);

    const layerEvent: SpatialLayerEvent = {
      type: enrichedEvent.type as SpatialLayerEvent['type'],
      layerId: '',
      screenX: enrichedEvent.screenX,
      screenY: enrichedEvent.screenY,
      worldCoordinate: enrichedEvent.worldCoordinate,
      geoCoordinate: enrichedEvent.geoCoordinate,
      consumed: false,
      timestamp: Date.now(),
    };

    const config = this.getActiveRouteConfig();
    const layers = this.getOrderedLayers(config);

    switch (config.policy) {
      case 'top-only':
        this.dispatchToTopLayer(layerEvent, layers);
        break;
      case 'penetrate':
        this.dispatchToAllLayers(layerEvent, layers, config.stopOnConsumed);
        break;
      case 'conditional':
        this.dispatchConditionally(layerEvent, layers, config);
        break;
    }

    this.emitGlobalEvent(event.type, event);

    if (this.toolRegistry) {
      const toolEvent: ToolPointerEvent = {
        type: enrichedEvent.type as ToolPointerEvent['type'],
        screenX: enrichedEvent.screenX,
        screenY: enrichedEvent.screenY,
        worldX: enrichedEvent.worldCoordinate?.x ?? 0,
        worldY: enrichedEvent.worldCoordinate?.y ?? 0,
        button: enrichedEvent.button ?? 0,
        shiftKey: enrichedEvent.shiftKey,
        ctrlKey: enrichedEvent.ctrlKey,
        altKey: enrichedEvent.altKey,
        metaKey: enrichedEvent.metaKey,
        preventDefault: () => {},
        stopPropagation: () => {},
      };
      this.toolRegistry.dispatchPointerEvent(toolEvent);
    }
  }

  dispatchKeyboardEvent(event: SceneKeyboardEvent): void {
    this.emitGlobalEvent(event.type, event);

    if (this.toolRegistry) {
      const toolEvent: ToolKeyEvent = {
        type: event.type as ToolKeyEvent['type'],
        key: event.key,
        code: event.code,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
        preventDefault: () => {},
      };
      this.toolRegistry.dispatchKeyEvent(toolEvent);
    }
  }

  setRoutePolicy(eventType: string, config: EventRouteConfig): void {
    this.routeConfigs.set(eventType, config);
  }

  setDefaultRoutePolicy(policy: EventRoutePolicy): void {
    this.defaultRoutePolicy = policy;
  }

  setActiveTool(toolId: string | null, routeOverride?: EventRouteConfig): void {
    this.activeToolId = toolId;
    if (routeOverride) {
      this.toolRouteOverrides.set(toolId!, routeOverride);
    } else {
      this.toolRouteOverrides.delete(toolId!);
    }
  }

  on<T extends SceneEvent>(eventType: string, handler: SceneEventHandler<T>): () => void {
    if (!this.globalHandlers.has(eventType)) {
      this.globalHandlers.set(eventType, new Set());
    }
    const set = this.globalHandlers.get(eventType)!;
    set.add(handler as SceneEventHandler);

    return () => {
      set.delete(handler as SceneEventHandler);
      if (set.size === 0) {
        this.globalHandlers.delete(eventType);
      }
    };
  }

  setCRS(crs: CRSType): void {
    this._crs = crs;
  }

  private enrichWithCoordinates(event: ScenePointerEvent): ScenePointerEvent {
    if (event.worldCoordinate && event.geoCoordinate) {
      return event;
    }

    if (!this.coordinateEngine) {
      return event;
    }

    const enriched = { ...event };

    if (!enriched.worldCoordinate && enriched.screenX !== undefined && enriched.screenY !== undefined) {
      const viewport = this.getViewportFromLayers();
      if (viewport) {
        const worldCoord = this.coordinateEngine.screenToWorld(
          { x: enriched.screenX, y: enriched.screenY },
          this._crs,
          {
            panX: viewport.centerX,
            panY: viewport.centerY,
            zoom: viewport.zoom,
            rotation: 0,
            width: viewport.width,
            height: viewport.height,
          }
        );
        enriched.worldCoordinate = worldCoord;
      }
    }

    if (!enriched.geoCoordinate && enriched.worldCoordinate) {
      try {
        enriched.geoCoordinate = this.coordinateEngine.toGeoPoint(enriched.worldCoordinate, this._crs);
      } catch {
        // CRS conversion may not be supported for all coordinate systems
      }
    }

    return enriched;
  }

  private getViewportFromLayers(): { centerX: number; centerY: number; zoom: number; width: number; height: number } | null {
    const layers = this.layerRegistry.getVisibleLayers();
    if (layers.length === 0) return null;

    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      if (this.isViewportProvider(layer)) {
        try {
          const snapshot = layer.getViewport();
          if (snapshot && typeof snapshot.centerX === 'number' && snapshot.width > 0) {
            return {
              centerX: snapshot.centerX,
              centerY: snapshot.centerY,
              zoom: snapshot.zoom,
              width: snapshot.width,
              height: snapshot.height,
            };
          }
        } catch {
          // ViewportProvider failed, try next layer
        }
      }
    }

    return null;
  }

  private isViewportProvider(layer: unknown): layer is ViewportProvider {
    return (
      layer !== null &&
      typeof layer === 'object' &&
      typeof (layer as ViewportProvider).getViewport === 'function' &&
      typeof (layer as ViewportProvider).setViewport === 'function' &&
      typeof (layer as ViewportProvider).onViewportChange === 'function'
    );
  }

  private getActiveRouteConfig(): EventRouteConfig {
    if (this.activeToolId && this.toolRouteOverrides.has(this.activeToolId)) {
      return this.toolRouteOverrides.get(this.activeToolId)!;
    }
    return {
      policy: this.defaultRoutePolicy,
      stopOnConsumed: true,
    };
  }

  private getOrderedLayers(config: EventRouteConfig): import("../layers/SpatialLayer").SpatialLayer[] {
    let layers = this.layerRegistry.getVisibleLayers();

    if (config.excludedLayers) {
      const excluded = new Set(config.excludedLayers);
      layers = layers.filter(l => !excluded.has(l.id));
    }

    if (config.includedLayers) {
      const included = new Set(config.includedLayers);
      layers = layers.filter(l => included.has(l.id));
    }

    if (config.priorityOrder) {
      const orderMap = new Map(config.priorityOrder.map((id, idx) => [id, idx]));
      layers.sort((a, b) => {
        const orderA = orderMap.get(a.id) ?? Infinity;
        const orderB = orderMap.get(b.id) ?? Infinity;
        return orderA - orderB;
      });
    }

    return layers;
  }

  private dispatchToTopLayer(event: SpatialLayerEvent, layers: import("../layers/SpatialLayer").SpatialLayer[]): void {
    if (layers.length === 0) return;
    const topLayer = layers[layers.length - 1];
    event.layerId = topLayer.id;
    topLayer.dispatchEvent(event);
  }

  private dispatchToAllLayers(event: SpatialLayerEvent, layers: import("../layers/SpatialLayer").SpatialLayer[], stopOnConsumed: boolean): void {
    for (let i = layers.length - 1; i >= 0; i--) {
      if (stopOnConsumed && event.consumed) break;
      event.layerId = layers[i].id;
      layers[i].dispatchEvent(event);
    }
  }

  private dispatchConditionally(event: SpatialLayerEvent, layers: import("../layers/SpatialLayer").SpatialLayer[], config: EventRouteConfig): void {
    const isPenetratingEvent = event.type === 'hover';
    const hasScreenCoords = event.screenX !== undefined && event.screenY !== undefined;

    for (let i = layers.length - 1; i >= 0; i--) {
      if (config.stopOnConsumed && event.consumed && !isPenetratingEvent) break;
      const layer = layers[i];
      if (hasScreenCoords && layer.hitTest) {
        if (!layer.hitTest(event.screenX!, event.screenY!)) continue;
      }
      event.layerId = layer.id;
      layer.dispatchEvent(event);
    }
  }

  emitToolEvent(eventType: string, payload?: unknown): void {
    this.emitGlobalEvent(eventType, payload as SceneEvent);
  }

  /**
   * 发射组件级事件，用于预览/运行模式下的组件交互。
   * 事件以 `${componentId}:${eventName}` 为 key 分发给 EventBindingEngine。
   */
  emitComponentEvent(componentId: string, eventName: string, payload?: unknown): void {
    const eventKey = `${componentId}:${eventName}`;
    const handlers = this.globalHandlers.get(eventKey);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(payload as SceneEvent);
        } catch (err) {
          console.error(`[SceneEventDispatcher] Error in component event handler for ${eventKey}:`, err);
        }
      }
    }
  }

  private emitGlobalEvent(eventType: string, event: SceneEvent): void {
    const handlers = this.globalHandlers.get(eventType);
    if (!handlers) return;

    for (const handler of handlers) {
      try {
        handler(event);
      } catch (err) {
        console.error(`[SceneEventDispatcher] Error in global handler for ${eventType}:`, err);
      }
    }
  }

  destroy(): void {
    this.globalHandlers.clear();
    this.routeConfigs.clear();
    this.toolRouteOverrides.clear();
  }
}
