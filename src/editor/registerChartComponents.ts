import { componentRegistry, lazy } from "./registryCore";
import { dataSourceSchemaFields } from "./dataSourceFields";
import { authEnabledField } from "./data/authMode";

/**
 * 注册所有 ECharts 图表组件
 * 每个图表类型独立注册，名称与 ECharts 官方保持一致
 */
export function registerChartComponents(): void {

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
    renderer: lazy(() => import("./renderers/echarts/BarChartRenderer").then(m => ({ default: m.BarChartRenderer }))),
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
    renderer: lazy(() => import("./renderers/echarts/LineChartRenderer").then(m => ({ default: m.LineChartRenderer }))),
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
    renderer: lazy(() => import("./renderers/echarts/LineChartRenderer").then(m => ({ default: m.LineChartRenderer }))),
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
    renderer: lazy(() => import("./renderers/echarts/LineChartRenderer").then(m => ({ default: m.LineChartRenderer }))),
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
    renderer: lazy(() => import("./renderers/echarts/LineChartRenderer").then(m => ({ default: m.LineChartRenderer }))),
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

  // ─── 饼图 ───
  componentRegistry.register({
    type: "echart-pie",
    name: "饼图",
    icon: "pie_chart",
    description: "ECharts 饼图，支持南丁格尔玫瑰图、环形图",
    category: "ccat_chart",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 350, height: 300 },
    defaultConfig: {
      theme: "dark",
      data: [
        { name: "A", value: 1048 }, { name: "B", value: 735 },
        { name: "C", value: 580 }, { name: "D", value: 484 }, { name: "E", value: 300 },
      ],
      roseType: false,
      radius: ["35%", "65%"],
      center: ["50%", "50%"],
      showLabel: true,
      labelPosition: "outside",
      borderRadius: 6,
    },
    capabilities: { resizable: true, rotatable: false, draggable: true, connectable: true, embeddable: false },
    renderer: lazy(() => import("./renderers/echarts/PieChartRenderer").then(m => ({ default: m.PieChartRenderer }))),
    events: [{ id: "click", name: "点击" }],
    actions: [{ id: "updateData", name: "更新数据" }],
    dataSchema: { sourceType: "static", staticData: {} },
    configSchema: [
      // —— 数据源（共享字段组）——
      ...dataSourceSchemaFields,
      { key: "title", label: "标题", type: "text", group: "内容" },
      { key: "data", label: "数据", type: "json", group: "内容", placeholder: '[{"name":"A","value":100}]' },
      { key: "roseType", label: "玫瑰图", type: "select", options: [{ label: "关闭", value: false }, { label: "半径", value: "radius" }, { label: "面积", value: "area" }], group: "样式" },
      { key: "radius", label: "半径", type: "json", group: "样式", placeholder: '["35%","65%"]' },
      { key: "center", label: "中心", type: "json", group: "样式", placeholder: '["50%","50%"]' },
      { key: "showLabel", label: "显示标签", type: "toggle", group: "样式" },
      { key: "labelPosition", label: "标签位置", type: "select", options: [{ label: "外部", value: "outside" }, { label: "内部", value: "inside" }, { label: "中心", value: "center" }], group: "样式" },
      { key: "borderRadius", label: "圆角", type: "number", min: 0, group: "样式" },
      { key: "showTitle", label: "显示标题", type: "toggle", group: "样式" },
      { key: "theme", label: "主题", type: "select", options: [{ label: "暗色", value: "dark" }, { label: "亮色", value: "light" }], group: "样式" },
      { key: "backgroundColor", label: "背景色", type: "color", group: "样式" },
      { key: "option", label: "自定义配置", type: "json", group: "高级" },
    ],
  });

  // ─── 散点图 ───
  componentRegistry.register({
    type: "echart-scatter",
    name: "散点图",
    icon: "scatter_plot",
    description: "ECharts 散点图，用于数据分布与相关性分析",
    category: "ccat_chart",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 400, height: 300 },
    defaultConfig: {
      theme: "dark",
      data: [[10, 8.04], [8, 6.95], [13, 7.58], [9, 8.81], [11, 8.33], [14, 9.96], [6, 7.24], [4, 4.26], [12, 10.84], [7, 4.82]],
      symbolSize: 10,
      seriesName: "散点",
    },
    capabilities: { resizable: true, rotatable: false, draggable: true, connectable: true, embeddable: false },
    renderer: lazy(() => import("./renderers/echarts/ScatterChartRenderer").then(m => ({ default: m.ScatterChartRenderer }))),
    events: [{ id: "click", name: "点击" }],
    actions: [{ id: "updateData", name: "更新数据" }],
    dataSchema: { sourceType: "static", staticData: {} },
    configSchema: [
      // —— 数据源（共享字段组）——
      ...dataSourceSchemaFields,
      { key: "title", label: "标题", type: "text", group: "内容" },
      { key: "data", label: "数据", type: "json", group: "内容", placeholder: "[[x,y],...]" },
      { key: "symbolSize", label: "点大小", type: "number", min: 1, group: "样式" },
      { key: "seriesName", label: "系列名", type: "text", group: "内容" },
      { key: "showTitle", label: "显示标题", type: "toggle", group: "样式" },
      { key: "theme", label: "主题", type: "select", options: [{ label: "暗色", value: "dark" }, { label: "亮色", value: "light" }], group: "样式" },
      { key: "backgroundColor", label: "背景色", type: "color", group: "样式" },
      { key: "option", label: "自定义配置", type: "json", group: "高级" },
    ],
  });

  // ─── 雷达图 ───
  componentRegistry.register({
    type: "echart-radar",
    name: "雷达图",
    icon: "radar",
    description: "ECharts 雷达图，多维度指标对比",
    category: "ccat_chart",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 350, height: 300 },
    defaultConfig: {
      theme: "dark",
      indicator: [
        { name: "Sales", max: 100 }, { name: "Admin", max: 100 },
        { name: "Tech", max: 100 }, { name: "Support", max: 100 },
        { name: "Dev", max: 100 }, { name: "Marketing", max: 100 },
      ],
      seriesData: [
        { value: [80, 70, 90, 60, 85, 75], name: "预算" },
        { value: [60, 80, 65, 90, 70, 85], name: "实际" },
      ],
    },
    capabilities: { resizable: true, rotatable: false, draggable: true, connectable: true, embeddable: false },
    renderer: lazy(() => import("./renderers/echarts/RadarChartRenderer").then(m => ({ default: m.RadarChartRenderer }))),
    events: [{ id: "click", name: "点击" }],
    actions: [{ id: "updateData", name: "更新数据" }],
    dataSchema: { sourceType: "static", staticData: {} },
    configSchema: [
      // —— 数据源（共享字段组）——
      ...dataSourceSchemaFields,
      { key: "title", label: "标题", type: "text", group: "内容" },
      { key: "indicator", label: "指标", type: "json", group: "内容", placeholder: '[{"name":"指标","max":100}]' },
      { key: "seriesData", label: "数据", type: "json", group: "内容", placeholder: '[{"value":[...],"name":"..."}]' },
      { key: "showTitle", label: "显示标题", type: "toggle", group: "样式" },
      { key: "theme", label: "主题", type: "select", options: [{ label: "暗色", value: "dark" }, { label: "亮色", value: "light" }], group: "样式" },
      { key: "backgroundColor", label: "背景色", type: "color", group: "样式" },
      { key: "option", label: "自定义配置", type: "json", group: "高级" },
    ],
  });

  // ─── 仪表盘分组：5个独立组件 ───

  // 1. 基础仪表盘 — 通用数值展示
  componentRegistry.register({
    type: "echart-gauge-basic",
    name: "基础仪表盘",
    icon: "speed",
    description: "通用仪表盘，支持自定义范围、单位、颜色",
    category: "ccat_chart",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 250, height: 220 },
    defaultConfig: {
      theme: "dark",
      gaugeStyle: "modern",
      value: 68,
      min: 0,
      max: 100,
      unit: "",
      gaugeName: "",
      splitNumber: 10,
      showPointer: true,
      showProgress: true,
      progressWidth: 18,
      pointerWidth: 4,
      startAngle: 220,
      endAngle: -40,
      dataSourceId: "",
      dataMode: "static",
      dataField: "",
      /* 静态数据（json-data）：本组件自持数据分组，此前靠注册表的通用 DataConfigMixin
         自动补上；改为显式声明后由此处提供，能力与历史逐字一致。 */
      staticData: "",
    },
    capabilities: { resizable: true, rotatable: false, draggable: true, connectable: true, embeddable: false },
    renderer: lazy(() => import("./renderers/echarts/GaugeChartRenderer").then(m => ({ default: m.GaugeChartRenderer }))),
    events: [{ id: "click", name: "点击" }, { id: "valueChanged", name: "值变化" }],
    actions: [{ id: "updateData", name: "更新数据" }],
    dataSchema: { sourceType: "static", staticData: {} },
    configSchema: [
      { key: "dataSourceId", label: "数据源", type: "datasource", group: "数据源" },
      { key: "dataMode", label: "数据模式", type: "select", group: "数据源",
        help: "静态：固定值；实时：绑定数据源设备字段；API：从接口拉取数值",
        options: [
          { label: "静态数据", value: "static" },
          { label: "实时数据", value: "realtime" },
          { label: "API 动态数据", value: "api" },
        ] },
      { key: "dataField", label: "数据字段", type: "datafield", group: "数据源", hidden: (c) => c.dataMode !== "realtime" || !c.dataSourceId },
      { key: "staticData", label: "静态数据", type: "json-data", group: "数据源", hidden: (c) => c.dataMode !== "static",
        help: "静态模式下用作图表数据集；留空沿用组件自带的静态字段" },
      // —— API 模式字段（与统一取数骨架对齐）——
      { key: "apiUrl", label: "API 地址", type: "text", group: "数据源", placeholder: "https://…/api/value", hidden: (c) => c.dataMode !== "api" },
      { key: "apiPath", label: "接口路径", type: "text", group: "数据源", placeholder: "sensors/latest", help: "与全局 baseUrl 拼接；填写完整 API 地址时可留空", hidden: (c) => c.dataMode !== "api" },
      { key: "apiMethod", label: "请求方式", type: "select", group: "数据源", options: [{ label: "GET", value: "GET" }, { label: "POST", value: "POST" }], hidden: (c) => c.dataMode !== "api" },
      { key: "apiHeaders", label: "请求头(JSON)", type: "text", group: "数据源", placeholder: '{"X-Org":"demo"}', hidden: (c) => c.dataMode !== "api" },
      { key: "apiBody", label: "请求体(JSON)", type: "text", group: "数据源", placeholder: '{"id":1}', hidden: (c) => c.dataMode !== "api" },
      { key: "apiInterval", label: "轮询间隔(秒)", type: "number", group: "数据源", min: 0, defaultValue: 0, help: "0 = 仅首次拉取", hidden: (c) => c.dataMode !== "api" },
      { key: "apiDataPath", label: "数据路径", type: "text", group: "数据源", placeholder: "data.value", help: "从 JSON 响应取值的路径", hidden: (c) => c.dataMode !== "api" },
      authEnabledField({ hidden: (c) => c.dataMode !== "api" }),
      { key: "value", label: "当前值", type: "number", group: "数据源", hidden: (c) => c.dataMode === "realtime" },
      { key: "min", label: "最小值", type: "number", group: "数据源" },
      { key: "max", label: "最大值", type: "number", group: "数据源" },
      { key: "unit", label: "单位", type: "text", group: "数据源", placeholder: "如: °C, %, m/s" },
      { key: "gaugeName", label: "仪表名称", type: "text", group: "数据源" },
      { key: "splitNumber", label: "分割段数", type: "number", min: 1, max: 20, group: "样式" },
      { key: "showPointer", label: "显示指针", type: "toggle", group: "样式" },
      { key: "showProgress", label: "显示进度条", type: "toggle", group: "样式" },
      { key: "progressWidth", label: "进度条宽度", type: "number", min: 4, max: 40, group: "样式" },
      { key: "pointerWidth", label: "指针宽度", type: "number", min: 1, max: 10, group: "样式" },
      { key: "startAngle", label: "起始角度", type: "number", group: "样式" },
      { key: "endAngle", label: "结束角度", type: "number", group: "样式" },
      { key: "theme", label: "主题", type: "select", options: [{ label: "暗色", value: "dark" }, { label: "亮色", value: "light" }], group: "样式" },
    ],
  });

  // 2. 三色分段仪表盘 — 工业风格（绿→蓝→红）

  // 3. 传感器仪表盘 — 预设传感器参数

  // 4. 进度条仪表盘 — 现代风格，渐变进度
  componentRegistry.register({
    type: "echart-gauge-progress",
    name: "进度条仪表盘",
    icon: "data_usage",
    description: "现代风格仪表盘，渐变色进度条，适合百分比展示",
    category: "ccat_chart",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 250, height: 250 },
    defaultConfig: {
      theme: "dark",
      gaugeStyle: "modern",
      value: 75,
      min: 0,
      max: 100,
      unit: "%",
      gaugeName: "完成率",
      showPointer: false,
      showProgress: true,
      progressWidth: 20,
      splitNumber: 10,
      startAngle: 220,
      endAngle: -40,
      dataSourceId: "",
      dataMode: "static",
      dataField: "",
      /* 静态数据（json-data）：本组件自持数据分组，此前靠注册表的通用 DataConfigMixin
         自动补上；改为显式声明后由此处提供，能力与历史逐字一致。 */
      staticData: "",
    },
    capabilities: { resizable: true, rotatable: false, draggable: true, connectable: true, embeddable: false },
    renderer: lazy(() => import("./renderers/echarts/GaugeChartRenderer").then(m => ({ default: m.GaugeChartRenderer }))),
    events: [{ id: "click", name: "点击" }],
    actions: [{ id: "updateData", name: "更新数据" }],
    dataSchema: { sourceType: "static", staticData: {} },
    configSchema: [
      { key: "dataSourceId", label: "数据源", type: "datasource", group: "数据源" },
      { key: "dataMode", label: "数据模式", type: "select", group: "数据源",
        help: "静态：固定值；实时：绑定数据源设备字段；API：从接口拉取数值",
        options: [
          { label: "静态数据", value: "static" },
          { label: "实时数据", value: "realtime" },
          { label: "API 动态数据", value: "api" },
        ] },
      { key: "dataField", label: "数据字段", type: "datafield", group: "数据源", hidden: (c) => c.dataMode !== "realtime" || !c.dataSourceId },
      { key: "staticData", label: "静态数据", type: "json-data", group: "数据源", hidden: (c) => c.dataMode !== "static",
        help: "静态模式下用作图表数据集；留空沿用组件自带的静态字段" },
      // —— API 模式字段（与统一取数骨架对齐）——
      { key: "apiUrl", label: "API 地址", type: "text", group: "数据源", placeholder: "https://…/api/value", hidden: (c) => c.dataMode !== "api" },
      { key: "apiPath", label: "接口路径", type: "text", group: "数据源", placeholder: "sensors/latest", help: "与全局 baseUrl 拼接；填写完整 API 地址时可留空", hidden: (c) => c.dataMode !== "api" },
      { key: "apiMethod", label: "请求方式", type: "select", group: "数据源", options: [{ label: "GET", value: "GET" }, { label: "POST", value: "POST" }], hidden: (c) => c.dataMode !== "api" },
      { key: "apiHeaders", label: "请求头(JSON)", type: "text", group: "数据源", placeholder: '{"X-Org":"demo"}', hidden: (c) => c.dataMode !== "api" },
      { key: "apiBody", label: "请求体(JSON)", type: "text", group: "数据源", placeholder: '{"id":1}', hidden: (c) => c.dataMode !== "api" },
      { key: "apiInterval", label: "轮询间隔(秒)", type: "number", group: "数据源", min: 0, defaultValue: 0, help: "0 = 仅首次拉取", hidden: (c) => c.dataMode !== "api" },
      { key: "apiDataPath", label: "数据路径", type: "text", group: "数据源", placeholder: "data.value", help: "从 JSON 响应取值的路径", hidden: (c) => c.dataMode !== "api" },
      authEnabledField({ hidden: (c) => c.dataMode !== "api" }),
      { key: "value", label: "当前值", type: "number", group: "数据源", hidden: (c) => c.dataMode === "realtime" },
      { key: "min", label: "最小值", type: "number", group: "数据源" },
      { key: "max", label: "最大值", type: "number", group: "数据源" },
      { key: "unit", label: "单位", type: "text", group: "数据源" },
      { key: "gaugeName", label: "仪表名称", type: "text", group: "数据源" },
      { key: "progressWidth", label: "进度条宽度", type: "number", min: 4, max: 40, group: "样式" },
      { key: "showPointer", label: "显示指针", type: "toggle", group: "样式" },
      { key: "splitNumber", label: "分割段数", type: "number", min: 1, max: 20, group: "样式" },
      { key: "startAngle", label: "起始角度", type: "number", group: "样式" },
      { key: "endAngle", label: "结束角度", type: "number", group: "样式" },
      { key: "theme", label: "主题", type: "select", options: [{ label: "暗色", value: "dark" }, { label: "亮色", value: "light" }], group: "样式" },
    ],
  });

  // 5. 百分比仪表盘 — 半圆，纯百分比展示
  componentRegistry.register({
    type: "echart-gauge-percent",
    name: "百分比仪表盘",
    icon: "percent",
    description: "半圆仪表盘，0-100% 百分比展示，简洁风格",
    category: "ccat_chart",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 200, height: 140 },
    defaultConfig: {
      theme: "dark",
      gaugeStyle: "modern",
      value: 60,
      min: 0,
      max: 100,
      unit: "%",
      gaugeName: "",
      showPointer: true,
      showProgress: true,
      progressWidth: 15,
      pointerWidth: 3,
      splitNumber: 5,
      startAngle: 180,
      endAngle: 0,
      dataSourceId: "",
      dataMode: "static",
      dataField: "",
      /* 静态数据（json-data）：本组件自持数据分组，此前靠注册表的通用 DataConfigMixin
         自动补上；改为显式声明后由此处提供，能力与历史逐字一致。 */
      staticData: "",
    },
    capabilities: { resizable: true, rotatable: false, draggable: true, connectable: true, embeddable: false },
    renderer: lazy(() => import("./renderers/echarts/GaugeChartRenderer").then(m => ({ default: m.GaugeChartRenderer }))),
    events: [{ id: "click", name: "点击" }],
    actions: [{ id: "updateData", name: "更新数据" }],
    dataSchema: { sourceType: "static", staticData: {} },
    configSchema: [
      { key: "dataSourceId", label: "数据源", type: "datasource", group: "数据源" },
      { key: "dataMode", label: "数据模式", type: "select", group: "数据源",
        help: "静态：固定值；实时：绑定数据源设备字段；API：从接口拉取数值",
        options: [
          { label: "静态数据", value: "static" },
          { label: "实时数据", value: "realtime" },
          { label: "API 动态数据", value: "api" },
        ] },
      { key: "dataField", label: "数据字段", type: "datafield", group: "数据源", hidden: (c) => c.dataMode !== "realtime" || !c.dataSourceId },
      { key: "staticData", label: "静态数据", type: "json-data", group: "数据源", hidden: (c) => c.dataMode !== "static",
        help: "静态模式下用作图表数据集；留空沿用组件自带的静态字段" },
      // —— API 模式字段（与统一取数骨架对齐）——
      { key: "apiUrl", label: "API 地址", type: "text", group: "数据源", placeholder: "https://…/api/value", hidden: (c) => c.dataMode !== "api" },
      { key: "apiPath", label: "接口路径", type: "text", group: "数据源", placeholder: "sensors/latest", help: "与全局 baseUrl 拼接；填写完整 API 地址时可留空", hidden: (c) => c.dataMode !== "api" },
      { key: "apiMethod", label: "请求方式", type: "select", group: "数据源", options: [{ label: "GET", value: "GET" }, { label: "POST", value: "POST" }], hidden: (c) => c.dataMode !== "api" },
      { key: "apiHeaders", label: "请求头(JSON)", type: "text", group: "数据源", placeholder: '{"X-Org":"demo"}', hidden: (c) => c.dataMode !== "api" },
      { key: "apiBody", label: "请求体(JSON)", type: "text", group: "数据源", placeholder: '{"id":1}', hidden: (c) => c.dataMode !== "api" },
      { key: "apiInterval", label: "轮询间隔(秒)", type: "number", group: "数据源", min: 0, defaultValue: 0, help: "0 = 仅首次拉取", hidden: (c) => c.dataMode !== "api" },
      { key: "apiDataPath", label: "数据路径", type: "text", group: "数据源", placeholder: "data.value", help: "从 JSON 响应取值的路径", hidden: (c) => c.dataMode !== "api" },
      authEnabledField({ hidden: (c) => c.dataMode !== "api" }),
      { key: "value", label: "当前值", type: "number", group: "数据源", hidden: (c) => c.dataMode === "realtime" },
      { key: "gaugeName", label: "仪表名称", type: "text", group: "数据源" },
      { key: "progressWidth", label: "进度条宽度", type: "number", min: 4, max: 40, group: "样式" },
      { key: "showPointer", label: "显示指针", type: "toggle", group: "样式" },
      { key: "pointerWidth", label: "指针宽度", type: "number", min: 1, max: 10, group: "样式" },
      { key: "splitNumber", label: "分割段数", type: "number", min: 1, max: 20, group: "样式" },
      { key: "theme", label: "主题", type: "select", options: [{ label: "暗色", value: "dark" }, { label: "亮色", value: "light" }], group: "样式" },
    ],
  });

  // ─── 工业监控分组 ───

  // 1. 状态指示灯

  // 2b. 场景统计聚合卡片（从 deviceStore 聚合实时数据，替代硬编码假数据的 industrial-data-card）

  // 2c. 粉尘浓度趋势图（从 deviceStore 订阅粉尘传感器实时值）

  // 2c-2. 煤机位置趋势曲线（综采工作面，复用 DustTrend 的 deviceStore 实时 + GreptimeDB 历史模式）
  // 数据来源：edge-conductor 把 0x061e 的 coalMachine.coalPosition 落库到 sensor_samples(sensor_type="coalMachine.coalPosition")。

  // 2c-3. 综采工作面支架状态表（对标 sprayv2/showzc 的"工作面状态" + "支架状态表"）
  // 数据来源：综采工作面集控器 0x061e alarmSensors 位域（割煤机位置/移架/落架/放顶煤）
  //   + 该集控器子树下的各报警传感器设备（-Alarm-*）触发/电池状态；复用 deviceStatus.parseAlarmBitField。
  // 设备发现：动态绑定（selectedDeviceIds 留空），自动发现带 coalMachine.coalPosition 的综采集控器。

  // 2d. 粉尘浓度预警报警面板（从 deviceStore 订阅粉尘传感器实时值，三级预警/报警）

  // 4. 滚动状态表格
  // 专门针对边缘计算（http 类型数据源）做的适配：属性栏
  //   数据源  → 只列 http 类型数据源
  //   设备勾选 → 调 GET /api/devices/ 拿到全量设备 + 产品元数据，用户手勾选
  //   列字段映射 → 键(表头) + 值(设备字段) 的键值对，自由组合
  // 渲染器：直接消费 deviceStore 里的设备实时状态，不再依赖 dataField

  // 5. 喷雾控制工具栏

  // 6. 视频播放器

  // 7. 定时列表卡片

  // 9. 传感器网格

  // 10. 传感器实时监控面板
  // 与 industrial-sensor-grid 区别：
  //   - sensor-grid 依赖 DataOrchestrator API 拉取（config.dataSourceId），非实时
  //   - sensor-monitor 直接订阅 deviceStore（WebSocket 推送），实时刷新
  //   - 通过 selectedDeviceIds 绑定集控器，自动发现下属传感器

  // ─── 热力图 ───
  componentRegistry.register({
    type: "echart-heatmap",
    name: "热力图",
    icon: "grid_on",
    description: "ECharts 热力图，数据密度与分布可视化",
    category: "ccat_chart",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 400, height: 300 },
    defaultConfig: {
      theme: "dark",
      xAxisData: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      yAxisData: ["Morn", "Noon", "Eve", "Night"],
      data: [[0,0,50],[0,1,30],[0,2,70],[0,3,20],[1,0,60],[1,1,40],[1,2,80],[1,3,30],[2,0,55],[2,1,35],[2,2,65],[2,3,25],[3,0,45],[3,1,25],[3,2,75],[3,3,35],[4,0,50],[4,1,30],[4,2,60],[4,3,20],[5,0,70],[5,1,50],[5,2,85],[5,3,40],[6,0,40],[6,1,20],[6,2,55],[6,3,15]],
      min: 0,
      max: 100,
    },
    capabilities: { resizable: true, rotatable: false, draggable: true, connectable: true, embeddable: false },
    renderer: lazy(() => import("./renderers/echarts/HeatmapChartRenderer").then(m => ({ default: m.HeatmapChartRenderer }))),
    events: [{ id: "click", name: "点击" }],
    actions: [{ id: "updateData", name: "更新数据" }],
    dataSchema: { sourceType: "static", staticData: {} },
    configSchema: [
      // —— 数据源（共享字段组）——
      ...dataSourceSchemaFields,
      { key: "title", label: "标题", type: "text", group: "内容" },
      { key: "xAxisData", label: "X轴", type: "json", group: "内容" },
      { key: "yAxisData", label: "Y轴", type: "json", group: "内容" },
      { key: "data", label: "数据", type: "json", group: "内容", placeholder: "[[x,y,val],...]" },
      { key: "min", label: "最小值", type: "number", group: "数据源" },
      { key: "max", label: "最大值", type: "number", group: "数据源" },
      { key: "showTitle", label: "显示标题", type: "toggle", group: "样式" },
      { key: "theme", label: "主题", type: "select", options: [{ label: "暗色", value: "dark" }, { label: "亮色", value: "light" }], group: "样式" },
      { key: "backgroundColor", label: "背景色", type: "color", group: "样式" },
      { key: "option", label: "自定义配置", type: "json", group: "高级" },
    ],
  });

  // ─── 矩形树图 ───
  componentRegistry.register({
    type: "echart-treemap",
    name: "矩形树图",
    icon: "view_compact",
    description: "ECharts 矩形树图，层级数据占比可视化",
    category: "ccat_chart",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 400, height: 300 },
    defaultConfig: {
      theme: "dark",
      data: [
        { name: "A", value: 40, children: [{ name: "A1", value: 20 }, { name: "A2", value: 20 }] },
        { name: "B", value: 30, children: [{ name: "B1", value: 15 }, { name: "B2", value: 15 }] },
        { name: "C", value: 20 },
        { name: "D", value: 10 },
      ],
      breadcrumb: true,
    },
    capabilities: { resizable: true, rotatable: false, draggable: true, connectable: true, embeddable: false },
    renderer: lazy(() => import("./renderers/echarts/TreemapChartRenderer").then(m => ({ default: m.TreemapChartRenderer }))),
    events: [{ id: "click", name: "点击" }],
    actions: [{ id: "updateData", name: "更新数据" }],
    dataSchema: { sourceType: "static", staticData: {} },
    configSchema: [
      // —— 数据源（共享字段组）——
      ...dataSourceSchemaFields,
      { key: "title", label: "标题", type: "text", group: "内容" },
      { key: "data", label: "数据", type: "json", group: "内容" },
      { key: "breadcrumb", label: "面包屑导航", type: "toggle", group: "样式" },
      { key: "theme", label: "主题", type: "select", options: [{ label: "暗色", value: "dark" }, { label: "亮色", value: "light" }], group: "样式" },
      { key: "backgroundColor", label: "背景色", type: "color", group: "样式" },
      { key: "option", label: "自定义配置", type: "json", group: "高级" },
    ],
  });

  // ─── 旭日图 ───
  componentRegistry.register({
    type: "echart-sunburst",
    name: "旭日图",
    icon: "wb_sunny",
    description: "ECharts 旭日图，多层级数据径向可视化",
    category: "ccat_chart",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 350, height: 300 },
    defaultConfig: {
      theme: "dark",
      data: [
        { name: "A", value: 40, children: [{ name: "A1", value: 20 }, { name: "A2", value: 20 }] },
        { name: "B", value: 30, children: [{ name: "B1", value: 15 }, { name: "B2", value: 15 }] },
        { name: "C", value: 30, children: [{ name: "C1", value: 10 }, { name: "C2", value: 20 }] },
      ],
      radius: ["10%", "85%"],
      sort: "desc",
    },
    capabilities: { resizable: true, rotatable: false, draggable: true, connectable: true, embeddable: false },
    renderer: lazy(() => import("./renderers/echarts/SunburstChartRenderer").then(m => ({ default: m.SunburstChartRenderer }))),
    events: [{ id: "click", name: "点击" }],
    actions: [{ id: "updateData", name: "更新数据" }],
    dataSchema: { sourceType: "static", staticData: {} },
    configSchema: [
      // —— 数据源（共享字段组）——
      ...dataSourceSchemaFields,
      { key: "title", label: "标题", type: "text", group: "内容" },
      { key: "data", label: "数据", type: "json", group: "内容" },
      { key: "radius", label: "半径", type: "json", group: "样式" },
      { key: "sort", label: "排序", type: "select", options: [{ label: "降序", value: "desc" }, { label: "升序", value: "asc" }], group: "样式" },
      { key: "theme", label: "主题", type: "select", options: [{ label: "暗色", value: "dark" }, { label: "亮色", value: "light" }], group: "样式" },
      { key: "backgroundColor", label: "背景色", type: "color", group: "样式" },
      { key: "option", label: "自定义配置", type: "json", group: "高级" },
    ],
  });

  // ─── 箱线图 ───
  componentRegistry.register({
    type: "echart-boxplot",
    name: "箱线图",
    icon: "candlestick_chart",
    description: "ECharts 箱线图，数据分布统计（五数概括法）",
    category: "ccat_chart",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 400, height: 300 },
    defaultConfig: {
      theme: "dark",
      categories: ["A", "B", "C", "D", "E"],
      data: [[655,850,940,980,1070],[760,800,845,885,960],[620,750,810,870,950],[670,780,830,910,990],[730,850,920,960,1020]],
      outliers: [],
    },
    capabilities: { resizable: true, rotatable: false, draggable: true, connectable: true, embeddable: false },
    renderer: lazy(() => import("./renderers/echarts/BoxplotChartRenderer").then(m => ({ default: m.BoxplotChartRenderer }))),
    events: [{ id: "click", name: "点击" }],
    actions: [{ id: "updateData", name: "更新数据" }],
    dataSchema: { sourceType: "static", staticData: {} },
    configSchema: [
      // —— 数据源（共享字段组）——
      ...dataSourceSchemaFields,
      { key: "title", label: "标题", type: "text", group: "内容" },
      { key: "categories", label: "分类", type: "json", group: "内容" },
      { key: "data", label: "数据", type: "json", group: "内容", placeholder: "[[min,Q1,median,Q3,max],...]" },
      { key: "outliers", label: "异常值", type: "json", group: "内容", placeholder: "[[x,y],...]" },
      { key: "theme", label: "主题", type: "select", options: [{ label: "暗色", value: "dark" }, { label: "亮色", value: "light" }], group: "样式" },
      { key: "backgroundColor", label: "背景色", type: "color", group: "样式" },
      { key: "option", label: "自定义配置", type: "json", group: "高级" },
    ],
  });

  // ─── K线图 ───
  componentRegistry.register({
    type: "echart-candlestick",
    name: "K线图",
    icon: "trending_up",
    description: "ECharts K线图，股票/期货等金融数据",
    category: "ccat_chart",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 500, height: 350 },
    defaultConfig: {
      theme: "dark",
      xAxisData: ["2024-01","2024-02","2024-03","2024-04","2024-05","2024-06","2024-07"],
      data: [[2320,2420,2280,2385],[2385,2450,2320,2400],[2400,2480,2350,2420],[2420,2460,2380,2405],[2405,2490,2390,2470],[2470,2520,2440,2490],[2490,2550,2460,2510]],
      showDataZoom: true,
    },
    capabilities: { resizable: true, rotatable: false, draggable: true, connectable: true, embeddable: false },
    renderer: lazy(() => import("./renderers/echarts/CandlestickChartRenderer").then(m => ({ default: m.CandlestickChartRenderer }))),
    events: [{ id: "click", name: "点击" }],
    actions: [{ id: "updateData", name: "更新数据" }],
    dataSchema: { sourceType: "static", staticData: {} },
    configSchema: [
      // —— 数据源（共享字段组）——
      ...dataSourceSchemaFields,
      { key: "title", label: "标题", type: "text", group: "内容" },
      { key: "xAxisData", label: "日期", type: "json", group: "内容" },
      { key: "data", label: "数据", type: "json", group: "内容", placeholder: "[[open,close,low,high],...]" },
      { key: "showDataZoom", label: "数据缩放", type: "toggle", group: "交互" },
      { key: "theme", label: "主题", type: "select", options: [{ label: "暗色", value: "dark" }, { label: "亮色", value: "light" }], group: "样式" },
      { key: "backgroundColor", label: "背景色", type: "color", group: "样式" },
      { key: "option", label: "自定义配置", type: "json", group: "高级" },
    ],
  });

  // ─── 漏斗图 ───
  componentRegistry.register({
    type: "echart-funnel",
    name: "漏斗图",
    icon: "filter_alt",
    description: "ECharts 漏斗图，转化率/流程分析",
    category: "ccat_chart",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 350, height: 300 },
    defaultConfig: {
      theme: "dark",
      data: [
        { name: "展现", value: 100 }, { name: "点击", value: 80 },
        { name: "访问", value: 60 }, { name: "咨询", value: 40 }, { name: "成交", value: 20 },
      ],
      sort: "descending",
      orient: "vertical",
      funnelAlign: "center",
    },
    capabilities: { resizable: true, rotatable: false, draggable: true, connectable: true, embeddable: false },
    renderer: lazy(() => import("./renderers/echarts/FunnelChartRenderer").then(m => ({ default: m.FunnelChartRenderer }))),
    events: [{ id: "click", name: "点击" }],
    actions: [{ id: "updateData", name: "更新数据" }],
    dataSchema: { sourceType: "static", staticData: {} },
    configSchema: [
      // —— 数据源（共享字段组）——
      ...dataSourceSchemaFields,
      { key: "title", label: "标题", type: "text", group: "内容" },
      { key: "data", label: "数据", type: "json", group: "内容" },
      { key: "sort", label: "排序", type: "select", options: [{ label: "降序", value: "descending" }, { label: "升序", value: "ascending" }], group: "样式" },
      { key: "orient", label: "方向", type: "select", options: [{ label: "垂直", value: "vertical" }, { label: "水平", value: "horizontal" }], group: "样式" },
      { key: "funnelAlign", label: "对齐", type: "select", options: [{ label: "居中", value: "center" }, { label: "左", value: "left" }, { label: "右", value: "right" }], group: "样式" },
      { key: "theme", label: "主题", type: "select", options: [{ label: "暗色", value: "dark" }, { label: "亮色", value: "light" }], group: "样式" },
      { key: "backgroundColor", label: "背景色", type: "color", group: "样式" },
      { key: "option", label: "自定义配置", type: "json", group: "高级" },
    ],
  });

  // ─── 桑基图 ───
  componentRegistry.register({
    type: "echart-sankey",
    name: "桑基图",
    icon: "account_tree",
    description: "ECharts 桑基图，能量/物料/资金流动分析",
    category: "ccat_chart",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 500, height: 300 },
    defaultConfig: {
      theme: "dark",
      nodes: [{ name: "a" },{ name: "b" },{ name: "c" },{ name: "d" },{ name: "e" }],
      links: [{ source: "a", target: "b", value: 5 },{ source: "a", target: "c", value: 3 },{ source: "b", target: "d", value: 4 },{ source: "c", target: "d", value: 2 },{ source: "c", target: "e", value: 1 },{ source: "b", target: "e", value: 1 }],
      orient: "horizontal",
      draggable: true,
    },
    capabilities: { resizable: true, rotatable: false, draggable: true, connectable: true, embeddable: false },
    renderer: lazy(() => import("./renderers/echarts/SankeyChartRenderer").then(m => ({ default: m.SankeyChartRenderer }))),
    events: [{ id: "click", name: "点击" }],
    actions: [{ id: "updateData", name: "更新数据" }],
    dataSchema: { sourceType: "static", staticData: {} },
    configSchema: [
      // —— 数据源（共享字段组）——
      ...dataSourceSchemaFields,
      { key: "title", label: "标题", type: "text", group: "内容" },
      { key: "nodes", label: "节点", type: "json", group: "内容" },
      { key: "links", label: "链接", type: "json", group: "内容" },
      { key: "orient", label: "方向", type: "select", options: [{ label: "水平", value: "horizontal" }, { label: "垂直", value: "vertical" }], group: "样式" },
      { key: "draggable", label: "可拖拽", type: "toggle", group: "交互" },
      { key: "theme", label: "主题", type: "select", options: [{ label: "暗色", value: "dark" }, { label: "亮色", value: "light" }], group: "样式" },
      { key: "backgroundColor", label: "背景色", type: "color", group: "样式" },
      { key: "option", label: "自定义配置", type: "json", group: "高级" },
    ],
  });

  // ─── 关系图 ───
  componentRegistry.register({
    type: "echart-graph",
    name: "关系图",
    icon: "hub",
    description: "ECharts 关系图，节点与边的网络拓扑",
    category: "ccat_chart",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 400, height: 350 },
    defaultConfig: {
      theme: "dark",
      nodes: [
        { name: "Node 1", symbolSize: 40, category: 0 },
        { name: "Node 2", symbolSize: 30, category: 1 },
        { name: "Node 3", symbolSize: 30, category: 1 },
        { name: "Node 4", symbolSize: 25, category: 2 },
        { name: "Node 5", symbolSize: 25, category: 2 },
      ],
      links: [
        { source: "Node 1", target: "Node 2" }, { source: "Node 1", target: "Node 3" },
        { source: "Node 2", target: "Node 4" }, { source: "Node 3", target: "Node 5" },
        { source: "Node 4", target: "Node 5" },
      ],
      categories: [{ name: "核心" },{ name: "一级" },{ name: "二级" }],
      layout: "force",
      roam: true,
    },
    capabilities: { resizable: true, rotatable: false, draggable: true, connectable: true, embeddable: false },
    renderer: lazy(() => import("./renderers/echarts/GraphChartRenderer").then(m => ({ default: m.GraphChartRenderer }))),
    events: [{ id: "click", name: "点击" }],
    actions: [{ id: "updateData", name: "更新数据" }],
    dataSchema: { sourceType: "static", staticData: {} },
    configSchema: [
      // —— 数据源（共享字段组）——
      ...dataSourceSchemaFields,
      { key: "title", label: "标题", type: "text", group: "内容" },
      { key: "nodes", label: "节点", type: "json", group: "内容" },
      { key: "links", label: "边", type: "json", group: "内容" },
      { key: "categories", label: "分类", type: "json", group: "内容" },
      { key: "layout", label: "布局", type: "select", options: [{ label: "力导向", value: "force" }, { label: "环形", value: "circular" }, { label: "无", value: "none" }], group: "样式" },
      { key: "roam", label: "可漫游", type: "toggle", group: "交互" },
      { key: "theme", label: "主题", type: "select", options: [{ label: "暗色", value: "dark" }, { label: "亮色", value: "light" }], group: "样式" },
      { key: "backgroundColor", label: "背景色", type: "color", group: "样式" },
      { key: "option", label: "自定义配置", type: "json", group: "高级" },
    ],
  });

  // ─── 树图 ───
  componentRegistry.register({
    type: "echart-tree",
    name: "树图",
    icon: "device_hub",
    description: "ECharts 树图，层级结构可视化",
    category: "ccat_chart",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 500, height: 350 },
    defaultConfig: {
      theme: "dark",
      data: { name: "根", children: [{ name: "A", children: [{ name: "A1" },{ name: "A2" }] },{ name: "B", children: [{ name: "B1" },{ name: "B2" }] }] },
      orient: "LR",
      edgeShape: "curve",
      expandAndCollapse: true,
      initialTreeDepth: 2,
    },
    capabilities: { resizable: true, rotatable: false, draggable: true, connectable: true, embeddable: false },
    renderer: lazy(() => import("./renderers/echarts/TreeChartRenderer").then(m => ({ default: m.TreeChartRenderer }))),
    events: [{ id: "click", name: "点击" }],
    actions: [{ id: "updateData", name: "更新数据" }],
    dataSchema: { sourceType: "static", staticData: {} },
    configSchema: [
      // —— 数据源（共享字段组）——
      ...dataSourceSchemaFields,
      { key: "title", label: "标题", type: "text", group: "内容" },
      { key: "data", label: "数据", type: "json", group: "内容" },
      { key: "orient", label: "方向", type: "select", options: [{ label: "从左到右", value: "LR" }, { label: "从右到左", value: "RL" }, { label: "从上到下", value: "TB" }, { label: "从下到上", value: "BT" }], group: "样式" },
      { key: "edgeShape", label: "边形状", type: "select", options: [{ label: "曲线", value: "curve" }, { label: "折线", value: "polyline" }], group: "样式" },
      { key: "expandAndCollapse", label: "可折叠", type: "toggle", group: "交互" },
      { key: "initialTreeDepth", label: "初始展开深度", type: "number", min: 1, group: "交互" },
      { key: "theme", label: "主题", type: "select", options: [{ label: "暗色", value: "dark" }, { label: "亮色", value: "light" }], group: "样式" },
      { key: "backgroundColor", label: "背景色", type: "color", group: "样式" },
      { key: "option", label: "自定义配置", type: "json", group: "高级" },
    ],
  });

  // ─── 主题河流图 ───
  componentRegistry.register({
    type: "echart-themeriver",
    name: "主题河流图",
    icon: "waves",
    description: "ECharts 主题河流图，时序多主题演变可视化",
    category: "ccat_chart",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 500, height: 300 },
    defaultConfig: {
      theme: "dark",
      data: [
        ["2024-01",10,"A"],["2024-01",15,"B"],["2024-01",8,"C"],
        ["2024-02",12,"A"],["2024-02",18,"B"],["2024-02",10,"C"],
        ["2024-03",15,"A"],["2024-03",12,"B"],["2024-03",14,"C"],
        ["2024-04",18,"A"],["2024-04",8,"B"],["2024-04",16,"C"],
        ["2024-05",14,"A"],["2024-05",20,"B"],["2024-05",12,"C"],
      ],
    },
    capabilities: { resizable: true, rotatable: false, draggable: true, connectable: true, embeddable: false },
    renderer: lazy(() => import("./renderers/echarts/ThemeRiverChartRenderer").then(m => ({ default: m.ThemeRiverChartRenderer }))),
    events: [{ id: "click", name: "点击" }],
    actions: [{ id: "updateData", name: "更新数据" }],
    dataSchema: { sourceType: "static", staticData: {} },
    configSchema: [
      // —— 数据源（共享字段组）——
      ...dataSourceSchemaFields,
      { key: "title", label: "标题", type: "text", group: "内容" },
      { key: "data", label: "数据", type: "json", group: "内容", placeholder: "[[time,value,theme],...]" },
      { key: "theme", label: "主题", type: "select", options: [{ label: "暗色", value: "dark" }, { label: "亮色", value: "light" }], group: "样式" },
      { key: "backgroundColor", label: "背景色", type: "color", group: "样式" },
      { key: "option", label: "自定义配置", type: "json", group: "高级" },
    ],
  });

  // ─── 平行坐标图 ───
  componentRegistry.register({
    type: "echart-parallel",
    name: "平行坐标图",
    icon: "vertical_align_center",
    description: "ECharts 平行坐标图，多维数据对比分析",
    category: "ccat_chart",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 500, height: 300 },
    defaultConfig: {
      theme: "dark",
      parallelAxis: [
        { dim: 0, name: "Price" }, { dim: 1, name: "Net Weight" },
        { dim: 2, name: "Amount" }, { dim: 3, name: "Score", min: 0, max: 100 },
      ],
      data: [[12.99,100,82,77],[9.99,80,77,69],[20,120,60,85],[15,110,71,72],[30,150,90,88]],
    },
    capabilities: { resizable: true, rotatable: false, draggable: true, connectable: true, embeddable: false },
    renderer: lazy(() => import("./renderers/echarts/ParallelChartRenderer").then(m => ({ default: m.ParallelChartRenderer }))),
    events: [{ id: "click", name: "点击" }, { id: "brushSelected", name: "框选" }],
    actions: [{ id: "updateData", name: "更新数据" }],
    dataSchema: { sourceType: "static", staticData: {} },
    configSchema: [
      // —— 数据源（共享字段组）——
      ...dataSourceSchemaFields,
      { key: "title", label: "标题", type: "text", group: "内容" },
      { key: "parallelAxis", label: "坐标轴", type: "json", group: "内容" },
      { key: "data", label: "数据", type: "json", group: "内容" },
      { key: "theme", label: "主题", type: "select", options: [{ label: "暗色", value: "dark" }, { label: "亮色", value: "light" }], group: "样式" },
      { key: "backgroundColor", label: "背景色", type: "color", group: "样式" },
      { key: "option", label: "自定义配置", type: "json", group: "高级" },
    ],
  });

  // ─── 地图 ───
  componentRegistry.register({
    type: "echart-map",
    name: "地图",
    icon: "public",
    description: "ECharts 地图，区域数据可视化",
    category: "ccat_chart",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 500, height: 400 },
    defaultConfig: {
      theme: "dark",
      mapName: "china",
      data: [{ name: "北京", value: 200 },{ name: "上海", value: 180 },{ name: "广东", value: 150 },{ name: "四川", value: 120 },{ name: "浙江", value: 100 }],
      roam: true,
      visualMapMin: 0,
      visualMapMax: 200,
    },
    capabilities: { resizable: true, rotatable: false, draggable: true, connectable: true, embeddable: false },
    renderer: lazy(() => import("./renderers/echarts/MapChartRenderer").then(m => ({ default: m.MapChartRenderer }))),
    events: [{ id: "click", name: "点击" }],
    actions: [{ id: "updateData", name: "更新数据" }],
    dataSchema: { sourceType: "static", staticData: {} },
    configSchema: [
      // —— 数据源（共享字段组）——
      ...dataSourceSchemaFields,
      { key: "title", label: "标题", type: "text", group: "内容" },
      { key: "mapName", label: "地图名", type: "text", group: "内容" },
      { key: "data", label: "数据", type: "json", group: "内容" },
      { key: "roam", label: "可漫游", type: "toggle", group: "交互" },
      { key: "visualMapMin", label: "色阶最小值", type: "number", group: "数据源" },
      { key: "visualMapMax", label: "色阶最大值", type: "number", group: "数据源" },
      { key: "theme", label: "主题", type: "select", options: [{ label: "暗色", value: "dark" }, { label: "亮色", value: "light" }], group: "样式" },
      { key: "backgroundColor", label: "背景色", type: "color", group: "样式" },
      { key: "option", label: "自定义配置", type: "json", group: "高级" },
    ],
  });

  // ─── 线图(航线) ───
  componentRegistry.register({
    type: "echart-lines",
    name: "线图",
    icon: "timeline",
    description: "ECharts 线图/航线图，地理轨迹与流动效果",
    category: "ccat_chart",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 500, height: 400 },
    defaultConfig: {
      theme: "dark",
      mapName: "china",
      linesData: [{ coords: [[116.46,39.92],[121.48,31.22]] },{ coords: [[116.46,39.92],[104.06,30.67]] },{ coords: [[121.48,31.22],[113.23,23.16]] }],
      pointsData: [{ name: "北京", value: [116.46,39.92] },{ name: "上海", value: [121.48,31.22] },{ name: "成都", value: [104.06,30.67] },{ name: "广州", value: [113.23,23.16] }],
      effectShow: true,
    },
    capabilities: { resizable: true, rotatable: false, draggable: true, connectable: true, embeddable: false },
    renderer: lazy(() => import("./renderers/echarts/LinesChartRenderer").then(m => ({ default: m.LinesChartRenderer }))),
    events: [{ id: "click", name: "点击" }],
    actions: [{ id: "updateData", name: "更新数据" }],
    dataSchema: { sourceType: "static", staticData: {} },
    configSchema: [
      // —— 数据源（共享字段组）——
      ...dataSourceSchemaFields,
      { key: "title", label: "标题", type: "text", group: "内容" },
      { key: "mapName", label: "地图名", type: "text", group: "内容" },
      { key: "linesData", label: "线数据", type: "json", group: "内容" },
      { key: "pointsData", label: "点数据", type: "json", group: "内容" },
      { key: "effectShow", label: "流动效果", type: "toggle", group: "样式" },
      { key: "theme", label: "主题", type: "select", options: [{ label: "暗色", value: "dark" }, { label: "亮色", value: "light" }], group: "样式" },
      { key: "backgroundColor", label: "背景色", type: "color", group: "样式" },
      { key: "option", label: "自定义配置", type: "json", group: "高级" },
    ],
  });

  // ─── 涟漪散点图 ───
  componentRegistry.register({
    type: "echart-effectscatter",
    name: "涟漪散点图",
    icon: "bubble_chart",
    description: "ECharts 涟漪散点图，突出关键数据点",
    category: "ccat_chart",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 400, height: 300 },
    defaultConfig: {
      theme: "dark",
      data: [{ name: "A", value: [10,20,50] },{ name: "B", value: [30,40,30] },{ name: "C", value: [50,60,80] },{ name: "D", value: [70,30,60] }],
      symbolSize: 15,
      showEffect: true,
      rippleBrushType: "stroke",
    },
    capabilities: { resizable: true, rotatable: false, draggable: true, connectable: true, embeddable: false },
    renderer: lazy(() => import("./renderers/echarts/EffectScatterChartRenderer").then(m => ({ default: m.EffectScatterChartRenderer }))),
    events: [{ id: "click", name: "点击" }],
    actions: [{ id: "updateData", name: "更新数据" }],
    dataSchema: { sourceType: "static", staticData: {} },
    configSchema: [
      // —— 数据源（共享字段组）——
      ...dataSourceSchemaFields,
      { key: "title", label: "标题", type: "text", group: "内容" },
      { key: "data", label: "数据", type: "json", group: "内容" },
      { key: "symbolSize", label: "点大小", type: "number", min: 5, group: "样式" },
      { key: "showEffect", label: "涟漪效果", type: "toggle", group: "样式" },
      { key: "rippleBrushType", label: "涟漪类型", type: "select", options: [{ label: "描边", value: "stroke" }, { label: "填充", value: "fill" }], group: "样式" },
      { key: "theme", label: "主题", type: "select", options: [{ label: "暗色", value: "dark" }, { label: "亮色", value: "light" }], group: "样式" },
      { key: "backgroundColor", label: "背景色", type: "color", group: "样式" },
      { key: "option", label: "自定义配置", type: "json", group: "高级" },
    ],
  });

  // ─── 象形柱图 ───
  componentRegistry.register({
    type: "echart-pictorialbar",
    name: "象形柱图",
    icon: "view_week",
    description: "ECharts 象形柱图，使用图形符号填充柱体",
    category: "ccat_chart",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 400, height: 300 },
    defaultConfig: {
      theme: "dark",
      categories: ["A", "B", "C", "D", "E"],
      values: [60, 80, 45, 90, 70],
      max: 100,
      symbol: "rect",
      symbolRepeat: true,
      symbolSize: [12, 6],
      symbolMargin: 2,
    },
    capabilities: { resizable: true, rotatable: false, draggable: true, connectable: true, embeddable: false },
    renderer: lazy(() => import("./renderers/echarts/PictorialBarChartRenderer").then(m => ({ default: m.PictorialBarChartRenderer }))),
    events: [{ id: "click", name: "点击" }],
    actions: [{ id: "updateData", name: "更新数据" }],
    dataSchema: { sourceType: "static", staticData: {} },
    configSchema: [
      // —— 数据源（共享字段组）——
      ...dataSourceSchemaFields,
      { key: "title", label: "标题", type: "text", group: "内容" },
      { key: "categories", label: "分类", type: "json", group: "内容" },
      { key: "values", label: "数值", type: "json", group: "内容" },
      { key: "max", label: "最大值", type: "number", group: "数据源" },
      { key: "symbol", label: "图形", type: "select", options: [{ label: "矩形", value: "rect" }, { label: "圆形", value: "circle" }, { label: "三角形", value: "triangle" }, { label: "菱形", value: "diamond" }], group: "样式" },
      { key: "symbolRepeat", label: "重复填充", type: "toggle", group: "样式" },
      { key: "symbolSize", label: "图形尺寸", type: "json", group: "样式", placeholder: "[12,6]" },
      { key: "symbolMargin", label: "间距", type: "number", min: 0, group: "样式" },
      { key: "theme", label: "主题", type: "select", options: [{ label: "暗色", value: "dark" }, { label: "亮色", value: "light" }], group: "样式" },
      { key: "backgroundColor", label: "背景色", type: "color", group: "样式" },
      { key: "option", label: "自定义配置", type: "json", group: "高级" },
    ],
  });

  // ─── 自定义图表 ───
  componentRegistry.register({
    type: "echart-custom",
    name: "自定义图表",
    icon: "code",
    description: "ECharts 自定义系列，完全自定义 renderItem 渲染逻辑",
    category: "ccat_chart",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 400, height: 300 },
    defaultConfig: {
      theme: "dark",
      option: {
        xAxis: { type: "category", data: ["A", "B", "C", "D"] },
        yAxis: { type: "value" },
        series: [{ type: "custom", data: [120, 200, 150, 80] }],
      },
    },
    capabilities: { resizable: true, rotatable: false, draggable: true, connectable: true, embeddable: false },
    renderer: lazy(() => import("./renderers/echarts/CustomChartRenderer").then(m => ({ default: m.CustomChartRenderer }))),
    events: [{ id: "click", name: "点击" }],
    actions: [{ id: "updateData", name: "更新数据" }, { id: "updateConfig", name: "更新配置" }],
    dataSchema: { sourceType: "static", staticData: {} },
    configSchema: [
      // —— 数据源（共享字段组）——
      ...dataSourceSchemaFields,
      { key: "option", label: "ECharts配置", type: "json", group: "内容" },
      { key: "theme", label: "主题", type: "select", options: [{ label: "暗色", value: "dark" }, { label: "亮色", value: "light" }], group: "样式" },
      { key: "backgroundColor", label: "背景色", type: "color", group: "样式" },
    ],
  });

  // ═══════════════════════════════════════════════════════════════
  // 装饰组件已移除（工业场景遗留，网站编辑器不需要）
  // ═══════════════════════════════════════════════════════════════

  // ─── 标题框（左侧指示器）───

  // ─── 标题框（渐变条）───

  // ─── 标题框（科技角部）───

  // ─── 标题框（菱形中心）───

  // ─── 数据卡片装饰 ───

  // ─── 状态指示灯装饰 ───

  // ─── 进度条装饰 ───

  // ─── 圆形进度装饰 ───

  // ─── 扫描线装饰 ───

  // ─── 虚线框装饰 ───

  // ═══════════════════════════════════════════════════════════════
  // 日志监控视图组件
  // ═══════════════════════════════════════════════════════════════

  // Log Filter Panel - 日志筛选面板

  // Operation Log Table - 操作日志表格

  // Device Event Table - 设备事件表格

  // System Event Table - 系统事件表格

  // Log Overview Cards - 日志监控视图「场景状态概览卡」

  // 日志监控视图「粉尘浓度趋势图」（专用 log-monitor 链路，type=dust0614）

  // 日志监控视图「分析洞察报告」（专用 log-monitor/report 端点，消费主视图设备池）

  // ─────────────────────────────────────────────────────────────────────
  // 日志监控视图升级组件（2026-08-21）：
  // 引入 echarts 把日志的 4 类原始字段聚合为可视化（alarm-trend-stacked
  // 为 event_level 三色堆叠面积 + 命令/结果两个 donut）。数据源 =
  // logMonitorApi（scene 作用域自动注入）。
  // 注：旧版 AlarmTrendChart（单色 error bar）与 LogStatsCards 已于 2026-08-22
  // 删除——前者被 alarm-trend-stacked 严格超集替代，后者与 overview-cards 重复。
  // ─────────────────────────────────────────────────────────────────────

  // 操作命令分布 Donut（按 command_code 聚合）

  // 操作结果分布 Donut（ok/fail/partial/pending + 中心成功率）

  // 事件级别堆叠面积（升级 alarm-trend：info/warn/error 三层 24h 时序）

}
