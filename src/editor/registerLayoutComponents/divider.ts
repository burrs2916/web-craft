import { componentRegistry, lazy } from "../registryCore";

export function registerDivider(): void {
  // ─── 水平分割线 ───
  componentRegistry.register({
    type: "divider",
    name: "水平分割线",
    icon: "horizontal_rule",
    description: "水平分割线，支持实线/虚线/点线/渐变，可带文字与数据源",
    category: "ccat_layout",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 360, height: 48 },
    minSize: { width: 60, height: 24 },
    defaultConfig: {
      variant: "solid",
      color: "rgba(255,255,255,0.12)",
      gradientColor: "rgba(255,255,255,0.12)",
      thickness: 1,
      widthMode: "full",
      widthValue: 320,
      align: "center",
      paddingX: 8,
      paddingY: 0,
      gap: 12,
      text: "",
      textAlign: "center",
      fontSize: 14,
      textColor: "rgba(255,255,255,0.6)",
      textBg: "transparent",
    },
    capabilities: {
      resizable: true, rotatable: false, draggable: true, connectable: false, embeddable: false,
    },
    renderer: lazy(() => import("../renderers/DividerRenderer").then(m => ({ default: m.DividerRenderer }))),
    configSchema: [
      { key: "variant", label: "样式", type: "select", group: "基础",
        options: [
          { label: "实线", value: "solid" },
          { label: "虚线", value: "dashed" },
          { label: "点线", value: "dotted" },
          { label: "渐变淡出", value: "gradient" },
        ] },
      { key: "color", label: "颜色", type: "color", group: "基础", hidden: (c) => c.variant === "gradient" },
      { key: "gradientColor", label: "渐变主色", type: "color", group: "基础", hidden: (c) => c.variant !== "gradient" },
      { key: "thickness", label: "粗细", type: "number", min: 1, max: 10, group: "基础" },
      { key: "widthMode", label: "宽度", type: "select", group: "尺寸",
        options: [
          { label: "占满", value: "full" },
          { label: "固定宽度", value: "fixed" },
        ] },
      { key: "widthValue", label: "固定宽度(px)", type: "number", min: 40, max: 2000, group: "尺寸", hidden: (c) => (c.widthMode ?? "full") !== "fixed" },
      { key: "align", label: "水平对齐", type: "select", group: "尺寸",
        options: [
          { label: "左对齐", value: "left" },
          { label: "居中", value: "center" },
          { label: "右对齐", value: "right" },
        ] },
      { key: "paddingX", label: "左右内边距", type: "number", min: 0, max: 40, group: "尺寸" },
      { key: "paddingY", label: "上下内边距", type: "number", min: 0, max: 40, group: "尺寸" },
      { key: "gap", label: "文字与线间距", type: "number", min: 0, max: 40, group: "文字", hidden: (c) => !c.text },
      { key: "text", label: "文字", type: "text", group: "文字", placeholder: "可为空，留空则为纯分割线" },
      { key: "textAlign", label: "文字位置", type: "select", group: "文字",
        options: [
          { label: "左", value: "left" },
          { label: "中", value: "center" },
          { label: "右", value: "right" },
        ] },
      { key: "fontSize", label: "文字字号", type: "number", min: 10, max: 24, group: "文字" },
      { key: "textColor", label: "文字颜色", type: "color", group: "文字" },
      { key: "textBg", label: "文字背景", type: "color", group: "文字" },
    ],
  });
}

export function registerDividerVertical(): void {
  // ─── 垂直分割线 ───
  componentRegistry.register({
    type: "divider-vertical",
    name: "垂直分割线",
    icon: "vertical_align_center",
    description: "垂直分割线，支持实线/虚线/点线/渐变，默认居中于容器",
    category: "ccat_layout",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 20, height: 160 },
    minSize: { width: 8, height: 40 },
    defaultConfig: {
      orientation: "vertical",
      variant: "solid",
      color: "rgba(255,255,255,0.12)",
      gradientColor: "rgba(255,255,255,0.12)",
      thickness: 1,
      heightMode: "full",
      heightValue: 120,
      align: "center",
      paddingX: 8,
      paddingY: 0,
    },
    capabilities: {
      resizable: true, rotatable: false, draggable: true, connectable: false, embeddable: false,
    },
    renderer: lazy(() => import("../renderers/DividerRenderer").then(m => ({ default: m.DividerRenderer }))),
    configSchema: [
      { key: "variant", label: "样式", type: "select", group: "基础",
        options: [
          { label: "实线", value: "solid" },
          { label: "虚线", value: "dashed" },
          { label: "点线", value: "dotted" },
          { label: "渐变淡出", value: "gradient" },
        ] },
      { key: "color", label: "颜色", type: "color", group: "基础", hidden: (c) => c.variant === "gradient" },
      { key: "gradientColor", label: "渐变主色", type: "color", group: "基础", hidden: (c) => c.variant !== "gradient" },
      { key: "thickness", label: "粗细", type: "number", min: 1, max: 10, group: "基础" },
      { key: "heightMode", label: "长度", type: "select", group: "尺寸",
        options: [
          { label: "占满", value: "full" },
          { label: "固定长度", value: "fixed" },
        ] },
      { key: "heightValue", label: "固定长度(px)", type: "number", min: 20, max: 1000, group: "尺寸", hidden: (c) => (c.heightMode ?? "full") !== "fixed" },
      { key: "align", label: "垂直对齐", type: "select", group: "尺寸",
        options: [
          { label: "顶部", value: "top" },
          { label: "居中", value: "center" },
          { label: "底部", value: "bottom" },
        ] },
      { key: "paddingX", label: "左右内边距", type: "number", min: 0, max: 40, group: "尺寸" },
      { key: "paddingY", label: "上下内边距", type: "number", min: 0, max: 40, group: "尺寸" },
    ],
  });
}
