import type { ComponentCodegenFn } from "../types";
import { escapeHTML } from "../layout";
import { SWITCH_FIT, stageAlignOf, stageVAlignOf } from "../../editor/data/scaleFit";
import { resolveToggleShell, toggleShellCss, toggleLabelTextCss, resolveSwitchSkin } from "../../editor/data/toggleStyle";
import { cssText } from "../../editor/data/cssDecls";
import { scaleSkeleton, scaleSkeletonScript, SCALE_OUTER_CSS } from "../shared/scaleSkeleton";
import { dataLoaderScript } from "../dataLoader";
import { readAuthEnabled } from "../../editor/data/authMode";
import { fieldNameAttr } from "./form";
import { validationHTML, liveValidateScript, helperYieldScript } from "../fieldChrome";

/**
 * switch 基础开关组件（控制型）-> HTML
 *
 * 与旧 form-switch 已合并（form-switch 设 enabled:false 面板隐藏，注册保留供旧场景渲染）：
 * 本组件 = 「看状态 + 发命令 + 可选表单提交」三合一——
 *   - interactive 开：可点击 —— 点击乐观翻转 `on` 类并派发冒泡 change 事件
 *     （detail.value = 新状态），事件面板可绑 callApi 下发开/关命令；轮询回读自动校正；
 *   - interactive 关 / disabled：只读展示（disabled 额外灰显并被表单收集跳过）；
 *   - dataMode = api：dataLoaderScript 轮询回读，coerceState 把任意响应收敛为开/关；
 *   - fieldName 填写：输出隐藏 checkbox（提交布尔值），必填校验复用 choiceValidationSchema
 *     口径（__WCVALIDATE 对 checkbox 取 checked），表单容器按 input[name] 自动收集。
 *
 * 状态属性铁律：track 的 background/opacity、thumb 的 left/background **只能由类规则给**
 * （`.${uid}.on …`），写成 inline 会压掉状态类 → 点击/回读无视觉变化。
 * `on` 类是状态单一真源，脚本负责把状态镜像进隐藏 input.checked（提交用）。
 * 几何与 form-switch 同一批实测值（MUI Switch 复刻：58×38 盒 / 34×14 轨道 / 20px 滑块）。
 * 外壳/轨道配色读唯一口径 toggleStyle.ts；缩放骨架读 SWITCH_FIT（refW/refH = 注册表 defaultSize）。
 */
export const switchCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config;
  const uid = "sw-" + Math.random().toString(36).slice(2, 9);

  const label = String(c.label ?? "");
  const checked = c.checked === true;
  const interactive = c.interactive !== false;
  const disabled = c.disabled === true;
  const onValue = String(c.onValue ?? "").trim().toLowerCase();
  const offValue = String(c.offValue ?? "").trim().toLowerCase();
  const textColor = String(c.textColor ?? "#333333");
  const accent = String(c.accentColor ?? "#1976d2");
  const small = String(c.size ?? "medium") === "small";
  const leftLabel = String(c.labelPlacement ?? "right") === "left";
  const fontSize = Number(c.fontSize ?? 14);

  // ── 表单能力（fieldName 显式填写才参与提交：留空 = 纯控制开关，不污染表单数据）──
  const isFormField = String(c.fieldName ?? "").trim() !== "";
  // 开关取值只有 开/关 枚举，格式类规则永不成立 → required 之外的选择器口径被面板隐藏。
  // 校验整体门在 isFormField 内：required 无 fieldName 时不出 data-vrules（必填只在提交场景有意义）。
  const va = isFormField ? validationHTML(c) : { attr: "", errEl: "", hasRules: false };
  const helperText = String(c.helperText ?? "");

  const dataMode = String(c.dataMode ?? "static");
  const apiUrl = String(c.apiUrl ?? "");
  const apiPath = String(c.apiPath ?? "");
  const isApi = dataMode === "api" && (apiUrl !== "" || apiPath !== "");

  // 几何按 MUI Switch 实测（与 formSwitchCodegen 同一批数值，勿凭"居中"重算）
  const boxW = small ? 40 : 58;
  const boxH = small ? 32 : 38;
  const trackW = small ? 26 : 34;
  const trackH = small ? 12 : 14;
  const thumbSize = small ? 16 : 20;
  const thumbOff = (boxW - trackW) / 2 - (thumbSize - trackH) / 2;
  const thumbOn = thumbOff + thumbSize;

  const shell = resolveToggleShell(c);
  const skin = resolveSwitchSkin(c);
  const EASE = "cubic-bezier(.4,0,.2,1)";

  let inner = `<label class="${uid}${checked ? " on" : ""}" style="display:flex;align-items:center;user-select:none;${interactive && !disabled ? "cursor:pointer;" : disabled ? "cursor:not-allowed;opacity:.38;" : ""}${
    leftLabel ? "flex-direction:row-reverse;justify-content:flex-end;" : ""
  }">`;
  // 隐藏 checkbox：fieldName 填写才输出；id=uid 供 liveValidateScript/helperYieldScript 定位
  if (isFormField) {
    inner += `<input type="checkbox" id="${uid}" ${fieldNameAttr(c, "switch")}${checked ? " checked" : ""}${disabled ? " disabled" : ""} style="position:absolute;opacity:0;pointer-events:none">`;
  }
  inner += `<span class="sw" style="position:relative;width:${boxW}px;height:${boxH}px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">`;
  // 状态要变的属性只进类规则（见文件头铁律）；transition 是静态声明可 inline
  inner += `<span class="sw-track" style="width:${trackW}px;height:${trackH}px;border-radius:${trackH / 2}px;transition:background .2s ${EASE},opacity .2s ${EASE}"></span>`;
  inner += `<span class="sw-thumb" style="position:absolute;top:${(boxH - thumbSize) / 2}px;width:${thumbSize}px;height:${thumbSize}px;border-radius:50%;transition:left .2s ${EASE},background .2s ${EASE}"></span>`;
  inner += `</span>`;
  if (label) {
    inner += `<span style="font-size:${fontSize}px;line-height:1.5;white-space:nowrap;${cssText(toggleLabelTextCss(shell))}">${escapeHTML(label)}${c.required === true ? " *" : ""}</span>`;
  }
  inner += `</label>`;

  const helperLine = helperText
    ? `<span class="fc-help" id="${uid}h" style="font-size:12px;line-height:1.4;margin-top:3px;color:#8a8f98;user-select:none;display:${va.hasRules ? "none" : "block"}">${escapeHTML(helperText)}</span>`
    : "";

  const css =
    `.${uid}{color:${textColor}}` +
    `.${uid} .sw-track{background:${skin.trackOffColor};opacity:${skin.trackOffOpacity}}` +
    `.${uid} .sw-thumb{left:${thumbOff}px;background:${skin.thumbOffColor}}` +
    `.${uid}.on .sw-track{background:${accent};opacity:${skin.trackOnOpacity}}` +
    `.${uid}.on .sw-thumb{left:${thumbOn}px;background:${accent}}`;

  let script = "";

  // 交互脚本：乐观翻转 + 同步隐藏 input.checked + 派发冒泡 change（在 input 上派发：
  // liveValidateScript 监听 input 的 change 做必填校验；事件脚手架在 data-component-id
  // 包装层监听 change，冒泡可达）。
  // ⚠️ e.target === input 卫兵 + preventDefault：隐藏 input 在 <label> 内，浏览器会把
  // label 的点击**转发给 input**（合成点击）—— 不拦住会 ①双翻转 ②原生 toggle 把
  // input.checked 打回去 ③无 detail 的原生 change 盖掉我们的 change（实测全中）。
  // 状态由脚本全权管理，label 的默认转发行为一律阻断。
  if (interactive && !disabled) {
    script += `<script>
(function(){
  var root = document.querySelector('.${uid}');
  if (!root || root.__wcSw) return;
  root.__wcSw = true;
  var input = root.querySelector('input[type=checkbox]');
  root.addEventListener('click', function(e){
    if (input && input.disabled) return;
    if (e.target === input) return;
    e.preventDefault();
    var next = !root.classList.contains('on');
    root.classList.toggle('on', next);
    if (input) input.checked = next;
    try { (input || root).dispatchEvent(new CustomEvent('change', { bubbles: true, detail: { value: next } })); } catch (e) {}
  });
})();
</script>`;
  }

  // 回读脚本：dataLoaderScript 统一取数骨架（URL 拼接 / 认证三态 / 轮询），renderBody 切 on 类
  // 并镜像 input.checked。回读不到明确状态（coerceState → null）时保持现状 —— 开关没有 unknown 态。
  if (isApi) {
    const loader = dataLoaderScript({
      container: `var el = document.querySelector('.${uid}');`,
      apiUrl,
      apiPath,
      apiMethod: String(c.apiMethod ?? "GET"),
      apiHeaders: String(c.apiHeaders ?? ""),
      apiBody: String(c.apiBody ?? ""),
      apiInterval: Number(c.apiInterval ?? 0) || 0,
      apiDataPath: String(c.apiDataPath ?? ""),
      authEnabled: readAuthEnabled(c.authEnabled),
      renderBody: [
        "  var st = (function(v){",
        "    if (v == null) return null;",
        "    if (typeof v === 'object') { v = v.value !== undefined ? v.value : (v.state !== undefined ? v.state : v.status); if (v == null) return null; }",
        "    var s = String(v).toLowerCase();",
        "    var ONV = " + JSON.stringify(onValue) + ", OFFV = " + JSON.stringify(offValue) + ";",
        "    if (ONV && s === ONV) return true;",
        "    if (OFFV && s === OFFV) return false;",
        "    if (v === true) return true;",
        "    if (v === false) return false;",
        "    if (v === 1) return true;",
        "    if (v === 0) return false;",
        "    var T = ',true,1,on,open,opened,yes,run,running,active,开,开启,打开,运行,运行中,启动,启用,在线,';",
        "    var F = ',false,0,off,close,closed,no,stop,stopped,inactive,关,关闭,停止,停机,停用,离线,';",
        "    if (T.indexOf(',' + s + ',') >= 0) return true;",
        "    if (F.indexOf(',' + s + ',') >= 0) return false;",
        "    return null;",
        "  })(data);",
        "  if (st === null) return;",
        "  el.classList.toggle('on', st === true);",
        "  var input = el.querySelector('input[type=checkbox]');",
        "  if (input) input.checked = st === true;",
      ].join("\n"),
    });
    script += loader;
  }

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
    script +
    liveValidateScript(uid, va.hasRules, ctx) +
    helperYieldScript(uid, helperText, va.hasRules) +
    scaleSkeletonScript(uid, SWITCH_FIT, c.scaleFit !== false)
  );
};
