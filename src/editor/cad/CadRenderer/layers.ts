import type { CadRenderer } from './core';
import type { CadRendererInternal } from './internal';

declare module './core' {
  interface CadRenderer {
    setLayerVisible(layerName: string, visible: boolean): void;
    setMultipleLayersVisible(changes: Array<{ layerName: string; visible: boolean }>): void;
    /** 锁定图层；锁定时会自动取消该图层上已选中实体 */
    setLayerLocked(layerName: string, locked: boolean): void;
    isLayerVisible(layerName: string): boolean;
    isLayerLocked(layerName: string): boolean;
    getLayers(): string[];
    setLayerColor(layerName: string, newColorRgb: number): void;
    /** 删除图层；deleteEntities 为真时一并删除图层内实体，否则迁移到 '0' 层 */
    removeLayer(layerName: string, deleteEntities: boolean): void;
    /** 重命名图层，并将图层内实体迁移到新图层 */
    renameLayer(oldName: string, newName: string): void;
  }
}

export const layerMethods = {
  setLayerVisible(this: CadRenderer, layerName: string, visible: boolean): void {
    const f = this as unknown as CadRendererInternal;
    f._entityStore.setLayerVisible(layerName, visible);
    f._batchedBuilder.setLayerVisible(layerName, visible);
    f._sdfTextRenderer.setLayerVisible(layerName, visible);
    if (f._sdfTextRenderer.needsSync) {
      f._sdfTextRenderer.sync().then(() => { if (!f._isDisposed) f._requestRender(); });
    }
    // Update logically hidden for individual entities
    const entitySet = f._entityStore.getLayerEntities(layerName);
    for (const id of entitySet) {
      f._entityStore.setLogicallyHidden(id, !visible);
    }
    f._requestRender();
  },

  setMultipleLayersVisible(this: CadRenderer, changes: Array<{ layerName: string; visible: boolean }>): void {
    const f = this as unknown as CadRendererInternal;
    for (const { layerName, visible } of changes) {
      f._entityStore.setLayerVisible(layerName, visible);
      f._batchedBuilder.setLayerVisible(layerName, visible);
      f._sdfTextRenderer.setLayerVisible(layerName, visible);
    }
    if (f._sdfTextRenderer.needsSync) {
      f._sdfTextRenderer.sync().then(() => { if (!f._isDisposed) f._requestRender(); });
    }
    for (const { layerName, visible } of changes) {
      const entitySet = f._entityStore.getLayerEntities(layerName);
      for (const id of entitySet) {
        f._entityStore.setLogicallyHidden(id, !visible);
      }
    }
    f._requestRender();
  },

  setLayerLocked(this: CadRenderer, layerName: string, locked: boolean): void {
    const f = this as unknown as CadRendererInternal;
    f._entityStore.setLayerLocked(layerName, locked);
    if (locked) {
      for (const id of f._selectionManager.getSelectedEntityIds()) {
        const node = f._entityStore.getNode(id);
        if (node?.layer === layerName) {
          f._selectionManager.deselectEntity(id);
        }
      }
      f._onSelectionChanged?.(f.getSelectedEntityIds());
    }
  },

  isLayerVisible(this: CadRenderer, layerName: string): boolean {
    return (this as unknown as CadRendererInternal)._entityStore.isLayerVisible(layerName);
  },

  isLayerLocked(this: CadRenderer, layerName: string): boolean {
    return (this as unknown as CadRendererInternal)._entityStore.isLayerLocked(layerName);
  },

  getLayers(this: CadRenderer): string[] {
    return (this as unknown as CadRendererInternal)._entityStore.getLayers();
  },

  setLayerColor(this: CadRenderer, layerName: string, newColorRgb: number): void {
    const f = this as unknown as CadRendererInternal;
    f._entityStore.setLayerColor(layerName, newColorRgb);
    f._refreshAllEntityColors();
  },

  removeLayer(this: CadRenderer, layerName: string, deleteEntities: boolean): void {
    const f = this as unknown as CadRendererInternal;
    const entitySet = f._entityStore.getLayerEntities(layerName);
    for (const id of Array.from(entitySet)) {
      if (deleteEntities) {
        f.deleteEntityLocally(id);
      } else {
        const node = f._entityStore.getNode(id);
        if (node) {
          (node as { layer: string }).layer = '0';
          f._rebuildEntityMesh(id);
        }
      }
    }
    f._requestRender();
  },

  renameLayer(this: CadRenderer, oldName: string, newName: string): void {
    const f = this as unknown as CadRendererInternal;
    // Update all entities in the old layer
    const entitySet = f._entityStore.getLayerEntities(oldName);
    for (const id of Array.from(entitySet)) {
      const node = f._entityStore.getNode(id);
      if (node) {
        (node as { layer: string }).layer = newName;
        f._rebuildEntityMesh(id);
      }
    }
    f._requestRender();
  },
};