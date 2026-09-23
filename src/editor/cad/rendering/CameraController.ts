import * as THREE from 'three';
import type { BoundingBox } from '../cad_runtime/scene_node';
import type { CadPoint } from '../types';
import { logger } from '../../../utils/logger';

export interface CameraInfo {
  centerX: number;
  centerY: number;
  worldWidth: number;
  worldHeight: number;
  zoom: number;
}

export interface CameraState {
  centerX: number;
  centerY: number;
  halfW: number;
  halfH: number;
}

export type FitMode = 'contain' | 'cover' | 'stretch' | 'custom';

export interface CameraControllerConfig {
  canvasEl: HTMLCanvasElement;
  getContainerSize: () => { width: number; height: number };
}

/**
 * CameraController — 正交相机状态机
 *
 * 职责：缩放、平移、fitToView、相机退化自恢复、缩放范围钳位
 * 依赖：需要画布尺寸（通过回调获取，不直接依赖 SceneManager）
 *
 * 设计要点：
 * - 持有唯一的 THREE.OrthographicCamera
 * - 通过事件回调通知外部（cameraChanged / cameraInteractionEnd）
 * - 所有坐标验证都在内部完成，不信任外部传入的参数
 */
export class CameraController {
  readonly camera: THREE.OrthographicCamera;

  private _canvasEl: HTMLCanvasElement;
  private _getContainerSize: () => { width: number; height: number };

  private _fitMode: FitMode = 'contain';
  private _initialSpan = 0;
  private readonly _MIN_SPAN_RATIO = 0.01;
  private readonly _MAX_SPAN_RATIO = 100;

  // 事件
  private _onCameraChanged: ((info: CameraInfo) => void) | null = null;
  private _onCameraInteractionEnd: ((info: CameraInfo) => void) | null = null;
  private _cameraInteractionEndTimer: ReturnType<typeof setTimeout> | null = null;
  private _lastCameraEmit = 0;

  // 缩放防抖
  private _wheelPending = false;
  private _wheelZoomFactor = 1.0;
  private _wheelWorldX = 0;
  private _wheelWorldY = 0;

  // 平移状态
  private _isPanning = false;
  private _panStart = new THREE.Vector2();
  private _cameraStart = new THREE.Vector2();

  // 自恢复标志
  private _isRecoveringCamera = false;

  constructor(config: CameraControllerConfig) {
    this._canvasEl = config.canvasEl;
    this._getContainerSize = config.getContainerSize;

    const { width: cw, height: ch } = config.getContainerSize();
    const aspect = (cw || 1) / (ch || 1);
    const frustumSize = 1000;

    this.camera = new THREE.OrthographicCamera(
      -frustumSize * aspect / 2,
      frustumSize * aspect / 2,
      frustumSize / 2,
      -frustumSize / 2,
      0.1,
      100000,
    );
    this.camera.position.set(0, 0, 1000);
    this.camera.lookAt(0, 0, 0);
  }

  // ── 事件注册 ──

  onCameraChanged(cb: (info: CameraInfo) => void): void {
    this._onCameraChanged = cb;
  }

  onCameraInteractionEnd(cb: (info: CameraInfo) => void): void {
    this._onCameraInteractionEnd = cb;
  }

  // ── 基础查询 ──

  getCameraInfo(): CameraInfo {
    const width = this.camera.right - this.camera.left;
    const height = this.camera.top - this.camera.bottom;
    return {
      centerX: this.camera.position.x,
      centerY: this.camera.position.y,
      worldWidth: width,
      worldHeight: height,
      zoom: this._initialSpan > 0 ? this._initialSpan / Math.max(width, height) : 1,
    };
  }

  getCameraState(): CameraState {
    return {
      centerX: this.camera.position.x,
      centerY: this.camera.position.y,
      halfW: this.camera.right,
      halfH: this.camera.top,
    };
  }

  setCameraState(state: CameraState): void {
    if (!this._isValidNumber(state.centerX) || !this._isValidNumber(state.centerY) ||
        !this._isValidNumber(state.halfW) || !this._isValidNumber(state.halfH) ||
        state.halfW <= 0 || state.halfH <= 0) {
      logger.warn('CameraController', 'setCameraState: invalid state', state as unknown as Record<string, unknown>);
      return;
    }
    this.camera.position.set(state.centerX, state.centerY, this.camera.position.z);
    this.camera.left = -state.halfW;
    this.camera.right = state.halfW;
    this.camera.top = state.halfH;
    this.camera.bottom = -state.halfH;
    this.camera.updateProjectionMatrix();
    this._emitCameraChanged();
  }

  getFitMode(): FitMode { return this._fitMode; }

  setFitMode(mode: FitMode): void {
    this._fitMode = mode;
  }

  get isPanning(): boolean { return this._isPanning; }
  get isRecoveringCamera(): boolean { return this._isRecoveringCamera; }

  /** 手动触发一次相机变更事件（供加载完成后调用） */
  emitCameraChanged(): void {
    this._emitCameraChanged();
  }

  // ── 缩放 ──

  zoomIn(): void {
    const factor = 0.8;
    this._applyZoom(factor);
  }

  zoomOut(): void {
    const factor = 1.25;
    this._applyZoom(factor);
  }

  /**
   * 处理 wheel 事件的缩放请求。
   * 返回 true 如果消费了事件，false 表示相机已退化需要外部 fitToView。
   */
  handleWheel(e: WheelEvent): boolean {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
    this._wheelZoomFactor *= zoomFactor;

    const rect = this._canvasEl.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this._wheelWorldX = this.camera.position.x + mouseX * (this.camera.right - this.camera.left) / 2;
    this._wheelWorldY = this.camera.position.y + mouseY * (this.camera.top - this.camera.bottom) / 2;

    if (!this._wheelPending) {
      this._wheelPending = true;
      requestAnimationFrame(() => {
        this._wheelPending = false;
        const zf = this._wheelZoomFactor;
        this._wheelZoomFactor = 1.0;
        if (zf === 1.0) return;

        if (this.camera.left >= this.camera.right || this.camera.bottom >= this.camera.top) {
          return; // 退化，让外部处理
        }

        this._applyZoomClamped(zf);
      });
    }
    return true;
  }

  private _applyZoom(factor: number): void {
    this.camera.left *= factor;
    this.camera.right *= factor;
    this.camera.top *= factor;
    this.camera.bottom *= factor;
    this.camera.updateProjectionMatrix();
    this._emitCameraChanged();
  }

  private _applyZoomClamped(zf: number): void {
    const oldSpanX = this.camera.right - this.camera.left;
    const oldSpanY = this.camera.top - this.camera.bottom;

    if (this._initialSpan <= 0) {
      this._initialSpan = Math.max(oldSpanX, oldSpanY);
    }

    const minSpan = this._initialSpan * this._MIN_SPAN_RATIO;
    const maxSpan = this._initialSpan * this._MAX_SPAN_RATIO;

    const minZf = minSpan / Math.min(oldSpanX, oldSpanY);
    const maxZf = maxSpan / Math.max(oldSpanX, oldSpanY);
    const appliedZf = Math.max(minZf, Math.min(maxZf, zf));

    const newSpanX = oldSpanX * appliedZf;
    const newSpanY = oldSpanY * appliedZf;
    const halfNewX = newSpanX / 2;
    const halfNewY = newSpanY / 2;

    // 以鼠标位置为缩放中心
    const cx = this._wheelWorldX;
    const cy = this._wheelWorldY;
    const ratioX = (cx - this.camera.position.x) / oldSpanX;
    const ratioY = (cy - this.camera.position.y) / oldSpanY;
    const newCenterX = cx - ratioX * newSpanX;
    const newCenterY = cy - ratioY * newSpanY;

    this.camera.position.set(newCenterX, newCenterY, this.camera.position.z);
    this.camera.left = -halfNewX;
    this.camera.right = halfNewX;
    this.camera.top = halfNewY;
    this.camera.bottom = -halfNewY;
    this.camera.updateProjectionMatrix();

    this._emitCameraChanged();
    this._scheduleCameraInteractionEnd();
  }

  // ── 平移 ──

  startPan(clientX: number, clientY: number): void {
    this._isPanning = true;
    this._panStart.set(clientX, clientY);
    this._cameraStart.set(this.camera.position.x, this.camera.position.y);
  }

  updatePan(clientX: number, clientY: number): void {
    if (!this._isPanning) return;
    const rect = this._canvasEl.getBoundingClientRect();
    const dx = ((clientX - this._panStart.x) / rect.width) * (this.camera.right - this.camera.left);
    const dy = ((clientY - this._panStart.y) / rect.height) * (this.camera.top - this.camera.bottom);
    this.camera.position.set(this._cameraStart.x - dx, this._cameraStart.y + dy, this.camera.position.z);
    this.camera.updateProjectionMatrix();
    this._emitCameraChanged();
  }

  endPan(): void {
    if (!this._isPanning) return;
    this._isPanning = false;
    this._scheduleCameraInteractionEnd();
  }

  // ── fitToView 系列 ──

  fitToView(bounds: BoundingBox | null, externalBounds?: BoundingBox | null): void {
    this._initialSpan = 0;

    const bb = this._mergeBounds(bounds, externalBounds);
    if (bb && this._isValidBoundingBox(bb)) {
      const width = bb.maxX - bb.minX;
      const height = bb.maxY - bb.minY;
      if (width > 0 && height > 0 && this._isValidNumber(width) && this._isValidNumber(height)) {
        this._applyExtents(
          { x: bb.minX, y: bb.minY, z: 0 },
          { x: bb.maxX, y: bb.maxY, z: 0 },
        );
        return;
      }
    }

    // Fallback：重置到默认视图
    this._resetToDefaultView();
  }

  /**
   * 用实体 bounds 做 fitToView
   */
  fitToEntities(nodeBounds: BoundingBox | null, meshBoundsCallback?: () => THREE.Box3 | null): void {
    if (!nodeBounds && meshBoundsCallback) {
      const box = meshBoundsCallback();
      if (box && !box.isEmpty()) {
        this._applyExtents(
          { x: box.min.x, y: box.min.y, z: 0 },
          { x: box.max.x, y: box.max.y, z: 0 },
        );
        return;
      }
    }

    if (nodeBounds && this._isValidBoundingBox(nodeBounds)) {
      this._applyExtents(
        { x: nodeBounds.minX, y: nodeBounds.minY, z: 0 },
        { x: nodeBounds.maxX, y: nodeBounds.maxY, z: 0 },
      );
      return;
    }

    this._resetToDefaultView();
  }

  resetToDefaultView(): void {
    this._resetToDefaultView();
  }

  /**
   * 检查相机是否退化，若退化则尝试 fitToView 恢复。
   * 返回 true 表示已退化并尝试恢复。
   */
  checkDegenerateAndRecover(fitBounds: BoundingBox | null, externalBounds?: BoundingBox | null): boolean {
    if (this.camera.left >= this.camera.right || this.camera.bottom >= this.camera.top) {
      logger.warn('CameraController', 'Degenerate camera detected, recovering');
      this._isRecoveringCamera = true;
      try {
        this.fitToView(fitBounds, externalBounds);
      } finally {
        this._isRecoveringCamera = false;
      }
      return true;
    }
    return false;
  }

  // ── resize 联动 ──

  onResize(): void {
    const { width: cw, height: ch } = this._getContainerSize();
    if (cw === 0 || ch === 0) return;

    if (this._fitMode === 'custom') {
      const oldAspect = (this.camera.right - this.camera.left) / (this.camera.top - this.camera.bottom);
      const newAspect = cw / ch;
      if (Math.abs(oldAspect - newAspect) > 0.001) {
        const halfH = (this.camera.top - this.camera.bottom) / 2;
        const centerX = (this.camera.left + this.camera.right) / 2;
        const centerY = (this.camera.top + this.camera.bottom) / 2;
        this.camera.left = centerX - halfH * newAspect;
        this.camera.right = centerX + halfH * newAspect;
        this.camera.top = centerY + halfH;
        this.camera.bottom = centerY - halfH;
        this.camera.updateProjectionMatrix();
      }
    }
    this.camera.updateProjectionMatrix();
    this._emitCameraChanged();
  }

  // ── Private ──

  private _applyExtents(min: CadPoint, max: CadPoint): void {
    const centerX = (min.x + max.x) / 2;
    const centerY = (min.y + max.y) / 2;
    const width = max.x - min.x;
    const height = max.y - min.y;

    if (!this._isValidNumber(centerX) || !this._isValidNumber(centerY)) {
      this._resetToDefaultView();
      return;
    }

    if (!this._isValidNumber(width) || !this._isValidNumber(height) || width <= 0 || height <= 0) {
      this._resetToDefaultView();
      return;
    }

    const { width: cw, height: ch } = this._getContainerSize();
    if (cw === 0 || ch === 0) return;

    const aspect = cw / ch;
    let halfW: number;
    let halfH: number;

    switch (this._fitMode) {
      case 'contain': {
        const padding = 1.05;
        halfH = Math.max(width / aspect, height) * padding / 2;
        halfW = halfH * aspect;
        break;
      }
      case 'cover': {
        const padding = 1.0;
        halfH = Math.min(width / aspect, height) * padding / 2;
        halfW = halfH * aspect;
        break;
      }
      case 'stretch': {
        const padding = 1.0;
        halfW = (width * padding) / 2;
        halfH = (height * padding) / 2;
        break;
      }
      case 'custom':
      default: {
        const padding = 1.05;
        halfH = Math.max(width / aspect, height) * padding / 2;
        halfW = halfH * aspect;
        break;
      }
    }

    if (!this._isValidNumber(halfH) || !this._isValidNumber(halfW) || halfH <= 0 || halfW <= 0) {
      this._resetToDefaultView();
      return;
    }

    let cameraZ = halfH * 4;
    cameraZ = Math.max(0.1, Math.min(1000000, cameraZ));

    const nearPlane = 0.1;
    const farPlane = Math.max(cameraZ * 3, 1000);

    this.camera.position.set(centerX, centerY, cameraZ);
    this.camera.lookAt(centerX, centerY, 0);
    this.camera.near = nearPlane;
    this.camera.far = Math.max(farPlane, nearPlane * 10);
    this.camera.left = -halfW;
    this.camera.right = halfW;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;

    this._initialSpan = Math.max(halfW * 2, halfH * 2);
    if (!this._isValidNumber(this._initialSpan) || this._initialSpan <= 0) {
      this._initialSpan = 1.0;
    }

    if (this.camera.left >= this.camera.right || this.camera.bottom >= this.camera.top) {
      this._resetToDefaultView();
      return;
    }

    this.camera.updateProjectionMatrix();
    this._emitCameraChanged();

    logger.info('CameraController', '_applyExtents', {
      centerX, centerY, cameraZ, width, height, halfW, halfH, aspect,
      containerW: cw, containerH: ch, initialSpan: this._initialSpan,
    });
  }

  private _resetToDefaultView(): void {
    const defaultSpan = 100;
    this._initialSpan = defaultSpan * 2;
    this._applyExtents(
      { x: -defaultSpan, y: -defaultSpan, z: 0 },
      { x: defaultSpan, y: defaultSpan, z: 0 },
    );
    logger.info('CameraController', 'Reset to default view');
  }

  private _mergeBounds(a: BoundingBox | null, b: BoundingBox | null | undefined): BoundingBox | null {
    const hasA = this._isValidBoundingBox(a);
    const hasB = this._isValidBoundingBox(b);
    if (hasA && hasB) {
      return {
        minX: Math.min(a!.minX, b!.minX),
        minY: Math.min(a!.minY, b!.minY),
        maxX: Math.max(a!.maxX, b!.maxX),
        maxY: Math.max(a!.maxY, b!.maxY),
      };
    }
    return hasA ? a : (hasB ? b! : null);
  }

  private _emitCameraChanged(): void {
    const now = performance.now();
    if (now - this._lastCameraEmit < 16) return; // 节流 ~60fps
    this._lastCameraEmit = now;
    this._onCameraChanged?.(this.getCameraInfo());
  }

  private _scheduleCameraInteractionEnd(): void {
    if (this._cameraInteractionEndTimer) {
      clearTimeout(this._cameraInteractionEndTimer);
    }
    this._cameraInteractionEndTimer = setTimeout(() => {
      this._cameraInteractionEndTimer = null;
      this._onCameraInteractionEnd?.(this.getCameraInfo());
    }, 150);
  }

  // ── 工具方法 ──

  private _isValidNumber(n: unknown): n is number {
    return typeof n === 'number' && isFinite(n) && !isNaN(n);
  }

  private _isValidBoundingBox(bb: BoundingBox | null | undefined): bb is BoundingBox {
    return !!bb
      && this._isValidNumber(bb.minX) && this._isValidNumber(bb.minY)
      && this._isValidNumber(bb.maxX) && this._isValidNumber(bb.maxY)
      && bb.maxX > bb.minX && bb.maxY > bb.minY;
  }

  dispose(): void {
    if (this._cameraInteractionEndTimer) {
      clearTimeout(this._cameraInteractionEndTimer);
      this._cameraInteractionEndTimer = null;
    }
    this._onCameraChanged = null;
    this._onCameraInteractionEnd = null;
  }
}
