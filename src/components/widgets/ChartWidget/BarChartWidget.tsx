import EChartsReact from "echarts-for-react";
import { useTheme } from "@mui/material/styles";
import type { BarChartWidgetProps } from "../types";

export default function BarChartWidget({
  title,
  data,
  height = 300,
  visible = true,
  style,
  className,
}: BarChartWidgetProps) {
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
    grid: {
      left: "3%",
      right: "4%",
      bottom: "8%",
      top: title ? "15%" : "10%",
      containLabel: true,
    },
    xAxis: {
      type: "category",
      data: data.map((d) => d.label),
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
    series: [
      {
        type: "bar",
        data: data.map((d) => d.value),
        barWidth: "50%",
        itemStyle: {
          borderRadius: [4, 4, 0, 0],
          color: {
            type: "linear" as const,
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: theme.palette.primary.main },
              { offset: 1, color: isDark ? "rgba(25, 118, 210, 0.3)" : "rgba(25, 118, 210, 0.6)" },
            ],
          },
        },
        emphasis: {
          itemStyle: {
            color: theme.palette.primary.dark,
          },
        },
      },
    ],
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
