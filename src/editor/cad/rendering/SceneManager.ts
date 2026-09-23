import * as THREE from 'three';
import { Text as TroikaText } from 'troika-three-text';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { logger } from '../../../utils/logger';

/**
 * SceneManager — Three.js 基础设施层
 *
 * 职责：Scene / WebGLRenderer / 画布尺寸 / 渲染循环 / 背景色 / 资源 dispose
 * 依赖：无（最底层模块）
 */
export class SceneManager {
  private _scene: THREE.Scene;
  private _renderer: THREE.WebGLRenderer;
  private _container: HTMLElement;
  private _canvasWidth = 0;
  private _canvasHeight = 0;
  private _dpr: number;
  private _resolution: THREE.Vector2;
  private _backgroundColor: THREE.Color;
  private _isDarkBackground: boolean;
  private _transparentBackground: boolean;
  private _isDisposed = false;

  // 渲染循环
  private _animationId: number | null = null;
  private _needsRender = false;
  private _hasPendingUpdatesFn: (() => boolean) | null = null;

  // 渲染回调（用于外部模块在每帧渲染前做额外处理）
  private _onBeforeRender: (() => void) | null = null;

  // Picking 基础设施（由 SceneManager 持有，因为依赖 WebGLRenderer）
  private _pickingScene: THREE.Scene;
  private _pickingTexture: THREE.WebGLRenderTarget | null = null;

  constructor(config: {
    container: HTMLElement;
    backgroundColor?: string;
    transparentBackground?: boolean;
  }) {
    this._container = config.container;
    this._transparentBackground = config.transparentBackground ?? false;

    this._scene = new THREE.Scene();
    const bgStr = config.backgroundColor || '#1a1a2e';
    this._backgroundColor = new THREE.Color(bgStr);
    this._isDarkBackground = this._computeIsDark(this._backgroundColor);

    if (this._transparentBackground) {
      this._scene.background = null;
    } else {
      this._scene.background = this._backgroundColor;
    }

    const cw = config.container.clientWidth || 1;
    const ch = config.container.clientHeight || 1;
    this._canvasWidth = cw;
    this._canvasHeight = ch;
    this._dpr = window.devicePixelRatio || 1;
    this._resolution = new THREE.Vector2(cw * this._dpr, ch * this._dpr);

    this._renderer = new THREE.WebGLRenderer({ antialias: true, alpha: this._transparentBackground });
    this._renderer.setSize(cw, ch);
    this._renderer.setPixelRatio(window.devicePixelRatio);
    if (this._transparentBackground) {
      this._renderer.setClearColor(this._backgroundColor, 1);
    }
    config.container.appendChild(this._renderer.domElement);

    // Picking scene
    this._pickingScene = new THREE.Scene();
    this._pickingScene.background = new THREE.Color(0x000000);

    this._pickingTexture = new THREE.WebGLRenderTarget(cw, ch, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
    });
  }

  // ── Public API ──

  get scene(): THREE.Scene { return this._scene; }
  get renderer(): THREE.WebGLRenderer { return this._renderer; }
  get canvas(): HTMLCanvasElement { return this._renderer.domElement; }
  get container(): HTMLElement { return this._container; }
  get width(): number { return this._canvasWidth; }
  get height(): number { return this._canvasHeight; }
  get dpr(): number { return this._dpr; }
  get resolution(): THREE.Vector2 { return this._resolution; }
  get backgroundColor(): THREE.Color { return this._backgroundColor; }
  get isDarkBackground(): boolean { return this._isDarkBackground; }
  get isDisposed(): boolean { return this._isDisposed; }
  get pickingScene(): THREE.Scene { return this._pickingScene; }
  get pickingTexture(): THREE.WebGLRenderTarget | null { return this._pickingTexture; }

  /** 设置每帧渲染前的回调 */
  setBeforeRenderCallback(cb: (() => void) | null): void {
    this._onBeforeRender = cb;
  }

  /** 设置"是否有待处理更新"的判断函数，用于决定动画循环是否继续 */
  setPendingUpdatesChecker(fn: (() => boolean) | null): void {
    this._hasPendingUpdatesFn = fn;
  }

  setBackgroundColor(color: string | THREE.Color, opacity?: number): void {
    const newBg = color instanceof THREE.Color ? color : new THREE.Color(color);
    const wasDark = this._isDarkBackground;
    this._isDarkBackground = this._computeIsDark(newBg);
    this._backgroundColor = newBg;

    if (!this._transparentBackground) {
      this._scene.background = newBg;
    } else {
      this._renderer.setClearColor(newBg, opacity ?? 1);
    }

    if (wasDark !== this._isDarkBackground) {
      // 背景明暗切换，外部需要刷新所有实体颜色
      this._onBackgroundColorChanged?.(this._isDarkBackground);
    }
    this.requestRender();
  }

  private _onBackgroundColorChanged: ((isDark: boolean) => void) | null = null;
  setOnBackgroundColorChanged(cb: ((isDark: boolean) => void) | null): void {
    this._onBackgroundColorChanged = cb;
  }

  resize(): void {
    const cw = this._container.clientWidth || 1;
    const ch = this._container.clientHeight || 1;
    this._canvasWidth = cw;
    this._canvasHeight = ch;
    this._renderer.setSize(cw, ch);
    this._dpr = window.devicePixelRatio || 1;
    this._resolution.set(cw * this._dpr, ch * this._dpr);

    // 更新所有 Line2 材质的 resolution
    this._scene.traverse((child) => {
      if (child instanceof Line2) {
        (child.material as LineMaterial).resolution.copy(this._resolution);
      }
    });

    // 更新 picking texture 尺寸
    if (this._pickingTexture) {
      this._pickingTexture.setSize(cw, ch);
    }
  }

  /** 请求一帧渲染 */
  requestRender(): void {
    if (this._isDisposed) return;
    this._needsRender = true;
    if (this._animationId === null) {
      this._animationId = requestAnimationFrame(() => this._animate());
    }
  }

  /** 立即渲染一帧（不等 rAF） */
  renderNow(camera: THREE.Camera): void {
    this._renderer.render(this._scene, camera);
  }

  /** 渲染到 picking texture */
  renderPicking(camera: THREE.Camera): void {
    if (!this._pickingTexture) return;
    this._renderer.setRenderTarget(this._pickingTexture);
    this._renderer.render(this._pickingScene, camera);
    this._renderer.setRenderTarget(null);
  }

  /** 读取 picking texture 的像素 */
  readPickingPixel(x: number, y: number): Uint8Array {
    const buf = new Uint8Array(4);
    if (!this._pickingTexture) return buf;
    this._renderer.readRenderTargetPixels(this._pickingTexture, x, this._pickingTexture.height - y, 1, 1, buf);
    return buf;
  }

  /** 将对象添加到场景 */
  add(obj: THREE.Object3D): void {
    this._scene.add(obj);
  }

  /** 从场景移除对象 */
  remove(obj: THREE.Object3D): void {
    this._scene.remove(obj);
  }

  /**
   * 清空主场景所有子对象。
   * 标记了 userData.__persistent === true 的对象会被保留（如 SDF 文字的
   * BatchedText），避免被无差别移除后无人重建而导致渲染丢失。
   */
  clearScene(): void {
    const toRemove = this._scene.children.filter(
      (c) => c.userData.__persistent !== true,
    );
    for (const obj of toRemove) {
      this._scene.remove(obj);
    }
  }

  /** 更新所有 TroikaText 的 sync */
  syncTroikaText(onAllSynced: () => void): void {
    let pending = 0;
    this._scene.traverse((child) => {
      if (child instanceof TroikaText) {
        pending++;
        (child as InstanceType<typeof TroikaText>).sync(() => {
          pending--;
          if (pending === 0) onAllSynced();
        });
      }
    });
    if (pending === 0) onAllSynced();
  }

  // ── Private ──

  private _animate(): void {
    if (this._isDisposed) return;

    if (this._needsRender) {
      this._needsRender = false;
      this._onBeforeRender?.();

      // 渲染由外部通过 renderNow 指定相机
      // 如果设置了 onBeforeRender 回调，由它负责调用 renderNow
      // 否则我们不需要在此处渲染——相机由 Facade 管理
      if (this._onRenderCallback) {
        this._onRenderCallback();
      }

      if (this._hasPendingUpdatesFn?.()) {
        this._needsRender = true;
      }
    }

    if (!this._needsRender) {
      if (this._animationId !== null) {
        cancelAnimationFrame(this._animationId);
        this._animationId = null;
      }
      return;
    }

    this._animationId = requestAnimationFrame(() => this._animate());
  }

  private _onRenderCallback: (() => void) | null = null;
  setRenderCallback(cb: (() => void) | null): void {
    this._onRenderCallback = cb;
  }

  private _computeIsDark(color: THREE.Color): boolean {
    const r = color.r;
    const g = color.g;
    const b = color.b;
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    return luminance < 0.5;
  }

  dispose(): void {
    if (this._isDisposed) return;
    this._isDisposed = true;

    if (this._animationId !== null) {
      cancelAnimationFrame(this._animationId);
      this._animationId = null;
    }

    // 清理 picking
    if (this._pickingTexture) {
      this._pickingTexture.dispose();
      this._pickingTexture = null;
    }
    while (this._pickingScene.children.length > 0) {
      const child = this._pickingScene.children[0];
      this._pickingScene.remove(child);
    }

    // WebGLRenderer dispose
    this._renderer.dispose();

    if (this._renderer.domElement.parentElement === this._container) {
      this._container.removeChild(this._renderer.domElement);
    }

    logger.info('SceneManager', 'Disposed');
  }
}
