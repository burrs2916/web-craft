import type { GuideLine } from '../../utils/alignmentGuides';

export interface EditorCanvasProps {
  previewMode?: boolean;
}

/** 拖放位置预览框的几何与标签。 */
export interface DragPreview {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}

/** 容器投放高亮框的几何。 */
export interface DropTargetPreview {
  x: number;
  y: number;
  width: number;
  height: number;
  id: string;
}

export type { GuideLine };