import * as THREE from 'three';
import { Text as TroikaText } from 'troika-three-text';
import type { CadPoint } from '../../types';
import type { SceneNode, BoundingBox } from '../../cad_runtime/scene_node';
import { applyTransform } from '../../coordinate/TransformCalculator';
import { estimateTextWidth, textAlignmentToAttachmentPoint } from './geometryMath';
import { isValidNumber, isValidPoint } from './validation';
import type { GeometryFactory } from './core';
import type { GeometryFactoryInternal } from './internal';

declare module './core' {
  interface GeometryFactory {
    /** 计算锚点对齐文字（Text/MText）的包围盒。 */
    anchoredTextBbox(posX: number, posY: number, width: number, height: number, rotation: number, col: number, row: number): BoundingBox;
    textNodeBbox(node: Extract<SceneNode, { type: 'text' }>): BoundingBox;
    mTextNodeBbox(node: Extract<SceneNode, { type: 'mText' }>): BoundingBox;
    /** 将文字加入 SDF 合批渲染器（成功返回 true）。 */
    addTextToBatchedRenderer(idStr: string, node: SceneNode, layer: string): boolean;
    /** MText 风格的多行文字渲染（TroikaText 独立 mesh，非合批）。 */
    createText(
      position: CadPoint,
      content: string,
      height: number,
      rotation: number,
      color: THREE.Color,
      attachmentPoint?: number,
      rectWidth?: number,
      widthFactor?: number,
      fontName?: string,
      heightScale?: number,
    ): THREE.Group | null;
    createTextPlaceholder(
      position: CadPoint,
      height: number,
      rotation: number,
      color: THREE.Color,
      widthFactor?: number,
    ): THREE.Mesh | null;
  }
}

export const textMethods = {
  anchoredTextBbox(this: GeometryFactory, posX: number, posY: number, width: number, height: number, rotation: number, col: number, row: number): BoundingBox {
    const w = Math.max(Math.abs(width), 1e-6);
    const h = Math.max(Math.abs(height), 1e-6);
    const [minLocalX, maxLocalX] = col === 1 ? [-w / 2, w / 2] : col === 2 ? [-w, 0] : [0, w];
    const [minLocalY, maxLocalY] = row === 0 ? [-h, 0] : row === 1 ? [-h / 2, h / 2] : [0, h];
    const safeRotation = isValidNumber(rotation) ? rotation : 0;
    const cos = Math.cos(safeRotation);
    const sin = Math.sin(safeRotation);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const [x, y] of [
      [minLocalX, minLocalY],
      [minLocalX, maxLocalY],
      [maxLocalX, minLocalY],
      [maxLocalX, maxLocalY],
    ]) {
      const rx = posX + x * cos - y * sin;
      const ry = posY + x * sin + y * cos;
      minX = Math.min(minX, rx);
      minY = Math.min(minY, ry);
      maxX = Math.max(maxX, rx);
      maxY = Math.max(maxY, ry);
    }

    return { minX, minY, maxX, maxY };
  },

  textNodeBbox(this: GeometryFactory, node: Extract<SceneNode, { type: 'text' }>): BoundingBox {
    const width = estimateTextWidth(node.content, node.height, 1);
    const col = node.horizontalAlignment === 1 || node.horizontalAlignment === 4 ? 1 : node.horizontalAlignment === 2 || node.horizontalAlignment === 3 || node.horizontalAlignment === 5 ? 2 : 0;
    const row = node.verticalAlignment === 3 ? 0 : node.verticalAlignment === 2 ? 1 : 2;
    return this.anchoredTextBbox(node.posX, node.posY, width, node.height, node.rotation, col, row);
  },

  mTextNodeBbox(this: GeometryFactory, node: Extract<SceneNode, { type: 'mText' }>): BoundingBox {
    const heightScale = isValidNumber(node.heightScale) && node.heightScale > 0 ? node.heightScale : 1;
    const effectiveHeight = Math.max(Math.abs(node.height * heightScale), 1e-6);
    const estimatedWidth = estimateTextWidth(node.content, effectiveHeight, node.widthFactor);
    const blockWidth = isValidNumber(node.width) && node.width > 0 ? Math.abs(node.width) : estimatedWidth;
    const lineCount = Math.max(1, node.content.split(/\r?\n|\\P/).filter(Boolean).length);
    const blockHeight = effectiveHeight * lineCount * 1.25;
    const ap = Math.max(1, Math.min(9, Math.floor(node.attachmentPoint || 1)));
    const col = (ap - 1) % 3;
    const row = Math.floor((ap - 1) / 3);
    return this.anchoredTextBbox(node.posX, node.posY, blockWidth, blockHeight, node.rotation, col, row);
  },

  addTextToBatchedRenderer(this: GeometryFactory, idStr: string, node: SceneNode, layer: string): boolean {
    const f = this as unknown as GeometryFactoryInternal;
    try {
      const color = this.resolveColor(node.color, layer);
      const textNode = node as any;
      const content = textNode.content ?? '';
      if (!content || content.trim().length === 0) return false;

      const height = textNode.height;
      if (!isValidNumber(height) || height <= 0) return false;

      // 应用坐标变换：从CAD坐标转换为显示坐标
      let position = { x: textNode.posX ?? 0, y: textNode.posY ?? 0, z: 0 };
      if (f._transformParams) {
        const transformed = applyTransform(
          { x: position.x, y: position.y },
          f._transformParams
        );
        position = { x: transformed.x, y: transformed.y, z: 0 };
      }
      if (!isValidPoint(position)) return false;

      const rotation = isValidNumber(textNode.rotation) ? textNode.rotation : 0;
      const widthFactor = (isValidNumber(textNode.widthFactor) && textNode.widthFactor > 0) ? textNode.widthFactor : 1.0;
      const heightScale = (isValidNumber(textNode.heightScale) && textNode.heightScale > 0) ? textNode.heightScale : 1.0;
      const fontSize = height * heightScale;

      let attachmentPoint: number;
      if (node.type === 'text') {
        attachmentPoint = textAlignmentToAttachmentPoint(
          textNode.horizontalAlignment ?? 0,
          textNode.verticalAlignment ?? 0,
        );
      } else {
        attachmentPoint = textNode.attachmentPoint ?? 1;
      }

      const ap = Math.max(1, Math.min(9, Math.floor(attachmentPoint)));
      const col = ((ap - 1) % 3);
      const row = Math.floor((ap - 1) / 3);
      const anchorX = col === 0 ? 'left' : col === 1 ? 'center' : 'right';
      const anchorY = row === 0 ? 'top' : row === 1 ? 'middle' : 'bottom';

      const rectWidth = textNode.width ?? 0;
      const maxWidth = (rectWidth > 0 && isValidNumber(rectWidth)) ? rectWidth / widthFactor : undefined;

      const lines = content.split(/\r?\n|\\P/).filter((s: string) => s.length > 0);
      if (lines.length === 0) return false;
      const textContent = lines.join('\n');

      const estWidth = estimateTextWidth(textContent, fontSize, widthFactor);

      f._sdfTextRenderer.addText(
        idStr,
        textContent,
        position,
        fontSize,
        color,
        rotation,
        anchorX,
        anchorY,
        maxWidth,
        widthFactor,
        layer,
        estWidth,
      );
      return true;
    } catch (_e) {
      return false;
    }
  },

  createText(
    this: GeometryFactory,
    position: CadPoint,
    content: string,
    height: number,
    rotation: number,
    color: THREE.Color,
    attachmentPoint: number = 1,
    rectWidth: number = 0,
    widthFactor: number = 1.0,
    _fontName: string = '',
    heightScale: number = 1.0,
  ): THREE.Group | null {
    const f = this as unknown as GeometryFactoryInternal;
    if (!isValidPoint(position)) return null;
    if (!isValidNumber(height) || height <= 0) return null;
    if (!content || content.trim().length === 0) return null;
    if (!isValidNumber(rotation)) rotation = 0;

    const lines = content.split(/\r?\n|\\P/).filter(s => s.length > 0);
    if (lines.length === 0) return null;

    const group = new THREE.Group();

    const effectiveWidthFactor = (isValidNumber(widthFactor) && widthFactor > 0) ? widthFactor : 1.0;
    const effectiveHeightScale = (isValidNumber(heightScale) && heightScale > 0) ? heightScale : 1.0;

    const textContent = lines.join('\n');
    const fontSize = height * effectiveHeightScale;

    const ap = Math.max(1, Math.min(9, Math.floor(attachmentPoint)));
    const col = ((ap - 1) % 3);
    const row = Math.floor((ap - 1) / 3);

    const anchorX = col === 0 ? 'left' : col === 1 ? 'center' : 'right';
    const anchorY = row === 0 ? 'top' : row === 1 ? 'middle' : 'bottom';

    const textMesh = new TroikaText();
    textMesh.text = textContent;
    textMesh.font = f._fontUrl;
    textMesh.fontSize = fontSize;
    textMesh.color = color;
    textMesh.anchorX = anchorX;
    textMesh.anchorY = anchorY;
    textMesh.maxWidth = (rectWidth > 0 && isValidNumber(rectWidth)) ? rectWidth / effectiveWidthFactor : undefined;
    textMesh.lineHeight = 1.25;
    textMesh.depthTest = false;
    textMesh.renderOrder = 1;

    textMesh.scale.set(effectiveWidthFactor, 1, 1);

    const clippingPlanes = f._clippingPlanes;
    const requestRender = () => f._requestRender();
    textMesh.sync(() => {
      if (clippingPlanes.length > 0) {
        textMesh.traverse((child: THREE.Object3D) => {
          if ((child as THREE.Mesh).isMesh && (child as THREE.Mesh).material) {
            const mat = (child as THREE.Mesh).material as THREE.Material;
            mat.clippingPlanes = clippingPlanes;
            mat.clipShadows = true;
          }
        });
      }
      requestRender();
    });

    group.add(textMesh);

    group.position.set(position.x, position.y, position.z);
    group.rotation.z = rotation || 0;

    return group;
  },

  createTextPlaceholder(
    this: GeometryFactory,
    position: CadPoint,
    height: number,
    rotation: number,
    color: THREE.Color,
    widthFactor: number = 1.0,
  ): THREE.Mesh | null {
    if (!isValidPoint(position) || !isValidNumber(height) || height <= 0) return null;
    const w = height * 0.6 * (isValidNumber(widthFactor) && widthFactor > 0 ? widthFactor : 1.0);
    const h = height;
    const geometry = new THREE.PlaneGeometry(w, h);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.15,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 1;
    mesh.position.set(position.x, position.y, position.z || 0);
    mesh.rotation.z = rotation || 0;
    return mesh;
  },
} satisfies Pick<
  GeometryFactory,
  'anchoredTextBbox' | 'textNodeBbox' | 'mTextNodeBbox' | 'addTextToBatchedRenderer' | 'createText' | 'createTextPlaceholder'
>;