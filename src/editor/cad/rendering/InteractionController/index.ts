import { InteractionController } from './core';
import { mouseMethods } from './mouse';
import { wheelZoomMethods } from './wheelZoom';
import { boxSelectMethods } from './boxSelect';
import { dragPreviewMethods } from './dragPreview';
import { snapMethods } from './snap';
import { cursorMethods } from './cursor';
import { cameraNotifyMethods } from './cameraNotify';

// 把按职责拆分的实现装配到原型上。各方法在模块内通过 `declare module './core'`
// 声明，因此对调用方而言 InteractionController 的公共 API 与拆分前完全一致。
Object.assign(
  InteractionController.prototype,
  mouseMethods,
  wheelZoomMethods,
  boxSelectMethods,
  dragPreviewMethods,
  snapMethods,
  cursorMethods,
  cameraNotifyMethods,
);

export { InteractionController };
export type { InteractionMode, InteractionControllerConfig } from './types';