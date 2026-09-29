import type { ComponentCodegenFn } from "../../types";
import { parseMenuItems } from "../../../editor/utils/menuItems";
import { renderMenuIcon } from "../../iconPipeline";
import { escapeHTML } from "../../layout";
import { applyOpacity, resolveMenuLink } from "./shared";
import type { MenuItem } from "../../../editor/utils/menuItems";

/**
 * navbar-horizontal 水平导航栏 → HTML
 *
 * 实现模式与 sidebarMenuCodegen 对齐：递归 renderItem + data-menu-item +
 * SVG data-toggle 箭头 + __wcNavbarInit 展开折叠脚本。
 * 水平差异：flex-row、absolute 下拉定位、下划线指示、chevron 向下旋转 180deg。
 */
export const navbarHorizontalCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config;

  const horizontalAlign = String(c.horizontalAlign ?? "center");
  const itemTextAlign = String(c.itemTextAlign ?? "center");

  const items = parseMenuItems(c.menuItems);
  const activeKey = String(c.activeKey ?? c.activeIndex ?? 0);
  const pages = ctx.scene.views ?? [];

  const menuColor = String(c.menuColor ?? "rgba(255,255,255,0.85)");
  const menuActiveColor = String(c.menuActiveColor ?? "#FF9800");
  const menuFontSize = Number(c.menuFontSize ?? 14);
  const menuFontWeight = String(c.menuFontWeight ?? "normal");
  const menuActiveWeight = String(c.menuActiveWeight ?? "600");
  const menuGap = Number(c.menuGap ?? 24);
  const itemIconSize = Number(c.itemIconSize ?? 16);
  const itemPaddingX = Number(c.itemPaddingX ?? 16);
  const itemPaddingY = Number(c.itemPaddingY ?? 8);
  const itemRadius = Number(c.itemRadius ?? 6);
  const itemMinWidth = Number(c.itemMinWidth ?? 0);
  const itemBgEnabled = c.itemBgEnabled === true;
  const itemActiveBg = String(c.itemActiveBg ?? "rgba(255,152,0,0.15)");
  const indicatorEnabled = c.indicatorEnabled !== false && !itemBgEnabled;
  const indicatorWidth = Number(c.indicatorWidth ?? 2);
  const indicatorColor = c.indicatorColor ? String(c.indicatorColor) : menuActiveColor;
  const dividerColor = String(c.dividerColor ?? "rgba(255,255,255,0.1)");
  const dividerWidth = Number(c.dividerWidth ?? 1);
  const subBg = applyOpacity(String(c.backgroundColor ?? "rgba(20,20,40,0.95)"), Number(c.backgroundOpacity ?? 100));

  // 外层样式
  const outerStyles: string[] = [
    "width: 100%",
    "height: 100%",
    "display: flex",
    "flex-direction: row",
    `justify-content: ${horizontalAlign}`,
    "align-items: stretch",
    `padding: ${c.paddingY ?? 0}px ${c.paddingX ?? 16}px`,
    "box-sizing: border-box",
    `overflow: visible`,
    `gap: ${menuGap}px`,
    `background: ${subBg}`,
  ];
  if (c.blurEnabled) {
    outerStyles.push(`backdrop-filter: blur(${c.blurAmount ?? 12}px)`, `-webkit-backdrop-filter: blur(${c.blurAmount ?? 12}px)`);
  }
  if (c.borderEnabled) {
    outerStyles.push(`border: ${c.borderWidth ?? 1}px ${c.borderStyle ?? "solid"} ${c.borderColor ?? "rgba(255,255,255,0.1)"}`);
  }
  if (c.borderRadius !== undefined) outerStyles.push(`border-radius: ${c.borderRadius}px`);
  if (c.shadowEnabled) {
    const sx = c.shadowOffsetX ?? 0, sy = c.shadowOffsetY ?? 2, blur = c.shadowBlur ?? 8, sp = c.shadowSpread ?? 0, col = c.shadowColor ?? "rgba(0,0,0,0.3)";
    outerStyles.push(`box-shadow: ${sx}px ${sy}px ${blur}px ${sp}px ${col}`);
  }

  const textJustify = itemTextAlign === "center" ? "center"
    : itemTextAlign === "right" ? "flex-end"
    : "flex-start";

  // 递归渲染菜单项（对齐 sidebar 模式）
  function renderItem(item: MenuItem, key: string, depth: number, isActive: boolean): string {
    // 分割符项
    if (item.isDivider) {
      if (item.groupTitle) {
        return `<div style="display:flex;align-items:center;align-self:stretch;padding:0 4px"><span style="font-size:11px;color:rgba(255,255,255,0.4);font-weight:500;white-space:nowrap;text-transform:uppercase;letter-spacing:0.05em;padding-right:4px">${escapeHTML(item.groupTitle)}</span><span style="width:${dividerWidth}px;align-self:stretch;background:${dividerColor};display:inline-block"></span></div>`;
      }
      return `<div style="width:${dividerWidth}px;align-self:stretch;background:${dividerColor};margin:0 4px"></div>`;
    }

    const hasChildren = item.children && item.children.length > 0;
    const color = item.disabled ? "rgba(255,255,255,0.3)" : isActive ? menuActiveColor : (item.color || menuColor);
    const weight = isActive ? menuActiveWeight : menuFontWeight;

    const itemStyles: string[] = [
      "display: flex",
      "align-items: center",
      "justify-content: space-between",
      `gap: ${item.gap ?? 6}px`,
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
      "position: relative",
      itemBgEnabled
        ? `padding: ${itemPaddingY}px ${itemPaddingX}px`
        : `padding: 0 ${itemPaddingX}px`,
      itemBgEnabled ? `background-color: ${isActive ? itemActiveBg : "transparent"}` : "",
      itemBgEnabled ? `border-radius: ${itemRadius}px` : "",
      itemMinWidth > 0 ? `min-width: ${itemMinWidth}px` : "",
    ];
    if (depth === 0) {
      itemStyles.push("height: 100%");
    } else {
      itemStyles.push("min-height: 32px");
    }
    if (indicatorEnabled && depth === 0) {
      const bw = isActive ? indicatorWidth : 0;
      itemStyles.push(`border-bottom: ${bw}px solid ${isActive ? indicatorColor : "transparent"}`);
    }
    if (item.disabled) itemStyles.push("opacity: 0.5", "cursor: not-allowed");

    // hoverBg：通过 inline JS 实现 hover 效果
    const hoverJs = item.hoverBg
      ? ` onmouseenter="this.dataset.bg=this.style.backgroundColor;this.style.backgroundColor='${item.hoverBg}'" onmouseleave="this.style.backgroundColor=this.dataset.bg||''"`
      : "";
    const titleAttr = item.description ? ` title="${escapeHTML(item.description)}"` : "";

    // 左侧内容（图标 + 文字 + 徽标）
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

    // 右侧箭头（SVG chevron，对齐 sidebar 模式）
    let rightHTML = "";
    const arrowSize = Math.max(14, Math.round(menuFontSize));
    if (item.shortcut) {
      rightHTML += `<span style="font-size:10px;color:currentColor;opacity:0.5;flex-shrink:0;padding:0 4px;border:1px solid rgba(255,255,255,0.15);border-radius:3px;line-height:14px;white-space:nowrap">${escapeHTML(item.shortcut)}</span>`;
    }
    if (hasChildren) {
      // 箭头初始方向与折叠状态同步：子菜单默认隐藏，箭头初始即收起方向（原样▼），
      // 由展示脚本切到展开方向。不能用 isActive 驱动，否则收起时箭头方向矛盾。
      rightHTML += `<svg data-toggle="submenu" class="wc-navbar-arrow" width="${arrowSize}" height="${arrowSize}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; cursor: pointer; transition: transform 0.2s; display: inline-block; opacity: 0.7"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
    }

    const leftWrap = `<div style="display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1; overflow: hidden; justify-content: ${depth === 0 ? textJustify : "flex-start"}">${leftHTML}</div>`;
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

    // 下拉子菜单（递归渲染，全部默认隐藏，由 JS hover 控制）
    if (hasChildren && item.children) {
      const childrenHTML = item.children.map((child, i) =>
        renderItem(child, `${key}-${i}`, depth + 1, activeKey === `${key}-${i}`)
      ).join("");
      const subDisplay = "none";
      const subPosition = depth === 0
        ? "position: absolute; top: 100%; left: 0; min-width: 160px"
        : "position: relative";
      html += `<div data-submenu style="display: ${subDisplay}; flex-direction: column; ${subPosition}; background: ${subBg}; border: 1px solid rgba(255,255,255,0.1); border-radius: 0 0 6px 6px; padding: 2px 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 100; gap: 1px; overflow: visible">${childrenHTML}</div>`;
    }

    // depth 0 有子菜单：包裹在 position:relative 容器中，让 top:100% 相对于菜单项
    if (depth === 0 && hasChildren) {
      return `<div style="position: relative; display: flex; flex-direction: column; align-self: stretch">${html}</div>`;
    }

    return html;
  }

  const itemsHTML = items.map((item, i) =>
    renderItem(item, String(i), 0, activeKey === String(i) || activeKey.startsWith(`${i}-`))
  ).join("");
  const toggleStyle = "<style>.wc-navbar-arrow{display:inline-block;transition:transform 0.2s}.wc-navbar-arrow-expanded{transform:rotate(180deg)}</style>";
  const toggleScript = `<script>(function(){if(window.__wcNavbarInit)return;window.__wcNavbarInit=true;var t=null;function sm(mi){var s=mi.nextElementSibling;return s&&s.hasAttribute('data-submenu')?s:null}function show(mi){var s=sm(mi);if(!s)return;var n=mi.closest('[data-wc-navbar]');if(n)n.querySelectorAll('[data-submenu]').forEach(function(x){if(x!==s){x.style.display='none';var a=x.previousElementSibling&&x.previousElementSibling.querySelector('[data-toggle=submenu]');if(a)a.classList.remove('wc-navbar-arrow-expanded')}});s.style.display='flex';var ar=mi.querySelector('[data-toggle=submenu]');if(ar)ar.classList.add('wc-navbar-arrow-expanded')}function hide(mi){var s=sm(mi);if(!s)return;s.style.display='none';var ar=mi.querySelector('[data-toggle=submenu]');if(ar)ar.classList.remove('wc-navbar-arrow-expanded')}function delay(mi){if(t)clearTimeout(t);t=setTimeout(function(){hide(mi)},200)}function cancel(){if(t){clearTimeout(t);t=null}}document.addEventListener('mouseover',function(e){var mi=e.target.closest('[data-wc-navbar] [data-menu-item]');if(mi&&sm(mi)){cancel();show(mi);return}var su=e.target.closest('[data-wc-navbar] [data-submenu]');if(su)cancel()});document.addEventListener('mouseout',function(e){var mi=e.target.closest('[data-wc-navbar] [data-menu-item]');if(mi&&sm(mi)){var r=e.relatedTarget;var s=sm(mi);if(r&&s&&s.contains(r))return;delay(mi);return}var su=e.target.closest('[data-wc-navbar] [data-submenu]');if(su){var r=e.relatedTarget;if(r&&su.contains(r))return;var p=su.previousElementSibling;if(p)delay(p)}});document.addEventListener('click',function(e){var tt=e.target.closest('[data-wc-navbar] [data-toggle=submenu]');if(tt){e.preventDefault();var mi=tt.closest('[data-menu-item]');if(!mi)return;var s=sm(mi);if(!s)return;if(s.style.display==='none')show(mi);else hide(mi);return}var mi=e.target.closest('[data-menu-item]');var su=e.target.closest('[data-submenu]');if(mi||su)return;var n=e.target.closest('[data-wc-navbar]');if(n)n.querySelectorAll('[data-submenu]').forEach(function(x){x.style.display='none'})})})()</script>`;
  return `<div data-wc-navbar style="${outerStyles.filter(Boolean).join("; ")}">${itemsHTML}${toggleStyle}${toggleScript}</div>`;
};

