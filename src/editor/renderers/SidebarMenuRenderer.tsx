import { useState, useCallback, useEffect } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { ComponentRendererProps } from "../../types/editor";
import { useEditorStore } from "../../store/editorStore";
import { parseMenuItems, type MenuItem } from "../utils/menuItems";
import { switchPane } from "../utils/paneSwitcher";
import { openModal } from "../utils/modalSwitcher";
import { openDrawer } from "../utils/drawerSwitcher";
import { resolveIcon } from "../plugins";

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

export function SidebarMenuRenderer({ config, mode }: ComponentRendererProps) {
  // —— 布局 ——
  const verticalAlign = (config.verticalAlign as string) || "flex-start";
  const switchView = useEditorStore((s) => s.switchView);

  // —— 菜单数据 ——
  const items = parseMenuItems(config.menuItems);
  // 高亮项：路径 key（如 "0-1"，支持子项）；老数据只有 activeIndex 数字
  const activeKey = (config.activeKey as string)
    ?? ((config.activeIndex as number) != null ? String(config.activeIndex) : "0");

  // —— 菜单项样式 ——
  const menuColor = (config.menuColor as string) || "rgba(255,255,255,0.85)";
  const menuFontSize = (config.menuFontSize as number) ?? 14;
  const menuFontWeight = (config.menuFontWeight as string) || "normal";
  const menuActiveColor = (config.menuActiveColor as string) || "#FF9800";
  const menuActiveWeight = (config.menuActiveWeight as string) || "600";
  const menuGap = (config.menuGap as number) ?? 4;

  const itemHeight = (config.itemHeight as number) ?? 40;
  const itemIconSize = (config.itemIconSize as number) ?? 16;
  const itemIndent = (config.itemIndent as number) ?? 24;

  // —— 菜单项背景 ——
  const itemBgEnabled = (config.itemBgEnabled as boolean) ?? true;
  const itemActiveBg = (config.itemActiveBg as string) || "rgba(255,152,0,0.15)";
  const itemPaddingX = (config.itemPaddingX as number) ?? 12;
  const itemRadius = (config.itemRadius as number) ?? 6;

  // —— 高亮指示线（左侧竖线）——
  const indicatorEnabled = (config.indicatorEnabled as boolean) ?? false;
  const indicatorColor = (config.indicatorColor as string) || "";
  const indicatorWidth = (config.indicatorWidth as number) ?? 3;

  // —— 分割线 ——
  const dividerEnabled = (config.dividerEnabled as boolean) ?? false;
  const dividerColor = (config.dividerColor as string) || "rgba(255,255,255,0.1)";
  const dividerWidth = (config.dividerWidth as number) ?? 1;

  // —— 子菜单展开 ——
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const toggleExpand = useCallback((key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // 编辑模式：首次挂载时自动展开所有有子项的菜单
  useEffect(() => {
    if (mode === "preview") return;
    const parentKeys = new Set<string>();
    const collect = (list: MenuItem[], prefix = "") => {
      list.forEach((item, i) => {
        const k = prefix ? `${prefix}-${i}` : String(i);
        if (item.children?.length) {
          parentKeys.add(k);
          collect(item.children, k);
        }
      });
    };
    collect(items);
    setExpandedKeys(parentKeys);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // —— 背景 & 外观 ——
  const bgColor = (config.backgroundColor as string) || "rgba(30,30,50,0.9)";
  const bgOpacity = (config.backgroundOpacity as number) ?? 100;
  const blurEnabled = (config.blurEnabled as boolean) ?? false;
  const blurAmount = (config.blurAmount as number) ?? 12;
  const paddingX = (config.paddingX as number) ?? 8;
  const paddingY = (config.paddingY as number) ?? 8;
  const borderEnabled = (config.borderEnabled as boolean) ?? false;
  const borderColor = (config.borderColor as string) || "rgba(255,255,255,0.1)";
  const borderWidth = (config.borderWidth as number) ?? 1;
  const borderStyle = (config.borderStyle as string) || "solid";
  const borderRadius = (config.borderRadius as number) ?? 8;
  const shadowEnabled = (config.shadowEnabled as boolean) ?? false;
  const shadowOffsetX = (config.shadowOffsetX as number) ?? 0;
  const shadowOffsetY = (config.shadowOffsetY as number) ?? 4;
  const shadowBlur = (config.shadowBlur as number) ?? 12;
  const shadowSpread = (config.shadowSpread as number) ?? 0;
  const shadowColor = (config.shadowColor as string) || "rgba(0,0,0,0.3)";
  const overflow = (config.overflow as string) || "auto";

  const finalBg = withAlpha(bgColor, bgOpacity / 100);
  const finalIndicatorColor = indicatorColor || menuActiveColor;
  const finalShadow = shadowEnabled
    ? `${shadowOffsetX}px ${shadowOffsetY}px ${shadowBlur}px ${shadowSpread}px ${shadowColor}`
    : "none";

  // 递归渲染菜单项
  const renderItem = (item: MenuItem, key: string, depth: number, isActive: boolean) => {
    // 分割符项：渲染为分隔条而非可点击菜单项
    if (item.isDivider) {
      return (
        <Box key={key} sx={{ py: `${menuGap / 2}px` }}>
          {item.groupTitle ? (
            <Box sx={{ display: "flex", alignItems: "center", gap: "8px", px: `${itemPaddingX}px` }}>
              <Typography sx={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 500, whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {item.groupTitle}
              </Typography>
              <Box sx={{ flex: 1, height: `${dividerWidth}px`, backgroundColor: dividerColor }} />
            </Box>
          ) : (
            <Box sx={{ height: `${dividerWidth}px`, backgroundColor: dividerColor, mx: `${itemPaddingX}px` }} />
          )}
        </Box>
      );
    }

    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedKeys.has(key);
    const indent = depth * itemIndent;

    const itemSx: Record<string, unknown> = {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      cursor: item.disabled ? "not-allowed" : "pointer",
      userSelect: "none",
      whiteSpace: "nowrap",
      color: item.disabled
        ? "rgba(255,255,255,0.3)"
        : isActive
          ? menuActiveColor
          : (item.color || menuColor),
      fontSize: `${item.fontSize ?? menuFontSize}px`,
      fontWeight: isActive ? menuActiveWeight : menuFontWeight,
      transition: "all 0.2s",
      lineHeight: 1.2,
      boxSizing: "border-box",
      opacity: item.disabled ? 0.5 : 1,
      flexShrink: 0,
      gap: item.gap != null ? `${item.gap}px` : "8px",
      height: `${itemHeight}px`,
      paddingLeft: `${itemPaddingX + indent}px`,
      paddingRight: `${itemPaddingX}px`,
      backgroundColor: itemBgEnabled && isActive ? itemActiveBg : "transparent",
      borderRadius: `${itemRadius}px`,
      borderLeft:
        indicatorEnabled && !itemBgEnabled
          ? `${isActive ? indicatorWidth : 0}px solid ${isActive ? finalIndicatorColor : "transparent"}`
          : "none",
      ...(item.hoverBg ? { "&:hover": { backgroundColor: item.hoverBg } } : {}),
    };

    const handleClick = (e: React.MouseEvent) => {
      if (item.disabled) return;
      // 有链接的项：优先执行导航（编辑模式和预览模式都联动）
      if (item.linkType && item.linkType !== "none" && item.href) {
        e.stopPropagation();
        if (item.linkType === "page") {
          switchView(item.href);
        } else if (item.linkType === "pane") {
          switchPane(item.href);
        } else if (item.linkType === "modal") {
          openModal(item.href);
        } else if (item.linkType === "drawer") {
          openDrawer(item.href);
        } else if (item.linkType === "url") {
          window.open(item.href, item.newTab !== false ? "_blank" : "_self");
        } else if (item.linkType === "anchor") {
          const el = document.getElementById(item.href);
          if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        return;
      }
      // 无链接但有子项：切换展开
      if (hasChildren) {
        if (mode !== "preview") {
          toggleExpand(key);
        } else {
          e.stopPropagation();
          toggleExpand(key);
        }
      }
    };

    return (
      <Box key={key}>
        <Box sx={itemSx} onClick={handleClick} title={item.description || undefined}>
          <Box sx={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0, flex: 1, overflow: "hidden" }}>
            {item.icon && (
              <Box component="span" sx={{ display: "inline-flex", alignItems: "center", color: item.iconColor }}>
                {resolveIcon(item.icon, undefined, itemIconSize)}
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
            {item.badge && (
              <Box
                component="span"
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: "18px",
                  height: "16px",
                  px: "4px",
                  borderRadius: "99px",
                  fontSize: "10px",
                  fontWeight: 600,
                  lineHeight: 1,
                  bgcolor: item.badgeBg ?? "error.main",
                  color: item.badgeColor ?? "#fff",
                  flexShrink: 0,
                }}
              >
                {item.badge}
              </Box>
            )}
          </Box>
          {item.shortcut && (
            <Typography
              component="span"
              sx={{
                fontSize: "10px",
                color: "currentColor",
                opacity: 0.5,
                flexShrink: 0,
                px: "4px",
                border: "1px solid",
                borderColor: "divider",
                borderRadius: "3px",
                lineHeight: "14px",
                whiteSpace: "nowrap",
              }}
            >
              {item.shortcut}
            </Typography>
          )}
          {hasChildren && (
            <Box
              component="span"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                toggleExpand(key);
              }}
              sx={{
                display: "inline-flex",
                alignItems: "center",
                flexShrink: 0,
                cursor: "pointer",
                opacity: 0.7,
                transition: "transform 0.2s",
                transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
              }}
            >
              <svg
                width={Math.max(14, menuFontSize)}
                height={Math.max(14, menuFontSize)}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="9 6 15 12 9 18" />
              </svg>
            </Box>
          )}
        </Box>

        {/* 子菜单：收展按钮控制 */}
        {hasChildren && item.children && isExpanded && (
          <Box sx={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {item.children.map((child, i) =>
              renderItem(child, `${key}-${i}`, depth + 1, `${key}-${i}` === activeKey)
            )}
          </Box>
        )}

        {/* 分割线 */}
        {dividerEnabled && (
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
        flexDirection: "column",
        justifyContent: verticalAlign,
        alignItems: "stretch",
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
        overflowY: overflow,
        overflowX: "hidden",
        gap: dividerEnabled ? 0 : `${menuGap}px`,
      }}
    >
      {items.map((item, i) => renderItem(item, String(i), 0, activeKey === String(i) || activeKey.startsWith(`${i}-`)))}
    </Box>
  );
}
