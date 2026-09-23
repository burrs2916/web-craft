import * as THREE from "three";
import type { EntityRenderer, EntityRenderContext, EntityRenderResult } from "./EntityRenderer";

export class CircleEntityRenderer implements EntityRenderer {
  readonly type = 'circle';
  readonly priority = 10;

  canHandle(entityType: string): boolean {
    return entityType === 'CIRCLE' || entityType === 'circle';
  }

  create(entity: any, _context: EntityRenderContext): EntityRenderResult | null {
    if (entity.center === undefined || entity.radius === undefined) return null;

    const segments = Math.max(16, Math.min(128, Math.floor(entity.radius * 32)));
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array((segments + 1) * 3);
    const cx = entity.center.x;
    const cy = entity.center.y;
    const cz = entity.center.z || 0;
    const r = entity.radius;

    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      positions[i * 3] = cx + r * Math.cos(angle);
      positions[i * 3 + 1] = cy + r * Math.sin(angle);
      positions[i * 3 + 2] = cz;
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const color = entity.color ?? 0x4fc3f7;
    const material = new THREE.LineBasicMaterial({ color });
    const line = new THREE.Line(geometry, material);
    line.userData = { entityType: 'circle', entityId: entity.id };

    return {
      object: line,
      dispose: () => {
        geometry.dispose();
        material.dispose();
      },
    };
  }

  update(object: THREE.Object3D, entity: any, _context: EntityRenderContext): void {
    if (entity.center === undefined || entity.radius === undefined) return;
    const geometry = (object as THREE.Line).geometry as THREE.BufferGeometry;
    const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
    if (!positions) return;

    const segments = (positions.count - 1);
    const cx = entity.center.x;
    const cy = entity.center.y;
    const cz = entity.center.z || 0;
    const r = entity.radius;

    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      positions.setXYZ(i, cx + r * Math.cos(angle), cy + r * Math.sin(angle), cz);
    }
    positions.needsUpdate = true;
  }

  dispose(object: THREE.Object3D): void {
    const line = object as THREE.Line;
    line.geometry.dispose();
    (line.material as THREE.Material).dispose();
  }
}
