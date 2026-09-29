import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import type { CadPoint, CadLwVertex } from '../../types';
import { adaptiveArcSegments, bulgeToArcPoints, cameraViewWidth } from './geometryMath';
import { isValidNumber, isValidPoint, isValidVector3 } from './validation';
import type { GeometryFactory } from './core';
import type { GeometryFactoryInternal } from './internal';

declare module './core' {
  interface GeometryFactory {
    createLine(start: CadPoint, end: CadPoint, color: THREE.Color, lineWidth: number): Line2 | null;
    createCircle(center: CadPoint, radius: number, color: THREE.Color, lineWidth: number): Line2 | null;
    createArc(
      center: CadPoint,
      radius: number,
      startAngle: number,
      endAngle: number,
      color: THREE.Color,
      lineWidth: number,
    ): Line2 | null;
    createPolyline(vertices: CadPoint[], closed: boolean, color: THREE.Color, lineWidth: number): Line2 | null;
    createLwPolyline(vertices: CadLwVertex[], closed: boolean, color: THREE.Color, lineWidth: number): Line2 | null;
    createEllipse(
      center: CadPoint,
      majorAxis: CadPoint,
      minorAxisRatio: number,
      startAngle: number,
      endAngle: number,
      color: THREE.Color,
      lineWidth: number,
    ): Line2 | null;
    createSpline(
      controlPoints: CadPoint[],
      fitPoints: CadPoint[],
      knots: number[],
      degree: number,
      color: THREE.Color,
      lineWidth: number,
    ): Line2 | null;
    createSolid(points: CadPoint[], color: THREE.Color): THREE.Mesh | null;
    createPoint(position: CadPoint, color: THREE.Color): THREE.Group | null;
  }
}

function createSplineFromFitPoints(factory: GeometryFactory, fitPoints: CadPoint[], color: THREE.Color, lineWidth: number): Line2 | null {
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

  return factory.createLine2FromPoints(points, color, lineWidth);
}

function evaluateBSpline(points: CadPoint[], t: number, _degree: number): CadPoint {
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

export const primitiveMethods = {
  createLine(this: GeometryFactory, start: CadPoint, end: CadPoint, color: THREE.Color, lineWidth: number): Line2 | null {
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
  },

  createCircle(this: GeometryFactory, center: CadPoint, radius: number, color: THREE.Color, lineWidth: number): Line2 | null {
    const f = this as unknown as GeometryFactoryInternal;
    if (!isValidPoint(center) || !isValidNumber(radius) || radius <= 0) return null;

    const viewW = cameraViewWidth(f._sceneManager);
    const canvasW = f._sceneManager.width;
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
  },

  createArc(
    this: GeometryFactory,
    center: CadPoint,
    radius: number,
    startAngle: number,
    endAngle: number,
    color: THREE.Color,
    lineWidth: number
  ): Line2 | null {
    const f = this as unknown as GeometryFactoryInternal;
    if (!isValidPoint(center) || !isValidNumber(radius) || radius <= 0) return null;
    if (!isValidNumber(startAngle) || !isValidNumber(endAngle)) return null;

    let angleRange = endAngle - startAngle;
    if (angleRange < 0) angleRange += Math.PI * 2;
    if (angleRange < 1e-10) return null;

    const viewW = cameraViewWidth(f._sceneManager);
    const canvasW = f._sceneManager.width;
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
  },

  createPolyline(this: GeometryFactory, vertices: CadPoint[], closed: boolean, color: THREE.Color, lineWidth: number): Line2 | null {
    const validVertices = vertices.filter(v => isValidPoint(v));
    if (validVertices.length === 0) return null;

    const points = validVertices.map(v => new THREE.Vector3(v.x, v.y, v.z));
    if (closed && points.length > 0) {
      points.push(points[0].clone());
    }

    return this.createLine2FromPoints(points, color, lineWidth);
  },

  createLwPolyline(this: GeometryFactory, vertices: CadLwVertex[], closed: boolean, color: THREE.Color, lineWidth: number): Line2 | null {
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
        const arcPoints = bulgeToArcPoints(v, nextV);
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
  },

  createEllipse(
    this: GeometryFactory,
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
  },

  createSpline(
    this: GeometryFactory,
    controlPoints: CadPoint[],
    fitPoints: CadPoint[],
    _knots: number[],
    degree: number,
    color: THREE.Color,
    lineWidth: number
  ): Line2 | null {
    if (fitPoints.length >= 2) {
      return createSplineFromFitPoints(this, fitPoints, color, lineWidth);
    }

    const validPoints = controlPoints.filter(p => isValidPoint(p));
    if (validPoints.length < 2) {
      return this.createPolyline(validPoints, false, color, lineWidth);
    }

    const points: THREE.Vector3[] = [];

    const numSamples = Math.max(validPoints.length * 10, 50);
    for (let i = 0; i <= numSamples; i++) {
      const t = i / numSamples;
      const point = evaluateBSpline(validPoints, t, degree);
      if (isValidPoint(point)) {
        points.push(new THREE.Vector3(point.x, point.y, point.z));
      }
    }

    return this.createLine2FromPoints(points, color, lineWidth);
  },

  createSolid(this: GeometryFactory, points: CadPoint[], color: THREE.Color): THREE.Mesh | null {
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
  },

  // PDMODE=0 / PDSIZE=0 means points are displayed as 1:1 pixel dots in AutoCAD —
  // effectively invisible in engineering drawings.
  createPoint(this: GeometryFactory, _position: CadPoint, _color: THREE.Color): THREE.Group | null {
    return null;
  },
} satisfies Pick<
  GeometryFactory,
  'createLine' | 'createCircle' | 'createArc' | 'createPolyline' | 'createLwPolyline' |
  'createEllipse' | 'createSpline' | 'createSolid' | 'createPoint'
>;