import { thumbnailGenerator } from "./thumbnailGenerator";

export interface ThumbnailData {
  dataUrl: string;
  width: number;
  height: number;
}

class ThumbnailCacheCompat {
  private cache = new Map<string, ThumbnailData>();

  get(type: string): ThumbnailData | undefined {
    return this.cache.get(type);
  }

  async generate(type: string): Promise<ThumbnailData | null> {
    const cached = this.cache.get(type);
    if (cached) return cached;

    const url = await thumbnailGenerator.generate(type);
    if (!url) return null;

    const result: ThumbnailData = {
      dataUrl: url,
      width: 120,
      height: 80,
    };
    this.cache.set(type, result);
    return result;
  }

  clear() {
    this.cache.clear();
  }

  invalidate(type: string) {
    this.cache.delete(type);
  }
}

export const thumbnailCache = new ThumbnailCacheCompat();
