import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { BatchedLayerBuilder } from '../cad_runtime/batched_layer_builder';
import type { SceneNode, BoundingBox, LayerNode } from '../cad_runtime/scene_node';
import { logger } from '../../../utils/logger';

/**
 * EntityStore — 实体数据层
 *
 * 职责：
 * - entityId → SceneNode 索引
 * - entityId → Object3D 索引
 * - layerName → Set<entityId> 反向索引
 * - 图层定义索引 (Map<string, LayerNode>)
 * - 图层分组 (Map<string, THREE.Group>)
 * - 逻辑隐藏集合 (Set<entityId>)
 * - 材质缓存 (Map<string, LineMaterial>)
 * - 实体 CRUD：add、delete、restore、move、copy
 * - 颜色管理 (Map<entityId, THREE.Color>)
 *
 * 依赖：SceneManager（需要 scene 来 add/remove Object3D）
 */
export class EntityStore {
  private _scene: THREE.Scene;
  private _nodeIndex: Map<string, SceneNode> = new Map();
  private _entityMeshes: Map<string, THREE.Object3D> = new Map();
  private _entityColors: Map<string, THREE.Color> = new Map();
  private _layerIndex: Map<string, LayerNode> = new Map();
  private _layerEntityIndex: Map<string, Set<string>> = new Map();
  private _layerGroups: Map<string, THREE.Group> = new Map();
  private _hiddenLayers: Set<string> = new Set();
  private _logicallyHidden: Set<string> = new Set();
  private _individualEntities: Set<string> = new Set();
  private _lineMaterialCache: Map<string, LineMaterial> = new Map();
  private _batchedBuilder: BatchedLayerBuilder;
  private _blocks: Map<string, any> = new Map(); // CadBlock
  private _documentExtents: { minX: number; minY: number; maxX: number; maxY: number } | null = null;
  private _externalBounds: BoundingBox | null = null;

  private static readonly MAX_MATERIAL_CACHE_SIZE = 500;
  private _nextEntityIdCounter = 0;

  /** 实体被移除时的监听器（物理删除 removeEntity / 逻辑删除均会触发）。 */
  private _entityRemovedListeners: Array<(id: string) => void> = [];

  constructor(scene: THREE.Scene, batchedBuilder: BatchedLayerBuilder) {
    this._scene = scene;
    this._batchedBuilder = batchedBuilder;
  }

  /**
   * 订阅实体移除事件。用于让依赖实体的模块（如 SelectionManager 的高亮框）
   * 在实体消失时自动清理，避免各删除入口遗漏清理逻辑。
   */
  onEntityRemoved(cb: (id: string) => void): void {
    this._entityRemovedListeners.push(cb);
  }

  /** 通知所有监听器某实体已被移除（物理或逻辑删除均应调用）。 */
  notifyEntityRemoved(id: string): void {
    for (const cb of this._entityRemovedListeners) {
      try { cb(id); } catch { /* 单个监听器失败不影响其它 */ }
    }
  }

  // ── Node 索引 ──

  getNode(id: string): SceneNode | undefined {
    return this._nodeIndex.get(id);
  }

  getAllNodes(): SceneNode[] {
    return Array.from(this._nodeIndex.values());
  }

  /** 返回 nodeIndex 的迭代器（供 SnapManager 等外部构建索引） */
  getNodeEntries(): IterableIterator<[string, SceneNode]> {
    return this._nodeIndex.entries();
  }

  hasNode(id: string): boolean {
    return this._nodeIndex.has(id);
  }

  /** 返回逻辑隐藏实体集合的只读引用 */
  getLogicallyHiddenSet(): ReadonlySet<string> {
    return this._logicallyHidden;
  }

  /** 返回隐藏图层集合的只读引用 */
  getHiddenLayersSet(): ReadonlySet<string> {
    return this._hiddenLayers;
  }

  getMesh(id: string): THREE.Object3D | undefined {
    return this._entityMeshes.get(id);
  }

  setMesh(id: string, mesh: THREE.Object3D): void {
    this._entityMeshes.set(id, mesh);
  }

  getAllMeshes(): Map<string, THREE.Object3D> {
    return this._entityMeshes;
  }

  // ── 颜色 ──

  getEntityColor(id: string): THREE.Color | undefined {
    return this._entityColors.get(id);
  }

  setEntityColor(id: string, color: THREE.Color): void {
    this._entityColors.set(id, color.clone());
  }

  // ── 图层 ──

  getLayers(): string[] {
    return Array.from(this._layerIndex.keys());
  }

  getLayerNode(name: string): LayerNode | undefined {
    return this._layerIndex.get(name);
  }

  isLayerVisible(name: string): boolean {
    return !this._hiddenLayers.has(name);
  }

  isLayerLocked(name: string): boolean {
    return this._layerIndex.get(name)?.locked ?? false;
  }

  setLayerVisible(name: string, visible: boolean): void {
    if (visible) {
      this._hiddenLayers.delete(name);
    } else {
      this._hiddenLayers.add(name);
    }
    const layer = this._layerIndex.get(name);
    if (layer) {
      layer.visible = visible;
    }
    const group = this._layerGroups.get(name);
    if (group) {
      group.visible = visible;
    }
  }

  setLayerColor(name: string, colorRgb: number): void {
    const layer = this._layerIndex.get(name);
    if (layer) {
      layer.color = colorRgb;
    }
  }

  setLayerLocked(name: string, locked: boolean): void {
    const layer = this._layerIndex.get(name);
    if (layer) {
      layer.locked = locked;
    }
  }

  getLayerEntities(name: string): Set<string> {
    return this._layerEntityIndex.get(name) ?? new Set();
  }

  // ── 逻辑隐藏 ──

  isLogicallyHidden(id: string): boolean {
    return this._logicallyHidden.has(id);
  }

  setLogicallyHidden(id: string, hidden: boolean): void {
    if (hidden) {
      this._logicallyHidden.add(id);
    } else {
      this._logicallyHidden.delete(id);
    }
  }

  // ── Blocks ──

  getBlock(name: string): any | undefined {
    return this._blocks.get(name);
  }

  getBlocks(): Map<string, any> {
    return this._blocks;
  }

  setBlocks(blocks: Map<string, any>): void {
    this._blocks = blocks;
  }

  addBlock(name: string, block: any): void {
    this._blocks.set(name, block);
  }

  // ── Layer registration ──

  addLayer(name: string, layerNode: LayerNode): void {
    this._layerIndex.set(name, layerNode);
    this._ensureLayerGroup(name);
  }

  // ── Node registration ──

  addNode(id: string, node: SceneNode): void {
    this._nodeIndex.set(id, node);
    this._registerEntityInLayer(id, node.layer);
  }

  // ── Bounds ──

  get externalBounds(): BoundingBox | null { return this._externalBounds; }
  setExternalBounds(bb: BoundingBox | null): void { this._externalBounds = bb; }

  get documentExtents() { return this._documentExtents; }
  setDocumentExtents(ext: typeof this._documentExtents): void { this._documentExtents = ext; }

  // ── 材质缓存 ──

  getLineMaterial(key: string): LineMaterial | undefined {
    return this._lineMaterialCache.get(key);
  }

  setLineMaterial(key: string, mat: LineMaterial): void {
    if (this._lineMaterialCache.size >= EntityStore.MAX_MATERIAL_CACHE_SIZE) {
      // 淘汰第一个
      const firstKey = this._lineMaterialCache.keys().next().value;
      if (firstKey) {
        this._lineMaterialCache.get(firstKey)?.dispose();
        this._lineMaterialCache.delete(firstKey);
      }
    }
    this._lineMaterialCache.set(key, mat);
  }

  getLineMaterialCache(): Map<string, LineMaterial> {
    return this._lineMaterialCache;
  }

  // ── BatchedBuilder 代理 ──

  get batchedBuilder(): BatchedLayerBuilder {
    return this._batchedBuilder;
  }

  isIndividualEntity(id: string): boolean {
    return this._individualEntities.has(id);
  }

  addIndividualEntity(id: string): void {
    this._individualEntities.add(id);
  }

  removeIndividualEntity(id: string): void {
    this._individualEntities.delete(id);
  }

  // ── CRUD ──

  /**
   * 注册实体到所有索引
   */
  registerEntity(id: string, node: SceneNode, mesh: THREE.Object3D, color: THREE.Color): void {
    this._nodeIndex.set(id, node);
    this._entityMeshes.set(id, mesh);
    this._entityColors.set(id, color.clone());
    this._registerEntityInLayer(id, node.layer);
    this._addNodeToLayerGroup(node.layer, mesh);
  }

  /**
   * 移除实体（从所有索引和场景中清除）
   */
  removeEntity(id: string): void {
    const node = this._nodeIndex.get(id);
    const mesh = this._entityMeshes.get(id);

    if (mesh) {
      this._removeNodeFromLayerGroup(id);
      this._disposeObject3D(mesh);
    }

    if (node) {
      const entitySet = this._layerEntityIndex.get(node.layer);
      if (entitySet) {
        entitySet.delete(id);
        if (entitySet.size === 0) {
          this._layerEntityIndex.delete(node.layer);
        }
      }
    }

    this._nodeIndex.delete(id);
    this._entityMeshes.delete(id);
    this._entityColors.delete(id);
    this._logicallyHidden.delete(id);
    this._individualEntities.delete(id);

    // 从合批中移除
    this._batchedBuilder.removeEntity(id, this._scene);

    this.notifyEntityRemoved(id);
  }

  /**
   * 清空所有实体
   */
  clearAll(): void {
    for (const [, mesh] of this._entityMeshes) {
      this._disposeObject3D(mesh);
    }
    this._nodeIndex.clear();
    this._entityMeshes.clear();
    this._entityColors.clear();
    this._layerEntityIndex.clear();
    this._logicallyHidden.clear();
    this._individualEntities.clear();

    // 清理图层分组
    for (const group of this._layerGroups.values()) {
      this._scene.remove(group);
    }
    this._layerGroups.clear();

    // 清理合批
    this._batchedBuilder.clear?.(this._scene);

    // 清理材质缓存
    for (const mat of this._lineMaterialCache.values()) {
      mat.dispose();
    }
    this._lineMaterialCache.clear();
  }

  /**
   * 生成下一个 entity ID
   */
  nextEntityId(): string {
    this._nextEntityIdCounter++;
    return String(this._nextEntityIdCounter);
  }

  // ── Private ──

  private _ensureLayerGroup(layerName: string): THREE.Group {
    let group = this._layerGroups.get(layerName);
    if (!group) {
      group = new THREE.Group();
      group.name = `layer_${layerName}`;
      const layer = this._layerIndex.get(layerName);
      if (layer) {
        group.visible = layer.visible && !layer.frozen;
      }
      this._scene.add(group);
      this._layerGroups.set(layerName, group);
    }
    return group;
  }

  private _addNodeToLayerGroup(layerName: string, mesh: THREE.Object3D): void {
    const group = this._ensureLayerGroup(layerName);
    group.add(mesh);
  }

  private _removeNodeFromLayerGroup(entityId: string): void {
    const mesh = this._entityMeshes.get(entityId);
    if (mesh && mesh.parent) {
      mesh.parent.remove(mesh);
    }
  }

  private _registerEntityInLayer(entityId: string, layerName: string): void {
    let set = this._layerEntityIndex.get(layerName);
    if (!set) {
      set = new Set();
      this._layerEntityIndex.set(layerName, set);
    }
    set.add(entityId);
  }

  private _disposeObject3D(obj: THREE.Object3D, disposeMaterial: boolean = true): void {
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof Line2 || child instanceof THREE.LineSegments || child instanceof THREE.Line) {
        if (child.geometry) {
          child.geometry.dispose();
        }
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
  }

  dispose(): void {
    this.clearAll();
    logger.info('EntityStore', 'Disposed');
  }
}
