import { MUI_FONT } from "../../../editor/data/fieldStyle";
import { ensureValidator } from "../../fieldChrome";
import { escapeHTML } from "../../layout";
import type { SceneComponent } from "../../../types/editor";
import type { ComponentCodegenFn } from "../../types";
import { formChildCellHTML, sxRadius } from "./shared";



/**
 * form-container 组件 → HTML（表单容器，对齐编辑区 FormContainerRenderer）
 * 编辑区 Box sx 数字圆角 ×10、虚线边框、gap/字面 padding；按钮行 gap 8px、按钮 49%/100% 宽 ×40 高 ×20px 圆角。
 * 收集容器内所有带 name 的表单控件值，校验必填后提交到配置接口。
 */
export const formContainerCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config;

  const method = String(c.submitMethod ?? "POST").toUpperCase();
  const url = String(c.submitUrl ?? "").trim();
  const afterAction = String(c.afterAction ?? "none");
  const redirectUrl = String(c.redirectUrl ?? "").trim();
  const okMessage = String(c.okMessage ?? "提交成功").trim() || "提交成功";
  const errMessage = String(c.errMessage ?? "提交失败").trim() || "提交失败";
  const loadingHint = c.loadingHint !== false;
  // 认证三级：follow(跟随全局) / enabled(强制认证) / disabled(公开访问)。旧布尔配置兼容。
  const authRaw = c.authToken;
  const authVal = authRaw === true || authRaw === "enabled" ? "enabled"
    : authRaw === false || authRaw === "disabled" ? "disabled"
    : "follow";

  // 注入一次全局提交脚本（复用 __WCVALIDATE 校验运行时，避免逐字段重复规则逻辑）
  if (!ctx.pageScripts.some((s) => s.includes("__WCFORM__"))) {
    ensureValidator(ctx);
    ctx.pageScripts.push(`/*__WCFORM__*/window.WCFORM_SUBMIT=function(el){var o=JSON.parse(el.getAttribute('data-opts'));
var vs=el.querySelectorAll('[data-vrules]');var firstErr=null;
for(var i=0;i<vs.length;i++){var box=vs[i];if(window.__WCVALIDATE&&window.__WCVALIDATE(box)){if(!firstErr)firstErr=box;}}
if(firstErr){if(firstErr.scrollIntoView)firstErr.scrollIntoView({block:'center',behavior:'smooth'});var fe=firstErr.querySelector('input[name],select[name],textarea[name]');if(fe&&fe.focus)fe.focus();return false;}
if(!o.url){alert('表单未配置提交地址，请在编辑器中设置接口 URL');return false;}
var data={};var els=el.querySelectorAll('input[name],select[name],textarea[name]');for(var i=0;i<els.length;i++){var x=els[i];if(x.disabled)continue;if(x.type==='checkbox'){data[x.name]=x.checked;}else if(x.type==='radio'){if(x.checked)data[x.name]=x.value;}else{data[x.name]=x.value;}}
if(o.method==='GET'){var q=Object.keys(data).map(function(k){return encodeURIComponent(k)+'='+encodeURIComponent(data[k]==null?'':data[k]);}).join('&');var u=o.url+(o.url.indexOf('?')>=0?'&':'?')+q;window.open(u,'_self');return false;}
function makeHeaders(){var hdr={'Content-Type':'application/json'};var authMode=o.authMode;if(authMode==='disabled'){return hdr;}
var token=null;var tk=(typeof window.__wc_getToken==='function')?window.__wc_getToken():null;if(tk&&tk.value)token=tk.value;else if(window.__AUTH_TOKEN__)token=window.__AUTH_TOKEN__;
if(token){var h=(typeof window.__WC_TOKEN_HEADER!=='undefined'&&window.__WC_TOKEN_HEADER)?window.__WC_TOKEN_HEADER:'Authorization';var pfx=(typeof window.__WC_TOKEN_PREFIX!=='undefined')?window.__WC_TOKEN_PREFIX:'Bearer ';hdr[h]=pfx+token;}
return hdr;}
if(!o.btn)o.btn=el.querySelector('.fc-submit');if(!o.spin)o.spin=el.querySelector('.fc-spin');
if(o.btn)o.btn.disabled=true;if(o.spin)o.spin.style.display='inline-flex';
fetch(o.url,{method:'POST',headers:makeHeaders(),body:JSON.stringify(data)}).then(function(r){if(!r.ok)throw new Error('bad');return r.status===204?{}:r.json().catch(function(){return{};});}).then(function(resp){
if(o.afterAction==='redirect'&&o.redirectUrl){window.open(o.redirectUrl,'_self');}
else if(o.afterAction==='message'){if(o.okMessage)alert(o.okMessage);}
else if(o.afterAction==='writeVar'&&o.afterWriteVar){if(typeof window.__wc_setSceneVar==='function'){window.__wc_setSceneVar(o.afterWriteVar,resp);}else{window.__wc_sceneVars=(window.__wc_sceneVars||{});window.__wc_sceneVars[o.afterWriteVar]=resp;try{window.dispatchEvent(new CustomEvent('wc:sceneVar',{detail:{name:o.afterWriteVar,value:resp}}));}catch(e){}}}
else if(o.afterAction==='refresh'&&o.afterRefreshIds){var ids=o.afterRefreshIds.split(',');for(var i=0;i<ids.length;i++){var sid=ids[i].trim();if(!sid)continue;if(typeof window['wc_refresh_'+sid]==='function')window['wc_refresh_'+sid]();}}
else if(o.afterAction==='event'&&o.afterEventId){document.dispatchEvent(new CustomEvent('wc-event-'+o.afterEventId));}
}).catch(function(e){if(o.errMessage)alert(o.errMessage);}).finally(function(){if(o.btn)o.btn.disabled=false;if(o.spin)o.spin.style.display='none';});
return false;};`);
  }

  const afterWriteVar = String(c.afterWriteVar ?? "").trim();
  const afterRefreshIds = String(
    Array.isArray(c.afterRefreshSourceIds)
      ? c.afterRefreshSourceIds.join(",")
      : c.afterRefreshSourceIds ?? "",
  ).trim();
  const afterEventId = String(c.afterEventId ?? "").trim();

  const opts = {
    method: method || "POST", url,
    authMode: authVal,
    afterAction, redirectUrl, okMessage, errMessage,
    afterWriteVar, afterRefreshIds, afterEventId,
  };
  const optsJson = JSON.stringify(opts).replace(/</g, "\\u003c").replace(/'/g, "&#39;");

  const showHeader = c.showHeader === true;
  const title = String(c.title ?? "").trim();
  const subtitle = String(c.subtitle ?? "").trim();
  const showReset = c.showReset === true;
  const resetText = String(c.resetText ?? "重置").trim() || "重置";

  // 编辑区：bgEnabled/borderEnabled 默认开；圆角数字 ×10（默认 6→60px）；边框虚线
  // position:relative 是子控件绝对定位的基准（编辑区画布同样以容器设计盒为基准叠加子控件）
  const containerStyles = [
    "position: relative",
    "width: 100%", "height: 100%", "box-sizing: border-box",
    "display: flex", "flex-direction: column",
    `gap: ${Number(c.fieldGap ?? 10)}px`,
    `padding: ${Number(c.paddingY ?? 12)}px ${Number(c.paddingX ?? 16)}px`,
    `border-radius: ${sxRadius(c.borderRadius, 6)}`,
    "overflow: hidden",
  ];
  const borderEnabled = c.borderEnabled !== false;
  if (c.bgEnabled !== false) containerStyles.push(`background: ${String(c.bgColor ?? "rgba(255,255,255,0.04)")}`);
  if (borderEnabled) containerStyles.push(`border: 1px dashed ${String(c.borderColor ?? "#4c5b70")}`);

  // 子组件：优先按 parentId 归类（引擎已建 childrenByParent）；若场景仅以 children 引用
  // 子组件（未设 parentId），则回退按 component.children 从 componentMap 解析，保证不丢字段
  let children = ctx.childrenByParent?.get(component.id) ?? [];
  if (children.length === 0 && component.children?.length) {
    children =
      (component.children
        .map((id) => ctx.componentMap?.get(id))
        .filter((ch): ch is SceneComponent => Boolean(ch && ch.visible !== false)) ?? []);
  }
  children = children.filter((ch) => ch.visible !== false);
  // 编辑区子控件原点为容器外缘；发布端 absolute 原点为 padding box（边框内缩 1px），补偿
  const childrenHTML = children.map((ch) => formChildCellHTML(ch, ctx, borderEnabled ? 1 : 0)).join("\n");

  let html = `<form data-fc="${component.id}" data-opts='${optsJson}' onsubmit="return WCFORM_SUBMIT(this);" style="${containerStyles.join("; ")}">`;

  // 头部（标题 + 副标题，颜色对齐编辑区）
  if (showHeader && (title || subtitle)) {
    html += `<div style="flex-shrink:0;margin-bottom:-4px">`;
    if (title) html += `<div style="font-size:15px;font-weight:600;color:rgba(255,255,255,0.85);font-family:${MUI_FONT};user-select:none">${escapeHTML(title)}</div>`;
    if (subtitle) html += `<div style="font-size:11px;color:rgba(255,255,255,0.5);font-family:${MUI_FONT};margin-top:2.4px;user-select:none">${escapeHTML(subtitle)}</div>`;
    html += `</div>`;
  }

  // 字段区占位：编辑区恒有 flex:1 minHeight:40 的占位区把按钮行压到底部，
  // 真实子控件不进流式布局，改为绝对定位叠加（对齐画布渲染）
  html += `<div style="flex:1;min-height:40px;flex-shrink:1"></div>`;

  // 按钮行（提交 + 重置）：gap 8px；按钮 49%/100% 宽、40 高、20px 圆角（编辑区 borderRadius:2 ×10）
  if (c.showSubmit !== false || showReset) {
    const submitText = String(c.submitText ?? "提交").trim() || "提交";
    const widthMode = String(c.submitWidthMode ?? "full");
    const width = Number(c.submitWidth ?? 180);
    const alignMap: Record<string, string> = { left: "flex-start", center: "center", right: "flex-end" };
    const align = alignMap[String(c.submitAlign ?? "center")] ?? "center";
    const rowWidth = widthMode === "full" ? "width: 100%" : widthMode === "fixed" ? `width: ${Math.max(40, width)}px` : "width: auto";
    const both = showReset && c.showSubmit !== false;
    const btnW = both ? "49%" : "100%";
    const baseBtn = `flex-shrink:0;width:${btnW};height:40px;border-radius:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;font-family:${MUI_FONT};user-select:none`;

    let row = `<div style="display:flex;gap:8px;align-self:${align};${rowWidth};flex-shrink:0">`;
    if (showReset) {
      const variant = String(c.resetVariant ?? "outlined");
      const variantCss = variant === "contained"
        ? "border:none;background:rgba(120,130,150,0.5);color:#cfd6e3"
        : variant === "text"
          ? "border:none;background:transparent;color:#cfd6e3"
          : "border:1px solid rgba(180,180,190,0.4);background:transparent;color:#cfd6e3";
      row += `<button type="reset" style="${baseBtn};${variantCss}">${escapeHTML(resetText)}</button>`;
    }
    if (c.showSubmit !== false) {
      const spin = loadingHint ? `<span class="fc-spin" style="display:none;width:14px;height:14px;border:2px solid rgba(255,255,255,0.6);border-top-color:#fff;border-radius:50%;animation:wcspin .7s linear infinite;flex-shrink:0"></span>` : "";
      row += `<button type="submit" class="fc-submit" style="${baseBtn};gap:4px;border:none;background:${String(c.submitBgColor ?? "#1976d2")};color:${String(c.submitTextColor ?? "#ffffff")}">${spin}${escapeHTML(submitText)}</button>`;
    }
    row += `</div>`;
    html += row;
  }

  // 子控件绝对定位叠加在表单之上（DOM 置后 = 绘制在 chrome 之上，与画布一致）
  html += childrenHTML;

  html += `</form>`;
  return html;
};
