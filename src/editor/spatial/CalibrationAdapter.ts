import type { CoordinateEngine, CalibrationParams } from "../spatial/CoordinateEngine";
import type { CRSType, SpatialCoordinate, SpatialBoundingBox } from "../../types/spatial";
import type { SpatialLayer } from "../layers/SpatialLayer";

export interface CalibrationPoint {
  source: SpatialCoordinate;
  target: SpatialCoordinate;
}

export interface CalibrationResult {
  success: boolean;
  params: CalibrationParams;
  residualError: number;
  pointCount: number;
}

export class CalibrationAdapter {
  private _engine: CoordinateEngine;
  private _calibrations: Map<string, CalibrationParams> = new Map();

  constructor(engine: CoordinateEngine) {
    this._engine = engine;
  }

  calibrateFromPoints(
    layerId: string,
    sourceCRS: CRSType,
    targetCRS: CRSType,
    points: CalibrationPoint[]
  ): CalibrationResult {
    if (points.length < 2) {
      return {
        success: false,
        params: { offsetX: 0, offsetY: 0, scale: 1, rotation: 0, sourceCRS, targetCRS },
        residualError: Infinity,
        pointCount: points.length,
      };
    }

    const params = this._computeAffineTransform(points, sourceCRS, targetCRS);

    const residualError = this._computeResidualError(points, params);

    this._calibrations.set(layerId, params);
    this._engine.setCalibration(`${layerId}_local`, params);

    return {
      success: true,
      params,
      residualError,
      pointCount: points.length,
    };
  }

  setCalibration(layerId: string, params: CalibrationParams): void {
    this._calibrations.set(layerId, params);
    this._engine.setCalibration(`${layerId}_local`, params);
  }

  getCalibration(layerId: string): CalibrationParams | undefined {
    return this._calibrations.get(layerId);
  }

  removeCalibration(layerId: string): void {
    this._calibrations.delete(layerId);
    this._engine.unregisterCustomCRS(`${layerId}_local`);
  }

  transformPoint(_layerId: string, coord: SpatialCoordinate, fromCRS: CRSType, toCRS: CRSType): SpatialCoordinate {
    return this._engine.transform(coord, fromCRS, toCRS);
  }

  transformBounds(_layerId: string, bounds: SpatialBoundingBox, fromCRS: CRSType, toCRS: CRSType): SpatialBoundingBox {
    return this._engine.transformBounds(bounds, fromCRS, toCRS);
  }

  applyCalibrationToLayer(layer: SpatialLayer, params: CalibrationParams): void {
    this.setCalibration(layer.id, params);
    if (layer.bounds) {
      const transformedBounds = this._engine.transformBounds(
        layer.bounds,
        params.sourceCRS,
        params.targetCRS
      );
      layer.bounds = transformedBounds;
    }
  }

  getAllCalibrations(): Map<string, CalibrationParams> {
    return new Map(this._calibrations);
  }

  private _computeAffineTransform(points: CalibrationPoint[], sourceCRS: CRSType, targetCRS: CRSType): CalibrationParams {
    if (points.length === 2) {
      const [p1, p2] = points;

      const dx = p2.target.x - p1.target.x;
      const dy = p2.target.y - p1.target.y;
      const sx = p2.source.x - p1.source.x;
      const sy = p2.source.y - p1.source.y;

      const scale = Math.sqrt((dx * dx + dy * dy) / (sx * sx + sy * sy));
      const rotation = Math.atan2(dy, dx) - Math.atan2(sy, sx);
      const offsetX = p1.target.x - (p1.source.x * scale * Math.cos(rotation) - p1.source.y * scale * Math.sin(rotation));
      const offsetY = p1.target.y - (p1.source.x * scale * Math.sin(rotation) + p1.source.y * scale * Math.cos(rotation));

      return {
        offsetX,
        offsetY,
        scale,
        rotation: (rotation * 180) / Math.PI,
        sourceCRS,
        targetCRS,
      };
    }

    const n = points.length;
    let sumX = 0, sumY = 0, sumXX = 0, sumYY = 0, sumXY = 0;
    let sumTX = 0, sumTY = 0, sumXTX = 0, sumXTY = 0, sumYTX = 0, sumYTY = 0;

    for (const p of points) {
      sumX += p.source.x;
      sumY += p.source.y;
      sumXX += p.source.x * p.source.x;
      sumYY += p.source.y * p.source.y;
      sumXY += p.source.x * p.source.y;
      sumTX += p.target.x;
      sumTY += p.target.y;
      sumXTX += p.source.x * p.target.x;
      sumXTY += p.source.x * p.target.y;
      sumYTX += p.source.y * p.target.x;
      sumYTY += p.source.y * p.target.y;
    }

    const det = n * (sumXX * sumYY - sumXY * sumXY) + 1e-10;

    const a = (sumYY * sumXTX - sumXY * sumYTX + (sumY * sumXY - sumX * sumYY) * sumTX / n) / det * n;
    const b = (-sumXY * sumXTX + sumXX * sumYTX + (sumX * sumXY - sumY * sumXX) * sumTX / n) / det * n;
    const c = (sumYY * sumXTY - sumXY * sumYTY + (sumY * sumXY - sumX * sumYY) * sumTY / n) / det * n;
    const d = (-sumXY * sumXTY + sumXX * sumYTY + (sumX * sumXY - sumY * sumXX) * sumTY / n) / det * n;

    const scale = Math.sqrt(a * a + c * c);
    const rotation = Math.atan2(c, a);
    const offsetX = (sumTX - a * sumX - c * sumY) / n;
    const offsetY = (sumTY - b * sumX - d * sumY) / n;

    return {
      offsetX,
      offsetY,
      scale,
      rotation: (rotation * 180) / Math.PI,
      sourceCRS,
      targetCRS,
    };
  }

  private _computeResidualError(points: CalibrationPoint[], params: CalibrationParams): number {
    const rad = (params.rotation * Math.PI) / 180;
    let totalError = 0;

    for (const p of points) {
      const scaledX = p.source.x * params.scale;
      const scaledY = p.source.y * params.scale;
      const rotX = scaledX * Math.cos(rad) - scaledY * Math.sin(rad) + params.offsetX;
      const rotY = scaledX * Math.sin(rad) + scaledY * Math.cos(rad) + params.offsetY;

      const dx = rotX - p.target.x;
      const dy = rotY - p.target.y;
      totalError += dx * dx + dy * dy;
    }

    return Math.sqrt(totalError / points.length);
  }
}
