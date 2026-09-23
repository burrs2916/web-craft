import type { ComponentCodegenFn } from "../types";
import { escapeHTML } from "../layout";
import { renderMenuIcon } from "../iconPipeline";
import { dataLoaderScript } from "../dataLoader";
import { readAuthEnabled } from "../../editor/data/authMode";

/**
 * tooltip 文字提示组件 -> HTML
 * 配置：text, placement, trigger, triggerStyle(icon-text/icon/text), triggerIcon,
 *       triggerIconSize, iconColor, showArrow, bgColor, textColor, fontSize,
 *       padding, borderRadius, maxWidth, triggerText, triggerColor, triggerUnderline
 * 数据源：dataMode/staticData/apiUrl/... + textField
 */
export const tooltipCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config;

  const text = String(c.text ?? "提示文字");
  const placement = String(c.placement ?? "top");
  const trigger = String(c.trigger ?? "hover");
  const triggerStyle = String(c.triggerStyle ?? "icon-text");
  const triggerIcon = String(c.triggerIcon ?? "") || "material:info";
  const triggerIconSize = Number(c.triggerIconSize ?? 16);
  const showArrow = c.showArrow !== false;
  const bgColor = String(c.bgColor ?? "rgba(50,50,50,0.9)");
  const textColor = String(c.textColor ?? "#ffffff");
  const fontSize = Number(c.fontSize ?? 12);
  const padding = Number(c.padding ?? 6);
  const borderRadius = Number(c.borderRadius ?? 4);
  const maxWidth = Number(c.maxWidth ?? 200);
  const triggerText = String(c.triggerText ?? "悬停查看");
  const triggerColor = String(c.triggerColor ?? "rgba(255,255,255,0.7)");
  const iconColor = String(c.iconColor ?? "") || triggerColor;
  const triggerUnderline = c.triggerUnderline !== false;

  const uid = `tip-${Math.random().toString(36).slice(2, 9)}`;

  const isApi = String(c.dataMode ?? "static") === "api"
    && (String(c.apiUrl ?? "") || String(c.apiPath ?? ""));
  const textField = String(c.textField ?? "text");
  const textId = `${uid}-txt`;

  // 浮层定位
  const posMap: Record<string, string> = {
    top: `bottom:100%;left:50%;transform:translateX(-50%);margin-bottom:8px`,
    bottom: `top:100%;left:50%;transform:translateX(-50%);margin-top:8px`,
    left: `right:100%;top:50%;transform:translateY(-50%);margin-right:8px`,
    right: `left:100%;top:50%;transform:translateY(-50%);margin-left:8px`,
  };

  // 箭头
  const arrowMap: Record<string, { pos: string; border: string }> = {
    top: { pos: "bottom:-5px;left:50%;transform:translateX(-50%)", border: `border-top:6px solid ${bgColor};border-left:6px solid transparent;border-right:6px solid transparent` },
    bottom: { pos: "top:-5px;left:50%;transform:translateX(-50%)", border: `border-bottom:6px solid ${bgColor};border-left:6px solid transparent;border-right:6px solid transparent` },
    left: { pos: "right:-5px;top:50%;transform:translateY(-50%)", border: `border-left:6px solid ${bgColor};border-top:6px solid transparent;border-bottom:6px solid transparent` },
    right: { pos: "left:-5px;top:50%;transform:translateY(-50%)", border: `border-right:6px solid ${bgColor};border-top:6px solid transparent;border-bottom:6px solid transparent` },
  };
  const arrow = arrowMap[placement] ?? arrowMap.top;

  const arrowHTML = showArrow
    ? `<span style="position:absolute;${arrow.pos};width:0;height:0;${arrow.border}"></span>`
    : "";

  const tooltipHTML = `<div class="${uid}-tip" style="position:absolute;${posMap[placement]};background:${bgColor};color:${textColor};font-size:${fontSize}px;padding:${padding}px 10px;border-radius:${borderRadius}px;max-width:${maxWidth}px;white-space:normal;word-break:break-word;z-index:9999;box-shadow:0 2px 8px rgba(0,0,0,0.3);pointer-events:none;display:none"><span id="${isApi ? textId : ""}" style="font-size:inherit;color:inherit;line-height:1.4">${escapeHTML(text)}</span>${arrowHTML}</div>`;

  // 触发元素按形态渲染
  let triggerHTML = "";
  if (triggerStyle === "icon") {
    triggerHTML = `<span style="display:inline-flex;align-items:center;line-height:1">${renderMenuIcon(triggerIcon, triggerIconSize, ctx)}</span>`;
  } else if (triggerStyle === "text") {
    triggerHTML = `<span style="font-size:13px;color:${triggerColor};${triggerUnderline ? "text-decoration:underline dotted" : ""};cursor:pointer;user-select:none">${escapeHTML(triggerText)}</span>`;
  } else {
    triggerHTML = `<span style="display:inline-flex;align-items:center;gap:4px;color:${triggerColor}"><span style="display:inline-flex;align-items:center;line-height:1;color:${iconColor}">${renderMenuIcon(triggerIcon, triggerIconSize, ctx)}</span><span style="font-size:13px;color:${triggerColor};${triggerUnderline ? "text-decoration:underline dotted" : ""};cursor:pointer;user-select:none">${escapeHTML(triggerText)}</span></span>`;
  }

  const event = trigger === "click"
    ? `wrapper.addEventListener("click", function(e){ e.stopPropagation(); var t=document.querySelector('.${uid}-tip'); if(t) t.style.display = t.style.display === 'none' ? 'block' : 'none'; });`
    : `wrapper.addEventListener("mouseenter", function(){ var t=document.querySelector('.${uid}-tip'); if(t) t.style.display='block'; }); wrapper.addEventListener("mouseleave", function(){ var t=document.querySelector('.${uid}-tip'); if(t) t.style.display='none'; });`;

  let script = `
<script>
(function(){
  var wrapper = document.querySelector('.${uid}');
  if(!wrapper) return;
  ${event}
  document.addEventListener("click", function(e){
    if(!wrapper.contains(e.target)){
      var t=document.querySelector('.${uid}-tip');
      if(t) t.style.display='none';
    }
  });
})();
</script>`;

  // API 模式：按字段路径更新提示内容
  if (isApi) {
    script += `
<script>
(function(){
  var tipEl = document.getElementById("${textId}");
  var textField = ${JSON.stringify(textField)};
  function deepGet(src, path){
    if (!path || src == null) return undefined;
    var cur = src; var keys = String(path).split(".").map(function(s){ return s.trim(); }).filter(Boolean);
    for (var i=0;i<keys.length;i++){ var m=keys[i].match(/^(\\w+)\\[(\\d+)\\]$/); if(m&&Array.isArray(cur))cur=cur[Number(m[2])]; else if(cur&&typeof cur==="object")cur=cur[keys[i]]; else return undefined; }
    return cur;
  }
  function toText(v){ if(v==null)return ""; if(typeof v==="object")return JSON.stringify(v); return String(v); }
  window["__wcTip_${uid}"] = function(data){
    var v = deepGet(data, textField);
    if (v !== undefined && tipEl) tipEl.textContent = toText(v);
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
      renderBody: `if (window["__wcTip_${uid}"]) window["__wcTip_${uid}"](data);`,
    });
  }

  return `<div class="${uid}" style="position:relative;display:inline-flex;align-items:center;width:100%;height:100%">${triggerHTML}${tooltipHTML}${script}</div>`;
};