import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { SceneNode } from '../cad_runtime/scene_node';
import type { LineSegment } from '../cad_runtime/grid_spatial_index';
import { validateObject3D, DELETED_LAYER_NAME } from '../rendering/GeometryFactory';
import type { CadRenderer } from './core';
import type { CadRendererInternal } from './internal';

declare module './core' {
  interface CadRenderer {
    /** 核心：将 SceneNode 加入渲染管线（文字合批 / 线条合批 / 独立 mesh） */
    _addNodeToScene(node: SceneNode, enableLwPolyDecimation?: boolean): boolean;
    _addCloneToScene(newId: string, clone: SceneNode): void;
    _decimateLwPolylineNode(node: SceneNode): SceneNode;
    _addSegmentsToSpatialIndex(entityId: string, positions: number[]): void;
    _addEntityToSpatialIndex(entityId: string, node: SceneNode): void;
    /** 实体属性变更后重建其渲染产物（保持选中态高亮） */
    _rebuildEntityMesh(entityId: string): boolean;
    /** 选中合批实体时：移出合批并重建为独立 mesh */
    _extractEntityFromBatch(entityId: string): void;
    /** 取消选中时：将独立 mesh 合批回去 */
    _mergeEntityBackToBatch(entityId: string): void;
    _nextEntityId(): string;
    /** 背景色/线色变更后刷新全部实体颜色 */
    _refreshAllEntityColors(): void;
  }
}

export const pipelineMethods = {
  _addNodeToScene(this: CadRenderer, node: SceneNode, enableLwPolyDecimation: boolean = false): boolean {
    const f = this as unknown as CadRendererInternal;
    if (node.layer === DELETED_LAYER_NAME) return false;
    try {
      const idStr = String(node.id);
      f._geometryFactory.expandDegenerateBbox(node);

      const hiddenByLayer = !f._entityStore.isLayerVisible(node.layer);
      const hiddenByNode = node.visible === false;
      if (hiddenByLayer || hiddenByNode) {
        f._entityStore.setLogicallyHidden(idStr, true);
      }

      let effectiveNode = node;
      if (enableLwPolyDecimation && node.type === 'lwPolyline') {
        effectiveNode = f._decimateLwPolylineNode(node);
      }
      f._entityStore.addNode(idStr, effectiveNode);

      // Text batching
      if (f._useBatchedText && (effectiveNode.type === 'text' || effectiveNode.type === 'mText')) {
        const added = f._geometryFactory.addTextToBatchedRenderer(idStr, effectiveNode, effectiveNode.layer);
        if (added) {
          if (hiddenByLayer || hiddenByNode) {
            f._sdfTextRenderer.setTextVisible(idStr, false);
          }
          return true;
        }
      }

      // Line batching
      if (f._useBatchedRendering && f._geometryFactory.isBatchableType(effectiveNode.type)) {
        const positions = f._geometryFactory.extractLinePositions(effectiveNode);
        if (positions && positions.length >= 6) {
          const color = f._geometryFactory.resolveColor(effectiveNode.color, effectiveNode.layer);
          const lineWidth = f._geometryFactory.resolveLineWidth((effectiveNode as any).lineWeight);
          f._batchedBuilder.addLineSegments(idStr, effectiveNode.layer, color, lineWidth, positions, f._sceneManager.scene);
          f._addSegmentsToSpatialIndex(idStr, positions);
          return true;
        }
      }

      // Individual mesh
      const mesh = f._geometryFactory.createSceneNodeMesh(effectiveNode);
      if (mesh && validateObject3D(mesh)) {
        f._entityStore.setMesh(idStr, mesh);
        f._entityStore.addIndividualEntity(idStr);
        f._addEntityToSpatialIndex(idStr, effectiveNode);
        if (hiddenByLayer || hiddenByNode) mesh.visible = false;
        f._sceneManager.add(mesh);
        return true;
      }
    } catch (_e) { /* skip */ }
    return false;
  },

  _addCloneToScene(this: CadRenderer, newId: string, clone: SceneNode): void {
    const f = this as unknown as CadRendererInternal;
    f._entityStore.addNode(newId, clone);
    f._entityStore.setEntityColor(newId, f._geometryFactory.resolveColor(clone.color, clone.layer));

    const hiddenByLayer = !f._entityStore.isLayerVisible(clone.layer);
    const hiddenByNode = clone.visible === false;
    if (hiddenByLayer || hiddenByNode) {
      f._entityStore.setLogicallyHidden(newId, true);
    }

    if (f._useBatchedRendering && f._geometryFactory.isBatchableType(clone.type)) {
      const positions = f._geometryFactory.extractLinePositions(clone);
      if (positions && positions.length >= 6) {
        const color = f._geometryFactory.resolveColor(clone.color, clone.layer);
        const lineWidth = f._geometryFactory.resolveLineWidth((clone as any).lineWeight);
        f._batchedBuilder.addLineSegments(newId, clone.layer, color, lineWidth, positions, f._sceneManager.scene);
        f._addSegmentsToSpatialIndex(newId, positions);
        f._batchedBuilder.rebuildDirty(f._sceneManager.scene);
        f._requestRender();
        return;
      }
    }

    if (f._useBatchedText && (clone.type === 'text' || clone.type === 'mText')) {
      const added = f._geometryFactory.addTextToBatchedRenderer(newId, clone, clone.layer);
      if (added) {
        if (hiddenByLayer || hiddenByNode) f._sdfTextRenderer.setTextVisible(newId, false);
        f._sdfTextRenderer.sync().then(() => { if (!f._isDisposed) f._requestRender(); });
        return;
      }
    }

    const mesh = f._geometryFactory.createSceneNodeMesh(clone);
    if (mesh && validateObject3D(mesh)) {
      f._entityStore.setMesh(newId, mesh);
      f._entityStore.addIndividualEntity(newId);
      f._addEntityToSpatialIndex(newId, clone);
      if (hiddenByLayer || hiddenByNode) mesh.visible = false;
      f._sceneManager.add(mesh);
    }
    f._requestRender();
  },

  _decimateLwPolylineNode(this: CadRenderer, node: SceneNode): SceneNode {
    return (this as unknown as CadRendererInternal)._geometryFactory.decimateLwPolylineNode(node);
  },

  _addSegmentsToSpatialIndex(this: CadRenderer, entityId: string, positions: number[]): void {
    const f = this as unknown as CadRendererInternal;
    const segments: LineSegment[] = [];
    for (let i = 0; i < positions.length - 5; i += 6) {
      segments.push({
        entityId,
        x1: positions[i], y1: positions[i + 1],
        x2: positions[i + 3], y2: positions[i + 4],
      });
    }
    f._spatialIndex.addSegments(segments);
  },

  _addEntityToSpatialIndex(this: CadRenderer, entityId: string, node: SceneNode): void {
    const f = this as unknown as CadRendererInternal;
    if (node.bbox) {
      f._spatialIndex.addEntity(entityId, node.bbox);
    }
  },

  _rebuildEntityMesh(this: CadRenderer, entityId: string): boolean {
    const f = this as unknown as CadRendererInternal;
    const node = f._entityStore.getNode(entityId);
    if (!node) return false;

    const isSelected = f._selectionManager.isSelected(entityId);

    // 文字：重建 SDF 文字，选中态则重建高亮框
    if (f._useBatchedText && f._sdfTextRenderer.has(entityId)) {
      f._sdfTextRenderer.removeText(entityId);
      const added = f._geometryFactory.addTextToBatchedRenderer(entityId, node, node.layer);
      if (added) {
        if (!f._entityStore.isLayerVisible(node.layer) || node.visible === false) {
          f._sdfTextRenderer.setTextVisible(entityId, false);
        }
        if (isSelected) {
          f._selectionManager.refreshHighlightOverlay(entityId);
        }
        f._sdfTextRenderer.sync().then(() => { if (!f._isDisposed) f._requestRender(); });
        return true;
      }
    }

    // 合批线条：未选中才合批回去；选中的保持独立 mesh 以便高亮
    if (f._batchedBuilder.hasEntity(entityId)) {
      f._batchedBuilder.removeEntity(entityId, f._sceneManager.scene);
      f._spatialIndex.removeEntity(entityId);
      if (f._useBatchedRendering && f._geometryFactory.isBatchableType(node.type) && !isSelected) {
        const positions = f._geometryFactory.extractLinePositions(node);
        if (positions && positions.length >= 6) {
          const color = f._geometryFactory.resolveColor(node.color, node.layer);
          const lineWidth = f._geometryFactory.resolveLineWidth((node as any).lineWeight);
          f._batchedBuilder.addLineSegments(entityId, node.layer, color, lineWidth, positions, f._sceneManager.scene);
          f._addSegmentsToSpatialIndex(entityId, positions);
          f._batchedBuilder.rebuildDirty(f._sceneManager.scene);
          f._batchedBuilder.pruneOrphanedLineSegments(f._sceneManager.scene);
          f._requestRender();
          return true;
        }
      }
      f._batchedBuilder.rebuildDirty(f._sceneManager.scene);
      f._batchedBuilder.pruneOrphanedLineSegments(f._sceneManager.scene);
    }

    // 独立 mesh：移除旧的，重建新的
    const oldMesh = f._entityStore.getMesh(entityId);
    if (oldMesh) {
      f._sceneManager.remove(oldMesh);
      f._entityStore.getAllMeshes().delete(entityId);
      f._entityStore.removeIndividualEntity(entityId);
    }
    f._spatialIndex.removeEntity(entityId);

    const newMesh = f._geometryFactory.createSceneNodeMesh(node);
    if (!newMesh || !validateObject3D(newMesh)) return false;
    f._entityStore.setMesh(entityId, newMesh);
    f._entityStore.addIndividualEntity(entityId);
    f._addEntityToSpatialIndex(entityId, node);
    if (f._entityStore.isLogicallyHidden(entityId) || !f._entityStore.isLayerVisible(node.layer)) {
      newMesh.visible = false;
    }
    f._sceneManager.add(newMesh);
    // 选中态：重新应用高亮材质
    if (isSelected) {
      f._selectionManager.reapplyHighlightForMesh(entityId, newMesh);
    }
    f._requestRender();
    f._batchedBuilder.pruneOrphanedLineSegments(f._sceneManager.scene);
    return true;
  },

  _extractEntityFromBatch(this: CadRenderer, entityId: string): void {
    const f = this as unknown as CadRendererInternal;
    if (!f._batchedBuilder.hasEntity(entityId)) return;
    const node = f._entityStore.getNode(entityId);
    if (!node) return;

    f._batchedBuilder.removeEntity(entityId, f._sceneManager.scene);
    f._spatialIndex.removeEntity(entityId);

    const mesh = f._geometryFactory.createSceneNodeMesh(node);
    if (mesh && validateObject3D(mesh)) {
      f._entityStore.setMesh(entityId, mesh);
      f._entityStore.addIndividualEntity(entityId);
      f._addEntityToSpatialIndex(entityId, node);
      if (f._entityStore.isLogicallyHidden(entityId) || !f._entityStore.isLayerVisible(node.layer)) {
        mesh.visible = false;
      }
      f._sceneManager.add(mesh);
    }
    f._batchedBuilder.rebuildDirty(f._sceneManager.scene);
    f._batchedBuilder.pruneOrphanedLineSegments(f._sceneManager.scene);
  },

  _mergeEntityBackToBatch(this: CadRenderer, entityId: string): void {
    const f = this as unknown as CadRendererInternal;
    const node = f._entityStore.getNode(entityId);
    if (!node || !f._geometryFactory.isBatchableType(node.type)) return;
    if (!f._entityStore.isIndividualEntity(entityId)) return;

    const positions = f._geometryFactory.extractLinePositions(node);
    if (!positions || positions.length < 6) return;

    // 移除独立 mesh
    const mesh = f._entityStore.getMesh(entityId);
    if (mesh) {
      f._sceneManager.remove(mesh);
      f._entityStore.getAllMeshes().delete(entityId);
    }
    f._entityStore.removeIndividualEntity(entityId);
    f._spatialIndex.removeEntity(entityId);

    const color = f._geometryFactory.resolveColor(node.color, node.layer);
    const lineWidth = f._geometryFactory.resolveLineWidth((node as any).lineWeight);
    f._batchedBuilder.addLineSegments(entityId, node.layer, color, lineWidth, positions, f._sceneManager.scene);
    f._addSegmentsToSpatialIndex(entityId, positions);
    f._batchedBuilder.rebuildDirty(f._sceneManager.scene);
    f._batchedBuilder.pruneOrphanedLineSegments(f._sceneManager.scene);
  },

  _nextEntityId(this: CadRenderer): string {
    const f = this as unknown as CadRendererInternal;
    let maxId = 0;
    for (const key of f._entityStore.getNodeEntries()) {
      const num = parseInt(key[0], 10);
      if (!isNaN(num) && num > maxId) maxId = num;
    }
    return String(maxId + 1);
  },

  _refreshAllEntityColors(this: CadRenderer): void {
    const f = this as unknown as CadRendererInternal;
    for (const [id, node] of f._entityStore.getNodeEntries()) {
      const newColor = f._geometryFactory.resolveColor(node.color, node.layer);
      f._entityStore.setEntityColor(id, newColor);

      if (f._batchedBuilder.hasEntity(id)) {
        const positions = f._geometryFactory.extractLinePositions(node);
        if (positions && positions.length >= 6) {
          f._batchedBuilder.removeEntity(id, f._sceneManager.scene);
          const lineWidth = f._geometryFactory.resolveLineWidth((node as any).lineWeight);
          f._batchedBuilder.addLineSegments(id, node.layer, newColor, lineWidth, positions, f._sceneManager.scene);
        }
      } else {
        const mesh = f._entityStore.getMesh(id);
        if (mesh && !f._selectionManager.getSelectedEntityIds().includes(id)) {
          mesh.traverse((child) => {
            if (child instanceof Line2) {
              (child.material as LineMaterial).color.copy(newColor);
            } else if ('color' in (child as any).material) {
              ((child as any).material as any).color.copy(newColor);
            }
          });
        }
      }
    }
    f._batchedBuilder.rebuildDirty(f._sceneManager.scene);
    f._requestRender();
  },
};