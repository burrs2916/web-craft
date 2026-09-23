export interface LineSegment {
  entityId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface GridCell {
  segments: LineSegment[];
}

export class GridSpatialIndex {
  private _cellSize: number;
  private _grid: Map<number, GridCell> = new Map();
  private _entitySegments: Map<string, LineSegment[]> = new Map();
  private _entityBboxes: Map<string, { minX: number; minY: number; maxX: number; maxY: number }> = new Map();
  private _globalBbox = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  private _autoResize = true;
  private _resizeThreshold = 0.65;
  private static readonly CELL_KEY_OFFSET = 1000000;

  constructor(cellSize: number = 100) {
    this._cellSize = cellSize;
  }

  enableAutoResize(enable: boolean): void {
    this._autoResize = enable;
  }

  private _cellKey(cx: number, cy: number): number {
    return (cx + GridSpatialIndex.CELL_KEY_OFFSET) * 2000000 + (cy + GridSpatialIndex.CELL_KEY_OFFSET);
  }

  private _getCellCoords(x: number, y: number): [number, number] {
    return [Math.floor(x / this._cellSize), Math.floor(y / this._cellSize)];
  }

  private _updateGlobalBbox(minX: number, minY: number, maxX: number, maxY: number): void {
    if (minX < this._globalBbox.minX) this._globalBbox.minX = minX;
    if (minY < this._globalBbox.minY) this._globalBbox.minY = minY;
    if (maxX > this._globalBbox.maxX) this._globalBbox.maxX = maxX;
    if (maxY > this._globalBbox.maxY) this._globalBbox.maxY = maxY;
  }

  private _checkAutoResize(): void {
    if (!this._autoResize || this._grid.size === 0) return;
    const totalWidth = this._globalBbox.maxX - this._globalBbox.minX;
    const totalHeight = this._globalBbox.maxY - this._globalBbox.minY;
    if (totalWidth <= 0 || totalHeight <= 0) return;

    const maxDim = Math.max(totalWidth, totalHeight);
    const idealCellSize = maxDim / 50;
    const currentRatio = this._entitySegments.size / this._grid.size;

    if (currentRatio < this._resizeThreshold && this._cellSize < idealCellSize * 0.5) {
      this.setCellSize(Math.max(idealCellSize, this._cellSize * 2));
    } else if (this._grid.size > 10000 && this._cellSize > idealCellSize * 2) {
      this.setCellSize(Math.max(idealCellSize, this._cellSize * 0.5));
    }
  }

  addSegment(segment: LineSegment): void {
    const { x1, y1, x2, y2, entityId } = segment;

    if (!this._entitySegments.has(entityId)) {
      this._entitySegments.set(entityId, []);
    }
    this._entitySegments.get(entityId)!.push(segment);

    const minX = Math.min(x1, x2);
    const minY = Math.min(y1, y2);
    const maxX = Math.max(x1, x2);
    const maxY = Math.max(y1, y2);

    this._updateGlobalBbox(minX, minY, maxX, maxY);

    const existing = this._entityBboxes.get(entityId);
    if (existing) {
      if (minX < existing.minX) existing.minX = minX;
      if (minY < existing.minY) existing.minY = minY;
      if (maxX > existing.maxX) existing.maxX = maxX;
      if (maxY > existing.maxY) existing.maxY = maxY;
    } else {
      this._entityBboxes.set(entityId, { minX, minY, maxX, maxY });
    }

    const [cx1, cy1] = this._getCellCoords(minX, minY);
    const [cx2, cy2] = this._getCellCoords(maxX, maxY);

    for (let cx = cx1; cx <= cx2; cx++) {
      for (let cy = cy1; cy <= cy2; cy++) {
        const key = this._cellKey(cx, cy);
        let cell = this._grid.get(key);
        if (!cell) {
          cell = { segments: [] };
          this._grid.set(key, cell);
        }
        cell.segments.push(segment);
      }
    }
  }

  addSegments(segments: LineSegment[]): void {
    for (const seg of segments) {
      this.addSegment(seg);
    }
    this._checkAutoResize();
  }

  addEntity(entityId: string, bbox: { minX: number; minY: number; maxX: number; maxY: number }): void {
    this._entityBboxes.set(entityId, { ...bbox });
    this._updateGlobalBbox(bbox.minX, bbox.minY, bbox.maxX, bbox.maxY);
  }

  removeEntity(entityId: string): boolean {
    const segments = this._entitySegments.get(entityId);
    if (!segments) return false;

    for (const seg of segments) {
      const minX = Math.min(seg.x1, seg.x2);
      const minY = Math.min(seg.y1, seg.y2);
      const maxX = Math.max(seg.x1, seg.x2);
      const maxY = Math.max(seg.y1, seg.y2);

      const [cx1, cy1] = this._getCellCoords(minX, minY);
      const [cx2, cy2] = this._getCellCoords(maxX, maxY);

      for (let cx = cx1; cx <= cx2; cx++) {
        for (let cy = cy1; cy <= cy2; cy++) {
          const key = this._cellKey(cx, cy);
          const cell = this._grid.get(key);
          if (cell) {
            const idx = cell.segments.indexOf(seg);
            if (idx !== -1) {
              cell.segments[idx] = cell.segments[cell.segments.length - 1];
              cell.segments.pop();
            }
            if (cell.segments.length === 0) {
              this._grid.delete(key);
            }
          }
        }
      }
    }

    this._entitySegments.delete(entityId);
    this._entityBboxes.delete(entityId);
    return true;
  }

  hasEntity(entityId: string): boolean {
    return this._entitySegments.has(entityId) || this._entityBboxes.has(entityId);
  }

  queryPoint(px: number, py: number, tolerance: number): string | null {
    const [cx, cy] = this._getCellCoords(px, py);
    const searchRadius = Math.ceil(tolerance / this._cellSize) + 1;

    let closestId: string | null = null;
    let closestDist = tolerance * tolerance;

    for (let dcx = -searchRadius; dcx <= searchRadius; dcx++) {
      for (let dcy = -searchRadius; dcy <= searchRadius; dcy++) {
        const key = this._cellKey(cx + dcx, cy + dcy);
        const cell = this._grid.get(key);
        if (!cell) continue;

        for (const seg of cell.segments) {
          const dist = this._pointToSegmentDistSq(px, py, seg.x1, seg.y1, seg.x2, seg.y2);
          if (dist < closestDist) {
            closestDist = dist;
            closestId = seg.entityId;
          }
        }
      }
    }

    return closestId;
  }

  queryPointCandidates(px: number, py: number, tolerance: number, maxResults: number = 10): Array<{ entityId: string; distSq: number }> {
    const [cx, cy] = this._getCellCoords(px, py);
    const searchRadius = Math.ceil(tolerance / this._cellSize) + 1;
    const tolSq = tolerance * tolerance;
    const entityBestDist = new Map<string, number>();

    for (let dcx = -searchRadius; dcx <= searchRadius; dcx++) {
      for (let dcy = -searchRadius; dcy <= searchRadius; dcy++) {
        const key = this._cellKey(cx + dcx, cy + dcy);
        const cell = this._grid.get(key);
        if (!cell) continue;

        for (const seg of cell.segments) {
          const dist = this._pointToSegmentDistSq(px, py, seg.x1, seg.y1, seg.x2, seg.y2);
          if (dist > tolSq) continue;
          const prev = entityBestDist.get(seg.entityId);
          if (prev === undefined || dist < prev) {
            entityBestDist.set(seg.entityId, dist);
          }
        }
      }
    }

    const results = Array.from(entityBestDist.entries())
      .map(([entityId, distSq]) => ({ entityId, distSq }))
      .sort((a, b) => a.distSq - b.distSq)
      .slice(0, maxResults);

    return results;
  }

  queryRect(minX: number, minY: number, maxX: number, maxY: number): string[] {
    const [cx1, cy1] = this._getCellCoords(minX, minY);
    const [cx2, cy2] = this._getCellCoords(maxX, maxY);
    const candidateEntities = new Set<string>();

    for (let cx = cx1; cx <= cx2; cx++) {
      for (let cy = cy1; cy <= cy2; cy++) {
        const key = this._cellKey(cx, cy);
        const cell = this._grid.get(key);
        if (!cell) continue;

        for (const seg of cell.segments) {
          candidateEntities.add(seg.entityId);
        }
      }
    }

    // Also include entities added via addEntity() (bbox-only, no segments)
    for (const [entityId, bbox] of this._entityBboxes) {
      if (!this._entitySegments.has(entityId)) {
        if (bbox.minX <= maxX && bbox.maxX >= minX && bbox.minY <= maxY && bbox.maxY >= minY) {
          candidateEntities.add(entityId);
        }
      }
    }

    const result: string[] = [];
    for (const entityId of candidateEntities) {
      const bbox = this._entityBboxes.get(entityId);
      if (!bbox) continue;
      if (bbox.minX <= maxX && bbox.maxX >= minX && bbox.minY <= maxY && bbox.maxY >= minY) {
        result.push(entityId);
      }
    }

    return result;
  }

  getEntityBbox(entityId: string): { minX: number; minY: number; maxX: number; maxY: number } | undefined {
    return this._entityBboxes.get(entityId);
  }

  getEntityCount(): number {
    return this._entitySegments.size;
  }

  getSegmentCount(): number {
    let count = 0;
    for (const segs of this._entitySegments.values()) {
      count += segs.length;
    }
    return count;
  }

  clear(): void {
    this._grid.clear();
    this._entitySegments.clear();
    this._entityBboxes.clear();
    this._globalBbox = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  }

  setCellSize(cellSize: number): void {
    if (cellSize === this._cellSize) return;
    const allSegments: LineSegment[] = [];
    for (const segs of this._entitySegments.values()) {
      for (const seg of segs) {
        allSegments.push(seg);
      }
    }
    this._cellSize = cellSize;
    this._grid.clear();
    this._entitySegments.clear();
    this._entityBboxes.clear();
    this.addSegments(allSegments);
  }

  private _pointToSegmentDistSq(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;

    if (lenSq < 1e-10) {
      const dpx = px - x1, dpy = py - y1;
      return dpx * dpx + dpy * dpy;
    }

    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    const dpx = px - projX, dpy = py - projY;
    return dpx * dpx + dpy * dpy;
  }
}
