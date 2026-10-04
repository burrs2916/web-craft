import type { BoundingBox } from '../scene_node';

function estimateTextWidth(content: string, height: number, widthFactor: number = 1): number {
  const safeHeight = Number.isFinite(height) && height > 0 ? height : 1;
  const safeWidthFactor = Number.isFinite(widthFactor) && widthFactor > 0 ? widthFactor : 1;

  // 修复缺陷1：改进字符宽度估算，更准确地反映SourceHanSansCN字体特性
  const maxUnits = content
    .split(/\r?\n|\\P/)
    .reduce((max, line) => {
      const units = Array.from(line).reduce((sum, ch) => {
        const code = ch.charCodeAt(0);
        // 空白字符
        if (/\s/.test(ch)) return sum + 0.35;
        // ASCII范围内的字符
        if (code <= 0x7f) {
          // 数字和字母：约占字高的 0.55-0.65
          if (/[a-zA-Z0-9]/.test(ch)) return sum + 0.6;
          // 大多数标点符号：约占字高的 0.3-0.5
          if (/[.,;:!?'"-]/.test(ch)) return sum + 0.4;
          // 其他ASCII字符：平均 0.5
          return sum + 0.5;
        }
        // CJK字符（中日韩）和其他宽字符：约占字高的 0.9-1.0
        // 对于SourceHanSansCN，大多数CJK字符宽度略小于1个字高
        return sum + 0.95;
      }, 0);
      return Math.max(max, units);
    }, 0);
  return Math.max(safeHeight, Math.max(1, maxUnits) * safeHeight * safeWidthFactor);
}

function anchoredTextBbox(
  posX: number,
  posY: number,
  width: number,
  height: number,
  rotation: number,
  col: number,
  row: number,
): BoundingBox {
  const w = Math.max(Math.abs(width), 1e-6);
  const h = Math.max(Math.abs(height), 1e-6);
  const [minLocalX, maxLocalX] = col === 1 ? [-w / 2, w / 2] : col === 2 ? [-w, 0] : [0, w];
  const [minLocalY, maxLocalY] = row === 0 ? [-h, 0] : row === 1 ? [-h / 2, h / 2] : [0, h];
  const cos = Math.cos(Number.isFinite(rotation) ? rotation : 0);
  const sin = Math.sin(Number.isFinite(rotation) ? rotation : 0);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const [x, y] of [
    [minLocalX, minLocalY],
    [minLocalX, maxLocalY],
    [maxLocalX, minLocalY],
    [maxLocalX, maxLocalY],
  ]) {
    const rx = posX + x * cos - y * sin;
    const ry = posY + x * sin + y * cos;
    minX = Math.min(minX, rx);
    minY = Math.min(minY, ry);
    maxX = Math.max(maxX, rx);
    maxY = Math.max(maxY, ry);
  }

  return { minX, minY, maxX, maxY };
}

export function textNodeBbox(
  posX: number,
  posY: number,
  height: number,
  rotation: number,
  horizontalAlignment: number,
  verticalAlignment: number,
  content: string,
): BoundingBox {
  const width = estimateTextWidth(content, height, 1);
  const col = horizontalAlignment === 1 || horizontalAlignment === 4 ? 1 : horizontalAlignment === 2 || horizontalAlignment === 3 || horizontalAlignment === 5 ? 2 : 0;
  const row = verticalAlignment === 3 ? 0 : verticalAlignment === 2 ? 1 : 2;
  return anchoredTextBbox(posX, posY, width, height, rotation, col, row);
}

export function mTextNodeBbox(
  posX: number,
  posY: number,
  height: number,
  width: number,
  rotation: number,
  attachmentPoint: number,
  widthFactor: number,
  heightScale: number,
  content: string,
): BoundingBox {
  const effectiveHeight = Math.max(Math.abs(height * (heightScale > 0 ? heightScale : 1)), 1e-6);
  const estimatedWidth = estimateTextWidth(content, effectiveHeight, widthFactor);
  const blockWidth = width > 0 && Number.isFinite(width) ? Math.abs(width) : estimatedWidth;
  const lineCount = Math.max(1, content.split(/\r?\n|\\P/).filter(Boolean).length);
  const blockHeight = effectiveHeight * lineCount * 1.25;
  const ap = Math.max(1, Math.min(9, Math.floor(attachmentPoint || 1)));
  const col = (ap - 1) % 3;
  const row = Math.floor((ap - 1) / 3);
  return anchoredTextBbox(posX, posY, blockWidth, blockHeight, rotation, col, row);
}