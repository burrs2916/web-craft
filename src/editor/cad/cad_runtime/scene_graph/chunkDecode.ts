import {
  ChunkDecoder,
  CHUNK_TAG_LINE,
  CHUNK_TAG_CIRCLE,
  CHUNK_TAG_ARC,
  CHUNK_TAG_ELLIPSE,
  CHUNK_TAG_LWPOLYLINE,
  CHUNK_TAG_POLYLINE,
  CHUNK_TAG_SPLINE,
  CHUNK_TAG_TEXT,
  CHUNK_TAG_MTEXT,
  CHUNK_TAG_SOLID,
  CHUNK_TAG_POINT,
  CHUNK_TAG_INSERT,
  CHUNK_TAG_HATCH,
  CHUNK_TAG_DIMENSION,
} from '../cadbin_reader';
import type {
  SceneNode,
  LineNode,
  CircleNode,
  ArcNode,
  EllipseNode,
  LwPolylineNode,
  PolylineNode,
  SplineNode,
  PointNode,
  TextNode,
  MTextNode,
  SolidNode,
  InsertNode,
  HatchNode,
  DimensionNode,
} from '../scene_node';
import { textNodeBbox, mTextNodeBbox } from './textBbox';

export function decodeChunk(decoder: ChunkDecoder, tag: number, data: DataView, count: number): SceneNode[] {
  const nodes: SceneNode[] = [];

  switch (tag) {
    case CHUNK_TAG_LINE: {
      const items = decoder.decodeLines(data, count);
      for (const item of items) {
        const node: LineNode = {
          id: item.id,
          type: 'line',
          layer: item.layer,
          color: item.color,
          visible: true,
          selected: false,
          dirty: false,
          bbox: {
            minX: Math.min(item.startX, item.endX),
            minY: Math.min(item.startY, item.endY),
            maxX: Math.max(item.startX, item.endX),
            maxY: Math.max(item.startY, item.endY),
          },
          startX: item.startX,
          startY: item.startY,
          endX: item.endX,
          endY: item.endY,
          lineWeight: item.lineWeight,
        };
        nodes.push(node);
      }
      break;
    }
    case CHUNK_TAG_CIRCLE: {
      const items = decoder.decodeCircles(data, count);
      for (const item of items) {
        const node: CircleNode = {
          id: item.id,
          type: 'circle',
          layer: item.layer,
          color: item.color,
          visible: true,
          selected: false,
          dirty: false,
          bbox: {
            minX: item.centerX - item.radius,
            minY: item.centerY - item.radius,
            maxX: item.centerX + item.radius,
            maxY: item.centerY + item.radius,
          },
          centerX: item.centerX,
          centerY: item.centerY,
          radius: item.radius,
          lineWeight: item.lineWeight,
        };
        nodes.push(node);
      }
      break;
    }
    case CHUNK_TAG_ARC: {
      const items = decoder.decodeArcs(data, count);
      for (const item of items) {
        const node: ArcNode = {
          id: item.id,
          type: 'arc',
          layer: item.layer,
          color: item.color,
          visible: true,
          selected: false,
          dirty: false,
          bbox: {
            minX: item.centerX - item.radius,
            minY: item.centerY - item.radius,
            maxX: item.centerX + item.radius,
            maxY: item.centerY + item.radius,
          },
          centerX: item.centerX,
          centerY: item.centerY,
          radius: item.radius,
          startAngle: item.startAngle,
          endAngle: item.endAngle,
          lineWeight: item.lineWeight,
        };
        nodes.push(node);
      }
      break;
    }
    case CHUNK_TAG_POINT: {
      const items = decoder.decodePoints(data, count);
      for (const item of items) {
        const node: PointNode = {
          id: item.id,
          type: 'point',
          layer: item.layer,
          color: item.color,
          visible: true,
          selected: false,
          dirty: false,
          bbox: {
            minX: item.posX - 1,
            minY: item.posY - 1,
            maxX: item.posX + 1,
            maxY: item.posY + 1,
          },
          posX: item.posX,
          posY: item.posY,
        };
        nodes.push(node);
      }
      break;
    }
    case CHUNK_TAG_TEXT: {
      const items = decoder.decodeTexts(data, count);
      for (const item of items) {
        const node: TextNode = {
          id: item.id,
          type: 'text',
          layer: item.layer,
          color: item.color,
          visible: true,
          selected: false,
          dirty: false,
          bbox: textNodeBbox(
            item.posX,
            item.posY,
            item.height,
            item.rotation,
            item.horizontalAlignment,
            item.verticalAlignment,
            item.content,
          ),
          posX: item.posX,
          posY: item.posY,
          height: item.height,
          rotation: item.rotation,
          horizontalAlignment: item.horizontalAlignment,
          verticalAlignment: item.verticalAlignment,
          content: item.content,
        };
        nodes.push(node);
      }
      break;
    }
    case CHUNK_TAG_MTEXT: {
      const items = decoder.decodeMTexts(data, count);
      for (const item of items) {
        const node: MTextNode = {
          id: item.id,
          type: 'mText',
          layer: item.layer,
          color: item.color,
          visible: true,
          selected: false,
          dirty: false,
          bbox: mTextNodeBbox(
            item.posX,
            item.posY,
            item.height,
            item.width,
            item.rotation,
            item.attachmentPoint,
            item.widthFactor,
            item.heightScale,
            item.content,
          ),
          posX: item.posX,
          posY: item.posY,
          height: item.height,
          width: item.width,
          rotation: item.rotation,
          attachmentPoint: item.attachmentPoint,
          widthFactor: item.widthFactor,
          heightScale: item.heightScale,
          fontName: item.fontName,
          content: item.content,
        };
        nodes.push(node);
      }
      break;
    }
    case CHUNK_TAG_INSERT: {
      const items = decoder.decodeInserts(data, count);
      for (const item of items) {
        const node: InsertNode = {
          id: item.id,
          type: 'insert',
          layer: item.layer,
          color: item.color,
          visible: true,
          selected: false,
          dirty: false,
          bbox: {
            minX: item.posX - 10,
            minY: item.posY - 10,
            maxX: item.posX + 10,
            maxY: item.posY + 10,
          },
          posX: item.posX,
          posY: item.posY,
          scaleX: item.scaleX,
          scaleY: item.scaleY,
          rotation: item.rotation,
          blockName: item.blockName,
        };
        nodes.push(node);
      }
      break;
    }
    case CHUNK_TAG_ELLIPSE: {
      const items = decoder.decodeEllipses(data, count);
      for (const item of items) {
        const majorLen = Math.sqrt(item.majorX * item.majorX + item.majorY * item.majorY);
        const minorLen = majorLen * item.minorRatio;
        const node: EllipseNode = {
          id: item.id,
          type: 'ellipse',
          layer: item.layer,
          color: item.color,
          visible: true,
          selected: false,
          dirty: false,
          bbox: {
            minX: item.centerX - majorLen,
            minY: item.centerY - minorLen,
            maxX: item.centerX + majorLen,
            maxY: item.centerY + minorLen,
          },
          centerX: item.centerX,
          centerY: item.centerY,
          majorX: item.majorX,
          majorY: item.majorY,
          minorRatio: item.minorRatio,
          startAngle: item.startAngle,
          endAngle: item.endAngle,
          lineWeight: item.lineWeight,
        };
        nodes.push(node);
      }
      break;
    }
    case CHUNK_TAG_LWPOLYLINE: {
      const items = decoder.decodeLwPolylines(data, count);
      for (const item of items) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const v of item.vertices) {
          minX = Math.min(minX, v.x);
          minY = Math.min(minY, v.y);
          maxX = Math.max(maxX, v.x);
          maxY = Math.max(maxY, v.y);
        }
        if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 1; maxY = 1; }
        const node: LwPolylineNode = {
          id: item.id,
          type: 'lwPolyline',
          layer: item.layer,
          color: item.color,
          visible: true,
          selected: false,
          dirty: false,
          bbox: { minX, minY, maxX, maxY },
          vertices: item.vertices,
          closed: item.closed,
          lineWeight: item.lineWeight,
        };
        nodes.push(node);
      }
      break;
    }
    case CHUNK_TAG_POLYLINE: {
      const items = decoder.decodePolylines(data, count);
      for (const item of items) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const v of item.vertices) {
          minX = Math.min(minX, v.x);
          minY = Math.min(minY, v.y);
          maxX = Math.max(maxX, v.x);
          maxY = Math.max(maxY, v.y);
        }
        if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 1; maxY = 1; }
        const node: PolylineNode = {
          id: item.id,
          type: 'polyline',
          layer: item.layer,
          color: item.color,
          visible: true,
          selected: false,
          dirty: false,
          bbox: { minX, minY, maxX, maxY },
          vertices: item.vertices,
          closed: item.closed,
          lineWeight: item.lineWeight,
        };
        nodes.push(node);
      }
      break;
    }
    case CHUNK_TAG_SPLINE: {
      const items = decoder.decodeSplines(data, count);
      for (const item of items) {
        const allPts = [...item.controlPoints, ...item.fitPoints];
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of allPts) {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        }
        if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 1; maxY = 1; }
        const node: SplineNode = {
          id: item.id,
          type: 'spline',
          layer: item.layer,
          color: item.color,
          visible: true,
          selected: false,
          dirty: false,
          bbox: { minX, minY, maxX, maxY },
          controlPoints: item.controlPoints,
          fitPoints: item.fitPoints,
          knots: item.knots,
          degree: item.degree,
          lineWeight: item.lineWeight,
        };
        nodes.push(node);
      }
      break;
    }
    case CHUNK_TAG_SOLID: {
      const items = decoder.decodeSolids(data, count);
      for (const item of items) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of item.points) {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        }
        if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 1; maxY = 1; }
        const node: SolidNode = {
          id: item.id,
          type: 'solid',
          layer: item.layer,
          color: item.color,
          visible: true,
          selected: false,
          dirty: false,
          bbox: { minX, minY, maxX, maxY },
          points: item.points,
        };
        nodes.push(node);
      }
      break;
    }
    case CHUNK_TAG_HATCH: {
      const items = decoder.decodeHatches(data, count);
      for (const item of items) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const path of item.boundaries) {
          for (const v of path) {
            minX = Math.min(minX, v.x);
            minY = Math.min(minY, v.y);
            maxX = Math.max(maxX, v.x);
            maxY = Math.max(maxY, v.y);
          }
        }
        if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 1; maxY = 1; }
        const node: HatchNode = {
          id: item.id,
          type: 'hatch',
          layer: item.layer,
          color: item.color,
          visible: true,
          selected: false,
          dirty: false,
          bbox: { minX, minY, maxX, maxY },
          boundaries: item.boundaries,
          patternName: item.patternName,
          patternType: item.patternType,
          solid: item.solid,
          scale: item.scale,
          angle: item.angle,
          style: item.style,
          patternLines: item.patternLines,
        };
        nodes.push(node);
      }
      break;
    }
    case CHUNK_TAG_DIMENSION: {
      const items = decoder.decodeDimensions(data, count);
      for (const item of items) {
        const minX = Math.min(item.defX, item.midX);
        const minY = Math.min(item.defY, item.midY);
        const maxX = Math.max(item.defX, item.midX);
        const maxY = Math.max(item.defY, item.midY);
        const node: DimensionNode = {
          id: item.id,
          type: 'dimension',
          layer: item.layer,
          color: item.color,
          visible: true,
          selected: false,
          dirty: false,
          bbox: { minX, minY, maxX, maxY },
          defX: item.defX,
          defY: item.defY,
          midX: item.midX,
          midY: item.midY,
          rotation: item.rotation,
          content: item.content,
        };
        nodes.push(node);
      }
      break;
    }
    default:
      break;
  }

  return nodes;
}