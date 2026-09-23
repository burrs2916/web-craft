import { type ScaleFitSpec, scaleStageCss, scaleInnerBaseCss } from "../editor/data/scaleFit";
import { cssText } from "../editor/data/cssDecls";

/**
 * 发布端的「随拖动框等比缩放」骨架 —— 与编辑区 `editor/data/scaleFit.ts` 同一公式。
 *
 * 结构：
 *   stage（铺满设计盒、flex 居中、不裁剪）
 *     └ inner（内容的自然尺寸盒子，**尺寸不受缩放影响**，只被 transform 缩放）
 *
 * 为什么用 transform 而不是逐个缩放子元素的字号/尺寸：transform 只触发合成，
 * 不引起重排，拖动框连续改变尺寸时不会掉帧；且子元素的 CSS 只需按自然尺寸写一次，
 * 不必让每个声明都乘一遍系数（乘数写漏一处就是两端不一致）。
 *
 * 缩放系数恒由 `fitFactor`（两端同一实现）算出，不为任何组件单独定制公式。
 */
export interface ScaleFitWrapperOptions {
  /** 组件唯一 id（stage/inner 各派生 -st/-in） */
  uid: string;
  /** 内容 HTML（自然尺寸） */
  control: string;
  spec: ScaleFitSpec;
  /** 内容在 stage 内的水平摆放（缺省 `undefined` 时由 `scaleStageCss` 取 `STAGE_ALIGN_DEFAULT`） */
  align?: string;
  /** 内容在 stage 内的垂直摆放（缺省同上） */
  vAlign?: string;
  /** inner 的附加样式（如自然尺寸下的 display） */
  innerStyle?: string;
}

/** 生成缩放舞台的 HTML（不含脚本） */
export function scaleFitStage(o: ScaleFitWrapperOptions): string {
  // 舞台与内层的公共声明只此一份（`editor/data/scaleFit.ts`），编辑区读同一份，
  // 组件自己的内层声明由 innerStyle 追加在后面 —— 两端顺序一致。
  //
  // 摆放值不再在此处做第二遍映射：`scaleStageCss` 内部已用 `alignToFlex`/`vAlignToFlex`
  // 把面板值转成 flex 值，默认值也由它的形参缺省给出。此前这里额外接了一层
  // `toAlign()`（未知值→center，而 `alignToFlex` 是未知值→flex-start），于是
  // 「同一个 align 值，scaleFit 开时居中、关时靠左」——切一下开关内容就跳位。
  const innerStyle = `${cssText(scaleInnerBaseCss())};${o.innerStyle ?? ""}`;
  return (
    `<div class="${o.uid}-st" style="${cssText(scaleStageCss(o.align, o.vAlign))}">` +
    `<div class="${o.uid}-in" style="${innerStyle}">${o.control}</div>` +
    `</div>`
  );
}

/** 生成缩放脚本：首帧 + resize + ResizeObserver（拖动框实时改尺寸也能跟上） */
export function scaleFitScript(uid: string, spec: ScaleFitSpec): string {
  return `<script>;(function(){
var st=document.querySelector('.${uid}-st'),inn=document.querySelector('.${uid}-in');
if(!st||!inn)return;
var RW=${spec.refW},RH=${spec.refH},MIN=${spec.min},MAX=${spec.max};
function fit(){
  var w=st.clientWidth||0,h=st.clientHeight||0,f=1;
  if(w>0&&h>0){f=Math.min(w/RW,h/RH);if(!isFinite(f))f=1;if(f<MIN)f=MIN;if(f>MAX)f=MAX;}
  inn.style.transform='scale('+f+')';
}
fit();
// 挂到舞台元素上，供接口驱动的组件在数据到达后重新适配（内容尺寸可能变化）
try{st.__wcFit=fit;}catch(e){}
if(window.addEventListener)window.addEventListener('resize',fit);
if(typeof ResizeObserver!=='undefined'){try{new ResizeObserver(fit).observe(st);}catch(e){}}
})();</script>`;
}

/** 一步到位：舞台 HTML + 缩放脚本 */
export function scaleFitWrapper(o: ScaleFitWrapperOptions): string {
  return scaleFitStage(o) + scaleFitScript(o.uid, o.spec);
}
