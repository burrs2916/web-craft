import EChartsReact from "echarts-for-react";
import { useTheme } from "@mui/material/styles";
import type { LineChartWidgetProps } from "../types";

export default function LineChartWidget({
  title,
  data,
  height = 300,
  visible = true,
  style,
  className,
}: LineChartWidgetProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  if (!visible) return null;

  const option = {
    title: {
      text: title,
      textStyle: {
        color: isDark ? "#fff" : "#333",
        fontSize: 14,
        fontWeight: 600,
      },
      left: "center",
    },
    tooltip: {
      trigger: "axis",
      backgroundColor: isDark ? "rgba(50, 50, 50, 0.9)" : "rgba(255, 255, 255, 0.9)",
      borderColor: isDark ? "#333" : "#ddd",
      textStyle: {
        color: isDark ? "#fff" : "#333",
      },
    },
    legend: {
      data: data.series.map((s) => s.name),
      textStyle: {
        color: isDark ? "#aaa" : "#666",
      },
      bottom: 0,
    },
    grid: {
      left: "3%",
      right: "4%",
      bottom: "15%",
      top: title ? "15%" : "10%",
      containLabel: true,
    },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: data.xAxis,
      axisLine: {
        lineStyle: {
          color: isDark ? "#444" : "#ddd",
        },
      },
      axisLabel: {
        color: isDark ? "#aaa" : "#666",
      },
    },
    yAxis: {
      type: "value",
      axisLine: {
        lineStyle: {
          color: isDark ? "#444" : "#ddd",
        },
      },
      axisLabel: {
        color: isDark ? "#aaa" : "#666",
      },
      splitLine: {
        lineStyle: {
          color: isDark ? "#333" : "#eee",
        },
      },
    },
    series: data.series.map((s, index) => ({
      name: s.name,
      type: "line",
      smooth: true,
      data: s.data,
      itemStyle: {
        color: [
          theme.palette.primary.main,
          theme.palette.success.main,
          theme.palette.warning.main,
          theme.palette.error.main,
          theme.palette.info.main,
        ][index % 5],
      },
      areaStyle: {
        opacity: 0.1,
      },
    })),
  };

  return (
    <EChartsReact
      option={option}
      style={{ height, ...style }}
      opts={{ renderer: "canvas" }}
      className={className}
    />
  );
}
