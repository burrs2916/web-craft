import * as THREE from 'three';
import { Text as TroikaText } from 'troika-three-text';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import type { CadEntity, CadPoint, CadLwVertex } from '../types';
import type { SceneNode, BoundingBox } from '../cad_runtime/scene_node';
import type { LwPolylineNode } from '../cad_runtime/scene_node';
import type { EntityRendererRegistry, EntityRenderContext } from '../cad_runtime/entity_renderers/EntityRenderer';
import type { SdfTextRenderer } from '../cad_runtime/sdf_text_renderer';
import type { TransformParams } from '../coordinate/TransformCalculator';
import { applyTransform } from '../coordinate/TransformCalculator';
import type { SceneManager } from './SceneManager';
import type { EntityStore } from './EntityStore';
import { logger } from '../../../utils/logger';

// ── Constants ──

export const DEFAULT_LINE_WIDTH = 1.5;
export const HIGHLIGHT_COLOR = new THREE.Color(0x00ff88);
export const MIN_LUMINANCE_ON_DARK_BG = 0.18;
export const MAX_LUMINANCE_ON_LIGHT_BG = 0.82;
export const TARGET_LUMINANCE_DARK = 0.35;
export const TARGET_LUMINANCE_LIGHT = 0.55;
export const DELETED_LAYER_NAME = '__deleted__';
export const FONT_URL = '/fonts/SourceHanSansCN-Regular.otf';
/** lineWeight(mm) → 屏幕像素宽度的映射系数 */
export const LINE_WEIGHT_SCALE = 2.0;
/** 线宽像素上限（CSS 像素），乘以 DPR 后为物理像素上限 */
export const LINE_WIDTH_MAX_PX = 4;

// ── Pure validation utilities (exported for reuse) ──

export function isValidNumber(value: number): boolean {
  return Number.isFinite(value) && !Number.isNaN(value);
}

export function isValidPoint(point: CadPoint): boolean {
  return isValidNumber(point.x) && isValidNumber(point.y) && isValidNumber(point.z);
}

export function isValidVector3(v: THREE.Vector3): boolean {
  return isValidNumber(v.x) && isValidNumber(v.y) && isValidNumber(v.z);
}

export function isValidBoundingBox(bb: BoundingBox | null | undefined): bb is BoundingBox {
  return !!bb
    && isValidNumber(bb.minX)
    && isValidNumber(bb.minY)
    && isValidNumber(bb.maxX)
    && isValidNumber(bb.maxY)
    && bb.maxX > bb.minX
    && bb.maxY > bb.minY;
}

export function validateGeometry(geometry: THREE.BufferGeometry): boolean {
  const position = geometry.getAttribute('position');
  if (!position) return false;
  const array = position.array;
  for (let i = 0; i < array.length; i++) {
    if (!isValidNumber(array[i])) return false;
  }
  return true;
}

export function validateLine2Geometry(line2: Line2): boolean {
  try {
    const geo = line2.geometry;
    const posAttr = geo.getAttribute('instanceStart');
    if (posAttr) {
      const arr = (posAttr as any).data?.array || (posAttr as any).array;
      if (arr) {
        for (let i = 0; i < arr.length; i++) {
          if (!isValidNumber(arr[i])) return false;
        }
      }
    }
    const posAttrEnd = geo.getAttribute('instanceEnd');
    if (posAttrEnd) {
      const arr = (posAttrEnd as any).data?.array || (posAttrEnd as any).array;
      if (arr) {
        for (let i = 0; i < arr.length; i++) {
          if (!isValidNumber(arr[i])) return false;
        }
      }
    }
    return true;
  } catch {
    return false;
  }
}

export function validateObject3D(obj: THREE.Object3D): boolean {
  let valid = true;
  obj.traverse((child) => {
    if (!valid) return;
    if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments || child instanceof THREE.Points) {
      if (!validateGeometry(child.geometry)) valid = false;
    }
    if (child instanceof Line2) {
      if (!validateLine2Geometry(child)) valid = false;
    }
  });
  return valid;
}

// ── Pure position extraction utilities (exported for reuse) ──

export function adaptiveArcSegments(
  radius: number,
  angleRange: number,
  cameraViewWidth: number,
  canvasWidth: number,
): number {
  const pixelPerUnit = (canvasWidth || 1) / (cameraViewWidth || 1);
  const circumference = 2 * Math.PI * radius;
  const pixelCircumference = circumference * pixelPerUnit;
  const desiredPixelsPerSegment = 4;
  const idealSegments = Math.ceil(pixelCircumference / desiredPixelsPerSegment);
  const minSegments = 8;
  const maxSegments = 256;
  const fullSegments = Math.max(minSegments, Math.min(maxSegments, idealSegments));
  const fraction = Math.abs(angleRange) / (2 * Math.PI);
  return Math.max(minSegments, Math.round(fullSegments * fraction));
}

export function circlePositions(
  cx: number, cy: number, radius: number,
  startAngle: number, endAngle: number,
  cameraViewWidth: number, canvasWidth: number,
): number[] | null {
  let angleRange = endAngle - startAngle;
  if (angleRange < 0) angleRange += Math.PI * 2;
  if (angleRange < 1e-10) return null;

  const segCount = adaptiveArcSegments(radius, angleRange, cameraViewWidth, canvasWidth);
  const positions: number[] = [];

  for (let i = 0; i < segCount; i++) {
    const a1 = startAngle + (i / segCount) * angleRange;
    const a2 = startAngle + ((i + 1) / segCount) * angleRange;
    positions.push(
      cx + Math.cos(a1) * radius, cy + Math.sin(a1) * radius, 0,
      cx + Math.cos(a2) * radius, cy + Math.sin(a2) * radius, 0,
    );
  }
  return positions.length >= 6 ? positions : null;
}

export function ellipsePositions(node: any, cameraViewWidth: number, canvasWidth: number): number[] | null {
  const majorLength = Math.sqrt(node.majorX ** 2 + node.majorY ** 2);
  if (majorLength < 1e-10 || node.minorRatio <= 0) return null;
  const minorLength = majorLength * node.minorRatio;
  const rotation = Math.atan2(node.majorY, node.majorX);

  let angleRange = node.endAngle - node.startAngle;
  if (angleRange < 0) angleRange += Math.PI * 2;
  if (angleRange < 1e-10) return null;

  const avgRadius = (majorLength + minorLength) / 2;
  const segments = adaptiveArcSegments(avgRadius, angleRange, cameraViewWidth, canvasWidth);
  const positions: number[] = [];
  for (let i = 0; i < segments; i++) {
    const a1 = node.startAngle + (i / segments) * angleRange;
    const a2 = node.startAngle + ((i + 1) / segments) * angleRange;
    const cosR = Math.cos(rotation), sinR = Math.sin(rotation);

    const x1 = Math.cos(a1) * majorLength, y1 = Math.sin(a1) * minorLength;
    const rx1 = node.centerX + x1 * cosR - y1 * sinR;
    const ry1 = node.centerY + x1 * sinR + y1 * cosR;

    const x2 = Math.cos(a2) * majorLength, y2 = Math.sin(a2) * minorLength;
    const rx2 = node.centerX + x2 * cosR - y2 * sinR;
    const ry2 = node.centerY + x2 * sinR + y2 * cosR;

    positions.push(rx1, ry1, 0, rx2, ry2, 0);
  }
  return positions.length >= 6 ? positions : null;
}

export function dedupLineSegmentPositions(positions: number[]): number[] {
  if (positions.length < 12) return positions;
  const result: number[] = [];
  for (let i = 0; i < positions.length - 5; i += 6) {
    const dx = positions[i + 3] - positions[i];
    const dy = positions[i + 4] - positions[i + 1];
    if (dx * dx + dy * dy > 1e-6) {
      result.push(positions[i], positions[i + 1], positions[i + 2],
                  positions[i + 3], positions[i + 4], positions[i + 5]);
    }
  }
  return result;
}

export function bulgeToArcPositions(start: CadLwVertex, end: CadLwVertex, cameraViewWidth: number, canvasWidth: number): number[] {
  const bulge = start.bulge;
  if (!isValidNumber(bulge)) return [];

  const sx = start.x, sy = start.y, ex = end.x, ey = end.y;
  const dx = ex - sx, dy = ey - sy;
  const chordLength = Math.sqrt(dx * dx + dy * dy);
  if (chordLength < 1e-10) return [];

  const includedAngle = 4 * Math.atan(Math.abs(bulge));
  if (includedAngle < 1e-10 || includedAngle >= Math.PI * 2 - 1e-10) return [];

  const sinHalfAngle = Math.sin(includedAngle / 2);
  if (Math.abs(sinHalfAngle) < 1e-10) return [];

  const radius = chordLength / (2 * sinHalfAngle);
  if (!isValidNumber(radius) || radius <= 0 || !isFinite(radius)) return [];

  const midX = (sx + ex) / 2, midY = (sy + ey) / 2;
  const chordDirX = dx / chordLength, chordDirY = dy / chordLength;
  const perpX = -chordDirY, perpY = chordDirX;
  const sagitta = radius * (1 - Math.cos(includedAngle / 2));
  const sign = bulge > 0 ? 1 : -1;
  const cx = midX + sign * perpX * sagitta, cy = midY + sign * perpY * sagitta;

  if (!isValidNumber(cx) || !isValidNumber(cy)) return [];

  let startAngle = Math.atan2(sy - cy, sx - cx);
  let endAngle = Math.atan2(ey - cy, ex - cx);
  if (!isValidNumber(startAngle) || !isValidNumber(endAngle)) return [];

  if (bulge > 0) {
    while (endAngle <= startAngle) endAngle += Math.PI * 2;
  } else {
    while (endAngle >= startAngle) endAngle -= Math.PI * 2;
  }

  const segments = adaptiveArcSegments(radius, Math.abs(endAngle - startAngle), cameraViewWidth, canvasWidth);
  const positions: number[] = [];
  for (let i = 0; i < segments; i++) {
    const a1 = startAngle + (i / segments) * (endAngle - startAngle);
    const a2 = startAngle + ((i + 1) / segments) * (endAngle - startAngle);
    positions.push(
      cx + radius * Math.cos(a1), cy + radius * Math.sin(a1), 0,
      cx + radius * Math.cos(a2), cy + radius * Math.sin(a2), 0,
    );
  }
  return positions;
}

export function polygonArea(vertices: CadLwVertex[]): number {
  let area = 0;
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += vertices[i].x * vertices[j].y;
    area -= vertices[j].x * vertices[i].y;
  }
  return Math.abs(area) / 2;
}

/**
 * 将 CAD Text 的 horizontal_alignment + vertical_alignment 映射为 MText 的 attachmentPoint。
 * horizontal: 0=Left 1=Center 2=Right 3=Aligned 4=Middle 5=Fit
 * vertical:   0=Baseline 1=Bottom 2=Middle 3=Top
 * attachmentPoint: 1=左上 2=中上 3=右上 / 4=左中 5=正中 6=右中 / 7=左下 8=中下 9=右下
 */
export function textAlignmentToAttachmentPoint(hAlign: number, vAlign: number): number {
  const col = hAlign === 1 ? 1 : hAlign === 2 ? 2 : 0;
  const row = vAlign === 3 ? 0 : vAlign === 2 ? 1 : 2;
  return row * 3 + col + 1;
}

export function intToColor(colorInt: number): THREE.Color {
  const u = colorInt >>> 0;
  const r = (u >>> 16) & 0xff;
  const g = (u >>> 8) & 0xff;
  const b = u & 0xff;
  return new THREE.Color(r / 255, g / 255, b / 255);
}

export function estimateTextWidth(content: string, height: number, widthFactor: number = 1): number {
  const safeHeight = isValidNumber(height) && height > 0 ? height : 1;
  const safeWidthFactor = isValidNumber(widthFactor) && widthFactor > 0 ? widthFactor : 1;
  const maxUnits = content
    .split(/\r?\n|\\P/)
    .reduce((max, line) => {
      const units = Array.from(line).reduce((sum, ch) => {
        const code = ch.charCodeAt(0);
        if (/\s/.test(ch)) return sum + 0.3;
        if (code <= 0x7f) {
          if ('ilI1|'.includes(ch)) return sum + 0.3;
          if ('MWmw@'.includes(ch)) return sum + 0.85;
          return sum + 0.6;
        }
        if (code >= 0x3000 && code <= 0x303F) return sum + 1;
        if (code >= 0x4E00 && code <= 0x9FFF) return sum + 1;
        if (code >= 0xAC00 && code <= 0xD7AF) return sum + 1;
        return sum + 0.8;
      }, 0);
      return Math.max(max, units);
    }, 0);
  return Math.max(safeHeight, Math.max(1, maxUnits) * safeHeight * safeWidthFactor);
}

// ── GeometryFactory ──

/**
 * GeometryFactory — 几何体创建、颜色/材质解析、文字渲染、填充图案
 *
 * 职责：
 * - 根据 SceneNode / CadEntity 创建 Three.js 几何体 (Line2, Mesh, Group)
 * - 颜色解析（ByLayer → 图层颜色 → 默认颜色，背景适配）
 * - 线宽映射（mm → 物理像素）
 * - 位置提取（用于合批渲染）
 * - 文字（TroikaText）创建与 SDF 合批
 * - Hatch 填充图案
 * - INSERT (BlockRef) 递归渲染
 * - 几何体校验
 *
 * 依赖：SceneManager（分辨率/背景）、EntityStore（图层颜色查询）、SdfTextRenderer
 */
export class GeometryFactory {
  private _sceneManager: SceneManager;
  private _entityStore: EntityStore;
  private _sdfTextRenderer: SdfTextRenderer;
  private _entityRendererRegistry: EntityRendererRegistry | null = null;

  // Internal state
  private _insertDepth: number = 0;
  private _visitedBlocks: Set<string> = new Set();
  private _transformParams: TransformParams | null = null;
  private _clippingPlanes: THREE.Plane[] = [];
  private _defaultLineColor: THREE.Color;
  private _useBatchedText: boolean = true;
  private _fontUrl: string = FONT_URL;
  /** 渲染完成后请求重绘的回调 */
  private _onRequestRender: (() => void) | null = null;

  constructor(config: {
    sceneManager: SceneManager;
    entityStore: EntityStore;
    sdfTextRenderer: SdfTextRenderer;
    entityRendererRegistry?: EntityRendererRegistry | null;
    defaultLineColor?: THREE.Color;
    onRequestRender?: () => void;
  }) {
    this._sceneManager = config.sceneManager;
    this._entityStore = config.entityStore;
    this._sdfTextRenderer = config.sdfTextRenderer;
    this._entityRendererRegistry = config.entityRendererRegistry ?? null;
    this._defaultLineColor = config.defaultLineColor ?? new THREE.Color('#4fc3f7');
    this._onRequestRender = config.onRequestRender ?? null;
  }

  // ── Config setters ──

  setEntityRendererRegistry(registry: EntityRendererRegistry | null): void {
    this._entityRendererRegistry = registry;
  }

  getEntityRendererRegistry(): EntityRendererRegistry | null {
    return this._entityRendererRegistry;
  }

  setTransformParams(params: TransformParams | null): void {
    this._transformParams = params;
  }

  setClippingPlanes(planes: THREE.Plane[]): void {
    this._clippingPlanes = planes;
  }

  setDefaultLineColor(color: THREE.Color): void {
    this._defaultLineColor = color;
  }

  getDefaultLineColor(): THREE.Color {
    return this._defaultLineColor;
  }

  setUseBatchedText(use: boolean): void {
    this._useBatchedText = use;
  }

  get useBatchedText(): boolean {
    return this._useBatchedText;
  }

  setFontUrl(url: string): void {
    this._fontUrl = url;
  }

  private _requestRender(): void {
    this._onRequestRender?.();
  }

  // ── Color & Material ──

  /**
   * 把 cadbin 里的 u32 颜色解码成可见的 THREE.Color：
   *   1) 0xFFFFFF / 负数 / 0xFFFFFFFF（ByLayer 兜底）→ 优先用 layer.color
   *   2) layer.color 也是 0/-1 → defaultLineColor
   *   3) 解码后亮度过低 → defaultLineColor（深色底"看不见黑实体"）
   *   4) 其它情况返回原色
   */
  resolveColor(rawColor: number, layerName?: string): THREE.Color {
    if (rawColor === 0xFFFFFF || rawColor === 0xFFFFFFFF || rawColor < 0) {
      if (layerName) {
        const layer = this._entityStore.getLayerNode(layerName);
        if (layer && layer.color > 0 && layer.color !== 0xFFFFFF) {
          const lc = intToColor(layer.color);
          return this._adjustColorForBackground(lc);
        }
      }
      return this._defaultLineColor.clone();
    }
    const c = intToColor(rawColor);
    return this._adjustColorForBackground(c);
  }

  /**
   * 将 CAD lineWeight(mm) 映射为 LineMaterial 的 linewidth（物理像素）。
   */
  resolveLineWidth(rawLw?: number): number {
    const dpr = this._sceneManager.dpr;
    if (rawLw !== undefined && Number.isFinite(rawLw) && rawLw > 0) {
      const cssPx = Math.max(0.8, Math.min(rawLw * LINE_WEIGHT_SCALE, LINE_WIDTH_MAX_PX));
      return cssPx * dpr;
    }
    return DEFAULT_LINE_WIDTH * dpr;
  }

  adjustColorForBackground(color: THREE.Color): THREE.Color {
    return this._adjustColorForBackground(color);
  }

  private _adjustColorForBackground(color: THREE.Color): THREE.Color {
    const luma = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
    if (this._sceneManager.isDarkBackground) {
      if (luma < MIN_LUMINANCE_ON_DARK_BG) {
        return this._brightenToTarget(color, TARGET_LUMINANCE_DARK);
      }
    } else {
      if (luma > MAX_LUMINANCE_ON_LIGHT_BG) {
        return this._darkenToTarget(color, TARGET_LUMINANCE_LIGHT);
      }
    }
    return color.clone();
  }

  private _brightenToTarget(color: THREE.Color, targetLuma: number): THREE.Color {
    const hsl = { h: 0, s: 0, l: 0 };
    color.getHSL(hsl);
    if (hsl.s < 0.01) {
      return new THREE.Color().setHSL(hsl.h, 0, targetLuma);
    }
    const newL = Math.max(targetLuma, hsl.l);
    return new THREE.Color().setHSL(hsl.h, Math.min(hsl.s, 1), newL);
  }

  private _darkenToTarget(color: THREE.Color, targetLuma: number): THREE.Color {
    const hsl = { h: 0, s: 0, l: 0 };
    color.getHSL(hsl);
    if (hsl.s < 0.01) {
      return new THREE.Color().setHSL(hsl.h, 0, targetLuma);
    }
    const newL = Math.min(targetLuma, hsl.l);
    return new THREE.Color().setHSL(hsl.h, Math.min(hsl.s, 1), newL);
  }

  createLineMaterial(color: THREE.Color, lineWidth: number = DEFAULT_LINE_WIDTH): LineMaterial {
    const key = `${color.getHex()}_${lineWidth}`;
    const cached = this._entityStore.getLineMaterial(key);
    if (cached && !(cached as any).disposed) return cached;

    const material = new LineMaterial({
      color: color.getHex(),
      linewidth: lineWidth,
      resolution: this._sceneManager.resolution,
      worldUnits: false,
    });

    this._entityStore.setLineMaterial(key, material);
    return material;
  }

  createLine2FromPoints(points: THREE.Vector3[], color: THREE.Color, lineWidth: number = DEFAULT_LINE_WIDTH): Line2 | null {
    if (points.length < 2) return null;

    const MIN_VISIBLE_LENGTH = 0.01;
    let hasVisibleSegment = false;
    for (let i = 1; i < points.length; i++) {
      const dx = points[i].x - points[i - 1].x;
      const dy = points[i].y - points[i - 1].y;
      const dz = points[i].z - points[i - 1].z;
      if (dx * dx + dy * dy + dz * dz >= MIN_VISIBLE_LENGTH * MIN_VISIBLE_LENGTH) {
        hasVisibleSegment = true;
        break;
      }
    }
    if (!hasVisibleSegment) return null;

    const positions: number[] = [];
    for (const p of points) {
      if (!isValidVector3(p)) return null;
      positions.push(p.x, p.y, p.z);
    }

    const geometry = new LineGeometry();
    geometry.setPositions(positions);

    const material = this.createLineMaterial(color, lineWidth);
    const line = new Line2(geometry, material);
    line.computeLineDistances();
    return line;
  }

  // ── Position extraction (for batched rendering) ──

  extractLinePositions(node: SceneNode): number[] | null {
    const viewW = this._cameraViewWidth();
    const canvasW = this._sceneManager.width;

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
        return this._lwPolylinePositions(node as any);
      }
      case 'polyline': {
        return this._polylinePositions(node as any);
      }
      case 'spline': {
        return this._splinePositions(node as any);
      }
      case 'dimension': {
        return this._dimensionPositions(node as any);
      }
      default:
        return null;
    }
  }

  private _lwPolylinePositions(node: any): number[] | null {
    const vertices = node.vertices;
    if (!vertices || vertices.length === 0) return null;
    const validVertices = vertices.filter((v: { x: number; y: number; bulge: number }) =>
      isValidNumber(v.x) && isValidNumber(v.y) && isValidNumber(v.bulge));
    if (validVertices.length < 2) return null;

    const viewW = this._cameraViewWidth();
    const canvasW = this._sceneManager.width;
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

  private _polylinePositions(node: any): number[] | null {
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

  private _splinePositions(node: any): number[] | null {
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

  private _dimensionPositions(node: any): number[] | null {
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

  private _cameraViewWidth(): number {
    const cam = (this._sceneManager as any)._camera;
    if (cam) {
      return cam.right - cam.left;
    }
    return this._sceneManager.width || 1;
  }

  // ── Text width / BBox helpers ──

  anchoredTextBbox(posX: number, posY: number, width: number, height: number, rotation: number, col: number, row: number): BoundingBox {
    const w = Math.max(Math.abs(width), 1e-6);
    const h = Math.max(Math.abs(height), 1e-6);
    const [minLocalX, maxLocalX] = col === 1 ? [-w / 2, w / 2] : col === 2 ? [-w, 0] : [0, w];
    const [minLocalY, maxLocalY] = row === 0 ? [-h, 0] : row === 1 ? [-h / 2, h / 2] : [0, h];
    const safeRotation = isValidNumber(rotation) ? rotation : 0;
    const cos = Math.cos(safeRotation);
    const sin = Math.sin(safeRotation);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const [x, y] of [
      [minLocalX, minLocalY],
      [minLocalX, maxLocalY],
      [maxLocalX, minLocalY],
      [maxLocalX, maxLocalY],
    ]) {
      const rx = posX + x * cos - y * sin;
      const ry = posY + x * sin + y * cos;
      minX = Math.min(minX, rx);
      minY = Math.min(minY, ry);
      maxX = Math.max(maxX, rx);
      maxY = Math.max(maxY, ry);
    }

    return { minX, minY, maxX, maxY };
  }

  textNodeBbox(node: Extract<SceneNode, { type: 'text' }>): BoundingBox {
    const width = estimateTextWidth(node.content, node.height, 1);
    const col = node.horizontalAlignment === 1 || node.horizontalAlignment === 4 ? 1 : node.horizontalAlignment === 2 || node.horizontalAlignment === 3 || node.horizontalAlignment === 5 ? 2 : 0;
    const row = node.verticalAlignment === 3 ? 0 : node.verticalAlignment === 2 ? 1 : 2;
    return this.anchoredTextBbox(node.posX, node.posY, width, node.height, node.rotation, col, row);
  }

  mTextNodeBbox(node: Extract<SceneNode, { type: 'mText' }>): BoundingBox {
    const heightScale = isValidNumber(node.heightScale) && node.heightScale > 0 ? node.heightScale : 1;
    const effectiveHeight = Math.max(Math.abs(node.height * heightScale), 1e-6);
    const estimatedWidth = estimateTextWidth(node.content, effectiveHeight, node.widthFactor);
    const blockWidth = isValidNumber(node.width) && node.width > 0 ? Math.abs(node.width) : estimatedWidth;
    const lineCount = Math.max(1, node.content.split(/\r?\n|\\P/).filter(Boolean).length);
    const blockHeight = effectiveHeight * lineCount * 1.25;
    const ap = Math.max(1, Math.min(9, Math.floor(node.attachmentPoint || 1)));
    const col = (ap - 1) % 3;
    const row = Math.floor((ap - 1) / 3);
    return this.anchoredTextBbox(node.posX, node.posY, blockWidth, blockHeight, node.rotation, col, row);
  }

  // ── Batched text ──

  addTextToBatchedRenderer(idStr: string, node: SceneNode, layer: string): boolean {
    try {
      const color = this.resolveColor(node.color, layer);
      const textNode = node as any;
      const content = textNode.content ?? '';
      if (!content || content.trim().length === 0) return false;

      const height = textNode.height;
      if (!isValidNumber(height) || height <= 0) return false;

      // 应用坐标变换：从CAD坐标转换为显示坐标
      let position = { x: textNode.posX ?? 0, y: textNode.posY ?? 0, z: 0 };
      if (this._transformParams) {
        const transformed = applyTransform(
          { x: position.x, y: position.y },
          this._transformParams
        );
        position = { x: transformed.x, y: transformed.y, z: 0 };
      }
      if (!isValidPoint(position)) return false;

      const rotation = isValidNumber(textNode.rotation) ? textNode.rotation : 0;
      const widthFactor = (isValidNumber(textNode.widthFactor) && textNode.widthFactor > 0) ? textNode.widthFactor : 1.0;
      const heightScale = (isValidNumber(textNode.heightScale) && textNode.heightScale > 0) ? textNode.heightScale : 1.0;
      const fontSize = height * heightScale;

      let attachmentPoint: number;
      if (node.type === 'text') {
        attachmentPoint = textAlignmentToAttachmentPoint(
          textNode.horizontalAlignment ?? 0,
          textNode.verticalAlignment ?? 0,
        );
      } else {
        attachmentPoint = textNode.attachmentPoint ?? 1;
      }

      const ap = Math.max(1, Math.min(9, Math.floor(attachmentPoint)));
      const col = ((ap - 1) % 3);
      const row = Math.floor((ap - 1) / 3);
      const anchorX = col === 0 ? 'left' : col === 1 ? 'center' : 'right';
      const anchorY = row === 0 ? 'top' : row === 1 ? 'middle' : 'bottom';

      const rectWidth = textNode.width ?? 0;
      const maxWidth = (rectWidth > 0 && isValidNumber(rectWidth)) ? rectWidth / widthFactor : undefined;

      const lines = content.split(/\r?\n|\\P/).filter((s: string) => s.length > 0);
      if (lines.length === 0) return false;
      const textContent = lines.join('\n');

      const estWidth = estimateTextWidth(textContent, fontSize, widthFactor);

      this._sdfTextRenderer.addText(
        idStr,
        textContent,
        position,
        fontSize,
        color,
        rotation,
        anchorX,
        anchorY,
        maxWidth,
        widthFactor,
        layer,
        estWidth,
      );
      return true;
    } catch (_e) {
      return false;
    }
  }

  // ── Geometry creation ──

  /**
   * 根据 SceneNode 创建 mesh（优先走 EntityRendererRegistry，否则用内建方法）。
   * 用于 cadbin 模式的 _addNodeToScene 流程。
   */
  createSceneNodeMesh(node: SceneNode): THREE.Object3D | null {
    // 尝试用外部注册的 renderer
    const renderer = this._entityRendererRegistry?.getRendererForType(node.type);
    if (renderer) {
      try {
        const context = this._createEntityRenderContext();
        const result = renderer.create(node, context);
        if (result) {
          result.object.userData.entityId = node.id;
          result.object.userData.entityType = node.type;
          return result.object;
        }
      } catch (err) {
        console.warn(`[GeometryFactory] EntityRenderer for "${node.type}" failed, falling back to built-in:`, err);
      }
    }

    const color = this.resolveColor(node.color, node.layer);
    const lineWidth = this.resolveLineWidth((node as { lineWeight?: number }).lineWeight);

    switch (node.type) {
      case 'line':
        return this.createLine(
          { x: node.startX, y: node.startY, z: 0 },
          { x: node.endX, y: node.endY, z: 0 },
          color, lineWidth,
        );
      case 'circle':
        return this.createCircle(
          { x: node.centerX, y: node.centerY, z: 0 },
          node.radius, color, lineWidth,
        );
      case 'arc':
        return this.createArc(
          { x: node.centerX, y: node.centerY, z: 0 },
          node.radius, node.startAngle, node.endAngle, color, lineWidth,
        );
      case 'ellipse':
        return this.createEllipse(
          { x: node.centerX, y: node.centerY, z: 0 },
          { x: node.majorX, y: node.majorY, z: 0 },
          node.minorRatio, node.startAngle, node.endAngle, color, lineWidth,
        );
      case 'lwPolyline':
        return this.createLwPolyline(
          node.vertices.map(v => ({ x: v.x, y: v.y, bulge: v.bulge })),
          node.closed, color, lineWidth,
        );
      case 'polyline':
        return this.createPolyline(
          node.vertices.map(v => ({ x: v.x, y: v.y, z: v.z })),
          node.closed, color, lineWidth,
        );
      case 'spline':
        return this.createSpline(
          node.controlPoints.map(p => ({ x: p.x, y: p.y, z: p.z })),
          node.fitPoints.map(p => ({ x: p.x, y: p.y, z: p.z })),
          node.knots, node.degree, color, lineWidth,
        );
      case 'text': {
        const ap = textAlignmentToAttachmentPoint(
          (node as any).horizontalAlignment ?? 0,
          (node as any).verticalAlignment ?? 0,
        );
        return this.createText(
          { x: node.posX, y: node.posY, z: 0 },
          node.content, node.height, node.rotation, color, ap,
        );
      }
      case 'mText':
        return this.createText(
          { x: node.posX, y: node.posY, z: 0 },
          node.content, node.height, node.rotation, color,
          node.attachmentPoint || 1, node.width || 0,
          (node as any).widthFactor ?? 1.0,
          (node as any).fontName ?? '',
          (node as any).heightScale ?? 1.0,
        );
      case 'solid':
        return this.createSolid(
          node.points.map(p => ({ x: p.x, y: p.y, z: 0 })),
          color,
        );
      case 'point':
        return this.createPoint({ x: node.posX, y: node.posY, z: 0 }, color);
      case 'hatch':
        return this.createHatch(
          node.boundaries.map(path => path.map(v => ({ x: v.x, y: v.y, bulge: v.bulge }))),
          node.solid, node.scale, node.angle, color, lineWidth,
          (node as any).style ?? 0,
          ((node as any).patternLines ?? []).map((pl: any) => ({
            angle: pl.angle, base_x: pl.base_x, base_y: pl.base_y,
            offset_x: pl.offset_x, offset_y: pl.offset_y, dashes: pl.dashes,
          })),
        );
      case 'dimension':
        return this.createDimension(
          { x: node.defX, y: node.defY, z: 0 },
          { x: node.midX, y: node.midY, z: 0 },
          node.content, node.rotation, color, lineWidth,
        );
      case 'insert':
        return this.createInsertPlaceholder(
          { x: node.posX, y: node.posY, z: 0 },
          Math.max(Math.abs(node.scaleX), Math.abs(node.scaleY)) || 1,
          color, lineWidth,
        );
      default:
        return null;
    }
  }

  /**
   * 根据 CadEntity (旧 DXF 格式) 创建 mesh。
   * 用于 DXF 直接加载流程和 INSERT 递归渲染。
   */
  createEntityMesh(entity: CadEntity): THREE.Object3D | null {
    let color = intToColor(entity.color);
    if (entity.color === 0xFFFFFF) {
      color = this._defaultLineColor.clone();
    }
    const lineWidth = this.resolveLineWidth((entity as any).line_weight);

    switch (entity.type) {
      case 'Line':
        return this.createLine(entity.start, entity.end, color, lineWidth);
      case 'Circle':
        return this.createCircle(entity.center, entity.radius, color, lineWidth);
      case 'Arc':
        return this.createArc(entity.center, entity.radius, entity.start_angle, entity.end_angle, color, lineWidth);
      case 'Polyline':
        return this.createPolyline(entity.vertices, entity.closed, color, lineWidth);
      case 'LwPolyline':
        return this.createLwPolyline(entity.vertices, entity.closed, color, lineWidth);
      case 'Ellipse':
        return this.createEllipse(entity.center, entity.major_axis, entity.minor_axis_ratio, entity.start_angle, entity.end_angle, color, lineWidth);
      case 'Spline':
        return this.createSpline(entity.control_points, entity.fit_points, entity.knots, entity.degree, color, lineWidth);
      case 'Text': {
        const ap = textAlignmentToAttachmentPoint(
          (entity as any).horizontal_alignment ?? 0,
          (entity as any).vertical_alignment ?? 0,
        );
        return this.createText(entity.position, entity.content, entity.height, entity.rotation, color, ap);
      }
      case 'MText':
        return this.createText(entity.position, entity.content, entity.height, entity.rotation, color, entity.attachment_point ?? 1, (entity as any).width ?? 0, (entity as any).width_factor ?? 1.0, (entity as any).font_name ?? '', (entity as any).height_scale ?? 1.0);
      case 'Solid':
        return this.createSolid(entity.points, color);
      case 'Point':
        return this.createPoint(entity.position, color);
      case 'Insert':
        return this.renderInsert(entity);
      case 'Hatch':
        return this.createHatch(
          entity.boundaries,
          entity.solid,
          entity.scale,
          entity.angle,
          color,
          lineWidth,
          (entity as any).style ?? 0,
          ((entity as any).pattern_lines ?? []).map((pl: any) => ({
            angle: pl.angle, base_x: pl.base_x, base_y: pl.base_y,
            offset_x: pl.offset_x, offset_y: pl.offset_y, dashes: pl.dashes,
          })),
        );
      case 'Dimension':
        return this.createDimension(entity.definition_point, entity.text_midpoint, entity.content, entity.rotation, color, lineWidth);
      default:
        return null;
    }
  }

  // ── Primitive geometry creation ──

  createLine(start: CadPoint, end: CadPoint, color: THREE.Color, lineWidth: number): Line2 | null {
    if (!isValidPoint(start) || !isValidPoint(end)) return null;

    const MIN_LINE_LENGTH = 0.1;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dz = end.z - start.z;
    if (dx * dx + dy * dy + dz * dz < MIN_LINE_LENGTH * MIN_LINE_LENGTH) return null;

    const points = [
      new THREE.Vector3(start.x, start.y, start.z),
      new THREE.Vector3(end.x, end.y, end.z),
    ];

    return this.createLine2FromPoints(points, color, lineWidth);
  }

  createCircle(center: CadPoint, radius: number, color: THREE.Color, lineWidth: number): Line2 | null {
    if (!isValidPoint(center) || !isValidNumber(radius) || radius <= 0) return null;

    const viewW = this._cameraViewWidth();
    const canvasW = this._sceneManager.width;
    const segments = adaptiveArcSegments(radius, Math.PI * 2, viewW, canvasW);
    const points: THREE.Vector3[] = [];

    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      points.push(new THREE.Vector3(
        center.x + Math.cos(angle) * radius,
        center.y + Math.sin(angle) * radius,
        center.z
      ));
    }

    return this.createLine2FromPoints(points, color, lineWidth);
  }

  createArc(
    center: CadPoint,
    radius: number,
    startAngle: number,
    endAngle: number,
    color: THREE.Color,
    lineWidth: number
  ): Line2 | null {
    if (!isValidPoint(center) || !isValidNumber(radius) || radius <= 0) return null;
    if (!isValidNumber(startAngle) || !isValidNumber(endAngle)) return null;

    let angleRange = endAngle - startAngle;
    if (angleRange < 0) angleRange += Math.PI * 2;
    if (angleRange < 1e-10) return null;

    const viewW = this._cameraViewWidth();
    const canvasW = this._sceneManager.width;
    const segments = adaptiveArcSegments(radius, angleRange, viewW, canvasW);
    const points: THREE.Vector3[] = [];

    for (let i = 0; i <= segments; i++) {
      const angle = startAngle + (i / segments) * angleRange;
      points.push(new THREE.Vector3(
        center.x + Math.cos(angle) * radius,
        center.y + Math.sin(angle) * radius,
        center.z
      ));
    }

    return this.createLine2FromPoints(points, color, lineWidth);
  }

  createPolyline(vertices: CadPoint[], closed: boolean, color: THREE.Color, lineWidth: number): Line2 | null {
    const validVertices = vertices.filter(v => isValidPoint(v));
    if (validVertices.length === 0) return null;

    const points = validVertices.map(v => new THREE.Vector3(v.x, v.y, v.z));
    if (closed && points.length > 0) {
      points.push(points[0].clone());
    }

    return this.createLine2FromPoints(points, color, lineWidth);
  }

  createLwPolyline(vertices: CadLwVertex[], closed: boolean, color: THREE.Color, lineWidth: number): Line2 | null {
    if (!vertices || vertices.length === 0) return null;

    const validVertices = vertices.filter(v => isValidNumber(v.x) && isValidNumber(v.y) && isValidNumber(v.bulge));
    if (validVertices.length === 0) return null;

    const points: THREE.Vector3[] = [];

    for (let i = 0; i < validVertices.length; i++) {
      const v = validVertices[i];
      points.push(new THREE.Vector3(v.x, v.y, 0));

      const nextIdx = closed ? (i + 1) % validVertices.length : i + 1;
      if (nextIdx >= validVertices.length) continue;

      const nextV = validVertices[nextIdx];

      if (Math.abs(v.bulge) > 1e-9) {
        const arcPoints = this._bulgeToArc(v, nextV);
        for (const p of arcPoints) {
          if (isValidVector3(p)) {
            points.push(p);
          }
        }
      }
    }

    if (closed && points.length > 0) {
      points.push(points[0].clone());
    }

    return this.createLine2FromPoints(points, color, lineWidth);
  }

  private _bulgeToArc(start: CadLwVertex, end: CadLwVertex): THREE.Vector3[] {
    const points: THREE.Vector3[] = [];
    const bulge = start.bulge;

    if (!isValidNumber(bulge)) return points;

    const sx = start.x, sy = start.y;
    const ex = end.x, ey = end.y;
    const dx = ex - sx;
    const dy = ey - sy;
    const chordLength = Math.sqrt(dx * dx + dy * dy);

    if (chordLength < 1e-10) return points;

    const includedAngle = 4 * Math.atan(Math.abs(bulge));
    if (includedAngle < 1e-10 || includedAngle >= Math.PI * 2 - 1e-10) return points;

    const sinHalfAngle = Math.sin(includedAngle / 2);
    if (Math.abs(sinHalfAngle) < 1e-10) return points;

    const radius = chordLength / (2 * sinHalfAngle);
    if (!isValidNumber(radius) || radius <= 0 || !isFinite(radius)) return points;

    const midX = (sx + ex) / 2;
    const midY = (sy + ey) / 2;
    const chordDirX = dx / chordLength;
    const chordDirY = dy / chordLength;
    const perpX = -chordDirY;
    const perpY = chordDirX;
    const sagitta = radius * (1 - Math.cos(includedAngle / 2));
    const sign = bulge > 0 ? 1 : -1;
    const cx = midX + sign * perpX * sagitta;
    const cy = midY + sign * perpY * sagitta;

    if (!isValidNumber(cx) || !isValidNumber(cy)) return points;

    let startAngle = Math.atan2(sy - cy, sx - cx);
    let endAngle = Math.atan2(ey - cy, ex - cx);

    if (!isValidNumber(startAngle) || !isValidNumber(endAngle)) return points;

    if (bulge > 0) {
      while (endAngle <= startAngle) endAngle += Math.PI * 2;
    } else {
      while (endAngle >= startAngle) endAngle -= Math.PI * 2;
    }

    const segments = Math.max(8, Math.ceil(Math.abs(includedAngle) / (Math.PI / 32)));
    const angleStep = (endAngle - startAngle) / segments;

    for (let i = 1; i < segments; i++) {
      const angle = startAngle + angleStep * i;
      const x = cx + radius * Math.cos(angle);
      const y = cy + radius * Math.sin(angle);
      if (isValidNumber(x) && isValidNumber(y)) {
        points.push(new THREE.Vector3(x, y, 0));
      }
    }

    return points;
  }

  createEllipse(
    center: CadPoint,
    majorAxis: CadPoint,
    minorAxisRatio: number,
    startAngle: number,
    endAngle: number,
    color: THREE.Color,
    lineWidth: number
  ): Line2 | null {
    if (!isValidPoint(center) || !isValidPoint(majorAxis)) return null;

    const majorLength = Math.sqrt(majorAxis.x ** 2 + majorAxis.y ** 2 + majorAxis.z ** 2);
    if (majorLength < 1e-10 || !isValidNumber(majorLength)) return null;
    if (!isValidNumber(minorAxisRatio) || minorAxisRatio <= 0) return null;
    if (!isValidNumber(startAngle) || !isValidNumber(endAngle)) return null;

    const segments = 64;
    const points: THREE.Vector3[] = [];
    const minorLength = majorLength * minorAxisRatio;
    const rotation = Math.atan2(majorAxis.y, majorAxis.x);

    let angleRange = endAngle - startAngle;
    if (angleRange < 0) angleRange += Math.PI * 2;
    if (angleRange < 1e-10) return null;

    for (let i = 0; i <= segments; i++) {
      const angle = startAngle + (i / segments) * angleRange;
      const x = Math.cos(angle) * majorLength;
      const y = Math.sin(angle) * minorLength;

      const rotatedX = x * Math.cos(rotation) - y * Math.sin(rotation);
      const rotatedY = x * Math.sin(rotation) + y * Math.cos(rotation);

      points.push(new THREE.Vector3(
        center.x + rotatedX,
        center.y + rotatedY,
        center.z
      ));
    }

    return this.createLine2FromPoints(points, color, lineWidth);
  }

  createSpline(
    controlPoints: CadPoint[],
    fitPoints: CadPoint[],
    _knots: number[],
    degree: number,
    color: THREE.Color,
    lineWidth: number
  ): Line2 | null {
    if (fitPoints.length >= 2) {
      return this._createSplineFromFitPoints(fitPoints, color, lineWidth);
    }

    const validPoints = controlPoints.filter(p => isValidPoint(p));
    if (validPoints.length < 2) {
      return this.createPolyline(validPoints, false, color, lineWidth);
    }

    const points: THREE.Vector3[] = [];

    const numSamples = Math.max(validPoints.length * 10, 50);
    for (let i = 0; i <= numSamples; i++) {
      const t = i / numSamples;
      const point = this._evaluateBSpline(validPoints, t, degree);
      if (isValidPoint(point)) {
        points.push(new THREE.Vector3(point.x, point.y, point.z));
      }
    }

    return this.createLine2FromPoints(points, color, lineWidth);
  }

  private _createSplineFromFitPoints(fitPoints: CadPoint[], color: THREE.Color, lineWidth: number): Line2 | null {
    const validPoints = fitPoints.filter(p => isValidPoint(p));
    if (validPoints.length < 2) return null;

    const points: THREE.Vector3[] = [];

    for (let i = 0; i < validPoints.length - 1; i++) {
      const p0 = validPoints[Math.max(0, i - 1)];
      const p1 = validPoints[i];
      const p2 = validPoints[Math.min(validPoints.length - 1, i + 1)];
      const p3 = validPoints[Math.min(validPoints.length - 1, i + 2)];

      if (!isValidPoint(p0) || !isValidPoint(p1) ||
          !isValidPoint(p2) || !isValidPoint(p3)) {
        continue;
      }

      const segments = 10;
      for (let j = 0; j <= segments; j++) {
        const t = j / segments;
        const t2 = t * t;
        const t3 = t2 * t;

        const catmullRom = [
          -0.5 * t3 + t2 - 0.5 * t,
          1.5 * t3 - 2.5 * t2 + 1,
          -1.5 * t3 + 2 * t2 + 0.5 * t,
          0.5 * t3 - 0.5 * t2
        ];

        const x = catmullRom[0] * p0.x + catmullRom[1] * p1.x + catmullRom[2] * p2.x + catmullRom[3] * p3.x;
        const y = catmullRom[0] * p0.y + catmullRom[1] * p1.y + catmullRom[2] * p2.y + catmullRom[3] * p3.y;
        const z = catmullRom[0] * p0.z + catmullRom[1] * p1.z + catmullRom[2] * p2.z + catmullRom[3] * p3.z;

        if (isValidNumber(x) && isValidNumber(y) && isValidNumber(z)) {
          points.push(new THREE.Vector3(x, y, z));
        }
      }
    }

    return this.createLine2FromPoints(points, color, lineWidth);
  }

  private _evaluateBSpline(points: CadPoint[], t: number, _degree: number): CadPoint {
    if (points.length === 0) return { x: 0, y: 0, z: 0 };

    if (points.length === 1) {
      const p = points[0];
      if (!isValidPoint(p)) return { x: 0, y: 0, z: 0 };
      return p;
    }

    const n = points.length - 1;
    const clampedT = Math.max(0, Math.min(1, t));
    const segment = Math.min(Math.floor(clampedT * n), n - 1);
    const localT = clampedT * n - segment;

    const p0 = points[Math.max(0, segment - 1)];
    const p1 = points[segment];
    const p2 = points[Math.min(n, segment + 1)];
    const p3 = points[Math.min(n, segment + 2)];

    if (!isValidPoint(p0) || !isValidPoint(p1) ||
        !isValidPoint(p2) || !isValidPoint(p3)) {
      return { x: 0, y: 0, z: 0 };
    }

    const t2 = localT * localT;
    const t3 = t2 * localT;

    const catmullRom = [
      -0.5 * t3 + t2 - 0.5 * localT,
      1.5 * t3 - 2.5 * t2 + 1,
      -1.5 * t3 + 2 * t2 + 0.5 * localT,
      0.5 * t3 - 0.5 * t2
    ];

    const x = catmullRom[0] * p0.x + catmullRom[1] * p1.x + catmullRom[2] * p2.x + catmullRom[3] * p3.x;
    const y = catmullRom[0] * p0.y + catmullRom[1] * p1.y + catmullRom[2] * p2.y + catmullRom[3] * p3.y;
    const z = catmullRom[0] * p0.z + catmullRom[1] * p1.z + catmullRom[2] * p2.z + catmullRom[3] * p3.z;

    return {
      x: isValidNumber(x) ? x : 0,
      y: isValidNumber(y) ? y : 0,
      z: isValidNumber(z) ? z : 0,
    };
  }

  /**
   * MText 风格的多行文字渲染（TroikaText 独立 mesh，非合批）。
   */
  createText(
    position: CadPoint,
    content: string,
    height: number,
    rotation: number,
    color: THREE.Color,
    attachmentPoint: number = 1,
    rectWidth: number = 0,
    widthFactor: number = 1.0,
    _fontName: string = '',
    heightScale: number = 1.0,
  ): THREE.Group | null {
    if (!isValidPoint(position)) return null;
    if (!isValidNumber(height) || height <= 0) return null;
    if (!content || content.trim().length === 0) return null;
    if (!isValidNumber(rotation)) rotation = 0;

    const lines = content.split(/\r?\n|\\P/).filter(s => s.length > 0);
    if (lines.length === 0) return null;

    const group = new THREE.Group();

    const effectiveWidthFactor = (isValidNumber(widthFactor) && widthFactor > 0) ? widthFactor : 1.0;
    const effectiveHeightScale = (isValidNumber(heightScale) && heightScale > 0) ? heightScale : 1.0;

    const textContent = lines.join('\n');
    const fontSize = height * effectiveHeightScale;

    const ap = Math.max(1, Math.min(9, Math.floor(attachmentPoint)));
    const col = ((ap - 1) % 3);
    const row = Math.floor((ap - 1) / 3);

    const anchorX = col === 0 ? 'left' : col === 1 ? 'center' : 'right';
    const anchorY = row === 0 ? 'top' : row === 1 ? 'middle' : 'bottom';

    const textMesh = new TroikaText();
    textMesh.text = textContent;
    textMesh.font = this._fontUrl;
    textMesh.fontSize = fontSize;
    textMesh.color = color;
    textMesh.anchorX = anchorX;
    textMesh.anchorY = anchorY;
    textMesh.maxWidth = (rectWidth > 0 && isValidNumber(rectWidth)) ? rectWidth / effectiveWidthFactor : undefined;
    textMesh.lineHeight = 1.25;
    textMesh.depthTest = false;
    textMesh.renderOrder = 1;

    textMesh.scale.set(effectiveWidthFactor, 1, 1);

    const clippingPlanes = this._clippingPlanes;
    const requestRender = () => this._requestRender();
    textMesh.sync(() => {
      if (clippingPlanes.length > 0) {
        textMesh.traverse((child: THREE.Object3D) => {
          if ((child as THREE.Mesh).isMesh && (child as THREE.Mesh).material) {
            const mat = (child as THREE.Mesh).material as THREE.Material;
            mat.clippingPlanes = clippingPlanes;
            mat.clipShadows = true;
          }
        });
      }
      requestRender();
    });

    group.add(textMesh);

    group.position.set(position.x, position.y, position.z);
    group.rotation.z = rotation || 0;

    return group;
  }

  createTextPlaceholder(
    position: CadPoint,
    height: number,
    rotation: number,
    color: THREE.Color,
    widthFactor: number = 1.0,
  ): THREE.Mesh | null {
    if (!isValidPoint(position) || !isValidNumber(height) || height <= 0) return null;
    const w = height * 0.6 * (isValidNumber(widthFactor) && widthFactor > 0 ? widthFactor : 1.0);
    const h = height;
    const geometry = new THREE.PlaneGeometry(w, h);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.15,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 1;
    mesh.position.set(position.x, position.y, position.z || 0);
    mesh.rotation.z = rotation || 0;
    return mesh;
  }

  createSolid(points: CadPoint[], color: THREE.Color): THREE.Mesh | null {
    const validPoints = points.filter(p => isValidPoint(p));
    if (validPoints.length < 3) return null;

    const shape = new THREE.Shape();
    shape.moveTo(validPoints[0].x, validPoints[0].y);
    for (let i = 1; i < validPoints.length; i++) {
      shape.lineTo(validPoints[i].x, validPoints[i].y);
    }
    shape.closePath();

    const geometry = new THREE.ShapeGeometry(shape);
    const material = new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.5
    });

    return new THREE.Mesh(geometry, material);
  }

  // PDMODE=0 / PDSIZE=0 means points are displayed as 1:1 pixel dots in AutoCAD —
  // effectively invisible in engineering drawings.
  createPoint(_position: CadPoint, _color: THREE.Color): THREE.Group | null {
    return null;
  }

  createHatch(
    boundaries: CadLwVertex[][],
    solid: boolean,
    scale: number,
    angle: number,
    color: THREE.Color,
    lineWidth: number,
    style: number = 0,
    patternLines: Array<{ angle: number; base_x: number; base_y: number; offset_x: number; offset_y: number; dashes: number[] }> = [],
  ): THREE.Object3D | null {
    if (!boundaries || boundaries.length === 0) return null;

    const group = new THREE.Group();

    const allPaths: CadLwVertex[][] = [];
    for (const path of boundaries) {
      const validVertices = path.filter(v => isValidNumber(v.x) && isValidNumber(v.y) && isValidNumber(v.bulge));
      if (validVertices.length < 3) continue;
      allPaths.push(validVertices);
    }
    if (allPaths.length === 0) return null;

    if (solid) {
      const fillPaths = this._getHatchFillPaths(allPaths, style);
      const mergedPositions: number[] = [];
      const mergedIndices: number[] = [];
      let vertexOffset = 0;
      for (const path of fillPaths) {
        const shape = new THREE.Shape();
        shape.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) {
          shape.lineTo(path[i].x, path[i].y);
        }
        shape.closePath();

        try {
          const shapeGeo = new THREE.ShapeGeometry(shape);
          const posArr = shapeGeo.getAttribute('position');
          for (let i = 0; i < posArr.count; i++) {
            mergedPositions.push(posArr.getX(i), posArr.getY(i), posArr.getZ(i));
          }
          const idxArr = shapeGeo.getIndex();
          if (idxArr) {
            for (let i = 0; i < idxArr.count; i++) {
              mergedIndices.push(idxArr.getX(i) + vertexOffset);
            }
          }
          vertexOffset += posArr.count;
          shapeGeo.dispose();
        } catch {
          // skip invalid shapes
        }
      }
      if (mergedPositions.length > 0) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(mergedPositions, 3));
        if (mergedIndices.length > 0) {
          geometry.setIndex(mergedIndices);
        }
        const material = new THREE.MeshBasicMaterial({
          color,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.3,
        });
        group.add(new THREE.Mesh(geometry, material));
      }
    } else if (patternLines.length > 0) {
      const fillPaths = this._getHatchFillPaths(allPaths, style);
      const patternGroup = this._createHatchPatternFromDefinition(fillPaths, scale, patternLines, color, lineWidth);
      if (patternGroup) group.add(patternGroup);
    } else {
      const fillPaths = this._getHatchFillPaths(allPaths, style);
      for (const path of fillPaths) {
        const patternLine = this._createHatchPatternLine(path, scale, angle, color, lineWidth);
        if (patternLine) group.add(patternLine);
      }
    }

    for (const path of allPaths) {
      const outlinePoints: THREE.Vector3[] = [];
      for (let i = 0; i < path.length; i++) {
        const v = path[i];
        outlinePoints.push(new THREE.Vector3(v.x, v.y, 0));
        const nextIdx = (i + 1) % path.length;
        const nextV = path[nextIdx];
        if (Math.abs(v.bulge) > 1e-9) {
          const arcPoints = this._bulgeToArc(v, nextV);
          for (const p of arcPoints) {
            if (isValidVector3(p)) outlinePoints.push(p);
          }
        }
      }
      if (outlinePoints.length > 0) outlinePoints.push(outlinePoints[0].clone());
      const outlineLine = this.createLine2FromPoints(outlinePoints, color, lineWidth);
      if (outlineLine) group.add(outlineLine);
    }

    if (group.children.length === 0) return null;
    return group;
  }

  private _getHatchFillPaths(paths: CadLwVertex[][], style: number): CadLwVertex[][] {
    if (style === 2) return paths;
    if (style === 1) {
      if (paths.length <= 1) return paths;
      let outerIdx = 0;
      let maxArea = -1;
      for (let i = 0; i < paths.length; i++) {
        const area = polygonArea(paths[i]);
        if (area > maxArea) { maxArea = area; outerIdx = i; }
      }
      return [paths[outerIdx]];
    }
    return paths;
  }

  private _createHatchPatternFromDefinition(
    paths: CadLwVertex[][],
    scale: number,
    patternLines: Array<{ angle: number; base_x: number; base_y: number; offset_x: number; offset_y: number; dashes: number[] }>,
    color: THREE.Color,
    lineWidth: number,
  ): THREE.Group | null {
    if (!isValidNumber(scale) || scale <= 0) scale = 1;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const path of paths) {
      for (const v of path) {
        minX = Math.min(minX, v.x);
        minY = Math.min(minY, v.y);
        maxX = Math.max(maxX, v.x);
        maxY = Math.max(maxY, v.y);
      }
    }
    if (!isFinite(minX) || !isFinite(maxX)) return null;

    const halfDiag = Math.sqrt((maxX - minX) ** 2 + (maxY - minY) ** 2) / 2;
    if (halfDiag < 1e-10) return null;

    const group = new THREE.Group();

    for (const pl of patternLines) {
      const rad = pl.angle;
      const cosA = Math.cos(rad);
      const sinA = Math.sin(rad);
      const offsetX = pl.offset_x * scale;
      const offsetY = pl.offset_y * scale;

      const perpDist = Math.abs(offsetX * sinA - offsetY * cosA);
      const spacing = perpDist > 1e-10 ? perpDist : scale * 3;

      const numLines = Math.ceil(halfDiag * 2 / spacing) + 2;
      const halfLen = halfDiag * 1.5;

      const isContinuous = !pl.dashes || pl.dashes.length === 0;
      const hasDashes = pl.dashes && pl.dashes.length > 0 && pl.dashes.some(d => Math.abs(d) > 1e-10);

      const positions: number[] = [];

      for (let i = -numLines; i <= numLines; i++) {
        const lineBaseX = pl.base_x * scale + i * offsetX;
        const lineBaseY = pl.base_y * scale + i * offsetY;

        const cx = (minX + maxX) / 2 + lineBaseX * cosA - lineBaseY * sinA;
        const cy = (minY + maxY) / 2 + lineBaseX * sinA + lineBaseY * cosA;

        if (isContinuous || !hasDashes) {
          const x1 = cx - halfLen * cosA;
          const y1 = cy - halfLen * sinA;
          const x2 = cx + halfLen * cosA;
          const y2 = cy + halfLen * sinA;
          positions.push(x1, y1, 0, x2, y2, 0);
        } else {
          let dist = 0;
          for (let di = 0; di < pl.dashes.length; di++) {
            const d = pl.dashes[di] * scale;
            if (d > 0) {
              const startDist = dist;
              const endDist = dist + d;

              const segStartX = cx - halfLen * cosA + startDist * cosA;
              const segStartY = cy - halfLen * sinA + startDist * sinA;
              const segEndX = cx - halfLen * cosA + endDist * cosA;
              const segEndY = cy - halfLen * sinA + endDist * sinA;

              positions.push(segStartX, segStartY, 0, segEndX, segEndY, 0);
            }
            dist += Math.abs(d);
          }
        }
      }

      if (positions.length >= 6) {
        const geometry = new LineGeometry();
        geometry.setPositions(positions);
        const material = this.createLineMaterial(color, lineWidth * 0.5);
        const line = new Line2(geometry, material);
        line.computeLineDistances();
        group.add(line);
      }
    }

    if (group.children.length === 0) return null;
    return group;
  }

  private _createHatchPatternLine(
    vertices: CadLwVertex[],
    scale: number,
    angle: number,
    color: THREE.Color,
    lineWidth: number
  ): Line2 | null {
    if (!isValidNumber(scale) || scale <= 0) scale = 1;
    if (!isValidNumber(angle)) angle = 0;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const v of vertices) {
      if (!isValidNumber(v.x) || !isValidNumber(v.y)) continue;
      minX = Math.min(minX, v.x);
      minY = Math.min(minY, v.y);
      maxX = Math.max(maxX, v.x);
      maxY = Math.max(maxY, v.y);
    }

    if (!isValidNumber(minX) || !isValidNumber(maxX) ||
        !isValidNumber(minY) || !isValidNumber(maxY) ||
        minX === Infinity || maxX === -Infinity) {
      return null;
    }

    const spacing = scale * 3;
    if (spacing < 1e-10 || !isValidNumber(spacing)) return null;

    const rad = angle * Math.PI / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const halfDiag = Math.sqrt((maxX - minX) ** 2 + (maxY - minY) ** 2) / 2;

    if (!isValidNumber(halfDiag) || halfDiag < 1e-10) return null;

    const numLines = Math.ceil(halfDiag * 2 / spacing);
    const halfLen = halfDiag * 1.5;

    const positions: number[] = [];

    for (let i = -numLines; i <= numLines; i++) {
      const offset = i * spacing;
      const baseX = cx + offset * sinA;
      const baseY = cy - offset * cosA;

      const x1 = baseX - halfLen * cosA;
      const y1 = baseY - halfLen * sinA;
      const x2 = baseX + halfLen * cosA;
      const y2 = baseY + halfLen * sinA;

      if (isValidNumber(x1) && isValidNumber(y1) &&
          isValidNumber(x2) && isValidNumber(y2)) {
        positions.push(x1, y1, 0, x2, y2, 0);
      }
    }

    if (positions.length < 6) return null;

    const geometry = new LineGeometry();
    geometry.setPositions(positions);

    const material = this.createLineMaterial(color, lineWidth * 0.5);
    const line = new Line2(geometry, material);
    line.computeLineDistances();
    return line;
  }

  createDimension(
    definitionPoint: CadPoint,
    textMidpoint: CadPoint,
    content: string,
    rotation: number,
    color: THREE.Color,
    lineWidth: number
  ): THREE.Group | null {
    if (!isValidPoint(definitionPoint) || !isValidPoint(textMidpoint)) return null;
    if (!isValidNumber(rotation)) rotation = 0;

    const group = new THREE.Group();

    const dp = new THREE.Vector3(definitionPoint.x, definitionPoint.y, definitionPoint.z);
    const tm = new THREE.Vector3(textMidpoint.x, textMidpoint.y, textMidpoint.z);

    const dimLine = this.createLine2FromPoints([dp, tm], color, lineWidth);
    if (dimLine) group.add(dimLine);

    const arrowSize = 3;
    const dir = new THREE.Vector3().subVectors(tm, dp);
    const len = dir.length();
    if (len > arrowSize * 2) {
      const dirNorm = dir.normalize();
      const perp = new THREE.Vector3(-dirNorm.y, dirNorm.x, 0);

      const arrowPoints1 = [
        dp.clone(),
        dp.clone().add(dirNorm.clone().multiplyScalar(arrowSize)).add(perp.clone().multiplyScalar(arrowSize * 0.4)),
        dp.clone().add(dirNorm.clone().multiplyScalar(arrowSize)).add(perp.clone().multiplyScalar(-arrowSize * 0.4)),
        dp.clone(),
      ];
      const arrow1 = this.createLine2FromPoints(arrowPoints1, color, lineWidth);
      if (arrow1) group.add(arrow1);

      const arrowPoints2 = [
        tm.clone(),
        tm.clone().add(dirNorm.clone().multiplyScalar(-arrowSize)).add(perp.clone().multiplyScalar(arrowSize * 0.4)),
        tm.clone().add(dirNorm.clone().multiplyScalar(-arrowSize)).add(perp.clone().multiplyScalar(-arrowSize * 0.4)),
        tm.clone(),
      ];
      const arrow2 = this.createLine2FromPoints(arrowPoints2, color, lineWidth);
      if (arrow2) group.add(arrow2);
    }

    const extLen = 5;
    const dirNorm = len > 0 ? dir.normalize() : new THREE.Vector3(1, 0, 0);
    const perp = new THREE.Vector3(-dirNorm.y, dirNorm.x, 0);

    const ext1Start = dp.clone().add(perp.clone().multiplyScalar(-extLen));
    const ext1End = dp.clone().add(perp.clone().multiplyScalar(extLen));
    const ext1 = this.createLine2FromPoints([ext1Start, ext1End], color, lineWidth * 0.5);
    if (ext1) group.add(ext1);

    const ext2Start = tm.clone().add(perp.clone().multiplyScalar(-extLen));
    const ext2End = tm.clone().add(perp.clone().multiplyScalar(extLen));
    const ext2 = this.createLine2FromPoints([ext2Start, ext2End], color, lineWidth * 0.5);
    if (ext2) group.add(ext2);

    if (content && content.trim().length > 0) {
      const textMesh = this.createText(textMidpoint, content, 5, rotation, color, 5);
      if (textMesh) group.add(textMesh);
    }

    return group;
  }

  /**
   * INSERT 占位渲染：用十字+小圆圈表示块的插入点。
   */
  createInsertPlaceholder(
    pos: { x: number; y: number; z: number },
    scale: number,
    color: THREE.Color,
    lineWidth: number,
  ): THREE.Object3D {
    const group = new THREE.Group();
    const armSize = 6 * scale;
    const horizontal = this.createLine(
      { x: pos.x - armSize, y: pos.y, z: 0 },
      { x: pos.x + armSize, y: pos.y, z: 0 },
      color, lineWidth,
    );
    const vertical = this.createLine(
      { x: pos.x, y: pos.y - armSize, z: 0 },
      { x: pos.x, y: pos.y + armSize, z: 0 },
      color, lineWidth,
    );
    const ring = this.createCircle(pos, armSize * 0.6, color, lineWidth);
    if (horizontal) group.add(horizontal);
    if (vertical) group.add(vertical);
    if (ring) group.add(ring);
    return group;
  }

  // ── INSERT (BlockRef) recursive rendering ──

  renderInsert(entity: any): THREE.Object3D | null {
    const MAX_INSERT_DEPTH = 10;
    if (this._insertDepth >= MAX_INSERT_DEPTH) {
      logger.warn('GeometryFactory', 'renderInsert: max depth exceeded', {
        blockName: entity.block_name,
        depth: this._insertDepth,
      });
      return null;
    }

    const blocks = this._entityStore.getBlocks();
    if (!blocks.size) {
      logger.warn('GeometryFactory', 'renderInsert: no blocks loaded');
      return null;
    }

    const blockName = entity.block_name || (entity as any).blockName;

    if (this._visitedBlocks.has(blockName)) {
      logger.warn('GeometryFactory', 'renderInsert: circular reference detected', { blockName });
      return null;
    }

    const block = blocks.get(blockName);
    if (!block) {
      logger.warn('GeometryFactory', 'renderInsert: block not found', { blockName: entity.block_name });
      return null;
    }

    const group = new THREE.Group();
    group.name = `INSERT_${entity.id}_${entity.block_name}`;

    const matrix = new THREE.Matrix4();
    matrix.makeScale(entity.x_scale, entity.y_scale, entity.z_scale);
    const rotationMatrix = new THREE.Matrix4();
    rotationMatrix.makeRotationZ(entity.rotation);
    matrix.premultiply(rotationMatrix);
    const translationMatrix = new THREE.Matrix4();
    translationMatrix.makeTranslation(entity.position.x, entity.position.y, entity.position.z);
    matrix.premultiply(translationMatrix);

    this._insertDepth++;
    this._visitedBlocks.add(blockName);

    try {
      for (const blkEntity of block.entities) {
        try {
          const mesh = this.createEntityMesh(blkEntity);
          if (mesh) {
            mesh.applyMatrix4(matrix);
            group.add(mesh);
          }
        } catch (e) {
          logger.warn('GeometryFactory', 'renderInsert: failed to render block entity', {
            blockName: entity.block_name,
            entityId: blkEntity.id,
            error: e
          });
        }
      }

      logger.info('GeometryFactory', 'renderInsert: rendered block', {
        blockName: entity.block_name,
        entityCount: block.entities.length,
        childCount: group.children.length
      });
    } finally {
      this._insertDepth--;
      if (this._insertDepth === 0) {
        this._visitedBlocks.clear();
      }
    }

    return group.children.length > 0 ? group : null;
  }

  // ── Utility ──

  expandDegenerateBbox(node: SceneNode): void {
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
  }

  /** 是否为可合批渲染的实体类型 */
  isBatchableType(type: string): boolean {
    return type === 'line' || type === 'circle' || type === 'arc' ||
           type === 'polyline' || type === 'lwPolyline' || type === 'spline' ||
           type === 'ellipse' || type === 'dimension';
  }

  /** lwPolyline 节点顶点数过多时进行抽稀 */
  decimateLwPolylineNode(node: SceneNode): SceneNode {
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
  }

  /** 根据 SceneNode 计算 bbox（用于实体编辑后重算包围盒） */
  recomputeBbox(node: SceneNode): void {
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
  }

  /** 平移 SceneNode 的所有坐标 */
  translateNode(node: SceneNode, dx: number, dy: number): void {
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
  }

  private _createEntityRenderContext(): EntityRenderContext {
    const sm = this._sceneManager;
    const cam = (sm as any)._camera as THREE.OrthographicCamera | undefined;
    return {
      scene: sm.scene,
      camera: cam ?? new THREE.OrthographicCamera(),
      renderer: sm.renderer,
      viewport: { width: sm.width, height: sm.height },
      zoom: cam?.zoom ?? 1,
      frameTime: performance.now(),
    };
  }

  dispose(): void {
    this._visitedBlocks.clear();
    logger.info('GeometryFactory', 'Disposed');
  }
}
