export interface GridPosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GridItem extends GridPosition {
  i: string;
}

export interface GridConfig {
  cols: number;
  rowHeight: number;
  maxRows?: number;
  margin?: [number, number];
  containerPadding?: [number, number];
}

export function calculateGridPosition(
  containerWidth: number,
  cols: number,
  rowHeight: number
): { cellWidth: number; cellHeight: number } {
  const cellWidth = containerWidth / cols;
  const cellHeight = rowHeight;
  return { cellWidth, cellHeight };
}

export function snapToGrid(
  x: number,
  y: number,
  cellWidth: number,
  cellHeight: number,
  cols: number
): GridPosition {
  const gridX = Math.round(x / cellWidth);
  const gridY = Math.round(y / cellHeight);

  return {
    x: Math.max(0, Math.min(gridX, cols - 1)),
    y: Math.max(0, gridY),
    w: 1,
    h: 1,
  };
}

export function checkCollision(
  item: GridItem,
  items: GridItem[],
  _cols: number
): boolean {
  for (const other of items) {
    if (other.i === item.i) continue;

    if (
      item.x < other.x + other.w &&
      item.x + item.w > other.x &&
      item.y < other.y + other.h &&
      item.y + item.h > other.y
    ) {
      return true;
    }
  }
  return false;
}

export function compactGrid(items: GridItem[], cols: number): GridItem[] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const result: GridItem[] = [];

  for (const item of sorted) {
    let newY = item.y;

    while (newY > 0) {
      const testItem = { ...item, y: newY - 1 };
      if (!checkCollision(testItem, result, cols)) {
        newY--;
      } else {
        break;
      }
    }

    result.push({ ...item, y: newY });
  }

  return result;
}

export function getLayoutBounds(items: GridItem[]): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  if (items.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const item of items) {
    minX = Math.min(minX, item.x);
    maxX = Math.max(maxX, item.x + item.w);
    minY = Math.min(minY, item.y);
    maxY = Math.max(maxY, item.y + item.h);
  }

  return { minX, maxX, minY, maxY };
}
