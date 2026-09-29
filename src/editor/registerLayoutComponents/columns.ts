import { componentRegistry, lazy } from "../registryCore";

export function registerColumns(): void {
  // ─── 分栏 ───
  componentRegistry.register({
    type: "columns",
    name: "分栏",
    icon: "view_column",
    description: "水平分栏布局，每栏可独立设置宽度（比例/固定/自适应），支持垂直对齐",
    category: "ccat_layout",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 480, height: 240 },
    minSize: { width: 60, height: 40 },
    defaultConfig: {
      // 基础
      count: 3,
      gap: 12,
      alignItems: "stretch",
      // 每栏配置（最多 6 栏）
      col1Type: "fr", col1Value: 1,
      col2Type: "fr", col2Value: 1,
      col3Type: "fr", col3Value: 1,
      col4Type: "fr", col4Value: 1,
      col5Type: "fr", col5Value: 1,
      col6Type: "fr", col6Value: 1,
      // 栏线
      showLines: true,
      lineColor: "rgba(255,255,255,0.12)",
      lineStyle: "dashed",
      lineWidth: 1,
      // 栏背景
      showCellBg: false,
      cellBg: "rgba(255,255,255,0.03)",
      // 背景
      backgroundEnabled: false,
      backgroundColor: "rgba(255,255,255,0.02)",
      backgroundOpacity: 100,
      // 边框
      borderEnabled: false,
      borderColor: "rgba(255,255,255,0.1)",
      borderWidth: 1,
      borderStyle: "solid",
      // 外观
      borderRadius: 0,
      paddingX: 0,
      paddingY: 0,
      // 阴影
      shadowEnabled: false,
      shadowOffsetX: 0,
      shadowOffsetY: 4,
      shadowBlur: 12,
      shadowSpread: 0,
      shadowColor: "rgba(0,0,0,0.3)",
      // 溢出
      overflow: "hidden",
    },
    capabilities: {
      resizable: true,
      rotatable: false,
      draggable: true,
      connectable: false,
      embeddable: true,
    },
    renderer: lazy(() => import("../renderers/ColumnsRenderer").then(m => ({ default: m.ColumnsRenderer }))),
    configSchema: [
      // —— 基础 ——
      { key: "count", label: "栏数", type: "number", min: 1, max: 6, group: "基础" },
      { key: "gap", label: "栏间距", type: "number", min: 0, max: 100, group: "基础" },
      { key: "alignItems", label: "垂直对齐", type: "select", options: [
        { label: "拉伸", value: "stretch" },
        { label: "顶部", value: "flex-start" },
        { label: "居中", value: "center" },
        { label: "底部", value: "flex-end" },
      ], group: "基础" },
      // —— 第 1 栏 ——
      { key: "col1Type", label: "第 1 栏", type: "select", options: [
        { label: "比例 (fr)", value: "fr" },
        { label: "固定像素 (px)", value: "px" },
        { label: "内容自适应", value: "auto" },
      ], group: "栏宽设置" },
      { key: "col1Value", label: "第 1 栏数值", type: "number", min: 1, max: 2000, step: 1,
        group: "栏宽设置", hidden: (c) => c.col1Type === "auto" || (c.count as number) < 1 },
      // —— 第 2 栏 ——
      { key: "col2Type", label: "第 2 栏", type: "select", options: [
        { label: "比例 (fr)", value: "fr" },
        { label: "固定像素 (px)", value: "px" },
        { label: "内容自适应", value: "auto" },
      ], group: "栏宽设置", hidden: (c) => (c.count as number) < 2 },
      { key: "col2Value", label: "第 2 栏数值", type: "number", min: 1, max: 2000, step: 1,
        group: "栏宽设置", hidden: (c) => c.col2Type === "auto" || (c.count as number) < 2 },
      // —— 第 3 栏 ——
      { key: "col3Type", label: "第 3 栏", type: "select", options: [
        { label: "比例 (fr)", value: "fr" },
        { label: "固定像素 (px)", value: "px" },
        { label: "内容自适应", value: "auto" },
      ], group: "栏宽设置", hidden: (c) => (c.count as number) < 3 },
      { key: "col3Value", label: "第 3 栏数值", type: "number", min: 1, max: 2000, step: 1,
        group: "栏宽设置", hidden: (c) => c.col3Type === "auto" || (c.count as number) < 3 },
      // —— 第 4 栏 ——
      { key: "col4Type", label: "第 4 栏", type: "select", options: [
        { label: "比例 (fr)", value: "fr" },
        { label: "固定像素 (px)", value: "px" },
        { label: "内容自适应", value: "auto" },
      ], group: "栏宽设置", hidden: (c) => (c.count as number) < 4 },
      { key: "col4Value", label: "第 4 栏数值", type: "number", min: 1, max: 2000, step: 1,
        group: "栏宽设置", hidden: (c) => c.col4Type === "auto" || (c.count as number) < 4 },
      // —— 第 5 栏 ——
      { key: "col5Type", label: "第 5 栏", type: "select", options: [
        { label: "比例 (fr)", value: "fr" },
        { label: "固定像素 (px)", value: "px" },
        { label: "内容自适应", value: "auto" },
      ], group: "栏宽设置", hidden: (c) => (c.count as number) < 5 },
      { key: "col5Value", label: "第 5 栏数值", type: "number", min: 1, max: 2000, step: 1,
        group: "栏宽设置", hidden: (c) => c.col5Type === "auto" || (c.count as number) < 5 },
      // —— 第 6 栏 ——
      { key: "col6Type", label: "第 6 栏", type: "select", options: [
        { label: "比例 (fr)", value: "fr" },
        { label: "固定像素 (px)", value: "px" },
        { label: "内容自适应", value: "auto" },
      ], group: "栏宽设置", hidden: (c) => (c.count as number) < 6 },
      { key: "col6Value", label: "第 6 栏数值", type: "number", min: 1, max: 2000, step: 1,
        group: "栏宽设置", hidden: (c) => c.col6Type === "auto" || (c.count as number) < 6 },
      // —— 栏线 ——
      { key: "showLines", label: "显示栏线", type: "toggle", group: "栏线" },
      { key: "lineColor", label: "栏线颜色", type: "color", group: "栏线", hidden: (c) => !c.showLines },
      { key: "lineStyle", label: "栏线样式", type: "select", options: [
        { label: "实线", value: "solid" },
        { label: "虚线", value: "dashed" },
        { label: "点线", value: "dotted" },
      ], group: "栏线", hidden: (c) => !c.showLines },
      { key: "lineWidth", label: "栏线粗细", type: "number", min: 1, max: 10, group: "栏线", hidden: (c) => !c.showLines },
      // —— 外观 ——
      { key: "showCellBg", label: "栏背景", type: "toggle", group: "外观" },
      { key: "cellBg", label: "栏背景色", type: "color", group: "外观", hidden: (c) => !c.showCellBg },
      { key: "borderRadius", label: "圆角", type: "number", min: 0, max: 50, group: "外观" },
      { key: "paddingX", label: "水平内边距", type: "number", min: 0, max: 200, group: "外观" },
      { key: "paddingY", label: "垂直内边距", type: "number", min: 0, max: 200, group: "外观" },
      { key: "overflow", label: "内容溢出", type: "select", options: [
        { label: "隐藏", value: "hidden" },
        { label: "滚动", value: "scroll" },
        { label: "自动", value: "auto" },
        { label: "显示", value: "visible" },
      ], group: "外观" },
      // —— 背景 ——
      { key: "backgroundEnabled", label: "背景", type: "toggle", group: "背景" },
      { key: "backgroundColor", label: "背景色", type: "color", group: "背景", hidden: (c) => !c.backgroundEnabled },
      { key: "backgroundOpacity", label: "背景透明度", type: "slider", min: 0, max: 100, step: 5, group: "背景", hidden: (c) => !c.backgroundEnabled },
      // —— 边框 ——
      { key: "borderEnabled", label: "边框", type: "toggle", group: "边框" },
      { key: "borderColor", label: "边框颜色", type: "color", group: "边框", hidden: (c) => !c.borderEnabled },
      { key: "borderWidth", label: "边框宽度", type: "number", min: 0, max: 20, group: "边框", hidden: (c) => !c.borderEnabled },
      { key: "borderStyle", label: "边框样式", type: "select", options: [
        { label: "实线", value: "solid" },
        { label: "虚线", value: "dashed" },
        { label: "点线", value: "dotted" },
      ], group: "边框", hidden: (c) => !c.borderEnabled },
      // —— 阴影 ——
      { key: "shadowEnabled", label: "阴影", type: "toggle", group: "阴影" },
      { key: "shadowOffsetX", label: "水平偏移", type: "number", min: -60, max: 60, group: "阴影", hidden: (c) => !c.shadowEnabled },
      { key: "shadowOffsetY", label: "垂直偏移", type: "number", min: -60, max: 60, group: "阴影", hidden: (c) => !c.shadowEnabled },
      { key: "shadowBlur", label: "模糊半径", type: "number", min: 0, max: 60, group: "阴影", hidden: (c) => !c.shadowEnabled },
      { key: "shadowSpread", label: "扩散范围", type: "number", min: -60, max: 60, group: "阴影", hidden: (c) => !c.shadowEnabled },
      { key: "shadowColor", label: "阴影颜色", type: "color", group: "阴影", hidden: (c) => !c.shadowEnabled },
    ],
  });
}
