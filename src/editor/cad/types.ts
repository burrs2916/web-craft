export interface CadPoint {
  x: number;
  y: number;
  z: number;
}

export interface CadLwVertex {
  x: number;
  y: number;
  bulge: number;
}

export interface CadExtents {
  min: CadPoint;
  max: CadPoint;
}

export interface CadLayer {
  name: string;
  color: number;
  visible: boolean;
  frozen: boolean;
  locked: boolean;
}

export interface CadHatchPatternLine {
  angle: number;
  base_x: number;
  base_y: number;
  offset_x: number;
  offset_y: number;
  dashes: number[];
}

export type CadEntity =
  | { type: 'Line'; id: string; layer: string; color: number; start: CadPoint; end: CadPoint; line_weight: number }
  | { type: 'Circle'; id: string; layer: string; color: number; center: CadPoint; radius: number; line_weight: number }
  | { type: 'Arc'; id: string; layer: string; color: number; center: CadPoint; radius: number; start_angle: number; end_angle: number; line_weight: number }
  | { type: 'Ellipse'; id: string; layer: string; color: number; center: CadPoint; major_axis: CadPoint; minor_axis_ratio: number; start_angle: number; end_angle: number; line_weight: number }
  | { type: 'Polyline'; id: string; layer: string; color: number; vertices: CadPoint[]; closed: boolean; line_weight: number }
  | { type: 'LwPolyline'; id: string; layer: string; color: number; vertices: CadLwVertex[]; closed: boolean; line_weight: number }
  | { type: 'Spline'; id: string; layer: string; color: number; control_points: CadPoint[]; fit_points: CadPoint[]; knots: number[]; degree: number; line_weight: number }
  | { type: 'Text'; id: string; layer: string; color: number; position: CadPoint; height: number; content: string; rotation: number; horizontal_alignment: number; vertical_alignment: number }
  | { type: 'MText'; id: string; layer: string; color: number; position: CadPoint; height: number; content: string; width: number; rotation: number; attachment_point?: number; width_factor?: number; font_name?: string; height_scale?: number }
  | { type: 'Solid'; id: string; layer: string; color: number; points: CadPoint[] }
  | { type: 'Point'; id: string; layer: string; color: number; position: CadPoint }
  | { type: 'Insert'; id: string; layer: string; color: number; block_name: string; position: CadPoint; x_scale: number; y_scale: number; z_scale: number; rotation: number }
  | { type: 'Hatch'; id: string; layer: string; color: number; boundaries: CadLwVertex[][]; pattern_name: string; pattern_type: number; solid: boolean; scale: number; angle: number; style: number; pattern_lines: CadHatchPatternLine[] }
  | { type: 'Dimension'; id: string; layer: string; color: number; definition_point: CadPoint; text_midpoint: CadPoint; content: string; rotation: number };

export interface CadDocument {
  file_name: string;
  version: string;
  extents: CadExtents | null;
  layers: CadLayer[];
  entities: CadEntity[];
  entity_count: number;
  coordinate_offset: CadPoint;
  blocks?: CadBlock[];
}

export interface CadBlock {
  name: string;
  basePoint: CadPoint;
  entities: CadEntity[];
}

export interface ParseResult {
  success: boolean;
  document: CadDocument | null;
  error: string | null;
}
