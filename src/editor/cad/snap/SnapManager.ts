import * as THREE from 'three';
import type { SceneNode } from '../cad_runtime/scene_node';
import type { SnapPoint, SnapSettings } from './types';

export class SnapManager {
  private _enabledSnaps: Set<string>;
  private _snapRadius: number;
  private _nodeIndex: Map<string, SceneNode>;
  private _entityLayers: Map<string, string>;
  private _hiddenLayers: Set<string>;

  constructor(settings?: Partial<SnapSettings>) {
    this._enabledSnaps = new Set<string>(['endpoint', 'midpoint', 'center']);
    this._snapRadius = settings?.snapRadius ?? 10;
    this._nodeIndex = new Map();
    this._entityLayers = new Map();
    this._hiddenLayers = new Set();
  }

  setNodeIndex(nodeIndex: Map<string, SceneNode>): void {
    this._nodeIndex = nodeIndex;
  }

  setEntityLayers(entityLayers: Map<string, string>): void {
    this._entityLayers = entityLayers;
  }

  setHiddenLayers(hiddenLayers: Set<string>): void {
    this._hiddenLayers = hiddenLayers;
  }

  enableSnap(type: string): void {
    this._enabledSnaps.add(type);
  }

  disableSnap(type: string): void {
    this._enabledSnaps.delete(type);
  }

  setSnapRadius(radius: number): void {
    this._snapRadius = radius;
  }

  isSnapEnabled(type: string): boolean {
    return this._enabledSnaps.has(type);
  }

  /**
   * 查找捕捉点
   * @param mouseX 鼠标X坐标（屏幕坐标）
   * @param mouseY 鼠标Y坐标（屏幕坐标）
   * @param camera 相机
   * @param canvasWidth canvas宽度
   * @param canvasHeight canvas高度
   * @returns 捕捉点或null
   */
  findSnapPoint(
    mouseX: number,
    mouseY: number,
    camera: THREE.OrthographicCamera,
    canvasWidth: number,
    canvasHeight: number
  ): SnapPoint | null {
    // 将屏幕坐标转换为世界坐标
    const rect = { left: 0, top: 0, width: canvasWidth, height: canvasHeight };
    const ndcX = ((mouseX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((mouseY - rect.top) / rect.height) * 2 + 1;
    
    const worldX = camera.position.x + ndcX * (camera.right - camera.left) / 2;
    const worldY = camera.position.y + ndcY * (camera.top - camera.bottom) / 2;

    // 计算捕捉半径对应的世界坐标距离
    const worldSnapRadius = this._snapRadius * (camera.right - camera.left) / canvasWidth;

    let closestSnap: SnapPoint | null = null;
    let closestDist = worldSnapRadius;

    // 端点捕捉
    if (this._enabledSnaps.has('endpoint')) {
      const snap = this._findEndpoint(worldX, worldY, worldSnapRadius);
      if (snap && snap.distance < closestDist) {
        closestSnap = snap;
        closestDist = snap.distance;
      }
    }

    // 中点捕捉
    if (this._enabledSnaps.has('midpoint')) {
      const snap = this._findMidpoint(worldX, worldY, worldSnapRadius);
      if (snap && snap.distance < closestDist) {
        closestSnap = snap;
        closestDist = snap.distance;
      }
    }

    // 圆心捕捉
    if (this._enabledSnaps.has('center')) {
      const snap = this._findCenter(worldX, worldY, worldSnapRadius);
      if (snap && snap.distance < closestDist) {
        closestSnap = snap;
        closestDist = snap.distance;
      }
    }

    // 交点捕捉（性能开销大，放在最后）
    if (this._enabledSnaps.has('intersection')) {
      const snap = this._findIntersection(worldX, worldY, worldSnapRadius);
      if (snap && snap.distance < closestDist) {
        closestSnap = snap;
        closestDist = snap.distance;
      }
    }

    return closestSnap;
  }

  private _findEndpoint(worldX: number, worldY: number, radius: number): SnapPoint | null {
    let closest: SnapPoint | null = null;
    let closestDist = radius;

    for (const [id, node] of this._nodeIndex) {
      if (this._isEntityHidden(id)) continue;

      const points = this._getEndpointPoints(node);
      for (const p of points) {
        const dist = Math.hypot(p.x - worldX, p.y - worldY);
        if (dist < closestDist) {
          closestDist = dist;
          closest = {
            x: p.x,
            y: p.y,
            type: 'endpoint',
            entityId: id,
            description: `端点: (${p.x.toFixed(2)}, ${p.y.toFixed(2)})`,
            distance: dist,
          } as SnapPoint & { distance: number };
        }
      }
    }

    return closest;
  }

  private _findMidpoint(worldX: number, worldY: number, radius: number): SnapPoint | null {
    let closest: SnapPoint | null = null;
    let closestDist = radius;

    for (const [id, node] of this._nodeIndex) {
      if (this._isEntityHidden(id)) continue;

      const points = this._getMidpoints(node);
      for (const p of points) {
        const dist = Math.hypot(p.x - worldX, p.y - worldY);
        if (dist < closestDist) {
          closestDist = dist;
          closest = {
            x: p.x,
            y: p.y,
            type: 'midpoint',
            entityId: id,
            description: `中点: (${p.x.toFixed(2)}, ${p.y.toFixed(2)})`,
            distance: dist,
          } as SnapPoint & { distance: number };
        }
      }
    }

    return closest;
  }

  private _findCenter(worldX: number, worldY: number, radius: number): SnapPoint | null {
    let closest: SnapPoint | null = null;
    let closestDist = radius;

    for (const [id, node] of this._nodeIndex) {
      if (this._isEntityHidden(id)) continue;

      const center = this._getCenter(node);
      if (center) {
        const dist = Math.hypot(center.x - worldX, center.y - worldY);
        if (dist < closestDist) {
          closestDist = dist;
          closest = {
            x: center.x,
            y: center.y,
            type: 'center',
            entityId: id,
            description: `圆心: (${center.x.toFixed(2)}, ${center.y.toFixed(2)})`,
            distance: dist,
          } as SnapPoint & { distance: number };
        }
      }
    }

    return closest;
  }

  private _findIntersection(worldX: number, worldY: number, radius: number): SnapPoint | null {
    let closest: SnapPoint | null = null;
    let closestDist = radius;

    const lineEntities: Array<{ id: string; x1: number; y1: number; x2: number; y2: number }> = [];
    const arcEntities: Array<{ id: string; cx: number; cy: number; r: number; startAngle: number; endAngle: number }> = [];
    const circleEntities: Array<{ id: string; cx: number; cy: number; r: number }> = [];

    for (const [id, node] of this._nodeIndex) {
      if (this._isEntityHidden(id)) continue;

      switch (node.type) {
        case 'line':
          lineEntities.push({ id, x1: (node as any).startX, y1: (node as any).startY, x2: (node as any).endX, y2: (node as any).endY });
          break;
        case 'arc':
          arcEntities.push({ id, cx: (node as any).centerX, cy: (node as any).centerY, r: (node as any).radius, startAngle: (node as any).startAngle, endAngle: (node as any).endAngle });
          break;
        case 'circle':
          circleEntities.push({ id, cx: (node as any).centerX, cy: (node as any).centerY, r: (node as any).radius });
          break;
        case 'lwPolyline':
        case 'polyline': {
          const vertices = (node as any).vertices || [];
          for (let i = 0; i < vertices.length - 1; i++) {
            lineEntities.push({ id: `${id}_seg${i}`, x1: vertices[i].x, y1: vertices[i].y, x2: vertices[i + 1].x, y2: vertices[i + 1].y });
          }
          break;
        }
      }
    }

    for (let i = 0; i < lineEntities.length; i++) {
      for (let j = i + 1; j < lineEntities.length; j++) {
        const pts = this._lineLineIntersection(lineEntities[i], lineEntities[j]);
        for (const pt of pts) {
          const dist = Math.hypot(pt.x - worldX, pt.y - worldY);
          if (dist < closestDist) {
            closestDist = dist;
            closest = {
              x: pt.x,
              y: pt.y,
              type: 'intersection',
              entityId: lineEntities[i].id,
              description: `交点: (${pt.x.toFixed(2)}, ${pt.y.toFixed(2)})`,
              distance: dist,
            } as SnapPoint & { distance: number };
          }
        }
      }
    }

    for (const line of lineEntities) {
      for (const circle of circleEntities) {
        const pts = this._lineCircleIntersection(line.x1, line.y1, line.x2, line.y2, circle.cx, circle.cy, circle.r);
        for (const pt of pts) {
          const dist = Math.hypot(pt.x - worldX, pt.y - worldY);
          if (dist < closestDist) {
            closestDist = dist;
            closest = {
              x: pt.x,
              y: pt.y,
              type: 'intersection',
              entityId: line.id,
              description: `交点: (${pt.x.toFixed(2)}, ${pt.y.toFixed(2)})`,
              distance: dist,
            } as SnapPoint & { distance: number };
          }
        }
      }
    }

    for (let i = 0; i < circleEntities.length; i++) {
      for (let j = i + 1; j < circleEntities.length; j++) {
        const pts = this._circleCircleIntersection(
          circleEntities[i].cx, circleEntities[i].cy, circleEntities[i].r,
          circleEntities[j].cx, circleEntities[j].cy, circleEntities[j].r
        );
        for (const pt of pts) {
          const dist = Math.hypot(pt.x - worldX, pt.y - worldY);
          if (dist < closestDist) {
            closestDist = dist;
            closest = {
              x: pt.x,
              y: pt.y,
              type: 'intersection',
              entityId: circleEntities[i].id,
              description: `交点: (${pt.x.toFixed(2)}, ${pt.y.toFixed(2)})`,
              distance: dist,
            } as SnapPoint & { distance: number };
          }
        }
      }
    }

    for (const line of lineEntities) {
      for (const arc of arcEntities) {
        const pts = this._lineCircleIntersection(line.x1, line.y1, line.x2, line.y2, arc.cx, arc.cy, arc.r);
        for (const pt of pts) {
          const angle = Math.atan2(pt.y - arc.cy, pt.x - arc.cx);
          if (this._isAngleInRange(angle, arc.startAngle, arc.endAngle)) {
            const dist = Math.hypot(pt.x - worldX, pt.y - worldY);
            if (dist < closestDist) {
              closestDist = dist;
              closest = {
                x: pt.x,
                y: pt.y,
                type: 'intersection',
                entityId: line.id,
                description: `交点: (${pt.x.toFixed(2)}, ${pt.y.toFixed(2)})`,
                distance: dist,
              } as SnapPoint & { distance: number };
            }
          }
        }
      }
    }

    return closest;
  }

  private _lineLineIntersection(
    l1: { x1: number; y1: number; x2: number; y2: number },
    l2: { x1: number; y1: number; x2: number; y2: number }
  ): Array<{ x: number; y: number }> {
    const dx1 = l1.x2 - l1.x1;
    const dy1 = l1.y2 - l1.y1;
    const dx2 = l2.x2 - l2.x1;
    const dy2 = l2.y2 - l2.y1;

    const denom = dx1 * dy2 - dy1 * dx2;
    if (Math.abs(denom) < 1e-10) return [];

    const t = ((l2.x1 - l1.x1) * dy2 - (l2.y1 - l1.y1) * dx2) / denom;
    const u = ((l2.x1 - l1.x1) * dy1 - (l2.y1 - l1.y1) * dx1) / denom;

    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return [{ x: l1.x1 + t * dx1, y: l1.y1 + t * dy1 }];
    }
    return [];
  }

  private _lineCircleIntersection(
    x1: number, y1: number, x2: number, y2: number,
    cx: number, cy: number, r: number
  ): Array<{ x: number; y: number }> {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const fx = x1 - cx;
    const fy = y1 - cy;

    const a = dx * dx + dy * dy;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - r * r;

    let discriminant = b * b - 4 * a * c;
    if (discriminant < 0 || a < 1e-10) return [];

    discriminant = Math.sqrt(discriminant);
    const results: Array<{ x: number; y: number }> = [];

    const t1 = (-b - discriminant) / (2 * a);
    const t2 = (-b + discriminant) / (2 * a);

    if (t1 >= 0 && t1 <= 1) {
      results.push({ x: x1 + t1 * dx, y: y1 + t1 * dy });
    }
    if (t2 >= 0 && t2 <= 1 && Math.abs(t2 - t1) > 1e-10) {
      results.push({ x: x1 + t2 * dx, y: y1 + t2 * dy });
    }

    return results;
  }

  private _circleCircleIntersection(
    cx1: number, cy1: number, r1: number,
    cx2: number, cy2: number, r2: number
  ): Array<{ x: number; y: number }> {
    const dx = cx2 - cx1;
    const dy = cy2 - cy1;
    const d = Math.sqrt(dx * dx + dy * dy);

    if (d > r1 + r2 || d < Math.abs(r1 - r2) || d < 1e-10) return [];

    const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
    const hSq = r1 * r1 - a * a;
    if (hSq < 0) return [];
    const h = Math.sqrt(hSq);

    const px = cx1 + a * dx / d;
    const py = cy1 + a * dy / d;

    const results: Array<{ x: number; y: number }> = [];
    results.push({ x: px + h * dy / d, y: py - h * dx / d });

    if (h > 1e-10) {
      results.push({ x: px - h * dy / d, y: py + h * dx / d });
    }

    return results;
  }

  private _isAngleInRange(angle: number, startAngle: number, endAngle: number): boolean {
    const TWO_PI = Math.PI * 2;
    const normalizeAngle = (a: number): number => {
      let na = a % TWO_PI;
      if (na < 0) na += TWO_PI;
      return na;
    };

    const na = normalizeAngle(angle);
    const ns = normalizeAngle(startAngle);
    const ne = normalizeAngle(endAngle);

    if (ns <= ne) {
      return na >= ns && na <= ne;
    } else {
      return na >= ns || na <= ne;
    }
  }

  private _getEndpointPoints(node: SceneNode): Array<{ x: number; y: number }> {
    const points: Array<{ x: number; y: number }> = [];

    switch (node.type) {
      case 'line':
        points.push({ x: (node as any).startX, y: (node as any).startY });
        points.push({ x: (node as any).endX, y: (node as any).endY });
        break;
      case 'circle':
      case 'arc':
        // 圆和圆弧的"端点"概念不适用，跳过
        break;
      case 'lwPolyline':
      case 'polyline': {
        const vertices = (node as any).vertices || [];
        for (const v of vertices) {
          points.push({ x: v.x, y: v.y });
        }
        break;
      }
      case 'text':
      case 'mText':
      case 'point':
      case 'insert':
        points.push({ x: (node as any).posX, y: (node as any).posY });
        break;
    }

    return points;
  }

  private _getMidpoints(node: SceneNode): Array<{ x: number; y: number }> {
    const points: Array<{ x: number; y: number }> = [];

    switch (node.type) {
      case 'line': {
        const startX = (node as any).startX;
        const startY = (node as any).startY;
        const endX = (node as any).endX;
        const endY = (node as any).endY;
        points.push({ x: (startX + endX) / 2, y: (startY + endY) / 2 });
        break;
      }
      case 'lwPolyline':
      case 'polyline': {
        const vertices = (node as any).vertices || [];
        for (let i = 0; i < vertices.length - 1; i++) {
          const v1 = vertices[i];
          const v2 = vertices[i + 1];
          if (v1.bulge === 0 || !v1.bulge) {
            points.push({ x: (v1.x + v2.x) / 2, y: (v1.y + v2.y) / 2 });
          }
        }
        break;
      }
    }

    return points;
  }

  private _getCenter(node: SceneNode): { x: number; y: number } | null {
    switch (node.type) {
      case 'circle':
      case 'arc':
        return { x: (node as any).centerX, y: (node as any).centerY };
      case 'ellipse':
        return { x: (node as any).centerX, y: (node as any).centerY };
      default:
        return null;
    }
  }

  private _isEntityHidden(entityId: string): boolean {
    const layer = this._entityLayers.get(entityId);
    if (!layer) return false;
    return this._hiddenLayers.has(layer);
  }
}
