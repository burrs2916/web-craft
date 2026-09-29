import { componentRegistry, lazy } from "../registryCore";
import { authEnabledField } from "../data/authMode";

export function registerTag(): void {
  // ─── 标签 ───
  componentRegistry.register({
    type: "tag",
    name: "标签",
    icon: "label",
    description: "标签组件：支持颜色预设/风格/尺寸/可关闭/图标，可绑定接口按返回值映射为状态色（红灯绿灯式）",
    category: "ccat_basic",
    version: "2.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 80, height: 26 },
    minSize: { width: 40, height: 18 },
    defaultConfig: {
      text: "标签",
      colorPreset: "primary",
      variant: "light",
      size: "medium",
      closable: false,
      icon: "",
      iconSize: 14,
      customBg: "",
      customColor: "",
      customBorder: "",
      borderRadius: 4,
      fontSize: 0,
      fontWeight: "normal",
      // —— 数据感知状态 ——
      // canonical 值与 metric/progress 对齐：static/api（旧场景残留 "plain" 在两端按非 api 即静态处理）
      dataMode: "static",
      apiUrl: "",
      apiMethod: "GET",
      apiDataPath: "",
      apiInterval: 0,           // 秒，0=仅拉取一次（旧键 bindInterval 作为回退仍被读取）
      authEnabled: false,
      judgeMode: "exact",       // exact=精确值匹配；threshold=数值阈值判色
      valuePolicies: [],        // [{value, preset}] 值→预设映射
      thresholds: [],           // [{threshold, preset}] 数值边界(≥)→预设映射
      useValueAsText: false,    // true=用返回值当文字
      emptyWhen: "emptyValue",
      showWhenEmpty: true,
      hideOnError: false,
      showLoading: true,       // 首次请求期间显示灰色加载态
      bindTimeout: 0,          // 请求超时(秒)，0=不设超时
      errorPreset: "error",    // 请求失败未隐藏时的状态色
    },
    capabilities: {
      resizable: true, rotatable: false, draggable: true, connectable: false, embeddable: false,
    },
    renderer: lazy(() => import("../renderers/TagRenderer").then(m => ({ default: m.TagRenderer }))),
    configSchema: [
      // —— 内容 ——
      { key: "text", label: "文字", type: "text", group: "内容" },
      { key: "icon", label: "图标", type: "icon-picker", group: "内容" },
      { key: "iconSize", label: "图标大小", type: "number", min: 10, max: 24, group: "内容" },
      { key: "closable", label: "可关闭", type: "toggle", group: "内容" },
      // —— 数据源（纯取数配置：网站编辑器属性栏过滤本分组，入口 = API 标签页「切换为接口读取」）——
      { key: "apiUrl", label: "状态接口地址", type: "text", group: "数据源", hidden: (c) => c.dataMode !== "api",
        placeholder: "https://…/api/order/status", help: "完整地址直连；相对路径自动拼接全局 baseUrl" },
      { key: "apiMethod", label: "请求方式", type: "select", group: "数据源", hidden: (c) => c.dataMode !== "api",
        options: [
          { label: "GET", value: "GET" },
          { label: "POST", value: "POST" },
        ] },
      { key: "apiDataPath", label: "取值路径", type: "text", group: "数据源", hidden: (c) => c.dataMode !== "api",
        placeholder: "data.status / data", help: "从响应取此路径的值进行映射与判断，留空取整个响应" },
      { key: "apiInterval", label: "轮询间隔(秒)", type: "number", min: 0, group: "数据源", hidden: (c) => c.dataMode !== "api",
        help: "0 = 仅拉取一次；旧键 bindInterval 自动兼容" },
      authEnabledField({ hidden: (c) => c.dataMode !== "api" }),
      // —— 状态映射（判色规则属组件行为而非数据获取，属性栏直接可见可配）——
      { key: "dataMode", label: "数据模式", type: "select", group: "状态映射", defaultValue: "static",
        help: "静态：固定文字与颜色；绑定接口：按接口返回值映射状态色（如 pending→警告、success→成功）。接口地址在右侧「API」标签页配置",
        options: [
          { label: "静态", value: "static" },
          { label: "绑定接口判态", value: "api" },
        ] },
      { key: "judgeMode", label: "判色方式", type: "select", group: "状态映射", hidden: (c) => c.dataMode !== "api", defaultValue: "exact",
        help: "精确值：返回某值时套用预设色；数值区间：按≥阈值从高到低匹配，适合红灯绿灯式指标（如温度、占比、电量）",
        options: [
          { label: "精确值匹配", value: "exact" },
          { label: "数值区间(阈值)", value: "threshold" },
        ] },
      { key: "valuePolicies", label: "值→状态映射", type: "list-editor", group: "状态映射", hidden: (c) => c.dataMode !== "api",
        itemLabelKey: "preset", addItemLabel: "添加映射",
        help: "接口返回该值时套用对应颜色预设；未命中则用「样式」组的「颜色预设」",
        itemFields: [
          { key: "value", label: "返回值", type: "text", defaultValue: "" },
          { key: "preset", label: "状态色", type: "select", defaultValue: "success",
            options: [
              { label: "默认", value: "default" },
              { label: "主要", value: "primary" },
              { label: "成功", value: "success" },
              { label: "警告", value: "warning" },
              { label: "错误", value: "error" },
              { label: "信息", value: "info" },
              { label: "紫色", value: "purple" },
              { label: "青色", value: "cyan" },
            ] },
        ] },
      { key: "thresholds", label: "阈值→状态色", type: "list-editor", group: "状态映射", hidden: (c) => c.dataMode !== "api" || c.judgeMode !== "threshold",
        itemLabelKey: "threshold", addItemLabel: "添加阈值",
        help: "从上到下依次判断「返回值 ≥ 阈值」：命中即套用预设；全部未命中则用「颜色预设」。例如 90→成功、60→警告、0→错误",
        itemFields: [
          { key: "threshold", label: "阈值(≥)", type: "number", defaultValue: 0 },
          { key: "preset", label: "状态色", type: "select", defaultValue: "success",
            options: [
              { label: "默认", value: "default" },
              { label: "主要", value: "primary" },
              { label: "成功", value: "success" },
              { label: "警告", value: "warning" },
              { label: "错误", value: "error" },
              { label: "信息", value: "info" },
              { label: "紫色", value: "purple" },
              { label: "青色", value: "cyan" },
            ] },
        ] },
      { key: "useValueAsText", label: "用返回值当文字", type: "toggle", group: "状态映射", hidden: (c) => c.dataMode !== "api",
        help: "开启后把接口返回值直接作为标签文字显示" },
      { key: "emptyWhen", label: "判空规则", type: "select", group: "状态映射", hidden: (c) => c.dataMode !== "api",
        options: [
          { label: "空值/空对象", value: "emptyValue" },
          { label: "空数组", value: "emptyArray" },
          { label: "等于 0", value: "zero" },
          { label: "为假值", value: "falsy" },
        ] },
      { key: "showWhenEmpty", label: "空值显示", type: "toggle", group: "状态映射", hidden: (c) => c.dataMode !== "api",
        help: "开：返回值算空则显示(保持静态外观)；关：算空则隐藏" },
      { key: "hideOnError", label: "请求失败隐藏", type: "toggle", group: "状态映射", hidden: (c) => c.dataMode !== "api" },
      { key: "showLoading", label: "加载态", type: "toggle", group: "状态映射", hidden: (c) => c.dataMode !== "api", defaultValue: true,
        help: "首次请求期间显示灰色加载态，避免空白/闪烁" },
      { key: "bindTimeout", label: "请求超时(秒)", type: "number", min: 0, group: "状态映射", hidden: (c) => c.dataMode !== "api",
        help: "0=不设超时；超过时限按请求失败处理" },
      { key: "errorPreset", label: "失败状态色", type: "select", group: "状态映射", hidden: (c) => c.dataMode !== "api", defaultValue: "error",
        help: "请求失败且未开启「请求失败隐藏」时套用的状态色",
        options: [
          { label: "默认", value: "default" },
          { label: "主要", value: "primary" },
          { label: "成功", value: "success" },
          { label: "警告", value: "warning" },
          { label: "错误", value: "error" },
          { label: "信息", value: "info" },
          { label: "紫色", value: "purple" },
          { label: "青色", value: "cyan" },
        ] },
      // —— 样式 ——
      { key: "colorPreset", label: "颜色预设", type: "select", group: "样式",
        options: [
          { label: "默认", value: "default" },
          { label: "主要", value: "primary" },
          { label: "成功", value: "success" },
          { label: "警告", value: "warning" },
          { label: "错误", value: "error" },
          { label: "信息", value: "info" },
          { label: "紫色", value: "purple" },
          { label: "青色", value: "cyan" },
        ] },
      { key: "variant", label: "风格", type: "select", group: "样式",
        options: [
          { label: "浅色", value: "light" },
          { label: "描边", value: "outlined" },
          { label: "填充", value: "filled" },
        ] },
      { key: "size", label: "尺寸", type: "select", group: "样式",
        options: [
          { label: "小", value: "small" },
          { label: "中", value: "medium" },
          { label: "大", value: "large" },
        ] },
      { key: "customBg", label: "自定义背景", type: "color", group: "样式" },
      { key: "customColor", label: "自定义文字色", type: "color", group: "样式" },
      { key: "customBorder", label: "自定义描边色", type: "color", group: "样式",
        help: "仅描边风格生效；留空用预设描边色" },
      { key: "borderRadius", label: "圆角", type: "number", min: 0, max: 20, group: "样式" },
      { key: "fontSize", label: "字号(0=自动)", type: "number", min: 0, max: 24, group: "样式" },
      { key: "fontWeight", label: "字重", type: "select", group: "样式",
        options: [
          { label: "正常", value: "normal" },
          { label: "加粗", value: "bold" },
          { label: "500", value: "500" },
          { label: "600", value: "600" },
        ] },
    ],
  });
}
