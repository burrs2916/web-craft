import { stageAlignOf, stageVAlignOf } from "../../../editor/data/scaleFit";
import { BUTTON_FIT, buildButtonFitHTML } from "../../shared/button";
import { scaleSkeletonScript } from "../../shared/scaleSkeleton";
import type { ComponentCodegenFn } from "../../types";



/**
 * form-button 组件 → HTML
 *
 * 复用共享 `buildButtonFitHTML`，与编辑区实时渲染走同一份结构，保证三端一致。
 *
 * 本轮修正：此前直接 `buildButtonHTML(config)`，按钮恒 `width/height:100%` 铺满容器，
 * 于是面板上的 `size`（小/中/大）与 `fullWidth`（宽度撑满）**改了产物毫无变化** ——
 * 两个假控件。现在默认走「自然尺寸 + 居中 + 随拖动框等比缩放」骨架（与表单组其他
 * 成员同一套三层结构），`size` 兑现为盒高与左右内距、`scaleFit`/`align`/`vAlign` 生效；
 * `fullWidth=true` 时退回铺满模式（此时它在面板上才真正有意义）。
 */
export const formButtonCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config;
  const uid = "fbt-" + Math.random().toString(36).slice(2, 9);
  return (
    buildButtonFitHTML(c, {
      ctx,
      uid,
      align: stageAlignOf(c),
      vAlign: stageVAlignOf(c),
      scaleFit: c.scaleFit !== false,
    }) + scaleSkeletonScript(uid, BUTTON_FIT, c.scaleFit !== false && c.fullWidth !== true)
  );
};
