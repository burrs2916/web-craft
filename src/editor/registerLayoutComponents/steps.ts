import { componentRegistry, lazy } from "../registryCore";
import { dataSourceSchemaFieldsNoStatic } from "../dataSourceFields";
import type { ConfigField } from "../../types/editor";

// ─── 步骤条（水平/垂直）───
// 方向由组件类型锁定，不再暴露 direction 切换，避免用户混淆。
// 两个类型共用同一渲染器 StepsRenderer 与 codegen steps，仅 direction / 尺寸默认值不同。
const buildStepsConfigSchema = (): ConfigField[] => [
  // —— 数据 ——
  { key: "steps", label: "步骤数据", type: "list-editor", group: "数据源",
    itemLabelKey: "title",
    addItemLabel: "添加步骤",
    hidden: (c) => (c.dataMode ?? "static") === "api",
    help: "逐条添加步骤，填写标题和描述即可；切换「接口读取」时由接口响应驱动",
    itemFields: [
      { key: "title", label: "标题", type: "text" },
      { key: "description", label: "描述", type: "text" },
    ] },
  { key: "current", label: "当前步骤", type: "number", min: 0, max: 50, group: "数据源",
    help: "0 表示第一步正在进行，从 0 开始计数；接口返回数字或 current 字段时自动更新" },
  // —— 数据源（条目型专用字段组：静态=内容项，接口=API 响应驱动）——
  ...dataSourceSchemaFieldsNoStatic,
  // —— 布局 ——
  { key: "variant", label: "样式", type: "select", group: "布局",
    options: [
      { label: "圆点", value: "dot" },
      { label: "数字", value: "number" },
      { label: "方形", value: "square" },
    ] },
  { key: "showDescription", label: "显示描述", type: "toggle", group: "布局" },
  { key: "showLastConnector", label: "末尾连接线", type: "toggle", group: "布局",
    help: "在最后一步之后继续绘制连接线，形成闭环" },
  { key: "stepSize", label: "步骤点大小", type: "number", min: 16, max: 56, group: "布局" },
  { key: "gap", label: "步骤间距", type: "number", min: 0, max: 40, group: "布局",
    help: "相邻步骤之间的距离，垂直模式下同时保证连接线最小长度" },
  // —— 颜色 ——
  { key: "activeColor", label: "进行中颜色", type: "color", group: "颜色" },
  { key: "completedColor", label: "已完成颜色", type: "color", group: "颜色" },
  { key: "pendingColor", label: "未开始颜色", type: "color", group: "颜色" },
  { key: "activeBgColor", label: "进行中背景", type: "color", group: "颜色" },
  { key: "completedBgColor", label: "已完成背景", type: "color", group: "颜色" },
  { key: "connectorColor", label: "连接线颜色", type: "color", group: "颜色" },
  // —— 文字 ——
  { key: "titleColor", label: "标题颜色", type: "color", group: "文字" },
  { key: "titleFontSize", label: "标题字号", type: "number", min: 10, max: 24, group: "文字" },
  { key: "descColor", label: "描述颜色", type: "color", group: "文字" },
  { key: "descFontSize", label: "描述字号", type: "number", min: 10, max: 20, group: "文字" },
];

const STEPS_DEFAULT_CONFIG = {
  steps: [
    { title: "步骤一", description: "填写信息" },
    { title: "步骤二", description: "确认信息" },
    { title: "步骤三", description: "完成提交" },
  ],
  current: 1,
  variant: "dot",
  showDescription: true,
  showLastConnector: false,
  gap: 0,
  activeColor: "#FF9800",
  completedColor: "#4CAF50",
  pendingColor: "rgba(255,255,255,0.25)",
  activeBgColor: "rgba(255,152,0,0.15)",
  completedBgColor: "rgba(76,175,80,0.15)",
  connectorColor: "rgba(255,255,255,0.15)",
  titleColor: "rgba(255,255,255,0.85)",
  titleFontSize: 14,
  descColor: "rgba(255,255,255,0.45)",
  descFontSize: 12,
  stepSize: 28,
} as const;

export function registerSteps(): void {
  // ─── 水平步骤条 ───
  componentRegistry.register({
    type: "steps",
    name: "水平步骤条",
    icon: "view_timeline",
    description: "水平流程步骤指示器，支持圆点/数字/方形样式、完成/进行/未开始状态",
    category: "ccat_layout",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 480, height: 120 },
    minSize: { width: 200, height: 50 },
    defaultConfig: { ...STEPS_DEFAULT_CONFIG, direction: "horizontal" },
    capabilities: {
      resizable: true,
      rotatable: false,
      draggable: true,
      connectable: false,
      embeddable: false,
    },
    renderer: lazy(() => import("../renderers/StepsRenderer").then(m => ({ default: m.StepsRenderer }))),
    configSchema: buildStepsConfigSchema(),
  });
}

export function registerStepsVertical(): void {
  // ─── 垂直步骤条 ───
  componentRegistry.register({
    type: "steps-vertical",
    name: "垂直步骤条",
    icon: "vertical_align_center",
    description: "垂直流程步骤指示器，支持圆点/数字/方形样式、完成/进行/未开始状态",
    category: "ccat_layout",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 260, height: 340 },
    minSize: { width: 120, height: 180 },
    defaultConfig: { ...STEPS_DEFAULT_CONFIG, direction: "vertical", gap: 8 },
    capabilities: {
      resizable: true,
      rotatable: false,
      draggable: true,
      connectable: false,
      embeddable: false,
    },
    renderer: lazy(() => import("../renderers/StepsRenderer").then(m => ({ default: m.StepsRenderer }))),
    configSchema: buildStepsConfigSchema(),
  });
}
