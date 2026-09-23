import Box from "@mui/material/Box";
import ReactEChartsCore from "echarts-for-react/lib/core";
import { echarts, CHART_BOX_SX, calcFontScale, chartFontSizes, calcDevicePixelRatio } from "./echartsCore";
import { useEchartOptions } from "./useEchartOptions";
import type { ComponentRendererProps } from "../../../types/editor";
import { useChartData } from "./useChartData";

/** K线图 */
export function CandlestickChartRenderer({ config, width, height }: ComponentRendererProps) {
  config = useChartData(config);
  const isDark = (config.theme as string) !== "light";
  const xAxisData = (config.xAxisData as string[]) || ["2024-01", "2024-02", "2024-03", "2024-04", "2024-05", "2024-06", "2024-07"];
  const data = (config.data as number[][]) || [
    [2320, 2420, 2280, 2385], [2385, 2450, 2320, 2400],
    [2400, 2480, 2350, 2420], [2420, 2460, 2380, 2405],
    [2405, 2490, 2390, 2470], [2470, 2520, 2440, 2490],
    [2490, 2550, 2460, 2510],
  ];
  const showDataZoom = (config.showDataZoom as boolean) ?? true;

  const scale = calcFontScale(width, height);
  const fs = chartFontSizes(scale);
  const dpr = calcDevicePixelRatio(width, height);

  const baseOption: Record<string, unknown> = {
    grid: { left: "8%", right: "5%", top: "10%", bottom: showDataZoom ? "22%" : "10%", containLabel: true },
    xAxis: {
      type: "category", data: xAxisData,
      axisLine: { lineStyle: { color: isDark ? "rgba(255,255,255,0.12)" : "#ccc" } },
      axisTick: { show: false },
      axisLabel: { color: isDark ? "rgba(255,255,255,0.5)" : "#666", fontSize: fs.axisLabel },
    },
    yAxis: {
      type: "value", scale: true,
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: isDark ? "rgba(255,255,255,0.4)" : "#999", fontSize: fs.axisLabelSmall },
      splitLine: { lineStyle: { color: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)", type: "dashed" as const } },
    },
    ...(showDataZoom ? {
      dataZoom: [
        { type: "inside", start: 50, end: 100 },
        { type: "slider", start: 50, end: 100, height: Math.max(12, Math.round(20 * scale)), bottom: 6,
          borderColor: isDark ? "rgba(0,193,222,0.2)" : "#ddd",
          fillerColor: isDark ? "rgba(0,193,222,0.15)" : "rgba(0,0,0,0.05)",
          textStyle: { fontSize: fs.subtitle },
        },
      ],
    } : {}),
    series: [{
      type: "candlestick", data,
      itemStyle: {
        color: "#f64e56", color0: "#54ea92",
        borderColor: "#f64e56", borderColor0: "#54ea92",
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
