import { GeometryFactory } from './core';
import { positionMethods } from './positions';
import { textMethods } from './text';
import { meshMethods } from './mesh';
import { primitiveMethods } from './primitives';
import { hatchMethods } from './hatch';
import { dimensionMethods } from './dimension';
import { nodeOpMethods } from './nodeOps';

// 把按职责拆分的实现装配到原型上。所有方法在各自模块内通过 `declare module './core'`
// 声明，因此对调用方而言 GeometryFactory 的公共 API 与拆分前完全一致。
Object.assign(
  GeometryFactory.prototype,
  positionMethods,
  textMethods,
  meshMethods,
  primitiveMethods,
  hatchMethods,
  dimensionMethods,
  nodeOpMethods,
);

export { GeometryFactory };
export * from './constants';
export * from './validation';
export * from './geometryMath';