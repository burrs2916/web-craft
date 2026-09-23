import { useEffect, useRef } from "react";
import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../types/editor";
import { useBindVisibility } from "../hooks/useBindVisibility";

interface SkeletonRow {
  type: "text" | "rect" | "circle";
  width: string;
  height: number;
  count: number;
}

const DEFAULT_ROWS: SkeletonRow[] = [
  { type: "text", width: "100%", height: 16, count: 1 },
  { type: "text", width: "100%", height: 16, count: 1 },
  { type: "text", width: "60%", height: 16, count: 1 },
];

/**
 * 场景预设：一键填充骨架行与布局（仅改内容，不动用户已定的颜色/动画）。
 * rows 以 JSON 字符串写入 config.rows，与「骨架行数据」文本框格式一致。
 */
export const SKELETON_PRESETS: Record<string, { rows: SkeletonRow[]; layout?: string; gap?: number; avatarSize?: number }> = {
  list: {
    rows: [
      { type: "text", width: "100%", height: 14, count: 3 },
      { type: "text", width: "62%", height: 14, count: 1 },
    ],
  },
  article: {
    layout: "simple", gap: 12,
    rows: [
      { type: "rect", width: "100%", height: 22, count: 1 },
      { type: "rect", width: "88%", height: 16, count: 1 },
      { type: "rect", width: "100%", height: 16, count: 1 },
      { type: "rect", width: "56%", height: 16, count: 1 },
    ],
  },
  "profile-card": {
    layout: "card", gap: 12, avatarSize: 44,
    rows: [
      { type: "rect", width: "100%", height: 14, count: 1 },
      { type: "rect", width: "100%", height: 14, count: 1 },
      { type: "rect", width: "54%", height: 14, count: 1 },
    ],
  },
  table: {
    layout: "simple", gap: 12,
    rows: [
      { type: "rect", width: "100%", height: 16, count: 3 },
      { type: "rect", width: "100%", height: 16, count: 3 },
      { type: "rect", width: "68%", height: 16, count: 1 },
    ],
  },
  search: {
    layout: "simple", gap: 14,
    rows: [
      { type: "rect", width: "100%", height: 34, count: 1 },
      { type: "text", width: "100%", height: 14, count: 2 },
      { type: "text", width: "58%", height: 14, count: 1 },
    ],
  },
};

function parseRows(input: unknown): SkeletonRow[] {
  const normalize = (item: Record<string, unknown>): SkeletonRow => ({
    type: (String(item?.type ?? "text") as SkeletonRow["type"]),
    width: String(item?.width ?? "100%"),
    height: Number(item?.height ?? 16),
    count: Number(item?.count ?? 1),
  });

  if (Array.isArray(input) && input.length > 0) {
    return input.map(normalize);
  }
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          if (parsed.length > 0) return parsed.map(normalize);
          return [{ type: "text", width: "100%", height: 16, count: 1 }];
        }
      } catch {
        // fall through to defaults
      }
    }
  }
  return [...DEFAULT_ROWS];
}

export function SkeletonRenderer({ config, mode, onConfigChange }: ComponentRendererProps) {
  const isEdit = (mode ?? "edit") === "edit";

  // ─── 场景预设：切换时自动写入 rows/layout，套用后复位为 custom ───
  const appliedPresetRef = useRef<string>("custom");
  const preset = (config.preset as string) || "custom";
  useEffect(() => {
    if (preset === "custom" || preset === appliedPresetRef.current) {
      appliedPresetRef.current = "custom";
      return;
    }
    const defs = SKELETON_PRESETS[preset];
    if (defs) {
      const set = (key: string, value: unknown) => onConfigChange?.(key, value);
      set("rows", defs.rows);
      if (defs.layout && (config.layout as string | undefined) !== defs.layout) set("layout", defs.layout);
      if (defs.gap != null && (config.gap as number | undefined) !== defs.gap) set("gap", defs.gap);
      if (defs.avatarSize != null) set("avatarSize", defs.avatarSize);
      set("preset", "custom");
    }
    appliedPresetRef.current = preset;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.preset]);

  const rows = parseRows(config.rows);

  const baseColor = (config.baseColor as string) || "rgba(255,255,255,0.08)";
  const highlightColor = (config.highlightColor as string) || "rgba(255,255,255,0.15)";
  const animation = (config.animation as string) ?? "wave";
  const animationDuration = (config.animationDuration as number) ?? 1500;
  const gap = (config.gap as number) ?? 10;
  const paddingX = (config.paddingX as number) ?? 16;
  const paddingY = (config.paddingY as number) ?? 16;
  const borderRadius = (config.borderRadius as number) ?? 4;
  const bgColor = (config.bgColor as string) || "transparent";
  const avatarSize = (config.avatarSize as number) ?? 40;
  const avatarGap = (config.avatarGap as number) ?? 12;
  const layout = (config.layout as string) ?? "simple";

  const isCardLayout = layout === "card";

  // ─── 数据感知自动隐藏（共享 useBindVisibility：加载中显示、接口返回后隐藏） ───
  const visible = useBindVisibility(config, isEdit, "loaded");
  if (!visible) return null;

  const keyframes = animation === "wave"
    ? `@keyframes skel-wave { 0%{transform:translateX(-100%)} 100%{transform:translateX(100%)} }`
    : `@keyframes skel-pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`;
  const dur = `${animationDuration}ms`;
  const waveAnim = `skel-wave ${dur} ease-in-out infinite`;
  const pulseAnim = `skel-pulse ${dur} ease-in-out infinite`;
  // 波浪：元素需 relative+overflow hidden，叠加扫光；脉冲：整体呼吸
  const baseShimStyle = (animated: boolean) => ({
    ...(animated && animation === "pulse" ? { animation: pulseAnim } : {}),
    ...(animated && animation === "wave" ? { position: "relative" as const, overflow: "hidden" as const } : {}),
  });
  const shimmerEl = (animated: boolean) =>
    animation === "wave" && animated ? (
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(90deg,transparent,${highlightColor},transparent)`,
          animation: waveAnim,
        }}
      />
    ) : null;

  return (
    <Box
      role="progressbar"
      aria-busy="true"
      aria-label="内容加载中"
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        gap: `${gap}px`,
        padding: `${paddingY}px ${paddingX}px`,
        backgroundColor: bgColor,
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      <style>{keyframes}</style>

      {/* 卡片布局：头像 + 标题/副标题 + 正文行 */}
      {isCardLayout && (
        <Box sx={{ display: "flex", gap: `${avatarGap}px`, alignItems: "flex-start", flexShrink: 0 }}>
          <Box
            sx={{
              width: `${avatarSize}px`,
              height: `${avatarSize}px`,
              borderRadius: "50%",
              backgroundColor: baseColor,
              flexShrink: 0,
              ...baseShimStyle(true),
            }}
          >
            {shimmerEl(true)}
          </Box>
          <Box sx={{ flex: 1, display: "flex", flexDirection: "column", gap: "8px", paddingTop: "4px" }}>
            <Box sx={{ width: "50%", height: 14, borderRadius: `${borderRadius}px`, backgroundColor: baseColor, ...baseShimStyle(true) }}>{shimmerEl(true)}</Box>
            <Box sx={{ width: "80%", height: 12, borderRadius: `${borderRadius}px`, backgroundColor: baseColor, ...baseShimStyle(true) }}>{shimmerEl(true)}</Box>
          </Box>
        </Box>
      )}

      {rows.map((row, ri) =>
        Array.from({ length: row.count }).map((_, ci) => {
          const isCircle = row.type === "circle";
          const shapeRadius = isCircle ? "50%" : `${borderRadius}px`;
          const shapeWidth = isCircle ? `${row.height}px` : row.width;
          const shapeHeight = `${row.height}px`;
          return (
            <Box
              key={`${ri}-${ci}`}
              aria-hidden
              sx={{
                width: shapeWidth,
                height: shapeHeight,
                borderRadius: shapeRadius,
                backgroundColor: baseColor,
                flexShrink: 0,
                ...baseShimStyle(true),
              }}
            >
              {shimmerEl(true)}
            </Box>
          );
        }),
      )}
    </Box>
  );
}