import Box from "@mui/material/Box";
import ReactEChartsCore from "echarts-for-react/lib/core";
import { echarts, PALETTE, CHART_BOX_SX, createBarGradient, calcFontScale, chartFontSizes, calcDevicePixelRatio } from "./echartsCore";
import { useEchartOptions } from "./useEchartOptions";
import type { ComponentRendererProps } from "../../../types/editor";
import { useChartData } from "./useChartData";

/**
 * 柱状图 — 对标 sprayv2 工业风格 + 响应式字体
 *
 * sprayv2 双层横向条形图特征：
 * - 数据条：barWidth 10, barBorderRadius 20, 多色 ['#1089E7','#F57474','#56D0E3','#F8B448','#8B78F6']
 * - 外框条：barGap '-100%', barWidth 15, color 'none', borderColor '#00c1de', borderWidth 3, barBorderRadius 15
 * - Y轴反转，rich 文本编号圆点 backgroundColor '#339911'
 * - grid: top '0%', left '25%', right '25%'
 * - xAxis: show false
 */
export function BarChartRenderer({ config, width, height }: ComponentRendererProps) {
  config = useChartData(config);
  const isDark = (config.theme as string) !== "light";
  const orientation = (config.orientation as string) || "vertical";
  const categories = (config.categories as string[]) || ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const values = (config.values as number[] | number[][]) || [120, 200, 150, 80, 70, 110, 130];
  const seriesName = (config.seriesName as string | string[]) || "数据";
  const borderRadius = (config.borderRadius as number) ?? 4;
  const showLabel = (config.showLabel as boolean) ?? false;
  const gradient = (config.gradient as boolean) ?? true;
  const showBorder = (config.showBorder as boolean) ?? false;
  const borderWidth = (config.borderWidth as number) ?? 14;
  const borderColor = (config.borderColor as string) ?? PALETTE.primary;
  const style = (config.barStyle as string) ?? "default"; // default | industrial

  // 响应式字体缩放
  const scale = calcFontScale(width, height);
  const fs = chartFontSizes(scale);
  const dpr = calcDevicePixelRatio(width, height);

  // sprayv2 工业风多色
  const industrialColors = ["#1089E7", "#F57474", "#56D0E3", "#F8B448", "#8B78F6"];

  // 多系列归一化
  const isMultiSeries = Array.isArray(values) && values.length > 0 && Array.isArray((values as number[][])[0]);
  const seriesData: number[][] = isMultiSeries ? (values as number[][]) : [values as number[]];
  const seriesNames: string[] = Array.isArray(seriesName) ? seriesName : [seriesName as string];
  const isIndustrial = style === "industrial";
  const isHorizontal = orientation === "horizontal";

  // 缩放后的柱体尺寸
  const scaledBarWidth = isIndustrial && isHorizontal ? Math.max(6, Math.round(10 * scale)) : undefined;
  const scaledBorderBarWidth = isIndustrial && isHorizontal ? Math.max(8, Math.round(15 * scale)) : undefined;

  // ── 构造系列 ──
  const series: Record<string, unknown>[] = [];

  if (isIndustrial && isHorizontal) {
    // sprayv2 双层横向条形图模式
    const data = seriesData[0];
    const maxVal = Math.max(...data, 1);

    // 数据条
    series.push({
      name: seriesNames[0] || "数据",
      type: "bar",
      yAxisIndex: 0,
      data,
      barWidth: scaledBarWidth,
      label: {
        show: true,
        position: "right",
        formatter: "{c}%",
        color: isDark ? "rgba(255,255,255,0.8)" : "#666",
        fontSize: fs.label,
      },
      itemStyle: {
        barBorderRadius: Math.max(10, Math.round(20 * scale)),
        color: (params: { dataIndex: number }) => industrialColors[params.dataIndex % industrialColors.length],
      },
    });

    // 外框条
    series.push({
      name: "框",
      type: "bar",
      yAxisIndex: 1,
      barGap: "-100%",
      data: data.map(() => maxVal * 1.2),
      barWidth: scaledBorderBarWidth,
      itemStyle: {
        color: "none",
        borderColor: "#00c1de",
        borderWidth: Math.max(1, Math.round(3 * scale)),
        barBorderRadius: Math.max(8, Math.round(15 * scale)),
      },
      silent: true,
      tooltip: { show: false },
    });
  } else {
    // 通用模式
    seriesData.forEach((data, i) => {
      const color = industrialColors[i % industrialColors.length];
      const barGrad = gradient
        ? createBarGradient(color, `${color}33`, orientation as "vertical" | "horizontal")
        : color;

      const mainBar: Record<string, unknown> = {
        name: seriesNames[i] || `系列${i + 1}`,
        type: "bar",
        data,
        barWidth: isIndustrial ? "30%" : "45%",
        label: {
          show: showLabel,
          position: isHorizontal ? "right" : "top",
          color: isDark ? "rgba(255,255,255,0.7)" : "#666",
          fontSize: fs.label,
        },
        itemStyle: {
          borderRadius: isHorizontal
            ? [0, borderRadius, borderRadius, 0]
            : [borderRadius, borderRadius, 0, 0],
          color: barGrad,
          ...(isDark && gradient ? {
            shadowColor: color,
            shadowBlur: 6,
          } : {}),
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 12,
            shadowColor: color,
          },
        },
      };
      series.push(mainBar);

      // 双层边框条
      if (showBorder) {
        const borderBar: Record<string, unknown> = {
          name: `${seriesNames[i] || `系列${i + 1}`}框`,
          type: "bar",
          barGap: "-100%",
          barWidth: `${borderWidth}px`,
          data: data.map(() => Math.max(...data) * 1.2),
          itemStyle: {
            color: "none",
            borderColor,
            borderWidth: 2,
            borderRadius: isHorizontal
              ? [0, borderRadius + 2, borderRadius + 2, 0]
              : [borderRadius + 2, borderRadius + 2, 0, 0],
          },
          silent: true,
          tooltip: { show: false },
        };
        series.push(borderBar);
      }
    });
  }

  // ── 坐标轴 ──
  const axisCategory = {
    type: "category" as const,
    data: categories,
    axisLine: { lineStyle: { color: isDark ? "rgba(255,255,255,0.12)" : "#ccc" } },
    axisTick: { show: false },
    axisLabel: {
      color: isDark ? "rgba(255,255,255,0.6)" : "#666",
      fontSize: fs.axisLabel,
    },
  };
  const axisValue = {
    type: "value" as const,
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: {
      color: isDark ? "rgba(255,255,255,0.4)" : "#999",
      fontSize: fs.axisLabelSmall,
    },
    splitLine: {
      lineStyle: {
        color: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
        type: "dashed" as const,
      },
    },
  };

  // sprayv2 工业横向模式: 双 Y 轴
  const yAxisConfig = isIndustrial && isHorizontal ? [
    {
      ...axisCategory,
      inverse: true,
      axisLine: { show: false },
      splitLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: "#fff",
        fontSize: fs.axisLabel,
        formatter: (value: string, index: number) => {
          return `{lg|${index + 1}}  {title|${value}}`;
        },
        rich: {
          lg: {
            backgroundColor: "#339911",
            color: "#fff",
            borderRadius: 15,
            align: "center",
            width: Math.max(10, Math.round(15 * scale)),
            height: Math.max(10, Math.round(15 * scale)),
            fontSize: fs.subtitle,
          },
          title: {
            color: "#fff",
            fontSize: fs.axisLabel,
          },
        },
      },
    },
    {
      type: "value" as const,
      inverse: true,
      axisLine: { show: false },
      splitLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        fontSize: fs.axisLabel,
        color: "#fff",
      },
    },
  ] : undefined;

  const baseOption: Record<string, unknown> = {
    grid: isIndustrial && isHorizontal
      ? { top: "0%", left: "25%", right: "25%", bottom: "5%" }
      : { left: "8%", right: "5%", top: showBorder ? "12%" : "15%", bottom: "12%", containLabel: true },
    ...(isIndustrial && isHorizontal
      ? { xAxis: { show: false } }
      : { xAxis: isHorizontal ? axisValue : axisCategory }),
    ...(isIndustrial && isHorizontal
      ? { yAxis: yAxisConfig }
      : { yAxis: isHorizontal ? axisCategory : axisValue }),
    series,
  };

  const option = useEchartOptions(config, baseOption, scale);

  return (
    <Box sx={CHART_BOX_SX}>
      <ReactEChartsCore
        echarts={echarts}
        option={option}
        theme={isDark ? "industrial-dark" : undefined}
        notMerge
        lazyUpdate
        opts={{ devicePixelRatio: dpr }}
        style={{ width: "100%", height: "100%" }}
      />
    </Box>
  );
}
