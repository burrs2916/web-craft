import { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { ComponentRendererProps } from "../../types/editor";
import { fitFactor, progressCircleFit } from "../data/scaleFit";
import { useApiDataFetch } from "../hooks/useApiDataFetch";
import { useDataSourceBinding } from "../../hooks/useDataSourceBinding";
import { readAuthEnabled } from "../data/authMode";
import { coerceProgressNumber } from "../data/progressData";

/**
 * Progress 进度条组件
 * 支持：line/circle 两种形状、百分比、渐变色、动画、状态色、
 *       动态数据（static/api 轮询/datasource 绑定，与 metric 指标卡同一套键与语义）
 */
export function ProgressRenderer({ config, mode, width, height, componentId }: ComponentRendererProps) {
  const isPreview = mode === "preview";
  const value = (config.value as number) ?? 60;
  const max = (config.max as number) ?? 100;
  const shape = (config.shape as string) ?? "line";
  const size = (config.size as string) ?? "medium";
  const color = (config.color as string) || "#2196F3";
  const trackColor = (config.trackColor as string) || "rgba(255,255,255,0.08)";
  // 百分比文字色：留空=沿用白色系默认（历史行为不变），浅底站点显式选深色
  const labelColor = (config.labelColor as string) || "";
  const gradientEnabled = (config.gradientEnabled as boolean) ?? false;
  const gradientTo = (config.gradientTo as string) || "#64B5F6";
  const showLabel = (config.showLabel as boolean) ?? true;
  const labelPosition = (config.labelPosition as string) ?? "right";
  const striped = (config.striped as boolean) ?? false;
  const animated = (config.animated as boolean) ?? false;
  const status = (config.status as string) ?? "normal"; // normal/success/warning/error
  const strokeLinecap = (config.strokeLinecap as string) ?? "round"; // round/butt
  const strokeWidth = (config.strokeWidth as number) ?? 6;
  const heightOverride = (config.height as number) ?? 0;

  // ── 动态数据（与 metric 指标卡同一套键与语义）──
  const dataMode = (config.dataMode as string) ?? "static";
  const dataSourceId = (config.dataSourceId as string) ?? "";
  const field = (config.field as string) ?? "";
  // staticData 显式存在时优先（绑定全局静态数据源时由引擎/resolveEffectiveDataConfig 注入，
  // metric 完全同款：hasExplicitStaticData ? staticData : 本组件值）
  const hasExplicitStaticData = config.staticData != null && config.staticData !== "";
  // datasource 模式：订阅数据源缓存（无 provider 时 hook 安全返回空）
  const { componentData } = useDataSourceBinding(
    componentId,
    dataMode === "datasource" && dataSourceId ? [dataSourceId] : undefined,
  );
  const { data: fetchedData } = useApiDataFetch<number | string>({
    dataMode: dataMode === "api" ? "api" : "static",
    staticData: hasExplicitStaticData ? config.staticData : value,
    apiPath: (config.apiPath as string) || "",
    apiUrl: (config.apiUrl as string) || "",
    apiMethod: ((config.apiMethod as string) || "GET") as "GET" | "POST",
    apiBody: config.apiBody,
    apiHeaders: config.apiHeaders,
    apiInterval: (config.apiInterval as number) ?? 0,
    apiDataPath: (config.apiDataPath as string) || "",
    authEnabled: readAuthEnabled(config.authEnabled),
  });

  // 有效值：取数结果经口径收敛（数字/数字串/对象 {value|percent|current}）；
  // 失败/空值/NaN 一律回退静态 value —— 进度条没有 "--" 语义，不能闪 0（与指标卡的差异点）。
  const effectiveValue = (() => {
    const n = coerceProgressNumber(fetchedData);
    if (n !== null) return n;
    if (dataMode === "datasource" && dataSourceId) {
      const bound = componentData[dataSourceId] as Record<string, unknown> | undefined;
      const v = field ? bound?.[field] : bound?.value;
      const dn = coerceProgressNumber(v);
      if (dn !== null) return dn;
    }
    return value;
  })();

  // 状态色覆盖
  const statusColors: Record<string, string> = {
    success: "#4CAF50",
    warning: "#FF9800",
    error: "#F44336",
  };
  const activeColor = status !== "normal" ? (statusColors[status] ?? color) : color;
  const fillBg = gradientEnabled ? `linear-gradient(90deg, ${activeColor}, ${gradientTo})` : activeColor;

  // 动画值（预览模式模拟进度增长）
  const [displayValue, setDisplayValue] = useState(effectiveValue);
  const rafRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (isPreview && animated) {
      let start = effectiveValue;
      let direction = 1;
      const animate = () => {
        start += direction * 0.5;
        if (start >= max) { start = max; direction = -1; }
        if (start <= 0) { start = 0; direction = 1; }
        setDisplayValue(start);
        rafRef.current = requestAnimationFrame(animate);
      };
      rafRef.current = requestAnimationFrame(animate);
      return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    } else {
      setDisplayValue(effectiveValue);
    }
  }, [isPreview, animated, effectiveValue, max]);

  // 实时读取容器尺寸：让圆形进度条随框缩放
  // （拖拽过程 store props 滞后，改用 ResizeObserver 追踪真实尺寸）
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
  }, [shape]);

  const percent = Math.round((displayValue / max) * 100);

  // 尺寸映射
  const sizeMap: Record<string, { height: number; fs: number }> = {
    small: { height: 6, fs: 10 },
    medium: { height: 10, fs: 12 },
    large: { height: 14, fs: 14 },
  };
  const dims = sizeMap[size] ?? sizeMap.medium;
  const barHeight = heightOverride || dims.height;

  // 圆形进度条
  if (shape === "circle") {
    const circleSize = (config.circleSize as number) ?? 80;
    // 收进框内并随框实时缩放：直接复用全族同源的 fitFactor（发布端 scaleFitScript 同一公式，
    // spec 由 progressCircleFit(circleSize) 给出 —— 两端缩放系数逐值一致）
    const circleScale = fitFactor(boxSize.w, boxSize.h, progressCircleFit(circleSize));
    const radius = (circleSize - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percent / 100) * circumference;

    return (
      <Box ref={rootRef} sx={{ display: "flex", alignItems: "center", gap: "12px", width: "100%", height: "100%", justifyContent: "center" }}>
        <Box sx={{ position: "relative", width: `${circleSize}px`, height: `${circleSize}px`, display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${circleScale})`, transformOrigin: "center" }}>
          <svg width={circleSize} height={circleSize} style={{ transform: "rotate(-90deg)" }}>
            <circle
              cx={circleSize / 2}
              cy={circleSize / 2}
              r={radius}
              fill="none"
              stroke={trackColor}
              strokeWidth={strokeWidth}
            />
            <circle
              cx={circleSize / 2}
              cy={circleSize / 2}
              r={radius}
              fill="none"
              stroke={fillBg.startsWith("linear-gradient") ? activeColor : fillBg}
              strokeWidth={strokeWidth}
              strokeLinecap={strokeLinecap === "round" ? "round" : "butt"}
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              style={{ transition: "stroke-dashoffset 0.3s ease" }}
            />
          </svg>
          {showLabel && (
            <Typography
              sx={{
                position: "absolute",
                fontSize: `${dims.fs}px`,
                fontWeight: 600,
                color: labelColor || "rgba(255,255,255,0.7)",
              }}
            >
              {percent}%
            </Typography>
          )}
        </Box>
      </Box>
    );
  }

  // 线性进度条
  return (
    <Box sx={{ width: "100%", height: "100%", display: "flex", alignItems: "center", gap: "8px" }}>
      <style>{`@keyframes progress-stripes{from{background-position:0 0}to{background-position:${barHeight * 2}px 0}}`}</style>
      <Box sx={{ flex: 1, position: "relative" }}>
        <Box
          sx={{
            width: "100%",
            height: `${barHeight}px`,
            backgroundColor: trackColor,
            borderRadius: `${barHeight / 2}px`,
            overflow: "hidden",
          }}
        >
          <Box
            sx={{
              width: `${percent}%`,
              height: "100%",
              background: fillBg,
              borderRadius: `${barHeight / 2}px`,
              transition: "width 0.3s ease",
              position: "relative",
              overflow: "hidden",
              ...(striped ? {
                backgroundImage: `repeating-linear-gradient(45deg, rgba(255,255,255,0.15) 0, rgba(255,255,255,0.15) ${barHeight / 2}px, transparent ${barHeight / 2}px, transparent ${barHeight}px)`,
                backgroundSize: `${barHeight * 2}px ${barHeight * 2}px`,
                animation: animated ? "progress-stripes 1s linear infinite" : "none",
              } : {}),
            }}
          />
        </Box>
      </Box>
      {showLabel && labelPosition === "right" && (
        <Typography sx={{ fontSize: `${dims.fs}px`, color: labelColor || "rgba(255,255,255,0.6)", whiteSpace: "nowrap", minWidth: "32px" }}>
          {percent}%
        </Typography>
      )}
      {showLabel && labelPosition === "inside" && percent > 10 && (
        <Typography
          sx={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            fontSize: `${dims.fs}px`,
            color: labelColor || "#fff",
            whiteSpace: "nowrap",
          }}
        >
          {percent}%
        </Typography>
      )}
    </Box>
  );
}
