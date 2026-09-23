import type { SpatialLayer, SpatialLayerEvent, SpatialLayerEventHandler, LayerContainer } from "../layers/SpatialLayer";
import type { CRSType, SpatialBoundingBox } from "../../types/spatial";
import type { CadViewerEngine, CadEngineEventType, CadEngineEventData } from "../cad/CadViewerEngine";
import type { ViewportProvider, ViewportSnapshot, ViewportChangeHandler } from "../spatial/ViewportSyncService";
import { CadSelectTool, CadPanTool, CadDrawLineTool, CadDrawCircleTool } from "../cad/tools/CadTools";
import type { ToolRegistry } from "../tools/Tool";

export interface CadLayerOptions {
  crs?: CRSType;
  bounds?: SpatialBoundingBox;
  visible?: boolean;
  opacity?: number;
  zIndex?: number;
  locked?: boolean;
}

export class CadLayerAdapter implements SpatialLayer, ViewportProvider {
  readonly id: string;
  readonly name: string;
  readonly type = 'spatial' as const;
  readonly dimension = '2d' as const;

  visible: boolean = true;
  opacity: number = 1;
  zIndex: number = 0;
  locked: boolean = false;

  crs: CRSType = 'local';
  bounds?: SpatialBoundingBox;

  private _engine: CadViewerEngine | null = null;
  private _container: LayerContainer | null = null;
  private _eventHandlers: Set<SpatialLayerEventHandler> = new Set();
  private _metadata: Record<string, unknown> = {};
  private _engineEventUnsubs: Array<() => void> = [];
  private _viewportChangeHandlers: Set<ViewportChangeHandler> = new Set();
  private _toolRegistry: ToolRegistry | null = null;
  private _cadTools: Array<{ id: string; tool: CadSelectTool | CadPanTool | CadDrawLineTool | CadDrawCircleTool }> = [];

  get container(): LayerContainer | null {
    return this._container;
  }

  constructor(id: string, name: string, options?: CadLayerOptions) {
    this.id = id;
    this.name = name;

    if (options) {
      if (options.crs) this.crs = options.crs;
      if (options.bounds) this.bounds = options.bounds;
      if (options.visible !== undefined) this.visible = options.visible;
      if (options.opacity !== undefined) this.opacity = options.opacity;
      if (options.zIndex !== undefined) this.zIndex = options.zIndex;
      if (options.locked !== undefined) this.locked = options.locked;
    }
  }

  get engine(): CadViewerEngine | null {
    return this._engine;
  }

  attachEngine(engine: CadViewerEngine): void {
    this.detachEngine();
    this._engine = engine;

    const eventsToBridge: CadEngineEventType[] = [
      'entityClicked',
      'selectionChanged',
      'cameraChanged',
      'layersVisibilityChanged',
    ];

    for (const eventType of eventsToBridge) {
      const unsub = engine.on(eventType, (data: CadEngineEventData) => {
        this._emitEvent({
          type: this._mapEngineEventType(eventType),
          layerId: this.id,
          consumed: false,
          timestamp: Date.now(),
          data: data.data,
        });
      });
      this._engineEventUnsubs.push(unsub);
    }

    const cameraUnsub = engine.on('cameraChanged', () => {
      const state = engine.getCameraState();
      if (state) {
        const snapshot = this.getViewport();
        this._viewportChangeHandlers.forEach(handler => {
          try {
            handler(snapshot, this.id);
          } catch (err) {
            console.error(`[CadLayerAdapter] Viewport change handler error:`, err);
          }
        });
      }
    });
    this._engineEventUnsubs.push(cameraUnsub);

    this.registerCadTools(engine);
  }

  setToolRegistry(registry: ToolRegistry): void {
    this._toolRegistry = registry;
    if (this._engine) {
      this.registerCadTools(this._engine);
    }
  }

  private registerCadTools(engine: CadViewerEngine): void {
    this.unregisterCadTools();

    const cadTools = [
      new CadSelectTool(engine),
      new CadPanTool(engine),
      new CadDrawLineTool(engine),
      new CadDrawCircleTool(engine),
    ];

    if (this._toolRegistry) {
      for (const tool of cadTools) {
        this._toolRegistry.register(tool);
        this._cadTools.push({ id: tool.id, tool });
      }
    }
  }

  private unregisterCadTools(): void {
    if (this._toolRegistry) {
      for (const { id } of this._cadTools) {
        this._toolRegistry.unregister(id);
      }
    }
    this._cadTools = [];
  }

  detachEngine(): void {
    this.unregisterCadTools();
    this._engineEventUnsubs.forEach(unsub => unsub());
    this._engineEventUnsubs = [];
    this._engine = null;
  }

  mount(container: LayerContainer): void {
    this._container = container;
    this.crs = container.getCRS();
  }

  unmount(): void {
    this.detachEngine();
    this._container = null;
    this._eventHandlers.clear();
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
    if (!this.visible || !this._engine?.container) return false;
    const rect = this._engine.container.getBoundingClientRect();
    return screenX >= rect.left && screenX <= rect.right && screenY >= rect.top && screenY <= rect.bottom;
  }

  update(_deltaTime: number): void {
    if (!this._engine || !this.visible) return;
  }

  render(): void {
    if (!this._engine || !this.visible) return;
  }

  getViewport(): ViewportSnapshot {
    const state = this._engine?.getCameraState();
    const container = this._engine?.container;
    return {
      centerX: state?.centerX ?? 0,
      centerY: state?.centerY ?? 0,
      zoom: state?.halfW ? 1 / state.halfW : 1,
      bearing: 0,
      pitch: 0,
      width: container?.clientWidth ?? 0,
      height: container?.clientHeight ?? 0,
      crs: this.crs,
    };
  }

  setViewport(snapshot: ViewportSnapshot): void {
    if (!this._engine) return;
    const halfW = snapshot.zoom > 0 ? 1 / snapshot.zoom : 1;
    this._engine.setCameraState({
      centerX: snapshot.centerX,
      centerY: snapshot.centerY,
      halfW,
      halfH: snapshot.height > 0 ? halfW * (snapshot.height / snapshot.width) : halfW,
    });
  }

  onViewportChange(handler: ViewportChangeHandler): () => void {
    this._viewportChangeHandlers.add(handler);
    return () => {
      this._viewportChangeHandlers.delete(handler);
    };
  }

  getMetadata(): Record<string, unknown> {
    return {
      ...this._metadata,
      engineId: this._engine?.id,
      isDocumentLoaded: this._engine?.isDocumentLoaded,
      currentDocument: this._engine?.currentDocument,
    };
  }

  setMetadata(key: string, value: unknown): void {
    this._metadata[key] = value;
  }

  async openDocument(fileName: string, content: ArrayBuffer): Promise<boolean> {
    if (!this._engine) return false;
    return this._engine.openDocument(fileName, content);
  }

  closeDocument(): void {
    this._engine?.closeDocument();
  }

  fitView(): void {
    this._engine?.fitToView();
  }

  setLayerVisibility(layerName: string, visible: boolean): void {
    this._engine?.setLayerVisible(layerName, visible);
  }

  private _mapEngineEventType(eventType: CadEngineEventType): SpatialLayerEvent['type'] {
    switch (eventType) {
      case 'entityClicked':
        return 'click';
      case 'selectionChanged':
        return 'data-update';
      case 'cameraChanged':
        return 'bounds-change';
      case 'layersVisibilityChanged':
        return 'visibility-change';
      default:
        return 'data-update';
    }
  }

  private _emitEvent(event: SpatialLayerEvent): void {
    this._eventHandlers.forEach(handler => {
      try {
        handler(event);
      } catch (err) {
        console.error(`[CadLayerAdapter] Error in event handler for ${this.id}:`, err);
      }
    });
  }
}
