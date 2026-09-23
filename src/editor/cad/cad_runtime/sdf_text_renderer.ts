import * as THREE from 'three';
import { Text as TroikaText, BatchedText } from 'troika-three-text';

const FONT_URL = '/fonts/SourceHanSansCN-Regular.otf';

export type BoundingBox = { minX: number; minY: number; maxX: number; maxY: number };
export type BboxUpdatedCallback = (bboxes: Map<string, BoundingBox>) => void;

interface TextEntry {
  id: string;
  text: TroikaText;
  layer: string;
  visible: boolean;
  bbox: BoundingBox;
  logicallyHidden: boolean;
}

export class SdfTextRenderer {
  private _batchedText: BatchedText;
  private _entries: Map<string, TextEntry> = new Map();
  private _layerIndex: Map<string, Set<string>> = new Map();
  private _scene: THREE.Scene | null = null;
  private _fontUrl: string = FONT_URL;
  private _needsSync = false;
  private _onBboxesUpdated: BboxUpdatedCallback | null = null;

  constructor() {
    this._batchedText = new BatchedText();
    this._batchedText.font = this._fontUrl;
    this._batchedText.depthTest = false;
    this._batchedText.renderOrder = 1;
    // 标记为持久对象：SceneManager.clearScene() 不会移除它，
    // 避免文档重载时 BatchedText 脱离场景导致文字不可见。
    this._batchedText.userData.__persistent = true;
  }

  addToScene(scene: THREE.Scene): void {
    if (this._scene) {
      this._scene.remove(this._batchedText);
    }
    this._scene = scene;
    scene.add(this._batchedText);
  }

  addText(
    id: string,
    content: string,
    position: { x: number; y: number; z: number },
    fontSize: number,
    color: THREE.Color,
    rotation: number = 0,
    anchorX: string = 'left',
    anchorY: string = 'bottom',
    maxWidth: number | undefined = undefined,
    widthFactor: number = 1.0,
    layer: string = '',
    estimatedWidth: number | undefined = undefined,
  ): void {
    if (this._entries.has(id)) {
      this.removeText(id);
    }

    const text = new TroikaText();
    text.text = content;
    text.font = this._fontUrl;
    text.fontSize = fontSize;
    text.color = color;
    text.anchorX = anchorX;
    text.anchorY = anchorY;
    text.maxWidth = maxWidth;
    text.lineHeight = 1.25;
    text.depthTest = false;
    text.renderOrder = 1;
    text.position.set(position.x, position.y, position.z);
    text.rotation.z = rotation;
    text.scale.set(widthFactor, 1, 1);

    const lines = content.split('\n').length;
    const textWidth = (maxWidth ?? (estimatedWidth ?? fontSize * content.length * 0.6)) * widthFactor;
    const textHeight = fontSize * lines * 1.25;
    const offsetX = anchorX === 'center' ? -textWidth / 2 : anchorX === 'right' ? -textWidth : 0;
    const offsetY = anchorY === 'middle' ? -textHeight / 2 : anchorY === 'top' ? -textHeight : 0;
    const lx0 = offsetX, ly0 = offsetY, lx1 = offsetX + textWidth, ly1 = offsetY + textHeight;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const corners = [
      { x: lx0 * cos - ly0 * sin, y: lx0 * sin + ly0 * cos },
      { x: lx1 * cos - ly0 * sin, y: lx1 * sin + ly0 * cos },
      { x: lx1 * cos - ly1 * sin, y: lx1 * sin + ly1 * cos },
      { x: lx0 * cos - ly1 * sin, y: lx0 * sin + ly1 * cos },
    ];
    const bbox = {
      minX: position.x + Math.min(...corners.map(c => c.x)),
      minY: position.y + Math.min(...corners.map(c => c.y)),
      maxX: position.x + Math.max(...corners.map(c => c.x)),
      maxY: position.y + Math.max(...corners.map(c => c.y)),
    };

    this._entries.set(id, { id, text, layer, visible: true, bbox, logicallyHidden: false });
    if (layer) {
      let layerSet = this._layerIndex.get(layer);
      if (!layerSet) { layerSet = new Set(); this._layerIndex.set(layer, layerSet); }
      layerSet.add(id);
    }
    this._batchedText.addText(text);
    this._needsSync = true;
  }

  removeText(id: string): void {
    const entry = this._entries.get(id);
    if (!entry) return;
    this._batchedText.removeText(entry.text);
    entry.text.dispose();
    this._entries.delete(id);
    if (entry.layer) {
      const layerSet = this._layerIndex.get(entry.layer);
      if (layerSet) {
        layerSet.delete(id);
        if (layerSet.size === 0) this._layerIndex.delete(entry.layer);
      }
    }
    this._needsSync = true;
  }

  removeLayer(layerName: string): void {
    const layerSet = this._layerIndex.get(layerName);
    if (!layerSet) return;
    for (const id of Array.from(layerSet)) {
      this.removeText(id);
    }
    this._layerIndex.delete(layerName);
    this._needsSync = true;
  }

  renameLayer(oldName: string, newName: string): void {
    if (oldName === newName) return;
    const layerSet = this._layerIndex.get(oldName);
    if (layerSet) {
      this._layerIndex.delete(oldName);
      this._layerIndex.set(newName, layerSet);
      for (const id of layerSet) {
        const entry = this._entries.get(id);
        if (entry) entry.layer = newName;
      }
    }
    this._needsSync = true;
  }

  setTextVisible(id: string, visible: boolean): void {
    const entry = this._entries.get(id);
    if (!entry) return;
    if (entry.visible === visible && !entry.logicallyHidden) return;
    entry.visible = visible;
    entry.logicallyHidden = !visible;
    if (visible) {
      this._batchedText.addText(entry.text);
    } else {
      this._batchedText.removeText(entry.text);
    }
    this._needsSync = true;
  }

  setLayerVisible(layerName: string, visible: boolean): void {
    const layerSet = this._layerIndex.get(layerName);
    if (!layerSet) return;
    for (const id of layerSet) {
      const entry = this._entries.get(id);
      if (!entry) continue;
      if (visible && entry.logicallyHidden) continue;
      if (!visible && !entry.visible) continue;
      if (visible) {
        this._batchedText.addText(entry.text);
        entry.visible = true;
      } else {
        this._batchedText.removeText(entry.text);
        entry.visible = false;
      }
    }
    this._needsSync = true;
  }

  applyCulling(viewMinX: number, viewMinY: number, viewMaxX: number, viewMaxY: number, hiddenLayers: Set<string>, logicallyHidden: Set<string>): boolean {
    let changed = false;

    for (const entry of this._entries.values()) {
      const isLayerHidden = hiddenLayers.has(entry.layer);
      const isLogicallyHidden = logicallyHidden.has(entry.id);
      const shouldBeHidden = isLayerHidden || isLogicallyHidden;

      if (shouldBeHidden) {
        if (entry.visible) {
          this._batchedText.removeText(entry.text);
          entry.visible = false;
          changed = true;
        }
        continue;
      }

      const inViewport = entry.bbox.minX <= viewMaxX && entry.bbox.maxX >= viewMinX &&
                         entry.bbox.minY <= viewMaxY && entry.bbox.maxY >= viewMinY;

      if (inViewport) {
        if (!entry.visible) {
          this._batchedText.addText(entry.text);
          entry.visible = true;
          changed = true;
        }
      } else {
        if (entry.visible) {
          this._batchedText.removeText(entry.text);
          entry.visible = false;
          changed = true;
        }
      }
    }

    if (changed) {
      this._needsSync = true;
    }
    return changed;
  }

  sync(): Promise<void> {
    return new Promise((resolve) => {
      this._batchedText.sync(() => {
        this._needsSync = false;
        this._updateBboxesFromRenderInfo();
        if (this._onBboxesUpdated) {
          const bboxes = new Map<string, BoundingBox>();
          for (const [id, entry] of this._entries) {
            bboxes.set(id, { ...entry.bbox });
          }
          this._onBboxesUpdated(bboxes);
        }
        resolve();
      });
    });
  }

  set onBboxesUpdated(callback: BboxUpdatedCallback | null) {
    this._onBboxesUpdated = callback;
  }

  has(id: string): boolean {
    return this._entries.has(id);
  }

  updatePosition(id: string, x: number, y: number): void {
    const entry = this._entries.get(id);
    if (!entry) return;
    const dx = x - entry.text.position.x;
    const dy = y - entry.text.position.y;
    entry.text.position.set(x, y, entry.text.position.z);
    entry.bbox.minX += dx;
    entry.bbox.minY += dy;
    entry.bbox.maxX += dx;
    entry.bbox.maxY += dy;
    this._needsSync = true;
  }

  startDrag(id: string): boolean {
    const entry = this._entries.get(id);
    if (!entry || !this._scene) return false;
    this._batchedText.removeText(entry.text);
    this._scene.add(entry.text);
    entry.text.sync();
    this._needsSync = true;
    return true;
  }

  updateDragPosition(id: string, x: number, y: number): void {
    const entry = this._entries.get(id);
    if (!entry) return;
    entry.text.position.set(x, y, entry.text.position.z);
  }

  endDrag(id: string): boolean {
    const entry = this._entries.get(id);
    if (!entry || !this._scene) return false;
    this._scene.remove(entry.text);
    this._batchedText.addText(entry.text);
    this._needsSync = true;
    return true;
  }

  get size(): number {
    return this._entries.size;
  }

  get needsSync(): boolean {
    return this._needsSync;
  }

  get batchedText(): BatchedText {
    return this._batchedText;
  }

  getEntryLayer(id: string): string | undefined {
    return this._entries.get(id)?.layer;
  }

  pickTextAt(
    worldX: number,
    worldY: number,
    tolerance: number,
    hiddenLayers: Set<string>,
    logicallyHidden: Set<string>,
  ): string | null {
    let closestId: string | null = null;
    let closestDist = Infinity;
    const padSq = tolerance * tolerance;
    for (const entry of this._entries.values()) {
      if (hiddenLayers.has(entry.layer)) continue;
      if (logicallyHidden.has(entry.id)) continue;
      const bb = entry.bbox;
      const cx = Math.max(bb.minX, Math.min(worldX, bb.maxX));
      const cy = Math.max(bb.minY, Math.min(worldY, bb.maxY));
      const dx = worldX - cx;
      const dy = worldY - cy;
      const dist = dx * dx + dy * dy;
      if (dist < closestDist) {
        closestDist = dist;
        closestId = entry.id;
      }
    }
    return closestDist <= padSq ? closestId : null;
  }

  private _updateBboxesFromRenderInfo(): void {
    for (const entry of this._entries.values()) {
      const info = entry.text.textRenderInfo as any;
      if (!info) continue;
      const vb: Float32Array | number[] | undefined = info.visibleBounds;
      if (!vb || vb.length < 4) continue;

      const pos = entry.text.position;
      const rot = entry.text.rotation.z;
      const sx = entry.text.scale.x;
      const sy = entry.text.scale.y;

      const localCorners: [number, number][] = [
        [vb[0] * sx, vb[1] * sy],
        [vb[2] * sx, vb[1] * sy],
        [vb[2] * sx, vb[3] * sy],
        [vb[0] * sx, vb[3] * sy],
      ];

      const cos = Math.cos(rot);
      const sin = Math.sin(rot);

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const [lx, ly] of localCorners) {
        const wx = pos.x + lx * cos - ly * sin;
        const wy = pos.y + lx * sin + ly * cos;
        minX = Math.min(minX, wx);
        minY = Math.min(minY, wy);
        maxX = Math.max(maxX, wx);
        maxY = Math.max(maxY, wy);
      }

      entry.bbox = { minX, minY, maxX, maxY };
    }
  }

  clear(): void {
    for (const entry of this._entries.values()) {
      this._batchedText.removeText(entry.text);
      entry.text.dispose();
    }
    this._entries.clear();
    this._layerIndex.clear();
    this._needsSync = true;
  }

  dispose(): void {
    this.clear();
    this._batchedText.dispose();
    if (this._scene) {
      this._scene.remove(this._batchedText);
      this._scene = null;
    }
  }
}
