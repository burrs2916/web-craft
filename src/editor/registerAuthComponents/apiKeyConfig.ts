/**
 * 注册认证组件 · API Key 配置。
 * 从 registerAuthComponents.ts 迁出，仅做代码搬迁。
 */
import { componentRegistry, lazy } from "../registryCore";

export function registerAuthApiKeyConfig(): void {
  // ─── API Key 配置 ───
  componentRegistry.register({
    type: "auth-api-key-config",
    name: "API Key 配置",
    icon: "admin_panel_settings",
    description: "API Key 输入组件，支持 header / query 两种注入方式，保存后联动认证体系",
    category: "ccat_auth",
    version: "2.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 300, height: 44 },
    minSize: { width: 200, height: 36 },
    defaultConfig: {
      headerName: "X-API-Key",
      position: "header",
      placeholder: "输入 API Key",
      buttonText: "保存",
      // 认证联动
      syncWithLoginForm: true,
      tokenKey: "auth_token",
      tokenStorage: "localStorage",
      // 登录后行为
      redirectOnSuccess: "",
      redirectDelay: 1500,
      // UI 样式
      bgColor: "#ffffff",
      textColor: "#333333",
      borderColor: "#d0d0d8",
      buttonBgColor: "#1976d2",
      buttonTextColor: "#ffffff",
      variant: "contained",
      fontSize: 14,
      borderRadius: 8,
      fullWidth: true,
      showPasswordToggle: true,
    },
    capabilities: {
      resizable: true,
      rotatable: false,
      draggable: true,
      connectable: false,
      embeddable: false,
    },
    renderer: lazy(() => import("../renderers/ApiKeyConfigRenderer").then(m => ({ default: m.ApiKeyConfigRenderer }))),
    configSchema: [
      // ─── API Key 配置 ───
      { key: "headerName", label: "Header 名称", type: "text", placeholder: "X-API-Key", group: "API Key 配置" },
        { key: "position", label: "注入位置", type: "select", group: "API Key 配置",        options: [
          { label: "Header", value: "header" },
          { label: "Query 参数", value: "query" },
        ],
      },
      { key: "placeholder", label: "输入框占位文字", type: "text", group: "API Key 配置" },
      { key: "buttonText", label: "按钮文字", type: "text", group: "API Key 配置" },
      // ─── 认证联动 ───
      { key: "syncWithLoginForm", label: "与登录组件同步配置", type: "toggle", defaultValue: true, help: "开启时自动跟随登录表单的 Token 存储方式与键名", group: "认证联动" },
      { key: "tokenKey", label: "存储键名", type: "text", placeholder: "auth_token", help: "必须与登录组件的 Token 键名一致", hidden: (c) => c.syncWithLoginForm !== false, group: "认证联动" },
        { key: "tokenStorage", label: "存储方式", type: "select", group: "认证联动",
        options: [
          { label: "localStorage", value: "localStorage" },
          { label: "sessionStorage", value: "sessionStorage" },
          { label: "内存（刷新页面后清除）", value: "memory" },
        ],
        help: "内存模式仅限单页应用，多页面站点请用 localStorage/sessionStorage",
        hidden: (c) => c.syncWithLoginForm !== false,
      },
      // ─── 登录后行为 ───
      { key: "redirectOnSuccess", label: "成功跳转地址", type: "text", placeholder: "/dashboard", help: "留空则不跳转", group: "登录后行为" },
      { key: "redirectDelay", label: "跳转延迟(ms)", type: "slider", min: 0, max: 5000, step: 100, group: "登录后行为" },
      // ─── UI 样式 ───
        { key: "variant", label: "按钮样式", type: "select", group: "UI 样式",        options: [
          { label: "实心", value: "contained" },
          { label: "描边", value: "outlined" },
          { label: "文字", value: "text" },
        ],
      },
      { key: "bgColor", label: "背景色", type: "color", group: "UI 样式" },
      { key: "textColor", label: "文字色", type: "color", group: "UI 样式" },
      { key: "borderColor", label: "边框色", type: "color", group: "UI 样式" },
      { key: "buttonBgColor", label: "按钮背景色", type: "color", group: "UI 样式" },
      { key: "buttonTextColor", label: "按钮文字色", type: "color", group: "UI 样式" },
      { key: "fontSize", label: "字体大小", type: "slider", min: 10, max: 24, step: 1, group: "UI 样式" },
      { key: "borderRadius", label: "圆角", type: "slider", min: 0, max: 20, step: 1, group: "UI 样式" },
      { key: "fullWidth", label: "撑满宽度", type: "toggle", group: "UI 样式" },
      { key: "showPasswordToggle", label: "密码可见切换", type: "toggle", group: "UI 样式" },
    ],
  });
}
