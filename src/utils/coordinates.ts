export interface Coordinate {
  x: number;
  y: number;
}

export interface Coordinate3D extends Coordinate {
  z: number;
}

export interface BoundingBox {
  min: Coordinate;
  max: Coordinate;
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

export function degreesToRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

export function radiansToDegrees(radians: number): number {
  return radians * (180 / Math.PI);
}

export function haversineDistance(point1: GeoPoint, point2: GeoPoint): number {
  const R = 6371; // 地球半径（公里）
  const dLat = degreesToRadians(point2.lat - point1.lat);
  const dLng = degreesToRadians(point2.lng - point1.lng);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(degreesToRadians(point1.lat)) *
      Math.cos(degreesToRadians(point2.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export function euclideanDistance(p1: Coordinate, p2: Coordinate): number {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

export function euclideanDistance3D(p1: Coordinate3D, p2: Coordinate3D): number {
  return Math.sqrt(
    Math.pow(p2.x - p1.x, 2) +
      Math.pow(p2.y - p1.y, 2) +
      Math.pow(p2.z - p1.z, 2)
  );
}

export function midpoint(p1: Coordinate, p2: Coordinate): Coordinate {
  return {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2,
  };
}

export function isPointInBoundingBox(point: Coordinate, box: BoundingBox): boolean {
  return (
    point.x >= box.min.x &&
    point.x <= box.max.x &&
    point.y >= box.min.y &&
    point.y <= box.max.y
  );
}

export function normalizeCoordinate(
  value: number,
  min: number,
  max: number
): number {
  return (value - min) / (max - min);
}

export function denormalizeCoordinate(
  normalized: number,
  min: number,
  max: number
): number {
  return normalized * (max - min) + min;
}

export function transformCoordinate(
  point: Coordinate,
  scale: number,
  offset: Coordinate
): Coordinate {
  return {
    x: point.x * scale + offset.x,
    y: point.y * scale + offset.y,
  };
}

export function inverseTransformCoordinate(
  point: Coordinate,
  scale: number,
  offset: Coordinate
): Coordinate {
  return {
    x: (point.x - offset.x) / scale,
    y: (point.y - offset.y) / scale,
  };
}
