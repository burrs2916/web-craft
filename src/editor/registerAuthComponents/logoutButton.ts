/**
 * 注册认证组件 · 退出登录按钮。
 * 从 registerAuthComponents.ts 迁出，仅做代码搬迁。
 */
import { componentRegistry, lazy } from "../registryCore";

export function registerAuthLogoutButton(): void {
  // ─── 退出登录按钮 ───
  componentRegistry.register({
    type: "auth-logout-button",
    name: "退出登录",
    icon: "logout",
    description: "清除认证状态并跳转，可选调用后端 logout API",
    category: "ccat_auth",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 120, height: 40 },
    minSize: { width: 80, height: 28 },
    defaultConfig: {
      text: "退出登录",
      redirectUrl: "/login",
      variant: "contained",
      bgColor: "#f44336",
      textColor: "#ffffff",
      fontSize: 14,
      borderRadius: 4,
      confirmBeforeLogout: false,
      confirmText: "确定要退出登录吗？",
      callLogoutApi: false,
      logoutApiUrl: "",
      logoutMethod: "POST",
      // v5 联动：Token 存储配置（必须与 login-form 的 tokenKey/tokenStorage 一致）
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
    renderer: lazy(() => import("../renderers/LogoutButtonRenderer").then(m => ({ default: m.LogoutButtonRenderer }))),
    configSchema: [
      { key: "text", label: "按钮文字", type: "text" , group: "基本配置" },
      { key: "redirectUrl", label: "跳转地址", type: "text" , group: "基本配置" },
        { key: "variant", label: "样式", type: "select", group: "基本配置",        options: [
          { label: "实心", value: "contained" },
          { label: "描边", value: "outlined" },
          { label: "文字", value: "text" },
        ],
      },
      { key: "bgColor", label: "背景色", type: "color" , group: "UI 样式" },
      { key: "textColor", label: "文字色", type: "color" , group: "UI 样式" },
      { key: "fontSize", label: "字体大小", type: "slider", min: 10, max: 24, step: 1 , group: "UI 样式" },
      { key: "borderRadius", label: "圆角", type: "slider", min: 0, max: 20, step: 1 , group: "UI 样式" },
      { key: "confirmBeforeLogout", label: "退出前确认", type: "toggle" , group: "行为" },
      { key: "confirmText", label: "确认提示", type: "text", hidden: (c) => !c.confirmBeforeLogout , group: "行为" },
      { key: "callLogoutApi", label: "调用后端退出 API", type: "toggle" , group: "行为" },
      { key: "logoutApiUrl", label: "退出 API 地址", type: "text", hidden: (c) => !c.callLogoutApi , group: "行为" },
        { key: "logoutMethod", label: "退出 API 方法", type: "select", group: "行为",        options: [
          { label: "POST", value: "POST" },
          { label: "GET", value: "GET" },
          { label: "DELETE", value: "DELETE" },
        ],
        hidden: (c) => !c.callLogoutApi,
      },
      { key: "syncWithLoginForm", label: "与登录组件同步配置", type: "toggle", defaultValue: true, help: "开启时自动跟随登录表单的 Token 存储方式与键名", group: "联动配置" },
      { key: "tokenKey", label: "Token 键名", type: "text", placeholder: "auth_token", help: "必须与登录组件的 Token 键名一致，否则退出时无法清除正确的 token", hidden: (c) => c.syncWithLoginForm !== false, group: "联动配置" },
        { key: "tokenStorage", label: "存储方式", type: "select", group: "联动配置",
        options: [
          { label: "localStorage", value: "localStorage" },
          { label: "sessionStorage", value: "sessionStorage" },
          { label: "内存（刷新页面后清除）", value: "memory" },
        ],
        help: "内存模式仅限单页应用，多页面站点请用 localStorage/sessionStorage",
        hidden: (c) => c.syncWithLoginForm !== false,
      },
    ],
  });
}
