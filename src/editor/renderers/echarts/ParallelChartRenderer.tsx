import Box from "@mui/material/Box";
import ReactEChartsCore from "echarts-for-react/lib/core";
import { echarts, PALETTE, CHART_BOX_SX, calcFontScale, chartFontSizes, calcDevicePixelRatio } from "./echartsCore";
import { useEchartOptions } from "./useEchartOptions";
import type { ComponentRendererProps } from "../../../types/editor";
import { useChartData } from "./useChartData";

/** 平行坐标图 */
export function ParallelChartRenderer({ config, width, height }: ComponentRendererProps) {
  config = useChartData(config);
  const isDark = (config.theme as string) !== "light";
  const parallelAxis = (config.parallelAxis as { dim: number; name: string; min?: number; max?: number; type?: string; data?: string[] }[]) || [
    { dim: 0, name: "Price" }, { dim: 1, name: "Net Weight" },
    { dim: 2, name: "Amount" }, { dim: 3, name: "Score", min: 0, max: 100 },
  ];
  const data = (config.data as number[][]) || [
    [12.99, 100, 82, 77], [9.99, 80, 77, 69], [20, 120, 60, 85],
    [15, 110, 71, 72], [30, 150, 90, 88],
  ];

  const scale = calcFontScale(width, height);
  const fs = chartFontSizes(scale);
  const dpr = calcDevicePixelRatio(width, height);

  const baseOption: Record<string, unknown> = {
    parallel: {
      left: "8%", right: "5%", top: Math.round(30 * scale), bottom: Math.round(30 * scale),
      parallelAxisDefault: {
        axisLine: { lineStyle: { color: isDark ? "rgba(255,255,255,0.12)" : "#ddd" } },
        axisLabel: { color: isDark ? "rgba(255,255,255,0.5)" : "#999", fontSize: fs.axisLabel },
        axisTick: { lineStyle: { color: isDark ? "rgba(255,255,255,0.12)" : "#ddd" } },
        name: { textStyle: { color: isDark ? "rgba(255,255,255,0.6)" : "#666", fontSize: fs.axisLabelSmall } },
      },
    },
    series: [{
      type: "parallel",
      lineStyle: { width: Math.max(1, Math.round(2 * scale)), opacity: 0.6, color: PALETTE.primary },
      data,
      emphasis: { lineStyle: { width: Math.max(2, Math.round(4 * scale)), shadowColor: PALETTE.primary, shadowBlur: Math.round(8 * scale) } },
      smooth: true,
    }],
    parallelAxis,
  };

  const option = useEchartOptions(config, baseOption, scale);

  return (
    <Box sx={CHART_BOX_SX}>
      <ReactEChartsCore echarts={echarts} option={option} theme={isDark ? "industrial-dark" : undefined} notMerge lazyUpdate opts={{ devicePixelRatio: dpr }} style={{ width: "100%", height: "100%" }} />
    </Box>
  );
}
