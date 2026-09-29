import { componentRegistry, lazy } from "../registryCore";

export function registerSpace(): void {
  // ─── 间距 ───
  componentRegistry.register({
    type: "space",
    name: "间距",
    icon: "height",
    description: "间距组件，支持空白留白和分隔线两种类型；分隔线支持水平/垂直方向和可选标签文字",
    category: "ccat_layout",
    version: "2.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 400, height: 40 },
    minSize: { width: 1, height: 1 },
    defaultConfig: {
      // 类型
      type: "blank",
      // 背景色
      bgEnabled: false,
      bgColor: "rgba(255,255,255,0.04)",
      // 边框
      borderEnabled: false,
      borderStyle: "dashed",
      borderColor: "rgba(255,255,255,0.15)",
      borderWidth: 1,
      // 圆角
      radius: 0,
      // 占位提示
      showPlaceholder: false,
      placeholderText: "间距",
      placeholderColor: "rgba(255,255,255,0.3)",
      placeholderFontSize: 12,
      placeholderBgColor: "rgba(255,255,255,0.08)",
      // 分隔线
      orientation: "horizontal",
      label: "",
      labelAlign: "center",
      labelColor: "rgba(255,255,255,0.5)",
      labelFontSize: 12,
    },
    capabilities: {
      resizable: true,
      rotatable: false,
      draggable: true,
      connectable: false,
      embeddable: false,
    },
    renderer: lazy(() => import("../renderers/SpaceRenderer").then(m => ({ default: m.SpaceRenderer }))),
    configSchema: [
      // —— 类型 ——
      { key: "type", label: "类型", type: "select", group: "类型",
        options: [
          { label: "空白", value: "blank" },
          { label: "分隔线", value: "divider" },
        ],
      },
      // —— 背景 ——
      { key: "bgEnabled", label: "背景色", type: "toggle", group: "背景", hidden: (c) => c.type === "divider" },
      { key: "bgColor", label: "背景颜色", type: "color", group: "背景", hidden: (c) => c.type === "divider" || !c.bgEnabled },
      // —— 边框 ——
      { key: "borderEnabled", label: "边框", type: "toggle", group: "边框", hidden: (c) => c.type === "divider" },
      { key: "borderStyle", label: "边框样式", type: "select", group: "边框",
        options: [
          { label: "虚线", value: "dashed" },
          { label: "实线", value: "solid" },
          { label: "点线", value: "dotted" },
        ],
        hidden: (c) => c.type !== "divider" && !c.borderEnabled },
      { key: "borderColor", label: "边框颜色", type: "color", group: "边框", hidden: (c) => c.type !== "divider" && !c.borderEnabled },
      { key: "borderWidth", label: "边框粗细", type: "number", min: 1, max: 10, group: "边框", hidden: (c) => c.type !== "divider" && !c.borderEnabled },
      // —— 圆角 ——
      { key: "radius", label: "圆角", type: "number", min: 0, max: 50, group: "圆角", hidden: (c) => c.type === "divider" },
      // —— 占位提示 ——
      { key: "showPlaceholder", label: "显示占位", type: "toggle", group: "占位提示", hidden: (c) => c.type === "divider" },
      { key: "placeholderText", label: "占位文字", type: "text", group: "占位提示", hidden: (c) => c.type === "divider" || !c.showPlaceholder },
      { key: "placeholderColor", label: "文字颜色", type: "color", group: "占位提示", hidden: (c) => c.type === "divider" || !c.showPlaceholder },
      { key: "placeholderFontSize", label: "文字字号", type: "number", min: 8, max: 32, group: "占位提示", hidden: (c) => c.type === "divider" || !c.showPlaceholder },
      { key: "placeholderBgColor", label: "占位背景色", type: "color", group: "占位提示", hidden: (c) => c.type === "divider" || !c.showPlaceholder },
      // —— 分隔线 ——
      { key: "orientation", label: "方向", type: "select", group: "分隔线",
        options: [
          { label: "水平", value: "horizontal" },
          { label: "垂直", value: "vertical" },
        ],
        hidden: (c) => c.type !== "divider" },
      { key: "label", label: "标签文字", type: "text", group: "分隔线", hidden: (c) => c.type !== "divider" },
      { key: "labelAlign", label: "标签对齐", type: "select", group: "分隔线",
        options: [
          { label: "居左", value: "left" },
          { label: "居中", value: "center" },
          { label: "居右", value: "right" },
        ],
        hidden: (c) => c.type !== "divider" },
      { key: "labelColor", label: "标签颜色", type: "color", group: "分隔线", hidden: (c) => c.type !== "divider" },
      { key: "labelFontSize", label: "标签字号", type: "number", min: 8, max: 32, group: "分隔线", hidden: (c) => c.type !== "divider" },
    ],
  });
}
