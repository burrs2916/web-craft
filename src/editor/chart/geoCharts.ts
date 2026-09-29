import { componentRegistry, lazy } from "../registryCore";
import { dataSourceSchemaFields } from "../dataSourceFields";

export function registerGeoCharts(): void {
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
    renderer: lazy(() => import("../renderers/echarts/MapChartRenderer").then(m => ({ default: m.MapChartRenderer }))),
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
    renderer: lazy(() => import("../renderers/echarts/LinesChartRenderer").then(m => ({ default: m.LinesChartRenderer }))),
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
    renderer: lazy(() => import("../renderers/echarts/EffectScatterChartRenderer").then(m => ({ default: m.EffectScatterChartRenderer }))),
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
    renderer: lazy(() => import("../renderers/echarts/PictorialBarChartRenderer").then(m => ({ default: m.PictorialBarChartRenderer }))),
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
}
