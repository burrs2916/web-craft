import { useCallback } from "react";
import { useCoordinateEngine } from "../context/SceneEditorContext";
import type { CRSType, SpatialCoordinate, GeoPoint } from "../../types/spatial";

export function useCoordinateTransform(fromCRS: CRSType, toCRS: CRSType) {
  const engine = useCoordinateEngine();

  const transform = useCallback(
    (coord: SpatialCoordinate): SpatialCoordinate => {
      if (!engine) return coord;
      return engine.transform(coord, fromCRS, toCRS);
    },
    [engine, fromCRS, toCRS]
  );

  const toGeoPoint = useCallback(
    (coord: SpatialCoordinate): GeoPoint | null => {
      if (!engine) return null;
      try {
        return engine.toGeoPoint(coord, fromCRS);
      } catch {
        return null;
      }
    },
    [engine, fromCRS]
  );

  const fromGeoPoint = useCallback(
    (point: GeoPoint): SpatialCoordinate | null => {
      if (!engine) return null;
      try {
        return engine.fromGeoPoint(point, toCRS);
      } catch {
        return null;
      }
    },
    [engine, toCRS]
  );

  return { transform, toGeoPoint, fromGeoPoint, engine };
}
