/**
 * 折线图预设类型配置
 *
 * 5 个大类型，每个类型动态分配属性
 */

export type LineChartPresetType =
  | "basic"      // 基础折线图（笛卡尔坐标系，直接数据）
  | "stacked"    // 堆叠折线图
  | "polar"      // 极坐标折线图
  | "dataset"    // 数据集折线图（Dataset + Transform）
  | "sparkline"; // 迷你图矩阵

export interface LineChartPresetOption {
  label: string;
  value: LineChartPresetType;
  description?: string;
}

export const LINE_CHART_PRESET_OPTIONS: LineChartPresetOption[] = [
  { label: "基础折线图", value: "basic", description: "标准笛卡尔坐标系折线图" },
  { label: "堆叠折线图", value: "stacked", description: "多系列堆叠展示" },
  { label: "极坐标折线图", value: "polar", description: "极坐标系双数值轴" },
  { label: "数据集折线图", value: "dataset", description: "Dataset + Transform 数据驱动" },
  { label: "迷你图矩阵", value: "sparkline", description: "多图矩阵布局" },
];

/**
 * 判断属性是否适用于指定类型
 * 用于属性面板动态过滤
 */
export function isFieldApplicable(fieldTypes: string[] | undefined, currentType: string): boolean {
  if (!fieldTypes || fieldTypes.length === 0) return true; // 未指定则全部适用
  return fieldTypes.includes(currentType);
}

/**
 * 生成极坐标数据（角度-半径对）
 */
function generatePolarData(count: number): [number, number][] {
  const data: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.round((i / count) * 360 * 100) / 100;
    const radius = Math.round((50 + Math.sin(i / 5) * 30 + Math.random() * 10) * 100) / 100;
    data.push([angle, radius]);
  }
  return data;
}

/**
 * 预设类型对应的默认配置
 * 当用户选择某个类型时，自动应用这些配置
 */
export const LINE_CHART_PRESET_CONFIGS: Record<LineChartPresetType, Record<string, unknown>> = {
  // ─── 基础折线图 ───
  basic: {
    smooth: true,
    areaStyle: false,
    showSymbol: true,
    symbolSize: 6,
    lineWidth: 2,
    xAxisType: "category",
    yAxisType: "value",
    seriesNames: ["系列A", "系列B", "系列C"],
    seriesData: [
      [820, 932, 901, 934, 1290, 1330, 1320],
      [620, 732, 701, 734, 1090, 1130, 1120],
      [420, 532, 501, 534, 890, 930, 920],
    ],
    xAxisData: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  },

  // ─── 堆叠折线图 ───
  stacked: {
    smooth: true,
    areaStyle: true,
    areaOpacity: 0.25,
    stack: "total",
    showSymbol: false,
    lineWidth: 2,
    xAxisType: "category",
    yAxisType: "value",
    seriesNames: ["邮件营销", "联盟广告", "视频广告", "直接访问", "搜索引擎"],
    seriesData: [
      [120, 132, 101, 134, 90, 230, 210],
      [220, 182, 191, 234, 290, 330, 310],
      [150, 232, 201, 154, 190, 330, 410],
      [320, 332, 301, 334, 390, 330, 320],
      [820, 932, 901, 934, 1290, 1330, 1320],
    ],
    xAxisData: ["周一", "周二", "周三", "周四", "周五", "周六", "周日"],
  },

  // ─── 极坐标折线图 ───
  polar: {
    smooth: true,
    areaStyle: false,
    showSymbol: true,
    symbolSize: 4,
    lineWidth: 2,
    polarEnable: true,
    polarRadius: ["10%", "75%"],
    seriesNames: ["极坐标数据"],
    seriesData: [generatePolarData(36)],
  },

  // ─── 数据集折线图 ───
  dataset: {
    smooth: true,
    areaStyle: false,
    datasetSource: [
      ["product", "2015", "2016", "2017"],
      ["Matcha Latte", 43.3, 85.8, 93.7],
      ["Milk Tea", 83.1, 73.4, 55.1],
      ["Cheese Cocoa", 86.4, 65.2, 82.5],
    ],
  },

  // ─── 迷你图矩阵 ───
  sparkline: {
    sparklineGrids: [
      { left: "5%", top: "10%", width: "40%", height: "30%" },
      { left: "55%", top: "10%", width: "40%", height: "30%" },
      { left: "5%", top: "55%", width: "40%", height: "30%" },
      { left: "55%", top: "55%", width: "40%", height: "30%" },
    ],
    seriesNames: ["温度", "湿度", "压力", "流量"],
    seriesData: [
      [22, 23, 24, 25, 26, 24, 23],
      [45, 50, 55, 60, 58, 52, 48],
      [101, 102, 103, 104, 105, 103, 102],
      [12, 15, 18, 20, 17, 14, 11],
    ],
    xAxisData: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    smooth: true,
    showSymbol: false,
    areaStyle: false,
    lineWidth: 1,
  },
};