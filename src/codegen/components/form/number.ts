import { MUI_FONT, resolveFieldStyle } from "../../../editor/data/fieldStyle";
import { FN_MINUS_PATH, FN_PLUS_PATH, formNumberScript } from "../../../editor/data/numberField";
import { fieldScaleFactor } from "../../../editor/data/scaleFit";
import { fieldShellHTML, validationHTML } from "../../fieldChrome";
import { escapeHTML } from "../../layout";
import type { ComponentCodegenFn } from "../../types";
import { fieldNameAttr, svgIcon } from "./shared";



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
