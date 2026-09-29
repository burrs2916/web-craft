import { readAuthEnabled } from "../../../editor/data/authMode";
import { cssText, escapeAttr } from "../../../editor/data/cssDecls";
import { MUI_FONT } from "../../../editor/data/fieldStyle";
import { coerceProgressNumber } from "../../../editor/data/progressData";
import { fieldScaleFactor } from "../../../editor/data/scaleFit";
import { SLIDER_PRESS_TRANSITION, resolveSliderStyle, sliderBubbleCss, sliderEndpointCss, sliderLabelCss, sliderLabelRowCss, sliderPressCssOf, sliderRowCss, sliderThumbLeft, sliderTickCss, sliderTickLabelCss, sliderTickLabelText, sliderTickLayerCss, sliderTicksOf, sliderValueCss, sliderValueText } from "../../../editor/data/sliderStyle";
import { dataLoaderScript } from "../../dataLoader";
import { escapeHTML } from "../../layout";
import type { ComponentCodegenFn } from "../../types";
import { fieldNameAttr } from "./shared";



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
