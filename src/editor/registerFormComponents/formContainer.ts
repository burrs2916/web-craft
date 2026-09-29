import { componentRegistry, lazy } from "../registryCore";

// ─── 输出框 ───
export function registerFormContainer(): void {
  componentRegistry.register({
    type: "form-container",
    name: "表单容器",
    icon: "dynamic_form",
    description: "表单容器，包裹内部表单控件，统一收集、校验、提交",
    category: "ccat_form",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 320, height: 360 },
    minSize: { width: 200, height: 160 },
    defaultConfig: {
      submitMethod: "POST",
      submitUrl: "",
      authToken: false,
      afterAction: "none",
      afterWriteVar: "",
      afterRefreshSourceIds: [],
      afterEventId: "",
      redirectUrl: "",
      okMessage: "提交成功",
      errMessage: "提交失败",
      loadingHint: true,
      showHeader: false,
      title: "",
      subtitle: "",
      columns: 1,
      showSubmit: true,
      submitText: "提交",
      submitWidthMode: "full",
      submitWidth: 180,
      submitAlign: "center",
      submitBgColor: "#1976d2",
      submitTextColor: "#ffffff",
      showReset: false,
      resetText: "重置",
      resetVariant: "outlined",
      bgEnabled: true,
      bgColor: "rgba(255,255,255,0.04)",
      borderEnabled: true,
      borderColor: "#4c5b70",
      borderRadius: 6,
      paddingX: 16,
      paddingY: 12,
      fieldGap: 10,
    },
    capabilities: {
      resizable: true, rotatable: false, draggable: true, connectable: false, embeddable: true,
    },
    renderer: lazy(() => import("../renderers/FormContainerRenderer").then(m => ({ default: m.FormContainerRenderer }))),
    configSchema: [
      // ── 表单字段（容器内子元素管理面板） ──
      { key: "__formFields", label: "表单字段", type: "form-fields", group: "表单字段" },

      // ── 数据提交 ──
      { key: "submitMethod", label: "提交方式", type: "select", options: [
        { label: "POST(JSON)", value: "POST" },
        { label: "GET(查询参数)", value: "GET" },
      ], group: "数据提交" },
      { key: "submitUrl", label: "提交地址", type: "text", group: "数据提交", placeholder: "https://api.example.com/submit", help: "留空则提交功能不生效，仅展示结构" },
      { key: "authToken", label: "认证方式", type: "select", group: "数据提交", options: [
        { label: "跟随全局", value: "follow" },
        { label: "强制认证", value: "enabled" },
        { label: "公开访问", value: "disabled" },
      ]},
      { key: "afterAction", label: "成功后动作", type: "select", options: [
        { label: "无动作", value: "none" },
        { label: "跳转链接", value: "redirect" },
        { label: "成功提示", value: "message" },
        { label: "写入变量", value: "writeVar" },
        { label: "刷新组件", value: "refresh" },
        { label: "触发事件", value: "event" },
      ], group: "数据提交" },
      { key: "redirectUrl", label: "跳转地址", type: "text", group: "数据提交", hidden: (c) => (c.afterAction ?? "none") !== "redirect" },
      { key: "okMessage", label: "成功提示", type: "text", group: "数据提交", hidden: (c) => (c.afterAction ?? "none") !== "message" },
      { key: "afterWriteVar", label: "写入变量名", type: "text", group: "数据提交", hidden: (c) => (c.afterAction ?? "none") !== "writeVar", placeholder: "如 currentUser", help: "提交成功后把响应写入该场景变量" },
      { key: "afterRefreshSourceIds", label: "刷新组件数据源", type: "text", group: "数据提交", hidden: (c) => (c.afterAction ?? "none") !== "refresh", placeholder: "用逗号分隔多个数据源ID", help: "提交成功后重新拉取这些组件绑定的接口" },
      { key: "afterEventId", label: "触发的事件ID", type: "text", group: "数据提交", hidden: (c) => (c.afterAction ?? "none") !== "event", placeholder: "事件绑定ID", help: "提交成功后派发该事件绑定" },
      { key: "errMessage", label: "失败提示", type: "text", group: "数据提交" },
      { key: "loadingHint", label: "提交时加载态", type: "toggle", group: "数据提交", help: "提交期间按钮显示加载转圈并禁用，防止重复提交" },

      // ── 头部 ──
      { key: "showHeader", label: "显示标题区", type: "toggle", group: "标题", help: "需同时填写标题或副标题后生效" },
      { key: "title", label: "标题", type: "text", group: "标题", hidden: (c) => (c.showHeader ?? false) !== true },
      { key: "subtitle", label: "副标题", type: "text", group: "标题", hidden: (c) => (c.showHeader ?? false) !== true },

      // ── 提交按钮 ──
      { key: "showSubmit", label: "显示提交按钮", type: "toggle", group: "提交按钮" },
      { key: "submitText", label: "按钮文字", type: "text", group: "提交按钮", hidden: (c) => (c.showSubmit ?? true) === false },
      { key: "submitWidthMode", label: "按钮宽度", type: "select", group: "提交按钮", hidden: (c) => (c.showSubmit ?? true) === false, options: [
        { label: "占满", value: "full" },
        { label: "固定宽度", value: "fixed" },
        { label: "自适应", value: "auto" },
      ]},
      { key: "submitWidth", label: "固定宽度", type: "number", min: 40, max: 600, group: "提交按钮", hidden: (c) => (c.submitWidthMode ?? "full") !== "fixed" || (c.showSubmit ?? true) === false },
      { key: "submitAlign", label: "按钮对齐", type: "select", group: "提交按钮", hidden: (c) => (c.showSubmit ?? true) === false, options: [
        { label: "居中", value: "center" },
        { label: "左对齐", value: "left" },
        { label: "右对齐", value: "right" },
      ]},
      { key: "submitBgColor", label: "按钮背景色", type: "color", group: "提交按钮", hidden: (c) => (c.showSubmit ?? true) === false },
      { key: "submitTextColor", label: "按钮文字色", type: "color", group: "提交按钮", hidden: (c) => (c.showSubmit ?? true) === false },

      // ── 重置按钮 ──
      { key: "showReset", label: "显示重置按钮", type: "toggle", group: "重置按钮" },
      { key: "resetText", label: "重置文字", type: "text", group: "重置按钮", hidden: (c) => (c.showReset ?? false) !== true },
      { key: "resetVariant", label: "重置样式", type: "select", group: "重置按钮", hidden: (c) => (c.showReset ?? false) !== true, options: [
        { label: "描边", value: "outlined" },
        { label: "填充", value: "contained" },
        { label: "文字", value: "text" },
      ]},

      // ── 布局 ──
      { key: "columns", label: "列数", type: "number", min: 1, max: 4, group: "布局", help: "空态占位示意图的列数；发布端子控件按画布位置自由排布，不受列数约束" },
      { key: "fieldGap", label: "控件间距", type: "number", min: 0, max: 60, group: "布局" },
      { key: "paddingX", label: "左右内边距", type: "number", min: 0, max: 120, group: "布局" },
      { key: "paddingY", label: "上下内边距", type: "number", min: 0, max: 120, group: "布局" },

      // ── 外观 ──
      { key: "bgEnabled", label: "背景", type: "toggle", group: "外观" },
      { key: "bgColor", label: "背景色", type: "color", group: "外观", hidden: (c) => (c.bgEnabled ?? true) !== true },
      { key: "borderEnabled", label: "边框", type: "toggle", group: "外观" },
      { key: "borderColor", label: "边框颜色", type: "color", group: "外观", hidden: (c) => (c.borderEnabled ?? true) !== true },
      { key: "borderRadius", label: "圆角", type: "number", min: 0, max: 40, group: "外观" },
    ],
  });
}
