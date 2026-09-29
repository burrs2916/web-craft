import { readAuthEnabled } from "../../../editor/data/authMode";
import { parseOptionItems } from "../../../editor/data/optionItems";
import { RADIO_FIT, stageAlignOf, stageVAlignOf } from "../../../editor/data/scaleFit";
import { resolveEffectiveDataConfig } from "../../../shared/resolveDataConfig";
import { dataLoaderScript } from "../../dataLoader";
import { liveValidateScript, validationHTML } from "../../fieldChrome";
import { renderMenuIcon } from "../../iconPipeline";
import { escapeHTML } from "../../layout";
import { SCALE_OUTER_CSS, scaleSkeleton, scaleSkeletonScript } from "../../shared/scaleSkeleton";
import type { ComponentCodegenFn } from "../../types";
import { RB_OFF, RB_ON, fieldNameAttr, toggleIcon } from "./shared";



/**
 * form-radio 组件 → HTML（MUI Radio 复刻：小号 38px 控件盒 / 20px 图标，中号 42px / 24px；
 * 组标签 mb 4px 或右侧 mr 12px；纵向 gap 2px / 横向 8px）
 *
 * 选项：items 条目（显示名/提交值/图标），兼容旧 options 文本（与编辑区共用 parseOptionItems），
 * 逐项写入 `value` —— 此前漏写该属性，浏览器默认 value="on"，导致**提交值恒为 "on"**。
 * 校验：容器挂 data-vrules 并持有 id，直接复用现有 __WCVALIDATE / liveValidateScript
 * （change 事件冒泡到容器即可覆盖全组，无需新增机制）；运行时已改为按组取值（任一 radio 选中即视为已选）。
 * 文字色走类规则：运行时会改写选中元素的 label 颜色，inline 色会被一并抹掉。
 */
export const formRadioCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config;
  // ── 数据源解析：支持 dataMode(api) 与全局数据源绑定（dataSourceId），与 form-select 同一套 ──
  const dsId = String((c as Record<string, unknown>).dataSourceId ?? "");
  const gds = ctx.globalDataSources as Record<string, unknown> | undefined;
  const boundSource = dsId && gds ? (gds[dsId] as Record<string, unknown>) : undefined;
  const eff: Record<string, unknown> = boundSource
    ? (resolveEffectiveDataConfig(c as Record<string, unknown>, boundSource) as Record<string, unknown>)
    : (c as Record<string, unknown>);
  const isApi =
    String(eff.dataMode ?? "static") === "api" &&
    (!!dsId || !!String(eff.apiUrl ?? "") || !!String(eff.apiPath ?? ""));
  const apiValueField = String(eff.apiValueField ?? "");
  const apiLabelField = String(eff.apiLabelField ?? "");
  const authEnabled =
    readAuthEnabled(eff.authEnabled);

  const direction = String(c.direction ?? "vertical");
  const placement = String(c.labelPlacement ?? "top") === "left" ? "left" : "top";
  const label = String(c.label ?? "");
  const textColor = String(c.textColor ?? "#333333");
  const accent = String(c.accentColor ?? "#1976d2");
  const fontSize = Number(c.fontSize ?? 14) || 14;
  const required = c.required === true;
  const helperText = String(c.helperText ?? "").trim();
  const small = String(c.size ?? "small") !== "medium";
  const boxSize = small ? 38 : 42;
  const iconSize = small ? 20 : 24;
  const scaleFit = c.scaleFit !== false;
  const uid = "frd-" + Math.random().toString(36).slice(2, 9);
  const va = validationHTML(c);

  // 接口模式下初始不渲染静态条目（由 dataLoader 脚本在浏览器内重建），与 form-select 同语义：
  // 避免"先闪一下静态选项再被接口结果替换"，也让"面板隐藏静态编辑、产物也不含静态"保持一致。
  const items = isApi ? [] : parseOptionItems(c.items ?? c.options);
  const selIdx = Number(c.selectedIndex ?? 0) || 0;
  const fieldName = fieldNameAttr(c, "radio");
  const showLabel = !!label;

  // 组标签用 <label>（非 <div>）：运行时 __WCVALIDATE 出错时会 box.querySelector('label').style.color=errColor，
  // 且**不能写 inline color**（运行时还原时会一并抹掉）——与 input/textarea/select 的字段标签同约定。
  const radioLabel = showLabel
    ? `<label style="font-size:${fontSize}px;line-height:1.4375;user-select:none;flex-shrink:0;white-space:nowrap;${placement === "left" ? "margin-right:12px" : "margin-bottom:4px"}">${escapeHTML(label)}${required ? " *" : ""}</label>`
    : "";

  /** 单条选项的 HTML（静态编译期与运行时重建共用同一份结构，避免两端观感分叉） */
  const optionHTML = (value: string, text: string, checked: boolean, iconHTML: string) =>
    `<label class="${uid}" style="display:flex;align-items:center;cursor:${c.disabled ? "not-allowed" : "pointer"};user-select:none">` +
    `<input type="radio" ${fieldName} value="${escapeHTML(value)}"${checked ? " checked" : ""}${c.disabled ? " disabled" : ""} style="position:absolute;opacity:0;pointer-events:none">` +
    `<span class="fc-box" style="width:${boxSize}px;height:${boxSize}px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">${toggleIcon(RB_ON, iconSize, accent, "ic-on")}${toggleIcon(RB_OFF, iconSize, accent, "ic-off")}</span>` +
    `<span class="fc-opt" style="font-size:${fontSize}px;line-height:1.5;display:inline-flex;align-items:center;gap:4px;white-space:nowrap">${iconHTML}${escapeHTML(text)}</span>` +
    `</label>`;

  const optionsHtml = items
    .map((item, i) => {
      // 逐项图标：编译期内联 SVG（运行时无法解析任意图标值，故接口选项不带图标，与 form-select 一致）
      const optionIcon = item.icon
        ? `<span style="display:inline-flex;align-items:center;flex-shrink:0">${renderMenuIcon(item.icon, 16, ctx)}</span>`
        : "";
      return optionHTML(item.value, item.label, i === selIdx, optionIcon);
    })
    .join("");

  // 选项组容器带 id：接口数据到达后由运行时脚本整体重建其 innerHTML
  const optionsGroup =
    `<div id="${uid}-grp" style="display:flex;flex-direction:${direction === "horizontal" ? "row" : "column"};gap:${direction === "horizontal" ? 8 : 2}px">${optionsHtml}</div>`;
  const groupRow =
    showLabel && placement === "left"
      ? `<div style="display:flex;flex-direction:row;align-items:flex-start">${radioLabel}${optionsGroup}</div>`
      : `<div style="display:flex;flex-direction:column">${radioLabel}${optionsGroup}</div>`;

  const helperLine = helperText
    ? `<span class="fc-help" id="${uid}h" style="font-size:12px;line-height:1.4;margin-top:3px;color:#8a8f98;user-select:none;display:${va.hasRules ? "none" : "block"}">${escapeHTML(helperText)}</span>`
    : "";
  // 帮助文字在校验出错时让位于错误提示（与 input/textarea/select/checkbox 同源脚本）
  const helperScript = helperText && va.hasRules
    ? `<script>;(function(){var d=document.getElementById('${uid}');var h=document.getElementById('${uid}h');if(!d||!h)return;var box=d.closest('[data-vrules]');function sync(){var e=box?box.querySelector('.fc-err'):null;h.style.display=(e&&e.style.display!=='none'&&e.textContent)?'none':'block';}d.addEventListener('input',sync);d.addEventListener('blur',sync);d.addEventListener('change',sync);sync();})();</script>`
    : "";
  // 图标显隐/选项文字色/禁用态**只能走类规则**：运行时会逐个改写选中项颜色，inline 色会被一并抹掉
  const css = `<style>.${uid} .ic-on{display:none}.${uid} .ic-off{display:block}.${uid} input:checked ~ * .ic-on{display:block}.${uid} input:checked ~ * .ic-off{display:none}.${uid} .fc-opt{color:${textColor}}.${uid} input:disabled ~ *{opacity:.38}</style>`;

  // ── 接口模式：dataLoaderScript 统一取数骨架（URL 拼接 / Token 注入 / 轮询 / 登录态重取）──
  // 数据到达后重建选项组；认证三态原样透传 authEnabled（null = 跟随站点全局认证态）。
  const rebuildScript = isApi
    ? `<script>;(function(){
var GRP=${JSON.stringify(uid + "-grp")};
var VF=${JSON.stringify(apiValueField)},LF=${JSON.stringify(apiLabelField)};
var FN=${JSON.stringify(fieldName)};
var ON=${JSON.stringify(toggleIcon(RB_ON, iconSize, accent, "ic-on"))};
var OFF=${JSON.stringify(toggleIcon(RB_OFF, iconSize, accent, "ic-off"))};
function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
window["__wcRadio_${uid}"]=function(data){
  var grp=document.getElementById(GRP);if(!grp)return;
  var raw=Array.isArray(data)?data:(data&&(data.items||data.list))?(data.items||data.list):(data?[data]:[]);
  var out="";
  for(var i=0;i<raw.length;i++){
    var d=raw[i],val,lab;
    if(d&&typeof d==="object"){
      val=VF?String(d[VF]!=null?d[VF]:""):String(d.id!=null?d.id:(d.value!=null?d.value:""));
      lab=LF?String(d[LF]!=null?d[LF]:""):String(d.name!=null?d.name:(d.label!=null?d.label:(d.text!=null?d.text:val)));
    }else{val=String(d);lab=String(d);}
    if(!lab)lab=val;
    out+='<label class="${uid}" style="display:flex;align-items:center;cursor:${c.disabled ? "not-allowed" : "pointer"};user-select:none">'
      +'<input type="radio"'+FN+' value="'+esc(val)+'"'+(i===0?' checked':'')+'${c.disabled ? " disabled" : ""} style="position:absolute;opacity:0;pointer-events:none">'
      +'<span class="fc-box" style="width:${boxSize}px;height:${boxSize}px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">'+ON+OFF+'</span>'
      +'<span class="fc-opt" style="font-size:${fontSize}px;line-height:1.5;display:inline-flex;align-items:center;gap:4px;white-space:nowrap">'+esc(lab)+'</span>'
      +'</label>';
  }
  grp.innerHTML=out;
  try{grp.dispatchEvent(new Event("change",{bubbles:true}));}catch(e){}
  // 选项数量变化会改变内容自然尺寸 → 重新适配等比缩放
  try{var st=document.querySelector(".${uid}-st");if(st&&st.__wcFit)st.__wcFit();}catch(e){}
};
})();</script>`
    : "";

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
        renderBody: `if (window["__wcRadio_${uid}"]) window["__wcRadio_${uid}"](data);`,
      })
    : "";

  const body = groupRow + va.errEl + helperLine + css;

  return (
    `<div id="${uid}"${va.attr} style="${SCALE_OUTER_CSS}">` +
    scaleSkeleton({
      uid,
      control: body,
      spec: RADIO_FIT,
      align: stageAlignOf(c),
      vAlign: stageVAlignOf(c),
      innerStyle: "display:flex;flex-direction:column;align-items:flex-start",
      scaleFit,
    }) +
    `</div>` +
    helperScript +
    rebuildScript +
    apiScript +
    liveValidateScript(uid, va.hasRules, ctx) +
    scaleSkeletonScript(uid, RADIO_FIT, scaleFit)
  );
};
