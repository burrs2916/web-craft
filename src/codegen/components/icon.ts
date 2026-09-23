import type { ComponentCodegenFn } from "../types";
import { renderMenuIcon, RUNTIME_ICON_RENDERER_JS, RUNTIME_ICON_ITEMS_JS } from "../iconPipeline";
import { dataLoaderScript } from "../dataLoader";
import { MATERIAL_ICON_PATHS } from "../materialIcons";
import {
  ICON_FIT,
  DEFAULT_ICON_NAME,
  normalizeIconRef,
  resolveIconStyle,
  iconOuterCss,
  iconStageCss,
  iconInnerCss,
  iconRotCss,
  iconFaceCss,
  iconLabelCss,
  iconStateCss,
} from "../../editor/data/iconStyle";
import { cssText, escapeHTML, escapeAttr } from "../../editor/data/cssDecls";
import { scaleInnerBaseCss } from "../../editor/data/scaleFit";
import { scaleFitStage, scaleFitScript } from "../scaleFit";
import { readAuthEnabled } from "../../editor/data/authMode";

/**
 * icon 单图标 → HTML（与编辑区 `IconRenderer` 结构同构）
 *
 * DOM：容器 → 缩放舞台 → 缩放内层 →〔旋转变换层 → 图标面色层〕+〔说明文字〕
 * 与编辑区逐层对应：外层裁剪、舞台实测 + 水平对齐、内层自然尺寸只被 transform 缩放。
 *
 * 状态纪律（本仓库血案纪律）：
 * - 静态 rotate/flip 写在旋转变换层的 inline（恒定值，不会被状态规则改写）；
 * - **悬浮放大与持续旋转只由类规则承载**（`.{uid}-rot:hover` / `.{uid}-spin`），
 *   绝不写 inline —— inline 恒胜过非 !important 的类规则，写进去就永远压不动。
 *
 * 取数：接口模式复用统一骨架 `dataLoaderScript`（URL 拼接 / 全局默认请求头 / 认证三态注入 /
 * POST 请求体 / 轮询 / `auth-state-change` 重取），与编辑区 `useApiDataFetch` 语义一致；
 * 数据到达后在浏览器里重建图标（`RUNTIME_ICON_RENDERER_JS`，与编译期 renderMenuIcon 对齐）。
 */
export const iconCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config;
  const s = resolveIconStyle(c, { size: 32, layout: "horizontal" });
  const scaleFit = c.scaleFit !== false;

  const uid = `ic-${Math.random().toString(36).slice(2, 9)}`;
  const dataMode = String(c.dataMode ?? "static");
  const isApi = dataMode === "api" && !!(String(c.apiUrl ?? "") || String(c.apiPath ?? ""));

  const iconRef = normalizeIconRef(c.icon);
  const label = String(c.label ?? "");

  const stateRules = iconStateCss(uid, s);
  const styleTag = stateRules ? `<style>${stateRules}</style>` : "";

  /* ── 各层样式声明（与编辑区取的是同一批字面量） ── */
  const outerCss = cssText(iconOuterCss());
  const stageCss = cssText(iconStageCss(s.align));
  const innerCss = cssText(iconInnerCss(s));
  const rotCss = cssText(iconRotCss(s));
  const faceCss = cssText(iconFaceCss(s));
  const labelCss = cssText(iconLabelCss(s));

  const rotClass = s.spin ? `${uid}-rot ${uid}-spin` : `${uid}-rot`;

  /** 图标面色层 */
  const faceHTML = (inner: string) =>
    `<span data-icon-face="1" style="${faceCss}">${inner}</span>`;

  /** 旋转变换层（含面色层）—— transform 一律由类规则给（见 styleTag） */
  const rotHTML = (inner: string) =>
    `<span data-icon-rot="1" class="${rotClass}" style="${rotCss}">${faceHTML(inner)}</span>`;

  /** 说明文字（空则整段不输出，与编辑区一致） */
  const labelHTML = (text: string) =>
    text ? `<span data-icon-label="1" style="${labelCss}">${escapeHTML(text)}</span>` : "";

  /** 缩放内层内容（旋转变换层 + 说明文字），不含内层包装本身 */
  const buildContent = (inner: string, text: string) => `${rotHTML(inner)}${labelHTML(text)}`;

  /**
   * 缩放内层包装：
   * - 开启等比缩放 → 由统一骨架 `scaleFitStage` 产出 `.{uid}-in`（脚本按它定位）
   * - 关闭 → 自己产出同名的 `.{uid}-in`，样式声明与骨架完全一致（同为 innerBase + innerCss）
   */
  const innerStyleText = `${cssText(scaleInnerBaseCss())};${innerCss}`;
  const wrapStage = (content: string) =>
    scaleFit
      ? scaleFitStage({
          uid,
          control: content,
          spec: ICON_FIT,
          align: s.align as "left" | "center" | "right",
          innerStyle: innerCss,
        })
      : `<div style="${stageCss}"><div class="${uid}-in" style="${innerStyleText}">${content}</div></div>`;

  const wrap = (content: string) => {
    const outer = `<div data-icon-outer="1" class="${uid}-wrap" style="${outerCss}">${wrapStage(content)}</div>`;
    /* 跳转链接：面板「行为 → 跳转链接」此前两端都不消费（诚实性扫描实证），这里接线成 <a> 包装 */
    const href = String(c.href ?? "").trim();
    if (!href) return outer;
    const target = String(c.linkTarget ?? "_blank") === "_self" ? "_self" : "_blank";
    return `<a href="${escapeAttr(href)}" target="${target}" rel="${target === "_blank" ? "noopener noreferrer" : ""}" style="display:contents;text-decoration:none;color:inherit">${outer}</a>`;
  };

  const fitScript = scaleFit ? scaleFitScript(uid, ICON_FIT) : "";

  /* ══ 静态模式：服务端渲染图标（与编辑区同一份 resolveIconStyle） ══ */
  if (!isApi) {
    const iconHTML = renderMenuIcon(iconRef, s.size, ctx);
    return `${styleTag}${wrap(buildContent(iconHTML, label))}${fitScript}`;
  }

  /* ══ 接口模式：图标与文字由接口驱动，浏览器内重建 ══ */
  const mountScript = `<script>
(function(){
  var root = document.querySelector('.${uid}-wrap');
  if (!root) return;
  var host = root.querySelector('.${uid}-in');
  var st = root.querySelector('.${uid}-st');
  if (!host) return;
  var iconPaths = ${JSON.stringify(MATERIAL_ICON_PATHS)};
  var SIZE = ${s.size};
  var FALLBACK = ${JSON.stringify(DEFAULT_ICON_NAME)};
  var STATIC_ICON = ${JSON.stringify(iconRef)};
  var STATIC_LABEL = ${JSON.stringify(label)};
  var ROT_CLASS = ${JSON.stringify(rotClass)};
  var ROT_STYLE = ${JSON.stringify(rotCss)};
  var FACE_STYLE = ${JSON.stringify(faceCss)};
  var LABEL_STYLE = ${JSON.stringify(labelCss)};
${RUNTIME_ICON_RENDERER_JS}${RUNTIME_ICON_ITEMS_JS}
  function apply(icon, text){
    var ref = icon ? String(icon) : STATIC_ICON;
    var svg = renderIcon(ref, SIZE) || renderIcon("material:" + FALLBACK, SIZE);
    host.innerHTML = '<span data-icon-rot="1" class="' + ROT_CLASS + '" style="' + ROT_STYLE + '">'
      + '<span data-icon-face="1" style="' + FACE_STYLE + '">' + svg + '</span></span>'
      + (text ? '<span data-icon-label="1" style="' + LABEL_STYLE + '">' + esc(text) + '</span>' : '');
    if (st && typeof st.__wcFit === "function") st.__wcFit();
  }
  // 先用编译期的图标/文字占位（避免首屏空白），数据到达后覆盖
  apply(STATIC_ICON, STATIC_LABEL);
  window["__wcIcon_${uid}"] = function(data){
    var items = toItems(data);
    if (items.length > 0) apply(items[0].icon || STATIC_ICON, items[0].label || STATIC_LABEL);
    else apply(STATIC_ICON, STATIC_LABEL);
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
    renderBody: `if (window["__wcIcon_${uid}"]) window["__wcIcon_${uid}"](data);`,
  });

  return `${styleTag}${wrap(buildContent(renderMenuIcon(iconRef, s.size, ctx), label))}${fitScript}${mountScript}${loader}`;
};
