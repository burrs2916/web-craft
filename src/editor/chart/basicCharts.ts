import { componentRegistry, lazy } from "../registryCore";
import { dataSourceSchemaFields } from "../dataSourceFields";

export function registerBasicCharts(): void {
  // ─── 柱状图 ───
  componentRegistry.register({
    type: "echart-bar",
    name: "柱状图",
    icon: "bar_chart",
    description: "ECharts 柱状图，支持纵向/横向、渐变、圆角等配置",
    category: "ccat_chart",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 400, height: 300 },
    defaultConfig: {
      theme: "dark",
      orientation: "vertical",
      categories: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      values: [120, 200, 150, 80, 70, 110, 130],
      seriesName: "数据",
      barWidth: "50%",
      borderRadius: 4,
      showLabel: false,
      gradient: true,
    },
    capabilities: { resizable: true, rotatable: false, draggable: true, connectable: true, embeddable: false },
    renderer: lazy(() => import("../renderers/echarts/BarChartRenderer").then(m => ({ default: m.BarChartRenderer }))),
    events: [{ id: "click", name: "点击" }, { id: "dataChanged", name: "数据更新" }],
    actions: [{ id: "updateData", name: "更新数据" }],
    dataSchema: { sourceType: "static", staticData: {} },
    configSchema: [
      // —— 数据源（共享字段组）——
      ...dataSourceSchemaFields,
      { key: "title", label: "标题", type: "text", group: "内容" },
      { key: "orientation", label: "方向", type: "select", options: [{ label: "纵向", value: "vertical" }, { label: "横向", value: "horizontal" }], group: "内容" },
      { key: "categories", label: "分类数据", type: "json", group: "内容", placeholder: '["A","B","C"]' },
      { key: "values", label: "数值数据", type: "json", group: "内容", placeholder: "[10,20,30]" },
      { key: "seriesName", label: "系列名", type: "text", group: "内容" },
      { key: "barWidth", label: "柱宽", type: "text", group: "样式" },
      { key: "borderRadius", label: "圆角", type: "number", min: 0, group: "样式" },
      { key: "showLabel", label: "显示标签", type: "toggle", group: "样式" },
      { key: "gradient", label: "渐变色", type: "toggle", group: "样式" },
      { key: "showTitle", label: "显示标题", type: "toggle", group: "样式" },
      { key: "theme", label: "主题", type: "select", options: [{ label: "暗色", value: "dark" }, { label: "亮色", value: "light" }], group: "样式" },
      { key: "backgroundColor", label: "背景色", type: "color", group: "样式" },
      { key: "option", label: "自定义配置", type: "json", group: "高级" },
    ],
  });

  // ═══════════════════════════════════════════════════════════════
  // 折线图分组 — 5 个独立组件，各自有专属属性面板
  // ═══════════════════════════════════════════════════════════════

  // ─── 堆叠折线图 ───
  componentRegistry.register({
    type: "echart-line-stacked",
    name: "堆叠折线图",
    icon: "stacked_line_chart",
    description: "多系列堆叠展示",
    category: "ccat_chart",
    version: "3.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 400, height: 300 },
    defaultConfig: {
      theme: "dark",
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
    capabilities: { resizable: true, rotatable: false, draggable: true, connectable: true, embeddable: false },
    renderer: lazy(() => import("../renderers/echarts/LineChartRenderer").then(m => ({ default: m.LineChartRenderer }))),
    events: [{ id: "click", name: "点击" }],
    actions: [{ id: "updateData", name: "更新数据" }],
    dataSchema: { sourceType: "static", staticData: {} },
    configSchema: [
      // —— 数据源（共享字段组）——
      ...dataSourceSchemaFields,
      { key: "title", label: "标题", type: "text", group: "基础" },
      { key: "xAxisData", label: "X轴数据", type: "json", group: "基础", placeholder: '["Mon","Tue","Wed"]' },
      { key: "seriesData", label: "系列数据", type: "json", group: "基础", placeholder: "[[100,200,300]]" },
      { key: "seriesNames", label: "系列名称", type: "json", group: "基础", placeholder: '["系列1","系列2"]' },
      { key: "smooth", label: "平滑曲线", type: "toggle", group: "基础" },
      { key: "areaStyle", label: "面积填充", type: "toggle", group: "基础" },
      { key: "areaOpacity", label: "面积透明度", type: "slider", min: 0, max: 1, step: 0.05, group: "基础" },
      { key: "stack", label: "堆叠标识", type: "text", group: "基础", placeholder: "相同标识会堆叠" },

      { key: "lineWidth", label: "线条宽度", type: "number", min: 1, max: 10, group: "线条样式" },
      { key: "lineColor", label: "线条颜色", type: "color", group: "线条样式" },

      { key: "showSymbol", label: "显示数据点", type: "toggle", group: "数据点" },
      { key: "symbolType", label: "点形状", type: "select", group: "数据点",
        options: [
          { label: "圆形", value: "circle" }, { label: "矩形", value: "rect" },
          { label: "三角形", value: "triangle" }, { label: "菱形", value: "diamond" },
          { label: "无", value: "none" },
        ] },
      { key: "symbolSize", label: "点大小", type: "number", min: 1, max: 20, group: "数据点" },

      { key: "xAxisType", label: "X轴类型", type: "select", group: "轴配置",
        options: [
          { label: "类目轴", value: "category" }, { label: "时间轴", value: "time" },
          { label: "数值轴", value: "value" }, { label: "对数轴", value: "log" },
        ] },
      { key: "yAxisType", label: "Y轴类型", type: "select", group: "轴配置",
        options: [{ label: "数值轴", value: "value" }, { label: "对数轴", value: "log" }] },

      { key: "showDataZoom", label: "数据缩放", type: "toggle", group: "交互" },

      { key: "theme", label: "主题", type: "select", group: "主题",
        options: [{ label: "暗色", value: "dark" }, { label: "亮色", value: "light" }] },
    ],
  });

  // ─── 极坐标折线图 ───
  componentRegistry.register({
    type: "echart-line-polar",
    name: "极坐标折线图",
    icon: "radar",
    description: "极坐标系双数值轴",
    category: "ccat_chart",
    version: "3.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 400, height: 400 },
    defaultConfig: {
      theme: "dark",
      smooth: true,
      areaStyle: false,
      showSymbol: true,
      symbolSize: 4,
      lineWidth: 2,
      polarEnable: true,
      polarRadius: ["10%", "75%"],
      seriesNames: ["极坐标数据"],
      seriesData: [[[0, 50], [30, 80], [60, 60], [90, 90], [120, 70], [150, 85], [180, 55], [210, 75], [240, 65], [270, 88], [300, 72], [330, 60]]],
    },
    capabilities: { resizable: true, rotatable: false, draggable: true, connectable: true, embeddable: false },
    renderer: lazy(() => import("../renderers/echarts/LineChartRenderer").then(m => ({ default: m.LineChartRenderer }))),
    events: [{ id: "click", name: "点击" }],
    actions: [{ id: "updateData", name: "更新数据" }],
    dataSchema: { sourceType: "static", staticData: {} },
    configSchema: [
      // —— 数据源（共享字段组）——
      ...dataSourceSchemaFields,
      { key: "title", label: "标题", type: "text", group: "基础" },
      { key: "seriesData", label: "系列数据", type: "json", group: "基础", placeholder: "[[[0,50],[30,80]]]" },
      { key: "seriesNames", label: "系列名称", type: "json", group: "基础", placeholder: '["系列1"]' },
      { key: "smooth", label: "平滑曲线", type: "toggle", group: "基础" },
      { key: "areaStyle", label: "面积填充", type: "toggle", group: "基础" },

      { key: "lineWidth", label: "线条宽度", type: "number", min: 1, max: 10, group: "线条样式" },
      { key: "lineColor", label: "线条颜色", type: "color", group: "线条样式" },

      { key: "showSymbol", label: "显示数据点", type: "toggle", group: "数据点" },
      { key: "symbolType", label: "点形状", type: "select", group: "数据点",
        options: [
          { label: "圆形", value: "circle" }, { label: "矩形", value: "rect" },
          { label: "三角形", value: "triangle" }, { label: "菱形", value: "diamond" },
          { label: "无", value: "none" },
        ] },
      { key: "symbolSize", label: "点大小", type: "number", min: 1, max: 20, group: "数据点" },

      { key: "polarRadius", label: "极坐标半径", type: "json", group: "极坐标", placeholder: '["0%","75%"]' },

      { key: "theme", label: "主题", type: "select", group: "主题",
        options: [{ label: "暗色", value: "dark" }, { label: "亮色", value: "light" }] },
    ],
  });

  // ─── 数据集折线图 ───
  componentRegistry.register({
    type: "echart-line-dataset",
    name: "数据集折线图",
    icon: "data_usage",
    description: "Dataset + Transform 数据驱动",
    category: "ccat_chart",
    version: "3.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 400, height: 300 },
    defaultConfig: {
      theme: "dark",
      smooth: true,
      areaStyle: false,
      datasetSource: [
        ["product", "2015", "2016", "2017"],
        ["Matcha Latte", 43.3, 85.8, 93.7],
        ["Milk Tea", 83.1, 73.4, 55.1],
        ["Cheese Cocoa", 86.4, 65.2, 82.5],
      ],
    },
    capabilities: { resizable: true, rotatable: false, draggable: true, connectable: true, embeddable: false },
    renderer: lazy(() => import("../renderers/echarts/LineChartRenderer").then(m => ({ default: m.LineChartRenderer }))),
    events: [{ id: "click", name: "点击" }],
    actions: [{ id: "updateData", name: "更新数据" }],
    dataSchema: { sourceType: "static", staticData: {} },
    configSchema: [
      // —— 数据源（共享字段组）——
      ...dataSourceSchemaFields,
      { key: "title", label: "标题", type: "text", group: "基础" },
      { key: "smooth", label: "平滑曲线", type: "toggle", group: "基础" },
      { key: "areaStyle", label: "面积填充", type: "toggle", group: "基础" },

      { key: "lineWidth", label: "线条宽度", type: "number", min: 1, max: 10, group: "线条样式" },
      { key: "lineColor", label: "线条颜色", type: "color", group: "线条样式" },

      { key: "datasetSource", label: "数据源", type: "json", group: "Dataset", placeholder: '[["product","2015"],["A",100]]' },
      { key: "datasetTransform", label: "数据转换", type: "json", group: "Dataset", placeholder: '[{"type":"filter","config":{"dimension":1,"value":"A"}}]' },

      { key: "showDataZoom", label: "数据缩放", type: "toggle", group: "交互" },

      { key: "theme", label: "主题", type: "select", group: "主题",
        options: [{ label: "暗色", value: "dark" }, { label: "亮色", value: "light" }] },
    ],
  });

  // ─── 迷你图矩阵 ───
  componentRegistry.register({
    type: "echart-line-sparkline",
    name: "迷你图矩阵",
    icon: "grid_view",
    description: "多图矩阵布局",
    category: "ccat_chart",
    version: "3.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 400, height: 300 },
    defaultConfig: {
      theme: "dark",
      smooth: true,
      showSymbol: false,
      areaStyle: false,
      lineWidth: 1,
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
    },
    capabilities: { resizable: true, rotatable: false, draggable: true, connectable: true, embeddable: false },
    renderer: lazy(() => import("../renderers/echarts/LineChartRenderer").then(m => ({ default: m.LineChartRenderer }))),
    events: [{ id: "click", name: "点击" }],
    actions: [{ id: "updateData", name: "更新数据" }],
    dataSchema: { sourceType: "static", staticData: {} },
    configSchema: [
      // —— 数据源（共享字段组）——
      ...dataSourceSchemaFields,
      { key: "title", label: "标题", type: "text", group: "基础" },
      { key: "xAxisData", label: "X轴数据", type: "json", group: "基础", placeholder: '["Mon","Tue","Wed"]' },
      { key: "seriesData", label: "系列数据", type: "json", group: "基础", placeholder: "[[100,200,300]]" },
      { key: "seriesNames", label: "系列名称", type: "json", group: "基础", placeholder: '["系列1","系列2"]' },
      { key: "smooth", label: "平滑曲线", type: "toggle", group: "基础" },
      { key: "areaStyle", label: "面积填充", type: "toggle", group: "基础" },

      { key: "lineWidth", label: "线条宽度", type: "number", min: 1, max: 10, group: "线条样式" },
      { key: "lineColor", label: "线条颜色", type: "color", group: "线条样式" },

      { key: "sparklineGrids", label: "多图布局", type: "json", group: "Sparkline", placeholder: '[{"left":"5%","top":"5%","width":"40%","height":"30%"}]' },

      { key: "theme", label: "主题", type: "select", group: "主题",
        options: [{ label: "暗色", value: "dark" }, { label: "亮色", value: "light" }] },
    ],
  });
}
