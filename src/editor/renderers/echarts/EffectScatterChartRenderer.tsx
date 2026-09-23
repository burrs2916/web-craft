import Box from "@mui/material/Box";
import ReactEChartsCore from "echarts-for-react/lib/core";
import { echarts, PALETTE, CHART_BOX_SX, calcFontScale, chartFontSizes, calcDevicePixelRatio } from "./echartsCore";
import { useEchartOptions } from "./useEchartOptions";
import type { ComponentRendererProps } from "../../../types/editor";
import { useChartData } from "./useChartData";

/** 涟漪散点图 */
export function EffectScatterChartRenderer({ config, width, height }: ComponentRendererProps) {
  config = useChartData(config);
  const isDark = (config.theme as string) !== "light";
  const data = (config.data as { name: string; value: [number, number, number] }[]) || [
    { name: "A", value: [10, 20, 50] }, { name: "B", value: [30, 40, 30] },
    { name: "C", value: [50, 60, 80] }, { name: "D", value: [70, 30, 60] },
  ];
  const symbolSize = (config.symbolSize as number) ?? 15;
  const showEffect = (config.showEffect as boolean) ?? true;
  const rippleBrushType = (config.rippleBrushType as string) || "stroke";

  const scale = calcFontScale(width, height);
  const fs = chartFontSizes(scale);
  const dpr = calcDevicePixelRatio(width, height);

  const baseOption: Record<string, unknown> = {
    grid: { left: "8%", right: "5%", top: "15%", bottom: "12%", containLabel: true },
    xAxis: {
      type: "value",
      axisLine: { lineStyle: { color: isDark ? "rgba(255,255,255,0.12)" : "#ccc" } },
      axisTick: { show: false },
      axisLabel: { color: isDark ? "rgba(255,255,255,0.4)" : "#999", fontSize: fs.axisLabelSmall },
      splitLine: { lineStyle: { color: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)", type: "dashed" as const } },
    },
    yAxis: {
      type: "value",
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: isDark ? "rgba(255,255,255,0.4)" : "#999", fontSize: fs.axisLabelSmall },
      splitLine: { lineStyle: { color: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)", type: "dashed" as const } },
    },
    series: [{
      type: "effectScatter", data, symbolSize: Math.max(4, Math.round(symbolSize * scale)),
      showEffectOn: showEffect ? "render" : "emphasis",
      rippleEffect: { brushType: rippleBrushType, scale: 3, period: 4 },
      label: { show: true, formatter: "{b}", position: "right", color: isDark ? "rgba(255,255,255,0.7)" : "#666", fontSize: fs.label },
      itemStyle: { color: PALETTE.primary, shadowBlur: 10, shadowColor: isDark ? `${PALETTE.primary}80` : "rgba(0,193,222,0.3)" },
    }],
  };

  const option = useEchartOptions(config, baseOption, scale);

  return (
    <Box sx={CHART_BOX_SX}>
      <ReactEChartsCore echarts={echarts} option={option} theme={isDark ? "industrial-dark" : undefined} notMerge lazyUpdate opts={{ devicePixelRatio: dpr }} style={{ width: "100%", height: "100%" }} />
    </Box>
  );
}
