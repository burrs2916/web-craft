import type { CRSType, SpatialCoordinate, SpatialBoundingBox, GeoPoint } from "../../types/spatial";
import {
  transformCoordinate,
  getCRSConfig,
} from "../../types/spatial";

export interface CalibrationParams {
  offsetX: number;
  offsetY: number;
  scale: number;
  rotation: number;
  sourceCRS: CRSType;
  targetCRS: CRSType;
}

export interface CustomCRSDefinition {
  id: string;
  name: string;
  type: 'geographic' | 'projected' | 'local';
  unit: 'degree' | 'meter' | 'millimeter' | 'pixel';
  description?: string;
  calibration?: CalibrationParams;
  parentCRS?: CRSType;
}

export interface ViewportTransform {
  panX: number;
  panY: number;
  zoom: number;
  rotation: number;
  width: number;
  height: number;
}

type CustomCRSEntry = {
  definition: CustomCRSDefinition;
  calibration?: CalibrationParams;
};

export class CoordinateEngine {
  private customCRSRegistry: Map<string, CustomCRSEntry> = new Map();

  transform(coord: SpatialCoordinate, fromCRS: CRSType | string, toCRS: CRSType | string): SpatialCoordinate {
    if (fromCRS === toCRS) return { ...coord };

    const fromCalibration = this.getCustomCRSCalibration(fromCRS);
    const toCalibration = this.getCustomCRSCalibration(toCRS);

    let workingCoord = { ...coord };

    if (fromCalibration) {
      workingCoord = this.applyCalibration(workingCoord, fromCalibration, 'forward');
      const fromParent = this.getCustomCRSParent(fromCRS) || 'EPSG:4326';
      return this.transform(workingCoord, fromParent, toCRS);
    }

    if (toCalibration) {
      const toParent = this.getCustomCRSParent(toCRS) || 'EPSG:4326';
      const parentCoord = this.transform(workingCoord, fromCRS, toParent);
      return this.applyCalibration(parentCoord, toCalibration, 'inverse');
    }

    if (fromCRS === 'local' && toCRS !== 'local') {
      throw new Error(
        `[CoordinateEngine] local->${toCRS} requires calibration. ` +
        `Register a custom CRS with calibration via registerCustomCRS() or setCalibration(). ` +
        `For example: coordinateEngine.registerCalibrationFromControlPoints('local-crs', controlPoints, 'EPSG:4326')`
      );
    }

    if (toCRS === 'local' && fromCRS !== 'local') {
      throw new Error(
        `[CoordinateEngine] ${fromCRS}->local requires calibration. ` +
        `Register a custom CRS with calibration via registerCustomCRS() or setCalibration(). ` +
        `For example: coordinateEngine.registerCalibrationFromControlPoints('local-crs', controlPoints, 'EPSG:4326')`
      );
    }

    return transformCoordinate(workingCoord, fromCRS as CRSType, toCRS as CRSType);
  }

  transformBounds(bounds: SpatialBoundingBox, fromCRS: CRSType | string, toCRS: CRSType | string): SpatialBoundingBox {
    return {
      min: this.transform(bounds.min, fromCRS, toCRS),
      max: this.transform(bounds.max, fromCRS, toCRS),
    };
  }

  toGeoPoint(coord: SpatialCoordinate, fromCRS: CRSType | string): GeoPoint {
    const wgs84 = this.transform(coord, fromCRS, 'EPSG:4326');
    return { lng: wgs84.x, lat: wgs84.y };
  }

  fromGeoPoint(point: GeoPoint, toCRS: CRSType | string): SpatialCoordinate {
    const wgs84: SpatialCoordinate = { x: point.lng, y: point.lat };
    return this.transform(wgs84, 'EPSG:4326', toCRS);
  }

  worldToScreen(coord: SpatialCoordinate, _worldCRS: CRSType | string, viewport: ViewportTransform): { x: number; y: number } {
    const cx = viewport.width / 2;
    const cy = viewport.height / 2;
    const sx = (coord.x - viewport.panX) * viewport.zoom + cx;
    const sy = cy - (coord.y - viewport.panY) * viewport.zoom;
    return { x: sx, y: sy };
  }

  screenToWorld(screen: { x: number; y: number }, _worldCRS: CRSType | string, viewport: ViewportTransform): SpatialCoordinate {
    const cx = viewport.width / 2;
    const cy = viewport.height / 2;
    const wx = (screen.x - cx) / viewport.zoom + viewport.panX;
    const wy = (screen.y - cy) / viewport.zoom + viewport.panY;
    return { x: wx, y: wy };
  }

  registerCustomCRS(id: string, definition: CustomCRSDefinition): void {
    this.customCRSRegistry.set(id, {
      definition,
      calibration: definition.calibration,
    });
  }

  unregisterCustomCRS(id: string): boolean {
    return this.customCRSRegistry.delete(id);
  }

  getCustomCRS(id: string): CustomCRSDefinition | undefined {
    return this.customCRSRegistry.get(id)?.definition;
  }

  setCalibration(crsId: string, calibration: CalibrationParams): void {
    const entry = this.customCRSRegistry.get(crsId);
    if (entry) {
      entry.calibration = calibration;
    } else {
      this.registerCustomCRS(crsId, {
        id: crsId,
        name: crsId,
        type: 'local',
        unit: 'millimeter',
        calibration,
        parentCRS: calibration.targetCRS,
      });
    }
  }

  getCalibration(crsId: string): CalibrationParams | undefined {
    return this.customCRSRegistry.get(crsId)?.calibration;
  }

  isRegisteredCRS(crs: string): boolean {
    if (getCRSConfig(crs as CRSType)) return true;
    return this.customCRSRegistry.has(crs);
  }

  hasCalibration(crs: string): boolean {
    return this.customCRSRegistry.has(crs) && this.customCRSRegistry.get(crs)!.calibration !== undefined;
  }

  canTransform(fromCRS: CRSType | string, toCRS: CRSType | string): boolean {
    if (fromCRS === toCRS) return true;
    if (fromCRS === 'local' || toCRS === 'local') {
      const localCRS = fromCRS === 'local' ? fromCRS : toCRS;
      return this.hasCalibration(localCRS as string);
    }
    return true;
  }

  getScaleFactor(fromCRS: CRSType | string, toCRS: CRSType | string): number {
    if (fromCRS === toCRS) return 1;

    const origin: SpatialCoordinate = { x: 0, y: 0 };
    const unitOffset: SpatialCoordinate = { x: 1, y: 0 };

    const transformedOrigin = this.transform(origin, fromCRS, toCRS);
    const transformedUnit = this.transform(unitOffset, fromCRS, toCRS);

    const dx = transformedUnit.x - transformedOrigin.x;
    const dy = transformedUnit.y - transformedOrigin.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 1e-15) return 1;
    return dist;
  }

  registerCalibrationFromControlPoints(
    crsId: string,
    controlPoints: Array<{ local: SpatialCoordinate; geo: SpatialCoordinate }>,
    parentCRS: CRSType = 'EPSG:4326'
  ): CalibrationParams | null {
    if (controlPoints.length < 2) {
      console.warn('[CoordinateEngine] Need at least 2 control points for calibration');
      return null;
    }

    const p1 = controlPoints[0];
    const p2 = controlPoints[1];

    const dxLocal = p2.local.x - p1.local.x;
    const dyLocal = p2.local.y - p1.local.y;
    const dxGeo = p2.geo.x - p1.geo.x;
    const dyGeo = p2.geo.y - p1.geo.y;

    if (Math.abs(dxLocal) < 1e-10 && Math.abs(dyLocal) < 1e-10) {
      console.warn('[CoordinateEngine] Control points too close in local CRS');
      return null;
    }

    const distLocal = Math.sqrt(dxLocal * dxLocal + dyLocal * dyLocal);
    const distGeo = Math.sqrt(dxGeo * dxGeo + dyGeo * dyGeo);
    const scale = distGeo / distLocal;

    const angleLocal = Math.atan2(dyLocal, dxLocal);
    const angleGeo = Math.atan2(dyGeo, dxGeo);
    const rotation = ((angleGeo - angleLocal) * 180) / Math.PI;

    const rad = (rotation * Math.PI) / 180;
    const scaledX = p1.local.x * scale;
    const scaledY = p1.local.y * scale;
    const rotatedX = scaledX * Math.cos(rad) - scaledY * Math.sin(rad);
    const rotatedY = scaledX * Math.sin(rad) + scaledY * Math.cos(rad);
    const offsetX = p1.geo.x - rotatedX;
    const offsetY = p1.geo.y - rotatedY;

    const calibration: CalibrationParams = {
      offsetX,
      offsetY,
      scale,
      rotation,
      sourceCRS: 'local' as CRSType,
      targetCRS: parentCRS,
    };

    this.registerCustomCRS(crsId, {
      id: crsId,
      name: crsId,
      type: 'local',
      unit: 'millimeter',
      calibration,
      parentCRS,
    });

    return calibration;
  }

  getAllKnownCRS(): Array<{ id: string; name: string; type: string }> {
    const builtin: string[] = ['EPSG:4326', 'EPSG:3857', 'EPSG:4490', 'local'];
    const results = builtin.map(id => {
      const cfg = getCRSConfig(id as CRSType);
      return { id, name: cfg.name, type: cfg.type };
    });

    this.customCRSRegistry.forEach((entry, id) => {
      results.push({ id, name: entry.definition.name, type: entry.definition.type });
    });

    return results;
  }

  private applyCalibration(coord: SpatialCoordinate, calibration: CalibrationParams, direction: 'forward' | 'inverse'): SpatialCoordinate {
    if (direction === 'forward') {
      const scaledX = coord.x * calibration.scale;
      const scaledY = coord.y * calibration.scale;
      const rad = (calibration.rotation * Math.PI) / 180;
      const rotatedX = scaledX * Math.cos(rad) - scaledY * Math.sin(rad);
      const rotatedY = scaledX * Math.sin(rad) + scaledY * Math.cos(rad);
      return {
        x: rotatedX + calibration.offsetX,
        y: rotatedY + calibration.offsetY,
      };
    } else {
      const translatedX = coord.x - calibration.offsetX;
      const translatedY = coord.y - calibration.offsetY;
      const rad = -(calibration.rotation * Math.PI) / 180;
      const rotatedX = translatedX * Math.cos(rad) - translatedY * Math.sin(rad);
      const rotatedY = translatedX * Math.sin(rad) + translatedY * Math.cos(rad);
      return {
        x: rotatedX / calibration.scale,
        y: rotatedY / calibration.scale,
      };
    }
  }

  private getCustomCRSCalibration(crs: string): CalibrationParams | undefined {
    return this.customCRSRegistry.get(crs)?.calibration;
  }

  private getCustomCRSParent(crs: string): CRSType | undefined {
    return this.customCRSRegistry.get(crs)?.definition.parentCRS;
  }
}

export const coordinateEngine = new CoordinateEngine();
