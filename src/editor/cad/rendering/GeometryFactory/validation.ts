import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import type { CadPoint } from '../../types';
import type { BoundingBox } from '../../cad_runtime/scene_node';

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