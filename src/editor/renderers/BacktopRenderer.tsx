import { useState, useEffect, useCallback, useRef } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { ComponentRendererProps } from "../../types/editor";
import { resolveIcon } from "../plugins/IconResolver";
import { backtopScale } from "./backtopShared";

/** 默认向上箭头（icon 留空时使用，双端一致） */
function ArrowIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: size, height: size, color, flexShrink: 0, display: "block" }}>
      <path d="M7.41 15.41 12 10.83l4.59 4.58L18 14l-6-6-6 6z" />
    </svg>
  );
}

export function BacktopRenderer({ config, mode, width, height: propH }: ComponentRendererProps) {
  const shape = (config.shape as string) ?? "circle";
  const size = (config.size as number) ?? 44;
  const icon = (config.icon as string) || "";
  const iconSize = (config.iconSize as number) ?? 24;
  const showText = (config.showText as boolean) ?? false;
  const text = (config.text as string) || "顶部";
  const textSize = (config.textSize as number) ?? 11;
  const bgColor = (config.bgColor as string) || "rgba(255,152,0,0.15)";
  const bgColorHover = (config.bgColorHover as string) || "rgba(255,152,0,0.25)";
  const gradientEnabled = (config.gradientEnabled as boolean) ?? false;
  const gradientFrom = (config.gradientFrom as string) || "rgba(13,148,136,0.85)";
  const gradientTo = (config.gradientTo as string) || "rgba(14,165,233,0.9)";
  const iconColor = (config.iconColor as string) || "#FF9800";
  const iconColorHover = (config.iconColorHover as string) || "#ffffff";
  const textColor = (config.textColor as string) || iconColor;
  const borderEnabled = (config.borderEnabled as boolean) ?? false;
  const borderColor = (config.borderColor as string) || "rgba(255,152,0,0.3)";
  const borderWidth = (config.borderWidth as number) ?? 1;
  const borderRadius = (config.borderRadius as number) ?? 50;
  const boxShadow = (config.boxShadow as boolean) ?? true;
  const hoverScale = (config.hoverScale as boolean) ?? true;
  const progressRing = (config.progressRing as boolean) ?? false;
  const ringColor = (config.ringColor as string) || "#FF9800";
  const ringWidth = (config.ringWidth as number) ?? 3;
  const ringTrackColor = (config.ringTrackColor as string) || "rgba(255,255,255,0.15)";
  const scrollTarget = (config.scrollTarget as string) || "";

  const isPreview = mode === "preview";
  const [hovered, setHovered] = useState(false);
  const [progress, setProgress] = useState(0);

  // —— 实时读取容器真实尺寸 ——
  // 拖拽过程中 store props 滞后，改用 ResizeObserver 追踪外层框实时大小，
  // 让按钮实时「收进框内」，避免拖动时被 overflow 裁切。
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [boxSize, setBoxSize] = useState<{ w?: number; h?: number }>(() => ({
    w: typeof width === "number" ? width : undefined,
    h: typeof propH === "number" ? propH : undefined,
  }));
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const update = () => setBoxSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 滚动进度环：预览模式下监听 window 或指定容器，更新进度
  useEffect(() => {
    if (!isPreview) return;
    const update = () => {
      let top: number;
      let max: number;
      if (scrollTarget) {
        const el = document.querySelector<HTMLElement>(scrollTarget);
        if (!el) return;
        top = el.scrollTop;
        max = Math.max(1, el.scrollHeight - el.clientHeight);
      } else {
        const doc = document.scrollingElement || document.documentElement;
        top = window.scrollY;
        max = Math.max(1, doc.scrollHeight - window.innerHeight);
      }
      setProgress(Math.max(0, Math.min(1, top / max)));
    };
    const target = scrollTarget ? document.querySelector(scrollTarget) : window;
    target?.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();
    return () => {
      target?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [isPreview, scrollTarget]);

  const handleClick = useCallback(() => {
    if (!isPreview) return;
    if (scrollTarget) {
      document.querySelector(scrollTarget)?.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [isPreview, scrollTarget]);

  const borderRadiusVal = shape === "circle"
    ? "50%"
    : shape === "square"
      ? `${Math.min(size * 0.12, 8)}px`
      : `${borderRadius}px`;

  const baseBg = gradientEnabled
    ? `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})`
    : bgColor;
  const displayBg = hovered && !gradientEnabled ? bgColorHover : baseBg;

  const ringR = size / 2 - ringWidth / 2 - 1;
  const ringC = 2 * Math.PI * ringR;

  const height = showText ? size + 20 : size;
  // 等比缩放并以「收进框内」为准（取宽高两个方向较紧者）且跟随容器实时尺寸，避免缩放时被 overflow 裁切
  const scaleFactor = backtopScale(boxSize.w, boxSize.h, size, height);

  return (
    <Box
      ref={boxRef}
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxSizing: "border-box",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <Box
        role="button"
        aria-label="返回顶部"
        tabIndex={isPreview ? 0 : undefined}
        onClick={handleClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        sx={{
          position: "relative",
          width: `${size}px`,
          height: `${height}px`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "2px",
          cursor: isPreview ? "pointer" : "default",
          background: displayBg,
          borderRadius: borderRadiusVal,
          border: borderEnabled ? `${borderWidth}px solid ${borderColor}` : "none",
          boxShadow: boxShadow ? "0 4px 14px rgba(0,0,0,0.28)" : "none",
          transition: "all 0.25s ease",
          boxSizing: "border-box",
          transform: `scale(${scaleFactor * (hovered && hoverScale ? 1.08 : 1)})`,
          transformOrigin: "center",
          filter: hovered && gradientEnabled ? "brightness(1.12)" : "none",
          flexShrink: 0,
        }}
      >
        {progressRing && (
          <svg
            width={size}
            height={size}
            aria-hidden
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              transform: "rotate(-90deg)",
              pointerEvents: "none",
            }}
          >
            <circle cx={size / 2} cy={size / 2} r={ringR} fill="none" stroke={ringTrackColor} strokeWidth={ringWidth} />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={ringR}
              fill="none"
              stroke={ringColor}
              strokeWidth={ringWidth}
              strokeLinecap="round"
              strokeDasharray={ringC}
              strokeDashoffset={ringC * (1 - progress)}
            />
          </svg>
        )}

        <Box
          sx={{
            position: "relative",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            color: hovered ? iconColorHover : iconColor,
          }}
        >
          {icon ? resolveIcon(icon, "vertical_align_top", iconSize) : <ArrowIcon size={iconSize} color={hovered ? iconColorHover : iconColor} />}
        </Box>

        {showText && (
          <Typography sx={{ position: "relative", color: textColor, fontSize: `${textSize}px`, userSelect: "none", lineHeight: 1 }}>
            {text}
          </Typography>
        )}
      </Box>
    </Box>
  );
}