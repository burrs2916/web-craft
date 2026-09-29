/**
 * 注册认证组件 · SSO 按钮。
 * 从 registerAuthComponents.ts 迁出，仅做代码搬迁。
 */
import { componentRegistry, lazy } from "../registryCore";

export function registerAuthSsoButton(): void {
  // ─── SSO 按钮 ───
  componentRegistry.register({
    type: "auth-sso-button",
    name: "SSO 登录",
    icon: "domain",
    description: "SSO 单点登录按钮，支持 CAS / SAML / OIDC 协议，含完整回调处理链",
    category: "ccat_auth",
    version: "2.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 200, height: 40 },
    minSize: { width: 120, height: 28 },
    defaultConfig: {
      text: "SSO 登录",
      ssoUrl: "",
      protocol: "oidc",
      // 回调与 Token 交换
      tokenEndpoint: "",
      userInfoEndpoint: "",
      redirectUri: "",
      // Token 存储与认证体系联动
      syncWithLoginForm: true,
      tokenKey: "auth_token",
      tokenStorage: "localStorage",
      tokenField: "access_token",
      refreshTokenField: "refresh_token",
      expiresInField: "expires_in",
      userField: "user",
      // 登录后行为
      redirectOnSuccess: "",
      redirectDelay: 1500,
      // UI 样式
      variant: "outlined",
      bgColor: "#1976d2",
      textColor: "#ffffff",
      borderColor: "#1976d2",
      fontSize: 14,
      borderRadius: 4,
      fullWidth: true,
    },
    capabilities: {
      resizable: true,
      rotatable: false,
      draggable: true,
      connectable: false,
      embeddable: false,
    },
    renderer: lazy(() => import("../renderers/SSOButtonRenderer").then(m => ({ default: m.SSOButtonRenderer }))),
    configSchema: [
      // ─── SSO 配置 ───
      { key: "text", label: "按钮文字", type: "text", group: "SSO 配置" },
      { key: "ssoUrl", label: "SSO 授权地址", type: "text", placeholder: "https://sso.example.com/authorize", group: "SSO 配置" },
        { key: "protocol", label: "协议", type: "select", group: "SSO 配置",        options: [
          { label: "OIDC", value: "oidc" },
          { label: "CAS", value: "cas" },
          { label: "SAML", value: "saml" },
        ],
      },
      // ─── Token 交换 ───
      { key: "redirectUri", label: "回调地址", type: "text", placeholder: "https://yoursite.com/callback", group: "Token 交换" },
      { key: "tokenEndpoint", label: "Token 端点", type: "text", placeholder: "https://sso.example.com/token", help: "用授权码/token 换 access_token 的 API 地址", group: "Token 交换" },
      { key: "userInfoEndpoint", label: "用户信息端点", type: "text", placeholder: "https://sso.example.com/userinfo", help: "获取用户信息的 API 地址（可选）", group: "Token 交换" },
      { key: "tokenField", label: "响应 Token 字段", type: "text", placeholder: "access_token", help: "Token 端点响应中凭证字段的路径，支持点号嵌套，如 data.access_token", group: "Token 交换" },
      { key: "refreshTokenField", label: "刷新令牌字段", type: "text", placeholder: "refresh_token", help: "Token 端点响应中刷新令牌字段的路径", group: "Token 交换" },
      { key: "expiresInField", label: "过期秒数字段", type: "text", placeholder: "expires_in", help: "Token 端点响应中过期时间（秒）字段的路径", group: "Token 交换" },
      { key: "userField", label: "响应 User 字段", type: "text", placeholder: "user", help: "用户信息响应中用户对象的字段名", group: "Token 交换" },
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
        { key: "variant", label: "样式", type: "select", group: "UI 样式",        options: [
          { label: "实心", value: "contained" },
          { label: "描边", value: "outlined" },
          { label: "文字", value: "text" },
        ],
      },
      { key: "bgColor", label: "背景色", type: "color", group: "UI 样式" },
      { key: "textColor", label: "文字色", type: "color", group: "UI 样式" },
      { key: "borderColor", label: "边框色", type: "color", group: "UI 样式", hidden: (c) => c.variant === "text" },
      { key: "fontSize", label: "字体大小", type: "slider", min: 10, max: 24, step: 1, group: "UI 样式" },
      { key: "borderRadius", label: "圆角", type: "slider", min: 0, max: 20, step: 1, group: "UI 样式" },
      { key: "fullWidth", label: "撑满宽度", type: "toggle", group: "UI 样式" },
    ],
  });
}
