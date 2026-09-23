import type { CameraConfig, SpatialLayerConfig, SpatialCoordinate, CRSType } from "../../types/spatial";

export interface MapEngineConfig {
  container: HTMLElement;
  crs: CRSType;
  camera?: CameraConfig;
  style?: string | Record<string, unknown>;
  minZoom?: number;
  maxZoom?: number;
  interactive?: boolean;
  attributionControl?: boolean;
}

export interface MapViewport {
  center: SpatialCoordinate;
  zoom: number;
  bearing: number;
  pitch: number;
}

export type MapEventType =
  | "click"
  | "dblclick"
  | "mousemove"
  | "mouseenter"
  | "mouseleave"
  | "zoom"
  | "rotate"
  | "move"
  | "load"
  | "idle"
  | "error";

export interface MapEventData {
  type: MapEventType;
  coordinate?: SpatialCoordinate;
  zoom?: number;
  bearing?: number;
  pitch?: number;
  originalEvent?: unknown;
  layerId?: string;
  featureId?: string;
  featureProperties?: Record<string, unknown>;
}

export type MapEventHandler = (event: MapEventData) => void;

export interface MapEngine {
  readonly type: string;
  readonly isReady: boolean;

  mount(config: MapEngineConfig): Promise<void>;
  unmount(): void;

  addLayer(layer: SpatialLayerConfig): void;
  removeLayer(layerId: string): void;
  updateLayer(layerId: string, updates: Partial<SpatialLayerConfig>): void;
  setLayerVisibility(layerId: string, visible: boolean): void;
  setLayerOpacity(layerId: string, opacity: number): void;
  getLayerIds(): string[];

  setCamera(camera: Partial<CameraConfig>): void;
  getCamera(): MapViewport;
  flyTo(options: { center: SpatialCoordinate; zoom?: number; bearing?: number; pitch?: number; duration?: number }): void;
  fitBounds(bounds: { min: SpatialCoordinate; max: SpatialCoordinate }, padding?: number): void;

  on(event: MapEventType, handler: MapEventHandler): () => void;
  onLayerEvent(layerId: string, event: string, handler: MapEventHandler): () => void;

  resize(): void;
  getContainer(): HTMLElement | null;
  project(coordinate: SpatialCoordinate): { x: number; y: number };
  unproject(point: { x: number; y: number }): SpatialCoordinate;
}
