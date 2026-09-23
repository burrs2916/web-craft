import type { ComponentCodegenFn } from "../types";
import { escapeHTML } from "../layout";
import { renderMenuIcon } from "../iconPipeline";
import { MATERIAL_ICON_PATHS } from "../materialIcons";
import { dataLoaderScript } from "../dataLoader";
import { readAuthEnabled } from "../../editor/data/authMode";

interface ListItem {
  text: string;
  subtext: string;
  icon: string;
  avatarUrl: string;
  badge: string;
}

const DEFAULT_ITEMS: ListItem[] = [
  { text: "列表项一", subtext: "", icon: "star", avatarUrl: "", badge: "" },
  { text: "列表项二", subtext: "", icon: "info", avatarUrl: "", badge: "" },
  { text: "列表项三", subtext: "", icon: "check_circle", avatarUrl: "", badge: "" },
];

function parseItems(input: unknown): ListItem[] {
  if (Array.isArray(input) && input.length > 0) {
    return input.map((item, i) => ({
      text: String((item as Record<string, unknown>)?.text ?? (item as Record<string, unknown>)?.title ?? `列表项 ${i + 1}`),
      subtext: String((item as Record<string, unknown>)?.subtext ?? (item as Record<string, unknown>)?.desc ?? ""),
      icon: String((item as Record<string, unknown>)?.icon ?? ""),
      avatarUrl: String((item as Record<string, unknown>)?.avatarUrl ?? (item as Record<string, unknown>)?.avatar ?? ""),
      badge: String((item as Record<string, unknown>)?.badge ?? ""),
    }));
  }
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((item: Record<string, unknown>, i: number) => ({
            text: String(item?.text ?? item?.title ?? `列表项 ${i + 1}`),
            subtext: String(item?.subtext ?? item?.desc ?? ""),
            icon: String(item?.icon ?? ""),
            avatarUrl: String(item?.avatarUrl ?? item?.avatar ?? ""),
            badge: String(item?.badge ?? ""),
          }));
        }
        if (Array.isArray(parsed) && parsed.length === 0) {
          return [{ text: "列表项 1", subtext: "", icon: "", avatarUrl: "", badge: "" }];
        }
      } catch {
        // fall through
      }
    }
    const lines = trimmed.split("\n").map((s) => s.trim()).filter(Boolean);
    if (lines.length > 0) {
      return lines.map((text) => ({ text, subtext: "", icon: "", avatarUrl: "", badge: "" }));
    }
  }
  return [...DEFAULT_ITEMS];
}

/**
 * list 组件 -> HTML
 * 配置：items(JSON), layout, showDivider, showIcon, itemHeight,
 *       textColor/textFontSize/textFontWeight, subtextColor/subtextFontSize,
 *       dividerColor, bgColor, itemBgColor, itemHoverColor,
 *       badgeColor/badgeBgColor, borderEnabled/borderColor/borderWidth/borderRadius,
 *       paddingX/paddingY, gap, iconSize, avatarSize
 * 数据源：dataMode(static|api), staticData, apiUrl/apiPath, apiMethod, apiBody,
 *         apiHeaders, apiInterval, apiDataPath, authEnabled
 */
export const listCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config;

  // ── 数据源配置 ──
  const dataMode = String(c.dataMode ?? "static");
  const isApi = dataMode === "api" && (String(c.apiUrl ?? "") || String(c.apiPath ?? ""));
  const hasExplicitStaticData = c.staticData != null && c.staticData !== "";

  // ── 解析静态列表项 ──
  let items: ListItem[];
  if (hasExplicitStaticData) {
    items = parseItems(c.staticData);
  } else {
    items = parseItems(c.items);
  }

  const layout = String(c.layout ?? "vertical");
  const showDivider = c.showDivider !== false;
  const showIcon = c.showIcon !== false;
  const itemHeight = Number(c.itemHeight ?? 48);
  const textColor = String(c.textColor ?? "rgba(255,255,255,0.85)");
  const textFontSize = Number(c.textFontSize ?? 14);
  const textFontWeight = String(c.textFontWeight ?? "normal");
  const subtextColor = String(c.subtextColor ?? "rgba(255,255,255,0.45)");
  const subtextFontSize = Number(c.subtextFontSize ?? 12);
  const dividerColor = String(c.dividerColor ?? "rgba(255,255,255,0.08)");
  const bgColor = String(c.bgColor ?? "transparent");
  const itemBgColor = String(c.itemBgColor ?? "transparent");
  const itemHoverColor = String(c.itemHoverColor ?? "rgba(255,255,255,0.04)");
  const badgeColor = String(c.badgeColor ?? "#FF9800");
  const badgeBgColor = String(c.badgeBgColor ?? "rgba(255,152,0,0.15)");
  const borderEnabled = c.borderEnabled === true;
  const borderColor = String(c.borderColor ?? "rgba(255,255,255,0.1)");
  const borderWidth = Number(c.borderWidth ?? 1);
  const borderRadius = Number(c.borderRadius ?? 6);
  const paddingX = Number(c.paddingX ?? 0);
  const paddingY = Number(c.paddingY ?? 0);
  const gap = Number(c.gap ?? 0);
  const iconSize = Number(c.iconSize ?? 20);
  const avatarSize = Number(c.avatarSize ?? 36);

  const isHorizontal = layout === "horizontal";

  const uid = `lst-${Math.random().toString(36).slice(2, 9)}`;

  // Build items HTML
  function buildItemHTML(item: ListItem, index: number, total: number): string {
    const showDiv = showDivider && index < total - 1;
    const divBorder = showDiv
      ? isHorizontal
        ? `border-right:1px solid ${dividerColor};`
        : `border-bottom:1px solid ${dividerColor};`
      : "";

    const itemStyle = [
      "display:flex",
      "align-items:center",
      "gap:10px",
      `min-height:${itemHeight}px`,
      "padding:0 12px",
      `background:${itemBgColor}`,
      "flex-shrink:0",
      "box-sizing:border-box",
      "transition:background-color 0.15s",
      divBorder,
      isHorizontal ? "" : "width:100%",
    ].filter(Boolean).join(";");

    let inner = "";

    if (showIcon) {
      if (item.avatarUrl) {
        inner += `<img src="${escapeHTML(item.avatarUrl)}" alt="" style="width:${avatarSize}px;height:${avatarSize}px;border-radius:50%;object-fit:cover;flex-shrink:0" />`;
      } else if (item.icon) {
        const iconHTML = renderMenuIcon(item.icon, iconSize, ctx);
        inner += `<span style="width:${iconSize}px;height:${iconSize}px;display:flex;align-items:center;justify-content:center;color:${textColor};flex-shrink:0">${iconHTML}</span>`;
      }
    }

    inner += `<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px">`;
    inner += `<span style="color:${textColor};font-size:${textFontSize}px;font-weight:${textFontWeight};line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHTML(item.text)}</span>`;
    if (item.subtext) {
      inner += `<span style="color:${subtextColor};font-size:${subtextFontSize}px;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHTML(item.subtext)}</span>`;
    }
    inner += `</div>`;

    if (item.badge) {
      inner += `<span style="color:${badgeColor};background:${badgeBgColor};font-size:11px;font-weight:600;padding:2px 8px;border-radius:10px;flex-shrink:0;white-space:nowrap">${escapeHTML(item.badge)}</span>`;
    }

    return `<div class="${uid}-item" style="${itemStyle}">${inner}</div>`;
  }

  let itemsHTML = "";
  // 接口模式：不渲染编译期本地条目，等待接口数据驱动（避免数据到达前闪现占位内容）
  if (!isApi) {
    items.forEach((item, i) => {
      itemsHTML += buildItemHTML(item, i, items.length);
    });
  }

  const hoverCSS = `<style>.${uid}-item:hover{background:${itemHoverColor} !important}</style>`;

  const innerStyle = [
    "display:flex",
    `flex-direction:${isHorizontal ? "row" : "column"}`,
    `gap:${gap}px`,
    isHorizontal ? "height:100%" : "",
  ].filter(Boolean).join(";");

  const outerStyle = [
    "width:100%",
    "height:100%",
    "overflow:auto",
    `background:${bgColor}`,
    `border-radius:${borderRadius}px`,
    borderEnabled ? `border:${borderWidth}px solid ${borderColor}` : "",
    `padding:${paddingY}px ${paddingX}px`,
    "box-sizing:border-box",
  ].filter(Boolean).join(";");

  // ── API 模式：mount 脚本（运行时重建列表项，图标走内嵌 renderIcon）+ dataLoaderScript 统一取数骨架 ──
  let apiScript = "";
  if (isApi) {
    const apiUrl = String(c.apiUrl ?? "");
    const apiPath = String(c.apiPath ?? "");
    const apiMethod = String(c.apiMethod ?? "GET");
    const apiInterval = Number(c.apiInterval ?? 0) || 0;
    const apiDataPath = String(c.apiDataPath ?? "");
    const apiHeaders = String(c.apiHeaders ?? "");
    const apiBody = String(c.apiBody ?? "");
    const authEnabled = readAuthEnabled(c.authEnabled);

    const mountScript = `<script>
(function(){
  var el = document.getElementById("${uid}-inner");
  if (!el) return;
  var iconPaths = ${JSON.stringify(MATERIAL_ICON_PATHS)};
  var isHorizontal = ${isHorizontal};
  var showDivider = ${showDivider};
  var showIcon = ${showIcon};
  var itemHeight = ${itemHeight};
  var textColor = ${JSON.stringify(textColor)};
  var textFontSize = ${textFontSize};
  var textFontWeight = ${JSON.stringify(textFontWeight)};
  var subtextColor = ${JSON.stringify(subtextColor)};
  var subtextFontSize = ${subtextFontSize};
  var dividerColor = ${JSON.stringify(dividerColor)};
  var itemBgColor = ${JSON.stringify(itemBgColor)};
  var badgeColor = ${JSON.stringify(badgeColor)};
  var badgeBgColor = ${JSON.stringify(badgeBgColor)};
  var iconSize = ${iconSize};
  var avatarSize = ${avatarSize};
  var hoverClass = "${uid}-item";

  function esc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

  // 运行时图标渲染：与编译期 renderMenuIcon 行为对齐（本地 path 表 + widgets 兜底；custom- 仅编译期可渲染）
  function renderIcon(icon, size){
    if (!icon) return "";
    icon = String(icon);
    if (icon.indexOf("custom-") === 0) return "";
    if (/^data:|^https?:\\/\\//i.test(icon)) return '<img src="' + esc(icon) + '" alt="" style="width:' + size + 'px;height:' + size + 'px;object-fit:contain;flex-shrink:0">';
    if (icon.indexOf("text:") === 0) return '<span style="font-size:' + size + 'px;line-height:1;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">' + esc(icon.slice(5)) + '</span>';
    var name = icon.indexOf("material:") === 0 ? icon.slice(9) : icon;
    if (iconPaths[name]) return '<svg viewBox="0 0 24 24" style="width:' + size + 'px;height:' + size + 'px;fill:currentColor;flex-shrink:0" aria-hidden="true">' + iconPaths[name] + '</svg>';
    if (!/^\\p{Emoji}/u.test(name)) return '<svg viewBox="0 0 24 24" style="width:' + size + 'px;height:' + size + 'px;fill:currentColor;flex-shrink:0" aria-hidden="true">' + iconPaths.widgets + '</svg>';
    return '<span style="font-size:' + size + 'px;line-height:1;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">' + esc(name) + '</span>';
  }

  function buildItemHTML(item, index, total) {
    var showDiv = showDivider && index < total - 1;
    var divBorder = showDiv ? (isHorizontal ? "border-right:1px solid " + dividerColor + ";" : "border-bottom:1px solid " + dividerColor + ";") : "";
    var itemStyle = ["display:flex","align-items:center","gap:10px","min-height:" + itemHeight + "px","padding:0 12px","background:" + itemBgColor,"flex-shrink:0","box-sizing:border-box","transition:background-color 0.15s",divBorder,isHorizontal ? "" : "width:100%"].filter(Boolean).join(";");
    var inner = "";
    if (showIcon) {
      if (item.avatarUrl) {
        inner += '<img src="' + esc(item.avatarUrl) + '" alt="" style="width:' + avatarSize + 'px;height:' + avatarSize + 'px;border-radius:50%;object-fit:cover;flex-shrink:0" />';
      } else if (item.icon) {
        inner += '<span style="width:' + iconSize + 'px;height:' + iconSize + 'px;display:flex;align-items:center;justify-content:center;color:' + textColor + ';flex-shrink:0">' + renderIcon(item.icon, iconSize) + '</span>';
      }
    }
    inner += '<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px">';
    inner += '<span style="color:' + textColor + ';font-size:' + textFontSize + 'px;font-weight:' + textFontWeight + ';line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(item.text || "") + '</span>';
    if (item.subtext) {
      inner += '<span style="color:' + subtextColor + ';font-size:' + subtextFontSize + 'px;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(item.subtext) + '</span>';
    }
    inner += '</div>';
    if (item.badge) {
      inner += '<span style="color:' + badgeColor + ';background:' + badgeBgColor + ';font-size:11px;font-weight:600;padding:2px 8px;border-radius:10px;flex-shrink:0;white-space:nowrap">' + esc(item.badge) + '</span>';
    }
    return '<div class="' + hoverClass + '" style="' + itemStyle + '">' + inner + '</div>';
  }

  function parseItems(data) {
    var items = [];
    if (Array.isArray(data)) {
      for (var i = 0; i < data.length; i++) {
        var d = data[i];
        if (d && typeof d === "object") {
          items.push({
            text: d.text != null ? String(d.text) : (d.title != null ? String(d.title) : "列表项 " + (i + 1)),
            subtext: d.subtext != null ? String(d.subtext) : (d.desc != null ? String(d.desc) : ""),
            icon: d.icon != null ? String(d.icon) : "",
            avatarUrl: d.avatarUrl != null ? String(d.avatarUrl) : (d.avatar != null ? String(d.avatar) : ""),
            badge: d.badge != null ? String(d.badge) : ""
          });
        } else if (d != null) {
          items.push({ text: String(d), subtext: "", icon: "", avatarUrl: "", badge: "" });
        }
      }
    }
    return items;
  }

  function mount(data){
    if (data == null) return;
    var raw = Array.isArray(data) ? data : (data && (data.items || data.list)) ? (data.items || data.list) : [data];
    var list = parseItems(raw);
    var html = "";
    for (var i = 0; i < list.length; i++) {
      html += buildItemHTML(list[i], i, list.length);
    }
    el.innerHTML = html;
  }

  window["__wcLst_${uid}"] = mount;
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
      renderBody: `if (window["__wcLst_${uid}"]) window["__wcLst_${uid}"](data);`,
    });

    apiScript = mountScript + loader;
  }

  return `<div style="${outerStyle}"><div id="${uid}-inner" style="${innerStyle}">${itemsHTML}</div>${hoverCSS}</div>${apiScript}`;
};
