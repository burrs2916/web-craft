import Box from "@mui/material/Box";
import ReactEChartsCore from "echarts-for-react/lib/core";
import { echarts, CHART_BOX_SX, calcFontScale, chartFontSizes, calcDevicePixelRatio } from "./echartsCore";
import { useEchartOptions } from "./useEchartOptions";
import type { ComponentRendererProps } from "../../../types/editor";
import { useChartData } from "./useChartData";

/** 桑基图 */
export function SankeyChartRenderer({ config, width, height }: ComponentRendererProps) {
  config = useChartData(config);
  const isDark = (config.theme as string) !== "light";
  const nodes = (config.nodes as { name: string }[]) || [
    { name: "a" }, { name: "b" }, { name: "c" }, { name: "d" }, { name: "e" },
  ];
  const links = (config.links as { source: string; target: string; value: number }[]) || [
    { source: "a", target: "b", value: 5 }, { source: "a", target: "c", value: 3 },
    { source: "b", target: "d", value: 4 }, { source: "c", target: "d", value: 2 },
    { source: "c", target: "e", value: 1 }, { source: "b", target: "e", value: 1 },
  ];
  const orient = (config.orient as string) || "horizontal";
  const draggable = (config.draggable as boolean) ?? true;

  const scale = calcFontScale(width, height);
  const fs = chartFontSizes(scale);
  const dpr = calcDevicePixelRatio(width, height);

  const baseOption: Record<string, unknown> = {
    series: [{
      type: "sankey",
      data: nodes,
      links,
      orient,
      draggable,
      emphasis: { focus: "adjacency" as const },
      nodeAlign: "justify" as const,
      lineStyle: { color: "gradient", curveness: 0.5, opacity: isDark ? 0.4 : 0.3 },
      itemStyle: {
        borderWidth: 1,
        borderColor: isDark ? "rgba(0,193,222,0.3)" : "#ddd",
        ...(isDark ? { shadowColor: "rgba(0,193,222,0.2)", shadowBlur: 6 } : {}),
      },
      label: { color: isDark ? "rgba(255,255,255,0.8)" : "#333", fontSize: fs.label },
    }],
  };

  const option = useEchartOptions(config, baseOption, scale);

  return (
    <Box sx={CHART_BOX_SX}>
      <ReactEChartsCore echarts={echarts} option={option} theme={isDark ? "industrial-dark" : undefined} notMerge lazyUpdate opts={{ devicePixelRatio: dpr }} style={{ width: "100%", height: "100%" }} />
    </Box>
  );
}
