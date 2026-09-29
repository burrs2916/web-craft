import type { ComponentCodegenFn } from "../../types";
import { resolveHref } from "../../../editor/utils/menuItems";
import { renderMenuIcon } from "../../iconPipeline";
import { escapeHTML } from "../../layout";
import { applyOpacity } from "./shared";

/**
 * navbar 组件 → HTML
 * 配置：direction(horizontal/vertical), align,
 *       menuItems(每行一个)/activeIndex/menuColor/menuActiveColor/menuFontSize/menuFontWeight/menuActiveWeight/menuGap,
 *       underlineEnabled/underlineColor/underlineWidth,
 *       backgroundColor/backgroundOpacity, blurEnabled/blurAmount,
 *       paddingX/paddingY,
 *       borderEnabled/borderColor/borderWidth/borderStyle,
 *       borderRadius,
 *       shadowEnabled/shadowOffsetX/shadowOffsetY/shadowBlur/shadowSpread/shadowColor,
 *       overflow
 */
export const navbarCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config;
  const isHorizontal = c.direction !== "vertical";

  const horizontalAlign = String(c.horizontalAlign ?? "center");
  const verticalAlign = String(c.verticalAlign ?? "flex-start");
  const itemTextAlign = String(c.itemTextAlign ?? "left");

  interface MenuItem {
    label: string;
    icon?: string;
    href?: string;
    linkType?: "none" | "page" | "url" | "pane" | "anchor";
    newTab?: boolean;
    color?: string;
    disabled?: boolean;
    children?: MenuItem[];
    badge?: string;
    badgeColor?: string;
    badgeBg?: string;
    shortcut?: string;
    description?: string;
    isDivider?: boolean;
    groupTitle?: string;
    fontSize?: number;
    iconColor?: string;
    gap?: number;
    hoverBg?: string;
  }

  // 解析菜单项
  const rawItems = String(c.menuItems ?? "");
  let items: MenuItem[] = [];
  const trimmed = rawItems.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) items = parsed;
    } catch {
      // fall through
    }
  }
  if (items.length === 0) {
    items = trimmed.split("\n").filter(Boolean).map(label => ({ label: label.trim() }));
  }

  // —— 基础变量 ——
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
  const itemPaddingY = Number(c.itemPaddingY ?? 6);
  const itemRadius = Number(c.itemRadius ?? 6);
  const itemMinWidth = Number(c.itemMinWidth ?? 0);

  const indicatorEnabled = c.indicatorEnabled === true && !itemBgEnabled;
  const indicatorWidth = Number(c.indicatorWidth ?? 2);
  const indicatorColor = c.indicatorColor ? String(c.indicatorColor) : menuActiveColor;

  const dividerEnabled = c.dividerEnabled === true;
  const dividerColor = String(c.dividerColor ?? "rgba(255,255,255,0.1)");
  const dividerWidth = Number(c.dividerWidth ?? 1);

  // —— 外层样式 ——
  const outerStyles: string[] = [
    "width: 100%",
    "height: 100%",
    "display: flex",
    isHorizontal ? "flex-direction: row" : "flex-direction: column",
    isHorizontal ? `justify-content: ${horizontalAlign}` : `justify-content: ${verticalAlign}`,
    isHorizontal ? "align-items: center" : "align-items: stretch",
    `padding: ${c.paddingY ?? 8}px ${c.paddingX ?? 8}px`,
    "box-sizing: border-box",
    `overflow-y: ${isHorizontal ? c.overflow ?? "hidden" : "auto"}`,
    "overflow-x: hidden",
    `gap: ${isHorizontal || dividerEnabled ? menuGap : menuGap}px`,
  ];

  // 背景
  outerStyles.push(`background: ${applyOpacity(String(c.backgroundColor ?? "rgba(30,30,50,0.9)"), Number(c.backgroundOpacity ?? 100))}`);

  // 毛玻璃
  if (c.blurEnabled) {
    outerStyles.push(`backdrop-filter: blur(${c.blurAmount ?? 12}px)`);
    outerStyles.push(`-webkit-backdrop-filter: blur(${c.blurAmount ?? 12}px)`);
  }

  // 边框
  if (c.borderEnabled) {
    outerStyles.push(`border: ${c.borderWidth ?? 1}px ${c.borderStyle ?? "solid"} ${c.borderColor ?? "rgba(255,255,255,0.1)"}`);
  }

  // 圆角
  if (c.borderRadius !== undefined) {
    outerStyles.push(`border-radius: ${c.borderRadius}px`);
  }

  // 阴影
  if (c.shadowEnabled) {
    const sx = c.shadowOffsetX ?? 0;
    const sy = c.shadowOffsetY ?? 4;
    const blur = c.shadowBlur ?? 12;
    const spread = c.shadowSpread ?? 0;
    const color = c.shadowColor ?? "rgba(0,0,0,0.3)";
    outerStyles.push(`box-shadow: ${sx}px ${sy}px ${blur}px ${spread}px ${color}`);
  }

  // —— 递归渲染菜单项 ——
  function renderItem(item: MenuItem, depth: number, isActive: boolean): string {
    const hasChildren = item.children && item.children.length > 0;
    const color = item.disabled ? "rgba(255,255,255,0.3)" : isActive ? menuActiveColor : (item.color || menuColor);
    const weight = isActive ? menuActiveWeight : menuFontWeight;
    const indent = depth * itemIndent;
    const textJustify = itemTextAlign === "center" ? "center"
      : itemTextAlign === "right" ? "flex-end"
      : "flex-start";

    const itemStyles: string[] = [
      "display: flex",
      "align-items: center",
      "gap: 8px",
      `color: ${color}`,
      `font-size: ${menuFontSize}px`,
      `font-weight: ${weight}`,
      "white-space: nowrap",
      "cursor: pointer",
      "line-height: 1.2",
      "transition: all 0.2s",
      "box-sizing: border-box",
      "user-select: none",
      "flex-shrink: 0",
    ];

    if (item.disabled) {
      itemStyles.push("opacity: 0.5", "cursor: not-allowed");
    }

    if (isHorizontal) {
      // 水平模式
      itemStyles.push(
        `height: auto`,
        itemBgEnabled
          ? `padding: ${itemPaddingY}px ${itemPaddingX}px`
          : "padding: 0",
        itemBgEnabled ? `background-color: ${isActive ? itemActiveBg : "transparent"}` : "",
        itemBgEnabled ? `border-radius: ${itemRadius}px` : "",
        itemMinWidth > 0 ? `min-width: ${itemMinWidth}px` : "",
        `justify-content: ${textJustify}`,
      );
      if (indicatorEnabled) {
        const borderBottom = isActive
          ? `${indicatorWidth}px solid ${indicatorColor}`
          : `${indicatorWidth}px solid transparent`;
        itemStyles.push(`border-bottom: ${borderBottom}`, "padding-bottom: 2px");
      }
    } else {
      // 垂直模式
      itemStyles.push(
        `height: ${itemHeight}px`,
        `padding-left: ${itemPaddingX + indent}px`,
        `padding-right: ${itemPaddingX}px`,
        `background-color: ${isActive ? itemActiveBg : "transparent"}`,
        `border-radius: ${itemRadius}px`,
        "justify-content: space-between",
      );
      if (indicatorEnabled) {
        const borderLeft = isActive
          ? `${indicatorWidth}px solid ${indicatorColor}`
          : `${indicatorWidth}px solid transparent`;
        itemStyles.push(`border-left: ${borderLeft}`);
      }
    }

    // 左侧内容（图标 + 文字）—— 文字对齐
    const leftWrapStyles = [
      "display: flex",
      "align-items: center",
      "gap: 8px",
      "min-width: 0",
      isHorizontal ? "flex: none" : "flex: 1",
      `justify-content: ${isHorizontal ? textJustify : "flex-start"}`,
      "overflow: hidden",
    ];
    let leftHTML = "";
    if (item.icon) {
      leftHTML += renderMenuIcon(item.icon, itemIconSize, ctx);
    }
    leftHTML += `<span style="font-size: inherit; font-weight: inherit; line-height: 1; overflow: hidden; text-overflow: ellipsis">${escapeHTML(item.label)}</span>`;

    // 右侧箭头
    let rightHTML = "";
    const arrowSize = Math.max(14, Math.round(menuFontSize));
    if (hasChildren) {
      if (isHorizontal) {
        rightHTML += `<svg width="${arrowSize}" height="${arrowSize}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; opacity: 0.7; display: inline-block"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
      } else {
        rightHTML += `<svg width="${arrowSize}" height="${arrowSize}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; opacity: 0.7; display: inline-block"><polyline points="9 6 15 12 9 18"></polyline></svg>`;
      }
    }

    const contentWrap = `<div style="${leftWrapStyles.join("; ")}">${leftHTML}</div>${rightHTML}`;

    // 链接项：page 类型预览模式用 data-view-link，发布模式解析为文件名
    // pane 类型用 data-pane-link 实现同视图内面板切换
    let tag = "div";
    let hrefAttr = "";
    let extraAttrs = "";
    if (!item.disabled) {
      if (item.linkType === "url" && item.href) {
        tag = "a";
        hrefAttr = ` href="${escapeHTML(item.href)}"`;
        if (item.newTab !== false) extraAttrs = ' target="_blank" rel="noopener"';
      } else if (item.linkType === "pane" && item.href) {
        extraAttrs = ` data-pane-link="${item.href}"`;
      } else if (item.linkType === "page" && item.href) {
        if (ctx.preview) {
          tag = "a";
          hrefAttr = ` href="#${item.href}"`;
          extraAttrs = ` data-view-link="${item.href}"`;
        } else {
          const fileHref = resolveHref(item, (ctx.scene.views ?? []).map(v => ({ id: v.id, name: v.name })));
          if (fileHref) {
            tag = "a";
            hrefAttr = ` href="${escapeHTML(fileHref)}"`;
          }
        }
      } else if (item.href) {
        // 兼容旧数据：有 href 但无 linkType
        tag = "a";
        hrefAttr = ` href="${escapeHTML(item.href)}"`;
      }
    }
    if (tag === "a") itemStyles.push("text-decoration: none");
    let html = `<${tag}${hrefAttr}${extraAttrs} style="${itemStyles.filter(Boolean).join("; ")}">${contentWrap}</${tag}>`;

    // 子菜单（垂直模式展开，水平模式可加 hover 效果，这里默认展开第一个）
    if (hasChildren && item.children) {
      const childrenHTML = item.children.map((child) =>
        renderItem(child, depth + 1, false)
      ).join("");
      const subMenuStyles = [
        "display: flex",
        "flex-direction: column",
        "overflow: hidden",
      ];
      html += `<div style="${subMenuStyles.join("; ")}">${childrenHTML}</div>`;
    }

    // 分割线（仅垂直模式）
    if (!isHorizontal && dividerEnabled) {
      html += `<div style="height: ${dividerWidth}px; background: ${dividerColor}; margin: ${menuGap / 2}px 0"></div>`;
    }

    return html;
  }

  const itemsHTML = items.map((item, i) => renderItem(item, 0, i === (c.activeIndex ?? 0))).join("");
  return `<div style="${outerStyles.filter(Boolean).join("; ")}">${itemsHTML}</div>`;
};

