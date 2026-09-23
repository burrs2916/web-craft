export type SnapType = 'endpoint' | 'midpoint' | 'center' | 'intersection';

export interface SnapPoint {
  x: number;
  y: number;
  type: SnapType;
  entityId: string;
  description: string; // 用于状态栏显示，如 "端点: (100.00, 200.00)"
  distance: number; // 距离鼠标的像素距离，用于排序
}

export interface SnapSettings {
  endpoint: boolean;
  midpoint: boolean;
  center: boolean;
  intersection: boolean;
  snapRadius: number; // 捕捉半径（像素）
}
