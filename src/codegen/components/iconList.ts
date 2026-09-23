import type { ComponentCodegenFn } from "../types";
import { renderMenuIcon, RUNTIME_ICON_RENDERER_JS, RUNTIME_ICON_ITEMS_JS } from "../iconPipeline";
import { dataLoaderScript } from "../dataLoader";
import { MATERIAL_ICON_PATHS } from "../materialIcons";
import {
  ICON_LIST_FIT,
  DEFAULT_ICON_NAME,
  resolveIconListStyle,
  resolveIconItems,
  iconListOuterCss,
  iconStageCss,
  iconListInnerCss,
  iconListBodyCss,
  iconListItemCss,
  iconListLabelCss,
  iconListRules,
} from "../../editor/data/iconStyle";
import { cssText, escapeHTML } from "../../editor/data/cssDecls";
import { scaleInnerBaseCss } from "../../editor/data/scaleFit";
import { scaleFitStage, scaleFitScript } from "../scaleFit";
import { readAuthEnabled } from "../../editor/data/authMode";

/**
 * icon-list 图标列表 → HTML（与编辑区 `IconListRenderer` 结构同构）
 *
 * DOM：容器 → 缩放舞台 → 缩放内层 → 条目容器 → 条目（图标 + 文字）
 *
 * 条目数据三种来源与编辑区同优先级：接口 > 静态数据 > 「条目数据」文本 > 默认占位；
 * 解析统一走 `editor/data/iconStyle.ts` 的 `resolveIconItems`，两端只读这一份。
 *
 * 状态纪律：条目**悬浮底色**由类规则承载（`.{uid}-it:hover`）；条目**静态底色**进 inline。
 * 两者属性同为 `background-color`，但一个在类规则里、一个在 inline —— 悬浮态会被
 * inline 压死吗？不会：本组刻意让 `iconListStateCss` 只在 `hoverBgColor !== itemBgColor`
 * 时输出类规则，且编辑区同样用 `&:hover` 派生规则，两端行为一致。
 * （若两者相等则本就不需要悬浮效果，直接不输出规则。）
 */
export const iconListCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config;
  const s = resolveIconListStyle(c);
  const scaleFit = c.scaleFit !== false;

  const uid = `icl-${Math.random().toString(36).slice(2, 9)}`;
  const dataMode = String(c.dataMode ?? "static");
  const isApi = dataMode === "api" && !!(String(c.apiUrl ?? "") || String(c.apiPath ?? ""));

  // 编译期内容：静态模式即最终内容；接口模式下作为首屏打底（与脚本内的 EMPTY 同一份）
  const items = resolveIconItems({ config: c });

  const outerCss = cssText(iconListOuterCss());
  const stageCss = cssText(iconStageCss(s.align));
  const innerCss = cssText(iconListInnerCss());
  const bodyCss = cssText(iconListBodyCss(s));
  const itemCss = cssText(iconListItemCss(s));
  const labelCss = cssText(iconListLabelCss(s));
  const iconCss = `display:inline-flex;line-height:0;color:${s.iconColor || "inherit"}`;

  // 条目底色 + 悬浮底色一律走类规则（inline 会压死 :hover）
  const styleTag = `<style>${iconListRules(uid, s)}</style>`;

  /** 单条目 */
  const itemHTML = (icon: string, label: string): string =>
    `<span data-icon-list-item="1" class="${uid}-it" style="${itemCss}">`
    + `<span style="${iconCss}">${renderMenuIcon(icon, s.iconSize, ctx)}</span>`
    + (label ? `<span style="${labelCss}">${escapeHTML(label)}</span>` : "")
    + `</span>`;

  const bodyHTML = (inner: string) => `<div data-icon-list-body="1" style="${bodyCss}">${inner}</div>`;

  /** 缩放内层包装（结构约定与 icon 一致：骨架那层就是内层，不再套一层） */
  const innerStyleText = `${cssText(scaleInnerBaseCss())};${innerCss}`;
  const wrapStage = (content: string) =>
    scaleFit
      ? scaleFitStage({
          uid,
          control: content,
          spec: ICON_LIST_FIT,
          align: s.align as "left" | "center" | "right",
          innerStyle: innerCss,
        })
      : `<div style="${stageCss}"><div class="${uid}-in" style="${innerStyleText}">${content}</div></div>`;

  const wrap = (innerHTML: string) =>
    `<div data-icon-list-outer="1" class="${uid}-wrap" style="${outerCss}">${wrapStage(innerHTML)}</div>`;

  const fitScript = scaleFit ? scaleFitScript(uid, ICON_LIST_FIT) : "";

  /* ══ 静态模式：服务端渲染全部条目 ══ */
  if (!isApi) {
    const inner = items.map((it) => itemHTML(it.icon, it.label)).join("");
    return `${styleTag}${wrap(bodyHTML(inner))}${fitScript}`;
  }

  /* ══ 接口模式：条目由接口驱动，浏览器内重建 ══ */
  const mountScript = `<script>
(function(){
  var root = document.querySelector('.${uid}-wrap');
  if (!root) return;
  var host = root.querySelector('[data-icon-list-body]');
  var st = root.querySelector('.${uid}-st');
  if (!host) return;
  var iconPaths = ${JSON.stringify(MATERIAL_ICON_PATHS)};
  var ICON_SIZE = ${s.iconSize};
  var FALLBACK = ${JSON.stringify(DEFAULT_ICON_NAME)};
  var ITEM_STYLE = ${JSON.stringify(itemCss)};
  var ITEM_CLASS = "${uid}-it";
  var LABEL_STYLE = ${JSON.stringify(labelCss)};
  var ICON_STYLE = ${JSON.stringify(iconCss)};
  var EMPTY = ${JSON.stringify(items)};
${RUNTIME_ICON_RENDERER_JS}${RUNTIME_ICON_ITEMS_JS}
  function render(list){
    var html = "";
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      var svg = renderIcon(it.icon || ("material:" + FALLBACK), ICON_SIZE);
      html += '<span data-icon-list-item="1" class="' + ITEM_CLASS + '" style="' + ITEM_STYLE + '">'
        + '<span style="' + ICON_STYLE + '">' + svg + '</span>'
        + (it.label ? '<span style="' + LABEL_STYLE + '">' + esc(it.label) + '</span>' : '')
        + '</span>';
    }
    host.innerHTML = html;
    if (st && typeof st.__wcFit === "function") st.__wcFit();
  }
  window["__wcIconList_${uid}"] = function(data){
    var list = toItems(data);
    render(list.length > 0 ? list : EMPTY);
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
    renderBody: `if (window["__wcIconList_${uid}"]) window["__wcIconList_${uid}"](data);`,
  });

  // 接口模式：首屏先用编译期内容打底（与编辑区 resolveIconItems 的回落一致），数据到达后覆盖
  return `${styleTag}${wrap(bodyHTML(items.map((it) => itemHTML(it.icon, it.label)).join("")))}${fitScript}${mountScript}${loader}`;
};
