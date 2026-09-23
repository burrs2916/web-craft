import type { CRSType, SpatialCoordinate } from "../../types/spatial";
import type { CoordinateEngine } from "./CoordinateEngine";

export interface ViewportProvider {
  readonly id: string;
  readonly crs: CRSType;
  getViewport(): ViewportSnapshot;
  setViewport(snapshot: ViewportSnapshot): void;
  onViewportChange(handler: ViewportChangeHandler): () => void;
}

export interface ViewportSnapshot {
  centerX: number;
  centerY: number;
  zoom: number;
  bearing: number;
  pitch: number;
  width: number;
  height: number;
  crs: CRSType;
}

export type ViewportChangeHandler = (snapshot: ViewportSnapshot, sourceId: string) => void;

export interface ViewportSyncRule {
  sourceId: string;
  targetId: string;
  enabled: boolean;
  syncPosition: boolean;
  syncZoom: boolean;
  syncBearing: boolean;
  coordinateTransform?: 'auto' | 'none';
}

export class ViewportSyncService {
  private providers: Map<string, ViewportProvider> = new Map();
  private syncRules: Map<string, ViewportSyncRule> = new Map();
  private unsubscriptions: Map<string, () => void> = new Map();
  private syncing: boolean = false;
  private coordinateEngine: CoordinateEngine | null = null;

  setCoordinateEngine(engine: CoordinateEngine): void {
    this.coordinateEngine = engine;
  }

  registerProvider(provider: ViewportProvider): void {
    if (this.providers.has(provider.id)) {
      this.unregisterProvider(provider.id);
    }

    this.providers.set(provider.id, provider);

    const unsub = provider.onViewportChange((snapshot, sourceId) => {
      this.handleViewportChange(snapshot, sourceId);
    });
    this.unsubscriptions.set(provider.id, unsub);
  }

  unregisterProvider(providerId: string): void {
    const unsub = this.unsubscriptions.get(providerId);
    if (unsub) {
      unsub();
      this.unsubscriptions.delete(providerId);
    }
    this.providers.delete(providerId);
  }

  getProvider(providerId: string): ViewportProvider | undefined {
    return this.providers.get(providerId);
  }

  getAllProviders(): ViewportProvider[] {
    return Array.from(this.providers.values());
  }

  addSyncRule(rule: ViewportSyncRule): void {
    this.syncRules.set(`${rule.sourceId}->${rule.targetId}`, rule);
  }

  removeSyncRule(sourceId: string, targetId: string): void {
    this.syncRules.delete(`${sourceId}->${targetId}`);
  }

  syncViewports(sourceId: string, targetId: string): void {
    const source = this.providers.get(sourceId);
    const target = this.providers.get(targetId);
    if (!source || !target) return;

    const snapshot = source.getViewport();
    this.applySync(snapshot, sourceId, targetId, target);
  }

  syncAllFrom(sourceId: string, snapshot?: ViewportSnapshot): void {
    let vp = snapshot;
    if (!vp) {
      const source = this.providers.get(sourceId);
      if (!source) return;
      vp = source.getViewport();
    }

    this.syncRules.forEach((rule, key) => {
      if (!rule.enabled || key.startsWith(sourceId + '->')) {
        const target = this.providers.get(rule.targetId);
        if (target) {
          this.applySync(vp!, sourceId, rule.targetId, target);
        }
      }
    });

    this.providers.forEach((provider, providerId) => {
      if (providerId === sourceId) return;
      const hasRule = Array.from(this.syncRules.keys()).some(k => k.startsWith(sourceId + '->') && k.endsWith('->' + providerId));
      if (!hasRule) {
        this.applySync(vp!, sourceId, providerId, provider);
      }
    });
  }

  private handleViewportChange(snapshot: ViewportSnapshot, sourceId: string): void {
    if (this.syncing) return;

    this.globalViewportHandlers.forEach(handler => {
      try {
        handler(snapshot, sourceId);
      } catch (err) {
        console.error('[ViewportSyncService] Global viewport handler error:', err);
      }
    });

    this.syncing = true;
    try {
      this.syncRules.forEach((rule, key) => {
        if (!rule.enabled) return;
        if (!key.startsWith(sourceId + '->')) return;

        const target = this.providers.get(rule.targetId);
        if (target) {
          this.applySync(snapshot, sourceId, rule.targetId, target);
        }
      });
    } finally {
      this.syncing = false;
    }
  }

  private applySync(snapshot: ViewportSnapshot, sourceId: string, targetId: string, target: ViewportProvider): void {
    const rule = this.syncRules.get(`${sourceId}->${targetId}`);
    if (rule && !rule.enabled) return;

    const current = target.getViewport();
    const needsCRSTransform = snapshot.crs !== current.crs && this.coordinateEngine && (!rule || rule.coordinateTransform === 'auto');

    const update: Partial<ViewportSnapshot> = {};

    if (!rule || rule.syncPosition) {
      if (needsCRSTransform) {
        const transformedCenter = this.transformCenter(snapshot.centerX, snapshot.centerY, snapshot.crs, current.crs);
        update.centerX = transformedCenter.x;
        update.centerY = transformedCenter.y;
      } else {
        update.centerX = snapshot.centerX;
        update.centerY = snapshot.centerY;
      }
    }

    if (!rule || rule.syncZoom) {
      if (needsCRSTransform) {
        update.zoom = this.transformZoom(snapshot.zoom, snapshot.crs, current.crs);
      } else {
        update.zoom = snapshot.zoom;
      }
    }

    if (!rule || rule.syncBearing) {
      update.bearing = snapshot.bearing;
    }

    const newSnapshot: ViewportSnapshot = {
      ...current,
      ...update,
    };

    target.setViewport(newSnapshot);
  }

  private transformCenter(x: number, y: number, fromCRS: CRSType, toCRS: CRSType): SpatialCoordinate {
    if (!this.coordinateEngine) {
      return { x, y };
    }

    try {
      return this.coordinateEngine.transform({ x, y }, fromCRS, toCRS);
    } catch (err) {
      console.warn(`[ViewportSyncService] CRS transform failed (${fromCRS} -> ${toCRS}):`, err);
      return { x, y };
    }
  }

  private transformZoom(zoom: number, fromCRS: CRSType, toCRS: CRSType): number {
    if (fromCRS === toCRS) return zoom;

    if (this.coordinateEngine) {
      const scaleFactor = this.coordinateEngine.getScaleFactor(fromCRS, toCRS);
      if (scaleFactor !== 1 && isFinite(scaleFactor)) {
        return zoom * scaleFactor;
      }

      if (fromCRS === 'local' || toCRS === 'local') {
        const localCRS = fromCRS === 'local' ? fromCRS : toCRS;
        const calibration = this.coordinateEngine.getCalibration(localCRS as string);
        if (calibration && calibration.scale > 0) {
          return fromCRS === 'local' ? zoom * calibration.scale : zoom / calibration.scale;
        }
      }
    }

    if (fromCRS === 'local' || toCRS === 'local') {
      const localCRS = fromCRS === 'local' ? fromCRS : toCRS;
      const customCRS = this.coordinateEngine?.getCustomCRS(localCRS as string);
      if (customCRS?.unit === 'millimeter') {
        const defaultMmToMeter = 0.001;
        console.warn(
          `[ViewportSyncService] Using fallback mm->meter scale (${defaultMmToMeter}) for CRS "${localCRS}". ` +
          `Register calibration via CoordinateEngine.registerCustomCRS() for accurate zoom sync.`
        );
        return fromCRS === 'local' ? zoom * defaultMmToMeter : zoom / defaultMmToMeter;
      }
      if (customCRS?.unit === 'pixel') {
        return zoom;
      }
    }

    return zoom;
  }

  private globalViewportHandlers: Set<(snapshot: ViewportSnapshot, sourceId: string) => void> = new Set();

  onGlobalViewportChange(handler: (snapshot: ViewportSnapshot, sourceId: string) => void): () => void {
    this.globalViewportHandlers.add(handler);
    return () => {
      this.globalViewportHandlers.delete(handler);
    };
  }

  destroy(): void {
    this.unsubscriptions.forEach(unsub => unsub());
    this.unsubscriptions.clear();
    this.providers.clear();
    this.syncRules.clear();
  }
}

export const viewportSyncService = new ViewportSyncService();
