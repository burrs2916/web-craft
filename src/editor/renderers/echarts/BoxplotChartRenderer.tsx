import Box from "@mui/material/Box";
import ReactEChartsCore from "echarts-for-react/lib/core";
import { echarts, PALETTE, CHART_BOX_SX, calcFontScale, chartFontSizes, calcDevicePixelRatio } from "./echartsCore";
import { useEchartOptions } from "./useEchartOptions";
import type { ComponentRendererProps } from "../../../types/editor";
import { useChartData } from "./useChartData";

/** 箱线图 */
export function BoxplotChartRenderer({ config, width, height }: ComponentRendererProps) {
  config = useChartData(config);
  const isDark = (config.theme as string) !== "light";
  const categories = (config.categories as string[]) || ["A", "B", "C", "D", "E"];
  const data = (config.data as number[][]) || [
    [655, 850, 940, 980, 1070], [760, 800, 845, 885, 960],
    [620, 750, 810, 870, 950], [670, 780, 830, 910, 990],
    [730, 850, 920, 960, 1020],
  ];
  const outliers = (config.outliers as number[][]) || [];

  const scale = calcFontScale(width, height);
  const fs = chartFontSizes(scale);
  const dpr = calcDevicePixelRatio(width, height);

  const baseOption: Record<string, unknown> = {
    grid: { left: "8%", right: "5%", top: "15%", bottom: "12%", containLabel: true },
    xAxis: {
      type: "category", data: categories,
      axisLine: { lineStyle: { color: isDark ? "rgba(255,255,255,0.12)" : "#ccc" } },
      axisTick: { show: false },
      axisLabel: { color: isDark ? "rgba(255,255,255,0.5)" : "#666", fontSize: fs.axisLabel },
    },
    yAxis: {
      type: "value",
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: isDark ? "rgba(255,255,255,0.4)" : "#999", fontSize: fs.axisLabelSmall },
      splitLine: { lineStyle: { color: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)", type: "dashed" as const } },
    },
    series: [
      {
        name: "箱线", type: "boxplot", data,
        itemStyle: {
          color: "rgba(0,193,222,0.25)", borderColor: PALETTE.primary, borderWidth: 2,
          ...(isDark ? { shadowColor: PALETTE.primary, shadowBlur: 4 } : {}),
        },
      },
      ...(outliers.length > 0 ? [{
        name: "异常值", type: "scatter", data: outliers, symbolSize: Math.max(4, Math.round(8 * scale)),
        itemStyle: { color: "#F57474", ...(isDark ? { shadowColor: "#F57474", shadowBlur: 6 } : {}) },
      }] : []),
    ],
  };

  const option = useEchartOptions(config, baseOption, scale);

  return (
    <Box sx={CHART_BOX_SX}>
      <ReactEChartsCore echarts={echarts} option={option} theme={isDark ? "industrial-dark" : undefined} notMerge lazyUpdate opts={{ devicePixelRatio: dpr }} style={{ width: "100%", height: "100%" }} />
    </Box>
  );
}
