import { componentRegistry, lazy } from "../registryCore";
import { dataSourceSchemaFields } from "../dataSourceFields";

export function registerRelationCharts(): void {
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
    renderer: lazy(() => import("../renderers/echarts/HeatmapChartRenderer").then(m => ({ default: m.HeatmapChartRenderer }))),
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
    renderer: lazy(() => import("../renderers/echarts/TreemapChartRenderer").then(m => ({ default: m.TreemapChartRenderer }))),
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
    renderer: lazy(() => import("../renderers/echarts/SunburstChartRenderer").then(m => ({ default: m.SunburstChartRenderer }))),
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
    renderer: lazy(() => import("../renderers/echarts/BoxplotChartRenderer").then(m => ({ default: m.BoxplotChartRenderer }))),
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
    renderer: lazy(() => import("../renderers/echarts/CandlestickChartRenderer").then(m => ({ default: m.CandlestickChartRenderer }))),
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
    renderer: lazy(() => import("../renderers/echarts/FunnelChartRenderer").then(m => ({ default: m.FunnelChartRenderer }))),
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
}
