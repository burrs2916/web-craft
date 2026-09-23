import Box from "@mui/material/Box";
import ReactEChartsCore from "echarts-for-react/lib/core";
import { echarts, CHART_BOX_SX, calcFontScale, chartFontSizes, calcDevicePixelRatio } from "./echartsCore";
import { useEchartOptions } from "./useEchartOptions";
import type { ComponentRendererProps } from "../../../types/editor";
import { useChartData } from "./useChartData";

/** 主题河流图 */
export function ThemeRiverChartRenderer({ config, width, height }: ComponentRendererProps) {
  config = useChartData(config);
  const isDark = (config.theme as string) !== "light";
  const data = (config.data as [string, number, string][]) || [
    ["2024-01", 10, "A"], ["2024-01", 15, "B"], ["2024-01", 8, "C"],
    ["2024-02", 12, "A"], ["2024-02", 18, "B"], ["2024-02", 10, "C"],
    ["2024-03", 15, "A"], ["2024-03", 12, "B"], ["2024-03", 14, "C"],
    ["2024-04", 18, "A"], ["2024-04", 8, "B"], ["2024-04", 16, "C"],
    ["2024-05", 14, "A"], ["2024-05", 20, "B"], ["2024-05", 12, "C"],
  ];

  const scale = calcFontScale(width, height);
  const fs = chartFontSizes(scale);
  const dpr = calcDevicePixelRatio(width, height);

  const baseOption: Record<string, unknown> = {
    legend: {
      bottom: 0,
      textStyle: { color: isDark ? "rgba(255,255,255,0.7)" : "#666", fontSize: fs.legend },
    },
    singleAxis: {
      type: "time", bottom: "12%",
      axisLabel: { color: isDark ? "rgba(255,255,255,0.5)" : "#999", fontSize: fs.axisLabelSmall },
      axisLine: { lineStyle: { color: isDark ? "rgba(255,255,255,0.12)" : "#ddd" } },
    },
    series: [{
      type: "themeRiver", data,
      emphasis: { itemStyle: { shadowBlur: 20, shadowColor: isDark ? "rgba(0,193,222,0.4)" : "rgba(0,0,0,0.5)" } },
      label: { show: false },
    }],
  };

  const option = useEchartOptions(config, baseOption, scale);

  return (
    <Box sx={CHART_BOX_SX}>
      <ReactEChartsCore echarts={echarts} option={option} theme={isDark ? "industrial-dark" : undefined} notMerge lazyUpdate opts={{ devicePixelRatio: dpr }} style={{ width: "100%", height: "100%" }} />
    </Box>
  );
}
