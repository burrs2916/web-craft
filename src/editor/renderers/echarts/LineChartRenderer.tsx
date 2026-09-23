import Box from "@mui/material/Box";
import ReactEChartsCore from "echarts-for-react/lib/core";
import { useRef, useEffect, useCallback, useState } from "react";
import { echarts, CHART_BOX_SX, calcFontScale } from "./echartsCore";
import type { ComponentRendererProps } from "../../../types/editor";
import type { LineChartConfig } from "./LineChartConfig";
import { buildLineChartOption } from "./LineChartConfigBuilder";
import { useDataSourceStore } from "../../../store/datasourceStore";
import { databaseApi } from "../../../services/tauri";
import { useChartData } from "./useChartData";

/**
 * 将 props.config 转换为 LineChartConfig
 */
function convertPropsToConfig(config: Record<string, unknown>): LineChartConfig {
  return {
    data: {
      datasetSource: config.datasetSource as (string | number)[][] | undefined,
      datasetTransform: config.datasetTransform as Array<{ type: string; config: Record<string, unknown> }> | undefined,
      seriesData: config.seriesData as (number | [string, number])[][] | undefined,
      xAxisData: config.xAxisData as string[] | undefined,
      seriesNames: config.seriesNames as string[] | undefined,
    },
    axis: {
      xAxisType: config.xAxisType as "category" | "value" | "time" | "log" | undefined,
      yAxisType: config.yAxisType as "value" | "log" | "category" | undefined,
      xAxisName: config.xAxisName as string | undefined,
      yAxisName: config.yAxisName as string | undefined,
      yAxisMin: config.yAxisMin as number | undefined,
      yAxisMax: config.yAxisMax as number | undefined,
      xAxisFormat: config.xAxisFormat as string | undefined,
      yAxisFormat: config.yAxisFormat as string | undefined,
      xAxisLabelRotate: config.xAxisLabelRotate as number | undefined,
      secondYAxis: config.secondYAxisType ? {
        type: config.secondYAxisType as "value" | "log",
        name: config.secondYAxisName as string | undefined,
        position: config.secondYAxisPosition as "left" | "right" | undefined,
      } : undefined,
      xAxisBreaks: config.xAxisBreaks as Array<{ start: number; end: number; gap?: number }> | undefined,
      yAxisBreaks: config.yAxisBreaks as Array<{ start: number; end: number; gap?: number }> | undefined,
      yAxisCategoryData: config.yAxisCategoryData as string[] | undefined,
    },
    seriesStyle: {
      smooth: config.smooth as boolean | undefined,
      symbol: (config.showSymbol === false ? "none" : config.symbolType) as "none" | "circle" | "rect" | "triangle" | "diamond" | "pin" | "arrow" | undefined,
      symbolSize: config.symbolSize as number | undefined,
      lineStyle: {
        width: config.lineWidth as number | undefined,
        type: config.lineType as "solid" | "dashed" | "dotted" | undefined,
        color: config.lineColor as string | undefined,
      },
      areaStyle: config.areaStyle as boolean | undefined,
      stack: config.stack as string | undefined,
      step: config.step as "start" | "middle" | "end" | undefined,
      connectNulls: config.connectNulls as boolean | undefined,
      showEndLabel: config.showEndLabel as boolean | undefined,
    },
    coordinate: {
      polarEnable: config.polarEnable as boolean | undefined,
      polarRadius: config.polarRadius as [string | number, string | number] | undefined,
      sparklineGrids: config.sparklineGrids as Array<{ left: string; top: string; width: string; height: string }> | undefined,
    },
    auxiliary: {
      title: config.title as string | undefined,
      showLegend: config.showLegend as boolean | undefined,
      legendPosition: config.legendPosition as "top" | "bottom" | "left" | "right" | undefined,
      showTooltip: config.showTooltip as boolean | undefined,
      tooltipTrigger: config.tooltipTrigger as "axis" | "item" | undefined,
      showDataZoom: config.showDataZoom as boolean | undefined,
      dataZoomType: config.dataZoomType as "slider" | "inside" | undefined,
      animation: config.animation as boolean | undefined,
      visualMapPieces: config.visualMapPieces as Array<{ lte?: number; gt?: number; color: string }> | undefined,
      markLines: config.markLines as Array<{ name?: string; yAxis?: number; xAxis?: string; type?: "min" | "max" | "average" }> | undefined,
      markPoints: config.markPoints as Array<{ name?: string; coord?: [number, number]; type?: "min" | "max" | "average" }> | undefined,
      confidenceBand: config.confidenceBand as { upperData: number[]; lowerData: number[]; color?: string } | undefined,
    },
    presetType: config.presetType as string | undefined,
  };
}

/**
 * 从嵌套对象中按路径取值
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(/[.[\]]/).filter(Boolean);
  let current: unknown = obj;
  for (const part of parts) {
    if (current && typeof current === "object") {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

/**
 * 折线图渲染器 — 使用新架构（3种模式分离）
 * 支持3种数据模式：static（静态）、batch（批量拉取）、stream（实时流式）
 */
export function LineChartRenderer({ config, width, height }: ComponentRendererProps) {
  config = useChartData(config);
  const isDark = (config.theme as string) !== "light";
  const scale = calcFontScale(width, height);

  const dataMode = (config.dataMode as string) ?? "static";
  const liveData = config.data as Record<string, unknown> | undefined;
  const dataField = config.dataField as string | undefined;
  const windowSize = (config.windowSize as number) ?? 100;

  // 数据库查询相关配置
  const dataSourceId = config.dataSourceId as string | undefined;
  const dbTable = config.dbTable as string | undefined;
  const dbColumn = config.dbColumn as string | undefined;
  const dbTimeColumn = config.dbTimeColumn as string | undefined;
  const dbLimit = (config.dbLimit as number) ?? 100;

  // 流式模式：用 ref 维护滑动窗口 buffer
  const bufferRef = useRef<{ times: string[]; values: number[] }>({ times: [], values: [] });

  // 数据库批量查询结果
  const [dbQueryResult, setDbQueryResult] = useState<{ times: string[]; values: number[] } | null>(null);

  // 获取数据源连接配置
  const dataSources = useDataSourceStore((s) => s.dataSources);
  const ds = dataSources.find((d) => d.id === dataSourceId);
  const dbConfig = ds?.connection?.database;

  // 批量拉取模式：自动执行 SQL 查询
  useEffect(() => {
    if (dataMode !== "batch" || !dbConfig || !dbTable || !dbColumn) {
      setDbQueryResult(null);
      return;
    }

    let cancelled = false;

    // 构建 SQL 查询
    const timeCol = dbTimeColumn || dbColumn;
    const sql = `SELECT \`${timeCol}\`, \`${dbColumn}\` FROM \`${dbTable}\` ORDER BY \`${timeCol}\` DESC LIMIT ${dbLimit}`;
    console.log('[LineChartRenderer] 批量查询 SQL:', sql);

    databaseApi.executeQuery(dbConfig, sql)
      .then((result) => {
        if (cancelled) return;
        console.log('[LineChartRenderer] 查询结果:', result.success, 'rows:', result.rows?.length ?? 0);
        if (!result.success || !result.rows || result.rows.length === 0) return;
        // 反转（DESC → ASC，最旧在前）
        const rows = [...result.rows].reverse();
        const times = rows.map((row) => {
          const v = row[timeCol];
          return v !== null && v !== undefined ? String(v) : "";
        });
        const values = rows.map((row) => {
          const v = row[dbColumn];
          return typeof v === "number" ? v : parseFloat(String(v)) || 0;
        });
        console.log('[LineChartRenderer] 解析数据:', times.length, '条, 首条:', { time: times[0], value: values[0] });
        if (!cancelled) setDbQueryResult({ times, values });
      })
      .catch((err) => {
        console.warn("[LineChartRenderer] 数据库查询失败:", err);
        if (!cancelled) setDbQueryResult(null);
      });

    return () => { cancelled = true; };
  }, [dataMode, dbConfig?.dbType, dbConfig?.host, dbConfig?.port, dbConfig?.database, dbTable, dbColumn, dbTimeColumn, dbLimit]);

  // 转换配置
  const rawConfig = { ...config as Record<string, unknown> };

  if (dataMode === "batch" && dbQueryResult) {
    // ─── 批量拉取模式：使用数据库查询结果 ───
    if (dbTimeColumn) {
      // 时间轴模式：seriesData 用 [[time, value], ...] 格式，xAxis 不设 data
      rawConfig.seriesData = [dbQueryResult.times.map((t, i) => [t, dbQueryResult.values[i]])];
      rawConfig.xAxisType = "time";
      rawConfig.xAxisData = undefined;
    } else {
      // 类目轴模式：seriesData 用 [value, ...]，xAxisData 用类目
      rawConfig.seriesData = [dbQueryResult.values];
      rawConfig.xAxisData = dbQueryResult.times;
      rawConfig.xAxisType = "category";
    }
  } else if (dataMode === "batch" && liveData && dataField) {
    // ─── 批量拉取模式（非数据库）：从 dataCache 取数组数据 ───
    const fieldValue = getNestedValue(liveData, dataField);
    if (Array.isArray(fieldValue)) {
      rawConfig.seriesData = [fieldValue as number[]];
      rawConfig.xAxisData = Array.from({ length: fieldValue.length }, (_, i) => `${i + 1}`);
      if (fieldValue.length > 0 && typeof fieldValue[0] === "object" && fieldValue[0] !== null) {
        const values = (fieldValue as Array<Record<string, unknown>>).map(item => {
          const v = item.value ?? item.v ?? Object.values(item)[0];
          return typeof v === "number" ? v : 0;
        });
        const times = (fieldValue as Array<Record<string, unknown>>).map((item, i) =>
          (item.time ?? item.timestamp ?? item.t ?? `${i + 1}`) as string
        );
        rawConfig.seriesData = [values];
        rawConfig.xAxisData = times;
      }
    }
  } else if (dataMode === "stream" && liveData && dataField) {
    // ─── 实时流式模式：累积单点到滑动窗口 ───
    const fieldValue = getNestedValue(liveData, dataField);
    const now = new Date();
    const timeLabel = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;

    if (typeof fieldValue === "number") {
      const buffer = bufferRef.current;
      buffer.values.push(fieldValue);
      buffer.times.push(timeLabel);
      while (buffer.values.length > windowSize) {
        buffer.values.shift();
        buffer.times.shift();
      }
      rawConfig.seriesData = [[...buffer.values]];
      rawConfig.xAxisData = [...buffer.times];
    } else if (Array.isArray(fieldValue)) {
      rawConfig.seriesData = [fieldValue as number[]];
      rawConfig.xAxisData = Array.from({ length: fieldValue.length }, (_, i) => `${i + 1}`);
    }
  }

  // 转换配置
  const chartConfig = convertPropsToConfig(rawConfig);
  
  // 生成 ECharts option
  const option = buildLineChartOption(chartConfig, isDark, scale);
  
  // 点击添加拐点（特殊预设）
  const chartRef = useRef<ReactEChartsCore>(null);
  const handleClickAddPoints = useCallback((params: Record<string, unknown>) => {
    if (chartConfig.presetType !== "clickAddPoints") return;
    const chartInstance = chartRef.current?.getEchartsInstance();
    if (!chartInstance) return;
    
    // 动态添加数据点
    const option = chartInstance.getOption() as Record<string, unknown>;
    const series = option.series as Array<Record<string, unknown>>;
    if (series && series[0]?.data && params.dataIndex !== undefined) {
      const data = series[0].data as unknown[];
      const newData = [...data, { value: params.value, symbol: "circle", symbolSize: 10 }];
      chartInstance.setOption({ series: [{ data: newData }] });
    }
  }, [chartConfig.presetType]);
  
  useEffect(() => {
    if (chartConfig.presetType === "clickAddPoints") {
      const chartInstance = chartRef.current?.getEchartsInstance();
      if (chartInstance) {
        chartInstance.on("click", handleClickAddPoints);
      }
    }
  }, [chartConfig.presetType, handleClickAddPoints]);
  
  return (
    <Box sx={CHART_BOX_SX}>
      <ReactEChartsCore
        ref={chartRef}
        echarts={echarts}
        option={option}
        style={{ width: "100%", height: "100%" }}
        notMerge={true}
        lazyUpdate={true}
      />
    </Box>
  );
}