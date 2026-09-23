import Box from "@mui/material/Box";
import ReactEChartsCore from "echarts-for-react/lib/core";
import { echarts, CHART_BOX_SX, calcFontScale, chartFontSizes, calcDevicePixelRatio } from "./echartsCore";
import { useEchartOptions } from "./useEchartOptions";
import type { ComponentRendererProps } from "../../../types/editor";
import { useChartData } from "./useChartData";

/** 关系图 */
export function GraphChartRenderer({ config, width, height }: ComponentRendererProps) {
  config = useChartData(config);
  const isDark = (config.theme as string) !== "light";
  const nodes = (config.nodes as GraphNode[]) || [
    { name: "Node 1", symbolSize: 40, category: 0 },
    { name: "Node 2", symbolSize: 30, category: 1 },
    { name: "Node 3", symbolSize: 30, category: 1 },
    { name: "Node 4", symbolSize: 25, category: 2 },
    { name: "Node 5", symbolSize: 25, category: 2 },
  ];
  const links = (config.links as { source: string; target: string }[]) || [
    { source: "Node 1", target: "Node 2" }, { source: "Node 1", target: "Node 3" },
    { source: "Node 2", target: "Node 4" }, { source: "Node 3", target: "Node 5" },
    { source: "Node 4", target: "Node 5" },
  ];
  const categories = (config.categories as { name: string }[]) || [
    { name: "核心" }, { name: "一级" }, { name: "二级" },
  ];
  const layout = (config.layout as string) || "force";
  const roam = (config.roam as boolean) ?? true;

  const scale = calcFontScale(width, height);
  const fs = chartFontSizes(scale);
  const dpr = calcDevicePixelRatio(width, height);

  const baseOption: Record<string, unknown> = {
    legend: {
      data: categories.map((c) => c.name),
      bottom: 0,
      textStyle: { color: isDark ? "rgba(255,255,255,0.7)" : "#666", fontSize: fs.legend },
    },
    series: [{
      type: "graph",
      layout, data: nodes.map(n => ({ ...n, symbolSize: Math.max(10, Math.round((n.symbolSize ?? 30) * scale)) })), links, categories, roam,
      draggable: true,
      label: { show: true, position: "right", color: isDark ? "#fff" : "#333", fontSize: fs.label },
      force: layout === "force" ? { repulsion: Math.max(60, Math.round(120 * scale)), edgeLength: Math.max(40, Math.round(80 * scale)) } : undefined,
      lineStyle: { color: "source", curveness: 0.3, opacity: isDark ? 0.5 : 0.4 },
      itemStyle: {
        ...(isDark ? { shadowColor: "rgba(0,193,222,0.3)", shadowBlur: 8 } : {}),
      },
      emphasis: {
        focus: "adjacency" as const,
        lineStyle: { width: 4 },
        itemStyle: { shadowBlur: 16, shadowColor: "rgba(0,193,222,0.4)" },
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

interface GraphNode { name: string; symbolSize?: number; category?: number; x?: number; y?: number; }
