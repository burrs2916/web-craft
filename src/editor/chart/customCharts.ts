import { componentRegistry, lazy } from "../registryCore";
import { dataSourceSchemaFields } from "../dataSourceFields";

export function registerCustomCharts(): void {
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
    renderer: lazy(() => import("../renderers/echarts/CustomChartRenderer").then(m => ({ default: m.CustomChartRenderer }))),
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
