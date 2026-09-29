import * as THREE from 'three';
import type { EntityRendererRegistry } from '../../cad_runtime/entity_renderers/EntityRenderer';
import type { SdfTextRenderer } from '../../cad_runtime/sdf_text_renderer';
import type { TransformParams } from '../../coordinate/TransformCalculator';
import type { SceneManager } from '../SceneManager';
import type { EntityStore } from '../EntityStore';

/**
 * GeometryFactory 的私有状态视图。
 *
 * 拆分后各 mixin 模块（positions/text/mesh/...）需要访问核心类的私有字段与私有方法，
 * 但又不希望把这些实现细节提升为 public API。此接口仅用于模块内 `this` 的类型断言，
 * 运行时不产生任何开销。
 */
export interface GeometryFactoryInternal {
  _sceneManager: SceneManager;
  _entityStore: EntityStore;
  _sdfTextRenderer: SdfTextRenderer;
  _entityRendererRegistry: EntityRendererRegistry | null;
  _insertDepth: number;
  _visitedBlocks: Set<string>;
  _transformParams: TransformParams | null;
  _clippingPlanes: THREE.Plane[];
  _defaultLineColor: THREE.Color;
  _fontUrl: string;
  _requestRender(): void;
}