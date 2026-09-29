import * as THREE from 'three';
import type { CadLwVertex } from '../../types';
import type { SceneManager } from '../SceneManager';
import { isValidNumber } from './validation';

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

/**
 * 由 bulge 生成弧线中间点（不含起终点），返回 Vector3 列表。
 * 与 `bulgeToArcPositions` 的区别：本函数产出离散点，供 createLwPolyline / Hatch 轮廓使用。
 */
export function bulgeToArcPoints(start: CadLwVertex, end: CadLwVertex): THREE.Vector3[] {
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

/** 当前相机可见世界宽度（正交相机 left/right 之差）。 */
export function cameraViewWidth(sceneManager: SceneManager): number {
  const cam = (sceneManager as any)._camera;
  if (cam) {
    return cam.right - cam.left;
  }
  return sceneManager.width || 1;
}