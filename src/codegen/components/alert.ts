import type { ComponentCodegenFn } from "../types";
import { escapeHTML } from "../layout";
import { renderMenuIcon } from "../iconPipeline";
import { dataLoaderScript } from "../dataLoader";
import { readAuthEnabled } from "../../editor/data/authMode";

/**
 * alert 警告提示组件 -> HTML
 * 配置：severity, title, showTitle, description, showDescription,
 *       showIcon, iconMode(type/custom), icon, iconColor, closable,
 *       variant(standard/outlined/filled), customColors, titleColor, descriptionColor,
 *       paddingX, paddingY, iconSize, fontSize, titleFontSize, borderRadius
 * 数据源：dataMode/staticData/apiUrl/... + titleField/descriptionField
 */
export const alertCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config;

  const severity = String(c.severity ?? "info");
  const title = String(c.title ?? "提示");
  const showTitle = c.showTitle !== false;
  const description = String(c.description ?? "");
  const showDescription = c.showDescription !== false;
  const showIcon = c.showIcon !== false;
  const iconMode = String(c.iconMode ?? "type");
  const closable = c.closable === true;
  const variant = String(c.variant ?? "standard");
  const customColors = c.customColors === true;
  const iconSize = Number(c.iconSize ?? 22);
  const fontSize = Number(c.fontSize ?? 14);
  const titleFontSize = Number(c.titleFontSize ?? 15);
  const borderRadius = Number(c.borderRadius ?? 6);
  const paddingX = Number(c.paddingX ?? 14);
  const paddingY = Number(c.paddingY ?? 10);

  const severityColors: Record<string, { bg: string; color: string; border: string; icon: string }> = {
    success: { bg: "rgba(76,175,80,0.12)", color: "#81C784", border: "rgba(76,175,80,0.4)", icon: "check_circle" },
    info: { bg: "rgba(33,150,243,0.12)", color: "#64B5F6", border: "rgba(33,150,243,0.4)", icon: "info" },
    warning: { bg: "rgba(255,152,0,0.12)", color: "#FFB74D", border: "rgba(255,152,0,0.4)", icon: "warning" },
    error: { bg: "rgba(244,67,54,0.12)", color: "#E57373", border: "rgba(244,67,54,0.4)", icon: "error" },
  };
  const sc = severityColors[severity] ?? severityColors.info;

  const titleColor = customColors ? String(c.titleColor ?? "") || sc.color : sc.color;
  const descriptionColor = customColors ? String(c.descriptionColor ?? "") || "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.5)";
  const iconColor = String(c.iconColor ?? "") || sc.color;

  const bg = variant === "filled" ? sc.border : variant === "outlined" ? "transparent" : sc.bg;
  const borderStr = variant === "filled" ? "1px solid transparent" : `1px solid ${sc.border}`;

  const uid = `alert-${Math.random().toString(36).slice(2, 9)}`;

  const isApi = String(c.dataMode ?? "static") === "api"
    && (String(c.apiUrl ?? "") || String(c.apiPath ?? ""));
  const titleField = String(c.titleField ?? "title");
  const descriptionField = String(c.descriptionField ?? "description");
  const titleId = `${uid}-title`;
  const descId = `${uid}-desc`;

  const iconKey = iconMode === "custom" ? String(c.icon ?? "") || sc.icon : `material:${sc.icon}`;

  let inner = "";
  if (showIcon) {
    inner += `<span style="display:flex;align-items:center;flex-shrink:0;margin-top:1px;color:${iconColor}">${renderMenuIcon(iconKey, iconSize, ctx)}</span>`;
  }
  inner += `<div style="flex:1;min-width:0">`;
  if (showTitle) {
    inner += `<div id="${isApi ? titleId : ""}" style="font-size:${titleFontSize}px;font-weight:600;color:${titleColor};line-height:1.4">${escapeHTML(title)}</div>`;
  }
  if (showDescription && description) {
    const mt = showTitle ? "4px" : "0";
    inner += `<div id="${isApi ? descId : ""}" style="font-size:${fontSize}px;color:${descriptionColor};margin-top:${mt};line-height:1.5">${escapeHTML(description)}</div>`;
  }
  inner += `</div>`;
  if (closable) {
    inner += `<span class="${uid}-close" style="flex-shrink:0;cursor:pointer;font-size:16px;line-height:1;color:${sc.color};opacity:0.6;margin-top:-2px">✕</span>`;
  }

  const boxStyle = [
    "width:100%",
    "display:flex",
    "align-items:flex-start",
    "gap:10px",
    `padding:${paddingY}px ${paddingX}px`,
    `background:${bg}`,
    `border:${borderStr}`,
    `border-radius:${borderRadius}px`,
    `color:${sc.color}`,
    "box-sizing:border-box",
  ].join(";");

  let script = closable ? `
<script>
(function(){
  var el = document.querySelector('.${uid}');
  var closeBtn = document.querySelector('.${uid}-close');
  if(closeBtn && el){
    closeBtn.addEventListener("click", function(e){
      e.stopPropagation();
      el.style.display = "none";
    });
    closeBtn.addEventListener("mouseenter", function(){ this.style.opacity = "1"; });
    closeBtn.addEventListener("mouseleave", function(){ this.style.opacity = "0.6"; });
  }
})();
</script>` : "";

  // API 模式：按字段路径更新标题/描述
  if (isApi) {
    script += `
<script>
(function(){
  var titleEl = document.getElementById("${titleId}");
  var descEl = document.getElementById("${descId}");
  var titleField = ${JSON.stringify(titleField)};
  var descField = ${JSON.stringify(descriptionField)};
  function deepGet(src, path){
    if (!path || src == null) return undefined;
    var cur = src; var keys = String(path).split(".").map(function(s){ return s.trim(); }).filter(Boolean);
    for (var i=0;i<keys.length;i++){ var m=keys[i].match(/^(\\w+)\\[(\\d+)\\]$/); if(m&&Array.isArray(cur))cur=cur[Number(m[2])]; else if(cur&&typeof cur==="object")cur=cur[keys[i]]; else return undefined; }
    return cur;
  }
  function toText(v){ if(v==null)return ""; if(typeof v==="object")return JSON.stringify(v); return String(v); }
  window["__wcAlert_${uid}"] = function(data){
    var t = deepGet(data, titleField);
    if (t !== undefined && titleEl) titleEl.textContent = toText(t);
    var d = deepGet(data, descField);
    if (d !== undefined && descEl) descEl.textContent = toText(d);
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

    script += dataLoaderScript({
      container: `var el = document.querySelector('.${uid}');`,
      apiUrl,
      apiPath,
      apiMethod,
      apiHeaders,
      apiBody,
      apiInterval,
      apiDataPath,
      authEnabled,
      renderBody: `if (window["__wcAlert_${uid}"]) window["__wcAlert_${uid}"](data);`,
    });
  }

  const markup = `<div class="${uid}" style="${boxStyle}">${inner}</div>`;
  return markup + script;
};