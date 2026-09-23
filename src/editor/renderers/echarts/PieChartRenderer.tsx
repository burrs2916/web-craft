import Box from "@mui/material/Box";
import ReactEChartsCore from "echarts-for-react/lib/core";
import { echarts, CHART_BOX_SX, calcFontScale, chartFontSizes, calcDevicePixelRatio } from "./echartsCore";
import { useEchartOptions } from "./useEchartOptions";
import type { ComponentRendererProps } from "../../../types/editor";
import { useChartData } from "./useChartData";

/**
 * 饼图 — 对标 sprayv2 工业风格 + 响应式字体
 *
 * sprayv2 饼图特征：
 * - radius '55%', center ['50%', '60%']
 * - selectedMode 'single'
 * - label: show true, formatter '{b} : {c} \n ({d}%)'
 * - labelLine: show true
 * - 无 roseType
 * - 设备数量分析（分控器/采集器）+ 在线状态（在线/离线）
 */
export function PieChartRenderer({ config, width, height }: ComponentRendererProps) {
  config = useChartData(config);
  const isDark = (config.theme as string) !== "light";
  const data = (config.data as { name: string; value: number }[]) || [
    { name: "A", value: 1048 },
    { name: "B", value: 735 },
    { name: "C", value: 580 },
    { name: "D", value: 484 },
    { name: "E", value: 300 },
  ];
  // 玫瑰图判据必须与发布端逐字一致（`codegen/components/echarts.ts:301`）：
  // 只有 `"radius"` / `"area"` 才算玫瑰图，其余一律普通饼图。
  // 此前写成 `config.roseType || false` —— 历史脏值字符串 `"false"` 是真值 →
  // 画布走 ECharts 的 `r: roseType ? linearMap(...) : r`（`pieLayout.js:150`）画成玫瑰图，
  // 而发布端判否输出普通饼图，**同一份配置两端相反**。
  const roseType: string | false =
    config.roseType === "radius" || config.roseType === "area" ? config.roseType : false;
  const radius = (config.radius as [string, string]) || (roseType ? ["20%", "65%"] : ["0%", "55%"]);
  const center = (config.center as [string, string]) || ["50%", "60%"];
  const showLabel = (config.showLabel as boolean) ?? true;
  const labelPosition = (config.labelPosition as string) || "outside";
  const borderRadius = (config.borderRadius as number) ?? 6;
  const borderWidth = (config.borderWidth as number) ?? 2;
  const style = (config.pieStyle as string) ?? "default"; // default | industrial

  // 响应式字体缩放
  const scale = calcFontScale(width, height);
  const fs = chartFontSizes(scale);
  const dpr = calcDevicePixelRatio(width, height);

  const isIndustrial = style === "industrial";

  // sprayv2 工业色板
  const industrialColors = ["#1089E7", "#F57474", "#56D0E3", "#F8B448", "#8B78F6", "#73DDFF", "#516b91"];

  const baseOption: Record<string, unknown> = {
    legend: {
      bottom: 0,
      textStyle: { color: isDark ? "rgba(255,255,255,0.7)" : "#666", fontSize: fs.legend },
      itemWidth: Math.max(8, Math.round(10 * scale)),
      itemHeight: Math.max(8, Math.round(10 * scale)),
      itemGap: Math.max(6, Math.round(12 * scale)),
    },
    series: [{
      type: "pie",
      radius: isIndustrial ? "55%" : radius,
      center: isIndustrial ? ["50%", "60%"] : center,
      roseType: roseType || undefined,
      selectedMode: isIndustrial ? "single" : undefined,
      itemStyle: {
        borderRadius,
        borderColor: isDark ? "rgba(0,0,0,0.4)" : "#fff",
        borderWidth,
        ...(isDark ? {
          shadowColor: "rgba(0,193,222,0.2)",
          shadowBlur: 10,
        } : {
          shadowColor: "rgba(0,0,0,0.1)",
          shadowBlur: 4,
        }),
      },
      label: {
        show: showLabel,
        position: labelPosition,
        color: isDark ? "rgba(255,255,255,0.8)" : "#333",
        fontSize: fs.label,
        // sprayv2 格式: 名称 : 数量 (百分比%)
        formatter: isIndustrial ? "{b} : {c}\n({d}%)" : (roseType ? "{b}: {d}%" : "{b}\n{d}%"),
      },
      labelLine: {
        show: showLabel,
        length: Math.max(8, Math.round(12 * scale)),
        length2: Math.max(10, Math.round(16 * scale)),
        lineStyle: {
          color: isDark ? "rgba(255,255,255,0.2)" : "#ccc",
          width: 1,
        },
      },
      emphasis: {
        label: { show: true, fontSize: Math.max(10, Math.round(14 * scale)), fontWeight: "bold" },
        itemStyle: {
          shadowBlur: 20,
          shadowColor: "rgba(0,193,222,0.4)",
        },
        scaleSize: 8,
      },
      animationType: "scale",
      animationEasing: "elasticOut",
      data: data.map((d, i) => ({
        ...d,
        itemStyle: { color: industrialColors[i % industrialColors.length] },
      })),
    }],
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
