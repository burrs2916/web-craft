import Box from "@mui/material/Box";
import ReactEChartsCore from "echarts-for-react/lib/core";
import { echarts, PALETTE, CHART_BOX_SX, calcFontScale, chartFontSizes, calcDevicePixelRatio } from "./echartsCore";
import { useEchartOptions, SENSOR_PRESETS } from "./useEchartOptions";
import type { ComponentRendererProps } from "../../../types/editor";
import { useChartData } from "./useChartData";

/** 从嵌套对象中按路径取值 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  if (!path) return undefined;
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * 仪表盘 — 对标 sprayv2 工业风格 + 响应式字体 + 数据源联动
 */
export function GaugeChartRenderer({ config, width, height }: ComponentRendererProps) {
  config = useChartData(config);
  const isDark = (config.theme as string) !== "light";

  // 数据源联动
  const dataMode = (config.dataMode as string) ?? "static";
  const liveData = config.data as Record<string, unknown> | undefined;
  const dataField = config.dataField as string | undefined;

  // 实时数据模式：从 dataCache 中提取数值
  let liveValue: number | undefined;
  if (dataMode === "realtime" && liveData && dataField) {
    const v = getNestedValue(liveData, dataField);
    if (typeof v === "number") liveValue = v;
    else if (typeof v === "string") liveValue = parseFloat(v) || 0;
  }

  const value = liveValue ?? (config.value as number) ?? 68;
  const min = (config.min as number) ?? 0;
  const max = (config.max as number) ?? 100;
  const unit = (config.unit as string) || "";
  const gaugeName = (config.gaugeName as string) || "";
  const sensorPreset = (config.sensorPreset as string) || "";
  const splitNumber = (config.splitNumber as number) ?? 10;
  const showPointer = (config.showPointer as boolean) ?? true;
  const pointerWidth = (config.pointerWidth as number) ?? 2;
  const startAngle = (config.startAngle as number) ?? 220;
  const endAngle = (config.endAngle as number) ?? -40;
  const radius = (config.radius as string) ?? "68%";
  const center = (config.center as [string, string]) ?? ["50%", "60%"];
  const style = (config.gaugeStyle as string) ?? "industrial"; // industrial | modern
  const showProgress = (config.showProgress as boolean) ?? true;
  const progressWidth = (config.progressWidth as number) ?? 18;

  // 响应式字体缩放
  const scale = calcFontScale(width, height);
  const fs = chartFontSizes(scale);
  const dpr = calcDevicePixelRatio(width, height);

  // 传感器预设覆盖
  const preset = sensorPreset ? SENSOR_PRESETS[sensorPreset] : null;
  const effectiveMin = preset?.min ?? min;
  const effectiveMax = preset?.max ?? max;
  const effectiveUnit = preset?.unit ?? unit;

  const isIndustrial = style === "industrial";

  // sprayv2 工业风三色分段：绿→蓝→红
  const industrialColorStops: [number, string][] = [
    [0.2, "#228b22"],
    [0.8, "#48b"],
    [1, "#ff4500"],
  ];
  const colorStops = preset?.colorStops || industrialColorStops;

  // 缩放后的仪表盘元素尺寸
  const scaledPointerWidth = Math.max(1, Math.round(pointerWidth * scale));
  const scaledAxisLineWidth = isIndustrial ? Math.max(1, Math.round(2 * scale)) : progressWidth;
  const scaledSplitLineLength = isIndustrial ? Math.max(1, Math.round(2 * scale)) : 14;
  const scaledAxisTickLength = isIndustrial ? Math.max(3, Math.round(6 * scale)) : 8;
  const scaledAnchorSize = isIndustrial ? Math.max(4, Math.round(8 * scale)) : 14;
  const scaledShadowBlur = Math.round(10 * scale);

  const baseOption: Record<string, unknown> = {
    series: [{
      type: "gauge",
      center,
      radius,
      startAngle,
      endAngle,
      min: effectiveMin,
      max: effectiveMax,
      splitNumber,

      // ── 轴线（外环）— sprayv2: width 2 + 发光 ──
      axisLine: {
        lineStyle: {
          width: scaledAxisLineWidth,
          color: colorStops,
          ...(isIndustrial ? {
            shadowColor: "#fff",
            shadowBlur: scaledShadowBlur,
          } : {}),
        },
      },

      // ── 刻度 — sprayv2: splitNumber 5, length 6, color auto ──
      axisTick: {
        splitNumber: 5,
        length: scaledAxisTickLength,
        distance: isIndustrial ? -Math.round(2 * scale) : -progressWidth,
        lineStyle: {
          color: "auto",
          width: 1,
        },
      },

      // ── 分隔线 — sprayv2: width 2, color '#fff', length 2, 发光 ──
      splitLine: {
        show: true,
        length: scaledSplitLineLength,
        distance: isIndustrial ? -Math.round(2 * scale) : -progressWidth,
        lineStyle: {
          width: Math.max(1, Math.round(2 * scale)),
          color: isIndustrial ? "#fff" : "auto",
          ...(isIndustrial ? {
            shadowColor: "#fff",
            shadowBlur: scaledShadowBlur,
          } : {}),
        },
      },

      // ── 轴标签 — sprayv2: show false ──
      axisLabel: {
        show: !isIndustrial,
        distance: Math.round(8 * scale),
        color: isDark ? "rgba(255,255,255,0.5)" : "#999",
        fontSize: fs.axisLabelSmall,
      },

      // ── 指针 — sprayv2: width 2, color auto, 发光 ──
      pointer: {
        show: showPointer,
        length: "60%",
        width: scaledPointerWidth,
        itemStyle: {
          color: "auto",
          ...(isIndustrial ? { shadowColor: "#fff", shadowBlur: Math.round(6 * scale) } : {}),
        },
      },

      // ── 进度条（modern 风格） ──
      ...(isIndustrial ? {} : {
        progress: {
          show: showProgress,
          width: progressWidth,
          itemStyle: {
            color: {
              type: "linear" as const,
              x: 0, y: 0, x2: 1, y2: 0,
              colorStops: [
                { offset: 0, color: "#228b22" },
                { offset: 0.5, color: PALETTE.primary },
                { offset: 1, color: "#ff4500" },
              ],
            },
          },
        },
      }),

      // ── 中心锚点 — sprayv2: 小圆点 ──
      anchor: {
        show: showPointer,
        size: scaledAnchorSize,
        showAbove: true,
        itemStyle: {
          borderWidth: isIndustrial ? Math.max(1, Math.round(2 * scale)) : 4,
          borderColor: isIndustrial ? "#fff" : PALETTE.primary,
          ...(isIndustrial ? { shadowColor: "#fff", shadowBlur: Math.round(6 * scale) } : {}),
        },
      },

      // ── 标题 — sprayv2: fontSize 10, bolder, '#fff', offsetCenter [0,'100%'] ──
      title: {
        show: !!gaugeName,
        offsetCenter: [0, isIndustrial ? "100%" : "80%"],
        fontSize: fs.gaugeTitle,
        fontWeight: isIndustrial ? "bolder" : "normal",
        color: isDark ? "#fff" : "#666",
      },

      // ── 数值 — sprayv2: fontSize 14, bolder, '#fff', offsetCenter [0,'0%'] ──
      detail: {
        valueAnimation: true,
        fontSize: fs.gaugeDetail,
        fontWeight: "bolder",
        offsetCenter: [0, isIndustrial ? "0%" : "50%"],
        formatter: `{value}${effectiveUnit}`,
        color: isDark ? "#fff" : "#333",
      },

      data: [{ value, name: gaugeName }],
    }],
  };

  const option = useEchartOptions(config, baseOption, scale);

  return (
    <Box sx={CHART_BOX_SX}>
      <ReactEChartsCore
        echarts={echarts}
        option={option}
        theme={isDark ? "industrial-dark" : undefined}
        notMerge
        lazyUpdate
        opts={{ devicePixelRatio: dpr }}
        style={{ width: "100%", height: "100%" }}
      />
    </Box>
  );
}
