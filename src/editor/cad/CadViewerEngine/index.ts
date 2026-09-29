import { CadViewerEngine } from './core';
import { documentLoadingMethods } from './documentLoading';
import { entityEditingMethods } from './entityEditing';
import { layerMethods } from './layers';
import { viewControlMethods } from './viewControls';

// 把按职责拆分的实现装配到原型上。所有方法在各自模块内通过 `declare module './core'`
// 声明，因此对调用方而言 CadViewerEngine 的公共 API 与拆分前完全一致。
Object.assign(
  CadViewerEngine.prototype,
  documentLoadingMethods,
  entityEditingMethods,
  layerMethods,
  viewControlMethods,
);

export { CadViewerEngine };
export type {
  CadEngineConfig,
  CadDocumentInfo,
  CadEngineEventType,
  CadEngineEventData,
  CadEngineEventHandler,
} from './types';