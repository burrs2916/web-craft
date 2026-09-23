import { create } from "zustand";
import type { SpatialCoordinate, CRSType } from "../../../types/spatial";
import type { ControlPoint, TransformParams, TransformResult } from "./TransformCalculator";
import { calculateAffineTransform } from "./TransformCalculator";

export interface CalibrationState {
  controlPoints: ControlPoint[];
  transformResult: TransformResult | null;
  targetCRS: CRSType;
  isCalibrating: boolean;
  selectedPointId: string | null;

  addControlPoint: (cadCoord: SpatialCoordinate, geoCoord: SpatialCoordinate, label?: string) => void;
  removeControlPoint: (id: string) => void;
  updateControlPoint: (id: string, updates: Partial<Pick<ControlPoint, "cadCoordinate" | "geoCoordinate" | "label">>) => void;
  calculateTransform: () => TransformResult | null;
  setTargetCRS: (crs: CRSType) => void;
  setCalibrating: (value: boolean) => void;
  setSelectedPointId: (id: string | null) => void;
  getTransformParams: () => TransformParams | null;
  clearAll: () => void;
}

let pointCounter = 0;

export const useCalibrationStore = create<CalibrationState>((set, get) => ({
  controlPoints: [],
  transformResult: null,
  targetCRS: "EPSG:4326",
  isCalibrating: false,
  selectedPointId: null,

  addControlPoint: (cadCoord, geoCoord, label) => {
    pointCounter++;
    const newPoint: ControlPoint = {
      id: `cp_${Date.now()}_${pointCounter}`,
      cadCoordinate: cadCoord,
      geoCoordinate: geoCoord,
      label: label || `控制点 ${pointCounter}`,
    };
    set(state => {
      const points = [...state.controlPoints, newPoint];
      const result = calculateAffineTransform(points);
      return { controlPoints: points, transformResult: result };
    });
  },

  removeControlPoint: (id) => {
    set(state => {
      const points = state.controlPoints.filter(p => p.id !== id);
      const result = points.length >= 2 ? calculateAffineTransform(points) : null;
      return { controlPoints: points, transformResult: result, selectedPointId: state.selectedPointId === id ? null : state.selectedPointId };
    });
  },

  updateControlPoint: (id, updates) => {
    set(state => {
      const points = state.controlPoints.map(p => p.id === id ? { ...p, ...updates } : p);
      const result = calculateAffineTransform(points);
      return { controlPoints: points, transformResult: result };
    });
  },

  calculateTransform: () => {
    const { controlPoints } = get();
    const result = calculateAffineTransform(controlPoints);
    set({ transformResult: result });
    return result;
  },

  setTargetCRS: (crs) => set({ targetCRS: crs }),
  setCalibrating: (value) => set({ isCalibrating: value }),
  setSelectedPointId: (id) => set({ selectedPointId: id }),

  getTransformParams: () => {
    const { transformResult, controlPoints } = get();
    if (transformResult) return transformResult.params;
    if (controlPoints.length >= 2) {
      const result = calculateAffineTransform(controlPoints);
      set({ transformResult: result });
      return result?.params ?? null;
    }
    return null;
  },

  clearAll: () => {
    pointCounter = 0;
    set({ controlPoints: [], transformResult: null, selectedPointId: null });
  },
}));
