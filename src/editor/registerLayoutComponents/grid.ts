import { componentRegistry, lazy } from "../registryCore";

export function registerGrid(): void {
  // ─── 栅格 ───
  componentRegistry.register({
    type: "grid",
    name: "栅格",
    icon: "grid_view",
    description: "CSS Grid 栅格布局，支持多列模式、对齐、间距等完整栅格能力",
    category: "ccat_layout",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 480, height: 320 },
    minSize: { width: 60, height: 60 },
    defaultConfig: {
      // 列
      columnMode: "equal",
      columns: 3,
      columnWidth: 120,
      columnMinWidth: 100,
      // 行
      rowMode: "equal",
      rows: 2,
      rowHeight: 80,
      // 间距
      columnGap: 8,
      rowGap: 8,
      // 对齐
      justifyItems: "stretch",
      alignItems: "stretch",
      justifyContent: "start",
      alignContent: "start",
      // 网格线
      showLines: true,
      lineColor: "rgba(255,255,255,0.15)",
      lineStyle: "dashed",
      lineWidth: 1,
      // 单元格背景
      showCellBg: false,
      cellBg: "rgba(255,255,255,0.02)",
      // 背景
      backgroundEnabled: false,
      backgroundColor: "rgba(255,255,255,0.03)",
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
    renderer: lazy(() => import("../renderers/GridRenderer").then(m => ({ default: m.GridRenderer }))),
    configSchema: [
      // —— 列 ——
      { key: "columnMode", label: "列模式", type: "select", options: [
        { label: "等分", value: "equal" },
        { label: "固定宽度", value: "fixed" },
        { label: "自适应填充", value: "auto-fill" },
        { label: "自适应拟合", value: "auto-fit" },
      ], group: "列" },
      { key: "columns", label: "列数", type: "number", min: 1, max: 12, group: "列",
        hidden: (c) => c.columnMode === "auto-fill" || c.columnMode === "auto-fit" },
      { key: "columnWidth", label: "列宽 (px)", type: "number", min: 20, max: 1000, group: "列",
        hidden: (c) => c.columnMode !== "fixed" },
      { key: "columnMinWidth", label: "最小列宽 (px)", type: "number", min: 20, max: 1000, group: "列",
        hidden: (c) => c.columnMode !== "auto-fill" && c.columnMode !== "auto-fit" },
      // —— 行 ——
      { key: "rowMode", label: "行模式", type: "select", options: [
        { label: "等分", value: "equal" },
        { label: "固定高度", value: "fixed" },
        { label: "内容自适应", value: "auto" },
      ], group: "行" },
      { key: "rows", label: "行数", type: "number", min: 1, max: 12, group: "行",
        hidden: (c) => c.rowMode === "auto" },
      { key: "rowHeight", label: "行高 (px)", type: "number", min: 20, max: 1000, group: "行",
        hidden: (c) => c.rowMode !== "fixed" },
      // —— 间距 ——
      { key: "columnGap", label: "列间距", type: "number", min: 0, max: 100, group: "间距" },
      { key: "rowGap", label: "行间距", type: "number", min: 0, max: 100, group: "间距" },
      // —— 对齐 ——
      { key: "justifyItems", label: "单元格水平对齐", type: "select", options: [
        { label: "拉伸", value: "stretch" },
        { label: "起始", value: "start" },
        { label: "居中", value: "center" },
        { label: "结束", value: "end" },
      ], group: "对齐" },
      { key: "alignItems", label: "单元格垂直对齐", type: "select", options: [
        { label: "拉伸", value: "stretch" },
        { label: "起始", value: "start" },
        { label: "居中", value: "center" },
        { label: "结束", value: "end" },
      ], group: "对齐" },
      { key: "justifyContent", label: "整体水平对齐", type: "select", options: [
        { label: "起始", value: "start" },
        { label: "居中", value: "center" },
        { label: "结束", value: "end" },
        { label: "两端对齐", value: "space-between" },
        { label: "均匀分布", value: "space-around" },
        { label: "均等分布", value: "space-evenly" },
      ], group: "对齐" },
      { key: "alignContent", label: "整体垂直对齐", type: "select", options: [
        { label: "起始", value: "start" },
        { label: "居中", value: "center" },
        { label: "结束", value: "end" },
        { label: "两端对齐", value: "space-between" },
        { label: "均匀分布", value: "space-around" },
        { label: "均等分布", value: "space-evenly" },
      ], group: "对齐" },
      // —— 网格线 ——
      { key: "showLines", label: "显示网格线", type: "toggle", group: "网格线" },
      { key: "lineColor", label: "线条颜色", type: "color", group: "网格线", hidden: (c) => !c.showLines },
      { key: "lineStyle", label: "线条样式", type: "select", options: [
        { label: "实线", value: "solid" },
        { label: "虚线", value: "dashed" },
        { label: "点线", value: "dotted" },
      ], group: "网格线", hidden: (c) => !c.showLines },
      { key: "lineWidth", label: "线条粗细", type: "number", min: 1, max: 10, group: "网格线", hidden: (c) => !c.showLines },
      // —— 外观 ——
      { key: "showCellBg", label: "单元格背景", type: "toggle", group: "外观" },
      { key: "cellBg", label: "单元格背景色", type: "color", group: "外观", hidden: (c) => !c.showCellBg },
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
