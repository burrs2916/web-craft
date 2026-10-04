import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import type { SceneNode } from '../../cad_runtime/scene_node';
import type { InteractionController } from './core';
import type { InteractionControllerInternal } from './internal';

declare module './core' {
  interface InteractionController {
    _handleSnap(e: MouseEvent): void;
    _showSnapMarker(worldX: number, worldY: number, type: string): void;
    _clearSnapMarker(): void;
    _buildNodeIndex(): Map<string, SceneNode>;
    _buildEntityLayers(): Map<string, string>;
    _buildHiddenSet(): Set<string>;
    _disposeObject3D(obj: THREE.Object3D, disposeMaterial?: boolean): void;
  }
}

/**
 * 捕捉集成：向 SnapManager 提供节点索引/图层/隐藏集合，绘制与清理捕捉标记。
 * 原 InteractionController 的 `_handleSnap` / `_showSnapMarker` / `_clearSnapMarker`
 * 以及辅助索引构建、Object3D 释放逻辑保持不变。
 */
export const snapMethods = {
  _handleSnap(this: InteractionController, e: MouseEvent): void {
    const f = this as unknown as InteractionControllerInternal;
    if (!f._snapManager) return;
    const canvas = f._sceneManager.canvas;
    const camera = f._cameraController.camera;

    f._snapManager.setNodeIndex(f._buildNodeIndex());
    f._snapManager.setEntityLayers(f._buildEntityLayers());
    f._snapManager.setHiddenLayers(f._buildHiddenSet());

    const rect = canvas.getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;
    const snapPoint = f._snapManager.findSnapPoint(
      canvasX, canvasY,
      camera,
      rect.width, rect.height,
    );

    f._clearSnapMarker();

    if (snapPoint) {
      f._lastSnapPoint = { x: snapPoint.x, y: snapPoint.y };
      f._showSnapMarker(snapPoint.x, snapPoint.y, snapPoint.type);
    } else {
      f._lastSnapPoint = null;
    }
  },

  _showSnapMarker(this: InteractionController, worldX: number, worldY: number, type: string): void {
    const f = this as unknown as InteractionControllerInternal;
    const scene = f._sceneManager.scene;
    const camera = f._cameraController.camera;
    const canvasW = f._sceneManager.width;
    const size = (camera.right - camera.left) / canvasW * 8;
    const color = type === 'endpoint' ? 0x00ff00 : type === 'midpoint' ? 0x00ffff : 0xff00ff;
    const geometry = new THREE.BufferGeometry();
    const verts: number[] = [];
    if (type === 'endpoint') {
      verts.push(worldX - size, worldY, 0.1, worldX + size, worldY, 0.1);
      verts.push(worldX, worldY - size, 0.1, worldX, worldY + size, 0.1);
    } else if (type === 'midpoint') {
      verts.push(worldX - size, worldY - size, 0.1, worldX + size, worldY + size, 0.1);
      verts.push(worldX + size, worldY - size, 0.1, worldX - size, worldY + size, 0.1);
    } else {
      const segs = 16;
      for (let i = 0; i < segs; i++) {
        const a1 = (i / segs) * Math.PI * 2;
        const a2 = ((i + 1) / segs) * Math.PI * 2;
        verts.push(worldX + Math.cos(a1) * size, worldY + Math.sin(a1) * size, 0.1);
        verts.push(worldX + Math.cos(a2) * size, worldY + Math.sin(a2) * size, 0.1);
      }
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
    const material = new THREE.LineBasicMaterial({ color, linewidth: 2, depthTest: false });
    const lines = new THREE.LineSegments(geometry, material);
    lines.renderOrder = 9999;
    scene.add(lines);
    f._snapMarker = lines;
    f._onRequestRender();
  },

  _clearSnapMarker(this: InteractionController): void {
    const f = this as unknown as InteractionControllerInternal;
    if (f._snapMarker) {
      f._sceneManager.scene.remove(f._snapMarker);
      f._disposeObject3D(f._snapMarker);
      f._snapMarker = null;
    }
  },

  _buildNodeIndex(this: InteractionController): Map<string, SceneNode> {
    const f = this as unknown as InteractionControllerInternal;
    return new Map(f._entityStore.getNodeEntries());
  },

  _buildEntityLayers(this: InteractionController): Map<string, string> {
    const f = this as unknown as InteractionControllerInternal;
    const map = new Map<string, string>();
    for (const [id, node] of f._entityStore.getNodeEntries()) {
      map.set(id, node.layer);
    }
    return map;
  },

  _buildHiddenSet(this: InteractionController): Set<string> {
    const f = this as unknown as InteractionControllerInternal;
    return new Set(f._entityStore.getLogicallyHiddenSet());
  },

  _disposeObject3D(this: InteractionController, obj: THREE.Object3D, disposeMaterial: boolean = true): void {
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments || child instanceof THREE.Line || child instanceof Line2) {
        if (child.geometry) child.geometry.dispose();
        if (disposeMaterial) {
          const mat = child.material;
          if (Array.isArray(mat)) {
            mat.forEach(m => m.dispose());
          } else if (mat) {
            mat.dispose();
          }
        }
      }
    });
  },
};