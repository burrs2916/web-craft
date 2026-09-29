import { CadRenderer } from '../CadRenderer';
import { SceneGraph } from '../cad_runtime/scene_graph';
import { entityRendererRegistry } from '../cad_runtime/entity_renderers';
import { logger } from '../../../utils/logger';
import type { TransformParams } from '../coordinate/TransformCalculator';
import type { CadLayer } from '../types';
import type {
  CadDocumentInfo,
  CadEngineConfig,
  CadEngineEventData,
  CadEngineEventHandler,
  CadEngineEventType,
} from './types';
import type { CadViewerEngineInternal, LayerPropsPatch } from './internal';

/**
 * CAD 查看器引擎：负责容器/渲染器生命周期、事件分发，并编排文档加载、实体编辑、
 * 图层管理与视图控制。
 *
 * 拆分说明：各职责实现见同目录 mixin 模块（documentLoading / entityEditing /
 * layers / viewControls），在 index.ts 中通过 Object.assign 装配到原型上；
 * 本文件保留核心状态、构造、生命周期与事件机制。
 */
export class CadViewerEngine {
  // 以下状态由同目录 mixin 模块共享访问（见 internal.ts），故为 protected 而非 private。
  protected _id: string;
  protected _isInitialized = false;
  protected _isDocumentLoaded = false;
  protected _currentDocument: CadDocumentInfo | null = null;
  protected _transformParams: TransformParams | null = null;
  protected _eventHandlers = new Map<CadEngineEventType, Set<CadEngineEventHandler>>();
  protected _container: HTMLElement | null = null;
  protected _renderer: CadRenderer | null = null;
  protected _destroyed = false;
  protected _resizeObserver: ResizeObserver | null = null;
  protected _sceneGraph: SceneGraph | null = null;
  protected _libraryId: string | null = null;
  protected _pendingLayerProps: Map<string, LayerPropsPatch> = new Map();
  protected _layerPropsFlushTimer: ReturnType<typeof setTimeout> | null = null;
  protected _documentLayers: CadLayer[] = [];

  constructor(id?: string) {
    this._id = id || `cad_engine_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  get id(): string {
    return this._id;
  }

  get isInitialized(): boolean {
    return this._isInitialized;
  }

  get isDocumentLoaded(): boolean {
    return this._isDocumentLoaded;
  }

  get currentDocument(): CadDocumentInfo | null {
    return this._currentDocument;
  }

  get container(): HTMLElement | null {
    return this._container;
  }

  get renderer(): CadRenderer | null {
    return this._renderer;
  }

  async initialize(config: CadEngineConfig): Promise<void> {
    if (this._destroyed) {
      throw new Error(`[CadViewerEngine:${this._id}] Engine has been destroyed, cannot re-initialize`);
    }

    if (this._isInitialized) {
      logger.warn(`CadViewerEngine:${this._id}`, 'Already initialized, skipping');
      return;
    }

    const rect = await this._waitForContainerSize(config.container, 8);
    if (rect.width === 0 || rect.height === 0) {
      const err = new Error(`容器尺寸为零 (${rect.width}x${rect.height})，无法初始化 CAD 查看器`);
      this._emit('error', { error: err });
      throw err;
    }

    this._container = config.container;

    try {
      logger.info(`CadViewerEngine:${this._id}`, 'Initializing CAD renderer', { width: rect.width, height: rect.height });

      this._renderer = new CadRenderer({
        container: config.container,
        backgroundColor: config.backgroundColor || '#1a1a2e',
        lineColor: config.lineColor || '#4fc3f7',
        debugMode: config.debugMode || false,
        transparentBackground: config.transparentBackground || false,
        onSelectionChanged: (entityIds) => {
          const primaryId = entityIds.length > 0 ? entityIds[0] : null;
          const node = primaryId ? this._renderer?.getEntityNode(primaryId) ?? null : null;
          this._emit('selectionChanged', { entityIds, primaryId, node });
        },
        onCameraChanged: (info) => {
          this._emit('cameraChanged', info);
        },
        onCameraInteractionEnd: (info) => {
          this._emit('cameraInteractionEnd', info);
        },
        onEntityMoved: (entityId, dx, dy) => {
          this._emit('entityMoved', { entityId, dx, dy });
        },
        onEntityContextMenu: (entityId, layer, clientX, clientY) => {
          this._emit('entityContextMenu', { entityId, layer, clientX, clientY });
        },
        onDrawComplete: (entityJson) => {
          (this as unknown as CadViewerEngineInternal)._handleDrawComplete(entityJson);
        },
      });

      this._renderer.setEntityRendererRegistry(entityRendererRegistry);

      if (config.autoResize !== false) {
        this._resizeObserver = new ResizeObserver(() => {
          this._renderer?.resize();
        });
        this._resizeObserver.observe(config.container);
      }

      this._isInitialized = true;
      logger.info(`CadViewerEngine:${this._id}`, 'Initialization complete');
    } catch (error) {
      logger.error(`CadViewerEngine:${this._id}`, 'Failed to initialize', { error: String(error) });
      this._emit('error', { error });
      throw error;
    }
  }

  private async _waitForContainerSize(el: HTMLElement, maxFrames: number): Promise<{ width: number; height: number }> {
    let rect = { width: el.clientWidth, height: el.clientHeight };
    let frames = 0;
    while ((rect.width === 0 || rect.height === 0) && frames < maxFrames) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      rect = { width: el.clientWidth, height: el.clientHeight };
      frames += 1;
    }
    return rect;
  }

  protected _toNumericEntityId(entityId: string): number {
    const numericId = Number(entityId);
    if (!Number.isFinite(numericId)) {
      throw new Error(`非法 entityId: ${entityId}`);
    }
    return numericId;
  }

  protected _assertInitialized(action: string): void {
    if (!this._isInitialized || !this._renderer) {
      const err = new Error(`引擎未初始化 (cannot ${action})`);
      logger.error(`CadViewerEngine:${this._id}`, err.message);
      this._emit('error', { error: err });
      throw err;
    }
  }

  closeDocument(): void {
    if (!this._isInitialized || !this._isDocumentLoaded) return;
    if (this._layerPropsFlushTimer) {
      clearTimeout(this._layerPropsFlushTimer);
      this._layerPropsFlushTimer = null;
    }
    this._pendingLayerProps.clear();
    this._isDocumentLoaded = false;
    this._currentDocument = null;
    this._emit('documentClosed', {});
  }

  on(event: CadEngineEventType, handler: CadEngineEventHandler): () => void {
    if (!this._eventHandlers.has(event)) {
      this._eventHandlers.set(event, new Set());
    }
    this._eventHandlers.get(event)!.add(handler);
    return () => {
      this._eventHandlers.get(event)?.delete(handler);
    };
  }

  off(event: CadEngineEventType, handler: CadEngineEventHandler): void {
    this._eventHandlers.get(event)?.delete(handler);
  }

  resize(): void {
    this._renderer?.resize();
  }

  async destroy(): Promise<void> {
    if (this._destroyed) return;

    console.log(`[CadViewerEngine:${this._id}] Destroying engine...`);

    await this.flushPendingChanges();

    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }

    if (this._renderer) {
      this._renderer.dispose();
      this._renderer = null;
    }

    this._eventHandlers.clear();
    this._isInitialized = false;
    this._isDocumentLoaded = false;
    this._currentDocument = null;
    this._transformParams = null;
    this._container = null;
    this._sceneGraph = null;
    this._libraryId = null;
    this._destroyed = true;
  }

  private _emit(event: CadEngineEventType, data: unknown): void {
    const handlers = this._eventHandlers.get(event);
    if (handlers) {
      const eventData: CadEngineEventData = { type: event, data };
      handlers.forEach(handler => {
        try {
          handler(eventData);
        } catch (err) {
          console.error(`[CadViewerEngine:${this._id}] Error in event handler for "${event}":`, err);
        }
      });
    }
  }

  protected readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }
}