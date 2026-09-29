import { readAuthEnabled } from "../../../editor/data/authMode";
import { MUI_FONT } from "../../../editor/data/fieldStyle";
import { parseOptionItems } from "../../../editor/data/optionItems";
import { fieldScaleFactor } from "../../../editor/data/scaleFit";
import { resolveEffectiveDataConfig } from "../../../shared/resolveDataConfig";
import { dataLoaderScript } from "../../dataLoader";
import { EASE, FOCUS_LABEL_COLOR, liveValidateScript, reqTail, validationHTML } from "../../fieldChrome";
import { renderMenuIcon } from "../../iconPipeline";
import { escapeHTML } from "../../layout";
import type { OptionItem } from "../../../editor/data/optionItems";
import type { ComponentCodegenFn } from "../../types";
import { ICON_ARROW_DROP, ICON_CLOSE, fieldNameAttr, svgIcon, sxRadius } from "./shared";



/**
 * form-select 组件 → HTML（对齐编辑区 FormSelectRenderer + 与输入框/文本域同系列）
 * size=small 自然高 37.125px 垂直居中于设计盒；内置悬浮标签改为左上角实色徽章（fc-sel-flabel）；
 * 箭头跟随文字色（修复浅色主题下纯白箭头不可见）；边框走 box-shadow inset 环（borderWidth 可控）；聚焦改色。
 * 支持：占位未选态(placeholder)、选项 value/label 分离(|)、labelPlacement(top/none)、
 * helperText、clearable、实时校验（change/blur 触发 __WCVALIDATE）、fontWeight/label* 徽章样式。
 */
export const formSelectCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config;
  // 字段型「文字随框缩放」（第 11 轮）：字号与标签字号按「框 / defaultSize」倍率编译期缩放，
  // 开关关闭时 factor=1 逐字零回归。派生量（图标宽、行高）自动跟随。
  const fitF = fieldScaleFactor("form-select", component.transform.width, component.transform.height, c.scaleFit === true);
  // ── 数据源解析：支持 dataMode(api) 与全局数据源绑定（dataSourceId）──
  const dsId = String((c as Record<string, unknown>).dataSourceId ?? "");
  const gds = ctx.globalDataSources as Record<string, unknown> | undefined;
  const boundSource = dsId && gds ? (gds[dsId] as Record<string, unknown>) : undefined;
  const eff: Record<string, unknown> = boundSource
    ? (resolveEffectiveDataConfig(c as Record<string, unknown>, boundSource) as Record<string, unknown>)
    : (c as Record<string, unknown>);
  const dataMode = String(eff.dataMode ?? "static");
  const isApi = dataMode === "api" && (String(eff.apiUrl ?? "") || String(eff.apiPath ?? ""));
  const apiUrl = String(eff.apiUrl ?? "");
  const apiPath = String(eff.apiPath ?? "");
  const apiMethod = String(eff.apiMethod ?? "GET");
  const apiInterval = Number(eff.apiInterval ?? 0) || 0;
  const apiDataPath = String(eff.apiDataPath ?? "");
  const apiHeaders = String(eff.apiHeaders ?? "");
  const apiBody = String(eff.apiBody ?? "");
  const authEnabled =
    readAuthEnabled(eff.authEnabled);
  const apiValueField = String(eff.apiValueField ?? "");
  const apiLabelField = String(eff.apiLabelField ?? "");
  const label = String(c.label ?? "");
  const labelPlacement = String(c.labelPlacement ?? "inside");
  const placeholder = String(c.placeholder ?? "").trim();
  const helperText = String(c.helperText ?? "").trim();
  const clearable = c.clearable === true;
  const fontSize = (Number(c.fontSize ?? 14) || 14) * fitF;
  const bgColor = String(c.bgColor ?? "#ffffff");
  const textColor = String(c.textColor ?? "#333333");
  const borderColor = String(c.borderColor ?? "#d0d0d8");
  const borderWidth = Number(c.borderWidth ?? 1) || 1;
  const focusColor = String(c.focusBorderColor ?? "#1976d2");
  const fontWeight = String(c.fontWeight ?? "normal").trim() || "normal";
  const uid = "fsel-" + Math.random().toString(36).slice(2, 9);
  const va = validationHTML(c);

  // 标签徽章样式（与输入框 fc-flabel / 文本域 fta-flabel 同源）：颜色/字号/背景色/圆角/间距
  const labelColor = String(c.labelColor ?? "").trim();
  const labelFontSize = (Number(c.labelFontSize) > 0 ? Number(c.labelFontSize) : 0) * fitF;
  const labelBgColor = String(c.labelBgColor ?? "").trim();
  const labelBgColorCss = labelBgColor || bgColor;
  const labelRadius = Number(c.labelRadius) >= 0 ? Number(c.labelRadius) : 4;
  const labelGap = Number(c.labelGap) >= 0 ? Number(c.labelGap) : 4;
  const labelColorCss = labelColor || textColor;

  const showEmpty = !!placeholder || clearable;
  let effective: OptionItem[];
  let defaultIdx: number;
  let selectedValue: string;
  if (isApi) {
    // 接口模式：原生 <select> 初始仅放占位项（若有），待 dataLoader 脚本把接口数组填充进 <option>
    effective = showEmpty ? [{ label: placeholder || "", value: "" }] : [];
    defaultIdx = 0;
    selectedValue = "";
  } else {
    // 静态选项：兼容新 items 数组（list-editor）与旧 options 文本（自动迁移），支持逐项图标
    const parsed = parseOptionItems(c.items ?? c.options);
    effective = showEmpty
      ? [{ label: placeholder || "", value: "" }, ...parsed]
      : parsed;
    defaultIdx = Number(c.selectedIndex ?? 0) || 0;
    if (showEmpty) defaultIdx = defaultIdx > 0 ? defaultIdx : 0;
    defaultIdx = Math.max(0, Math.min(defaultIdx, effective.length - 1));
    selectedValue = effective[defaultIdx]?.value ?? "";
  }

  const showLabel = labelPlacement !== "none" && !!label;
  const topLabel = showLabel && labelPlacement === "top";
  // 恒 column：控件自然高 37.125px，inside/none 时整组垂直居中，helper/错误提示在控件下方
  // （此前 row 布局会把 helper 挤到控件右侧，属布局 bug）
  const wrapperStyles = [
    "width:100%", "height:100%", "display:flex", "flex-direction:column",
    `justify-content:${topLabel ? "flex-start" : "center"}`,
    `font-family:${MUI_FONT}`, "box-sizing:border-box",
  ];
  let html = `<div style="${wrapperStyles.join("; ")}"${va.attr}>`;

  if (topLabel && label) {
    html += `<label style="font-size:${labelFontSize || fontSize}px;line-height:1.2;color:${labelColorCss};margin-bottom:${labelGap}px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;user-select:none;flex-shrink:0">${escapeHTML(label)}${c.required ? " *" : ""}</label>`;
  }

  const padRight = clearable ? 56 : 32;
  // 原生 <select> 仅作"值 + 校验"载体，视觉隐藏、不接收点击（点击交给自定义触发器）。
  // 保留 name/id/options：form.ts 校验收集 querySelectorAll('select[name]') 与
  // liveValidate/helper/clear 三脚本按 getElementById(uid) 读取的契约不变。
  const selectStyles = [
    "position:absolute", "top:0", "left:0", "width:100%", "height:100%",
    "border:none", "outline:none", "appearance:none", "-webkit-appearance:none", "-moz-appearance:none",
    "background:transparent", `color:${textColor}`, `font-family:${MUI_FONT}`, `font-size:${fontSize}px`,
    `font-weight:${fontWeight}`, "line-height:20.125px", `padding:8.5px ${padRight}px 8.5px 14px`, "cursor:pointer",
    "opacity:0", "pointer-events:none",
  ];
  const ctrlH = 37.125;
  // 边框 = box-shadow inset 环（borderWidth 可控）；data-ring + data-bw 供校验运行时改错误色
  html += `<div class="${uid}" data-ring="1" data-bw="${borderWidth}" style="position:relative;width:100%;height:${ctrlH}px;box-sizing:border-box;border:none;border-radius:${sxRadius(c.borderRadius)};background:${bgColor};${c.disabled ? "opacity:.6;cursor:not-allowed" : ""}">`;
  // id 挂在 select 本体：liveValidateScript/helperScript/clearScript 均按 getElementById(uid) 定位控件
  html += `<select id="${uid}" ${fieldNameAttr(c, "select")}${c.required ? " required" : ""}${c.disabled ? " disabled" : ""} aria-hidden="true" tabindex="-1" style="${selectStyles.join("; ")}">`;
  effective.forEach((opt) => {
    const selected = opt.value === selectedValue ? " selected" : "";
    // 逐项图标：编译期渲染为内联 SVG，暂存 data-icon，供自定义弹层运行时注入（原生 <option> 不显示图标）
    const iconHtml = opt.icon ? renderMenuIcon(opt.icon, 16, ctx) : "";
    const iconAttr = iconHtml ? ` data-icon="${escapeHTML(iconHtml)}"` : "";
    html += `<option value="${escapeHTML(opt.value)}"${selected}${iconAttr}>${escapeHTML(opt.label)}</option>`;
  });
  html += `</select>`;
  // 自定义触发器：显示当前选中文字，点击展开自定义弹层（角色/键盘可达）。原生下拉被替换原因：
  // 发布页整页 transform:scale 适配（viewport.ts）会让原生 <select> 弹层错位；自定义弹层挂 body 逃逸缩放。
  const triggerStyles = [
    "position:absolute", "top:0", "left:0", "width:100%", "height:100%",
    "display:flex", "align-items:center", `padding:0 ${padRight}px 0 14px`, "box-sizing:border-box",
    `color:${textColor}`, `font-family:${MUI_FONT}`, `font-size:${fontSize}px`, `font-weight:${fontWeight}`,
    "line-height:20.125px", "user-select:none", "outline:none", "z-index:2",
    `cursor:${c.disabled ? "not-allowed" : "pointer"}`,
  ];
  const initOpt = effective[defaultIdx];
  const initIcon = initOpt?.icon ? renderMenuIcon(initOpt.icon, 16, ctx) : "";
  html += `<div id="${uid}-tg" role="combobox" aria-haspopup="listbox" aria-expanded="false" tabindex="${c.disabled ? "-1" : "0"}" style="${triggerStyles.join("; ")}"><span id="${uid}-ic" style="display:inline-flex;align-items:center;margin-right:6px;flex-shrink:0">${initIcon}</span><span id="${uid}-lb" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHTML(effective[defaultIdx]?.label ?? "")}</span></div>`;
  // 下拉箭头：跟随文字色（修复浅色主题下纯白箭头不可见）
  html += `<svg viewBox="0 0 24 24" width="24" height="24" fill="${textColor}" aria-hidden="true" style="position:absolute;right:7px;top:50%;transform:translateY(-50%);pointer-events:none;display:block"><path d="${ICON_ARROW_DROP}"/></svg>`;
  // 一键清空：仅当用户已选择且非禁用时显示（右侧箭头左侧，padding-right 已预留空间）
  if (clearable && !c.disabled) {
    html += `<span id="${uid}c" class="fclear" style="position:absolute;right:32px;top:50%;transform:translateY(-50%);cursor:pointer;display:none;z-index:3;user-select:none">${svgIcon(ICON_CLOSE, 14, textColor)}</span>`;
  }
  // 内置悬浮标签：左上角徽章（带背景、圆角、可调字号），底色盖住边框线段→干净缺口、文字不被边框遮挡（与 fc-flabel 同系列）
  if (showLabel && labelPlacement === "inside") {
    html += `<label class="fc-sel-flabel" style="position:absolute;left:14px;font-size:${labelFontSize || fontSize}px;line-height:1.2;color:${labelColorCss};background:${labelBgColorCss};border-radius:${labelRadius}px;padding:0 4px;pointer-events:none;z-index:2;white-space:nowrap;user-select:none">${escapeHTML(label)}${reqTail(c.required)}</label>`;
  }
  // 边框环（borderWidth 可控）+ 悬浮徽章颜色态（默认 labelColorCss，聚焦 FOCUS_LABEL_COLOR）；徽章锚定上沿（与输入框/文本域同系列）
  html += `<style>.${uid}{box-shadow:inset 0 0 0 ${borderWidth}px ${borderColor};transition:box-shadow .2s ${EASE}}.${uid}:focus-within{box-shadow:inset 0 0 0 ${borderWidth}px ${focusColor}}.${uid} .fc-sel-flabel{color:${labelColorCss};top:0;transform:translateY(-50%);transform-origin:left center;transition:color .2s ${EASE}}.${uid}:focus-within .fc-sel-flabel{color:${FOCUS_LABEL_COLOR}}.${uid} select:disabled{cursor:not-allowed}</style>`;
  html += `</div>`;

  html += va.errEl;
  const helperLine = helperText
    ? `<span class="fc-help" id="${uid}h" style="flex-shrink:0;font-size:12px;line-height:1.4;margin-top:3px;color:${labelColor || "#8a8f98"};user-select:none;display:${va.hasRules ? "none" : "block"}">${escapeHTML(helperText)}</span>`
    : "";
  html += helperLine;
  // 帮助文字 / 清空按钮 / 实时校验 的运行时脚本（与 input/textarea 同源 __WCVALIDATE）
  const helperScript = helperText && va.hasRules
    ? `<script>;(function(){var d=document.getElementById('${uid}');var h=document.getElementById('${uid}h');if(!d||!h)return;var box=d.closest('[data-vrules]');function sync(){var e=box?box.querySelector('.fc-err'):null;h.style.display=(e&&e.style.display!=='none'&&e.textContent)?'none':'block';}d.addEventListener('change',sync);d.addEventListener('blur',sync);sync();})();</script>`
    : "";
  const clearScript = clearable && !c.disabled
    ? `<script>;(function(){var s=document.getElementById('${uid}');var cl=document.getElementById('${uid}c');if(!s||!cl)return;function up(){cl.style.display=s.value?'block':'none';}cl.addEventListener('click',function(){s.value='';s.focus();up();s.dispatchEvent(new Event('change',{bubbles:true}));});s.addEventListener('change',up);up();})();</script>`
    : "";
  const liveScript = liveValidateScript(uid, va.hasRules, ctx);
  // 自定义下拉弹层运行时：弹层挂 document.body + position:fixed，锚定触发器底边（下沿），
  // 逃逸发布页 .page 的 transform:scale（否则原生弹层错位）。按页面 scale 补偿视觉尺寸。
  // 选项点击 → 写回原生 select.value + 派发 change/blur（复用既有 liveValidate/clear/helper 脚本）。
  const panelScript = `<script>;(function(){var U='${uid}';var sel=document.getElementById(U);var tg=document.getElementById(U+'-tg');var lb=document.getElementById(U+'-lb');var ic=document.getElementById(U+'-ic');if(!sel||!tg||!lb)return;var panel=null,open=false;
function sync(){var o=sel.options[sel.selectedIndex];lb.textContent=o?o.textContent:'';if(ic)ic.innerHTML=o?(o.getAttribute('data-icon')||''):'';}
sel.addEventListener('change',sync);sync();
function scaleOf(){var r=tg.getBoundingClientRect();var w=tg.offsetWidth||r.width;return(w&&r.width)?(r.width/w):1;}
function clearHi(){if(!panel)return;var its=panel.querySelectorAll('[data-wcsel-opt]');for(var i=0;i<its.length;i++){its[i].style.background='';}}
function build(){var p=document.createElement('div');p.setAttribute('role','listbox');p.setAttribute('data-wcsel-panel','');p.style.cssText="position:fixed;z-index:2147483000;box-sizing:border-box;background:#ffffff;border:1px solid ${borderColor};border-radius:${sxRadius(c.borderRadius)};box-shadow:0 6px 20px rgba(0,0,0,.16);padding:4px 0;overflow-y:auto;display:none;transform-origin:top left;font-family:${MUI_FONT}";for(var i=0;i<sel.options.length;i++){(function(idx){var o=sel.options[idx];var it=document.createElement('div');it.setAttribute('role','option');it.setAttribute('data-wcsel-opt',String(idx));it.style.cssText='display:flex;align-items:center;justify-content:space-between;height:34px;padding:0 14px;box-sizing:border-box;font-size:${fontSize}px;font-weight:${fontWeight};color:${textColor};cursor:pointer;white-space:nowrap';var left=document.createElement('span');left.style.cssText='display:flex;align-items:center;overflow:hidden;min-width:0';var icv=o.getAttribute('data-icon')||'';if(icv){var iw=document.createElement('span');iw.style.cssText='display:inline-flex;align-items:center;margin-right:8px;flex-shrink:0';iw.innerHTML=icv;left.appendChild(iw);}var sp=document.createElement('span');sp.style.cssText='overflow:hidden;text-overflow:ellipsis;white-space:nowrap';sp.textContent=o.textContent;left.appendChild(sp);it.appendChild(left);var ck=document.createElement('span');ck.style.cssText='margin-left:8px;flex-shrink:0;display:none;color:${focusColor}';ck.textContent='\\u2713';it.appendChild(ck);it.addEventListener('mouseenter',function(){clearHi();it.style.background='rgba(0,0,0,.05)';});it.addEventListener('mousedown',function(e){e.preventDefault();});it.addEventListener('click',function(){sel.value=o.value;sel.dispatchEvent(new Event('change',{bubbles:true}));try{sel.dispatchEvent(new Event('blur',{bubbles:true}));}catch(_e){}close();});p.appendChild(it);})(i);}document.body.appendChild(p);return p;}
function mark(){var idx=sel.selectedIndex;var its=panel.querySelectorAll('[data-wcsel-opt]');for(var i=0;i<its.length;i++){var it=its[i];var on=(Number(it.getAttribute('data-wcsel-opt'))===idx);it.setAttribute('aria-selected',on?'true':'false');it.style.background=on?'rgba(25,118,210,.10)':'';var ck=it.lastChild;if(ck)ck.style.display=on?'block':'none';}}
function pos(){var r=tg.getBoundingClientRect();var s=scaleOf()||1;var avail=window.innerHeight-r.bottom-8;var mh=Math.max(80,Math.min(240,Math.round(avail/s)));panel.style.width=(tg.offsetWidth||r.width)+'px';panel.style.top=r.bottom+'px';panel.style.left=r.left+'px';panel.style.maxHeight=mh+'px';panel.style.transform='scale('+s+')';}
function openP(){if(sel.disabled)return;if(!panel)panel=build();pos();mark();panel.style.display='block';open=true;tg.setAttribute('aria-expanded','true');}
function close(){if(panel){panel.style.display='none';}open=false;tg.setAttribute('aria-expanded','false');}
tg.addEventListener('click',function(e){e.stopPropagation();if(open){close();}else{openP();}});
tg.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '||e.key==='ArrowDown'){e.preventDefault();if(!open)openP();}else if(e.key==='Escape'){close();}});
tg.addEventListener('blur',function(){try{sel.dispatchEvent(new Event('blur',{bubbles:true}));}catch(_e){}});
document.addEventListener('mousedown',function(e){if(!open)return;var t=e.target;if(panel&&panel.contains(t))return;if(tg.contains(t))return;close();});
window.addEventListener('scroll',function(){if(open)close();},true);
window.addEventListener('resize',function(){if(open)close();});
// 动态 API 选项到达后，销毁并以原生 select.options 重建自定义面板（若已展开则立即重建）；仅接口模式暴露钩子
${isApi ? 'window["__wcSel_"+U]={afterOptionsUpdate:function(){if(panel&&panel.parentNode){panel.parentNode.removeChild(panel);}panel=null;if(open)openP();}};' : ''}
})();</script>`;

  // ── 接口模式：dataLoaderScript 统一取数骨架（URL 拼接 / Token 注入 / 轮询 / 登录态重取）──
  // 数据到达后把数组填充进原生 <select> 的 <option>，并触发 panelScript 暴露的 afterOptionsUpdate 同步面板。
  let apiScript = "";
  if (isApi) {
    apiScript = dataLoaderScript({
      container: `var el = document.getElementById("${uid}-tg");`,
      apiUrl,
      apiPath,
      apiMethod,
      apiHeaders,
      apiBody,
      apiInterval,
      apiDataPath,
      authEnabled,
      renderBody: `
        var sel = document.getElementById("${uid}");
        if (!sel) return;
        var showEmpty = ${showEmpty ? "true" : "false"};
        var ph = ${JSON.stringify(placeholder)};
        var vField = ${JSON.stringify(apiValueField)};
        var lField = ${JSON.stringify(apiLabelField)};
        var raw = Array.isArray(data) ? data : (data && (data.items || data.list)) ? (data.items || data.list) : (data ? [data] : []);
        sel.innerHTML = "";
        if (showEmpty) { var eo = document.createElement("option"); eo.value = ""; eo.textContent = ph || ""; sel.appendChild(eo); }
        for (var i = 0; i < raw.length; i++) {
          var d = raw[i];
          var val, lab;
          if (d && typeof d === "object") {
            val = vField ? String(d[vField] != null ? d[vField] : "") : String(d.id != null ? d.id : (d.value != null ? d.value : ""));
            lab = lField ? String(d[lField] != null ? d[lField] : "") : String(d.name != null ? d.name : (d.label != null ? d.label : (d.text != null ? d.text : val)));
          } else { val = String(d); lab = String(d); }
          if (!lab) lab = val;
          var o = document.createElement("option"); o.value = val; o.textContent = lab; sel.appendChild(o);
        }
        if (sel.options.length) sel.selectedIndex = 0;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
        if (window["__wcSel_${uid}"]) window["__wcSel_${uid}"].afterOptionsUpdate();
      `,
    });
  }

  html += helperScript;
  html += clearScript;
  html += liveScript;
  html += panelScript;
  html += apiScript;
  html += `</div>`;
  return html;
};
