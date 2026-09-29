/**
 * 注册认证组件 · 注册表单。
 * 从 registerAuthComponents.ts 迁出，仅做代码搬迁。
 */
import { componentRegistry, lazy } from "../registryCore";

export function registerAuthRegisterForm(): void {
  // ─── 注册表单 ───
  componentRegistry.register({
    type: "auth-register-form",
    name: "注册表单",
    icon: "person_add",
    description: "用户自助注册表单，字段完全可配置，注册成功后可自动登录并联动认证体系",
    category: "ccat_auth",
    version: "3.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 360, height: 380 },
    minSize: { width: 280, height: 280 },
    defaultConfig: {
      apiUrl: "",
      method: "POST",
      title: "注册",
      buttonText: "注册",
      bgColor: "#ffffff",
      textColor: "#333333",
      borderColor: "#e0e0e0",
      borderRadius: 8,
      fontSize: 14,
      // 非侵入式：字段列表完全由用户定义，不再硬编码 username/password/email
      fields: [
        { name: "username", label: "用户名", type: "text", required: true, placeholder: "请输入用户名", minLength: "3" , group: "UI 样式" },
        { name: "password", label: "密码", type: "password", required: true, placeholder: "请输入密码", minLength: "6", showToggle: true , group: "UI 样式" },
        { name: "confirmPassword", label: "确认密码", type: "password", required: true, placeholder: "请再次输入密码", minLength: "0", showToggle: true , group: "UI 样式" },
        { name: "email", label: "邮箱", type: "email", required: false, placeholder: "请输入邮箱", minLength: "0" , group: "UI 样式" },
      ],
      // 按钮颜色可配
      buttonBgColor: "#1976d2",
      buttonTextColor: "#ffffff",
      // 响应字段映射
      tokenField: "token",
      refreshTokenField: "refreshToken",
      expiresInField: "expiresIn",
      userField: "user",
      autoLoginAfterRegister: false,
      syncWithLoginForm: true,
      tokenKey: "auth_token",
      tokenStorage: "localStorage",
      // 注册后行为
      successText: "注册成功",
      redirectUrl: "/login",
      redirectDelay: 1500,
    },
    capabilities: {
      resizable: true,
      rotatable: false,
      draggable: true,
      connectable: false,
      embeddable: false,
    },
    renderer: lazy(() => import("../renderers/RegisterFormRenderer").then(m => ({ default: m.RegisterFormRenderer }))),
    configSchema: [
      // ─── API 配置 ───
      { key: "apiUrl", label: "API 地址", type: "text", placeholder: "https://api.example.com/register", group: "API 配置" },
        { key: "method", label: "请求方法", type: "select", group: "API 配置",        options: [
          { label: "POST", value: "POST" },
          { label: "PUT", value: "PUT" },
        ],
      },
      // ─── 表单配置 ───
      { key: "title", label: "标题", type: "text", group: "表单配置" },
      { key: "buttonText", label: "按钮文字", type: "text", group: "表单配置" },
        { key: "fields", label: "表单字段", type: "list-editor", group: "表单配置",        itemLabelKey: "label",
        addItemLabel: "添加字段",
        itemFields: [
          { key: "name", label: "字段名", type: "text", defaultValue: "", help: "提交到 API 的键名" },
          { key: "label", label: "标签", type: "text", defaultValue: "" },
            { key: "type", label: "类型", type: "select", defaultValue: "text",            options: [
              { label: "文本", value: "text" },
              { label: "密码", value: "password" },
              { label: "邮箱", value: "email" },
              { label: "数字", value: "number" },
            ],
          },
          { key: "required", label: "必填", type: "toggle", defaultValue: false },
          { key: "placeholder", label: "占位提示", type: "text", defaultValue: "" },
          { key: "minLength", label: "最小长度", type: "text", defaultValue: "0", help: "0 表示不限制" },
          { key: "showToggle", label: "密码可见切换", type: "toggle", defaultValue: false, help: "仅密码类型有效" },
        ],
      },
      // ─── UI 样式 ───
      { key: "bgColor", label: "背景色", type: "color", group: "UI 样式" },
      { key: "textColor", label: "文字颜色", type: "color", group: "UI 样式" },
      { key: "borderColor", label: "边框颜色", type: "color", group: "UI 样式" },
      { key: "borderRadius", label: "圆角", type: "slider", min: 0, max: 20, step: 1, group: "UI 样式" },
      { key: "fontSize", label: "字体大小", type: "slider", min: 10, max: 24, step: 1, group: "UI 样式" },
      // ─── 注册后行为 ───
      { key: "successText", label: "成功提示", type: "text", group: "注册后行为" },
      { key: "redirectUrl", label: "跳转地址", type: "text", group: "注册后行为" },
      { key: "autoLoginAfterRegister", label: "注册后自动登录", type: "toggle", group: "注册后行为", help: "开启后从注册响应提取 token 并写入认证状态" },
      { key: "autoLoginMode", label: "自动登录模式", type: "select", group: "注册后行为", options: [{ label: "JWT", value: "jwt" }, { label: "Session", value: "session" }, { label: "OAuth2", value: "oauth2" }, { label: "SSO", value: "sso" }, { label: "API Key", value: "api-key" }], help: "注册后写入 __webcraft_auth_mode 缓存键，AuthGuard 据此识别认证模式", hidden: (c) => !c.autoLoginAfterRegister },
      { key: "tokenField", label: "Token 字段名", type: "text", group: "注册后行为", placeholder: "token", hidden: (c) => !c.autoLoginAfterRegister },
      { key: "refreshTokenField", label: "RefreshToken 字段名", type: "text", group: "注册后行为", placeholder: "refreshToken", hidden: (c) => !c.autoLoginAfterRegister },
      { key: "expiresInField", label: "ExpiresIn 字段名", type: "text", group: "注册后行为", placeholder: "expiresIn", hidden: (c) => !c.autoLoginAfterRegister },
      { key: "userField", label: "User 字段名", type: "text", group: "注册后行为", placeholder: "user", hidden: (c) => !c.autoLoginAfterRegister },
      { key: "syncWithLoginForm", label: "与登录组件同步配置", type: "toggle", defaultValue: true, help: "开启时自动跟随登录表单的 Token 存储方式与键名", group: "注册后行为" },
      { key: "tokenKey", label: "Token 存储键名", type: "text", group: "注册后行为", placeholder: "auth_token", hidden: (c) => !c.autoLoginAfterRegister || c.syncWithLoginForm !== false, help: "必须与登录组件的 Token 键名一致" },
        { key: "tokenStorage", label: "存储方式", type: "select", group: "注册后行为",
        options: [
          { label: "localStorage", value: "localStorage" },
          { label: "sessionStorage", value: "sessionStorage" },
          { label: "内存（刷新页面后清除）", value: "memory" },
        ],
        help: "内存模式仅限单页应用，多页面站点请用 localStorage/sessionStorage",
        hidden: (c) => !c.autoLoginAfterRegister || c.syncWithLoginForm !== false,
      },
      // ─── 高级选项 ───
      { key: "buttonBgColor", label: "按钮背景色", type: "color", group: "高级" },
      { key: "buttonTextColor", label: "按钮文字色", type: "color", group: "高级" },
      { key: "redirectDelay", label: "跳转延迟(ms)", type: "slider", min: 0, max: 5000, step: 100, group: "高级" },
    ],
  });
}
