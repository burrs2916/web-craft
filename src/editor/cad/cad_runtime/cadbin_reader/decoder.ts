/**
 * ChunkDecoder — 解码 CADBIN 各类实体 chunk 数据。
 *
 * 实现按职责拆分到同目录 `decoders/` 各 mixin 模块（primitives / annotation / sequences），
 * 在 index.ts 中通过 Object.assign 装配到原型上；本文件只保留字符串池访问与构造。
 */
export class ChunkDecoder {
  // 由同目录 mixin 模块共享访问（见 internal.ts），故为 protected 而非 private。
  protected strings: string[];

  constructor(strings: string[]) {
    this.strings = strings;
  }

  protected getString(idx: number): string {
    return this.strings[idx] || '';
  }
}