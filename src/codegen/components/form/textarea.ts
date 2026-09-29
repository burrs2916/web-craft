import { MUI_FONT } from "../../../editor/data/fieldStyle";
import { fieldScaleFactor } from "../../../editor/data/scaleFit";
import { EASE, FILLED_LABEL_COLOR, FOCUS_LABEL_COLOR, liveValidateScript, reqTail, validationHTML } from "../../fieldChrome";
import { escapeHTML } from "../../layout";
import type { ComponentCodegenFn } from "../../types";
import { fieldNameAttr, sxRadius } from "./shared";



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
