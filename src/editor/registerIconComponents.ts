import { componentRegistry, lazy } from "./registryCore";
import { dataSourceSchemaFields } from "./dataSourceFields";
import { DEFAULT_ICON_REF } from "./data/iconStyle";

/**
 * 图标组件组注册（ccat_icon）
 *
 * 本组此前面向"图标"的能力是**不存在的**：Material 图标只作为导航/按钮等组件的
 * 内嵌装饰出现，没有独立可拖拽、可绑定数据、可单独调样式的图标组件。
 *
 * 三个组件的共同约定：
 * 1. 图标引用口径 → `editor/data/iconStyle.ts`（归一 + 样式 + 列表数据），两端只读它。
 * 2. 图标渲染管线 → 编辑区 `IconResolver.resolveIcon`；发布端 `iconPipeline.renderMenuIcon`。
 *    支持 `material:<name>` / `custom-<id>` / `http(s):` / `data:` / `text:` / emoji 六种引用，
 *    空值落 `material:widgets`（两端同一默认）。
 * 3. 动态数据 + 认证联动 → 与认证组件组同一套：编辑区 `useApiDataFetch`（`authEnabled` 三态
 *    透传 `websiteAuthStore`），发布端 `dataLoaderScript`（`__WC_AUTH_ENABLED` / `__WC_TOKEN_*`
 *    + `auth-state-change` 事件重取）。认证站点与纯静态站点都能用同一份配置。
 * 4. 居中 + 随框等比缩放 → 与评分/分页同一公式（`editor/data/scaleFit.ts` 的 fitFactor），
 *    发布端 `codegen/scaleFit.ts` 用 transform 实现（不触发重排）。
 */
export function registerIconComponents(): void {

  // ─────────────────────────────────────────────────────────────
  // 单图标
  // ─────────────────────────────────────────────────────────────
  componentRegistry.register({
    type: "icon",
    name: "图标",
    icon: "star",
    description: "单个图标：六种图标来源、尺寸/配色/底色/圆角/边框/阴影/透明度、旋转翻转与持续旋转、悬浮放大、可挂链接、可绑定接口动态图标",
    category: "ccat_icon",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 64, height: 64 },
    minSize: { width: 24, height: 24 },
    defaultConfig: {
      icon: DEFAULT_ICON_REF,
      size: 32,
      label: "",
      href: "",
      linkTarget: "_blank",
      // 配色
      color: "",
      bgColor: "transparent",
      padding: 0,
      borderRadius: 0,
      borderWidth: 0,
      borderColor: "rgba(255,255,255,0.2)",
      borderStyle: "solid",
      shadow: false,
      opacity: 1,
      // 变换
      rotate: 0,
      flipH: false,
      flipV: false,
      spin: false,
      spinDuration: 2,
      hoverScale: 1,
      hoverDuration: 0.25,
      // 布局
      scaleFit: true,
      align: "center",
      layout: "horizontal",
      gap: 8,
      labelSize: 13,
      labelColor: "rgba(255,255,255,0.85)",
    },
    capabilities: {
      resizable: true, rotatable: false, draggable: true, connectable: false, embeddable: false,
    },
    renderer: lazy(() => import("./renderers/IconRenderer").then(m => ({ default: m.IconRenderer }))),
    configSchema: [
      // —— 内容 ——
      { key: "icon", label: "图标", type: "icon-picker", group: "内容",
        help: "支持 Material 图标、自定义图标库、图片 URL、Emoji、文字图元" },
      { key: "size", label: "图标尺寸", type: "number", min: 6, max: 400, group: "内容",
        help: "自然尺寸；开启「随拖动框等比缩放」时会按框大小整体缩放" },
      { key: "label", label: "说明文字", type: "text", group: "内容", help: "留空则只显示图标" },
      { key: "layout", label: "图标文字排布", type: "select", group: "内容",
        hidden: (c) => !c.label,
        options: [
          { label: "横向", value: "horizontal" },
          { label: "纵向", value: "vertical" },
        ] },
      { key: "gap", label: "图标与文字间距", type: "number", min: 0, max: 60, group: "内容",
        hidden: (c) => !c.label },
      { key: "labelSize", label: "文字字号", type: "number", min: 6, max: 80, group: "内容",
        hidden: (c) => !c.label },
      { key: "labelColor", label: "文字颜色", type: "color", group: "内容",
        hidden: (c) => !c.label },
      // —— 数据源（共享字段组：接口动态图标 + 认证三态） ——
      ...dataSourceSchemaFields,
      // —— 配色与容器 ——
      { key: "color", label: "图标颜色", type: "color", group: "样式",
        help: "留空跟随文字色（currentColor）" },
      { key: "bgColor", label: "背景色", type: "color", group: "样式" },
      { key: "padding", label: "内边距", type: "number", min: 0, max: 80, group: "样式" },
      { key: "borderRadius", label: "圆角", type: "number", min: 0, max: 60, group: "样式",
        help: "面板值为倍数，实际像素 = 值 × 主题圆角基数（与表单/媒体组件同口径）" },
      { key: "borderWidth", label: "边框宽度", type: "number", min: 0, max: 12, group: "样式" },
      { key: "borderStyle", label: "边框线型", type: "select", group: "样式",
        hidden: (c) => !c.borderWidth,
        options: [
          { label: "实线", value: "solid" },
          { label: "虚线", value: "dashed" },
          { label: "点线", value: "dotted" },
        ] },
      { key: "borderColor", label: "边框颜色", type: "color", group: "样式", hidden: (c) => !c.borderWidth },
      { key: "shadow", label: "投影", type: "toggle", group: "样式" },
      { key: "opacity", label: "不透明度", type: "number", min: 0, max: 1, step: 0.05, group: "样式" },
      // —— 变换 ——
      { key: "rotate", label: "旋转角度", type: "number", min: -360, max: 360, group: "变换" },
      { key: "flipH", label: "水平翻转", type: "toggle", group: "变换" },
      { key: "flipV", label: "垂直翻转", type: "toggle", group: "变换" },
      { key: "spin", label: "持续旋转", type: "toggle", group: "变换", help: "常用于加载/刷新类图标" },
      { key: "spinDuration", label: "旋转周期(秒)", type: "number", min: 0.2, max: 20, step: 0.1, group: "变换",
        hidden: (c) => !c.spin },
      { key: "hoverScale", label: "悬浮放大倍数", type: "number", min: 1, max: 3, step: 0.05, group: "变换" },
      { key: "hoverDuration", label: "过渡时长(秒)", type: "number", min: 0, max: 5, step: 0.05, group: "变换" },
      // —— 行为与布局 ——
      { key: "href", label: "跳转链接", type: "text", group: "行为", placeholder: "https://example.com" },
      { key: "linkTarget", label: "打开方式", type: "select", group: "行为", hidden: (c) => !c.href,
        options: [
          { label: "新窗口", value: "_blank" },
          { label: "当前窗口", value: "_self" },
        ] },
      { key: "align", label: "水平对齐", type: "select", group: "布局",
        options: [
          { label: "左", value: "left" },
          { label: "居中", value: "center" },
          { label: "右", value: "right" },
        ] },
      { key: "scaleFit", label: "随拖动框等比缩放", type: "toggle", group: "布局",
        help: "开：图标按拖动框尺寸整体等比缩放并居中；关：保持自然尺寸" },
    ],
  });

  // ─────────────────────────────────────────────────────────────
  // 图标列表
  // ─────────────────────────────────────────────────────────────
  componentRegistry.register({
    type: "icon-list",
    name: "图标列表",
    icon: "view_list",
    description: "图标 + 文字的条目列表：横向/纵向排布、多列、条目底色与悬浮态、图标配色，支持接口动态条目与认证联动",
    category: "ccat_icon",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 320, height: 80 },
    minSize: { width: 120, height: 32 },
    defaultConfig: {
      items: "dashboard|总览\nbar_chart|统计\nsettings|设置",
      layout: "horizontal",
      columns: 0,
      // 图标
      iconSize: 20,
      iconColor: "",
      // 文字
      labelSize: 13,
      labelColor: "rgba(255,255,255,0.85)",
      // 条目
      gap: 16,
      itemPadding: 6,
      itemBgColor: "transparent",
      itemRadius: 0,
      itemBorderWidth: 0,
      itemBorderColor: "rgba(255,255,255,0.12)",
      hoverBgColor: "rgba(255,255,255,0.08)",
      align: "left",
      scaleFit: true,
    },
    capabilities: {
      resizable: true, rotatable: false, draggable: true, connectable: false, embeddable: false,
    },
    renderer: lazy(() => import("./renderers/IconListRenderer").then(m => ({ default: m.IconListRenderer }))),
    configSchema: [
      // —— 内容 ——
      { key: "items", label: "条目数据", type: "textarea", group: "内容",
        help: "每行一条「图标|文字」或「图标|文字|提交值」；也可用 JSON 数组 [{\"icon\":\"star\",\"label\":\"收藏\"}]" },
      { key: "layout", label: "排布方向", type: "select", group: "内容",
        options: [
          { label: "横向", value: "horizontal" },
          { label: "纵向", value: "vertical" },
        ] },
      { key: "columns", label: "列数（仅横向）", type: "number", min: 0, max: 12, group: "内容",
        help: "0 = 自动排列不换行", hidden: (c) => c.layout === "vertical" },
      // —— 数据源（共享字段组）——
      ...dataSourceSchemaFields,
      // —— 图标 ——
      { key: "iconSize", label: "图标尺寸", type: "number", min: 6, max: 120, group: "图标" },
      { key: "iconColor", label: "图标颜色", type: "color", group: "图标", help: "留空跟随文字色" },
      // —— 文字 ——
      { key: "labelSize", label: "文字字号", type: "number", min: 6, max: 60, group: "文字" },
      { key: "labelColor", label: "文字颜色", type: "color", group: "文字" },
      // —— 条目样式 ——
      { key: "gap", label: "条目间距", type: "number", min: 0, max: 80, group: "条目" },
      { key: "itemPadding", label: "条目内边距", type: "number", min: 0, max: 40, group: "条目" },
      { key: "itemBgColor", label: "条目背景色", type: "color", group: "条目" },
      { key: "itemRadius", label: "条目圆角", type: "number", min: 0, max: 60, group: "条目" },
      { key: "itemBorderWidth", label: "条目边框宽度", type: "number", min: 0, max: 8, group: "条目" },
      { key: "itemBorderColor", label: "条目边框颜色", type: "color", group: "条目", hidden: (c) => !c.itemBorderWidth },
      { key: "hoverBgColor", label: "条目悬浮背景色", type: "color", group: "条目" },
      // —— 布局 ——
      { key: "align", label: "水平对齐", type: "select", group: "布局",
        options: [
          { label: "左", value: "left" },
          { label: "居中", value: "center" },
          { label: "右", value: "right" },
        ] },
      { key: "scaleFit", label: "随拖动框等比缩放", type: "toggle", group: "布局" },
    ],
  });

  // ─────────────────────────────────────────────────────────────
  // 图标按钮
  // ─────────────────────────────────────────────────────────────
  componentRegistry.register({
    type: "icon-button",
    name: "图标按钮",
    icon: "smart_button",
    description: "带图标（可含文字）的按钮：实心/描边/文字三种形态、尺寸档位、配色、投影、禁用与链接、接口动态图标",
    category: "ccat_icon",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 120, height: 40 },
    minSize: { width: 40, height: 28 },
    defaultConfig: {
      icon: "material:add",
      text: "新建",
      variant: "solid",
      size: "medium",
      color: "#2196F3",
      textColor: "",
      iconColor: "",
      fontSize: 13,
      paddingX: 16,
      gap: 6,
      borderRadius: 4,
      borderWidth: 1,
      shadow: false,
      opacity: 1,
      hoverBgColor: "",
      hoverScale: 1,
      hoverDuration: 0.25,
      disabled: false,
      href: "",
      linkTarget: "_blank",
      scaleFit: true,
      align: "left",
    },
    capabilities: {
      resizable: true, rotatable: false, draggable: true, connectable: false, embeddable: false,
    },
    renderer: lazy(() => import("./renderers/IconButtonRenderer").then(m => ({ default: m.IconButtonRenderer }))),
    configSchema: [
      // —— 内容 ——
      { key: "icon", label: "图标", type: "icon-picker", group: "内容" },
      { key: "text", label: "按钮文字", type: "text", group: "内容", help: "留空则为纯图标按钮" },
      { key: "variant", label: "形态", type: "select", group: "内容",
        options: [
          { label: "实心", value: "solid" },
          { label: "描边", value: "outline" },
          { label: "文字", value: "text" },
        ] },
      { key: "size", label: "尺寸", type: "select", group: "内容",
        options: [
          { label: "小", value: "small" },
          { label: "中", value: "medium" },
          { label: "大", value: "large" },
        ] },
      // —— 数据源（共享字段组：接口动态图标 + 认证三态） ——
      ...dataSourceSchemaFields,
      // —— 配色 ——
      { key: "color", label: "主题色", type: "color", group: "配色" },
      { key: "textColor", label: "按钮文字色", type: "color", group: "配色",
        help: "留空时：实心形态白字、描边/文字形态跟随主题色" },
      { key: "iconColor", label: "图标颜色", type: "color", group: "配色", help: "留空跟随按钮文字色" },
      { key: "hoverBgColor", label: "悬浮背景色", type: "color", group: "配色", help: "留空则按形态自动派生" },
      { key: "opacity", label: "不透明度", type: "number", min: 0, max: 1, step: 0.05, group: "配色" },
      // —— 尺寸与边框 ——
      { key: "fontSize", label: "文字字号", type: "number", min: 6, max: 40, group: "尺寸" },
      { key: "paddingX", label: "左右内边距", type: "number", min: 0, max: 80, group: "尺寸" },
      { key: "gap", label: "图标与文字间距", type: "number", min: 0, max: 40, group: "尺寸" },
      { key: "borderRadius", label: "圆角", type: "number", min: 0, max: 60, group: "尺寸" },
      { key: "borderWidth", label: "边框宽度", type: "number", min: 0, max: 8, group: "尺寸",
        hidden: (c) => c.variant !== "outline", help: "仅「描边」形态生效" },
      { key: "shadow", label: "投影", type: "toggle", group: "尺寸" },
      // —— 交互 ——
      { key: "hoverScale", label: "悬浮放大倍数", type: "number", min: 1, max: 2, step: 0.05, group: "交互" },
      { key: "hoverDuration", label: "过渡时长(秒)", type: "number", min: 0, max: 5, step: 0.05, group: "交互" },
      { key: "disabled", label: "禁用", type: "toggle", group: "交互" },
      { key: "href", label: "跳转链接", type: "text", group: "交互", placeholder: "https://example.com" },
      { key: "linkTarget", label: "打开方式", type: "select", group: "交互", hidden: (c) => !c.href,
        options: [
          { label: "新窗口", value: "_blank" },
          { label: "当前窗口", value: "_self" },
        ] },
      // —— 布局 ——
      { key: "align", label: "水平对齐", type: "select", group: "布局",
        options: [
          { label: "左", value: "left" },
          { label: "居中", value: "center" },
          { label: "右", value: "right" },
        ] },
      { key: "scaleFit", label: "随拖动框等比缩放", type: "toggle", group: "布局" },
    ],
  });
}
