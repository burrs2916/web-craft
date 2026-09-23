import Box from "@mui/material/Box";
import ReactEChartsCore from "echarts-for-react/lib/core";
import { echarts, CHART_BOX_SX, calcFontScale, chartFontSizes, calcDevicePixelRatio } from "./echartsCore";
import { useEchartOptions } from "./useEchartOptions";
import type { ComponentRendererProps } from "../../../types/editor";
import { useChartData } from "./useChartData";

/** 矩形树图 */
export function TreemapChartRenderer({ config, width, height }: ComponentRendererProps) {
  config = useChartData(config);
  const isDark = (config.theme as string) !== "light";
  const data = (config.data as TreemapNode[]) || [
    { name: "A", value: 40, children: [{ name: "A1", value: 20 }, { name: "A2", value: 20 }] },
    { name: "B", value: 30, children: [{ name: "B1", value: 15 }, { name: "B2", value: 15 }] },
    { name: "C", value: 20 }, { name: "D", value: 10 },
  ];
  const breadcrumb = (config.breadcrumb as boolean) ?? true;

  const scale = calcFontScale(width, height);
  const fs = chartFontSizes(scale);
  const dpr = calcDevicePixelRatio(width, height);

  const baseOption: Record<string, unknown> = {
    series: [{
      type: "treemap",
      data,
      roam: false,
      nodeClick: "link",
      breadcrumb: { show: breadcrumb, itemStyle: { color: "rgba(0,193,222,0.6)", textStyle: { color: "#fff", fontSize: fs.subtitle } } },
      label: { show: true, color: isDark ? "#fff" : "#333", fontSize: fs.label },
      itemStyle: {
        borderColor: isDark ? "rgba(0,0,0,0.3)" : "#fff",
        borderWidth: 2, gapWidth: 2,
        ...(isDark ? { shadowColor: "rgba(0,193,222,0.15)", shadowBlur: 6 } : {}),
      },
      levels: [{
        itemStyle: { borderColor: isDark ? "rgba(0,0,0,0.5)" : "#fff", borderWidth: 0, gapWidth: 4 },
      }, {
        itemStyle: { borderColor: isDark ? "rgba(0,193,222,0.2)" : "#ddd", borderWidth: 1, gapWidth: 2 },
      }],
    }],
  };

  const option = useEchartOptions(config, baseOption, scale);

  return (
    <Box sx={CHART_BOX_SX}>
      <ReactEChartsCore echarts={echarts} option={option} theme={isDark ? "industrial-dark" : undefined} notMerge lazyUpdate opts={{ devicePixelRatio: dpr }} style={{ width: "100%", height: "100%" }} />
    </Box>
  );
}

interface TreemapNode { name: string; value?: number; children?: TreemapNode[]; }
