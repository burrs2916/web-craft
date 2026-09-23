/**
 * 智能对齐参考线系统
 *
 * 使用模块级可变对象避免高频 React state 更新。
 * EditorCanvasComponent 拖拽时调用 setDragInfo，EditorCanvas 通过 rAF 读取并渲染参考线。
 */

export interface DragInfo {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GuideLine {
  type: "vertical" | "horizontal";
  position: number;
  start: number;
  end: number;
}

/** 对齐阈值（px，画布坐标空间） */
const SNAP_THRESHOLD = 5;

/** 模块级拖拽信息（非 React state，避免重渲染） */
let _dragInfo: DragInfo | null = null;

/** 设置当前拖拽信息 */
export function setDragInfo(info: DragInfo | null): void {
  _dragInfo = info;
}

/** 读取当前拖拽信息 */
export function getDragInfo(): DragInfo | null {
  return _dragInfo;
}

interface CompRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 计算对齐参考线。
 * @param drag 当前拖拽元素的矩形（画布坐标空间）
 * @param others 其他组件矩形数组
 * @param canvasW 画布宽度
 * @param canvasH 画布高度
 */
export function computeGuides(
  drag: DragInfo,
  others: CompRect[],
  canvasW: number,
  canvasH: number,
): GuideLine[] {
  const guides: GuideLine[] = [];

  // 拖拽元素的参考线位置
  const dragLeft = drag.x;
  const dragRight = drag.x + drag.w;
  const dragCenterX = drag.x + drag.w / 2;
  const dragTop = drag.y;
  const dragBottom = drag.y + drag.h;
  const dragCenterY = drag.y + drag.h / 2;

  // 候选对齐点（垂直线 = X 坐标对齐，水平线 = Y 坐标对齐）
  const vCandidates: { x: number; dragEdge: number }[] = [
    { x: dragLeft, dragEdge: dragLeft }, // 左边对齐
    { x: dragCenterX, dragEdge: dragCenterX }, // 中心对齐
    { x: dragRight, dragEdge: dragRight }, // 右边对齐
  ];
  const hCandidates: { y: number; dragEdge: number }[] = [
    { y: dragTop, dragEdge: dragTop },
    { y: dragCenterY, dragEdge: dragCenterY },
    { y: dragBottom, dragEdge: dragBottom },
  ];

  // 画布参考对齐点
  const canvasVTargets = [0, canvasW / 2, canvasW];
  const canvasHTargets = [0, canvasH / 2, canvasH];

  let vMinDist = SNAP_THRESHOLD;
  let vTarget: { x: number; start: number; end: number } | null = null;
  let hMinDist = SNAP_THRESHOLD;
  let hTarget: { y: number; start: number; end: number } | null = null;

  // 检查画布对齐
  for (const c of vCandidates) {
    for (const target of canvasVTargets) {
      const dist = Math.abs(c.x - target);
      if (dist <= vMinDist) {
        vMinDist = dist;
        vTarget = { x: target, start: 0, end: Math.max(canvasH, dragBottom) };
      }
    }
  }
  for (const c of hCandidates) {
    for (const target of canvasHTargets) {
      const dist = Math.abs(c.y - target);
      if (dist <= hMinDist) {
        hMinDist = dist;
        hTarget = { y: target, start: 0, end: Math.max(canvasW, dragRight) };
      }
    }
  }

  // 检查其他组件对齐
  for (const other of others) {
    if (other.x === drag.x && other.y === drag.y && other.w === drag.w && other.h === drag.h) continue;

    const otherLeft = other.x;
    const otherRight = other.x + other.w;
    const otherCenterX = other.x + other.w / 2;
    const otherTop = other.y;
    const otherBottom = other.y + other.h;
    const otherCenterY = other.y + other.h / 2;

    for (const c of vCandidates) {
      for (const target of [otherLeft, otherCenterX, otherRight]) {
        const dist = Math.abs(c.x - target);
        if (dist <= vMinDist) {
          vMinDist = dist;
          vTarget = {
            x: target,
            start: Math.min(dragTop, otherTop),
            end: Math.max(dragBottom, otherBottom),
          };
        }
      }
    }

    for (const c of hCandidates) {
      for (const target of [otherTop, otherCenterY, otherBottom]) {
        const dist = Math.abs(c.y - target);
        if (dist <= hMinDist) {
          hMinDist = dist;
          hTarget = {
            y: target,
            start: Math.min(dragLeft, otherLeft),
            end: Math.max(dragRight, otherRight),
          };
        }
      }
    }
  }

  if (vTarget) guides.push({ type: "vertical", position: vTarget.x, start: vTarget.start, end: vTarget.end });
  if (hTarget) guides.push({ type: "horizontal", position: hTarget.y, start: hTarget.start, end: hTarget.end });

  return guides;
}
