import { componentRegistry, lazy } from "../registryCore";
import { DECOR_LINE_STYLE_OPTIONS } from "../data/decorationShape";

/**
 * 注册图案/标记类原生装饰形状的第三组：渐变块/角标/标记点/网格/斜线/点阵。
 *
 * 注册顺序与拆分前逐字保持一致（面板按注册表插入顺序展示），见 nativeShapes 的说明。
 */
export function registerNativePatternShapes(): void {
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
    renderer: lazy(() => import("../renderers/GradientDecorationRenderer").then(m => ({ default: m.GradientDecorationRenderer }))),
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
    renderer: lazy(() => import("../renderers/CornerDecorationRenderer").then(m => ({ default: m.CornerDecorationRenderer }))),
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
    renderer: lazy(() => import("../renderers/DotDecorationRenderer").then(m => ({ default: m.DotDecorationRenderer }))),
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
    renderer: lazy(() => import("../renderers/GridDecorationRenderer").then(m => ({ default: m.GridDecorationRenderer }))),
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
    renderer: lazy(() => import("../renderers/DiagonalDecorationRenderer").then(m => ({ default: m.DiagonalDecorationRenderer }))),
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
    renderer: lazy(() => import("../renderers/DotsPatternDecorationRenderer").then(m => ({ default: m.DotsPatternDecorationRenderer }))),
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
}