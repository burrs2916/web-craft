import { CadRenderer } from './core';
import { cameraMethods } from './camera';
import { backgroundMethods } from './background';
import { selectionMethods } from './selection';
import { layerMethods } from './layers';
import { entityMethods } from './entities';
import { sceneGraphMethods } from './sceneGraph';
import { pipelineMethods } from './pipeline';

// 把按职责拆分的实现装配到原型上。所有方法在各自模块内通过 `declare module './core'`
// 声明，因此对调用方而言 CadRenderer 的公共 API 与拆分前完全一致。
Object.assign(
  CadRenderer.prototype,
  cameraMethods,
  backgroundMethods,
  selectionMethods,
  layerMethods,
  entityMethods,
  sceneGraphMethods,
  pipelineMethods,
);

export { CadRenderer };
export type { CadRendererConfig, CameraInfo } from './types';