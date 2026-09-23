import { useCallback, useEffect, useRef } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import type { ComponentRendererProps } from "../../types/editor";
import { resolveIcon } from "../plugins/IconResolver";
import { useBindVisibility } from "../hooks/useBindVisibility";

/**
 * 场景预设：一键填充图标 + 文案（仅改内容，不动用户已定的颜色/布局）。
 * 图标名需存在于 IconResolver 映射中，避免兜底错位。
 */
export const EMPTY_STATE_PRESETS: Record<string, { icon: string; title: string; description: string; buttonText?: string }> = {
  "no-data": { icon: "material:inbox", title: "暂无数据", description: "这里空空如也，暂无内容" },
  "search-empty": { icon: "material:search", title: "未找到结果", description: "换个关键词再试试，或许会有新发现" },
  "load-error": { icon: "material:error", title: "加载失败", description: "数据加载出现问题，请稍后重试", buttonText: "重试" },
  "no-network": { icon: "material:warning", title: "网络异常", description: "网络似乎开小差了，请检查连接后重试", buttonText: "重试" },
  "no-notifications": { icon: "material:notifications_active", title: "暂无通知", description: "新的消息与提醒会显示在这里" },
  "no-favorites": { icon: "material:star", title: "收藏为空", description: "点击 ⋆ 将内容加入收藏" },
  "no-permission": { icon: "material:lock", title: "无访问权限", description: "你没有查看此内容的权限" },
};

/** 集合元素图标动画（入场 / 循环） */
function iconAnimStyle(entrance: string, loop: string, durationMs: number): Record<string, unknown> {
  const kf: Record<string, string> = {};
  if (entrance === "fadeIn") {
    kf["@keyframes esFadeIn"] = "from{opacity:0}to{opacity:1}";
  } else if (entrance === "zoomIn") {
    kf["@keyframes esZoomIn"] = "from{opacity:0;transform:scale(.6)}to{opacity:1;transform:scale(1)}";
  } else if (entrance === "drop") {
    kf["@keyframes esDrop"] = "from{opacity:0;transform:translateY(-18px)}to{opacity:1;transform:translateY(0)}";
  }
  if (loop === "float") {
    kf["@keyframes esFloat"] = "0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}";
  } else if (loop === "bounce") {
    kf["@keyframes esBounce"] = "0%,100%{transform:translateY(0)}30%{transform:translateY(-4px)}";
  } else if (loop === "pulse") {
    kf["@keyframes esPulse"] = "0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.06);opacity:.9}";
  }
  const anims: string[] = [];
  if (kf["@keyframes esFadeIn"]) anims.push(`esFadeIn ${durationMs}ms ease both`);
  if (kf["@keyframes esZoomIn"]) anims.push(`esZoomIn ${durationMs}ms cubic-bezier(.22,1,.36,1) both`);
  if (kf["@keyframes esDrop"]) anims.push(`esDrop ${durationMs}ms cubic-bezier(.22,1,.36,1) both`);
  if (kf["@keyframes esFloat"]) anims.push("esFloat 3.2s ease-in-out infinite");
  if (kf["@keyframes esBounce"]) anims.push("esBounce 1.6s ease-in-out infinite");
  if (kf["@keyframes esPulse"]) anims.push("esPulse 2.2s ease-in-out infinite");
  return { ...kf, animation: anims.join(", ") || undefined };
}

export function EmptyStateRenderer({ config, mode, onConfigChange }: ComponentRendererProps) {
  const isEdit = (mode ?? "edit") === "edit";

  // ─── 场景预设：切换时自动填充内容，套用后复位为 custom ───
  const appliedPresetRef = useRef<string>("custom");
  const preset = (config.preset as string) || "custom";
  useEffect(() => {
    if (preset === "custom" || preset === appliedPresetRef.current) {
      appliedPresetRef.current = "custom";
      return;
    }
    const defs = EMPTY_STATE_PRESETS[preset];
    if (defs) {
      const set = (key: string, value: unknown) => onConfigChange?.(key, value);
      if (defs.icon && (config.icon as string) !== defs.icon) set("icon", defs.icon);
      if (defs.title && (config.title as string) !== defs.title) set("title", defs.title);
      if (defs.description && (config.description as string) !== defs.description) set("description", defs.description);
      if (defs.buttonText) {
        set("showButton", true);
        set("buttonText", defs.buttonText);
      }
      set("preset", "custom");
    }
    appliedPresetRef.current = preset;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.preset]);

  // ─── 内容 ───
  const icon = (config.icon as string) || "material:inbox";
  const title = (config.title as string) || "暂无数据";
  const description = (config.description as string) || "";

  // ─── 按钮 ───
  const showButton = (config.showButton as boolean) ?? false;
  const buttonAction = (config.buttonAction as string) || "link";
  const buttonText = (config.buttonText as string) || "刷新";
  const buttonHref = (config.buttonHref as string) || "";
  const buttonTarget = (config.buttonTarget as string) || "_self";

  // ─── 数据感知显隐（共享 useBindVisibility：取数规则与所有数据组件一致） ───
  const visible = useBindVisibility(config, isEdit, "empty");
  if (!visible) return null;

  // ─── 图标样式 ——
  const iconSize = (config.iconSize as number) ?? 64;
  const iconColor = (config.iconColor as string) || "rgba(255,255,255,0.28)";
  const glowEnabled = (config.iconGradientEnabled as boolean) ?? false;
  const glowFrom = (config.iconGradientFrom as string) || "rgba(79,195,247,0.45)";
  const glowTo = (config.iconGradientTo as string) || "rgba(79,195,247,0.08)";
  const iconEntrance = (config.iconEntrance as string) || "none";
  const iconAnimation = (config.iconAnimation as string) || "none";
  const animDuration = Math.max(300, (config.iconAnimDuration as number) ?? 640);

  // ─── 文字样式 ——
  const titleColor = (config.titleColor as string) || "rgba(255,255,255,0.62)";
  const titleFontSize = (config.titleFontSize as number) ?? 16;
  const descColor = (config.descColor as string) || "rgba(255,255,255,0.42)";
  const descFontSize = (config.descFontSize as number) ?? 13;
  const descMaxWidth = (config.descMaxWidth as number) ?? 84;

  // ─── 布局 ——
  const bgColor = (config.bgColor as string) || "transparent";
  const padding = (config.padding as number) ?? 24;
  const gap = (config.gap as number) ?? 12;
  const buttonColor = (config.buttonColor as string) || "#FF9800";
  const buttonBgColor = (config.buttonBgColor as string) || "rgba(255,152,0,0.16)";
  const buttonFontSize = (config.buttonFontSize as number) ?? 13;

  const resolvedIcon = resolveIcon(icon, "inbox", iconSize);
  const animStyle = iconAnimStyle(iconEntrance, iconAnimation, animDuration);

  const handleButton = useCallback(() => {
    if (buttonAction === "reload" && !isEdit) window.location.reload();
    // 其余情况由 <a> 处理跳转
  }, [buttonAction, isEdit]);

  return (
    <Box
      role="status"
      aria-live="polite"
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: bgColor,
        gap: `${gap}px`,
        padding: `${padding}px`,
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      {/* Icon + 光晕 */}
      <Box
        sx={{
          position: "relative",
          width: `${Math.max(iconSize, 88)}px`,
          height: `${Math.max(iconSize, 88)}px`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          ...animStyle,
        }}
      >
        {glowEnabled && (
          <Box
            aria-hidden
            sx={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${glowFrom} 0%, ${glowTo} 55%, transparent 74%)`,
              filter: "blur(6px)",
              pointerEvents: "none",
            }}
          />
        )}
        <Box
          sx={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: iconColor,
            "& svg": { fontSize: `${iconSize}px` },
          }}
        >
          {resolvedIcon}
        </Box>
      </Box>

      {/* Title */}
      {title && (
        <Typography
          sx={{
            color: titleColor,
            fontSize: `${titleFontSize}px`,
            fontWeight: 500,
            textAlign: "center",
            lineHeight: 1.4,
          }}
        >
          {title}
        </Typography>
      )}

      {/* Description */}
      {description && (
        <Typography
          sx={{
            color: descColor,
            fontSize: `${descFontSize}px`,
            textAlign: "center",
            lineHeight: 1.6,
            maxWidth: `${descMaxWidth}%`,
            whiteSpace: "pre-wrap",
          }}
        >
          {description}
        </Typography>
      )}

      {/* Action button */}
      {showButton && buttonAction === "reload" && (
        <Button
          onClick={handleButton}
          sx={{
            color: buttonColor,
            backgroundColor: buttonBgColor,
            fontSize: `${buttonFontSize}px`,
            textTransform: "none",
            padding: "6px 22px",
            borderRadius: "8px",
            border: "none",
            boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
            cursor: isEdit ? "default" : "pointer",
            "&:hover": { backgroundColor: buttonBgColor, filter: "brightness(1.12)" },
          }}
        >
          {buttonText}
        </Button>
      )}
      {showButton && buttonAction === "link" && (
        <Button
          href={buttonHref || undefined}
          {...(buttonHref ? { target: buttonTarget as "_self" | "_blank", rel: "noopener noreferrer" } : {})}
          sx={{
            color: buttonColor,
            backgroundColor: buttonBgColor,
            fontSize: `${buttonFontSize}px`,
            textTransform: "none",
            padding: "6px 22px",
            borderRadius: "8px",
            border: "none",
            boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
            "&:hover": { backgroundColor: buttonBgColor, filter: "brightness(1.12)" },
          }}
        >
          {buttonText}
        </Button>
      )}
    </Box>
  );
}