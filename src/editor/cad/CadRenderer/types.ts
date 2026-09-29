/** CadRenderer 的对外配置与视图信息类型（对外公共 API 的一部分）。 */

export type FitMode = 'contain' | 'cover' | 'stretch' | 'custom';

export interface CadRendererConfig {
  container: HTMLElement;
  backgroundColor?: string;
  lineColor?: string;
  debugMode?: boolean;
  transparentBackground?: boolean;
  onEntityClick?: (entityId: string, layer: string) => void;
  onSelectionChanged?: (entityIds: string[]) => void;
  onCameraChanged?: (info: CameraInfo) => void;
  onCameraInteractionEnd?: (info: CameraInfo) => void;
  onEntityMoved?: (entityId: string, dx: number, dy: number) => void;
  onEntityContextMenu?: (entityId: string, layer: string, clientX: number, clientY: number) => void;
  onDrawComplete?: (entityJson: string) => void;
}

export interface CameraInfo {
  centerX: number;
  centerY: number;
  worldWidth: number;
  worldHeight: number;
  zoom: number;
}