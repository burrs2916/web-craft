import { componentRegistry, lazy } from "../registryCore";
import { dataSourceSchemaFieldsNoStatic } from "../dataSourceFields";

export function registerTimeline(): void {
  // ─── 时间线 ───
  componentRegistry.register({
    type: "timeline",
    name: "时间线",
    icon: "linear_scale",
    description: "时间轴组件，支持左侧/右侧/交替三种布局模式，展示事件时间序列",
    category: "ccat_layout",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 400, height: 320 },
    minSize: { width: 200, height: 160 },
    defaultConfig: {
      items: [
        { title: "事件一", content: "这是事件一的内容描述。", timestamp: "2024-01-01", color: "" },
        { title: "事件二", content: "这是事件二的内容描述。", timestamp: "2024-03-15", color: "" },
        { title: "事件三", content: "这是事件三的内容描述。", timestamp: "2024-06-30", color: "" },
      ],
      mode: "left",
      dotSize: 12,
      lineColor: "rgba(255,255,255,0.15)",
      dotColor: "#FF9800",
      titleColor: "rgba(255,255,255,0.85)",
      titleFontSize: 14,
      contentColor: "rgba(255,255,255,0.6)",
      contentFontSize: 13,
      timestampColor: "rgba(255,255,255,0.35)",
      timestampFontSize: 12,
      itemGap: 20,
      paddingX: 16,
    },
    capabilities: {
      resizable: true,
      rotatable: false,
      draggable: true,
      connectable: false,
      embeddable: false,
    },
    renderer: lazy(() => import("../renderers/TimelineRenderer").then(m => ({ default: m.TimelineRenderer }))),
    configSchema: [
      // —— 数据 ——
      { key: "items", label: "时间线数据", type: "list-editor", group: "数据源",
        itemLabelKey: "title", addItemLabel: "添加事件",
        hidden: (c) => (c.dataMode ?? "static") === "api",
        help: "逐条添加事件，填写标题/描述/时间/颜色即可；切换「接口读取」时由接口响应驱动",
        itemFields: [
          { key: "title", label: "标题", type: "text" },
          { key: "content", label: "描述", type: "text" },
          { key: "timestamp", label: "时间", type: "text" },
          { key: "color", label: "圆点颜色", type: "color" },
        ] },
      // —— 数据源（条目型专用字段组：静态=内容项，接口=API 响应驱动）——
      ...dataSourceSchemaFieldsNoStatic,
      // —— 布局 ——
      { key: "mode", label: "布局模式", type: "select", group: "布局",
        options: [
          { label: "左侧", value: "left" },
          { label: "右侧", value: "right" },
          { label: "交替", value: "alternate" },
        ] },
      { key: "dotSize", label: "圆点大小", type: "number", min: 6, max: 24, group: "布局" },
      { key: "itemGap", label: "项间距", type: "number", min: 8, max: 60, group: "布局" },
      { key: "paddingX", label: "水平内边距", type: "number", min: 0, max: 40, group: "布局" },
      // —— 颜色 ——
      { key: "dotColor", label: "圆点颜色", type: "color", group: "颜色" },
      { key: "lineColor", label: "连线颜色", type: "color", group: "颜色" },
      { key: "titleColor", label: "标题颜色", type: "color", group: "颜色" },
      { key: "contentColor", label: "内容颜色", type: "color", group: "颜色" },
      { key: "timestampColor", label: "时间戳颜色", type: "color", group: "颜色" },
      // —— 字号 ——
      { key: "titleFontSize", label: "标题字号", type: "number", min: 10, max: 24, group: "字号" },
      { key: "contentFontSize", label: "内容字号", type: "number", min: 10, max: 20, group: "字号" },
      { key: "timestampFontSize", label: "时间戳字号", type: "number", min: 10, max: 18, group: "字号" },
    ],
  });
}
