/**
 * ECharts 统一注册入口 & 主题系统
 * 基于 ECharts 官方 token 体系 + 工业大屏暗色风格
 */
import * as echarts from "echarts/core";

// ── Charts ──
import { BarChart } from "echarts/charts";
import { LineChart } from "echarts/charts";
import { PieChart } from "echarts/charts";
import { ScatterChart } from "echarts/charts";
import { RadarChart } from "echarts/charts";
import { GaugeChart } from "echarts/charts";
import { HeatmapChart } from "echarts/charts";
import { TreemapChart } from "echarts/charts";
import { SunburstChart } from "echarts/charts";
import { BoxplotChart } from "echarts/charts";
import { CandlestickChart } from "echarts/charts";
import { FunnelChart } from "echarts/charts";
import { SankeyChart } from "echarts/charts";
import { GraphChart } from "echarts/charts";
import { TreeChart } from "echarts/charts";
import { ThemeRiverChart } from "echarts/charts";
import { ParallelChart } from "echarts/charts";
import { MapChart } from "echarts/charts";
import { LinesChart } from "echarts/charts";
import { EffectScatterChart } from "echarts/charts";
import { PictorialBarChart } from "echarts/charts";
import { CustomChart } from "echarts/charts";

// ── Components ──
import {
  GridComponent,
  PolarComponent,
  SingleAxisComponent,
  TooltipComponent,
  TitleComponent,
  LegendComponent,
  DataZoomComponent,
  VisualMapComponent,
  GeoComponent,
  ParallelComponent,
  CalendarComponent,
  AriaComponent,
  TransformComponent,
  DatasetComponent,
  ToolboxComponent,
  MarkLineComponent,
  MarkPointComponent,
  MarkAreaComponent,
  BrushComponent,
  TimelineComponent,
} from "echarts/components";

// ── Renderer ──
import { CanvasRenderer } from "echarts/renderers";
import { LabelLayout } from "echarts/features";

echarts.use([
  BarChart, LineChart, PieChart, ScatterChart, RadarChart, GaugeChart,
  HeatmapChart, TreemapChart, SunburstChart, BoxplotChart, CandlestickChart,
  FunnelChart, SankeyChart, GraphChart, TreeChart, ThemeRiverChart,
  ParallelChart, MapChart, LinesChart, EffectScatterChart, PictorialBarChart, CustomChart,
  GridComponent, PolarComponent, SingleAxisComponent, TooltipComponent, TitleComponent, LegendComponent, DataZoomComponent,
  VisualMapComponent, GeoComponent, ParallelComponent, CalendarComponent, AriaComponent,
  TransformComponent, DatasetComponent, ToolboxComponent, MarkLineComponent,
  MarkPointComponent, MarkAreaComponent, BrushComponent, TimelineComponent,
  LabelLayout,
  CanvasRenderer,
]);

export { echarts };

// ═══════════════════════════════════════════════════════════════
// 工业大屏暗色主题 — 基于 ECharts 官方 tokens + sprayv2 实际配色
// ═══════════════════════════════════════════════════════════════

/** 科技色板 */
export const PALETTE = {
  primary: "#00c1de",
  blue: "#1089E7",
  cyan: "#56D0E3",
  orange: "#F8B448",
  purple: "#8B78F6",
  red: "#F57474",
  green: "#73DDFF",
  teal: "#516b91",
  sky: "#59c4e6",
  lavender: "#93b7e3",
  forestGreen: "#228b22",
  safetyOrange: "#ff4500",
  steelBlue: "#48b",
} as const;

export const THEME_COLORS = [
  PALETTE.primary, PALETTE.blue, PALETTE.cyan, PALETTE.orange, PALETTE.purple,
  PALETTE.red, PALETTE.green, PALETTE.teal, PALETTE.sky, PALETTE.lavender,
];

/** 暗色主题注册对象 */
export const INDUSTRIAL_DARK_THEME: Record<string, unknown> = {
  darkMode: true,
  color: THEME_COLORS,
  backgroundColor: "transparent",
  textStyle: { color: "#fff" },

  title: {
    textStyle: { color: "#fff", fontSize: 14, fontWeight: 600 },
    subtextStyle: { color: "rgba(255,255,255,0.45)" },
  },
  legend: {
    textStyle: { color: "rgba(255,255,255,0.7)" },
    pageTextStyle: { color: "rgba(255,255,255,0.5)" },
  },
  tooltip: {
    backgroundColor: "rgba(10,20,40,0.92)",
    borderColor: "rgba(0,193,222,0.35)",
    borderWidth: 1,
    padding: [8, 12],
    textStyle: { color: "#fff", fontSize: 12 },
    extraCssText: "box-shadow: 0 0 12px rgba(0,193,222,0.2);",
  },
  toolbox: {
    iconStyle: { borderColor: "rgba(0,193,222,0.6)" },
  },
  dataZoom: {
    borderColor: "rgba(0,193,222,0.2)",
    textStyle: { color: "rgba(255,255,255,0.5)" },
    handleStyle: { color: "#fff", borderColor: "rgba(0,193,222,0.4)" },
    dataBackground: {
      lineStyle: { color: "rgba(0,193,222,0.4)" },
      areaStyle: { color: "rgba(0,193,222,0.1)" },
    },
    selectedDataBackground: {
      lineStyle: { color: "#00c1de" },
      areaStyle: { color: "rgba(0,193,222,0.2)" },
    },
  },

  // ── 坐标轴通用 ──
  categoryAxis: {
    axisLine: { lineStyle: { color: "rgba(255,255,255,0.12)" } },
    axisTick: { lineStyle: { color: "rgba(255,255,255,0.12)" } },
    axisLabel: { color: "rgba(255,255,255,0.5)" },
    splitLine: { show: false },
  },
  valueAxis: {
    axisLine: { lineStyle: { color: "rgba(255,255,255,0.12)" } },
    axisTick: { lineStyle: { color: "rgba(255,255,255,0.12)" } },
    axisLabel: { color: "rgba(255,255,255,0.5)" },
    splitLine: { lineStyle: { color: "rgba(255,255,255,0.06)", type: "dashed" as const } },
  },

  // ── 图表系列 ──
  line: { symbol: "circle", symbolSize: 6 },
  gauge: {
    title: { color: "rgba(255,255,255,0.6)" },
    axisLine: { lineStyle: { color: [[1, "rgba(255,255,255,0.08)"]] } },
    axisLabel: { color: "rgba(255,255,255,0.5)" },
    detail: { color: "#fff" },
  },
  candlestick: {
    itemStyle: {
      color: "#f64e56", color0: "#54ea92",
      borderColor: "#f64e56", borderColor0: "#54ea92",
    },
  },
  funnel: { itemStyle: { borderColor: "rgba(0,0,0,0.2)" } },
  radar: {
    axisName: { color: "rgba(255,255,255,0.6)" },
    axisLine: { lineStyle: { color: "rgba(255,255,255,0.12)" } },
    splitLine: { lineStyle: { color: "rgba(255,255,255,0.06)" } },
    splitArea: { areaStyle: { color: ["rgba(255,255,255,0.02)", "rgba(255,255,255,0.05)"] } },
  },
  treemap: {
    breadcrumb: { itemStyle: { color: "rgba(255,255,255,0.1)", textStyle: { color: "rgba(255,255,255,0.6)" } } },
  },
  sunburst: { itemStyle: { borderColor: "rgba(0,0,0,0.2)" } },
  map: {
    itemStyle: { borderColor: "rgba(0,193,222,0.3)", areaColor: "rgba(0,193,222,0.06)" },
    label: { color: "rgba(255,255,255,0.6)" },
    emphasis: { itemStyle: { areaColor: "rgba(0,193,222,0.2)" }, label: { color: "#fff" } },
  },
  geo: {
    itemStyle: { borderColor: "rgba(0,193,222,0.3)", areaColor: "rgba(0,193,222,0.06)" },
    emphasis: { itemStyle: { areaColor: "rgba(0,193,222,0.2)" }, label: { color: "#fff" } },
  },
};

/** 注册工业暗色主题 */
echarts.registerTheme("industrial-dark", INDUSTRIAL_DARK_THEME);

// ═══════════════════════════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════════════════════════

/** 生成渐变色（柱状图用） */
export function createBarGradient(
  colorStart: string,
  colorEnd: string,
  orientation: "vertical" | "horizontal" = "vertical",
) {
  return {
    type: "linear" as const,
    x: 0, y: 0,
    x2: orientation === "vertical" ? 0 : 1,
    y2: orientation === "vertical" ? 1 : 0,
    colorStops: [
      { offset: 0, color: colorStart },
      { offset: 1, color: colorEnd },
    ],
  };
}

/** 生成面积图渐变填充 */
export function createAreaGradient(color: string, opacity = 0.25) {
  return {
    type: "linear" as const,
    x: 0, y: 0, x2: 0, y2: 1,
    colorStops: [
      { offset: 0, color: color.replace(")", `,${opacity})`).replace("rgb(", "rgba(") || `${color}${Math.round(opacity * 255).toString(16).padStart(2, "0")}` },
      { offset: 1, color: "rgba(0,0,0,0)" },
    ],
  };
}

/** 发光效果参数 */
export const GLOW = {
  shadowColor: PALETTE.primary,
  shadowBlur: 10,
} as const;

/** 公共容器样式 */
export const CHART_BOX_SX = {
  width: "100%",
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "rgba(0,0,0,0.15)",
  borderRadius: 1,
  overflow: "hidden",
} as const;

// ═══════════════════════════════════════════════════════════════
// 响应式字体缩放 — 基于画布尺寸动态调整字号
// ═══════════════════════════════════════════════════════════════

/**
 * 基准画布尺寸：400×300px 时字体大小刚好合适
 *
 * 缩放策略：
 * - 线性比例 scale = minDim / refDim
 * - 大屏用 0.75 次幂缓和，避免 4K/8K 下字号爆炸
 * - 最终 clamp 在 [0.5, 8.0]
 *
 * 效果：
 *   400×300   → scale 1.00  → 14号字=14px
 *   1920×1080 → scale 2.68  → 14号字=38px
 *   3840×2160 → scale 4.69  → 14号字=66px
 *   7680×4320 → scale 7.57  → 14号字=106px
 */
const REF_WIDTH = 400;
const REF_HEIGHT = 300;
const MIN_SCALE = 0.5;
const MAX_SCALE = 8.0;
const POWER_CURVE = 0.75;

/**
 * 计算字体缩放因子
 * - 以画布短边为基准（取宽高最小值）
 * - 小于基准 → 缩小（最小 0.5x）
 * - 大于基准 → 放大，用幂曲线缓和（最大 8.0x）
 */
export function calcFontScale(width?: number, height?: number): number {
  if (!width || !height || width <= 0 || height <= 0) return 1;
  const minDim = Math.min(width, height);
  const refDim = Math.min(REF_WIDTH, REF_HEIGHT);
  const linear = minDim / refDim;
  // 幂曲线：小尺寸接近线性，大尺寸自然减速
  const curved = Math.pow(linear, POWER_CURVE);
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, curved));
}

/** 缩放字号 — 最小字号随 scale 动态调整 */
export function scaleFont(baseFontSize: number, scale: number): number {
  const minSize = Math.max(8, Math.round(6 * scale));
  return Math.max(minSize, Math.round(baseFontSize * scale));
}

/**
 * 一站式字体缩放映射 — 返回图表各位置的缩放后字号
 *
 * 用法:
 *   const fs = chartFontSizes(scale);
 *   // fs.title, fs.legend, fs.axisLabel, fs.detail, fs.label, fs.tooltip
 */
export function chartFontSizes(scale: number) {
  return {
    /** 图表标题 */
    title: scaleFont(14, scale),
    /** 图例文字 */
    legend: scaleFont(11, scale),
    /** 坐标轴标签 */
    axisLabel: scaleFont(11, scale),
    /** 坐标轴小标签 */
    axisLabelSmall: scaleFont(10, scale),
    /** 数据标签（series.label） */
    label: scaleFont(11, scale),
    /** 仪表盘名称（gauge.title） */
    gaugeTitle: scaleFont(10, scale),
    /** 仪表盘数值（gauge.detail） */
    gaugeDetail: scaleFont(14, scale),
    /** 提示框 */
    tooltip: scaleFont(12, scale),
    /** 副标题/辅助信息 */
    subtitle: scaleFont(10, scale),
    /** 大号数字（指标卡） */
    bigNumber: scaleFont(20, scale),
  };
}

export type ChartFontSizes = ReturnType<typeof chartFontSizes>;

// ═══════════════════════════════════════════════════════════════
// 高清渲染 — devicePixelRatio 动态计算
// ═══════════════════════════════════════════════════════════════

/**
 * 计算最佳 Canvas 像素比，解决 4K/8K 下文字模糊问题
 *
 * 策略：
 * - 基准取浏览器 window.devicePixelRatio（Retina 屏通常 2）
 * - 大画布（短边 > 2000px）保底 2x，确保文字线条锐利
 * - 超大画布（短边 > 4000px / 8K）保底 3x，文字笔画需要更多像素才能清晰
 * - 上限 clamp 4，防止内存占用过高
 *
 * 效果：
 *   1920×1080 普通 → 1x 或 2x（取决于系统 DPI）
 *   3840×2160 4K   → 至少 2x → Canvas 实际 7680×4320 像素
 *   7680×4320 8K   → 至少 3x → Canvas 实际 23040×12960 像素
 */
const MAX_DEVICE_PIXEL_RATIO = 4;

export function calcDevicePixelRatio(width?: number, height?: number): number {
  const base = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
  let ratio = base;

  if (width && height) {
    const minDim = Math.min(width, height);
    if (minDim > 4000) {
      // 8K 级画布：文字笔画需要 3x 才能保持锐利
      ratio = Math.max(ratio, 3);
    } else if (minDim > 2000) {
      // 4K 级画布：2x 足够
      ratio = Math.max(ratio, 2);
    }
  }

  return Math.min(ratio, MAX_DEVICE_PIXEL_RATIO);
}
