import type { ChunkDecoder } from '../decoder';
import type { ChunkDecoderInternal } from '../internal';
import type {
  HatchEntity,
  HatchPatternLine,
  LwPolylineEntity,
  PolylineEntity,
  SolidEntity,
  SplineEntity,
} from '../types';

declare module '../decoder' {
  interface ChunkDecoder {
    decodeLwPolylines(view: DataView, count: number): LwPolylineEntity[];
    decodePolylines(view: DataView, count: number): PolylineEntity[];
    decodeSplines(view: DataView, count: number): SplineEntity[];
    decodeSolids(view: DataView, count: number): SolidEntity[];
    decodeHatches(view: DataView, count: number): HatchEntity[];
  }
}

export const sequenceDecoders = {
  decodeLwPolylines(this: ChunkDecoderInternal, view: DataView, count: number): LwPolylineEntity[] {
    const result: LwPolylineEntity[] = [];

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
  },

  decodePolylines(this: ChunkDecoderInternal, view: DataView, count: number): PolylineEntity[] {
    const result: PolylineEntity[] = [];

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
  },

  decodeSplines(this: ChunkDecoderInternal, view: DataView, count: number): SplineEntity[] {
    const result: SplineEntity[] = [];

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
  },

  decodeSolids(this: ChunkDecoderInternal, view: DataView, count: number): SolidEntity[] {
    const result: SolidEntity[] = [];

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
  },

  decodeHatches(this: ChunkDecoderInternal, view: DataView, count: number): HatchEntity[] {
    const result: HatchEntity[] = [];

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
      const patternLines: HatchPatternLine[] = [];
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
  },
} satisfies Pick<
  ChunkDecoder,
  'decodeLwPolylines' | 'decodePolylines' | 'decodeSplines' | 'decodeSolids' | 'decodeHatches'
>;