import { componentRegistry, lazy } from "../registryCore";
import { dataSourceSchemaFieldsNoStatic } from "../dataSourceFields";

export function registerBreadcrumb(): void {
  // ─── 面包屑 ───
  componentRegistry.register({
    type: "breadcrumb",
    name: "面包屑",
    icon: "breadcrumbs",
    description: "页面导航路径指示器，支持图标/文本分隔符、链接点击跳转",
    category: "ccat_layout",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 400, height: 48 },
    minSize: { width: 200, height: 32 },
    defaultConfig: {
      items: [
        { label: "首页", href: "/", icon: "material:home", newTab: false },
        { label: "分类", href: "", icon: "material:folder", newTab: false },
        { label: "当前页", href: "", icon: "material:article", newTab: false },
      ],
      separator: "chevron",
      separatorText: "/",
      textColor: "rgba(255,255,255,0.6)",
      activeColor: "#ffffff",
      fontSize: 14,
      fontWeight: "normal",
      iconColor: "rgba(255,255,255,0.3)",
      bgColor: "transparent",
      paddingX: 12,
      paddingY: 8,
      borderRadius: 6,
      borderEnabled: false,
      borderColor: "rgba(255,255,255,0.1)",
      borderWidth: 1,
    },
    capabilities: {
      resizable: true,
      rotatable: false,
      draggable: true,
      connectable: false,
      embeddable: false,
    },
    renderer: lazy(() => import("../renderers/BreadcrumbRenderer").then(m => ({ default: m.BreadcrumbRenderer }))),
    configSchema: [
      // —— 内容 ——
      { key: "items", label: "面包屑项", type: "list-editor", group: "内容",
        itemLabelKey: "label", addItemLabel: "添加面包屑",
        hidden: (c) => (c.dataMode ?? "static") === "api",
        help: "逐条添加面包屑；图标走选择器（同导航栏，支持自定义图标），链接可新窗口打开",
        itemFields: [
          { key: "label", label: "标签", type: "text", placeholder: "如 首页 / 分类" },
          { key: "href", label: "链接", type: "text", placeholder: "如 / 或 https://..." },
          { key: "icon", label: "图标", type: "icon-picker", defaultValue: "material:folder" },
          { key: "newTab", label: "新窗口打开", type: "toggle" },
        ] },
      // —— 数据源（条目型专用字段组：静态=内容组条目，接口=API 响应驱动）——
      ...dataSourceSchemaFieldsNoStatic,
      // —— 响应字段映射（接口模式）：指定接口项里各字段的真实名称 ——
      { key: "itemLabelField", label: "响应·标签字段", type: "text", group: "数据源",
        hidden: (c) => (c.dataMode ?? "static") !== "api",
        placeholder: "label（默认）",
        help: "接口每一项里代表标题的字段名，支持点路径如 nested.title" },
      { key: "itemHrefField", label: "响应·链接字段", type: "text", group: "数据源",
        hidden: (c) => (c.dataMode ?? "static") !== "api",
        placeholder: "href（默认）",
        help: "接口每一项里代表跳转链接的字段名" },
      { key: "itemIconField", label: "响应·图标字段", type: "text", group: "数据源",
        hidden: (c) => (c.dataMode ?? "static") !== "api",
        placeholder: "icon（默认）",
        help: "接口每一项里代表图标的字段名，如 iconName" },
      // —— 分隔符 ——
      { key: "separator", label: "分隔符样式", type: "select", group: "分隔符",
        options: [
          { label: "箭头", value: "chevron" },
          { label: "文本", value: "text" },
        ] },
      { key: "separatorText", label: "分隔文本", type: "text", group: "分隔符", hidden: (c) => c.separator !== "text" },
      // —— 颜色 ——
      { key: "textColor", label: "文字颜色", type: "color", group: "颜色" },
      { key: "activeColor", label: "当前项颜色", type: "color", group: "颜色" },
      { key: "iconColor", label: "分隔符颜色", type: "color", group: "颜色" },
      { key: "bgColor", label: "背景色", type: "color", group: "颜色" },
      // —— 文字 ——
      { key: "fontSize", label: "字号", type: "number", min: 10, max: 24, group: "文字" },
      { key: "fontWeight", label: "字重", type: "select", group: "文字",
        options: [
          { label: "常规", value: "normal" },
          { label: "中等", value: "medium" },
          { label: "加粗", value: "bold" },
        ] },
      // —— 布局 ——
      { key: "paddingX", label: "水平内边距", type: "number", min: 0, max: 40, group: "布局" },
      { key: "paddingY", label: "垂直内边距", type: "number", min: 0, max: 30, group: "布局" },
      { key: "borderRadius", label: "圆角", type: "number", min: 0, max: 30, group: "布局" },
      { key: "borderEnabled", label: "边框", type: "toggle", group: "边框" },
      { key: "borderColor", label: "边框颜色", type: "color", group: "边框", hidden: (c) => !c.borderEnabled },
      { key: "borderWidth", label: "边框宽度", type: "number", min: 0, max: 5, group: "边框", hidden: (c) => !c.borderEnabled },
    ],
  });
}
