import type { ComponentCodegenFn } from "../types";
import { escapeHTML, toJsString } from "../layout";
import { renderMenuIcon } from "../iconPipeline";
import { TAG_PRESETS as PR, TAG_SIZE_MAP, tagScale } from "../../editor/renderers/tagShared";
import { readAuthEnabled } from "../../editor/data/authMode";

/**
 * tag 标签组件 -> HTML
 * 配置：text, colorPreset, variant, size, closable, icon, iconSize,
 *       customBg, customColor, customBorder, borderRadius, fontSize, fontWeight,
 *       dataMode(static|api), apiUrl, apiMethod, apiDataPath, apiInterval(旧 bindInterval 兼容), authEnabled,
 *       judgeMode(exact|threshold), valuePolicies[{value,preset}], thresholds[{threshold,preset}],
 *       useValueAsText, emptyWhen, showWhenEmpty, hideOnError, showLoading, bindTimeout, errorPreset
 *
 * 发布端与编辑器一致：api 模式注入 JS，按接口返回值映射状态色（红灯绿灯式）/文字/显隐。
 * 样式解析逻辑 resolveTagColors 的等价实现注入到运行时。
 */
export const tagCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config;

  const text = String(c.text ?? "标签");
  const colorPreset = String(c.colorPreset ?? "default");
  const variant = String(c.variant ?? "light");
  const size = String(c.size ?? "medium");
  const closable = c.closable === true;
  const icon = String(c.icon ?? "");
  const iconSize = Number(c.iconSize ?? 14);
  const customBg = String(c.customBg ?? "");
  const customColor = String(c.customColor ?? "");
  const customBorder = String(c.customBorder ?? "");
  const borderRadius = Number(c.borderRadius ?? 4);
  const fontSizeOverride = Number(c.fontSize ?? 0);
  const fontWeight = String(c.fontWeight ?? "normal");

  const dataMode = String(c.dataMode ?? "static");
  const isApi = dataMode === "api";
  const apiUrl = String(c.apiUrl ?? "");
  const apiMethod = String(c.apiMethod ?? "GET");
  const apiDataPath = String(c.apiDataPath ?? "");
  // 轮询间隔：canonical 键 apiInterval（与 metric/progress/API 面板一致）；旧键 bindInterval 兼容回退
  const bindInterval = Number(c.apiInterval ?? c.bindInterval ?? 0);
  const authEnabled = readAuthEnabled(c.authEnabled);
  const valuePolicies = (c.valuePolicies as Array<{ value?: unknown; preset?: string }> | undefined) ?? [];
  const judgeMode = String(c.judgeMode ?? "exact");
  const thresholds = (c.thresholds as Array<{ threshold?: unknown; preset?: string }> | undefined) ?? [];
  const useValueAsText = c.useValueAsText === true;
  const emptyWhen = String(c.emptyWhen ?? "emptyValue");
  const showWhenEmpty = c.showWhenEmpty !== false;
  const hideOnError = c.hideOnError === true;
  const showLoading = c.showLoading !== false;
  const bindTimeoutMs = Number(c.bindTimeout ?? 0) * 1000;
  const errorPresetName = String(c.errorPreset ?? "error");

  const d = TAG_SIZE_MAP[size] ?? TAG_SIZE_MAP.medium;
  // 部署端与编辑器一致：以画布槽位高度为基准等比缩放，宽度按内容自适应并居中
  const tf = component.transform as { width?: number; height?: number } | undefined;
  const boxH = typeof tf?.height === "number" ? tf.height : undefined;
  const boxed = typeof boxH === "number" && Number.isFinite(boxH) && boxH > 0;
  const scale = tagScale(boxH);
  const finalFontSize = (fontSizeOverride || d.fs) * scale;
  const gap = 4 * scale;
  const padX = (d.padX * scale).toFixed(2);
  const padY = (d.padY * scale).toFixed(2);
  const radius = (borderRadius * scale).toFixed(2);
  const iconPx = Math.round(iconSize * scale);
  const closeDim = Math.round(16 * scale);
  const closeFs = Math.round(12 * scale);

  // 静态颜色（与 resolveTagColors 一致）
  const preset = PR[colorPreset] ?? PR.default;
  const bg = customBg || preset.bg;
  const color = customColor || preset.color;
  const borderColor = customBorder || preset.border;
  const staticBg = variant === "outlined" ? "transparent" : variant === "filled" ? borderColor : bg;
  const staticBorder = variant === "outlined" ? `1px solid ${borderColor}` : "1px solid transparent";

  const uid = `tag-${Math.random().toString(36).slice(2, 9)}`;

  let inner = "";
  if (icon) {
    inner += `<span style="display:flex;align-items:center;color:inherit">${renderMenuIcon(icon, iconPx, ctx)}</span>`;
  }
  inner += `<span id="${uid}-text" style="font-size:inherit;font-weight:inherit;line-height:1">${escapeHTML(text)}</span>`;
  if (closable) {
    inner += `<span class="${uid}-close" style="display:flex;align-items:center;justify-content:center;width:${closeDim}px;height:${closeDim}px;border-radius:50%;cursor:pointer;margin-left:2px;font-size:${closeFs}px;line-height:1;color:inherit;opacity:0.7">✕</span>`;
  }

  const tagStyle = [
    "display:inline-flex",
    "align-items:center",
    `gap:${gap}px`,
    `padding:${padY}px ${padX}px`,
    `background:${staticBg}`,
    `border:${staticBorder}`,
    `border-radius:${radius}px`,
    `color:${color}`,
    `font-size:${finalFontSize}px`,
    `font-weight:${fontWeight}`,
    "white-space:nowrap",
    "box-sizing:border-box",
    "user-select:none",
  ].join(";");

  // 关闭按钮脚本（独立于数据感知）
  let script = "";
  if (closable) {
    script += `
<script>
(function(){
  var el = document.querySelector('.${uid}');
  var closeBtn = document.querySelector('.${uid}-close');
  if(closeBtn){
    closeBtn.addEventListener("click", function(e){ e.stopPropagation(); if(el) el.style.display="none"; });
    closeBtn.addEventListener("mouseenter", function(){ this.style.background="rgba(255,255,255,0.15)"; });
    closeBtn.addEventListener("mouseleave", function(){ this.style.background="transparent"; });
  }
})();
</script>`;
  }

  // 数据感知状态脚本
  if (isApi && apiUrl) {
    const safeUid = escapeHTML(uid);
    const presetsJs = JSON.stringify(PR);
    const policiesJs = JSON.stringify(valuePolicies.map(p => ({ value: String(p?.value ?? ""), preset: String(p?.preset ?? "default") })));
    const thresholdsJs = JSON.stringify(thresholds
      .filter(t => t?.threshold !== undefined && t.threshold !== null && t.threshold !== "")
      .map(t => ({ threshold: Number(t.threshold), preset: String(t?.preset ?? "default") }))
      .sort((a, b) => b.threshold - a.threshold));
    const customBgJs = toJsString(customBg);
    const customColorJs = toJsString(customColor);
    const customBorderJs = toJsString(customBorder);
    const variantJs = toJsString(variant);
    const judgeModeJs = toJsString(judgeMode === "threshold" ? "threshold" : "exact");

    script += `<script>(function(){
var el=document.getElementById("${safeUid}-text");var tag=el?el.parentElement:null;if(!tag)return;
var PR=${presetsJs};
var CUSTOM_BG=${customBgJs};
var CUSTOM_COLOR=${customColorJs};
var CUSTOM_BORDER=${customBorderJs};
var VARIANT=${variantJs};
var BASE_PRESET=${toJsString(colorPreset)};
var POL=${policiesJs};
var JUDGE_MODE=${judgeModeJs};
var TH=${thresholdsJs};
var USE_TEXT=${useValueAsText ? "true" : "false"};
var IS_EMPTY_RULE=${toJsString(emptyWhen)};
var SHOW_EMPTY=${showWhenEmpty ? "true" : "false"};
var HIDE_ERR=${hideOnError ? "true" : "false"};
var SHOW_LOAD=${showLoading ? "true" : "false"};
var TIMEOUT=${bindTimeoutMs > 0 ? bindTimeoutMs : 0};
var ERR_P=${toJsString(errorPresetName)};
var painted=false;
var GRAY_BG="rgba(255,255,255,0.06)";
var GRAY_BORDE="rgba(255,255,255,0.14)";
var GRAY_BORDER="1px solid rgba(255,255,255,0.14)";
var GRAY_COL="rgba(255,255,255,0.4)";
var METHOD=${toJsString(apiMethod)};
var URL=${toJsString(apiUrl)};
var DATA_PATH=${toJsString(apiDataPath)};
function getNested(o,p){if(!o||!p)return undefined;var pts=p.split("."),cur=o;for(var i=0;i<pts.length;i++){if(cur==null)return undefined;cur=cur[pts[i]];}return cur;}
function isEmpty(v,m){if(m==="emptyArray")return Array.isArray(v)&&v.length===0;if(m==="zero")return Number(v)===0;if(m==="falsy")return !v;if(v===undefined||v===null||v==="")return true;if(Array.isArray(v))return v.length===0;if(typeof v==="object")return Object.keys(v).length===0;return false;}
function bc(name,useC){var p=PR[name]||PR.default;var bg=useC&&CUSTOM_BG?CUSTOM_BG:p.bg;var col=useC&&CUSTOM_COLOR?CUSTOM_COLOR:p.color;var bdr=useC&&CUSTOM_BORDER?CUSTOM_BORDER:p.border;var bgStyle=VARIANT==="outlined"?"transparent":(VARIANT==="filled"?bdr:bg);var borderStr=VARIANT==="outlined"?"1px solid "+bdr:"1px solid transparent";return {bgStyle:bgStyle,border:borderStr,color:col};}
function match(v){for(var i=0;i<POL.length;i++){if(POL[i].value!==undefined&&String(v)===String(POL[i].value))return POL[i].preset;}return undefined;}
function matchTh(v){var n=Number(v);if(!isFinite(n))return undefined;for(var i=0;i<TH.length;i++){if(n>=TH[i].threshold)return TH[i].preset;}return undefined;}
function paint(prName,useC,txt){var c=bc(prName,useC);tag.style.background=c.bgStyle;tag.style.border=c.border;tag.style.color=c.color;if(txt!==undefined){el.textContent=String(txt);}}
function auth(){if(!${authEnabled ? "true" : "false"})return {};var k=window.__WC_TOKEN_KEY||"auth_token";var s=window.__WC_TOKEN_STORAGE||"localStorage";var hdr=window.__WC_TOKEN_HEADER||"Authorization";var px=window.__WC_TOKEN_PREFIX!==undefined?window.__WC_TOKEN_PREFIX:"Bearer ";var v=null;if(s==="localStorage"){try{v=localStorage.getItem(k);}catch(e){}}else if(s==="sessionStorage"){try{v=sessionStorage.getItem(k);}catch(e){}}else{v=(window.__webcraft_memory_cache||{})[k];}var o={};if(v)o[hdr]=px+v;return o;}
var showHide=function(v){tag.style.display=v?"":"none";};
function run(force){var controller=null;if(window.AbortController)controller=new AbortController();if(force!==true&&SHOW_LOAD&&!painted){var gbg=VARIANT==="outlined"?"transparent":(VARIANT==="filled"?GRAY_BORDE:GRAY_BG);var gbd=VARIANT==="outlined"?GRAY_BORDER:"1px solid transparent";tag.style.background=gbg;tag.style.border=gbd;tag.style.color=GRAY_COL;}var headers=auth();if(METHOD!=="GET")headers["Content-Type"]="application/json";var base=window.__WC_API_BASE||"";var url=/^https?:\\/\\//i.test(URL)?URL:base+URL;var opts={method:METHOD,headers:headers,body:METHOD!=="GET"?"{}":undefined};if(controller)opts.signal=controller.signal;var tid=0;if(TIMEOUT>0)tid=setTimeout(function(){if(controller)controller.abort();},TIMEOUT);var p;try{p=fetch(url,opts);}catch(e){p=Promise.reject(e);}p.then(function(r){return r.json().catch(function(){return r.text();});}).then(function(raw){painted=true;var val=getNested(raw,DATA_PATH);if(val===undefined)val=raw;var empty=isEmpty(val,IS_EMPTY_RULE);if(empty){showHide(SHOW_EMPTY);paint(BASE_PRESET,true,undefined);return;}showHide(true);var hit=(JUDGE_MODE==="threshold")?matchTh(val):match(val);if(hit){paint(hit,false,USE_TEXT?val:undefined);}else{paint(BASE_PRESET,USE_TEXT?false:true,USE_TEXT?val:undefined);}}).catch(function(){painted=true;showHide(!HIDE_ERR);if(!HIDE_ERR){paint(ERR_P,true,undefined);}});}
if(!tag.__wcApplied){tag.__wcApplied=true;run();if(${bindInterval > 0 ? bindInterval * 1000 : 0}>0)setInterval(function(){run(true);},${bindInterval > 0 ? bindInterval * 1000 : 0});}
})();</script>`;
  }

  let html = `<span class="${uid}" style="${tagStyle}">${inner}</span>`;
  if (boxed) {
    html = `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;box-sizing:border-box">${html}</div>`;
  }
  return `${html}${script}`;
};