import { componentRegistry, lazy } from "../registryCore";
import { dataSourceSchemaFieldsNoStatic } from "../dataSourceFields";

export function registerCarousel(): void {
  // ─── 轮播 ───
  componentRegistry.register({
    type: "carousel",
    name: "轮播",
    icon: "view_carousel",
    description: "幻灯片轮播组件，支持自动播放、左右箭头、指示点、淡入淡出/滑动切换",
    category: "ccat_layout",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 600, height: 320 },
    minSize: { width: 280, height: 160 },
    defaultConfig: {
      slides: [
        { title: "轮播一", description: "这是第一张幻灯片的内容描述。", imageUrl: "", bgColor: "rgba(255,152,0,0.15)", icon: "auto_awesome" },
        { title: "轮播二", description: "这是第二张幻灯片的内容描述。", imageUrl: "", bgColor: "rgba(33,150,243,0.15)", icon: "speed" },
        { title: "轮播三", description: "这是第三张幻灯片的内容描述。", imageUrl: "", bgColor: "rgba(76,175,80,0.15)", icon: "whatshot" },
      ],
      autoplay: true,
      interval: 4000,
      showArrows: true,
      showDots: true,
      transition: "slide",
      arrowColor: "rgba(255,255,255,0.8)",
      dotColor: "rgba(255,255,255,0.3)",
      dotActiveColor: "#ffffff",
      titleColor: "#ffffff",
      titleFontSize: 22,
      descColor: "rgba(255,255,255,0.7)",
      descFontSize: 14,
      borderRadius: 8,
      objectFit: "cover",
    },
    capabilities: {
      resizable: true,
      rotatable: false,
      draggable: true,
      connectable: false,
      embeddable: false,
    },
    renderer: lazy(() => import("../renderers/CarouselRenderer").then(m => ({ default: m.CarouselRenderer }))),
    configSchema: [
      // —— 数据 ——
      { key: "slides", label: "幻灯片数据", type: "list-editor", group: "数据源",
        itemLabelKey: "title",
        addItemLabel: "添加幻灯片",
        hidden: (c) => (c.dataMode ?? "static") === "api",
        help: "逐条添加幻灯片，填写标题、描述、图片地址、背景色和图标即可；切换「接口读取」时由接口响应驱动",
        itemFields: [
          { key: "title", label: "标题", type: "text" },
          { key: "description", label: "描述", type: "textarea" },
          { key: "imageUrl", label: "图片地址", type: "text" },
          { key: "bgColor", label: "背景色", type: "color" },
          { key: "icon", label: "图标", type: "icon-picker" },
        ] },
      // —— 数据源（条目型专用字段组：静态=内容项，接口=API 响应驱动）——
      ...dataSourceSchemaFieldsNoStatic,
      // —— 行为 ——
      { key: "autoplay", label: "自动播放", type: "toggle", group: "行为" },
      { key: "interval", label: "切换间隔(ms)", type: "number", min: 1000, max: 10000, step: 500, group: "行为", hidden: (c) => !c.autoplay },
      { key: "showArrows", label: "显示箭头", type: "toggle", group: "行为" },
      { key: "showDots", label: "显示指示点", type: "toggle", group: "行为" },
      { key: "transition", label: "切换动画", type: "select", group: "行为",
        options: [
          { label: "滑动", value: "slide" },
          { label: "淡入淡出", value: "fade" },
        ] },
      // —— 颜色 ——
      { key: "arrowColor", label: "箭头颜色", type: "color", group: "颜色" },
      { key: "dotColor", label: "指示点颜色", type: "color", group: "颜色" },
      { key: "dotActiveColor", label: "激活点颜色", type: "color", group: "颜色" },
      { key: "titleColor", label: "标题色", type: "color", group: "颜色" },
      { key: "descColor", label: "描述色", type: "color", group: "颜色" },
      // —— 字号 ——
      { key: "titleFontSize", label: "标题字号", type: "number", min: 12, max: 48, group: "字号" },
      { key: "descFontSize", label: "描述字号", type: "number", min: 10, max: 24, group: "字号" },
      // —— 布局 ——
      { key: "borderRadius", label: "圆角", type: "number", min: 0, max: 30, group: "布局" },
      { key: "objectFit", label: "图片填充", type: "select", group: "布局",
        options: [
          { label: "覆盖", value: "cover" },
          { label: "包含", value: "contain" },
        ] },
    ],
  });
}
