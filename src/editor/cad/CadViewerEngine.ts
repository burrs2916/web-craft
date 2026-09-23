import { invoke } from '@tauri-apps/api/core';
import type { SpatialCoordinate } from '../../types/spatial';
import type { TransformParams } from './coordinate/TransformCalculator';
import { applyTransform, inverseTransform } from './coordinate/TransformCalculator';
import { CadRenderer, type CameraInfo } from './CadRenderer';
import { logger } from '../../utils/logger';
import type { ParseResult } from './types';
import { CadbinReader } from './cad_runtime/cadbin_reader';
import { SceneGraph } from './cad_runtime/scene_graph';
import type { LayerNode, SceneNode } from './cad_runtime/scene_node';
import { entityRendererRegistry } from './cad_runtime/entity_renderers';

export interface CadEngineConfig {
  container: HTMLElement;
  autoResize?: boolean;
  backgroundColor?: string;
  lineColor?: string;
  debugMode?: boolean;
  transparentBackground?: boolean;
  onEntityCreated?: (entityId: string) => void;
}

export interface CadDocumentInfo {
  fileName: string;
  title: string;
  extents?: {
    min: SpatialCoordinate;
    max: SpatialCoordinate;
  };
}

export type CadEngineEventType =
  | 'documentOpened'
  | 'documentClosed'
  | 'entityClicked'
  | 'mouseMove'
  | 'selectionChanged'
  | 'cameraChanged'
  | 'cameraInteractionEnd'
  | 'entityChanged'
  | 'entityMoved'
  | 'entityContextMenu'
  | 'error'
  | 'loadProgress'
  | 'sceneGraphLoaded'
  | 'layersVisibilityChanged'
  | 'entityCreated';

export interface CadEngineEventData {
  type: CadEngineEventType;
  data?: unknown;
}

export type CadEngineEventHandler = (event: CadEngineEventData) => void;

export class CadViewerEngine {
  private _id: string;
  private _isInitialized = false;
  private _isDocumentLoaded = false;
  private _currentDocument: CadDocumentInfo | null = null;
  private _transformParams: TransformParams | null = null;
  private _eventHandlers = new Map<CadEngineEventType, Set<CadEngineEventHandler>>();
  private _container: HTMLElement | null = null;
  private _renderer: CadRenderer | null = null;
  private _destroyed = false;
  private _resizeObserver: ResizeObserver | null = null;
  private _sceneGraph: SceneGraph | null = null;
  private _libraryId: string | null = null;
  private _pendingLayerProps: Map<string, { color?: number; visible?: boolean; locked?: boolean; frozen?: boolean }> = new Map();
  private _layerPropsFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly LAYER_PROPS_DEBOUNCE_MS = 300;

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
          this._handleDrawComplete(entityJson);
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

  async openDocument(
    fileName: string,
    content: ArrayBuffer,
    _options?: unknown
  ): Promise<boolean> {
    this._assertInitialized('open document');

    logger.info(`CadViewerEngine:${this._id}`, 'Opening document', { fileName, size: content.byteLength });

    try {
      this._emit('loadProgress', { stage: 'parsing', progress: 0 });

      const data = new Uint8Array(content);
      logger.info(`CadViewerEngine:${this._id}`, 'Invoking parse_cad_from_bytes', { dataLength: data.length, fileName });
      const result: ParseResult = await invoke('parse_cad_from_bytes', {
        data: data,
        fileName,
      });

      logger.info(`CadViewerEngine:${this._id}`, 'Parse result', {
        success: result.success,
        error: result.error,
        entityCount: result.document?.entity_count,
        layerCount: result.document?.layers?.length,
        hasExtents: !!result.document?.extents,
        extentsMin: result.document?.extents ? { x: result.document.extents.min.x, y: result.document.extents.min.y } : undefined,
        extentsMax: result.document?.extents ? { x: result.document.extents.max.x, y: result.document.extents.max.y } : undefined,
        firstFewEntityTypes: result.document?.entities?.slice(0, 5).map(e => (e as any).type),
      });

      if (!result.success || !result.document) {
        const err = new Error(result.error || '解析失败');
        logger.error(`CadViewerEngine:${this._id}`, 'Failed to parse document', { error: result.error });
        this._emit('error', { error: err, fileName });
        throw err;
      }

      if (result.document.entity_count === 0) {
        logger.warn(`CadViewerEngine:${this._id}`, 'Document parsed but has 0 entities');
      }

      this._emit('loadProgress', { stage: 'rendering', progress: 50 });

      this._renderer!.loadDocument(result.document);
      this._documentLayers = result.document.layers || [];

      this._currentDocument = {
        fileName: result.document.file_name,
        title: result.document.file_name,
        extents: result.document.extents
          ? {
              min: result.document.extents.min,
              max: result.document.extents.max,
            }
          : undefined,
      };

      this._isDocumentLoaded = true;
      this._emit('loadProgress', { stage: 'complete', progress: 100 });
      this._emit('documentOpened', { fileName: result.document.file_name });

      return true;
    } catch (error) {
      logger.error(`CadViewerEngine:${this._id}`, 'Failed to open document', { error: String(error), fileName });
      this._emit('error', { error, fileName });
      throw error;
    }
  }

  async openFile(file: File): Promise<boolean> {
    try {
      const content = await this.readFileAsArrayBuffer(file);
      return this.openDocument(file.name, content);
    } catch (error) {
      logger.error(`CadViewerEngine:${this._id}`, 'Failed to read file', { error: String(error), fileName: file.name });
      this._emit('error', { error, fileName: file.name });
      throw error;
    }
  }

  async openFromUrl(url: string, fileName?: string): Promise<boolean> {
    this._assertInitialized('open from url');
    try {
      if (url.startsWith('http://') || url.startsWith('https://')) {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const content = await response.arrayBuffer();
        const name = fileName || url.split('/').pop() || 'document.dxf';
        return this.openDocument(name, content);
      }

      const name = fileName || url.split('/').pop() || 'document.dxf';
      const result: ParseResult = await invoke('parse_cad_file', {
        filePath: url,
      });

      if (!result.success || !result.document) {
        const err = new Error(result.error || '解析失败');
        this._emit('error', { error: err, fileName: name });
        throw err;
      }

      this._emit('loadProgress', { stage: 'rendering', progress: 50 });

      this._renderer!.loadDocument(result.document);
      this._documentLayers = result.document.layers || [];

      this._currentDocument = {
        fileName: result.document.file_name,
        title: result.document.file_name,
        extents: result.document.extents
          ? {
              min: result.document.extents.min,
              max: result.document.extents.max,
            }
          : undefined,
      };

      this._isDocumentLoaded = true;
      this._emit('loadProgress', { stage: 'complete', progress: 100 });
      this._emit('documentOpened', { fileName: result.document.file_name });

      return true;
    } catch (error) {
      logger.error(`CadViewerEngine:${this._id}`, 'Failed to open from URL', { error: String(error), url });
      this._emit('error', { error, url });
      throw error;
    }
  }

  async openFromCadbin(buffer: ArrayBuffer, fileName?: string): Promise<boolean> {
    this._assertInitialized('open cadbin');

    logger.info(`CadViewerEngine:${this._id}`, 'Opening cadbin', { size: buffer.byteLength, fileName });

    try {
      this._emit('loadProgress', { stage: 'parsing', progress: 0 });

      const reader = new CadbinReader(buffer);
      const parsed = reader.parseAll();

      logger.info(`CadViewerEngine:${this._id}`, 'Cadbin parsed', {
        spatialEntryCount: parsed.spatialEntries.length,
        layerCount: parsed.layers.length,
        stringCount: parsed.strings.length,
      });

      this._emit('loadProgress', { stage: 'rendering', progress: 30 });

      const sceneGraph = new SceneGraph();
      sceneGraph.loadFromCadbin(buffer);
      this._sceneGraph = sceneGraph;

      this._emit('loadProgress', { stage: 'rendering', progress: 60 });

      this._renderer!.loadFromSceneGraph(sceneGraph);

      const layerNodes = sceneGraph.allLayers;
      this._documentLayers = layerNodes.map(l => ({
        name: l.name,
        color: l.color,
        visible: l.visible,
        frozen: l.frozen,
        locked: l.locked,
      }));

      const bounds = sceneGraph.bounds;
      this._currentDocument = {
        fileName: fileName || 'CAD Document',
        title: fileName || 'CAD Document',
        extents: bounds
          ? {
              min: { x: bounds.minX, y: bounds.minY },
              max: { x: bounds.maxX, y: bounds.maxY },
            }
          : undefined,
      };

      this._isDocumentLoaded = true;
      this._emit('loadProgress', { stage: 'complete', progress: 100 });
      this._emit('sceneGraphLoaded', {
        nodeCount: sceneGraph.allNodes.length,
        layerCount: layerNodes.length,
        bounds,
      });
      this._emit('documentOpened', { fileName: this._currentDocument!.fileName });

      return true;
    } catch (error) {
      logger.error(`CadViewerEngine:${this._id}`, 'Failed to open cadbin', { error: String(error), fileName });
      this._emit('error', { error, fileName });
      throw error;
    }
  }

  async openFromMapLibrary(libraryId: string, fileName?: string): Promise<boolean> {
    this._assertInitialized('open map library');

    logger.info(`CadViewerEngine:${this._id}`, 'Opening from map library', { libraryId });

    try {
      this._emit('loadProgress', { stage: 'loading', progress: 0 });

      const cadbinData: number[] = await invoke('read_map_library_cadbin', { id: libraryId });
      const buffer = new Uint8Array(cadbinData).buffer;

      this._emit('loadProgress', { stage: 'parsing', progress: 20 });

      this._libraryId = libraryId;
      return this.openFromCadbin(buffer, fileName);
    } catch (error) {
      logger.error(`CadViewerEngine:${this._id}`, 'Failed to open from map library', { error: String(error), libraryId });
      this._emit('error', { error, libraryId });
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Cadbin 模式专用 API：图层、拾取、文字编辑（用于 MapEditorPage 联动）
  // ─────────────────────────────────────────────────────────────────────────

  /** 完整的图层列表（含 visible/frozen/locked/entityCount/color），用于左侧图层面板。 */
  getCadbinLayers(): LayerNode[] {
    return this._sceneGraph?.allLayers ?? [];
  }

  /** 鼠标坐标（client px）→ 命中的 entityId（cadbin 数字 id 转字符串） */
  pickEntityIdAt(clientX: number, clientY: number): string | null {
    return this._renderer?.pickEntityIdAt(clientX, clientY) ?? null;
  }

  /** 取实体节点，主要给文字编辑/属性面板用 */
  getEntityNode(entityId: string): SceneNode | undefined {
    return this._renderer?.getEntityNode(entityId);
  }

  /**
   * 改 Text/MText 内容并写回 cadbin。
   * 1) 先在前端就替换 mesh，让用户立刻看到变化
   * 2) 再异步请求后端把改动持久化到 .cadbin 文件
   * 抛出错误时调用方可决定是否回滚。
   */
  async updateTextContent(entityId: string, newContent: string): Promise<void> {
    this._assertInitialized('update text');
    if (!this._libraryId) {
      throw new Error('当前文档不是从 map library 打开的，无法持久化文字编辑');
    }
    const node = this._renderer!.getEntityNode(entityId);
    if (!node) {
      throw new Error(`找不到实体: ${entityId}`);
    }
    if (node.type !== 'text' && node.type !== 'mText') {
      throw new Error(`实体 ${entityId} 不是文字类型 (type=${node.type})`);
    }

    const numericId = Number(entityId);
    if (!Number.isFinite(numericId)) {
      throw new Error(`非法 entityId: ${entityId}`);
    }

    const ok = this._renderer!.updateTextContent(entityId, newContent);
    if (!ok) {
      throw new Error('前端替换文字 mesh 失败');
    }

    await invoke('update_cadbin_text_entity', {
      libraryId: this._libraryId,
      entityId: numericId,
      newContent,
    });
  }

  /** 改实体颜色（前端 + 后端）。颜色为 0xRRGGBB 整数。 */
  async updateEntityColor(entityId: string, newColorRgb: number): Promise<void> {
    this._assertInitialized('update color');
    if (!this._libraryId) throw new Error('当前文档不是从 map library 打开的，无法持久化颜色编辑');
    const numericId = this._toNumericEntityId(entityId);
    const ok = this._renderer!.updateEntityColor(entityId, newColorRgb);
    if (!ok) throw new Error(`找不到实体: ${entityId}`);
    await invoke('update_cadbin_entity_color', {
      libraryId: this._libraryId,
      entityId: numericId,
      newColor: newColorRgb,
    });
    this._emit('entityChanged', { entityId, change: 'color', value: newColorRgb });
  }

  /** 把实体移到另一个图层（前端 + 后端）。 */
  async updateEntityLayer(entityId: string, newLayer: string): Promise<void> {
    this._assertInitialized('update layer');
    if (!this._libraryId) throw new Error('当前文档不是从 map library 打开的，无法持久化图层编辑');
    const numericId = this._toNumericEntityId(entityId);
    const ok = this._renderer!.updateEntityLayer(entityId, newLayer);
    if (!ok) throw new Error(`找不到实体: ${entityId}`);
    await invoke('update_cadbin_entity_layer', {
      libraryId: this._libraryId,
      entityId: numericId,
      newLayer,
    });
    this._emit('entityChanged', { entityId, change: 'layer', value: newLayer });
  }

  /** 平移实体（dx/dy 是世界坐标增量）。 */
  async moveEntity(entityId: string, dx: number, dy: number): Promise<void> {
    this._assertInitialized('move entity');
    if (!this._libraryId) throw new Error('当前文档不是从 map library 打开的，无法持久化移动');
    const numericId = this._toNumericEntityId(entityId);
    const ok = this._renderer!.moveEntity(entityId, dx, dy);
    if (!ok) throw new Error(`找不到实体: ${entityId}`);
    await invoke('move_cadbin_entity', {
      libraryId: this._libraryId,
      entityId: numericId,
      dx,
      dy,
    });
    this._emit('entityChanged', { entityId, change: 'move', value: { dx, dy } });
  }

  async moveEntities(entityIds: string[], dx: number, dy: number): Promise<void> {
    this._assertInitialized('move entities');
    if (!this._libraryId) throw new Error('当前文档不是从 map library 打开的，无法持久化移动');
    for (const entityId of entityIds) {
      const numericId = this._toNumericEntityId(entityId);
      const ok = this._renderer!.moveEntity(entityId, dx, dy);
      if (!ok) continue;
      await invoke('move_cadbin_entity', {
        libraryId: this._libraryId,
        entityId: numericId,
        dx,
        dy,
      });
      this._emit('entityChanged', { entityId, change: 'move', value: { dx, dy } });
    }
  }

  copyEntityLocally(entityId: string, dx: number, dy: number): string | null {
    this._assertInitialized('copy entity');
    const newId = this._renderer!.copyEntityLocally(entityId, dx, dy);
    if (newId) {
      this._emit('entityChanged', { entityId: newId, change: 'copy', value: { sourceId: entityId, dx, dy } });
    }
    return newId;
  }

  copyEntitiesLocally(entityIds: string[], dx: number, dy: number): string[] {
    this._assertInitialized('copy entities');
    const newIds = this._renderer!.copyEntitiesLocally(entityIds, dx, dy);
    for (const newId of newIds) {
      this._emit('entityChanged', { entityId: newId, change: 'copy' });
    }
    return newIds;
  }

  private _sceneNodePropsToCadEntityProps(entityId: string, sceneNodeProps: Record<string, unknown>): Record<string, unknown> {
    const node = this._renderer?.getEntityNode(entityId);
    if (!node) return sceneNodeProps;
    const result: Record<string, unknown> = {};
    switch (node.type) {
      case 'line': {
        if ('startX' in sceneNodeProps || 'startY' in sceneNodeProps) {
          result.start = { x: sceneNodeProps.startX ?? node.startX, y: sceneNodeProps.startY ?? node.startY, z: 0 };
        }
        if ('endX' in sceneNodeProps || 'endY' in sceneNodeProps) {
          result.end = { x: sceneNodeProps.endX ?? node.endX, y: sceneNodeProps.endY ?? node.endY, z: 0 };
        }
        if ('lineWeight' in sceneNodeProps) result.line_weight = sceneNodeProps.lineWeight;
        if ('color' in sceneNodeProps) result.color = sceneNodeProps.color;
        if ('layer' in sceneNodeProps) result.layer = sceneNodeProps.layer;
        break;
      }
      case 'circle': {
        if ('centerX' in sceneNodeProps || 'centerY' in sceneNodeProps) {
          result.center = { x: sceneNodeProps.centerX ?? node.centerX, y: sceneNodeProps.centerY ?? node.centerY, z: 0 };
        }
        if ('radius' in sceneNodeProps) result.radius = sceneNodeProps.radius;
        if ('lineWeight' in sceneNodeProps) result.line_weight = sceneNodeProps.lineWeight;
        if ('color' in sceneNodeProps) result.color = sceneNodeProps.color;
        if ('layer' in sceneNodeProps) result.layer = sceneNodeProps.layer;
        break;
      }
      case 'arc': {
        if ('centerX' in sceneNodeProps || 'centerY' in sceneNodeProps) {
          result.center = { x: sceneNodeProps.centerX ?? node.centerX, y: sceneNodeProps.centerY ?? node.centerY, z: 0 };
        }
        if ('radius' in sceneNodeProps) result.radius = sceneNodeProps.radius;
        if ('startAngle' in sceneNodeProps) result.start_angle = sceneNodeProps.startAngle;
        if ('endAngle' in sceneNodeProps) result.end_angle = sceneNodeProps.endAngle;
        if ('lineWeight' in sceneNodeProps) result.line_weight = sceneNodeProps.lineWeight;
        if ('color' in sceneNodeProps) result.color = sceneNodeProps.color;
        if ('layer' in sceneNodeProps) result.layer = sceneNodeProps.layer;
        break;
      }
      case 'text': {
        if ('posX' in sceneNodeProps || 'posY' in sceneNodeProps) {
          result.position = { x: sceneNodeProps.posX ?? (node as any).posX, y: sceneNodeProps.posY ?? (node as any).posY, z: 0 };
        }
        if ('height' in sceneNodeProps) result.height = sceneNodeProps.height;
        if ('rotation' in sceneNodeProps) result.rotation = sceneNodeProps.rotation;
        if ('content' in sceneNodeProps) result.content = sceneNodeProps.content;
        if ('horizontalAlignment' in sceneNodeProps) result.horizontal_alignment = sceneNodeProps.horizontalAlignment;
        if ('verticalAlignment' in sceneNodeProps) result.vertical_alignment = sceneNodeProps.verticalAlignment;
        if ('color' in sceneNodeProps) result.color = sceneNodeProps.color;
        if ('layer' in sceneNodeProps) result.layer = sceneNodeProps.layer;
        break;
      }
      case 'mText': {
        if ('posX' in sceneNodeProps || 'posY' in sceneNodeProps) {
          result.position = { x: sceneNodeProps.posX ?? (node as any).posX, y: sceneNodeProps.posY ?? (node as any).posY, z: 0 };
        }
        if ('height' in sceneNodeProps) result.height = sceneNodeProps.height;
        if ('rotation' in sceneNodeProps) result.rotation = sceneNodeProps.rotation;
        if ('content' in sceneNodeProps) result.content = sceneNodeProps.content;
        if ('width' in sceneNodeProps) result.width = sceneNodeProps.width;
        if ('widthFactor' in sceneNodeProps) result.width_factor = sceneNodeProps.widthFactor;
        if ('color' in sceneNodeProps) result.color = sceneNodeProps.color;
        if ('layer' in sceneNodeProps) result.layer = sceneNodeProps.layer;
        break;
      }
      case 'point': {
        if ('posX' in sceneNodeProps || 'posY' in sceneNodeProps) {
          result.position = { x: sceneNodeProps.posX ?? (node as any).posX, y: sceneNodeProps.posY ?? (node as any).posY, z: 0 };
        }
        if ('color' in sceneNodeProps) result.color = sceneNodeProps.color;
        if ('layer' in sceneNodeProps) result.layer = sceneNodeProps.layer;
        break;
      }
      case 'insert': {
        if ('posX' in sceneNodeProps || 'posY' in sceneNodeProps) {
          result.position = { x: sceneNodeProps.posX ?? (node as any).posX, y: sceneNodeProps.posY ?? (node as any).posY, z: 0 };
        }
        if ('scaleX' in sceneNodeProps) result.x_scale = sceneNodeProps.scaleX;
        if ('scaleY' in sceneNodeProps) result.y_scale = sceneNodeProps.scaleY;
        if ('rotation' in sceneNodeProps) result.rotation = sceneNodeProps.rotation;
        if ('color' in sceneNodeProps) result.color = sceneNodeProps.color;
        if ('layer' in sceneNodeProps) result.layer = sceneNodeProps.layer;
        break;
      }
      case 'dimension': {
        if ('defX' in sceneNodeProps || 'defY' in sceneNodeProps) {
          result.definition_point = { x: sceneNodeProps.defX ?? (node as any).defX, y: sceneNodeProps.defY ?? (node as any).defY, z: 0 };
        }
        if ('midX' in sceneNodeProps || 'midY' in sceneNodeProps) {
          result.text_midpoint = { x: sceneNodeProps.midX ?? (node as any).midX, y: sceneNodeProps.midY ?? (node as any).midY, z: 0 };
        }
        if ('rotation' in sceneNodeProps) result.rotation = sceneNodeProps.rotation;
        if ('content' in sceneNodeProps) result.content = sceneNodeProps.content;
        if ('color' in sceneNodeProps) result.color = sceneNodeProps.color;
        if ('layer' in sceneNodeProps) result.layer = sceneNodeProps.layer;
        break;
      }
      case 'ellipse': {
        if ('centerX' in sceneNodeProps || 'centerY' in sceneNodeProps) {
          result.center = { x: sceneNodeProps.centerX ?? node.centerX, y: sceneNodeProps.centerY ?? node.centerY, z: 0 };
        }
        if ('majorX' in sceneNodeProps || 'majorY' in sceneNodeProps) {
          result.major_axis = { x: sceneNodeProps.majorX ?? node.majorX, y: sceneNodeProps.majorY ?? node.majorY, z: 0 };
        }
        if ('minorRatio' in sceneNodeProps) result.minor_axis_ratio = sceneNodeProps.minorRatio;
        if ('startAngle' in sceneNodeProps) result.start_angle = sceneNodeProps.startAngle;
        if ('endAngle' in sceneNodeProps) result.end_angle = sceneNodeProps.endAngle;
        if ('color' in sceneNodeProps) result.color = sceneNodeProps.color;
        if ('layer' in sceneNodeProps) result.layer = sceneNodeProps.layer;
        break;
      }
      default: {
        if ('color' in sceneNodeProps) result.color = sceneNodeProps.color;
        if ('layer' in sceneNodeProps) result.layer = sceneNodeProps.layer;
        break;
      }
    }
    return result;
  }

  async updateEntityProps(entityId: string, propsJson: string): Promise<void> {
    this._assertInitialized('update entity props');
    if (!this._libraryId) throw new Error('当前文档不是从 map library 打开的，无法持久化属性修改');
    const numericId = this._toNumericEntityId(entityId);
    const sceneNodeProps = JSON.parse(propsJson);
    const cadEntityProps = this._sceneNodePropsToCadEntityProps(entityId, sceneNodeProps);
    await invoke('update_cadbin_entity_props', {
      libraryId: this._libraryId,
      entityId: numericId,
      propsJson: JSON.stringify(cadEntityProps),
    });
    this._renderer!.updateEntityFromProps(entityId, sceneNodeProps);
    this._emit('entityChanged', { entityId, change: 'props' });
  }

  private _cadEntityJsonToSceneNode(entityJson: string, numericId: number): import('./cad_runtime/scene_node').SceneNode | null {
    const e = JSON.parse(entityJson) as Record<string, any>;
    const base = {
      id: numericId,
      layer: e.layer || '0',
      color: e.color ?? 7,
      visible: true,
      selected: false,
      dirty: false,
    };
    switch (e.type) {
      case 'Line':
        return { ...base, type: 'line', startX: e.start.x, startY: e.start.y, endX: e.end.x, endY: e.end.y, lineWeight: e.line_weight ?? 0.25, bbox: { minX: Math.min(e.start.x, e.end.x), minY: Math.min(e.start.y, e.end.y), maxX: Math.max(e.start.x, e.end.x), maxY: Math.max(e.start.y, e.end.y) } };
      case 'Circle':
        return { ...base, type: 'circle', centerX: e.center.x, centerY: e.center.y, radius: e.radius, lineWeight: e.line_weight ?? 0.25, bbox: { minX: e.center.x - e.radius, minY: e.center.y - e.radius, maxX: e.center.x + e.radius, maxY: e.center.y + e.radius } };
      case 'Arc':
        return { ...base, type: 'arc', centerX: e.center.x, centerY: e.center.y, radius: e.radius, startAngle: e.start_angle, endAngle: e.end_angle, lineWeight: e.line_weight ?? 0.25, bbox: { minX: e.center.x - e.radius, minY: e.center.y - e.radius, maxX: e.center.x + e.radius, maxY: e.center.y + e.radius } };
      case 'Text':
        return { ...base, type: 'text', posX: e.position.x, posY: e.position.y, height: e.height, rotation: e.rotation ?? 0, horizontalAlignment: e.horizontal_alignment ?? 0, verticalAlignment: e.vertical_alignment ?? 0, content: e.content || '', bbox: { minX: e.position.x, minY: e.position.y - e.height, maxX: e.position.x + e.height * (e.content?.length || 1) * 0.6, maxY: e.position.y } };
      case 'MText':
        return { ...base, type: 'mText', posX: e.position.x, posY: e.position.y, height: e.height, width: e.width ?? 0, rotation: e.rotation ?? 0, attachmentPoint: e.attachment_point ?? 1, widthFactor: e.width_factor ?? 1, heightScale: e.height_scale ?? 1, fontName: e.font_name || '', content: e.content || '', bbox: { minX: e.position.x, minY: e.position.y - e.height, maxX: e.position.x + (e.width || e.height * 5), maxY: e.position.y } };
      case 'Point':
        return { ...base, type: 'point', posX: e.position.x, posY: e.position.y, bbox: { minX: e.position.x - 1, minY: e.position.y - 1, maxX: e.position.x + 1, maxY: e.position.y + 1 } };
      default:
        return null;
    }
  }

  private async _handleDrawComplete(entityJson: string): Promise<void> {
    this._assertInitialized('handle draw complete');
    if (!this._libraryId) throw new Error('当前文档不是从 map library 打开的，无法持久化新增');

    try {
      const newIdStr = await this.addEntity(entityJson);
      const node = this._cadEntityJsonToSceneNode(entityJson, Number(newIdStr));
      if (node) {
        this._renderer!.addEntityLocally(node);
      }
      this._emit('entityChanged', { entityId: newIdStr, change: 'add' });
      this._emit('entityCreated', { entityId: newIdStr });
    } catch (error) {
      logger.error(`CadViewerEngine:${this._id}`, 'Failed to handle draw complete', { error: String(error) });
      this._emit('error', { error });
    }
  }

  /** 删除实体（前端立刻消失 + 后端墓碑式标记）。 */
  async deleteEntity(entityId: string): Promise<void> {
    this._assertInitialized('delete entity');
    if (!this._libraryId) throw new Error('当前文档不是从 map library 打开的，无法持久化删除');
    const node = this._renderer!.getEntityNode(entityId);
    const layer = node?.layer;
    const numericId = this._toNumericEntityId(entityId);
    this._renderer!.deleteEntityLocally(entityId);
    await invoke('delete_cadbin_entity', {
      libraryId: this._libraryId,
      entityId: numericId,
    });
    this._emit('entityChanged', { entityId, change: 'delete', layer });
  }

  async restoreEntity(snapshot: SceneNode): Promise<void> {
    this._assertInitialized('restore entity');
    if (!this._libraryId) throw new Error('当前文档不是从 map library 打开的，无法持久化恢复');
    const numericId = Number(snapshot.id);
    if (!Number.isFinite(numericId)) throw new Error(`非法 entityId: ${snapshot.id}`);
    const ok = this._renderer!.restoreEntityLocally(snapshot);
    if (!ok) throw new Error(`前端恢复实体失败: ${snapshot.id}`);
    await invoke('restore_cadbin_entity', {
      libraryId: this._libraryId,
      entityId: numericId,
      entityType: snapshot.type,
      snapshot: JSON.stringify(snapshot),
    });
    this._emit('entityChanged', { entityId: String(snapshot.id), change: 'restore', layer: snapshot.layer });
  }

  async addEntity(entityJson: string): Promise<string> {
    this._assertInitialized('add entity');
    if (!this._libraryId) throw new Error('当前文档不是从 map library 打开的，无法持久化新增');
    const newId = await invoke<number>('add_cadbin_entity', {
      libraryId: this._libraryId,
      entityJson,
    });
    const idStr = String(newId);
    this._emit('entityChanged', { entityId: idStr, change: 'add' });
    return idStr;
  }

  addEntityLocally(node: import('./cad_runtime/scene_node').SceneNode): boolean {
    return this._renderer?.addEntityLocally(node) ?? false;
  }

  async addTextEntity(params: {
    content: string;
    layer: string;
    x: number;
    y: number;
    height?: number;
    color?: number;
    rotation?: number;
  }): Promise<string> {
    this._assertInitialized('add text entity');
    if (!this._libraryId) throw new Error('当前文档不是从 map library 打开的，无法持久化新增文本');

    const entityJson = JSON.stringify({
      type: 'Text',
      id: '',
      layer: params.layer,
      color: params.color ?? 7,
      position: { x: params.x, y: params.y, z: 0 },
      height: params.height ?? 2.5,
      content: params.content,
      rotation: params.rotation ?? 0,
      horizontal_alignment: 0,
      vertical_alignment: 0,
    });

    const newIdStr = await this.addEntity(entityJson);

    const node = this._cadEntityJsonToSceneNode(entityJson, Number(newIdStr));
    if (node) {
      this._renderer!.addEntityLocally(node);
    }
    this._emit('entityCreated', { entityId: newIdStr });
    return newIdStr;
  }

  startTextPlacement(params: { content: string; height: number; layer: string; color: number }): void {
    this._assertInitialized('start text placement');
    this._renderer!.setInteractionMode('draw_text');
    this._renderer!.setTextDrawParams(params);
  }

  cancelTextPlacement(): void {
    this._assertInitialized('cancel text placement');
    if (this._renderer!.getInteractionMode() === 'draw_text') {
      this._renderer!.setInteractionMode('select');
    }
  }

  /** 改图层属性（color/visible/locked/frozen 任意子集）。会持久化并同步到 renderer。 */
  async updateLayerProps(layerName: string, props: { color?: number; visible?: boolean; locked?: boolean; frozen?: boolean }): Promise<void> {
    this._assertInitialized('update layer props');
    if (!this._libraryId) throw new Error('当前文档不是从 map library 打开的，无法持久化图层属性');
    if (props.color !== undefined) this._renderer!.setLayerColor(layerName, props.color);
    if (props.visible !== undefined) this._renderer!.setLayerVisible(layerName, props.visible);
    if (props.locked !== undefined) this._renderer!.setLayerLocked(layerName, props.locked);

    const existing = this._pendingLayerProps.get(layerName);
    if (existing) {
      if (props.color !== undefined) existing.color = props.color;
      if (props.visible !== undefined) existing.visible = props.visible;
      if (props.locked !== undefined) existing.locked = props.locked;
      if (props.frozen !== undefined) existing.frozen = props.frozen;
    } else {
      this._pendingLayerProps.set(layerName, { ...props });
    }

    if (this._layerPropsFlushTimer) {
      clearTimeout(this._layerPropsFlushTimer);
    }
    this._layerPropsFlushTimer = setTimeout(() => {
      this._flushLayerProps();
    }, CadViewerEngine.LAYER_PROPS_DEBOUNCE_MS);

    this._emit('entityChanged', { layerName, change: 'layer-props', value: props });
  }

  async createLayer(layerName: string, color?: number): Promise<void> {
    this._assertInitialized('create layer');
    if (!this._libraryId) throw new Error('当前文档不是从 map library 打开的，无法持久化新建图层');
    await invoke('create_cadbin_layer', {
      libraryId: this._libraryId,
      layerName,
      color,
    });
    this._emit('entityChanged', { layerName, change: 'layer-created' });
  }

  async deleteLayer(layerName: string, deleteEntities: boolean = false): Promise<void> {
    this._assertInitialized('delete layer');
    if (!this._libraryId) throw new Error('当前文档不是从 map library 打开的，无法持久化删除图层');
    await invoke('delete_cadbin_layer', {
      libraryId: this._libraryId,
      layerName,
      deleteEntities,
    });
    this._renderer!.removeLayer(layerName, deleteEntities);
    this._emit('entityChanged', { layerName, change: 'layer-deleted' });
  }

  async renameLayer(oldName: string, newName: string): Promise<void> {
    this._assertInitialized('rename layer');
    if (!this._libraryId) throw new Error('当前文档不是从 map library 打开的，无法持久化重命名图层');
    if (oldName === newName) return;
    await invoke('rename_cadbin_layer', {
      libraryId: this._libraryId,
      oldName,
      newName,
    });
    this._renderer!.renameLayer(oldName, newName);
    this._emit('entityChanged', { layerName: newName, change: 'layer-renamed' });
  }

  async updateLayerPropsOnly(layerName: string, props: { color?: number; visible?: boolean; locked?: boolean; frozen?: boolean }): Promise<void> {
    this._assertInitialized('update layer props only');
    if (!this._libraryId) throw new Error('当前文档不是从 map library 打开的，无法持久化图层属性');

    const existing = this._pendingLayerProps.get(layerName);
    if (existing) {
      if (props.color !== undefined) existing.color = props.color;
      if (props.visible !== undefined) existing.visible = props.visible;
      if (props.locked !== undefined) existing.locked = props.locked;
      if (props.frozen !== undefined) existing.frozen = props.frozen;
    } else {
      this._pendingLayerProps.set(layerName, { ...props });
    }

    if (this._layerPropsFlushTimer) {
      clearTimeout(this._layerPropsFlushTimer);
    }
    this._layerPropsFlushTimer = setTimeout(() => {
      this._flushLayerProps();
    }, CadViewerEngine.LAYER_PROPS_DEBOUNCE_MS);

    this._emit('entityChanged', { layerName, change: 'layer-props', value: props });
  }

  async batchUpdateLayerProps(updates: Array<{ layerName: string; props: { color?: number; visible?: boolean; locked?: boolean; frozen?: boolean } }>): Promise<void> {
    this._assertInitialized('batch update layer props');
    if (!this._libraryId) throw new Error('当前文档不是从 map library 打开的，无法持久化图层属性');

    for (const { layerName, props } of updates) {
      const existing = this._pendingLayerProps.get(layerName);
      if (existing) {
        if (props.color !== undefined) existing.color = props.color;
        if (props.visible !== undefined) existing.visible = props.visible;
        if (props.locked !== undefined) existing.locked = props.locked;
        if (props.frozen !== undefined) existing.frozen = props.frozen;
      } else {
        this._pendingLayerProps.set(layerName, { ...props });
      }
    }

    if (this._layerPropsFlushTimer) {
      clearTimeout(this._layerPropsFlushTimer);
    }
    this._layerPropsFlushTimer = setTimeout(() => {
      this._flushLayerProps();
    }, CadViewerEngine.LAYER_PROPS_DEBOUNCE_MS);
  }

  private async _flushLayerProps(): Promise<void> {
    this._layerPropsFlushTimer = null;
    if (!this._libraryId || this._pendingLayerProps.size === 0) return;

    const pending = new Map(this._pendingLayerProps);
    this._pendingLayerProps.clear();

    const promises: Promise<void>[] = [];
    for (const [layerName, props] of pending) {
      promises.push(
        invoke('update_cadbin_layer_props', {
          libraryId: this._libraryId,
          layerName,
          props: {
            color: props.color ?? null,
            visible: props.visible ?? null,
            locked: props.locked ?? null,
            frozen: props.frozen ?? null,
          },
        }).then(() => {}).catch((err) => {
          logger.error('CadViewerEngine', `flush layer props failed for ${layerName}`, err);
        })
      );
    }
    await Promise.all(promises);
  }

  async flushPendingChanges(): Promise<void> {
    if (this._layerPropsFlushTimer) {
      clearTimeout(this._layerPropsFlushTimer);
    }
    await this._flushLayerProps();
  }

  setBackgroundColor(color: string, opacity?: number): void {
    this._renderer?.setBackgroundColor(color, opacity);
  }

  setLineColor(color: string): void {
    this._renderer?.setLineColor(color);
  }

  isDarkBackground(): boolean {
    return this._renderer?.isDarkBackground() ?? true;
  }

  getCursorWorldCoord(): { x: number; y: number } | null {
    return this._renderer?.getLastWorldCoord() ?? null;
  }

  getViewportWorldHeight(): number {
    const info = this._renderer?.getCameraInfo();
    return info?.worldHeight ?? 100;
  }

  getCameraInfo(): CameraInfo | null {
    return this._renderer?.getCameraInfo() ?? null;
  }

  private _toNumericEntityId(entityId: string): number {
    const numericId = Number(entityId);
    if (!Number.isFinite(numericId)) {
      throw new Error(`非法 entityId: ${entityId}`);
    }
    return numericId;
  }

  private _assertInitialized(action: string): void {
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

  setTransformParams(params: TransformParams | null): void {
    this._transformParams = params;
    // 传递到渲染器，确保文字等实体也被正确变换
    if (this._renderer) {
      this._renderer.setTransformParams(params);
    }
  }

  getTransformParams(): TransformParams | null {
    return this._transformParams;
  }

  cadToGeo(cadCoord: SpatialCoordinate): SpatialCoordinate | null {
    if (!this._transformParams) return null;
    return applyTransform(cadCoord, this._transformParams);
  }

  geoToCad(geoCoord: SpatialCoordinate): SpatialCoordinate | null {
    if (!this._transformParams) return null;
    return inverseTransform(geoCoord, this._transformParams);
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

  private _documentLayers: import('./types').CadLayer[] = [];

  showAllLayers(): void {
    this._assertInitialized('show all layers');
    const layerNames = this._renderer?.getLayers() || [];
    const changes = layerNames.map(name => ({ layerName: name, visible: true }));
    this._renderer?.setMultipleLayersVisible(changes);
    // 后端持久化：仅当文档从 map library 打开时才执行
    if (this._libraryId) {
      this.batchUpdateLayerProps(changes.map(({ layerName }) => ({ layerName, props: { visible: true } })))
        .catch(err => logger.error('CadViewerEngine', 'showAllLayers persist failed', err));
    }
    this._emit('layersVisibilityChanged', { visible: true });
  }

  /** 隐藏所有图层（批量操作，避免通知风暴） */
  hideAllLayers(): void {
    this._assertInitialized('hide all layers');
    const layerNames = this._renderer?.getLayers() || [];
    const changes = layerNames.map(name => ({ layerName: name, visible: false }));
    this._renderer?.setMultipleLayersVisible(changes);
    // 后端持久化：仅当文档从 map library 打开时才执行
    if (this._libraryId) {
      this.batchUpdateLayerProps(changes.map(({ layerName }) => ({ layerName, props: { visible: false } })))
        .catch(err => logger.error('CadViewerEngine', 'hideAllLayers persist failed', err));
    }
    this._emit('layersVisibilityChanged', { visible: false });
  }

  getDocumentLayers(): import('./types').CadLayer[] {
    return this._documentLayers;
  }

  /** @deprecated Use engine.renderer?.xxx() instead */
  zoomIn(): void { this._renderer?.zoomIn(); }
  /** @deprecated Use engine.renderer?.xxx() instead */
  zoomOut(): void { this._renderer?.zoomOut(); }
  /** @deprecated Use engine.renderer?.xxx() instead */
  fitToView(): void { this._renderer?.fitToView(); }
  /** @deprecated Use engine.renderer?.xxx() instead */
  setFitMode(mode: 'contain' | 'cover' | 'stretch' | 'custom'): void { this._renderer?.setFitMode(mode); }
  /** @deprecated Use engine.renderer?.xxx() instead */
  getFitMode() { return this._renderer?.getFitMode() ?? 'contain' as const; }
  /** @deprecated Use engine.renderer?.xxx() instead */
  getCameraState() { return this._renderer?.getCameraState() ?? null; }
  /** @deprecated Use engine.renderer?.xxx() instead */
  getDrawingBounds() { return this._renderer?.getDrawingBounds() ?? null; }
  /** @deprecated Use engine.renderer?.xxx() instead */
  setCameraState(state: { centerX: number; centerY: number; halfW: number; halfH: number }): void { this._renderer?.setCameraState(state); }
  /** @deprecated Use engine.renderer?.xxx() instead */
  setLayerVisible(layerName: string, visible: boolean): void { this._renderer?.setLayerVisible(layerName, visible); }
  /** @deprecated Use engine.renderer?.xxx() instead */
  setMultipleLayersVisible(changes: Array<{ layerName: string; visible: boolean }>): void { this._renderer?.setMultipleLayersVisible(changes); }
  /** @deprecated Use engine.renderer?.xxx() instead */
  isLayerVisible(layerName: string): boolean { return this._renderer?.isLayerVisible(layerName) ?? true; }
  /** @deprecated Use engine.renderer?.xxx() instead */
  getLayers(): string[] { return this._renderer?.getLayers() ?? []; }
  /** @deprecated Use engine.renderer?.xxx() instead */
  selectEntity(entityId: string, additive = false): void { this._renderer?.selectEntity(entityId, additive); }
  /** @deprecated Use engine.renderer?.xxx() instead */
  deselectEntity(entityId?: string): void { entityId ? this._renderer?.deselectEntity(entityId) : this._renderer?.deselectAll(); }
  /** @deprecated Use engine.renderer?.xxx() instead */
  deselectAll(): void { this._renderer?.deselectAll(); }
  /** @deprecated Use engine.renderer?.xxx() instead */
  getSelectedEntityIds(): string[] { return this._renderer?.getSelectedEntityIds() ?? []; }
  /** @deprecated Use engine.renderer?.xxx() instead */
  selectEntitiesInRect(minX: number, minY: number, maxX: number, maxY: number, additive = false): string[] { return this._renderer?.selectEntitiesInRect(minX, minY, maxX, maxY, additive) ?? []; }
  /** @deprecated Use engine.renderer?.xxx() instead */
  setInteractionMode(mode: 'select' | 'pan' | 'draw_line' | 'draw_circle' | 'draw_text'): void { this._renderer?.setInteractionMode(mode); }
  /** @deprecated Use engine.renderer?.xxx() instead */
  getInteractionMode() { return this._renderer?.getInteractionMode() ?? 'select' as const; }
  /** @deprecated Use engine.renderer?.xxx() instead */
  getSelectedEntityId(): string | null { return this._renderer?.getSelectedEntityId() ?? null; }
  /** @deprecated Use engine.renderer?.xxx() instead */
  setDebugMode(enabled: boolean): void { this._renderer?.setDebugMode(enabled); }
  /** @deprecated Use engine.renderer?.xxx() instead */
  setSnapEnabled(type: string, enabled: boolean): void { this._renderer?.setSnapEnabled(type, enabled); }
  /** @deprecated Use engine.renderer?.xxx() instead */
  getSnapManager(): import('./snap/SnapManager').SnapManager | null { return this._renderer?.getSnapManager() ?? null; }

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

  private readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }
}
