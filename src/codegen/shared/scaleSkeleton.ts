import { cssText } from "../../editor/data/cssDecls";
import { MUI_FONT } from "../../editor/data/fieldStyle";
import {
  scaleStageCss,
  scaleInnerBaseCss,
  type ScaleFitSpec,
} from "../../editor/data/scaleFit";
import { scaleFitStage, scaleFitScript } from "../scaleFit";

/**
 * 发布端「居中显示 + 随拖动框等比缩放」的**共享骨架** —— 与编辑区渲染器逐层同构。
 *
 * 三层结构（编辑区/发布端完全一致，图标族、评分、分页、表格族与表单族都用它）：
 *   外形 outer（100%×100%，被组件 codegen 包住）
 *     └ 缩放舞台 stage（100%×100%，按 align/vAlign 摆放，脚本量它的 clientWidth/Height）
 *         └ 缩放内层 inner（内容自然尺寸，只被 transform:scale 缩放，不触发重排）
 *
 * 为什么抽到这里而不是留在每个组件的 codegen 里：这层骨架曾只写在发布端字符串里、
 * 编辑区各自另写一份，于是 flex 属性（min-width / flex-shrink / transform-origin）慢慢分叉，
 * 表现为"编辑区缩放比例与发布后不同"。现在舞台/内层的声明只由 `editor/data/scaleFit.ts`
 * 提供，编辑区读同一份、发布端用本骨架输出，结构上无法再分叉。
 */
export interface ScaleSkeletonOptions {
  /** 组件唯一 id（舞台/内层各派生 `-st` / `-in`） */
  uid: string;
  /** 内容 HTML（自然尺寸，不含舞台与内层包装） */
  control: string;
  spec: ScaleFitSpec;
  /** 水平摆放（面板值；未给出时由 `scaleStageCss` 取 `STAGE_ALIGN_DEFAULT`=居中） */
  align: string;
  /** 垂直摆放（同上） */
  vAlign?: string;
  /** 内层附加声明（组件自己的 display/方向/间距），顺序恒在 `scaleInnerBaseCss` 之后 */
  innerStyle: string;
  /** 是否启用等比缩放（关闭时仍产出同名 `.{uid}-in`，样式与骨架一致，仅不挂缩放脚本） */
  scaleFit: boolean;
  /** 额外的内层属性（如 data 钩子） */
  innerAttrs?: string;
  /** 额外的舞台属性 */
  stageAttrs?: string;
  /**
   * 追加到内层 `.{uid}-in` 上的额外类名。
   * 用于「控件本体本身就是缩放内层」的情形（如分段控制器的胶囊容器要同时被自身脚本按
   * `.{uid}-grp` 取到）——避免为同一元素再套一层多余 div。
   */
  innerClass?: string;
}

/**
 * 生成舞台 + 内层（不含缩放脚本）
 *
 * 摆放值**不做第二遍映射**：`scaleStageCss` 已是「面板值 → flex 值」的唯一口径，
 * 两条分支（scaleFit 开 / 关）都必须把原始值交给它，否则同一个 align 在开关
 * 两侧会落到不同位置（历史缺陷：这里曾有 `toAlign()` 把未知值映射成 center，
 * 而 `alignToFlex` 把未知值映射成 flex-start）。
 */
export function scaleSkeleton(o: ScaleSkeletonOptions): string {
  const innerStyleText = `${cssText(scaleInnerBaseCss())};${o.innerStyle}`;
  const innerClass = o.innerClass ? ` ${o.innerClass}` : "";
  if (o.scaleFit) {
    const stage = scaleFitStage({
      uid: o.uid,
      control: o.control,
      spec: o.spec,
      align: o.align,
      vAlign: o.vAlign,
      innerStyle: o.innerStyle,
    });
    // scaleFitStage 不接收额外属性/类名，需要时在它的 stage/inner 上补挂
    if (!o.stageAttrs && !o.innerAttrs && !o.innerClass) return stage;
    return stage
      .replace(`<div class="${o.uid}-st"`, `<div${o.stageAttrs ?? ""} class="${o.uid}-st"`)
      .replace(`<div class="${o.uid}-in"`, `<div${o.innerAttrs ?? ""} class="${o.uid}-in${innerClass}"`);
  }
  const stageAttrs = o.stageAttrs ?? "";
  const innerAttrs = o.innerAttrs ?? "";
  return (
    `<div${stageAttrs} class="${o.uid}-st" style="${cssText(scaleStageCss(o.align, o.vAlign))}">` +
    `<div${innerAttrs} class="${o.uid}-in${innerClass}" style="${innerStyleText}">${o.control}</div>` +
    `</div>`
  );
}

/**
 * 表单族（及同构组件）缩放外形的公共声明：铺满设计盒、不裁剪、钉住字体栈。
 * `font-family` 必须显式给出——文本宽度直接影响等比缩放基准，字体分叉即两端不一致。
 */
export const SCALE_OUTER_CSS = `width:100%;height:100%;min-width:0;min-height:0;font-family:${MUI_FONT};box-sizing:border-box`;

/** 启用缩放时的脚本（关闭则返回空串，与编辑区"不动"语义一致） */
export function scaleSkeletonScript(uid: string, spec: ScaleFitSpec, scaleFit: boolean): string {
  return scaleFit ? scaleFitScript(uid, spec) : "";
}
