import { componentRegistry, lazy } from "../registryCore";
import { DECOR_BORDER_STYLE_OPTIONS, DECOR_LINE_STYLE_OPTIONS } from "../data/decorationShape";

/**
 * 注册原生装饰形状的第一组：矩形/圆形/线条/箭头/椭圆/三角/多边形/星形/圆环/菱形/十字。
 *
 * 注意：注册顺序与拆分前逐字保持一致 —— 组件面板按注册表的插入顺序展示装饰组件，
 * 因此本文件与 nativeLines / nativePatterns 的调用顺序即面板展示顺序，不可随意调整。
 */
export function registerNativeShapes(): void {
  componentRegistry.register({
    type: "decoration-rect",
    name: "矩形",
    icon: "crop_square",
    description: "矩形装饰组件",
    category: "ccat_decoration",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 200, height: 150 },
    defaultConfig: {
      fill: "rgba(33, 150, 243, 0.3)",
      stroke: "#2196F3",
      strokeWidth: 2,
      borderRadius: 0,
      borderStyle: "solid",
      opacity: 1,
    },
    capabilities: {
      resizable: true,
      rotatable: true,
      draggable: true,
      connectable: false,
      embeddable: false,
    },
    renderer: lazy(() => import("../renderers/RectDecorationRenderer").then(m => ({ default: m.RectDecorationRenderer }))),
    configSchema: [
      { key: "fill", label: "填充色", type: "color", group: "样式" },
      { key: "opacity", label: "透明度", type: "slider", min: 0, step: 0.1, group: "样式", max: 1 },
      { key: "stroke", label: "边框色", type: "color", group: "边框" },
      { key: "strokeWidth", label: "边框宽度", type: "number", min: 0, group: "边框" },
      { key: "borderStyle", label: "边框样式", type: "select", options: DECOR_BORDER_STYLE_OPTIONS, group: "边框" },
      { key: "borderRadius", label: "圆角", type: "number", min: 0, group: "样式" },
    ],
  });

  componentRegistry.register({
    type: "decoration-circle",
    name: "圆形",
    icon: "circle",
    description: "圆形装饰组件",
    category: "ccat_decoration",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 150, height: 150 },
    defaultConfig: {
      fill: "rgba(33, 150, 243, 0.3)",
      stroke: "#2196F3",
      strokeWidth: 2,
      borderStyle: "solid",
      opacity: 1,
    },
    capabilities: {
      resizable: true,
      rotatable: false,
      draggable: true,
      connectable: false,
      embeddable: false,
    },
    renderer: lazy(() => import("../renderers/CircleDecorationRenderer").then(m => ({ default: m.CircleDecorationRenderer }))),
    configSchema: [
      { key: "fill", label: "填充色", type: "color", group: "样式" },
      { key: "opacity", label: "透明度", type: "slider", min: 0, step: 0.1, group: "样式", max: 1 },
      { key: "stroke", label: "边框色", type: "color", group: "边框" },
      { key: "strokeWidth", label: "边框宽度", type: "number", min: 0, group: "边框" },
      { key: "borderStyle", label: "边框样式", type: "select", options: DECOR_BORDER_STYLE_OPTIONS, group: "边框" },
    ],
  });

  componentRegistry.register({
    type: "decoration-line",
    name: "线条",
    icon: "horizontal_rule",
    description: "线条装饰组件",
    category: "ccat_decoration",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 200, height: 20 },
    defaultConfig: {
      stroke: "#2196F3",
      strokeWidth: 3,
      lineStyle: "solid",
      direction: "horizontal",
      opacity: 1,
    },
    capabilities: {
      resizable: true,
      rotatable: true,
      draggable: true,
      connectable: false,
      embeddable: false,
    },
    renderer: lazy(() => import("../renderers/LineDecorationRenderer").then(m => ({ default: m.LineDecorationRenderer }))),
    configSchema: [
      { key: "stroke", label: "颜色", type: "color", group: "样式" },
      { key: "strokeWidth", label: "粗细", type: "number", min: 0, group: "样式" },
      { key: "opacity", label: "透明度", type: "slider", min: 0, step: 0.1, group: "样式", max: 1 },
      { key: "lineStyle", label: "线型", type: "select", options: DECOR_LINE_STYLE_OPTIONS, group: "样式" },
      { key: "direction", label: "方向", type: "select", options: [
        { label: "水平", value: "horizontal" },
        { label: "垂直", value: "vertical" },
        { label: "左上-右下", value: "diagonal-tl-br" },
        { label: "右上-左下", value: "diagonal-tr-bl" },
      ], group: "布局" },
    ],
  });

  componentRegistry.register({
    type: "decoration-arrow",
    name: "箭头",
    icon: "arrow_forward",
    description: "箭头装饰组件",
    category: "ccat_decoration",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 300, height: 60 },
    defaultConfig: {
      color1: "#FF7BAC",
      color2: "#FF99C3",
      strokeWidth: 1,
      direction: "right",
      arrowType: "double",
      arrowSize: 10,
      arrowShape: "diamond",
      arrowCount: 3,
      lineStyle: "solid",
      opacity: 1,
    },
    capabilities: {
      resizable: true,
      rotatable: false,
      draggable: true,
      connectable: false,
      embeddable: false,
    },
    renderer: lazy(() => import("../renderers/ArrowDecorationRenderer").then(m => ({ default: m.ArrowDecorationRenderer }))),
    configSchema: [
      { key: "color1", label: "主色", type: "color", group: "样式" },
      /* 「副色」字段已摘除：decorationShape 的 arrow 分支从不消费 color2（诚实性扫描实证） */
      { key: "strokeWidth", label: "粗细", type: "number", min: 0, group: "样式" },
      { key: "opacity", label: "透明度", type: "slider", min: 0, step: 0.1, group: "样式", max: 1 },
      { key: "lineStyle", label: "线条样式", type: "select", options: DECOR_LINE_STYLE_OPTIONS, group: "样式" },
      { key: "direction", label: "方向", type: "select", options: [
        { label: "向右", value: "right" },
        { label: "向左", value: "left" },
        { label: "向上", value: "up" },
        { label: "向下", value: "down" },
      ], group: "布局" },
      { key: "arrowShape", label: "箭头形状", type: "select", options: [
        { label: "菱形双向", value: "diamond" },
        { label: "三角箭头", value: "triangle" },
      ], group: "样式" },
      { key: "arrowType", label: "箭头类型", type: "select", options: [
        { label: "单向", value: "single" },
        { label: "双向", value: "double" },
        { label: "连续", value: "chain" },
      ], group: "样式" },
      { key: "arrowSize", label: "箭头大小", type: "number", min: 0, group: "样式" },
      /* 箭头数量只在「连续」类型下参与排布（单/双向恒为 1 个箭头） */
      { key: "arrowCount", label: "箭头数量", type: "number", min: 1, max: 10, group: "布局",
        hidden: (c) => c.arrowType !== "chain" },
    ],
  });

  componentRegistry.register({
    type: "decoration-ellipse",
    name: "椭圆",
    icon: "panorama_fish_eye",
    description: "椭圆装饰组件",
    category: "ccat_decoration",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 200, height: 120 },
    defaultConfig: {
      fill: "rgba(33, 150, 243, 0.3)",
      stroke: "#2196F3",
      strokeWidth: 2,
      borderStyle: "solid",
      opacity: 1,
    },
    capabilities: { resizable: true, rotatable: true, draggable: true, connectable: false, embeddable: false },
    renderer: lazy(() => import("../renderers/EllipseDecorationRenderer").then(m => ({ default: m.EllipseDecorationRenderer }))),
    configSchema: [
      { key: "fill", label: "填充色", type: "color", group: "样式" },
      { key: "opacity", label: "透明度", type: "slider", min: 0, step: 0.1, group: "样式", max: 1 },
      { key: "stroke", label: "边框色", type: "color", group: "边框" },
      { key: "strokeWidth", label: "边框宽度", type: "number", min: 0, group: "边框" },
      { key: "borderStyle", label: "边框样式", type: "select", options: DECOR_BORDER_STYLE_OPTIONS, group: "边框" },
    ],
  });

  componentRegistry.register({
    type: "decoration-triangle",
    name: "三角形",
    icon: "change_history",
    description: "三角形装饰组件",
    category: "ccat_decoration",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 150, height: 130 },
    defaultConfig: {
      fill: "rgba(33, 150, 243, 0.3)",
      stroke: "#2196F3",
      strokeWidth: 2,
      direction: "up",
      borderStyle: "solid",
      opacity: 1,
    },
    capabilities: { resizable: true, rotatable: true, draggable: true, connectable: false, embeddable: false },
    renderer: lazy(() => import("../renderers/TriangleDecorationRenderer").then(m => ({ default: m.TriangleDecorationRenderer }))),
    configSchema: [
      { key: "fill", label: "填充色", type: "color", group: "样式" },
      { key: "opacity", label: "透明度", type: "slider", min: 0, step: 0.1, group: "样式", max: 1 },
      { key: "stroke", label: "边框色", type: "color", group: "边框" },
      { key: "strokeWidth", label: "边框宽度", type: "number", min: 0, group: "边框" },
      { key: "borderStyle", label: "边框样式", type: "select", options: DECOR_BORDER_STYLE_OPTIONS, group: "边框" },
      { key: "direction", label: "方向", type: "select", options: [
        { label: "向上", value: "up" },
        { label: "向下", value: "down" },
        { label: "向左", value: "left" },
        { label: "向右", value: "right" },
      ], group: "布局" },
    ],
  });

  componentRegistry.register({
    type: "decoration-polygon",
    name: "多边形",
    icon: "hexagon",
    description: "多边形装饰组件",
    category: "ccat_decoration",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 150, height: 150 },
    defaultConfig: {
      fill: "rgba(33, 150, 243, 0.3)",
      stroke: "#2196F3",
      strokeWidth: 2,
      sides: 6,
      borderStyle: "solid",
      opacity: 1,
    },
    capabilities: { resizable: true, rotatable: true, draggable: true, connectable: false, embeddable: false },
    renderer: lazy(() => import("../renderers/PolygonDecorationRenderer").then(m => ({ default: m.PolygonDecorationRenderer }))),
    configSchema: [
      { key: "fill", label: "填充色", type: "color", group: "样式" },
      { key: "opacity", label: "透明度", type: "slider", min: 0, step: 0.1, group: "样式", max: 1 },
      { key: "stroke", label: "边框色", type: "color", group: "边框" },
      { key: "strokeWidth", label: "边框宽度", type: "number", min: 0, group: "边框" },
      { key: "borderStyle", label: "边框样式", type: "select", options: DECOR_BORDER_STYLE_OPTIONS, group: "边框" },
      { key: "sides", label: "边数", type: "number", min: 0, group: "布局" },
    ],
  });

  componentRegistry.register({
    type: "decoration-star",
    name: "星形",
    icon: "star",
    description: "星形装饰组件",
    category: "ccat_decoration",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 150, height: 150 },
    defaultConfig: {
      fill: "rgba(255, 193, 7, 0.4)",
      stroke: "#FFC107",
      strokeWidth: 2,
      points: 5,
      innerRatio: 0.4,
      borderStyle: "solid",
      opacity: 1,
    },
    capabilities: { resizable: true, rotatable: true, draggable: true, connectable: false, embeddable: false },
    renderer: lazy(() => import("../renderers/StarDecorationRenderer").then(m => ({ default: m.StarDecorationRenderer }))),
    configSchema: [
      { key: "fill", label: "填充色", type: "color", group: "样式" },
      { key: "opacity", label: "透明度", type: "slider", min: 0, step: 0.1, group: "样式", max: 1 },
      { key: "stroke", label: "边框色", type: "color", group: "边框" },
      { key: "strokeWidth", label: "边框宽度", type: "number", min: 0, group: "边框" },
      { key: "borderStyle", label: "边框样式", type: "select", options: DECOR_BORDER_STYLE_OPTIONS, group: "边框" },
      { key: "points", label: "角数", type: "number", min: 0, group: "布局" },
      { key: "innerRatio", label: "内径比", type: "slider", min: 0.1, max: 0.9, step: 0.05, group: "布局" },
    ],
  });

  componentRegistry.register({
    type: "decoration-ring",
    name: "圆环",
    icon: "trip_origin",
    description: "圆环装饰组件",
    category: "ccat_decoration",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 120, height: 120 },
    defaultConfig: {
      stroke: "#2196F3",
      ringWidth: 6,
      strokeWidth: 0,
      borderStyle: "solid",
      fill: "none",
      opacity: 1,
    },
    capabilities: { resizable: true, rotatable: false, draggable: true, connectable: false, embeddable: false },
    renderer: lazy(() => import("../renderers/RingDecorationRenderer").then(m => ({ default: m.RingDecorationRenderer }))),
    configSchema: [
      { key: "stroke", label: "颜色", type: "color", group: "样式" },
      { key: "ringWidth", label: "环宽", type: "number", min: 0, group: "样式" },
      /* 外环粗细：几何本来就消费它（`if (strokeWidth > 0)` 时在环外侧再画一圈半透明细边），
         但面板上没有入口 → 这个能力一直不可达。默认 0 = 与历史产物逐字一致。 */
      { key: "strokeWidth", label: "外环粗细", type: "number", min: 0, group: "样式",
        help: "大于 0 时在环外侧再描一圈半透明细边（双环效果）" },
      { key: "fill", label: "填充色", type: "color", group: "样式" },
      { key: "opacity", label: "透明度", type: "slider", min: 0, step: 0.1, group: "样式", max: 1 },
      /* 圆环的 `borderStyle` 只驱动"虚线节奏"，不控制有无描边（环本身就是描边，
         所以这里用不含「无边框」的那张表 —— 给它一个「无边框」选项就是假控件）。 */
      { key: "borderStyle", label: "线型", type: "select", options: DECOR_LINE_STYLE_OPTIONS, group: "样式" },
    ],
  });

  componentRegistry.register({
    type: "decoration-diamond",
    name: "菱形",
    icon: "diamond",
    description: "菱形装饰组件",
    category: "ccat_decoration",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 150, height: 150 },
    defaultConfig: {
      fill: "rgba(33, 150, 243, 0.3)",
      stroke: "#2196F3",
      strokeWidth: 2,
      borderStyle: "solid",
      opacity: 1,
    },
    capabilities: { resizable: true, rotatable: true, draggable: true, connectable: false, embeddable: false },
    renderer: lazy(() => import("../renderers/DiamondDecorationRenderer").then(m => ({ default: m.DiamondDecorationRenderer }))),
    configSchema: [
      { key: "fill", label: "填充色", type: "color", group: "样式" },
      { key: "opacity", label: "透明度", type: "slider", min: 0, step: 0.1, group: "样式", max: 1 },
      { key: "stroke", label: "边框色", type: "color", group: "边框" },
      { key: "strokeWidth", label: "边框宽度", type: "number", min: 0, group: "边框" },
      { key: "borderStyle", label: "边框样式", type: "select", options: DECOR_BORDER_STYLE_OPTIONS, group: "边框" },
    ],
  });

  componentRegistry.register({
    type: "decoration-cross",
    name: "十字",
    icon: "add",
    description: "十字/加号装饰组件",
    category: "ccat_decoration",
    version: "2.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 100, height: 100 },
    defaultConfig: {
      fill: "#2196F3",
      stroke: "transparent",
      strokeWidth: 0,
      thickness: 10,
      opacity: 1,
    },
    capabilities: { resizable: true, rotatable: true, draggable: true, connectable: false, embeddable: false },
    renderer: lazy(() => import("../renderers/CrossDecorationRenderer").then(m => ({ default: m.CrossDecorationRenderer }))),
    configSchema: [
      { key: "fill", label: "填充色", type: "color", group: "样式" },
      { key: "thickness", label: "粗细", type: "number", min: 0, group: "样式" },
      { key: "opacity", label: "透明度", type: "slider", min: 0, step: 0.1, group: "样式", max: 1 },
      { key: "stroke", label: "边框色", type: "color", group: "边框" },
      { key: "strokeWidth", label: "边框宽度", type: "number", min: 0, group: "边框" },
    ],
  });
}