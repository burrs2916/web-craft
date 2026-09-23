import type { ComponentCodegenFn } from "../types";
import { renderMenuIcon, RUNTIME_ICON_RENDERER_JS, RUNTIME_ICON_ITEMS_JS } from "../iconPipeline";
import { dataLoaderScript } from "../dataLoader";
import { MATERIAL_ICON_PATHS } from "../materialIcons";
import {
  ICON_BUTTON_FIT,
  DEFAULT_ICON_NAME,
  normalizeIconRef,
  resolveIconButtonStyle,
  iconButtonOuterCss,
  iconStageCss,
  scaleInnerCss,
  iconButtonCss,
  iconButtonRules,
} from "../../editor/data/iconStyle";
import { cssText, escapeHTML, escapeAttr } from "../../editor/data/cssDecls";
import { scaleInnerBaseCss } from "../../editor/data/scaleFit";
import { scaleFitStage, scaleFitScript } from "../scaleFit";
import { readAuthEnabled } from "../../editor/data/authMode";

/**
 * icon-button 图标按钮 → HTML（与编辑区 `IconButtonRenderer` 结构同构）
 *
 * DOM：容器 → 缩放舞台 → 缩放内层 → 按钮本体（`<a>` 或 `<div>`）
 * 「缩放内层」这一层是必须的：`scaleFitScript` 把 `scale(f)` 写进内层的 **inline**
 * transform，而悬浮放大的 transform 只能由类规则给 —— inline 恒胜过非 !important 的类规则，
 * 同层就永远压不动悬浮放大。
 *
 * 状态纪律：三种形态的**底色**（实心主题色 / 描边与文字透明）是静态值，进 inline；
 * **悬浮底色与悬浮放大**是状态值，只由 `.{uid}:hover` 承载；禁用态只由类规则承载，
 * 不把 `cursor` / `opacity` 写进 inline —— 否则将来任何禁用态规则都改不动它。
 */
export const iconButtonCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config;
  const s = resolveIconButtonStyle(c);
  const scaleFit = c.scaleFit !== false;

  const uid = `icb-${Math.random().toString(36).slice(2, 9)}`;
  const dataMode = String(c.dataMode ?? "static");
  const isApi = dataMode === "api" && !!(String(c.apiUrl ?? "") || String(c.apiPath ?? ""));

  const iconRef = normalizeIconRef(c.icon);
  const text = String(c.text ?? "");
  const isLink = !!s.href && !s.disabled;

  const outerCss = cssText(iconButtonOuterCss());
  const stageCss = cssText(iconStageCss(s.align));
  const innerCss = cssText(scaleInnerCss());
  const btnCss = cssText(iconButtonCss(s));

  // 按钮底色 + 悬浮底色/放大一律走类规则（inline 会压死 :hover）
  const styleTag = `<style>${iconButtonRules(uid, s)}</style>`;

  /** 按钮内容（图标 + 可选文字）；图标颜色留空时跟随按钮文字色 */
  const contentHTML = (iconHTML: string, label: string) =>
    `<span style="display:inline-flex;line-height:0;color:${s.iconColor || "inherit"}">${iconHTML}</span>`
    + (label ? `<span style="line-height:1">${escapeHTML(label)}</span>` : "");

  /** 按钮本体：有链接且未禁用时用 `<a>`，否则用 `<div>` */
  const buttonHTML = (iconHTML: string, label: string) => {
    const tag = isLink ? "a" : "div";
    const linkAttrs = isLink
      ? ` href="${escapeAttr(s.href)}" target="${escapeAttr(s.linkTarget)}"`
      : "";
    const disabledAttr = s.disabled ? ' aria-disabled="true"' : "";
    return `<${tag} data-icon-button="1" class="${uid}"${linkAttrs}${disabledAttr} style="${btnCss}">`
      + `${contentHTML(iconHTML, label)}</${tag}>`;
  };

  /** 缩放内层包装（结构约定与 icon 一致：骨架那层就是内层，不再套一层） */
  const innerStyleText = `${cssText(scaleInnerBaseCss())};${innerCss}`;
  const wrapStage = (content: string) =>
    scaleFit
      ? scaleFitStage({
          uid,
          control: content,
          spec: ICON_BUTTON_FIT,
          align: s.align as "left" | "center" | "right",
          innerStyle: innerCss,
        })
      : `<div style="${stageCss}"><div class="${uid}-in" style="${innerStyleText}">${content}</div></div>`;

  const wrap = (innerHTML: string) =>
    `<div data-icon-button-outer="1" class="${uid}-wrap" style="${outerCss}">${wrapStage(innerHTML)}</div>`;

  const fitScript = scaleFit ? scaleFitScript(uid, ICON_BUTTON_FIT) : "";

  /* ══ 静态模式：服务端渲染图标与文字 ══ */
  if (!isApi) {
    return `${styleTag}${wrap(buttonHTML(renderMenuIcon(iconRef, s.iconSize, ctx), text))}${fitScript}`;
  }

  /* ══ 接口模式：图标与文字由接口驱动，浏览器内重建按钮内容 ══ */
  const mountScript = `<script>
(function(){
  var root = document.querySelector('.${uid}-wrap');
  if (!root) return;
  var btn = root.querySelector('[data-icon-button]');
  var st = root.querySelector('.${uid}-st');
  if (!btn) return;
  var iconPaths = ${JSON.stringify(MATERIAL_ICON_PATHS)};
  var ICON_SIZE = ${s.iconSize};
  var FALLBACK = ${JSON.stringify(DEFAULT_ICON_NAME)};
  var STATIC_ICON = ${JSON.stringify(iconRef)};
  var STATIC_TEXT = ${JSON.stringify(text)};
  var ICON_WRAP_STYLE = ${JSON.stringify(`display:inline-flex;line-height:0;color:${s.iconColor || "inherit"}`)};
${RUNTIME_ICON_RENDERER_JS}${RUNTIME_ICON_ITEMS_JS}
  function apply(icon, label){
    var svg = renderIcon(icon || STATIC_ICON, ICON_SIZE) || renderIcon("material:" + FALLBACK, ICON_SIZE);
    var text = label == null || label === "" ? STATIC_TEXT : String(label);
    btn.innerHTML = '<span style="' + ICON_WRAP_STYLE + '">' + svg + '</span>'
      + (text ? '<span style="line-height:1">' + esc(text) + '</span>' : '');
    if (st && typeof st.__wcFit === "function") st.__wcFit();
  }
  window["__wcIconBtn_${uid}"] = function(data){
    var items = toItems(data);
    if (items.length > 0) apply(items[0].icon, items[0].label);
    else apply(STATIC_ICON, STATIC_TEXT);
  };
})();
</script>`;

  const loader = dataLoaderScript({
    container: `var el = document.querySelector('.${uid}-wrap');`,
    apiUrl: String(c.apiUrl ?? ""),
    apiPath: String(c.apiPath ?? ""),
    apiMethod: String(c.apiMethod ?? "GET"),
    apiHeaders: String(c.apiHeaders ?? ""),
    apiBody: String(c.apiBody ?? ""),
    apiInterval: Number(c.apiInterval ?? 0),
    apiDataPath: String(c.apiDataPath ?? ""),
    authEnabled: readAuthEnabled(c.authEnabled),
    renderBody: `if (window["__wcIconBtn_${uid}"]) window["__wcIconBtn_${uid}"](data);`,
  });

  return `${styleTag}${wrap(buttonHTML(renderMenuIcon(iconRef, s.iconSize, ctx), text))}${fitScript}${mountScript}${loader}`;
};
