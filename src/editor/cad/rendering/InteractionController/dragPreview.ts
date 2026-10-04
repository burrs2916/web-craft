import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import type { InteractionController } from './core';
import type { InteractionControllerInternal } from './internal';

declare module './core' {
  interface InteractionController {
    _prepareSelectedEntitiesForDrag(): void;
    _applyDragPreview(entityId: string, dx: number, dy: number): void;
    _restoreDragPreview(entityId: string): void;
    _extractFromBatchForDrag(entityId: string): void;
    _offsetLinePositions(positions: number[], dx: number, dy: number): number[];
    _finishEntityDrag(dx: number, dy: number, rebuildAllBatched: boolean): void;
  }
}

/**
 * 实体拖动预览：从批渲染中抽取被拖实体、应用/还原线快照位移，以及拖动收尾提交。
 * 原 InteractionController 的 `_prepareSelectedEntitiesForDrag` / `_applyDragPreview` /
 * `_restoreDragPreview` / `_extractFromBatchForDrag` / `_offsetLinePositions` 逻辑保持不变；
 * mouseup / mouseleave 中重复的收尾段落抽为 `_finishEntityDrag`。
 */
export const dragPreviewMethods = {
  _prepareSelectedEntitiesForDrag(this: InteractionController): void {
    const f = this as unknown as InteractionControllerInternal;
    f._dragLineSnapshots.clear();
    for (const entityId of f._selectionManager.getSelectedEntityIds()) {
      if (f._sdfTextRenderer.has(entityId)) continue;

      if (f._batchedBuilder.hasEntity(entityId)) {
        f._extractFromBatchForDrag(entityId);
      }

      const node = f._entityStore.getNode(entityId);
      const mesh = f._entityStore.getMesh(entityId);
      if (!node || !mesh) continue;

      mesh.position.set(0, 0, 0);
      const positions = f._geometryFactory.extractLinePositions(node);
      if (positions && mesh instanceof Line2) {
        f._dragLineSnapshots.set(entityId, positions);
      }
    }
    f._batchedBuilder.rebuildDirty(f._sceneManager.scene);
    f._batchedBuilder.pruneOrphanedLineSegments(f._sceneManager.scene);
    f._onRequestRender();
  },

  _applyDragPreview(this: InteractionController, entityId: string, dx: number, dy: number): void {
    const f = this as unknown as InteractionControllerInternal;
    const snapshot = f._dragLineSnapshots.get(entityId);
    const mesh = f._entityStore.getMesh(entityId);
    if (snapshot && mesh instanceof Line2) {
      mesh.position.set(0, 0, 0);
      mesh.geometry.setPositions(f._offsetLinePositions(snapshot, dx, dy));
      mesh.computeLineDistances();
      return;
    }
    if (mesh) {
      mesh.position.set(dx, dy, 0);
    }
  },

  _restoreDragPreview(this: InteractionController, entityId: string): void {
    const f = this as unknown as InteractionControllerInternal;
    const snapshot = f._dragLineSnapshots.get(entityId);
    const mesh = f._entityStore.getMesh(entityId);
    if (snapshot && mesh instanceof Line2) {
      mesh.position.set(0, 0, 0);
      mesh.geometry.setPositions(snapshot);
      mesh.computeLineDistances();
      return;
    }
    if (mesh) {
      mesh.position.set(0, 0, 0);
    }
  },

  _extractFromBatchForDrag(this: InteractionController, entityId: string): void {
    const f = this as unknown as InteractionControllerInternal;
    if (!f._batchedBuilder.hasEntity(entityId)) return;
    f._batchedBuilder.removeEntity(entityId, f._sceneManager.scene);
    f._spatialIndex.removeEntity(entityId);

    const node = f._entityStore.getNode(entityId);
    if (!node) {
      f._batchedBuilder.pruneOrphanedLineSegments(f._sceneManager.scene);
      return;
    }

    const mesh = f._geometryFactory.createSceneNodeMesh(node);
    if (mesh) {
      f._entityStore.setMesh(entityId, mesh);
      f._entityStore.addIndividualEntity(entityId);
      if (f._entityStore.isLogicallyHidden(entityId) || !f._entityStore.isLayerVisible(node.layer)) {
        mesh.visible = false;
      }
      // 必须加入场景，否则拖动预览的 Line2 不会被渲染，导致残影/元素消失。
      f._sceneManager.add(mesh);
    }
    f._batchedBuilder.rebuildDirty(f._sceneManager.scene);
    f._batchedBuilder.pruneOrphanedLineSegments(f._sceneManager.scene);
  },

  _offsetLinePositions(this: InteractionController, positions: number[], dx: number, dy: number): number[] {
    const out = new Array<number>(positions.length);
    for (let i = 0; i < positions.length; i += 3) {
      out[i] = positions[i] + dx;
      out[i + 1] = positions[i + 1] + dy;
      out[i + 2] = positions[i + 2] ?? 0;
    }
    return out;
  },

  /**
   * 拖动收尾（mouseup 与 mouseleave 共用）。
   * `rebuildAllBatched` 仅 mouseleave 路径需要（原逻辑在 mouseleave 中额外调用
   * `_batchedBuilder.rebuildAll`）。
   */
  _finishEntityDrag(this: InteractionController, dx: number, dy: number, rebuildAllBatched: boolean): void {
    const f = this as unknown as InteractionControllerInternal;
    const significant = Math.abs(dx) > 2 || Math.abs(dy) > 2;

    if (significant) {
      for (const selId of f._selectionManager.getSelectedEntityIds()) {
        const node = f._entityStore.getNode(selId);
        if (!node) continue;
        if (f._sdfTextRenderer.has(selId)) {
          f._sdfTextRenderer.endDrag(selId);
          f._onTranslateNode(node, dx, dy);
          f._sdfTextRenderer.updatePosition(selId, (node as any).posX ?? 0, (node as any).posY ?? 0);
          // 仅文字需要在新位置重建高亮框；线条走 rebuildEntityMesh 后由选中流程处理。
          f._selectionManager.refreshHighlightOverlay(selId);
        } else {
          f._onTranslateNode(node, dx, dy);
          f._onRebuildEntityMesh(selId);
        }
        f._onEntityMoved?.(selId, dx, dy);
      }
      f._dragLineSnapshots.clear();
      if (rebuildAllBatched) f._batchedBuilder.rebuildAll(f._sceneManager.scene);
      f._sdfTextRenderer.sync().then(() => { if (!f._isDisposed) f._onRequestRender(); });
      f._onRequestRender();
    } else {
      for (const selId of f._selectionManager.getSelectedEntityIds()) {
        if (f._sdfTextRenderer.has(selId)) {
          f._sdfTextRenderer.endDrag(selId);
          const n = f._entityStore.getNode(selId);
          if (n) {
            f._sdfTextRenderer.updatePosition(selId, (n as any).posX ?? 0, (n as any).posY ?? 0);
          }
        }
        f._restoreDragPreview(selId);
        // 微小移动视为未移动，高亮框归位
        f._selectionManager.setHighlightOverlayOffset(selId, 0, 0);
      }
      f._dragLineSnapshots.clear();
      if (rebuildAllBatched) f._batchedBuilder.rebuildAll(f._sceneManager.scene);
      f._sdfTextRenderer.sync().then(() => { if (!f._isDisposed) f._onRequestRender(); });
      f._onRequestRender();
    }
  },
};