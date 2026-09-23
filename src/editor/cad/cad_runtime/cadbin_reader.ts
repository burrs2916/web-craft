export const CADBIN_MAGIC = [0x43, 0x41, 0x44, 0x42];
/// v4: MTEXT 新增 width_factor(f64), height_scale(f64), font_name(u32 string index)
export const CADBIN_VERSION = 4;
export const FILE_HEADER_SIZE = 128;

function alignTo(pos: number, align: number): number {
  const m = pos % align;
  return m === 0 ? pos : pos + (align - m);
}

export const CHUNK_TAG_LINE = 0x01;
export const CHUNK_TAG_CIRCLE = 0x02;
export const CHUNK_TAG_ARC = 0x03;
export const CHUNK_TAG_ELLIPSE = 0x04;
export const CHUNK_TAG_LWPOLYLINE = 0x05;
export const CHUNK_TAG_POLYLINE = 0x06;
export const CHUNK_TAG_SPLINE = 0x07;
export const CHUNK_TAG_TEXT = 0x08;
export const CHUNK_TAG_MTEXT = 0x09;
export const CHUNK_TAG_SOLID = 0x0a;
export const CHUNK_TAG_POINT = 0x0c;
export const CHUNK_TAG_INSERT = 0x0d;
export const CHUNK_TAG_HATCH = 0x0e;
export const CHUNK_TAG_DIMENSION = 0x0f;

export const LAYER_FLAG_VISIBLE = 0x01;
export const LAYER_FLAG_FROZEN = 0x02;
export const LAYER_FLAG_LOCKED = 0x04;
export const LAYER_FLAG_ON = 0x08;

export interface CadbinHeader {
  version: number;
  flags: number;
  entityCount: number;
  layerCount: number;
  chunkCount: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  offsetRtree: number;
  offsetLayers: number;
  offsetBlocks: number;
  offsetChunks: number;
  offsetStrings: number;
  offsetChunkIndex: number;
}

export interface ChunkIndexEntry {
  typeTag: number;
  entityCount: number;
  offset: number;
  byteSize: number;
}

export interface LayerEntry {
  nameIdx: number;
  color: number;
  lineWeight: number;
  flags: number;
}

export interface BlockDef {
  nameIdx: number;
  baseX: number;
  baseY: number;
  baseZ: number;
  entityStart: number;
  entityCount: number;
}

export interface SpatialEntry {
  entityId: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export class CadbinReader {
  private data: DataView;
  private buffer: ArrayBuffer;

  constructor(buffer: ArrayBuffer) {
    this.buffer = buffer;
    this.data = new DataView(buffer);
  }

  readHeader(): CadbinHeader {
    if (this.buffer.byteLength < FILE_HEADER_SIZE) {
      throw new Error('CadbinReader: data too small for header');
    }

    const magic = [
      this.data.getUint8(0),
      this.data.getUint8(1),
      this.data.getUint8(2),
      this.data.getUint8(3),
    ];
    if (
      magic[0] !== CADBIN_MAGIC[0] ||
      magic[1] !== CADBIN_MAGIC[1] ||
      magic[2] !== CADBIN_MAGIC[2] ||
      magic[3] !== CADBIN_MAGIC[3]
    ) {
      throw new Error('CadbinReader: invalid magic bytes');
    }

    return {
      version: this.data.getUint32(4, true),
      flags: this.data.getUint32(8, true),
      entityCount: this.data.getUint32(12, true),
      layerCount: this.data.getUint16(16, true),
      chunkCount: this.data.getUint16(18, true),
      bounds: {
        minX: this.data.getFloat64(20, true),
        minY: this.data.getFloat64(28, true),
        maxX: this.data.getFloat64(36, true),
        maxY: this.data.getFloat64(44, true),
      },
      offsetRtree: Number(this.data.getBigUint64(52, true)),
      offsetLayers: Number(this.data.getBigUint64(60, true)),
      offsetBlocks: Number(this.data.getBigUint64(68, true)),
      offsetChunks: Number(this.data.getBigUint64(76, true)),
      offsetStrings: Number(this.data.getBigUint64(84, true)),
      offsetChunkIndex: Number(this.data.getBigUint64(92, true)),
    };
  }

  readStringPool(offset: number): string[] {
    const view = this.data;
    let pos = offset;
    const count = view.getUint32(pos, true);
    pos += 4;

    const strings: string[] = new Array(count);
    for (let i = 0; i < count; i++) {
      const len = view.getUint16(pos, true);
      pos += 2;
      const bytes = new Uint8Array(this.buffer, pos, len);
      strings[i] = new TextDecoder().decode(bytes);
      pos += len;
    }
    return strings;
  }

  readLayerTable(offset: number): LayerEntry[] {
    const view = this.data;
    let pos = offset;
    const count = view.getUint16(pos, true);
    pos += 2;

    const layers: LayerEntry[] = new Array(count);
    for (let i = 0; i < count; i++) {
      layers[i] = {
        nameIdx: view.getUint32(pos, true),
        color: view.getUint32(pos + 4, true),
        lineWeight: view.getFloat32(pos + 8, true),
        flags: view.getUint8(pos + 12),
      };
      pos += 13;
    }
    return layers;
  }

  readBlockTable(offset: number): BlockDef[] {
    const view = this.data;
    let pos = offset;
    const count = view.getUint16(pos, true);
    pos += 2;

    const blocks: BlockDef[] = new Array(count);
    for (let i = 0; i < count; i++) {
      blocks[i] = {
        nameIdx: view.getUint32(pos, true),
        baseX: view.getFloat64(pos + 4, true),
        baseY: view.getFloat64(pos + 12, true),
        baseZ: view.getFloat64(pos + 20, true),
        entityStart: view.getUint32(pos + 28, true),
        entityCount: view.getUint32(pos + 32, true),
      };
      pos += 36;
    }
    return blocks;
  }

  readSpatialIndex(offset: number): SpatialEntry[] {
    const view = this.data;
    let pos = offset;
    const count = view.getUint32(pos, true);
    pos += 4;

    const entries: SpatialEntry[] = new Array(count);
    for (let i = 0; i < count; i++) {
      entries[i] = {
        entityId: view.getUint32(pos, true),
        minX: view.getFloat64(pos + 4, true),
        minY: view.getFloat64(pos + 12, true),
        maxX: view.getFloat64(pos + 20, true),
        maxY: view.getFloat64(pos + 28, true),
      };
      pos += 36;
    }
    return entries;
  }

  readChunkIndex(offset: number): ChunkIndexEntry[] {
    const view = this.data;
    let pos = offset;
    const count = view.getUint16(pos, true);
    pos += 2;

    const entries: ChunkIndexEntry[] = new Array(count);
    for (let i = 0; i < count; i++) {
      entries[i] = {
        typeTag: view.getUint8(pos),
        entityCount: view.getUint32(pos + 1, true),
        offset: Number(view.getBigUint64(pos + 5, true)),
        byteSize: Number(view.getBigUint64(pos + 13, true)),
      };
      pos += 21;
    }
    return entries;
  }

  readChunkData(entry: ChunkIndexEntry): { tag: number; count: number; data: DataView } {
    return {
      tag: entry.typeTag,
      count: entry.entityCount,
      data: new DataView(this.buffer, entry.offset, entry.byteSize),
    };
  }

  querySpatialIndex(
    entries: SpatialEntry[],
    minX: number,
    minY: number,
    maxX: number,
    maxY: number
  ): number[] {
    const result: number[] = [];
    for (const e of entries) {
      if (e.minX <= maxX && e.maxX >= minX && e.minY <= maxY && e.maxY >= minY) {
        result.push(e.entityId);
      }
    }
    return result;
  }

  parseAll(): {
    header: CadbinHeader;
    strings: string[];
    layers: LayerEntry[];
    blocks: BlockDef[];
    spatialEntries: SpatialEntry[];
    chunkIndex: ChunkIndexEntry[];
  } {
    const header = this.readHeader();
    const strings = this.readStringPool(header.offsetStrings);
    const layers = this.readLayerTable(header.offsetLayers);
    const blocks = this.readBlockTable(header.offsetBlocks);
    const spatialEntries = this.readSpatialIndex(header.offsetRtree);
    const chunkIndex = this.readChunkIndex(header.offsetChunkIndex);

    return { header, strings, layers, blocks, spatialEntries, chunkIndex };
  }
}

export class ChunkDecoder {
  private strings: string[];

  constructor(strings: string[]) {
    this.strings = strings;
  }

  private getString(idx: number): string {
    return this.strings[idx] || '';
  }

  decodeLines(view: DataView, count: number): Array<{
    id: number;
    layer: string;
    color: number;
    lineWeight: number;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  }> {
    const result: Array<{
      id: number;
      layer: string;
      color: number;
      lineWeight: number;
      startX: number;
      startY: number;
      endX: number;
      endY: number;
    }> = new Array(count);

    let pos = 0;
    const ids = new Uint32Array(count);
    const layers = new Uint32Array(count);
    const colors = new Uint32Array(count);
    const lineWeights = new Float32Array(count);
    const startX = new Float64Array(count);
    const startY = new Float64Array(count);
    const endX = new Float64Array(count);
    const endY = new Float64Array(count);

    for (let i = 0; i < count; i++) ids[i] = view.getUint32(pos + i * 4, true);
    pos += count * 4;
    for (let i = 0; i < count; i++) layers[i] = view.getUint32(pos + i * 4, true);
    pos += count * 4;
    for (let i = 0; i < count; i++) colors[i] = view.getUint32(pos + i * 4, true);
    pos += count * 4;
    for (let i = 0; i < count; i++) lineWeights[i] = view.getFloat32(pos + i * 4, true);
    pos += count * 4;
    for (let i = 0; i < count; i++) startX[i] = view.getFloat64(pos + i * 8, true);
    pos += count * 8;
    for (let i = 0; i < count; i++) startY[i] = view.getFloat64(pos + i * 8, true);
    pos += count * 8;
    for (let i = 0; i < count; i++) endX[i] = view.getFloat64(pos + i * 8, true);
    pos += count * 8;
    for (let i = 0; i < count; i++) endY[i] = view.getFloat64(pos + i * 8, true);

    for (let i = 0; i < count; i++) {
      result[i] = {
        id: ids[i],
        layer: this.getString(layers[i]),
        color: colors[i],
        lineWeight: lineWeights[i],
        startX: startX[i],
        startY: startY[i],
        endX: endX[i],
        endY: endY[i],
      };
    }
    return result;
  }

  decodeCircles(view: DataView, count: number): Array<{
    id: number;
    layer: string;
    color: number;
    lineWeight: number;
    centerX: number;
    centerY: number;
    radius: number;
  }> {
    const result: Array<{
      id: number;
      layer: string;
      color: number;
      lineWeight: number;
      centerX: number;
      centerY: number;
      radius: number;
    }> = new Array(count);

    let pos = 0;
    const ids = new Uint32Array(count);
    const layers = new Uint32Array(count);
    const colors = new Uint32Array(count);
    const lineWeights = new Float32Array(count);
    const centerX = new Float64Array(count);
    const centerY = new Float64Array(count);
    const radii = new Float64Array(count);

    for (let i = 0; i < count; i++) ids[i] = view.getUint32(pos + i * 4, true);
    pos += count * 4;
    for (let i = 0; i < count; i++) layers[i] = view.getUint32(pos + i * 4, true);
    pos += count * 4;
    for (let i = 0; i < count; i++) colors[i] = view.getUint32(pos + i * 4, true);
    pos += count * 4;
    for (let i = 0; i < count; i++) lineWeights[i] = view.getFloat32(pos + i * 4, true);
    pos += count * 4;
    for (let i = 0; i < count; i++) centerX[i] = view.getFloat64(pos + i * 8, true);
    pos += count * 8;
    for (let i = 0; i < count; i++) centerY[i] = view.getFloat64(pos + i * 8, true);
    pos += count * 8;
    for (let i = 0; i < count; i++) radii[i] = view.getFloat64(pos + i * 8, true);

    for (let i = 0; i < count; i++) {
      result[i] = {
        id: ids[i],
        layer: this.getString(layers[i]),
        color: colors[i],
        lineWeight: lineWeights[i],
        centerX: centerX[i],
        centerY: centerY[i],
        radius: radii[i],
      };
    }
    return result;
  }

  decodeArcs(view: DataView, count: number): Array<{
    id: number;
    layer: string;
    color: number;
    lineWeight: number;
    centerX: number;
    centerY: number;
    radius: number;
    startAngle: number;
    endAngle: number;
  }> {
    const result: Array<{
      id: number;
      layer: string;
      color: number;
      lineWeight: number;
      centerX: number;
      centerY: number;
      radius: number;
      startAngle: number;
      endAngle: number;
    }> = new Array(count);

    let pos = 0;
    const ids = new Uint32Array(count);
    const layers = new Uint32Array(count);
    const colors = new Uint32Array(count);
    const lineWeights = new Float32Array(count);
    const centerX = new Float64Array(count);
    const centerY = new Float64Array(count);
    const radii = new Float64Array(count);
    const startAngles = new Float64Array(count);
    const endAngles = new Float64Array(count);

    for (let i = 0; i < count; i++) ids[i] = view.getUint32(pos + i * 4, true);
    pos += count * 4;
    for (let i = 0; i < count; i++) layers[i] = view.getUint32(pos + i * 4, true);
    pos += count * 4;
    for (let i = 0; i < count; i++) colors[i] = view.getUint32(pos + i * 4, true);
    pos += count * 4;
    for (let i = 0; i < count; i++) lineWeights[i] = view.getFloat32(pos + i * 4, true);
    pos += count * 4;
    for (let i = 0; i < count; i++) centerX[i] = view.getFloat64(pos + i * 8, true);
    pos += count * 8;
    for (let i = 0; i < count; i++) centerY[i] = view.getFloat64(pos + i * 8, true);
    pos += count * 8;
    for (let i = 0; i < count; i++) radii[i] = view.getFloat64(pos + i * 8, true);
    pos += count * 8;
    for (let i = 0; i < count; i++) startAngles[i] = view.getFloat64(pos + i * 8, true);
    pos += count * 8;
    for (let i = 0; i < count; i++) endAngles[i] = view.getFloat64(pos + i * 8, true);

    for (let i = 0; i < count; i++) {
      result[i] = {
        id: ids[i],
        layer: this.getString(layers[i]),
        color: colors[i],
        lineWeight: lineWeights[i],
        centerX: centerX[i],
        centerY: centerY[i],
        radius: radii[i],
        startAngle: startAngles[i],
        endAngle: endAngles[i],
      };
    }
    return result;
  }

  decodePoints(view: DataView, count: number): Array<{
    id: number;
    layer: string;
    color: number;
    posX: number;
    posY: number;
  }> {
    const result: Array<{
      id: number;
      layer: string;
      color: number;
      posX: number;
      posY: number;
    }> = new Array(count);

    let pos = 0;
    const ids = new Uint32Array(count);
    const layers = new Uint32Array(count);
    const colors = new Uint32Array(count);
    const posX = new Float64Array(count);
    const posY = new Float64Array(count);

    for (let i = 0; i < count; i++) ids[i] = view.getUint32(pos + i * 4, true);
    pos += count * 4;
    for (let i = 0; i < count; i++) layers[i] = view.getUint32(pos + i * 4, true);
    pos += count * 4;
    for (let i = 0; i < count; i++) colors[i] = view.getUint32(pos + i * 4, true);
    pos += count * 4;
    for (let i = 0; i < count; i++) posX[i] = view.getFloat64(pos + i * 8, true);
    pos += count * 8;
    for (let i = 0; i < count; i++) posY[i] = view.getFloat64(pos + i * 8, true);

    for (let i = 0; i < count; i++) {
      result[i] = {
        id: ids[i],
        layer: this.getString(layers[i]),
        color: colors[i],
        posX: posX[i],
        posY: posY[i],
      };
    }
    return result;
  }

  decodeTexts(view: DataView, count: number): Array<{
    id: number;
    layer: string;
    color: number;
    posX: number;
    posY: number;
    height: number;
    rotation: number;
    horizontalAlignment: number;
    verticalAlignment: number;
    content: string;
  }> {
    const result: Array<{
      id: number;
      layer: string;
      color: number;
      posX: number;
      posY: number;
      height: number;
      rotation: number;
      horizontalAlignment: number;
      verticalAlignment: number;
      content: string;
    }> = new Array(count);

    let pos = 0;
    const ids = new Uint32Array(count);
    const layers = new Uint32Array(count);
    const colors = new Uint32Array(count);
    const posX = new Float64Array(count);
    const posY = new Float64Array(count);
    const heights = new Float64Array(count);
    const rotations = new Float64Array(count);
    const hAligns = new Uint8Array(count);
    const vAligns = new Uint8Array(count);
    const textIndices = new Uint32Array(count);

    for (let i = 0; i < count; i++) ids[i] = view.getUint32(pos + i * 4, true);
    pos += count * 4;
    for (let i = 0; i < count; i++) layers[i] = view.getUint32(pos + i * 4, true);
    pos += count * 4;
    for (let i = 0; i < count; i++) colors[i] = view.getUint32(pos + i * 4, true);
    pos += count * 4;
    for (let i = 0; i < count; i++) posX[i] = view.getFloat64(pos + i * 8, true);
    pos += count * 8;
    for (let i = 0; i < count; i++) posY[i] = view.getFloat64(pos + i * 8, true);
    pos += count * 8;
    for (let i = 0; i < count; i++) heights[i] = view.getFloat64(pos + i * 8, true);
    pos += count * 8;
    for (let i = 0; i < count; i++) rotations[i] = view.getFloat64(pos + i * 8, true);
    pos += count * 8;
    for (let i = 0; i < count; i++) hAligns[i] = view.getUint8(pos + i);
    pos += count;
    for (let i = 0; i < count; i++) vAligns[i] = view.getUint8(pos + i);
    pos += count;
    for (let i = 0; i < count; i++) textIndices[i] = view.getUint32(pos + i * 4, true);

    for (let i = 0; i < count; i++) {
      result[i] = {
        id: ids[i],
        layer: this.getString(layers[i]),
        color: colors[i],
        posX: posX[i],
        posY: posY[i],
        height: heights[i],
        rotation: rotations[i],
        horizontalAlignment: hAligns[i],
        verticalAlignment: vAligns[i],
        content: this.getString(textIndices[i]),
      };
    }
    return result;
  }

  decodeMTexts(view: DataView, count: number): Array<{
    id: number;
    layer: string;
    color: number;
    posX: number;
    posY: number;
    height: number;
    width: number;
    rotation: number;
    attachmentPoint: number;
    widthFactor: number;
    heightScale: number;
    fontName: string;
    content: string;
  }> {
    const result: Array<{
      id: number;
      layer: string;
      color: number;
      posX: number;
      posY: number;
      height: number;
      width: number;
      rotation: number;
      attachmentPoint: number;
      widthFactor: number;
      heightScale: number;
      fontName: string;
      content: string;
    }> = new Array(count);

    let pos = 0;
    const ids = new Uint32Array(count);
    const layers = new Uint32Array(count);
    const colors = new Uint32Array(count);
    const posX = new Float64Array(count);
    const posY = new Float64Array(count);
    const heights = new Float64Array(count);
    const widths = new Float64Array(count);
    const rotations = new Float64Array(count);
    const attachmentPoints = new Uint8Array(count);
    const widthFactors = new Float64Array(count);
    const heightScales = new Float64Array(count);
    const fontIndices = new Uint32Array(count);
    const textIndices = new Uint32Array(count);

    for (let i = 0; i < count; i++) ids[i] = view.getUint32(pos + i * 4, true);
    pos += count * 4;
    for (let i = 0; i < count; i++) layers[i] = view.getUint32(pos + i * 4, true);
    pos += count * 4;
    for (let i = 0; i < count; i++) colors[i] = view.getUint32(pos + i * 4, true);
    pos += count * 4;
    for (let i = 0; i < count; i++) posX[i] = view.getFloat64(pos + i * 8, true);
    pos += count * 8;
    for (let i = 0; i < count; i++) posY[i] = view.getFloat64(pos + i * 8, true);
    pos += count * 8;
    for (let i = 0; i < count; i++) heights[i] = view.getFloat64(pos + i * 8, true);
    pos += count * 8;
    for (let i = 0; i < count; i++) widths[i] = view.getFloat64(pos + i * 8, true);
    pos += count * 8;
    for (let i = 0; i < count; i++) rotations[i] = view.getFloat64(pos + i * 8, true);
    pos += count * 8;
    for (let i = 0; i < count; i++) attachmentPoints[i] = view.getUint8(pos + i);
    pos += count;
    for (let i = 0; i < count; i++) widthFactors[i] = view.getFloat64(pos + i * 8, true);
    pos += count * 8;
    for (let i = 0; i < count; i++) heightScales[i] = view.getFloat64(pos + i * 8, true);
    pos += count * 8;
    pos = alignTo(pos, 4);
    for (let i = 0; i < count; i++) fontIndices[i] = view.getUint32(pos + i * 4, true);
    pos += count * 4;
    for (let i = 0; i < count; i++) textIndices[i] = view.getUint32(pos + i * 4, true);

    for (let i = 0; i < count; i++) {
      result[i] = {
        id: ids[i],
        layer: this.getString(layers[i]),
        color: colors[i],
        posX: posX[i],
        posY: posY[i],
        height: heights[i],
        width: widths[i],
        rotation: rotations[i],
        attachmentPoint: attachmentPoints[i],
        widthFactor: widthFactors[i],
        heightScale: heightScales[i],
        fontName: this.getString(fontIndices[i]),
        content: this.getString(textIndices[i]),
      };
    }
    return result;
  }

  decodeInserts(view: DataView, count: number): Array<{
    id: number;
    layer: string;
    color: number;
    posX: number;
    posY: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
    blockName: string;
  }> {
    const result: Array<{
      id: number;
      layer: string;
      color: number;
      posX: number;
      posY: number;
      scaleX: number;
      scaleY: number;
      rotation: number;
      blockName: string;
    }> = new Array(count);

    let pos = 0;
    const ids = new Uint32Array(count);
    const layers = new Uint32Array(count);
    const colors = new Uint32Array(count);
    const posX = new Float64Array(count);
    const posY = new Float64Array(count);
    const scaleX = new Float64Array(count);
    const scaleY = new Float64Array(count);
    const rotations = new Float64Array(count);
    const blockNameIndices = new Uint32Array(count);

    for (let i = 0; i < count; i++) ids[i] = view.getUint32(pos + i * 4, true);
    pos += count * 4;
    for (let i = 0; i < count; i++) layers[i] = view.getUint32(pos + i * 4, true);
    pos += count * 4;
    for (let i = 0; i < count; i++) colors[i] = view.getUint32(pos + i * 4, true);
    pos += count * 4;
    for (let i = 0; i < count; i++) posX[i] = view.getFloat64(pos + i * 8, true);
    pos += count * 8;
    for (let i = 0; i < count; i++) posY[i] = view.getFloat64(pos + i * 8, true);
    pos += count * 8;
    for (let i = 0; i < count; i++) scaleX[i] = view.getFloat64(pos + i * 8, true);
    pos += count * 8;
    for (let i = 0; i < count; i++) scaleY[i] = view.getFloat64(pos + i * 8, true);
    pos += count * 8;
    for (let i = 0; i < count; i++) rotations[i] = view.getFloat64(pos + i * 8, true);
    pos += count * 8;
    for (let i = 0; i < count; i++) blockNameIndices[i] = view.getUint32(pos + i * 4, true);

    for (let i = 0; i < count; i++) {
      result[i] = {
        id: ids[i],
        layer: this.getString(layers[i]),
        color: colors[i],
        posX: posX[i],
        posY: posY[i],
        scaleX: scaleX[i],
        scaleY: scaleY[i],
        rotation: rotations[i],
        blockName: this.getString(blockNameIndices[i]),
      };
    }
    return result;
  }

  decodeEllipses(view: DataView, count: number): Array<{
    id: number;
    layer: string;
    color: number;
    lineWeight: number;
    centerX: number;
    centerY: number;
    majorX: number;
    majorY: number;
    minorRatio: number;
    startAngle: number;
    endAngle: number;
  }> {
    const result: Array<{
      id: number;
      layer: string;
      color: number;
      lineWeight: number;
      centerX: number;
      centerY: number;
      majorX: number;
      majorY: number;
      minorRatio: number;
      startAngle: number;
      endAngle: number;
    }> = new Array(count);

    let pos = 0;
    const ids = new Uint32Array(count);
    const layers = new Uint32Array(count);
    const colors = new Uint32Array(count);
    const lineWeights = new Float32Array(count);
    const centerX = new Float64Array(count);
    const centerY = new Float64Array(count);
    const majorX = new Float64Array(count);
    const majorY = new Float64Array(count);
    const ratios = new Float64Array(count);
    const startAngles = new Float64Array(count);
    const endAngles = new Float64Array(count);

    for (let i = 0; i < count; i++) ids[i] = view.getUint32(pos + i * 4, true);
    pos += count * 4;
    for (let i = 0; i < count; i++) layers[i] = view.getUint32(pos + i * 4, true);
    pos += count * 4;
    for (let i = 0; i < count; i++) colors[i] = view.getUint32(pos + i * 4, true);
    pos += count * 4;
    for (let i = 0; i < count; i++) lineWeights[i] = view.getFloat32(pos + i * 4, true);
    pos += count * 4;
    for (let i = 0; i < count; i++) centerX[i] = view.getFloat64(pos + i * 8, true);
    pos += count * 8;
    for (let i = 0; i < count; i++) centerY[i] = view.getFloat64(pos + i * 8, true);
    pos += count * 8;
    for (let i = 0; i < count; i++) majorX[i] = view.getFloat64(pos + i * 8, true);
    pos += count * 8;
    for (let i = 0; i < count; i++) majorY[i] = view.getFloat64(pos + i * 8, true);
    pos += count * 8;
    for (let i = 0; i < count; i++) ratios[i] = view.getFloat64(pos + i * 8, true);
    pos += count * 8;
    for (let i = 0; i < count; i++) startAngles[i] = view.getFloat64(pos + i * 8, true);
    pos += count * 8;
    for (let i = 0; i < count; i++) endAngles[i] = view.getFloat64(pos + i * 8, true);

    for (let i = 0; i < count; i++) {
      result[i] = {
        id: ids[i],
        layer: this.getString(layers[i]),
        color: colors[i],
        lineWeight: lineWeights[i],
        centerX: centerX[i],
        centerY: centerY[i],
        majorX: majorX[i],
        majorY: majorY[i],
        minorRatio: ratios[i],
        startAngle: startAngles[i],
        endAngle: endAngles[i],
      };
    }
    return result;
  }

  decodeLwPolylines(view: DataView, count: number): Array<{
    id: number;
    layer: string;
    color: number;
    lineWeight: number;
    closed: boolean;
    vertices: Array<{ x: number; y: number; bulge: number }>;
  }> {
    const result: Array<{
      id: number;
      layer: string;
      color: number;
      lineWeight: number;
      closed: boolean;
      vertices: Array<{ x: number; y: number; bulge: number }>;
    }> = [];

    let pos = 0;
    for (let i = 0; i < count; i++) {
      const id = view.getUint32(pos, true); pos += 4;
      const layerIdx = view.getUint32(pos, true); pos += 4;
      const color = view.getUint32(pos, true); pos += 4;
      const lineWeight = view.getFloat32(pos, true); pos += 4;
      const closedVal = view.getUint8(pos); pos += 1;
      const vertCount = view.getUint32(pos, true); pos += 4;

      const vertices: Array<{ x: number; y: number; bulge: number }> = [];
      for (let v = 0; v < vertCount; v++) {
        const x = view.getFloat64(pos, true); pos += 8;
        const y = view.getFloat64(pos, true); pos += 8;
        const bulge = view.getFloat64(pos, true); pos += 8;
        vertices.push({ x, y, bulge });
      }

      result.push({
        id,
        layer: this.getString(layerIdx),
        color,
        lineWeight,
        closed: closedVal === 1,
        vertices,
      });
    }
    return result;
  }

  decodePolylines(view: DataView, count: number): Array<{
    id: number;
    layer: string;
    color: number;
    lineWeight: number;
    closed: boolean;
    vertices: Array<{ x: number; y: number; z: number }>;
  }> {
    const result: Array<{
      id: number;
      layer: string;
      color: number;
      lineWeight: number;
      closed: boolean;
      vertices: Array<{ x: number; y: number; z: number }>;
    }> = [];

    let pos = 0;
    for (let i = 0; i < count; i++) {
      const id = view.getUint32(pos, true); pos += 4;
      const layerIdx = view.getUint32(pos, true); pos += 4;
      const color = view.getUint32(pos, true); pos += 4;
      const lineWeight = view.getFloat32(pos, true); pos += 4;
      const closedVal = view.getUint8(pos); pos += 1;
      const vertCount = view.getUint32(pos, true); pos += 4;

      const vertices: Array<{ x: number; y: number; z: number }> = [];
      for (let v = 0; v < vertCount; v++) {
        const x = view.getFloat64(pos, true); pos += 8;
        const y = view.getFloat64(pos, true); pos += 8;
        const z = view.getFloat64(pos, true); pos += 8;
        vertices.push({ x, y, z });
      }

      result.push({
        id,
        layer: this.getString(layerIdx),
        color,
        lineWeight,
        closed: closedVal === 1,
        vertices,
      });
    }
    return result;
  }

  decodeSplines(view: DataView, count: number): Array<{
    id: number;
    layer: string;
    color: number;
    lineWeight: number;
    degree: number;
    controlPoints: Array<{ x: number; y: number; z: number }>;
    fitPoints: Array<{ x: number; y: number; z: number }>;
    knots: number[];
  }> {
    const result: Array<{
      id: number;
      layer: string;
      color: number;
      lineWeight: number;
      degree: number;
      controlPoints: Array<{ x: number; y: number; z: number }>;
      fitPoints: Array<{ x: number; y: number; z: number }>;
      knots: number[];
    }> = [];

    let pos = 0;
    for (let i = 0; i < count; i++) {
      const id = view.getUint32(pos, true); pos += 4;
      const layerIdx = view.getUint32(pos, true); pos += 4;
      const color = view.getUint32(pos, true); pos += 4;
      const lineWeight = view.getFloat32(pos, true); pos += 4;
      const degree = view.getUint32(pos, true); pos += 4;
      const ctrlCount = view.getUint32(pos, true); pos += 4;
      const fitCount = view.getUint32(pos, true); pos += 4;
      const knotCount = view.getUint32(pos, true); pos += 4;

      const controlPoints: Array<{ x: number; y: number; z: number }> = [];
      for (let p = 0; p < ctrlCount; p++) {
        const x = view.getFloat64(pos, true); pos += 8;
        const y = view.getFloat64(pos, true); pos += 8;
        const z = view.getFloat64(pos, true); pos += 8;
        controlPoints.push({ x, y, z });
      }

      const fitPoints: Array<{ x: number; y: number; z: number }> = [];
      for (let p = 0; p < fitCount; p++) {
        const x = view.getFloat64(pos, true); pos += 8;
        const y = view.getFloat64(pos, true); pos += 8;
        const z = view.getFloat64(pos, true); pos += 8;
        fitPoints.push({ x, y, z });
      }

      const knots: number[] = [];
      for (let k = 0; k < knotCount; k++) {
        knots.push(view.getFloat64(pos, true)); pos += 8;
      }

      result.push({
        id,
        layer: this.getString(layerIdx),
        color,
        lineWeight,
        degree,
        controlPoints,
        fitPoints,
        knots,
      });
    }
    return result;
  }

  decodeSolids(view: DataView, count: number): Array<{
    id: number;
    layer: string;
    color: number;
    points: Array<{ x: number; y: number }>;
  }> {
    const result: Array<{
      id: number;
      layer: string;
      color: number;
      points: Array<{ x: number; y: number }>;
    }> = [];

    let pos = 0;
    for (let i = 0; i < count; i++) {
      const id = view.getUint32(pos, true); pos += 4;
      const layerIdx = view.getUint32(pos, true); pos += 4;
      const color = view.getUint32(pos, true); pos += 4;
      const pointCount = view.getUint32(pos, true); pos += 4;

      const points: Array<{ x: number; y: number }> = [];
      for (let p = 0; p < pointCount; p++) {
        const x = view.getFloat64(pos, true); pos += 8;
        const y = view.getFloat64(pos, true); pos += 8;
        points.push({ x, y });
      }

      result.push({
        id,
        layer: this.getString(layerIdx),
        color,
        points,
      });
    }
    return result;
  }

  decodeHatches(view: DataView, count: number): Array<{
    id: number;
    layer: string;
    color: number;
    patternType: number;
    patternName: string;
    solid: boolean;
    scale: number;
    angle: number;
    style: number;
    boundaries: Array<Array<{ x: number; y: number; bulge: number }>>;
    patternLines: Array<{ angle: number; base_x: number; base_y: number; offset_x: number; offset_y: number; dashes: number[] }>;
  }> {
    const result: Array<{
      id: number;
      layer: string;
      color: number;
      patternType: number;
      patternName: string;
      solid: boolean;
      scale: number;
      angle: number;
      style: number;
      boundaries: Array<Array<{ x: number; y: number; bulge: number }>>;
      patternLines: Array<{ angle: number; base_x: number; base_y: number; offset_x: number; offset_y: number; dashes: number[] }>;
    }> = [];

    let pos = 0;
    for (let i = 0; i < count; i++) {
      const id = view.getUint32(pos, true); pos += 4;
      const layerIdx = view.getUint32(pos, true); pos += 4;
      const color = view.getUint32(pos, true); pos += 4;
      const patternType = view.getUint32(pos, true); pos += 4;
      const patternIdx = view.getUint32(pos, true); pos += 4;
      const solidVal = view.getUint8(pos); pos += 1;
      const scale = view.getFloat64(pos, true); pos += 8;
      const angle = view.getFloat64(pos, true); pos += 8;
      const style = view.getUint8(pos); pos += 1;
      const boundaryCount = view.getUint32(pos, true); pos += 4;

      const boundaries: Array<Array<{ x: number; y: number; bulge: number }>> = [];
      for (let b = 0; b < boundaryCount; b++) {
        const vertCount = view.getUint32(pos, true); pos += 4;
        const path: Array<{ x: number; y: number; bulge: number }> = [];
        for (let v = 0; v < vertCount; v++) {
          const x = view.getFloat64(pos, true); pos += 8;
          const y = view.getFloat64(pos, true); pos += 8;
          const bulge = view.getFloat64(pos, true); pos += 8;
          path.push({ x, y, bulge });
        }
        boundaries.push(path);
      }

      const plineCount = view.getUint32(pos, true); pos += 4;
      const patternLines: Array<{ angle: number; base_x: number; base_y: number; offset_x: number; offset_y: number; dashes: number[] }> = [];
      for (let p = 0; p < plineCount; p++) {
        const plAngle = view.getFloat64(pos, true); pos += 8;
        const baseX = view.getFloat64(pos, true); pos += 8;
        const baseY = view.getFloat64(pos, true); pos += 8;
        const offsetX = view.getFloat64(pos, true); pos += 8;
        const offsetY = view.getFloat64(pos, true); pos += 8;
        const dashCount = view.getUint32(pos, true); pos += 4;
        const dashes: number[] = [];
        for (let d = 0; d < dashCount; d++) {
          dashes.push(view.getFloat64(pos, true)); pos += 8;
        }
        patternLines.push({ angle: plAngle, base_x: baseX, base_y: baseY, offset_x: offsetX, offset_y: offsetY, dashes });
      }

      result.push({
        id,
        layer: this.getString(layerIdx),
        color,
        patternType,
        patternName: this.getString(patternIdx),
        solid: solidVal === 1,
        scale,
        angle,
        style,
        boundaries,
        patternLines,
      });
    }
    return result;
  }

  decodeDimensions(view: DataView, count: number): Array<{
    id: number;
    layer: string;
    color: number;
    defX: number;
    defY: number;
    midX: number;
    midY: number;
    rotation: number;
    content: string;
  }> {
    const result: Array<{
      id: number;
      layer: string;
      color: number;
      defX: number;
      defY: number;
      midX: number;
      midY: number;
      rotation: number;
      content: string;
    }> = new Array(count);

    let pos = 0;
    const ids = new Uint32Array(count);
    const layers = new Uint32Array(count);
    const colors = new Uint32Array(count);
    const defX = new Float64Array(count);
    const defY = new Float64Array(count);
    const midX = new Float64Array(count);
    const midY = new Float64Array(count);
    const rotations = new Float64Array(count);
    const textIndices = new Uint32Array(count);

    for (let i = 0; i < count; i++) ids[i] = view.getUint32(pos + i * 4, true);
    pos += count * 4;
    for (let i = 0; i < count; i++) layers[i] = view.getUint32(pos + i * 4, true);
    pos += count * 4;
    for (let i = 0; i < count; i++) colors[i] = view.getUint32(pos + i * 4, true);
    pos += count * 4;
    for (let i = 0; i < count; i++) defX[i] = view.getFloat64(pos + i * 8, true);
    pos += count * 8;
    for (let i = 0; i < count; i++) defY[i] = view.getFloat64(pos + i * 8, true);
    pos += count * 8;
    for (let i = 0; i < count; i++) midX[i] = view.getFloat64(pos + i * 8, true);
    pos += count * 8;
    for (let i = 0; i < count; i++) midY[i] = view.getFloat64(pos + i * 8, true);
    pos += count * 8;
    for (let i = 0; i < count; i++) rotations[i] = view.getFloat64(pos + i * 8, true);
    pos += count * 8;
    for (let i = 0; i < count; i++) textIndices[i] = view.getUint32(pos + i * 4, true);

    for (let i = 0; i < count; i++) {
      result[i] = {
        id: ids[i],
        layer: this.getString(layers[i]),
        color: colors[i],
        defX: defX[i],
        defY: defY[i],
        midX: midX[i],
        midY: midY[i],
        rotation: rotations[i],
        content: this.getString(textIndices[i]),
      };
    }
    return result;
  }
}
