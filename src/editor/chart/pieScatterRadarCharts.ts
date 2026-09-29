import { componentRegistry, lazy } from "../registryCore";
import { dataSourceSchemaFields } from "../dataSourceFields";

export function registerPieScatterRadarCharts(): void {
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
    renderer: lazy(() => import("../renderers/echarts/PieChartRenderer").then(m => ({ default: m.PieChartRenderer }))),
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
    renderer: lazy(() => import("../renderers/echarts/ScatterChartRenderer").then(m => ({ default: m.ScatterChartRenderer }))),
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
    renderer: lazy(() => import("../renderers/echarts/RadarChartRenderer").then(m => ({ default: m.RadarChartRenderer }))),
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
}
