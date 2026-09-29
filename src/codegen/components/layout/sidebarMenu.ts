import type { ComponentCodegenFn } from "../../types";
import { parseMenuItems } from "../../../editor/utils/menuItems";
import { renderMenuIcon } from "../../iconPipeline";
import { escapeHTML } from "../../layout";
import { applyOpacity, resolveMenuLink } from "./shared";
import type { MenuItem } from "../../../editor/utils/menuItems";

/**
 * sidebar-menu 侧边栏菜单（垂直）→ HTML
 */
export const sidebarMenuCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config;

  const verticalAlign = String(c.verticalAlign ?? "flex-start");

  const items = parseMenuItems(c.menuItems);
  const activeKey = String(c.activeKey ?? c.activeIndex ?? 0);
  const pages = ctx.scene.views ?? [];

  const menuColor = String(c.menuColor ?? "rgba(255,255,255,0.85)");
  const menuActiveColor = String(c.menuActiveColor ?? "#FF9800");
  const menuFontSize = Number(c.menuFontSize ?? 14);
  const menuFontWeight = String(c.menuFontWeight ?? "normal");
  const menuActiveWeight = String(c.menuActiveWeight ?? "600");
  const menuGap = Number(c.menuGap ?? 4);
  const itemHeight = Number(c.itemHeight ?? 40);
  const itemIconSize = Number(c.itemIconSize ?? 16);
  const itemIndent = Number(c.itemIndent ?? 24);
  const itemBgEnabled = c.itemBgEnabled !== false;
  const itemActiveBg = String(c.itemActiveBg ?? "rgba(255,152,0,0.15)");
  const itemPaddingX = Number(c.itemPaddingX ?? 12);
  const itemRadius = Number(c.itemRadius ?? 6);
  const indicatorEnabled = c.indicatorEnabled === true && !itemBgEnabled;
  const indicatorWidth = Number(c.indicatorWidth ?? 3);
  const indicatorColor = c.indicatorColor ? String(c.indicatorColor) : menuActiveColor;
  const dividerEnabled = c.dividerEnabled === true;
  const dividerColor = String(c.dividerColor ?? "rgba(255,255,255,0.1)");
  const dividerWidth = Number(c.dividerWidth ?? 1);

  // 外层样式
  const outerStyles: string[] = [
    "width: 100%",
    "height: 100%",
    "display: flex",
    "flex-direction: column",
    `justify-content: ${verticalAlign}`,
    "align-items: stretch",
    `padding: ${c.paddingY ?? 8}px ${c.paddingX ?? 8}px`,
    "box-sizing: border-box",
    `overflow-y: ${c.overflow ?? "auto"}`,
    "overflow-x: hidden",
    `gap: ${dividerEnabled ? 0 : menuGap}px`,
    `background: ${applyOpacity(String(c.backgroundColor ?? "rgba(30,30,50,0.9)"), Number(c.backgroundOpacity ?? 100))}`,
  ];
  if (c.blurEnabled) {
    outerStyles.push(`backdrop-filter: blur(${c.blurAmount ?? 12}px)`, `-webkit-backdrop-filter: blur(${c.blurAmount ?? 12}px)`);
  }
  if (c.borderEnabled) {
    outerStyles.push(`border: ${c.borderWidth ?? 1}px ${c.borderStyle ?? "solid"} ${c.borderColor ?? "rgba(255,255,255,0.1)"}`);
  }
  if (c.borderRadius !== undefined) outerStyles.push(`border-radius: ${c.borderRadius}px`);
  if (c.shadowEnabled) {
    const sx = c.shadowOffsetX ?? 0, sy = c.shadowOffsetY ?? 4, blur = c.shadowBlur ?? 12, sp = c.shadowSpread ?? 0, col = c.shadowColor ?? "rgba(0,0,0,0.3)";
    outerStyles.push(`box-shadow: ${sx}px ${sy}px ${blur}px ${sp}px ${col}`);
  }

  function renderItem(item: MenuItem, key: string, depth: number, isActive: boolean): string {
    // 分割符项
    if (item.isDivider) {
      if (item.groupTitle) {
        return `<div style="display:flex;align-items:center;padding:0 ${itemPaddingX}px"><span style="font-size:11px;color:rgba(255,255,255,0.4);font-weight:500;white-space:nowrap;text-transform:uppercase;letter-spacing:0.05em;padding-right:8px">${escapeHTML(item.groupTitle)}</span><span style="flex:1;height:${dividerWidth}px;background:${dividerColor}"></span></div>`;
      }
      return `<div style="height:${dividerWidth}px;background:${dividerColor};margin:${menuGap / 2}px ${itemPaddingX}px"></div>`;
    }

    const hasChildren = item.children && item.children.length > 0;
    const color = item.disabled ? "rgba(255,255,255,0.3)" : isActive ? menuActiveColor : (item.color || menuColor);
    const weight = isActive ? menuActiveWeight : menuFontWeight;
    const indent = depth * itemIndent;

    const itemStyles: string[] = [
      "display: flex",
      "align-items: center",
      "justify-content: space-between",
      `gap: ${item.gap ?? 8}px`,
      `color: ${color}`,
      `font-size: ${item.fontSize ?? menuFontSize}px`,
      `font-weight: ${weight}`,
      "white-space: nowrap",
      "cursor: pointer",
      "line-height: 1.2",
      "transition: all 0.2s",
      "box-sizing: border-box",
      "user-select: none",
      "flex-shrink: 0",
      `height: ${itemHeight}px`,
      `padding-left: ${itemPaddingX + indent}px`,
      `padding-right: ${itemPaddingX}px`,
      `background-color: ${itemBgEnabled && isActive ? itemActiveBg : "transparent"}`,
      `border-radius: ${itemRadius}px`,
    ];
    if (indicatorEnabled) {
      const bw = isActive ? indicatorWidth : 0;
      itemStyles.push(`border-left: ${bw}px solid ${isActive ? indicatorColor : "transparent"}`);
    }
    if (item.disabled) itemStyles.push("opacity: 0.5", "cursor: not-allowed");

    // hoverBg + description
    const hoverJs = item.hoverBg
      ? ` onmouseenter="this.dataset.bg=this.style.backgroundColor;this.style.backgroundColor='${item.hoverBg}'" onmouseleave="this.style.backgroundColor=this.dataset.bg||''"`
      : "";
    const titleAttr = item.description ? ` title="${escapeHTML(item.description)}"` : "";

    let leftHTML = "";
    if (item.icon) {
      const iconHTML = renderMenuIcon(item.icon, itemIconSize, ctx);
      leftHTML += item.iconColor
        ? `<span style="display:inline-flex;align-items:center;color:${item.iconColor}">${iconHTML}</span>`
        : iconHTML;
    }
    leftHTML += `<span style="font-size: inherit; font-weight: inherit; line-height: 1; overflow: hidden; text-overflow: ellipsis">${escapeHTML(item.label)}</span>`;
    if (item.badge) {
      leftHTML += `<span style="display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:16px;padding:0 4px;border-radius:99px;font-size:10px;font-weight:600;line-height:1;background:${item.badgeBg ?? "#f44336"};color:${item.badgeColor ?? "#fff"};flex-shrink:0">${escapeHTML(item.badge)}</span>`;
    }

    let rightHTML = "";
    const arrowSize = Math.max(14, Math.round(menuFontSize));
    if (item.shortcut) {
      rightHTML += `<span style="font-size:10px;color:currentColor;opacity:0.5;flex-shrink:0;padding:0 4px;border:1px solid rgba(255,255,255,0.15);border-radius:3px;line-height:14px;white-space:nowrap">${escapeHTML(item.shortcut)}</span>`;
    }
    if (hasChildren) {
      // 箭头初始方向与子菜单折叠状态同步：子菜单默认收起（display:none），
      // 箭头初始即为收起方向(0deg)，由点击脚本切换到展开方向(90deg)。
      // 不能用 isActive 驱动，否则激活项子菜单收起时箭头却显示为展开，方向矛盾。
      rightHTML += `<svg data-toggle="submenu" class="wc-arrow" width="${arrowSize}" height="${arrowSize}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; cursor: pointer; transition: transform 0.2s; display: inline-block; opacity: 0.7"><polyline points="9 6 15 12 9 18"></polyline></svg>`;
    }

    const leftWrap = `<div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1; overflow: hidden">${leftHTML}</div>`;
    // 链接项渲染为真实 <a>（站内页面 → 视图文件名，外部链接 → 原始 URL）
    // pane 类型无 href 但有 data-pane-link，渲染为 div 仍带该属性
    const link = resolveMenuLink(item, pages, ctx.preview);
    let html: string;
    if (link.href && !item.disabled) {
      const targetAttr = item.linkType === "url" && item.newTab !== false ? ' target="_blank" rel="noopener"' : "";
      itemStyles.push("text-decoration: none");
      html = `<a href="${escapeHTML(link.href)}"${link.extraAttrs}${targetAttr}${titleAttr}${hoverJs} data-menu-item style="${itemStyles.filter(Boolean).join("; ")}">${leftWrap}${rightHTML}</a>`;
    } else {
      html = `<div${link.extraAttrs}${titleAttr}${hoverJs} data-menu-item${item.disabled ? ' data-disabled="true"' : ""} style="${itemStyles.filter(Boolean).join("; ")}">${leftWrap}${rightHTML}</div>`;
    }

    // 子菜单（全部渲染，默认展开当前激活项）
    if (hasChildren && item.children) {
      const childrenHTML = item.children.map((child, i) =>
        renderItem(child, `${key}-${i}`, depth + 1, activeKey === `${key}-${i}`)
      ).join("");
      const subDisplay = "none";
      html += `<div data-submenu style="display: ${subDisplay}; flex-direction: column; overflow: hidden">${childrenHTML}</div>`;
    }

    // 分割线
    if (dividerEnabled) {
      html += `<div style="height: ${dividerWidth}px; background: ${dividerColor}; margin: ${menuGap / 2}px 0"></div>`;
    }

    return html;
  }

  const itemsHTML = items.map((item, i) =>
    renderItem(item, String(i), 0, activeKey === String(i) || activeKey.startsWith(`${i}-`))
  ).join("");
  const toggleStyle = "<style>.wc-arrow{display:inline-block}.wc-arrow-expanded{transform:rotate(90deg)}</style>";
  const toggleScript = `<script>(function(){if(window.__wcSidebarInit)return;window.__wcSidebarInit=true;document.addEventListener('click',function(e){var t=e.target.closest('[data-wc-sidebar] [data-toggle="submenu"]');if(!t)return;e.preventDefault();var mi=t.closest('[data-menu-item]');if(!mi)return;var sm=mi.nextElementSibling;if(!sm||!sm.hasAttribute('data-submenu'))return;var h=sm.style.display==='none';sm.style.display=h?'flex':'none';if(h)t.classList.add('wc-arrow-expanded');else t.classList.remove('wc-arrow-expanded')})})()</script>`;
  return `<div data-wc-sidebar style="${outerStyles.filter(Boolean).join("; ")}">${itemsHTML}${toggleStyle}${toggleScript}</div>`;
};

