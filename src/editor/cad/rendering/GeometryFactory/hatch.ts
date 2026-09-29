import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import type { CadLwVertex } from '../../types';
import { bulgeToArcPoints, polygonArea } from './geometryMath';
import { isValidNumber, isValidVector3 } from './validation';
import type { GeometryFactory } from './core';

declare module './core' {
  interface GeometryFactory {
    createHatch(
      boundaries: CadLwVertex[][],
      solid: boolean,
      scale: number,
      angle: number,
      color: THREE.Color,
      lineWidth: number,
      style?: number,
      patternLines?: Array<{ angle: number; base_x: number; base_y: number; offset_x: number; offset_y: number; dashes: number[] }>,
    ): THREE.Object3D | null;
  }
}

function getHatchFillPaths(paths: CadLwVertex[][], style: number): CadLwVertex[][] {
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

function createHatchPatternFromDefinition(
  factory: GeometryFactory,
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
      const material = factory.createLineMaterial(color, lineWidth * 0.5);
      const line = new Line2(geometry, material);
      line.computeLineDistances();
      group.add(line);
    }
  }

  if (group.children.length === 0) return null;
  return group;
}

function createHatchPatternLine(
  factory: GeometryFactory,
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

  const material = factory.createLineMaterial(color, lineWidth * 0.5);
  const line = new Line2(geometry, material);
  line.computeLineDistances();
  return line;
}

export const hatchMethods = {
  createHatch(
    this: GeometryFactory,
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
      const fillPaths = getHatchFillPaths(allPaths, style);
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
      const fillPaths = getHatchFillPaths(allPaths, style);
      const patternGroup = createHatchPatternFromDefinition(this, fillPaths, scale, patternLines, color, lineWidth);
      if (patternGroup) group.add(patternGroup);
    } else {
      const fillPaths = getHatchFillPaths(allPaths, style);
      for (const path of fillPaths) {
        const patternLine = createHatchPatternLine(this, path, scale, angle, color, lineWidth);
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
          const arcPoints = bulgeToArcPoints(v, nextV);
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
  },
} satisfies Pick<GeometryFactory, 'createHatch'>;