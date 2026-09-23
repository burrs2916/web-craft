/**
 * 全局配置生成模块 — 认证与 API 统一配置源
 *
 * 被两条 codegen 链路共用：
 *   - engine.ts（static-html / 预览）：注入页面 <head>
 *   - scaffold/{react,vue,angular}.ts（发布工程）：注入 index.html <head>
 *
 * 注入的全局变量（window.__WC_*，在所有页面脚本之前执行）：
 *   - __WC_API_BASE       全局 API 基地址
 *   - __WC_AUTH_ENABLED   全局认证开关
 *   - __WC_TOKEN_STORAGE  Token 存储方式（localStorage/sessionStorage/memory）
 *   - __WC_TOKEN_KEY      Token 在 storage 中的键名
 *   - __WC_TOKEN_HEADER   注入 Token 的 header 名
 *   - __WC_TOKEN_PREFIX   Token 前缀（如 "Bearer "）
 *   - __WC_DEFAULT_HEADERS 全局默认请求头
 *   - __WC_TIMEOUT        请求超时（ms）
 *
 * 触发条件（任一满足即注入）：
 *   1. scene.apiConfig 存在（API 集成）
 *   2. 任一认证组件存在（login/register/logout/oauth/sso/guard/user-profile/api-key-config）
 *
 * Token 配置扫描优先级（认证组合联动时保持单一配置源）：
 *   1. auth-login-form 为权威源：登录表单的 token 配置是场景级事实
 *   2. 其余认证组件按显式配置字段补齐（字段级，显式值优先于默认值）
 */

import type { SceneDSL } from "../../types/scene";
import type { SceneComponent } from "../../types/editor";

/** 认证组件类型全集（8 类，与 components/index.ts 注册名一致） */
export const AUTH_COMPONENT_TYPES = [
  "auth-login-form",
  "auth-register-form",
  "auth-logout-button",
  "auth-oauth-button",
  "auth-sso-button",
  "auth-guard",
  "auth-user-profile",
  "auth-api-key-config",
] as const;

export type AuthComponentType = (typeof AUTH_COMPONENT_TYPES)[number];

/** 是否为认证组件类型 */
export function isAuthComponentType(type: string): type is AuthComponentType {
  return (AUTH_COMPONENT_TYPES as readonly string[]).includes(type);
}

/**
 * 生成发布工程级全局配置脚本（scaffold 三框架 index.html 使用）
 *
 * 与 generateGlobalConfigScript 的区别：发布工程的 index.html 是全局入口，
 * 需扫描所有视图的组件（而非单个视图），保证任一视图中的认证组件都能触发注入。
 */
export function generateProjectGlobalConfigScript(scene: SceneDSL): string {
  const allViewComponents = (scene.views ?? []).flatMap((v) => v.components ?? []);
  return generateGlobalConfigScript(scene, allViewComponents);
}

/** 组件类型中的 token 配置默认值（与 auth.ts 内联默认值保持一致） */
export const TOKEN_CONFIG_DEFAULTS = {
  tokenStorage: "localStorage",
  tokenKey: "auth_token",
  tokenHeader: "Authorization",
  tokenPrefix: "Bearer ",
} as const;

/** 认证组件类型的配置字段名（auth.ts codegen 中读取的 token 相关字段） */
type TokenConfigKeys = "tokenStorage" | "tokenKey" | "tokenHeader" | "tokenPrefix";

interface TokenConfig {
  tokenStorage: string;
  tokenKey: string;
  tokenHeader: string;
  tokenPrefix: string;
}

/**
 * 收集场景中全部认证组件（视图内 + 全局）
 */
function collectAuthComponents(
  viewComponents: SceneComponent[],
  scene: SceneDSL,
): SceneComponent[] {
  return [...viewComponents, ...(scene.globalComponents ?? [])].filter(
    (c) => c.visible !== false && isAuthComponentType(c.type),
  );
}

/**
 * 解析 Token 配置
 *
 * 规则：
 *   1. auth-login-form 为权威源：存在则其显式配置优先
 *   2. 其余认证组件按字段补齐：该字段显式配置 > login-form > 默认值
 */
function resolveTokenConfig(authComponents: SceneComponent[]): TokenConfig {
  const loginForm = authComponents.find((c) => c.type === "auth-login-form");
  const others = authComponents.filter((c) => c !== loginForm);

  const hasExplicit = (cfg: Record<string, unknown> | undefined, key: string): boolean =>
    cfg != null && cfg[key] != null && String(cfg[key]) !== "";

  const keys: TokenConfigKeys[] = ["tokenStorage", "tokenKey", "tokenHeader", "tokenPrefix"];

  const resolved: TokenConfig = { ...TOKEN_CONFIG_DEFAULTS };

  for (const key of keys) {
    // 1. login-form 显式配置（权威源）
    if (loginForm && hasExplicit(loginForm.config, key)) {
      resolved[key] = String(loginForm.config![key]);
      continue;
    }
    // 2. 其余认证组件显式配置（字段级补齐）
    const explicit = others.find((c) => hasExplicit(c.config, key));
    if (explicit) {
      resolved[key] = String(explicit.config![key]);
      continue;
    }
    // 3. login-form 非显式值（如编辑端已同步的完整配置）
    if (loginForm) {
      const fallback = loginForm.config?.[key];
      if (fallback != null && String(fallback) !== "") {
        resolved[key] = String(fallback);
        continue;
      }
    }
    // 4. 默认值（resolved 已铺底）
  }

  return resolved;
}

/**
 * 生成全局配置脚本 — 注入到 <head>，在所有页面脚本之前执行
 *
 * @param scene 场景数据
 * @param viewComponents 当前视图的组件列表
 * @returns 注入脚本字符串；无需注入时返回空字符串
 */
export function generateGlobalConfigScript(
  scene: SceneDSL,
  viewComponents: SceneComponent[],
): string {
  const apiConfig = scene.apiConfig;
  const authComponents = collectAuthComponents(viewComponents, scene);

  // 触发条件：配置了 API 集成，或场景中存在任一认证组件
  if (!apiConfig && authComponents.length === 0) return "";

  const tokenConfig = resolveTokenConfig(authComponents);

  // 构建全局配置对象
  const configObj = {
    API_BASE: apiConfig?.baseUrl || "",
    AUTH_ENABLED: apiConfig?.authEnabled ?? false,
    SITE_MODE: apiConfig?.siteMode ?? "auto",
    TOKEN_STORAGE: tokenConfig.tokenStorage,
    TOKEN_KEY: tokenConfig.tokenKey,
    TOKEN_HEADER: tokenConfig.tokenHeader,
    TOKEN_PREFIX: tokenConfig.tokenPrefix,
    DEFAULT_HEADERS: apiConfig?.defaultHeaders ?? {},
    TIMEOUT: apiConfig?.timeout ?? 10000,
    LOADING: {
      enabled: apiConfig?.loadingFeedback?.enabled ?? true,
      color: apiConfig?.loadingFeedback?.color || "#0D9488",
      size: apiConfig?.loadingFeedback?.size ?? 36,
      speed: apiConfig?.loadingFeedback?.speed ?? 1,
      strokeWidth: apiConfig?.loadingFeedback?.strokeWidth ?? 4,
      masked: apiConfig?.loadingFeedback?.masked ?? true,
      delay: 250,
    },
  };

  // 生成注入脚本
  const lines = [
    `window.__WC_API_BASE = ${JSON.stringify(configObj.API_BASE)};`,
    `window.__WC_AUTH_ENABLED = ${JSON.stringify(configObj.AUTH_ENABLED)};`,
    `window.__WC_SITE_MODE = ${JSON.stringify(configObj.SITE_MODE)};`,
    `window.__WC_TOKEN_STORAGE = ${JSON.stringify(configObj.TOKEN_STORAGE)};`,

    `window.__WC_TOKEN_KEY = ${JSON.stringify(configObj.TOKEN_KEY)};`,
    `window.__WC_TOKEN_HEADER = ${JSON.stringify(configObj.TOKEN_HEADER)};`,
    `window.__WC_TOKEN_PREFIX = ${JSON.stringify(configObj.TOKEN_PREFIX)};`,
    `window.__WC_DEFAULT_HEADERS = ${JSON.stringify(configObj.DEFAULT_HEADERS)};`,
    `window.__WC_TIMEOUT = ${configObj.TIMEOUT};`,
    `window.__WC_LOADING = ${JSON.stringify(configObj.LOADING)};`,
  ];

  return `<script>\n  ${lines.join("\n  ")}\n  </script>${
    injectGlobalLoadingOverlay(apiConfig?.loadingFeedback)
  }`;
}

/**
 * 注入"全局自动加载覆盖层"启动脚本
 *
 * 完全无需在画布摆放组件：只要启用加载反馈，发布页任意进行中的 fetch/XHR
 * 请求（含各数据组件、认证、表格等）都会自动显示全屏居中覆盖层，全部请求
 * 完成即自动隐藏。通过 window.__WC_LOADING 读取样式配置。
 */
function injectGlobalLoadingOverlay(feedback?: {
  enabled: boolean;
  color?: string;
  size?: number;
  speed?: number;
  strokeWidth?: number;
}): string {
  const enabled = feedback?.enabled ?? true;
  if (!enabled) return "";
  const color = feedback?.color || "#0D9488";
  const size = feedback?.size ?? 36;
  const speed = feedback?.speed ?? 1;
  const stroke = feedback?.strokeWidth ?? 4;

  return `<!-- 全局自动加载反馈：请求进行中显示、完成隐藏（无需摆放组件） -->
<script>(function(){
var cfg=window.__WC_LOADING||{};
var color=cfg.color||${JSON.stringify(color)},size=cfg.size||${size},speed=cfg.speed||${speed},stroke=cfg.strokeWidth||${stroke},masked=cfg.masked!==false;
var ov=document.createElement("div");
ov.style.cssText="position:fixed;inset:0;z-index:99999;display:none;align-items:center;justify-content:center;background:"+(masked?"rgba(0,0,0,0.35)":"transparent")+";transition:opacity .2s";
var ring=function(){
var S=size,w=stroke,r=(S-w)/2,C=2*Math.PI*r,d=C*0.26,ns="http://www.w3.org/2000/svg";
var svg=document.createElementNS(ns,"svg");
svg.setAttribute("width",S);svg.setAttribute("height",S);svg.setAttribute("viewBox","0 0 "+S+" "+S);
svg.style.cssText="animation:wc-loading-rot "+speed+"s linear infinite;filter:drop-shadow(0 2px 8px rgba(0,0,0,0.22));display:block";
var defs=document.createElementNS(ns,"defs");
var lg=document.createElementNS(ns,"linearGradient");lg.setAttribute("id","wc-lg-grad");lg.setAttribute("x1","0");lg.setAttribute("y1","0");lg.setAttribute("x2","1");lg.setAttribute("y2","1");
var g1=document.createElementNS(ns,"stop");g1.setAttribute("offset","0%");g1.setAttribute("stop-color",color);
var g2=document.createElementNS(ns,"stop");g2.setAttribute("offset","100%");g2.setAttribute("stop-color","#0EA5E9");
lg.appendChild(g1);lg.appendChild(g2);defs.appendChild(lg);
var track=document.createElementNS(ns,"circle");track.setAttribute("cx",S/2);track.setAttribute("cy",S/2);track.setAttribute("r",r);track.setAttribute("fill","none");track.setAttribute("stroke","rgba(255,255,255,0.14)");track.setAttribute("stroke-width",w);
var prog=document.createElementNS(ns,"circle");prog.setAttribute("cx",S/2);prog.setAttribute("cy",S/2);prog.setAttribute("r",r);prog.setAttribute("fill","none");prog.setAttribute("stroke","url(#wc-lg-grad)");prog.setAttribute("stroke-width",w);prog.setAttribute("stroke-linecap","round");prog.setAttribute("stroke-dasharray",d+" "+(C-d));
svg.appendChild(defs);svg.appendChild(track);svg.appendChild(prog);
return svg;
}();
ov.appendChild(ring);
var sc=document.createElement("style");
sc.textContent="@keyframes wc-loading-rot{to{transform:rotate(360deg)}}";
document.head.appendChild(sc);
function mount(){if(!ov.isConnected)(document.body||document.documentElement).appendChild(ov);}
if(document.body){mount();}else{window.addEventListener("DOMContentLoaded",mount);}
var pend=0,on=false,sh=null,delay=(cfg.delay||250);
function update(){var n=pend>0;if(n===on||!ov.isConnected)return;on=n;if(n){show();}else{if(sh){clearTimeout(sh);sh=null;}ov.style.display="none";}}
function show(){sh=setTimeout(function(){sh=null;if(pend>0&&ov.isConnected)ov.style.display="flex";},delay);}
var of=window.fetch;
if(of){window.fetch=function(){pend++;update();var p=of.apply(this,arguments);var done=function(){pend=Math.max(0,pend-1);update();};p.then(done,done);return p;};}
var O=window.XMLHttpRequest;
if(O){var so=O.prototype.send;O.prototype.send=function(){pend++;update();var _d=true;this.addEventListener("loadend",function(){if(_d){_d=false;pend=Math.max(0,pend-1);update();}});return so.apply(this,arguments);};}
})();
</script>`;
}