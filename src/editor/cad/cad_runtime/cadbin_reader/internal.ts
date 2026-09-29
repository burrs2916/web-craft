/**
 * ChunkDecoder 的私有状态视图。
 *
 * 拆分后各 mixin 模块（decoders/…）需要访问核心类的私有字段与方法，但又不希望把这些
 * 实现细节提升为 public API。此接口仅用于模块内 `this` 的类型断言，运行时不产生任何开销。
 */
export interface ChunkDecoderInternal {
  strings: string[];
  getString(idx: number): string;
}