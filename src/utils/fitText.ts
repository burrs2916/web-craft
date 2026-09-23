const _canvas = document.createElement("canvas");
const _ctx = _canvas.getContext("2d")!;

const _fitCache = new Map<string, number>();
const _FIT_CACHE_MAX = 200;

function getFitCacheKey(params: {
  text: string;
  fontFamily: string;
  availW: number;
  availH: number;
  lineHeight: number;
  letterSpacing: number;
  minFontSize?: number;
  maxFontSize?: number;
}): string {
  return `${params.text}|${params.fontFamily}|${params.availW}|${params.availH}|${params.lineHeight}|${params.letterSpacing}|${params.minFontSize ?? ""}|${params.maxFontSize ?? ""}`;
}

function measureTextWidth(text: string, fontFamily: string, fontSize: number, letterSpacing: number): number {
  _ctx.font = `${fontSize}px ${fontFamily}`;
  let w = _ctx.measureText(text).width;
  w += (text.length - 1) * letterSpacing;
  return w;
}

function countWrappedLines(
  text: string,
  fontFamily: string,
  fontSize: number,
  letterSpacing: number,
  availW: number,
): number {
  const explicitLines = text.split("\n");
  let totalLines = 0;

  for (const line of explicitLines) {
    if (!line) {
      totalLines += 1;
      continue;
    }
    if (availW <= 0) {
      totalLines += 1;
      continue;
    }

    const lineWidth = measureTextWidth(line, fontFamily, fontSize, letterSpacing);
    if (lineWidth <= availW) {
      totalLines += 1;
      continue;
    }

    let currentLineW = 0;
    let lineCharCount = 0;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      const chW = measureTextWidth(ch, fontFamily, fontSize, letterSpacing) + (lineCharCount > 0 ? letterSpacing : 0);

      if (currentLineW + chW > availW && lineCharCount > 0) {
        totalLines += 1;
        currentLineW = chW;
        lineCharCount = 1;
      } else {
        currentLineW += chW;
        lineCharCount += 1;
      }
    }

    if (lineCharCount > 0) {
      totalLines += 1;
    }
  }

  return Math.max(totalLines, 1);
}

export function fitTextToBox(params: {
  text: string;
  fontFamily: string;
  availW: number;
  availH: number;
  lineHeight: number;
  letterSpacing: number;
  minFontSize?: number;
  maxFontSize?: number;
}): number {
  const {
    text,
    fontFamily,
    availW,
    availH,
    lineHeight,
    letterSpacing,
    minFontSize = 8,
    maxFontSize = 500,
  } = params;

  if (!text || availW <= 0 || availH <= 0) return minFontSize;

  const cacheKey = getFitCacheKey(params);
  const cached = _fitCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const cleanFontFamily = fontFamily === "inherit" ? "sans-serif" : fontFamily;

  let lo = minFontSize;
  let hi = maxFontSize;

  for (let i = 0; i < 16; i++) {
    const mid = Math.round((lo + hi) / 2);
    if (mid === lo) break;

    const numLines = countWrappedLines(text, cleanFontFamily, mid, letterSpacing, availW);
    const totalH = numLines * mid * lineHeight;

    if (totalH <= availH) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  if (_fitCache.size >= _FIT_CACHE_MAX) {
    const firstKey = _fitCache.keys().next().value;
    if (firstKey !== undefined) _fitCache.delete(firstKey);
  }
  _fitCache.set(cacheKey, lo);

  return lo;
}

export function measureTextSize(params: {
  text: string;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  containerWidth?: number;
}): { width: number; height: number } {
  const { text, fontFamily, fontSize, lineHeight, letterSpacing, containerWidth } = params;
  const cleanFontFamily = fontFamily === "inherit" ? "sans-serif" : fontFamily;

  if (containerWidth && containerWidth > 0) {
    const numLines = countWrappedLines(text, cleanFontFamily, fontSize, letterSpacing, containerWidth);
    const h = numLines * fontSize * lineHeight;
    return { width: containerWidth, height: Math.ceil(h) };
  }

  const explicitLines = text.split("\n");
  let maxW = 0;
  for (const line of explicitLines) {
    const w = measureTextWidth(line, cleanFontFamily, fontSize, letterSpacing);
    if (w > maxW) maxW = w;
  }
  const h = explicitLines.length * fontSize * lineHeight;
  return { width: Math.ceil(maxW), height: Math.ceil(h) };
}
