import EChartsReact from "echarts-for-react";
import { useTheme } from "@mui/material/styles";
import type { GaugeChartWidgetProps } from "../types";

export default function GaugeChartWidget({
  title,
  value,
  min = 0,
  max = 100,
  unit = "%",
  height = 300,
  visible = true,
  style,
  className,
}: GaugeChartWidgetProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  if (!visible) return null;

  const getColor = (val: number) => {
    if (val < 30) return theme.palette.success.main;
    if (val < 70) return theme.palette.warning.main;
    return theme.palette.error.main;
  };

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
    series: [
      {
        type: "gauge",
        center: ["50%", "60%"],
        startAngle: 200,
        endAngle: -20,
        min,
        max,
        splitNumber: 10,
        itemStyle: {
          color: getColor(value),
        },
        progress: {
          show: true,
          width: 20,
        },
        pointer: {
          show: false,
        },
        axisLine: {
          lineStyle: {
            width: 20,
            color: [[1, isDark ? "#333" : "#eee"]],
          },
        },
        axisTick: {
          show: false,
        },
        splitLine: {
          show: false,
        },
        axisLabel: {
          show: false,
        },
        anchor: {
          show: false,
        },
        title: {
          show: false,
        },
        detail: {
          valueAnimation: true,
          width: "60%",
          lineHeight: 40,
          borderRadius: 8,
          offsetCenter: [0, "-5%"],
          fontSize: 24,
          fontWeight: "bolder",
          formatter: `{value}${unit}`,
          color: isDark ? "#fff" : "#333",
        },
        data: [
          {
            value,
          },
        ],
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
