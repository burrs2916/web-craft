import type { CadRenderer } from './core';
import type { CadRendererInternal } from './internal';

declare module './core' {
  interface CadRenderer {
    selectEntity(entityId: string, additive?: boolean): void;
    deselectEntity(entityId: string): void;
    deselectAll(): void;
    getSelectedEntityIds(): string[];
    getSelectedEntityId(): string | null;
    /** 矩形框选，返回命中实体 id 列表 */
    selectEntitiesInRect(minX: number, minY: number, maxX: number, maxY: number, additive?: boolean): string[];
    /** 重建 GPU 拾取场景（文档加载完成后调用） */
    _setupGPUPicking(): void;
  }
}

export const selectionMethods = {
  selectEntity(this: CadRenderer, entityId: string, additive: boolean = false): void {
    (this as unknown as CadRendererInternal)._selectionManager.selectEntity(entityId, additive);
  },

  deselectEntity(this: CadRenderer, entityId: string): void {
    (this as unknown as CadRendererInternal)._selectionManager.deselectEntity(entityId);
  },

  deselectAll(this: CadRenderer): void {
    (this as unknown as CadRendererInternal)._selectionManager.deselectAll();
  },

  getSelectedEntityIds(this: CadRenderer): string[] {
    return (this as unknown as CadRendererInternal)._selectionManager.getSelectedEntityIds();
  },

  getSelectedEntityId(this: CadRenderer): string | null {
    return (this as unknown as CadRendererInternal)._selectionManager.getSelectedEntityId();
  },

  selectEntitiesInRect(
    this: CadRenderer,
    minX: number, minY: number, maxX: number, maxY: number, additive: boolean = false,
  ): string[] {
    return (this as unknown as CadRendererInternal)._selectionManager.selectEntitiesInRect(minX, minY, maxX, maxY, additive);
  },

  _setupGPUPicking(this: CadRenderer): void {
    (this as unknown as CadRendererInternal)._selectionManager.rebuildPickingScene();
  },
};