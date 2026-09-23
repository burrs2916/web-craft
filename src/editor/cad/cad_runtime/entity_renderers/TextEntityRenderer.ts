import * as THREE from "three";
import type { EntityRenderer, EntityRenderContext, EntityRenderResult } from "./EntityRenderer";

export class TextEntityRenderer implements EntityRenderer {
  readonly type = 'text';
  readonly priority = 20;

  canHandle(entityType: string): boolean {
    return entityType === 'TEXT' || entityType === 'text' || entityType === 'MTEXT' || entityType === 'mtext';
  }

  create(entity: any, _context: EntityRenderContext): EntityRenderResult | null {
    if (!entity.position || !entity.text) return null;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const fontSize = entity.height || 12;
    const text = entity.text;

    ctx.font = `${fontSize}px monospace`;
    const metrics = ctx.measureText(text);
    const textWidth = metrics.width;
    const textHeight = fontSize * 1.2;

    canvas.width = Math.ceil(textWidth) + 4;
    canvas.height = Math.ceil(textHeight) + 4;

    ctx.font = `${fontSize}px monospace`;
    ctx.fillStyle = entity.color ? `#${entity.color.toString(16).padStart(6, '0')}` : '#4fc3f7';
    ctx.textBaseline = 'top';
    ctx.fillText(text, 2, 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });

    const sprite = new THREE.Sprite(material);
    const aspect = canvas.width / canvas.height;
    const scale = fontSize * 0.05;
    sprite.scale.set(scale * aspect, scale, 1);
    sprite.position.set(entity.position.x, entity.position.y, entity.position.z || 0);
    sprite.userData = { entityType: 'text', entityId: entity.id };

    return {
      object: sprite,
      dispose: () => {
        texture.dispose();
        material.dispose();
      },
    };
  }

  update(object: THREE.Object3D, entity: any, _context: EntityRenderContext): void {
    if (!entity.position) return;
    object.position.set(entity.position.x, entity.position.y, entity.position.z || 0);
  }

  dispose(object: THREE.Object3D): void {
    const sprite = object as THREE.Sprite;
    const material = sprite.material as THREE.SpriteMaterial;
    if (material.map) material.map.dispose();
    material.dispose();
  }
}
