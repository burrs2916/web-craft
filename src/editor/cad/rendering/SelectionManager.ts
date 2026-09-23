import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { BoundingBox, SceneNode } from '../cad_runtime/scene_node';
import type { SceneManager } from './SceneManager';
import type { EntityStore } from './EntityStore';
import type { BatchedLayerBuilder } from '../cad_runtime/batched_layer_builder';
import type { SdfTextRenderer } from '../cad_runtime/sdf_text_renderer';
import { GridSpatialIndex } from '../cad_runtime/grid_spatial_index';
import { logger } from '../../../utils/logger';

const HIGHLIGHT_COLOR = new THREE.Color(0x00ff88);

/**
 * SelectionManager — 选择、高亮、框选、GPU 拾取
 *
 * 职责：
 * - 单选/多选/框选实体
 * - 高亮覆盖层（mesh 高亮 + bbox 覆盖框）
 * - GPU 拾取（pickingScene + 颜色编码）
 * - 选中实体原材质保存/恢复
 * - 从合批中提取选中实体 / 合批回退
 *
 * 依赖：SceneManager（pickingScene/渲染）、EntityStore（节点/图层查询）
 */
export class SelectionManager {
  private _sceneManager: SceneManager;
  private _entityStore: EntityStore;
  private _batchedBuilder: BatchedLayerBuilder;
  private _sdfTextRenderer: SdfTextRenderer;
  private _spatialIndex: GridSpatialIndex;

  private _selectedEntityIds: Set<string> = new Set();
  private _selectedOriginalMaterials: Map<string, Map<string, THREE.Material | LineMaterial>> = new Map();
  private _highlightOverlays: Map<string, THREE.Object3D> = new Map();

  // GPU Picking
  private _entityColorMap: Map<number, string> = new Map();
  private _colorEntityMap: Map<string, number> = new Map();
  private _pickingCamera: THREE.OrthographicCamera | null = null;

  // 事件回调
  private _onSelectionChanged: ((entityIds: string[]) => void) | null = null;

  /**
   * 合批提取/回退委托。SelectionManager 自身不依赖 GeometryFactory，
   * 由 CadRenderer 注入复用已验证的重建逻辑：
   * - extract：将实体从合批移除并重建为独立 mesh（选中时需要单独高亮）
   * - merge：将独立 mesh 合批回去（取消选中时）
   * 未注入时回退到内部简化实现。
   */
  private _extractFromBatchDelegate: ((entityId: string) => void) | null = null;
  private _mergeBackToBatchDelegate: ((entityId: string) => void) | null = null;

  constructor(config: {
    sceneManager: SceneManager;
    entityStore: EntityStore;
    batchedBuilder: BatchedLayerBuilder;
    sdfTextRenderer: SdfTextRenderer;
    spatialIndex: GridSpatialIndex;
  }) {
    this._sceneManager = config.sceneManager;
    this._entityStore = config.entityStore;
    this._batchedBuilder = config.batchedBuilder;
    this._sdfTextRenderer = config.sdfTextRenderer;
    this._spatialIndex = config.spatialIndex;

    // 创建 picking camera（与主相机同步由调用方负责）
    const { width: cw, height: ch } = { width: this._sceneManager.width, height: this._sceneManager.height };
    const aspect = (cw || 1) / (ch || 1);
    const frustumSize = 1000;
    this._pickingCamera = new THREE.OrthographicCamera(
      -frustumSize * aspect / 2, frustumSize * aspect / 2,
      frustumSize / 2, -frustumSize / 2,
      0.1, 100000,
    );
    this._pickingCamera.position.set(0, 0, 1000);
    this._pickingCamera.lookAt(0, 0, 0);
  }

  // ── 事件注册 ──

  onSelectionChanged(cb: (entityIds: string[]) => void): void {
    this._onSelectionChanged = cb;
  }

  /** 注入合批提取/回退委托（由 CadRenderer 复用 GeometryFactory 的重建逻辑）。 */
  setBatchDelegates(
    extract: (entityId: string) => void,
    merge: (entityId: string) => void,
  ): void {
    this._extractFromBatchDelegate = extract;
    this._mergeBackToBatchDelegate = merge;
  }

  // ── 选择操作 ──

  selectEntity(entityId: string, additive: boolean = false): void {
    if (!additive) this.deselectAll();
    if (this._selectedEntityIds.has(entityId)) return;

    this._selectedEntityIds.add(entityId);

    const isSdfText = this._sdfTextRenderer.has(entityId);
    if (isSdfText) {
      this._addHighlightOverlay(entityId);
    } else {
      const isBatched = this._batchedBuilder.hasEntity(entityId);
      if (isBatched) {
        if (this._extractFromBatchDelegate) {
          this._extractFromBatchDelegate(entityId);
        } else {
          this._extractFromBatch(entityId);
        }
      }
      const mesh = this._entityStore.getMesh(entityId);
      if (mesh) {
        this._applyHighlightMaterial(entityId, mesh);
      }
    }

    this._sceneManager.requestRender();
  }

  deselectEntity(entityId: string): void {
    if (!this._selectedEntityIds.has(entityId)) return;

    this._removeHighlightOverlay(entityId);

    const matMap = this._selectedOriginalMaterials.get(entityId);
    const mesh = this._entityStore.getMesh(entityId);
    if (mesh && matMap) {
      this._restoreMaterial(mesh, matMap);
    }

    this._selectedEntityIds.delete(entityId);
    this._selectedOriginalMaterials.delete(entityId);

    if (this._mergeBackToBatchDelegate) {
      this._mergeBackToBatchDelegate(entityId);
    } else {
      this._mergeBackToBatch(entityId);
    }
    this._sceneManager.requestRender();
  }

  deselectAll(): void {
    for (const entityId of this._selectedEntityIds) {
      this._removeHighlightOverlay(entityId);
    }

    const ids = Array.from(this._selectedEntityIds);
    for (const entityId of ids) {
      const matMap = this._selectedOriginalMaterials.get(entityId);
      const mesh = this._entityStore.getMesh(entityId);
      if (mesh && matMap) {
        this._restoreMaterial(mesh, matMap);
      }
    }
    this._selectedEntityIds.clear();
    this._selectedOriginalMaterials.clear();

    for (const entityId of ids) {
      if (this._mergeBackToBatchDelegate) {
        this._mergeBackToBatchDelegate(entityId);
      } else {
        this._mergeBackToBatch(entityId);
      }
    }

    this._sceneManager.requestRender();
  }

  getSelectedEntityIds(): string[] {
    return Array.from(this._selectedEntityIds);
  }

  getSelectedEntityId(): string | null {
    const ids = this.getSelectedEntityIds();
    return ids.length > 0 ? ids[0] : null;
  }

  hasSelection(): boolean {
    return this._selectedEntityIds.size > 0;
  }

  isSelected(id: string): boolean {
    return this._selectedEntityIds.has(id);
  }

  selectEntitiesInRect(minX: number, minY: number, maxX: number, maxY: number, additive: boolean = false): string[] {
    if (!additive) this.deselectAll();

    const rect = {
      minX: Math.min(minX, maxX),
      minY: Math.min(minY, maxY),
      maxX: Math.max(minX, maxX),
      maxY: Math.max(minY, maxY),
    };
    const selected: string[] = [];

    const spatialCandidates = this._spatialIndex.queryRect(rect.minX, rect.minY, rect.maxX, rect.maxY);
    const candidateSet = new Set(spatialCandidates);

    for (const node of this._entityStore.getAllNodes()) {
      const id = String(node.id);
      if (!candidateSet.has(id)) {
        if (!this._bboxIntersectsRect(node.bbox, rect)) continue;
      }
      if (this._selectedEntityIds.has(id)) continue;
      if (this._entityStore.isLogicallyHidden(id)) continue;
      if (this._selectionRectHitsNode(rect, node)) {
        this.selectEntity(id, true);
        selected.push(id);
      }
    }

    if (selected.length > 0) {
      this._onSelectionChanged?.(this.getSelectedEntityIds());
    }
    return selected;
  }

  // ── GPU 拾取 ──

  /**
   * 初始化/重建 picking 场景
   */
  rebuildPickingScene(): void {
    const pickingScene = this._sceneManager.pickingScene;
    if (!pickingScene) return;

    // 清空旧的
    while (pickingScene.children.length > 0) {
      const child = pickingScene.children[0];
      pickingScene.remove(child);
      if (child instanceof THREE.Mesh || child instanceof Line2) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
        child.geometry.dispose();
      }
    }
    this._entityColorMap.clear();
    this._colorEntityMap.clear();

    let colorId = 1;
    for (const [entityId, mesh] of this._entityStore.getAllMeshes()) {
      if (!mesh.visible) continue;

      const color = new THREE.Color(colorId);
      this._entityColorMap.set(colorId, entityId);
      this._colorEntityMap.set(entityId, colorId);

      const cloned = mesh.clone();
      cloned.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.material = new THREE.MeshBasicMaterial({ color });
        } else if (child instanceof Line2) {
          child.material = new LineMaterial({
            color, linewidth: 3, worldUnits: false,
            resolution: new THREE.Vector2(this._sceneManager.width, this._sceneManager.height),
          });
        } else if (child instanceof THREE.Line || child instanceof THREE.LineSegments) {
          child.material = new THREE.LineBasicMaterial({ color, linewidth: 3 });
        }
      });

      pickingScene.add(cloned);
      colorId++;
    }
  }

  /**
   * 在指定像素位置拾取实体
   */
  pickAt(x: number, y: number, mainCamera: THREE.OrthographicCamera): string | null {
    if (!this._pickingCamera) return null;

    // 同步 picking camera 到主相机
    this._pickingCamera.position.copy(mainCamera.position);
    this._pickingCamera.rotation.copy(mainCamera.rotation);
    this._pickingCamera.scale.copy(mainCamera.scale);
    this._pickingCamera.left = mainCamera.left;
    this._pickingCamera.right = mainCamera.right;
    this._pickingCamera.top = mainCamera.top;
    this._pickingCamera.bottom = mainCamera.bottom;
    this._pickingCamera.updateProjectionMatrix();

    this._sceneManager.renderPicking(this._pickingCamera);

    const pixelBuffer = this._sceneManager.readPickingPixel(x, y);
    const colorId = (pixelBuffer[0] << 16) | (pixelBuffer[1] << 8) | pixelBuffer[2];

    if (colorId === 0) return null;
    return this._entityColorMap.get(colorId) || null;
  }

  // ── Private：高亮 ──

  private _applyHighlightMaterial(entityId: string, mesh: THREE.Object3D): void {
    const matMap = new Map<string, THREE.Material | LineMaterial>();
    const resolution = this._sceneManager.resolution;

    mesh.traverse((child) => {
      if (child instanceof Line2) {
        const mat = child.material as LineMaterial;
        matMap.set(child.uuid, mat);
        const highlightMat = new LineMaterial({
          color: HIGHLIGHT_COLOR.getHex(),
          linewidth: mat.linewidth + 1,
          resolution,
          worldUnits: false,
        });
        child.material = highlightMat;
      } else if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments || child instanceof THREE.Line) {
        const mat = child.material as THREE.Material;
        matMap.set(child.uuid, mat);
        const highlightMat = mat.clone();
        if ('color' in highlightMat) {
          (highlightMat as any).color = HIGHLIGHT_COLOR.clone();
        }
        child.material = highlightMat;
      }
    });
    this._selectedOriginalMaterials.set(entityId, matMap);
  }

  private _restoreMaterial(mesh: THREE.Object3D, matMap: Map<string, THREE.Material | LineMaterial>): void {
    mesh.traverse((child) => {
      if (matMap.has(child.uuid)) {
        const originalMat = matMap.get(child.uuid)!;
        if (child instanceof Line2) {
          child.material.dispose();
          child.material = originalMat as LineMaterial;
        } else if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments || child instanceof THREE.Line) {
          child.material.dispose();
          child.material = originalMat as THREE.Material;
        }
      }
    });
  }

  private _addHighlightOverlay(entityId: string): void {
    this._removeHighlightOverlay(entityId);

    let bbox = this._spatialIndex.getEntityBbox(entityId);
    if (!bbox) {
      const node = this._entityStore.getNode(entityId);
      if (node?.bbox) bbox = node.bbox;
    }
    if (!bbox) return;

    const { minX, minY, maxX, maxY } = bbox;
    const w = maxX - minX;
    const h = maxY - minY;
    if (w <= 0 && h <= 0) return;
    const pad = Math.max(w, h) * 0.03;
    const x0 = minX - pad, y0 = minY - pad, x1 = maxX + pad, y1 = maxY + pad;

    // 填充层
    const fillGeo = new THREE.BufferGeometry();
    fillGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      x0, y0, -1, x1, y0, -1, x0, y1, -1,
      x1, y0, -1, x1, y1, -1, x0, y1, -1,
    ]), 3));
    const fillMat = new THREE.MeshBasicMaterial({
      color: HIGHLIGHT_COLOR.getHex(),
      transparent: true, opacity: 0.12,
      depthTest: false, depthWrite: false,
      side: THREE.DoubleSide,
    });
    const fill = new THREE.Mesh(fillGeo, fillMat);
    fill.renderOrder = 0;
    fill.userData.__highlightOverlay = entityId;
    this._sceneManager.add(fill);
    this._highlightOverlays.set(entityId, fill);

    // 边框线
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      x0, y0, -0.5, x1, y0, -0.5,
      x1, y0, -0.5, x1, y1, -0.5,
      x1, y1, -0.5, x0, y1, -0.5,
      x0, y1, -0.5, x0, y0, -0.5,
    ]), 3));
    const lineMat = new THREE.LineBasicMaterial({ color: HIGHLIGHT_COLOR.getHex(), linewidth: 2, depthTest: false, depthWrite: false });
    const line = new THREE.LineSegments(lineGeo, lineMat);
    line.renderOrder = 0;
    line.userData.__highlightOverlay = entityId;
    line.userData.__highlightBorder = true;
    this._sceneManager.add(line);
    this._highlightOverlays.set(entityId + '__border', line);
  }

  private _removeHighlightOverlay(entityId: string): void {
    const keys = [entityId, entityId + '__border'];
    for (const key of keys) {
      const overlay = this._highlightOverlays.get(key);
      if (overlay) {
        this._sceneManager.remove(overlay);
        if (overlay instanceof THREE.Mesh) {
          overlay.geometry.dispose();
          if (overlay.material instanceof THREE.Material) overlay.material.dispose();
        } else if (overlay instanceof THREE.LineSegments || overlay instanceof THREE.Line) {
          overlay.geometry.dispose();
          (overlay.material as THREE.Material).dispose();
        }
        this._highlightOverlays.delete(key);
      }
    }
  }

  /** 拖动过程中：平移选中实体的高亮框（填充+边框），使其跟随移动。 */
  setHighlightOverlayOffset(entityId: string, dx: number, dy: number): void {
    const overlay = this._highlightOverlays.get(entityId);
    const border = this._highlightOverlays.get(entityId + '__border');
    if (overlay) overlay.position.set(dx, dy, 0);
    if (border) border.position.set(dx, dy, 0);
  }

  /** 拖动结束：在实体新位置重建高亮框（bbox 已更新时）。 */
  refreshHighlightOverlay(entityId: string): void {
    if (!this._selectedEntityIds.has(entityId)) return;
    this._addHighlightOverlay(entityId);
  }

  /**
   * 实体的独立 mesh 被重建后（如拖动结束 rebuild），若该实体仍处于选中态，
   * 重新应用高亮材质。用于 CadRenderer._rebuildEntityMesh 保持选中态高亮。
   */
  reapplyHighlightForMesh(entityId: string, mesh: THREE.Object3D): void {
    if (!this._selectedEntityIds.has(entityId)) return;
    this._applyHighlightMaterial(entityId, mesh);
  }

  /**
   * 实体被删除时的清理（由 EntityStore.onEntityRemoved 触发）。
   * 实体已不存在，因此只移除高亮框并从选中集合剔除，
   * 不做材质恢复 / 合批回退（那些针对仍存活的实体）。
   */
  notifyEntityRemoved(entityId: string): void {
    if (!this._selectedEntityIds.has(entityId)) {
      // 即便未选中，也确保没有残留 overlay
      this._removeHighlightOverlay(entityId);
      return;
    }
    this._removeHighlightOverlay(entityId);
    this._selectedEntityIds.delete(entityId);
    this._selectedOriginalMaterials.delete(entityId);
    this._sceneManager.requestRender();
    this._onSelectionChanged?.(this.getSelectedEntityIds());
  }

  // ── Private：合批提取/回退 ──

  private _extractFromBatch(entityId: string): void {
    const node = this._entityStore.getNode(entityId);
    if (!node) return;

    const positions = this._extractLinePositions(node);
    if (positions && positions.length >= 6) {
      this._batchedBuilder.removeEntity(entityId, this._sceneManager.scene);
      // 创建独立 mesh 放入 entityMeshes
      // 这里需要 GeometryFactory 来重建 mesh，但 SelectionManager 不应该依赖 GeometryFactory
      // 实际方案：由 Facade 在调用前注入 mesh 创建回调
      // 暂时保留原有行为：提取后 mesh 已从合批移除，需要 Facade 补充
    }
  }

  private _mergeBackToBatch(entityId: string): void {
    const node = this._entityStore.getNode(entityId);
    if (!node) return;

    // 如果实体在 individualEntities 中，尝试合批回去
    if (!this._entityStore.isIndividualEntity(entityId)) return;

    const positions = this._extractLinePositions(node);
    if (positions && positions.length >= 6) {
      const color = this._entityStore.getEntityColor(entityId);
      if (color) {
        const lineWidth = this._resolveLineWidth((node as any).lineWeight);
        this._batchedBuilder.addLineSegments(entityId, node.layer, color, lineWidth, positions, this._sceneManager.scene);
        this._entityStore.addIndividualEntity(entityId); // 标记仍在跟踪
        // 移除独立 mesh
        const mesh = this._entityStore.getMesh(entityId);
        if (mesh) {
          this._sceneManager.remove(mesh);
        }
      }
    }
  }

  private _extractLinePositions(node: SceneNode): number[] | null {
    // 提取线段顶点坐标 — 从 SceneNode 中提取
    // 这个方法在 GeometryFactory 中也有，这里简化处理
    switch (node.type) {
      case 'line':
        return [node.startX, node.startY, 0, node.endX, node.endY, 0];
      case 'circle':
        return this._circlePositions(node.centerX, node.centerY, node.radius, 0, Math.PI * 2);
      case 'arc':
        return this._arcPositions(node.centerX, node.centerY, node.radius, node.startAngle, node.endAngle);
      default:
        return null;
    }
  }

  private _circlePositions(cx: number, cy: number, radius: number, startAngle: number, endAngle: number): number[] | null {
    if (radius <= 0) return null;
    const segments = Math.max(8, Math.min(128, Math.ceil((endAngle - startAngle) * radius / 2)));
    const positions: number[] = [];
    for (let i = 0; i <= segments; i++) {
      const angle = startAngle + (endAngle - startAngle) * (i / segments);
      positions.push(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, 0);
    }
    return positions;
  }

  private _arcPositions(cx: number, cy: number, radius: number, startAngle: number, endAngle: number): number[] | null {
    return this._circlePositions(cx, cy, radius, startAngle, endAngle);
  }

  private _resolveLineWidth(rawLw?: number): number {
    const DEFAULT_LINE_WIDTH = 1.5;
    if (rawLw === undefined || rawLw === null || rawLw <= 0) return DEFAULT_LINE_WIDTH;
    const px = Math.min(rawLw * 2.0, 4);
    return Math.max(0.5, px);
  }

  // ── Private：框选几何检测 ──

  private _selectionRectHitsNode(rect: BoundingBox, node: SceneNode): boolean {
    if (!this._bboxIntersectsRect(node.bbox, rect)) return false;
    switch (node.type) {
      case 'line':
        return this._segmentIntersectsRect(node.startX, node.startY, node.endX, node.endY, rect);
      case 'polyline':
        return this._polylineIntersectsRect(
          node.vertices.map(v => ({ x: v.x, y: v.y })), node.closed, rect,
        );
      case 'lwPolyline':
        return this._polylineIntersectsRect(node.vertices, node.closed, rect);
      case 'spline': {
        const points = node.fitPoints.length > 0 ? node.fitPoints : node.controlPoints;
        return this._polylineIntersectsRect(
          points.map(p => ({ x: p.x, y: p.y })), false, rect,
        );
      }
      default:
        return true;
    }
  }

  private _bboxIntersectsRect(bb: BoundingBox, rect: BoundingBox): boolean {
    return bb.minX <= rect.maxX && bb.maxX >= rect.minX && bb.minY <= rect.maxY && bb.maxY >= rect.minY;
  }

  private _pointInRect(x: number, y: number, rect: BoundingBox): boolean {
    return x >= rect.minX && x <= rect.maxX && y >= rect.minY && y <= rect.maxY;
  }

  private _polylineIntersectsRect(points: Array<{ x: number; y: number }>, closed: boolean, rect: BoundingBox): boolean {
    if (points.length === 0) return false;
    if (points.some(p => this._pointInRect(p.x, p.y, rect))) return true;
    const segmentCount = closed ? points.length : points.length - 1;
    for (let i = 0; i < segmentCount; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      if (this._segmentIntersectsRect(a.x, a.y, b.x, b.y, rect)) return true;
    }
    return false;
  }

  private _segmentIntersectsRect(x1: number, y1: number, x2: number, y2: number, rect: BoundingBox): boolean {
    if (this._pointInRect(x1, y1, rect) || this._pointInRect(x2, y2, rect)) return true;
    const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
    if (maxX < rect.minX || minX > rect.maxX || maxY < rect.minY || minY > rect.maxY) return false;
    return this._segmentsIntersect(x1, y1, x2, y2, rect.minX, rect.minY, rect.maxX, rect.minY)
      || this._segmentsIntersect(x1, y1, x2, y2, rect.maxX, rect.minY, rect.maxX, rect.maxY)
      || this._segmentsIntersect(x1, y1, x2, y2, rect.maxX, rect.maxY, rect.minX, rect.maxY)
      || this._segmentsIntersect(x1, y1, x2, y2, rect.minX, rect.maxY, rect.minX, rect.minY);
  }

  private _segmentsIntersect(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): boolean {
    const d1x = bx - ax, d1y = by - ay;
    const d2x = dx - cx, d2y = dy - cy;
    const denom = d1x * d2y - d1y * d2x;
    if (Math.abs(denom) < 1e-10) return false;
    const t = ((cx - ax) * d2y - (cy - ay) * d2x) / denom;
    const s = ((cx - ax) * d1y - (cy - ay) * d1x) / denom;
    return t >= 0 && t <= 1 && s >= 0 && s <= 1;
  }

  // ── Dispose ──

  dispose(): void {
    for (const [, overlay] of this._highlightOverlays) {
      this._sceneManager.remove(overlay);
      if (overlay instanceof THREE.Mesh || overlay instanceof THREE.LineSegments || overlay instanceof THREE.Line) {
        overlay.geometry.dispose();
        if (overlay.material) {
          if (Array.isArray(overlay.material)) overlay.material.forEach(m => m.dispose());
          else overlay.material.dispose();
        }
      }
    }
    this._highlightOverlays.clear();
    this._selectedEntityIds.clear();
    this._selectedOriginalMaterials.clear();
    this._entityColorMap.clear();
    this._colorEntityMap.clear();
    this._onSelectionChanged = null;

    logger.info('SelectionManager', 'Disposed');
  }
}
