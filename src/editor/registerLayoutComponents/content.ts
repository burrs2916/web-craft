import { componentRegistry, lazy } from "../registryCore";
import { parsePanes } from "../utils/panes";
import { authEnabledField } from "../data/authMode";

export function registerContentPanel(): void {
  // ─── 内容面板 ───
  componentRegistry.register({
    type: "content-panel",
    name: "内容面板",
    icon: "view_quilt",
    description: "与侧边栏菜单配套的内容区组件，菜单项绑定面板后可在同视图内切换内容，无需跨页面跳转",
    category: "ccat_layout",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 600, height: 400 },
    minSize: { width: 200, height: 120 },
    defaultConfig: {
      panes: '[\n  { "id": "pane-1", "name": "面板 1", "content": "面板 1 的内容，可以放置文字、描述等。", "bgColor": null },\n  { "id": "pane-2", "name": "面板 2", "content": "面板 2 的内容。", "bgColor": null },\n  { "id": "pane-3", "name": "面板 3", "content": "面板 3 的内容。", "bgColor": null }\n]',
      activePaneId: "pane-1",
      // —— 数据绑定 ——
      dataMode: "static",
      apiUrl: "",
      apiMethod: "GET",
      apiInterval: 0,
      apiDataPath: "",
      authEnabled: false,
      // —— 面板内容样式 ——
      contentBg: "transparent",
      contentColor: "rgba(255,255,255,0.85)",
      contentFontSize: 14,
      contentLineHeight: 1.6,
      contentPaddingX: 12,
      contentPaddingY: 12,
      // —— 切换动画 ——
      animationEnabled: true,
      animationType: "fade",
      // —— 容器样式 ——
      backgroundColor: "rgba(30,30,50,0.6)",
      backgroundOpacity: 100,
      backgroundEnabled: true,
      borderEnabled: false,
      borderColor: "rgba(255,255,255,0.12)",
      borderWidth: 1,
      borderStyle: "solid",
      borderRadius: 0,
      paddingX: 16,
      paddingY: 16,
      shadowEnabled: false,
      shadowOffsetX: 0,
      shadowOffsetY: 4,
      shadowBlur: 12,
      shadowSpread: 0,
      shadowColor: "rgba(0,0,0,0.3)",
      overflow: "hidden",
    },
    capabilities: {
      resizable: true,
      rotatable: false,
      draggable: true,
      connectable: false,
      embeddable: false,
    },
    renderer: lazy(() => import("../renderers/ContentPanelRenderer").then(m => ({ default: m.ContentPanelRenderer }))),
    configSchema: [
      // ── 面板 ──
      { key: "panes", label: "面板列表", type: "pane-editor", group: "面板" },
      {
        key: "activePaneId", label: "默认激活面板", type: "select", group: "面板",
        dynamicOptions: (c) => {
          const panes = parsePanes(c.panes);
          if (panes.length === 0) return undefined;
          return panes.map((p) => ({ label: p.name || p.id, value: p.id }));
        },
        help: "页面加载时默认显示的面板，可在面板列表中点击切换",
      },
      { key: "animationEnabled", label: "切换动画", type: "toggle", group: "面板" },
      { key: "animationType", label: "动画类型", type: "select", options: [
        { label: "淡入淡出", value: "fade" },
        { label: "无动画", value: "none" },
      ], group: "面板", hidden: (c) => !c.animationEnabled },
      // ── 数据绑定 ──
      {
        key: "dataMode", label: "数据模式", type: "select", group: "数据源",
        options: [
          { label: "静态内容", value: "static" },
          { label: "API 动态数据", value: "api" },
        ],
        help: "静态：直接编辑面板内容；API：从接口拉取数据，面板内容中可用 {字段名} 插值",
      },
      {
        key: "apiUrl", label: "API 地址", type: "text", group: "数据源",
        placeholder: "https://api.example.com/data",
        hidden: (c) => c.dataMode !== "api",
      },
      {
        key: "apiPath", label: "接口路径", type: "text", group: "数据源",
        placeholder: "dashboard/summary",
        help: "与全局 baseUrl 拼接；填写完整 API 地址时可留空",
        hidden: (c) => c.dataMode !== "api",
      },
      {
        key: "apiMethod", label: "请求方式", type: "select", group: "数据源",
        options: [{ label: "GET", value: "GET" }, { label: "POST", value: "POST" }],
        hidden: (c) => c.dataMode !== "api",
      },
      {
        key: "apiHeaders", label: "请求头(JSON)", type: "text", group: "数据源",
        placeholder: '{"X-Org":"demo"}',
        hidden: (c) => c.dataMode !== "api",
      },
      {
        key: "apiBody", label: "请求体(JSON)", type: "text", group: "数据源",
        placeholder: '{"id":1}',
        hidden: (c) => c.dataMode !== "api",
      },
      {
        key: "apiInterval", label: "轮询间隔(秒)", type: "number", group: "数据源",
        min: 0, defaultValue: 0,
        help: "0 = 仅首次拉取",
        hidden: (c) => c.dataMode !== "api",
      },
      {
        key: "apiDataPath", label: "数据路径", type: "text", group: "数据源",
        placeholder: "data.result",
        help: "从 JSON 响应中取值的路径，如 data.metrics 或 result",
        hidden: (c) => c.dataMode !== "api",
      },
      authEnabledField({
        help: "开启后自动从认证组件读取 Token 并注入 Authorization header",
        hidden: (c) => c.dataMode !== "api",
      }),
      // ── 面板内容样式 ──
      { key: "contentBg", label: "内容背景色", type: "color", group: "面板样式" },
      { key: "contentColor", label: "内容文字色", type: "color", group: "面板样式" },
      { key: "contentFontSize", label: "内容字号", type: "number", min: 10, max: 40, group: "面板样式" },
      { key: "contentLineHeight", label: "内容行高", type: "number", min: 1, max: 3, step: 0.1, group: "面板样式" },
      { key: "contentPaddingX", label: "内容水平内边距", type: "number", min: 0, max: 100, group: "面板样式" },
      { key: "contentPaddingY", label: "内容垂直内边距", type: "number", min: 0, max: 100, group: "面板样式" },
      // ── 容器样式 ──
      { key: "backgroundEnabled", label: "启用背景", type: "toggle", group: "容器样式" },
      { key: "backgroundColor", label: "背景色", type: "color", group: "容器样式", hidden: (c) => !c.backgroundEnabled },
      { key: "backgroundOpacity", label: "背景透明度", type: "slider", min: 0, max: 100, step: 5, group: "容器样式", hidden: (c) => !c.backgroundEnabled },
      { key: "borderEnabled", label: "边框", type: "toggle", group: "容器样式" },
      { key: "borderColor", label: "边框颜色", type: "color", group: "容器样式", hidden: (c) => !c.borderEnabled },
      { key: "borderWidth", label: "边框宽度", type: "number", min: 0, max: 10, group: "容器样式", hidden: (c) => !c.borderEnabled },
      { key: "borderStyle", label: "边框样式", type: "select", options: [
        { label: "实线", value: "solid" },
        { label: "虚线", value: "dashed" },
        { label: "点线", value: "dotted" },
      ], group: "容器样式", hidden: (c) => !c.borderEnabled },
      { key: "borderRadius", label: "圆角", type: "number", min: 0, max: 50, group: "容器样式" },
      { key: "paddingX", label: "容器水平内边距", type: "number", min: 0, max: 200, group: "容器样式" },
      { key: "paddingY", label: "容器垂直内边距", type: "number", min: 0, max: 200, group: "容器样式" },
      { key: "overflow", label: "内容溢出", type: "select", options: [
        { label: "隐藏", value: "hidden" },
        { label: "滚动", value: "scroll" },
        { label: "自动", value: "auto" },
        { label: "显示", value: "visible" },
      ], group: "容器样式" },
      // ── 阴影 ──
      { key: "shadowEnabled", label: "阴影", type: "toggle", group: "容器样式" },
      { key: "shadowOffsetX", label: "水平偏移", type: "number", min: -60, max: 60, group: "容器样式", hidden: (c) => !c.shadowEnabled },
      { key: "shadowOffsetY", label: "垂直偏移", type: "number", min: -60, max: 60, group: "容器样式", hidden: (c) => !c.shadowEnabled },
      { key: "shadowBlur", label: "模糊半径", type: "number", min: 0, max: 60, group: "容器样式", hidden: (c) => !c.shadowEnabled },
      { key: "shadowSpread", label: "扩散范围", type: "number", min: -60, max: 60, group: "容器样式", hidden: (c) => !c.shadowEnabled },
      { key: "shadowColor", label: "阴影颜色", type: "color", group: "容器样式", hidden: (c) => !c.shadowEnabled },
    ],
  });
}

export function registerContentModal(): void {
  // ─── 弹出框 ───
  componentRegistry.register({
    type: "content-modal",
    name: "弹出框",
    icon: "open_in_new",
    description: "弹出框/Modal 组件，为链接、按钮或事件绑定弹出框内容，点击触发弹出",
    category: "ccat_layout",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 480, height: 320 },
    minSize: { width: 200, height: 120 },
    defaultConfig: {
      modals: '[\n  { "id": "modal-1", "name": "弹出框 1", "title": "弹出标题", "content": "这里是弹出框内容，可以放置说明文字、表单或提示信息。", "bgColor": null }\n]',
      // 功能类型：info=信息框 confirm=确认框 form=表单框
      modalStyle: "info",
      // 弹出框尺寸
      modalWidth: 480,
      modalMaxHeight: 80,
      // 按钮配置
      okText: "确定",
      cancelText: "取消",
      okButtonColor: "#4f9eff",
      cancelButtonColor: "#666666",
      // 表单字段（仅 form 类型适用）
      formFields: '[\n  { "name": "username", "label": "用户名", "type": "text", "placeholder": "请输入用户名", "required": true }\n]',
      // 遮罩层
      overlayColor: "rgba(0,0,0,0.6)",
      overlayBlur: false,
      overlayBlurAmount: 4,
      closeOnClick: true,
      showCloseButton: true,
      animationEnabled: true,
      // 弹出框容器样式
      containerBg: "rgba(40,40,60,0.95)",
      containerColor: "#ffffff",
      titleColor: "#ffffff",
      titleFontSize: 18,
      contentColor: "rgba(255,255,255,0.85)",
      contentFontSize: 14,
      contentLineHeight: 1.6,
      // 外观
      borderRadius: 12,
      paddingX: 24,
      paddingY: 24,
      // 边框
      borderEnabled: false,
      borderColor: "rgba(255,255,255,0.12)",
      borderWidth: 1,
      borderStyle: "solid",
      // 阴影
      shadowEnabled: true,
      shadowBlur: 40,
      shadowColor: "rgba(0,0,0,0.5)",
    },
    capabilities: {
      resizable: true,
      rotatable: false,
      draggable: true,
      connectable: false,
      embeddable: false,
    },
    renderer: lazy(() => import("../renderers/ModalRenderer").then(m => ({ default: m.ModalRenderer }))),
    configSchema: [
      { key: "modals", label: "弹出框列表", type: "pane-editor", group: "弹出框" },
      // —— 功能类型 ——
      { key: "modalStyle", label: "类型", type: "select", options: [
        { label: "信息框", value: "info" },
        { label: "确认框", value: "confirm" },
        { label: "表单框", value: "form" },
      ], group: "功能" },
      // —— 尺寸 ——
      { key: "modalWidth", label: "弹出宽度", type: "number", min: 200, max: 1200, group: "尺寸" },
      { key: "modalMaxHeight", label: "最大高度(%)", type: "number", min: 20, max: 100, group: "尺寸" },
      // —— 按钮配置 ——
      { key: "okText", label: "确认按钮文案", type: "text", group: "按钮" },
      { key: "okButtonColor", label: "确认按钮颜色", type: "color", group: "按钮" },
      { key: "cancelText", label: "取消按钮文案", type: "text", group: "按钮", hidden: (c) => c.modalStyle === "info" },
      { key: "cancelButtonColor", label: "取消按钮颜色", type: "color", group: "按钮", hidden: (c) => c.modalStyle === "info" },
      // —— 表单字段（仅 form） ——
      { key: "formFields", label: "表单字段 JSON", type: "textarea", group: "表单", hidden: (c) => c.modalStyle !== "form" },
      // —— 遮罩层 ——
      { key: "overlayColor", label: "遮罩颜色", type: "color", group: "遮罩" },
      { key: "overlayBlur", label: "遮罩模糊", type: "toggle", group: "遮罩" },
      { key: "overlayBlurAmount", label: "模糊强度", type: "number", min: 1, max: 20, group: "遮罩", hidden: (c) => !c.overlayBlur },
      { key: "closeOnClick", label: "点击遮罩关闭", type: "toggle", group: "遮罩" },
      { key: "showCloseButton", label: "关闭按钮", type: "toggle", group: "遮罩" },
      { key: "animationEnabled", label: "弹出动画", type: "toggle", group: "遮罩" },
      // —— 文字 ——
      { key: "containerColor", label: "容器文字色", type: "color", group: "文字" },
      { key: "titleColor", label: "标题颜色", type: "color", group: "文字" },
      { key: "titleFontSize", label: "标题字号", type: "number", min: 12, max: 40, group: "文字" },
      { key: "contentColor", label: "内容文字色", type: "color", group: "文字" },
      { key: "contentFontSize", label: "内容字号", type: "number", min: 10, max: 30, group: "文字" },
      { key: "contentLineHeight", label: "内容行高", type: "number", min: 1, max: 3, step: 0.1, group: "文字" },
      // —— 容器外观 ——
      { key: "containerBg", label: "容器背景色", type: "color", group: "容器" },
      { key: "borderRadius", label: "圆角", type: "number", min: 0, max: 50, group: "容器" },
      { key: "paddingX", label: "水平内边距", type: "number", min: 0, max: 200, group: "容器" },
      { key: "paddingY", label: "垂直内边距", type: "number", min: 0, max: 200, group: "容器" },
      // —— 边框 ——
      { key: "borderEnabled", label: "边框", type: "toggle", group: "边框" },
      { key: "borderColor", label: "边框颜色", type: "color", group: "边框", hidden: (c) => !c.borderEnabled },
      { key: "borderWidth", label: "边框宽度", type: "number", min: 0, max: 10, group: "边框", hidden: (c) => !c.borderEnabled },
      { key: "borderStyle", label: "边框样式", type: "select", options: [
        { label: "实线", value: "solid" },
        { label: "虚线", value: "dashed" },
        { label: "点线", value: "dotted" },
      ], group: "边框", hidden: (c) => !c.borderEnabled },
      // —— 阴影 ——
      { key: "shadowEnabled", label: "阴影", type: "toggle", group: "阴影" },
      { key: "shadowBlur", label: "阴影模糊", type: "number", min: 0, max: 100, group: "阴影", hidden: (c) => !c.shadowEnabled },
      { key: "shadowColor", label: "阴影颜色", type: "color", group: "阴影", hidden: (c) => !c.shadowEnabled },
    ],
  });
}

export function registerContentDrawer(): void {
  // ─── 抽屉 ───
  componentRegistry.register({
    type: "content-drawer",
    name: "抽屉",
    icon: "vertical_split",
    description: "抽屉/Drawer 组件，从四个边（上/下/左/右）滑动出现，为链接、按钮或事件绑定内容，点击触发弹出",
    category: "ccat_layout",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 320, height: 480 },
    minSize: { width: 200, height: 200 },
    defaultConfig: {
      modals: '[\n  { "id": "drawer-1", "name": "抽屉 1", "title": "抽屉标题", "content": "这里是抽屉内容，可以放置说明文字、表单或提示信息。", "bgColor": null }\n]',
      // 功能类型：info=信息框 confirm=确认框 form=表单框
      modalStyle: "info",
      // 抽屉方向：top/bottom/left/right
      direction: "right",
      // 抽屉尺寸（水平方向控制宽度，垂直方向控制高度）
      drawerWidth: 380,
      drawerHeight: 400,
      // 按钮配置
      okText: "确定",
      cancelText: "取消",
      okButtonColor: "#4f9eff",
      cancelButtonColor: "#666666",
      // 表单字段（仅 form 类型适用）
      formFields: '[\n  { "name": "username", "label": "用户名", "type": "text", "placeholder": "请输入用户名", "required": true }\n]',
      // 遮罩层
      overlayColor: "rgba(0,0,0,0.6)",
      overlayBlur: false,
      overlayBlurAmount: 4,
      closeOnClick: true,
      showCloseButton: true,
      animationEnabled: true,
      animationDuration: 300,
      // 抽屉容器样式
      containerBg: "rgba(40,40,60,0.95)",
      containerColor: "#ffffff",
      titleColor: "#ffffff",
      titleFontSize: 18,
      contentColor: "rgba(255,255,255,0.85)",
      contentFontSize: 14,
      contentLineHeight: 1.6,
      // 外观
      borderRadius: 12,
      paddingX: 24,
      paddingY: 24,
      // 边框
      borderEnabled: false,
      borderColor: "rgba(255,255,255,0.12)",
      borderWidth: 1,
      borderStyle: "solid",
      // 阴影
      shadowEnabled: true,
      shadowBlur: 40,
      shadowColor: "rgba(0,0,0,0.5)",
    },
    capabilities: {
      resizable: true,
      rotatable: false,
      draggable: true,
      connectable: false,
      embeddable: false,
    },
    renderer: lazy(() => import("../renderers/DrawerRenderer").then(m => ({ default: m.DrawerRenderer }))),
    configSchema: [
      { key: "modals", label: "抽屉列表", type: "pane-editor", group: "抽屉" },
      // —— 功能类型 ——
      { key: "modalStyle", label: "类型", type: "select", options: [
        { label: "信息框", value: "info" },
        { label: "确认框", value: "confirm" },
        { label: "表单框", value: "form" },
      ], group: "功能" },
      // —— 方向 ——
      { key: "direction", label: "弹出方向", type: "select", options: [
        { label: "右侧", value: "right" },
        { label: "左侧", value: "left" },
        { label: "上方", value: "top" },
        { label: "下方", value: "bottom" },
      ], group: "功能" },
      // —— 尺寸 ——
      { key: "drawerWidth", label: "宽度（水平方向）", type: "number", min: 200, max: 1200, group: "尺寸" },
      { key: "drawerHeight", label: "高度（垂直方向）", type: "number", min: 200, max: 1200, group: "尺寸" },
      // —— 按钮配置 ——
      { key: "okText", label: "确认按钮文案", type: "text", group: "按钮" },
      { key: "okButtonColor", label: "确认按钮颜色", type: "color", group: "按钮" },
      { key: "cancelText", label: "取消按钮文案", type: "text", group: "按钮", hidden: (c) => c.modalStyle === "info" },
      { key: "cancelButtonColor", label: "取消按钮颜色", type: "color", group: "按钮", hidden: (c) => c.modalStyle === "info" },
      // —— 表单字段（仅 form） ——
      { key: "formFields", label: "表单字段 JSON", type: "textarea", group: "表单", hidden: (c) => c.modalStyle !== "form" },
      // —— 遮罩层 ——
      { key: "overlayColor", label: "遮罩颜色", type: "color", group: "遮罩" },
      { key: "overlayBlur", label: "遮罩模糊", type: "toggle", group: "遮罩" },
      { key: "overlayBlurAmount", label: "模糊强度", type: "number", min: 1, max: 20, group: "遮罩", hidden: (c) => !c.overlayBlur },
      { key: "closeOnClick", label: "点击遮罩关闭", type: "toggle", group: "遮罩" },
      { key: "showCloseButton", label: "关闭按钮", type: "toggle", group: "遮罩" },
      { key: "animationEnabled", label: "滑动动画", type: "toggle", group: "遮罩" },
      { key: "animationDuration", label: "动画时长(ms)", type: "number", min: 0, max: 2000, step: 50, group: "遮罩", hidden: (c) => !c.animationEnabled },
      // —— 文字 ——
      { key: "containerColor", label: "容器文字色", type: "color", group: "文字" },
      { key: "titleColor", label: "标题颜色", type: "color", group: "文字" },
      { key: "titleFontSize", label: "标题字号", type: "number", min: 12, max: 40, group: "文字" },
      { key: "contentColor", label: "内容文字色", type: "color", group: "文字" },
      { key: "contentFontSize", label: "内容字号", type: "number", min: 10, max: 30, group: "文字" },
      { key: "contentLineHeight", label: "内容行高", type: "number", min: 1, max: 3, step: 0.1, group: "文字" },
      // —— 容器外观 ——
      { key: "containerBg", label: "容器背景色", type: "color", group: "容器" },
      { key: "borderRadius", label: "圆角", type: "number", min: 0, max: 50, group: "容器" },
      { key: "paddingX", label: "水平内边距", type: "number", min: 0, max: 200, group: "容器" },
      { key: "paddingY", label: "垂直内边距", type: "number", min: 0, max: 200, group: "容器" },
      // —— 边框 ——
      { key: "borderEnabled", label: "边框", type: "toggle", group: "边框" },
      { key: "borderColor", label: "边框颜色", type: "color", group: "边框", hidden: (c) => !c.borderEnabled },
      { key: "borderWidth", label: "边框宽度", type: "number", min: 0, max: 10, group: "边框", hidden: (c) => !c.borderEnabled },
      { key: "borderStyle", label: "边框样式", type: "select", options: [
        { label: "实线", value: "solid" },
        { label: "虚线", value: "dashed" },
        { label: "点线", value: "dotted" },
      ], group: "边框", hidden: (c) => !c.borderEnabled },
      // —— 阴影 ——
      { key: "shadowEnabled", label: "阴影", type: "toggle", group: "阴影" },
      { key: "shadowBlur", label: "阴影模糊", type: "number", min: 0, max: 100, group: "阴影", hidden: (c) => !c.shadowEnabled },
      { key: "shadowColor", label: "阴影颜色", type: "color", group: "阴影", hidden: (c) => !c.shadowEnabled },
    ],
  });
}
