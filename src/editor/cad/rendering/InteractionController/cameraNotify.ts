import type { InteractionController } from './core';
import type { InteractionControllerInternal } from './internal';

declare module './core' {
  interface InteractionController {
    _emitCameraChanged(): void;
    _emitCameraInteractionEnd(): void;
    _scheduleCameraInteractionEnd(): void;
  }
}

/**
 * 相机变更通知：带 20Hz 节流的 `onCameraChanged` 与交互结束回调。
 * 原 InteractionController 的通知逻辑保持不变。
 */
export const cameraNotifyMethods = {
  _emitCameraChanged(this: InteractionController): void {
    const f = this as unknown as InteractionControllerInternal;
    if (!f._onCameraChanged) return;
    const now = performance.now();
    if (now - f._lastCameraEmit < 50) return; // 20Hz 节流
    f._lastCameraEmit = now;
    f._onCameraChanged(this.getCameraInfo());
  },

  _emitCameraInteractionEnd(this: InteractionController): void {
    const f = this as unknown as InteractionControllerInternal;
    f._onCameraInteractionEnd?.(this.getCameraInfo());
  },

  _scheduleCameraInteractionEnd(this: InteractionController): void {
    const f = this as unknown as InteractionControllerInternal;
    if (f._cameraInteractionEndTimer !== null) {
      clearTimeout(f._cameraInteractionEndTimer);
    }
    f._cameraInteractionEndTimer = setTimeout(() => {
      f._cameraInteractionEndTimer = null;
      f._emitCameraInteractionEnd();
    }, 350);
  },
};