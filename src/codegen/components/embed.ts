import type { ComponentCodegenFn, CodegenContext } from "../types";
import { escapeHTML } from "../layout";
import { dataLoaderScript } from "../dataLoader";
import { resolveEffectiveDataConfig } from "../../shared/resolveDataConfig";
import { resolveMediaStyle } from "../../editor/data/mediaStyle";
import { readAuthEnabled } from "../../editor/data/authMode";

/**
 * 外部嵌入组件组（iframe 网页嵌入）→ HTML。
 *
 * 复用 `resolveMediaStyle`（与媒体组同口径）与同一套运行时骨架：
 * 容器（圆角/边框/阴影/底色/裁剪）+ 内容层（iframe 铺满）+ 空态占位 + 题注。
 *
 * 从 media 组拆出的理由：iframe 承载的是网页/第三方内容容器，而非供直接消费
 * 的原生多媒体（图片/视频/音频），职责边界不同。
 */

/** 容器公共样式：裁剪 + 圆角 + 边框 + 阴影 + 底色 + 透明度 */
function mediaWrapCss(o: {
  radiusCss: string;
  bgColor: string;
  borderCss: string;
  boxShadow: string;
  opacity: number;
  extra?: string;
}): string {
  return [
    "position:relative",
    "width:100%",
    "height:100%",
    "box-sizing:border-box",
    "overflow:hidden",
    `border-radius:${o.radiusCss}`,
    `background:${o.bgColor}`,
    o.borderCss ? `border:${o.borderCss}` : "",
    o.boxShadow ? `box-shadow:${o.boxShadow}` : "",
    `opacity:${o.opacity}`,
    o.extra ?? "",
  ]
    .filter(Boolean)
    .join(";");
}

/** 悬浮放大规则：挂在容器 hover 上、缩放内容层（状态属性一律走类规则，不写 inline） */
function hoverZoomCss(uid: string, scale: number, transition: string): string {
  if (scale <= 1) return "";
  return (
    `.${uid}:hover .${uid}-img{transform:scale(${scale})}` +
    `.${uid} .${uid}-img{transition:${transition}}`
  );
}

/**
 * iframe（网页嵌入）→ HTML
 *
 * 与图片/视频/音频复用 resolveMediaStyle 口径、统一取数骨架、空态/题注/悬浮放大。
 *
 * iframe 特有约束：
 * 1. sandbox / allow 只在配置了才输出（空 sandbox 属性 = 全限制沙箱，误带会锁死嵌入页）；
 * 2. referrerpolicy 默认值 "no-referrer-when-downgrade" 不赘写；
 * 3. 空态只在「无地址」时显示 —— 跨域嵌入加载失败没有可靠事件，不做失败探测。
 */
export const iframeCodegen: ComponentCodegenFn = (component, ctx: CodegenContext) => {
  const c = component.config as Record<string, unknown>;
  const s = resolveMediaStyle(c, { bgColor: "transparent", emptyText: "未设置嵌入地址" });
  const uid = "ifr-" + Math.random().toString(36).slice(2, 9);

  // ── 数据源：绑定全局源时以全局源覆盖组件自带取数配置（与编辑端同一函数） ──
  const dsId = String(c.dataSourceId ?? "");
  const gds = ctx.globalDataSources as Record<string, unknown> | undefined;
  const boundSource = dsId && gds ? (gds[dsId] as Record<string, unknown>) : undefined;
  const eff: Record<string, unknown> = boundSource
    ? (resolveEffectiveDataConfig(c, boundSource) as Record<string, unknown>)
    : c;
  const isApi = String(eff.dataMode ?? "static") === "api" && Boolean(eff.apiUrl || eff.apiPath);
  const authEnabled = readAuthEnabled(eff.authEnabled);

  const src = String(c.src ?? "").trim();
  const title = String(c.title ?? "").trim() || "嵌入式内容";
  const ariaLabel = String(c.ariaLabel ?? "").trim() || title;

  const iframeAttrs: string[] = [];
  if (c.allowFullscreen === true) iframeAttrs.push("allowfullscreen");
  const loading = String(c.loading ?? "lazy");
  if (loading) iframeAttrs.push(`loading="${escapeHTML(loading)}"`);
  const rp = String(c.referrerPolicy ?? "");
  if (rp && rp !== "no-referrer-when-downgrade") iframeAttrs.push(`referrerpolicy="${escapeHTML(rp)}"`);
  const sandbox = String(c.sandbox ?? "").trim();
  if (sandbox) iframeAttrs.push(`sandbox="${escapeHTML(sandbox)}"`);
  const allow = String(c.allow ?? "").trim();
  if (allow) iframeAttrs.push(`allow="${escapeHTML(allow)}"`);

  const autoHeight = c.autoHeight === true;
  const responsiveScale = c.responsiveScale === true;

  const wrapCss = mediaWrapCss({
    radiusCss: s.radiusCss,
    bgColor: s.bgColor,
    borderCss: s.borderCss,
    boxShadow: s.boxShadow,
    opacity: s.opacity,
    // 自适应高度时嵌入内容会超出画布固定高度，需显示溢出（默认仍是裁切）
    extra: autoHeight ? "overflow:visible" : "",
  });

  const iframeStyle = autoHeight
    ? `width:100%;height:auto;min-height:100%;display:block;border:none`
    : `width:100%;height:100%;display:block;border:none`;

  const showIframe = !!src || isApi;

  // P3-2 响应式缩放：容器级 transform:scale() 按画布实际宽度自适应缩放嵌入内容
  // 打印态自动关闭以保正文清晰
  const scaleScript = responsiveScale && showIframe
    ? `<script>(function(){var el=document.querySelector('.${uid}');if(!el)return;function sc(){var cw=el.clientWidth;var r=cw>0?Math.min(1,cw/1280):1;el.style.transformOrigin='0 0';el.style.transform='scale('+r+')';}var R=window.ResizeObserver;if(R){var ro=new R(sc);ro.observe(el);}sc();window.addEventListener('beforeprint',function(){el.style.transform='';});window.addEventListener('afterprint',function(){sc();});})();</script>`
    : "";
  const hasStaticSrc = !!src && !isApi;
  const emptyText = hasStaticSrc ? "加载中…" : s.emptyText;
  let inner = "";
  if (showIframe) {
    const srcAttr = isApi ? "" : ` src="${escapeHTML(src)}"`;
    const onloadAttr = hasStaticSrc ? ` onload="document.getElementById('${uid}e').style.display='none'"` : "";
    inner +=
      `<iframe class="${uid}-img" id="${uid}f"${srcAttr}${onloadAttr} title="${escapeHTML(title)}" aria-label="${escapeHTML(ariaLabel)}" role="region"` +
      (iframeAttrs.length ? ` ${iframeAttrs.join(" ")}` : "") +
      ` style="${iframeStyle}"></iframe>`;
  }
  inner +=
    `<div class="${uid}-empty" id="${uid}e" role="status" aria-live="polite" aria-label="${escapeHTML(emptyText)}" style="position:absolute;inset:0;display:flex;` +
    `align-items:center;justify-content:center;background:${s.emptyBg};color:${s.emptyColor};` +
    `border:2px dashed rgba(0,0,0,0.12);border-radius:${s.radiusCss};` +
    `background-image:repeating-linear-gradient(45deg,transparent,transparent 8px,rgba(0,0,0,0.02) 8px,rgba(0,0,0,0.02) 16px);` +
    `font-size:12px;user-select:none">${escapeHTML(emptyText)}</div>`;
  if (s.caption) {
    inner +=
      `<div class="${uid}-cap" style="position:absolute;left:0;right:0;bottom:0;padding:6px 10px;` +
      `font-size:${s.captionFontSize}px;line-height:1.4;color:${s.captionColor};background:${s.captionBg};` +
      `pointer-events:none;user-select:none">${escapeHTML(s.caption)}</div>`;
  }

  const extraCss = hoverZoomCss(uid, s.hoverScale, s.transitionCss);

  const link = String(c.link ?? "").trim();
  const linkTarget = String(c.linkTarget ?? "_self") === "_blank" ? "_blank" : "_self";

  // 接口模式：数据到达后写入 iframe src；空值回落空态
  const apiScript = isApi
    ? dataLoaderScript({
        container: `var fr=document.getElementById('${uid}f');`,
        apiUrl: String(eff.apiUrl ?? ""),
        apiPath: String(eff.apiPath ?? ""),
        apiMethod: String(eff.apiMethod ?? "GET"),
        apiHeaders: typeof eff.apiHeaders === "string" ? eff.apiHeaders : JSON.stringify(eff.apiHeaders ?? {}),
        apiBody: typeof eff.apiBody === "string" ? eff.apiBody : JSON.stringify(eff.apiBody ?? {}),
        apiInterval: Number(eff.apiInterval ?? 0) || 0,
        apiDataPath: String(eff.apiDataPath ?? ""),
        authEnabled,
        renderBody: [
          `var f=${JSON.stringify(String(eff.apiSrcField ?? c.apiSrcField ?? ""))};`,
          `var src='';`,
          `if(typeof data==='string'){src=data;}`,
          `else if(data&&typeof data==='object'){`,
          `  var keys=f?[f]:['url','src','iframe','embed','path'];`,
          `  for(var i=0;i<keys.length;i++){var v=keys[i].split('.').reduce(function(a,k){return a==null?undefined:a[k];},data);if(v){src=String(v);break;}}`,
          `}`,
          `var fr=document.getElementById('${uid}f'),em=document.getElementById('${uid}e');`,
          `if(src&&fr){fr.src=src;if(em)em.style.display='none';}else{if(em)em.style.display='flex';}`,
        ].join("\n"),
      })
    : "";

  const body = link
    ? `<a href="${escapeHTML(link)}" target="${linkTarget}"${linkTarget === "_blank" ? ' rel="noopener noreferrer"' : ""} style="display:block;width:100%;height:100%;text-decoration:none">${inner}</a>`
    : inner;

  // 自适应高度运行时：同源 iframe 用 ResizeObserver 跟随内容文档高度；
  // 跨域读取会抛异常，退回监听嵌入页 postMessage({ type:"auto-height", height }) 回传。
  const autoHeightScript =
    autoHeight && showIframe
      ? `<script>(function(){var fr=document.getElementById('${uid}f');if(!fr)return;` +
        `function setH(h){h=Math.max(0,Number(h)||0);if(h>0&&fr.style.height!==h+'px')fr.style.height=h+'px';}var DOC=null;` +
        `try{DOC=fr.contentDocument;}catch(e){DOC=null;}if(DOC){var R=window.ResizeObserver;` +
        `function measure(){var h=Math.max(DOC&&DOC.documentElement?DOC.documentElement.scrollHeight:0,DOC&&DOC.body?DOC.body.scrollHeight:0);setH(h);}` +
        `if(R&&DOC.documentElement){var ro=new R(measure);ro.observe(DOC.documentElement);if(DOC.body)ro.observe(DOC.body);}measure();` +
        `}else if(fr.contentWindow&&window.addEventListener){window.addEventListener('message',function(ev){` +
        `if(ev.source!==fr.contentWindow)return;var d=ev.data;if(!d)return;var h=typeof d==='number'?d:(d&&d.type==='auto-height'?d.height:(d&&typeof d.height!=='undefined'?d.height:0));setH(h);});` +
        `}})();</script>`
      : "";

  // 加载超时探测：loadTimeoutSec > 0 且静态地址时启用（0 = 关闭，保持'一直加载中'）。
  // 跨域 iframe 没有可用的失败事件，定时器是唯一可靠兜底；超时后把加载层文案
  // 换成'加载超时'提示，若随后 onload 到达会被既有 onload 脚本隐藏。
  const loadTimeoutSec = Number(c.loadTimeoutSec ?? 0);
  const timeoutScript =
    hasStaticSrc && loadTimeoutSec > 0
      ? `<script>(function(){var em=document.getElementById('${uid}e');if(!em)return;` +
        `setTimeout(function(){var t=document.createTextNode('加载超时，请检查嵌入地址');` +
        `em.textContent='';em.appendChild(t);em.style.color='#c62828';},${Math.round(loadTimeoutSec * 1000)});` +
        `})();</script>`
      : "";

  // ── P3-1 打印兼容：打印时 iframe 被浏览器截断/空白，换为静态链接提示 ──
  const printStyle = hasStaticSrc
    ? `<style>@media print { .${uid} { display: none !important; } .${uid}-print { display: flex !important; } }</style>`
    : "";
  const printFallback = hasStaticSrc
    ? `<div class="${uid}-print" style="display:none;flex-direction:column;align-items:center;justify-content:center;padding:20px;text-align:center;background:#f5f5f5;border:1px solid #ddd;border-radius:${s.radiusCss};font-size:12px;">` +
      `<div style="margin-bottom:8px;font-weight:500;color:#333;">该嵌入内容在打印预览中不可用</div>` +
      `<a href="${escapeHTML(src)}" style="color:#1976d2;word-break:break-all;text-decoration:none;">${escapeHTML(src)}</a>` +
      `</div>`
    : "";

  return (
    `<div class="${uid}" style="${wrapCss}">${body}</div>` +
    printFallback +
    (extraCss ? `<style>${extraCss}</style>` : "") +
    printStyle +
    scaleScript +
    autoHeightScript +
    timeoutScript +
    apiScript
  );
};
