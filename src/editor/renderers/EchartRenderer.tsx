import Box from "@mui/material/Box";
import ReactEChartsCore from "echarts-for-react/lib/core";
import { echarts, CHART_BOX_SX } from "./echarts/echartsCore";
import type { ComponentRendererProps } from "../../types/editor";

/**
 * 通用 ECharts 渲染器（向后兼容）
 * 推荐使用专用图表组件：echart-bar, echart-line, echart-pie 等
 */
export function EchartRenderer({ config }: ComponentRendererProps) {
  const option = (config.option as object | undefined);
  const theme = (config.theme as string) || "default";
  const chartOption = option && Object.keys(option).length > 0 ? option : getDemoOption();

  return (
    <Box sx={CHART_BOX_SX}>
      <ReactEChartsCore
        echarts={echarts}
        option={chartOption}
        theme={theme === "dark" ? "dark" : undefined}
        style={{ width: "100%", height: "100%" }}
        notMerge
        lazyUpdate
      />
    </Box>
  );
}

const DEMO_OPTIONS: Record<string, object> = {
  bar: {
    tooltip: { trigger: "axis" },
    grid: { left: "10%", right: "5%", top: "15%", bottom: "15%" },
    xAxis: { type: "category", data: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] },
    yAxis: { type: "value" },
    series: [{ type: "bar", data: [120, 200, 150, 80, 70, 110, 130], itemStyle: { borderRadius: [4, 4, 0, 0] } }],
  },
  line: {
    tooltip: { trigger: "axis" },
    grid: { left: "10%", right: "5%", top: "15%", bottom: "15%" },
    xAxis: { type: "category", data: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], boundaryGap: false },
    yAxis: { type: "value" },
    series: [{ type: "line", data: [820, 932, 901, 934, 1290, 1330, 1320], smooth: true, areaStyle: { opacity: 0.15 } }],
  },
  pie: {
    tooltip: { trigger: "item" },
    legend: { bottom: "5%", left: "center" },
    series: [{
      type: "pie",
      radius: ["35%", "65%"],
      center: ["50%", "45%"],
      data: [
        { value: 1048, name: "Search" },
        { value: 735, name: "Direct" },
        { value: 580, name: "Email" },
        { value: 484, name: "Union" },
        { value: 300, name: "Video" },
      ],
    }],
  },
  gauge: {
    series: [{
      type: "gauge",
      detail: { formatter: "{value}%" },
      data: [{ value: 68, name: "Rate" }],
    }],
  },
};

function getDemoOption(): object {
  const keys = Object.keys(DEMO_OPTIONS);
  return DEMO_OPTIONS[keys[Math.floor(Math.random() * keys.length)]];
}
