import * as THREE from 'three';
import type { CadDocument } from '../types';
import type { SceneGraph } from '../cad_runtime/scene_graph';
import { RenderProfile } from '../cad_runtime/scene_graph';
import type { SceneNode } from '../cad_runtime/scene_node';
import { validateObject3D, DELETED_LAYER_NAME } from '../rendering/GeometryFactory';
import type { CadRenderer } from './core';
import type { CadRendererInternal } from './internal';

declare module './core' {
  interface CadRenderer {
    /** 加载完整 CAD 文档（含 extents/blocks），并裁剪到文档范围 */
    loadDocument(doc: CadDocument): void;
    /** 从 SceneGraph 加载（按渲染档位分发节点渲染策略） */
    loadFromSceneGraph(sceneGraph: SceneGraph): void;

    _clearEntities(): void;
    _syncTextRenderer(): void;
    _processDeferredNodes(): void;
    _renderNodesSimple(nodes: SceneNode[]): void;
    _renderNodesWithLod(nodes: SceneNode[]): void;
    _renderNodesWithHatchOpt(nodes: SceneNode[]): void;
    _renderNodesWithCoordOpt(nodes: SceneNode[]): void;
    _renderNodesStandard(nodes: SceneNode[]): void;
    _renderNodesHeavy(nodes: SceneNode[]): void;
  }
}

export const sceneGraphMethods = {
  loadDocument(this: CadRenderer, doc: CadDocument): void {
    const f = this as unknown as CadRendererInternal;
    f._clearEntities();
    f._document = doc;

    if (doc.blocks && doc.blocks.length > 0) {
      for (const block of doc.blocks) {
        f._entityStore.addBlock(block.name, block);
      }
    }

    if (doc.extents) {
      const margin = Math.max(doc.extents.max.x - doc.extents.min.x, doc.extents.max.y - doc.extents.min.y) * 0.05;
      f._documentExtents = {
        minX: doc.extents.min.x - margin, minY: doc.extents.min.y - margin,
        maxX: doc.extents.max.x + margin, maxY: doc.extents.max.y + margin,
      };
      f._clippingPlanes = [
        new THREE.Plane(new THREE.Vector3(1, 0, 0), -(f._documentExtents.minX)),
        new THREE.Plane(new THREE.Vector3(-1, 0, 0), f._documentExtents.maxX),
        new THREE.Plane(new THREE.Vector3(0, 1, 0), -(f._documentExtents.minY)),
        new THREE.Plane(new THREE.Vector3(0, -1, 0), f._documentExtents.maxY),
      ];
      f._geometryFactory.setClippingPlanes(f._clippingPlanes);
      f._sceneManager.renderer.localClippingEnabled = true;
    } else {
      f._documentExtents = null;
      f._clippingPlanes = [];
      f._sceneManager.renderer.localClippingEnabled = false;
    }

    for (const entity of doc.entities) {
      try {
        const mesh = f._geometryFactory.createEntityMesh(entity);
        if (mesh && validateObject3D(mesh)) {
          f._entityStore.setMesh(entity.id, mesh);
          if (!f._entityStore.isLayerVisible(entity.layer)) {
            mesh.visible = false;
          }
          f._sceneManager.add(mesh);
        }
      } catch (_e) { /* skip invalid */ }
    }

    f._fitToView();
    f._setupGPUPicking();
    f._requestRender();
  },

  loadFromSceneGraph(this: CadRenderer, sceneGraph: SceneGraph): void {
    const f = this as unknown as CadRendererInternal;
    f._clearEntities();
    f._document = null;
    f._externalBounds = sceneGraph.bounds;
    f._renderProfile = sceneGraph.renderProfile;
    f._complexFlags = sceneGraph.complexFlags;

    if (sceneGraph.bounds) {
      const maxExtent = Math.max(sceneGraph.bounds.maxX - sceneGraph.bounds.minX, sceneGraph.bounds.maxY - sceneGraph.bounds.minY);
      f._spatialIndex.setCellSize(Math.max(10, maxExtent / 200));
    }

    // Register layers
    for (const layer of sceneGraph.allLayers) {
      f._entityStore.addLayer(layer.name, layer);
      if (!layer.visible || layer.frozen || layer.name === DELETED_LAYER_NAME) {
        f._entityStore.setLayerVisible(layer.name, false);
      }
    }

    const nodes = sceneGraph.allNodes;

    // Dispatch to render profile
    switch (f._renderProfile) {
      case RenderProfile.Light:
      case RenderProfile.Simple:
      default:
        f._renderNodesSimple(nodes);
        break;
      case RenderProfile.Standard:
        f._renderNodesStandard(nodes);
        break;
      case RenderProfile.Heavy:
      case RenderProfile.Mega:
      case RenderProfile.Ultra:
        f._renderNodesHeavy(nodes);
        break;
      case RenderProfile.HeavyLwPolyline:
      case RenderProfile.HeavyEntity:
      case RenderProfile.MediumEntity:
        f._renderNodesWithLod(nodes);
        break;
      case RenderProfile.HeavyHatch:
        f._renderNodesWithHatchOpt(nodes);
        break;
      case RenderProfile.LargeCoordinates:
        f._renderNodesWithCoordOpt(nodes);
        break;
      case RenderProfile.Complex:
        f._renderNodesWithLod(nodes);
        break;
    }

    if (!f._isProgressiveLoading) {
      f._batchedBuilder.rebuildAll(f._sceneManager.scene);
      if (f._sdfTextRenderer.needsSync) {
        f._sdfTextRenderer.sync().then(() => { if (!f._isDisposed) f._requestRender(); });
      }
      f._fitToView();
      f._viewportCuller.schedule();
      f._requestRender();
    }
    f._cameraController.emitCameraChanged();
  },

  _renderNodesSimple(this: CadRenderer, nodes: SceneNode[]): void {
    const f = this as unknown as CadRendererInternal;
    for (const node of nodes) {
      if (node.layer === DELETED_LAYER_NAME) continue;
      f._addNodeToScene(node);
    }
    f._syncTextRenderer();
  },

  _renderNodesWithLod(this: CadRenderer, nodes: SceneNode[]): void {
    const f = this as unknown as CadRendererInternal;
    for (const node of nodes) {
      if (node.layer === DELETED_LAYER_NAME) continue;
      f._addNodeToScene(node, true);
    }
    f._syncTextRenderer();
  },

  _renderNodesWithHatchOpt(this: CadRenderer, nodes: SceneNode[]): void {
    const f = this as unknown as CadRendererInternal;
    for (const node of nodes) {
      if (node.layer === DELETED_LAYER_NAME) continue;
      if (node.type === 'hatch') {
        const h = node as any;
        const boundaries = h.boundaries ?? [];
        const totalV = boundaries.reduce((s: number, b: any[]) => s + b.length, 0);
        if (boundaries.some((b: any[]) => b.length > 100) || boundaries.length > 50 || totalV > 500) continue;
      }
      f._addNodeToScene(node);
    }
    f._syncTextRenderer();
  },

  _renderNodesWithCoordOpt(this: CadRenderer, nodes: SceneNode[]): void {
    (this as unknown as CadRendererInternal)._renderNodesWithLod(nodes);
  },

  _renderNodesStandard(this: CadRenderer, nodes: SceneNode[]): void {
    const f = this as unknown as CadRendererInternal;
    const FLAG_HEAVY_LWPOLY = 0b0010;
    const FLAG_MEDIUM_ENTITY = 0b100000;
    const enableDecimation = (f._complexFlags & FLAG_HEAVY_LWPOLY) !== 0;
    for (const node of nodes) {
      if (node.layer === DELETED_LAYER_NAME) continue;
      if ((f._complexFlags & FLAG_MEDIUM_ENTITY) && (node.type === 'text' || node.type === 'mText')) {
        if ((node as any).height !== undefined && (node as any).height < 0.5) continue;
      }
      f._addNodeToScene(node, enableDecimation);
    }
    f._syncTextRenderer();
  },

  _renderNodesHeavy(this: CadRenderer, nodes: SceneNode[]): void {
    const f = this as unknown as CadRendererInternal;
    f._isProgressiveLoading = true;
    f._deferredNodes = [];
    const FLAG_HEAVY_HATCH = 0b0100;
    for (const node of nodes) {
      if (node.layer === DELETED_LAYER_NAME) continue;
      if ((f._complexFlags & FLAG_HEAVY_HATCH) && node.type === 'hatch') {
        f._deferredNodes.push(node);
        continue;
      }
      f._addNodeToScene(node);
    }
    f._syncTextRenderer();
    // Schedule deferred processing
    if (f._deferredNodes.length > 0) {
      f._requestRender();
    }
  },

  _processDeferredNodes(this: CadRenderer): void {
    const f = this as unknown as CadRendererInternal;
    const batch = f._deferredNodes.splice(0, 50);
    for (const node of batch) {
      f._addNodeToScene(node);
    }
    f._batchedBuilder.rebuildDirty(f._sceneManager.scene);
    f._syncTextRenderer();
    f._requestRender();
  },

  _syncTextRenderer(this: CadRenderer): void {
    const f = this as unknown as CadRendererInternal;
    if (f._sdfTextRenderer.needsSync) {
      f._sdfTextRenderer.sync().then(() => { if (!f._isDisposed) f._requestRender(); });
    }
  },

  _clearEntities(this: CadRenderer): void {
    const f = this as unknown as CadRendererInternal;
    // Clear all rendering state
    f._entityStore.clearAll();
    f._batchedBuilder.clear(f._sceneManager.scene);
    f._sdfTextRenderer.clear();
    f._spatialIndex.clear();
    f._selectionManager.deselectAll();
    f._isProgressiveLoading = false;
    f._deferredNodes = [];
    if (f._deferredTimer !== null) {
      clearTimeout(f._deferredTimer);
      f._deferredTimer = null;
    }
    f._sceneManager.clearScene();
    // clearScene() 会移除 scene 中所有 children（含 SDF 文字的 BatchedText）。
    // batchedBuilder 会在 rebuildAll 时重新 add，但 SDF 文字不会，必须在此重新挂回，
    // 否则后续 addText 的文字都挂在脱离 scene 的 BatchedText 上，永远渲染不出来。
    f._sdfTextRenderer.addToScene(f._sceneManager.scene);
  },
};