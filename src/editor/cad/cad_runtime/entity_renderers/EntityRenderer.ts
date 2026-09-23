import type * as THREE from "three";

export interface EntityRenderContext {
  scene: THREE.Scene;
  camera: THREE.Camera;
  renderer: THREE.WebGLRenderer;
  viewport: { width: number; height: number };
  zoom: number;
  frameTime: number;
}

export interface EntityRenderResult {
  object: THREE.Object3D;
  boundingBox?: THREE.Box3;
  dispose: () => void;
}

export interface EntityRenderer {
  readonly type: string;
  readonly priority: number;

  canHandle(entityType: string): boolean;
  create(entity: unknown, context: EntityRenderContext): EntityRenderResult | null;
  update(object: THREE.Object3D, entity: unknown, context: EntityRenderContext): void;
  dispose(object: THREE.Object3D): void;
}

export class EntityRendererRegistry {
  private renderers: Map<string, EntityRenderer> = new Map();
  private typeMapping: Map<string, EntityRenderer> = new Map();

  register(renderer: EntityRenderer): void {
    this.renderers.set(renderer.type, renderer);
  }

  unregister(type: string): boolean {
    const renderer = this.renderers.get(type);
    if (!renderer) return false;
    this.renderers.delete(type);

    this.typeMapping.forEach((r, entityType) => {
      if (r === renderer) {
        this.typeMapping.delete(entityType);
      }
    });

    return true;
  }

  getRendererForType(entityType: string): EntityRenderer | undefined {
    if (this.typeMapping.has(entityType)) {
      return this.typeMapping.get(entityType);
    }

    for (const renderer of this.renderers.values()) {
      if (renderer.canHandle(entityType)) {
        this.typeMapping.set(entityType, renderer);
        return renderer;
      }
    }

    return undefined;
  }

  getRenderer(rendererType: string): EntityRenderer | undefined {
    return this.renderers.get(rendererType);
  }

  getAllRenderers(): EntityRenderer[] {
    return Array.from(this.renderers.values());
  }

  clear(): void {
    this.renderers.clear();
    this.typeMapping.clear();
  }
}

export const entityRendererRegistry = new EntityRendererRegistry();
