import type { SceneNode } from '../cad_runtime/scene_node';
import type { CadRenderer } from './core';
import type { CadRendererInternal } from './internal';

declare module './core' {
  interface CadRenderer {
    getEntityNode(entityId: string): SceneNode | undefined;
    getAllEntityNodes(): SceneNode[];
    pickEntityIdAt(clientX: number, clientY: number, includeHidden?: boolean): string | null;

    updateTextContent(entityId: string, newContent: string): boolean;
    updateEntityColor(entityId: string, newColorRgb: number): boolean;
    updateEntityLayer(entityId: string, newLayer: string): boolean;
    moveEntity(entityId: string, dx: number, dy: number): boolean;
    /** 本地复制实体（不改动文档数据），返回新实体 id */
    copyEntityLocally(entityId: string, dx: number, dy: number): string | null;
    copyEntitiesLocally(entityIds: string[], dx: number, dy: number): string[];
    updateEntityFromProps(entityId: string, props: Record<string, unknown>): boolean;
    /** 本地逻辑删除实体并清理其渲染资源 */
    deleteEntityLocally(entityId: string): boolean;
    restoreEntityLocally(node: SceneNode): boolean;
    addEntityLocally(node: SceneNode): boolean;
  }
}

export const entityMethods = {
  getEntityNode(this: CadRenderer, entityId: string): SceneNode | undefined {
    return (this as unknown as CadRendererInternal)._entityStore.getNode(entityId);
  },

  getAllEntityNodes(this: CadRenderer): SceneNode[] {
    return (this as unknown as CadRendererInternal)._entityStore.getAllNodes();
  },

  pickEntityIdAt(this: CadRenderer, clientX: number, clientY: number, includeHidden: boolean = false): string | null {
    return (this as unknown as CadRendererInternal)._interactionController.pickEntityIdAt(clientX, clientY, includeHidden);
  },

  updateTextContent(this: CadRenderer, entityId: string, newContent: string): boolean {
    const f = this as unknown as CadRendererInternal;
    const node = f._entityStore.getNode(entityId);
    if (!node) return false;
    if (node.type !== 'text' && node.type !== 'mText') return false;

    (node as unknown as { content: string }).content = newContent;
    f._geometryFactory.recomputeBbox(node);
    f._geometryFactory.expandDegenerateBbox(node);

    if (f._useBatchedText && f._sdfTextRenderer.has(entityId)) {
      f._sdfTextRenderer.removeText(entityId);
      f._geometryFactory.addTextToBatchedRenderer(entityId, node, node.layer);
      if (!f._entityStore.isLayerVisible(node.layer) || node.visible === false) {
        f._sdfTextRenderer.setTextVisible(entityId, false);
      }
      f._requestRender();
      return true;
    }

    const oldMesh = f._entityStore.getMesh(entityId);
    if (oldMesh) {
      f._sceneManager.remove(oldMesh);
      f._entityStore.getAllMeshes().delete(entityId);
    }
    const newMesh = f._geometryFactory.createSceneNodeMesh(node);
    if (!newMesh) return false;
    f._entityStore.setMesh(entityId, newMesh);
    f._sceneManager.add(newMesh);
    if (!f._entityStore.isLayerVisible(node.layer) || node.visible === false) {
      newMesh.visible = false;
    }
    f._requestRender();
    return true;
  },

  updateEntityColor(this: CadRenderer, entityId: string, newColorRgb: number): boolean {
    const f = this as unknown as CadRendererInternal;
    const node = f._entityStore.getNode(entityId);
    if (!node) return false;
    (node as { color: number }).color = newColorRgb;
    return f._rebuildEntityMesh(entityId);
  },

  updateEntityLayer(this: CadRenderer, entityId: string, newLayer: string): boolean {
    const f = this as unknown as CadRendererInternal;
    const node = f._entityStore.getNode(entityId);
    if (!node) return false;
    (node as { layer: string }).layer = newLayer;
    return f._rebuildEntityMesh(entityId);
  },

  moveEntity(this: CadRenderer, entityId: string, dx: number, dy: number): boolean {
    const f = this as unknown as CadRendererInternal;
    const node = f._entityStore.getNode(entityId);
    if (!node) return false;
    f._geometryFactory.translateNode(node, dx, dy);
    return f._rebuildEntityMesh(entityId);
  },

  copyEntityLocally(this: CadRenderer, entityId: string, dx: number, dy: number): string | null {
    const f = this as unknown as CadRendererInternal;
    const node = f._entityStore.getNode(entityId);
    if (!node) return null;
    const newId = f._nextEntityId();
    const clone = JSON.parse(JSON.stringify(node)) as SceneNode;
    (clone as any).id = parseInt(newId, 10);
    f._geometryFactory.translateNode(clone, dx, dy);
    f._geometryFactory.expandDegenerateBbox(clone);
    f._addCloneToScene(newId, clone);
    return newId;
  },

  copyEntitiesLocally(this: CadRenderer, entityIds: string[], dx: number, dy: number): string[] {
    const f = this as unknown as CadRendererInternal;
    const newIds: string[] = [];
    for (const id of entityIds) {
      const newId = f.copyEntityLocally(id, dx, dy);
      if (newId) newIds.push(newId);
    }
    return newIds;
  },

  updateEntityFromProps(this: CadRenderer, entityId: string, props: Record<string, unknown>): boolean {
    const f = this as unknown as CadRendererInternal;
    const node = f._entityStore.getNode(entityId);
    if (!node) return false;
    Object.assign(node, props);
    f._geometryFactory.recomputeBbox(node);
    return f._rebuildEntityMesh(entityId);
  },

  deleteEntityLocally(this: CadRenderer, entityId: string): boolean {
    const f = this as unknown as CadRendererInternal;
    const node = f._entityStore.getNode(entityId);
    if (!node) return false;
    // 逻辑删除同样要通知实体移除事件，让 SelectionManager 等模块清理
    // 依附于该实体的资源（如高亮框），避免删除后残留。
    f._entityStore.notifyEntityRemoved(entityId);
    if (f._batchedBuilder.hasEntity(entityId)) {
      f._batchedBuilder.removeEntity(entityId, f._sceneManager.scene);
      f._batchedBuilder.rebuildDirty(f._sceneManager.scene);
    }
    if (f._sdfTextRenderer.has(entityId)) {
      f._sdfTextRenderer.removeText(entityId);
      f._sdfTextRenderer.sync().then(() => { if (!f._isDisposed) f._requestRender(); });
    }
    const mesh = f._entityStore.getMesh(entityId);
    if (mesh) {
      f._sceneManager.remove(mesh);
    }
    f._entityStore.setLogicallyHidden(entityId, true);
    f._spatialIndex.removeEntity(entityId);
    f._requestRender();
    return true;
  },

  restoreEntityLocally(this: CadRenderer, node: SceneNode): boolean {
    const f = this as unknown as CadRendererInternal;
    const idStr = String((node as any).id ?? f._nextEntityId());
    f._entityStore.setLogicallyHidden(idStr, false);
    return f._addNodeToScene(node) || true;
  },

  addEntityLocally(this: CadRenderer, node: SceneNode): boolean {
    return (this as unknown as CadRendererInternal)._addNodeToScene(node);
  },
};