import { ChunkDecoder } from './decoder';
import { primitiveDecoders } from './decoders/primitives';
import { annotationDecoders } from './decoders/annotation';
import { sequenceDecoders } from './decoders/sequences';

// 把按职责拆分的解码实现装配到原型上。所有方法在各自模块内通过 `declare module '../decoder'`
// 声明，因此对调用方而言 ChunkDecoder 的公共 API 与拆分前完全一致。
Object.assign(
  ChunkDecoder.prototype,
  primitiveDecoders,
  annotationDecoders,
  sequenceDecoders,
);

export { CadbinReader } from './reader';
export { ChunkDecoder };

export {
  CADBIN_MAGIC,
  CADBIN_VERSION,
  FILE_HEADER_SIZE,
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
  LAYER_FLAG_VISIBLE,
  LAYER_FLAG_FROZEN,
  LAYER_FLAG_LOCKED,
  LAYER_FLAG_ON,
} from './constants';

export type {
  CadbinHeader,
  ChunkIndexEntry,
  LayerEntry,
  BlockDef,
  SpatialEntry,
  LineEntity,
  CircleEntity,
  ArcEntity,
  PointEntity,
  EllipseEntity,
  TextEntity,
  MTextEntity,
  InsertEntity,
  DimensionEntity,
  LwPolylineEntity,
  PolylineEntity,
  SplineEntity,
  SolidEntity,
  HatchPatternLine,
  HatchEntity,
} from './types';