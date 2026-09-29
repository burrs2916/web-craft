import { componentRegistry, lazy } from "../registryCore";

export function registerTabs(): void {
  // ─── Tabs 标签页 ───
  componentRegistry.register({
    type: "tabs",
    name: "标签页",
    icon: "tab",
    description: "标签页组件，支持多标签切换内容，4种形态+4个方向，内容区可嵌入任意组件",
    category: "ccat_layout",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 480, height: 320 },
    minSize: { width: 120, height: 80 },
    defaultConfig: {
      // 标签（JSON 字符串，TabItem[] 序列化）
      tabs: '[{"id":"tab-0","label":"标签 1"},{"id":"tab-1","label":"标签 2"},{"id":"tab-2","label":"标签 3"}]',
      activeTabId: "tab-0",
      // 位置 & 形态
      tabPosition: "top",
      variant: "underline",
      tabSize: "medium",
      tabGap: 4,
      // 标签颜色
      tabBg: "transparent",
      tabColor: "rgba(255,255,255,0.7)",
      activeTabBg: "rgba(255,255,255,0.08)",
      activeTabColor: "#ffffff",
      indicatorColor: "#FF9800",
      indicatorWidth: 2,
      // 内容区
      contentBgEnabled: true,
      contentBg: "rgba(255,255,255,0.02)",
      contentBorderEnabled: true,
      contentBorderColor: "rgba(255,255,255,0.1)",
      contentBorderWidth: 1,
      contentPaddingX: 16,
      contentPaddingY: 16,
      contentRadius: 8,
    },
    capabilities: {
      resizable: true,
      rotatable: false,
      draggable: true,
      connectable: false,
      embeddable: true,
    },
    renderer: lazy(() => import("../renderers/TabsRenderer").then(m => ({ default: m.TabsRenderer }))),
    configSchema: [
      // —— 标签 ——
      { key: "tabs", label: "标签列表", type: "tab-editor", group: "标签" },
      // —— 形态 ——
      { key: "tabPosition", label: "标签位置", type: "select", options: [
        { label: "顶部", value: "top" },
        { label: "底部", value: "bottom" },
        { label: "左侧", value: "left" },
        { label: "右侧", value: "right" },
      ], group: "形态" },
      { key: "variant", label: "标签样式", type: "select", options: [
        { label: "下划线", value: "underline" },
        { label: "胶囊", value: "pill" },
        { label: "卡片", value: "card" },
        { label: "分段", value: "segmented" },
      ], group: "形态" },
      { key: "tabSize", label: "标签尺寸", type: "select", options: [
        { label: "小", value: "small" },
        { label: "中", value: "medium" },
        { label: "大", value: "large" },
      ], group: "形态" },
      { key: "tabGap", label: "标签间距", type: "number", min: 0, max: 20, group: "形态" },
      // —— 标签颜色 ——
      { key: "tabColor", label: "标签文字色", type: "color", group: "标签颜色" },
      { key: "activeTabColor", label: "激活文字色", type: "color", group: "标签颜色" },
      { key: "tabBg", label: "标签背景色", type: "color", group: "标签颜色" },
      { key: "activeTabBg", label: "激活背景色", type: "color", group: "标签颜色",
        hidden: (c) => c.variant === "underline" },
      { key: "indicatorColor", label: "指示线/填充色", type: "color", group: "标签颜色" },
      { key: "indicatorWidth", label: "指示线粗细", type: "number", min: 1, max: 10, group: "标签颜色",
        hidden: (c) => c.variant !== "underline" },
      // —— 内容区 ——
      { key: "contentBgEnabled", label: "内容背景", type: "toggle", group: "内容区" },
      { key: "contentBg", label: "背景色", type: "color", group: "内容区", hidden: (c) => !c.contentBgEnabled },
      { key: "contentBorderEnabled", label: "内容边框", type: "toggle", group: "内容区" },
      { key: "contentBorderColor", label: "边框颜色", type: "color", group: "内容区", hidden: (c) => !c.contentBorderEnabled },
      { key: "contentBorderWidth", label: "边框宽度", type: "number", min: 0, max: 10, group: "内容区", hidden: (c) => !c.contentBorderEnabled },
      { key: "contentPaddingX", label: "水平内边距", type: "number", min: 0, max: 200, group: "内容区" },
      { key: "contentPaddingY", label: "垂直内边距", type: "number", min: 0, max: 200, group: "内容区" },
      { key: "contentRadius", label: "圆角", type: "number", min: 0, max: 50, group: "内容区" },
    ],
  });
}
