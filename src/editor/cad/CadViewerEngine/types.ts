import type { SpatialCoordinate } from '../../../types/spatial';

export interface CadEngineConfig {
  container: HTMLElement;
  autoResize?: boolean;
  backgroundColor?: string;
  lineColor?: string;
  debugMode?: boolean;
  transparentBackground?: boolean;
  onEntityCreated?: (entityId: string) => void;
}

export interface CadDocumentInfo {
  fileName: string;
  title: string;
  extents?: {
    min: SpatialCoordinate;
    max: SpatialCoordinate;
  };
}

export type CadEngineEventType =
  | 'documentOpened'
  | 'documentClosed'
  | 'entityClicked'
  | 'mouseMove'
  | 'selectionChanged'
  | 'cameraChanged'
  | 'cameraInteractionEnd'
  | 'entityChanged'
  | 'entityMoved'
  | 'entityContextMenu'
  | 'error'
  | 'loadProgress'
  | 'sceneGraphLoaded'
  | 'layersVisibilityChanged'
  | 'entityCreated';

export interface CadEngineEventData {
  type: CadEngineEventType;
  data?: unknown;
}

export type CadEngineEventHandler = (event: CadEngineEventData) => void;