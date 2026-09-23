export type CRSType =
  | "EPSG:4326"
  | "EPSG:3857"
  | "EPSG:4490"
  | "local";

export interface CRSConfig {
  id: CRSType;
  name: string;
  type: "geographic" | "projected" | "local";
  unit: "degree" | "meter" | "millimeter" | "pixel";
  description?: string;
}

export interface SpatialCoordinate {
  x: number;
  y: number;
}

export interface SpatialCoordinate3D extends SpatialCoordinate {
  z: number;
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface SpatialBoundingBox {
  min: SpatialCoordinate;
  max: SpatialCoordinate;
}

export interface GeoBoundingBox {
  southwest: GeoPoint;
  northeast: GeoPoint;
}

export const CRS_REGISTRY: Record<CRSType, CRSConfig> = {
  "EPSG:4326": {
    id: "EPSG:4326",
    name: "WGS 84",
    type: "geographic",
    unit: "degree",
    description: "GPS标准坐标系，经纬度表示",
  },
  "EPSG:3857": {
    id: "EPSG:3857",
    name: "Web Mercator",
    type: "projected",
    unit: "meter",
    description: "Web地图标准投影，墨卡托投影",
  },
  "EPSG:4490": {
    id: "EPSG:4490",
    name: "CGCS2000",
    type: "geographic",
    unit: "degree",
    description: "中国国家大地坐标系",
  },
  local: {
    id: "local",
    name: "局部坐标系",
    type: "local",
    unit: "millimeter",
    description: "CAD图纸等局部坐标系",
  },
};

export function getCRSConfig(crs: CRSType): CRSConfig {
  return CRS_REGISTRY[crs];
}

export const DEG_TO_RAD = Math.PI / 180;
export const RAD_TO_DEG = 180 / Math.PI;
export const EARTH_RADIUS = 6378137;

export function epsg4326To3857(coord: SpatialCoordinate): SpatialCoordinate {
  const x = coord.x * DEG_TO_RAD * EARTH_RADIUS;
  const y = Math.log(Math.tan((Math.PI / 2 + coord.y * DEG_TO_RAD) / 2)) * EARTH_RADIUS;
  return { x, y };
}

export function epsg3857To4326(coord: SpatialCoordinate): SpatialCoordinate {
  const x = (coord.x / EARTH_RADIUS) * RAD_TO_DEG;
  const y = (2 * Math.atan(Math.exp(coord.y / EARTH_RADIUS)) - Math.PI / 2) * RAD_TO_DEG;
  return { x, y };
}

export function epsg4326To4490(coord: SpatialCoordinate): SpatialCoordinate {
  return { x: coord.x, y: coord.y };
}

export function epsg4490To4326(coord: SpatialCoordinate): SpatialCoordinate {
  return { x: coord.x, y: coord.y };
}

type CRSTransformKey = `${CRSType}->${CRSType}`;
const CRS_TRANSFORMS: Partial<Record<CRSTransformKey, (coord: SpatialCoordinate) => SpatialCoordinate>> = {
  "EPSG:4326->EPSG:3857": epsg4326To3857,
  "EPSG:3857->EPSG:4326": epsg3857To4326,
  "EPSG:4326->EPSG:4490": epsg4326To4490,
  "EPSG:4490->EPSG:4326": epsg4490To4326,
  "EPSG:3857->EPSG:4490": (c) => epsg4326To4490(epsg3857To4326(c)),
  "EPSG:4490->EPSG:3857": (c) => epsg4326To3857(epsg4490To4326(c)),
  "EPSG:4326->EPSG:4326": (c) => c,
  "EPSG:3857->EPSG:3857": (c) => c,
  "EPSG:4490->EPSG:4490": (c) => c,
  "local->local": (c) => c,
  "local->EPSG:4326": (_c) => {
    throw new Error("[CRS] local->EPSG:4326 requires calibration. Use CoordinateEngine.transform() with registered calibration params via registerCustomCRS() or setCalibration().");
  },
  "local->EPSG:3857": (_c) => {
    throw new Error("[CRS] local->EPSG:3857 requires calibration. Use CoordinateEngine.transform() with registered calibration params via registerCustomCRS() or setCalibration().");
  },
  "EPSG:4326->local": (_c) => {
    throw new Error("[CRS] EPSG:4326->local requires calibration. Use CoordinateEngine.transform() with registered calibration params via registerCustomCRS() or setCalibration().");
  },
  "EPSG:3857->local": (_c) => {
    throw new Error("[CRS] EPSG:3857->local requires calibration. Use CoordinateEngine.transform() with registered calibration params via registerCustomCRS() or setCalibration().");
  },
  "local->EPSG:4490": (_c) => {
    throw new Error("[CRS] local->EPSG:4490 requires calibration. Use CoordinateEngine.transform() with registered calibration params via registerCustomCRS() or setCalibration().");
  },
  "EPSG:4490->local": (_c) => {
    throw new Error("[CRS] EPSG:4490->local requires calibration. Use CoordinateEngine.transform() with registered calibration params via registerCustomCRS() or setCalibration().");
  },
};

export function transformCoordinate(
  coord: SpatialCoordinate,
  from: CRSType,
  to: CRSType
): SpatialCoordinate {
  if (from === to) return coord;
  const key: CRSTransformKey = `${from}->${to}`;
  const directTransform = CRS_TRANSFORMS[key];
  if (directTransform) return directTransform(coord);
  const via4326From = CRS_TRANSFORMS[`${from}->EPSG:4326`];
  const via4326To = CRS_TRANSFORMS[`EPSG:4326->${to}`];
  if (via4326From && via4326To) {
    return via4326To(via4326From(coord));
  }
  throw new Error(`No transform path from ${from} to ${to}. For local CRS, register calibration via CoordinateEngine.registerCustomCRS() or setCalibration().`);
}

export function transformBounds(
  bounds: SpatialBoundingBox,
  from: CRSType,
  to: CRSType
): SpatialBoundingBox {
  return {
    min: transformCoordinate(bounds.min, from, to),
    max: transformCoordinate(bounds.max, from, to),
  };
}

export function geoPointToSpatial(point: GeoPoint, crs: CRSType): SpatialCoordinate {
  const wgs84Coord = { x: point.lng, y: point.lat };
  return transformCoordinate(wgs84Coord, "EPSG:4326", crs);
}

export function spatialToGeoPoint(coord: SpatialCoordinate, crs: CRSType): GeoPoint {
  const wgs84Coord = transformCoordinate(coord, crs, "EPSG:4326");
  return { lng: wgs84Coord.x, lat: wgs84Coord.y };
}

export type SpatialSourceType = "tile" | "vector" | "geojson" | "cad" | "image" | "3d-model" | "api" | "heatmap" | "devices" | "3dtiles";

export type SpatialSourceConfig =
  | TileSourceConfig
  | VectorSourceConfig
  | GeoJSONSourceConfig
  | CADSourceConfig
  | ImageSourceConfig
  | ModelSourceConfig
  | ApiSourceConfig
  | HeatmapSourceConfig
  | DevicesSourceConfig
  | ThreeDTilesSourceConfig;

export interface TileSourceConfig {
  type: "tile";
  urlTemplate: string;
  minZoom: number;
  maxZoom: number;
  subdomains?: string[];
  attribution?: string;
  tileSize?: number;
}

export interface VectorSourceConfig {
  type: "vector";
  url: string;
  crs: CRSType;
  layers?: string[];
}

export interface GeoJSONSourceConfig {
  type: "geojson";
  data: unknown;
  crs: CRSType;
}

export interface CADSourceConfig {
  type: "cad";
  fileUrl: string;
  format: "dxf" | "dwg";
  layers?: string[];
  units?: "mm" | "cm" | "m";
  crs: CRSType;
  transform?: CADTransformConfig;
}

export interface CADTransformConfig {
  offsetX: number;
  offsetY: number;
  scale: number;
  rotation: number;
}

export interface ImageSourceConfig {
  type: "image";
  url: string;
  bounds: SpatialBoundingBox;
  rotation?: number;
  crs: CRSType;
}

export interface ModelSourceConfig {
  type: "3d-model";
  url: string;
  format: "gltf" | "glb" | "obj" | "fbx";
  position?: SpatialCoordinate3D;
  scale?: number;
  rotation?: [number, number, number];
  crs: CRSType;
}

export interface ApiSourceConfig {
  type: "api";
  url: string;
  refreshInterval?: number;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  crs?: CRSType;
}

export interface HeatmapSourceConfig {
  type: "heatmap";
  url: string;
  radius?: number;
  blur?: number;
  maxIntensity?: number;
  refreshInterval?: number;
  crs?: CRSType;
}

export interface DevicesSourceConfig {
  type: "devices";
  url: string;
  refreshInterval?: number;
  deviceIdField?: string;
  crs?: CRSType;
}

export interface ThreeDTilesSourceConfig {
  type: "3dtiles";
  url: string;
  maximumScreenSpaceError?: number;
  maximumMemoryUsage?: number;
  crs?: CRSType;
}

export interface SpatialLayerConfig {
  id: string;
  name: string;
  type: SpatialSourceType;
  dimension: "2d" | "3d";
  source: SpatialSourceConfig;
  visible: boolean;
  zIndex: number;
  opacity?: number;
  minZoom?: number;
  maxZoom?: number;
  style?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface CameraConfig {
  center: SpatialCoordinate;
  zoom?: number;
  bearing?: number;
  pitch?: number;
  bounds?: SpatialBoundingBox;
  minZoom?: number;
  maxZoom?: number;
}

export type SpatialInteractionType =
  | "click"
  | "hover"
  | "select"
  | "deselect"
  | "move"
  | "zoom"
  | "rotate"
  | "measure"
  | "draw";

export interface SpatialInteractionEvent {
  type: SpatialInteractionType;
  layerId?: string;
  featureId?: string;
  coordinate?: SpatialCoordinate;
  geoCoordinate?: GeoPoint;
  data?: unknown;
  timestamp: number;
}

export type SpatialInteractionHandler = (event: SpatialInteractionEvent) => void;

export interface SpatialWidgetProps {
  coordinateSystem: CRSType;
  bounds?: SpatialBoundingBox;
  layers: SpatialLayerConfig[];
  camera?: CameraConfig;
  onBoundsChange?: (bounds: SpatialBoundingBox) => void;
  onCameraChange?: (camera: CameraConfig) => void;
  onSpatialInteract?: SpatialInteractionHandler;
}

export function createDefaultSpatialLayer(
  partial?: Partial<SpatialLayerConfig>
): SpatialLayerConfig {
  return {
    id: `layer_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    name: "新图层",
    type: "tile",
    dimension: "2d",
    source: {
      type: "tile",
      urlTemplate: "",
      minZoom: 0,
      maxZoom: 18,
    },
    visible: true,
    zIndex: 0,
    opacity: 1,
    ...partial,
  };
}

export function createDefaultCamera(): CameraConfig {
  return {
    center: { x: 0, y: 0 },
    zoom: 1,
    bearing: 0,
    pitch: 0,
  };
}

export type SpatialEntityGeometryType =
  | 'point'
  | 'line'
  | 'polygon'
  | 'circle'
  | 'arc'
  | 'ellipse'
  | 'polyline'
  | 'spline'
  | 'text'
  | 'image'
  | 'model3d'
  | 'heatmap'
  | 'custom';

export interface SpatialEntityGeometry {
  type: SpatialEntityGeometryType;
  coordinates: unknown;
  crs: CRSType;
}

export interface SpatialEntityStyle {
  color?: string | number;
  fillColor?: string | number;
  opacity?: number;
  strokeWidth?: number;
  fontSize?: number;
  icon?: string;
  custom?: Record<string, unknown>;
}

export interface SpatialEntityProperties {
  [key: string]: unknown;
}

export interface SpatialEntity {
  id: string;
  layerId: string;
  geometry: SpatialEntityGeometry;
  style: SpatialEntityStyle;
  properties: SpatialEntityProperties;
  visible: boolean;
  selectable: boolean;
  locked: boolean;
  zIndex: number;
  createdAt: number;
  updatedAt: number;
  sourceType?: SpatialSourceType;
  sourceId?: string;
}

export function createSpatialEntity(partial: Partial<SpatialEntity> & Pick<SpatialEntity, 'id' | 'layerId' | 'geometry'>): SpatialEntity {
  return {
    visible: true,
    selectable: true,
    locked: false,
    zIndex: 0,
    style: {},
    properties: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...partial,
  };
}
