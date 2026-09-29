/**
 * 注册认证组件 · 登录表单。
 * 从 registerAuthComponents.ts 迁出，仅做代码搬迁。
 */
import { componentRegistry, lazy } from "../registryCore";
import { getAllAuthPresets } from "./presets";

export function registerLoginForm(): void {
  // ─── 登录表单 ───
  componentRegistry.register({
    type: "auth-login-form",
    name: "登录表单",
    icon: "login",
    description: "支持 Session / JWT / Basic Auth 三种模式，每个元素可独立配置样式",
    category: "ccat_auth",
    version: "2.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 380, height: 420 },
    minSize: { width: 280, height: 300 },
    defaultConfig: {
      // ── 预设模板（v3） ──
      authPreset: "custom",
      showAdvanced: false,
      savePresetName: "",

      // ── 端点编排（v4 统一管理 login/logout/refresh/userInfo/register） ──
      endpoints: [
        {
          id: "ep_login",
          name: "登录",
          endpointType: "login",
          path: "",
          method: "POST",
        },
        {
          id: "ep_refresh",
          name: "刷新令牌",
          endpointType: "refresh",
          path: "",
          method: "POST",
        },
        {
          id: "ep_logout",
          name: "登出",
          endpointType: "logout",
          path: "",
          method: "POST",
        },
        {
          id: "ep_userinfo",
          name: "获取用户信息",
          endpointType: "userInfo",
          path: "",
          method: "GET",
        },
      ],

      // ── API 配置（向后兼容，从 endpoints 中派生） ──
      authMode: "jwt",
      apiUrl: "",
      method: "POST",
      tokenField: "token",
      refreshTokenField: "refreshToken",
      expiresInField: "expiresIn",
      userField: "user",

      // ── Token 存储配置（配置驱动 v3） ──
      tokenStorage: "localStorage",
      tokenKey: "auth_token",
      tokenHeader: "Authorization",
      tokenPrefix: "Bearer ",

      // ── 响应字段映射（配置驱动 v3） ──
      mappingTemplate: "standard-jwt",
      responseMappings: [
        { sourcePath: "token", targetKey: "auth_token", saveToCache: true },
        { sourcePath: "refreshToken", targetKey: "refreshToken", saveToCache: true },
        { sourcePath: "expiresIn", targetKey: "expiresIn", saveToCache: true, isExpirationTime: true },
        { sourcePath: "user", targetKey: "user", saveToCache: false },
      ],

      // ── 响应成败判断（v6 通用化；留空=不检查业务码，HTTP 200 即成功） ──
      codeField: "",
      successCodes: [0, 200],
      msgField: "msg",
      msgFallback: "请求失败",

      // ── 自定义 Header 配置（多租户等，配置驱动 v3） ──
      headerConfigs: [],

      // ── v5 动态认证参数（配置驱动，替代硬编码表单字段） ──
      useDynamicParams: false,
      authParams: [],

      // ── Token 刷新配置（配置驱动 v3） ──
      refreshEnabled: false,
      refreshThreshold: 30,
      refreshEndpointPath: "",
      refreshEndpointMethod: "POST",

      // ── 容器样式 ──
      containerBgColor: "#ffffff",
      containerBorderColor: "#e0e0e0",
      containerBorderRadius: 12,
      containerPadding: 32,
      containerShadow: "none",
      fieldGap: 16,
      initiallyHidden: false,

      // ── 标题 ──
      showTitle: true,
      titleText: "登录",
      titleFontSize: 22,
      titleColor: "#1a1a2e",
      titleFontWeight: 700,
      titleAlign: "center",
      titleMarginBottom: 4,

      // ── 副标题 ──
      showSubtitle: false,
      subtitleText: "请输入您的账号信息",
      subtitleFontSize: 13,
      subtitleColor: "#999999",
      subtitleAlign: "center",

      // ── 用户名输入框 ──
      usernameLabel: "用户名",
      usernamePlaceholder: "请输入用户名",
      usernameBgColor: "#f5f5f5",
      usernameTextColor: "#333333",
      usernameBorderColor: "#d0d0d8",
      usernameFocusColor: "#1976d2",
      usernameBorderRadius: 8,
      usernameHeight: 42,
      usernameFontSize: 14,
      usernameLabelColor: "#666666",

      // ── 密码输入框 ──
      passwordLabel: "密码",
      passwordPlaceholder: "请输入密码",
      passwordBgColor: "#f5f5f5",
      passwordTextColor: "#333333",
      passwordBorderColor: "#d0d0d8",
      passwordFocusColor: "#1976d2",
      passwordBorderRadius: 8,
      passwordHeight: 42,
      passwordFontSize: 14,
      passwordLabelColor: "#666666",
      passwordShowToggle: true,

      // ── 登录按钮 ──
      buttonText: "登录",
      buttonBgColor: "#1976d2",
      buttonTextColor: "#ffffff",
      buttonFontSize: 15,
      buttonBorderRadius: 8,
      buttonHeight: 44,
      buttonHoverColor: "#1565c0",
      buttonFullWidth: true,

      // ── 记住我 ──
      showRemember: false,
      rememberLabel: "记住我",
      rememberFontSize: 13,
      rememberColor: "#666666",
      rememberAccentColor: "#1976d2",

      // ── 忘记密码 ──
      showForgot: false,
      forgotText: "忘记密码？",
      forgotUrl: "",
      forgotLinkColor: "#1976d2",
      forgotFontSize: 13,

      // ── 错误提示 ──
      errorBgColor: "#fff3f3",
      errorTextColor: "#f44336",
      errorBorderRadius: 8,

      // ═══ 多租户（v5） ═══
      showTenantField: false,
      tenantLabel: "租户ID",
      tenantPlaceholder: "请输入租户ID",
      tenantRequired: false,
      tenantHeaderName: "tenant-id",
      tenantDefaultValue: "",
      // 租户样式复用用户名输入框样式
      tenantBgColor: "#f5f5f5",
      tenantTextColor: "#333333",
      tenantBorderColor: "#d0d0d8",
      tenantFocusColor: "#1976d2",
      tenantBorderRadius: 8,
      tenantHeight: 42,
      tenantFontSize: 14,
      tenantLabelColor: "#666666",

      // ═══ 验证码（v5） ═══
      showCaptcha: false,
      captchaType: "image",
      captchaLabel: "图形验证码",
      captchaPlaceholder: "请输入验证码",
      captchaEndpoint: "",
      captchaWidth: 120,
      captchaHeight: 40,
      captchaBgColor: "#f5f5f5",
      captchaTextColor: "#333333",
      captchaBorderColor: "#d0d0d8",
      captchaBorderRadius: 8,
      captchaFontSize: 14,
      captchaRefreshColor: "#1976d2",

      // ═══ 短信登录（v5） ═══
      loginType: "password",
      smsLabel: "手机号",
      smsPlaceholder: "请输入手机号",
      smsCodeLabel: "验证码",
      smsCodePlaceholder: "请输入验证码",
      smsCodeLength: 6,
      smsButtonText: "获取验证码",
      smsEndpoint: "",
      smsCooldown: 60,
      smsBgColor: "#f5f5f5",
      smsTextColor: "#333333",
      smsBorderColor: "#d0d0d8",
      smsBorderRadius: 8,
      smsHeight: 42,
      smsFontSize: 14,
      smsLabelColor: "#666666",
      smsCodeBgColor: "#f5f5f5",
      smsCodeTextColor: "#333333",
      smsCodeBorderColor: "#d0d0d8",
      smsCodeBorderRadius: 8,
      smsCodeHeight: 42,
      smsCodeFontSize: 14,
      smsCodeLabelColor: "#666666",
      smsButtonBgColor: "#1976d2",
      smsButtonTextColor: "#ffffff",
      smsButtonFontSize: 13,
      smsButtonBorderRadius: 8,
      smsButtonHoverColor: "#1565c0",

      // ═══ 社交登录（v5） ═══
      showSocialLogin: false,
      socialLoginTitle: "其他登录方式",
      socialLoginTitleColor: "#999999",
      socialLoginTitleFontSize: 12,
      socialLoginGap: 12,
      socialLoginBgColor: "#f8f8f8",
      socialLoginBorderRadius: 20,
      socialLoginBorder: "1px solid #e0e0e0",
      socialLoginSize: 40,
      socialLoginLayout: "row",
      socialButtons: [
        { id: "wechat", label: "微信", icon: "wechat", authUrl: "", bgColor: "#07c160", textColor: "#ffffff" },
        { id: "github", label: "GitHub", icon: "github", authUrl: "", bgColor: "#333333", textColor: "#ffffff" },
        { id: "google", label: "Google", icon: "google", authUrl: "", bgColor: "#ffffff", textColor: "#333333" },
      ],
    },
    capabilities: {
      resizable: true,
      rotatable: false,
      draggable: true,
      connectable: false,
      embeddable: false,
    },
    renderer: lazy(() => import("../renderers/LoginFormRenderer").then(m => ({ default: m.LoginFormRenderer }))),
    configSchema: [
      // ═══════════════════════════════════════════════════════════
      // 第一层：基本配置（始终可见，最少必填）
      // ═══════════════════════════════════════════════════════════
        { key: "authPreset", label: "认证预设", type: "select", group: "快速开始",        options: Object.entries(getAllAuthPresets()).map(([value, p]) => ({
          label: p.label,
          value,
        })),
        help: "选择匹配你后端的预设，所有配置自动填充，只需填入 API 地址即可使用。自定义预设可在下方保存",
      },
        { key: "authMode", label: "认证模式", type: "select", group: "快速开始",        options: [
          { label: "JWT", value: "jwt" },
          { label: "OAuth2 (Token)", value: "oauth2" },
          { label: "Session-Cookie", value: "session" },
          { label: "Basic Auth", value: "basic" },
        ],
        help: "JWT 最通用；OAuth2 用于 accessToken/refreshToken 风格；Session 依赖 Cookie；Basic 适合简单 API",
      },
      { key: "apiUrl", label: "登录 API 地址", type: "text", placeholder: "https://api.example.com/login 或 /system/auth/login", help: "登录接口的完整 URL 或相对路径" , group: "快速开始" },
      { key: "method", label: "请求方法", type: "select", options: [{ label: "POST", value: "POST" }, { label: "GET", value: "GET" }], help: "绝大多数登录接口用 POST" , group: "快速开始" },
      { key: "savePresetName", label: "预设名称", type: "text", placeholder: "my-backend", help: "将当前配置保存为自定义预设，下次可直接选择" , group: "快速开始" },
        { key: "_savePresetAction", label: "保存为自定义预设", type: "action", group: "快速开始",        action: "saveAuthPreset",
        buttonLabel: "保存预设",
        help: "将当前所有认证配置保存为自定义预设，保存后可在上方下拉中复用",
      },

      // ═══════════════════════════════════════════════════════════
      // 第二层：高级配置（选「自定义」预设或需微调时可见）
      // ═══════════════════════════════════════════════════════════
      { key: "showAdvanced", label: "展开高级选项", type: "toggle", help: "自定义预设/手动配置端点/映射/Token 存储等" , group: "高级" },

      // ── 端点编排（高级） ──
        { key: "endpoints", label: "API 端点列表", type: "list-editor", group: "端点配置",        itemLabelKey: "name",
        addItemLabel: "添加端点",
        itemFields: [
          { key: "id", label: "ID", type: "text", defaultValue: "" },
          { key: "name", label: "名称", type: "text", defaultValue: "" },
          { key: "path", label: "路径", type: "text", defaultValue: "" },
            { key: "method", label: "方法", type: "select", defaultValue: "POST",            options: [
              { label: "GET", value: "GET" },
              { label: "POST", value: "POST" },
              { label: "PUT", value: "PUT" },
              { label: "PATCH", value: "PATCH" },
              { label: "DELETE", value: "DELETE" },
            ],
          },
            { key: "endpointType", label: "类型", type: "select", defaultValue: "login",            options: [
              { label: "登录", value: "login" },
              { label: "登出", value: "logout" },
              { label: "刷新", value: "refresh" },
              { label: "用户信息", value: "userInfo" },
              { label: "注册", value: "register" },
              { label: "其他", value: "other" },
            ],
          },
            { key: "contentType", label: "请求体类型", type: "select", defaultValue: "",            options: [
              { label: "JSON（默认）", value: "" },
              { label: "表单 (x-www-form-urlencoded)", value: "form" },
              { label: "多部分 (multipart/form-data)", value: "formData" },
            ],
            help: "按端点配置请求体的编码方式。默认 JSON；后端期望表单可直接选“表单”，不必改代码",
          },
        ],
        hidden: (c) => !c.showAdvanced,
      },

      // ── 响应映射（高级） ──
        { key: "mappingTemplate", label: "映射模板", type: "select", group: "响应字段映射",        options: [
          { label: "标准 JWT (token/refreshToken/expiresIn)", value: "standard-jwt" },
          { label: "嵌套 JWT (data.token/data.refreshToken)", value: "nested-jwt" },
          { label: "OIDC (access_token/refresh_token/expires_in)", value: "oidc" },
          { label: "自定义", value: "custom" },
        ],
        help: "选择匹配后端响应结构的模板，自动生成字段映射。不确定选哪个？登录后系统会自动探测字段名",
        hidden: (c) => !c.showAdvanced || (c.authMode as string) === "session" || (c.authMode as string) === "basic",
      },
        { key: "responseMappings", label: "字段映射", type: "list-editor", group: "响应字段映射",        itemLabelKey: "sourcePath",
        addItemLabel: "添加映射",
        itemFields: [
          { key: "sourcePath", label: "响应路径", type: "text", defaultValue: "" },
          { key: "targetKey", label: "缓存键", type: "text", defaultValue: "" },
          { key: "saveToCache", label: "存缓存", type: "toggle", defaultValue: true },
          { key: "isExpirationTime", label: "过期时间", type: "toggle", defaultValue: false },
        ],
        hidden: (c) => !c.showAdvanced || (c.authMode as string) === "session" || (c.authMode as string) === "basic",
      },
      { key: "tokenField", label: "Token 字段路径", type: "text", placeholder: "token / data.token / access_token", help: "从登录响应中提取 token 的路径。留空时自动探测", hidden: (c) => !c.showAdvanced || (c.authMode as string) === "session" || (c.authMode as string) === "basic" , group: "响应字段映射" },
      { key: "refreshTokenField", label: "RefreshToken 字段", type: "text", placeholder: "refreshToken / refresh_token", help: "留空时自动探测", hidden: (c) => !c.showAdvanced || (c.authMode as string) === "session" || (c.authMode as string) === "basic" , group: "响应字段映射" },
      { key: "expiresInField", label: "过期时间字段", type: "text", placeholder: "expiresIn / expires_in / expiresTime", help: "留空时自动探测", hidden: (c) => !c.showAdvanced || (c.authMode as string) === "session" || (c.authMode as string) === "basic" , group: "响应字段映射" },
      { key: "userField", label: "User 字段路径", type: "text", placeholder: "user / data.user / userInfo", help: "留空时自动探测", hidden: (c) => !c.showAdvanced || (c.authMode as string) === "session" || (c.authMode as string) === "basic" , group: "响应字段映射" },

      // ── 响应成败判断（v6，通用化：不绑定任何特定后端的业务码） ──
      { key: "codeField", label: "业务码字段路径", type: "text", placeholder: "code / data.code（留空=不检查）", help: "很多后端业务失败也返回 HTTP 200，错误提示放在业务码+信息字段里。填写业务码所在路径后，命中即可判定成败；留空则 HTTP 200 即成功（兼容返回纯数据的后端）", hidden: (c) => !c.showAdvanced , group: "响应成败判断" },
      { key: "successCodes", label: "成功业务码", type: "text", placeholder: "0,200", help: "逗号分隔的数字，业务码命中即为成功。默认 0,200", hidden: (c) => !c.showAdvanced , group: "响应成败判断" },
      { key: "msgField", label: "错误信息字段路径", type: "text", placeholder: "msg / message / data.msg", help: "业务失败时从哪个字段取错误提示", hidden: (c) => !c.showAdvanced , group: "响应成败判断" },
      { key: "msgFallback", label: "兜底错误文案", type: "text", placeholder: "请求失败", help: "错误信息字段为空时的默认提示", hidden: (c) => !c.showAdvanced , group: "响应成败判断" },

      // ── Token 存储配置（高级） ──
        { key: "tokenStorage", label: "存储方式", type: "select", group: "Token 存储配置",        options: [
          { label: "localStorage（推荐，关闭浏览器后保留）", value: "localStorage" },
          { label: "sessionStorage（关闭标签页后清除）", value: "sessionStorage" },
          { label: "内存（刷新页面后清除）", value: "memory" },
        ],
        hidden: (c) => !c.showAdvanced,
      },
      { key: "tokenKey", label: "Token 键名", type: "text", placeholder: "auth_token", help: "存储到 localStorage/sessionStorage 的键名，一般不需改", hidden: (c) => !c.showAdvanced , group: "Token 存储配置" },
      { key: "tokenHeader", label: "Header 名称", type: "text", placeholder: "Authorization", help: "注入请求头的名称，如 Authorization / X-Auth-Token", hidden: (c) => !c.showAdvanced , group: "Token 存储配置" },
      { key: "tokenPrefix", label: "Token 前缀", type: "text", placeholder: "Bearer ", help: "Token 前缀，如 Bearer / Basic / 空", hidden: (c) => !c.showAdvanced , group: "Token 存储配置" },

      // ── Token 刷新配置（高级） ──
      { key: "refreshEnabled", label: "启用自动刷新", type: "toggle", help: "Token 过期前自动刷新，避免用户重新登录", hidden: (c) => !c.showAdvanced , group: "Token 刷新配置" },
      { key: "refreshThreshold", label: "提前刷新秒数", type: "slider", min: 5, max: 300, step: 5, help: "Token 过期前多少秒触发刷新，建议 30-60 秒", hidden: (c) => !c.showAdvanced || !c.refreshEnabled , group: "Token 刷新配置" },
      { key: "refreshEndpointPath", label: "刷新端点路径", type: "text", placeholder: "/api/refresh-token 或 /system/auth/refresh-token", help: "刷新 Token 的 API 路径，选预设后自动填充", hidden: (c) => !c.showAdvanced || !c.refreshEnabled , group: "Token 刷新配置" },
        { key: "refreshEndpointMethod", label: "刷新请求方法", type: "select", group: "Token 刷新配置",        options: [
          { label: "POST（Token 放 body，传统 JWT）", value: "POST" },
          { label: "GET（Token 放 query 参数）", value: "GET" },
        ],
        help: "POST 把 refreshToken 放在请求体；GET 放在 URL 参数",
        hidden: (c) => !c.showAdvanced || !c.refreshEnabled,
      },

      // ── 自定义 Header 配置（高级，多租户等） ──
        { key: "headerConfigs", label: "自定义 Header 列表", type: "list-editor", group: "自定义请求头（多租户等）",        itemLabelKey: "headerName",
        addItemLabel: "添加 Header",
        itemFields: [
          { key: "headerName", label: "Header 名称", type: "text", defaultValue: "" },
          { key: "valueTemplate", label: "值模板", type: "text", defaultValue: "", },
        ],
        hidden: (c) => !c.showAdvanced,
      },

      // ── 动态表单参数（v5，配置驱动，替代硬编码字段） ──
      { key: "useDynamicParams", label: "启用动态参数模式", type: "toggle", help: "启用后从 authParams 列表动态渲染表单输入框，彻底替代硬编码的用户名/密码/租户等字段。每个参数可配置 key/label/位置(body/query/formData)/必填/是否密码", hidden: (c) => !c.showAdvanced , group: "动态表单参数" },
        { key: "authParams", label: "认证参数列表", type: "list-editor", group: "动态表单参数",        itemLabelKey: "label",
        addItemLabel: "添加参数",
        itemFields: [
          { key: "id", label: "ID", type: "text", defaultValue: "" },
          { key: "key", label: "参数名", type: "text", defaultValue: "" },
          { key: "label", label: "标签", type: "text", defaultValue: "" },
            { key: "location", label: "位置", type: "select", defaultValue: "body",            options: [
              { label: "Body", value: "body" },
              { label: "Query", value: "query" },
              { label: "FormData", value: "formData" },
            ],
          },
          { key: "required", label: "必填", type: "toggle", defaultValue: false },
          { key: "isSecret", label: "密码", type: "toggle", defaultValue: false },
        ],
        hidden: (c) => !c.showAdvanced || !c.useDynamicParams,
      },

      // ── 用户信息展示配置已迁移到 auth-user-profile 组件 ──

      // ═══════════════════════════════════════════════════════════
      // 第三层：UI 样式（始终可见，但默认折叠到开关）
      // ═══════════════════════════════════════════════════════════
      { key: "initiallyHidden", label: "初始隐藏", type: "toggle", help: "启用后表单初始不可见，需由 auth-guard 唤起时才显示" , group: "容器样式" },
      { key: "containerBgColor", label: "背景色", type: "color" , group: "容器样式" },
      { key: "containerBorderColor", label: "边框颜色", type: "color" , group: "容器样式" },
      { key: "containerBorderRadius", label: "圆角", type: "slider", min: 0, max: 30, step: 1 , group: "容器样式" },
      { key: "containerPadding", label: "内边距", type: "slider", min: 0, max: 60, step: 2 , group: "容器样式" },
      { key: "fieldGap", label: "字段间距", type: "slider", min: 4, max: 32, step: 2 , group: "容器样式" },
        { key: "containerShadow", label: "阴影", type: "select", group: "容器样式",        options: [
          { label: "无", value: "none" },
          { label: "小", value: "0 2px 8px rgba(0,0,0,0.08)" },
          { label: "中", value: "0 4px 16px rgba(0,0,0,0.12)" },
          { label: "大", value: "0 8px 32px rgba(0,0,0,0.16)" },
        ],
      },

      // ═══ 标题 ═══
      { key: "showTitle", label: "显示标题", type: "toggle" , group: "标题" },
      { key: "titleText", label: "标题文字", type: "text", hidden: (c) => !c.showTitle , group: "标题" },
      { key: "titleFontSize", label: "字体大小", type: "slider", min: 14, max: 36, step: 1, hidden: (c) => !c.showTitle , group: "标题" },
      { key: "titleColor", label: "文字颜色", type: "color", hidden: (c) => !c.showTitle , group: "标题" },
        { key: "titleFontWeight", label: "字重", type: "select", group: "标题",        options: [{ label: "常规", value: 400 }, { label: "中等", value: 500 }, { label: "粗体", value: 600 }, { label: "特粗", value: 700 }],
        hidden: (c) => !c.showTitle,
      },
        { key: "titleAlign", label: "对齐", type: "select", group: "标题",        options: [{ label: "左", value: "left" }, { label: "中", value: "center" }, { label: "右", value: "right" }],
        hidden: (c) => !c.showTitle,
      },
      { key: "titleMarginBottom", label: "下边距", type: "slider", min: 0, max: 24, step: 1, hidden: (c) => !c.showTitle , group: "标题" },

      // ═══ 副标题 ═══
      { key: "showSubtitle", label: "显示副标题", type: "toggle" , group: "副标题" },
      { key: "subtitleText", label: "副标题文字", type: "text", hidden: (c) => !c.showSubtitle , group: "副标题" },
      { key: "subtitleFontSize", label: "字体大小", type: "slider", min: 10, max: 20, step: 1, hidden: (c) => !c.showSubtitle , group: "副标题" },
      { key: "subtitleColor", label: "文字颜色", type: "color", hidden: (c) => !c.showSubtitle , group: "副标题" },
        { key: "subtitleAlign", label: "对齐", type: "select", group: "副标题",        options: [{ label: "左", value: "left" }, { label: "中", value: "center" }, { label: "右", value: "right" }],
        hidden: (c) => !c.showSubtitle,
      },

      // ═══ 用户名输入框 ═══
      { key: "usernameLabel", label: "标签文字", type: "text" , group: "用户名输入框" },
      { key: "usernamePlaceholder", label: "占位提示", type: "text" , group: "用户名输入框" },
      { key: "usernameBgColor", label: "背景色", type: "color" , group: "用户名输入框" },
      { key: "usernameTextColor", label: "文字颜色", type: "color" , group: "用户名输入框" },
      { key: "usernameBorderColor", label: "边框颜色", type: "color" , group: "用户名输入框" },
      { key: "usernameFocusColor", label: "聚焦边框色", type: "color" , group: "用户名输入框" },
      { key: "usernameBorderRadius", label: "圆角", type: "slider", min: 0, max: 20, step: 1 , group: "用户名输入框" },
      { key: "usernameHeight", label: "高度", type: "slider", min: 32, max: 60, step: 1 , group: "用户名输入框" },
      { key: "usernameFontSize", label: "字体大小", type: "slider", min: 10, max: 20, step: 1 , group: "用户名输入框" },
      { key: "usernameLabelColor", label: "标签颜色", type: "color" , group: "用户名输入框" },

      // ═══ 密码输入框 ═══
      { key: "passwordLabel", label: "标签文字", type: "text" , group: "密码输入框" },
      { key: "passwordPlaceholder", label: "占位提示", type: "text" , group: "密码输入框" },
      { key: "passwordBgColor", label: "背景色", type: "color" , group: "密码输入框" },
      { key: "passwordTextColor", label: "文字颜色", type: "color" , group: "密码输入框" },
      { key: "passwordBorderColor", label: "边框颜色", type: "color" , group: "密码输入框" },
      { key: "passwordFocusColor", label: "聚焦边框色", type: "color" , group: "密码输入框" },
      { key: "passwordBorderRadius", label: "圆角", type: "slider", min: 0, max: 20, step: 1 , group: "密码输入框" },
      { key: "passwordHeight", label: "高度", type: "slider", min: 32, max: 60, step: 1 , group: "密码输入框" },
      { key: "passwordFontSize", label: "字体大小", type: "slider", min: 10, max: 20, step: 1 , group: "密码输入框" },
      { key: "passwordLabelColor", label: "标签颜色", type: "color" , group: "密码输入框" },
      { key: "passwordShowToggle", label: "显示/隐藏密码切换", type: "toggle" , group: "密码输入框" },

      // ═══ 登录按钮 ═══
      { key: "buttonText", label: "按钮文字", type: "text" , group: "登录按钮" },
      { key: "buttonBgColor", label: "背景色", type: "color" , group: "登录按钮" },
      { key: "buttonTextColor", label: "文字颜色", type: "color" , group: "登录按钮" },
      { key: "buttonHoverColor", label: "悬停背景色", type: "color" , group: "登录按钮" },
      { key: "buttonFontSize", label: "字体大小", type: "slider", min: 10, max: 22, step: 1 , group: "登录按钮" },
      { key: "buttonBorderRadius", label: "圆角", type: "slider", min: 0, max: 30, step: 1 , group: "登录按钮" },
      { key: "buttonHeight", label: "高度", type: "slider", min: 32, max: 60, step: 1 , group: "登录按钮" },
      { key: "buttonFullWidth", label: "撑满宽度", type: "toggle" , group: "登录按钮" },

      // ═══ 记住我 ═══
      { key: "showRemember", label: "显示记住我", type: "toggle" , group: "记住我" },
      { key: "rememberLabel", label: "标签文字", type: "text", hidden: (c) => !c.showRemember , group: "记住我" },
      { key: "rememberFontSize", label: "字体大小", type: "slider", min: 10, max: 18, step: 1, hidden: (c) => !c.showRemember , group: "记住我" },
      { key: "rememberColor", label: "文字颜色", type: "color", hidden: (c) => !c.showRemember , group: "记住我" },
      { key: "rememberAccentColor", label: "勾选色", type: "color", hidden: (c) => !c.showRemember , group: "记住我" },

      // ═══ 忘记密码 ═══
      { key: "showForgot", label: "显示忘记密码", type: "toggle" , group: "忘记密码" },
      { key: "forgotText", label: "链接文字", type: "text", hidden: (c) => !c.showForgot , group: "忘记密码" },
      { key: "forgotUrl", label: "链接地址", type: "text", hidden: (c) => !c.showForgot , group: "忘记密码" },
      { key: "forgotLinkColor", label: "链接颜色", type: "color", hidden: (c) => !c.showForgot , group: "忘记密码" },
      { key: "forgotFontSize", label: "字体大小", type: "slider", min: 10, max: 18, step: 1, hidden: (c) => !c.showForgot , group: "忘记密码" },

      // ═══ 错误提示 ═══
      { key: "errorBgColor", label: "背景色", type: "color" , group: "错误提示" },
      { key: "errorTextColor", label: "文字颜色", type: "color" , group: "错误提示" },
      { key: "errorBorderRadius", label: "圆角", type: "slider", min: 0, max: 20, step: 1 , group: "错误提示" },

      // ═══════════════════════════════════════════════════════════
      // v5 功能增强区
      // ═══════════════════════════════════════════════════════════

      // ═══ 多租户输入框 ═══
      { key: "showTenantField", label: "显示租户输入框", type: "toggle", help: "多租户系统使用，租户值通过 Header 注入请求" , group: "多租户" },
      { key: "tenantLabel", label: "标签文字", type: "text", hidden: (c) => !c.showTenantField , group: "多租户" },
      { key: "tenantPlaceholder", label: "占位提示", type: "text", hidden: (c) => !c.showTenantField , group: "多租户" },
      { key: "tenantRequired", label: "必填", type: "toggle", hidden: (c) => !c.showTenantField , group: "多租户" },
      { key: "tenantHeaderName", label: "Header 名称", type: "text", placeholder: "tenant-id", help: "租户值注入的请求头名称", hidden: (c) => !c.showTenantField , group: "多租户" },
      { key: "tenantDefaultValue", label: "默认值", type: "text", help: "预设的租户ID，用户不填时使用此值", hidden: (c) => !c.showTenantField , group: "多租户" },
      { key: "tenantBgColor", label: "背景色", type: "color", hidden: (c) => !c.showTenantField , group: "多租户" },
      { key: "tenantTextColor", label: "文字颜色", type: "color", hidden: (c) => !c.showTenantField , group: "多租户" },
      { key: "tenantBorderColor", label: "边框颜色", type: "color", hidden: (c) => !c.showTenantField , group: "多租户" },
      { key: "tenantFocusColor", label: "聚焦边框色", type: "color", hidden: (c) => !c.showTenantField , group: "多租户" },
      { key: "tenantBorderRadius", label: "圆角", type: "slider", min: 0, max: 20, step: 1, hidden: (c) => !c.showTenantField , group: "多租户" },
      { key: "tenantHeight", label: "高度", type: "slider", min: 32, max: 60, step: 1, hidden: (c) => !c.showTenantField , group: "多租户" },
      { key: "tenantFontSize", label: "字体大小", type: "slider", min: 10, max: 20, step: 1, hidden: (c) => !c.showTenantField , group: "多租户" },
      { key: "tenantLabelColor", label: "标签颜色", type: "color", hidden: (c) => !c.showTenantField , group: "多租户" },

      // ═══ 验证码 ═══
      { key: "showCaptcha", label: "显示验证码", type: "toggle", help: "图形验证码、滑块验证码或点选验证码" , group: "验证码" },
        { key: "captchaType", label: "验证码类型", type: "select", group: "验证码",        options: [
          { label: "图形验证码（输入文字）", value: "image" },
          { label: "滑块验证码（拖动滑块）", value: "slider" },
          { label: "点选验证码（点击文字）", value: "click" },
        ],
        hidden: (c) => !c.showCaptcha,
      },
      { key: "captchaLabel", label: "标签文字", type: "text", hidden: (c) => !c.showCaptcha , group: "验证码" },
      { key: "captchaPlaceholder", label: "占位提示", type: "text", hidden: (c) => !c.showCaptcha || (c.captchaType as string) !== "image" , group: "验证码" },
      { key: "captchaEndpoint", label: "验证码图片 API", type: "text", placeholder: "/api/captcha/image", help: "获取验证码图片的接口地址，返回图片或 base64", hidden: (c) => !c.showCaptcha , group: "验证码" },
      { key: "captchaWidth", label: "图片宽度", type: "slider", min: 60, max: 200, step: 5, hidden: (c) => !c.showCaptcha , group: "验证码" },
      { key: "captchaHeight", label: "图片高度", type: "slider", min: 30, max: 80, step: 2, hidden: (c) => !c.showCaptcha , group: "验证码" },
      { key: "captchaBgColor", label: "输入框背景色", type: "color", hidden: (c) => !c.showCaptcha || (c.captchaType as string) !== "image" , group: "验证码" },
      { key: "captchaTextColor", label: "输入框文字色", type: "color", hidden: (c) => !c.showCaptcha || (c.captchaType as string) !== "image" , group: "验证码" },
      { key: "captchaBorderColor", label: "输入框边框色", type: "color", hidden: (c) => !c.showCaptcha || (c.captchaType as string) !== "image" , group: "验证码" },
      { key: "captchaBorderRadius", label: "圆角", type: "slider", min: 0, max: 20, step: 1, hidden: (c) => !c.showCaptcha , group: "验证码" },
      { key: "captchaFontSize", label: "字体大小", type: "slider", min: 10, max: 20, step: 1, hidden: (c) => !c.showCaptcha || (c.captchaType as string) !== "image" , group: "验证码" },
      { key: "captchaRefreshColor", label: "刷新按钮色", type: "color", hidden: (c) => !c.showCaptcha , group: "验证码" },

      // ═══ 短信登录 ═══
        { key: "loginType", label: "登录方式", type: "select", group: "短信登录",        options: [
          { label: "账号密码", value: "password" },
          { label: "手机验证码", value: "sms" },
          { label: "两者都支持（Tab 切换）", value: "both" },
        ],
        help: "选择「两者都支持」会在表单顶部显示切换 Tab",
      },
      { key: "smsLabel", label: "手机号标签", type: "text", hidden: (c) => (c.loginType as string) === "password" , group: "短信登录" },
      { key: "smsPlaceholder", label: "手机号占位提示", type: "text", hidden: (c) => (c.loginType as string) === "password" , group: "短信登录" },
      { key: "smsCodeLabel", label: "验证码标签", type: "text", hidden: (c) => (c.loginType as string) === "password" , group: "短信登录" },
      { key: "smsCodePlaceholder", label: "验证码占位提示", type: "text", hidden: (c) => (c.loginType as string) === "password" , group: "短信登录" },
      { key: "smsCodeLength", label: "验证码长度", type: "slider", min: 4, max: 8, step: 1, hidden: (c) => (c.loginType as string) === "password" , group: "短信登录" },
      { key: "smsButtonText", label: "发送按钮文字", type: "text", hidden: (c) => (c.loginType as string) === "password" , group: "短信登录" },
      { key: "smsEndpoint", label: "发送验证码 API", type: "text", placeholder: "/api/sms/send", help: "发送短信验证码的接口地址", hidden: (c) => (c.loginType as string) === "password" , group: "短信登录" },
      { key: "smsCooldown", label: "冷却秒数", type: "slider", min: 10, max: 120, step: 5, help: "发送后倒计时秒数", hidden: (c) => (c.loginType as string) === "password" , group: "短信登录" },
      { key: "smsBgColor", label: "手机号背景色", type: "color", hidden: (c) => (c.loginType as string) === "password" , group: "短信登录" },
      { key: "smsTextColor", label: "手机号文字色", type: "color", hidden: (c) => (c.loginType as string) === "password" , group: "短信登录" },
      { key: "smsBorderColor", label: "手机号边框色", type: "color", hidden: (c) => (c.loginType as string) === "password" , group: "短信登录" },
      { key: "smsBorderRadius", label: "手机号圆角", type: "slider", min: 0, max: 20, step: 1, hidden: (c) => (c.loginType as string) === "password" , group: "短信登录" },
      { key: "smsHeight", label: "手机号高度", type: "slider", min: 32, max: 60, step: 1, hidden: (c) => (c.loginType as string) === "password" , group: "短信登录" },
      { key: "smsFontSize", label: "手机号字体", type: "slider", min: 10, max: 20, step: 1, hidden: (c) => (c.loginType as string) === "password" , group: "短信登录" },
      { key: "smsLabelColor", label: "手机号标签色", type: "color", hidden: (c) => (c.loginType as string) === "password" , group: "短信登录" },
      { key: "smsCodeBgColor", label: "验证码背景色", type: "color", hidden: (c) => (c.loginType as string) === "password" , group: "短信登录" },
      { key: "smsCodeTextColor", label: "验证码文字色", type: "color", hidden: (c) => (c.loginType as string) === "password" , group: "短信登录" },
      { key: "smsCodeBorderColor", label: "验证码边框色", type: "color", hidden: (c) => (c.loginType as string) === "password" , group: "短信登录" },
      { key: "smsCodeBorderRadius", label: "验证码圆角", type: "slider", min: 0, max: 20, step: 1, hidden: (c) => (c.loginType as string) === "password" , group: "短信登录" },
      { key: "smsCodeHeight", label: "验证码高度", type: "slider", min: 32, max: 60, step: 1, hidden: (c) => (c.loginType as string) === "password" , group: "短信登录" },
      { key: "smsCodeFontSize", label: "验证码字体", type: "slider", min: 10, max: 20, step: 1, hidden: (c) => (c.loginType as string) === "password" , group: "短信登录" },
      { key: "smsCodeLabelColor", label: "验证码标签色", type: "color", hidden: (c) => (c.loginType as string) === "password" , group: "短信登录" },
      { key: "smsButtonBgColor", label: "发送按钮背景色", type: "color", hidden: (c) => (c.loginType as string) === "password" , group: "短信登录" },
      { key: "smsButtonTextColor", label: "发送按钮文字色", type: "color", hidden: (c) => (c.loginType as string) === "password" , group: "短信登录" },
      { key: "smsButtonFontSize", label: "发送按钮字体", type: "slider", min: 10, max: 18, step: 1, hidden: (c) => (c.loginType as string) === "password" , group: "短信登录" },
      { key: "smsButtonBorderRadius", label: "发送按钮圆角", type: "slider", min: 0, max: 20, step: 1, hidden: (c) => (c.loginType as string) === "password" , group: "短信登录" },
      { key: "smsButtonHoverColor", label: "发送按钮悬停色", type: "color", hidden: (c) => (c.loginType as string) === "password" , group: "短信登录" },

      // ═══ 社交登录 ═══
      { key: "showSocialLogin", label: "显示社交登录", type: "toggle", help: "显示第三方登录按钮（微信/GitHub/Google 等）" , group: "社交登录" },
      { key: "socialLoginTitle", label: "标题文字", type: "text", hidden: (c) => !c.showSocialLogin , group: "社交登录" },
      { key: "socialLoginTitleColor", label: "标题颜色", type: "color", hidden: (c) => !c.showSocialLogin , group: "社交登录" },
      { key: "socialLoginTitleFontSize", label: "标题字体", type: "slider", min: 10, max: 18, step: 1, hidden: (c) => !c.showSocialLogin , group: "社交登录" },
      { key: "socialLoginGap", label: "按钮间距", type: "slider", min: 4, max: 24, step: 2, hidden: (c) => !c.showSocialLogin , group: "社交登录" },
      { key: "socialLoginBgColor", label: "按钮背景色", type: "color", help: "自定义社交按钮的默认背景色（可被单独覆盖）", hidden: (c) => !c.showSocialLogin , group: "社交登录" },
      { key: "socialLoginBorderRadius", label: "按钮圆角", type: "slider", min: 0, max: 30, step: 1, hidden: (c) => !c.showSocialLogin , group: "社交登录" },
      { key: "socialLoginSize", label: "按钮大小", type: "slider", min: 28, max: 56, step: 2, hidden: (c) => !c.showSocialLogin , group: "社交登录" },
        { key: "socialLoginLayout", label: "布局方式", type: "select", group: "社交登录",        options: [{ label: "横排", value: "row" }, { label: "网格", value: "grid" }],
        hidden: (c) => !c.showSocialLogin,
      },
        { key: "socialButtons", label: "社交按钮列表", type: "list-editor", group: "社交登录",        itemLabelKey: "label",
        addItemLabel: "添加按钮",
        itemFields: [
          { key: "id", label: "ID", type: "text", defaultValue: "" },
          { key: "label", label: "标签", type: "text", defaultValue: "" },
            { key: "icon", label: "图标", type: "select", defaultValue: "github",            options: [
              { label: "GitHub", value: "github" },
              { label: "Google", value: "google" },
              { label: "微信", value: "wechat" },
              { label: "QQ", value: "qq" },
              { label: "微博", value: "weibo" },
              { label: "Apple", value: "apple" },
            ],
          },
          { key: "authUrl", label: "OAuth 地址", type: "text", defaultValue: "" },
          { key: "bgColor", label: "背景色", type: "text", defaultValue: "#333333" },
          { key: "textColor", label: "文字色", type: "text", defaultValue: "#ffffff" },
        ],
        hidden: (c) => !c.showSocialLogin,
      },
    ],
  });
}
