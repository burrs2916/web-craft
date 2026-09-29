import { cssText } from "../../../editor/data/cssDecls";
import { CHECKBOX_FIT, stageAlignOf, stageVAlignOf } from "../../../editor/data/scaleFit";
import { resolveCheckboxUncheckedColor, resolveToggleShell, toggleLabelTextCss, toggleShellCss } from "../../../editor/data/toggleStyle";
import { liveValidateScript, validationHTML } from "../../fieldChrome";
import { escapeHTML } from "../../layout";
import { SCALE_OUTER_CSS, scaleSkeleton, scaleSkeletonScript } from "../../shared/scaleSkeleton";
import type { ComponentCodegenFn } from "../../types";
import { CB_IND, CB_OFF, CB_ON, fieldNameAttr, svgIcon, toggleIcon } from "./shared";



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
