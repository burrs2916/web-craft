import type { ComponentCodegenFn } from "../../types";
import { buildTabSwitcherScript } from "../../../editor/utils/tabSwitcher";
import { getActiveTabId, getChildTabId, parseTabs } from "../../../editor/utils/tabsConfig";
import { generateChildHTML } from "../../engine";
import { renderMenuIcon } from "../../iconPipeline";
import { escapeHTML } from "../../layout";

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

