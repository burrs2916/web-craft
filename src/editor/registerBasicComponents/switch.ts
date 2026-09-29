import { componentRegistry, lazy } from "../registryCore";
import { authEnabledField } from "../data/authMode";
import {
  scaleFitField,
  hAlignField,
  vAlignField,
  toggleAppearanceSchemaFields,
  choiceValidationSchema,
} from "../registerFormComponents";

export function registerSwitch(): void {
  // ─── 开关（控制型，IoT「看状态 + 发命令」；已合并表单开关 form-switch——
  //     fieldName 填写即参与表单容器提交，form-switch 面板隐藏保留注册供旧场景渲染）───
  componentRegistry.register({
    type: "switch",
    name: "开关",
    icon: "toggle_on",
    description: "控制型开关：接口轮询回读真实开/关状态，可点击翻转并派发「值变更」事件（事件面板绑「调用接口」下发命令）；填字段名可参与表单提交",
    category: "ccat_basic",
    version: "1.1.0",
    builtIn: true,
    enabled: true,
    // 全族不变式：defaultSize 恒等于 SWITCH_FIT.refW/refH（"拖进来即 1 倍"）
    defaultSize: { width: 200, height: 40 },
    minSize: { width: 80, height: 28 },
    defaultConfig: {
      label: "设备电源",
      checked: false,
      labelPlacement: "right",
      size: "medium",
      interactive: true,
      onValue: "",
      offValue: "",
      fieldName: "",
      required: false,
      validateMessage: "",
      errorColor: "#f44336",
      helperText: "",
      disabled: false,
      textColor: "#333333",
      accentColor: "#1976d2",
      fontSize: 14,
      scaleFit: true,
      align: "center",
      vAlign: "center",
      // —— 状态回读（progress 同款键与语义；属性面板「数据源」分组被网站编辑器过滤，
      //    实际配置入口是 API 配置面板的「切换为接口读取」）——
      dataMode: "static",
      apiUrl: "",
      apiPath: "",
      apiMethod: "GET",
      apiInterval: 0,
      apiDataPath: "",
      apiHeaders: "",
      apiBody: "",
      authEnabled: false, // 显式 false：三态 UI 表达不了"跟随全局"，defaultConfig 落明值防面板撒谎
    },
    events: [
      { id: "click", name: "点击" },
      { id: "change", name: "值变更" },
    ],
    capabilities: {
      resizable: true, rotatable: false, draggable: true, connectable: false, embeddable: false,
    },
    renderer: lazy(() => import("../renderers/SwitchRenderer").then(m => ({ default: m.SwitchRenderer }))),
    configSchema: [
      // ── 状态回读（组件行为，属性栏直接可见可配）──
      { key: "dataMode", label: "数据模式", type: "select", group: "状态回读", defaultValue: "static",
        help: "静态：固定状态；绑定接口：轮询接口回读真实开/关（接口地址在右侧「API」标签页配置）。开启交互时，点击乐观翻转、下一次轮询自动校正",
        options: [
          { label: "静态", value: "static" },
          { label: "绑定接口回读", value: "api" },
        ] },
      { key: "interactive", label: "可点击", type: "toggle", group: "状态回读", defaultValue: true,
        help: "开：点击翻转状态并派发「值变更」事件（事件面板可绑「调用接口」下发开/关命令）；关：只读纯展示" },
      { key: "onValue", label: "「开」期望值", type: "text", group: "状态回读", hidden: (c) => c.dataMode !== "api",
        placeholder: "如 running / 1 / true", help: "接口返回该值（不区分大小写）视为开；留空用内置词表（on/open/运行/在线…）" },
      { key: "offValue", label: "「关」期望值", type: "text", group: "状态回读", hidden: (c) => c.dataMode !== "api",
        placeholder: "如 stopped / 0 / false", help: "接口返回该值视为关；留空用内置词表（off/停止/离线…）" },
      // ── 数据源（纯取数配置：网站编辑器属性栏过滤本分组，入口 = API 标签页「切换为接口读取」）──
      { key: "apiUrl", label: "状态接口地址", type: "text", group: "数据源", hidden: (c) => c.dataMode !== "api",
        placeholder: "https://…/api/device/power", help: "完整地址直连；相对路径自动拼接全局 baseUrl" },
      { key: "apiPath", label: "接口路径", type: "text", group: "数据源", hidden: (c) => c.dataMode !== "api",
        placeholder: "device/power", help: "与全局 baseUrl 拼接；填写完整 API 地址时可留空" },
      { key: "apiMethod", label: "请求方式", type: "select", group: "数据源", hidden: (c) => c.dataMode !== "api",
        options: [
          { label: "GET", value: "GET" },
          { label: "POST", value: "POST" },
        ] },
      { key: "apiHeaders", label: "请求头(JSON)", type: "text", group: "数据源", hidden: (c) => c.dataMode !== "api",
        placeholder: '{"X-Org":"demo"}' },
      { key: "apiBody", label: "请求体(JSON)", type: "text", group: "数据源", hidden: (c) => c.dataMode !== "api",
        placeholder: '{"id":1}' },
      { key: "apiInterval", label: "轮询间隔(秒)", type: "number", group: "数据源", min: 0, defaultValue: 0,
        help: "0 = 仅首次拉取，不轮询", hidden: (c) => c.dataMode !== "api" },
      { key: "apiDataPath", label: "取值路径", type: "text", group: "数据源", hidden: (c) => c.dataMode !== "api",
        placeholder: "data.status / data", help: "从响应取此路径的值判定开/关，留空取整个响应" },
      authEnabledField({ label: "认证注入", help: "开启后自动从认证组件读取 Token 并注入 Authorization header", hidden: (c) => c.dataMode !== "api" }),
      // ── 内容 ──
      { key: "label", label: "标签文字", type: "text", group: "内容" },
      { key: "checked", label: "默认状态为开", type: "toggle", group: "内容" },
      { key: "labelPlacement", label: "标签位置", type: "select", group: "内容",
        options: [
          { label: "右侧", value: "right" },
          { label: "左侧", value: "left" },
        ] },
      { key: "size", label: "尺寸", type: "select", group: "内容",
        options: [
          { label: "中", value: "medium" },
          { label: "小", value: "small" },
        ] },
      // ── 表单提交（form-switch 合并能力；fieldName 显式填写才参与，留空 = 纯控制开关）──
      { key: "fieldName", label: "字段名", type: "text", group: "内容", placeholder: "如 power，留空不参与提交",
        help: "填写后该开关参与表单容器提交（提交布尔值 true/false）；留空则为纯控制开关" },
      { key: "required", label: "必填", type: "toggle", group: "内容", hidden: (c) => !c.fieldName,
        help: "开启后必须打开开关才能提交（提交时统一拦截并提示）" },
      ...choiceValidationSchema.map((f) => ({ ...f, hidden: (c: Record<string, unknown>) => !c.fieldName || (f.key === "validateMessage" && c.required !== true) })),
      { key: "helperText", label: "帮助文字", type: "text", group: "内容",
        help: "开关下方常驻说明文字，校验出错时让位于错误提示" },
      { key: "disabled", label: "禁用", type: "toggle", group: "内容",
        help: "灰显且不可点击；表单提交时跳过该字段" },
      // ── 样式 ──
      { key: "textColor", label: "文字颜色", type: "color", group: "样式" },
      { key: "accentColor", label: "开启颜色", type: "color", group: "样式", help: "开启时滑块与轨道的颜色" },
      { key: "fontSize", label: "字号", type: "number", min: 10, max: 30, group: "样式" },
      { key: "trackOffColor", label: "关闭轨道色", type: "color", group: "样式" },
      { key: "trackOffOpacity", label: "关闭轨道透明度", type: "slider", min: 0, max: 1, step: 0.05, group: "样式" },
      { key: "trackOnOpacity", label: "开启轨道透明度", type: "slider", min: 0, max: 1, step: 0.05, group: "样式" },
      { key: "thumbOffColor", label: "关闭滑块色", type: "color", group: "样式" },
      ...toggleAppearanceSchemaFields,
      // ── 布局 ──
      scaleFitField,
      hAlignField,
      vAlignField,
    ],
  });
}
