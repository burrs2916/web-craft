import type { SpatialCoordinate } from "../../../types/spatial";

export interface ControlPoint {
  id: string;
  cadCoordinate: SpatialCoordinate;
  geoCoordinate: SpatialCoordinate;
  label?: string;
}

export interface TransformParams {
  offsetX: number;
  offsetY: number;
  scale: number;
  rotation: number;
}

export interface TransformResult {
  params: TransformParams;
  residuals: number[];
  rmsError: number;
  pointCount: number;
}

export function calculateAffineTransform(controlPoints: ControlPoint[]): TransformResult | null {
  if (controlPoints.length < 2) return null;

  const n = controlPoints.length;
  const cx = controlPoints.map(p => p.cadCoordinate.x);
  const cy = controlPoints.map(p => p.cadCoordinate.y);
  const gx = controlPoints.map(p => p.geoCoordinate.x);
  const gy = controlPoints.map(p => p.geoCoordinate.y);

  const sumCx = cx.reduce((a, b) => a + b, 0);
  const sumCy = cy.reduce((a, b) => a + b, 0);
  const sumGx = gx.reduce((a, b) => a + b, 0);
  const sumGy = gy.reduce((a, b) => a + b, 0);

  const meanCx = sumCx / n;
  const meanCy = sumCy / n;
  const meanGx = sumGx / n;
  const meanGy = sumGy / n;

  let sxx = 0, sxy = 0, syx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dcx = cx[i] - meanCx;
    const dcy = cy[i] - meanCy;
    const dgx = gx[i] - meanGx;
    const dgy = gy[i] - meanGy;
    sxx += dcx * dgx;
    sxy += dcy * dgx;
    syx += dcx * dgy;
    syy += dcy * dgy;
  }

  const denom = sxx * sxx + sxy * sxy;
  if (Math.abs(denom) < 1e-15) return null;

  const a = (sxx * syy - sxy * syx) / denom;
  const b = (sxx * syx + sxy * syy) / denom;

  const scale = Math.sqrt(a * a + b * b);
  const rotation = Math.atan2(b, a);
  const offsetX = meanGx - a * meanCx - b * meanCy;
  const offsetY = meanGy + b * meanCx - a * meanCy;

  const residuals: number[] = [];
  let sumSqResidual = 0;
  for (let i = 0; i < n; i++) {
    const predGx = a * cx[i] - b * cy[i] + offsetX;
    const predGy = b * cx[i] + a * cy[i] + offsetY;
    const dx = gx[i] - predGx;
    const dy = gy[i] - predGy;
    const residual = Math.sqrt(dx * dx + dy * dy);
    residuals.push(residual);
    sumSqResidual += residual * residual;
  }

  const rmsError = Math.sqrt(sumSqResidual / n);

  return {
    params: { offsetX, offsetY, scale, rotation },
    residuals,
    rmsError,
    pointCount: n,
  };
}

export function applyTransform(
  cadCoord: SpatialCoordinate,
  params: TransformParams
): SpatialCoordinate {
  const { offsetX, offsetY, scale, rotation } = params;
  const cosR = Math.cos(rotation);
  const sinR = Math.sin(rotation);
  const a = scale * cosR;
  const b = scale * sinR;

  return {
    x: a * cadCoord.x - b * cadCoord.y + offsetX,
    y: b * cadCoord.x + a * cadCoord.y + offsetY,
  };
}

export function inverseTransform(
  geoCoord: SpatialCoordinate,
  params: TransformParams
): SpatialCoordinate {
  const { offsetX, offsetY, scale, rotation } = params;
  const cosR = Math.cos(rotation);
  const sinR = Math.sin(rotation);
  const a = scale * cosR;
  const b = scale * sinR;

  const dx = geoCoord.x - offsetX;
  const dy = geoCoord.y - offsetY;
  const denom = a * a + b * b;

  return {
    x: (a * dx + b * dy) / denom,
    y: (a * dy - b * dx) / denom,
  };
}

export function cadToGeo(
  cadCoord: SpatialCoordinate,
  params: TransformParams,
  _targetCRS?: string
): SpatialCoordinate {
  return applyTransform(cadCoord, params);
}

export function geoToCad(
  geoCoord: SpatialCoordinate,
  params: TransformParams,
  _sourceCRS?: string
): SpatialCoordinate {
  return inverseTransform(geoCoord, params);
}
