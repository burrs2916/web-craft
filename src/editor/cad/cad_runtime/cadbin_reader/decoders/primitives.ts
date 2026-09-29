import type { ChunkDecoder } from '../decoder';
import type { ChunkDecoderInternal } from '../internal';
import type {
  ArcEntity,
  CircleEntity,
  EllipseEntity,
  LineEntity,
  PointEntity,
} from '../types';

declare module '../decoder' {
  interface ChunkDecoder {
    decodeLines(view: DataView, count: number): LineEntity[];
    decodeCircles(view: DataView, count: number): CircleEntity[];
    decodeArcs(view: DataView, count: number): ArcEntity[];
    decodePoints(view: DataView, count: number): PointEntity[];
    decodeEllipses(view: DataView, count: number): EllipseEntity[];
  }
}

export const primitiveDecoders = {
  decodeLines(this: ChunkDecoderInternal, view: DataView, count: number): LineEntity[] {
    const result: LineEntity[] = new Array(count);

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
  },

  decodeCircles(this: ChunkDecoderInternal, view: DataView, count: number): CircleEntity[] {
    const result: CircleEntity[] = new Array(count);

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
  },

  decodeArcs(this: ChunkDecoderInternal, view: DataView, count: number): ArcEntity[] {
    const result: ArcEntity[] = new Array(count);

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
  },

  decodePoints(this: ChunkDecoderInternal, view: DataView, count: number): PointEntity[] {
    const result: PointEntity[] = new Array(count);

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
  },

  decodeEllipses(this: ChunkDecoderInternal, view: DataView, count: number): EllipseEntity[] {
    const result: EllipseEntity[] = new Array(count);

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
  },
} satisfies Pick<
  ChunkDecoder,
  'decodeLines' | 'decodeCircles' | 'decodeArcs' | 'decodePoints' | 'decodeEllipses'
>;