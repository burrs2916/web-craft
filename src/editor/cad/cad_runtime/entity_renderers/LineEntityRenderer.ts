import * as THREE from "three";
import type { EntityRenderer, EntityRenderContext, EntityRenderResult } from "./EntityRenderer";

export class LineEntityRenderer implements EntityRenderer {
  readonly type = 'line';
  readonly priority = 10;

  canHandle(entityType: string): boolean {
    return entityType === 'LINE' || entityType === 'line';
  }

  create(entity: any, _context: EntityRenderContext): EntityRenderResult | null {
    if (!entity.start || !entity.end) return null;

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array([
      entity.start.x, entity.start.y, entity.start.z || 0,
      entity.end.x, entity.end.y, entity.end.z || 0,
    ]);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const color = entity.color ?? 0x4fc3f7;
    const material = new THREE.LineBasicMaterial({ color });
    const line = new THREE.Line(geometry, material);
    line.userData = { entityType: 'line', entityId: entity.id };

    return {
      object: line,
      dispose: () => {
        geometry.dispose();
        material.dispose();
      },
    };
  }

  update(object: THREE.Object3D, entity: any, _context: EntityRenderContext): void {
    if (!entity.start || !entity.end) return;
    const geometry = (object as THREE.Line).geometry as THREE.BufferGeometry;
    const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
    if (positions) {
      positions.setXYZ(0, entity.start.x, entity.start.y, entity.start.z || 0);
      positions.setXYZ(1, entity.end.x, entity.end.y, entity.end.z || 0);
      positions.needsUpdate = true;
    }
  }

  dispose(object: THREE.Object3D): void {
    const line = object as THREE.Line;
    line.geometry.dispose();
    (line.material as THREE.Material).dispose();
  }
}
