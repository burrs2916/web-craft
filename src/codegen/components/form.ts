import type { ComponentCodegenFn, CodegenContext } from "../types";
import type { SceneComponent } from "../../types/editor";
import { escapeHTML } from "../layout";
import { getCodegen } from "../components";
import { buildButtonFitHTML, BUTTON_FIT } from "../shared/button";
import { dataLoaderScript } from "../dataLoader";
import { resolveEffectiveDataConfig } from "../../shared/resolveDataConfig";
import { renderMenuIcon } from "../iconPipeline";
import { parseOptionItems, type OptionItem } from "../../editor/data/optionItems";
import { resolveLabelStyle, labelTextCss, labelInnerCss } from "../../editor/data/labelStyle";
import {
  resolveSliderStyle,
  sliderLabelRowCss,
  sliderLabelCss,
  sliderValueCss,
  sliderRowCss,
  sliderEndpointCss,
  sliderBubbleCss,
  sliderValueText,
  sliderThumbLeft,
  SLIDER_PRESS_TRANSITION,
  sliderPressCssOf,
  sliderTicksOf,
  sliderTickLayerCss,
  sliderTickCss,
  sliderTickLabelCss,
  sliderTickLabelText,
} from "../../editor/data/sliderStyle";
import { MUI_FONT, SHAPE_RADIUS, resolveFieldStyle } from "../../editor/data/fieldStyle";
import { fieldScaleFactor } from "../../editor/data/scaleFit";
import { timePickerPopupScript } from "../../editor/data/timePickerPopup";
import { datePickerPopupScript } from "../../editor/data/datePickerPopup";
import { fileFieldScript, ffZoneRadius, ffZoneIconSvg } from "../../editor/data/fileField";
import { formNumberScript, FN_MINUS_PATH, FN_PLUS_PATH } from "../../editor/data/numberField";
import { coerceProgressNumber } from "../../editor/data/progressData";
import {
  resolveToggleShell,
  toggleShellCss,
  toggleLabelTextCss,
  resolveSwitchSkin,
  resolveCheckboxUncheckedColor,
} from "../../editor/data/toggleStyle";
import { cssText, escapeAttr } from "../../editor/data/cssDecls";
import {
  LABEL_FIT, CHECKBOX_FIT, RADIO_FIT, SWITCH_FIT,
  stageAlignOf, stageVAlignOf,
} from "../../editor/data/scaleFit";
import { scaleSkeleton, scaleSkeletonScript, SCALE_OUTER_CSS } from "../shared/scaleSkeleton";
import { readAuthEnabled } from "../../editor/data/authMode";
import {
  EASE, FOCUS_LABEL_COLOR, FILLED_LABEL_COLOR,
  reqTail, validationHTML, ensureValidator, liveValidateScript, helperYieldScript, fieldShellHTML,
} from "../fieldChrome";

/**
 * 编辑区表单控件由 MUI（v9）渲染，以下真值来自对编辑区实测（headless 量取）：
 * - 主题 shape.borderRadius=10：sx 传“数字”圆角会 ×10（input/textarea/select/容器/date/time/number/file），
 *   统一由 `resolveFieldStyle().radiusCss`（面板值 × SHAPE_RADIUS）复刻，全表单族同一口径。
 * - 字体栈固定 Inter/SF Pro（不受画布字体影响），发布端必须显式钉住（MUI_FONT 来自 fieldStyle）。
 * - 暗色主题派生色：聚焦标签 #60A5FA、已填标签 #94A3B8、星号 #FF7B72（均在 fieldChrome 内定义）
 *   本文件不再自带这些字面量，避免与共享外壳出现两份取值。
 * - sx 间距数字按 spacing 单位(×8px)换算：iconGap:8 实际渲染 64px。
 */

/** 编辑区 sx 数字圆角 → ×shape.borderRadius(10) */
function sxRadius(v: unknown, fallback = 4): string {
  const n = Number(v);
  return `${(Number.isFinite(n) && n >= 0 ? n : fallback) * SHAPE_RADIUS}px`;
}


const CB_OFF = "M19 5v14H5V5h14m0-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z";
const CB_ON = "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-8.7 16l-6-6 1.4-1.4 4.6 4.6 6.6-6.6L19 10l-8.7 9z";
/** MUI IndeterminateCheckBox 图标（实心方块 + 横线） */
const CB_IND = "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10H7v-2h10v2z";
const RB_OFF = "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z";
const RB_ON = "M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zm0-5C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z";
const ICON_ARROW_DROP = "M7 10l5 5 5-5z";
const ICON_CLOSE = "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z";

/** MUI 图标 SVG 复刻（evenodd：填充 checkbox 的对勾镂空/单选的中心点） */
function svgIcon(path: string, size: number, color: string, cls = ""): string {
  return `<svg${cls ? ` class="${cls}"` : ""} viewBox="0 0 24 24" width="${size}" height="${size}" fill="${color}" aria-hidden="true" style="display:block"><path fill-rule="evenodd" d="${path}"/></svg>`;
}

/**
 * 靠 CSS 类规则切换显隐的图标（勾选/未勾选、选中/未选中）。
 * **绝不能带 inline display**：svgIcon 的 `style="display:block"` 优先级高于任何非 !important
 * 的样式表声明，会压掉 `.ic-on{display:none}` → 两个图标同时可见、点击无视觉变化
 * （表现得像"复选框/单选坏了"，实际是 CSS 级联被 inline 压制）。
 * 图标容器本身是 flex，svg 会被 blockify，不需要 display:block。
 */
function toggleIcon(path: string, size: number, color: string, cls: string): string {
  return `<svg class="${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="${color}" aria-hidden="true"><path fill-rule="evenodd" d="${path}"/></svg>`;
}

/**
 * 生成表单容器内的子控件（发布端）。
 * 对齐画布 EditorCanvasComponent：子控件以“绝对定位叠加”渲染在容器之上，
 * 位置/尺寸取子组件自身 transform（x/y 为相对容器设计盒的坐标），
 * 与 grid/columns/box/auth-guard 等容器走同一 generateChildHTML 语义。
 * borderInset：编辑区子控件以容器外缘为原点，发布端 absolute 原点是 form 的
 * padding box（边框内缩 1px），需减去边框宽度补偿，保证像素级对齐。
 */
function formChildCellHTML(child: SceneComponent, ctx: CodegenContext, borderInset = 0): string {
  const codegenFn = getCodegen(child.type);
  if (!codegenFn) return "";
  const tf = child.transform ?? { x: 0, y: 0, width: 200, height: 40, rotation: 0, scale: { x: 1, y: 1 } };
  const x = Math.round(Number(tf.x ?? 0)) - borderInset;
  const y = Math.round(Number(tf.y ?? 0)) - borderInset;
  const w = Math.round(Number(tf.width ?? 200));
  const h = Math.round(Number(tf.height ?? 40));
  const inner = codegenFn(child, ctx);
  const posStyles = [`left:${x}px`, `top:${y}px`, `width:${w}px`, `height:${h}px`];
  const rotation = Number(tf.rotation ?? 0);
  if (rotation) posStyles.push(`transform:rotate(${rotation}deg)`);
  if (child.zIndex) posStyles.push(`z-index:${child.zIndex}`);
  if (child.visible === false) posStyles.push("display:none");
  return `<div data-component-id="${child.id}" data-component-type="${child.type}" data-form-field="1" style="position:absolute;${posStyles.join(";")};pointer-events:auto">${inner}</div>`;
}

/** 生成表单控件 name="..." 属性：优先 fieldName，否则按 label 生成（中英文/数字保留，空白符号转 _）。 */
// 导出：基础开关（switch）合并表单能力后共用同一命名口径，禁止第二份实现
export function fieldNameAttr(c: Record<string, unknown>, fallback?: string): string {
  const raw = String(c.fieldName ?? "").trim() || String(c.label ?? "").trim() || fallback || "field";
  const slug = raw
    .replace(/\s+/g, "_")
    .replace(/[^\p{L}\p{N}_\-]/gu, "_")
    .replace(/^_+|_+$/g, "") || "field";
  return `name="${escapeHTML(slug)}"`;
}

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

/**
 * form-textarea 组件 → HTML（对齐编辑区 FormTextareaRenderer 实测）
 * 编辑区：内置标签时 TextField flex:0 0 auto（自然高度=rows×行高+33）垂直居中于设计盒，
 * 顶部标签时 flex:1 填满剩余高度；内边距 16.5 14 在 root 上，边框为 box-shadow inset 环。
 * 发布端等价结构：包装层（内边距+inset 环+圆角+背景）内放自然高度 textarea（内边距0）；
 * 内置悬浮标签改为左上角实色徽章（背景色/圆角/字号可调），底色盖住边框线段形成干净缺口。
 */
export const formTextareaCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config;
  // 字段型「文字随框缩放」（第 11 轮）：字号与标签字号按「框 / defaultSize」倍率编译期缩放，
  // 开关关闭时 factor=1 逐字零回归。派生量（图标宽、行高）自动跟随。
  const fitF = fieldScaleFactor("form-textarea", component.transform.width, component.transform.height, c.scaleFit === true);
  const placement = String(c.labelPlacement ?? "inside");
  const label = String(c.label ?? "");
  const fontSize = (Number(c.fontSize ?? 14) || 14) * fitF;
  const bgColor = String(c.bgColor ?? "#ffffff");
  const textColor = String(c.textColor ?? "#333333");
  const borderColor = String(c.borderColor ?? "#d0d0d8");
  const focusColor = String(c.focusBorderColor ?? "#1976d2");
  const uid = "fta-" + Math.random().toString(36).slice(2, 9);
  const va = validationHTML(c);

  const hasFloat = placement === "inside" && !!label;
  const fontWeight = String(c.fontWeight ?? "normal").trim() || "normal";
  // 标签样式（与 form-input 徽章方案对齐）：颜色/字号/背景色/圆角/间距
  const labelColor = String(c.labelColor ?? "").trim();
  const labelFontSize = (Number(c.labelFontSize) > 0 ? Number(c.labelFontSize) : 0) * fitF;
  const labelBgColor = String(c.labelBgColor ?? "").trim();
  const labelBgColorCss = labelBgColor || bgColor;
  const labelRadius = Number(c.labelRadius) >= 0 ? Number(c.labelRadius) : 4;
  const labelGap = Number(c.labelGap) >= 0 ? Number(c.labelGap) : 4;
  const labelColorCss = labelColor || textColor;
  const labelLeft = 14; // 文本域左内距固定 14，徽章对齐文字起点
  const helperText = String(c.helperText ?? "").trim();
  // 内置标签：垂直居中（编辑区 justifyContent:center + 自然高度）；顶部标签：顶部对齐 + 填满剩余
  const wrapperStyles = [
    "width: 100%",
    "height: 100%",
    "display: flex",
    "flex-direction: column",
    `justify-content: ${hasFloat ? "center" : "flex-start"}`,
    `font-family: ${MUI_FONT}`,
  ];

  let html = `<div style="${wrapperStyles.join("; ")}"${va.attr}>`;

  if (placement === "top" && label) {
    html += `<label style="font-size:${labelFontSize || fontSize}px;line-height:1.2;color:${labelColorCss};margin-bottom:${labelGap}px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;user-select:none">${escapeHTML(label)}${c.required ? " *" : ""}</label>`;
  }

  const rows = c.rows ?? 4;
  const value = c.value ? escapeHTML(String(c.value)) : "";
  const ph = c.placeholder ? escapeHTML(String(c.placeholder)) : "";
  // 悬浮标签文本域：占位常驻（编辑区空态/聚焦态均显示提示信息）；无悬浮标签时占位仅在有值时出现
  const placeholderAttr = hasFloat
    ? ` placeholder="${ph || " "}"`
    : (ph ? ` placeholder="${ph}"` : "");
  const requiredAttr = c.required ? " required" : "";
  const disabledAttr = c.disabled ? " disabled" : "";
  const idAttr = ` id="${uid}"`;

  // 包装层 = MUI root：内边距/环/圆角/背景都在这层；textarea 本体透明无边框自然高度
  const wrapStyles = [
    "position: relative",
    "width: 100%",
    "box-sizing: border-box",
    `background: ${bgColor}`,
    `border-radius: ${sxRadius(c.borderRadius)}`,
    "padding: 16.5px 14px",
    // 悬浮/顶部模式均撑满设计盒高度，textarea 用 height:100% 跟随盒子（与编辑器一致；缩放盒子即缩放文本域）
    "flex: 1 1 0%",
    "min-height: 0",
    ...(c.disabled ? ["opacity: .6", "cursor: not-allowed"] : []),
  ];
  const taStyles = [
    "width: 100%",
    "height: 100%",
    "display: block",
    "box-sizing: border-box",
    "background: transparent",
    `color: ${textColor}`,
    "border: none",
    "outline: none",
    "resize: none",
    "padding: 0",
    `font-family: ${MUI_FONT}`,
    `font-size: ${fontSize}px`,
    `font-weight: ${fontWeight}`,
    "line-height: 1.4375",
  ];

  const textarea = `<textarea rows="${rows}"${idAttr} ${fieldNameAttr(c, "textarea")}${placeholderAttr}${requiredAttr}${disabledAttr} style="${taStyles.join("; ")}">${value}</textarea>`;

  const liveScript = liveValidateScript(uid, va.hasRules, ctx);

  // 悬浮标签：左上角徽章（带背景、圆角、可调字号），底色盖住边框线段→干净缺口、文字不被边框遮挡；标签常驻左上角
  const floatingLabel = hasFloat
    ? `<label class="fta-flabel" style="position:absolute;left:${labelLeft}px;font-size:${labelFontSize || fontSize}px;line-height:1.2;color:${labelColorCss};background:${labelBgColorCss};border-radius:${labelRadius}px;padding:0 4px;pointer-events:none;z-index:2;white-space:nowrap;user-select:none">${escapeHTML(label)}${reqTail(c.required)}</label>`
    : "";
  // 边框走 box-shadow inset 实线（编辑区一致）；data-ring 供校验运行时改错误色；悬浮徽章底色盖住左上角边框线段
  const floatCss =
    `<style>` +
    `.${uid}{box-shadow:inset 0 0 0 1px ${borderColor};transition:box-shadow .2s ${EASE}}` +
    `.${uid}:focus-within{box-shadow:inset 0 0 0 2px ${focusColor}}` +
    `.${uid} .fta-flabel{color:${labelColorCss};top:0;transform:translateY(-50%);transform-origin:left center;transition:color .2s ${EASE}}` +
    `.${uid} textarea::placeholder{color:${textColor};opacity:.5}` +
    `.${uid} textarea:not(:placeholder-shown) ~ .fta-flabel{color:${FILLED_LABEL_COLOR}}` +
    `.${uid} textarea:focus ~ .fta-flabel{color:${FOCUS_LABEL_COLOR}}` +
    `.${uid} textarea:disabled{cursor:not-allowed}` +
    `</style>`;

  // 帮助文字：输入框下方常驻说明，校验出错时让位于错误提示（errEl 显示则隐藏 helper）
  const helperLine = helperText
    ? `<span class="fc-help" id="${uid}h" style="flex-shrink:0;font-size:12px;line-height:1.4;margin-top:3px;color:${labelColor || "#8a8f98"};user-select:none;display:${va.hasRules ? "none" : "block"}">${escapeHTML(helperText)}</span>`
    : "";
  const helperScript = helperText && va.hasRules
    ? `<script>;(function(){var d=document.getElementById('${uid}');var h=document.getElementById('${uid}h');if(!d||!h)return;var box=d.closest('[data-vrules]');function sync(){var e=box?box.querySelector('.fc-err'):null;h.style.display=(e&&e.style.display!=='none'&&e.textContent)?'none':'block';}d.addEventListener('input',sync);d.addEventListener('blur',sync);d.addEventListener('change',sync);sync();})();</script>`
    : "";

  html += `<div class="${uid}" data-ring="1"${va.hasRules ? ` data-bw="1"` : ""} style="${wrapStyles.join("; ")}">${textarea}${floatingLabel}</div>`;
  html += va.errEl;
  html += liveScript;
  html += helperLine;
  html += helperScript;
  html += floatCss;
  html += `</div>`;
  return html;
};

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

/**
 * form-container 组件 → HTML（表单容器，对齐编辑区 FormContainerRenderer）
 * 编辑区 Box sx 数字圆角 ×10、虚线边框、gap/字面 padding；按钮行 gap 8px、按钮 49%/100% 宽 ×40 高 ×20px 圆角。
 * 收集容器内所有带 name 的表单控件值，校验必填后提交到配置接口。
 */
export const formContainerCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config;

  const method = String(c.submitMethod ?? "POST").toUpperCase();
  const url = String(c.submitUrl ?? "").trim();
  const afterAction = String(c.afterAction ?? "none");
  const redirectUrl = String(c.redirectUrl ?? "").trim();
  const okMessage = String(c.okMessage ?? "提交成功").trim() || "提交成功";
  const errMessage = String(c.errMessage ?? "提交失败").trim() || "提交失败";
  const loadingHint = c.loadingHint !== false;
  // 认证三级：follow(跟随全局) / enabled(强制认证) / disabled(公开访问)。旧布尔配置兼容。
  const authRaw = c.authToken;
  const authVal = authRaw === true || authRaw === "enabled" ? "enabled"
    : authRaw === false || authRaw === "disabled" ? "disabled"
    : "follow";

  // 注入一次全局提交脚本（复用 __WCVALIDATE 校验运行时，避免逐字段重复规则逻辑）
  if (!ctx.pageScripts.some((s) => s.includes("__WCFORM__"))) {
    ensureValidator(ctx);
    ctx.pageScripts.push(`/*__WCFORM__*/window.WCFORM_SUBMIT=function(el){var o=JSON.parse(el.getAttribute('data-opts'));
var vs=el.querySelectorAll('[data-vrules]');var firstErr=null;
for(var i=0;i<vs.length;i++){var box=vs[i];if(window.__WCVALIDATE&&window.__WCVALIDATE(box)){if(!firstErr)firstErr=box;}}
if(firstErr){if(firstErr.scrollIntoView)firstErr.scrollIntoView({block:'center',behavior:'smooth'});var fe=firstErr.querySelector('input[name],select[name],textarea[name]');if(fe&&fe.focus)fe.focus();return false;}
if(!o.url){alert('表单未配置提交地址，请在编辑器中设置接口 URL');return false;}
var data={};var els=el.querySelectorAll('input[name],select[name],textarea[name]');for(var i=0;i<els.length;i++){var x=els[i];if(x.disabled)continue;if(x.type==='checkbox'){data[x.name]=x.checked;}else if(x.type==='radio'){if(x.checked)data[x.name]=x.value;}else{data[x.name]=x.value;}}
if(o.method==='GET'){var q=Object.keys(data).map(function(k){return encodeURIComponent(k)+'='+encodeURIComponent(data[k]==null?'':data[k]);}).join('&');var u=o.url+(o.url.indexOf('?')>=0?'&':'?')+q;window.open(u,'_self');return false;}
function makeHeaders(){var hdr={'Content-Type':'application/json'};var authMode=o.authMode;if(authMode==='disabled'){return hdr;}
var token=null;var tk=(typeof window.__wc_getToken==='function')?window.__wc_getToken():null;if(tk&&tk.value)token=tk.value;else if(window.__AUTH_TOKEN__)token=window.__AUTH_TOKEN__;
if(token){var h=(typeof window.__WC_TOKEN_HEADER!=='undefined'&&window.__WC_TOKEN_HEADER)?window.__WC_TOKEN_HEADER:'Authorization';var pfx=(typeof window.__WC_TOKEN_PREFIX!=='undefined')?window.__WC_TOKEN_PREFIX:'Bearer ';hdr[h]=pfx+token;}
return hdr;}
if(!o.btn)o.btn=el.querySelector('.fc-submit');if(!o.spin)o.spin=el.querySelector('.fc-spin');
if(o.btn)o.btn.disabled=true;if(o.spin)o.spin.style.display='inline-flex';
fetch(o.url,{method:'POST',headers:makeHeaders(),body:JSON.stringify(data)}).then(function(r){if(!r.ok)throw new Error('bad');return r.status===204?{}:r.json().catch(function(){return{};});}).then(function(resp){
if(o.afterAction==='redirect'&&o.redirectUrl){window.open(o.redirectUrl,'_self');}
else if(o.afterAction==='message'){if(o.okMessage)alert(o.okMessage);}
else if(o.afterAction==='writeVar'&&o.afterWriteVar){if(typeof window.__wc_setSceneVar==='function'){window.__wc_setSceneVar(o.afterWriteVar,resp);}else{window.__wc_sceneVars=(window.__wc_sceneVars||{});window.__wc_sceneVars[o.afterWriteVar]=resp;try{window.dispatchEvent(new CustomEvent('wc:sceneVar',{detail:{name:o.afterWriteVar,value:resp}}));}catch(e){}}}
else if(o.afterAction==='refresh'&&o.afterRefreshIds){var ids=o.afterRefreshIds.split(',');for(var i=0;i<ids.length;i++){var sid=ids[i].trim();if(!sid)continue;if(typeof window['wc_refresh_'+sid]==='function')window['wc_refresh_'+sid]();}}
else if(o.afterAction==='event'&&o.afterEventId){document.dispatchEvent(new CustomEvent('wc-event-'+o.afterEventId));}
}).catch(function(e){if(o.errMessage)alert(o.errMessage);}).finally(function(){if(o.btn)o.btn.disabled=false;if(o.spin)o.spin.style.display='none';});
return false;};`);
  }

  const afterWriteVar = String(c.afterWriteVar ?? "").trim();
  const afterRefreshIds = String(
    Array.isArray(c.afterRefreshSourceIds)
      ? c.afterRefreshSourceIds.join(",")
      : c.afterRefreshSourceIds ?? "",
  ).trim();
  const afterEventId = String(c.afterEventId ?? "").trim();

  const opts = {
    method: method || "POST", url,
    authMode: authVal,
    afterAction, redirectUrl, okMessage, errMessage,
    afterWriteVar, afterRefreshIds, afterEventId,
  };
  const optsJson = JSON.stringify(opts).replace(/</g, "\\u003c").replace(/'/g, "&#39;");

  const showHeader = c.showHeader === true;
  const title = String(c.title ?? "").trim();
  const subtitle = String(c.subtitle ?? "").trim();
  const showReset = c.showReset === true;
  const resetText = String(c.resetText ?? "重置").trim() || "重置";

  // 编辑区：bgEnabled/borderEnabled 默认开；圆角数字 ×10（默认 6→60px）；边框虚线
  // position:relative 是子控件绝对定位的基准（编辑区画布同样以容器设计盒为基准叠加子控件）
  const containerStyles = [
    "position: relative",
    "width: 100%", "height: 100%", "box-sizing: border-box",
    "display: flex", "flex-direction: column",
    `gap: ${Number(c.fieldGap ?? 10)}px`,
    `padding: ${Number(c.paddingY ?? 12)}px ${Number(c.paddingX ?? 16)}px`,
    `border-radius: ${sxRadius(c.borderRadius, 6)}`,
    "overflow: hidden",
  ];
  const borderEnabled = c.borderEnabled !== false;
  if (c.bgEnabled !== false) containerStyles.push(`background: ${String(c.bgColor ?? "rgba(255,255,255,0.04)")}`);
  if (borderEnabled) containerStyles.push(`border: 1px dashed ${String(c.borderColor ?? "#4c5b70")}`);

  // 子组件：优先按 parentId 归类（引擎已建 childrenByParent）；若场景仅以 children 引用
  // 子组件（未设 parentId），则回退按 component.children 从 componentMap 解析，保证不丢字段
  let children = ctx.childrenByParent?.get(component.id) ?? [];
  if (children.length === 0 && component.children?.length) {
    children =
      (component.children
        .map((id) => ctx.componentMap?.get(id))
        .filter((ch): ch is SceneComponent => Boolean(ch && ch.visible !== false)) ?? []);
  }
  children = children.filter((ch) => ch.visible !== false);
  // 编辑区子控件原点为容器外缘；发布端 absolute 原点为 padding box（边框内缩 1px），补偿
  const childrenHTML = children.map((ch) => formChildCellHTML(ch, ctx, borderEnabled ? 1 : 0)).join("\n");

  let html = `<form data-fc="${component.id}" data-opts='${optsJson}' onsubmit="return WCFORM_SUBMIT(this);" style="${containerStyles.join("; ")}">`;

  // 头部（标题 + 副标题，颜色对齐编辑区）
  if (showHeader && (title || subtitle)) {
    html += `<div style="flex-shrink:0;margin-bottom:-4px">`;
    if (title) html += `<div style="font-size:15px;font-weight:600;color:rgba(255,255,255,0.85);font-family:${MUI_FONT};user-select:none">${escapeHTML(title)}</div>`;
    if (subtitle) html += `<div style="font-size:11px;color:rgba(255,255,255,0.5);font-family:${MUI_FONT};margin-top:2.4px;user-select:none">${escapeHTML(subtitle)}</div>`;
    html += `</div>`;
  }

  // 字段区占位：编辑区恒有 flex:1 minHeight:40 的占位区把按钮行压到底部，
  // 真实子控件不进流式布局，改为绝对定位叠加（对齐画布渲染）
  html += `<div style="flex:1;min-height:40px;flex-shrink:1"></div>`;

  // 按钮行（提交 + 重置）：gap 8px；按钮 49%/100% 宽、40 高、20px 圆角（编辑区 borderRadius:2 ×10）
  if (c.showSubmit !== false || showReset) {
    const submitText = String(c.submitText ?? "提交").trim() || "提交";
    const widthMode = String(c.submitWidthMode ?? "full");
    const width = Number(c.submitWidth ?? 180);
    const alignMap: Record<string, string> = { left: "flex-start", center: "center", right: "flex-end" };
    const align = alignMap[String(c.submitAlign ?? "center")] ?? "center";
    const rowWidth = widthMode === "full" ? "width: 100%" : widthMode === "fixed" ? `width: ${Math.max(40, width)}px` : "width: auto";
    const both = showReset && c.showSubmit !== false;
    const btnW = both ? "49%" : "100%";
    const baseBtn = `flex-shrink:0;width:${btnW};height:40px;border-radius:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;font-family:${MUI_FONT};user-select:none`;

    let row = `<div style="display:flex;gap:8px;align-self:${align};${rowWidth};flex-shrink:0">`;
    if (showReset) {
      const variant = String(c.resetVariant ?? "outlined");
      const variantCss = variant === "contained"
        ? "border:none;background:rgba(120,130,150,0.5);color:#cfd6e3"
        : variant === "text"
          ? "border:none;background:transparent;color:#cfd6e3"
          : "border:1px solid rgba(180,180,190,0.4);background:transparent;color:#cfd6e3";
      row += `<button type="reset" style="${baseBtn};${variantCss}">${escapeHTML(resetText)}</button>`;
    }
    if (c.showSubmit !== false) {
      const spin = loadingHint ? `<span class="fc-spin" style="display:none;width:14px;height:14px;border:2px solid rgba(255,255,255,0.6);border-top-color:#fff;border-radius:50%;animation:wcspin .7s linear infinite;flex-shrink:0"></span>` : "";
      row += `<button type="submit" class="fc-submit" style="${baseBtn};gap:4px;border:none;background:${String(c.submitBgColor ?? "#1976d2")};color:${String(c.submitTextColor ?? "#ffffff")}">${spin}${escapeHTML(submitText)}</button>`;
    }
    row += `</div>`;
    html += row;
  }

  // 子控件绝对定位叠加在表单之上（DOM 置后 = 绘制在 chrome 之上，与画布一致）
  html += childrenHTML;

  html += `</form>`;
  return html;
};

/**
 * form-checkbox 组件 → HTML（MUI Checkbox 复刻：42px 控件盒 / 9px 内距 / 24px SVG / accent 色）
 * 校验：根节点挂 data-vrules（复用 __WCVALIDATE；复选框取值 勾选='on' / 未勾选=''），
 * 附 .fc-err 错误提示元素 + 实时绑定脚本，与 input/textarea/select 同源。
 * 注意：文字色必须由 CSS 类规则给（不能写 inline color）——运行时会 `label.style.color=''`
 * 清除内联色还原，若颜色本就写在 inline style 上会被一并抹掉导致掉色。
 * 故意不输出原生 required：隐藏 input 上的浏览器原生校验气泡会脱离可见控件位置，
 * 且会抢在 WCFORM_SUBMIT 之前拦截提交（原生气泡先于自定义 .fc-err），故只由 __WCVALIDATE 负责提示。
 * 本轮起套「外形 → 缩放舞台 → 缩放内层」三层（`scaleSkeleton`）：`data-vrules` 仍挂最外层，
 * `.fc-err` 仍在 data-vrules 子树内，故校验运行时契约不变；内层为自然尺寸盒，
 * 随拖动框等比缩放，系数与编辑区共用 `CHECKBOX_FIT`。
 */
export const formCheckboxCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config;
  const textColor = String(c.textColor ?? "#333333");
  const accent = String(c.accentColor ?? "#1976d2");
  const fontSize = Number(c.fontSize ?? 14) || 14;
  const label = String(c.label ?? "");
  const required = c.required === true;
  const helperText = String(c.helperText ?? "").trim();
  const leftLabel = String(c.labelPlacement ?? "right") === "left";
  const small = String(c.size ?? "medium") === "small";
  const boxSize = small ? 38 : 42;
  const iconSize = small ? 20 : 24;
  const uid = "fcb-" + Math.random().toString(36).slice(2, 9);
  const va = validationHTML(c);
  // 外壳与标签排版读唯一口径（编辑区渲染器同源）；未选中态颜色默认跟随强调色
  const shell = resolveToggleShell(c);
  const unchecked = resolveCheckboxUncheckedColor(c, accent);

  // 半选为静态状态（不随点击变化，与 MUI indeterminate 受控语义一致）：直接渲染横线图标
  const iconSpan = `<span style="width:${boxSize}px;height:${boxSize}px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">${
    c.indeterminate === true
      ? svgIcon(CB_IND, iconSize, accent)
      : toggleIcon(CB_ON, iconSize, accent, "ic-on") + toggleIcon(CB_OFF, iconSize, unchecked, "ic-off")
  }</span>`;

  const labelStyles = [
    "display:flex",
    "align-items:center",
    "user-select:none",
    `cursor:${c.disabled ? "not-allowed" : "pointer"}`,
  ];
  if (leftLabel) labelStyles.push("flex-direction:row-reverse", "justify-content:flex-end");

  const helperLine = helperText
    ? `<span class="fc-help" id="${uid}h" style="font-size:12px;line-height:1.4;margin-top:3px;color:#8a8f98;user-select:none;display:${va.hasRules ? "none" : "block"}">${escapeHTML(helperText)}</span>`
    : "";
  // 帮助文字在校验出错时让位于错误提示（与 input/textarea/select 同源脚本）
  const helperScript = helperText && va.hasRules
    ? `<script>;(function(){var d=document.getElementById('${uid}');var h=document.getElementById('${uid}h');if(!d||!h)return;var box=d.closest('[data-vrules]');function sync(){var e=box?box.querySelector('.fc-err'):null;h.style.display=(e&&e.style.display!=='none'&&e.textContent)?'none':'block';}d.addEventListener('input',sync);d.addEventListener('blur',sync);d.addEventListener('change',sync);sync();})();</script>`
    : "";
  // 文字色走类规则（运行时错误态会 label.style.color='' 还原，内联色会被一并抹掉）；
  // 图标显隐同样只能走类规则（toggleIcon 不带 inline display），基础态：未勾选=ic-off，勾选=ic-on
  const css = c.indeterminate === true
    ? `.${uid}{color:${textColor}}.${uid} input:disabled ~ *{opacity:.38}`
    : `.${uid}{color:${textColor}}.${uid} .ic-on{display:none}.${uid} .ic-off{display:block}.${uid} input:checked ~ * .ic-on{display:block}.${uid} input:checked ~ * .ic-off{display:none}.${uid} input:disabled ~ *{opacity:.38}`;

  let body = `<label class="${uid}" style="${labelStyles.join(";")}">`;
  body += `<input type="checkbox" id="${uid}" ${fieldNameAttr(c, "checkbox")}${c.checked ? " checked" : ""}${c.disabled ? " disabled" : ""} style="position:absolute;opacity:0;pointer-events:none">`;
  body += iconSpan;
  body += `<span style="font-size:${fontSize}px;line-height:1.5;white-space:nowrap;${cssText(toggleLabelTextCss(shell))}">${escapeHTML(label)}${required ? " *" : ""}</span>`;
  body += `</label>`;
  body += va.errEl;
  body += helperLine;
  body += `<style>${css}</style>`;

  const html =
    `<div style="${SCALE_OUTER_CSS}"${va.attr}>` +
    scaleSkeleton({
      uid,
      control: body,
      spec: CHECKBOX_FIT,
      align: stageAlignOf(c),
      vAlign: stageVAlignOf(c),
      // 自然尺寸盒：宽度由内容决定（不随拖动框拉伸），列方向让错误/帮助文字落在控件下方
      innerStyle: [cssText(toggleShellCss(shell)), "display:flex;flex-direction:column;align-items:flex-start"]
        .filter(Boolean)
        .join(";"),
      scaleFit: c.scaleFit !== false,
    }) +
    `</div>` +
    helperScript +
    liveValidateScript(uid, va.hasRules, ctx) +
    scaleSkeletonScript(uid, CHECKBOX_FIT, c.scaleFit !== false);
  return html;
};

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

/**
 * form-label 组件 → HTML
 *
 * 样式取值全部来自 `resolveLabelStyle`（与编辑区 FormLabelRenderer 同一份口径），
 * 含默认行高 1.4375（MUI FormLabel 约定）、字间距（0 则不输出）、星号色、垂直摆放。
 * - 刻意**不输出 `text-align`**：外层是 flex 容器，只有 `justify-content` 生效，前者是噪音。
 * - 刻意用 `<span>` 而非 `<label>`：本组件没有 `for` 也没有可关联的表单后代，
 *   用 `<label>` 会违反 HTML 规范并让辅助技术误判"标注了某个控件"。
 *   （radio 的组标签必须用 `<label>` 是因为校验运行时要 `querySelector('label')` 变色，
 *    本组件不参与校验，没有该需求。）
 * - 本轮起输出「外形 → 缩放舞台 → 缩放内层」三层（`scaleSkeleton`）：舞台按 align/vAlign
 *   摆放自然尺寸内容并供脚本量取尺寸，内层只被 transform 缩放 → 编辑区与发布页的
 *   「居中 + 随框等比缩放」由同一份 `fitFactor`/`LABEL_FIT` 决定。
 */
/**
 * form-label 组件 → HTML
 *
 * 结构（与编辑区渲染器逐层同构）：
 *   外形 outer（100%×100%·字体栈） → 缩放舞台 stage（按 align/vAlign 摆放）
 *     → 缩放内层 inner（内容自然尺寸 + **外观层**：底色/内边距/圆角/不透明度）
 *       → 文字 span（排版声明）→ 文字节点 span + 可选后缀 + 可选必填星号
 *
 * 三条口径都只读 `editor/data/labelStyle.ts`（`resolveLabelStyle` / `labelTextCss` /
 * `labelInnerCss`），编辑区展开的是同一份对象，产物里不再出现本文件自己写的样式字面量。
 *
 * **外观层刻意挂在内层**：只有被 `transform: scale()` 缩放的那一层，底色与内边距才会
 * 跟着拖动框一起等比放大缩小；挂到 outer 上就会出现「框变大、标签底色纹丝不动」。
 *
 * 动态文案：`dataMode=api`（或绑定全局数据源）时由统一取数骨架 `dataLoaderScript` 拉取，
 * 按 `apiTextField` 从响应取文字后写进文字节点。首屏先输出静态文案占位、数据到达再替换，
 * 与编辑区「数据未到达显示静态文案」一致。`authEnabled` 三态即认证/非认证接入的切换点。
 */
export const formLabelCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config as Record<string, unknown>;
  const s = resolveLabelStyle(c);
  const scaleFit = c.scaleFit !== false;
  const uid = "flb-" + Math.random().toString(36).slice(2, 9);

  // ── 数据源：绑定全局源时以全局源覆盖组件自带取数配置（与编辑端同一函数） ──
  const dsId = String(c.dataSourceId ?? "");
  const gds = ctx.globalDataSources as Record<string, unknown> | undefined;
  const boundSource = dsId && gds ? (gds[dsId] as Record<string, unknown>) : undefined;
  const eff: Record<string, unknown> = boundSource
    ? (resolveEffectiveDataConfig(c, boundSource) as Record<string, unknown>)
    : c;
  const isApi = String(eff.dataMode ?? "static") === "api" && Boolean(dsId || eff.apiUrl || eff.apiPath);
  const authEnabled =
    readAuthEnabled(eff.authEnabled);

  const spanStyles = cssText(labelTextCss(s));
  const reqStar = s.required
    ? `<span style="color:${s.errorColor};margin-left:2px">*</span>`
    : "";
  const suffixHTML = s.suffix ? `<span>${escapeHTML(s.suffix)}</span>` : "";
  // 文字节点单独包一层：接口数据到达时只替换这一层的 textContent（不会连带抹掉后缀与星号），
  // 且 textContent 赋值天然免疫注入，不需要转义。静态与接口两种模式结构完全一致。
  const control =
    `<span style="${spanStyles}">` +
    `<span id="${uid}v">${escapeHTML(s.text)}</span>` +
    suffixHTML +
    reqStar +
    `</span>`;

  const apiScript = isApi
    ? dataLoaderScript({
        container: `var el=document.getElementById('${uid}');`,
        apiUrl: String(eff.apiUrl ?? ""),
        apiPath: String(eff.apiPath ?? ""),
        apiMethod: String(eff.apiMethod ?? "GET"),
        apiHeaders:
          typeof eff.apiHeaders === "string" ? eff.apiHeaders : JSON.stringify(eff.apiHeaders ?? {}),
        apiBody: typeof eff.apiBody === "string" ? eff.apiBody : JSON.stringify(eff.apiBody ?? {}),
        apiInterval: Number(eff.apiInterval ?? 0) || 0,
        apiDataPath: String(eff.apiDataPath ?? ""),
        authEnabled,
        renderBody: [
          `var f=${JSON.stringify(String(eff.apiTextField ?? c.apiTextField ?? ""))};`,
          `var keys=f?[f]:['text','label','name','value','title'];`,
          `var out='';`,
          `if(typeof data==='string'||typeof data==='number'||typeof data==='boolean'){out=String(data);}`,
          `else if(data&&typeof data==='object'){`,
          `  for(var i=0;i<keys.length;i++){`,
          `    var x=keys[i].split('.').reduce(function(a,k){return a==null?undefined:a[k];},data);`,
          `    if(x!==undefined&&x!==null&&x!==''){out=String(x);break;}`,
          `  }`,
          `}`,
          // 取不到值就保留首屏的静态文案占位，而不是把标签清空
          `var v=document.getElementById('${uid}v');if(v&&out)v.textContent=out;`,
        ].join("\n"),
      })
    : "";

  return (
    `<div id="${uid}" style="${SCALE_OUTER_CSS}">` +
    scaleSkeleton({
      uid,
      control,
      spec: LABEL_FIT,
      align: s.align,
      vAlign: s.vAlign,
      // 自然尺寸盒：宽度由内容决定（换行会让缩放基准随框宽漂移）+ 外观层
      innerStyle: cssText(labelInnerCss(s)),
      scaleFit,
    }) +
    `</div>` +
    scaleSkeletonScript(uid, LABEL_FIT, scaleFit) +
    apiScript
  );
};

/**
 * form-switch 组件 → HTML（MUI Switch 复刻：58×38 盒 / 34×14 轨道 r7 / 20px 滑块；
 * 关：轨道 #fff×.3 + 滑块 #E0E0E0；开：轨道 accent×.5 + 滑块 accent，左移 20px）
 *
 * 与复选框同族：取值为枚举（开/关），故校验只暴露「错误提示 + 错误颜色」
 * （choiceValidationSchema 的口径），且**不输出原生 required**——隐藏 input 上的
 * 浏览器原生气泡会脱离可见控件位置，并抢在 WCFORM_SUBMIT 之前拦截提交。
 * 状态属性（track 的 background/opacity、thumb 的 left/background）**只能由类规则给**：
 * 写成 inline 会压掉 `.${uid} input:checked ~ .sw …` 选中态规则（inline 优先级更高）。
 */
export const formSwitchCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config;
  const s = resolveFieldStyle(c);
  const accent = String(c.accentColor ?? "#1976d2");
  const small = String(c.size ?? "medium") === "small";
  // 几何按 MUI Switch 实测：轨道在盒内居中，滑块（比轨道高 6px）垂直居中于轨道中线；
  // 滑块行程 = 滑块直径（MUI `translateX(thumbSize)` 约定）。中号 = 58×38 盒 / 34×14 轨道 / 20px 滑块
  // → 关 left 9、开 left 29，与既有产物完全一致（勿凭"居中于轨道"重算，会与 MUI 观感不符）。
  const boxW = small ? 40 : 58;
  const boxH = small ? 32 : 38;
  const trackW = small ? 26 : 34;
  const trackH = small ? 12 : 14;
  const thumbSize = small ? 16 : 20;
  const thumbOff = (boxW - trackW) / 2 - (thumbSize - trackH) / 2;
  const thumbOn = thumbOff + thumbSize;
  const leftLabel = String(c.labelPlacement ?? "right") === "left";
  const uid = "fsw-" + Math.random().toString(36).slice(2, 9);
  const va = validationHTML(c);
  // 外壳（底色/边框/内边距/圆角/不透明度）与标签排版、轨道配色全部读唯一口径
  // `editor/data/toggleStyle.ts` —— 编辑区渲染器同源，任何一处改字段都不必手抄第二遍。
  const shell = resolveToggleShell(c);
  const skin = resolveSwitchSkin(c);

  // 标签容器：labelPlacement=left 用 row-reverse 换向。
  // 不写 inline color：__WCVALIDATE 出错时会 label.style.color='' 还原，内联色会被一并抹掉 → 掉色。
  const labelStyles = [
    "display:flex", "align-items:center", "user-select:none",
    `cursor:${s.disabled ? "not-allowed" : "pointer"}`,
    ...(leftLabel ? ["flex-direction:row-reverse", "justify-content:flex-end"] : []),
  ];

  let inner = `<label class="${uid}" style="${labelStyles.join(";")}">`;
  inner += `<input type="checkbox" id="${uid}" ${fieldNameAttr(c, "switch")}${c.checked ? " checked" : ""}${s.disabled ? " disabled" : ""} style="position:absolute;opacity:0;pointer-events:none">`;
  inner += `<span class="sw" style="position:relative;width:${boxW}px;height:${boxH}px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">`;
  // 状态要变的属性（track 的 background/opacity、thumb 的 left/background）**只能由类规则给**：
  // 写成 inline 会压掉 `.${uid} input:checked ~ .sw …` 的选中态规则（inline 优先级更高）→ 点击无视觉变化
  inner += `<span class="sw-track" style="width:${trackW}px;height:${trackH}px;border-radius:${trackH / 2}px;transition:background .2s ${EASE},opacity .2s ${EASE}"></span>`;
  inner += `<span class="sw-thumb" style="position:absolute;top:${(boxH - thumbSize) / 2}px;width:${thumbSize}px;height:${thumbSize}px;border-radius:50%;transition:left .2s ${EASE},background .2s ${EASE}"></span>`;
  inner += `</span>`;
  if (s.label) {
    inner += `<span style="font-size:${s.fontSize}px;line-height:1.5;white-space:nowrap;${cssText(toggleLabelTextCss(shell))}">${escapeHTML(s.label)}${s.required ? " *" : ""}</span>`;
  }
  inner += `</label>`;

  const helperLine = s.helperText
    ? `<span class="fc-help" id="${uid}h" style="font-size:12px;line-height:1.4;margin-top:3px;color:${s.helperColor};user-select:none;display:${va.hasRules ? "none" : "block"}">${escapeHTML(s.helperText)}</span>`
    : "";

  const css =
    `.${uid}{color:${s.textColor}}` +
    `.${uid} .sw-track{background:${skin.trackOffColor};opacity:${skin.trackOffOpacity}}` +
    `.${uid} .sw-thumb{left:${thumbOff}px;background:${skin.thumbOffColor}}` +
    `.${uid} input:checked ~ .sw .sw-track{background:${accent};opacity:${skin.trackOnOpacity}}` +
    `.${uid} input:checked ~ .sw .sw-thumb{left:${thumbOn}px;background:${accent}}` +
    `.${uid} input:disabled ~ *{opacity:.38}`;

  return (
    `<div style="${SCALE_OUTER_CSS}"${va.attr}>` +
    scaleSkeleton({
      uid,
      control: inner + va.errEl + helperLine + `<style>${css}</style>`,
      spec: SWITCH_FIT,
      align: stageAlignOf(c),
      vAlign: stageVAlignOf(c),
      innerStyle: [cssText(toggleShellCss(shell)), "display:flex;flex-direction:column;align-items:flex-start"]
        .filter(Boolean)
        .join(";"),
      scaleFit: c.scaleFit !== false,
    }) +
    `</div>` +
    liveValidateScript(uid, va.hasRules, ctx) +
    helperYieldScript(uid, s.helperText, va.hasRules) +
    scaleSkeletonScript(uid, SWITCH_FIT, c.scaleFit !== false)
  );
};

/**
 * form-slider 组件 → HTML（MUI Slider 复刻：轨道 accent×.38 / 填充条 accent / 圆形滑块；
 * 原生 range 隐形覆盖承载交互与表单取值，JS 同步填充条与滑块位置、当前值文字与数值气泡）。
 *
 * 全部样式声明、尺寸档与百分比公式都只读 `editor/data/sliderStyle.ts`（编辑区渲染器同源）：
 * 本文件此前自己写了一份 `SLIDER_SIZES`、编辑区另写一份，两端一致靠人眼；
 * 且编辑区读不到 `labelColor`（发布端把它当辅助文字色）。收口后两端只读一份。
 *
 * 本轮新增：标签排版（字重/独立配色/独立字号）、轨道端点 min/max 数值、滑块上方数值气泡。
 * 滑块取值恒为数值且区间由 min/max 约束，故**不暴露必填/格式校验**（会配出必然通过或必然失败的规则）。
 */
export const formSliderCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config;
  const s0 = resolveSliderStyle(c);
  // 字段型「文字随框缩放」：只乘 fontSize/labelFontSize，不碰几何（与 input/select 同范式；
  // 端点/气泡的固定小字号保持，避免小尺寸档被放大失真）
  const fitF = fieldScaleFactor("form-slider",
    component.transform.width, component.transform.height, c.scaleFit === true);
  // staticData 显式存在时优先（全局静态数据源驱动，metric/progress 同款）；口径收敛见 progressData.ts
  const hasExplicitStaticData = c.staticData != null && c.staticData !== "";
  const staticNum = hasExplicitStaticData ? coerceProgressNumber(c.staticData) : null;
  const effValue = staticNum !== null
    ? Math.min(s0.max, Math.max(s0.min, staticNum))
    : s0.value;
  const effPct = s0.max > s0.min ? ((effValue - s0.min) / (s0.max - s0.min)) * 100 : 0;
  const s = {
    ...s0,
    field: { ...s0.field, fontSize: s0.field.fontSize * fitF },
    labelFontSize: s0.labelFontSize * fitF,
    value: effValue,
    pct: effPct,
  };
  const { min, max, step, value, pct, accent, size } = s;
  const disabled = s.field.disabled;
  const suffix = s.valueSuffix;
  const showValue = s.showValue;
  const uid = "fsl-" + Math.random().toString(36).slice(2, 9);
  const valueText = sliderValueText(s);

  let html = `<div class="${uid}" style="width:100%;height:100%;display:flex;flex-direction:column;justify-content:center;font-family:${MUI_FONT};font-size:${s.field.fontSize}px;color:${s.field.textColor}">`;
  if (s.field.label || showValue) {
    html += `<div style="${cssText(sliderLabelRowCss())}">`;
    html += `<span data-slider-label style="${cssText(sliderLabelCss(s))}">${escapeHTML(s.field.label)}${s.field.required ? " *" : ""}</span>`;
    html += showValue
      ? `<span data-slider-value style="${cssText(sliderValueCss(s))}">${escapeHTML(valueText)}</span>`
      : "";
    html += `</div>`;
  }
  html += `<div style="${cssText(sliderRowCss(s))}">`;
  if (s.valueBubble) {
    html += `<span data-slider-bubble style="${cssText(sliderBubbleCss(s))}">${escapeHTML(valueText)}</span>`;
  }
  html += `<div style="position:absolute;left:0;right:0;height:${size.track}px;border-radius:${size.track / 2 + 10}px;background:${accent};opacity:.38"></div>`;
  html += `<div data-slider-track style="position:absolute;left:0;width:${pct}%;height:${size.fill}px;border-radius:${size.fill / 2 + 10}px;background:${accent}"></div>`;
  // 拇指视觉层必须 pointer-events:none：它 z-index:2 盖在隐藏 range 之上，若收事件会吞掉
  // pointerdown，导致"抓滑块拖动"永远发起不了（只能点轨道空白处）。设为 none 后事件穿透到 input。
  html += `<div data-slider-thumb style="position:absolute;left:${sliderThumbLeft(pct, size.thumb)};width:${size.thumb}px;height:${size.thumb}px;border-radius:50%;background:${accent};z-index:2;transition:${SLIDER_PRESS_TRANSITION};pointer-events:none"></div>`;
  // 刻度层：与填充条/滑块/气泡共用同一百分比口径（sliderTicksOf），落在最后绘制以便压在轨道之上，
  // 但 z-index 缺省 < 滑块的 2，故不会盖住滑块；不吃指针事件（下层是隐形的原生 range）。
  if (s.showTicks) {
    html += `<div data-slider-ticks style="${cssText(sliderTickLayerCss(s))}">`;
    html += sliderTicksOf(s)
      .map((p) => `<span style="${cssText(sliderTickCss(s, p))}"></span>${
        s.showTickLabels
          ? `<span data-slider-tick-label style="${cssText(sliderTickLabelCss(s, p))}">${escapeHTML(sliderTickLabelText(s, p))}</span>`
          : ""
      }`)
      .join("");
    html += `</div>`;
  }
  // 交互：填充条 / 滑块 / 数值气泡 / 标签行数值四处同步（位移公式与初始渲染同一份）。
  //
  // ⚠️ 值后缀必须经 `escapeAttr` 转义后再进属性：`JSON.stringify("%")` 产出的是带**双引号**的
  // `"%"`，直接拼进 `oninput="…"` 会让属性在第一个 `"` 处提前闭合 —— 实测后果是
  // oninput 被截成 `var txt=this.value+`（语法错误，整个处理器失效）＋ 解析器把剩下的
  // 内容吞成 `%";var`、`lb` 两个垃圾属性，**拖动滑块时填充条/滑块/数值全都不动**。
  const suffixLiteral = escapeAttr(JSON.stringify(suffix));
  const onInput = [
    "var p=this.max>this.min?((this.value-this.min)/(this.max-this.min))*100:0;",
    `var txt=this.value+${suffixLiteral};`,
    "var r=this.parentElement;",
    "var t=r.querySelector('[data-slider-track]');if(t)t.style.width=p+'%';",
    `var th=r.querySelector('[data-slider-thumb]');if(th)th.style.left='calc('+p+'% - ${size.thumb / 2}px)';`,
    "var bo=r.querySelector('[data-slider-bubble]');if(bo){bo.style.left=p+'%';bo.textContent=txt;}",
    `var lb=this.closest('.${uid}').querySelector('[data-slider-value]');if(lb)lb.textContent=txt`,
  ].join("");

  // 按压反馈：状态类 `sl-pressing` 由指针事件切换（声明只进类规则层 —— 状态属性禁写 inline；
  // 与编辑区 MUI thumb 的 :active/.Mui-active 同源同值，口径在 sliderStyle.ts#sliderPressCssOf）。
  // disabled 时原生 range 不响应指针，不挂 handler、不注入规则。
  if (!disabled) {
    ctx.pageStyles.push(`.${uid}.sl-pressing [data-slider-thumb]{${cssText(sliderPressCssOf(s))}}`);
  }
  const pressOn = `var r=this.closest('.${uid}');r.classList.add('sl-pressing')`;
  const pressOff = `var r=this.closest('.${uid}');r.classList.remove('sl-pressing')`;
  const pressAttrs = disabled ? "" : ` onpointerdown="${pressOn}" onpointerup="${pressOff}" onpointercancel="${pressOff}" onblur="${pressOff}"`;
  // 原生 range 隐形覆盖承载交互与表单取值
  html += `<input type="range" id="${uid}" ${fieldNameAttr(c, "slider")} min="${min}" max="${max}" step="${step}" value="${value}"${disabled ? " disabled" : ""} style="position:absolute;top:0;left:0;width:100%;height:100%;margin:0;opacity:0;cursor:${disabled ? "default" : "pointer"}" oninput="${onInput}"${pressAttrs} />`;
  html += `</div>`;
  if (s.showMinMax) {
    html += `<span data-slider-endpoints style="${cssText(sliderEndpointCss())}"><span>${min}</span><span>${max}</span></span>`;
  }
  if (s.field.helperText) {
    html += `<span class="fc-help" id="${uid}h" style="flex-shrink:0;font-size:12px;line-height:1.4;margin-top:3px;color:${s.field.helperColor};user-select:none">${escapeHTML(s.field.helperText)}</span>`;
  }
  html += `</div>`;

  // ── 动态数据（与 metric/progress/switch 同一套键与语义；全局源绑定由引擎层
  //    withEffectiveConfig 覆盖 config，无需自理）。data-slider-* 部件本就常驻，
  //    这里只在动态模式追加运行时脚本：static 产物与历史逐字节一致。──
  const dataMode = String(c.dataMode ?? "static");
  const field = String(c.field ?? "");
  const apiUrl = String(c.apiUrl ?? "");
  const apiPath = String(c.apiPath ?? "");
  const isApi = dataMode === "api" && (apiUrl !== "" || apiPath !== "");
  let script = "";
  if (isApi || field) {
    script += `<script>
(function(){
  var el = document.querySelector('[data-component-id=${JSON.stringify(component.id)}]');
  var root = (el && el.querySelector('.${uid}')) || document.querySelector('.${uid}');
  if (!root || root.__wcSld) return;
  root.__wcSld = true;
  var input = root.querySelector('input[type=range]');
  var track = root.querySelector('[data-slider-track]');
  var thumb = root.querySelector('[data-slider-thumb]');
  var bubble = root.querySelector('[data-slider-bubble]');
  var val = root.querySelector('[data-slider-value]');
  var min = ${min}; var max = ${max}; var stepV = ${step};
  var suffix = ${JSON.stringify(s.valueSuffix)};
  // coerceNum 是 editor/data/progressData.ts#coerceProgressNumber 的手工镜像（运行时无法 import TS），两侧必须同步
  function coerceNum(v) {
    if (v == null) return null;
    if (typeof v === "object") { return coerceNum(v.value != null ? v.value : (v.percent != null ? v.percent : v.current)); }
    var n = typeof v === "number" ? v : parseFloat(v);
    return isNaN(n) ? null : n;
  }
  // ── 拖动竞态守卫：用户拖动中跳过回读（否则轮询把柄从手里拽走），松手后下一次轮询自动校正 ──
  var dragging = false;
  if (input) {
    input.addEventListener("pointerdown", function(){ dragging = true; });
    window.addEventListener("pointerup", function(){ dragging = false; });
  }
  function update(v) {
    if (dragging) return;
    var n = coerceNum(v);
    if (n === null) return;
    if (n < min) n = min;
    if (n > max) n = max;
    // 按 step 量化：api 返回 72.5 而 step=1 时，回显/柄位置必须与提交值对齐（防半格偏差）
    if (stepV > 0) { n = min + Math.round((n - min) / stepV) * stepV; n = Number(n.toFixed(6)); }
    var p = max > min ? (n - min) / (max - min) * 100 : 0;
    var txt = n + suffix;
    if (input) input.value = n;
    if (track) track.style.width = p + "%";
    if (thumb) thumb.style.left = "calc(" + p + "% - ${size.thumb / 2}px)";
    if (bubble) { bubble.style.left = p + "%"; bubble.textContent = txt; }
    if (val) val.textContent = txt;
  }
  ${field ? `el.addEventListener("data-update", function(e) {
    var d = e.detail || {};
    var v = d[${JSON.stringify(field)}] !== undefined ? d[${JSON.stringify(field)}] : d.value;
    if (v !== undefined) update(v);
  });` : ""}
  window["__wcSld_${uid}"] = update;
})();
</script>`;
  }
  if (isApi) {
    script += dataLoaderScript({
      container: `var el = document.querySelector('.${uid}');`,
      apiUrl,
      apiPath,
      apiMethod: String(c.apiMethod ?? "GET"),
      apiHeaders: String(c.apiHeaders ?? ""),
      apiBody: String(c.apiBody ?? ""),
      apiInterval: Number(c.apiInterval ?? 0) || 0,
      apiDataPath: String(c.apiDataPath ?? ""),
      authEnabled: readAuthEnabled(c.authEnabled),
      renderBody: `if (window["__wcSld_${uid}"]) window["__wcSld_${uid}"](data);`,
    });
  }
  return html + script;
};

/**
 * form-date / form-time 组件 → HTML（与 form-input/form-textarea/form-select 同系列）
 *
 * - 顶部标签或左上角悬浮徽章（fc-flabel）；边框环 borderWidth 可控、聚焦改色。
 * - 原生 date/time 控件会按背景明度输出 `color-scheme`：深色面板里若不声明，
 *   浏览器绘制的日历/时钟图标是黑图标压黑底 → 完全看不见。
 * - 原生 date/time **不支持 placeholder**，故用一层 .fc-ph 覆盖文字 + JS 同步 has-val
 *   类来复刻占位提示（空值显示、有值隐藏），使「占位文字」属性真正生效。
 * - `可选清空`：非空时显示 ×，点击清空并派发 input/change（复用现有校验/帮助文字脚本）。
 */
function datetimeInputCodegen(component: SceneComponent, ctx: CodegenContext, type: "date" | "time"): string {
  const c = component.config;
  // 字段型「文字随框缩放」：date/time 共用本函数，factor 按各自 defaultSize 求值
  const fitF = fieldScaleFactor(type === "date" ? "form-date" : "form-time",
    component.transform.width, component.transform.height, c.scaleFit === true);
  const s0 = resolveFieldStyle(c);
  const s = { ...s0, fontSize: s0.fontSize * fitF, labelFontSize: s0.labelFontSize * fitF };
  const va = validationHTML(c);
  const uid = (type === "date" ? "fd-" : "ft-") + Math.random().toString(36).slice(2, 9);
  const padX = 14;
  const clearable = c.clearable === true && !s.disabled;

  // ── 动态数据键（与 slider/switch 同套：dataMode/apiUrl/.../field/authEnabled）──
  //    全局源由引擎层 withEffectiveConfig 覆盖 config，无需自理。date/time 仅在动态
  //    模式追加运行时脚本，static 产物与历史逐字节一致。
  const dataMode = String(c.dataMode ?? "static");
  const field = String(c.field ?? "");
  const apiUrl = String(c.apiUrl ?? "");
  const apiPath = String(c.apiPath ?? "");
  const isApi = dataMode === "api" && (apiUrl !== "" || apiPath !== "");
  const dynamic = isApi || field;

  // staticData 显式存在时优先（全局静态数据源驱动，与 slider/metric/progress 同款口径）：
  // 引擎层 withEffectiveConfig 会把全局源的 staticData 并进 config；不可解析（非字符串/数字）
  // 则回退组件自带 value —— 与 coerceProgressNumber 返回 null → 回退 s0.value 同语义。
  const rawStatic = c.staticData;
  const sdStr = (typeof rawStatic === "string" || typeof rawStatic === "number") ? String(rawStatic) : "";
  const staticVal = sdStr !== "" ? sdStr : String(c.value ?? "");

  const extraAttrs: string[] = [];
  if (type === "date") {
    const minD = String(c.minDate ?? "").trim();
    const maxD = String(c.maxDate ?? "").trim();
    if (minD) extraAttrs.push(` min="${escapeHTML(minD)}"`);
    if (maxD) extraAttrs.push(` max="${escapeHTML(maxD)}"`);
  } else {
    const stepMin = Number(c.stepMinutes);
    if (Number.isFinite(stepMin) && stepMin > 0) extraAttrs.push(` step="${Math.round(stepMin * 60)}"`);
  }

  // 控件填满字段层（flex:1 + height:100%）→ 拖动缩放设计盒即等比放大/缩小；
  // 右侧预留清空按钮位置，避免文字与 × 叠字。
  // pointer-events:none + 透明触发器（select 同范式）：点击全部走触发器开自绘弹层，
  // 原生拾取器在所有引擎（含 WKWebView）都无从触发，杜绝"原生+自绘"两套弹层重复。
  const ctl = [
    "flex:1 1 auto", "min-width:0", "width:100%", "height:100%", "box-sizing:border-box",
    `background:${s.bgColor}`, `color:${s.textColor}`,
    "border:none", `border-radius:${s.radiusCss}`,
    `font-family:${MUI_FONT}`, `font-size:${s.fontSize}px`, `font-weight:${s.fontWeight}`,
    "line-height:1.4375",
    `padding:0 ${padX + (clearable ? 22 : 0)}px 0 ${padX}px`,
    "outline:none", "pointer-events:none",
  ];

  let control =
    `<input class="fc-ctl" type="${type}" id="${uid}" ${fieldNameAttr(c, type)}` +
    (staticVal ? ` value="${escapeHTML(staticVal)}"` : "") +
    `${s.required ? " required" : ""}${s.disabled ? " disabled" : ""}${extraAttrs.join("")} style="${ctl.join("; ")}" />`;

  // 占位覆盖层：原生 date/time 忽略 placeholder，故用绝对定位文字 + has-val 类切换
  if (s.placeholder) {
    control += `<span class="fc-ph" style="position:absolute;left:${padX}px;right:${padX}px;top:50%;transform:translateY(-50%);pointer-events:none;user-select:none;font-size:${s.fontSize}px;line-height:1.4375;color:${s.textColor};opacity:.5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHTML(s.placeholder)}</span>`;
  }
  if (clearable) {
    control += `<span id="${uid}c" class="fclear" style="position:absolute;right:${padX}px;top:50%;transform:translateY(-50%);cursor:pointer;display:none;z-index:3;user-select:none;color:rgba(120,130,150,0.8)">${svgIcon(ICON_CLOSE, 14, "currentColor")}</span>`;
  }
  // 透明触发器：接住整块点击/键盘开自绘弹层（z2 位于清空按钮 z3 之下）；input 本体不可点
  control += `<div id="${uid}-tg" tabindex="${s.disabled ? "-1" : "0"}" role="combobox" aria-haspopup="dialog" style="position:absolute;inset:0;z-index:2;cursor:${s.disabled ? "default" : "pointer"};outline:none"></div>`;

  const extraCss = [
    // 占位覆盖层：空值显示、有值由 JS 加 has-val 隐藏
    s.placeholder ? `.${uid}.has-val .fc-ph{display:none}` : "",
    // 原生指示器（时钟/日历图标）整体删除：拾取路径唯一走自绘弹层，避免新旧两套重复
    `.${uid} input::-webkit-calendar-picker-indicator{display:none}`,
    clearable ? `.${uid} .fclear:hover{color:${FILLED_LABEL_COLOR}}` : "",
  ].filter(Boolean).join("");

  // 「默认今天」仅当 无静态值（含 staticData）+ 未开动态 时生效，避免与动态/全局源打架
  // （站点一次性构建，写死会变成构建日；动态模式由接口/数据源驱动，本就不该预填今天）。
  const dtToday = type === "date" && c.defaultToToday === true && !staticVal.trim() && !dynamic;

  // 组合脚本：占位同步 + 清空 + 默认今天 + 动态回读，共享 update/up 作用域（避免两个 IIFE 隔离）。
  let script = "";
  if (s.placeholder || clearable || dtToday || dynamic) {
    script = `<script>;(function(){
      var i=document.getElementById('${uid}');if(!i)return;
      var w=i.parentElement,c=document.getElementById('${uid}c');
      var el=document.querySelector('[data-component-id=${JSON.stringify(component.id)}]');
      function up(){if(w)w.classList.toggle('has-val',!!i.value);if(c)c.style.display=i.value?'block':'none';}
      ${dtToday ? "if(true){var p=function(n){return(n<10?'0':'')+n;};var t=new Date();i.value=t.getFullYear()+'-'+p(t.getMonth()+1)+'-'+p(t.getDate());}" : ""}
      i.addEventListener('input',up);i.addEventListener('change',up);
      if(c)c.addEventListener('click',function(){i.value='';up();i.focus();i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}));});
      ${dynamic ? `
      function update(v){
        if(document.activeElement===i)return; // 不抢用户正在编辑的值
        var str=v==null?"":(typeof v==="object"?(v.value!=null?v.value:(v.date!=null?v.date:v.time)):String(v));
        i.value=str;up();
        i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}));
      }
      ${field ? `if(el)el.addEventListener("data-update",function(e){var d=e.detail||{};var v=d[${JSON.stringify(field)}] !== undefined ? d[${JSON.stringify(field)}] : d.value;if(v!==undefined)update(v);});` : ""}
      window["__wcDt_${uid}"]=update;` : ""}
      up();
    })();</script>`;
  }
  if (isApi) {
    script += dataLoaderScript({
      container: `var el = document.querySelector('.${uid}');`,
      apiUrl,
      apiPath,
      apiMethod: String(c.apiMethod ?? "GET"),
      apiHeaders: String(c.apiHeaders ?? ""),
      apiBody: String(c.apiBody ?? ""),
      apiInterval: Number(c.apiInterval ?? 0) || 0,
      apiDataPath: String(c.apiDataPath ?? ""),
      authEnabled: readAuthEnabled(c.authEnabled),
      renderBody: `if (window["__wcDt_${uid}"]) window["__wcDt_${uid}"](data);`,
    });
  }
  // 自绘拾取弹层（date/time 各一套，见 editor/data/timePickerPopup.ts 与 datePickerPopup.ts）：
  // 预览窗口 = Tauri WebviewWindow = WKWebView，无原生拾取器（Chrome 才有）→ 引擎无关的自绘弹层。
  return fieldShellHTML({ uid, s, va, ctx, control, extraCss }) + script + (type === "time" ? timePickerPopupScript(uid) : datePickerPopupScript(uid));
}

/** form-date 组件 → HTML（可选区间 min/max、占位提示、一键清空、实时校验） */
export const formDateCodegen: ComponentCodegenFn = (component, ctx) => {
  return datetimeInputCodegen(component, ctx, "date");
};

/** form-time 组件 → HTML（步长按分钟配置、占位提示、一键清空、实时校验） */
export const formTimeCodegen: ComponentCodegenFn = (component, ctx) => {
  return datetimeInputCodegen(component, ctx, "time");
};

/**
 * form-file 组件 → HTML（对齐编辑区 FormFileRenderer：虚线拖放区 + 文件列表 + 限制提示）
 *
 * - **真正可拖拽且可靠回填**：drop 时过 `ffPickFiles` 口径（accept/multiple/数量/大小），
 *   再用 `new DataTransfer()` 重建 FileList 写回 input —— 旧写法 `i.files=e.dataTransfer.files`
 *   直接赋值在 WKWebView/Safari（预览窗口引擎）不可靠且失败被静默吞。
 * - **两条路径同口径**：原生弹窗只认 accept，大小/数量限制由 change 监听再过滤一次。
 * - 文件列表：逐条显示文件名 + 大小 + 单个删除（× 重建 FileList）；拒绝的文件给红字提示。
 * - **键盘可达**：input 用视觉隐藏（clip）而非 display:none，可 Tab 聚焦、Enter/Space
 *   触发原生选择；`:focus-within` 高亮拖放区（状态规则走 CSS，不写 inline）。
 * - 过滤/回填/格式化/提示文案全部来自 `editor/data/fileField.ts`（两端同源，toString 内联）。
 */
export const formFileCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config;
  const fitF = fieldScaleFactor("form-file", component.transform.width, component.transform.height, c.scaleFit === true);
  // 标签口径：form-file 是大块面拖放区，「外部上方」会把框压到盒底、内容离顶边过远
  // （用户实测反馈）。非 "none" 一律归一为悬浮徽章（骑在虚线框上沿，与表单族 fc-flabel 同款），
  // 虚线框占满整个组件盒，图标+文字相对四边真正居中。旧存档的 "top" 同样归一。
  const placement = String(c.labelPlacement ?? "top") === "none" ? "none" : "inside";
  const s0 = resolveFieldStyle({ ...c, labelPlacement: placement }, { bgColor: "#f5f5f5", radius: 8 });
  const s = { ...s0, fontSize: s0.fontSize * fitF, labelFontSize: s0.labelFontSize * fitF };
  const va = validationHTML(c);
  const uid = "ff-" + Math.random().toString(36).slice(2, 9);
  const acceptAttr = c.accept ? ` accept="${escapeHTML(String(c.accept))}"` : "";
  const multipleAttr = c.multiple ? " multiple" : "";
  const accept = String(c.accept ?? "");
  const multiple = c.multiple === true;
  const maxCount = Math.max(0, Math.floor(Number(c.maxCount) || 0));
  const maxFileSizeMB = Math.max(0, Number(c.maxFileSize) || 0);
  const errColor = String(c.errorColor ?? "").trim() || "#f44336";
  const placeholder = s.placeholder || "点击或拖拽文件到此处";
  const zonePad = 12;
  const fileFont = Math.max(11, s.fontSize - 2);
  // 拖放区是大块面：圆角按像素生效并封顶 24（不吃输入条的 ×10 口径，8→80px 会变胶囊/按钮观感）
  const zoneRadius = ffZoneRadius(c.borderRadius);
  const itemRadius = Math.min(zoneRadius, 6);

  const zoneStyles = [
    "flex:1", "min-height:0", "min-width:0", "position:relative",
    "display:flex", "flex-direction:column", "align-items:center", "justify-content:center", "gap:6px",
    `border:1px dashed ${s.borderColor}`, `border-radius:${zoneRadius}px`, `background:${s.bgColor}`,
    `cursor:${s.disabled ? "not-allowed" : "pointer"}`, "box-sizing:border-box",
    `padding:${zonePad}px`, `transition:border-color .2s ${EASE},background .2s ${EASE}`,
  ];

  // 视觉隐藏（clip）而非 display:none：保留焦点能力 → Tab 可达、Enter/Space 原生选择
  const hiddenInput =
    "position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;" +
    "clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0";

  let control = `<label class="fzone" style="${zoneStyles.join(";")}">`;
  control += `<input class="fc-ctl" type="file" id="${uid}" ${fieldNameAttr(c, "file")} style="${hiddenInput}"${acceptAttr}${multipleAttr}${s.required ? " required" : ""}${s.disabled ? " disabled" : ""} tabindex="${s.disabled ? -1 : 0}" />`;
  control += ffZoneIconSvg(Math.round(s.fontSize * 1.6), s.disabled ? s.borderColor : s.textColor);
  control += `<span style="min-width:64px;font-size:${s.fontSize}px;color:${s.textColor};opacity:.75;font-weight:500;line-height:1.75;text-align:center;user-select:none">${escapeHTML(placeholder)}</span>`;
  control += `</label>`;
  control += `<div class="ff-list" id="${uid}l" style="flex:0 1 auto;min-height:0;max-height:60%;overflow-y:auto;margin-top:4px;display:flex;flex-direction:column;gap:2px"></div>`;
  control += `<div class="ff-err" id="${uid}e" style="display:none;color:${errColor};font-size:12px;line-height:1.4;margin-top:3px;user-select:none"></div>`;

  const itemCss =
    `.${uid} .ff-item{display:flex;align-items:center;gap:6px;min-width:0;padding:2px 6px;` +
    `background:${s.bgColor};border:1px solid ${s.borderColor};border-radius:${itemRadius}px;` +
    `font-size:${fileFont}px;color:${s.textColor};line-height:1.5}` +
    `.${uid} .ff-file{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}` +
    `.${uid} .ff-size{flex-shrink:0;opacity:.6;font-size:11px}` +
    `.${uid} .ff-del{flex-shrink:0;width:18px;height:18px;line-height:16px;text-align:center;padding:0;` +
    `border:none;background:transparent;color:${s.textColor};opacity:.55;cursor:pointer;font-size:14px;border-radius:50%}` +
    `.${uid} .ff-del:hover{opacity:1;background:rgba(0,0,0,.08)}` +
    `.${uid} .ff-del:focus-visible{outline:1px solid ${s.focusBorderColor}}`;

  const extraCss =
    `.${uid} .fzone:hover{border-color:${s.disabled ? s.borderColor : s.focusBorderColor}}` +
    `.${uid} .fzone:focus-within{border-color:${s.disabled ? s.borderColor : s.focusBorderColor}}` +
    `.${uid} .fzone.fdrag{border-color:${s.focusBorderColor};background:${s.bgColor};box-shadow:inset 0 0 0 2px ${s.focusBorderColor}}` +
    `.${uid}.has-val .fzone{border-style:solid}` +
    itemCss;

  return (
    fieldShellHTML({ uid, s, va, ctx, control, extraCss, ring: false, fieldStyle: "flex-direction:column;" }) +
    fileFieldScript(uid, { accept, multiple, maxCount, maxFileSizeMB })
  );
};

/**
 * form-number 组件 → HTML（对齐编辑区 FormNumberRenderer）
 *
 * - 步进按钮位置可配：`both`（两侧，默认）/ `right`（右侧竖排加减，常见于电商数量选择）。
 * - `小数位` precision：0 = 整数（步进按整数吸附），>0 按位数四舍五入；写入值时按位格式化。
 * - 步进逻辑与边界禁用、实时校验、帮助文字与其它表单控件同源。
 */
export const formNumberCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config;
  const fitF = fieldScaleFactor("form-number", component.transform.width, component.transform.height, c.scaleFit === true);
  const s0 = resolveFieldStyle(c);
  const s = { ...s0, fontSize: s0.fontSize * fitF, labelFontSize: s0.labelFontSize * fitF };
  const va = validationHTML(c);
  const accent = String(c.accentColor ?? "#1976d2");
  const uid = "fn-" + Math.random().toString(36).slice(2, 9);
  const precision = Math.max(0, Math.min(10, Number(c.precision ?? 0) || 0));
  const placement = String(c.buttonPlacement ?? "both") === "right" ? "right" : "both";
  const padX = 12;

  const min = c.min !== undefined && c.min !== "" ? Number(c.min) : null;
  const max = c.max !== undefined && c.max !== "" ? Number(c.max) : null;
  const step = c.step !== undefined && c.step !== "" ? Number(c.step) : 1;
  const attrs =
    (min !== null ? ` min="${min}"` : "") +
    (max !== null ? ` max="${max}"` : "") +
    ` step="${step}"` +
    (c.value !== undefined && c.value !== "" ? ` value="${escapeHTML(String(c.value))}"` : "") +
    (s.required ? " required" : "") +
    (s.disabled ? " disabled" : "");

  const btn = `flex-shrink:0;border:none;background:${accent};color:#ffffff;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;user-select:none;width:${placement === "right" ? 32 : 36}px`;
  const inp = [
    "flex:1 1 auto", "min-width:0", "height:100%", "border:none", "outline:none",
    "text-align:center", `background:${s.bgColor}`, `color:${s.textColor}`,
    `font-size:${s.fontSize}px`, `font-family:${MUI_FONT}`, `font-weight:${s.fontWeight}`,
    `padding:0 ${padX}px`,
  ].join(";");

  const decIcon = svgIcon(FN_MINUS_PATH, 20, "currentColor");
  const incIcon = svgIcon(FN_PLUS_PATH, 20, "currentColor");
  const buttons = s.disabled ? " disabled" : "";

  let control =
    `<div style="flex:1;min-height:0;display:flex;border-radius:${s.radiusCss};overflow:hidden;box-sizing:border-box;background:${s.bgColor}">`;
  if (placement === "both") {
    control += `<button type="button" data-num-dec style="${btn}"${buttons} aria-label="减少">${decIcon}</button>`;
  }
  control += `<input class="fc-ctl" type="number" id="${uid}" ${fieldNameAttr(c, "number")}${attrs} inputmode="decimal" style="${inp}" aria-label="${escapeHTML(s.label || "数字")}" />`;
  if (placement === "both") {
    control += `<button type="button" data-num-inc style="${btn}"${buttons} aria-label="增加">${incIcon}</button>`;
  } else {
    control += `<span style="display:flex;flex-direction:column;flex-shrink:0;border-left:${s.borderWidth}px solid ${s.borderColor}">`;
    control += `<button type="button" data-num-inc style="${btn};height:50%;border-bottom:1px solid rgba(0,0,0,.12)"${buttons} aria-label="增加">${incIcon}</button>`;
    control += `<button type="button" data-num-dec style="${btn};height:50%"${buttons} aria-label="减少">${decIcon}</button>`;
    control += `</span>`;
  }
  control += `</div>`;

  // P0-1：隐藏 Safari/WKWebView 原生数字 spinner（原生上下箭头与自绘按钮重叠）
  const extraCss =
    `.${uid} button:disabled{opacity:.4;cursor:default}` +
    `.${uid} input[type=number]{-moz-appearance:textfield}` +
    `.${uid} input[type=number]::-webkit-inner-spin-button,.${uid} input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}`;

  const script = formNumberScript(uid, {
    min,
    max,
    step,
    precision,
    disabled: s.disabled,
  });

  return fieldShellHTML({ uid, s, va, ctx, control, extraCss }) + script;
};
