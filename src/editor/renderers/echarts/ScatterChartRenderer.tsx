import Box from "@mui/material/Box";
import ReactEChartsCore from "echarts-for-react/lib/core";
import { echarts, THEME_COLORS, CHART_BOX_SX, calcFontScale, chartFontSizes, calcDevicePixelRatio } from "./echartsCore";
import { useEchartOptions } from "./useEchartOptions";
import type { ComponentRendererProps } from "../../../types/editor";
import { useChartData } from "./useChartData";

/** 散点图 */
export function ScatterChartRenderer({ config, width, height }: ComponentRendererProps) {
  config = useChartData(config);
  const isDark = (config.theme as string) !== "light";
  const data = (config.data as number[][]) || [
    [10, 8.04], [8, 6.95], [13, 7.58], [9, 8.81], [11, 8.33],
    [14, 9.96], [6, 7.24], [4, 4.26], [12, 10.84], [7, 4.82],
  ];
  const symbolSize = (config.symbolSize as number) ?? 10;
  const seriesName = (config.seriesName as string) || "散点";

  const scale = calcFontScale(width, height);
  const fs = chartFontSizes(scale);
  const dpr = calcDevicePixelRatio(width, height);

  const baseOption: Record<string, unknown> = {
    grid: { left: "8%", right: "5%", top: "15%", bottom: "12%", containLabel: true },
    xAxis: {
      type: "value",
      axisLine: { lineStyle: { color: isDark ? "rgba(255,255,255,0.12)" : "#ccc" } },
      axisTick: { show: false },
      axisLabel: { color: isDark ? "rgba(255,255,255,0.5)" : "#666", fontSize: fs.axisLabel },
      splitLine: { lineStyle: { color: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)", type: "dashed" as const } },
    },
    yAxis: {
      type: "value",
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: isDark ? "rgba(255,255,255,0.4)" : "#999", fontSize: fs.axisLabelSmall },
      splitLine: { lineStyle: { color: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)", type: "dashed" as const } },
    },
    series: [{
      name: seriesName,
      type: "scatter",
      symbolSize: Math.max(4, Math.round(symbolSize * scale)),
      data,
      itemStyle: {
        color: THEME_COLORS[0],
        ...(isDark ? { shadowColor: THEME_COLORS[0], shadowBlur: 8 } : {}),
      },
      emphasis: {
        itemStyle: { shadowBlur: 16, shadowColor: THEME_COLORS[0], borderColor: "#fff", borderWidth: 2 },
        scale: 1.5,
      },
    }],
  };

  const option = useEchartOptions(config, baseOption, scale);

  return (
    <Box sx={CHART_BOX_SX}>
      <ReactEChartsCore echarts={echarts} option={option} theme={isDark ? "industrial-dark" : undefined} notMerge lazyUpdate opts={{ devicePixelRatio: dpr }} style={{ width: "100%", height: "100%" }} />
    </Box>
  );
}
