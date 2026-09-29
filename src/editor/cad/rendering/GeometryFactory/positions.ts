import type { SceneNode } from '../../cad_runtime/scene_node';
import {
  bulgeToArcPositions,
  cameraViewWidth,
  circlePositions,
  dedupLineSegmentPositions,
  ellipsePositions,
} from './geometryMath';
import { isValidNumber } from './validation';
import type { GeometryFactory } from './core';
import type { GeometryFactoryInternal } from './internal';

declare module './core' {
  interface GeometryFactory {
    /** 提取实体线段位置数组（供合批渲染使用）。 */
    extractLinePositions(node: SceneNode): number[] | null;
  }
}

function lwPolylinePositions(f: GeometryFactoryInternal, node: any): number[] | null {
  const vertices = node.vertices;
  if (!vertices || vertices.length === 0) return null;
  const validVertices = vertices.filter((v: { x: number; y: number; bulge: number }) =>
    isValidNumber(v.x) && isValidNumber(v.y) && isValidNumber(v.bulge));
  if (validVertices.length < 2) return null;

  const viewW = cameraViewWidth(f._sceneManager);
  const canvasW = f._sceneManager.width;
  const positions: number[] = [];
  for (let i = 0; i < validVertices.length; i++) {
    const v = validVertices[i];
    const nextIdx = node.closed ? (i + 1) % validVertices.length : i + 1;
    if (nextIdx >= validVertices.length && !node.closed) break;
    const nextV = validVertices[nextIdx];

    if (Math.abs(v.bulge) > 1e-9 && nextIdx < validVertices.length) {
      const arcPts = bulgeToArcPositions(v, nextV, viewW, canvasW);
      for (let j = 0; j < arcPts.length - 3; j += 3) {
        positions.push(arcPts[j], arcPts[j + 1], arcPts[j + 2],
                       arcPts[j + 3], arcPts[j + 4], arcPts[j + 5]);
      }
    } else if (nextIdx < validVertices.length) {
      positions.push(v.x, v.y, 0, nextV.x, nextV.y, 0);
    }
  }
  const deduped = dedupLineSegmentPositions(positions);
  return deduped.length >= 6 ? deduped : null;
}

function polylinePositions(node: any): number[] | null {
  const vertices = node.vertices;
  if (!vertices || vertices.length < 2) return null;
  const positions: number[] = [];
  for (let i = 0; i < vertices.length - 1; i++) {
    const a = vertices[i], b = vertices[i + 1];
    if (isValidNumber(a.x) && isValidNumber(a.y) && isValidNumber(b.x) && isValidNumber(b.y)) {
      positions.push(a.x, a.y, a.z || 0, b.x, b.y, b.z || 0);
    }
  }
  if (node.closed && vertices.length > 1) {
    const first = vertices[0], last = vertices[vertices.length - 1];
    if (isValidNumber(first.x) && isValidNumber(last.x)) {
      positions.push(last.x, last.y, last.z || 0, first.x, first.y, first.z || 0);
    }
  }
  const deduped = dedupLineSegmentPositions(positions);
  return deduped.length >= 6 ? deduped : null;
}

function splinePositions(node: any): number[] | null {
  const fitPoints = node.fitPoints;
  const controlPoints = node.controlPoints;
  const points = fitPoints.length >= 2 ? fitPoints : controlPoints;
  if (points.length < 2) return null;

  const validPoints = points.filter((p: { x: number; y: number; z: number }) =>
    isValidNumber(p.x) && isValidNumber(p.y));
  if (validPoints.length < 2) return null;

  const positions: number[] = [];
  for (let i = 0; i < validPoints.length - 1; i++) {
    const a = validPoints[i], b = validPoints[i + 1];
    positions.push(a.x, a.y, a.z || 0, b.x, b.y, b.z || 0);
  }
  const deduped = dedupLineSegmentPositions(positions);
  return deduped.length >= 6 ? deduped : null;
}

function dimensionPositions(node: any): number[] | null {
  const positions: number[] = [];
  const dx = node.defX, dy = node.defY, mx = node.midX, my = node.midY;
  if (isValidNumber(dx) && isValidNumber(dy) && isValidNumber(mx) && isValidNumber(my)) {
    const ddx = mx - dx, ddy = my - dy;
    if (ddx * ddx + ddy * ddy > 0.01) {
      positions.push(dx, dy, 0, mx, my, 0);
    }
  }
  return positions.length >= 6 ? positions : null;
}

export const positionMethods = {
  extractLinePositions(this: GeometryFactory, node: SceneNode): number[] | null {
    const f = this as unknown as GeometryFactoryInternal;
    const viewW = cameraViewWidth(f._sceneManager);
    const canvasW = f._sceneManager.width;

    switch (node.type) {
      case 'line': {
        const sx = node.startX, sy = node.startY, ex = node.endX, ey = node.endY;
        const dx = ex - sx, dy = ey - sy;
        if (dx * dx + dy * dy < 0.01) return null;
        return [sx, sy, 0, ex, ey, 0];
      }
      case 'circle': {
        if (node.radius <= 0) return null;
        return circlePositions(node.centerX, node.centerY, node.radius, 0, Math.PI * 2, viewW, canvasW);
      }
      case 'arc': {
        if (node.radius <= 0) return null;
        return circlePositions(node.centerX, node.centerY, node.radius, node.startAngle, node.endAngle, viewW, canvasW);
      }
      case 'ellipse': {
        return ellipsePositions(node as any, viewW, canvasW);
      }
      case 'lwPolyline': {
        return lwPolylinePositions(f, node as any);
      }
      case 'polyline': {
        return polylinePositions(node as any);
      }
      case 'spline': {
        return splinePositions(node as any);
      }
      case 'dimension': {
        return dimensionPositions(node as any);
      }
      default:
        return null;
    }
  },
} satisfies Pick<GeometryFactory, 'extractLinePositions'>;