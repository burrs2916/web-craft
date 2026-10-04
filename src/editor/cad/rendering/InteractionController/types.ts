import type { SceneNode } from '../../cad_runtime/scene_node';
import type { BatchedLayerBuilder } from '../../cad_runtime/batched_layer_builder';
import type { SdfTextRenderer } from '../../cad_runtime/sdf_text_renderer';
import type { GridSpatialIndex } from '../../cad_runtime/grid_spatial_index';
import type { SceneManager } from '../SceneManager';
import type { CameraController, CameraInfo } from '../CameraController';
import type { EntityStore } from '../EntityStore';
import type { SelectionManager } from '../SelectionManager';
import type { GeometryFactory } from '../GeometryFactory';

export type InteractionMode = 'select' | 'pan' | 'draw_line' | 'draw_circle' | 'draw_text';

export interface InteractionControllerConfig {
  sceneManager: SceneManager;
  cameraController: CameraController;
  entityStore: EntityStore;
  selectionManager: SelectionManager;
  geometryFactory: GeometryFactory;
  sdfTextRenderer: SdfTextRenderer;
  batchedBuilder: BatchedLayerBuilder;
  spatialIndex: GridSpatialIndex;

  // Callbacks
  onRequestRender: () => void;
  onScheduleViewportCulling: () => void;
  onRebuildEntityMesh: (entityId: string) => void;
  onTranslateNode: (node: SceneNode, dx: number, dy: number) => void;

  // Event callbacks
  onEntityClick?: (entityId: string, layer: string) => void;
  onSelectionChanged?: (entityIds: string[]) => void;
  onCameraChanged?: (info: CameraInfo) => void;
  onCameraInteractionEnd?: (info: CameraInfo) => void;
  onEntityMoved?: (entityId: string, dx: number, dy: number) => void;
  onEntityContextMenu?: (entityId: string, layer: string, clientX: number, clientY: number) => void;
  onDrawComplete?: (entityJson: string) => void;
}