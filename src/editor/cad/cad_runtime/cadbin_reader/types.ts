export interface CadbinHeader {
  version: number;
  flags: number;
  entityCount: number;
  layerCount: number;
  chunkCount: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  offsetRtree: number;
  offsetLayers: number;
  offsetBlocks: number;
  offsetChunks: number;
  offsetStrings: number;
  offsetChunkIndex: number;
}

export interface ChunkIndexEntry {
  typeTag: number;
  entityCount: number;
  offset: number;
  byteSize: number;
}

export interface LayerEntry {
  nameIdx: number;
  color: number;
  lineWeight: number;
  flags: number;
}

export interface BlockDef {
  nameIdx: number;
  baseX: number;
  baseY: number;
  baseZ: number;
  entityStart: number;
  entityCount: number;
}

export interface SpatialEntry {
  entityId: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// ── ChunkDecoder 各实体解码结果 ──

export interface LineEntity {
  id: number;
  layer: string;
  color: number;
  lineWeight: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export interface CircleEntity {
  id: number;
  layer: string;
  color: number;
  lineWeight: number;
  centerX: number;
  centerY: number;
  radius: number;
}

export interface ArcEntity {
  id: number;
  layer: string;
  color: number;
  lineWeight: number;
  centerX: number;
  centerY: number;
  radius: number;
  startAngle: number;
  endAngle: number;
}

export interface PointEntity {
  id: number;
  layer: string;
  color: number;
  posX: number;
  posY: number;
}

export interface EllipseEntity {
  id: number;
  layer: string;
  color: number;
  lineWeight: number;
  centerX: number;
  centerY: number;
  majorX: number;
  majorY: number;
  minorRatio: number;
  startAngle: number;
  endAngle: number;
}

export interface TextEntity {
  id: number;
  layer: string;
  color: number;
  posX: number;
  posY: number;
  height: number;
  rotation: number;
  horizontalAlignment: number;
  verticalAlignment: number;
  content: string;
}

export interface MTextEntity {
  id: number;
  layer: string;
  color: number;
  posX: number;
  posY: number;
  height: number;
  width: number;
  rotation: number;
  attachmentPoint: number;
  widthFactor: number;
  heightScale: number;
  fontName: string;
  content: string;
}

export interface InsertEntity {
  id: number;
  layer: string;
  color: number;
  posX: number;
  posY: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  blockName: string;
}

export interface DimensionEntity {
  id: number;
  layer: string;
  color: number;
  defX: number;
  defY: number;
  midX: number;
  midY: number;
  rotation: number;
  content: string;
}

export interface LwPolylineEntity {
  id: number;
  layer: string;
  color: number;
  lineWeight: number;
  closed: boolean;
  vertices: Array<{ x: number; y: number; bulge: number }>;
}

export interface PolylineEntity {
  id: number;
  layer: string;
  color: number;
  lineWeight: number;
  closed: boolean;
  vertices: Array<{ x: number; y: number; z: number }>;
}

export interface SplineEntity {
  id: number;
  layer: string;
  color: number;
  lineWeight: number;
  degree: number;
  controlPoints: Array<{ x: number; y: number; z: number }>;
  fitPoints: Array<{ x: number; y: number; z: number }>;
  knots: number[];
}

export interface SolidEntity {
  id: number;
  layer: string;
  color: number;
  points: Array<{ x: number; y: number }>;
}

export interface HatchPatternLine {
  angle: number;
  base_x: number;
  base_y: number;
  offset_x: number;
  offset_y: number;
  dashes: number[];
}

export interface HatchEntity {
  id: number;
  layer: string;
  color: number;
  patternType: number;
  patternName: string;
  solid: boolean;
  scale: number;
  angle: number;
  style: number;
  boundaries: Array<Array<{ x: number; y: number; bulge: number }>>;
  patternLines: HatchPatternLine[];
}