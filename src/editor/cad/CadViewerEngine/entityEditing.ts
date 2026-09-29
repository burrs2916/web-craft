import { invoke } from '@tauri-apps/api/core';
import { logger } from '../../../utils/logger';
import type { SceneNode } from '../cad_runtime/scene_node';
import type { CadViewerEngine } from './core';
import type { CadViewerEngineInternal } from './internal';

declare module './core' {
  interface CadViewerEngine {
    /** 改 Text/MText 内容并写回 cadbin（前端即时替换 mesh + 后端持久化）。 */
    updateTextContent(entityId: string, newContent: string): Promise<void>;
    /** 改实体颜色（前端 + 后端）。颜色为 0xRRGGBB 整数。 */
    updateEntityColor(entityId: string, newColorRgb: number): Promise<void>;
    /** 把实体移到另一个图层（前端 + 后端）。 */
    updateEntityLayer(entityId: string, newLayer: string): Promise<void>;
    /** 平移实体（dx/dy 是世界坐标增量）。 */
    moveEntity(entityId: string, dx: number, dy: number): Promise<void>;
    /** 批量平移实体。 */
    moveEntities(entityIds: string[], dx: number, dy: number): Promise<void>;
    /** 仅前端复制实体，返回新实体 id。 */
    copyEntityLocally(entityId: string, dx: number, dy: number): string | null;
    /** 仅前端批量复制实体，返回新实体 id 列表。 */
    copyEntitiesLocally(entityIds: string[], dx: number, dy: number): string[];
    /** 改实体属性（前端 + 后端），propsJson 为 SceneNode 属性 JSON。 */
    updateEntityProps(entityId: string, propsJson: string): Promise<void>;
    /** 删除实体（前端立刻消失 + 后端墓碑式标记）。 */
    deleteEntity(entityId: string): Promise<void>;
    /** 从快照恢复实体（前端 + 后端）。 */
    restoreEntity(snapshot: SceneNode): Promise<void>;
    /** 新增实体（后端分配 id），返回新实体 id 字符串。 */
    addEntity(entityJson: string): Promise<string>;
    /** 仅前端新增实体。 */
    addEntityLocally(node: SceneNode): boolean;
    /** 新增文字实体并返回新实体 id。 */
    addTextEntity(params: {
      content: string;
      layer: string;
      x: number;
      y: number;
      height?: number;
      color?: number;
      rotation?: number;
    }): Promise<string>;
    /** 进入文字点选放置模式。 */
    startTextPlacement(params: { content: string; height: number; layer: string; color: number }): void;
    /** 取消文字点选放置模式。 */
    cancelTextPlacement(): void;
  }
}

export const entityEditingMethods = {
  async updateTextContent(this: CadViewerEngine, entityId: string, newContent: string): Promise<void> {
    const f = this as unknown as CadViewerEngineInternal;
    f._assertInitialized('update text');
    if (!f._libraryId) {
      throw new Error('当前文档不是从 map library 打开的，无法持久化文字编辑');
    }
    const node = f._renderer!.getEntityNode(entityId);
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

    const ok = f._renderer!.updateTextContent(entityId, newContent);
    if (!ok) {
      throw new Error('前端替换文字 mesh 失败');
    }

    await invoke('update_cadbin_text_entity', {
      libraryId: f._libraryId,
      entityId: numericId,
      newContent,
    });
  },

  async updateEntityColor(this: CadViewerEngine, entityId: string, newColorRgb: number): Promise<void> {
    const f = this as unknown as CadViewerEngineInternal;
    f._assertInitialized('update color');
    if (!f._libraryId) throw new Error('当前文档不是从 map library 打开的，无法持久化颜色编辑');
    const numericId = f._toNumericEntityId(entityId);
    const ok = f._renderer!.updateEntityColor(entityId, newColorRgb);
    if (!ok) throw new Error(`找不到实体: ${entityId}`);
    await invoke('update_cadbin_entity_color', {
      libraryId: f._libraryId,
      entityId: numericId,
      newColor: newColorRgb,
    });
    f._emit('entityChanged', { entityId, change: 'color', value: newColorRgb });
  },

  async updateEntityLayer(this: CadViewerEngine, entityId: string, newLayer: string): Promise<void> {
    const f = this as unknown as CadViewerEngineInternal;
    f._assertInitialized('update layer');
    if (!f._libraryId) throw new Error('当前文档不是从 map library 打开的，无法持久化图层编辑');
    const numericId = f._toNumericEntityId(entityId);
    const ok = f._renderer!.updateEntityLayer(entityId, newLayer);
    if (!ok) throw new Error(`找不到实体: ${entityId}`);
    await invoke('update_cadbin_entity_layer', {
      libraryId: f._libraryId,
      entityId: numericId,
      newLayer,
    });
    f._emit('entityChanged', { entityId, change: 'layer', value: newLayer });
  },

  async moveEntity(this: CadViewerEngine, entityId: string, dx: number, dy: number): Promise<void> {
    const f = this as unknown as CadViewerEngineInternal;
    f._assertInitialized('move entity');
    if (!f._libraryId) throw new Error('当前文档不是从 map library 打开的，无法持久化移动');
    const numericId = f._toNumericEntityId(entityId);
    const ok = f._renderer!.moveEntity(entityId, dx, dy);
    if (!ok) throw new Error(`找不到实体: ${entityId}`);
    await invoke('move_cadbin_entity', {
      libraryId: f._libraryId,
      entityId: numericId,
      dx,
      dy,
    });
    f._emit('entityChanged', { entityId, change: 'move', value: { dx, dy } });
  },

  async moveEntities(this: CadViewerEngine, entityIds: string[], dx: number, dy: number): Promise<void> {
    const f = this as unknown as CadViewerEngineInternal;
    f._assertInitialized('move entities');
    if (!f._libraryId) throw new Error('当前文档不是从 map library 打开的，无法持久化移动');
    for (const entityId of entityIds) {
      const numericId = f._toNumericEntityId(entityId);
      const ok = f._renderer!.moveEntity(entityId, dx, dy);
      if (!ok) continue;
      await invoke('move_cadbin_entity', {
        libraryId: f._libraryId,
        entityId: numericId,
        dx,
        dy,
      });
      f._emit('entityChanged', { entityId, change: 'move', value: { dx, dy } });
    }
  },

  copyEntityLocally(this: CadViewerEngine, entityId: string, dx: number, dy: number): string | null {
    const f = this as unknown as CadViewerEngineInternal;
    f._assertInitialized('copy entity');
    const newId = f._renderer!.copyEntityLocally(entityId, dx, dy);
    if (newId) {
      f._emit('entityChanged', { entityId: newId, change: 'copy', value: { sourceId: entityId, dx, dy } });
    }
    return newId;
  },

  copyEntitiesLocally(this: CadViewerEngine, entityIds: string[], dx: number, dy: number): string[] {
    const f = this as unknown as CadViewerEngineInternal;
    f._assertInitialized('copy entities');
    const newIds = f._renderer!.copyEntitiesLocally(entityIds, dx, dy);
    for (const newId of newIds) {
      f._emit('entityChanged', { entityId: newId, change: 'copy' });
    }
    return newIds;
  },

  _sceneNodePropsToCadEntityProps(this: CadViewerEngine, entityId: string, sceneNodeProps: Record<string, unknown>): Record<string, unknown> {
    const f = this as unknown as CadViewerEngineInternal;
    const node = f._renderer?.getEntityNode(entityId);
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
  },

  async updateEntityProps(this: CadViewerEngine, entityId: string, propsJson: string): Promise<void> {
    const f = this as unknown as CadViewerEngineInternal;
    f._assertInitialized('update entity props');
    if (!f._libraryId) throw new Error('当前文档不是从 map library 打开的，无法持久化属性修改');
    const numericId = f._toNumericEntityId(entityId);
    const sceneNodeProps = JSON.parse(propsJson);
    const cadEntityProps = f._sceneNodePropsToCadEntityProps(entityId, sceneNodeProps);
    await invoke('update_cadbin_entity_props', {
      libraryId: f._libraryId,
      entityId: numericId,
      propsJson: JSON.stringify(cadEntityProps),
    });
    f._renderer!.updateEntityFromProps(entityId, sceneNodeProps);
    f._emit('entityChanged', { entityId, change: 'props' });
  },

  _cadEntityJsonToSceneNode(this: CadViewerEngine, entityJson: string, numericId: number): SceneNode | null {
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
  },

  async _handleDrawComplete(this: CadViewerEngine, entityJson: string): Promise<void> {
    const f = this as unknown as CadViewerEngineInternal;
    f._assertInitialized('handle draw complete');
    if (!f._libraryId) throw new Error('当前文档不是从 map library 打开的，无法持久化新增');

    try {
      const newIdStr = await this.addEntity(entityJson);
      const node = f._cadEntityJsonToSceneNode(entityJson, Number(newIdStr));
      if (node) {
        f._renderer!.addEntityLocally(node);
      }
      f._emit('entityChanged', { entityId: newIdStr, change: 'add' });
      f._emit('entityCreated', { entityId: newIdStr });
    } catch (error) {
      logger.error(`CadViewerEngine:${f._id}`, 'Failed to handle draw complete', { error: String(error) });
      f._emit('error', { error });
    }
  },

  async deleteEntity(this: CadViewerEngine, entityId: string): Promise<void> {
    const f = this as unknown as CadViewerEngineInternal;
    f._assertInitialized('delete entity');
    if (!f._libraryId) throw new Error('当前文档不是从 map library 打开的，无法持久化删除');
    const node = f._renderer!.getEntityNode(entityId);
    const layer = node?.layer;
    const numericId = f._toNumericEntityId(entityId);
    f._renderer!.deleteEntityLocally(entityId);
    await invoke('delete_cadbin_entity', {
      libraryId: f._libraryId,
      entityId: numericId,
    });
    f._emit('entityChanged', { entityId, change: 'delete', layer });
  },

  async restoreEntity(this: CadViewerEngine, snapshot: SceneNode): Promise<void> {
    const f = this as unknown as CadViewerEngineInternal;
    f._assertInitialized('restore entity');
    if (!f._libraryId) throw new Error('当前文档不是从 map library 打开的，无法持久化恢复');
    const numericId = Number(snapshot.id);
    if (!Number.isFinite(numericId)) throw new Error(`非法 entityId: ${snapshot.id}`);
    const ok = f._renderer!.restoreEntityLocally(snapshot);
    if (!ok) throw new Error(`前端恢复实体失败: ${snapshot.id}`);
    await invoke('restore_cadbin_entity', {
      libraryId: f._libraryId,
      entityId: numericId,
      entityType: snapshot.type,
      snapshot: JSON.stringify(snapshot),
    });
    f._emit('entityChanged', { entityId: String(snapshot.id), change: 'restore', layer: snapshot.layer });
  },

  async addEntity(this: CadViewerEngine, entityJson: string): Promise<string> {
    const f = this as unknown as CadViewerEngineInternal;
    f._assertInitialized('add entity');
    if (!f._libraryId) throw new Error('当前文档不是从 map library 打开的，无法持久化新增');
    const newId = await invoke<number>('add_cadbin_entity', {
      libraryId: f._libraryId,
      entityJson,
    });
    const idStr = String(newId);
    f._emit('entityChanged', { entityId: idStr, change: 'add' });
    return idStr;
  },

  addEntityLocally(this: CadViewerEngine, node: SceneNode): boolean {
    const f = this as unknown as CadViewerEngineInternal;
    return f._renderer?.addEntityLocally(node) ?? false;
  },

  async addTextEntity(this: CadViewerEngine, params: {
    content: string;
    layer: string;
    x: number;
    y: number;
    height?: number;
    color?: number;
    rotation?: number;
  }): Promise<string> {
    const f = this as unknown as CadViewerEngineInternal;
    f._assertInitialized('add text entity');
    if (!f._libraryId) throw new Error('当前文档不是从 map library 打开的，无法持久化新增文本');

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

    const node = f._cadEntityJsonToSceneNode(entityJson, Number(newIdStr));
    if (node) {
      f._renderer!.addEntityLocally(node);
    }
    f._emit('entityCreated', { entityId: newIdStr });
    return newIdStr;
  },

  startTextPlacement(this: CadViewerEngine, params: { content: string; height: number; layer: string; color: number }): void {
    const f = this as unknown as CadViewerEngineInternal;
    f._assertInitialized('start text placement');
    f._renderer!.setInteractionMode('draw_text');
    f._renderer!.setTextDrawParams(params);
  },

  cancelTextPlacement(this: CadViewerEngine): void {
    const f = this as unknown as CadViewerEngineInternal;
    f._assertInitialized('cancel text placement');
    if (f._renderer!.getInteractionMode() === 'draw_text') {
      f._renderer!.setInteractionMode('select');
    }
  },
};