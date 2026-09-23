import { describe, it, expect, beforeEach } from 'vitest';
import { GridSpatialIndex, type LineSegment } from '../cad_runtime/grid_spatial_index';

describe('GridSpatialIndex', () => {
  let index: GridSpatialIndex;

  beforeEach(() => {
    index = new GridSpatialIndex(100);
  });

  describe('addSegments / queryRect', () => {
    it('should find segments within query rect', () => {
      const segments: LineSegment[] = [
        { entityId: 'e1', x1: 10, y1: 10, x2: 50, y2: 50 },
        { entityId: 'e2', x1: 200, y1: 200, x2: 250, y2: 250 },
      ];
      index.addSegments(segments);

      const found = index.queryRect(0, 0, 100, 100);
      expect(found).toContain('e1');
      expect(found).not.toContain('e2');
    });

    it('should return empty array for empty query', () => {
      const found = index.queryRect(0, 0, 100, 100);
      expect(found).toEqual([]);
    });

    it('should deduplicate entity IDs', () => {
      const segments: LineSegment[] = [
        { entityId: 'e1', x1: 10, y1: 10, x2: 20, y2: 20 },
        { entityId: 'e1', x1: 30, y1: 30, x2: 40, y2: 40 },
      ];
      index.addSegments(segments);

      const found = index.queryRect(0, 0, 100, 100);
      expect(found.filter((id) => id === 'e1')).toHaveLength(1);
    });
  });

  describe('addEntity', () => {
    it('should store entity bbox', () => {
      index.addEntity('text1', { minX: 10, minY: 10, maxX: 50, maxY: 50 });
      expect(index.hasEntity('text1')).toBe(true);
    });

    it('should find entity by queryRect', () => {
      index.addEntity('text1', { minX: 10, minY: 10, maxX: 50, maxY: 50 });
      const found = index.queryRect(0, 0, 100, 100);
      expect(found).toContain('text1');
    });
  });

  describe('removeEntity', () => {
    it('should remove entity segments', () => {
      const segments: LineSegment[] = [{ entityId: 'e1', x1: 10, y1: 10, x2: 50, y2: 50 }];
      index.addSegments(segments);
      expect(index.hasEntity('e1')).toBe(true);

      index.removeEntity('e1');
      expect(index.hasEntity('e1')).toBe(false);
    });

    it('should return false for non-existent entity', () => {
      expect(index.removeEntity('nonexistent')).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all entities', () => {
      index.addSegments([{ entityId: 'e1', x1: 0, y1: 0, x2: 10, y2: 10 }]);
      index.addEntity('e2', { minX: 0, minY: 0, maxX: 10, maxY: 10 });
      index.clear();

      expect(index.hasEntity('e1')).toBe(false);
      expect(index.hasEntity('e2')).toBe(false);
      expect(index.queryRect(-100, -100, 200, 200)).toEqual([]);
    });
  });

  describe('setCellSize', () => {
    it('should reindex with new cell size', () => {
      index.addSegments([{ entityId: 'e1', x1: 10, y1: 10, x2: 50, y2: 50 }]);
      index.setCellSize(50);

      const found = index.queryRect(0, 0, 100, 100);
      expect(found).toContain('e1');
    });
  });
});
