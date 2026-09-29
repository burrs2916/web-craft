import { componentRegistry, lazy } from "../registryCore";
import { dataSourceSchemaFields } from "../dataSourceFields";

export function registerFlowCharts(): void {
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
    renderer: lazy(() => import("../renderers/echarts/SankeyChartRenderer").then(m => ({ default: m.SankeyChartRenderer }))),
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
    renderer: lazy(() => import("../renderers/echarts/GraphChartRenderer").then(m => ({ default: m.GraphChartRenderer }))),
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
    renderer: lazy(() => import("../renderers/echarts/TreeChartRenderer").then(m => ({ default: m.TreeChartRenderer }))),
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
    renderer: lazy(() => import("../renderers/echarts/ThemeRiverChartRenderer").then(m => ({ default: m.ThemeRiverChartRenderer }))),
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
    renderer: lazy(() => import("../renderers/echarts/ParallelChartRenderer").then(m => ({ default: m.ParallelChartRenderer }))),
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
}
