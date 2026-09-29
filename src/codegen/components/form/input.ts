import { MUI_FONT } from "../../../editor/data/fieldStyle";
import { fieldScaleFactor } from "../../../editor/data/scaleFit";
import { EASE, FILLED_LABEL_COLOR, FOCUS_LABEL_COLOR, liveValidateScript, reqTail, validationHTML } from "../../fieldChrome";
import { escapeHTML } from "../../layout";
import type { ComponentCodegenFn } from "../../types";
import { ICON_CLOSE, fieldNameAttr, svgIcon, sxRadius } from "./shared";



/**
 * form-input 组件 → HTML（对齐编辑区 FormInputRenderer + MUI v9 实测值）
 * 几何：padX=14；图标左缩进14 + 宽(=fontSize×1.2) + 间距(iconGap×8) + 文字缩进14；
 * 悬浮标签恒在 left 14（编辑区标签不避让图标）；上浮 transform translate(0,-6.5px) scale(.75)。
 */
export const formInputCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config;
  // 字段型「文字随框缩放」（第 11 轮）：字号与标签字号按「框 / defaultSize」倍率编译期缩放，
  // 开关关闭时 factor=1 逐字零回归。派生量（图标宽、行高）自动跟随。
  const fitF = fieldScaleFactor("form-input", component.transform.width, component.transform.height, c.scaleFit === true);
  const placement = String(c.labelPlacement ?? "inside");
  const label = String(c.label ?? "");
  const fontSize = (Number(c.fontSize ?? 14) || 14) * fitF;
  const bgColor = String(c.bgColor ?? "#ffffff");
  const textColor = String(c.textColor ?? "#333333");
  const borderColor = String(c.borderColor ?? "#d0d0d8");
  const borderWidth = Number(c.borderWidth ?? 1) || 1;
  const focusColor = String(c.focusBorderColor ?? "#1976d2");
  const fontWeight = String(c.fontWeight ?? "normal").trim() || "normal";
  const uid = "fi-" + Math.random().toString(36).slice(2, 9);
  const va = validationHTML(c);

  const padX = Number(c.paddingX) >= 0 ? Number(c.paddingX) : 14;
  const prefixText = String(c.prefixText ?? "").trim();
  const suffixText = String(c.suffixText ?? "").trim();
  const align = String(c.align ?? "left") || "left";
  const autocomplete = String(c.autocomplete ?? "").trim();
  // 前缀/后缀为 flex 兄弟节点（非绝对定位），不占 input 内边距。图标已移除：输入框仅标题+内容。
  const leftPad = prefixText ? 6 : padX;
  const rightPad = suffixText ? 6 : padX;
  // 前缀/后缀文本：flex 兄弟节点，自身内边距贴边、与输入区留 6px 间隙
  const affixSpan = (text: string, side: "left" | "right"): string =>
    text
      ? `<span style="display:flex;align-items:center;flex-shrink:0;color:${textColor};opacity:.75;user-select:none;font-size:${fontSize}px;line-height:1.4375;${side === "left" ? `padding-left:${padX}px;padding-right:6px` : `padding-left:6px;padding-right:${padX}px`}">${escapeHTML(text)}</span>`
      : "";
  const prefixSpanHtml = affixSpan(prefixText, "left");
  const suffixSpanHtml = affixSpan(suffixText, "right");

  const showCount = !!c.showCount;
  const maxLen = Number(c.maxLength) > 0 ? Number(c.maxLength) : 0;

  const labelColor = String(c.labelColor ?? "").trim();
  const labelFontSize = (Number(c.labelFontSize) > 0 ? Number(c.labelFontSize) : 0) * fitF;
  const labelGap = Number(c.labelGap) >= 0 ? Number(c.labelGap) : 4;
  const helperText = String(c.helperText ?? "").trim();
  // 内置悬浮标签底色：留空→跟随输入框背景色（无缝缺口）；可自定义为对比色做成徽章
  const labelBgColor = String(c.labelBgColor ?? "").trim();
  const labelBgColorCss = labelBgColor || bgColor;
  // 内置悬浮标签背景圆角（控制背景形状），0=直角
  const labelRadius = Number(c.labelRadius) >= 0 ? Number(c.labelRadius) : 4;
  // 悬浮标签左缩进：默认对齐文字起点 padX（与编辑区一致）
  const labelLeft = padX;
  // 标签颜色默认跟随输入文字色；labelColor 可独立定制
  const labelColorCss = labelColor || textColor;

  const hasFloat = placement === "inside" && !!label;
  const wrapperStyles = ["width: 100%", "height: 100%", "display: flex", "flex-direction: column", `font-family: ${MUI_FONT}`];

  let html = `<div style="${wrapperStyles.join("; ")}"${va.attr}>`;

  if (placement === "top" && label) {
    html += `<label style="font-size:${labelFontSize || fontSize}px;line-height:1.2;color:${labelColorCss};margin-bottom:${labelGap}px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;user-select:none">${escapeHTML(label)}${c.required ? " *" : ""}</label>`;
  }

  const inputType = c.inputType ?? "text";
  const isNumber = inputType === "number";
  const valueAttr = c.value ? ` value="${escapeHTML(String(c.value))}"` : "";
  const realPh = c.placeholder ? escapeHTML(String(c.placeholder)) : "";
  // 悬浮标签输入框：占位全透明（编辑区空态/聚焦态均隐藏占位）；无悬浮标签时占位 currentColor×0.5
  const placeholderAttr = hasFloat
    ? ` placeholder="${realPh || " "}"`
    : (realPh ? ` placeholder="${realPh}"` : "");
  const requiredAttr = c.required ? " required" : "";
  const disabledAttr = c.disabled ? " disabled" : "";
  const readonlyAttr = c.readonly ? " readonly" : "";
  // 数字框浏览器忽略 maxlength，长度限制改由校验层处理；原生 min/max/step 提升移动端体验与约束
  const maxLengthAttr = (!isNumber && maxLen > 0) ? ` maxlength="${maxLen}"` : "";
  let numAttr = "";
  if (isNumber) {
    numAttr += ` step="any"`;
    if (String(c.validateType ?? "none") === "number") {
      const vmin = Number(c.validateMin);
      const vmax = Number(c.validateMax);
      if (Number.isFinite(vmin)) numAttr += ` min="${vmin}"`;
      if (Number.isFinite(vmax)) numAttr += ` max="${vmax}"`;
    }
  }
  const idAttr = ` id="${uid}"`;
  const autocompleteAttr = autocomplete ? ` autocomplete="${autocomplete}"` : "";
  // 边框环由 CSS box-shadow inset 绘制（编辑区 fieldset 为覆盖层不吃布局，聚焦变色不挤压文字）；
  // data-bw 供校验运行时取错误环宽
  const inputStyles = [
    "flex: 1 1 auto",
    "min-width: 0",
    "height: 100%",
    "box-sizing: border-box",
    `background: ${bgColor}`,
    `color: ${textColor}`,
    "border: none",
    `border-radius: ${sxRadius(c.borderRadius)}`,
    `font-family: ${MUI_FONT}`,
    `font-size: ${fontSize}px`,
    `font-weight: ${fontWeight}`,
    "line-height: 1.4375",
    `text-align: ${align}`,
    `padding: 0 ${rightPad}px 0 ${leftPad}px`,
    "outline: none",
  ];

  const input = `<input type="${inputType}"${idAttr}${fieldNameAttr(c, "input")}${placeholderAttr}${valueAttr}${requiredAttr}${disabledAttr}${readonlyAttr}${maxLengthAttr}${numAttr}${autocompleteAttr} data-bw="${borderWidth}" style="${inputStyles.join("; ")}" />`;

  // 悬浮标签：左上角徽章（带背景、圆角、可调字号），底色盖住边框线段→干净缺口、文字不被边框遮挡。
  // top/transform 不写 inline（会被 inline 优先级锁死），改由下方 <style> 基规则驱动。
  const floatingLabel = hasFloat
    ? `<label class="fc-flabel" style="position:absolute;left:${labelLeft}px;font-size:${labelFontSize || fontSize}px;line-height:1.2;color:${labelColorCss};background:${labelBgColorCss};border-radius:${labelRadius}px;padding:0 4px;pointer-events:none;z-index:2;white-space:nowrap;user-select:none">${escapeHTML(label)}${reqTail(c.required)}</label>`
    : "";
  // 字数统计：输入框下方右对齐（编辑区 caption：11px / text.secondary）
  const countLine = showCount
    ? `<span id="${uid}n" style="flex-shrink:0;font-size:11px;color:${FILLED_LABEL_COLOR};align-self:flex-end;margin-top:2px;user-select:none"></span>`
    : "";
  // 帮助文字：输入框下方常驻说明，校验出错时让位于错误提示（errEl 显示则隐藏 helper）
  const helperLine = helperText
    ? `<span class="fc-help" id="${uid}h" style="flex-shrink:0;font-size:12px;line-height:1.4;margin-top:3px;color:${labelColor || "#8a8f98"};user-select:none;display:${va.hasRules ? "none" : "block"}">${escapeHTML(helperText)}</span>`
    : "";
  const helperScript = helperText && va.hasRules
    ? `<script>;(function(){var d=document.getElementById('${uid}');var h=document.getElementById('${uid}h');if(!d||!h)return;var box=d.closest('[data-vrules]');function sync(){var e=box?box.querySelector('.fc-err'):null;h.style.display=(e&&e.style.display!=='none'&&e.textContent)?'none':'block';}d.addEventListener('input',sync);d.addEventListener('blur',sync);d.addEventListener('change',sync);sync();})();</script>`
    : "";
  const clearBtnHtml = c.clearable && !c.disabled && !c.readonly
    ? `<span id="${uid}c" class="fclear" style="position:absolute;right:${padX}px;top:50%;transform:translateY(-50%);cursor:pointer;display:none;z-index:3;user-select:none">${svgIcon(ICON_CLOSE, 14, "currentColor")}</span>`
    : "";
  // 边框走 fieldset 实线覆盖层（data-ring 供校验运行时改错误色）；悬浮标签徽章底色盖住左上角边框线段，形成干净缺口。
  // 聚焦改边框色、禁用压淡、错误由运行时 box-shadow 落在此 fieldset 上。
  const floatCss =
    `<style>` +
    `.${uid} .fc-outline{border:${borderWidth}px solid ${borderColor};border-radius:${sxRadius(c.borderRadius)};transition:border-color .2s ${EASE},box-shadow .2s ${EASE}}` +
    `.${uid}:focus-within .fc-outline{border-color:${focusColor}}` +
    `.${uid} input{transition:box-shadow .2s ${EASE}}` +
    `.${uid} input:disabled{opacity:.6;cursor:not-allowed}` +
    // 悬浮标签：始终在边框左上角（徽章背景盖住边框线段），占位提示常驻可见（一般输入框都有提示信息）
    `.${uid} .fc-flabel{color:${labelColorCss};top:0;transform:translateY(-50%);transform-origin:left center;transition:color .2s ${EASE}}` +
    `.${uid} input::placeholder{color:${textColor};opacity:.5}` +
    `.${uid} input:not(:placeholder-shown) ~ .fc-flabel{color:${FILLED_LABEL_COLOR}}` +
    `.${uid} input:focus ~ .fc-flabel{color:${FOCUS_LABEL_COLOR}}` +
    `.${uid} .fclear{color:rgba(255,255,255,0.3)}` +
    `.${uid} .fclear:hover{color:${FILLED_LABEL_COLOR}}` +
    `</style>`;

  const ctrlScript = (clearBtnHtml || countLine)
    ? `<script>;(function(){var i=document.getElementById('${uid}');if(!i)return;var c=document.getElementById('${uid}c'),n=document.getElementById('${uid}n');function up(){var p=i.parentElement;if(p)p.classList.toggle('has-val',!!i.value);if(c)c.style.display=i.value?'block':'none';if(n)n.textContent=i.value.length+(i.maxLength>0?(' / '+i.maxLength):'');}i.addEventListener('input',up);i.addEventListener('change',up);if(c)c.addEventListener('click',function(){i.value='';i.focus();up();i.dispatchEvent(new Event('input',{bubbles:true}));});up();})();</script>`
    : "";

  const liveScript = liveValidateScript(uid, va.hasRules, ctx);

  // 边框 = fieldset 实线覆盖层（data-ring 供校验运行时改错误色）；悬浮标签徽章底色盖住左上角边框线段，形成干净缺口。
  const outline = `<fieldset class="fc-outline" data-ring="1" style="position:absolute;inset:0;margin:0;padding:0;border:${borderWidth}px solid ${borderColor};border-radius:${sxRadius(c.borderRadius)};pointer-events:none;min-width:0"></fieldset>`;
  const fieldDiv = `<div class="${uid}" style="position:relative;width:100%;flex:1;min-height:0;display:flex;align-items:stretch">${outline}${prefixSpanHtml}${input}${suffixSpanHtml}${floatingLabel}${clearBtnHtml}</div>`;

  html += fieldDiv;
  html += va.errEl;
  html += countLine;
  html += helperLine;
  html += ctrlScript;
  html += liveScript;
  html += helperScript;
  html += floatCss;
  html += `</div>`;
  return html;
};
