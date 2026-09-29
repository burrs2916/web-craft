import { componentRegistry, lazy } from "../registryCore";
import { dataSourceSchemaFields } from "../dataSourceFields";

export function registerList(): void {
  // ─── 列表 ───
  componentRegistry.register({
    type: "list",
    name: "列表",
    icon: "list",
    description: "通用列表组件，支持图标/头像、副标题、徽章、分隔线、水平/垂直布局",
    category: "ccat_layout",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 300, height: 240 },
    minSize: { width: 180, height: 120 },
    defaultConfig: {
      items: [
        { text: "列表项一", subtext: "", icon: "star", avatarUrl: "", badge: "" },
        { text: "列表项二", subtext: "", icon: "info", avatarUrl: "", badge: "" },
        { text: "列表项三", subtext: "", icon: "check_circle", avatarUrl: "", badge: "" },
      ],
      layout: "vertical",
      showDivider: true,
      showIcon: true,
      itemHeight: 48,
      textColor: "rgba(255,255,255,0.85)",
      textFontSize: 14,
      textFontWeight: "normal",
      subtextColor: "rgba(255,255,255,0.45)",
      subtextFontSize: 12,
      dividerColor: "rgba(255,255,255,0.08)",
      bgColor: "transparent",
      itemBgColor: "transparent",
      itemHoverColor: "rgba(255,255,255,0.04)",
      badgeColor: "#FF9800",
      badgeBgColor: "rgba(255,152,0,0.15)",
      borderEnabled: false,
      borderColor: "rgba(255,255,255,0.1)",
      borderWidth: 1,
      borderRadius: 6,
      paddingX: 0,
      paddingY: 0,
      gap: 0,
      iconSize: 20,
      avatarSize: 36,
    },
    capabilities: {
      resizable: true,
      rotatable: false,
      draggable: true,
      connectable: false,
      embeddable: false,
    },
    renderer: lazy(() => import("../renderers/ListRenderer").then(m => ({ default: m.ListRenderer }))),
    configSchema: [
      // —— 数据 ——
      { key: "items", label: "列表数据", type: "list-editor", group: "数据源",
        itemLabelKey: "text",
        addItemLabel: "添加列表项",
        help: "逐条添加列表项，填写文本、副标题、徽章、图标或头像即可，无需编写代码",
        itemFields: [
          { key: "text", label: "文本", type: "text" },
          { key: "subtext", label: "副标题", type: "text" },
          { key: "badge", label: "徽章", type: "text" },
          { key: "icon", label: "图标", type: "icon-picker" },
          { key: "avatarUrl", label: "头像图片地址", type: "text" },
        ] },
      // —— 数据源（共享字段组）——
      ...dataSourceSchemaFields,
      // —— 布局 ——
      { key: "layout", label: "排列方向", type: "select", group: "布局",
        options: [
          { label: "垂直", value: "vertical" },
          { label: "水平", value: "horizontal" },
        ] },
      { key: "showDivider", label: "分隔线", type: "toggle", group: "布局" },
      { key: "showIcon", label: "显示图标", type: "toggle", group: "布局" },
      { key: "itemHeight", label: "项高度", type: "number", min: 32, max: 100, group: "布局" },
      { key: "gap", label: "项间距", type: "number", min: 0, max: 20, group: "布局" },
      { key: "borderRadius", label: "圆角", type: "number", min: 0, max: 30, group: "布局" },
      { key: "paddingX", label: "水平内边距", type: "number", min: 0, max: 40, group: "布局" },
      { key: "paddingY", label: "垂直内边距", type: "number", min: 0, max: 40, group: "布局" },
      // —— 文字 ——
      { key: "textColor", label: "文字颜色", type: "color", group: "文字" },
      { key: "textFontSize", label: "文字字号", type: "number", min: 10, max: 24, group: "文字" },
      { key: "textFontWeight", label: "文字字重", type: "select", group: "文字",
        options: [
          { label: "常规", value: "normal" },
          { label: "中等", value: "medium" },
          { label: "加粗", value: "bold" },
        ] },
      { key: "subtextColor", label: "副标题颜色", type: "color", group: "文字" },
      { key: "subtextFontSize", label: "副标题字号", type: "number", min: 10, max: 20, group: "文字" },
      // —— 颜色 ——
      { key: "bgColor", label: "背景色", type: "color", group: "颜色" },
      { key: "itemBgColor", label: "项背景色", type: "color", group: "颜色" },
      { key: "itemHoverColor", label: "悬停色", type: "color", group: "颜色" },
      { key: "dividerColor", label: "分隔线颜色", type: "color", group: "颜色" },
      // —— 徽章 ——
      { key: "badgeColor", label: "徽章文字色", type: "color", group: "徽章" },
      { key: "badgeBgColor", label: "徽章背景色", type: "color", group: "徽章" },
      // —— 图标 ——
      { key: "iconSize", label: "图标大小", type: "number", min: 12, max: 40, group: "图标" },
      { key: "avatarSize", label: "头像大小", type: "number", min: 24, max: 64, group: "图标" },
      // —— 边框 ——
      { key: "borderEnabled", label: "边框", type: "toggle", group: "边框" },
      { key: "borderColor", label: "边框颜色", type: "color", group: "边框", hidden: (c) => !c.borderEnabled },
      { key: "borderWidth", label: "边框宽度", type: "number", min: 0, max: 5, group: "边框", hidden: (c) => !c.borderEnabled },
    ],
  });
}
