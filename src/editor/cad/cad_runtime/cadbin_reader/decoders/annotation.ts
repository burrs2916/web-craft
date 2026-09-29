import type { ChunkDecoder } from '../decoder';
import type { ChunkDecoderInternal } from '../internal';
import type {
  DimensionEntity,
  InsertEntity,
  MTextEntity,
  TextEntity,
} from '../types';

declare module '../decoder' {
  interface ChunkDecoder {
    decodeTexts(view: DataView, count: number): TextEntity[];
    decodeMTexts(view: DataView, count: number): MTextEntity[];
    decodeInserts(view: DataView, count: number): InsertEntity[];
    decodeDimensions(view: DataView, count: number): DimensionEntity[];
  }
}

function alignTo(pos: number, align: number): number {
  const m = pos % align;
  return m === 0 ? pos : pos + (align - m);
}

export const annotationDecoders = {
  decodeTexts(this: ChunkDecoderInternal, view: DataView, count: number): TextEntity[] {
    const result: TextEntity[] = new Array(count);

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
  },

  decodeMTexts(this: ChunkDecoderInternal, view: DataView, count: number): MTextEntity[] {
    const result: MTextEntity[] = new Array(count);

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
  },

  decodeInserts(this: ChunkDecoderInternal, view: DataView, count: number): InsertEntity[] {
    const result: InsertEntity[] = new Array(count);

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
  },

  decodeDimensions(this: ChunkDecoderInternal, view: DataView, count: number): DimensionEntity[] {
    const result: DimensionEntity[] = new Array(count);

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
  },
} satisfies Pick<
  ChunkDecoder,
  'decodeTexts' | 'decodeMTexts' | 'decodeInserts' | 'decodeDimensions'
>;