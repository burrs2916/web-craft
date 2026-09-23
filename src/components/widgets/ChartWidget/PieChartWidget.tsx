import EChartsReact from "echarts-for-react";
import { useTheme } from "@mui/material/styles";
import type { PieChartWidgetProps } from "../types";

export default function PieChartWidget({
  title,
  data,
  height = 300,
  visible = true,
  style,
  className,
}: PieChartWidgetProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  if (!visible) return null;

  const colors = [
    theme.palette.primary.main,
    theme.palette.success.main,
    theme.palette.warning.main,
    theme.palette.error.main,
    theme.palette.info.main,
  ];

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
      trigger: "item",
      backgroundColor: isDark ? "rgba(50, 50, 50, 0.9)" : "rgba(255, 255, 255, 0.9)",
      borderColor: isDark ? "#333" : "#ddd",
      textStyle: {
        color: isDark ? "#fff" : "#333",
      },
      formatter: "{a} <br/>{b}: {c} ({d}%)",
    },
    legend: {
      orient: "vertical",
      left: "left",
      textStyle: {
        color: isDark ? "#aaa" : "#666",
      },
    },
    series: [
      {
        name: title || "数据",
        type: "pie",
        radius: ["40%", "70%"],
        center: ["60%", "50%"],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 8,
          borderColor: isDark ? "#1a1a2e" : "#fff",
          borderWidth: 2,
        },
        label: {
          show: false,
          position: "center",
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 16,
            fontWeight: "bold",
            color: isDark ? "#fff" : "#333",
          },
        },
        labelLine: {
          show: false,
        },
        data: data.map((item, index) => ({
          ...item,
          itemStyle: {
            color: colors[index % colors.length],
          },
        })),
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
