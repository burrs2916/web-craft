import Box from "@mui/material/Box";
import ReactEChartsCore from "echarts-for-react/lib/core";
import { echarts, PALETTE, CHART_BOX_SX, calcFontScale, chartFontSizes, calcDevicePixelRatio } from "./echartsCore";
import { useEchartOptions } from "./useEchartOptions";
import type { ComponentRendererProps } from "../../../types/editor";
import { useChartData } from "./useChartData";

/** 线图(航线) */
export function LinesChartRenderer({ config, width, height }: ComponentRendererProps) {
  config = useChartData(config);
  const isDark = (config.theme as string) !== "light";
  const mapName = (config.mapName as string) || "china";
  const linesData = (config.linesData as { coords: [number, number][] }[]) || [
    { coords: [[116.46, 39.92], [121.48, 31.22]] },
    { coords: [[116.46, 39.92], [104.06, 30.67]] },
    { coords: [[121.48, 31.22], [113.23, 23.16]] },
  ];
  const pointsData = (config.pointsData as { name: string; value: [number, number] }[]) || [
    { name: "北京", value: [116.46, 39.92] }, { name: "上海", value: [121.48, 31.22] },
    { name: "成都", value: [104.06, 30.67] }, { name: "广州", value: [113.23, 23.16] },
  ];
  const effectShow = (config.effectShow as boolean) ?? true;

  const scale = calcFontScale(width, height);
  const fs = chartFontSizes(scale);
  const dpr = calcDevicePixelRatio(width, height);

  const baseOption: Record<string, unknown> = {
    geo: {
      map: mapName, roam: true,
      label: { fontSize: fs.label },
      itemStyle: {
        areaColor: isDark ? "rgba(0,193,222,0.06)" : "#eee",
        borderColor: isDark ? "rgba(0,193,222,0.3)" : "#999",
        ...(isDark ? { shadowColor: "rgba(0,193,222,0.1)", shadowBlur: Math.round(4 * scale) } : {}),
      },
      emphasis: { itemStyle: { areaColor: "rgba(0,193,222,0.2)" } },
    },
    series: [
      {
        type: "lines", coordinateSystem: "geo", data: linesData,
        lineStyle: { color: PALETTE.primary, width: Math.max(1, Math.round(1.5 * scale)), curveness: 0.3, opacity: 0.6 },
        ...(effectShow ? {
          effect: {
            show: true, period: 6, trailLength: 0.5,
            symbol: "arrow", symbolSize: Math.max(4, Math.round(6 * scale)), color: PALETTE.primary,
          },
        } : {}),
      },
      {
        type: "scatter", coordinateSystem: "geo", data: pointsData,
        symbolSize: Math.max(6, Math.round(10 * scale)),
        itemStyle: { color: PALETTE.primary, ...(isDark ? { shadowColor: PALETTE.primary, shadowBlur: Math.round(8 * scale) } : {}) },
        label: { show: true, position: "right", formatter: "{b}", color: isDark ? "#fff" : "#333", fontSize: fs.label },
      },
    ],
  };

  const option = useEchartOptions(config, baseOption, scale);

  return (
    <Box sx={CHART_BOX_SX}>
      <ReactEChartsCore echarts={echarts} option={option} theme={isDark ? "industrial-dark" : undefined} notMerge lazyUpdate opts={{ devicePixelRatio: dpr }} style={{ width: "100%", height: "100%" }} />
    </Box>
  );
}
