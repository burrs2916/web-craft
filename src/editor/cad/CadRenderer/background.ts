import * as THREE from 'three';
import type { CadRenderer } from './core';
import type { CadRendererInternal } from './internal';

declare module './core' {
  interface CadRenderer {
    /** 设置背景色（含透明度），并刷新全部实体颜色以适配背景对比度 */
    setBackgroundColor(color: string, opacity?: number): void;
    /** 当前是否为深色背景 */
    isDarkBackground(): boolean;
    /** 设置默认线色并刷新全部实体颜色 */
    setLineColor(color: string): void;
    /** 当前背景色（#rrggbb） */
    getBackgroundColor(): string;
  }
}

export const backgroundMethods = {
  setBackgroundColor(this: CadRenderer, color: string, opacity?: number): void {
    const f = this as unknown as CadRendererInternal;
    f._sceneManager.setBackgroundColor(new THREE.Color(color), opacity);
    f._geometryFactory.adjustColorForBackground(new THREE.Color(color));
    f._refreshAllEntityColors();
    f._requestRender();
  },

  isDarkBackground(this: CadRenderer): boolean {
    return (this as unknown as CadRendererInternal)._sceneManager.isDarkBackground;
  },

  setLineColor(this: CadRenderer, color: string): void {
    const f = this as unknown as CadRendererInternal;
    f._geometryFactory.setDefaultLineColor(new THREE.Color(color));
    f._refreshAllEntityColors();
  },

  getBackgroundColor(this: CadRenderer): string {
    const f = this as unknown as CadRendererInternal;
    return '#' + f._sceneManager.backgroundColor.getHexString();
  },
};