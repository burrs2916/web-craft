import { invoke } from '@tauri-apps/api/core';
import { logger } from '../../../utils/logger';
import type { CadLayer } from '../types';
import { LAYER_PROPS_DEBOUNCE_MS } from './constants';
import type { CadViewerEngine } from './core';
import type { CadViewerEngineInternal, LayerPropsPatch } from './internal';

declare module './core' {
  interface CadViewerEngine {
    /** 改图层属性（color/visible/locked/frozen 任意子集）。会持久化并同步到 renderer。 */
    updateLayerProps(layerName: string, props: LayerPropsPatch): Promise<void>;
    /** 新建图层（后端持久化）。 */
    createLayer(layerName: string, color?: number): Promise<void>;
    /** 删除图层；deleteEntities 为真时一并删除图层内实体。 */
    deleteLayer(layerName: string, deleteEntities?: boolean): Promise<void>;
    /** 重命名图层（后端持久化 + renderer 内实体迁移）。 */
    renameLayer(oldName: string, newName: string): Promise<void>;
    /** 仅更新待持久化的图层属性（不同步 renderer）。 */
    updateLayerPropsOnly(layerName: string, props: LayerPropsPatch): Promise<void>;
    /** 批量更新待持久化的图层属性。 */
    batchUpdateLayerProps(updates: Array<{ layerName: string; props: LayerPropsPatch }>): Promise<void>;
    /** 立即冲刷待持久化的图层属性变更。 */
    flushPendingChanges(): Promise<void>;
    /** 显示所有图层（批量操作，避免通知风暴）。 */
    showAllLayers(): void;
    /** 隐藏所有图层（批量操作，避免通知风暴）。 */
    hideAllLayers(): void;
    /** 当前文档的图层快照（打开文档时记录）。 */
    getDocumentLayers(): CadLayer[];
  }
}

export const layerMethods = {
  async updateLayerProps(this: CadViewerEngine, layerName: string, props: LayerPropsPatch): Promise<void> {
    const f = this as unknown as CadViewerEngineInternal;
    f._assertInitialized('update layer props');
    if (!f._libraryId) throw new Error('当前文档不是从 map library 打开的，无法持久化图层属性');
    if (props.color !== undefined) f._renderer!.setLayerColor(layerName, props.color);
    if (props.visible !== undefined) f._renderer!.setLayerVisible(layerName, props.visible);
    if (props.locked !== undefined) f._renderer!.setLayerLocked(layerName, props.locked);

    const existing = f._pendingLayerProps.get(layerName);
    if (existing) {
      if (props.color !== undefined) existing.color = props.color;
      if (props.visible !== undefined) existing.visible = props.visible;
      if (props.locked !== undefined) existing.locked = props.locked;
      if (props.frozen !== undefined) existing.frozen = props.frozen;
    } else {
      f._pendingLayerProps.set(layerName, { ...props });
    }

    if (f._layerPropsFlushTimer) {
      clearTimeout(f._layerPropsFlushTimer);
    }
    f._layerPropsFlushTimer = setTimeout(() => {
      f._flushLayerProps();
    }, LAYER_PROPS_DEBOUNCE_MS);

    f._emit('entityChanged', { layerName, change: 'layer-props', value: props });
  },

  async createLayer(this: CadViewerEngine, layerName: string, color?: number): Promise<void> {
    const f = this as unknown as CadViewerEngineInternal;
    f._assertInitialized('create layer');
    if (!f._libraryId) throw new Error('当前文档不是从 map library 打开的，无法持久化新建图层');
    await invoke('create_cadbin_layer', {
      libraryId: f._libraryId,
      layerName,
      color,
    });
    f._emit('entityChanged', { layerName, change: 'layer-created' });
  },

  async deleteLayer(this: CadViewerEngine, layerName: string, deleteEntities: boolean = false): Promise<void> {
    const f = this as unknown as CadViewerEngineInternal;
    f._assertInitialized('delete layer');
    if (!f._libraryId) throw new Error('当前文档不是从 map library 打开的，无法持久化删除图层');
    await invoke('delete_cadbin_layer', {
      libraryId: f._libraryId,
      layerName,
      deleteEntities,
    });
    f._renderer!.removeLayer(layerName, deleteEntities);
    f._emit('entityChanged', { layerName, change: 'layer-deleted' });
  },

  async renameLayer(this: CadViewerEngine, oldName: string, newName: string): Promise<void> {
    const f = this as unknown as CadViewerEngineInternal;
    f._assertInitialized('rename layer');
    if (!f._libraryId) throw new Error('当前文档不是从 map library 打开的，无法持久化重命名图层');
    if (oldName === newName) return;
    await invoke('rename_cadbin_layer', {
      libraryId: f._libraryId,
      oldName,
      newName,
    });
    f._renderer!.renameLayer(oldName, newName);
    f._emit('entityChanged', { layerName: newName, change: 'layer-renamed' });
  },

  async updateLayerPropsOnly(this: CadViewerEngine, layerName: string, props: LayerPropsPatch): Promise<void> {
    const f = this as unknown as CadViewerEngineInternal;
    f._assertInitialized('update layer props only');
    if (!f._libraryId) throw new Error('当前文档不是从 map library 打开的，无法持久化图层属性');

    const existing = f._pendingLayerProps.get(layerName);
    if (existing) {
      if (props.color !== undefined) existing.color = props.color;
      if (props.visible !== undefined) existing.visible = props.visible;
      if (props.locked !== undefined) existing.locked = props.locked;
      if (props.frozen !== undefined) existing.frozen = props.frozen;
    } else {
      f._pendingLayerProps.set(layerName, { ...props });
    }

    if (f._layerPropsFlushTimer) {
      clearTimeout(f._layerPropsFlushTimer);
    }
    f._layerPropsFlushTimer = setTimeout(() => {
      f._flushLayerProps();
    }, LAYER_PROPS_DEBOUNCE_MS);

    f._emit('entityChanged', { layerName, change: 'layer-props', value: props });
  },

  async batchUpdateLayerProps(this: CadViewerEngine, updates: Array<{ layerName: string; props: LayerPropsPatch }>): Promise<void> {
    const f = this as unknown as CadViewerEngineInternal;
    f._assertInitialized('batch update layer props');
    if (!f._libraryId) throw new Error('当前文档不是从 map library 打开的，无法持久化图层属性');

    for (const { layerName, props } of updates) {
      const existing = f._pendingLayerProps.get(layerName);
      if (existing) {
        if (props.color !== undefined) existing.color = props.color;
        if (props.visible !== undefined) existing.visible = props.visible;
        if (props.locked !== undefined) existing.locked = props.locked;
        if (props.frozen !== undefined) existing.frozen = props.frozen;
      } else {
        f._pendingLayerProps.set(layerName, { ...props });
      }
    }

    if (f._layerPropsFlushTimer) {
      clearTimeout(f._layerPropsFlushTimer);
    }
    f._layerPropsFlushTimer = setTimeout(() => {
      f._flushLayerProps();
    }, LAYER_PROPS_DEBOUNCE_MS);
  },

  async _flushLayerProps(this: CadViewerEngine): Promise<void> {
    const f = this as unknown as CadViewerEngineInternal;
    f._layerPropsFlushTimer = null;
    if (!f._libraryId || f._pendingLayerProps.size === 0) return;

    const pending = new Map(f._pendingLayerProps);
    f._pendingLayerProps.clear();

    const promises: Promise<void>[] = [];
    for (const [layerName, props] of pending) {
      promises.push(
        invoke('update_cadbin_layer_props', {
          libraryId: f._libraryId,
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
  },

  async flushPendingChanges(this: CadViewerEngine): Promise<void> {
    const f = this as unknown as CadViewerEngineInternal;
    if (f._layerPropsFlushTimer) {
      clearTimeout(f._layerPropsFlushTimer);
    }
    await f._flushLayerProps();
  },

  showAllLayers(this: CadViewerEngine): void {
    const f = this as unknown as CadViewerEngineInternal;
    f._assertInitialized('show all layers');
    const layerNames = f._renderer?.getLayers() || [];
    const changes = layerNames.map(name => ({ layerName: name, visible: true }));
    f._renderer?.setMultipleLayersVisible(changes);
    // 后端持久化：仅当文档从 map library 打开时才执行
    if (f._libraryId) {
      this.batchUpdateLayerProps(changes.map(({ layerName }) => ({ layerName, props: { visible: true } })))
        .catch(err => logger.error('CadViewerEngine', 'showAllLayers persist failed', err));
    }
    f._emit('layersVisibilityChanged', { visible: true });
  },

  /** 隐藏所有图层（批量操作，避免通知风暴） */
  hideAllLayers(this: CadViewerEngine): void {
    const f = this as unknown as CadViewerEngineInternal;
    f._assertInitialized('hide all layers');
    const layerNames = f._renderer?.getLayers() || [];
    const changes = layerNames.map(name => ({ layerName: name, visible: false }));
    f._renderer?.setMultipleLayersVisible(changes);
    // 后端持久化：仅当文档从 map library 打开时才执行
    if (f._libraryId) {
      this.batchUpdateLayerProps(changes.map(({ layerName }) => ({ layerName, props: { visible: false } })))
        .catch(err => logger.error('CadViewerEngine', 'hideAllLayers persist failed', err));
    }
    f._emit('layersVisibilityChanged', { visible: false });
  },

  getDocumentLayers(this: CadViewerEngine): CadLayer[] {
    const f = this as unknown as CadViewerEngineInternal;
    return f._documentLayers;
  },
};