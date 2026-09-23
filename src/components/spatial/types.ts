import type { BaseWidgetProps } from "../../types/widget";
import type { CRSType, SpatialBoundingBox, SpatialLayerConfig, CameraConfig, SpatialInteractionHandler } from "../../types/spatial";

export interface MapViewProps extends BaseWidgetProps {
  coordinateSystem: CRSType;
  bounds?: SpatialBoundingBox;
  layers: SpatialLayerConfig[];
  camera?: CameraConfig;
  onBoundsChange?: (bounds: SpatialBoundingBox) => void;
  onCameraChange?: (camera: CameraConfig) => void;
  onSpatialInteract?: SpatialInteractionHandler;
}

export interface CADViewProps extends BaseWidgetProps {
  coordinateSystem: CRSType;
  fileUrl: string;
  format: "dxf" | "dwg";
  cadLayers?: string[];
  units?: "mm" | "cm" | "m";
  bounds?: SpatialBoundingBox;
  camera?: CameraConfig;
  onCameraChange?: (camera: CameraConfig) => void;
}

export interface BlueprintViewProps extends BaseWidgetProps {
  coordinateSystem: CRSType;
  imageUrl: string;
  bounds?: SpatialBoundingBox;
  camera?: CameraConfig;
  onCameraChange?: (camera: CameraConfig) => void;
}

export interface GlobeViewProps extends BaseWidgetProps {
  coordinateSystem: CRSType;
  layers: SpatialLayerConfig[];
  terrainEnabled?: boolean;
  atmosphereEnabled?: boolean;
  camera?: CameraConfig;
  onCameraChange?: (camera: CameraConfig) => void;
  onSpatialInteract?: SpatialInteractionHandler;
}
