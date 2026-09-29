import { cssText } from "../../../editor/data/cssDecls";
import { resolveFieldStyle } from "../../../editor/data/fieldStyle";
import { SWITCH_FIT, stageAlignOf, stageVAlignOf } from "../../../editor/data/scaleFit";
import { resolveSwitchSkin, resolveToggleShell, toggleLabelTextCss, toggleShellCss } from "../../../editor/data/toggleStyle";
import { EASE, helperYieldScript, liveValidateScript, validationHTML } from "../../fieldChrome";
import { escapeHTML } from "../../layout";
import { SCALE_OUTER_CSS, scaleSkeleton, scaleSkeletonScript } from "../../shared/scaleSkeleton";
import type { ComponentCodegenFn } from "../../types";
import { fieldNameAttr } from "./shared";



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
