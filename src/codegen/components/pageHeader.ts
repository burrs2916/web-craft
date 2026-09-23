import type { ComponentCodegenFn } from "../types";
import { escapeHTML } from "../layout";
import { renderMenuIcon } from "../iconPipeline";
import { dataLoaderScript } from "../dataLoader";
import { readAuthEnabled } from "../../editor/data/authMode";

function toText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/**
 * page-header 组件 -> HTML
 * 配置：title, subtitle, showBack, backText, backIcon, backAction(back/link/none),
 *       backHref, backNewTab,
 *       titleColor, titleFontSize, titleFontWeight,
 *       subtitleColor, subtitleFontSize,
 *       backColor, backFontSize, iconColor, iconSize,
 *       bgColor, paddingX, paddingY, borderRadius,
 *       borderEnabled, borderColor, borderWidth,
 *       layout(horizontal/vertical), align(left/center/right), gap
 * 数据源：dataMode(static/api)、staticData、apiUrl/apiPath/apiMethod/apiDataPath/
 *        apiHeaders/apiBody/apiInterval/authEnabled、titleField/subtitleField
 */
export const pageHeaderCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config;

  const title = toText(c.title ?? "") || "页面标题";
  const subtitle = toText(c.subtitle ?? "");
  const backText = String(c.backText ?? "返回");
  const showBack = c.showBack !== false;
  const backIcon = String(c.backIcon ?? "material:arrow_back");
  const backAction = String(c.backAction ?? "back");
  const backHref = String(c.backHref ?? "");
  const backNewTab = c.backNewTab === true;

  const titleColor = String(c.titleColor ?? "#ffffff");
  const titleFontSize = Number(c.titleFontSize ?? 24);
  const titleFontWeight = String(c.titleFontWeight ?? "bold");
  const subtitleColor = String(c.subtitleColor ?? "rgba(255,255,255,0.5)");
  const subtitleFontSize = Number(c.subtitleFontSize ?? 14);
  const backColor = String(c.backColor ?? "rgba(255,255,255,0.5)");
  const backFontSize = Number(c.backFontSize ?? 13);
  const iconColor = String(c.iconColor ?? "rgba(255,255,255,0.5)");
  const iconSize = Number(c.iconSize ?? 18);

  const bgColor = String(c.bgColor ?? "transparent");
  const paddingX = Number(c.paddingX ?? 24);
  const paddingY = Number(c.paddingY ?? 20);
  const borderRadius = Number(c.borderRadius ?? 0);
  const borderEnabled = c.borderEnabled === true;
  const borderColor = String(c.borderColor ?? "rgba(255,255,255,0.1)");
  const borderWidth = Number(c.borderWidth ?? 1);

  const layout = String(c.layout ?? "vertical");
  const align = String(c.align ?? "left");
  const gap = Number(c.gap ?? 8);

  const isHorizontal = layout === "horizontal";
  // 横排：主副标题基线对齐；外容器交叉轴上按 align 对齐
  const alignItems = isHorizontal ? "baseline" : "flex-start";
  const justifyContent = isHorizontal
    ? align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start"
    : "flex-start";
  const textAlign = isHorizontal ? "" : align;

  const isApi = String(c.dataMode ?? "static") === "api"
    && (String(c.apiUrl ?? "") || String(c.apiPath ?? ""));
  const uid = `ph-${Math.random().toString(36).slice(2, 9)}`;

  // Back button
  let backHTML = "";
  if (showBack) {
    const iconHTML = renderMenuIcon(backIcon, iconSize, ctx);
    const inner = `<span style="display:flex;align-items:center;gap:4px;color:${iconColor}">${iconHTML}</span><span style="color:${backColor};font-size:${backFontSize}px;user-select:none">${escapeHTML(backText)}</span>`;
    const baseStyle = `display:flex;align-items:center;gap:4px;${isHorizontal ? "margin-right:16px" : "margin-bottom:12px"};color:${backColor};flex-shrink:0;text-decoration:none`;
    if (backAction === "link" && backHref) {
      const target = backNewTab ? ' target="_blank" rel="noopener"' : "";
      backHTML = `<a href="${escapeHTML(backHref)}"${target} style="${baseStyle};cursor:pointer">${inner}</a>`;
    } else if (backAction === "back") {
      backHTML = `<a href="#" onclick="window.history.back();return false;" style="${baseStyle};cursor:pointer">${inner}</a>`;
    } else {
      backHTML = `<div style="${baseStyle};cursor:default">${inner}</div>`;
    }
  }

  // Title + subtitle
  const titleId = `${uid}-title`;
  const subId = `${uid}-sub`;
  const titleStyle = `color:${titleColor};font-size:${titleFontSize}px;font-weight:${titleFontWeight};line-height:1.3;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%`;
  const subtitleStyle = `color:${subtitleColor};font-size:${subtitleFontSize}px;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%${isHorizontal ? "" : ";margin-top:2px"}`;

  let contentHTML = `<span id="${titleId}" style="${titleStyle}">${escapeHTML(title)}</span>`;
  if (subtitle) {
    contentHTML += `<span id="${subId}" style="${subtitleStyle}">${escapeHTML(subtitle)}</span>`;
  }

  const contentWrapperStyle = [
    "display:flex",
    `flex-direction:${isHorizontal ? "row" : "column"}`,
    `align-items:${alignItems}`,
    `justify-content:${justifyContent}`,
    "align-self:stretch",
    `gap:${gap}px`,
    "flex:1",
    "min-height:0",
    textAlign ? `text-align:${textAlign}` : "",
  ].filter(Boolean).join(";");

  const outerStyle = [
    "width:100%",
    "height:100%",
    "display:flex",
    "flex-direction:column",
    "justify-content:center",
    `background:${bgColor}`,
    `border-radius:${borderRadius}px`,
    borderEnabled ? `border:${borderWidth}px solid ${borderColor}` : "",
    `padding:${paddingY}px ${paddingX}px`,
    "box-sizing:border-box",
    "overflow:hidden",
  ].filter(Boolean).join(";");

  // ── API 模式：mount 脚本（运行时按字段路径重绘标题/副标题）+ dataLoaderScript ──
  let apiScript = "";
  if (isApi) {
    const titleField = String(c.titleField ?? "title");
    const subtitleField = String(c.subtitleField ?? "subtitle");

    const mountScript = `<script>
(function(){
  var titleEl = document.getElementById("${titleId}");
  var subEl = document.getElementById("${subId}");
  var titleField = ${JSON.stringify(titleField)};
  var subtitleField = ${JSON.stringify(subtitleField)};
  function deepGet(src, path){
    if (!path || src == null) return undefined;
    var cur = src;
    var keys = String(path).split(".").map(function(s){ return s.trim(); }).filter(Boolean);
    for (var i=0;i<keys.length;i++){
      var m = keys[i].match(/^(\\w+)\\[(\\d+)\\]$/);
      if (m && Array.isArray(cur)) cur = cur[Number(m[2])];
      else if (cur && typeof cur === "object") cur = cur[keys[i]];
      else return undefined;
    }
    return cur;
  }
  function toText(v){
    if (v == null) return "";
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  }
  window["__wcPh_${uid}"] = function(data){
    var t = deepGet(data, titleField);
    if (t != null && titleEl) titleEl.textContent = toText(t);
    var s = deepGet(data, subtitleField);
    if (s != null && subEl) subEl.textContent = toText(s);
  };
})();
</script>`;

    const apiUrl = String(c.apiUrl ?? "");
    const apiPath = String(c.apiPath ?? "");
    const apiMethod = String(c.apiMethod ?? "GET");
    const apiHeaders = String(c.apiHeaders ?? "");
    const apiBody = String(c.apiBody ?? "");
    const apiInterval = Number(c.apiInterval ?? 0) || 0;
    const apiDataPath = String(c.apiDataPath ?? "");
    const authEnabled = readAuthEnabled(c.authEnabled);

    const loader = dataLoaderScript({
      container: `var el = document.getElementById("${titleId}");`,
      apiUrl,
      apiPath,
      apiMethod,
      apiHeaders,
      apiBody,
      apiInterval,
      apiDataPath,
      authEnabled,
      renderBody: `if (window["__wcPh_${uid}"]) window["__wcPh_${uid}"](data);`,
    });

    apiScript = mountScript + loader;
  }

  return `<div style="${outerStyle}">${backHTML}<div style="${contentWrapperStyle}">${contentHTML}</div></div>${apiScript}`;
};