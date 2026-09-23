/**
 * 折线图配置生成函数
 * 根据 LineChartConfig 生成 ECharts option，3种模式独立处理
 */

import type { EChartsOption } from "echarts";
import type { LineChartConfig } from "./LineChartConfig";

// ─── 工具函数 ───────────────────────────────────────────────────────────────

/** 判断模式优先级 */
export function detectMode(config: LineChartConfig): "polar" | "sparkline" | "normal" {
  if (config.coordinate.polarEnable) return "polar";
  if (config.coordinate.sparklineGrids?.length) return "sparkline";
  return "normal";
}

/** Dataset 数据自动推断系列 */
export function inferSeriesFromDataset(source: (string | number)[][], seriesStyle: LineChartConfig["seriesStyle"]) {
  const firstRow = source[0];
  const isHeader = Array.isArray(firstRow) && firstRow.every(c => typeof c === "string");
  const headers = isHeader ? firstRow as string[] : [];
  const dataRows = isHeader ? source.slice(1) : source;
  
  // 找出数值列索引
  const numericColIndices: number[] = [];
  for (let col = 1; col < headers.length; col++) {
    const allNumeric = dataRows.length > 0 && dataRows.every(row =>
      typeof (row as unknown[])[col] === "number"
    );
    if (allNumeric) numericColIndices.push(col);
  }
  
  // 生成系列配置
  return numericColIndices.map(col => ({
    name: headers[col] || `系列${col}`,
    type: "line",
    datasetIndex: 0,
    seriesLayoutBy: "column",
    encode: { x: 0, y: col },
    smooth: seriesStyle.smooth ?? false,
    symbol: seriesStyle.symbol ?? "circle",
    symbolSize: seriesStyle.symbolSize ?? 6,
    lineStyle: seriesStyle.lineStyle ?? { width: 2 },
    areaStyle: seriesStyle.areaStyle ?? false,
    stack: seriesStyle.stack,
    step: seriesStyle.step,
  }));
}

// ─── Normal 模式配置生成 ───────────────────────────────────────────────────────

export function buildNormalModeConfig(
  config: LineChartConfig,
  isDark: boolean,
  scale: number
): EChartsOption {
  const { data, axis, seriesStyle, auxiliary } = config;
  
  // 轴样式配置（工业主题）
  const axisLineStyle = { color: isDark ? "#4a5568" : "#cbd5e0", width: 1 };
  const splitLineStyle = { color: isDark ? "#2d3748" : "#e2e8f0", type: "dashed" as const };
  const axisLabelStyle = {
    color: isDark ? "#a0aec0" : "#4a5568",
    fontSize: Math.round(12 * scale),
  };
  
  // ─── Dataset 模式 ────────────────────────────────────────
  if (data.datasetSource) {
    return {
      dataset: {
        source: data.datasetSource,
        transform: data.datasetTransform,
      },
      grid: {
        left: Math.round(30 * scale),
        right: Math.round(10 * scale),
        top: Math.round(45 * scale),
        bottom: auxiliary?.showDataZoom ? "22%" : Math.round(25 * scale),
        borderWidth: 1,
        borderColor: isDark ? "#2d3748" : "#e2e8f0",
      },
      xAxis: [{
        type: "category" as const,
        boundaryGap: false,
        axisLine: { lineStyle: axisLineStyle },
        axisTick: { show: false },
        axisLabel: axisLabelStyle,
      }],
      yAxis: [{
        type: "value" as const,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { ...axisLabelStyle, fontSize: Math.round(10 * scale) },
        splitLine: { lineStyle: splitLineStyle },
      }],
      series: inferSeriesFromDataset(data.datasetSource, seriesStyle) as unknown as EChartsOption["series"],
      ...(auxiliary?.showTooltip ? { tooltip: { trigger: "axis" } } : {}),
      ...(auxiliary?.showLegend ? { legend: { show: true } } : {}),
      ...(auxiliary?.showDataZoom ? {
        dataZoom: [{ type: auxiliary.dataZoomType ?? "slider", xAxisIndex: 0 }],
      } : {}),
    };
  }
  
  // ─── 直接数据模式 ────────────────────────────────────────
  const xAxisType = axis?.xAxisType ?? "category";
  const yAxisType = axis?.yAxisType ?? "value";
  
  return {
    grid: {
      left: Math.round(30 * scale),
      right: Math.round(10 * scale),
      top: Math.round(45 * scale),
      bottom: auxiliary?.showDataZoom ? "22%" : Math.round(25 * scale),
      borderWidth: 1,
      borderColor: isDark ? "#2d3748" : "#e2e8f0",
    },
    xAxis: [{
      type: xAxisType as "category" | "value" | "time" | "log",
      // time 和 value 类型不需要 data 属性（由 series 的二维数据驱动）
      ...(xAxisType === "category" ? { data: data.xAxisData } : {}),
      name: axis?.xAxisName,
      nameLocation: "middle" as const,
      nameGap: 30,
      nameTextStyle: { color: isDark ? "#a0aec0" : "#4a5568", fontSize: Math.round(11 * scale) },
      ...(xAxisType === "time" && axis?.xAxisFormat ? { axisLabel: { formatter: axis.xAxisFormat } } : {}),
      ...(axis?.xAxisLabelRotate ? { axisLabel: { ...axisLabelStyle, rotate: axis.xAxisLabelRotate } } : {}),
      ...(axis?.xAxisBreaks?.length && (xAxisType === "value" || xAxisType === "time") ? {
        breaks: axis.xAxisBreaks,
        breakArea: { show: true },
      } : {}),
      boundaryGap: false,
      axisLine: { lineStyle: axisLineStyle },
      axisTick: { show: false },
      axisLabel: axisLabelStyle,
    }] as unknown as EChartsOption["xAxis"],
    yAxis: (axis?.secondYAxis ? [
      {
        type: yAxisType as "value" | "log" | "category",
        position: "left" as const,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { ...axisLabelStyle, fontSize: Math.round(10 * scale) },
        splitLine: { lineStyle: splitLineStyle },
      },
      {
        type: axis.secondYAxis.type as "value" | "log",
        name: axis.secondYAxis.name,
        position: axis.secondYAxis.position ?? "right" as const,
        axisLine: { show: true, lineStyle: axisLineStyle },
        axisTick: { show: false },
        axisLabel: { ...axisLabelStyle, fontSize: Math.round(10 * scale) },
        splitLine: { show: false },
      },
    ] : [{
      type: yAxisType as "value" | "log" | "category",
      data: yAxisType === "category" ? axis?.yAxisCategoryData ?? data.xAxisData : undefined,
      name: axis?.yAxisName,
      nameLocation: "middle" as const,
      nameGap: 40,
      nameTextStyle: { color: isDark ? "#a0aec0" : "#4a5568", fontSize: Math.round(11 * scale) },
      min: axis?.yAxisMin,
      max: axis?.yAxisMax,
      ...(axis?.yAxisFormat ? { axisLabel: { formatter: axis.yAxisFormat } } : {}),
      inverse: yAxisType === "category",
      ...(axis?.yAxisBreaks?.length && (yAxisType === "value" || yAxisType === "log") ? {
        breaks: axis.yAxisBreaks,
        breakArea: { show: true },
      } : {}),
      axisLine: { show: yAxisType === "category" },
      axisTick: { show: yAxisType === "category" },
      axisLabel: { ...axisLabelStyle, fontSize: Math.round(10 * scale) },
      splitLine: { show: yAxisType !== "category", lineStyle: splitLineStyle },
    }]) as unknown as EChartsOption["yAxis"],
    series: (data.seriesData ?? []).map((seriesData, i) => ({
      name: data.seriesNames?.[i] ?? `系列${i + 1}`,
      type: "line" as const,
      data: seriesData,
      smooth: seriesStyle.smooth ?? false,
      symbol: seriesStyle.symbol ?? "circle",
      symbolSize: seriesStyle.symbolSize ?? 6,
      lineStyle: seriesStyle.lineStyle ?? { width: 2 },
      areaStyle: seriesStyle.areaStyle ?? false,
      stack: seriesStyle.stack,
      step: seriesStyle.step,
      connectNulls: seriesStyle.connectNulls ?? false,
      ...(seriesStyle.showEndLabel ? {
        endLabel: {
          show: true,
          formatter: "{a}",
          color: isDark ? "#fff" : "#333",
          fontSize: Math.round(11 * scale),
        },
      } : {}),
      xAxisIndex: 0,
      yAxisIndex: axis?.secondYAxis ? (i === 0 ? 0 : 1) : 0,
      // markLines 只加到第一个 series
      ...(i === 0 && auxiliary?.markLines?.length ? {
        markLine: {
          data: auxiliary.markLines.map(m => ({
            name: m.name,
            yAxis: m.yAxis,
            xAxis: m.xAxis,
            type: m.type,
          })),
        },
      } : {}),
    })) as unknown as EChartsOption["series"],
    ...(auxiliary?.showTooltip ? {
      tooltip: {
        trigger: auxiliary.tooltipTrigger ?? "axis",
        backgroundColor: isDark ? "rgba(10,20,40,0.92)" : "rgba(255,255,255,0.95)",
        borderColor: isDark ? "rgba(0,193,222,0.35)" : "#e2e8f0",
        textStyle: { color: isDark ? "#fff" : "#333", fontSize: Math.round(12 * scale) },
      },
    } : {}),
    ...(auxiliary?.showLegend ? {
      legend: {
        show: true,
        data: data.seriesNames,
        [auxiliary.legendPosition ?? "top"]: 0,
        textStyle: { color: isDark ? "rgba(255,255,255,0.7)" : "#4a5568", fontSize: Math.round(11 * scale) },
      },
    } : {}),
    ...(auxiliary?.showDataZoom ? {
      dataZoom: [{ type: auxiliary.dataZoomType ?? "slider", xAxisIndex: 0 }],
    } : {}),
    ...(auxiliary?.animation === false ? { animation: false } : {}),
    ...(auxiliary?.visualMapPieces ? {
      visualMap: {
        show: false,
        pieces: auxiliary.visualMapPieces,
        seriesIndex: 0,
      },
    } : {}),
  };
}

// ─── Polar 模式配置生成 ───────────────────────────────────────────────────────

export function buildPolarModeConfig(
  config: LineChartConfig,
  isDark: boolean,
  scale: number
): EChartsOption {
  const { data, seriesStyle, coordinate, auxiliary } = config;
  
  const axisLineStyle = { color: isDark ? "#4a5568" : "#cbd5e0", width: 1 };
  const splitLineStyle = { color: isDark ? "#2d3748" : "#e2e8f0", type: "dashed" as const };
  const axisLabelStyle = {
    color: isDark ? "#a0aec0" : "#4a5568",
    fontSize: Math.round(12 * scale),
  };
  
  return {
    polar: {
      center: ["50%", "50%"],
      radius: coordinate.polarRadius ?? ["0%", "75%"],
    },
    angleAxis: {
      type: "value" as const,
      startAngle: 0,
      splitLine: { lineStyle: splitLineStyle },
      axisLine: { lineStyle: axisLineStyle },
      axisLabel: axisLabelStyle,
    },
    radiusAxis: {
      type: "value" as const,
      splitLine: { lineStyle: splitLineStyle },
      axisLine: { lineStyle: axisLineStyle },
      axisLabel: axisLabelStyle,
    },
    series: (data.seriesData ?? []).map((seriesData, i) => ({
      name: data.seriesNames?.[i] ?? `系列${i + 1}`,
      type: "line" as const,
      coordinateSystem: "polar" as const,
      data: seriesData as (number | [number, number])[],
      smooth: seriesStyle.smooth ?? false,
      symbol: seriesStyle.symbol ?? "circle",
      symbolSize: seriesStyle.symbolSize ?? 6,
      lineStyle: seriesStyle.lineStyle ?? { width: 2 },
      areaStyle: seriesStyle.areaStyle ?? false,
      stack: seriesStyle.stack,
      step: seriesStyle.step,
    })) as unknown as EChartsOption["series"],
    ...(auxiliary?.showTooltip ? { tooltip: { trigger: "axis" } } : {}),
    ...(auxiliary?.showLegend ? { legend: { show: true, data: data.seriesNames } } : {}),
  };
}

// ─── Sparkline 模式配置生成 ───────────────────────────────────────────────────────

export function buildSparklineModeConfig(
  config: LineChartConfig
): EChartsOption {
  const { data, seriesStyle, coordinate } = config;
  
  const grids = coordinate.sparklineGrids ?? [];
  const seriesData = data.seriesData ?? [];
  
  return {
    grid: grids.map(g => ({
      left: g.left,
      top: g.top,
      width: g.width,
      height: g.height,
      borderWidth: 0,
      containLabel: false,
    })),
    xAxis: grids.map(() => ({
      type: "category" as const,
      show: false,
      data: data.xAxisData,
    })),
    yAxis: grids.map(() => ({
      type: "value" as const,
      show: false,
    })),
    series: seriesData.map((seriesData, i) => ({
      name: data.seriesNames?.[i] ?? `系列${i + 1}`,
      type: "line" as const,
      data: seriesData as number[],
      smooth: seriesStyle.smooth ?? false,
      symbol: "none" as const,
      lineStyle: seriesStyle.lineStyle ?? { width: 1 },
      areaStyle: seriesStyle.areaStyle ?? false,
      xAxisIndex: i,
      yAxisIndex: i,
    })) as unknown as EChartsOption["series"],
  };
}

// ─── 主配置生成函数 ───────────────────────────────────────────────────────────────

export function buildLineChartOption(
  config: LineChartConfig,
  isDark: boolean,
  scale: number
): EChartsOption {
  const mode = detectMode(config);
  
  switch (mode) {
    case "polar":
      return buildPolarModeConfig(config, isDark, scale);
    case "sparkline":
      return buildSparklineModeConfig(config);
    case "normal":
      return buildNormalModeConfig(config, isDark, scale);
  }
}