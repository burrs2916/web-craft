/**
 * 注册认证组件 · 路由守卫。
 * 从 registerAuthComponents.ts 迁出，仅做代码搬迁。
 */
import { componentRegistry, lazy } from "../registryCore";

export function registerAuthGuard(): void {
  // ─── 路由守卫 ───
  componentRegistry.register({
    type: "auth-guard",
    name: "路由守卫",
    icon: "shield",
    description: "未登录时显示登录入口，已登录时渲染子内容",
    category: "ccat_auth",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 400, height: 300 },
    minSize: { width: 200, height: 150 },
    defaultConfig: {
      fallbackText: "请先登录后查看内容",
      fallbackButtonText: "去登录",
      loginRedirectUrl: "/login",
      showLoginButton: true,
      hideWhenAuthenticated: true,
      onUnauthenticatedAction: "none",
      loginFormId: "",
      autoRedirect: false,
      autoRedirectUrl: "/login",
      checkTokenExpiry: true,
      syncWithLoginForm: true,
      tokenKey: "auth_token",
      tokenStorage: "localStorage",
      bgColor: "#f5f5f5",
      textColor: "#666666",
      buttonBgColor: "#1976d2",
      buttonTextColor: "#ffffff",
      borderRadius: 8,
      fontSize: 14,
    },
    capabilities: {
      resizable: true,
      rotatable: false,
      draggable: true,
      connectable: false,
      embeddable: true,
    },
    renderer: lazy(() => import("../renderers/AuthGuardRenderer").then(m => ({ default: m.AuthGuardRenderer }))),
    configSchema: [
      { key: "fallbackText", label: "提示文字", type: "text" , group: "未登录内容" },
      { key: "showLoginButton", label: "显示登录按钮", type: "toggle" , group: "未登录内容" },
      { key: "fallbackButtonText", label: "按钮文字", type: "text", hidden: (c) => !c.showLoginButton , group: "未登录内容" },
      { key: "loginRedirectUrl", label: "登录页地址", type: "text", hidden: (c) => !c.showLoginButton , group: "未登录内容" },
        { key: "onUnauthenticatedAction", label: "未认证时动作", type: "select", group: "门禁行为",        options: [
          { label: "仅显示 fallback（默认）", value: "none" },
          { label: "唤起页面上的登录表单", value: "dispatchEvent" },
          { label: "显示内嵌登录弹窗", value: "showLoginDialog" },
        ],
        help: "选择「唤起登录表单」时，未认证会 dispatch CustomEvent 到指定 login-form 组件",
      },
      { key: "loginFormId", label: "登录表单组件", type: "select", placeholder: "选择登录表单组件", help: "目标 login-form 的组件 ID，留空则广播事件", hidden: (c) => (c.onUnauthenticatedAction as string) !== "dispatchEvent" && (c.onUnauthenticatedAction as string) !== "showLoginDialog" , group: "门禁行为" },
      // ── 自动跳转 ──
      { key: "autoRedirect", label: "未认证自动跳转", type: "toggle", help: "启用后，未认证时自动跳转到指定 URL（覆盖 fallback 显示）" , group: "门禁行为" },
      { key: "autoRedirectUrl", label: "跳转地址", type: "text", hidden: (c) => !c.autoRedirect , group: "门禁行为" },
      // ── 认证校验 ──
      { key: "checkTokenExpiry", label: "检查 token 过期", type: "toggle", help: "启用后，JWT 模式下检查 token 过期时间，过期时尝试 refresh" , group: "认证校验" },
      { key: "syncWithLoginForm", label: "与登录组件同步配置", type: "toggle", defaultValue: true, help: "开启时自动跟随登录表单的 Token 存储方式与键名", group: "认证校验" },
      { key: "tokenKey", label: "Token 键名", type: "text", help: "必须与登录组件的 Token 键名一致", hidden: (c) => c.syncWithLoginForm !== false, group: "认证校验" },
        { key: "tokenStorage", label: "存储方式", type: "select", group: "认证校验",
        options: [
          { label: "localStorage", value: "localStorage" },
          { label: "sessionStorage", value: "sessionStorage" },
          { label: "内存（刷新页面后清除）", value: "memory" },
        ],
        help: "内存模式仅限单页应用，多页面站点请用 localStorage/sessionStorage",
        hidden: (c) => c.syncWithLoginForm !== false,
      },
      { key: "bgColor", label: "背景色", type: "color" , group: "UI 样式" },
      { key: "textColor", label: "文字颜色", type: "color" , group: "UI 样式" },
      { key: "buttonBgColor", label: "按钮背景色", type: "color" , group: "UI 样式" },
      { key: "buttonTextColor", label: "按钮文字色", type: "color" , group: "UI 样式" },
      { key: "borderRadius", label: "圆角", type: "slider", min: 0, max: 20, step: 1 , group: "UI 样式" },
      { key: "fontSize", label: "字体大小", type: "slider", min: 10, max: 24, step: 1 , group: "UI 样式" },
      { key: "hideWhenAuthenticated", label: "已认证时隐藏守卫", type: "toggle" , group: "行为" },
    ],
  });
}
