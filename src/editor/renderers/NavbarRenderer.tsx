import { useState, useCallback } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { ComponentRendererProps } from "../../types/editor";

interface MenuItem {
  label: string;
  icon?: string;
  href?: string;
  disabled?: boolean;
  children?: MenuItem[];
}

function parseMenuItems(raw: string): MenuItem[] {
  const trimmed = raw.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // fall through
    }
  }
  return trimmed
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((label) => ({ label }));
}

export function NavbarRenderer({ config }: ComponentRendererProps) {
  // —— 方向 & 布局 ——
  const direction = (config.direction as string) || "horizontal";
  const isHorizontal = direction === "horizontal";

  // 水平模式：主轴线对齐（justify-content = align）
  // 垂直模式：垂直分布（justify-content = verticalAlign）
  const horizontalAlign = (config.horizontalAlign as string) || "center";
  const verticalAlign = (config.verticalAlign as string) || "flex-start";
  const itemTextAlign = (config.itemTextAlign as string) || "left"; // left | center | right

  // —— 菜单数据 ——
  const rawItems = (config.menuItems as string) || "首页\n产品\n方案\n关于";
  const items = parseMenuItems(rawItems);
  const activeIndex = (config.activeIndex as number) ?? 0;

  // —— 菜单项基础样式 ——
  const menuColor = (config.menuColor as string) || "rgba(255,255,255,0.85)";
  const menuFontSize = (config.menuFontSize as number) ?? 14;
  const menuFontWeight = (config.menuFontWeight as string) || "normal";
  const menuActiveColor = (config.menuActiveColor as string) || "#FF9800";
  const menuActiveWeight = (config.menuActiveWeight as string) || "600";
  const menuGap = (config.menuGap as number) ?? 4;

  // —— 菜单项高度（垂直模式关键） ——
  const itemHeight = (config.itemHeight as number) ?? 40;
  const itemIconSize = (config.itemIconSize as number) ?? 16;
  const itemIndent = (config.itemIndent as number) ?? 24;

  // —— 菜单项背景 ——
  const itemBgEnabled = (config.itemBgEnabled as boolean) ?? true;
  const itemActiveBg = (config.itemActiveBg as string) || "rgba(255,152,0,0.15)";
  const itemPaddingX = (config.itemPaddingX as number) ?? 12;
  const itemPaddingY = (config.itemPaddingY as number) ?? 6;
  const itemRadius = (config.itemRadius as number) ?? 6;
  const itemMinWidth = (config.itemMinWidth as number) ?? 0;

  // —— 指示线 ——
  const indicatorEnabled = (config.indicatorEnabled as boolean) ?? false;
  const indicatorColor = (config.indicatorColor as string) || "";
  const indicatorWidth = (config.indicatorWidth as number) ?? 2;

  // —— 分割线 ——
  const dividerEnabled = (config.dividerEnabled as boolean) ?? false;
  const dividerColor = (config.dividerColor as string) || "rgba(255,255,255,0.1)";
  const dividerWidth = (config.dividerWidth as number) ?? 1;

  // —— 子菜单展开状态 ——
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set(["0"]));

  const toggleExpand = useCallback((key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // —— 背景 ——
  const bgColor = (config.backgroundColor as string) || "rgba(30,30,50,0.9)";
  const bgOpacity = (config.backgroundOpacity as number) ?? 100;

  // —— 毛玻璃 ——
  const blurEnabled = (config.blurEnabled as boolean) ?? false;
  const blurAmount = (config.blurAmount as number) ?? 12;

  // —— 内边距 ——
  const paddingX = (config.paddingX as number) ?? 8;
  const paddingY = (config.paddingY as number) ?? 8;

  // —— 边框 ——
  const borderEnabled = (config.borderEnabled as boolean) ?? false;
  const borderColor = (config.borderColor as string) || "rgba(255,255,255,0.1)";
  const borderWidth = (config.borderWidth as number) ?? 1;
  const borderStyle = (config.borderStyle as string) || "solid";

  // —— 圆角 ——
  const borderRadius = (config.borderRadius as number) ?? 8;

  // —— 阴影 ——
  const shadowEnabled = (config.shadowEnabled as boolean) ?? false;
  const shadowOffsetX = (config.shadowOffsetX as number) ?? 0;
  const shadowOffsetY = (config.shadowOffsetY as number) ?? 4;
  const shadowBlur = (config.shadowBlur as number) ?? 12;
  const shadowSpread = (config.shadowSpread as number) ?? 0;
  const shadowColor = (config.shadowColor as string) || "rgba(0,0,0,0.3)";

  // —— 溢出 ——
  const overflow = (config.overflow as string) || "auto";

  // 背景透明度
  const withAlpha = (color: string, alpha: number) => {
    if (color.startsWith("#")) {
      let hex = color.slice(1);
      if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
      if (hex.length === 6) {
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
      }
    }
    return color;
  };

  const finalBg = withAlpha(bgColor, bgOpacity / 100);
  const finalIndicatorColor = indicatorColor || menuActiveColor;
  const finalShadow = shadowEnabled
    ? `${shadowOffsetX}px ${shadowOffsetY}px ${shadowBlur}px ${shadowSpread}px ${shadowColor}`
    : "none";

  const flexDirection = isHorizontal ? "row" : "column";
  // 主轴对齐：水平模式用 horizontalAlign，垂直模式用 verticalAlign
  const justifyContent = isHorizontal ? horizontalAlign : verticalAlign;
  // 交叉轴对齐：水平模式垂直居中，垂直模式拉伸铺满宽度
  const alignItems = isHorizontal ? "center" : "stretch";

  // 文字对齐对应的 justify-content
  const textJustify = itemTextAlign === "center" ? "center"
    : itemTextAlign === "right" ? "flex-end"
    : "flex-start";

  // 渲染单个菜单项（递归支持子菜单）
  const renderItem = (item: MenuItem, key: string, depth: number, isActive: boolean) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedKeys.has(key);
    const indent = depth * itemIndent;

    const itemSx: Record<string, unknown> = {
      display: "flex",
      alignItems: "center",
      cursor: item.disabled ? "not-allowed" : "pointer",
      userSelect: "none",
      whiteSpace: "nowrap",
      color: item.disabled
        ? "rgba(255,255,255,0.3)"
        : isActive
          ? menuActiveColor
          : menuColor,
      fontSize: `${menuFontSize}px`,
      fontWeight: isActive ? menuActiveWeight : menuFontWeight,
      transition: "all 0.2s",
      lineHeight: 1.2,
      boxSizing: "border-box",
      opacity: item.disabled ? 0.5 : 1,
      flexShrink: 0,
      gap: "8px",
      ...(isHorizontal
        ? {
            height: "auto",
            padding: itemBgEnabled ? `${itemPaddingY}px ${itemPaddingX}px` : 0,
            backgroundColor: itemBgEnabled && isActive ? itemActiveBg : "transparent",
            borderRadius: itemBgEnabled ? `${itemRadius}px` : 0,
            minWidth: itemMinWidth > 0 ? `${itemMinWidth}px` : undefined,
            justifyContent: textJustify,
            borderBottom:
              indicatorEnabled && !itemBgEnabled
                ? `${isActive ? indicatorWidth : 0}px solid ${isActive ? finalIndicatorColor : "transparent"}`
                : "none",
            paddingBottom: indicatorEnabled && !itemBgEnabled ? "2px" : undefined,
          }
        : {
            // 垂直模式：固定高度 + 层级缩进
            height: `${itemHeight}px`,
            paddingLeft: `${itemPaddingX + indent}px`,
            paddingRight: `${itemPaddingX}px`,
            backgroundColor: isActive ? itemActiveBg : "transparent",
            borderRadius: `${itemRadius}px`,
            justifyContent: "space-between",
            borderLeft:
              indicatorEnabled && !itemBgEnabled
                ? `${isActive ? indicatorWidth : 0}px solid ${isActive ? finalIndicatorColor : "transparent"}`
                : "none",
          }),
    };

    const handleClick = () => {
      // 不拦截事件:点击冒泡到组件 wrapper 触发选中(属性面板随之更新)
      if (hasChildren) {
        toggleExpand(key);
      }
    };

    // 左侧内容（图标 + 文字）—— 文字对齐由 textJustify 控制
    const leftContentSx: Record<string, unknown> = {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      minWidth: 0,
      flex: isHorizontal ? "none" : 1,
      justifyContent: isHorizontal ? textJustify : "flex-start",
      overflow: "hidden",
    };

    return (
      <Box key={key}>
        <Box sx={itemSx} onClick={handleClick}>
          <Box sx={leftContentSx}>
            {item.icon && (
              <Box
                component="span"
                sx={{
                  fontSize: `${itemIconSize}px`,
                  display: "inline-flex",
                  alignItems: "center",
                  lineHeight: 1,
                  flexShrink: 0,
                }}
              >
                {item.icon}
              </Box>
            )}
            <Typography
              sx={{
                fontSize: "inherit",
                fontWeight: "inherit",
                lineHeight: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {item.label}
            </Typography>
          </Box>
          {hasChildren && !isHorizontal && (
            <Typography
              sx={{
                fontSize: `${Math.max(10, menuFontSize - 4)}px`,
                opacity: 0.6,
                flexShrink: 0,
                lineHeight: 1,
                transition: "transform 0.2s",
                transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
              }}
            >
              ▸
            </Typography>
          )}
          {hasChildren && isHorizontal && (
            <Typography
              sx={{
                fontSize: `${Math.max(10, menuFontSize - 4)}px`,
                opacity: 0.6,
                flexShrink: 0,
                lineHeight: 1,
              }}
            >
              ▾
            </Typography>
          )}
        </Box>

        {/* 子菜单 */}
        {hasChildren && isExpanded && item.children && (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {item.children.map((child, i) =>
              renderItem(child, `${key}-${i}`, depth + 1, false)
            )}
          </Box>
        )}

        {/* 分割线（垂直模式） */}
        {!isHorizontal && dividerEnabled && (
          <Box
            sx={{
              height: `${dividerWidth}px`,
              backgroundColor: dividerColor,
              my: `${menuGap / 2}px`,
            }}
          />
        )}
      </Box>
    );
  };

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection,
        justifyContent,
        alignItems,
        padding: `${paddingY}px ${paddingX}px`,
        backgroundColor: finalBg,
        backdropFilter: blurEnabled ? `blur(${blurAmount}px)` : "none",
        WebkitBackdropFilter: blurEnabled ? `blur(${blurAmount}px)` : "none",
        border: borderEnabled
          ? `${borderWidth}px ${borderStyle} ${borderColor}`
          : "none",
        borderRadius: `${borderRadius}px`,
        boxShadow: finalShadow,
        boxSizing: "border-box",
        overflowY: isHorizontal ? (overflow === "auto" ? "hidden" : overflow) : overflow,
        overflowX: "hidden",
        gap: isHorizontal ? `${menuGap}px` : `${dividerEnabled ? 0 : menuGap}px`,
      }}
    >
      {items.map((item, i) => renderItem(item, String(i), 0, i === activeIndex))}
    </Box>
  );
}
