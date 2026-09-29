import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import type { EntityRendererRegistry } from '../../cad_runtime/entity_renderers/EntityRenderer';
import type { SdfTextRenderer } from '../../cad_runtime/sdf_text_renderer';
import type { TransformParams } from '../../coordinate/TransformCalculator';
import type { SceneManager } from '../SceneManager';
import type { EntityStore } from '../EntityStore';
import { logger } from '../../../../utils/logger';
import {
  DEFAULT_LINE_WIDTH,
  FONT_URL,
  LINE_WEIGHT_SCALE,
  LINE_WIDTH_MAX_PX,
  MAX_LUMINANCE_ON_LIGHT_BG,
  MIN_LUMINANCE_ON_DARK_BG,
  TARGET_LUMINANCE_DARK,
  TARGET_LUMINANCE_LIGHT,
} from './constants';
import { intToColor } from './geometryMath';
import { isValidVector3 } from './validation';

/**
 * GeometryFactory — 几何体创建、颜色/材质解析、文字渲染、填充图案
 *
 * 职责：
 * - 根据 SceneNode / CadEntity 创建 Three.js 几何体 (Line2, Mesh, Group)
 * - 颜色解析（ByLayer → 图层颜色 → 默认颜色，背景适配）
 * - 线宽映射（mm → 物理像素）
 * - 位置提取（用于合批渲染）
 * - 文字（TroikaText）创建与 SDF 合批
 * - Hatch 填充图案
 * - INSERT (BlockRef) 递归渲染
 * - 几何体校验
 *
 * 依赖：SceneManager（分辨率/背景）、EntityStore（图层颜色查询）、SdfTextRenderer
 *
 * 实现按职责拆分到同目录各 mixin 模块（positions / text / mesh / primitives /
 * hatch / dimension / nodeOps），在 index.ts 中通过 Object.assign 装配到原型上；
 * 本文件只保留核心状态、配置项与颜色/材质解析。
 */
export class GeometryFactory {
  // 以下状态由同目录 mixin 模块共享访问（见 internal.ts），故为 protected 而非 private。
  protected _sceneManager: SceneManager;
  protected _entityStore: EntityStore;
  protected _sdfTextRenderer: SdfTextRenderer;
  protected _entityRendererRegistry: EntityRendererRegistry | null = null;

  // Internal state
  protected _insertDepth: number = 0;
  protected _visitedBlocks: Set<string> = new Set();
  protected _transformParams: TransformParams | null = null;
  protected _clippingPlanes: THREE.Plane[] = [];
  protected _defaultLineColor: THREE.Color;
  protected _fontUrl: string = FONT_URL;

  private _useBatchedText: boolean = true;

  /** 渲染完成后请求重绘的回调 */
  private _onRequestRender: (() => void) | null = null;

  constructor(config: {
    sceneManager: SceneManager;
    entityStore: EntityStore;
    sdfTextRenderer: SdfTextRenderer;
    entityRendererRegistry?: EntityRendererRegistry | null;
    defaultLineColor?: THREE.Color;
    onRequestRender?: () => void;
  }) {
    this._sceneManager = config.sceneManager;
    this._entityStore = config.entityStore;
    this._sdfTextRenderer = config.sdfTextRenderer;
    this._entityRendererRegistry = config.entityRendererRegistry ?? null;
    this._defaultLineColor = config.defaultLineColor ?? new THREE.Color('#4fc3f7');
    this._onRequestRender = config.onRequestRender ?? null;
  }

  // ── Config setters ──

  setEntityRendererRegistry(registry: EntityRendererRegistry | null): void {
    this._entityRendererRegistry = registry;
  }

  getEntityRendererRegistry(): EntityRendererRegistry | null {
    return this._entityRendererRegistry;
  }

  setTransformParams(params: TransformParams | null): void {
    this._transformParams = params;
  }

  setClippingPlanes(planes: THREE.Plane[]): void {
    this._clippingPlanes = planes;
  }

  setDefaultLineColor(color: THREE.Color): void {
    this._defaultLineColor = color;
  }

  getDefaultLineColor(): THREE.Color {
    return this._defaultLineColor;
  }

  setUseBatchedText(use: boolean): void {
    this._useBatchedText = use;
  }

  get useBatchedText(): boolean {
    return this._useBatchedText;
  }

  setFontUrl(url: string): void {
    this._fontUrl = url;
  }

  protected _requestRender(): void {
    this._onRequestRender?.();
  }

  // ── Color & Material ──

  /**
   * 把 cadbin 里的 u32 颜色解码成可见的 THREE.Color：
   *   1) 0xFFFFFF / 负数 / 0xFFFFFFFF（ByLayer 兜底）→ 优先用 layer.color
   *   2) layer.color 也是 0/-1 → defaultLineColor
   *   3) 解码后亮度过低 → defaultLineColor（深色底"看不见黑实体"）
   *   4) 其它情况返回原色
   */
  resolveColor(rawColor: number, layerName?: string): THREE.Color {
    if (rawColor === 0xFFFFFF || rawColor === 0xFFFFFFFF || rawColor < 0) {
      if (layerName) {
        const layer = this._entityStore.getLayerNode(layerName);
        if (layer && layer.color > 0 && layer.color !== 0xFFFFFF) {
          const lc = intToColor(layer.color);
          return this._adjustColorForBackground(lc);
        }
      }
      return this._defaultLineColor.clone();
    }
    const c = intToColor(rawColor);
    return this._adjustColorForBackground(c);
  }

  /**
   * 将 CAD lineWeight(mm) 映射为 LineMaterial 的 linewidth（物理像素）。
   */
  resolveLineWidth(rawLw?: number): number {
    const dpr = this._sceneManager.dpr;
    if (rawLw !== undefined && Number.isFinite(rawLw) && rawLw > 0) {
      const cssPx = Math.max(0.8, Math.min(rawLw * LINE_WEIGHT_SCALE, LINE_WIDTH_MAX_PX));
      return cssPx * dpr;
    }
    return DEFAULT_LINE_WIDTH * dpr;
  }

  adjustColorForBackground(color: THREE.Color): THREE.Color {
    return this._adjustColorForBackground(color);
  }

  private _adjustColorForBackground(color: THREE.Color): THREE.Color {
    const luma = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
    if (this._sceneManager.isDarkBackground) {
      if (luma < MIN_LUMINANCE_ON_DARK_BG) {
        return this._brightenToTarget(color, TARGET_LUMINANCE_DARK);
      }
    } else {
      if (luma > MAX_LUMINANCE_ON_LIGHT_BG) {
        return this._darkenToTarget(color, TARGET_LUMINANCE_LIGHT);
      }
    }
    return color.clone();
  }

  private _brightenToTarget(color: THREE.Color, targetLuma: number): THREE.Color {
    const hsl = { h: 0, s: 0, l: 0 };
    color.getHSL(hsl);
    if (hsl.s < 0.01) {
      return new THREE.Color().setHSL(hsl.h, 0, targetLuma);
    }
    const newL = Math.max(targetLuma, hsl.l);
    return new THREE.Color().setHSL(hsl.h, Math.min(hsl.s, 1), newL);
  }

  private _darkenToTarget(color: THREE.Color, targetLuma: number): THREE.Color {
    const hsl = { h: 0, s: 0, l: 0 };
    color.getHSL(hsl);
    if (hsl.s < 0.01) {
      return new THREE.Color().setHSL(hsl.h, 0, targetLuma);
    }
    const newL = Math.min(targetLuma, hsl.l);
    return new THREE.Color().setHSL(hsl.h, Math.min(hsl.s, 1), newL);
  }

  createLineMaterial(color: THREE.Color, lineWidth: number = DEFAULT_LINE_WIDTH): LineMaterial {
    const key = `${color.getHex()}_${lineWidth}`;
    const cached = this._entityStore.getLineMaterial(key);
    if (cached && !(cached as any).disposed) return cached;

    const material = new LineMaterial({
      color: color.getHex(),
      linewidth: lineWidth,
      resolution: this._sceneManager.resolution,
      worldUnits: false,
    });

    this._entityStore.setLineMaterial(key, material);
    return material;
  }

  createLine2FromPoints(points: THREE.Vector3[], color: THREE.Color, lineWidth: number = DEFAULT_LINE_WIDTH): Line2 | null {
    if (points.length < 2) return null;

    const MIN_VISIBLE_LENGTH = 0.01;
    let hasVisibleSegment = false;
    for (let i = 1; i < points.length; i++) {
      const dx = points[i].x - points[i - 1].x;
      const dy = points[i].y - points[i - 1].y;
      const dz = points[i].z - points[i - 1].z;
      if (dx * dx + dy * dy + dz * dz >= MIN_VISIBLE_LENGTH * MIN_VISIBLE_LENGTH) {
        hasVisibleSegment = true;
        break;
      }
    }
    if (!hasVisibleSegment) return null;

    const positions: number[] = [];
    for (const p of points) {
      if (!isValidVector3(p)) return null;
      positions.push(p.x, p.y, p.z);
    }

    const geometry = new LineGeometry();
    geometry.setPositions(positions);

    const material = this.createLineMaterial(color, lineWidth);
    const line = new Line2(geometry, material);
    line.computeLineDistances();
    return line;
  }

  dispose(): void {
    this._visitedBlocks.clear();
    logger.info('GeometryFactory', 'Disposed');
  }
}