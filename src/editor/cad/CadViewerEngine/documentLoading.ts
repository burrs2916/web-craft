import { invoke } from '@tauri-apps/api/core';
import { logger } from '../../../utils/logger';
import { CadbinReader } from '../cad_runtime/cadbin_reader';
import { SceneGraph } from '../cad_runtime/scene_graph';
import type { LayerNode, SceneNode } from '../cad_runtime/scene_node';
import type { ParseResult } from '../types';
import type { CadViewerEngine } from './core';
import type { CadViewerEngineInternal } from './internal';

declare module './core' {
  interface CadViewerEngine {
    /** 从内存字节打开 DXF/DWG 文档（走后端 parse_cad_from_bytes）。 */
    openDocument(fileName: string, content: ArrayBuffer, _options?: unknown): Promise<boolean>;
    /** 从浏览器 File 打开文档。 */
    openFile(file: File): Promise<boolean>;
    /** 从 URL（http/https 或本地路径）打开文档。 */
    openFromUrl(url: string, fileName?: string): Promise<boolean>;
    /** 从 cadbin 二进制打开文档（SceneGraph 路径）。 */
    openFromCadbin(buffer: ArrayBuffer, fileName?: string): Promise<boolean>;
    /** 从地图库读取 cadbin 并打开。 */
    openFromMapLibrary(libraryId: string, fileName?: string): Promise<boolean>;
    /** 完整的图层列表（含 visible/frozen/locked/entityCount/color），用于左侧图层面板。 */
    getCadbinLayers(): LayerNode[];
    /** 鼠标坐标（client px）→ 命中的 entityId（cadbin 数字 id 转字符串） */
    pickEntityIdAt(clientX: number, clientY: number): string | null;
    /** 取实体节点，主要给文字编辑/属性面板用 */
    getEntityNode(entityId: string): SceneNode | undefined;
  }
}

export const documentLoadingMethods = {
  async openDocument(
    this: CadViewerEngine,
    fileName: string,
    content: ArrayBuffer,
    _options?: unknown
  ): Promise<boolean> {
    const f = this as unknown as CadViewerEngineInternal;
    f._assertInitialized('open document');

    logger.info(`CadViewerEngine:${f._id}`, 'Opening document', { fileName, size: content.byteLength });

    try {
      f._emit('loadProgress', { stage: 'parsing', progress: 0 });

      const data = new Uint8Array(content);
      logger.info(`CadViewerEngine:${f._id}`, 'Invoking parse_cad_from_bytes', { dataLength: data.length, fileName });
      const result: ParseResult = await invoke('parse_cad_from_bytes', {
        data: data,
        fileName,
      });

      logger.info(`CadViewerEngine:${f._id}`, 'Parse result', {
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
        logger.error(`CadViewerEngine:${f._id}`, 'Failed to parse document', { error: result.error });
        f._emit('error', { error: err, fileName });
        throw err;
      }

      if (result.document.entity_count === 0) {
        logger.warn(`CadViewerEngine:${f._id}`, 'Document parsed but has 0 entities');
      }

      f._emit('loadProgress', { stage: 'rendering', progress: 50 });

      f._renderer!.loadDocument(result.document);
      f._documentLayers = result.document.layers || [];

      f._currentDocument = {
        fileName: result.document.file_name,
        title: result.document.file_name,
        extents: result.document.extents
          ? {
              min: result.document.extents.min,
              max: result.document.extents.max,
            }
          : undefined,
      };

      f._isDocumentLoaded = true;
      f._emit('loadProgress', { stage: 'complete', progress: 100 });
      f._emit('documentOpened', { fileName: result.document.file_name });

      return true;
    } catch (error) {
      logger.error(`CadViewerEngine:${f._id}`, 'Failed to open document', { error: String(error), fileName });
      f._emit('error', { error, fileName });
      throw error;
    }
  },

  async openFile(this: CadViewerEngine, file: File): Promise<boolean> {
    const f = this as unknown as CadViewerEngineInternal;
    try {
      const content = await f.readFileAsArrayBuffer(file);
      return this.openDocument(file.name, content);
    } catch (error) {
      logger.error(`CadViewerEngine:${f._id}`, 'Failed to read file', { error: String(error), fileName: file.name });
      f._emit('error', { error, fileName: file.name });
      throw error;
    }
  },

  async openFromUrl(this: CadViewerEngine, url: string, fileName?: string): Promise<boolean> {
    const f = this as unknown as CadViewerEngineInternal;
    f._assertInitialized('open from url');
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
        f._emit('error', { error: err, fileName: name });
        throw err;
      }

      f._emit('loadProgress', { stage: 'rendering', progress: 50 });

      f._renderer!.loadDocument(result.document);
      f._documentLayers = result.document.layers || [];

      f._currentDocument = {
        fileName: result.document.file_name,
        title: result.document.file_name,
        extents: result.document.extents
          ? {
              min: result.document.extents.min,
              max: result.document.extents.max,
            }
          : undefined,
      };

      f._isDocumentLoaded = true;
      f._emit('loadProgress', { stage: 'complete', progress: 100 });
      f._emit('documentOpened', { fileName: result.document.file_name });

      return true;
    } catch (error) {
      logger.error(`CadViewerEngine:${f._id}`, 'Failed to open from URL', { error: String(error), url });
      f._emit('error', { error, url });
      throw error;
    }
  },

  async openFromCadbin(this: CadViewerEngine, buffer: ArrayBuffer, fileName?: string): Promise<boolean> {
    const f = this as unknown as CadViewerEngineInternal;
    f._assertInitialized('open cadbin');

    logger.info(`CadViewerEngine:${f._id}`, 'Opening cadbin', { size: buffer.byteLength, fileName });

    try {
      f._emit('loadProgress', { stage: 'parsing', progress: 0 });

      const reader = new CadbinReader(buffer);
      const parsed = reader.parseAll();

      logger.info(`CadViewerEngine:${f._id}`, 'Cadbin parsed', {
        spatialEntryCount: parsed.spatialEntries.length,
        layerCount: parsed.layers.length,
        stringCount: parsed.strings.length,
      });

      f._emit('loadProgress', { stage: 'rendering', progress: 30 });

      const sceneGraph = new SceneGraph();
      sceneGraph.loadFromCadbin(buffer);
      f._sceneGraph = sceneGraph;

      f._emit('loadProgress', { stage: 'rendering', progress: 60 });

      f._renderer!.loadFromSceneGraph(sceneGraph);

      const layerNodes = sceneGraph.allLayers;
      f._documentLayers = layerNodes.map(l => ({
        name: l.name,
        color: l.color,
        visible: l.visible,
        frozen: l.frozen,
        locked: l.locked,
      }));

      const bounds = sceneGraph.bounds;
      f._currentDocument = {
        fileName: fileName || 'CAD Document',
        title: fileName || 'CAD Document',
        extents: bounds
          ? {
              min: { x: bounds.minX, y: bounds.minY },
              max: { x: bounds.maxX, y: bounds.maxY },
            }
          : undefined,
      };

      f._isDocumentLoaded = true;
      f._emit('loadProgress', { stage: 'complete', progress: 100 });
      f._emit('sceneGraphLoaded', {
        nodeCount: sceneGraph.allNodes.length,
        layerCount: layerNodes.length,
        bounds,
      });
      f._emit('documentOpened', { fileName: f._currentDocument!.fileName });

      return true;
    } catch (error) {
      logger.error(`CadViewerEngine:${f._id}`, 'Failed to open cadbin', { error: String(error), fileName });
      f._emit('error', { error, fileName });
      throw error;
    }
  },

  async openFromMapLibrary(this: CadViewerEngine, libraryId: string, fileName?: string): Promise<boolean> {
    const f = this as unknown as CadViewerEngineInternal;
    f._assertInitialized('open map library');

    logger.info(`CadViewerEngine:${f._id}`, 'Opening from map library', { libraryId });

    try {
      f._emit('loadProgress', { stage: 'loading', progress: 0 });

      const cadbinData: number[] = await invoke('read_map_library_cadbin', { id: libraryId });
      const buffer = new Uint8Array(cadbinData).buffer;

      f._emit('loadProgress', { stage: 'parsing', progress: 20 });

      f._libraryId = libraryId;
      return this.openFromCadbin(buffer, fileName);
    } catch (error) {
      logger.error(`CadViewerEngine:${f._id}`, 'Failed to open from map library', { error: String(error), libraryId });
      f._emit('error', { error, libraryId });
      throw error;
    }
  },

  getCadbinLayers(this: CadViewerEngine): LayerNode[] {
    const f = this as unknown as CadViewerEngineInternal;
    return f._sceneGraph?.allLayers ?? [];
  },

  pickEntityIdAt(this: CadViewerEngine, clientX: number, clientY: number): string | null {
    const f = this as unknown as CadViewerEngineInternal;
    return f._renderer?.pickEntityIdAt(clientX, clientY) ?? null;
  },

  getEntityNode(this: CadViewerEngine, entityId: string): SceneNode | undefined {
    const f = this as unknown as CadViewerEngineInternal;
    return f._renderer?.getEntityNode(entityId);
  },
};