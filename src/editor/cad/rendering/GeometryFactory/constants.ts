import * as THREE from 'three';

export const DEFAULT_LINE_WIDTH = 1.5;
export const HIGHLIGHT_COLOR = new THREE.Color(0x00ff88);
export const MIN_LUMINANCE_ON_DARK_BG = 0.18;
export const MAX_LUMINANCE_ON_LIGHT_BG = 0.82;
export const TARGET_LUMINANCE_DARK = 0.35;
export const TARGET_LUMINANCE_LIGHT = 0.55;
export const DELETED_LAYER_NAME = '__deleted__';
export const FONT_URL = '/fonts/SourceHanSansCN-Regular.otf';
/** lineWeight(mm) → 屏幕像素宽度的映射系数 */
export const LINE_WEIGHT_SCALE = 2.0;
/** 线宽像素上限（CSS 像素），乘以 DPR 后为物理像素上限 */
export const LINE_WIDTH_MAX_PX = 4;