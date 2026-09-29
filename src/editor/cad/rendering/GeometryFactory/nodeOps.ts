import type { SceneNode, LwPolylineNode } from '../../cad_runtime/scene_node';
import type { GeometryFactory } from './core';

declare module './core' {
  interface GeometryFactory {
    /** 退化包围盒补足最小尺寸（避免拾取/裁剪异常）。 */
    expandDegenerateBbox(node: SceneNode): void;
    /** 是否为可合批渲染的实体类型 */
    isBatchableType(type: string): boolean;
    /** lwPolyline 节点顶点数过多时进行抽稀 */
    decimateLwPolylineNode(node: SceneNode): SceneNode;
    /** 根据 SceneNode 计算 bbox（用于实体编辑后重算包围盒） */
    recomputeBbox(node: SceneNode): void;
    /** 平移 SceneNode 的所有坐标 */
    translateNode(node: SceneNode, dx: number, dy: number): void;
  }
}

export const nodeOpMethods = {
  expandDegenerateBbox(this: GeometryFactory, node: SceneNode): void {
    const bb = node.bbox;
    const dx = bb.maxX - bb.minX;
    const dy = bb.maxY - bb.minY;
    const minSize = 2.0;
    if (dx < minSize) {
      const cx = (bb.minX + bb.maxX) / 2;
      bb.minX = cx - minSize / 2;
      bb.maxX = cx + minSize / 2;
    }
    if (dy < minSize) {
      const cy = (bb.minY + bb.maxY) / 2;
      bb.minY = cy - minSize / 2;
      bb.maxY = cy + minSize / 2;
    }
  },

  isBatchableType(this: GeometryFactory, type: string): boolean {
    return type === 'line' || type === 'circle' || type === 'arc' ||
           type === 'polyline' || type === 'lwPolyline' || type === 'spline' ||
           type === 'ellipse' || type === 'dimension';
  },

  decimateLwPolylineNode(this: GeometryFactory, node: SceneNode): SceneNode {
    if (node.type !== 'lwPolyline') return node;
    const lwNode = node as LwPolylineNode;
    const maxVerts = 2000;
    if (lwNode.vertices.length <= maxVerts) return node;
    const step = Math.ceil(lwNode.vertices.length / maxVerts);
    const decimated = [] as Array<{ x: number; y: number; bulge: number }>;
    for (let i = 0; i < lwNode.vertices.length; i += step) {
      decimated.push(lwNode.vertices[i]);
    }
    const last = lwNode.vertices[lwNode.vertices.length - 1];
    const decLast = decimated[decimated.length - 1];
    if (decLast.x !== last.x || decLast.y !== last.y) decimated.push(last);
    if (lwNode.closed) {
      const first = lwNode.vertices[0];
      const decLast2 = decimated[decimated.length - 1];
      if (decLast2.x !== first.x || decLast2.y !== first.y) decimated.push(first);
    }
    return { ...lwNode, vertices: decimated };
  },

  recomputeBbox(this: GeometryFactory, node: SceneNode): void {
    switch (node.type) {
      case 'line': {
        node.bbox = { minX: Math.min(node.startX, node.endX), minY: Math.min(node.startY, node.endY), maxX: Math.max(node.startX, node.endX), maxY: Math.max(node.startY, node.endY) };
        break;
      }
      case 'circle': {
        node.bbox = { minX: node.centerX - node.radius, minY: node.centerY - node.radius, maxX: node.centerX + node.radius, maxY: node.centerY + node.radius };
        break;
      }
      case 'arc': {
        node.bbox = { minX: node.centerX - node.radius, minY: node.centerY - node.radius, maxX: node.centerX + node.radius, maxY: node.centerY + node.radius };
        break;
      }
      case 'text': {
        node.bbox = this.textNodeBbox(node);
        break;
      }
      case 'mText': {
        node.bbox = this.mTextNodeBbox(node);
        break;
      }
      case 'point': {
        node.bbox = { minX: node.posX - 1, minY: node.posY - 1, maxX: node.posX + 1, maxY: node.posY + 1 };
        break;
      }
      case 'insert': {
        node.bbox = { minX: node.posX - 10, minY: node.posY - 10, maxX: node.posX + 10, maxY: node.posY + 10 };
        break;
      }
      default:
        break;
    }
  },

  translateNode(this: GeometryFactory, node: SceneNode, dx: number, dy: number): void {
    switch (node.type) {
      case 'line':
        node.startX += dx; node.startY += dy;
        node.endX += dx; node.endY += dy;
        break;
      case 'circle':
      case 'arc':
      case 'ellipse':
        node.centerX += dx; node.centerY += dy;
        break;
      case 'lwPolyline':
        for (const v of node.vertices) { v.x += dx; v.y += dy; }
        break;
      case 'polyline':
        for (const v of node.vertices) { v.x += dx; v.y += dy; }
        break;
      case 'spline':
        for (const p of node.controlPoints) { p.x += dx; p.y += dy; }
        for (const p of node.fitPoints) { p.x += dx; p.y += dy; }
        break;
      case 'text':
      case 'mText':
      case 'point':
      case 'insert':
        node.posX += dx; node.posY += dy;
        break;
      case 'solid':
        for (const p of node.points) { p.x += dx; p.y += dy; }
        break;
      case 'hatch':
        for (const path of node.boundaries) {
          for (const v of path) { v.x += dx; v.y += dy; }
        }
        break;
      case 'dimension':
        node.defX += dx; node.defY += dy;
        node.midX += dx; node.midY += dy;
        break;
    }
    // bbox 同步平移
    node.bbox.minX += dx; node.bbox.maxX += dx;
    node.bbox.minY += dy; node.bbox.maxY += dy;
  },
} satisfies Pick<GeometryFactory, 'expandDegenerateBbox' | 'isBatchableType' | 'decimateLwPolylineNode' | 'recomputeBbox' | 'translateNode'>;