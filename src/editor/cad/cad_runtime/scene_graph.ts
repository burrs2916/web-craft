import {
  CadbinReader,
  ChunkDecoder,
  CHUNK_TAG_LINE,
  CHUNK_TAG_CIRCLE,
  CHUNK_TAG_ARC,
  CHUNK_TAG_ELLIPSE,
  CHUNK_TAG_LWPOLYLINE,
  CHUNK_TAG_POLYLINE,
  CHUNK_TAG_SPLINE,
  CHUNK_TAG_TEXT,
  CHUNK_TAG_MTEXT,
  CHUNK_TAG_SOLID,
  CHUNK_TAG_POINT,
  CHUNK_TAG_INSERT,
  CHUNK_TAG_HATCH,
  CHUNK_TAG_DIMENSION,
  type CadbinHeader,
  type ChunkIndexEntry,
  type SpatialEntry,
  type LayerEntry,
} from './cadbin_reader';
import type {
  SceneNode,
  LineNode,
  CircleNode,
  ArcNode,
  EllipseNode,
  LwPolylineNode,
  PolylineNode,
  SplineNode,
  PointNode,
  TextNode,
  MTextNode,
  SolidNode,
  InsertNode,
  HatchNode,
  DimensionNode,
  LayerNode,
  SymbolDef,
  BoundingBox,
} from './scene_node';

function estimateTextWidth(content: string, height: number, widthFactor: number = 1): number {
  const safeHeight = Number.isFinite(height) && height > 0 ? height : 1;
  const safeWidthFactor = Number.isFinite(widthFactor) && widthFactor > 0 ? widthFactor : 1;
  
  // 修复缺陷1：改进字符宽度估算，更准确地反映SourceHanSansCN字体特性
  const maxUnits = content
    .split(/\r?\n|\\P/)
    .reduce((max, line) => {
      const units = Array.from(line).reduce((sum, ch) => {
        const code = ch.charCodeAt(0);
        // 空白字符
        if (/\s/.test(ch)) return sum + 0.35;
        // ASCII范围内的字符
        if (code <= 0x7f) {
          // 数字和字母：约占字高的 0.55-0.65
          if (/[a-zA-Z0-9]/.test(ch)) return sum + 0.6;
          // 大多数标点符号：约占字高的 0.3-0.5
          if (/[.,;:!?'"-]/.test(ch)) return sum + 0.4;
          // 其他ASCII字符：平均 0.5
          return sum + 0.5;
        }
        // CJK字符（中日韩）和其他宽字符：约占字高的 0.9-1.0
        // 对于SourceHanSansCN，大多数CJK字符宽度略小于1个字高
        return sum + 0.95;
      }, 0);
      return Math.max(max, units);
    }, 0);
  return Math.max(safeHeight, Math.max(1, maxUnits) * safeHeight * safeWidthFactor);
}

function anchoredTextBbox(
  posX: number,
  posY: number,
  width: number,
  height: number,
  rotation: number,
  col: number,
  row: number,
): BoundingBox {
  const w = Math.max(Math.abs(width), 1e-6);
  const h = Math.max(Math.abs(height), 1e-6);
  const [minLocalX, maxLocalX] = col === 1 ? [-w / 2, w / 2] : col === 2 ? [-w, 0] : [0, w];
  const [minLocalY, maxLocalY] = row === 0 ? [-h, 0] : row === 1 ? [-h / 2, h / 2] : [0, h];
  const cos = Math.cos(Number.isFinite(rotation) ? rotation : 0);
  const sin = Math.sin(Number.isFinite(rotation) ? rotation : 0);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const [x, y] of [
    [minLocalX, minLocalY],
    [minLocalX, maxLocalY],
    [maxLocalX, minLocalY],
    [maxLocalX, maxLocalY],
  ]) {
    const rx = posX + x * cos - y * sin;
    const ry = posY + x * sin + y * cos;
    minX = Math.min(minX, rx);
    minY = Math.min(minY, ry);
    maxX = Math.max(maxX, rx);
    maxY = Math.max(maxY, ry);
  }

  return { minX, minY, maxX, maxY };
}

function textNodeBbox(
  posX: number,
  posY: number,
  height: number,
  rotation: number,
  horizontalAlignment: number,
  verticalAlignment: number,
  content: string,
): BoundingBox {
  const width = estimateTextWidth(content, height, 1);
  const col = horizontalAlignment === 1 || horizontalAlignment === 4 ? 1 : horizontalAlignment === 2 || horizontalAlignment === 3 || horizontalAlignment === 5 ? 2 : 0;
  const row = verticalAlignment === 3 ? 0 : verticalAlignment === 2 ? 1 : 2;
  return anchoredTextBbox(posX, posY, width, height, rotation, col, row);
}

function mTextNodeBbox(
  posX: number,
  posY: number,
  height: number,
  width: number,
  rotation: number,
  attachmentPoint: number,
  widthFactor: number,
  heightScale: number,
  content: string,
): BoundingBox {
  const effectiveHeight = Math.max(Math.abs(height * (heightScale > 0 ? heightScale : 1)), 1e-6);
  const estimatedWidth = estimateTextWidth(content, effectiveHeight, widthFactor);
  const blockWidth = width > 0 && Number.isFinite(width) ? Math.abs(width) : estimatedWidth;
  const lineCount = Math.max(1, content.split(/\r?\n|\\P/).filter(Boolean).length);
  const blockHeight = effectiveHeight * lineCount * 1.25;
  const ap = Math.max(1, Math.min(9, Math.floor(attachmentPoint || 1)));
  const col = (ap - 1) % 3;
  const row = Math.floor((ap - 1) / 3);
  return anchoredTextBbox(posX, posY, blockWidth, blockHeight, rotation, col, row);
}

export enum RenderProfile {
  Simple = 0,
  LargeCoordinates = 1,
  HeavyLwPolyline = 2,
  HeavyHatch = 3,
  Complex = 4,
  Unparseable = 5,
  HeavyEntity = 6,
  MediumEntity = 7,
  Light = 8,
  Standard = 9,
  Heavy = 10,
  Mega = 11,
  Ultra = 12,
}

export function decodeRenderProfile(flags: number): RenderProfile {
  const profileType = flags & 0x0F;
  switch (profileType) {
    case 0: return RenderProfile.Simple;
    case 1: return RenderProfile.LargeCoordinates;
    case 2: return RenderProfile.HeavyLwPolyline;
    case 3: return RenderProfile.HeavyHatch;
    case 4: return RenderProfile.Complex;
    case 5: return RenderProfile.Unparseable;
    case 6: return RenderProfile.HeavyEntity;
    case 7: return RenderProfile.MediumEntity;
    case 8: return RenderProfile.Light;
    case 9: return RenderProfile.Standard;
    case 10: return RenderProfile.Heavy;
    case 11: return RenderProfile.Mega;
    case 12: return RenderProfile.Ultra;
    default: return RenderProfile.Simple;
  }
}

export function decodeComplexFlags(flags: number): number {
  return (flags >> 4) & 0xFF;
}

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
      this.decodeChunk(decoder, entry.typeTag, chunk.data, entry.entityCount);
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

  private decodeChunk(decoder: ChunkDecoder, tag: number, data: DataView, count: number): void {
    switch (tag) {
      case CHUNK_TAG_LINE: {
        const items = decoder.decodeLines(data, count);
        for (const item of items) {
          const node: LineNode = {
            id: item.id,
            type: 'line',
            layer: item.layer,
            color: item.color,
            visible: true,
            selected: false,
            dirty: false,
            bbox: {
              minX: Math.min(item.startX, item.endX),
              minY: Math.min(item.startY, item.endY),
              maxX: Math.max(item.startX, item.endX),
              maxY: Math.max(item.startY, item.endY),
            },
            startX: item.startX,
            startY: item.startY,
            endX: item.endX,
            endY: item.endY,
            lineWeight: item.lineWeight,
          };
          this.nodes.set(node.id, node);
        }
        break;
      }
      case CHUNK_TAG_CIRCLE: {
        const items = decoder.decodeCircles(data, count);
        for (const item of items) {
          const node: CircleNode = {
            id: item.id,
            type: 'circle',
            layer: item.layer,
            color: item.color,
            visible: true,
            selected: false,
            dirty: false,
            bbox: {
              minX: item.centerX - item.radius,
              minY: item.centerY - item.radius,
              maxX: item.centerX + item.radius,
              maxY: item.centerY + item.radius,
            },
            centerX: item.centerX,
            centerY: item.centerY,
            radius: item.radius,
            lineWeight: item.lineWeight,
          };
          this.nodes.set(node.id, node);
        }
        break;
      }
      case CHUNK_TAG_ARC: {
        const items = decoder.decodeArcs(data, count);
        for (const item of items) {
          const node: ArcNode = {
            id: item.id,
            type: 'arc',
            layer: item.layer,
            color: item.color,
            visible: true,
            selected: false,
            dirty: false,
            bbox: {
              minX: item.centerX - item.radius,
              minY: item.centerY - item.radius,
              maxX: item.centerX + item.radius,
              maxY: item.centerY + item.radius,
            },
            centerX: item.centerX,
            centerY: item.centerY,
            radius: item.radius,
            startAngle: item.startAngle,
            endAngle: item.endAngle,
            lineWeight: item.lineWeight,
          };
          this.nodes.set(node.id, node);
        }
        break;
      }
      case CHUNK_TAG_POINT: {
        const items = decoder.decodePoints(data, count);
        for (const item of items) {
          const node: PointNode = {
            id: item.id,
            type: 'point',
            layer: item.layer,
            color: item.color,
            visible: true,
            selected: false,
            dirty: false,
            bbox: {
              minX: item.posX - 1,
              minY: item.posY - 1,
              maxX: item.posX + 1,
              maxY: item.posY + 1,
            },
            posX: item.posX,
            posY: item.posY,
          };
          this.nodes.set(node.id, node);
        }
        break;
      }
      case CHUNK_TAG_TEXT: {
        const items = decoder.decodeTexts(data, count);
        for (const item of items) {
          const node: TextNode = {
            id: item.id,
            type: 'text',
            layer: item.layer,
            color: item.color,
            visible: true,
            selected: false,
            dirty: false,
            bbox: textNodeBbox(
              item.posX,
              item.posY,
              item.height,
              item.rotation,
              item.horizontalAlignment,
              item.verticalAlignment,
              item.content,
            ),
            posX: item.posX,
            posY: item.posY,
            height: item.height,
            rotation: item.rotation,
            horizontalAlignment: item.horizontalAlignment,
            verticalAlignment: item.verticalAlignment,
            content: item.content,
          };
          this.nodes.set(node.id, node);
        }
        break;
      }
      case CHUNK_TAG_MTEXT: {
        const items = decoder.decodeMTexts(data, count);
        for (const item of items) {
          const node: MTextNode = {
            id: item.id,
            type: 'mText',
            layer: item.layer,
            color: item.color,
            visible: true,
            selected: false,
            dirty: false,
            bbox: mTextNodeBbox(
              item.posX,
              item.posY,
              item.height,
              item.width,
              item.rotation,
              item.attachmentPoint,
              item.widthFactor,
              item.heightScale,
              item.content,
            ),
            posX: item.posX,
            posY: item.posY,
            height: item.height,
            width: item.width,
            rotation: item.rotation,
            attachmentPoint: item.attachmentPoint,
            widthFactor: item.widthFactor,
            heightScale: item.heightScale,
            fontName: item.fontName,
            content: item.content,
          };
          this.nodes.set(node.id, node);
        }
        break;
      }
      case CHUNK_TAG_INSERT: {
        const items = decoder.decodeInserts(data, count);
        for (const item of items) {
          const node: InsertNode = {
            id: item.id,
            type: 'insert',
            layer: item.layer,
            color: item.color,
            visible: true,
            selected: false,
            dirty: false,
            bbox: {
              minX: item.posX - 10,
              minY: item.posY - 10,
              maxX: item.posX + 10,
              maxY: item.posY + 10,
            },
            posX: item.posX,
            posY: item.posY,
            scaleX: item.scaleX,
            scaleY: item.scaleY,
            rotation: item.rotation,
            blockName: item.blockName,
          };
          this.nodes.set(node.id, node);
        }
        break;
      }
      case CHUNK_TAG_ELLIPSE: {
        const items = decoder.decodeEllipses(data, count);
        for (const item of items) {
          const majorLen = Math.sqrt(item.majorX * item.majorX + item.majorY * item.majorY);
          const minorLen = majorLen * item.minorRatio;
          const node: EllipseNode = {
            id: item.id,
            type: 'ellipse',
            layer: item.layer,
            color: item.color,
            visible: true,
            selected: false,
            dirty: false,
            bbox: {
              minX: item.centerX - majorLen,
              minY: item.centerY - minorLen,
              maxX: item.centerX + majorLen,
              maxY: item.centerY + minorLen,
            },
            centerX: item.centerX,
            centerY: item.centerY,
            majorX: item.majorX,
            majorY: item.majorY,
            minorRatio: item.minorRatio,
            startAngle: item.startAngle,
            endAngle: item.endAngle,
            lineWeight: item.lineWeight,
          };
          this.nodes.set(node.id, node);
        }
        break;
      }
      case CHUNK_TAG_LWPOLYLINE: {
        const items = decoder.decodeLwPolylines(data, count);
        for (const item of items) {
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const v of item.vertices) {
            minX = Math.min(minX, v.x);
            minY = Math.min(minY, v.y);
            maxX = Math.max(maxX, v.x);
            maxY = Math.max(maxY, v.y);
          }
          if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 1; maxY = 1; }
          const node: LwPolylineNode = {
            id: item.id,
            type: 'lwPolyline',
            layer: item.layer,
            color: item.color,
            visible: true,
            selected: false,
            dirty: false,
            bbox: { minX, minY, maxX, maxY },
            vertices: item.vertices,
            closed: item.closed,
            lineWeight: item.lineWeight,
          };
          this.nodes.set(node.id, node);
        }
        break;
      }
      case CHUNK_TAG_POLYLINE: {
        const items = decoder.decodePolylines(data, count);
        for (const item of items) {
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const v of item.vertices) {
            minX = Math.min(minX, v.x);
            minY = Math.min(minY, v.y);
            maxX = Math.max(maxX, v.x);
            maxY = Math.max(maxY, v.y);
          }
          if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 1; maxY = 1; }
          const node: PolylineNode = {
            id: item.id,
            type: 'polyline',
            layer: item.layer,
            color: item.color,
            visible: true,
            selected: false,
            dirty: false,
            bbox: { minX, minY, maxX, maxY },
            vertices: item.vertices,
            closed: item.closed,
            lineWeight: item.lineWeight,
          };
          this.nodes.set(node.id, node);
        }
        break;
      }
      case CHUNK_TAG_SPLINE: {
        const items = decoder.decodeSplines(data, count);
        for (const item of items) {
          const allPts = [...item.controlPoints, ...item.fitPoints];
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const p of allPts) {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
          }
          if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 1; maxY = 1; }
          const node: SplineNode = {
            id: item.id,
            type: 'spline',
            layer: item.layer,
            color: item.color,
            visible: true,
            selected: false,
            dirty: false,
            bbox: { minX, minY, maxX, maxY },
            controlPoints: item.controlPoints,
            fitPoints: item.fitPoints,
            knots: item.knots,
            degree: item.degree,
            lineWeight: item.lineWeight,
          };
          this.nodes.set(node.id, node);
        }
        break;
      }
      case CHUNK_TAG_SOLID: {
        const items = decoder.decodeSolids(data, count);
        for (const item of items) {
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const p of item.points) {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
          }
          if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 1; maxY = 1; }
          const node: SolidNode = {
            id: item.id,
            type: 'solid',
            layer: item.layer,
            color: item.color,
            visible: true,
            selected: false,
            dirty: false,
            bbox: { minX, minY, maxX, maxY },
            points: item.points,
          };
          this.nodes.set(node.id, node);
        }
        break;
      }
      case CHUNK_TAG_HATCH: {
        const items = decoder.decodeHatches(data, count);
        for (const item of items) {
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const path of item.boundaries) {
            for (const v of path) {
              minX = Math.min(minX, v.x);
              minY = Math.min(minY, v.y);
              maxX = Math.max(maxX, v.x);
              maxY = Math.max(maxY, v.y);
            }
          }
          if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 1; maxY = 1; }
          const node: HatchNode = {
            id: item.id,
            type: 'hatch',
            layer: item.layer,
            color: item.color,
            visible: true,
            selected: false,
            dirty: false,
            bbox: { minX, minY, maxX, maxY },
            boundaries: item.boundaries,
            patternName: item.patternName,
            patternType: item.patternType,
            solid: item.solid,
            scale: item.scale,
            angle: item.angle,
            style: item.style,
            patternLines: item.patternLines,
          };
          this.nodes.set(node.id, node);
        }
        break;
      }
      case CHUNK_TAG_DIMENSION: {
        const items = decoder.decodeDimensions(data, count);
        for (const item of items) {
          const minX = Math.min(item.defX, item.midX);
          const minY = Math.min(item.defY, item.midY);
          const maxX = Math.max(item.defX, item.midX);
          const maxY = Math.max(item.defY, item.midY);
          const node: DimensionNode = {
            id: item.id,
            type: 'dimension',
            layer: item.layer,
            color: item.color,
            visible: true,
            selected: false,
            dirty: false,
            bbox: { minX, minY, maxX, maxY },
            defX: item.defX,
            defY: item.defY,
            midX: item.midX,
            midY: item.midY,
            rotation: item.rotation,
            content: item.content,
          };
          this.nodes.set(node.id, node);
        }
        break;
      }
      default:
        break;
    }
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
