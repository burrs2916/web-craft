import { componentRegistry, lazy } from "./registryCore";
import type { ConfigField } from "../types/editor";
import { ANIMATION_SCHEMA, ANIMATION_DEFAULTS } from "./renderers/decorationAnimation";
import { DATAV_BORDER_META, DATAV_DECO_META, datavTypeOf, datavStrokeWidthSupported } from "./data/datavDecor";
import {
  decorSupportsGradient,
  decorStrokeDetailDefaults,
  DECOR_BORDER_STYLE_OPTIONS,
  DECOR_LINE_STYLE_OPTIONS,
} from "./data/decorationShape";
import {
  decorGradientFields,
  decorGradientDefaults,
  decorShadowField,
  decorShadowDefaults,
  decorStrokeDetailFields,
} from "./data/decorFields";

export function registerDecorationComponents(): void {
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
    renderer: lazy(() => import("./renderers/RectDecorationRenderer").then(m => ({ default: m.RectDecorationRenderer }))),
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
    renderer: lazy(() => import("./renderers/CircleDecorationRenderer").then(m => ({ default: m.CircleDecorationRenderer }))),
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
    renderer: lazy(() => import("./renderers/LineDecorationRenderer").then(m => ({ default: m.LineDecorationRenderer }))),
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
    renderer: lazy(() => import("./renderers/ArrowDecorationRenderer").then(m => ({ default: m.ArrowDecorationRenderer }))),
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
    renderer: lazy(() => import("./renderers/EllipseDecorationRenderer").then(m => ({ default: m.EllipseDecorationRenderer }))),
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
    renderer: lazy(() => import("./renderers/TriangleDecorationRenderer").then(m => ({ default: m.TriangleDecorationRenderer }))),
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
    renderer: lazy(() => import("./renderers/PolygonDecorationRenderer").then(m => ({ default: m.PolygonDecorationRenderer }))),
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
    renderer: lazy(() => import("./renderers/StarDecorationRenderer").then(m => ({ default: m.StarDecorationRenderer }))),
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
    renderer: lazy(() => import("./renderers/RingDecorationRenderer").then(m => ({ default: m.RingDecorationRenderer }))),
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
    renderer: lazy(() => import("./renderers/DiamondDecorationRenderer").then(m => ({ default: m.DiamondDecorationRenderer }))),
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
    renderer: lazy(() => import("./renderers/CrossDecorationRenderer").then(m => ({ default: m.CrossDecorationRenderer }))),
    configSchema: [
      { key: "fill", label: "填充色", type: "color", group: "样式" },
      { key: "thickness", label: "粗细", type: "number", min: 0, group: "样式" },
      { key: "opacity", label: "透明度", type: "slider", min: 0, step: 0.1, group: "样式", max: 1 },
      { key: "stroke", label: "边框色", type: "color", group: "边框" },
      { key: "strokeWidth", label: "边框宽度", type: "number", min: 0, group: "边框" },
    ],
  });

  componentRegistry.register({
    type: "decoration-divider",
    name: "分隔线",
    icon: "remove",
    description: "装饰性分隔线",
    category: "ccat_decoration",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 200, height: 20 },
    defaultConfig: {
      stroke: "#2196F3",
      strokeWidth: 2,
      style: "single",
      gap: 3,
      lineStyle: "solid",
      opacity: 1,
    },
    capabilities: { resizable: true, rotatable: false, draggable: true, connectable: false, embeddable: false },
    renderer: lazy(() => import("./renderers/DividerDecorationRenderer").then(m => ({ default: m.DividerDecorationRenderer }))),
    configSchema: [
      { key: "stroke", label: "颜色", type: "color", group: "样式" },
      { key: "strokeWidth", label: "粗细", type: "number", min: 0, group: "样式" },
      { key: "opacity", label: "透明度", type: "slider", min: 0, step: 0.1, group: "样式", max: 1 },
      { key: "lineStyle", label: "线条样式", type: "select", options: DECOR_LINE_STYLE_OPTIONS, group: "样式" },
      { key: "style", label: "样式", type: "select", options: [
        { label: "单线", value: "single" },
        { label: "双线", value: "double" },
        { label: "渐变", value: "gradient" },
      ], group: "样式" },
      { key: "gap", label: "双线间距", type: "number", min: 0, group: "样式", hidden: (c) => c.style !== "double" },
    ],
  });

  componentRegistry.register({
    type: "decoration-wave",
    name: "波浪线",
    icon: "waves",
    description: "装饰性波浪线",
    category: "ccat_decoration",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 200, height: 40 },
    defaultConfig: {
      stroke: "#2196F3",
      strokeWidth: 2,
      amplitude: 10,
      wavelength: 30,
      lineStyle: "solid",
      fill: "none",
      opacity: 1,
    },
    capabilities: { resizable: true, rotatable: false, draggable: true, connectable: false, embeddable: false },
    renderer: lazy(() => import("./renderers/WaveDecorationRenderer").then(m => ({ default: m.WaveDecorationRenderer }))),
    configSchema: [
      { key: "stroke", label: "颜色", type: "color", group: "样式" },
      { key: "strokeWidth", label: "粗细", type: "number", min: 0, group: "样式" },
      { key: "lineStyle", label: "线条样式", type: "select", options: DECOR_LINE_STYLE_OPTIONS, group: "样式" },
      { key: "fill", label: "填充色", type: "color", group: "样式" },
      { key: "opacity", label: "透明度", type: "slider", min: 0, step: 0.1, group: "样式", max: 1 },
      { key: "amplitude", label: "振幅", type: "number", min: 0, group: "布局" },
      { key: "wavelength", label: "波长", type: "number", min: 0, group: "布局" },
    ],
  });

  componentRegistry.register({
    type: "decoration-dashed-box",
    name: "虚线框",
    icon: "check_box_outline_blank",
    description: "虚线边框区域",
    category: "ccat_decoration",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 200, height: 150 },
    defaultConfig: {
      stroke: "#2196F3",
      strokeWidth: 2,
      dashLength: 8,
      gapLength: 4,
      borderRadius: 0,
      fill: "none",
      opacity: 1,
    },
    capabilities: { resizable: true, rotatable: true, draggable: true, connectable: false, embeddable: false },
    renderer: lazy(() => import("./renderers/DashedBoxDecorationRenderer").then(m => ({ default: m.DashedBoxDecorationRenderer }))),
    configSchema: [
      { key: "stroke", label: "边框色", type: "color", group: "样式" },
      { key: "strokeWidth", label: "边框宽度", type: "number", min: 0, group: "样式" },
      { key: "fill", label: "填充色", type: "color", group: "样式" },
      { key: "opacity", label: "透明度", type: "slider", min: 0, step: 0.1, group: "样式", max: 1 },
      { key: "dashLength", label: "线段长度", type: "number", min: 0, group: "样式" },
      { key: "gapLength", label: "间距", type: "number", min: 0, group: "样式" },
      { key: "borderRadius", label: "圆角", type: "number", min: 0, group: "样式" },
    ],
  });

  componentRegistry.register({
    type: "decoration-gradient",
    name: "渐变块",
    icon: "gradient",
    description: "渐变色块装饰",
    category: "ccat_decoration",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 200, height: 150 },
    defaultConfig: {
      gradientFrom: "#2196F3",
      gradientTo: "#FF9800",
      direction: "to-right",
      borderRadius: 0,
      stroke: "none",
      strokeWidth: 0,
      animated: false,
      speed: 3000,
      opacity: 1,
    },
    capabilities: { resizable: true, rotatable: true, draggable: true, connectable: false, embeddable: false },
    renderer: lazy(() => import("./renderers/GradientDecorationRenderer").then(m => ({ default: m.GradientDecorationRenderer }))),
    configSchema: [
      { key: "gradientFrom", label: "起始色", type: "color", group: "颜色" },
      { key: "gradientTo", label: "终止色", type: "color", group: "颜色" },
      { key: "direction", label: "方向", type: "select", options: [
        { label: "从左到右", value: "to-right" },
        { label: "从右到左", value: "to-left" },
        { label: "从上到下", value: "to-bottom" },
        { label: "从下到上", value: "to-top" },
        { label: "左上到右下", value: "to-right-bottom" },
        { label: "径向", value: "radial" },
      ], group: "布局" },
      { key: "opacity", label: "透明度", type: "slider", min: 0, step: 0.1, group: "样式", max: 1 },
      { key: "borderRadius", label: "圆角", type: "number", min: 0, group: "样式" },
      { key: "stroke", label: "边框色", type: "color", group: "边框" },
      { key: "strokeWidth", label: "边框宽度", type: "number", min: 0, group: "边框" },
      { key: "animated", label: "渐变动画", type: "toggle", group: "动画" },
      /* 动画速度只在渐变动画开启时参与产物 */
      { key: "speed", label: "动画速度", type: "number", min: 0, group: "动画",
        hidden: (c) => c.animated !== true },
    ],
  });

  componentRegistry.register({
    type: "decoration-corner",
    name: "角标",
    icon: "crop_free",
    description: "四角装饰标记",
    category: "ccat_decoration",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 200, height: 150 },
    defaultConfig: {
      stroke: "#2196F3",
      size: 15,
      strokeWidth: 2,
      position: "all",
      style: "bracket",
      opacity: 1,
    },
    capabilities: { resizable: true, rotatable: true, draggable: true, connectable: false, embeddable: false },
    renderer: lazy(() => import("./renderers/CornerDecorationRenderer").then(m => ({ default: m.CornerDecorationRenderer }))),
    configSchema: [
      { key: "stroke", label: "颜色", type: "color", group: "样式" },
      { key: "strokeWidth", label: "粗细", type: "number", min: 0, group: "样式" },
      { key: "opacity", label: "透明度", type: "slider", min: 0, step: 0.1, group: "样式", max: 1 },
      { key: "style", label: "样式", type: "select", options: [
        { label: "方括号", value: "bracket" },
        { label: "L形", value: "l-shape" },
      ], group: "布局" },
      { key: "size", label: "角标长度", type: "number", min: 0, group: "布局" },
      { key: "position", label: "位置", type: "select", options: [
        { label: "四角", value: "all" },
        { label: "左上", value: "top-left" },
        { label: "右上", value: "top-right" },
        { label: "左下", value: "bottom-left" },
        { label: "右下", value: "bottom-right" },
      ], group: "布局" },
    ],
  });

  componentRegistry.register({
    type: "decoration-dot",
    name: "标记点",
    icon: "fiber_manual_record",
    description: "装饰性标记点，支持多种形状",
    category: "ccat_decoration",
    version: "2.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 30, height: 30 },
    defaultConfig: {
      fill: "#2196F3",
      stroke: "transparent",
      strokeWidth: 0,
      shape: "circle",
      opacity: 1,
    },
    capabilities: { resizable: true, rotatable: false, draggable: true, connectable: false, embeddable: false },
    renderer: lazy(() => import("./renderers/DotDecorationRenderer").then(m => ({ default: m.DotDecorationRenderer }))),
    configSchema: [
      { key: "shape", label: "形状", type: "select", options: [
        { label: "圆形", value: "circle" },
        { label: "方形", value: "square" },
        { label: "三角形", value: "triangle" },
        { label: "菱形", value: "diamond" },
        { label: "十字", value: "cross" },
        { label: "星形", value: "star" },
      ], group: "样式" },
      { key: "fill", label: "填充色", type: "color", group: "样式" },
      { key: "opacity", label: "透明度", type: "slider", min: 0, step: 0.1, group: "样式", max: 1 },
      { key: "stroke", label: "边框色", type: "color", group: "边框" },
      { key: "strokeWidth", label: "边框宽度", type: "number", min: 0, group: "边框" },
    ],
  });

  componentRegistry.register({
    type: "decoration-grid",
    name: "网格背景",
    icon: "grid_on",
    description: "网格图案背景",
    category: "ccat_decoration",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 200, height: 200 },
    defaultConfig: {
      stroke: "rgba(255,255,255,0.1)",
      strokeWidth: 1,
      spacing: 20,
      lineStyle: "solid",
      opacity: 1,
    },
    capabilities: { resizable: true, rotatable: false, draggable: true, connectable: false, embeddable: false },
    renderer: lazy(() => import("./renderers/GridDecorationRenderer").then(m => ({ default: m.GridDecorationRenderer }))),
    configSchema: [
      { key: "stroke", label: "网格色", type: "color", group: "样式" },
      { key: "strokeWidth", label: "线宽", type: "number", min: 0, group: "样式" },
      { key: "lineStyle", label: "线条样式", type: "select", options: DECOR_LINE_STYLE_OPTIONS, group: "样式" },
      { key: "opacity", label: "透明度", type: "slider", min: 0, step: 0.1, group: "样式", max: 1 },
      { key: "spacing", label: "间距", type: "number", min: 0, group: "布局" },
    ],
  });

  componentRegistry.register({
    type: "decoration-diagonal",
    name: "斜线背景",
    icon: "line_style",
    description: "斜线填充图案",
    category: "ccat_decoration",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 200, height: 200 },
    defaultConfig: {
      stroke: "rgba(255,255,255,0.1)",
      strokeWidth: 1,
      spacing: 10,
      angle: 45,
      lineStyle: "solid",
      opacity: 1,
    },
    capabilities: { resizable: true, rotatable: false, draggable: true, connectable: false, embeddable: false },
    renderer: lazy(() => import("./renderers/DiagonalDecorationRenderer").then(m => ({ default: m.DiagonalDecorationRenderer }))),
    configSchema: [
      { key: "stroke", label: "线条色", type: "color", group: "样式" },
      { key: "strokeWidth", label: "线宽", type: "number", min: 0, group: "样式" },
      { key: "lineStyle", label: "线条样式", type: "select", options: DECOR_LINE_STYLE_OPTIONS, group: "样式" },
      { key: "opacity", label: "透明度", type: "slider", min: 0, step: 0.1, group: "样式", max: 1 },
      { key: "spacing", label: "间距", type: "number", min: 0, group: "布局" },
      { key: "angle", label: "角度", type: "number", min: 0, group: "布局" },
    ],
  });

  componentRegistry.register({
    type: "decoration-dots-pattern",
    name: "点阵背景",
    icon: "blur_on",
    description: "点阵填充图案",
    category: "ccat_decoration",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 200, height: 200 },
    defaultConfig: {
      fill: "rgba(255,255,255,0.15)",
      dotSize: 2,
      spacing: 12,
      shape: "circle",
      opacity: 1,
    },
    capabilities: { resizable: true, rotatable: false, draggable: true, connectable: false, embeddable: false },
    renderer: lazy(() => import("./renderers/DotsPatternDecorationRenderer").then(m => ({ default: m.DotsPatternDecorationRenderer }))),
    configSchema: [
      { key: "fill", label: "点色", type: "color", group: "样式" },
      { key: "shape", label: "形状", type: "select", options: [
        { label: "圆形", value: "circle" },
        { label: "方形", value: "square" },
        { label: "菱形", value: "diamond" },
      ], group: "样式" },
      { key: "opacity", label: "透明度", type: "slider", min: 0, step: 0.1, group: "样式", max: 1 },
      { key: "dotSize", label: "点大小", type: "number", min: 0, group: "布局" },
      { key: "spacing", label: "间距", type: "number", min: 0, group: "布局" },
    ],
  });

  // ── Title Frame Components removed (industrial, not needed for website editor) ──






















































  /* 元数据表的唯一来源：editor/data/datavDecor.ts
     （此前这里还有渲染器里的一份副本，两者已经漂移 → 现收口为一份） */
  const datavBorderMeta = DATAV_BORDER_META;
  const datavDecoMeta = DATAV_DECO_META;

  for (const meta of datavBorderMeta) {
    const color1Label = meta.idx === 7 ? "主色(光晕+边框+外角)" : meta.idx === 8 ? "主色(静态底边)" : meta.idx === 9 ? "主色(渐变深底)" : "主色";
    const color2Label = meta.idx === 7 ? "副色(内角)" : meta.idx === 8 ? "副色(流光高亮)" : meta.idx === 9 ? "副色(渐变高光)" : "副色";
    const schema: any[] = [
      { key: "color1", label: color1Label, type: "color", group: "样式" },
      { key: "color2", label: color2Label, type: "color", group: "样式" },
      { key: "backgroundColor", label: "背景色", type: "color", group: "样式" },
      { key: "opacity", label: "透明度", type: "slider", min: 0, max: 1, step: 0.05, group: "样式" },
      /* 「线条粗细」只在真的会改变画面的组件上出现 —— 边框 1 是纯填充多边形，
         一根描边都没有；其余边框靠静态线宽表，12/13 与装饰族则由几何直接驱动。
         判据集中在 datavStrokeWidthSupported()，并有契约测试锁死。 */
      ...(datavStrokeWidthSupported("border", meta.idx)
        ? [{ key: "strokeWidth", label: "线条粗细", type: "slider", min: 0.5, max: 100, step: 2, group: "样式" }]
        : []),
      { key: "padding", label: "内边距", type: "slider", min: 0, max: 60, step: 2, group: "布局" },
    ];
    if (meta.hasReverse) schema.push({ key: "reverse", label: meta.idx === 8 ? "反转追光方向" : "反转方向", type: "toggle", group: "布局" });
    if (meta.hasDur) schema.push({ key: "dur", label: meta.idx === 8 ? "流光周期(秒)" : "动画时长(秒)", type: "number", min: 0.5, step: 0.5, group: "动画" });
    schema.push({ key: "borderRadius", label: "圆角", type: "number", min: 0, max: 40, step: 1, group: "布局" });

    componentRegistry.register({
      type: datavTypeOf("border", meta.idx),
      name: meta.name,
      icon: meta.icon,
      description: meta.desc,
      category: "ccat_decoration",
      version: "1.0.0",
      builtIn: true,
      enabled: true,
      defaultSize: meta.defaultSize,
      minSize: meta.minSize,
      defaultConfig: {
        datavKind: "border",
        datavIndex: meta.idx,
        color1: meta.defaultColors[0],
        color2: meta.defaultColors[1],
        backgroundColor: "transparent",
        opacity: 1,
        strokeWidth: 1,
        padding: 0,
        borderRadius: 0,
        reverse: false,
        dur: meta.durDefault ?? 3,
      },
      capabilities: { resizable: true, rotatable: false, draggable: true, connectable: false, embeddable: false },
      renderer: lazy(() => import("./renderers/DataVRenderer").then(m => ({ default: m.DataVRenderer }))),
      configSchema: schema,
    });
  }

  for (const meta of datavDecoMeta) {
      const colorSchema: any[] = [
        { key: "color1", label: "主色", type: "color", group: "样式" },
        /* 装饰 8（缠枝纹饰带 CurlingBranchBand）与 10（雕花边框 CarvedFrameDeco10）
           渲染端只消费 color1 —— 不再暴露改不动画面的「副色」假字段（诚实性扫描实证） */
        ...(meta.idx === 8 || meta.idx === 10
          ? []
          : [{ key: "color2", label: "副色", type: "color", group: "样式" }]),
      ];
    const schema: any[] = [
      ...colorSchema,
      { key: "opacity", label: "透明度", type: "slider", min: 0, max: 1, step: 0.05, group: "样式" },
    ];
    if (datavStrokeWidthSupported("decoration", meta.idx)) {
      schema.push({ key: "strokeWidth", label: "线条粗细", type: "slider", min: 0.5, max: 100, step: 2, group: "样式" });
    }
    if (meta.hasReverse) schema.push({ key: "reverse", label: "反转方向", type: "toggle", group: "布局" });
    if (meta.hasDur) schema.push({ key: "dur", label: "动画时长(秒)", type: "number", min: 0.5, step: 0.5, group: "动画" });
    if (meta.hasScanDur) {
      schema.push({ key: "scanDur", label: "扫描时长(秒)", type: "number", min: 0.5, step: 0.5, group: "动画" });
      schema.push({ key: "haloDur", label: "光晕时长(秒)", type: "number", min: 0.5, step: 0.5, group: "动画" });
    }
    schema.push({ key: "borderRadius", label: "圆角", type: "number", min: 0, max: 40, step: 1, group: "布局" });

    const defaultConfig: Record<string, any> = {
      datavKind: "decoration",
      datavIndex: meta.idx,
      opacity: 1,
      strokeWidth: 1,
      borderRadius: 0,
      reverse: false,
      dur: meta.durDefault ?? 3,
    };
    /* 写入 color1/color2 */
    defaultConfig.color1 = meta.defaultColors[0];
    defaultConfig.color2 = meta.defaultColors[1];
    if (meta.hasScanDur) {
      defaultConfig.scanDur = 3;
      defaultConfig.haloDur = 2;
    }

    componentRegistry.register({
      type: datavTypeOf("decoration", meta.idx),
      name: meta.name,
      icon: meta.icon,
      description: meta.desc,
      category: "ccat_decoration",
      version: "1.0.0",
      builtIn: true,
      enabled: true,
      defaultSize: meta.defaultSize,
      minSize: meta.minSize,
      defaultConfig,
      capabilities: { resizable: true, rotatable: false, draggable: true, connectable: false, embeddable: false },
      renderer: lazy(() => import("./renderers/DataVRenderer").then(m => ({ default: m.DataVRenderer }))),
      configSchema: schema,
    });
  }

  /* ─── 原生装饰形状：按形状能力补「渐变填充 / 轮廓阴影 / 描边细节」面板片段 ───
   *
   * 20 个原生形状此前只有纯色填充 + 透明度，而形状组（`shape`）早就有渐变与阴影，
   * 同一族几何两套面板能力。这里按能力判据决定给不给某个开关
   * ——只给"真的会改变画面"的形状，避免出现"开关拨过去画面毫无变化"的假控件。
   * 字面量只此一份（`editor/data/decorFields.ts`），能力判据只此一份
   * （`editor/data/decorationShape.ts`），渲染端消费点也在同一文件。 */
  for (const def of componentRegistry.getByCategory("ccat_decoration")) {
    // datav 族走自己的 color1/color2 配色模型，不参与本片段
    if (def.type.startsWith("datav-")) continue;
    const existing = new Set((def.configSchema ?? []).map((f) => f.key));
    const extra: ConfigField[] = [];
    if (decorSupportsGradient(def.type)) {
      extra.push(...decorGradientFields);
      def.defaultConfig = { ...decorGradientDefaults, ...def.defaultConfig };
      // 渐变开启后纯色填充不再被渲染端消费 → 隐藏它，避免属性栏出现"改了没反应"的控件
      for (const f of def.configSchema ?? []) {
        if (f.key !== "fill") continue;
        const prev = f.hidden;
        f.hidden = (c) => (c.gradientEnabled === true ? true : prev ? prev(c) : false);
      }
    }
    if (!existing.has("shadow")) {
      extra.push(decorShadowField);
      def.defaultConfig = { ...decorShadowDefaults, ...def.defaultConfig };
    }
    /* 描边细节（端点/转折）：能力判据在 decorationShape，默认值 = 该形状改动前的硬编码值
       → 未配置时产物逐字不变（零回归），面板显示的档位就是几何的历史值。 */
    for (const f of decorStrokeDetailFields(def.type)) {
      if (existing.has(f.key)) continue;
      extra.push(f);
      def.defaultConfig = { ...decorStrokeDetailDefaults(def.type), ...def.defaultConfig };
    }
    const fresh = extra.filter((f) => !existing.has(f.key));
    if (fresh.length > 0) def.configSchema = [...(def.configSchema ?? []), ...fresh];
  }

  const allDecorationTypes = componentRegistry.getByCategory("ccat_decoration");
  for (const def of allDecorationTypes) {
    def.defaultConfig = { ...def.defaultConfig, ...ANIMATION_DEFAULTS };
    const existingKeys = new Set((def.configSchema || []).map((s: any) => s.key));
    const newSchemaEntries = ANIMATION_SCHEMA.filter((s) => !existingKeys.has(s.key));
    def.configSchema = [...(def.configSchema || []), ...newSchemaEntries];
  }
}
