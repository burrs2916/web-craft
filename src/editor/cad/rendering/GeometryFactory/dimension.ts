import * as THREE from 'three';
import type { CadPoint } from '../../types';
import { logger } from '../../../../utils/logger';
import { isValidNumber, isValidPoint } from './validation';
import type { GeometryFactory } from './core';
import type { GeometryFactoryInternal } from './internal';

declare module './core' {
  interface GeometryFactory {
    createDimension(
      definitionPoint: CadPoint,
      textMidpoint: CadPoint,
      content: string,
      rotation: number,
      color: THREE.Color,
      lineWidth: number,
    ): THREE.Group | null;
    /** INSERT 占位渲染：用十字+小圆圈表示块的插入点。 */
    createInsertPlaceholder(
      pos: { x: number; y: number; z: number },
      scale: number,
      color: THREE.Color,
      lineWidth: number,
    ): THREE.Object3D;
    /** INSERT (BlockRef) 递归渲染。 */
    renderInsert(entity: any): THREE.Object3D | null;
  }
}

export const dimensionMethods = {
  createDimension(
    this: GeometryFactory,
    definitionPoint: CadPoint,
    textMidpoint: CadPoint,
    content: string,
    rotation: number,
    color: THREE.Color,
    lineWidth: number
  ): THREE.Group | null {
    if (!isValidPoint(definitionPoint) || !isValidPoint(textMidpoint)) return null;
    if (!isValidNumber(rotation)) rotation = 0;

    const group = new THREE.Group();

    const dp = new THREE.Vector3(definitionPoint.x, definitionPoint.y, definitionPoint.z);
    const tm = new THREE.Vector3(textMidpoint.x, textMidpoint.y, textMidpoint.z);

    const dimLine = this.createLine2FromPoints([dp, tm], color, lineWidth);
    if (dimLine) group.add(dimLine);

    const arrowSize = 3;
    const dir = new THREE.Vector3().subVectors(tm, dp);
    const len = dir.length();
    if (len > arrowSize * 2) {
      const dirNorm = dir.normalize();
      const perp = new THREE.Vector3(-dirNorm.y, dirNorm.x, 0);

      const arrowPoints1 = [
        dp.clone(),
        dp.clone().add(dirNorm.clone().multiplyScalar(arrowSize)).add(perp.clone().multiplyScalar(arrowSize * 0.4)),
        dp.clone().add(dirNorm.clone().multiplyScalar(arrowSize)).add(perp.clone().multiplyScalar(-arrowSize * 0.4)),
        dp.clone(),
      ];
      const arrow1 = this.createLine2FromPoints(arrowPoints1, color, lineWidth);
      if (arrow1) group.add(arrow1);

      const arrowPoints2 = [
        tm.clone(),
        tm.clone().add(dirNorm.clone().multiplyScalar(-arrowSize)).add(perp.clone().multiplyScalar(arrowSize * 0.4)),
        tm.clone().add(dirNorm.clone().multiplyScalar(-arrowSize)).add(perp.clone().multiplyScalar(-arrowSize * 0.4)),
        tm.clone(),
      ];
      const arrow2 = this.createLine2FromPoints(arrowPoints2, color, lineWidth);
      if (arrow2) group.add(arrow2);
    }

    const extLen = 5;
    const dirNorm = len > 0 ? dir.normalize() : new THREE.Vector3(1, 0, 0);
    const perp = new THREE.Vector3(-dirNorm.y, dirNorm.x, 0);

    const ext1Start = dp.clone().add(perp.clone().multiplyScalar(-extLen));
    const ext1End = dp.clone().add(perp.clone().multiplyScalar(extLen));
    const ext1 = this.createLine2FromPoints([ext1Start, ext1End], color, lineWidth * 0.5);
    if (ext1) group.add(ext1);

    const ext2Start = tm.clone().add(perp.clone().multiplyScalar(-extLen));
    const ext2End = tm.clone().add(perp.clone().multiplyScalar(extLen));
    const ext2 = this.createLine2FromPoints([ext2Start, ext2End], color, lineWidth * 0.5);
    if (ext2) group.add(ext2);

    if (content && content.trim().length > 0) {
      const textMesh = this.createText(textMidpoint, content, 5, rotation, color, 5);
      if (textMesh) group.add(textMesh);
    }

    return group;
  },

  createInsertPlaceholder(
    this: GeometryFactory,
    pos: { x: number; y: number; z: number },
    scale: number,
    color: THREE.Color,
    lineWidth: number,
  ): THREE.Object3D {
    const group = new THREE.Group();
    const armSize = 6 * scale;
    const horizontal = this.createLine(
      { x: pos.x - armSize, y: pos.y, z: 0 },
      { x: pos.x + armSize, y: pos.y, z: 0 },
      color, lineWidth,
    );
    const vertical = this.createLine(
      { x: pos.x, y: pos.y - armSize, z: 0 },
      { x: pos.x, y: pos.y + armSize, z: 0 },
      color, lineWidth,
    );
    const ring = this.createCircle(pos, armSize * 0.6, color, lineWidth);
    if (horizontal) group.add(horizontal);
    if (vertical) group.add(vertical);
    if (ring) group.add(ring);
    return group;
  },

  renderInsert(this: GeometryFactory, entity: any): THREE.Object3D | null {
    const f = this as unknown as GeometryFactoryInternal;
    const MAX_INSERT_DEPTH = 10;
    if (f._insertDepth >= MAX_INSERT_DEPTH) {
      logger.warn('GeometryFactory', 'renderInsert: max depth exceeded', {
        blockName: entity.block_name,
        depth: f._insertDepth,
      });
      return null;
    }

    const blocks = f._entityStore.getBlocks();
    if (!blocks.size) {
      logger.warn('GeometryFactory', 'renderInsert: no blocks loaded');
      return null;
    }

    const blockName = entity.block_name || (entity as any).blockName;

    if (f._visitedBlocks.has(blockName)) {
      logger.warn('GeometryFactory', 'renderInsert: circular reference detected', { blockName });
      return null;
    }

    const block = blocks.get(blockName);
    if (!block) {
      logger.warn('GeometryFactory', 'renderInsert: block not found', { blockName: entity.block_name });
      return null;
    }

    const group = new THREE.Group();
    group.name = `INSERT_${entity.id}_${entity.block_name}`;

    const matrix = new THREE.Matrix4();
    matrix.makeScale(entity.x_scale, entity.y_scale, entity.z_scale);
    const rotationMatrix = new THREE.Matrix4();
    rotationMatrix.makeRotationZ(entity.rotation);
    matrix.premultiply(rotationMatrix);
    const translationMatrix = new THREE.Matrix4();
    translationMatrix.makeTranslation(entity.position.x, entity.position.y, entity.position.z);
    matrix.premultiply(translationMatrix);

    f._insertDepth++;
    f._visitedBlocks.add(blockName);

    try {
      for (const blkEntity of block.entities) {
        try {
          const mesh = this.createEntityMesh(blkEntity);
          if (mesh) {
            mesh.applyMatrix4(matrix);
            group.add(mesh);
          }
        } catch (e) {
          logger.warn('GeometryFactory', 'renderInsert: failed to render block entity', {
            blockName: entity.block_name,
            entityId: blkEntity.id,
            error: e
          });
        }
      }

      logger.info('GeometryFactory', 'renderInsert: rendered block', {
        blockName: entity.block_name,
        entityCount: block.entities.length,
        childCount: group.children.length
      });
    } finally {
      f._insertDepth--;
      if (f._insertDepth === 0) {
        f._visitedBlocks.clear();
      }
    }

    return group.children.length > 0 ? group : null;
  },
} satisfies Pick<GeometryFactory, 'createDimension' | 'createInsertPlaceholder' | 'renderInsert'>;