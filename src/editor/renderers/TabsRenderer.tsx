import { useState, useEffect, useCallback } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { ComponentRendererProps } from "../../types/editor";
import { switchTab } from "../utils/tabSwitcher";
import { parseTabs, getActiveTabId, type TabItem } from "../utils/tabsConfig";
import { resolveIcon } from "../plugins/IconResolver";

export function TabsRenderer({ config, componentId, mode }: ComponentRendererProps) {
  // —— 标签配置 ——
  const tabs = parseTabs(config);
  const configActiveTabId = getActiveTabId(config, tabs);

  // 预览模式用 local state 驱动标签按钮样式，编辑模式直接用 config 值
  const [localActiveTabId, setLocalActiveTabId] = useState(configActiveTabId);
  const isPreview = mode === "preview";
  const activeTabId = isPreview ? localActiveTabId : configActiveTabId;

  const activeTab = tabs.findIndex((t) => t.id === activeTabId);
  const safeActiveTab = activeTab >= 0 ? activeTab : 0;

  // 预览模式挂载时初始化子组件可见性
  useEffect(() => {
    if (!isPreview) return;
    // 延迟一帧等待子组件 DOM 就绪
    const raf = requestAnimationFrame(() => {
      switchTab(componentId, activeTabId, tabs);
    });
    return () => cancelAnimationFrame(raf);
  }, [isPreview, componentId, activeTabId, tabs]);

  const handleTabClick = useCallback((tabId: string) => {
    if (!isPreview) return;
    setLocalActiveTabId(tabId);
    switchTab(componentId, tabId, tabs);
  }, [isPreview, componentId, tabs]);

  // —— 标签位置 ——
  const tabPosition = (config.tabPosition as string) || "top";
  const isHorizontal = tabPosition === "top" || tabPosition === "bottom";

  // —— 标签样式形态 ——
  const variant = (config.variant as string) || "underline";

  // —— 标签尺寸 ——
  const tabSize = (config.tabSize as string) || "medium";
  const tabSizes = { small: 32, medium: 40, large: 48 };
  const tabHeight = tabSizes[tabSize as keyof typeof tabSizes] ?? 40;

  // —— 标签颜色 ——
  const tabColor = (config.tabColor as string) || "rgba(255,255,255,0.7)";
  const activeTabColor = (config.activeTabColor as string) || "#ffffff";
  const activeTabBg = (config.activeTabBg as string) || "rgba(255,255,255,0.08)";
  const indicatorColor = (config.indicatorColor as string) || "#FF9800";
  const indicatorWidth = (config.indicatorWidth as number) ?? 2;

  // —— 内容区样式 ——
  const contentBg = (config.contentBg as string) || "rgba(255,255,255,0.02)";
  const contentBgEnabled = (config.contentBgEnabled as boolean) ?? true;
  const contentBorderEnabled = (config.contentBorderEnabled as boolean) ?? true;
  const contentBorderColor = (config.contentBorderColor as string) || "rgba(255,255,255,0.1)";
  const contentBorderWidth = (config.contentBorderWidth as number) ?? 1;
  const contentPaddingX = (config.contentPaddingX as number) ?? 16;
  const contentPaddingY = (config.contentPaddingY as number) ?? 16;
  const contentRadius = (config.contentRadius as number) ?? 8;

  // —— 标签间距 ——
  const tabGap = (config.tabGap as number) ?? 4;

  const finalContentBg = contentBgEnabled ? contentBg : "transparent";

  // 内容区背景：优先用当前激活标签页的 contentBg，回退到全局
  const activeTabItem = tabs[safeActiveTab];
  const effectiveContentBg = activeTabItem?.contentBg ?? finalContentBg;

  // 渲染单个标签
  const renderTab = (tab: TabItem, index: number) => {
    const isActive = tab.id === activeTabId;

    let tabSx: Record<string, unknown> = {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: isPreview ? "pointer" : "default",
      userSelect: "none",
      whiteSpace: "nowrap",
      padding: "0 16px",
      transition: "all 0.2s",
      fontSize: variant === "segmented" ? 13 : 14,
      height: isHorizontal ? `${tabHeight}px` : "auto",
      minHeight: isHorizontal ? "auto" : `${tabHeight}px`,
      width: !isHorizontal ? "100%" : "auto",
      boxSizing: "border-box",
    };

    if (variant === "underline") {
      tabSx = {
        ...tabSx,
        color: isActive ? activeTabColor : tabColor,
        borderBottom: isHorizontal && isActive
          ? `${indicatorWidth}px solid ${indicatorColor}`
          : isHorizontal
            ? `${indicatorWidth}px solid transparent`
            : "none",
        borderLeft: !isHorizontal && isActive
          ? `${indicatorWidth}px solid ${indicatorColor}`
          : !isHorizontal
            ? `${indicatorWidth}px solid transparent`
            : "none",
        backgroundColor: "transparent",
        paddingLeft: !isHorizontal ? "12px" : "16px",
      };
    } else if (variant === "pill") {
      tabSx = {
        ...tabSx,
        color: isActive ? "#ffffff" : tabColor,
        backgroundColor: isActive ? indicatorColor : "transparent",
        borderRadius: "999px",
      };
    } else if (variant === "card") {
      tabSx = {
        ...tabSx,
        color: isActive ? activeTabColor : tabColor,
        backgroundColor: isActive ? activeTabBg : "transparent",
        borderTopLeftRadius: isHorizontal ? "8px" : "8px",
        borderTopRightRadius: isHorizontal ? "8px" : 0,
        borderBottomLeftRadius: !isHorizontal ? 0 : "8px",
        borderBottomRightRadius: !isHorizontal ? 0 : 0,
        border: isActive
          ? `1px solid ${contentBorderColor}`
          : "1px solid transparent",
        ...(isHorizontal && isActive ? { borderBottom: "none", mb: "-1px" } : {}),
        ...(!isHorizontal && isActive ? { borderRight: "none", mr: "-1px" } : {}),
        position: "relative",
        zIndex: isActive ? 2 : 1,
      };
    } else if (variant === "segmented") {
      tabSx = {
        ...tabSx,
        color: isActive ? "#ffffff" : tabColor,
        backgroundColor: isActive ? indicatorColor : "transparent",
        flex: 1,
        padding: "0 12px",
      };
    }

    return (
      <Box
        key={tab.id}
        data-tab-link={index}
        data-tab-id={tab.id}
        data-tab-active={isActive ? "true" : "false"}
        sx={tabSx}
        onClick={isPreview ? () => handleTabClick(tab.id) : undefined}
      >
        {tab.icon && resolveIcon(tab.icon, "widgets", 16, undefined)}
        <Typography
          sx={{
            fontSize: "inherit",
            fontWeight: isActive ? 600 : 400,
            lineHeight: 1,
          }}
        >
          {tab.label}
        </Typography>
      </Box>
    );
  };

  const tabElements = tabs.map((tab, i) => renderTab(tab, i));

  // 标签容器样式
  const headerSx: Record<string, unknown> = {
    display: "flex",
    flexShrink: 0,
    gap: `${tabGap}px`,
    backgroundColor: variant === "segmented" ? "rgba(255,255,255,0.05)" : "transparent",
    padding: variant === "segmented" ? "4px" : 0,
    borderRadius: variant === "segmented" ? "8px" : 0,
    ...(isHorizontal
      ? { flexDirection: "row", alignItems: "center", width: "100%" }
      : { flexDirection: "column", alignItems: "stretch", height: "100%" }),
  };

  // 内容区样式
  const contentSx: Record<string, unknown> = {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    backgroundColor: effectiveContentBg,
    border: contentBorderEnabled
      ? `${contentBorderWidth}px solid ${contentBorderColor}`
      : "none",
    borderRadius: variant === "card"
      ? (tabPosition === "top" ? "0 8px 8px 8px" : tabPosition === "bottom" ? "8px 8px 8px 0" : tabPosition === "left" ? "0 8px 8px 0" : "8px 0 0 8px")
      : `${contentRadius}px`,
    padding: `${contentPaddingY}px ${contentPaddingX}px`,
    boxSizing: "border-box",
    overflow: "hidden",
    position: "relative",
  };

  // 布局顺序
  const isTopOrLeft = tabPosition === "top" || tabPosition === "left";
  const flexDirection = isHorizontal ? "column" : "row";

  return (
    <Box
      data-tabs-id={componentId}
      data-active-tab={safeActiveTab}
      data-active-tab-id={activeTabId}
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection,
        boxSizing: "border-box",
      }}
    >
      {isTopOrLeft && <Box sx={headerSx}>{tabElements}</Box>}
      <Box sx={contentSx} data-tabs-content="true" />
      {!isTopOrLeft && <Box sx={headerSx}>{tabElements}</Box>}
    </Box>
  );
}
