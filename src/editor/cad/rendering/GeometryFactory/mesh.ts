import * as THREE from 'three';
import type { CadEntity } from '../../types';
import type { SceneNode } from '../../cad_runtime/scene_node';
import type { EntityRenderContext } from '../../cad_runtime/entity_renderers/EntityRenderer';
import type { SceneManager } from '../SceneManager';
import { intToColor, textAlignmentToAttachmentPoint } from './geometryMath';
import type { GeometryFactory } from './core';
import type { GeometryFactoryInternal } from './internal';

declare module './core' {
  interface GeometryFactory {
    /** 根据 SceneNode 创建 mesh（优先走 EntityRendererRegistry，否则用内建方法）。 */
    createSceneNodeMesh(node: SceneNode): THREE.Object3D | null;
    /** 根据 CadEntity (旧 DXF 格式) 创建 mesh。 */
    createEntityMesh(entity: CadEntity): THREE.Object3D | null;
  }
}

function createEntityRenderContext(sceneManager: SceneManager): EntityRenderContext {
  const cam = (sceneManager as any)._camera as THREE.OrthographicCamera | undefined;
  return {
    scene: sceneManager.scene,
    camera: cam ?? new THREE.OrthographicCamera(),
    renderer: sceneManager.renderer,
    viewport: { width: sceneManager.width, height: sceneManager.height },
    zoom: cam?.zoom ?? 1,
    frameTime: performance.now(),
  };
}

export const meshMethods = {
  createSceneNodeMesh(this: GeometryFactory, node: SceneNode): THREE.Object3D | null {
    const f = this as unknown as GeometryFactoryInternal;
    // 尝试用外部注册的 renderer
    const renderer = f._entityRendererRegistry?.getRendererForType(node.type);
    if (renderer) {
      try {
        const context = createEntityRenderContext(f._sceneManager);
        const result = renderer.create(node, context);
        if (result) {
          result.object.userData.entityId = node.id;
          result.object.userData.entityType = node.type;
          return result.object;
        }
      } catch (err) {
        console.warn(`[GeometryFactory] EntityRenderer for "${node.type}" failed, falling back to built-in:`, err);
      }
    }

    const color = this.resolveColor(node.color, node.layer);
    const lineWidth = this.resolveLineWidth((node as { lineWeight?: number }).lineWeight);

    switch (node.type) {
      case 'line':
        return this.createLine(
          { x: node.startX, y: node.startY, z: 0 },
          { x: node.endX, y: node.endY, z: 0 },
          color, lineWidth,
        );
      case 'circle':
        return this.createCircle(
          { x: node.centerX, y: node.centerY, z: 0 },
          node.radius, color, lineWidth,
        );
      case 'arc':
        return this.createArc(
          { x: node.centerX, y: node.centerY, z: 0 },
          node.radius, node.startAngle, node.endAngle, color, lineWidth,
        );
      case 'ellipse':
        return this.createEllipse(
          { x: node.centerX, y: node.centerY, z: 0 },
          { x: node.majorX, y: node.majorY, z: 0 },
          node.minorRatio, node.startAngle, node.endAngle, color, lineWidth,
        );
      case 'lwPolyline':
        return this.createLwPolyline(
          node.vertices.map(v => ({ x: v.x, y: v.y, bulge: v.bulge })),
          node.closed, color, lineWidth,
        );
      case 'polyline':
        return this.createPolyline(
          node.vertices.map(v => ({ x: v.x, y: v.y, z: v.z })),
          node.closed, color, lineWidth,
        );
      case 'spline':
        return this.createSpline(
          node.controlPoints.map(p => ({ x: p.x, y: p.y, z: p.z })),
          node.fitPoints.map(p => ({ x: p.x, y: p.y, z: p.z })),
          node.knots, node.degree, color, lineWidth,
        );
      case 'text': {
        const ap = textAlignmentToAttachmentPoint(
          (node as any).horizontalAlignment ?? 0,
          (node as any).verticalAlignment ?? 0,
        );
        return this.createText(
          { x: node.posX, y: node.posY, z: 0 },
          node.content, node.height, node.rotation, color, ap,
        );
      }
      case 'mText':
        return this.createText(
          { x: node.posX, y: node.posY, z: 0 },
          node.content, node.height, node.rotation, color,
          node.attachmentPoint || 1, node.width || 0,
          (node as any).widthFactor ?? 1.0,
          (node as any).fontName ?? '',
          (node as any).heightScale ?? 1.0,
        );
      case 'solid':
        return this.createSolid(
          node.points.map(p => ({ x: p.x, y: p.y, z: 0 })),
          color,
        );
      case 'point':
        return this.createPoint({ x: node.posX, y: node.posY, z: 0 }, color);
      case 'hatch':
        return this.createHatch(
          node.boundaries.map(path => path.map(v => ({ x: v.x, y: v.y, bulge: v.bulge }))),
          node.solid, node.scale, node.angle, color, lineWidth,
          (node as any).style ?? 0,
          ((node as any).patternLines ?? []).map((pl: any) => ({
            angle: pl.angle, base_x: pl.base_x, base_y: pl.base_y,
            offset_x: pl.offset_x, offset_y: pl.offset_y, dashes: pl.dashes,
          })),
        );
      case 'dimension':
        return this.createDimension(
          { x: node.defX, y: node.defY, z: 0 },
          { x: node.midX, y: node.midY, z: 0 },
          node.content, node.rotation, color, lineWidth,
        );
      case 'insert':
        return this.createInsertPlaceholder(
          { x: node.posX, y: node.posY, z: 0 },
          Math.max(Math.abs(node.scaleX), Math.abs(node.scaleY)) || 1,
          color, lineWidth,
        );
      default:
        return null;
    }
  },

  createEntityMesh(this: GeometryFactory, entity: CadEntity): THREE.Object3D | null {
    const f = this as unknown as GeometryFactoryInternal;
    let color = intToColor(entity.color);
    if (entity.color === 0xFFFFFF) {
      color = f._defaultLineColor.clone();
    }
    const lineWidth = this.resolveLineWidth((entity as any).line_weight);

    switch (entity.type) {
      case 'Line':
        return this.createLine(entity.start, entity.end, color, lineWidth);
      case 'Circle':
        return this.createCircle(entity.center, entity.radius, color, lineWidth);
      case 'Arc':
        return this.createArc(entity.center, entity.radius, entity.start_angle, entity.end_angle, color, lineWidth);
      case 'Polyline':
        return this.createPolyline(entity.vertices, entity.closed, color, lineWidth);
      case 'LwPolyline':
        return this.createLwPolyline(entity.vertices, entity.closed, color, lineWidth);
      case 'Ellipse':
        return this.createEllipse(entity.center, entity.major_axis, entity.minor_axis_ratio, entity.start_angle, entity.end_angle, color, lineWidth);
      case 'Spline':
        return this.createSpline(entity.control_points, entity.fit_points, entity.knots, entity.degree, color, lineWidth);
      case 'Text': {
        const ap = textAlignmentToAttachmentPoint(
          (entity as any).horizontal_alignment ?? 0,
          (entity as any).vertical_alignment ?? 0,
        );
        return this.createText(entity.position, entity.content, entity.height, entity.rotation, color, ap);
      }
      case 'MText':
        return this.createText(entity.position, entity.content, entity.height, entity.rotation, color, entity.attachment_point ?? 1, (entity as any).width ?? 0, (entity as any).width_factor ?? 1.0, (entity as any).font_name ?? '', (entity as any).height_scale ?? 1.0);
      case 'Solid':
        return this.createSolid(entity.points, color);
      case 'Point':
        return this.createPoint(entity.position, color);
      case 'Insert':
        return this.renderInsert(entity);
      case 'Hatch':
        return this.createHatch(
          entity.boundaries,
          entity.solid,
          entity.scale,
          entity.angle,
          color,
          lineWidth,
          (entity as any).style ?? 0,
          ((entity as any).pattern_lines ?? []).map((pl: any) => ({
            angle: pl.angle, base_x: pl.base_x, base_y: pl.base_y,
            offset_x: pl.offset_x, offset_y: pl.offset_y, dashes: pl.dashes,
          })),
        );
      case 'Dimension':
        return this.createDimension(entity.definition_point, entity.text_midpoint, entity.content, entity.rotation, color, lineWidth);
      default:
        return null;
    }
  },
} satisfies Pick<GeometryFactory, 'createSceneNodeMesh' | 'createEntityMesh'>;