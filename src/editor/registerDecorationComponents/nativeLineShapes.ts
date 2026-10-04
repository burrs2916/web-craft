import { componentRegistry, lazy } from "../registryCore";
import { DECOR_LINE_STYLE_OPTIONS } from "../data/decorationShape";

/**
 * 注册线性装饰形状的第二组：分隔线/波浪线/虚线框。
 *
 * 注册顺序与拆分前逐字保持一致（面板按注册表插入顺序展示），见 nativeShapes 的说明。
 */
export function registerNativeLineShapes(): void {
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
    renderer: lazy(() => import("../renderers/DividerDecorationRenderer").then(m => ({ default: m.DividerDecorationRenderer }))),
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
    renderer: lazy(() => import("../renderers/WaveDecorationRenderer").then(m => ({ default: m.WaveDecorationRenderer }))),
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
    renderer: lazy(() => import("../renderers/DashedBoxDecorationRenderer").then(m => ({ default: m.DashedBoxDecorationRenderer }))),
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
}