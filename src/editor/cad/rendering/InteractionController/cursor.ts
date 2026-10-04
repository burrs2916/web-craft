import type { InteractionController } from './core';
import type { InteractionControllerInternal } from './internal';

declare module './core' {
  interface InteractionController {
    _updateCursor(hint?: 'hover' | 'grabbing' | 'move' | 'not-allowed'): void;
  }
}

/**
 * 光标管理：按交互模式与悬停提示切换 canvas cursor。
 * 原 InteractionController 的 `_updateCursor` 逻辑保持不变。
 */
export const cursorMethods = {
  _updateCursor(this: InteractionController, hint?: 'hover' | 'grabbing' | 'move' | 'not-allowed'): void {
    const f = this as unknown as InteractionControllerInternal;
    const canvas = f._sceneManager.canvas;
    if (!canvas) return;

    if (f._interactionMode === 'draw_text') {
      canvas.style.cursor = 'text';
      return;
    }
    if (f._interactionMode === 'draw_line' || f._interactionMode === 'draw_circle') {
      canvas.style.cursor = 'crosshair';
      return;
    }
    if (f._interactionMode === 'pan') {
      canvas.style.cursor = hint === 'grabbing' ? 'grabbing' : 'grab';
      return;
    }

    switch (hint) {
      case 'grabbing': canvas.style.cursor = 'grabbing'; break;
      case 'move': canvas.style.cursor = 'move'; break;
      case 'not-allowed': canvas.style.cursor = 'not-allowed'; break;
      case 'hover': canvas.style.cursor = 'pointer'; break;
      default: canvas.style.cursor = 'default'; break;
    }
  },
};