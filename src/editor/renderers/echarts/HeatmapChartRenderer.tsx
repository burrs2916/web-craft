import Box from "@mui/material/Box";
import ReactEChartsCore from "echarts-for-react/lib/core";
import { echarts, CHART_BOX_SX, calcFontScale, chartFontSizes, calcDevicePixelRatio } from "./echartsCore";
import { useEchartOptions } from "./useEchartOptions";
import type { ComponentRendererProps } from "../../../types/editor";
import { useChartData } from "./useChartData";

/** 热力图 */
export function HeatmapChartRenderer({ config, width, height }: ComponentRendererProps) {
  config = useChartData(config);
  const isDark = (config.theme as string) !== "light";
  const xAxisData = (config.xAxisData as string[]) || ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const yAxisData = (config.yAxisData as string[]) || ["Morn", "Noon", "Eve", "Night"];
  const data = (config.data as number[][]) || generateDemoHeatmapData(xAxisData.length, yAxisData.length);
  const min = (config.min as number) ?? 0;
  const max = (config.max as number) ?? 100;

  const scale = calcFontScale(width, height);
  const fs = chartFontSizes(scale);
  const dpr = calcDevicePixelRatio(width, height);

  const baseOption: Record<string, unknown> = {
    grid: { left: "12%", right: "15%", top: "10%", bottom: "12%" },
    xAxis: {
      type: "category", data: xAxisData,
      axisLine: { lineStyle: { color: isDark ? "rgba(255,255,255,0.12)" : "#ccc" } },
      axisTick: { show: false },
      axisLabel: { color: isDark ? "rgba(255,255,255,0.5)" : "#666", fontSize: fs.axisLabel },
      splitArea: { show: true, areaStyle: { color: isDark ? ["rgba(255,255,255,0.02)", "rgba(255,255,255,0.04)"] : ["rgba(0,0,0,0.02)", "rgba(0,0,0,0.04)"] } },
    },
    yAxis: {
      type: "category", data: yAxisData,
      axisLine: { lineStyle: { color: isDark ? "rgba(255,255,255,0.12)" : "#ccc" } },
      axisTick: { show: false },
      axisLabel: { color: isDark ? "rgba(255,255,255,0.5)" : "#666", fontSize: fs.axisLabel },
      splitArea: { show: true, areaStyle: { color: isDark ? ["rgba(255,255,255,0.02)", "rgba(255,255,255,0.04)"] : ["rgba(0,0,0,0.02)", "rgba(0,0,0,0.04)"] } },
    },
    visualMap: {
      min, max, calculable: true,
      orient: "vertical", right: 8, top: "center",
      inRange: { color: ["#313695", "#4575b4", "#74add1", "#abd9e9", "#e0f3f8", "#ffffbf", "#fee090", "#fdae61", "#f46d43", "#d73027", "#a50026"] },
      textStyle: { color: isDark ? "rgba(255,255,255,0.6)" : "#666", fontSize: fs.subtitle },
    },
    series: [{
      name: "热力",
      type: "heatmap",
      data,
      label: { show: false },
      emphasis: {
        itemStyle: { shadowBlur: 12, shadowColor: isDark ? "rgba(0,193,222,0.4)" : "rgba(0,0,0,0.5)" },
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

function generateDemoHeatmapData(xLen: number, yLen: number): number[][] {
  const data: number[][] = [];
  for (let i = 0; i < xLen; i++) {
    for (let j = 0; j < yLen; j++) {
      data.push([i, j, Math.round(Math.random() * 100)]);
    }
  }
  return data;
}
