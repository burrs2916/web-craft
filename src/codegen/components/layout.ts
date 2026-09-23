import type { ComponentCodegenFn } from "../types";
import { escapeHTML, toJsString } from "../layout";
import { renderMenuIcon } from "../iconPipeline";
import { parseMenuItems, resolveHref, type MenuItem } from "../../editor/utils/menuItems";
import { buildPaneSwitcherScript } from "../../editor/utils/paneSwitcher";
import { buildModalSwitcherScript } from "../../editor/utils/modalSwitcher";
import { buildDrawerSwitcherScript } from "../../editor/utils/drawerSwitcher";
import { buildTabSwitcherScript } from "../../editor/utils/tabSwitcher";
import { parseTabs, getActiveTabId, getChildTabId } from "../../editor/utils/tabsConfig";
import { parsePanes, normalizeActivePaneId, type PaneItem } from "../../editor/utils/panes";
import { generateChildHTML } from "../engine";
import { readAuthEnabled } from "../../editor/data/authMode";

/**
 * 将颜色转为指定透明度的 rgba 格式。
 * 支持 #rgb / #rrggbb / rgb() / rgba() 格式。
 */
function applyOpacity(color: string, opacity: number): string {
  const alpha = Math.max(0, Math.min(1, opacity / 100));

  // rgba 格式：替换 alpha 值
  if (color.startsWith("rgba(")) {
    return color.replace(/rgba\(\s*([^,]+,\s*[^,]+,\s*[^,]+)\s*,\s*[\d.]+\s*\)/, `rgba($1, ${alpha})`);
  }
  // rgb 格式：加 alpha
  if (color.startsWith("rgb(")) {
    return color.replace(/rgb\(\s*([^)]+)\s*\)/, `rgba($1, ${alpha})`);
  }
  // 十六进制 #rrggbb 或 #rgb
  if (color.startsWith("#")) {
    let hex = color.slice(1);
    if (hex.length === 3) {
      hex = hex.split("").map((c) => c + c).join("");
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
  }
  return color;
}

/**
 * 解析菜单项链接。
 * 预览模式：page 类型用 data-view-link 实现单页内视图切换（SPA 式）。
 * 发布模式：page 类型解析为对应 HTML 文件名。
 * pane 类型：预览和发布都用 data-pane-link 实现同视图内面板切换（不导航）。
 * anchor 类型：预览和发布都用 #id 锚点，配合 data-anchor 属性实现页内滚动。
 */
function resolveMenuLink(
  item: MenuItem,
  pages: { id: string; name: string }[],
  preview: boolean,
): { href: string | null; extraAttrs: string } {
  if (item.disabled) return { href: null, extraAttrs: "" };
  if (item.linkType === "url") return { href: item.href || null, extraAttrs: "" };
  if (item.linkType === "pane" && item.href) {
    return { href: null, extraAttrs: ` data-pane-link="${item.href}"` };
  }
  if (item.linkType === "modal" && item.href) {
    return { href: null, extraAttrs: ` data-modal-link="${item.href}"` };
  }
  if (item.linkType === "drawer" && item.href) {
    return { href: null, extraAttrs: ` data-drawer-link="${item.href}"` };
  }
  if (item.linkType === "anchor" && item.href) {
    return { href: `#${item.href}`, extraAttrs: ` data-anchor="${item.href}"` };
  }
  if (item.linkType === "page" && item.href) {
    if (preview) {
      return { href: `#${item.href}`, extraAttrs: ` data-view-link="${item.href}"` };
    }
    const fileHref = resolveHref(item, pages);
    return { href: fileHref, extraAttrs: "" };
  }
  return { href: null, extraAttrs: "" };
}

/**
 * container 组件 → HTML
 * 配置：backgroundEnabled/backgroundColor/backgroundOpacity,
 *       borderEnabled/borderColor/borderWidth/borderStyle,
 *       borderRadius, paddingX/paddingY,
 *       shadowEnabled/shadowOffsetX/shadowOffsetY/shadowBlur/shadowSpread/shadowColor,
 *       overflow, showLabel/labelText
 */
export const containerCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config;

  // 随框等比缩放：基准 400×300，与编辑端 ContainerRenderer 一致（scaleFit 关闭则为 1）
  const tf = component.transform as { width?: number; height?: number } | undefined;
  const cw = typeof tf?.width === "number" ? tf.width : 0;
  const ch = typeof tf?.height === "number" ? tf.height : 0;
  const scaleFit = c.scaleFit !== false;
  const fit =
    scaleFit && cw > 0 && ch > 0
      ? Math.min(Math.max(Math.min(cw / 400, ch / 300), 0.4), 4)
      : 1;
  const s = cw > 0 && ch > 0 ? (v: number) => v * fit : (v: number) => v;

  const styles: string[] = [
    "width: 100%",
    "height: 100%",
    "box-sizing: border-box",
  ];

  if (c.backgroundEnabled) {
    const opacity = c.backgroundOpacity ?? 100;
    styles.push(`background: ${applyOpacity(String(c.backgroundColor ?? "rgba(255,255,255,0.05)"), Number(opacity))}`);
  }

  if (c.borderEnabled) {
    styles.push(`border: ${s(Number(c.borderWidth ?? 1))}px ${c.borderStyle ?? "solid"} ${c.borderColor ?? "#3a3a5c"}`);
  }

  if (c.borderRadius !== undefined) {
    styles.push(`border-radius: ${s(Number(c.borderRadius))}px`);
  }

  // 内边距：优先使用新的 paddingX/paddingY，兼容旧的 padding
  if (c.paddingX !== undefined || c.paddingY !== undefined) {
    const py = s(Number(c.paddingY ?? 16));
    const px = s(Number(c.paddingX ?? 16));
    styles.push(`padding: ${py}px ${px}px`);
  } else if (c.padding !== undefined) {
    styles.push(`padding: ${c.padding}px`);
  }

  if (c.shadowEnabled) {
    const offsetX = s(Number(c.shadowOffsetX ?? 0));
    const offsetY = s(Number(c.shadowOffsetY ?? 0));
    const blur = s(Number(c.shadowBlur ?? 12));
    const spread = s(Number(c.shadowSpread ?? 0));
    const color = c.shadowColor ?? "rgba(0,0,0,0.3)";
    styles.push(`box-shadow: ${offsetX}px ${offsetY}px ${blur}px ${spread}px ${color}`);
  }

  if (c.overflow !== undefined) {
    styles.push(`overflow: ${c.overflow}`);
  } else {
    styles.push("overflow: hidden");
  }

  const children = ctx.childrenByParent?.get(component.id) ?? [];
  const labelHTML = c.showLabel && c.labelText
    ? `<span style="position:absolute;top:4px;left:8px;font-size:11px;color:rgba(255,255,255,0.35);pointer-events:none;user-select:none">${escapeHTML(String(c.labelText))}</span>`
    : "";
  const childrenHTML = children.map((ch) => generateChildHTML(ch, ctx)).join("\n");
  return `<div style="${styles.join("; ")}; position: relative">${labelHTML}${childrenHTML}</div>`;
};

/**
 * grid 组件 → HTML
 * 配置：columnMode/columns/columnWidth/columnMinWidth,
 *       rowMode/rows/rowHeight,
 *       columnGap/rowGap,
 *       justifyItems/alignItems/justifyContent/alignContent,
 *       showLines/lineColor/lineStyle/lineWidth,
 *       showCellBg/cellBg,
 *       backgroundEnabled/backgroundColor/backgroundOpacity,
 *       borderEnabled/borderColor/borderWidth/borderStyle,
 *       borderRadius, paddingX/paddingY,
 *       shadowEnabled/shadowOffsetX/shadowOffsetY/shadowBlur/shadowSpread/shadowColor,
 *       overflow
 */
export const gridCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config;

  // —— 列模板 ——
  const columnMode = c.columnMode ?? "equal";
  const columns = c.columns ?? 3;
  const columnWidth = c.columnWidth ?? 120;
  const columnMinWidth = c.columnMinWidth ?? 100;
  let gridTemplateColumns: string;
  switch (columnMode) {
    case "fixed":
      gridTemplateColumns = `repeat(${columns}, ${columnWidth}px)`;
      break;
    case "auto-fill":
      gridTemplateColumns = `repeat(auto-fill, minmax(${columnMinWidth}px, 1fr))`;
      break;
    case "auto-fit":
      gridTemplateColumns = `repeat(auto-fit, minmax(${columnMinWidth}px, 1fr))`;
      break;
    case "equal":
    default:
      gridTemplateColumns = `repeat(${columns}, 1fr)`;
  }

  // —— 行模板 ——
  const rowMode = c.rowMode ?? "equal";
  const rows = c.rows ?? 2;
  const rowHeight = c.rowHeight ?? 80;
  let gridTemplateRows: string;
  switch (rowMode) {
    case "fixed":
      gridTemplateRows = `repeat(${rows}, ${rowHeight}px)`;
      break;
    case "auto":
      gridTemplateRows = `repeat(${rows}, auto)`;
      break;
    case "equal":
    default:
      gridTemplateRows = `repeat(${rows}, 1fr)`;
  }

  // —— 单元格数量 ——
  const colCount = (columnMode === "auto-fill" || columnMode === "auto-fit")
    ? Math.max(Number(columns), 1)
    : Number(columns);
  const rowCount = (rowMode === "auto")
    ? Math.max(Number(rows), 1)
    : Number(rows);
  const cellCount = colCount * rowCount;

  // —— 外层样式 ——
  const outerStyles: string[] = [
    "width: 100%",
    "height: 100%",
    "box-sizing: border-box",
    "display: grid",
    `grid-template-columns: ${gridTemplateColumns}`,
    `grid-template-rows: ${gridTemplateRows}`,
    `column-gap: ${c.columnGap ?? 8}px`,
    `row-gap: ${c.rowGap ?? 8}px`,
    `justify-items: ${c.justifyItems ?? "stretch"}`,
    `align-items: ${c.alignItems ?? "stretch"}`,
    `justify-content: ${c.justifyContent ?? "start"}`,
    `align-content: ${c.alignContent ?? "start"}`,
  ];

  // 背景
  if (c.backgroundEnabled) {
    outerStyles.push(`background: ${applyOpacity(String(c.backgroundColor ?? "rgba(255,255,255,0.03)"), Number(c.backgroundOpacity ?? 100))}`);
  }

  // 边框
  if (c.borderEnabled) {
    outerStyles.push(`border: ${c.borderWidth ?? 1}px ${c.borderStyle ?? "solid"} ${c.borderColor ?? "rgba(255,255,255,0.1)"}`);
  }

  // 圆角
  if (c.borderRadius !== undefined) {
    outerStyles.push(`border-radius: ${c.borderRadius}px`);
  }

  // 内边距
  if (c.paddingX !== undefined || c.paddingY !== undefined) {
    const py = c.paddingY ?? 0;
    const px = c.paddingX ?? 0;
    outerStyles.push(`padding: ${py}px ${px}px`);
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

  // 溢出
  outerStyles.push(`overflow: ${c.overflow ?? "hidden"}`);

  // —— 单元格 ——
  const showLines = c.showLines ?? true;
  const lineColor = c.lineColor ?? "rgba(255,255,255,0.15)";
  const lineStyle = c.lineStyle ?? "dashed";
  const lineWidth = c.lineWidth ?? 1;
  const showCellBg = c.showCellBg ?? false;
  const cellBg = c.cellBg ?? "rgba(255,255,255,0.02)";

  const cellStyles: string[] = ["min-height: 0", "min-width: 0"];
  if (showCellBg) {
    cellStyles.push(`background: ${cellBg}`);
  }
  if (showLines) {
    cellStyles.push(`border: ${lineWidth}px ${lineStyle} ${lineColor}`);
    cellStyles.push("border-radius: 2px");
  }
  const cellStyleStr = cellStyles.join("; ");

  const children = ctx.childrenByParent?.get(component.id) ?? [];

  let html = `<div style="${outerStyles.join("; ")}${children.length > 0 ? "; position: relative" : ""}">`;
  for (let i = 0; i < cellCount; i++) {
    html += `<div style="${cellStyleStr}"></div>`;
  }
  // 渲染嵌入的子组件（绝对定位，相对此容器）
  for (const child of children) {
    html += generateChildHTML(child, ctx);
  }
  html += `</div>`;
  return html;
};

/**
 * columns 组件 → HTML
 * 配置：count, gap, alignItems,
 *       col1Type/col1Value ... col6Type/col6Value,
 *       showLines/lineColor/lineStyle/lineWidth,
 *       showCellBg/cellBg,
 *       backgroundEnabled/backgroundColor/backgroundOpacity,
 *       borderEnabled/borderColor/borderWidth/borderStyle,
 *       borderRadius, paddingX/paddingY,
 *       shadowEnabled/shadowOffsetX/shadowOffsetY/shadowBlur/shadowSpread/shadowColor,
 *       overflow
 */
export const columnsCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config;
  const count = Math.max(1, Math.min(6, Number(c.count ?? 3)));
  const gap = c.gap ?? 12;
  const alignItems = c.alignItems ?? "stretch";

  // —— 每栏样式 ——
  const getColStyle = (index: number): string => {
    const type = (c as any)[`col${index + 1}Type`] ?? "fr";
    const value = (c as any)[`col${index + 1}Value`] ?? 1;

    const styles: string[] = ["height: 100%", "box-sizing: border-box", "min-width: 0", "min-height: 0"];

    switch (type) {
      case "px":
        styles.push("flex: 0 0 auto", `width: ${value}px`);
        break;
      case "auto":
        styles.push("flex: 0 0 auto", "width: auto");
        break;
      case "fr":
      default:
        styles.push(`flex: ${value} 1 0`, "width: auto");
    }

    // 栏背景
    if (c.showCellBg) {
      styles.push(`background: ${c.cellBg ?? "rgba(255,255,255,0.03)"}`);
    }
    // 栏线
    if (c.showLines) {
      styles.push(`border: ${c.lineWidth ?? 1}px ${c.lineStyle ?? "dashed"} ${c.lineColor ?? "rgba(255,255,255,0.12)"}`);
      styles.push("border-radius: 2px");
    }
    return styles.join("; ");
  };

  // —— 外层样式 ——
  const outerStyles: string[] = [
    "width: 100%",
    "height: 100%",
    "box-sizing: border-box",
  ];

  // 背景
  if (c.backgroundEnabled) {
    outerStyles.push(`background: ${applyOpacity(String(c.backgroundColor ?? "rgba(255,255,255,0.02)"), Number(c.backgroundOpacity ?? 100))}`);
  }

  // 边框
  if (c.borderEnabled) {
    outerStyles.push(`border: ${c.borderWidth ?? 1}px ${c.borderStyle ?? "solid"} ${c.borderColor ?? "rgba(255,255,255,0.1)"}`);
  }

  // 圆角
  if (c.borderRadius !== undefined) {
    outerStyles.push(`border-radius: ${c.borderRadius}px`);
  }

  // 内边距
  if (c.paddingX !== undefined || c.paddingY !== undefined) {
    const py = c.paddingY ?? 0;
    const px = c.paddingX ?? 0;
    outerStyles.push(`padding: ${py}px ${px}px`);
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

  // 溢出
  outerStyles.push(`overflow: ${c.overflow ?? "hidden"}`);

  // —— inner flex 容器 ——
  const innerStyles: string[] = [
    "width: 100%",
    "height: 100%",
    "display: flex",
    "flex-direction: row",
    `gap: ${gap}px`,
    `align-items: ${alignItems}`,
  ];

  // —— 生成 HTML ——
  const children = ctx.childrenByParent?.get(component.id) ?? [];
  let html = `<div style="${outerStyles.join("; ")}${children.length > 0 ? "; position: relative" : ""}">`;
  html += `<div style="${innerStyles.join("; ")}">`;
  for (let i = 0; i < count; i++) {
    html += `<div style="${getColStyle(i)}"></div>`;
  }
  html += `</div>`;
  // 渲染嵌入的子组件（绝对定位，相对此容器）
  for (const child of children) {
    html += generateChildHTML(child, ctx);
  }
  html += `</div>`;
  return html;
};

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

/**
 * Tabs 标签页 codegen
 */
export const tabsCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config;
  const tabs = parseTabs(c);
  const activeTabId = getActiveTabId(c, tabs);
  const activeTab = tabs.findIndex(t => t.id === activeTabId);
  const safeActiveTab = activeTab >= 0 ? activeTab : 0;
  const tabPosition = String(c.tabPosition ?? "top");
  const variant = String(c.variant ?? "underline");
  const tabSize = String(c.tabSize ?? "medium");
  const isHorizontal = tabPosition === "top" || tabPosition === "bottom";
  const isTopOrLeft = tabPosition === "top" || tabPosition === "left";

  const tabSizes = { small: 32, medium: 40, large: 48 };
  const tabHeight = tabSizes[tabSize as keyof typeof tabSizes] ?? 40;
  const tabGap = Number(c.tabGap ?? 4);

  const tabColor = String(c.tabColor ?? "rgba(255,255,255,0.7)");
  const activeTabColor = String(c.activeTabColor ?? "#ffffff");
  const activeTabBg = String(c.activeTabBg ?? "rgba(255,255,255,0.08)");
  const indicatorColor = String(c.indicatorColor ?? "#FF9800");
  const indicatorWidth = Number(c.indicatorWidth ?? 2);

  const contentBgEnabled = c.contentBgEnabled !== false;
  const contentBg = String(c.contentBg ?? "rgba(255,255,255,0.02)");
  const contentBorderEnabled = c.contentBorderEnabled !== false;
  const contentBorderColor = String(c.contentBorderColor ?? "rgba(255,255,255,0.1)");
  const contentBorderWidth = Number(c.contentBorderWidth ?? 1);
  const contentPaddingX = Number(c.contentPaddingX ?? 16);
  const contentPaddingY = Number(c.contentPaddingY ?? 16);
  const contentRadius = Number(c.contentRadius ?? 8);

  // 外层
  const outerStyles: string[] = [
    "width: 100%",
    "height: 100%",
    "display: flex",
    isHorizontal ? "flex-direction: column" : "flex-direction: row",
    "box-sizing: border-box",
  ];

  // 标签容器
  const headerStyles: string[] = [
    "display: flex",
    `flex-direction: ${isHorizontal ? "row" : "column"}`,
    isHorizontal ? "align-items: center" : "align-items: stretch",
    isHorizontal ? "width: 100%" : "height: 100%",
    `gap: ${tabGap}px`,
    "flex-shrink: 0",
  ];
  if (variant === "segmented") {
    headerStyles.push("background: rgba(255,255,255,0.05)", "padding: 4px", "border-radius: 8px");
  }

  // 内容区
  const contentStyles: string[] = [
    "flex: 1",
    "min-height: 0",
    "min-width: 0",
    "box-sizing: border-box",
    "overflow: hidden",
    "position: relative",
    `padding: ${contentPaddingY}px ${contentPaddingX}px`,
  ];
  if (contentBgEnabled) {
    contentStyles.push(`background: ${contentBg}`);
  }
  if (contentBorderEnabled) {
    contentStyles.push(`border: ${contentBorderWidth}px solid ${contentBorderColor}`);
  }
  if (variant === "card") {
    const radius = tabPosition === "top" ? "0 8px 8px 8px"
      : tabPosition === "bottom" ? "8px 8px 8px 0"
      : tabPosition === "left" ? "0 8px 8px 0"
      : "8px 0 0 8px";
    contentStyles.push(`border-radius: ${radius}`);
  } else {
    contentStyles.push(`border-radius: ${contentRadius}px`);
  }

  // —— 构建标签按钮样式（传入 isActive 决定激活/非激活变体）——
  const buildTabStyles = (isActive: boolean): string => {
    let ts: string[] = [
      "display: flex",
      "align-items: center",
      "justify-content: center",
      "cursor: pointer",
      "user-select: none",
      "white-space: nowrap",
      "padding: 0 16px",
      "transition: all 0.2s",
      variant === "segmented" ? "font-size: 13px" : "font-size: 14px",
      "box-sizing: border-box",
    ];
    if (isHorizontal) {
      ts.push(`height: ${tabHeight}px`);
    } else {
      ts.push("width: 100%", `min-height: ${tabHeight}px`);
    }

    if (variant === "underline") {
      ts.push(
        `color: ${isActive ? activeTabColor : tabColor}`,
        `background-color: transparent`,
        isHorizontal
          ? `border-bottom: ${isActive ? indicatorWidth : 0}px solid ${isActive ? indicatorColor : "transparent"}`
          : `border-left: ${isActive ? indicatorWidth : 0}px solid ${isActive ? indicatorColor : "transparent"}`,
      );
      if (!isHorizontal) ts.push("padding-left: 12px");
    } else if (variant === "pill") {
      ts.push(
        `color: ${isActive ? "#ffffff" : tabColor}`,
        `background-color: ${isActive ? indicatorColor : "transparent"}`,
        "border-radius: 999px",
      );
    } else if (variant === "card") {
      ts.push(
        `color: ${isActive ? activeTabColor : tabColor}`,
        `background-color: ${isActive ? activeTabBg : "transparent"}`,
        `border: ${isActive ? `1px solid ${contentBorderColor}` : "1px solid transparent"}`,
        "position: relative",
        `z-index: ${isActive ? 2 : 1}`,
      );
      if (isHorizontal) {
        ts.push("border-radius: 8px 8px 0 0");
        if (isActive) ts.push("margin-bottom: -1px", "border-bottom: none");
      } else {
        ts.push("border-radius: 8px 0 0 8px");
        if (isActive) ts.push("margin-right: -1px", "border-right: none");
      }
    } else if (variant === "segmented") {
      ts.push(
        `color: ${isActive ? "#ffffff" : tabColor}`,
        `background-color: ${isActive ? indicatorColor : "transparent"}`,
        "flex: 1",
        "padding: 0 12px",
      );
    }
    return ts.filter(Boolean).join("; ");
  };

  // 生成标签 HTML（存储激活/非激活两套样式，供 switcher 切换）
  const tabIconSize = variant === "segmented" ? 14 : 16;
  let tabsHTML = "";
  tabs.forEach((tab, i) => {
    const isActive = i === safeActiveTab;
    const styleOn = buildTabStyles(true);
    const styleOff = buildTabStyles(false);
    const fontWeight = isActive ? 600 : 400;
    const iconHTML = tab.icon ? renderMenuIcon(tab.icon, tabIconSize, ctx) : "";
    tabsHTML += `<div data-tab-link="${i}" data-tab-id="${escapeHTML(tab.id)}" data-tab-active="${isActive ? "true" : "false"}" data-style-on="${styleOn}" data-style-off="${styleOff}" style="${isActive ? styleOn : styleOff}">${iconHTML}<span style="font-size: inherit; font-weight: ${fontWeight}; line-height: 1">${escapeHTML(tab.label)}</span></div>`;
  });

  const headerHTML = `<div style="${headerStyles.join("; ")}">${tabsHTML}</div>`;

  // —— 渲染子组件到各标签面板（按 __tabId 分组） ——
  const children = ctx.childrenByParent?.get(component.id) ?? [];
  const panesHTML = tabs.map((tab, i) => {
    const isActivePane = i === safeActiveTab;
    // 筛选属于此标签的子组件（通过 __tabId，回退到索引分配）
    const tabChildren = children.filter((child, ci) => {
      const childTabId = getChildTabId(child.config, tabs, ci);
      return childTabId === tab.id;
    });
    // 标签页独立背景：优先用 tab.contentBg，回退到全局 contentBg
    const paneBg = tab.contentBg ?? (contentBgEnabled ? contentBg : "transparent");
    const paneStyle = [
      "position: absolute",
      "inset: 0",
      "overflow: auto",
      `background: ${paneBg}`,
      isActivePane ? "display: block" : "display: none",
    ].join("; ");
    // 渲染所有属于此标签的子组件
    const childrenHTML = tabChildren.map(ch => generateChildHTML(ch, ctx)).join("\n");
    return `<div data-tab-pane data-tab-pane-id="${escapeHTML(tab.id)}" style="${paneStyle}">${childrenHTML}</div>`;
  }).join("\n");

  const contentHTML = `<div style="${contentStyles.join("; ")}" data-tabs-content="true" data-active-tab-id="${escapeHTML(activeTabId)}">${panesHTML}</div>`;

  // —— 注入标签切换脚本（每页只注入一次） ——
  const hasTabSwitcher = ctx.pageScripts.some((s) => s.includes("__wcTabSwitcherInit"));
  if (!hasTabSwitcher) {
    ctx.pageScripts.push(buildTabSwitcherScript());
  }

  return `<div data-tabs-id="${escapeHTML(component.id)}" data-active-tab="${safeActiveTab}" data-active-tab-id="${escapeHTML(activeTabId)}" style="${outerStyles.join("; ")}">${isTopOrLeft ? headerHTML + contentHTML : contentHTML + headerHTML}</div>`;
};

/**
 * 间距 codegen
 * 两种类型：blank（空白留白）和 divider（分隔线）
 * blank：配置 bgEnabled/bgColor/borderEnabled/borderStyle/borderColor/borderWidth/radius/showPlaceholder...
 * divider：配置 orientation/borderStyle/borderColor/borderWidth/label/labelAlign/labelColor/labelFontSize
 */
export const spaceCodegen: ComponentCodegenFn = (component) => {
  const c = component.config;
  const type = String(c.type ?? "blank");

  // —— 分隔线类型 ——
  if (type === "divider") {
    const orientation = String(c.orientation ?? "horizontal");
    const borderStyle = String(c.borderStyle ?? "dashed");
    const borderColor = String(c.borderColor ?? "rgba(255,255,255,0.15)");
    const borderWidth = Number(c.borderWidth ?? 1);
    const label = c.label ? String(c.label) : "";
    const labelAlign = String(c.labelAlign ?? "center");
    const labelColor = String(c.labelColor ?? "rgba(255,255,255,0.5)");
    const labelFontSize = Number(c.labelFontSize ?? 12);

    const lineBorder = `${borderWidth}px ${borderStyle} ${borderColor}`;

    // 垂直分隔线
    if (orientation === "vertical") {
      if (!label) {
        return `<div style="width:100%;height:100%;display:flex;justify-content:center"><div style="height:100%;border-left:${lineBorder}"></div></div>`;
      }
      const showTop = labelAlign !== "left";
      const showBottom = labelAlign !== "right";
      let inner = "";
      if (showTop) inner += `<div style="flex:1;border-left:${lineBorder}"></div>`;
      inner += `<span style="color:${labelColor};font-size:${labelFontSize}px;white-space:nowrap;padding:4px 0">${escapeHTML(label)}</span>`;
      if (showBottom) inner += `<div style="flex:1;border-left:${lineBorder}"></div>`;
      return `<div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center">${inner}</div>`;
    }

    // 水平分隔线
    if (!label) {
      return `<div style="width:100%;height:100%;display:flex;align-items:center"><div style="width:100%;border-top:${lineBorder}"></div></div>`;
    }
    const showLeft = labelAlign !== "left";
    const showRight = labelAlign !== "right";
    let inner = "";
    if (showLeft) inner += `<div style="flex:1;border-top:${lineBorder}"></div>`;
    inner += `<span style="color:${labelColor};font-size:${labelFontSize}px;white-space:nowrap;padding:0 8px">${escapeHTML(label)}</span>`;
    if (showRight) inner += `<div style="flex:1;border-top:${lineBorder}"></div>`;
    return `<div style="width:100%;height:100%;display:flex;align-items:center">${inner}</div>`;
  }

  // —— 空白类型（原有逻辑） ——
  const bgEnabled = c.bgEnabled === true;
  const bgColor = String(c.bgColor ?? "rgba(255,255,255,0.04)");

  const borderEnabled = c.borderEnabled === true;
  const borderStyle = String(c.borderStyle ?? "dashed");
  const borderColor = String(c.borderColor ?? "rgba(255,255,255,0.15)");
  const borderWidth = Number(c.borderWidth ?? 1);

  const radius = Number(c.radius ?? 0);

  const showPlaceholder = c.showPlaceholder === true;
  const placeholderText = String(c.placeholderText ?? "间距");
  const placeholderColor = String(c.placeholderColor ?? "rgba(255,255,255,0.3)");
  const placeholderFontSize = Number(c.placeholderFontSize ?? 12);
  const placeholderBgColor = String(c.placeholderBgColor ?? "rgba(255,255,255,0.08)");

  const styles: string[] = [
    "width: 100%",
    "height: 100%",
    "display: flex",
    "align-items: center",
    "justify-content: center",
    "box-sizing: border-box",
    "overflow: hidden",
  ];

  if (bgEnabled) {
    styles.push(`background: ${bgColor}`);
  }
  if (borderEnabled) {
    styles.push(`border: ${borderWidth}px ${borderStyle} ${borderColor}`);
  }
  if (radius > 0) {
    styles.push(`border-radius: ${radius}px`);
  }

  let innerHTML = "";
  if (showPlaceholder) {
    innerHTML = `<span style="font-size:${placeholderFontSize}px;color:${placeholderColor};background:${placeholderBgColor};padding:2px 8px;border-radius:4px;line-height:1.4;white-space:nowrap">${escapeHTML(placeholderText)}</span>`;
  }

  return `<div style="${styles.join("; ")}">${innerHTML}</div>`;
};

/**
 * card 组件 → HTML
 * 配置：title/subtitle/content, titleIcon/titleFontWeight/gap/contentVerticalAlign/titleLineClamp/contentOverflow,
 *       contentBgEnabled/contentBgColor, dividerEnabled/dividerColor/dividerStyle,
 *       imageSource/imagePosition/imageHeight/imageRadius,
 *       backgroundColor/backgroundOpacity, titleColor/titleFontSize, subtitleColor/subtitleFontSize,
 *       contentColor/contentFontSize, padding, borderRadius,
 *       borderEnabled/borderStyle/borderColor/borderWidth,
 *       shadowEnabled/shadowOffsetX/shadowOffsetY/shadowBlur/shadowSpread/shadowColor,
 *       textAlign
 */
export const cardCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config;

  // —— 解析配置（与 CardRenderer 字段名和默认值完全一致） ——
  const imageSource = c.imageSource ? String(c.imageSource) : "";
  const imagePosition = String(c.imagePosition ?? "top");
  const imageHeight = Number(c.imageHeight ?? 120);
  const imageRadius = Number(c.imageRadius ?? 0);
  const borderRadius = Number(c.borderRadius ?? 12);
  const padding = Number(c.padding ?? 16);
  const textAlign = String(c.textAlign ?? "left");
  const bgStr = applyOpacity(String(c.backgroundColor ?? "rgba(40,40,60,0.8)"), Number(c.backgroundOpacity ?? 100));

  // —— 内容区新增配置 ——
  const titleIcon = c.titleIcon ? String(c.titleIcon) : "";
  const titleFontWeight = String(c.titleFontWeight ?? "bold");
  const gap = Number(c.gap ?? 6);
  const contentVerticalAlign = String(c.contentVerticalAlign ?? "top");
  const titleLineClamp = Number(c.titleLineClamp ?? 0);
  const contentOverflow = String(c.contentOverflow ?? "hidden");
  const contentBgEnabled = c.contentBgEnabled === true;
  const contentBgColor = String(c.contentBgColor ?? "rgba(255,255,255,0.06)");
  const dividerEnabled = c.dividerEnabled === true;
  const dividerColor = String(c.dividerColor ?? "rgba(255,255,255,0.12)");
  const dividerStyle = String(c.dividerStyle ?? "solid");

  // —— 边框（支持 borderStyle） ——
  const borderEnabled = c.borderEnabled === true;
  const borderStyle = String(c.borderStyle ?? "solid");
  const borderColor = String(c.borderColor ?? "rgba(255,255,255,0.12)");
  const borderWidth = Number(c.borderWidth ?? 1);

  // —— 阴影（完整 5 字段公式） ——
  const shadowEnabled = c.shadowEnabled === true;
  const shadowOffsetX = Number(c.shadowOffsetX ?? 0);
  const shadowOffsetY = Number(c.shadowOffsetY ?? 4);
  const shadowBlur = Number(c.shadowBlur ?? 16);
  const shadowSpread = Number(c.shadowSpread ?? 0);
  const shadowColor = String(c.shadowColor ?? "rgba(0,0,0,0.4)");

  const isHorizontal = imagePosition === "left" || imagePosition === "right";

  // 垂直对齐映射
  const vAlignMap: Record<string, string> = {
    top: "flex-start",
    center: "center",
    bottom: "flex-end",
  };
  const vAlign = vAlignMap[contentVerticalAlign] || "flex-start";

  // —— 外层容器样式 ——
  const outerStyles: string[] = [
    "width: 100%",
    "height: 100%",
    "display: flex",
    isHorizontal
      ? (imagePosition === "left" ? "flex-direction: row" : "flex-direction: row-reverse")
      : "flex-direction: column",
    `background: ${bgStr}`,
    `border-radius: ${borderRadius}px`,
    "overflow: hidden",
  ];

  if (borderEnabled) {
    outerStyles.push(`border: ${borderWidth}px ${borderStyle} ${borderColor}`);
  }

  if (shadowEnabled) {
    outerStyles.push(`box-shadow: ${shadowOffsetX}px ${shadowOffsetY}px ${shadowBlur}px ${shadowSpread}px ${shadowColor}`);
  }

  let html = `<div style="${outerStyles.join("; ")}">`;

  // —— 图片（top 位置） ——
  if (imageSource && imagePosition === "top") {
    const imgRadius = imageRadius > 0 ? `border-radius:${imageRadius}px;` : "";
    html += `<img src="${escapeHTML(imageSource)}" style="width:100%;height:${imageHeight}px;object-fit:cover;flex-shrink:0;display:block;${imgRadius}" />`;
  }

  // —— 图片（left 位置） ——
  if (imageSource && imagePosition === "left") {
    const imgRadius = imageRadius > 0 ? `border-radius:${imageRadius}px;` : "";
    html += `<img src="${escapeHTML(imageSource)}" style="width:${imageHeight}px;height:100%;object-fit:cover;flex-shrink:0;display:block;${imgRadius}" />`;
  }

  // —— 图片（right 位置） ——
  if (imageSource && imagePosition === "right") {
    const imgRadius = imageRadius > 0 ? `border-radius:${imageRadius}px;` : "";
    html += `<img src="${escapeHTML(imageSource)}" style="width:${imageHeight}px;height:100%;object-fit:cover;flex-shrink:0;display:block;${imgRadius}" />`;
  }

  // —— 文本容器 ——
  const hasText = c.title || c.subtitle || c.content;
  if (hasText) {
    const contentBg = contentBgEnabled ? `background:${contentBgColor};` : "";
    html += `<div style="${contentBg}padding:${padding}px;text-align:${textAlign};flex:1 1 auto;overflow:hidden;display:flex;flex-direction:column;gap:${gap}px;justify-content:${vAlign}">`;

    // 标题行（可选前置图标）
    if (c.title) {
      const titleColor = String(c.titleColor ?? "#ffffff");
      const titleFontSize = Number(c.titleFontSize ?? 16);
      const clampStyle = titleLineClamp > 0
        ? `display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:${titleLineClamp};overflow:hidden;`
        : "";
      const iconHTML = titleIcon ? renderMenuIcon(titleIcon, titleFontSize, ctx) : "";
      html += `<div style="display:flex;align-items:center;gap:6px">`;
      if (iconHTML) {
        html += `<span style="display:inline-flex;flex-shrink:0;color:${titleColor}">${iconHTML}</span>`;
      }
      html += `<span style="color:${titleColor};font-size:${titleFontSize}px;font-weight:${titleFontWeight};line-height:1.3;flex:1 1 auto;${clampStyle}">${escapeHTML(String(c.title))}</span>`;
      html += `</div>`;
    }

    // 副标题
    if (c.subtitle) {
      html += `<div style="color:${String(c.subtitleColor ?? "rgba(255,255,255,0.55)")};font-size:${Number(c.subtitleFontSize ?? 12)}px;line-height:1.3">${escapeHTML(String(c.subtitle))}</div>`;
    }

    // 分隔线（标题/副标题 与 正文 之间）
    if (dividerEnabled && (c.title || c.subtitle) && c.content) {
      html += `<div style="width:100%;border-top:1px ${dividerStyle} ${dividerColor}"></div>`;
    }

    // 正文（支持溢出模式）
    if (c.content) {
      const contentColor = String(c.contentColor ?? "rgba(255,255,255,0.75)");
      const contentFontSize = Number(c.contentFontSize ?? 13);
      let overflowStyle = "overflow:hidden;";
      if (contentOverflow === "ellipsis") {
        overflowStyle = "display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden;";
      } else if (contentOverflow === "scroll") {
        overflowStyle = "overflow-y:auto;flex:1 1 0;min-height:0;";
      }
      html += `<div style="color:${contentColor};font-size:${contentFontSize}px;line-height:1.5;white-space:pre-wrap;${overflowStyle}">${escapeHTML(String(c.content))}</div>`;
    }

    html += `</div>`;
  }

  // —— 图片（bottom 位置） ——
  if (imageSource && imagePosition === "bottom") {
    const imgRadius = imageRadius > 0 ? `border-radius:${imageRadius}px;` : "";
    html += `<img src="${escapeHTML(imageSource)}" style="width:100%;height:${imageHeight}px;object-fit:cover;flex-shrink:0;display:block;${imgRadius}" />`;
  }

  html += `</div>`;
  return html;
};

/**
 * content-panel 内容面板 → HTML
 *
 * 与 sidebar-menu 配套使用：菜单项绑定 pane 链接后，
 * 点击菜单项在同一视图内切换面板内容，不跨页面导航。
 *
 * 配置：panes(JSON: [{id,name,content,bgColor}]), activePaneId,
 *       backgroundEnabled/backgroundColor/backgroundOpacity,
 *       borderEnabled/borderColor/borderWidth/borderStyle,
 *       borderRadius, paddingX/paddingY,
 *       shadowEnabled/shadowOffsetX/shadowOffsetY/shadowBlur/shadowSpread/shadowColor,
 *       overflow, contentBg/contentColor/contentFontSize/contentLineHeight/contentPaddingX/contentPaddingY,
 *       animationEnabled/animationType,
 *       dataMode(static|api)/apiUrl/apiMethod/apiInterval/apiDataPath/authEnabled
 *       （api 模式下面板内容支持 {字段} 插值）
 */
export const contentPanelCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config;

  // —— 解析面板列表（共享解析，与编辑器/渲染器/菜单绑定一致）——
  const panes: PaneItem[] = parsePanes(c.panes);
  const activePaneId = normalizeActivePaneId(panes, c.activePaneId);
  const contentBg = String(c.contentBg ?? "transparent");
  const contentColor = String(c.contentColor ?? "rgba(255,255,255,0.85)");
  const contentFontSize = Number(c.contentFontSize ?? 14);
  const contentLineHeight = Number(c.contentLineHeight ?? 1.6);
  const contentPaddingX = Number(c.contentPaddingX ?? 12);
  const contentPaddingY = Number(c.contentPaddingY ?? 12);
  const animationEnabled = c.animationEnabled !== false;
  const animationType = String(c.animationType ?? "fade");

  // —— 外层样式 ——
  const outerStyles: string[] = [
    "width: 100%",
    "height: 100%",
    "display: flex",
    "flex-direction: column",
    "box-sizing: border-box",
    `overflow: ${c.overflow ?? "hidden"}`,
  ];

  if (c.backgroundEnabled) {
    outerStyles.push(`background: ${applyOpacity(String(c.backgroundColor ?? "rgba(30,30,50,0.6)"), Number(c.backgroundOpacity ?? 100))}`);
  }

  if (c.borderEnabled) {
    outerStyles.push(`border: ${c.borderWidth ?? 1}px ${c.borderStyle ?? "solid"} ${c.borderColor ?? "rgba(255,255,255,0.12)"}`);
  }

  if (c.borderRadius !== undefined) {
    outerStyles.push(`border-radius: ${c.borderRadius}px`);
  }

  if (c.paddingX !== undefined || c.paddingY !== undefined) {
    const py = c.paddingY ?? 16;
    const px = c.paddingX ?? 16;
    outerStyles.push(`padding: ${py}px ${px}px`);
  }

  if (c.shadowEnabled) {
    const sx = c.shadowOffsetX ?? 0;
    const sy = c.shadowOffsetY ?? 4;
    const blur = c.shadowBlur ?? 12;
    const spread = c.shadowSpread ?? 0;
    const color = c.shadowColor ?? "rgba(0,0,0,0.3)";
    outerStyles.push(`box-shadow: ${sx}px ${sy}px ${blur}px ${spread}px ${color}`);
  }

  // —— 面板内容区 ——
  const panesHTML = panes.length === 0
    ? `<div style="flex:1;display:flex;align-items:center;justify-content:center;font-size:12px;color:rgba(255,255,255,0.35);font-style:italic">未配置面板</div>`
    : panes.map((pane) => {
      const isActive = pane.id === activePaneId;
      const paneBg = pane.bgColor || contentBg;
      const paneStyles: string[] = [
        "flex: 1",
        "min-height: 0",
        "box-sizing: border-box",
        `padding: ${contentPaddingY}px ${contentPaddingX}px`,
        `background: ${paneBg}`,
        `color: ${contentColor}`,
        `font-size: ${contentFontSize}px`,
        `line-height: ${contentLineHeight}`,
        `overflow-y: auto`,
        `overflow-x: hidden`,
        isActive ? "display: block" : "display: none",
      ];
      if (animationEnabled && animationType === "fade") {
        paneStyles.push("transition: opacity 0.3s ease");
        if (!isActive) paneStyles.push("opacity: 0");
        else paneStyles.push("opacity: 1");
      }
      return `<div data-pane-id="${escapeHTML(pane.id)}" style="${paneStyles.join("; ")}">${escapeHTML(pane.content)}</div>`;
    }).join("\n");

  // —— 面板切换脚本（注入 pageScripts，每页只注入一次）——
  const hasPaneSwitcher = ctx.pageScripts.some((s) => s.includes("__wcPaneSwitcherInit"));
  if (!hasPaneSwitcher) {
    ctx.pageScripts.push(buildPaneSwitcherScript());
  }

  // —— 锚点滚动脚本（注入 pageScripts，每页只注入一次）——
  const hasAnchor = ctx.pageScripts.some((s) => s.includes("__wcAnchorInit"));
  if (!hasAnchor) {
    ctx.pageScripts.push(`// web-craft anchor smooth scroll
(function(){if(window.__wcAnchorInit)return;window.__wcAnchorInit=true;
document.addEventListener('click',function(e){var link=e.target.closest('[data-anchor]');if(!link)return;e.preventDefault();var id=link.getAttribute('data-anchor');if(!id)return;var el=document.getElementById(id);if(!el)return;el.scrollIntoView({behavior:'smooth',block:'start'})})})();`);
  }

  // —— API 数据绑定脚本（dataMode=api 时拉取数据并插值 {字段} 到面板内容）——
  // URL/headers/body 规则与统一骨架 dataLoaderScript 对齐（apiPath 拼接、全局默认头、请求体按原文发送）
  const dataMode = String(c.dataMode ?? "static");
  const apiUrl = String(c.apiUrl ?? "");
  const apiPathCfg = String(c.apiPath ?? "");
  let dataScriptHTML = "";
  if (dataMode === "api" && (apiUrl !== "" || apiPathCfg !== "") && panes.length > 0) {
    const rawContents = JSON.stringify(Object.fromEntries(panes.map((p) => [p.id, p.content])));
    const method = String(c.apiMethod ?? "GET");
    const intervalSec = Number(c.apiInterval ?? 0);
    const dataPath = String(c.apiDataPath ?? "");
    const apiHeadersRaw = String(c.apiHeaders ?? "");
    const apiBodyRaw = String(c.apiBody ?? "");
    const authEnabled = readAuthEnabled(c.authEnabled);
    dataScriptHTML = `<script>(function(){
var root=document.querySelector('[data-wc-content-panel][data-panel-id="${escapeHTML(component.id)}"]');if(!root||root.__wcPaneDataBound)return;root.__wcPaneDataBound=true;
var RAW=${rawContents};
var METHOD=${toJsString(method)};
var APIURL=${toJsString(apiUrl)};
var APIPATH=${toJsString(apiPathCfg)};
var HEADERS_RAW=${toJsString(apiHeadersRaw)};
var BODY_RAW=${toJsString(apiBodyRaw)};
var PATH=${toJsString(dataPath)};
var AUTH=${authEnabled === null ? "null" : String(authEnabled)};
var INTERVAL=${intervalSec > 0 ? Math.floor(intervalSec) : 0};
function buildUrl(){var base=window.__WC_API_BASE||"";if(APIURL&&/^https?:\\/\\//i.test(APIURL))return APIURL;if(APIURL)return base?base.replace(/\\/+$/,"")+(APIURL.charAt(0)==="/"?"":"/")+APIURL:APIURL;if(APIPATH)return base?base.replace(/\\/+$/,"")+(APIPATH.charAt(0)==="/"?"":"/")+APIPATH:APIPATH;return base;}
function buildHeaders(){var h={};var d=window.__WC_DEFAULT_HEADERS||{};for(var k in d){h[k]=d[k];}if(HEADERS_RAW){try{var x=JSON.parse(HEADERS_RAW);for(var k2 in x){h[k2]=x[k2];}}catch(e){}}var useAuth=AUTH===null?(window.__WC_AUTH_ENABLED||false):AUTH===true;if(useAuth){var key=window.__WC_TOKEN_KEY||"auth_token";var s=window.__WC_TOKEN_STORAGE||"localStorage";var hdr=window.__WC_TOKEN_HEADER||"Authorization";var px=window.__WC_TOKEN_PREFIX!==undefined?window.__WC_TOKEN_PREFIX:"Bearer ";var v=null;if(s==="localStorage"){try{v=localStorage.getItem(key);}catch(e){}}else if(s==="sessionStorage"){try{v=sessionStorage.getItem(key);}catch(e){}}else{v=(window.__webcraft_memory_cache||{})[key];}if(v)h[hdr]=px+v;}return h;}
function getNested(o,p){if(!o||!p)return undefined;var pts=p.split("."),cur=o;for(var i=0;i<pts.length;i++){if(cur==null)return undefined;cur=cur[pts[i]];}return cur;}
function interp(tpl,data){if(!tpl||tpl.indexOf("{")<0)return tpl;return tpl.replace(/\\{\\s*([A-Za-z0-9_.\\-]+)\\s*\\}/g,function(w,k){var v=getNested(data,k);if(v===undefined||v===null)return w;return typeof v==="object"?JSON.stringify(v):String(v);});}
function paint(data){var els=root.querySelectorAll("[data-pane-id]");for(var i=0;i<els.length;i++){var id=els[i].getAttribute("data-pane-id");var tpl=RAW[id];if(tpl===undefined)continue;els[i].textContent=interp(tpl,data);}}
function run(){var headers=buildHeaders();if(METHOD!=="GET"&&BODY_RAW&&headers["Content-Type"]===undefined)headers["Content-Type"]="application/json";var opts={method:METHOD,headers:headers};if(METHOD!=="GET"&&BODY_RAW)opts.body=BODY_RAW;fetch(buildUrl(),opts).then(function(r){return r.json().catch(function(){return r.text();});}).then(function(raw){var data=getNested(raw,PATH);if(data===undefined)data=raw;paint(data);}).catch(function(){});}
run();
if(INTERVAL>0)setInterval(run,INTERVAL*1000);
window.addEventListener("auth-state-change",function(){run();});
})();</script>`;
  }

  return `<div data-wc-content-panel data-panel-id="${escapeHTML(component.id)}" data-active-pane="${escapeHTML(activePaneId)}" style="${outerStyles.join("; ")}">${panesHTML}</div>${dataScriptHTML}`;
};

// ── 弹出框 (content-modal) ─────────────────────────────────────────────
export const modalCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config;

  // —— 解析弹出框列表 ——
  const modalsRaw = String(c.modals ?? "");
  let modals: { id: string; name: string; title: string; content: string; bgColor?: string | null }[] = [];
  const trimmed = modalsRaw.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        modals = parsed.map((m: Record<string, unknown>) => ({
          id: String(m.id ?? ""),
          name: String(m.name ?? ""),
          title: String(m.title ?? ""),
          content: String(m.content ?? ""),
          bgColor: m.bgColor !== undefined ? String(m.bgColor) : null,
        })).filter((m: { id: string }) => m.id);
      }
    } catch {
      // fall through
    }
  }
  if (modals.length === 0) {
    modals = [{ id: "modal-1", name: "弹出框 1", title: "弹出标题", content: "这里是弹出框内容。" }];
  }

  // —— 功能类型与按钮配置 ——
  const modalStyle = String(c.modalStyle ?? "info");
  const okText = String(c.okText ?? "确定");
  const cancelText = String(c.cancelText ?? "取消");
  const okButtonColor = String(c.okButtonColor ?? "#4f9eff");
  const cancelButtonColor = String(c.cancelButtonColor ?? "#666666");

  // —— 解析表单字段（仅 form 类型） ——
  const formFieldsRaw = String(c.formFields ?? "");
  let formFields: { name: string; label: string; type: string; placeholder?: string; required?: boolean; options?: string[]; dataBinding?: { source: string; field: string } | null }[] = [];
  const ffTrimmed = formFieldsRaw.trim();
  if (ffTrimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(ffTrimmed);
      if (Array.isArray(parsed)) {
        formFields = parsed
          .filter((f: Record<string, unknown>) => f && typeof f.name === "string")
          .map((f: Record<string, unknown>) => ({
            name: String(f.name ?? ""),
            label: String(f.label ?? ""),
            type: String(f.type ?? "text"),
            placeholder: f.placeholder ? String(f.placeholder) : undefined,
            required: f.required === true,
            options: Array.isArray(f.options) ? f.options.map(String) : undefined,
            dataBinding: f.dataBinding && typeof f.dataBinding === "object"
              ? { source: String((f.dataBinding as Record<string, unknown>).source ?? ""), field: String((f.dataBinding as Record<string, unknown>).field ?? "") }
              : null,
          }));
      }
    } catch { /* skip */ }
  }
  if (formFields.length === 0 && modalStyle === "form") {
    formFields = [{ name: "field1", label: "字段 1", type: "text", placeholder: "请输入", required: false }];
  }

  // —— 样式参数 ——
  const modalWidth = Number(c.modalWidth ?? 480);
  const modalMaxHeight = Number(c.modalMaxHeight ?? 80);
  const overlayColor = String(c.overlayColor ?? "rgba(0,0,0,0.6)");
  const overlayBlur = c.overlayBlur === true;
  const overlayBlurAmount = Number(c.overlayBlurAmount ?? 4);
  const showCloseButton = c.showCloseButton !== false;
  const animationEnabled = c.animationEnabled !== false;
  const containerBg = String(c.containerBg ?? "rgba(40,40,60,0.95)");
  const containerColor = String(c.containerColor ?? "#ffffff");
  const titleColor = String(c.titleColor ?? "#ffffff");
  const titleFontSize = Number(c.titleFontSize ?? 18);
  const contentColor = String(c.contentColor ?? "rgba(255,255,255,0.85)");
  const contentFontSize = Number(c.contentFontSize ?? 14);
  const contentLineHeight = Number(c.contentLineHeight ?? 1.6);
  const borderRadius = Number(c.borderRadius ?? 12);
  const paddingX = Number(c.paddingX ?? 24);
  const paddingY = Number(c.paddingY ?? 24);
  const borderEnabled = c.borderEnabled === true;
  const borderColor = String(c.borderColor ?? "rgba(255,255,255,0.12)");
  const borderWidth = Number(c.borderWidth ?? 1);
  const borderStyle = String(c.borderStyle ?? "solid");
  const shadowEnabled = c.shadowEnabled !== false;
  const shadowBlur = Number(c.shadowBlur ?? 40);
  const shadowColor = String(c.shadowColor ?? "rgba(0,0,0,0.5)");

  // —— 按钮基础样式生成器 ——
  const btnStyle = (bgColor: string) => [
    "display:inline-flex", "align-items:center", "justify-content:center",
    "padding:8px 20px", "border-radius:6px", "font-size:13px", "font-weight:500",
    "cursor:pointer", "border:none", "white-space:nowrap",
    `background:${bgColor}`, "color:#fff", "transition:opacity 0.15s",
  ].join(";");

  // —— 表单字段 HTML 生成器（仅 form） ——
  const formFieldsHTML = modalStyle === "form"
    ? formFields.map((field) => {
        const labelHTML = `<label style="font-size:12.5px;font-weight:500;color:${contentColor};margin-bottom:4px;display:block">${escapeHTML(field.label || field.name)}${field.required ? ' <span style="color:#f44">*</span>' : ""}</label>`;
        let inputHTML = "";
        if (field.type === "textarea") {
          inputHTML = `<textarea name="${escapeHTML(field.name)}" data-modal-field placeholder="${escapeHTML(field.placeholder ?? "")}" style="width:100%;min-height:60px;padding:8px 10px;border-radius:4px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.03);color:${containerColor};font-size:13px;resize:vertical;box-sizing:border-box"></textarea>`;
        } else if (field.type === "select") {
          const opts = (field.options ?? []).map((o) => `<option value="${escapeHTML(o)}">${escapeHTML(o)}</option>`).join("");
          inputHTML = `<select name="${escapeHTML(field.name)}" data-modal-field style="width:100%;height:34px;padding:0 10px;border-radius:4px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.03);color:${containerColor};font-size:13px;box-sizing:border-box"><option value="" disabled selected>${escapeHTML(field.placeholder ?? "选择...")}</option>${opts}</select>`;
        } else if (field.type === "checkbox") {
          inputHTML = `<input type="checkbox" name="${escapeHTML(field.name)}" data-modal-field style="width:16px;height:16px;cursor:pointer" />`;
        } else {
          inputHTML = `<input type="${escapeHTML(field.type)}" name="${escapeHTML(field.name)}" data-modal-field placeholder="${escapeHTML(field.placeholder ?? "")}" style="width:100%;height:34px;padding:0 10px;border-radius:4px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.03);color:${containerColor};font-size:13px;box-sizing:border-box" />`;
        }
        return `<div style="display:flex;flex-direction:column;margin-bottom:12px">${labelHTML}${inputHTML}</div>`;
      }).join("")
    : "";

  // —— 按钮区 HTML 生成器 ——
  const cancelButtonHTML = modalStyle !== "info"
    ? `<button data-modal-close data-modal-action="cancel" style="${btnStyle(cancelButtonColor)}">${escapeHTML(cancelText)}</button>`
    : "";
  const okButtonLabel = modalStyle === "form" ? "提交" : okText;
  const okAction = modalStyle === "form" ? "submit" : "ok";
  const okButtonHTML = `<button data-modal-close data-modal-action="${okAction}" style="${btnStyle(okButtonColor)}">${escapeHTML(okButtonLabel)}</button>`;
  const buttonsHTML = `<div style="display:flex;justify-content:flex-end;gap:8px;flex-shrink:0;padding-top:4px">${cancelButtonHTML}${okButtonHTML}</div>`;

  // —— 生成每个 modal 的 HTML（默认隐藏，由 JS 控制） ——
  // DOM 结构：overlay（遮罩）和 content（内容框）为兄弟节点
  // content 用 absolute 定位到组件包装 div 的位置（即组件在画布上的坐标）
  const modalsHTML = modals.map((modal) => {
    const modalBg = modal.bgColor || containerBg;

    // 遮罩层：fixed 覆盖视口
    const overlayStyles: string[] = [
      "position: fixed",
      "top: 0", "left: 0", "right: 0", "bottom: 0",
      "display: none",
      "z-index: 10000",
      `background: ${overlayColor}`,
    ];
    if (overlayBlur) overlayStyles.push(`backdrop-filter: blur(${overlayBlurAmount}px)`);

    // 内容框：absolute 相对于组件包装 div 定位（跟决组件画布位置弹出）
    const contentStyles: string[] = [
      "position: absolute",
      "top: 0", "left: 0",
      `width: ${modalWidth}px`,
      "max-width: 90vw",
      `max-height: ${modalMaxHeight}vh`,
      `background: ${modalBg}`,
      `color: ${containerColor}`,
      `border-radius: ${borderRadius}px`,
      `padding: ${paddingY}px ${paddingX}px`,
      "display: none",
      "flex-direction: column",
      "gap: 8px",
      "overflow: auto",
      "z-index: 10001",
      "opacity: 0",
      "transform: translateY(-20px) scale(0.95)",
    ];
    if (borderEnabled) contentStyles.push(`border: ${borderWidth}px ${borderStyle} ${borderColor}`);
    if (shadowEnabled) contentStyles.push(`box-shadow: 0 0 ${shadowBlur}px ${shadowColor}`);
    if (animationEnabled) contentStyles.push("transition: opacity 0.2s ease, transform 0.2s ease");

    // 标题栏
    const closeHTML = showCloseButton
      ? `<div data-modal-close style="cursor:pointer;color:rgba(255,255,255,0.5);flex-shrink:0;padding:4px;border-radius:4px;display:flex;align-items:center" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='transparent'"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></div>`
      : "";
    const titleHTML = `<div style="display:flex;align-items:center;justify-content:space-between;flex-shrink:0"><span style="font-size:${titleFontSize}px;font-weight:600;color:${titleColor}">${escapeHTML(modal.title || "(无标题)")}</span>${closeHTML}</div>`;

    // 内容区：form 类型渲染表单字段，info/confirm 渲染文本内容
    const bodyHTML = modalStyle === "form"
      ? `<div style="flex:1;overflow-y:auto">${formFieldsHTML}</div>`
      : `<div style="color:${contentColor};font-size:${contentFontSize}px;line-height:${contentLineHeight};overflow-y:auto;flex:1">${escapeHTML(modal.content || "(空内容)")}</div>`;

    // 结构：overlay 和 content 为兄弟节点
    return `<div data-modal-id="${escapeHTML(modal.id)}" data-modal-open="false" data-modal-style="${escapeHTML(modalStyle)}" style="display:contents"><div data-modal-overlay style="${overlayStyles.join("; ")}"></div><div data-modal-content style="${contentStyles.join("; ")}">${titleHTML}${bodyHTML}${buttonsHTML}</div></div>`;
  }).join("\n");

  // —— 注入 modal 交互脚本（每页只注入一次） ——
  const hasModalScript = ctx.pageScripts.some((s) => s.includes("__wcModalInit"));
  if (!hasModalScript) {
    ctx.pageScripts.push(buildModalSwitcherScript());
  }

  return modalsHTML;
};

/**
 * content-drawer 组件 codegen
 *
 * 与 modalCodegen 类似，但抽屉从四个边（top/bottom/left/right）滑动出现。
 * DOM 结构：overlay（fixed 遮罩）+ content（fixed 按方向定位）为兄弟节点。
 * 交互脚本使用 drawerSwitcher（data-drawer-* 属性），与 modalSwitcher 独立。
 */
export const drawerCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config;

  // —— 解析抽屉列表 ——
  const drawersRaw = String(c.modals ?? "");
  let drawers: { id: string; name: string; title: string; content: string; bgColor?: string | null }[] = [];
  const trimmed = drawersRaw.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        drawers = parsed.map((m: Record<string, unknown>) => ({
          id: String(m.id ?? ""),
          name: String(m.name ?? ""),
          title: String(m.title ?? ""),
          content: String(m.content ?? ""),
          bgColor: m.bgColor !== undefined ? String(m.bgColor) : null,
        })).filter((m: { id: string }) => m.id);
      }
    } catch { /* fall through */ }
  }
  if (drawers.length === 0) {
    drawers = [{ id: "drawer-1", name: "抽屉 1", title: "抽屉标题", content: "这里是抽屉内容。" }];
  }

  // —— 功能类型与按钮配置 ——
  const modalStyle = String(c.modalStyle ?? "info");
  const okText = String(c.okText ?? "确定");
  const cancelText = String(c.cancelText ?? "取消");
  const okButtonColor = String(c.okButtonColor ?? "#4f9eff");
  const cancelButtonColor = String(c.cancelButtonColor ?? "#666666");

  // —— 抽屉方向与尺寸 ——
  const direction = String(c.direction ?? "right");
  const drawerWidth = Number(c.drawerWidth ?? 380);
  const drawerHeight = Number(c.drawerHeight ?? 400);

  // —— 解析表单字段（仅 form 类型） ——
  const formFieldsRaw = String(c.formFields ?? "");
  let formFields: { name: string; label: string; type: string; placeholder?: string; required?: boolean; options?: string[]; dataBinding?: { source: string; field: string } | null }[] = [];
  const ffTrimmed = formFieldsRaw.trim();
  if (ffTrimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(ffTrimmed);
      if (Array.isArray(parsed)) {
        formFields = parsed
          .filter((f: Record<string, unknown>) => f && typeof f.name === "string")
          .map((f: Record<string, unknown>) => ({
            name: String(f.name ?? ""),
            label: String(f.label ?? ""),
            type: String(f.type ?? "text"),
            placeholder: f.placeholder ? String(f.placeholder) : undefined,
            required: f.required === true,
            options: Array.isArray(f.options) ? f.options.map(String) : undefined,
            dataBinding: f.dataBinding && typeof f.dataBinding === "object"
              ? { source: String((f.dataBinding as Record<string, unknown>).source ?? ""), field: String((f.dataBinding as Record<string, unknown>).field ?? "") }
              : null,
          }));
      }
    } catch { /* skip */ }
  }
  if (formFields.length === 0 && modalStyle === "form") {
    formFields = [{ name: "field1", label: "字段 1", type: "text", placeholder: "请输入", required: false }];
  }

  // —— 样式参数 ——
  const overlayColor = String(c.overlayColor ?? "rgba(0,0,0,0.6)");
  const overlayBlur = c.overlayBlur === true;
  const overlayBlurAmount = Number(c.overlayBlurAmount ?? 4);
  const showCloseButton = c.showCloseButton !== false;
  const animationEnabled = c.animationEnabled !== false;
  const animationDuration = Number(c.animationDuration ?? 300);
  const containerBg = String(c.containerBg ?? "rgba(40,40,60,0.95)");
  const containerColor = String(c.containerColor ?? "#ffffff");
  const titleColor = String(c.titleColor ?? "#ffffff");
  const titleFontSize = Number(c.titleFontSize ?? 18);
  const contentColor = String(c.contentColor ?? "rgba(255,255,255,0.85)");
  const contentFontSize = Number(c.contentFontSize ?? 14);
  const contentLineHeight = Number(c.contentLineHeight ?? 1.6);
  const borderRadius = Number(c.borderRadius ?? 12);
  const paddingX = Number(c.paddingX ?? 24);
  const paddingY = Number(c.paddingY ?? 24);
  const borderEnabled = c.borderEnabled === true;
  const borderColor = String(c.borderColor ?? "rgba(255,255,255,0.12)");
  const borderWidth = Number(c.borderWidth ?? 1);
  const borderStyle = String(c.borderStyle ?? "solid");
  const shadowEnabled = c.shadowEnabled !== false;
  const shadowBlur = Number(c.shadowBlur ?? 40);
  const shadowColor = String(c.shadowColor ?? "rgba(0,0,0,0.5)");

  // —— 按钮基础样式 ——
  const btnStyle = (bgColor: string) => [
    "display:inline-flex", "align-items:center", "justify-content:center",
    "padding:8px 20px", "border-radius:6px", "font-size:13px", "font-weight:500",
    "cursor:pointer", "border:none", "white-space:nowrap",
    `background:${bgColor}`, "color:#fff", "transition:opacity 0.15s",
  ].join(";");

  // —— 方向定位/动画计算 ——
  const dur = animationEnabled ? `${animationDuration}ms` : "0ms";
  const transitionStr = `transform ${dur} ease`;

  // 按方向生成 content 定位样式
  function getDirectionPosition(dir: string): { posStyles: string[]; initialTransform: string } {
    const posStyles: string[] = [];
    let initialTransform = "";
    switch (dir) {
      case "left":
        posStyles.push("top: 0", "left: 0", `width: ${drawerWidth}px`, "max-width: 100vw", "height: 100%");
        initialTransform = "translateX(-100%)";
        break;
      case "top":
        posStyles.push("top: 0", "left: 0", "right: 0", "width: 100%", `height: ${drawerHeight}px`, "max-height: 100vh");
        initialTransform = "translateY(-100%)";
        break;
      case "bottom":
        posStyles.push("bottom: 0", "left: 0", "right: 0", "width: 100%", `height: ${drawerHeight}px`, "max-height: 100vh");
        initialTransform = "translateY(100%)";
        break;
      default: // right
        posStyles.push("top: 0", "right: 0", `width: ${drawerWidth}px`, "max-width: 100vw", "height: 100%");
        initialTransform = "translateX(100%)";
        break;
    }
    return { posStyles, initialTransform };
  }

  // 按方向计算圆角（只在与内容区相接的边保留 0）
  function getDirectionBorderRadius(dir: string): string {
    switch (dir) {
      case "left": return `0 ${borderRadius}px ${borderRadius}px 0`;
      case "top": return `0 0 ${borderRadius}px ${borderRadius}px`;
      case "bottom": return `${borderRadius}px ${borderRadius}px 0 0`;
      default: return `${borderRadius}px 0 0 ${borderRadius}px`;
    }
  }

  // —— 表单字段 HTML ——
  const formFieldsHTML = modalStyle === "form"
    ? formFields.map((field) => {
        const labelHTML = `<label style="font-size:12.5px;font-weight:500;color:${contentColor};margin-bottom:4px;display:block">${escapeHTML(field.label || field.name)}${field.required ? ' <span style="color:#f44">*</span>' : ""}</label>`;
        let inputHTML = "";
        if (field.type === "textarea") {
          inputHTML = `<textarea name="${escapeHTML(field.name)}" data-drawer-field placeholder="${escapeHTML(field.placeholder ?? "")}" style="width:100%;min-height:60px;padding:8px 10px;border-radius:4px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.03);color:${containerColor};font-size:13px;resize:vertical;box-sizing:border-box"></textarea>`;
        } else if (field.type === "select") {
          const opts = (field.options ?? []).map((o) => `<option value="${escapeHTML(o)}">${escapeHTML(o)}</option>`).join("");
          inputHTML = `<select name="${escapeHTML(field.name)}" data-drawer-field style="width:100%;height:34px;padding:0 10px;border-radius:4px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.03);color:${containerColor};font-size:13px;box-sizing:border-box"><option value="" disabled selected>${escapeHTML(field.placeholder ?? "选择...")}</option>${opts}</select>`;
        } else if (field.type === "checkbox") {
          inputHTML = `<input type="checkbox" name="${escapeHTML(field.name)}" data-drawer-field style="width:16px;height:16px;cursor:pointer" />`;
        } else {
          inputHTML = `<input type="${escapeHTML(field.type)}" name="${escapeHTML(field.name)}" data-drawer-field placeholder="${escapeHTML(field.placeholder ?? "")}" style="width:100%;height:34px;padding:0 10px;border-radius:4px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.03);color:${containerColor};font-size:13px;box-sizing:border-box" />`;
        }
        return `<div style="display:flex;flex-direction:column;margin-bottom:12px">${labelHTML}${inputHTML}</div>`;
      }).join("")
    : "";

  // —— 按钮区 HTML ——
  const cancelButtonHTML = modalStyle !== "info"
    ? `<button data-drawer-close data-drawer-action="cancel" style="${btnStyle(cancelButtonColor)}">${escapeHTML(cancelText)}</button>`
    : "";
  const okButtonLabel = modalStyle === "form" ? "提交" : okText;
  const okAction = modalStyle === "form" ? "submit" : "ok";
  const okButtonHTML = `<button data-drawer-close data-drawer-action="${okAction}" style="${btnStyle(okButtonColor)}">${escapeHTML(okButtonLabel)}</button>`;
  const buttonsHTML = `<div style="display:flex;justify-content:flex-end;gap:8px;flex-shrink:0;padding-top:4px">${cancelButtonHTML}${okButtonHTML}</div>`;

  // —— 生成每个 drawer 的 HTML ——
  const dirBorderRadius = getDirectionBorderRadius(direction);
  const { posStyles, initialTransform } = getDirectionPosition(direction);

  const drawersHTML = drawers.map((drawer) => {
    const drawerBg = drawer.bgColor || containerBg;

    // 遮罩层
    const overlayStyles: string[] = [
      "position: fixed", "top: 0", "left: 0", "right: 0", "bottom: 0",
      "display: none", "z-index: 10000",
      `background: ${overlayColor}`,
    ];
    if (overlayBlur) overlayStyles.push(`backdrop-filter: blur(${overlayBlurAmount}px)`);

    // 内容框
    const contentStyles: string[] = [
      "position: fixed",
      ...posStyles,
      `background: ${drawerBg}`,
      `color: ${containerColor}`,
      `border-radius: ${dirBorderRadius}`,
      `padding: ${paddingY}px ${paddingX}px`,
      "display: none", "flex-direction: column", "gap: 8px", "overflow: auto",
      "z-index: 10001",
      `transform: ${initialTransform}`,
    ];
    if (borderEnabled) contentStyles.push(`border: ${borderWidth}px ${borderStyle} ${borderColor}`);
    if (shadowEnabled) contentStyles.push(`box-shadow: 0 0 ${shadowBlur}px ${shadowColor}`);
    if (animationEnabled) contentStyles.push(`transition: ${transitionStr}`);

    // 标题栏
    const closeHTML = showCloseButton
      ? `<div data-drawer-close style="cursor:pointer;color:rgba(255,255,255,0.5);flex-shrink:0;padding:4px;border-radius:4px;display:flex;align-items:center" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='transparent'"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></div>`
      : "";
    const titleHTML = `<div style="display:flex;align-items:center;justify-content:space-between;flex-shrink:0"><span style="font-size:${titleFontSize}px;font-weight:600;color:${titleColor}">${escapeHTML(drawer.title || "(无标题)")}</span>${closeHTML}</div>`;

    // 内容区
    const bodyHTML = modalStyle === "form"
      ? `<div style="flex:1;overflow-y:auto">${formFieldsHTML}</div>`
      : `<div style="color:${contentColor};font-size:${contentFontSize}px;line-height:${contentLineHeight};overflow-y:auto;flex:1">${escapeHTML(drawer.content || "(空内容)")}</div>`;

    return `<div data-drawer-id="${escapeHTML(drawer.id)}" data-drawer-open="false" data-drawer-style="${escapeHTML(modalStyle)}" data-drawer-direction="${escapeHTML(direction)}" style="display:contents"><div data-drawer-overlay style="${overlayStyles.join("; ")}"></div><div data-drawer-content style="${contentStyles.join("; ")}">${titleHTML}${bodyHTML}${buttonsHTML}</div></div>`;
  }).join("\n");

  // —— 注入 drawer 交互脚本（每页只注入一次） ——
  const hasDrawerScript = ctx.pageScripts.some((s) => s.includes("__wcDrawerInit"));
  if (!hasDrawerScript) {
    ctx.pageScripts.push(buildDrawerSwitcherScript());
  }

  return drawersHTML;
};
