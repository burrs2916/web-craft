import { readAuthEnabled } from "../../../editor/data/authMode";
import { datePickerPopupScript } from "../../../editor/data/datePickerPopup";
import { MUI_FONT, resolveFieldStyle } from "../../../editor/data/fieldStyle";
import { fieldScaleFactor } from "../../../editor/data/scaleFit";
import { timePickerPopupScript } from "../../../editor/data/timePickerPopup";
import { dataLoaderScript } from "../../dataLoader";
import { FILLED_LABEL_COLOR, fieldShellHTML, validationHTML } from "../../fieldChrome";
import { escapeHTML } from "../../layout";
import type { SceneComponent } from "../../../types/editor";
import type { CodegenContext, ComponentCodegenFn } from "../../types";
import { ICON_CLOSE, fieldNameAttr, svgIcon } from "./shared";



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
