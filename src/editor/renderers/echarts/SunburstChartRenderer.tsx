import Box from "@mui/material/Box";
import ReactEChartsCore from "echarts-for-react/lib/core";
import { echarts, CHART_BOX_SX, calcFontScale, chartFontSizes, calcDevicePixelRatio } from "./echartsCore";
import { useEchartOptions } from "./useEchartOptions";
import type { ComponentRendererProps } from "../../../types/editor";
import { useChartData } from "./useChartData";

/** 旭日图 */
export function SunburstChartRenderer({ config, width, height }: ComponentRendererProps) {
  config = useChartData(config);
  const isDark = (config.theme as string) !== "light";
  const data = (config.data as SunburstNode[]) || [
    { name: "A", value: 40, children: [{ name: "A1", value: 20 }, { name: "A2", value: 20 }] },
    { name: "B", value: 30, children: [{ name: "B1", value: 15 }, { name: "B2", value: 15 }] },
    { name: "C", value: 30, children: [{ name: "C1", value: 10 }, { name: "C2", value: 20 }] },
  ];
  const radius = (config.radius as [string, string]) || ["10%", "85%"];
  const sort = (config.sort as string) || "desc";

  const scale = calcFontScale(width, height);
  const fs = chartFontSizes(scale);
  const dpr = calcDevicePixelRatio(width, height);

  const baseOption: Record<string, unknown> = {
    series: [{
      type: "sunburst",
      data, radius, sort,
      emphasis: { focus: "ancestor" as const },
      levels: [{}, {
        r0: "15%", r: "40%",
        itemStyle: { borderWidth: Math.max(1, Math.round(2 * scale)), borderColor: isDark ? "rgba(0,0,0,0.3)" : "#fff", ...(isDark ? { shadowColor: "rgba(0,193,222,0.1)", shadowBlur: Math.round(4 * scale) } : {}) },
        label: { rotate: "tangential", fontSize: fs.label, color: isDark ? "#fff" : "#333" },
      }, {
        r0: "40%", r: "80%",
        label: { align: "right", fontSize: fs.label, color: isDark ? "rgba(255,255,255,0.8)" : "#333" },
        itemStyle: { borderWidth: Math.max(1, Math.round(1 * scale)), borderColor: isDark ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.5)" },
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

interface SunburstNode { name: string; value?: number; children?: SunburstNode[]; }
