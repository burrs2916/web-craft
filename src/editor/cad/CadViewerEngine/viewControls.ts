import { applyTransform, inverseTransform } from '../coordinate/TransformCalculator';
import type { TransformParams } from '../coordinate/TransformCalculator';
import type { CameraInfo } from '../CadRenderer';
import type { SpatialCoordinate } from '../../../types/spatial';
import type { CadViewerEngine } from './core';
import type { CadViewerEngineInternal } from './internal';

declare module './core' {
  interface CadViewerEngine {
    setBackgroundColor(color: string, opacity?: number): void;
    setLineColor(color: string): void;
    isDarkBackground(): boolean;
    getCursorWorldCoord(): { x: number; y: number } | null;
    getViewportWorldHeight(): number;
    getCameraInfo(): CameraInfo | null;
    /** 设置 CAD↔地理坐标变换参数（同时下发到 renderer）。 */
    setTransformParams(params: TransformParams | null): void;
    getTransformParams(): TransformParams | null;
    /** CAD 坐标 → 地理坐标。 */
    cadToGeo(cadCoord: SpatialCoordinate): SpatialCoordinate | null;
    /** 地理坐标 → CAD 坐标。 */
    geoToCad(geoCoord: SpatialCoordinate): SpatialCoordinate | null;

    /** @deprecated Use engine.renderer?.xxx() instead */
    zoomIn(): void;
    /** @deprecated Use engine.renderer?.xxx() instead */
    zoomOut(): void;
    /** @deprecated Use engine.renderer?.xxx() instead */
    fitToView(): void;
    /** @deprecated Use engine.renderer?.xxx() instead */
    setFitMode(mode: 'contain' | 'cover' | 'stretch' | 'custom'): void;
    /** @deprecated Use engine.renderer?.xxx() instead */
    getFitMode(): 'contain' | 'cover' | 'stretch' | 'custom';
    /** @deprecated Use engine.renderer?.xxx() instead */
    getCameraState(): { centerX: number; centerY: number; halfW: number; halfH: number } | null;
    /** @deprecated Use engine.renderer?.xxx() instead */
    getDrawingBounds(): { minX: number; minY: number; maxX: number; maxY: number } | null;
    /** @deprecated Use engine.renderer?.xxx() instead */
    setCameraState(state: { centerX: number; centerY: number; halfW: number; halfH: number }): void;
    /** @deprecated Use engine.renderer?.xxx() instead */
    setLayerVisible(layerName: string, visible: boolean): void;
    /** @deprecated Use engine.renderer?.xxx() instead */
    setMultipleLayersVisible(changes: Array<{ layerName: string; visible: boolean }>): void;
    /** @deprecated Use engine.renderer?.xxx() instead */
    isLayerVisible(layerName: string): boolean;
    /** @deprecated Use engine.renderer?.xxx() instead */
    getLayers(): string[];
    /** @deprecated Use engine.renderer?.xxx() instead */
    selectEntity(entityId: string, additive?: boolean): void;
    /** @deprecated Use engine.renderer?.xxx() instead */
    deselectEntity(entityId?: string): void;
    /** @deprecated Use engine.renderer?.xxx() instead */
    deselectAll(): void;
    /** @deprecated Use engine.renderer?.xxx() instead */
    getSelectedEntityIds(): string[];
    /** @deprecated Use engine.renderer?.xxx() instead */
    selectEntitiesInRect(minX: number, minY: number, maxX: number, maxY: number, additive?: boolean): string[];
    /** @deprecated Use engine.renderer?.xxx() instead */
    setInteractionMode(mode: 'select' | 'pan' | 'draw_line' | 'draw_circle' | 'draw_text'): void;
    /** @deprecated Use engine.renderer?.xxx() instead */
    getInteractionMode(): 'select' | 'pan' | 'draw_line' | 'draw_circle' | 'draw_text';
    /** @deprecated Use engine.renderer?.xxx() instead */
    getSelectedEntityId(): string | null;
    /** @deprecated Use engine.renderer?.xxx() instead */
    setDebugMode(enabled: boolean): void;
    /** @deprecated Use engine.renderer?.xxx() instead */
    setSnapEnabled(type: string, enabled: boolean): void;
    /** @deprecated Use engine.renderer?.xxx() instead */
    getSnapManager(): import('../snap/SnapManager').SnapManager | null;
  }
}

export const viewControlMethods = {
  setBackgroundColor(this: CadViewerEngine, color: string, opacity?: number): void {
    const f = this as unknown as CadViewerEngineInternal;
    f._renderer?.setBackgroundColor(color, opacity);
  },

  setLineColor(this: CadViewerEngine, color: string): void {
    const f = this as unknown as CadViewerEngineInternal;
    f._renderer?.setLineColor(color);
  },

  isDarkBackground(this: CadViewerEngine): boolean {
    const f = this as unknown as CadViewerEngineInternal;
    return f._renderer?.isDarkBackground() ?? true;
  },

  getCursorWorldCoord(this: CadViewerEngine): { x: number; y: number } | null {
    const f = this as unknown as CadViewerEngineInternal;
    return f._renderer?.getLastWorldCoord() ?? null;
  },

  getViewportWorldHeight(this: CadViewerEngine): number {
    const f = this as unknown as CadViewerEngineInternal;
    const info = f._renderer?.getCameraInfo();
    return info?.worldHeight ?? 100;
  },

  getCameraInfo(this: CadViewerEngine): CameraInfo | null {
    const f = this as unknown as CadViewerEngineInternal;
    return f._renderer?.getCameraInfo() ?? null;
  },

  setTransformParams(this: CadViewerEngine, params: TransformParams | null): void {
    const f = this as unknown as CadViewerEngineInternal;
    f._transformParams = params;
    // 传递到渲染器，确保文字等实体也被正确变换
    if (f._renderer) {
      f._renderer.setTransformParams(params);
    }
  },

  getTransformParams(this: CadViewerEngine): TransformParams | null {
    const f = this as unknown as CadViewerEngineInternal;
    return f._transformParams;
  },

  cadToGeo(this: CadViewerEngine, cadCoord: SpatialCoordinate): SpatialCoordinate | null {
    const f = this as unknown as CadViewerEngineInternal;
    if (!f._transformParams) return null;
    return applyTransform(cadCoord, f._transformParams);
  },

  geoToCad(this: CadViewerEngine, geoCoord: SpatialCoordinate): SpatialCoordinate | null {
    const f = this as unknown as CadViewerEngineInternal;
    if (!f._transformParams) return null;
    return inverseTransform(geoCoord, f._transformParams);
  },

  /** @deprecated Use engine.renderer?.xxx() instead */
  zoomIn(this: CadViewerEngine): void { (this as unknown as CadViewerEngineInternal)._renderer?.zoomIn(); },
  /** @deprecated Use engine.renderer?.xxx() instead */
  zoomOut(this: CadViewerEngine): void { (this as unknown as CadViewerEngineInternal)._renderer?.zoomOut(); },
  /** @deprecated Use engine.renderer?.xxx() instead */
  fitToView(this: CadViewerEngine): void { (this as unknown as CadViewerEngineInternal)._renderer?.fitToView(); },
  /** @deprecated Use engine.renderer?.xxx() instead */
  setFitMode(this: CadViewerEngine, mode: 'contain' | 'cover' | 'stretch' | 'custom'): void { (this as unknown as CadViewerEngineInternal)._renderer?.setFitMode(mode); },
  /** @deprecated Use engine.renderer?.xxx() instead */
  getFitMode(this: CadViewerEngine) { return (this as unknown as CadViewerEngineInternal)._renderer?.getFitMode() ?? 'contain' as const; },
  /** @deprecated Use engine.renderer?.xxx() instead */
  getCameraState(this: CadViewerEngine) { return (this as unknown as CadViewerEngineInternal)._renderer?.getCameraState() ?? null; },
  /** @deprecated Use engine.renderer?.xxx() instead */
  getDrawingBounds(this: CadViewerEngine) { return (this as unknown as CadViewerEngineInternal)._renderer?.getDrawingBounds() ?? null; },
  /** @deprecated Use engine.renderer?.xxx() instead */
  setCameraState(this: CadViewerEngine, state: { centerX: number; centerY: number; halfW: number; halfH: number }): void { (this as unknown as CadViewerEngineInternal)._renderer?.setCameraState(state); },
  /** @deprecated Use engine.renderer?.xxx() instead */
  setLayerVisible(this: CadViewerEngine, layerName: string, visible: boolean): void { (this as unknown as CadViewerEngineInternal)._renderer?.setLayerVisible(layerName, visible); },
  /** @deprecated Use engine.renderer?.xxx() instead */
  setMultipleLayersVisible(this: CadViewerEngine, changes: Array<{ layerName: string; visible: boolean }>): void { (this as unknown as CadViewerEngineInternal)._renderer?.setMultipleLayersVisible(changes); },
  /** @deprecated Use engine.renderer?.xxx() instead */
  isLayerVisible(this: CadViewerEngine, layerName: string): boolean { return (this as unknown as CadViewerEngineInternal)._renderer?.isLayerVisible(layerName) ?? true; },
  /** @deprecated Use engine.renderer?.xxx() instead */
  getLayers(this: CadViewerEngine): string[] { return (this as unknown as CadViewerEngineInternal)._renderer?.getLayers() ?? []; },
  /** @deprecated Use engine.renderer?.xxx() instead */
  selectEntity(this: CadViewerEngine, entityId: string, additive = false): void { (this as unknown as CadViewerEngineInternal)._renderer?.selectEntity(entityId, additive); },
  /** @deprecated Use engine.renderer?.xxx() instead */
  deselectEntity(this: CadViewerEngine, entityId?: string): void { entityId ? (this as unknown as CadViewerEngineInternal)._renderer?.deselectEntity(entityId) : (this as unknown as CadViewerEngineInternal)._renderer?.deselectAll(); },
  /** @deprecated Use engine.renderer?.xxx() instead */
  deselectAll(this: CadViewerEngine): void { (this as unknown as CadViewerEngineInternal)._renderer?.deselectAll(); },
  /** @deprecated Use engine.renderer?.xxx() instead */
  getSelectedEntityIds(this: CadViewerEngine): string[] { return (this as unknown as CadViewerEngineInternal)._renderer?.getSelectedEntityIds() ?? []; },
  /** @deprecated Use engine.renderer?.xxx() instead */
  selectEntitiesInRect(this: CadViewerEngine, minX: number, minY: number, maxX: number, maxY: number, additive = false): string[] { return (this as unknown as CadViewerEngineInternal)._renderer?.selectEntitiesInRect(minX, minY, maxX, maxY, additive) ?? []; },
  /** @deprecated Use engine.renderer?.xxx() instead */
  setInteractionMode(this: CadViewerEngine, mode: 'select' | 'pan' | 'draw_line' | 'draw_circle' | 'draw_text'): void { (this as unknown as CadViewerEngineInternal)._renderer?.setInteractionMode(mode); },
  /** @deprecated Use engine.renderer?.xxx() instead */
  getInteractionMode(this: CadViewerEngine) { return (this as unknown as CadViewerEngineInternal)._renderer?.getInteractionMode() ?? 'select' as const; },
  /** @deprecated Use engine.renderer?.xxx() instead */
  getSelectedEntityId(this: CadViewerEngine): string | null { return (this as unknown as CadViewerEngineInternal)._renderer?.getSelectedEntityId() ?? null; },
  /** @deprecated Use engine.renderer?.xxx() instead */
  setDebugMode(this: CadViewerEngine, enabled: boolean): void { (this as unknown as CadViewerEngineInternal)._renderer?.setDebugMode(enabled); },
  /** @deprecated Use engine.renderer?.xxx() instead */
  setSnapEnabled(this: CadViewerEngine, type: string, enabled: boolean): void { (this as unknown as CadViewerEngineInternal)._renderer?.setSnapEnabled(type, enabled); },
  /** @deprecated Use engine.renderer?.xxx() instead */
  getSnapManager(this: CadViewerEngine): import('../snap/SnapManager').SnapManager | null { return (this as unknown as CadViewerEngineInternal)._renderer?.getSnapManager() ?? null; },
};