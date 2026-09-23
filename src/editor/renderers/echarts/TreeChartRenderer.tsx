import Box from "@mui/material/Box";
import ReactEChartsCore from "echarts-for-react/lib/core";
import { echarts, PALETTE, CHART_BOX_SX, calcFontScale, chartFontSizes, calcDevicePixelRatio } from "./echartsCore";
import { useEchartOptions } from "./useEchartOptions";
import type { ComponentRendererProps } from "../../../types/editor";
import { useChartData } from "./useChartData";

/** 树图 */
export function TreeChartRenderer({ config, width, height }: ComponentRendererProps) {
  config = useChartData(config);
  const isDark = (config.theme as string) !== "light";
  const data = (config.data as TreeNode) || {
    name: "根", children: [
      { name: "A", children: [{ name: "A1" }, { name: "A2" }] },
      { name: "B", children: [{ name: "B1" }, { name: "B2" }] },
    ],
  };
  const orient = (config.orient as string) || "LR";
  const edgeShape = (config.edgeShape as string) || "curve";
  const expandAndCollapse = (config.expandAndCollapse as boolean) ?? true;
  const initialTreeDepth = (config.initialTreeDepth as number) ?? 2;

  const scale = calcFontScale(width, height);
  const fs = chartFontSizes(scale);
  const dpr = calcDevicePixelRatio(width, height);

  const baseOption: Record<string, unknown> = {
    series: [{
      type: "tree", data: [data], orient, edgeShape,
      edgeForkPosition: "63%", initialTreeDepth,
      roam: true, expandAndCollapse,
      label: {
        show: true, position: orient === "LR" ? "right" : "top",
        verticalAlign: "middle", fontSize: fs.label,
        color: isDark ? "rgba(255,255,255,0.8)" : "#333",
      },
      leaves: { label: { position: orient === "LR" ? "left" : "bottom", fontSize: fs.label } },
      lineStyle: {
        color: isDark ? "rgba(0,193,222,0.3)" : "#aaa",
        width: Math.max(1, Math.round(1.5 * scale)), curveness: 0.5,
      },
      itemStyle: {
        color: PALETTE.primary, borderColor: PALETTE.primary,
        ...(isDark ? { shadowColor: PALETTE.primary, shadowBlur: 6 } : {}),
      },
      emphasis: {
        focus: "descendant" as const,
        itemStyle: { shadowBlur: 12, shadowColor: PALETTE.primary },
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

interface TreeNode { name: string; children?: TreeNode[]; value?: number; }
