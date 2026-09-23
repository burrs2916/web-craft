/**
 * 画布相关公共常量
 *
 * 所有 zoom / canvas 尺寸限制的唯一真理源。
 * editorStore、EditorCanvas、EditorCanvasPanel 等均从此导入。
 */

/** 最小缩放比例 */
export const MIN_ZOOM = 0.1;
/** 最大缩放比例 */
export const MAX_ZOOM = 5;

/** 画布最小宽度（px） */
export const MIN_CANVAS_W = 320;
/** 画布最小高度（px） */
export const MIN_CANVAS_H = 200;
/** 画布最大宽度（8K, px） */
export const MAX_CANVAS_W = 7680;
/** 画布最大高度（8K, px） */
export const MAX_CANVAS_H = 4320;

/** 缩放步进 */
export const ZOOM_STEP = 0.1;

/** 画布底部留白（px，会按 zoom 缩放）。0 表示拖到底就是底，不留额外空间。 */
export const CANVAS_BOTTOM_PADDING = 0;

/**
 * 钳制画布尺寸到合法范围。
 */
export function clampCanvasSize(width: number, height: number): { width: number; height: number } {
  return {
    width: Math.max(MIN_CANVAS_W, Math.min(MAX_CANVAS_W, Math.round(width))),
    height: Math.max(MIN_CANVAS_H, Math.min(MAX_CANVAS_H, Math.round(height))),
  };
}

/**
 * 钳制 zoom 到合法范围并保留两位小数。
 */
export function clampZoom(zoom: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(zoom * 100) / 100));
}
