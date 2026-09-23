import maplibregl from "maplibre-gl";
import type {
  MapEngine,
  MapEngineConfig,
  MapEventData,
  MapEventHandler,
  MapEventType,
  MapViewport,
} from "./types";
import type {
  CameraConfig,
  SpatialCoordinate,
  SpatialLayerConfig,
} from "../../types/spatial";

type MapLibreMap = maplibregl.Map;

const CRS_TO_STYLE: Record<string, string> = {
  "EPSG:3857": "https://demotiles.maplibre.org/style.json",
  "EPSG:4326": "https://demotiles.maplibre.org/style.json",
  "EPSG:4490": "https://demotiles.maplibre.org/style.json",
};

function coordinateToLngLat(coord: SpatialCoordinate): maplibregl.LngLatLike {
  return [coord.x, coord.y];
}

function lngLatToCoordinate(lngLat: { lng: number; lat: number }): SpatialCoordinate {
  return { x: lngLat.lng, y: lngLat.lat };
}

function mapEventTypeToMapLibre(event: MapEventType): string {
  const mapping: Record<string, string> = {
    click: "click",
    dblclick: "dblclick",
    mousemove: "mousemove",
    mouseenter: "mouseenter",
    mouseleave: "mouseleave",
    zoom: "zoom",
    rotate: "rotate",
    move: "move",
    load: "load",
    idle: "idle",
    error: "error",
  };
  return mapping[event] ?? event;
}

export class MapLibreEngine implements MapEngine {
  readonly type = "maplibre";
  private map: MapLibreMap | null = null;
  private container: HTMLElement | null = null;
  private eventHandlers = new Map<string, Set<MapEventHandler>>();
  private layerEventHandlers = new Map<string, Map<string, Set<MapEventHandler>>>();
  private layerIdMap = new Map<string, string>();

  get isReady(): boolean {
    return this.map !== null && this.map.loaded();
  }

  async mount(config: MapEngineConfig): Promise<void> {
    this.container = config.container;

    const style = config.style ?? CRS_TO_STYLE[config.crs] ?? CRS_TO_STYLE["EPSG:3857"];

    const mapOptions: maplibregl.MapOptions = {
      container: config.container,
      style: style as string,
      center: config.camera?.center
        ? coordinateToLngLat(config.camera.center)
        : [116.397, 39.908],
      zoom: config.camera?.zoom ?? 10,
      bearing: config.camera?.bearing ?? 0,
      pitch: config.camera?.pitch ?? 0,
      minZoom: config.minZoom ?? 0,
      maxZoom: config.maxZoom ?? 22,
      interactive: config.interactive ?? true,
      attributionControl: config.attributionControl ? {} : false,
    };

    this.map = new maplibregl.Map(mapOptions);

    return new Promise((resolve, reject) => {
      if (!this.map) {
        reject(new Error("Map initialization failed"));
        return;
      }

      this.map.on("load", () => {
        resolve();
      });

      this.map.on("error", (e) => {
        console.error("[MapLibreEngine] Error:", e.error);
      });
    });
  }

  unmount(): void {
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
    this.eventHandlers.clear();
    this.layerEventHandlers.clear();
    this.layerIdMap.clear();
    this.container = null;
  }

  addLayer(layer: SpatialLayerConfig): void {
    if (!this.map) return;

    const mapLibreLayerId = `spatial_${layer.id}`;
    this.layerIdMap.set(layer.id, mapLibreLayerId);

    switch (layer.source.type) {
      case "tile":
        this.addTileLayer(mapLibreLayerId, layer);
        break;
      case "vector":
        this.addVectorLayer(mapLibreLayerId, layer);
        break;
      case "geojson":
        this.addGeoJSONLayer(mapLibreLayerId, layer);
        break;
      case "image":
        this.addImageLayer(mapLibreLayerId, layer);
        break;
      case "heatmap":
        this.addHeatmapLayer(mapLibreLayerId, layer);
        break;
      default:
        console.warn(`[MapLibreEngine] Unsupported layer type: ${layer.source.type}`);
    }
  }

  removeLayer(layerId: string): void {
    if (!this.map) return;

    const mapLibreLayerId = this.layerIdMap.get(layerId);
    if (!mapLibreLayerId) return;

    if (this.map.getLayer(mapLibreLayerId)) {
      this.map.removeLayer(mapLibreLayerId);
    }

    const sourceId = `${mapLibreLayerId}_source`;
    if (this.map.getSource(sourceId)) {
      this.map.removeSource(sourceId);
    }

    this.layerIdMap.delete(layerId);
    this.layerEventHandlers.delete(layerId);
  }

  updateLayer(layerId: string, updates: Partial<SpatialLayerConfig>): void {
    if (!this.map) return;

    const mapLibreLayerId = this.layerIdMap.get(layerId);
    if (!mapLibreLayerId) return;

    if (updates.visible !== undefined) {
      this.setLayerVisibility(layerId, updates.visible);
    }
    if (updates.opacity !== undefined) {
      this.setLayerOpacity(layerId, updates.opacity);
    }
    if (updates.minZoom !== undefined && this.map.getLayer(mapLibreLayerId)) {
      this.map.setLayerZoomRange(mapLibreLayerId, updates.minZoom ?? 0, updates.maxZoom ?? 22);
    }
  }

  setLayerVisibility(layerId: string, visible: boolean): void {
    if (!this.map) return;
    const mapLibreLayerId = this.layerIdMap.get(layerId);
    if (!mapLibreLayerId || !this.map.getLayer(mapLibreLayerId)) return;
    this.map.setLayoutProperty(mapLibreLayerId, "visibility", visible ? "visible" : "none");
  }

  setLayerOpacity(layerId: string, opacity: number): void {
    if (!this.map) return;
    const mapLibreLayerId = this.layerIdMap.get(layerId);
    if (!mapLibreLayerId || !this.map.getLayer(mapLibreLayerId)) return;

    const layer = this.map.getLayer(mapLibreLayerId);
    if (!layer) return;

    if (layer.type === "raster") {
      this.map.setPaintProperty(mapLibreLayerId, "raster-opacity", opacity);
    } else if (layer.type === "fill") {
      this.map.setPaintProperty(mapLibreLayerId, "fill-opacity", opacity);
    } else if (layer.type === "line") {
      this.map.setPaintProperty(mapLibreLayerId, "line-opacity", opacity);
    } else if (layer.type === "circle") {
      this.map.setPaintProperty(mapLibreLayerId, "circle-opacity", opacity);
    }
  }

  getLayerIds(): string[] {
    return Array.from(this.layerIdMap.keys());
  }

  setCamera(camera: Partial<CameraConfig>): void {
    if (!this.map) return;

    const options: maplibregl.JumpToOptions = {};
    if (camera.center) options.center = coordinateToLngLat(camera.center);
    if (camera.zoom !== undefined) options.zoom = camera.zoom;
    if (camera.bearing !== undefined) options.bearing = camera.bearing;
    if (camera.pitch !== undefined) options.pitch = camera.pitch;

    this.map.jumpTo(options);
  }

  getCamera(): MapViewport {
    if (!this.map) {
      return { center: { x: 0, y: 0 }, zoom: 0, bearing: 0, pitch: 0 };
    }
    const center = this.map.getCenter();
    return {
      center: lngLatToCoordinate(center),
      zoom: this.map.getZoom(),
      bearing: this.map.getBearing(),
      pitch: this.map.getPitch(),
    };
  }

  flyTo(options: { center: SpatialCoordinate; zoom?: number; bearing?: number; pitch?: number; duration?: number }): void {
    if (!this.map) return;
    this.map.flyTo({
      center: coordinateToLngLat(options.center),
      zoom: options.zoom,
      bearing: options.bearing,
      pitch: options.pitch,
      duration: options.duration ?? 1500,
    });
  }

  fitBounds(bounds: { min: SpatialCoordinate; max: SpatialCoordinate }, padding?: number): void {
    if (!this.map) return;
    this.map.fitBounds(
      [coordinateToLngLat(bounds.min), coordinateToLngLat(bounds.max)],
      { padding: padding ?? 50, duration: 1000 }
    );
  }

  on(event: MapEventType, handler: MapEventHandler): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);

    const mapLibreEvent = mapEventTypeToMapLibre(event);

    const mapHandler = (e: maplibregl.MapMouseEvent | maplibregl.MapTouchEvent | unknown) => {
      const eventData = this.toMapEventData(event, e);
      handler(eventData);
    };

    this.map?.on(mapLibreEvent as keyof maplibregl.MapLayerEventType, mapHandler as (e: unknown) => void);

    return () => {
      const handlers = this.eventHandlers.get(event);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.eventHandlers.delete(event);
        }
      }
      this.map?.off(mapLibreEvent as keyof maplibregl.MapLayerEventType, mapHandler as (e: unknown) => void);
    };
  }

  onLayerEvent(layerId: string, event: string, handler: MapEventHandler): () => void {
    if (!this.layerEventHandlers.has(layerId)) {
      this.layerEventHandlers.set(layerId, new Map());
    }
    const layerHandlers = this.layerEventHandlers.get(layerId)!;
    if (!layerHandlers.has(event)) {
      layerHandlers.set(event, new Set());
    }
    layerHandlers.get(event)!.add(handler);

    const mapLibreLayerId = this.layerIdMap.get(layerId);
    if (!mapLibreLayerId || !this.map) return () => {};

    const mapHandler = (e: maplibregl.MapMouseEvent | unknown) => {
      const eventData = this.toMapEventData(event as MapEventType, e);
      eventData.layerId = layerId;
      handler(eventData);
    };

    this.map.on(event as keyof maplibregl.MapLayerEventType, mapLibreLayerId, mapHandler as (e: unknown) => void);

    return () => {
      const layerHandlers = this.layerEventHandlers.get(layerId);
      if (layerHandlers) {
        const handlers = layerHandlers.get(event);
        if (handlers) {
          handlers.delete(handler);
          if (handlers.size === 0) {
            layerHandlers.delete(event);
          }
        }
      }
      this.map?.off(event as keyof maplibregl.MapLayerEventType, mapLibreLayerId, mapHandler as (e: unknown) => void);
    };
  }

  resize(): void {
    this.map?.resize();
  }

  getContainer(): HTMLElement | null {
    return this.container;
  }

  project(coordinate: SpatialCoordinate): { x: number; y: number } {
    if (!this.map) return { x: 0, y: 0 };
    const point = this.map.project(coordinateToLngLat(coordinate));
    return { x: point.x, y: point.y };
  }

  unproject(point: { x: number; y: number }): SpatialCoordinate {
    if (!this.map) return { x: 0, y: 0 };
    const lngLat = this.map.unproject([point.x, point.y]);
    return lngLatToCoordinate(lngLat);
  }

  private toMapEventData(eventType: string, rawEvent: unknown): MapEventData {
    const e = rawEvent as Record<string, unknown>;
    const data: MapEventData = {
      type: eventType as MapEventType,
      originalEvent: rawEvent,
    };

    if (e && typeof e === "object") {
      if (e.lngLat) {
        const lngLat = e.lngLat as { lng: number; lat: number };
        data.coordinate = lngLatToCoordinate(lngLat);
      }
      if (typeof e.zoom === "number") data.zoom = e.zoom;
      if (typeof e.bearing === "number") data.bearing = e.bearing;
      if (typeof e.pitch === "number") data.pitch = e.pitch;
      if (e.features && Array.isArray(e.features) && e.features.length > 0) {
        const feature = e.features[0] as Record<string, unknown>;
        data.featureId = feature.id as string | undefined;
        data.featureProperties = feature.properties as Record<string, unknown> | undefined;
      }
    }

    return data;
  }

  private addTileLayer(layerId: string, layer: SpatialLayerConfig): void {
    if (!this.map) return;
    const source = layer.source;
    if (source.type !== "tile") return;

    const sourceId = `${layerId}_source`;

    this.map.addSource(sourceId, {
      type: "raster",
      tiles: [source.urlTemplate.replace("{s}", source.subdomains?.[0] ?? "a")],
      minzoom: source.minZoom,
      maxzoom: source.maxZoom,
      tileSize: source.tileSize ?? 256,
      attribution: source.attribution ?? "",
    });

    this.map.addLayer({
      id: layerId,
      type: "raster",
      source: sourceId,
      minzoom: layer.minZoom,
      maxzoom: layer.maxZoom,
      paint: {
        "raster-opacity": layer.opacity ?? 1,
      },
      layout: {
        visibility: layer.visible ? "visible" : "none",
      },
    });
  }

  private addVectorLayer(layerId: string, layer: SpatialLayerConfig): void {
    if (!this.map) return;
    const source = layer.source;
    if (source.type !== "vector") return;

    const sourceId = `${layerId}_source`;

    this.map.addSource(sourceId, {
      type: "vector",
      url: source.url,
    });

    this.map.addLayer({
      id: layerId,
      type: "line",
      source: sourceId,
      "source-layer": source.layers?.[0] ?? "",
      minzoom: layer.minZoom,
      maxzoom: layer.maxZoom,
      paint: {
        "line-color": (layer.style?.color as string) ?? "#3b82f6",
        "line-width": (layer.style?.width as number) ?? 2,
        "line-opacity": layer.opacity ?? 1,
      },
      layout: {
        visibility: layer.visible ? "visible" : "none",
      },
    });
  }

  private addGeoJSONLayer(layerId: string, layer: SpatialLayerConfig): void {
    if (!this.map) return;
    const source = layer.source;
    if (source.type !== "geojson") return;

    const sourceId = `${layerId}_source`;

    this.map.addSource(sourceId, {
      type: "geojson",
      data: source.data as GeoJSON.GeoJSON,
    });

    this.map.addLayer({
      id: layerId,
      type: "fill",
      source: sourceId,
      minzoom: layer.minZoom,
      maxzoom: layer.maxZoom,
      paint: {
        "fill-color": (layer.style?.color as string) ?? "#3b82f6",
        "fill-opacity": (layer.opacity ?? 1) * 0.5,
        "fill-outline-color": (layer.style?.outlineColor as string) ?? "#1d4ed8",
      },
      layout: {
        visibility: layer.visible ? "visible" : "none",
      },
    });
  }

  private addImageLayer(layerId: string, layer: SpatialLayerConfig): void {
    if (!this.map) return;
    const source = layer.source;
    if (source.type !== "image") return;

    const sourceId = `${layerId}_source`;

    this.map.addSource(sourceId, {
      type: "image",
      url: source.url,
      coordinates: [
        [source.bounds.min.x, source.bounds.max.y],
        [source.bounds.max.x, source.bounds.max.y],
        [source.bounds.max.x, source.bounds.min.y],
        [source.bounds.min.x, source.bounds.min.y],
      ],
    });

    this.map.addLayer({
      id: layerId,
      type: "raster",
      source: sourceId,
      minzoom: layer.minZoom,
      maxzoom: layer.maxZoom,
      paint: {
        "raster-opacity": layer.opacity ?? 1,
      },
      layout: {
        visibility: layer.visible ? "visible" : "none",
      },
    });
  }

  private addHeatmapLayer(layerId: string, layer: SpatialLayerConfig): void {
    if (!this.map) return;
    const source = layer.source;
    if (source.type !== "heatmap" && source.type !== "geojson") return;

    const sourceId = `${layerId}_source`;

    if (source.type === "heatmap") {
      this.map.addSource(sourceId, {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
      });
    } else {
      this.map.addSource(sourceId, {
        type: "geojson",
        data: source.data as GeoJSON.GeoJSON,
      });
    }

    this.map.addLayer({
      id: layerId,
      type: "heatmap",
      source: sourceId,
      minzoom: layer.minZoom,
      maxzoom: layer.maxZoom,
      paint: {
        "heatmap-weight": (layer.style?.weight as number) ?? 1,
        "heatmap-intensity": (layer.style?.intensity as number) ?? 1,
        "heatmap-color": [
          "interpolate",
          ["linear"],
          ["heatmap-density"],
          0, "rgba(0, 0, 255, 0)",
          0.2, "royalblue",
          0.4, "cyan",
          0.6, "lime",
          0.8, "yellow",
          1, "red",
        ] as unknown as maplibregl.ExpressionSpecification,
        "heatmap-radius": (layer.style?.radius as number) ?? 30,
        "heatmap-opacity": layer.opacity ?? 1,
      },
      layout: {
        visibility: layer.visible ? "visible" : "none",
      },
    });
  }
}
