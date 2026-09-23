import type { ComponentCodegenFn, CodegenContext } from "../types";
import { escapeHTML } from "../layout";
import { resolveFieldStyle } from "../../editor/data/fieldStyle";
import { RATE_FIT, stageAlignOf, stageVAlignOf } from "../../editor/data/scaleFit";
import {
  resolveRateStyle,
  rateInnerCss,
  rateTextCss,
  rateTextOf,
  rateSubmitValue,
  rateTextCore,
  RATE_TEXT_MAP,
} from "../../editor/data/rateStyle";
import { cssText } from "../../editor/data/cssDecls";
import { fieldShellHTML, validationHTML } from "../fieldChrome";
import { scaleSkeleton, scaleSkeletonScript } from "../shared/scaleSkeleton";

/**
 * form-rate（评分）→ HTML
 *
 * 与表单族同口径：`resolveFieldStyle` + `fieldShellHTML`（ring:false，评分本身无边框）
 * → 顶部标签 / 左上角悬浮徽章 / 帮助文字 / 实时校验 / 隐藏 input 参与表单提交。
 *
 * ── 本轮（#9）相对旧实现修掉的三处 ──
 * 1. **取值口径分成两份**：图标路径 / 尺寸档位 / 分值文案三张表在本文件与
 *    `renderers/RateRenderer.tsx` 各写了一份，靠注释「与发布端同一张表」维持一致。
 *    现统一读 `editor/data/rateStyle.ts`（同批字面量只此一份）。
 * 2. **摆放默认值与表单族相反**：旧实现自写 `alignMap` + `c.align ?? "left"`，
 *    与其余成员（`STAGE_ALIGN_DEFAULT = "center"`）相反；现改调 `stageAlignOf` / `stageVAlignOf`。
 * 3. **缩放基准与 defaultSize 不符**：旧 `RATE_FIT` 126×30 ≠ 注册表 220×40；已修正（`scaleFit.ts`）。
 *    同时接入 `scaleSkeleton`，关闭 `scaleFit` 时与其余成员一样"居中但不动"。
 *
 * ── 本轮（#27）相对旧实现修掉的五处 ──
 * 1. **0 分（未评分）提交语义与编辑区相反**：隐藏域恒写 `value="0"`，被 `__WCVALIDATE`
 *    按「非空」判为已填 → 预览里 0 分报必填错、发布页 0 分提交成功。现两端都走
 *    `rateSubmitValue`（0 → 空串），初始 HTML 与运行时写值同一实现。
 * 2. **开「允许半星」时鼠标点击永远给整数**：click 直接读 `data-value`（整数），
 *    于是 hover 预告 2.5、一松手跳 3。现按鼠标横坐标取半，与 `mousemove` 同一判定。
 * 3. **键盘是死代码**：keydown 挂在 `.X-in` 上而该容器不可聚焦、星片全 `tabindex="-1"`
 *    → 方向键一次也触发不了。现内层为 `role="radiogroup" tabindex="0"`（禁用时 -1）。
 * 4. **运行时文案重算与口径双份**：脚本里重抄了一遍 `textMap[Math.ceil(d)] || d+' 分'`。
 *    现把 `rateTextCore` / `rateSubmitValue` 以 `toString()` 内联，规则只此一份。
 * 5. 无 `aria-label`；另：`like` 图标路径回到官方 `thumb_up`（袖口宽度与手形起点）。
 *
 * 交互：点击定分；悬浮预览；允许半星时按鼠标横坐标取半；显示文案随分值变化。
 */
export const rateCodegen: ComponentCodegenFn = (component, ctx: CodegenContext) => {
  const c = component.config as Record<string, unknown>;

  const s = resolveFieldStyle(c);
  const r = resolveRateStyle(c);
  const uid = "rate-" + Math.random().toString(36).slice(2, 9);
  const va = validationHTML(c);
  const scaleFit = c.scaleFit !== false;
  const align = stageAlignOf(c);
  const vAlign = stageVAlignOf(c);

  const fieldName =
    String(c.fieldName ?? "").trim() ||
    String(c.label ?? "").trim().replace(/\s+/g, "_").replace(/[^\p{L}\p{N}_\-]/gu, "_").replace(/^_+|_+$/g, "") ||
    "rating";

  // 无障碍名称：标签优先，回退到已清洗的字段名（与 segmented 同口径）
  const ariaLabel = String(c.label ?? "").trim() || fieldName;
  // 禁用时组不可聚焦（tabindex=-1），与星片 aria-disabled 一致
  const groupTabIndex = r.disabled ? -1 : 0;

  let starsHTML = "";
  for (let i = 0; i < r.max; i++) {
    const starValue = i + 1;
    const filled = r.value >= starValue;
    const half = r.allowHalf && !filled && r.value >= starValue - 0.5;
    starsHTML +=
      `<span class="${uid}-star${filled ? " rate-on" : half ? " rate-half" : ""}" data-idx="${i}" data-value="${starValue}" ` +
      `role="radio" aria-checked="${filled}" aria-disabled="${r.disabled}" tabindex="-1" ` +
      `style="position:relative;display:inline-flex;width:${r.baseSize}px;height:${r.baseSize}px;flex-shrink:0">` +
      `<svg width="${r.baseSize}" height="${r.baseSize}" viewBox="0 0 24 24" style="display:block;pointer-events:none"><path d="${r.path}" fill="${r.inactiveColor}"/></svg>` +
      `<svg class="${uid}-fill" width="${r.baseSize}" height="${r.baseSize}" viewBox="0 0 24 24"><path d="${r.path}" fill="${r.color}"/></svg>` +
      `</span>`;
  }

  const displayText = rateTextOf(r.value, r.allowHalf);

  // 内容按**自然尺寸**排一次（星条 + 文案），再由缩放舞台整体等比缩放 ——
  // 内层声明读 `rateInnerCss`（与编辑区同一份），间距/外观层都在这层上。
  const row =
    starsHTML +
    (r.showText
      ? `<span class="${uid}-text" style="${cssText(rateTextCss(r))}">${escapeHTML(displayText)}</span>`
      : "");

  const control =
    scaleSkeleton({
      uid,
      control: row,
      spec: RATE_FIT,
      align,
      vAlign,
      innerStyle: cssText(rateInnerCss(r)),
      scaleFit,
      // 组即可聚焦容器：键盘步进挂在它身上（旧实现挂在不可聚焦的容器上 = 死代码）
      innerAttrs: ` role="radiogroup" aria-label="${escapeHTML(ariaLabel)}" aria-disabled="${r.disabled}" tabindex="${groupTabIndex}"`,
    }) +
    // 0 分 = 未评分 → 交空串，否则必填校验被「非空」蒙过去（与编辑区同口径）
    `<input type="hidden" id="${uid}" name="${escapeHTML(fieldName)}" value="${escapeHTML(rateSubmitValue(r.value))}">`;

  const extraCss =
    // 星状态：底层恒为未激活色，顶层激活色由类开关（inline 会压死状态规则）
    `.${uid}-fill{position:absolute;top:0;left:0;display:none;pointer-events:none}` +
    `.${uid}-star{cursor:${r.disabled ? "default" : "pointer"}}` +
    `.${uid}-star.rate-on .${uid}-fill{display:block;clip-path:none}` +
    `.${uid}-star.rate-half .${uid}-fill{display:block;clip-path:inset(0 50% 0 0)}` +
    `.${uid}-star:focus{outline:none}` +
    `.${uid}-star:focus-visible{outline:2px solid ${r.color};outline-offset:2px;border-radius:4px}` +
    // 组聚焦环（星片不可聚焦，键盘入口是这一层）
    `.${uid}-in:focus-visible{outline:2px solid ${r.color};outline-offset:2px;border-radius:4px}`;

  const script = `<script>;(function(){
var inp=document.getElementById('${uid}');if(!inp)return;
var box=document.querySelector('.${uid}-in');if(!box)return;
var stars=box.querySelectorAll('.${uid}-star');
if(!stars.length)return;
var txt=box.querySelector('.${uid}-text');
var maxStars=stars.length,cur=${r.value},allowHalf=${r.allowHalf},hover=-1;
var textMap=${JSON.stringify(RATE_TEXT_MAP)};
// 文案规则与提交值规则都从口径层 toString() 内联 —— 脚本里不再抄第二份
var textOf=${rateTextCore.toString()};
var submitOf=${rateSubmitValue.toString()};
function dv(){return hover>=0?hover:cur;}
function paint(){
  var d=dv();
  for(var i=0;i<maxStars;i++){
    var sv=parseFloat(stars[i].getAttribute('data-value'));
    var on=d>=sv;
    var half=allowHalf&&!on&&d>=sv-0.5;
    stars[i].className='${uid}-star'+(on?' rate-on':(half?' rate-half':''));
    stars[i].setAttribute('aria-checked',on?'true':'false');
  }
  if(txt){txt.textContent=textOf(textMap,allowHalf,d);}
}
function commit(){inp.value=submitOf(cur);paint();inp.dispatchEvent(new Event('change',{bubbles:true}));}
function isHalf(el,e){var rc=el.getBoundingClientRect();return allowHalf&&(e.clientX-rc.left)<(rc.width/2);}
if(!${r.disabled}){
  for(var i=0;i<maxStars;i++){(function(el){
    el.addEventListener('click',function(e){var sv=parseFloat(el.getAttribute('data-value'));cur=isHalf(el,e)?sv-0.5:sv;hover=cur;commit();});
    el.addEventListener('mouseenter',function(){var sv=parseFloat(el.getAttribute('data-value'));hover=allowHalf?sv-0.5:sv;paint();});
    if(allowHalf){el.addEventListener('mousemove',function(e){
      var sv=parseFloat(el.getAttribute('data-value'));var nh=isHalf(el,e)?(sv-0.5):sv;
      if(nh!==hover){hover=nh;paint();}
    });}
  })(stars[i]);}
  box.addEventListener('mouseleave',function(){hover=-1;paint();});
  box.addEventListener('keydown',function(e){
    if(e.key==='ArrowRight'||e.key==='ArrowUp'){e.preventDefault();hover=-1;cur=Math.min(maxStars,cur+(allowHalf?0.5:1));commit();}
    else if(e.key==='ArrowLeft'||e.key==='ArrowDown'){e.preventDefault();hover=-1;cur=Math.max(0,cur-(allowHalf?0.5:1));commit();}
  });
}
})();</script>`;

  return (
    fieldShellHTML({
      uid,
      s,
      va,
      ctx,
      control,
      ring: false,
      fieldStyle: "display:flex;align-items:stretch;",
      extraCss,
    }) +
    scaleSkeletonScript(uid, RATE_FIT, scaleFit) +
    script
  );
};
