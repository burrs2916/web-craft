import { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { ComponentRendererProps } from "../../types/editor";

/** 设计基准尺寸（与注册表 defaultSize 一致）：此尺寸下 factor=1，内容为配置文件的值 */
const REF_W = 80;
const REF_H = 30;

/**
 * Badge 徽标组件
 * 支持：数字/文字/圆点徽标、四角定位、颜色、独立显示
 * 内部内容随组件框实时等比缩放（factor 基于设计基准 80×30）
 */
export function BadgeRenderer({ config, width, height }: ComponentRendererProps) {
  const content = (config.content as string) ?? "5";
  const variant = (config.variant as string) ?? "number"; // number / text / dot
  const position = (config.position as string) ?? "top-right"; // top-right/top-left/bottom-right/bottom-left/standalone
  const color = (config.color as string) || "#F44336";
  const gradientEnabled = (config.gradientEnabled as boolean) ?? false;
  const gradientFrom = (config.gradientFrom as string) || "#0D9488";
  const gradientTo = (config.gradientTo as string) || "#0EA5E9";
  const badgeBg = gradientEnabled ? `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})` : color;
  const textColor = (config.textColor as string) || "#ffffff";
  const fontSize = (config.fontSize as number) ?? 11;
  const dotSize = (config.dotSize as number) ?? 8;
  const borderRadius = (config.borderRadius as number) ?? 10;
  const minWidth = (config.minWidth as number) ?? 16;
  const badgeHeight = (config.height as number) ?? 16;
  const padding = (config.padding as number) ?? 2;
  const showBorder = (config.showBorder as boolean) ?? false;
  const borderColor = (config.borderColor as string) || "#ffffff";
  const borderWidth = (config.borderWidth as number) ?? 2;
  const max = (config.max as number) ?? 99;
  const offsetX = (config.offsetX as number) ?? 0;
  const offsetY = (config.offsetY as number) ?? 0;
  const triggerText = (config.triggerText as string) ?? "消息";
  const triggerColor = (config.triggerColor as string) || "rgba(255,255,255,0.7)";
  const triggerFontSize = (config.triggerFontSize as number) ?? 14;

  // 实时读取容器尺寸：让内部内容随组件框等比缩放（拖拽过程 store props 滞后，用 ResizeObserver 追踪真实尺寸）
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [boxSize, setBoxSize] = useState<{ w: number; h: number }>(() => ({
    w: typeof width === "number" ? width : 0,
    h: typeof height === "number" ? height : 0,
  }));
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const update = () => setBoxSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 等比缩放因子：取宽高较紧者，限制在 0.4~6 之间，避免过小/超大失真
  const factor =
    boxSize.w > 0 && boxSize.h > 0
      ? Math.min(Math.max(Math.min(boxSize.w / REF_W, boxSize.h / REF_H), 0.4), 6)
      : 1;

  const scaled = (v: number) => v * factor;

  // 处理数字溢出
  const displayContent = (() => {
    if (variant === "dot") return "";
    if (variant === "number") {
      const num = parseInt(content, 10);
      if (isNaN(num)) return content;
      return num > max ? `${max}+` : String(num);
    }
    return content;
  })();

  // 独立显示模式
  if (position === "standalone") {
    if (variant === "dot") {
      return (
        <Box ref={rootRef} sx={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%" }}>
          <Box
            sx={{
              width: `${scaled(dotSize)}px`,
              height: `${scaled(dotSize)}px`,
              borderRadius: "50%",
              backgroundColor: badgeBg,
              border: showBorder ? `${scaled(borderWidth)}px solid ${borderColor}` : "none",
              boxSizing: "border-box",
              boxShadow: "0 1px 4px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.18)",
            }}
          />
        </Box>
      );
    }
    return (
      <Box ref={rootRef} sx={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%" }}>
        <Box
          sx={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: `${scaled(minWidth)}px`,
            height: `${scaled(badgeHeight)}px`,
            padding: `0 ${scaled(padding)}px`,
            backgroundColor: badgeBg,
            color: textColor,
            fontSize: `${scaled(fontSize)}px`,
            fontWeight: 600,
            lineHeight: 1.2,
            letterSpacing: 0.3,
            borderRadius: `${scaled(borderRadius)}px`,
            border: showBorder ? `${scaled(borderWidth)}px solid ${borderColor}` : "none",
            boxSizing: "border-box",
            whiteSpace: "nowrap",
            boxShadow: "0 2px 6px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.15)",
          }}
        >
          <Typography component="span" sx={{ fontSize: "inherit", fontWeight: "inherit", lineHeight: "inherit", letterSpacing: "inherit" }}>
            {displayContent}
          </Typography>
        </Box>
      </Box>
    );
  }

  // 圆点变体（跨压在触发文字的右上角）
  if (variant === "dot") {
    return (
      <Box
        ref={rootRef}
        sx={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", overflow: "hidden" }}
      >
        <Box component="span" sx={{ position: "relative", display: "inline-block" }}>
          <Typography sx={{ fontSize: `${scaled(triggerFontSize)}px`, color: triggerColor, userSelect: "none", lineHeight: 1.2, whiteSpace: "nowrap", display: "block" }}>
            {triggerText}
          </Typography>
          <Box
            component="span"
            sx={{
              position: "absolute",
              top: `${scaled(offsetY) - scaled(dotSize) * 0.25}px`,
              left: `calc(100% + ${scaled(offsetX)}px)`,
              width: `${scaled(dotSize)}px`,
              height: `${scaled(dotSize)}px`,
              borderRadius: "50%",
              backgroundColor: badgeBg,
              border: showBorder ? `${scaled(borderWidth)}px solid ${borderColor}` : "none",
              boxSizing: "border-box",
              boxShadow: "0 1px 4px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.18)",
            }}
          />
        </Box>
      </Box>
    );
  }

  // 数字/文字变体（跨压在触发文字的右上角）
  return (
    <Box
      ref={rootRef}
      sx={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", overflow: "hidden" }}
    >
      <Box component="span" sx={{ position: "relative", display: "inline-block" }}>
        <Typography sx={{ fontSize: `${scaled(triggerFontSize)}px`, color: triggerColor, userSelect: "none", lineHeight: 1.2, whiteSpace: "nowrap", display: "block" }}>
          {triggerText}
        </Typography>
        <Box
          component="span"
          sx={{
            position: "absolute",
            top: `${scaled(offsetY) - scaled(badgeHeight) * 0.25}px`,
            left: `calc(100% + ${scaled(offsetX)}px)`,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: `${scaled(minWidth)}px`,
            height: `${scaled(badgeHeight)}px`,
            padding: `0 ${scaled(padding)}px`,
            backgroundColor: badgeBg,
            color: textColor,
            fontSize: `${scaled(fontSize)}px`,
            fontWeight: 600,
            lineHeight: 1.2,
            letterSpacing: 0.3,
            borderRadius: `${scaled(borderRadius)}px`,
            border: showBorder ? `${scaled(borderWidth)}px solid ${borderColor}` : "none",
            boxSizing: "border-box",
            whiteSpace: "nowrap",
            boxShadow: "0 2px 6px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.15)",
          }}
        >
          {displayContent}
        </Box>
      </Box>
    </Box>
  );
}