import type { ComponentCodegenFn } from "../../types";
import { readAuthEnabled } from "../../../editor/data/authMode";
import { buildPaneSwitcherScript } from "../../../editor/utils/paneSwitcher";
import { normalizeActivePaneId, parsePanes } from "../../../editor/utils/panes";
import { escapeHTML, toJsString } from "../../layout";
import { applyOpacity } from "./shared";
import type { PaneItem } from "../../../editor/utils/panes";

/**
 * content-panel 内容面板 → HTML
 *
 * 与 sidebar-menu 配套使用：菜单项绑定 pane 链接后，
 * 点击菜单项在同一视图内切换面板内容，不跨页面导航。
 *
 * 配置：panes(JSON: [{id,name,content,bgColor}]), activePaneId,
 *       backgroundEnabled/backgroundColor/backgroundOpacity,
 *       borderEnabled/borderColor/borderWidth/borderStyle,
 *       borderRadius, paddingX/paddingY,
 *       shadowEnabled/shadowOffsetX/shadowOffsetY/shadowBlur/shadowSpread/shadowColor,
 *       overflow, contentBg/contentColor/contentFontSize/contentLineHeight/contentPaddingX/contentPaddingY,
 *       animationEnabled/animationType,
 *       dataMode(static|api)/apiUrl/apiMethod/apiInterval/apiDataPath/authEnabled
 *       （api 模式下面板内容支持 {字段} 插值）
 */
export const contentPanelCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config;

  // —— 解析面板列表（共享解析，与编辑器/渲染器/菜单绑定一致）——
  const panes: PaneItem[] = parsePanes(c.panes);
  const activePaneId = normalizeActivePaneId(panes, c.activePaneId);
  const contentBg = String(c.contentBg ?? "transparent");
  const contentColor = String(c.contentColor ?? "rgba(255,255,255,0.85)");
  const contentFontSize = Number(c.contentFontSize ?? 14);
  const contentLineHeight = Number(c.contentLineHeight ?? 1.6);
  const contentPaddingX = Number(c.contentPaddingX ?? 12);
  const contentPaddingY = Number(c.contentPaddingY ?? 12);
  const animationEnabled = c.animationEnabled !== false;
  const animationType = String(c.animationType ?? "fade");

  // —— 外层样式 ——
  const outerStyles: string[] = [
    "width: 100%",
    "height: 100%",
    "display: flex",
    "flex-direction: column",
    "box-sizing: border-box",
    `overflow: ${c.overflow ?? "hidden"}`,
  ];

  if (c.backgroundEnabled) {
    outerStyles.push(`background: ${applyOpacity(String(c.backgroundColor ?? "rgba(30,30,50,0.6)"), Number(c.backgroundOpacity ?? 100))}`);
  }

  if (c.borderEnabled) {
    outerStyles.push(`border: ${c.borderWidth ?? 1}px ${c.borderStyle ?? "solid"} ${c.borderColor ?? "rgba(255,255,255,0.12)"}`);
  }

  if (c.borderRadius !== undefined) {
    outerStyles.push(`border-radius: ${c.borderRadius}px`);
  }

  if (c.paddingX !== undefined || c.paddingY !== undefined) {
    const py = c.paddingY ?? 16;
    const px = c.paddingX ?? 16;
    outerStyles.push(`padding: ${py}px ${px}px`);
  }

  if (c.shadowEnabled) {
    const sx = c.shadowOffsetX ?? 0;
    const sy = c.shadowOffsetY ?? 4;
    const blur = c.shadowBlur ?? 12;
    const spread = c.shadowSpread ?? 0;
    const color = c.shadowColor ?? "rgba(0,0,0,0.3)";
    outerStyles.push(`box-shadow: ${sx}px ${sy}px ${blur}px ${spread}px ${color}`);
  }

  // —— 面板内容区 ——
  const panesHTML = panes.length === 0
    ? `<div style="flex:1;display:flex;align-items:center;justify-content:center;font-size:12px;color:rgba(255,255,255,0.35);font-style:italic">未配置面板</div>`
    : panes.map((pane) => {
      const isActive = pane.id === activePaneId;
      const paneBg = pane.bgColor || contentBg;
      const paneStyles: string[] = [
        "flex: 1",
        "min-height: 0",
        "box-sizing: border-box",
        `padding: ${contentPaddingY}px ${contentPaddingX}px`,
        `background: ${paneBg}`,
        `color: ${contentColor}`,
        `font-size: ${contentFontSize}px`,
        `line-height: ${contentLineHeight}`,
        `overflow-y: auto`,
        `overflow-x: hidden`,
        isActive ? "display: block" : "display: none",
      ];
      if (animationEnabled && animationType === "fade") {
        paneStyles.push("transition: opacity 0.3s ease");
        if (!isActive) paneStyles.push("opacity: 0");
        else paneStyles.push("opacity: 1");
      }
      return `<div data-pane-id="${escapeHTML(pane.id)}" style="${paneStyles.join("; ")}">${escapeHTML(pane.content)}</div>`;
    }).join("\n");

  // —— 面板切换脚本（注入 pageScripts，每页只注入一次）——
  const hasPaneSwitcher = ctx.pageScripts.some((s) => s.includes("__wcPaneSwitcherInit"));
  if (!hasPaneSwitcher) {
    ctx.pageScripts.push(buildPaneSwitcherScript());
  }

  // —— 锚点滚动脚本（注入 pageScripts，每页只注入一次）——
  const hasAnchor = ctx.pageScripts.some((s) => s.includes("__wcAnchorInit"));
  if (!hasAnchor) {
    ctx.pageScripts.push(`// web-craft anchor smooth scroll
(function(){if(window.__wcAnchorInit)return;window.__wcAnchorInit=true;
document.addEventListener('click',function(e){var link=e.target.closest('[data-anchor]');if(!link)return;e.preventDefault();var id=link.getAttribute('data-anchor');if(!id)return;var el=document.getElementById(id);if(!el)return;el.scrollIntoView({behavior:'smooth',block:'start'})})})();`);
  }

  // —— API 数据绑定脚本（dataMode=api 时拉取数据并插值 {字段} 到面板内容）——
  // URL/headers/body 规则与统一骨架 dataLoaderScript 对齐（apiPath 拼接、全局默认头、请求体按原文发送）
  const dataMode = String(c.dataMode ?? "static");
  const apiUrl = String(c.apiUrl ?? "");
  const apiPathCfg = String(c.apiPath ?? "");
  let dataScriptHTML = "";
  if (dataMode === "api" && (apiUrl !== "" || apiPathCfg !== "") && panes.length > 0) {
    const rawContents = JSON.stringify(Object.fromEntries(panes.map((p) => [p.id, p.content])));
    const method = String(c.apiMethod ?? "GET");
    const intervalSec = Number(c.apiInterval ?? 0);
    const dataPath = String(c.apiDataPath ?? "");
    const apiHeadersRaw = String(c.apiHeaders ?? "");
    const apiBodyRaw = String(c.apiBody ?? "");
    const authEnabled = readAuthEnabled(c.authEnabled);
    dataScriptHTML = `<script>(function(){
var root=document.querySelector('[data-wc-content-panel][data-panel-id="${escapeHTML(component.id)}"]');if(!root||root.__wcPaneDataBound)return;root.__wcPaneDataBound=true;
var RAW=${rawContents};
var METHOD=${toJsString(method)};
var APIURL=${toJsString(apiUrl)};
var APIPATH=${toJsString(apiPathCfg)};
var HEADERS_RAW=${toJsString(apiHeadersRaw)};
var BODY_RAW=${toJsString(apiBodyRaw)};
var PATH=${toJsString(dataPath)};
var AUTH=${authEnabled === null ? "null" : String(authEnabled)};
var INTERVAL=${intervalSec > 0 ? Math.floor(intervalSec) : 0};
function buildUrl(){var base=window.__WC_API_BASE||"";if(APIURL&&/^https?:\\/\\//i.test(APIURL))return APIURL;if(APIURL)return base?base.replace(/\\/+$/,"")+(APIURL.charAt(0)==="/"?"":"/")+APIURL:APIURL;if(APIPATH)return base?base.replace(/\\/+$/,"")+(APIPATH.charAt(0)==="/"?"":"/")+APIPATH:APIPATH;return base;}
function buildHeaders(){var h={};var d=window.__WC_DEFAULT_HEADERS||{};for(var k in d){h[k]=d[k];}if(HEADERS_RAW){try{var x=JSON.parse(HEADERS_RAW);for(var k2 in x){h[k2]=x[k2];}}catch(e){}}var useAuth=AUTH===null?(window.__WC_AUTH_ENABLED||false):AUTH===true;if(useAuth){var key=window.__WC_TOKEN_KEY||"auth_token";var s=window.__WC_TOKEN_STORAGE||"localStorage";var hdr=window.__WC_TOKEN_HEADER||"Authorization";var px=window.__WC_TOKEN_PREFIX!==undefined?window.__WC_TOKEN_PREFIX:"Bearer ";var v=null;if(s==="localStorage"){try{v=localStorage.getItem(key);}catch(e){}}else if(s==="sessionStorage"){try{v=sessionStorage.getItem(key);}catch(e){}}else{v=(window.__webcraft_memory_cache||{})[key];}if(v)h[hdr]=px+v;}return h;}
function getNested(o,p){if(!o||!p)return undefined;var pts=p.split("."),cur=o;for(var i=0;i<pts.length;i++){if(cur==null)return undefined;cur=cur[pts[i]];}return cur;}
function interp(tpl,data){if(!tpl||tpl.indexOf("{")<0)return tpl;return tpl.replace(/\\{\\s*([A-Za-z0-9_.\\-]+)\\s*\\}/g,function(w,k){var v=getNested(data,k);if(v===undefined||v===null)return w;return typeof v==="object"?JSON.stringify(v):String(v);});}
function paint(data){var els=root.querySelectorAll("[data-pane-id]");for(var i=0;i<els.length;i++){var id=els[i].getAttribute("data-pane-id");var tpl=RAW[id];if(tpl===undefined)continue;els[i].textContent=interp(tpl,data);}}
function run(){var headers=buildHeaders();if(METHOD!=="GET"&&BODY_RAW&&headers["Content-Type"]===undefined)headers["Content-Type"]="application/json";var opts={method:METHOD,headers:headers};if(METHOD!=="GET"&&BODY_RAW)opts.body=BODY_RAW;fetch(buildUrl(),opts).then(function(r){return r.json().catch(function(){return r.text();});}).then(function(raw){var data=getNested(raw,PATH);if(data===undefined)data=raw;paint(data);}).catch(function(){});}
run();
if(INTERVAL>0)setInterval(run,INTERVAL*1000);
window.addEventListener("auth-state-change",function(){run();});
})();</script>`;
  }

  return `<div data-wc-content-panel data-panel-id="${escapeHTML(component.id)}" data-active-pane="${escapeHTML(activePaneId)}" style="${outerStyles.join("; ")}">${panesHTML}</div>${dataScriptHTML}`;
};

// ── 弹出框 (content-modal) ─────────────────────────────────────────────
