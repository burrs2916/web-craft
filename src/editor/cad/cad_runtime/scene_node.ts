export type SceneNodeType = 'line' | 'circle' | 'arc' | 'ellipse' | 'lwPolyline' | 'polyline' | 'spline' | 'text' | 'mText' | 'solid' | 'point' | 'insert' | 'hatch' | 'dimension';

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface SceneNodeBase {
  id: number;
  type: SceneNodeType;
  layer: string;
  color: number;
  visible: boolean;
  selected: boolean;
  dirty: boolean;
  bbox: BoundingBox;
}

export interface LineNode extends SceneNodeBase {
  type: 'line';
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  lineWeight: number;
}

export interface CircleNode extends SceneNodeBase {
  type: 'circle';
  centerX: number;
  centerY: number;
  radius: number;
  lineWeight: number;
}

export interface ArcNode extends SceneNodeBase {
  type: 'arc';
  centerX: number;
  centerY: number;
  radius: number;
  startAngle: number;
  endAngle: number;
  lineWeight: number;
}

export interface EllipseNode extends SceneNodeBase {
  type: 'ellipse';
  centerX: number;
  centerY: number;
  majorX: number;
  majorY: number;
  minorRatio: number;
  startAngle: number;
  endAngle: number;
  lineWeight: number;
}

export interface LwPolylineNode extends SceneNodeBase {
  type: 'lwPolyline';
  vertices: Array<{ x: number; y: number; bulge: number }>;
  closed: boolean;
  lineWeight: number;
}

export interface PolylineNode extends SceneNodeBase {
  type: 'polyline';
  vertices: Array<{ x: number; y: number; z: number }>;
  closed: boolean;
  lineWeight: number;
}

export interface SplineNode extends SceneNodeBase {
  type: 'spline';
  controlPoints: Array<{ x: number; y: number; z: number }>;
  fitPoints: Array<{ x: number; y: number; z: number }>;
  knots: number[];
  degree: number;
  lineWeight: number;
}

export interface TextNode extends SceneNodeBase {
  type: 'text';
  posX: number;
  posY: number;
  height: number;
  rotation: number;
  horizontalAlignment: number;
  verticalAlignment: number;
  content: string;
}

export interface MTextNode extends SceneNodeBase {
  type: 'mText';
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

export interface SolidNode extends SceneNodeBase {
  type: 'solid';
  points: Array<{ x: number; y: number }>;
}

export interface PointNode extends SceneNodeBase {
  type: 'point';
  posX: number;
  posY: number;
}

export interface InsertNode extends SceneNodeBase {
  type: 'insert';
  posX: number;
  posY: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  blockName: string;
}

export interface HatchNode extends SceneNodeBase {
  type: 'hatch';
  boundaries: Array<Array<{ x: number; y: number; bulge: number }>>;
  patternName: string;
  patternType: number;
  solid: boolean;
  scale: number;
  angle: number;
  style: number;
  patternLines: Array<{ angle: number; base_x: number; base_y: number; offset_x: number; offset_y: number; dashes: number[] }>;
}

export interface DimensionNode extends SceneNodeBase {
  type: 'dimension';
  defX: number;
  defY: number;
  midX: number;
  midY: number;
  rotation: number;
  content: string;
}

export type SceneNode =
  | LineNode
  | CircleNode
  | ArcNode
  | EllipseNode
  | LwPolylineNode
  | PolylineNode
  | SplineNode
  | TextNode
  | MTextNode
  | SolidNode
  | PointNode
  | InsertNode
  | HatchNode
  | DimensionNode;

export interface LayerNode {
  name: string;
  color: number;
  visible: boolean;
  frozen: boolean;
  locked: boolean;
  entityCount: number;
}

export interface SymbolDef {
  name: string;
  baseX: number;
  baseY: number;
  baseZ: number;
  nodes: SceneNode[];
}
