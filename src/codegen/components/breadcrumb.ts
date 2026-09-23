import type { ComponentCodegenFn } from "../types";
import { escapeHTML } from "../layout";
import { renderMenuIcon } from "../iconPipeline";
import { dataLoaderScript } from "../dataLoader";
import { parseBreadcrumbItems, DEFAULT_CRUMB_ITEMS, type BreadcrumbMapping } from "../../editor/data/breadcrumbsData";
import { readAuthEnabled } from "../../editor/data/authMode";
import { jsonTextField } from "../../editor/data/requestExtras";

/**
 * breadcrumb 组件 -> HTML
 * 配置：items(JSON), separator(chevron/text), separatorText, textColor, activeColor,
 *       fontSize, fontWeight, iconColor, bgColor, paddingX, paddingY,
 *       borderRadius, borderEnabled, borderColor, borderWidth
 * 数据源：dataMode(static/api)、staticData、apiUrl/apiPath/apiMethod/apiDataPath/
 *        apiHeaders/apiBody/apiInterval/authEnabled
 */
export const breadcrumbCodegen: ComponentCodegenFn = (
  component,
  ctx,
) => {
  const c = component.config;

  const mapping: BreadcrumbMapping = {
    labelField: String(c.itemLabelField ?? "") || undefined,
    hrefField: String(c.itemHrefField ?? "") || undefined,
    iconField: String(c.itemIconField ?? "") || undefined,
  };
  const mappedItems = parseBreadcrumbItems(c.items, mapping);
  const items = mappedItems.length > 0 ? mappedItems : [...DEFAULT_CRUMB_ITEMS];
  const separator = String(c.separator ?? "chevron");
  const separatorText = String(c.separatorText ?? "/");
  const textColor = String(c.textColor ?? "rgba(255,255,255,0.6)");
  const activeColor = String(c.activeColor ?? "#ffffff");
  const fontSize = Number(c.fontSize ?? 14);
  const fontWeight = String(c.fontWeight ?? "normal");
  const iconColor = String(c.iconColor ?? "rgba(255,255,255,0.3)");
  const bgColor = String(c.bgColor ?? "transparent");
  const paddingX = Number(c.paddingX ?? 12);
  const paddingY = Number(c.paddingY ?? 8);
  const borderRadius = Number(c.borderRadius ?? 6);
  const borderEnabled = c.borderEnabled === true;
  const borderColor = String(c.borderColor ?? "rgba(255,255,255,0.1)");
  const borderWidth = Number(c.borderWidth ?? 1);

  const isApi = String(c.dataMode ?? "static") === "api"
    && (String(c.apiUrl ?? "") || String(c.apiPath ?? ""));
  const uid = `bc-${Math.random().toString(36).slice(2, 9)}`;

  const sepHTML = separator === "text"
    ? `<span style="color:${iconColor};font-size:${fontSize}px;margin:0 6px;user-select:none">${escapeHTML(separatorText)}</span>`
    : `<svg viewBox="0 0 24 24" fill="currentColor" style="color:${iconColor};width:${fontSize + 4}px;height:${fontSize + 4}px;margin:0 2px;user-select:none"><path d="M9.29 6.71a1 1 0 0 0 0 1.41L13.17 12l-3.88 3.88a1 1 0 1 0 1.41 1.41l4.59-4.59a1 1 0 0 0 0-1.41L10.7 6.7a1 1 0 0 0-1.41 0z"/></svg>`;

  let crumbsHTML = "";
  // 接口模式：不渲染编译期本地面包屑，等待接口数据驱动
  if (!isApi) {
    items.forEach((item, i) => {
      const isLast = i === items.length - 1;
      const color = isLast ? activeColor : textColor;
      const weight = isLast ? "bold" : fontWeight;
      const crumbStyle = `color:${color};font-size:${fontSize}px;font-weight:${weight};cursor:${item.href ? "pointer" : "default"};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:color 0.15s`;
      const iconHTML = item.icon
        ? `<span style="display:inline-flex;align-items:center;color:${color};margin-right:6px;vertical-align:middle">${renderMenuIcon(item.icon, Math.round(fontSize * 1.15), ctx)}</span>`
        : "";

      if (item.href) {
        const newTab = item.newTab ? ' target="_blank" rel="noopener"' : "";
        crumbsHTML += `<a href="${escapeHTML(item.href)}"${newTab} style="text-decoration:none;${crumbStyle}">${iconHTML}${escapeHTML(item.label)}</a>`;
      } else {
        crumbsHTML += `<span style="${crumbStyle}">${iconHTML}${escapeHTML(item.label)}</span>`;
      }
      if (!isLast) {
        crumbsHTML += sepHTML;
      }
    });
  }

  const outerStyle = [
    "width:100%",
    "height:100%",
    "display:flex",
    "align-items:center",
    `background:${bgColor}`,
    `border-radius:${borderRadius}px`,
    borderEnabled ? `border:${borderWidth}px solid ${borderColor}` : "",
    `padding:${paddingY}px ${paddingX}px`,
    "box-sizing:border-box",
    "overflow:hidden",
  ].filter(Boolean).join(";");

  // ── API 模式：mount 脚本（运行时重绘面包屑）+ dataLoaderScript 统一取数骨架 ──
  let apiScript = "";
  if (isApi) {
    const apiUrl = String(c.apiUrl ?? "");
    const apiPath = String(c.apiPath ?? "");
    const apiMethod = String(c.apiMethod ?? "GET");
    const apiInterval = Number(c.apiInterval ?? 0) || 0;
    const apiDataPath = String(c.apiDataPath ?? "");
    // 走唯一口径：此前 `JSON.stringify(v ?? {})` 会把**字符串**二次编码 → 运行时 parse 出字符串本身
    // → `for (var k in extra)` 逐字符展开成垃圾请求头（见 editor/data/requestExtras.ts 注释）
    const apiHeaders = jsonTextField(c.apiHeaders);
    const apiBody = jsonTextField(c.apiBody);
    const authEnabled = readAuthEnabled(c.authEnabled);

    const mountScript = `<script>
(function(){
  var el = document.getElementById("${uid}-inner");
  if (!el) return;
  var separator = ${JSON.stringify(separator)};
  var separatorText = ${JSON.stringify(separatorText)};
  var textColor = ${JSON.stringify(textColor)};
  var activeColor = ${JSON.stringify(activeColor)};
  var fontSize = ${fontSize};
  var fontWeight = ${JSON.stringify(fontWeight)};
  var iconColor = ${JSON.stringify(iconColor)};
  var labelField = ${JSON.stringify(mapping.labelField || "")};
  var hrefField = ${JSON.stringify(mapping.hrefField || "")};
  var iconField = ${JSON.stringify(mapping.iconField || "")};

  function esc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

  function pick(o, path){
    if (!path || o == null || typeof o !== "object") return undefined;
    var p = path.split("."), cur = o;
    for (var i = 0; i < p.length; i++) {
      if (cur == null || typeof cur !== "object") return undefined;
      cur = cur[p[i]];
    }
    return cur;
  }

  function parseItems(data) {
    var arr = data;
    if (typeof data === "string") {
      arr = null;
      var t = data.trim();
      if (t.charAt(0) === "[") { try { arr = JSON.parse(t); } catch(e) { arr = null; } }
      if (arr == null) { arr = t.split("\\n").map(function(s){ return s.trim(); }).filter(Boolean); }
    }
    if (!Array.isArray(arr)) return [];
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var d = arr[i];
      out.push({
        label: d && typeof d === "object"
          ? String(pick(d, labelField) != null ? pick(d, labelField) : (d.label != null ? d.label : (d.text != null ? d.text : (d.title != null ? d.title : (d.name != null ? d.name : "面包屑 " + (i + 1))))))
          : String(d),
        href: d && typeof d === "object"
          ? String(pick(d, hrefField) != null ? pick(d, hrefField) : (d.href != null ? d.href : (d.link != null ? d.link : (d.url != null ? d.url : (d.path != null ? d.path : "")))))
          : "",
        icon: d && typeof d === "object"
          ? String(pick(d, iconField) != null ? pick(d, iconField) : (d.icon != null ? d.icon : (d.iconName != null ? d.iconName : ""))) || ""
          : "",
        newTab: !!(d && typeof d === "object" && d.newTab === true)
      });
    }
    return out;
  }

  function buildCrumb(item, i, total) {
    var isLast = i === total - 1;
    var color = isLast ? activeColor : textColor;
    var weight = isLast ? "bold" : fontWeight;
    var style = ["color:" + color,"font-size:" + fontSize + "px","font-weight:" + weight,"cursor:" + (item.href ? "pointer" : "default"),"white-space:nowrap","overflow:hidden","text-overflow:ellipsis","transition:color 0.15s"].join(";");
    var label = item.href
      ? '<a href="' + esc(item.href) + '"' + (item.newTab ? ' target="_blank" rel="noopener"' : "") + ' style="text-decoration:none;' + style + '">' + esc(item.label) + "</a>"
      : '<span style="' + style + '">' + esc(item.label) + "</span>";
    if (!isLast) {
      label += separator === "text"
        ? '<span style="color:' + iconColor + ';font-size:' + fontSize + 'px;margin:0 6px;user-select:none">' + esc(separatorText) + "</span>"
        : '<svg viewBox="0 0 24 24" fill="currentColor" style="color:' + iconColor + ';width:' + (fontSize + 4) + 'px;height:' + (fontSize + 4) + 'px;margin:0 2px;user-select:none"><path d="M9.29 6.71a1 1 0 0 0 0 1.41L13.17 12l-3.88 3.88a1 1 0 1 0 1.41 1.41l4.59-4.59a1 1 0 0 0 0-1.41L10.7 6.7a1 1 0 0 0-1.41 0z"/></svg>';
    }
    return label;
  }

  function render(){
    var html = "";
    for (var i = 0; i < items.length; i++) {
      html += buildCrumb(items[i], i, items.length);
    }
    el.innerHTML = html;
  }

  // 响应形态（与编辑器 BreadcrumbRenderer 的 parseBreadcrumbItems 对齐）：
  // 数组/JSON 字符串 → 面包屑列表；对象 → 按明确键序解包（items|list|breadcrumbs|crumbs|data）
  function mount(data){
    if (data == null) return;
    var newItems = [];
    if (Array.isArray(data) || typeof data === "string") {
      newItems = parseItems(data);
    } else if (data && typeof data === "object") {
      var raw = null;
      if (Array.isArray(data.breadcrumbs)) raw = data.breadcrumbs;
      else if (Array.isArray(data.crumbs)) raw = data.crumbs;
      else if (Array.isArray(data.items)) raw = data.items;
      else if (Array.isArray(data.list)) raw = data.list;
      else if (Array.isArray(data.data)) raw = data.data;
      else if (typeof data.data === "string") raw = data.data;
      if (raw != null) newItems = parseItems(raw);
    }
    if (newItems.length > 0) {
      items = newItems;
      render();
    } else {
      el.innerHTML = '<span style="color:' + iconColor + ';font-size:' + fontSize + 'px;font-style:italic">接口暂无数据</span>';
    }
  }

  var items = ${JSON.stringify(items)};
  window["__wcBc_${uid}"] = mount;
})();
</script>`;

    const loader = dataLoaderScript({
      container: `var el = document.getElementById("${uid}-inner");`,
      apiUrl,
      apiPath,
      apiMethod,
      apiHeaders,
      apiBody,
      apiInterval,
      apiDataPath,
      authEnabled,
      renderBody: `if (window["__wcBc_${uid}"]) window["__wcBc_${uid}"](data);`,
    });

    apiScript = mountScript + loader;
  }

  return `<div id="${uid}-inner" style="${outerStyle}">${crumbsHTML}</div>${apiScript}`;
};