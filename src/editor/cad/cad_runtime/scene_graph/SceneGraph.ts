import {
  CadbinReader,
  ChunkDecoder,
  type CadbinHeader,
  type ChunkIndexEntry,
  type SpatialEntry,
  type LayerEntry,
} from '../cadbin_reader';
import type {
  SceneNode,
  LayerNode,
  SymbolDef,
  BoundingBox,
} from '../scene_node';
import { RenderProfile, decodeRenderProfile, decodeComplexFlags } from './renderProfile';
import { decodeChunk } from './chunkDecode';

export class SceneGraph {
  private nodes: Map<number, SceneNode> = new Map();
  private layers: Map<string, LayerNode> = new Map();
  private symbols: Map<string, SymbolDef> = new Map();
  private spatialEntries: SpatialEntry[] = [];
  private header: CadbinHeader | null = null;
  private strings: string[] = [];
  private dirty: boolean = false;
  private selectedIds: Set<number> = new Set();
  private hiddenLayers: Set<string> = new Set();
  private _renderProfile: RenderProfile = RenderProfile.Simple;
  private _complexFlags: number = 0;

  get nodeCount(): number {
    return this.nodes.size;
  }

  get isDirty(): boolean {
    return this.dirty;
  }

  get bounds(): BoundingBox | null {
    if (!this.header) return null;
    return {
      minX: this.header.bounds.minX,
      minY: this.header.bounds.minY,
      maxX: this.header.bounds.maxX,
      maxY: this.header.bounds.maxY,
    };
  }

  get allLayers(): LayerNode[] {
    return Array.from(this.layers.values());
  }

  get allNodes(): SceneNode[] {
    return Array.from(this.nodes.values());
  }

  get renderProfile(): RenderProfile {
    return this._renderProfile;
  }

  get complexFlags(): number {
    return this._complexFlags;
  }

  getNode(id: number): SceneNode | undefined {
    return this.nodes.get(id);
  }

  getLayer(name: string): LayerNode | undefined {
    return this.layers.get(name);
  }

  getSymbol(name: string): SymbolDef | undefined {
    return this.symbols.get(name);
  }

  isSelected(id: number): boolean {
    return this.selectedIds.has(id);
  }

  getSelectedIds(): number[] {
    return Array.from(this.selectedIds);
  }

  isLayerHidden(name: string): boolean {
    return this.hiddenLayers.has(name);
  }

  loadFromCadbin(buffer: ArrayBuffer): void {
    const reader = new CadbinReader(buffer);
    const parsed = reader.parseAll();

    this.header = parsed.header;
    this.strings = parsed.strings;
    this.spatialEntries = parsed.spatialEntries;

    if (this.header) {
      this._renderProfile = decodeRenderProfile(this.header.flags);
      this._complexFlags = decodeComplexFlags(this.header.flags);
    }

    this.buildLayers(parsed.layers);
    this.buildNodes(reader, parsed.chunkIndex);
    this.dirty = false;
  }

  select(id: number): void {
    const node = this.nodes.get(id);
    if (node) {
      node.selected = true;
      this.selectedIds.add(id);
    }
  }

  deselect(id: number): void {
    const node = this.nodes.get(id);
    if (node) {
      node.selected = false;
      this.selectedIds.delete(id);
    }
  }

  selectAll(): void {
    for (const [id, node] of this.nodes) {
      node.selected = true;
      this.selectedIds.add(id);
    }
  }

  clearSelection(): void {
    for (const id of this.selectedIds) {
      const node = this.nodes.get(id);
      if (node) node.selected = false;
    }
    this.selectedIds.clear();
  }

  toggleLayerVisibility(name: string): void {
    if (this.hiddenLayers.has(name)) {
      this.hiddenLayers.delete(name);
    } else {
      this.hiddenLayers.add(name);
    }
    for (const node of this.nodes.values()) {
      if (node.layer === name) {
        node.visible = !this.hiddenLayers.has(name);
      }
    }
  }

  queryViewport(minX: number, minY: number, maxX: number, maxY: number): SceneNode[] {
    const visibleIds = new Set<number>();
    for (const entry of this.spatialEntries) {
      if (entry.minX <= maxX && entry.maxX >= minX && entry.minY <= maxY && entry.maxY >= minY) {
        visibleIds.add(entry.entityId);
      }
    }

    const result: SceneNode[] = [];
    for (const id of visibleIds) {
      const node = this.nodes.get(id);
      if (node && node.visible) {
        result.push(node);
      }
    }
    return result;
  }

  queryByLayer(layerName: string): SceneNode[] {
    const result: SceneNode[] = [];
    for (const node of this.nodes.values()) {
      if (node.layer === layerName && node.visible) {
        result.push(node);
      }
    }
    return result;
  }

  queryByType(type: string): SceneNode[] {
    const result: SceneNode[] = [];
    for (const node of this.nodes.values()) {
      if (node.type === type && node.visible) {
        result.push(node);
      }
    }
    return result;
  }

  markDirty(): void {
    this.dirty = true;
  }

  markClean(): void {
    this.dirty = false;
    for (const node of this.nodes.values()) {
      node.dirty = false;
    }
  }

  getDirtyNodes(): SceneNode[] {
    const result: SceneNode[] = [];
    for (const node of this.nodes.values()) {
      if (node.dirty) {
        result.push(node);
      }
    }
    return result;
  }

  private buildLayers(layerEntries: LayerEntry[]): void {
    this.layers.clear();
    for (const entry of layerEntries) {
      const name = this.strings[entry.nameIdx] || `Layer_${entry.nameIdx}`;
      this.layers.set(name, {
        name,
        color: entry.color,
        visible: (entry.flags & 0x01) !== 0,
        frozen: (entry.flags & 0x02) !== 0,
        locked: (entry.flags & 0x04) !== 0,
        entityCount: 0,
      });
    }
  }

  private buildNodes(reader: CadbinReader, chunkIndex: ChunkIndexEntry[]): void {
    this.nodes.clear();
    const decoder = new ChunkDecoder(this.strings);

    for (const entry of chunkIndex) {
      const chunk = reader.readChunkData(entry);
      for (const node of decodeChunk(decoder, entry.typeTag, chunk.data, entry.entityCount)) {
        this.nodes.set(node.id, node);
      }
    }

    // 把图层 visible/frozen/locked 下推到具体节点，避免渲染器看见的全是 visible:true。
    for (const node of this.nodes.values()) {
      const layer = this.layers.get(node.layer);
      if (layer) {
        node.visible = layer.visible && !layer.frozen;
        if (!layer.visible || layer.frozen) {
          this.hiddenLayers.add(layer.name);
        }
      }
    }

    this.updateLayerEntityCounts();
  }

  private updateLayerEntityCounts(): void {
    for (const layer of this.layers.values()) {
      layer.entityCount = 0;
    }
    for (const node of this.nodes.values()) {
      const layer = this.layers.get(node.layer);
      if (layer) {
        layer.entityCount++;
      }
    }
  }
}