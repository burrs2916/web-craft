import Box from "@mui/material/Box";
import ReactEChartsCore from "echarts-for-react/lib/core";
import { echarts, CHART_BOX_SX, calcFontScale, calcDevicePixelRatio } from "./echartsCore";
import { useEchartOptions } from "./useEchartOptions";
import type { ComponentRendererProps } from "../../../types/editor";
import { useChartData } from "./useChartData";

/** 默认 renderItem — 简单柱状图 */
const defaultRenderItem = (
  params: { coordSys: { x: number; y: number; height: number } },
  api: { coord: (data: number[]) => number[]; value: (dim?: number) => number },
) => {
  const pos = api.coord([api.value(0), api.value(1)]);
  return {
    type: "rect" as const,
    shape: {
      x: pos[0] - 10,
      y: pos[1],
      width: 20,
      height: Math.max(params.coordSys.y, params.coordSys.y + params.coordSys.height - pos[1]),
    },
    style: { fill: "#00c1de" },
  };
};

/** 自定义图表 - 完全自定义 renderItem */
export function CustomChartRenderer({ config, width, height }: ComponentRendererProps) {
  config = useChartData(config);
  const isDark = (config.theme as string) !== "light";

  // 合并用户 option，但确保 custom series 始终有 renderItem
  const userOption = (config.option as Record<string, unknown>) || {};
  const baseCustomOption: Record<string, unknown> = {
    xAxis: { type: "category", data: ["A", "B", "C", "D"] },
    yAxis: { type: "value" },
    series: [{
      type: "custom",
      renderItem: defaultRenderItem,
      data: [120, 200, 150, 80],
    }],
  };

  // 如果用户提供了 option，合并到 base 之上
  const customOption: Record<string, unknown> = { ...baseCustomOption, ...userOption };

  const scale = calcFontScale(width, height);
  const dpr = calcDevicePixelRatio(width, height);
  const mergedOption = useEchartOptions(config, customOption, scale);

  // useEchartOptions 内部 deepMerge 对数组是整体替换：用户 option.series（来自 JSON，
  // 不可能带函数）会覆盖掉上面补好的 renderItem，ECharts 随即抛 "series.render is
  // required"。因此必须在 merge 完成后对最终 series 兜底。
  const series = Array.isArray(mergedOption.series) ? mergedOption.series : [];
  const option: Record<string, unknown> = {
    ...mergedOption,
    series: series.map((s) => {
      const item = s as Record<string, unknown>;
      if (item && item.type === "custom" && typeof item.renderItem !== "function") {
        return { ...item, renderItem: defaultRenderItem };
      }
      return item;
    }),
  };

  return (
    <Box sx={CHART_BOX_SX}>
      <ReactEChartsCore echarts={echarts} option={option} theme={isDark ? "industrial-dark" : undefined} notMerge lazyUpdate opts={{ devicePixelRatio: dpr }} style={{ width: "100%", height: "100%" }} />
    </Box>
  );
}
