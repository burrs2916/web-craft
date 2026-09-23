import Box from "@mui/material/Box";
import ReactEChartsCore from "echarts-for-react/lib/core";
import { echarts, PALETTE, CHART_BOX_SX, calcFontScale, chartFontSizes, calcDevicePixelRatio } from "./echartsCore";
import { useEchartOptions } from "./useEchartOptions";
import type { ComponentRendererProps } from "../../../types/editor";
import { useChartData } from "./useChartData";

/** 象形柱图 */
export function PictorialBarChartRenderer({ config, width, height }: ComponentRendererProps) {
  config = useChartData(config);
  const isDark = (config.theme as string) !== "light";
  const categories = (config.categories as string[]) || ["A", "B", "C", "D", "E"];
  const values = (config.values as number[]) || [60, 80, 45, 90, 70];
  const max = (config.max as number) ?? 100;
  const symbol = (config.symbol as string) || "rect";
  const symbolRepeat = (config.symbolRepeat as boolean) ?? true;
  const symbolSize = (config.symbolSize as [number, number]) || [12, 6];
  const symbolMargin = (config.symbolMargin as number) ?? 2;

  const scale = calcFontScale(width, height);
  const fs = chartFontSizes(scale);
  const dpr = calcDevicePixelRatio(width, height);

  const scaledSymbolSize: [number, number] = [
    Math.max(4, Math.round(symbolSize[0] * scale)),
    Math.max(2, Math.round(symbolSize[1] * scale)),
  ];

  const baseOption: Record<string, unknown> = {
    grid: { left: "8%", right: "5%", top: "15%", bottom: "12%", containLabel: true },
    xAxis: {
      type: "category", data: categories,
      axisLine: { lineStyle: { color: isDark ? "rgba(255,255,255,0.12)" : "#ccc" } },
      axisTick: { show: false },
      axisLabel: { color: isDark ? "rgba(255,255,255,0.5)" : "#666", fontSize: fs.axisLabel },
    },
    yAxis: {
      type: "value", max,
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: isDark ? "rgba(255,255,255,0.4)" : "#999", fontSize: fs.axisLabelSmall },
      splitLine: { lineStyle: { color: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)", type: "dashed" as const } },
    },
    series: [
      {
        name: "背景", type: "pictorialBar", symbol, symbolSize: scaledSymbolSize, symbolBoundingData: max,
        itemStyle: { color: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)" },
        data: categories.map(() => max), z: -1,
      },
      {
        name: "数据", type: "pictorialBar", symbol, symbolRepeat, symbolSize: scaledSymbolSize, symbolMargin, symbolClip: true,
        itemStyle: {
          color: PALETTE.primary,
          ...(isDark ? { shadowColor: PALETTE.primary, shadowBlur: 4 } : {}),
        },
        data: values,
        label: { show: true, position: "top", color: isDark ? "rgba(255,255,255,0.7)" : "#666", fontSize: fs.label },
      },
    ],
  };

  const option = useEchartOptions(config, baseOption, scale);

  return (
    <Box sx={CHART_BOX_SX}>
      <ReactEChartsCore echarts={echarts} option={option} theme={isDark ? "industrial-dark" : undefined} notMerge lazyUpdate opts={{ devicePixelRatio: dpr }} style={{ width: "100%", height: "100%" }} />
    </Box>
  );
}
