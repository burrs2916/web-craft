import type { SpatialLayer, SpatialLayerEvent, SpatialLayerEventHandler } from "./SpatialLayer";

export class SpatialLayerRegistry {
  private layers: Map<string, SpatialLayer> = new Map();
  private zOrder: string[] = [];
  private globalEventHandlers: Set<SpatialLayerEventHandler> = new Set();

  register(layer: SpatialLayer): void {
    if (this.layers.has(layer.id)) {
      console.warn(`[SpatialLayerRegistry] Layer "${layer.id}" already registered, replacing.`);
      this.unregister(layer.id);
    }

    this.layers.set(layer.id, layer);
    this.insertIntoZOrder(layer);
    this.emitGlobalEvent({
      type: 'visibility-change',
      layerId: layer.id,
      consumed: false,
      timestamp: Date.now(),
    });
  }

  unregister(layerId: string): boolean {
    const layer = this.layers.get(layerId);
    if (!layer) return false;

    layer.unmount();
    this.layers.delete(layerId);
    this.zOrder = this.zOrder.filter(id => id !== layerId);

    return true;
  }

  get(layerId: string): SpatialLayer | undefined {
    return this.layers.get(layerId);
  }

  getAll(): SpatialLayer[] {
    return this.zOrder
      .map(id => this.layers.get(id))
      .filter((l): l is SpatialLayer => !!l);
  }

  getByType(type: SpatialLayer['type']): SpatialLayer[] {
    return this.getAll().filter(l => l.type === type);
  }

  getVisibleLayers(): SpatialLayer[] {
    return this.getAll().filter(l => l.visible);
  }

  setLayerVisibility(layerId: string, visible: boolean): void {
    const layer = this.layers.get(layerId);
    if (layer) {
      layer.visible = visible;
      this.emitGlobalEvent({
        type: 'visibility-change',
        layerId,
        consumed: false,
        timestamp: Date.now(),
      });
    }
  }

  setLayerOpacity(layerId: string, opacity: number): void {
    const layer = this.layers.get(layerId);
    if (layer) {
      layer.opacity = Math.max(0, Math.min(1, opacity));
    }
  }

  setLayerZIndex(layerId: string, zIndex: number): void {
    const layer = this.layers.get(layerId);
    if (layer) {
      layer.zIndex = zIndex;
      this.rebuildZOrder();
    }
  }

  bringToFront(layerId: string): void {
    const maxZ = this.getAll().reduce((max, l) => Math.max(max, l.zIndex), 0);
    this.setLayerZIndex(layerId, maxZ + 1);
  }

  sendToBack(layerId: string): void {
    const minZ = this.getAll().reduce((min, l) => Math.min(min, l.zIndex), 0);
    this.setLayerZIndex(layerId, minZ - 1);
  }

  showAll(): void {
    this.layers.forEach((layer) => {
      layer.visible = true;
    });
    this.emitGlobalEvent({
      type: 'visibility-change',
      layerId: '*',
      consumed: false,
      timestamp: Date.now(),
    });
  }

  hideAll(): void {
    this.layers.forEach((layer) => {
      layer.visible = false;
    });
    this.emitGlobalEvent({
      type: 'visibility-change',
      layerId: '*',
      consumed: false,
      timestamp: Date.now(),
    });
  }

  hideOverlays(): void {
    this.layers.forEach((layer) => {
      if (layer.type === 'overlay') {
        layer.visible = false;
      }
    });
  }

  showOnlyBaseLayers(): void {
    this.layers.forEach((layer) => {
      layer.visible = layer.type === 'spatial';
    });
  }

  onGlobalLayerEvent(handler: SpatialLayerEventHandler): () => void {
    this.globalEventHandlers.add(handler);
    return () => {
      this.globalEventHandlers.delete(handler);
    };
  }

  dispatchEventToLayers(event: SpatialLayerEvent): void {
    const sortedLayers = this.getVisibleLayers();

    for (const layer of sortedLayers) {
      if (event.consumed) break;

      layer.dispatchEvent(event);
    }

    this.emitGlobalEvent(event);
  }

  getLayerCount(): number {
    return this.layers.size;
  }

  has(layerId: string): boolean {
    return this.layers.has(layerId);
  }

  clear(): void {
    this.layers.forEach(layer => layer.unmount());
    this.layers.clear();
    this.zOrder = [];
  }

  private insertIntoZOrder(layer: SpatialLayer): void {
    this.zOrder.push(layer.id);
    this.rebuildZOrder();
  }

  private rebuildZOrder(): void {
    this.zOrder.sort((a, b) => {
      const layerA = this.layers.get(a);
      const layerB = this.layers.get(b);
      if (!layerA || !layerB) return 0;
      return layerA.zIndex - layerB.zIndex;
    });
  }

  private emitGlobalEvent(event: SpatialLayerEvent): void {
    this.globalEventHandlers.forEach(handler => {
      try {
        handler(event);
      } catch (err) {
        console.error('[SpatialLayerRegistry] Error in global event handler:', err);
      }
    });
  }
}

export const spatialLayerRegistry = new SpatialLayerRegistry();
