import { useEffect, useId, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { ComponentRendererProps } from "../../types/editor";
import { useBindVisibility } from "../hooks/useBindVisibility";

const SPIN_KEYFRAMES = `@keyframes spin-rotate{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}@keyframes spin-bounce{0%,80%,100%{transform:scale(0);opacity:0.5}40%{transform:scale(1);opacity:1}}@keyframes spin-stretch{0%,40%,100%{transform:scaleY(0.4)}20%{transform:scaleY(1)}}`;

/** 设计基准尺寸（与注册表 defaultSize 一致）：此尺寸下 factor=1，动画为该配置的原值 */
const REF_W = 100;
const REF_H = 60;

/**
 * Spin 加载中组件
 * 支持：circle/dots/bars 三种动画、尺寸、颜色、提示文字
 * 内部动画随组件框实时等比缩放（factor 基于设计基准 100×60）
 */
export function SpinRenderer({ config, width, height, mode }: ComponentRendererProps) {
  const isEdit = (mode ?? "edit") === "edit";
  const variant = (config.variant as string) ?? "circle"; // circle / dots / bars
  const size = (config.size as string) ?? "medium";
  const color = (config.color as string) || "#2196F3";
  const speed = (config.speed as number) ?? 1; // 秒
  const tip = (config.tip as string) ?? "";
  const tipPosition = (config.tipPosition as string) ?? "bottom"; // bottom / right
  const tipFontSize = (config.tipFontSize as number) ?? 13;
  const tipColor = (config.tipColor as string) || "rgba(255,255,255,0.5)";
  const customSize = (config.customSize as number) ?? 0;
  const strokeWidth = (config.strokeWidth as number) ?? 3;
  const gradientEnabled = (config.gradientEnabled as boolean) ?? false;
  const gradientFrom = (config.gradientFrom as string) || "#0D9488";
  const gradientTo = (config.gradientTo as string) || "#0EA5E9";
  const gradientId = useId();

  // ─── 数据感知自动隐藏（共享 useBindVisibility：加载中显示、接口返回后隐藏） ───
  const visible = useBindVisibility(config, isEdit, "loaded");
  if (!visible) return null;

  // 实时读取容器尺寸：让动画随组件框等比缩放（拖拽过程 store props 滞后，用 ResizeObserver 追踪真实尺寸）
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

  // 等比缩放因子：取宽高较紧者，限制在 0.4~6 之间
  const factor =
    boxSize.w > 0 && boxSize.h > 0
      ? Math.min(Math.max(Math.min(boxSize.w / REF_W, boxSize.h / REF_H), 0.4), 6)
      : 1;
  const scaled = (v: number) => v * factor;

  const sizeMap: Record<string, number> = {
    small: 16,
    medium: 28,
    large: 40,
  };
  const spinSize = scaled(customSize || (sizeMap[size] ?? sizeMap.medium));
  const strokeWidthS = scaled(strokeWidth);
  const tipFontSizeS = scaled(tipFontSize);
  const gapTip = scaled(8);
  const gapDots = scaled(4);
  const gapBars = scaled(3);
  const tipTop = scaled(6);

  const tipEl = tip ? (
    <Typography sx={{ fontSize: `${tipFontSizeS}px`, color: tipColor, mt: tipPosition === "bottom" ? `${tipTop}px` : 0 }}>
      {tip}
    </Typography>
  ) : null;

  // 圆环旋转动画
  if (variant === "circle") {
    const radius = (spinSize - strokeWidthS) / 2;
    const circumference = 2 * Math.PI * radius;

    return (
      <Box ref={rootRef} sx={{ display: "flex", alignItems: "center", gap: tip ? `${gapTip}px` : 0, flexDirection: tipPosition === "right" ? "row" : "column", width: "100%", height: "100%", justifyContent: "center" }}>
        <style>{SPIN_KEYFRAMES}</style>
        <Box
          sx={{
            width: `${spinSize}px`,
            height: `${spinSize}px`,
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width={spinSize} height={spinSize} style={{ animation: `spin-rotate ${speed}s linear infinite` }}>
            {gradientEnabled && (
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor={gradientFrom} />
                  <stop offset="100%" stopColor={gradientTo} />
                </linearGradient>
              </defs>
            )}
            <circle
              cx={spinSize / 2}
              cy={spinSize / 2}
              r={radius}
              fill="none"
              stroke="rgba(255,255,255,0.1)"
              strokeWidth={strokeWidthS}
            />
            <circle
              cx={spinSize / 2}
              cy={spinSize / 2}
              r={radius}
              fill="none"
              stroke={gradientEnabled ? `url(#${gradientId})` : color}
              strokeWidth={strokeWidthS}
              strokeLinecap="round"
              strokeDasharray={`${circumference * 0.25} ${circumference * 0.75}`}
            />
          </svg>
        </Box>
        {tipEl}
      </Box>
    );
  }

  // 三点跳动动画
  if (variant === "dots") {
    const dotSize = spinSize / 3;
    return (
      <Box ref={rootRef} sx={{ display: "flex", alignItems: "center", gap: tip ? `${gapTip}px` : 0, flexDirection: tipPosition === "right" ? "row" : "column", width: "100%", height: "100%", justifyContent: "center" }}>
        <style>{SPIN_KEYFRAMES}</style>
        <Box sx={{ display: "flex", alignItems: "center", gap: `${gapDots}px` }}>
          {[0, 1, 2].map((i) => (
            <Box
              key={i}
              sx={{
                width: `${dotSize}px`,
                height: `${dotSize}px`,
                borderRadius: "50%",
                backgroundColor: gradientEnabled ? `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})` : color,
                animation: `spin-bounce ${speed}s ease-in-out ${i * 0.16}s infinite`,
              }}
            />
          ))}
        </Box>
        {tipEl}
      </Box>
    );
  }

  // 三条竖线动画
  if (variant === "bars") {
    const barWidth = Math.max(scaled(2), spinSize / 5);
    return (
      <Box ref={rootRef} sx={{ display: "flex", alignItems: "center", gap: tip ? `${gapTip}px` : 0, flexDirection: tipPosition === "right" ? "row" : "column", width: "100%", height: "100%", justifyContent: "center" }}>
        <style>{SPIN_KEYFRAMES}</style>
        <Box sx={{ display: "flex", alignItems: "center", gap: `${gapBars}px`, height: `${spinSize}px` }}>
          {[0, 1, 2].map((i) => (
            <Box
              key={i}
              sx={{
                width: `${barWidth}px`,
                height: "100%",
                borderRadius: `${barWidth / 2}px`,
                backgroundColor: gradientEnabled ? `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})` : color,
                animation: `spin-stretch ${speed}s ease-in-out ${i * 0.16}s infinite`,
              }}
            />
          ))}
        </Box>
        {tipEl}
      </Box>
    );
  }

  return null;
}