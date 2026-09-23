import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { ComponentRendererProps } from "../../types/editor";
import { resolveIcon } from "../plugins";

/**
 * 将颜色按透明度百分比转换为 rgba 字符串。
 * 只作用于背景色，不影响子元素（区别于 CSS opacity）。
 * 与 codegen 层 applyOpacity 逻辑完全一致。
 */
function applyOpacity(color: string, opacity: number): string {
  const alpha = Math.max(0, Math.min(1, opacity / 100));

  if (color.startsWith("rgba(")) {
    return color.replace(/rgba\(\s*([^,]+,\s*[^,]+,\s*[^,]+)\s*,\s*[\d.]+\s*\)/, `rgba($1, ${alpha})`);
  }
  if (color.startsWith("rgb(")) {
    return color.replace(/rgb\(\s*([^)]+)\s*\)/, `rgba($1, ${alpha})`);
  }
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

const vAlignMap: Record<string, string> = {
  top: "flex-start",
  center: "center",
  bottom: "flex-end",
};

export function CardRenderer({ config }: ComponentRendererProps) {
  const title = (config.title as string) || "";
  const subtitle = (config.subtitle as string) || "";
  const content = (config.content as string) || "";
  const imageSource = (config.imageSource as string) || "";
  const imagePosition = (config.imagePosition as string) || "top";
  const imageHeight = (config.imageHeight as number) ?? 120;
  const imageRadius = (config.imageRadius as number) ?? 0;
  const bgColor = (config.backgroundColor as string) || "rgba(40,40,60,0.8)";
  const bgOpacity = (config.backgroundOpacity as number) ?? 100;
  const titleColor = (config.titleColor as string) || "#ffffff";
  const titleFontSize = (config.titleFontSize as number) ?? 16;
  const subtitleColor = (config.subtitleColor as string) || "rgba(255,255,255,0.55)";
  const subtitleFontSize = (config.subtitleFontSize as number) ?? 12;
  const contentColor = (config.contentColor as string) || "rgba(255,255,255,0.75)";
  const contentFontSize = (config.contentFontSize as number) ?? 13;
  const padding = (config.padding as number) ?? 16;
  const borderRadius = (config.borderRadius as number) ?? 12;
  const borderEnabled = (config.borderEnabled as boolean) ?? false;
  const borderStyle = (config.borderStyle as string) || "solid";
  const borderColor = (config.borderColor as string) || "rgba(255,255,255,0.12)";
  const borderWidth = (config.borderWidth as number) ?? 1;
  const shadowEnabled = (config.shadowEnabled as boolean) ?? true;
  const shadowOffsetX = (config.shadowOffsetX as number) ?? 0;
  const shadowOffsetY = (config.shadowOffsetY as number) ?? 4;
  const shadowBlur = (config.shadowBlur as number) ?? 16;
  const shadowSpread = (config.shadowSpread as number) ?? 0;
  const shadowColor = (config.shadowColor as string) || "rgba(0,0,0,0.4)";
  const textAlign = (config.textAlign as string) || "left";

  // —— 内容区新增配置 ——
  const titleIcon = (config.titleIcon as string) || "";
  const titleFontWeight = (config.titleFontWeight as string) || "bold";
  const gap = (config.gap as number) ?? 6;
  const contentVerticalAlign = (config.contentVerticalAlign as string) || "top";
  const titleLineClamp = (config.titleLineClamp as number) ?? 0;
  const contentOverflow = (config.contentOverflow as string) || "hidden";
  const contentBgEnabled = (config.contentBgEnabled as boolean) ?? false;
  const contentBgColor = (config.contentBgColor as string) || "rgba(255,255,255,0.06)";
  const dividerEnabled = (config.dividerEnabled as boolean) ?? false;
  const dividerColor = (config.dividerColor as string) || "rgba(255,255,255,0.12)";
  const dividerStyle = (config.dividerStyle as string) || "solid";

  // 透明度只作用于背景色，不影响内容和子元素
  const finalBgColor = applyOpacity(bgColor, bgOpacity);

  const hasImage = !!imageSource;
  const hasTextContent = title || subtitle || content;
  const isHorizontal = imagePosition === "left" || imagePosition === "right";

  // 图片元素：水平方向时用固定宽度+满高，垂直方向时用满宽+固定高度
  const imageEl = hasImage ? (
    <Box
      component="img"
      src={imageSource}
      sx={{
        width: isHorizontal ? `${imageHeight}px` : "100%",
        height: isHorizontal ? "100%" : `${imageHeight}px`,
        objectFit: "cover",
        display: "block",
        flexShrink: 0,
        borderRadius: `${imageRadius}px`,
      }}
    />
  ) : null;

  // 标题行截断样式
  const titleClampSx =
    titleLineClamp > 0
      ? {
          display: "-webkit-box",
          WebkitBoxOrient: "vertical" as const,
          WebkitLineClamp: titleLineClamp,
          overflow: "hidden",
        }
      : {};

  // 正文溢出样式
  const contentOverflowSx: Record<string, unknown> = {};
  if (contentOverflow === "ellipsis") {
    contentOverflowSx.display = "-webkit-box";
    contentOverflowSx.WebkitBoxOrient = "vertical";
    contentOverflowSx.WebkitLineClamp = 3;
    contentOverflowSx.overflow = "hidden";
  } else if (contentOverflow === "scroll") {
    contentOverflowSx.overflowY = "auto";
    contentOverflowSx.flex = "1 1 0";
    contentOverflowSx.minHeight = 0;
  } else {
    contentOverflowSx.overflow = "hidden";
  }

  const textEl = hasTextContent ? (
    <Box
      sx={{
        padding: `${padding}px`,
        textAlign,
        flex: "1 1 auto",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        gap: `${gap}px`,
        justifyContent: vAlignMap[contentVerticalAlign] || "flex-start",
        backgroundColor: contentBgEnabled ? contentBgColor : "transparent",
      }}
    >
      {/* 标题行（可选前置图标） */}
      {title && (
        <Box sx={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {titleIcon && (
            <Box sx={{ display: "inline-flex", flexShrink: 0, color: titleColor }}>
              {resolveIcon(titleIcon, "widgets", titleFontSize)}
            </Box>
          )}
          <Typography
            sx={{
              color: titleColor,
              fontSize: `${titleFontSize}px`,
              fontWeight: titleFontWeight,
              lineHeight: 1.3,
              flex: "1 1 auto",
              ...titleClampSx,
            }}
          >
            {title}
          </Typography>
        </Box>
      )}
      {subtitle && (
        <Typography
          sx={{
            color: subtitleColor,
            fontSize: `${subtitleFontSize}px`,
            lineHeight: 1.3,
          }}
        >
          {subtitle}
        </Typography>
      )}
      {/* 分隔线（标题/副标题 与 正文 之间） */}
      {dividerEnabled && (title || subtitle) && content && (
        <Box
          sx={{
            width: "100%",
            borderTop: `1px ${dividerStyle} ${dividerColor}`,
          }}
        />
      )}
      {content && (
        <Typography
          sx={{
            color: contentColor,
            fontSize: `${contentFontSize}px`,
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
            ...contentOverflowSx,
          }}
        >
          {content}
        </Typography>
      )}
    </Box>
  ) : null;

  // 阴影：完整 box-shadow 公式，与 codegen 一致
  const boxShadow = shadowEnabled
    ? `${shadowOffsetX}px ${shadowOffsetY}px ${shadowBlur}px ${shadowSpread}px ${shadowColor}`
    : "none";

  // 边框：支持 borderStyle
  const border = borderEnabled
    ? `${borderWidth}px ${borderStyle} ${borderColor}`
    : "none";

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        backgroundColor: finalBgColor,
        border,
        borderRadius: `${borderRadius}px`,
        boxShadow,
        overflow: "hidden",
        display: "flex",
        flexDirection: isHorizontal
          ? (imagePosition === "left" ? "row" : "row-reverse")
          : "column",
      }}
    >
      {imagePosition === "top" && imageEl}
      {imagePosition === "left" && imageEl}
      {imagePosition === "right" && imageEl}
      {textEl}
      {imagePosition === "bottom" && imageEl}
    </Box>
  );
}
