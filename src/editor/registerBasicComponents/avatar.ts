import { componentRegistry, lazy } from "../registryCore";
import { authEnabledField } from "../data/authMode";

export function registerAvatar(): void {
  // ─── 头像 ───
  componentRegistry.register({
    type: "avatar",
    name: "头像",
    icon: "account_circle",
    description: "身份头像组件：支持远程图片链接或 API 动态数据（可接入认证体系），图片/名称首字母/占位图标三级降级，登录态徽章",
    category: "ccat_basic",
    version: "1.2.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 80, height: 80 },
    minSize: { width: 24, height: 24 },
    defaultConfig: {
      // —— 内容 ——
      name: "A",
      alt: "",
      // 旧 v1.0 字段兼容（读取时作为 name 的回退）
      text: "",
      // —— 数据来源（无侵入式） ——
      // direct = 直接使用远程图片链接；api = 调用 API 动态获取头像数据
      sourceMode: "direct",
      src: "",
      // 接入认证体系：开启后请求自动携带认证 Token（窗口级全局 token 配置优先）
      authEnabled: false,
      apiUrl: "",
      apiMethod: "GET",
      // 响应取值路径（getNested），如 data.user
      apiDataPath: "",
      // 勾选 API 返回数据中作为头像图片 / 名称的字段路径
      avatarField: "avatar",
      nameField: "name",
      // 旧 v1.1 字段兼容（读取时映射，UI 不再展示）
      bindMode: "none",
      syncWithLoginForm: true,
      tokenKey: "auth_token",
      tokenStorage: "localStorage",
      // —— 尺寸 ——
      // fill = 跟随组件框宽高（默认，响应式随容器生效）；fixed = 固定像素（旧行为）
      sizeMode: "fill",
      size: 48,
      shape: "circle",
      bgColor: "rgba(255,152,0,0.15)",
      textColor: "#FF9800",
      fontSize: 18,
      fontWeight: "600",
      borderEnabled: false,
      borderColor: "rgba(255,255,255,0.2)",
      borderWidth: 2,
      objectFit: "cover",
      // —— 徽章 ——
      // none = 不显示；static = 静态圆点；auth = 随登录状态（isAuthenticated）
      badgeMode: "none",
      showBadge: false,
      badgeColor: "#4CAF50",
      badgeSize: 12,
      badgePosition: "bottom-right",
    },
    capabilities: {
      resizable: true,
      rotatable: false,
      draggable: true,
      connectable: false,
      embeddable: false,
    },
    renderer: lazy(() => import("../renderers/AvatarRenderer").then(m => ({ default: m.AvatarRenderer }))),
    configSchema: [
      // —— 内容 ——
      { key: "name", label: "名称", type: "text", group: "内容",
        help: "兜底名称：无图片或 API 未返回时显示首字符" },
      { key: "alt", label: "替代文字", type: "text", group: "内容",
        help: "无障碍描述，图片无法显示时展示" },
      // —— 数据来源（无侵入式） ——
      { key: "sourceMode", label: "数据来源", type: "select", group: "数据源",
        help: "直接图片：填写远程链接；API 数据：动态请求并勾选返回字段",
        options: [
          { label: "直接图片", value: "direct" },
          { label: "API 数据", value: "api" },
        ] },
      { key: "src", label: "远程图片链接", type: "text", group: "数据源",
        placeholder: "https://…/avatar.png",
        help: "直接模式：填写远程图片地址（完整链接或相对路径）", hidden: (c) => c.sourceMode !== "direct" },
      { key: "apiUrl", label: "API 地址", type: "text", group: "数据源",
        placeholder: "https://…/api/user/profile",
        help: "API 模式：完整地址直连；相对路径自动拼接全局 baseUrl", hidden: (c) => c.sourceMode !== "api" },
      { key: "apiMethod", label: "请求方式", type: "select", group: "数据源",
        options: [
          { label: "GET", value: "GET" },
          { label: "POST", value: "POST" },
        ], hidden: (c) => c.sourceMode !== "api" },
      authEnabledField({ label: "认证注入",
        help: "开启后请求自动携带认证 Token，登录后获取用户数据", hidden: (c) => c.sourceMode !== "api" }),
      { key: "apiDataPath", label: "数据路径", type: "text", group: "数据源",
        placeholder: "data.user",
        help: "响应对象取值路径，留空取整个响应", hidden: (c) => c.sourceMode !== "api" },
      // API 字段识别面板：拉取返回数据 → 自动识别 → 勾选写入 avatarField/nameField
      { key: "apiFieldPicker", label: "字段识别", type: "api-field-picker", group: "数据源",
        help: "获取字段后自动识别图片与名称字段，勾选确认；也可手动填写",
        hidden: (c) => c.sourceMode !== "api" },
      // —— 形状与尺寸 ——
      { key: "sizeMode", label: "尺寸模式", type: "select", group: "形状",
        help: "铺满组件：头像随画布拖拽缩放；固定：使用下方固定像素",
        options: [
          { label: "铺满组件（推荐）", value: "fill" },
          { label: "固定大小", value: "fixed" },
        ] },
      { key: "size", label: "大小", type: "number", min: 24, max: 200, group: "形状",
        hidden: (c) => c.sizeMode !== "fixed" },
      { key: "shape", label: "形状", type: "select", group: "形状",
        options: [
          { label: "圆形", value: "circle" },
          { label: "方形", value: "square" },
          { label: "圆角", value: "rounded" },
        ] },
      // —— 颜色 ——
      { key: "bgColor", label: "背景色", type: "color", group: "颜色" },
      { key: "textColor", label: "文字颜色", type: "color", group: "颜色" },
      // —— 文字样式 ——
      { key: "fontSize", label: "文字字号", type: "number", min: 10, max: 48, group: "文字" },
      { key: "fontWeight", label: "文字字重", type: "select", group: "文字",
        options: [
          { label: "常规", value: "normal" },
          { label: "中等", value: "500" },
          { label: "加粗", value: "600" },
          { label: "更粗", value: "bold" },
        ] },
      // —— 边框 ——
      { key: "borderEnabled", label: "边框", type: "toggle", group: "边框" },
      { key: "borderColor", label: "边框颜色", type: "color", group: "边框", hidden: (c) => !c.borderEnabled },
      { key: "borderWidth", label: "边框宽度", type: "number", min: 0, max: 10, group: "边框", hidden: (c) => !c.borderEnabled },
      // —— 图片填充 ——
      { key: "objectFit", label: "图片填充", type: "select", group: "图片",
        options: [
          { label: "覆盖", value: "cover" },
          { label: "包含", value: "contain" },
          { label: "拉伸", value: "fill" },
        ] },
      // —— 状态徽章 ——
      { key: "badgeMode", label: "徽章模式", type: "select", group: "徽章",
        options: [
          { label: "不显示", value: "none" },
          { label: "静态圆点", value: "static" },
          { label: "登录状态", value: "auth" },
        ] },
      { key: "badgeColor", label: "徽章颜色", type: "color", group: "徽章", hidden: (c) => c.badgeMode === "none" },
      { key: "badgeSize", label: "徽章大小", type: "number", min: 6, max: 24, group: "徽章", hidden: (c) => c.badgeMode === "none" },
      { key: "badgePosition", label: "徽章位置", type: "select", group: "徽章", hidden: (c) => c.badgeMode === "none",
        options: [
          { label: "右上", value: "top-right" },
          { label: "左上", value: "top-left" },
          { label: "右下", value: "bottom-right" },
          { label: "左下", value: "bottom-left" },
        ] },
    ],
  });
}
