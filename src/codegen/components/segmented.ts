import type { ComponentCodegenFn, CodegenContext } from "../types";
import { escapeHTML } from "../layout";
import { renderMenuIcon } from "../iconPipeline";
import { resolveFieldStyle } from "../../editor/data/fieldStyle";
import { parseOptionItems } from "../../editor/data/optionItems";
import { resolveEffectiveDataConfig } from "../../shared/resolveDataConfig";
import { dataLoaderScript } from "../dataLoader";
import { SEGMENTED_FIT, stageAlignOf, stageVAlignOf } from "../../editor/data/scaleFit";
// 口径唯一来源：兜底段 / 尺寸表 / 取值归一 / 数值兜底 —— 与编辑区 SegmentedRenderer 同一份
import { SEGMENTED_DEFAULT_ITEMS, SEGMENTED_SIZE_MAP, segNormalizeValue, segNum } from "../../editor/data/segmentedStyle";
import { fieldShellHTML, validationHTML } from "../fieldChrome";
import { scaleSkeleton, scaleSkeletonScript } from "../shared/scaleSkeleton";
import { readAuthEnabled } from "../../editor/data/authMode";

/**
 * form-segmented（分段控制器）→ HTML
 *
 * 与表单族同口径：`resolveFieldStyle` + `fieldShellHTML`（ring:false，控件自带底色胶囊）
 * → 顶部标签 / 左上角悬浮徽章 / 帮助文字 / 实时校验 / 隐藏 input 参与表单提交。
 *
 * 修复的三类结构性问题：
 * 1. **不参与表单提交**：原实现没有任何 `name` 控件，WCFORM_SUBMIT 收集字段时整个漏掉。
 *    现补隐藏 `<input name>` 承载选中值，同时充当校验载体（必填对分段控制器真正生效）。
 * 2. **状态写 inline 样式**：原实现点击时逐个改 `segment.style.background/color`，
 *    与「状态属性只能由类规则给」的既定铁律相悖（inline 会永久压死任何状态规则，
 *    且无法用 CSS 过渡）。现状态一律由 `.seg-on` 类承载，脚本只切换类名。
 * 3. **无标签/无校验/无帮助文字**：与表单族其余控件视觉断裂。现走统一字段外壳。
 *
 * 选项解析走 `editor/data/optionItems.ts`（与下拉选择/单选组同源），不再自带第二份。
 */
export const segmentedCodegen: ComponentCodegenFn = (component, ctx: CodegenContext) => {
  const c = component.config as Record<string, unknown>;

  // ── 数据源解析：与 form-select / form-radio 完全同一套语义（全局源覆盖 + 认证三态 + 字段映射）──
  const dsId = String(c.dataSourceId ?? "");
  const gds = ctx.globalDataSources as Record<string, unknown> | undefined;
  const boundSource = dsId && gds ? (gds[dsId] as Record<string, unknown>) : undefined;
  const eff: Record<string, unknown> = boundSource
    ? (resolveEffectiveDataConfig(c, boundSource) as Record<string, unknown>)
    : c;
  const isApi =
    String(eff.dataMode ?? "static") === "api" &&
    (!!dsId || !!String(eff.apiUrl ?? "") || !!String(eff.apiPath ?? ""));
  const apiValueField = String(eff.apiValueField ?? "");
  const apiLabelField = String(eff.apiLabelField ?? "");
  const authEnabled =
    readAuthEnabled(eff.authEnabled);

  const parsed = parseOptionItems(c.items ?? c.options);
  // 接口模式初始不渲染静态段（由取数脚本在浏览器内重建），避免"先闪静态再被接口替换"
  const items = isApi ? [] : parsed.length ? parsed : SEGMENTED_DEFAULT_ITEMS;

  const s = resolveFieldStyle(c);
  const uid = "seg-" + Math.random().toString(36).slice(2, 9);
  const va = validationHTML(c);

  // 取值归一（命中选项 else 首项）—— 与编辑区 `segNormalizeValue` 同源 ← P1-1
  const currentValue = segNormalizeValue(items, c.value);
  const size = String(c.size ?? "medium");
  const dims = SEGMENTED_SIZE_MAP[size] ?? SEGMENTED_SIZE_MAP.medium;
  const fullWidth = c.fullWidth === true;
  const block = c.block === true;
  const showIcon = c.showIcon === true;
  const iconSize = Number(c.iconSize ?? 16) || 16;
  const bgColor = String(c.bgColor ?? "rgba(255,255,255,0.06)");
  const activeBgColor = String(c.activeBgColor ?? "#FF9800");
  const textColor = String(c.textColor ?? "rgba(255,255,255,0.6)");
  const activeTextColor = String(c.activeTextColor ?? "#ffffff");
  const fontSize = Number(c.fontSize ?? 13) || 13;
  const fontWeight = String(c.fontWeight ?? "normal");
  const activeFontWeight = String(c.activeFontWeight ?? "600");
  const borderRadius = Number(c.borderRadius ?? 8);
  const radius = Number.isFinite(borderRadius) && borderRadius >= 0 ? borderRadius : 8;
  // 圆角与表单族同口径（面板值 × 主题 shape.borderRadius=10）；内层段再内缩 2px
  const radiusCss = `${radius * 10}px`;
  const innerRadiusCss = `${Math.max(0, radius * 10 - 2)}px`;
  // 数值兜底且保留合法 0（gap:0 = 无间距） ← P3
  const gap = Math.max(0, segNum(c.gap, 4));
  const disabled = s.disabled;
  const isFullW = fullWidth || block;
  // 全宽/块级时内层已 width:100% 铺满，再叠加 transform 缩放会溢出 → 恒不缩放 ← P2-5
  const scaleFit = c.scaleFit !== false && !isFullW;

  const fieldName =
    String(c.fieldName ?? "").trim() ||
    String(c.label ?? "").trim().replace(/\s+/g, "_").replace(/[^\p{L}\p{N}_\-]/gu, "_").replace(/^_+|_+$/g, "") ||
    "segmented";

  // radiogroup 的可访问名：字段名 or 标签（都没有则省略该属性，避免空 aria-label）← P3
  const ariaLabel = String(c.fieldName ?? "").trim() || String(c.label ?? "").trim();

  /** 单段的样式（含 fullWidth 的等分；**不含**任何状态属性——状态只能由类规则给） */
  const segStyle = [
    "display:flex", "align-items:center", "justify-content:center", "gap:6px",
    `height:${dims.height}px`,
    `padding:${dims.padY}px ${dims.padX}px`,
    `border-radius:${innerRadiusCss}`,
    `font-size:${fontSize}px`,
    "user-select:none", "white-space:nowrap",
    isFullW ? "flex:1 1 0" : "",
  ].filter(Boolean).join(";");

  let segmentsHTML = "";
  items.forEach((item, idx) => {
    const isActive = item.value === currentValue;
    let inner = "";
    if (showIcon && item.icon) {
      inner += `<span style="display:flex;align-items:center">${renderMenuIcon(item.icon, iconSize, ctx)}</span>`;
    }
    inner += `<span style="font-size:inherit;font-weight:inherit;line-height:1;pointer-events:none">${escapeHTML(item.label)}</span>`;

    segmentsHTML +=
      `<div class="${uid}-seg${isActive ? " seg-on" : ""}" role="radio" aria-checked="${isActive}" ` +
      `aria-disabled="${disabled}" ` +
      `tabindex="${isActive && !disabled ? 0 : -1}" data-value="${escapeHTML(item.value)}" data-idx="${idx}" ` +
      `style="${segStyle}">${inner}</div>`;
  });

  const containerStyle = [
    "display:inline-flex", "align-items:center", "box-sizing:border-box",
    isFullW ? "width:100%" : "width:auto",
    `background:${bgColor}`,
    `border-radius:${radiusCss}`,
    `padding:${gap}px`,
    `gap:${gap}px`,
    "flex-wrap:nowrap",
  ].join(";");

  // `currentValue` 已归一到「命中项 else 首项」，直接作为提交值（两端同源，勿再二次回退）
  const selectedValue = currentValue;

  // 胶囊容器即「缩放内层」：自然尺寸（段宽由文字决定），只被 transform 缩放。
  // 舞台由 `scaleSkeleton` 产出（与编辑区 SegmentedRenderer 的 stage/inner 严格同构），
  // 隐藏 input 也放进内层，脚本按 id 取到两者。
  const control =
    scaleSkeleton({
      uid,
      control: segmentsHTML + `<input type="hidden" id="${uid}" name="${escapeHTML(fieldName)}" value="${escapeHTML(selectedValue)}">`,
      spec: SEGMENTED_FIT,
      align: stageAlignOf(c),
      vAlign: stageVAlignOf(c),
      innerStyle: containerStyle,
      scaleFit,
      // 内层同时充当 radiogroup 容器（避免为同一元素再套一层 div）：
      // 脚本按 id 取，`.{uid}-grp` 类规则（禁用态透明度）按类名生效，两者都要有
      innerClass: `${uid}-grp`,
      innerAttrs: ` id="${uid}-grp" role="radiogroup"${ariaLabel ? ` aria-label="${escapeHTML(ariaLabel)}"` : ""}`,
    });

  const extraCss =
    // 段状态：常态/选中态都由类规则给（过渡才可用；inline 会压死状态规则）
    `.${uid}-seg{background:transparent;color:${textColor};font-weight:${fontWeight};` +
    `cursor:${disabled ? "not-allowed" : "pointer"};` +
    "transition:background .2s cubic-bezier(0, 0, 0.2, 1),color .2s cubic-bezier(0, 0, 0.2, 1),font-weight .2s cubic-bezier(0, 0, 0.2, 1)}" +
    `.${uid}-seg.seg-on{background:${activeBgColor};color:${activeTextColor};font-weight:${activeFontWeight}}` +
    `.${uid}-seg:not(.seg-on):hover{color:${activeTextColor}}` +
    `.${uid}-seg:focus-visible{outline:2px solid ${activeBgColor};outline-offset:1px}` +
    `.${uid}-grp{opacity:${disabled ? 0.5 : 1}}`;

  // 运行时脚本：绑定/绘制/取值抽成可重入结构，供接口数据到达后**重建段并重新绑定**
  // （旧实现把 segs 当静态 NodeList 一次绑定，重建 DOM 后点击事件会全部失效）。
  const script = `<script>;(function(){
var U='${uid}';
var inp=document.getElementById(U);if(!inp)return;
var grp=document.getElementById(U+'-grp');if(!grp)return;
var DISABLED=${disabled ? "true" : "false"};
var SEGSTYLE=${JSON.stringify(segStyle)};
var SEGCLASS=U+'-seg';
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function segmentsHTML(items){
  var out='';
  for(var i=0;i<items.length;i++){
    // 接口选项不带图标（运行期无法解析任意图标值，与 form-select / form-radio 一致）
    out+='<div class="'+SEGCLASS+'" role="radio" aria-checked="false" aria-disabled="'+(DISABLED?'true':'false')+'" tabindex="-1" data-value="'+esc(items[i].value)+'" data-idx="'+i+'" style="'+SEGSTYLE+'">'
      +'<span style="font-size:inherit;font-weight:inherit;line-height:1;pointer-events:none">'+esc(items[i].label)+'</span></div>';
  }
  return out;
}
var pick=null,curIdx=null;
function bind(){
  var segs=grp.querySelectorAll('.'+SEGCLASS);
  if(!segs.length)return;
  var vals=[];
  for(var i=0;i<segs.length;i++)vals.push(segs[i].getAttribute('data-value'));
  pick=function(idx,emit){
    for(var i=0;i<segs.length;i++){
      var on=(i===idx);
      segs[i].className=SEGCLASS+(on?' seg-on':'');
      segs[i].setAttribute('aria-checked',on?'true':'false');
      segs[i].setAttribute('tabindex',on?'0':'-1');
    }
    inp.value=vals[idx]||'';
    if(emit!==false)inp.dispatchEvent(new Event('change',{bubbles:true}));
  };
  curIdx=function(){for(var i=0;i<segs.length;i++){if(segs[i].className.indexOf('seg-on')>=0)return i;}return -1;};
  if(!DISABLED){
    for(var j=0;j<segs.length;j++){(function(el){el.addEventListener('click',function(){pick(parseInt(el.getAttribute('data-idx'),10)||0,true);});})(segs[j]);}
    grp.addEventListener('keydown',function(e){
      var cur=curIdx();
      if(e.key==='ArrowRight'||e.key==='ArrowDown'){e.preventDefault();var n=Math.min(segs.length-1,cur+1);pick(n,true);segs[n].focus();}
      else if(e.key==='ArrowLeft'||e.key==='ArrowUp'){e.preventDefault();var p=Math.max(0,cur-1);pick(p,true);segs[p].focus();}
      else if(e.key==='Home'){e.preventDefault();pick(0,true);segs[0].focus();}
      else if(e.key==='End'){e.preventDefault();pick(segs.length-1,true);segs[segs.length-1].focus();}
    });
  }
}
bind();
${
  isApi
    ? `window['__wcSeg_'+U]={setItems:function(items){
  var prev=inp.value;
  grp.innerHTML=segmentsHTML(items||[]);
  bind();
  var segs=grp.querySelectorAll('.'+SEGCLASS);
  if(!segs.length){inp.value='';inp.dispatchEvent(new Event('change',{bubbles:true}));return;}
  var idx=0;
  for(var i=0;i<segs.length;i++){if(segs[i].getAttribute('data-value')===prev){idx=i;break;}}
  pick(idx,false);
  inp.dispatchEvent(new Event('change',{bubbles:true}));
  // 段数变化会改变内容自然尺寸 → 重新适配等比缩放
  try{var st=document.querySelector('.'+U+'-st');if(st&&st.__wcFit)st.__wcFit();}catch(e){}
}};`
    : ""
}
})();</script>`;

  // ── 接口模式：统一取数骨架（URL 拼接 / Token 注入 / 轮询 / 登录态重取），
  //    authEnabled 三态原样透传：null = 跟随站点全局认证态（认证组件组联动口径）
  const apiScript = isApi
    ? dataLoaderScript({
        container: `var el = document.getElementById("${uid}-grp");`,
        apiUrl: String(eff.apiUrl ?? ""),
        apiPath: String(eff.apiPath ?? ""),
        apiMethod: String(eff.apiMethod ?? "GET"),
        apiHeaders: String(eff.apiHeaders ?? ""),
        apiBody: String(eff.apiBody ?? ""),
        apiInterval: Number(eff.apiInterval ?? 0) || 0,
        apiDataPath: String(eff.apiDataPath ?? ""),
        authEnabled,
        renderBody: `
        var raw = Array.isArray(data) ? data : (data && (data.items || data.list)) ? (data.items || data.list) : (data ? [data] : []);
        var vField = ${JSON.stringify(apiValueField)}, lField = ${JSON.stringify(apiLabelField)};
        var out = [];
        for (var i = 0; i < raw.length; i++) {
          var d = raw[i], val, lab;
          if (d && typeof d === "object") {
            val = vField ? String(d[vField] != null ? d[vField] : "") : String(d.id != null ? d.id : (d.value != null ? d.value : ""));
            lab = lField ? String(d[lField] != null ? d[lField] : "") : String(d.name != null ? d.name : (d.label != null ? d.label : (d.text != null ? d.text : val)));
          } else { val = String(d); lab = String(d); }
          if (!lab) lab = val;
          out.push({ value: val, label: lab });
        }
        if (window["__wcSeg_${uid}"]) window["__wcSeg_${uid}"].setItems(out);
      `,
      })
    : "";

  return (
    fieldShellHTML({
      uid,
      s,
      va,
      ctx,
      control,
      ring: false,
      // 字段内容区默认即 `display:flex;align-items:stretch`，摆放交给舞台（scaleStageCss），
      // 故此处不再重复输出 justify/align（否则会与舞台的 align/vAlign 打架）
      extraCss,
    }) +
    script +
    apiScript +
    scaleSkeletonScript(uid, SEGMENTED_FIT, scaleFit)
  );
};
