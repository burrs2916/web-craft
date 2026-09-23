/**
 * 折线图配置项抽象
 * 将所有折线图类型（基础、堆叠、极坐标、迷你图等）的共性属性提取为统一配置接口
 */

// ─── 数据配置 ───────────────────────────────────────────────────
export interface DataConfig {
  /** Dataset 数据源（优先使用，自动推断系列） */
  datasetSource?: (string | number)[][];
  /** Dataset 变换配置 */
  datasetTransform?: Array<{ type: string; config: Record<string, unknown> }>;
  /** 直接系列数据（无 dataset 时使用） */
  seriesData?: (number | [string, number] | Record<string, unknown>)[][];
  /** X 轴类目数据（类目轴模式） */
  xAxisData?: string[];
  /** 系列名称 */
  seriesNames?: string[];
}

// ─── 轴配置（笛卡尔坐标系） ───────────────────────────────────────────────
export interface AxisConfig {
  /** X 轴类型 */
  xAxisType?: "category" | "value" | "time" | "log";
  /** Y 轴类型 */
  yAxisType?: "value" | "log" | "category";
  /** X 轴标题 */
  xAxisName?: string;
  /** Y 轴标题 */
  yAxisName?: string;
  /** Y 轴最小值 */
  yAxisMin?: number;
  /** Y 轴最大值 */
  yAxisMax?: number;
  /** 时间轴格式化 */
  xAxisFormat?: string;
  /** Y 轴格式化 */
  yAxisFormat?: string;
  /** X 轴标签旋转角度 */
  xAxisLabelRotate?: number;
  /** 第二 Y 轴配置 */
  secondYAxis?: {
    type: "value" | "log";
    name?: string;
    position?: "left" | "right";
  };
  /** X 轴断轴配置 */
  xAxisBreaks?: Array<{ start: number; end: number; gap?: number }>;
  /** Y 轴断轴配置 */
  yAxisBreaks?: Array<{ start: number; end: number; gap?: number }>;
  /** Y 轴类目数据（Y轴为类目轴时） */
  yAxisCategoryData?: string[];
}

// ─── 系列样式配置（所有模式通用） ─────────────────────────────────────────────
export interface SeriesStyleConfig {
  /** 平滑曲线 */
  smooth?: boolean;
  /** 标记点配置 */
  symbol?: "none" | "circle" | "rect" | "triangle" | "diamond" | "pin" | "arrow";
  symbolSize?: number;
  /** 线条样式 */
  lineStyle?: {
    width?: number;
    type?: "solid" | "dashed" | "dotted";
    color?: string | string[];
    opacity?: number;
  };
  /** 面积填充 */
  areaStyle?: boolean | {
    color?: string | string[];
    opacity?: number;
  };
  /** 堆叠配置 */
  stack?: string;
  /** 阶梯类型 */
  step?: "start" | "middle" | "end";
  /** 连接空值 */
  connectNulls?: boolean;
  /** 端点标签 */
  showEndLabel?: boolean;
  /** 渐变色配置 */
  gradientColor?: Array<{ offset: number; color: string }>;
  /** 线条发光效果 */
  glowEffect?: boolean;
}

// ─── 坐标系配置 ───────────────────────────────────────────────────────────────
export interface CoordinateConfig {
  /** 极坐标模式 */
  polarEnable?: boolean;
  /** 极坐标半径范围 [inner, outer] */
  polarRadius?: [string | number, string | number];
  /** 迷你图网格配置 */
  sparklineGrids?: Array<{
    left: string;
    top: string;
    width: string;
    height: string;
  }>;
}

// ─── 辅助元素配置 ─────────────────────────────────────────────────────────────
export interface AuxiliaryConfig {
  /** 标题 */
  title?: string;
  /** 图例显示 */
  showLegend?: boolean;
  /** 图例位置 */
  legendPosition?: "top" | "bottom" | "left" | "right";
  /** 提示框显示 */
  showTooltip?: boolean;
  /** 提示框触发方式 */
  tooltipTrigger?: "axis" | "item";
  /** 数据缩放 */
  showDataZoom?: boolean;
  dataZoomType?: "slider" | "inside";
  /** 工具箱 */
  showToolbox?: boolean;
  /** 动画 */
  animation?: boolean;
  /** 视觉映射（分段高亮） */
  visualMapPieces?: Array<{ lte?: number; gt?: number; color: string }>;
  /** 标记线 */
  markLines?: Array<{ name?: string; yAxis?: number; xAxis?: string; type?: "min" | "max" | "average" }>;
  /** 标记点 */
  markPoints?: Array<{ name?: string; coord?: [number, number]; type?: "min" | "max" | "average" }>;
  /** 置信带（上下界系列） */
  confidenceBand?: {
    upperData: number[];
    lowerData: number[];
    color?: string;
  };
}

// ─── 完整折线图配置 ─────────────────────────────────────────────────────────────
export interface LineChartConfig {
  data: DataConfig;
  axis?: AxisConfig; // 极坐标模式不使用
  seriesStyle: SeriesStyleConfig;
  coordinate: CoordinateConfig;
  auxiliary?: AuxiliaryConfig;
  /** 预设类型（用于特殊逻辑） */
  presetType?: string;
}

// ─── 配置优先级 ───────────────────────────────────────────────────────
/**
 * 配置优先级规则：
 * 1. Polar > Sparkline > Normal（坐标系模式）
 * 2. Dataset > DirectData（数据源）
 * 3. Preset > UserConfig > Default（配置来源）
 */

// ─── 模式配置接口 ───────────────────────────────────────────────────────────────

/** Normal 模式：笛卡尔坐标系（单图表） */
export interface NormalModeConfig {
  mode: "normal";
  grid: {
    left?: string | number;
    right?: string | number;
    top?: string | number;
    bottom?: string | number;
    containLabel?: boolean;
  };
  xAxis: Array<{
    type: "category" | "value" | "time" | "log";
    data?: string[];
    position?: "top" | "bottom";
    boundaryGap?: boolean;
  }>;
  yAxis: Array<{
    type: "value" | "log" | "category";
    data?: string[];
    position?: "left" | "right";
    inverse?: boolean;
  }>;
  series: Array<{
    name?: string;
    type: "line";
    data?: (number | [string, number])[];
    smooth?: boolean;
    symbol?: string;
    symbolSize?: number;
    lineStyle?: Record<string, unknown>;
    areaStyle?: Record<string, unknown> | boolean;
    stack?: string;
    step?: "start" | "middle" | "end";
    xAxisIndex?: number; // 默认 0
    yAxisIndex?: number; // 默认 0
  }>;
}

/** Polar 模式：极坐标系 */
export interface PolarModeConfig {
  mode: "polar";
  polar: {
    center?: [string | number, string | number];
    radius?: [string | number, string | number];
  };
  angleAxis: {
    type: "value" | "category";
    startAngle?: number;
    clockwise?: boolean;
    splitLine?: Record<string, unknown>;
    axisLine?: Record<string, unknown>;
    axisLabel?: Record<string, unknown>;
  };
  radiusAxis: {
    type: "value" | "category";
    splitLine?: Record<string, unknown>;
    axisLine?: Record<string, unknown>;
    axisLabel?: Record<string, unknown>;
  };
  series: Array<{
    name?: string;
    type: "line";
    coordinateSystem: "polar";
    data?: (number | [number, number])[];
    smooth?: boolean;
    symbol?: string;
    symbolSize?: number;
    lineStyle?: Record<string, unknown>;
    areaStyle?: Record<string, unknown> | boolean;
    stack?: string;
    step?: "start" | "middle" | "end";
  }>;
}

/** Sparkline 模式：迷你图矩阵 */
export interface SparklineModeConfig {
  mode: "sparkline";
  grids: Array<{
    left: string;
    top: string;
    width: string;
    height: string;
  }>;
  xAxes: Array<{
    type: "category";
    show: false;
    data?: string[];
  }>;
  yAxes: Array<{
    type: "value";
    show: false;
  }>;
  series: Array<{
    name?: string;
    type: "line";
    data?: number[];
    smooth?: boolean;
    symbol?: "none";
    lineStyle?: Record<string, unknown>;
    areaStyle?: Record<string, unknown> | boolean;
    xAxisIndex: number; // 强制关联对应轴
    yAxisIndex: number; // 强制关联对应轴
  }>;
}

/** 统一模式配置 */
export type ChartModeConfig = NormalModeConfig | PolarModeConfig | SparklineModeConfig;