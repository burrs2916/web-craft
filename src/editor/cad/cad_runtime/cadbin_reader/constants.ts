export const CADBIN_MAGIC = [0x43, 0x41, 0x44, 0x42];
/// v4: MTEXT 新增 width_factor(f64), height_scale(f64), font_name(u32 string index)
export const CADBIN_VERSION = 4;
export const FILE_HEADER_SIZE = 128;

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