import type { SpatialLayer, SpatialLayerEvent, SpatialLayerEventHandler, LayerContainer } from "../layers/SpatialLayer";
import type { CRSType, SpatialBoundingBox } from "../../types/spatial";
import type { ViewportProvider, ViewportSnapshot, ViewportChangeHandler } from "../spatial/ViewportSyncService";

export interface ViewportDelegate {
  getViewport(): ViewportSnapshot;
  setViewport(snapshot: ViewportSnapshot): void;
  onViewportChange(handler: ViewportChangeHandler): () => void;
}

export interface ComponentLayerState {
  componentId: string;
  componentType: string;
  config: Record<string, unknown>;
  data: unknown;
}

export class ComponentLayerAdapter implements SpatialLayer, ViewportProvider {
  readonly id: string;
  readonly name: string;
  readonly type: 'overlay' | 'spatial' | 'widget' = 'overlay';
  readonly dimension: '2d' | '3d' = '2d';

  visible: boolean = true;
  opacity: number = 1;
  zIndex: number = 0;
  locked: boolean = false;

  crs: CRSType = 'local';
  bounds?: SpatialBoundingBox;

  private _container: LayerContainer | null = null;
  private _eventHandlers: Set<SpatialLayerEventHandler> = new Set();
  private _metadata: Record<string, unknown> = {};
  private _state: ComponentLayerState;
  private _onStateChange?: (state: ComponentLayerState) => void;
  private _viewportDelegate: ViewportDelegate | null = null;
  private _viewportChangeHandlers: Set<ViewportChangeHandler> = new Set();
  private _delegateUnsub: (() => void) | null = null;
  private _viewportSyncService: import("../spatial/ViewportSyncService").ViewportSyncService | null = null;

  get container(): LayerContainer | null {
    return this._container;
  }

  get hasViewport(): boolean {
    return this._viewportDelegate !== null;
  }

  constructor(
    id: string,
    name: string,
    state: ComponentLayerState,
    options?: {
      type?: SpatialLayer['type'];
      dimension?: SpatialLayer['dimension'];
      crs?: CRSType;
      bounds?: SpatialBoundingBox;
      visible?: boolean;
      opacity?: number;
      zIndex?: number;
      locked?: boolean;
      onStateChange?: (state: ComponentLayerState) => void;
    }
  ) {
    this.id = id;
    this.name = name;
    this._state = { ...state };

    if (options) {
      if (options.type) this.type = options.type;
      if (options.dimension) this.dimension = options.dimension;
      if (options.crs) this.crs = options.crs;
      if (options.bounds) this.bounds = options.bounds;
      if (options.visible !== undefined) this.visible = options.visible;
      if (options.opacity !== undefined) this.opacity = options.opacity;
      if (options.zIndex !== undefined) this.zIndex = options.zIndex;
      if (options.locked !== undefined) this.locked = options.locked;
      if (options.onStateChange) this._onStateChange = options.onStateChange;
    }
  }

  get state(): ComponentLayerState {
    return { ...this._state };
  }

  setViewportSyncService(service: import("../spatial/ViewportSyncService").ViewportSyncService | null): void {
    if (this._viewportSyncService && this._viewportDelegate) {
      this._viewportSyncService.unregisterProvider(this.id);
    }
    this._viewportSyncService = service;
    if (service && this._viewportDelegate) {
      service.registerProvider(this as ViewportProvider);
    }
  }

  setViewportDelegate(delegate: ViewportDelegate): void {
    this._viewportDelegate = delegate;
    if (this._delegateUnsub) {
      this._delegateUnsub();
    }
    this._delegateUnsub = delegate.onViewportChange((snapshot, _sourceId) => {
      this._viewportChangeHandlers.forEach(handler => {
        try {
          handler(snapshot, this.id);
        } catch (err) {
          console.error(`[ComponentLayerAdapter] Viewport change handler error for ${this.id}:`, err);
        }
      });
    });
    if (this._viewportSyncService) {
      this._viewportSyncService.registerProvider(this as ViewportProvider);
    }
  }

  removeViewportDelegate(): void {
    if (this._delegateUnsub) {
      this._delegateUnsub();
      this._delegateUnsub = null;
    }
    this._viewportDelegate = null;
    if (this._viewportSyncService) {
      this._viewportSyncService.unregisterProvider(this.id);
    }
  }

  getViewport(): ViewportSnapshot {
    if (this._viewportDelegate) {
      return this._viewportDelegate.getViewport();
    }
    return {
      centerX: 0,
      centerY: 0,
      zoom: 1,
      bearing: 0,
      pitch: 0,
      width: 0,
      height: 0,
      crs: this.crs,
    };
  }

  setViewport(snapshot: ViewportSnapshot): void {
    if (this._viewportDelegate) {
      this._viewportDelegate.setViewport(snapshot);
    }
  }

  onViewportChange(handler: ViewportChangeHandler): () => void {
    this._viewportChangeHandlers.add(handler);
    return () => {
      this._viewportChangeHandlers.delete(handler);
    };
  }

  updateConfig(config: Partial<Record<string, unknown>>): void {
    this._state.config = { ...this._state.config, ...config };
    this._notifyStateChange();
    this._emitEvent({
      type: 'data-update',
      layerId: this.id,
      consumed: false,
      timestamp: Date.now(),
      data: this._state.config,
    });
  }

  updateData(data: unknown): void {
    this._state.data = data;
    this._notifyStateChange();
    this._emitEvent({
      type: 'data-update',
      layerId: this.id,
      consumed: false,
      timestamp: Date.now(),
      data,
    });
  }

  mount(container: LayerContainer): void {
    this._container = container;
    this.crs = container.getCRS();
  }

  unmount(): void {
    this._container = null;
    this._eventHandlers.clear();
    this.removeViewportDelegate();
  }

  onLayerEvent(handler: SpatialLayerEventHandler): () => void {
    this._eventHandlers.add(handler);
    return () => {
      this._eventHandlers.delete(handler);
    };
  }

  dispatchEvent(event: SpatialLayerEvent): void {
    this._emitEvent(event);
  }

  hitTest(screenX: number, screenY: number): boolean {
    if (!this.visible) return false;
    const domContainer = this._container?.getDOMContainer();
    if (!domContainer) return false;
    const rect = domContainer.getBoundingClientRect();
    return screenX >= rect.left && screenX <= rect.right && screenY >= rect.top && screenY <= rect.bottom;
  }

  update(_deltaTime: number): void {
    if (!this.visible) return;
  }

  render(): void {
    if (!this.visible) return;
  }

  getMetadata(): Record<string, unknown> {
    return { ...this._metadata };
  }

  setMetadata(key: string, value: unknown): void {
    this._metadata[key] = value;
  }

  private _notifyStateChange(): void {
    if (this._onStateChange) {
      this._onStateChange(this._state);
    }
  }

  private _emitEvent(event: SpatialLayerEvent): void {
    this._eventHandlers.forEach(handler => {
      try {
        handler(event);
      } catch (err) {
        console.error(`[ComponentLayerAdapter] Error in event handler for ${this.id}:`, err);
      }
    });
  }
}
