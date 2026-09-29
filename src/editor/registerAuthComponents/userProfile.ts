/**
 * 注册认证组件 · 用户信息。
 * 从 registerAuthComponents.ts 迁出，仅做代码搬迁。
 */
import { componentRegistry, lazy } from "../registryCore";

export function registerAuthUserProfile(): void {
  // ─── 用户信息 ───
  componentRegistry.register({
    type: "auth-user-profile",
    name: "用户信息",
    icon: "account_circle",
    description: "展示当前登录用户的头像、名称、角色等信息",
    category: "ccat_auth",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 220, height: 50 },
    minSize: { width: 120, height: 36 },
    defaultConfig: {
      showAvatar: true,
      showName: true,
      showRole: false,
      showEmail: false,
      avatarSize: 40,
      fontSize: 14,
      nameField: "name",
      avatarField: "avatar",
      roleField: "role",
      emailField: "email",
      bgColor: "transparent",
      textColor: "#333333",
      avatarBgColor: "#1976d2",
      layout: "horizontal",
      placeholderName: "未登录",
      // v5: 动态展示配置（从缓存键映射到展示类型）
      userDisplayConfig: [],
      // 认证联动：与 login-form 的 tokenKey/tokenStorage 保持一致
      syncWithLoginForm: true,
      tokenKey: "auth_token",
      tokenStorage: "localStorage",
    },
    capabilities: {
      resizable: true,
      rotatable: false,
      draggable: true,
      connectable: false,
      embeddable: false,
    },
    renderer: lazy(() => import("../renderers/UserProfileRenderer").then(m => ({ default: m.UserProfileRenderer }))),
    configSchema: [
      { key: "showAvatar", label: "显示头像", type: "toggle", hidden: (c) => !!(Array.isArray(c.userDisplayConfig) && c.userDisplayConfig.length > 0) , group: "显示选项" },
      { key: "showName", label: "显示名称", type: "toggle", hidden: (c) => !!(Array.isArray(c.userDisplayConfig) && c.userDisplayConfig.length > 0) , group: "显示选项" },
      { key: "showRole", label: "显示角色", type: "toggle", hidden: (c) => !!(Array.isArray(c.userDisplayConfig) && c.userDisplayConfig.length > 0) , group: "显示选项" },
      { key: "showEmail", label: "显示邮箱", type: "toggle", hidden: (c) => !!(Array.isArray(c.userDisplayConfig) && c.userDisplayConfig.length > 0) , group: "显示选项" },
        { key: "layout", label: "布局方向", type: "select", group: "显示选项",        options: [
          { label: "水平", value: "horizontal" },
          { label: "垂直", value: "vertical" },
        ],
      },
      { key: "nameField", label: "名称字段", type: "text", hidden: (c) => !!(Array.isArray(c.userDisplayConfig) && c.userDisplayConfig.length > 0) , group: "字段映射" },
      { key: "avatarField", label: "头像字段", type: "text", hidden: (c) => !!(Array.isArray(c.userDisplayConfig) && c.userDisplayConfig.length > 0) , group: "字段映射" },
      { key: "roleField", label: "角色字段", type: "text", hidden: (c) => !!(Array.isArray(c.userDisplayConfig) && c.userDisplayConfig.length > 0) || !c.showRole , group: "字段映射" },
      { key: "emailField", label: "邮箱字段", type: "text", hidden: (c) => !!(Array.isArray(c.userDisplayConfig) && c.userDisplayConfig.length > 0) || !c.showEmail , group: "字段映射" },
      // ── v5 动态展示配置 ──
        { key: "userDisplayConfig", label: "展示字段映射", type: "list-editor", group: "动态展示配置（从缓存键映射）",        itemLabelKey: "cacheKey",
        addItemLabel: "添加映射",
        help: "多条 displayType 为「头像」的配置，仅第一条生效",
        itemFields: [
          { key: "cacheKey", label: "存储键名", type: "text", defaultValue: "" },
          { key: "objectPath", label: "对象路径", type: "text", defaultValue: "", placeholder: "如 name 或 profile.email，留空则同存储键名" },
            { key: "displayType", label: "展示类型", type: "select", defaultValue: "name",            options: [
              { label: "头像", value: "avatar" },
              { label: "名称", value: "name" },
              { label: "邮箱", value: "email" },
              { label: "角色", value: "role" },
              { label: "租户", value: "tenant" },
              { label: "自定义", value: "custom" },
            ],
          },
          { key: "customLabel", label: "自定义标签", type: "text", defaultValue: "" },
        ],
      },
      // ── 认证联动 ──
      { key: "syncWithLoginForm", label: "与登录组件同步配置", type: "toggle", defaultValue: true, help: "开启时自动跟随登录表单的 Token 存储方式与键名", group: "认证联动" },
      { key: "tokenKey", label: "Token 键名", type: "text", help: "必须与登录组件的 Token 键名一致，用于读取缓存的用户数据", hidden: (c) => c.syncWithLoginForm !== false, group: "认证联动" },
        { key: "tokenStorage", label: "存储方式", type: "select", group: "认证校验",
        options: [
          { label: "localStorage", value: "localStorage" },
          { label: "sessionStorage", value: "sessionStorage" },
          { label: "内存（刷新页面后清除）", value: "memory" },
        ],
        help: "内存模式仅限单页应用，多页面站点请用 localStorage/sessionStorage",
        hidden: (c) => c.syncWithLoginForm !== false,
      },
      { key: "avatarSize", label: "头像大小", type: "slider", min: 24, max: 80, step: 2 , group: "UI 样式" },
      { key: "fontSize", label: "字体大小", type: "slider", min: 10, max: 24, step: 1 , group: "UI 样式" },
      { key: "bgColor", label: "背景色", type: "color" , group: "UI 样式" },
      { key: "textColor", label: "文字颜色", type: "color" , group: "UI 样式" },
      { key: "avatarBgColor", label: "头像底色", type: "color" , group: "UI 样式" },
      { key: "placeholderName", label: "占位名称", type: "text" , group: "UI 样式" },
    ],
  });
}
