import { buildButtonFitHTML, BUTTON_FIT } from "../../codegen/shared/button";
import type { ComponentRendererProps } from "../../types/editor";
import { useIconStore } from "../../store/iconStore";
import { useBoxSize } from "../hooks/useBoxSize";
import { fitFactor, stageAlignOf, stageVAlignOf } from "../data/scaleFit";

/**
 * form-button 编辑区渲染
 *
 * 复用与发布/预览完全一致的 `buildButtonFitHTML`（所见即所得），只差缩放系数的来源：
 * 编辑区用 `useBoxSize` 实测拖动框尺寸后直接写进 `transform:scale(f)`，
 * 发布端则挂 `scaleFitScript` 由脚本在首帧/resize 时修正 —— 两端的舞台与内层声明
 * 都取自 `editor/data/scaleFit.ts`，因此结构逐字相同。
 *
 * 默认「自然尺寸 + 居中 + 随框等比缩放」；面板 `fullWidth` 打开时退回铺满模式
 * （与历史产物一致：按钮自身 width/height:100%）。
 *
 * 编辑态：不跳转、不置灰、光标默认，并穿透指针事件避免干扰画布操作。
 */
export function FormButtonRenderer({ config, mode, width, height }: ComponentRendererProps) {
  const isEdit = mode === "edit";
  // 编辑态也注入自定义图标表，保证 custom- 图标在画布中即时可见
  const urls = useIconStore((s) => s.urls);
  let iconData: Record<string, string> | undefined;
  if (urls && Object.keys(urls).length > 0) {
    iconData = {};
    for (const [id, url] of Object.entries(urls)) iconData[`custom-${id}`] = url;
  }

  const box = useBoxSize({
    w: typeof width === "number" ? width : 0,
    h: typeof height === "number" ? height : 0,
  });
  const scaleFit = config.scaleFit !== false;
  const factor = scaleFit ? fitFactor(box.w, box.h, BUTTON_FIT) : 1;

  const html = buildButtonFitHTML(config, {
    edit: isEdit,
    ctx: iconData ? { iconData } : undefined,
    align: stageAlignOf(config as Record<string, unknown>),
    vAlign: stageVAlignOf(config as Record<string, unknown>),
    scaleFit,
    // 编辑区直接给实测系数（发布端传 null 由脚本计算，两侧产物结构相同）
    factor,
  });

  return (
    <div
      ref={box.ref}
      style={{ width: "100%", height: "100%", pointerEvents: isEdit ? "none" : "auto" }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
