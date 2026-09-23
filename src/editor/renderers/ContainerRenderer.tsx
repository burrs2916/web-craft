import { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../types/editor";

/** 容器设计基准尺寸（与注册 defaultSize 一致），factor=1 时显示与原来完全一致 */
const BASE_W = 400;
const BASE_H = 300;

/** 将十六进制或 rgb 颜色转换为带透明度的 rgba */
function withAlpha(color: string, alpha: number): string {
  // 已经是 rgba 格式，替换 alpha 值
  if (color.startsWith("rgba(")) {
    return color.replace(/rgba\(([^)]+),\s*[\d.]+\)/, `rgba($1, ${alpha})`);
  }
  // rgb 格式，加 alpha
  if (color.startsWith("rgb(")) {
    return color.replace(/rgb\(([^)]+)\)/, `rgba($1, ${alpha})`);
  }
  // 十六进制 #rgb 或 #rrggbb，转 rgba
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
  // 其他格式直接返回
  return color;
}

export function ContainerRenderer({ config, width, height }: ComponentRendererProps) {
  const bgEnabled = (config.backgroundEnabled as boolean) ?? true;
  const bgColor = (config.backgroundColor as string) || "rgba(255,255,255,0.05)";
  const bgOpacity = (config.backgroundOpacity as number) ?? 100;

  const borderEnabled = (config.borderEnabled as boolean) ?? false;
  const borderColor = (config.borderColor as string) || "#3a3a5c";
  const borderWidth = (config.borderWidth as number) ?? 1;
  const borderStyle = (config.borderStyle as string) || "solid";

  const borderRadius = (config.borderRadius as number) ?? 8;

  const paddingX = (config.paddingX as number) ?? 16;
  const paddingY = (config.paddingY as number) ?? 16;

  const shadowEnabled = (config.shadowEnabled as boolean) ?? false;
  const shadowOffsetX = (config.shadowOffsetX as number) ?? 0;
  const shadowOffsetY = (config.shadowOffsetY as number) ?? 4;
  const shadowBlur = (config.shadowBlur as number) ?? 12;
  const shadowSpread = (config.shadowSpread as number) ?? 0;
  const shadowColor = (config.shadowColor as string) || "rgba(0,0,0,0.3)";

  const overflow = (config.overflow as string) || "hidden";

  const showLabel = (config.showLabel as boolean) ?? false;
  const labelText = (config.labelText as string) || "容器";

  // 随框等比缩放：以基准 400×300 为 100%，拖框（拖拽过程 store props 滞后，用 ResizeObserver 取真实尺寸）
  const scaleFit = (config.scaleFit as boolean) ?? true;
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

  const fit =
    scaleFit && boxSize.w > 0 && boxSize.h > 0
      ? Math.min(Math.max(Math.min(boxSize.w / BASE_W, boxSize.h / BASE_H), 0.4), 4)
      : 1;
  const s = (v: number) => v * fit;

  // 背景色：用 rgba 控制透明度，不影响子元素
  const finalBg = bgEnabled
    ? withAlpha(bgColor, bgOpacity / 100)
    : "transparent";

  const finalShadow = shadowEnabled
    ? `${s(shadowOffsetX)}px ${s(shadowOffsetY)}px ${s(shadowBlur)}px ${s(shadowSpread)}px ${shadowColor}`
    : "none";

  return (
    <Box
      ref={rootRef}
      sx={{
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        padding: `${s(paddingY)}px ${s(paddingX)}px`,
        backgroundColor: finalBg,
        border: borderEnabled
          ? `${s(borderWidth)}px ${borderStyle} ${borderColor}`
          : "none",
        borderRadius: `${s(borderRadius)}px`,
        boxShadow: finalShadow,
        overflow,
        position: "relative",
      }}
    >
      {showLabel && (
        <Box
          sx={{
            position: "absolute",
            top: 4,
            left: 8,
            fontSize: 11,
            color: "rgba(255,255,255,0.35)",
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          {labelText}
        </Box>
      )}
    </Box>
  );
}
