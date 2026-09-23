import type { CodegenContext } from "./types";
import { escapeHTML } from "./layout";
import { MUI_FONT, type FieldStyle } from "../editor/data/fieldStyle";

/**
 * 表单字段级「外壳」的共享实现（发布端）：校验规则序列化 + 校验运行时 + 实时绑定脚本 +
 * 帮助文字让位脚本 + 统一外壳（顶部标签 / 悬浮徽章 / 边框环 / 提示文字）。
 *
 * 为什么要独立成模块（而不留在 form.ts 里）：
 * 除 form 组件族外，**级联选择之类的字段型控件**同样需要「标签 + 边框环 + 校验提示」这一整套，
 * 若各自再写一份，就会出现第二个、第三个既不同构又会漂移的版本——这正是本项目历史上
 * 「编辑区与发布不一致」问题的成因模式。抽到这里后，任何字段型控件（含非 form 前缀的）
 * 都只有一份外壳实现。
 *
 * 取值口径由 `editor/data/fieldStyle.ts` 的 `resolveFieldStyle` 提供（与编辑区渲染器同源）。
 */

/** 编辑区派生色（MUI v9 实测值，勿改） */
export const FOCUS_LABEL_COLOR = "#60A5FA";
export const FILLED_LABEL_COLOR = "#94A3B8";
export const ASTERISK_COLOR = "#FF7B72";
export const EASE = "cubic-bezier(0, 0, 0.2, 1)";

/** 悬浮标签必填星号：label 文本已含 " *"，MUI required 再追加红色 " *"（双星号，与编辑区一致） */
export function reqTail(required: unknown): string {
  return required === true ? ` *<span style="color:${ASTERISK_COLOR};font-size:.85em"> *</span>` : "";
}

/**
 * 生成控件级校验：data-vrules 装规则 JSON，附错误提示元素。
 * 规则类型：required / email / phone / number / regex（regex 额外存 rx 正则串）。
 * number 类型可追加区间 min/max（validateMin/validateMax，存 minVal/maxVal 边界值）。
 * errColor 用于定制错误边框与文案颜色，默认红色 #f44336。
 */
export function validationHTML(c: Record<string, unknown>): { attr: string; errEl: string; hasRules: boolean } {
  const required = c.required === true;
  const vtype = String(c.validateType ?? "none");
  const regex = String(c.validateRegex ?? "").trim();
  const msg = String(c.validateMessage ?? "").trim();
  const rules: Record<string, string | number> = {};
  const num = (v: unknown): number | null =>
    v === undefined || v === null || v === "" ? null : Number(v);
  if (required) rules.required = msg || "此项为必填项";
  if (vtype === "email") rules.email = msg || "请输入有效的邮箱地址";
  else if (vtype === "phone") rules.phone = msg || "请输入有效的手机号码";
  else if (vtype === "number") {
    rules.number = msg || "请输入有效数字";
    const vmin = num(c.validateMin);
    const vmax = num(c.validateMax);
    if (vmin !== null) { rules.min = msg || `数值不能小于 ${vmin}`; rules.minVal = vmin; }
    if (vmax !== null) { rules.max = msg || `数值不能大于 ${vmax}`; rules.maxVal = vmax; }
  }
  else if (vtype === "regex" && regex) { rules.regex = msg || "输入格式不正确"; rules.rx = regex; }
  const errColor = String(c.errorColor ?? "").trim();
  if (errColor) rules.errColor = errColor;
  const hasRules = !!(rules.required || rules.email || rules.phone || rules.number || rules.regex || rules.min || rules.max);
  if (hasRules) {
    const json = JSON.stringify(rules).replace(/</g, "\\u003c").replace(/'/g, "&#39;");
    const color = errColor || "#f44336";
    return {
      attr: ` data-vrules='${json}'`,
      errEl: `<div class="fc-err" style="display:none;color:${color};font-size:12px;line-height:1.4;margin-top:3px;user-select:none"></div>`,
      hasRules: true,
    };
  }
  return { attr: "", errEl: "", hasRules: false };
}

/** 校验运行时脚本：window.__WCVALIDATE(box) 按 data-vrules 计算并渲染错误，返回错误文案（'' 表示通过）。 */
const WC_VALIDATE_HELPER = `window.__WCVALIDATE=function(box){var f=box.querySelector('input[name],select[name],textarea[name]');if(!f)return'';var v='';if(f.type==='checkbox'){v=f.checked?'on':'';}else if(f.type==='radio'){v='';var rs=box.querySelectorAll('input[type=radio]');for(var j=0;j<rs.length;j++){if(rs[j].checked){v=rs[j].value;break;}}}else if(f.type==='file'){v=(f.files&&f.files.length)?f.files[0].name:'';}else{v=f.value==null?'':String(f.value);}var rules={};try{rules=JSON.parse(box.getAttribute('data-vrules'));}catch(e){}var errEl=box.querySelector('.fc-err');var msg='';v=v.trim();if(rules.required&&v===''){msg=rules.required;}else if(rules.email&&!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(v)){msg=rules.email;}else if(rules.phone&&!/^1[3-9]\\d{9}$/.test(v)){msg=rules.phone;}else if(rules.number&&!/^-?\\d+(\\.\\d+)?$/.test(v)){msg=rules.number;}else if(rules.rx&&v!==''&&!(new RegExp(rules.rx).test(v))){msg=rules.regex||'输入格式不正确';}else if(v!==''&&rules.min!=null&&!isNaN(parseFloat(v))&&parseFloat(v)<parseFloat(rules.minVal)){msg=rules.min;}else if(v!==''&&rules.max!=null&&!isNaN(parseFloat(v))&&parseFloat(v)>parseFloat(rules.maxVal)){msg=rules.max;}var col=rules.errColor||'#f44336';if(errEl){errEl.textContent=msg;errEl.style.display=msg?'block':'none';errEl.style.color=col;}if(f){var o=(f.closest?f.closest('[data-ring]'):null)||f;var bw=o.getAttribute('data-bw')||f.getAttribute('data-bw')||'1';o.style.boxShadow=msg?('inset 0 0 0 '+bw+'px '+col):'';}var lb=box.querySelector('label');if(lb){lb.style.color=msg?col:'';}var hp=box.querySelector('.fc-help');if(hp){hp.style.display=msg?'none':'block';}return msg;};`;

/** 每页注入一次校验运行时（表单提交与字段实时反馈共用一个 helper）。 */
export function ensureValidator(ctx: CodegenContext): void {
  if (!ctx.pageScripts.some((s) => s.includes("__WCVALIDATE__"))) {
    ctx.pageScripts.push(`/*__WCVALIDATE__*/${WC_VALIDATE_HELPER}`);
  }
}

/** 实时校验绑定脚本（input/textarea/select/date/time/number 共用）。 */
export function liveValidateScript(uid: string, hasRules: boolean, ctx: CodegenContext): string {
  if (!hasRules) return "";
  ensureValidator(ctx);
  return `<script>;(function(){var d=document.getElementById('${uid}');if(!d||!d.closest||!window.__WCVALIDATE)return;var box=d.closest('[data-vrules]');if(!box)return;var v=function(){window.__WCVALIDATE(box);};d.addEventListener('input',v);d.addEventListener('blur',v);d.addEventListener('change',v);})();</script>`;
}

/**
 * 帮助文字让位脚本（唯一实现，全表单族共用）：
 * 交互触发的校验会派发 input/blur/change，但**提交触发的校验不会**，
 * 因此错误提示与帮助文字的互斥两种来源都要覆盖（与 __WCVALIDATE 内的 .fc-help 收口一致）。
 */
export function helperYieldScript(uid: string, helperText: string, hasRules: boolean): string {
  if (!helperText || !hasRules) return "";
  return `<script>;(function(){var d=document.getElementById('${uid}');var h=document.getElementById('${uid}h');if(!d||!h)return;var box=d.closest('[data-vrules]');function sync(){var e=box?box.querySelector('.fc-err'):null;h.style.display=(e&&e.style.display!=='none'&&e.textContent)?'none':'block';}d.addEventListener('input',sync);d.addEventListener('blur',sync);d.addEventListener('change',sync);sync();})();</script>`;
}

/**
 * 表单字段型控件的统一外壳（发布端）。与编辑区渲染器共用 `resolveFieldStyle` 口径，
 * 因此「顶部标签 / 悬浮徽章 / 边框环 / 帮助文字 / 校验提示」五件事只有这一份实现。
 *
 * 结构（与 form-input 同系列）：
 *   包裹层(flex column) → [顶部标签] → 字段层(position:relative,flex:1)
 *     → [fieldset 边框环] → 控件本体 → [悬浮徽章]
 *     → 错误提示 → 帮助文字
 * 控件本体需自带 `flex:1`（或自然高度）以撑满设计盒 —— 画布拖动缩放即直接生效。
 */
export function fieldShellHTML(a: {
  uid: string;
  s: FieldStyle;
  va: { attr: string; errEl: string; hasRules: boolean };
  ctx: CodegenContext;
  /** 控件本体 HTML（放进字段层内） */
  control: string;
  /** 字段层附加样式（分号结尾可选） */
  fieldStyle?: string;
  /** 是否绘制边框环（开关/滑块无边框，传 false） */
  ring?: boolean;
  /** 附加样式表规则 */
  extraCss?: string;
  /** 悬浮徽章的左缩进（默认对齐内容起点 14） */
  floatLeft?: number;
}): string {
  const { uid, s, va, ctx, control } = a;
  const ring = a.ring !== false;
  const wrap: string[] = [
    "width:100%", "height:100%", "display:flex", "flex-direction:column",
    `justify-content:${s.hasFloat ? "center" : "flex-start"}`,
    `font-family:${MUI_FONT}`,
  ];

  let html = `<div style="${wrap.join(";")}"${va.attr}>`;
  if (s.hasTop) {
    html += `<label style="font-size:${s.labelFontSize}px;line-height:1.2;color:${s.labelColor};margin-bottom:${s.labelGap}px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;user-select:none">${escapeHTML(s.labelText)}</label>`;
  }
  html += `<div class="${uid}" data-ring="1" data-bw="${s.borderWidth}" style="position:relative;width:100%;flex:1;min-height:0;display:flex;align-items:stretch;${a.fieldStyle ?? ""}">`;
  if (ring) {
    // z-index:1（透明内部，仅描边）——保证边框描边压在控件之上：
    // 数字步进器等控件的实心按钮铺满高度，若描边在其下方会被按钮盖住左右两条竖边。
    html += `<fieldset class="fc-outline" style="position:absolute;inset:0;margin:0;padding:0;border:${s.borderWidth}px solid ${s.borderColor};border-radius:${s.radiusCss};pointer-events:none;min-width:0;z-index:1"></fieldset>`;
  }
  html += control;
  if (s.hasFloat) {
    html += `<label class="fc-flabel" style="position:absolute;left:${a.floatLeft ?? 14}px;font-size:${s.labelFontSize}px;line-height:1.2;color:${s.labelColor};background:${s.labelBgColor};border-radius:${s.labelRadius}px;padding:0 4px;pointer-events:none;z-index:2;white-space:nowrap;user-select:none">${escapeHTML(s.label)}${reqTail(s.required)}</label>`;
  }
  html += `</div>`;
  html += va.errEl;
  const helperLine = s.helperText
    ? `<span class="fc-help" id="${uid}h" style="flex-shrink:0;font-size:12px;line-height:1.4;margin-top:3px;color:${s.helperColor};user-select:none;display:${va.hasRules ? "none" : "block"}">${escapeHTML(s.helperText)}</span>`
    : "";
  html += helperLine;
  html += `</div>`;

  const css = [
    ring ? `.${uid} .fc-outline{border:${s.borderWidth}px solid ${s.borderColor};border-radius:${s.radiusCss};transition:border-color .2s ${EASE},box-shadow .2s ${EASE}}` : "",
    ring ? `.${uid}:focus-within .fc-outline{border-color:${s.focusBorderColor}}` : "",
    s.hasFloat ? `.${uid} .fc-flabel{color:${s.labelColor};top:0;transform:translateY(-50%);transform-origin:left center;transition:color .2s ${EASE}}` : "",
    `.${uid} .fc-ctl::placeholder{color:${s.textColor};opacity:.5}`,
    `.${uid} .fc-ctl:disabled{opacity:.6;cursor:not-allowed}`,
    s.hasFloat ? `.${uid} .fc-ctl:not(:placeholder-shown) ~ .fc-flabel{color:${FILLED_LABEL_COLOR}}` : "",
    s.hasFloat ? `.${uid} .fc-ctl:focus ~ .fc-flabel{color:${FOCUS_LABEL_COLOR}}` : "",
    a.extraCss ?? "",
  ].filter(Boolean).join("");
  html += `<style>${css}</style>`;
  html += liveValidateScript(uid, va.hasRules, ctx);
  html += helperYieldScript(uid, s.helperText, va.hasRules);
  return html;
}
