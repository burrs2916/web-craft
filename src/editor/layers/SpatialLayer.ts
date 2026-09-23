import type { CRSType, SpatialCoordinate, SpatialBoundingBox, GeoPoint } from "../../types/spatial";

export type SpatialLayerType = 'spatial' | 'overlay' | 'widget';

export type SpatialLayerDimension = '2d' | '3d';

export interface LayerViewportState {
  centerX: number;
  centerY: number;
  zoom: number;
  width: number;
  height: number;
  bearing?: number;
  pitch?: number;
}

export interface LayerContainer {
  getViewport(): LayerViewportState;
  getCRS(): CRSType;
  getDOMContainer(): HTMLElement | null;
  coordinateToScreen(coord: SpatialCoordinate, fromCRS: CRSType): { x: number; y: number } | null;
  screenToCoordinate(screen: { x: number; y: number }, toCRS: CRSType): SpatialCoordinate | null;
}

export interface SpatialLayerEvent {
  type: 'click' | 'dblclick' | 'hover' | 'contextmenu' | 'visibility-change' | 'data-update' | 'bounds-change';
  layerId: string;
  screenX?: number;
  screenY?: number;
  worldCoordinate?: SpatialCoordinate;
  geoCoordinate?: GeoPoint;
  data?: unknown;
  consumed: boolean;
  timestamp: number;
}

export type SpatialLayerEventHandler = (event: SpatialLayerEvent) => void;

export interface SpatialLayer {
  readonly id: string;
  readonly name: string;
  readonly type: SpatialLayerType;
  readonly dimension: SpatialLayerDimension;

  visible: boolean;
  opacity: number;
  zIndex: number;
  locked: boolean;

  crs: CRSType;
  bounds?: SpatialBoundingBox;

  mount(container: LayerContainer): void;
  unmount(): void;

  onLayerEvent(handler: SpatialLayerEventHandler): () => void;
  dispatchEvent(event: SpatialLayerEvent): void;

  hitTest?(screenX: number, screenY: number): boolean;

  update?(deltaTime: number): void;
  render?(): void;

  getMetadata(): Record<string, unknown>;
  setMetadata(key: string, value: unknown): void;
}

export interface SpatialLayerFactory {
  createLayer(config: SpatialLayerConfig): SpatialLayer;
}

export interface SpatialLayerConfig {
  id: string;
  name: string;
  type: SpatialLayerType;
  dimension: SpatialLayerDimension;
  visible?: boolean;
  opacity?: number;
  zIndex?: number;
  locked?: boolean;
  crs: CRSType;
  bounds?: SpatialBoundingBox;
  metadata?: Record<string, unknown>;
  sourceConfig?: Record<string, unknown>;
}
