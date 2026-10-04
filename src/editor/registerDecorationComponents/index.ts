import { registerNativeShapes } from "./nativeShapes";
import { registerNativeLineShapes } from "./nativeLineShapes";
import { registerNativePatternShapes } from "./nativePatternShapes";
import { registerDatavBorders } from "./datavBorders";
import { registerDatavDecorations } from "./datavDecorations";
import { augmentDecorationPanels } from "./decorPanelExtras";
import { augmentAnimationFields } from "./animationFields";

/**
 * 注册全部装饰组件（原生形状 + datav 边框/装饰），并统一补全面板能力字段。
 * 注册顺序影响面板展示顺序与后续按分类遍历补字段的结果，故保持与拆分前逐字一致：
 * 原生形状 → datav → 面板补全 → 动画字段。
 */
export function registerDecorationComponents(): void {
  registerNativeShapes();
  registerNativeLineShapes();
  registerNativePatternShapes();
  registerDatavBorders();
  registerDatavDecorations();
  augmentDecorationPanels();
  augmentAnimationFields();
}