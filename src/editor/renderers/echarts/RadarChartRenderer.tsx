import Box from "@mui/material/Box";
import ReactEChartsCore from "echarts-for-react/lib/core";
import { echarts, THEME_COLORS, CHART_BOX_SX, calcFontScale, chartFontSizes, calcDevicePixelRatio } from "./echartsCore";
import { useEchartOptions } from "./useEchartOptions";
import type { ComponentRendererProps } from "../../../types/editor";
import { useChartData } from "./useChartData";

/** 雷达图 */
export function RadarChartRenderer({ config, width, height }: ComponentRendererProps) {
  config = useChartData(config);
  const isDark = (config.theme as string) !== "light";
  const indicator = (config.indicator as { name: string; max: number }[]) || [
    { name: "Sales", max: 100 }, { name: "Admin", max: 100 },
    { name: "Tech", max: 100 }, { name: "Support", max: 100 },
    { name: "Dev", max: 100 }, { name: "Marketing", max: 100 },
  ];
  const seriesData = (config.seriesData as { value: number[]; name: string }[]) || [
    { value: [80, 70, 90, 60, 85, 75], name: "预算" },
    { value: [60, 80, 65, 90, 70, 85], name: "实际" },
  ];

  const scale = calcFontScale(width, height);
  const fs = chartFontSizes(scale);
  const dpr = calcDevicePixelRatio(width, height);

  const baseOption: Record<string, unknown> = {
    legend: {
      bottom: 0,
      textStyle: { color: isDark ? "rgba(255,255,255,0.7)" : "#666", fontSize: fs.legend },
    },
    radar: {
      indicator,
      shape: "polygon" as const,
      splitNumber: 5,
      center: ["50%", "48%"],
      radius: "65%",
      axisName: { color: isDark ? "rgba(255,255,255,0.6)" : "#666", fontSize: fs.label },
      splitLine: { lineStyle: { color: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)" } },
      splitArea: { areaStyle: { color: isDark ? ["rgba(0,193,222,0.02)", "rgba(0,193,222,0.05)"] : ["rgba(0,0,0,0.02)", "rgba(0,0,0,0.04)"] } },
      axisLine: { lineStyle: { color: isDark ? "rgba(0,193,222,0.15)" : "rgba(0,0,0,0.12)" } },
    },
    series: [{
      type: "radar",
      data: seriesData.map((item, i) => {
        const color = THEME_COLORS[i % THEME_COLORS.length];
        return {
          ...item,
          symbol: "circle",
          symbolSize: Math.max(3, Math.round(5 * scale)),
          lineStyle: { color, width: Math.max(1, Math.round(2 * scale)), shadowColor: isDark ? color : "transparent", shadowBlur: isDark ? 6 : 0 },
          areaStyle: { color: `${color}${isDark ? "20" : "15"}` },
          itemStyle: { color, borderWidth: Math.max(1, Math.round(2 * scale)), borderColor: isDark ? "rgba(0,0,0,0.3)" : "#fff" },
        };
      }),
      emphasis: { lineStyle: { width: Math.max(2, Math.round(3 * scale)) } },
    }],
  };

  const option = useEchartOptions(config, baseOption, scale);

  return (
    <Box sx={CHART_BOX_SX}>
      <ReactEChartsCore echarts={echarts} option={option} theme={isDark ? "industrial-dark" : undefined} notMerge lazyUpdate opts={{ devicePixelRatio: dpr }} style={{ width: "100%", height: "100%" }} />
    </Box>
  );
}
