import Box from "@mui/material/Box";
import ReactEChartsCore from "echarts-for-react/lib/core";
import { echarts, THEME_COLORS, CHART_BOX_SX, calcFontScale, chartFontSizes, calcDevicePixelRatio } from "./echartsCore";
import { useEchartOptions } from "./useEchartOptions";
import type { ComponentRendererProps } from "../../../types/editor";
import { useChartData } from "./useChartData";

/** 漏斗图 */
export function FunnelChartRenderer({ config, width, height }: ComponentRendererProps) {
  config = useChartData(config);
  const isDark = (config.theme as string) !== "light";
  const data = (config.data as { name: string; value: number }[]) || [
    { name: "展现", value: 100 }, { name: "点击", value: 80 },
    { name: "访问", value: 60 }, { name: "咨询", value: 40 },
    { name: "成交", value: 20 },
  ];
  const sort = (config.sort as string) || "descending";
  const orient = (config.orient as string) || "vertical";
  const funnelAlign = (config.funnelAlign as string) || "center";

  const scale = calcFontScale(width, height);
  const fs = chartFontSizes(scale);
  const dpr = calcDevicePixelRatio(width, height);

  const baseOption: Record<string, unknown> = {
    legend: {
      bottom: 0,
      textStyle: { color: isDark ? "rgba(255,255,255,0.7)" : "#666", fontSize: fs.legend },
    },
    series: [{
      type: "funnel",
      left: "10%", top: 20, bottom: 40, width: "80%",
      sort, orient, funnelAlign,
      data: data.map((d, i) => ({ ...d, itemStyle: { color: THEME_COLORS[i % THEME_COLORS.length] } })),
      label: {
        show: true, position: "inside",
        color: isDark ? "#fff" : "#333", fontSize: fs.label,
      },
      itemStyle: {
        borderWidth: 2,
        borderColor: isDark ? "rgba(0,0,0,0.3)" : "#fff",
        ...(isDark ? { shadowColor: "rgba(0,193,222,0.15)", shadowBlur: 8 } : {}),
      },
      emphasis: {
        label: { fontSize: Math.max(10, Math.round(14 * scale)) },
        itemStyle: { shadowBlur: 16, shadowColor: "rgba(0,193,222,0.3)" },
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
