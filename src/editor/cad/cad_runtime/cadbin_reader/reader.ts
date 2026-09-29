import { CADBIN_MAGIC, FILE_HEADER_SIZE } from './constants';
import type {
  BlockDef,
  CadbinHeader,
  ChunkIndexEntry,
  LayerEntry,
  SpatialEntry,
} from './types';

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