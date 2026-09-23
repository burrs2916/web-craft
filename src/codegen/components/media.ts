import type { ComponentCodegenFn, CodegenContext } from "../types";
import { escapeHTML } from "../layout";
import { dataLoaderScript } from "../dataLoader";
import { resolveEffectiveDataConfig } from "../../shared/resolveDataConfig";
import { resolveMediaStyle } from "../../editor/data/mediaStyle";
import { readAuthEnabled } from "../../editor/data/authMode";

/**
 * 媒体组件组（图片 / 视频 / 音频）→ HTML。
 *
 * 三者共用 `resolveMediaStyle`（编辑区渲染器同源）与同一套运行时骨架：
 * 容器（圆角/边框/阴影/底色/裁剪）+ 内容层（object-fit / 悬浮放大）+ 空态占位 + 题注。
 *
 * 图片额外支持**动态资源**：`dataMode=api` 时由统一取数骨架（dataLoaderScript）拉取，
 * 按 `apiSrcField` 从响应里取 URL 再写入 `<img src>`；`authEnabled` 即「认证 / 非认证」
 * 两种接入方式的切换点（认证站点注入 Token，公开图床走非认证）。
 * 这与表格 / 列表 / 下拉选择 / 级联选择完全同源，不新增第二套取数实现。
 */

/** 媒体容器公共样式：裁剪 + 圆角 + 边框 + 阴影 + 底色 + 透明度 */
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
 * image（图片）→ HTML
 *
 * 相对旧实现的修复与扩展：
 * 1. **圆角口径错位**：旧实现把面板值当 px 输出，编辑区却是「面板值 × 主题 shape.borderRadius」
 *    → 两端相差 10 倍。现两端只读 `resolveMediaStyle().radiusCss`。
 * 2. **无 alt**（旧实现写死组件名，读屏软件读到的是内部名字）/ **无可访问的链接包装** / **无懒加载**。
 * 3. **无空态与加载失败兜底**：资源缺失或 404 时页面是一片破图。
 * 4. **无样式能力**：边框、阴影、底色、透明度、object-position、悬浮放大全缺。
 * 5. **不支持动态资源**：现支持接口取图（含认证 Token 注入），并与全局数据源绑定打通。
 */
export const imageCodegen: ComponentCodegenFn = (component, ctx: CodegenContext) => {
  const c = component.config as Record<string, unknown>;
  const s = resolveMediaStyle(c, { emptyText: "未设置图片" });
  const uid = "img-" + Math.random().toString(36).slice(2, 9);

  // ── 数据源：绑定全局源时以全局源覆盖组件自带取数配置（与编辑端同一函数） ──
  const dsId = String(c.dataSourceId ?? "");
  const gds = ctx.globalDataSources as Record<string, unknown> | undefined;
  const boundSource = dsId && gds ? (gds[dsId] as Record<string, unknown>) : undefined;
  const eff: Record<string, unknown> = boundSource
    ? (resolveEffectiveDataConfig(c, boundSource) as Record<string, unknown>)
    : c;
  const isApi = String(eff.dataMode ?? "static") === "api" && Boolean(eff.apiUrl || eff.apiPath);
  const authEnabled =
    readAuthEnabled(eff.authEnabled);

  const staticSrc = String(c.source ?? "").trim();
  const showImg = isApi || !!staticSrc;

  const alt = String(c.alt ?? "").trim() || component.name || "";
  const link = String(c.link ?? "").trim();
  const target = String(c.linkTarget ?? "_self") === "_blank" ? "_blank" : "_self";
  const lazy = c.lazyLoading === true;

  const wrapCss = mediaWrapCss({
    radiusCss: s.radiusCss,
    bgColor: s.bgColor,
    borderCss: s.borderCss,
    boxShadow: s.boxShadow,
    opacity: s.opacity,
  });

  const imgStyle =
    `width:100%;height:100%;display:block;object-fit:${s.fit};object-position:${s.objectPosition};` +
    `transform-origin:center center`;

  let inner = "";
  if (showImg) {
    const srcAttr = isApi ? "" : ` src="${escapeHTML(staticSrc)}"`;
    inner += `<img class="${uid}-img" id="${uid}i"${srcAttr} alt="${escapeHTML(alt)}"${
      lazy ? ' loading="lazy" decoding="async"' : ""
    } style="${imgStyle}" />`;
  }
  // 空态：静态无资源时恒显示；接口模式下先显示，数据到达/失败由脚本切换
  const emptyDisplay = showImg && !isApi ? "none" : "flex";
  inner +=
    `<div class="${uid}-empty" id="${uid}e" style="position:absolute;inset:0;display:${emptyDisplay};` +
    `align-items:center;justify-content:center;background:${s.emptyBg};color:${s.emptyColor};` +
    `font-size:12px;user-select:none">${escapeHTML(s.emptyText)}</div>`;
  if (s.caption) {
    inner +=
      `<div class="${uid}-cap" style="position:absolute;left:0;right:0;bottom:0;padding:6px 10px;` +
      `font-size:${s.captionFontSize}px;line-height:1.4;color:${s.captionColor};background:${s.captionBg};` +
      `pointer-events:none;user-select:none">${escapeHTML(s.caption)}</div>`;
  }

  const body = link
    ? `<a href="${escapeHTML(link)}" target="${target}"${target === "_blank" ? ' rel="noopener noreferrer"' : ""} style="display:block;width:100%;height:100%;text-decoration:none">${inner}</a>`
    : inner;

  const extraCss = hoverZoomCss(uid, s.hoverScale, s.transitionCss);

  // 接口模式：数据到达后写入 img.src；失败/空值回落空态
  const apiScript = isApi
    ? dataLoaderScript({
        container: `var el=document.getElementById('${uid}i');`,
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
          `  var keys=f?[f]:['url','src','image','imageUrl','path'];`,
          `  for(var i=0;i<keys.length;i++){var v=keys[i].split('.').reduce(function(a,k){return a==null?undefined:a[k];},data);if(v){src=String(v);break;}}`,
          `}`,
          `var im=document.getElementById('${uid}i'),em=document.getElementById('${uid}e');`,
          `if(src&&im){im.src=src;if(em)em.style.display='none';}else{if(em)em.style.display='flex';}`,
        ].join("\n"),
      })
    : "";

  // 静态图的加载失败兜底（接口模式由取数脚本负责）
  const fallbackScript =
    showImg && !isApi
      ? `<script>;(function(){var im=document.getElementById('${uid}i'),em=document.getElementById('${uid}e');if(!im)return;` +
        `im.addEventListener('error',function(){im.style.display='none';if(em)em.style.display='flex';});` +
        `im.addEventListener('load',function(){if(em)em.style.display='none';});})();</script>`
      : "";

  const html =
    `<div class="${uid}" style="${wrapCss}">${body}</div>` +
    (extraCss ? `<style>${extraCss}</style>` : "") +
    fallbackScript +
    apiScript;

  return html;
};

/**
 * video（视频）→ HTML
 *
 * 扩展：封面图、controls/autoplay/muted/loop/playsInline/preload 全量开关、
 * object-fit、圆角/边框/阴影/底色/透明度、题注、起播时间/音量/倍速、
 * 空态占位；并输出视频元数据就绪后的加载完成提示开关。
 *
 * 动态资源：`dataMode=api` 时由统一取数骨架（dataLoaderScript）拉取，按 `apiSrcField`
 * 取视频地址、`apiPosterField` 取封面地址再写进 `<source>` / `poster`。
 * `authEnabled` 仍是「认证 / 非认证」两种接入方式的切换点（三态：null 跟随站点全局）。
 * 媒体组三件套（图片/视频/音频）此前只有视频不能接动态数据，本处补齐后三者同构。
 */
export const videoCodegen: ComponentCodegenFn = (component, ctx: CodegenContext) => {
  const c = component.config as Record<string, unknown>;
  const s = resolveMediaStyle(c, { fit: "contain", bgColor: "#000000", emptyText: "未设置视频" });
  const uid = "vid-" + Math.random().toString(36).slice(2, 9);

  // ── 数据源：绑定全局源时以全局源覆盖组件自带取数配置（与编辑端同一函数） ──
  const dsId = String(c.dataSourceId ?? "");
  const gds = ctx.globalDataSources as Record<string, unknown> | undefined;
  const boundSource = dsId && gds ? (gds[dsId] as Record<string, unknown>) : undefined;
  const eff: Record<string, unknown> = boundSource
    ? (resolveEffectiveDataConfig(c, boundSource) as Record<string, unknown>)
    : c;
  const isApi = String(eff.dataMode ?? "static") === "api" && Boolean(eff.apiUrl || eff.apiPath);
  const authEnabled =
    readAuthEnabled(eff.authEnabled);

  const src = String(c.source ?? "").trim();
  const poster = String(c.poster ?? "").trim();
  const attrs: string[] = [];
  if (c.autoplay === true) {
    attrs.push("autoplay");
    // 自动播放的浏览器策略：必须静音，否则会被拦下（两端一致地兜底静音）
    if (c.muted !== false) attrs.push("muted");
  } else if (c.muted === true) {
    attrs.push("muted");
  }
  if (c.controls !== false) attrs.push("controls");
  if (c.loop === true) attrs.push("loop");
  if (c.playsInline !== false) attrs.push("playsinline");
  const preload = ["none", "metadata", "auto"].includes(String(c.preload ?? ""))
    ? String(c.preload)
    : "metadata";
  attrs.push(`preload="${preload}"`);
  // 静态封面始终写入（接口模式下数据到达后由脚本覆盖，属兜底而非冲突）
  if (poster) attrs.push(`poster="${escapeHTML(poster)}"`);

  const wrapCss = mediaWrapCss({
    radiusCss: s.radiusCss,
    bgColor: s.bgColor,
    borderCss: s.borderCss,
    boxShadow: s.boxShadow,
    opacity: s.opacity,
  });

  const videoStyle =
    `width:100%;height:100%;display:block;object-fit:${s.fit};object-position:${s.objectPosition};` +
    `transform-origin:center center`;

  // 接口模式：先渲染出 video 元素（src 由脚本写入），空态由脚本切换
  const showVideo = !!src || isApi;
  let inner = "";
  if (showVideo) {
    const srcAttr = isApi ? "" : ` src="${escapeHTML(src)}"`;
    inner +=
      `<video class="${uid}-img" id="${uid}v" ${attrs.join(" ")} style="${videoStyle}">` +
      `<source id="${uid}s"${srcAttr}></video>`;
  }
  const emptyDisplay = showVideo && !isApi ? "none" : "flex";
  inner +=
    `<div class="${uid}-empty" id="${uid}e" style="position:absolute;inset:0;display:${emptyDisplay};` +
    `align-items:center;justify-content:center;background:${s.emptyBg};color:${s.emptyColor};` +
    `font-size:12px;user-select:none">${escapeHTML(s.emptyText)}</div>`;
  if (s.caption) {
    inner +=
      `<div class="${uid}-cap" style="position:absolute;left:0;right:0;bottom:0;padding:6px 10px;` +
      `font-size:${s.captionFontSize}px;line-height:1.4;color:${s.captionColor};background:${s.captionBg};` +
      `pointer-events:none;user-select:none">${escapeHTML(s.caption)}</div>`;
  }

  const extraCss = hoverZoomCss(uid, s.hoverScale, s.transitionCss);

  // 接口模式：数据到达后写入 <source src> 与 poster；空值回落空态
  const apiScript = isApi
    ? dataLoaderScript({
        container: `var v=document.getElementById('${uid}v');`,
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
          `var pf=${JSON.stringify(String(eff.apiPosterField ?? c.apiPosterField ?? ""))};`,
          `function pick(obj,field,keys){`,
          `  if(field){var v=field.split('.').reduce(function(a,k){return a==null?undefined:a[k];},obj);if(v)return String(v);}`,
          `  for(var i=0;i<keys.length;i++){var w=keys[i].split('.').reduce(function(a,k){return a==null?undefined:a[k];},obj);if(w)return String(w);}`,
          `  return '';`,
          `}`,
          `var src='',poster='';`,
          `if(typeof data==='string'){src=data;}`,
          `else if(data&&typeof data==='object'){`,
          `  src=pick(data,f,['url','src','video','videoUrl','path']);`,
          `  poster=pick(data,pf,['poster','cover','image','thumbnail']);`,
          `}`,
          `var v=document.getElementById('${uid}v'),so=document.getElementById('${uid}s'),em=document.getElementById('${uid}e');`,
          `if(src&&so){so.src=src;if(v){try{v.load();}catch(e){}}typeof vStarted==='function'&&vStarted(v);if(em)em.style.display='none';}`,
          `else{if(em)em.style.display='flex';}`,
          `if(poster&&v){v.poster=poster;}`,
        ].join("\n"),
      })
    : "";

  // 起播时间 / 音量 / 倍速：只在这些项真的配了才输出脚本（避免为默认值注入无用代码）
  const startTime = Number(c.startTime ?? 0) || 0;
  const volumeRaw = c.volume;
  const volume = volumeRaw === undefined || volumeRaw === null || volumeRaw === "" ? null : Number(volumeRaw);
  const rate = Number(c.playbackRate ?? 1) || 1;
  const needScript = startTime > 0 || (volume !== null && Number.isFinite(volume)) || rate !== 1;
  const script = needScript
    ? `<script>;(function(){var v=document.getElementById('${uid}v');if(!v)return;` +
      `function apply(){` +
      (startTime > 0 ? `try{v.currentTime=${startTime};}catch(e){}` : "") +
      (volume !== null && Number.isFinite(volume) ? `try{v.volume=${Math.min(1, Math.max(0, volume))};}catch(e){}` : "") +
      (rate !== 1 ? `try{v.playbackRate=${rate};}catch(e){}` : "") +
      `}apply();window.vStarted=apply;` +
      `})();</script>`
    : "";

  return (
    `<div class="${uid}" style="${wrapCss}">${inner}</div>` +
    (extraCss ? `<style>${extraCss}</style>` : "") +
    script +
    apiScript
  );
};

/**
 * audio（音频）→ HTML（媒体组扩展新增）
 *
 * 形态：封面/图标 + 标题副标题 + 原生音频控件。原生控件在两类页面上表现稳定，
 * 不自绘播放器（自绘需接管进度/音量/缓冲，收益低、风险高）。
 * 未设置音源时给出空态占位，避免浏览器渲染出一个不可用的空控件。
 *
 * 样式一律读 `resolveMediaStyle`（媒体族唯一口径，编辑区同源）：
 * 圆角 / 边框 / 阴影 / 底色 / 透明度 / 空态配色与图片视频逐项同口径。
 *
 * 动态资源（本轮补齐，媒体组三件套至此完全同构）：
 * `dataMode=api` 时由统一取数骨架（dataLoaderScript）拉取，按 `apiSrcField` 取音频地址、
 * `apiCoverField` 取封面地址再写进 `<source>` 与封面 `<img>`；
 * `authEnabled` 三态是"认证 / 非认证"两种接入方式的切换点（null = 跟随站点全局）。
 */
export const audioCodegen: ComponentCodegenFn = (component, ctx: CodegenContext) => {
  const c = component.config as Record<string, unknown>;
  const s = resolveMediaStyle(c, {
    radius: 4,
    bgColor: "rgba(255,255,255,0.06)",
    emptyText: "未设置音频",
    emptyBg: "transparent",
    emptyColor: "rgba(229,231,235,0.6)",
  });
  const uid = "aud-" + Math.random().toString(36).slice(2, 9);

  // ── 数据源：绑定全局源时以全局源覆盖组件自带取数配置（与编辑端同一函数） ──
  const dsId = String(c.dataSourceId ?? "");
  const gds = ctx.globalDataSources as Record<string, unknown> | undefined;
  const boundSource = dsId && gds ? (gds[dsId] as Record<string, unknown>) : undefined;
  const eff: Record<string, unknown> = boundSource
    ? (resolveEffectiveDataConfig(c, boundSource) as Record<string, unknown>)
    : c;
  const isApi = String(eff.dataMode ?? "static") === "api" && Boolean(eff.apiUrl || eff.apiPath);
  const authEnabled = readAuthEnabled(eff.authEnabled);

  const src = String(c.source ?? "").trim();
  const title = String(c.title ?? "").trim();
  const subtitle = String(c.subtitle ?? "").trim();
  const icon = String(c.icon ?? "music_note");
  const showIcon = c.showIcon !== false;
  const cover = String(c.cover ?? "").trim();
  const textColor = String(c.textColor ?? "#E5E7EB");
  const subtitleColor = String(c.subtitleColor ?? "rgba(229,231,235,0.6)");
  const accentColor = String(c.accentColor ?? "#1976d2");
  const borderColor = String(c.borderColor ?? "#d0d0d8");
  const gap = Number(c.gap ?? 12) || 12;
  const padding = Number(c.padding ?? 12) || 12;
  const alignMap: Record<string, string> = { left: "flex-start", center: "center", right: "flex-end" };
  const align = alignMap[String(c.align ?? "left")] ?? "flex-start";

  const innerRadius = Math.max(0, s.radius * 10 - 2);

  const attrs: string[] = [];
  if (c.controls !== false) attrs.push("controls");
  if (c.autoplay === true) {
    attrs.push("autoplay");
    if (c.muted !== false) attrs.push("muted");
  } else if (c.muted === true) {
    attrs.push("muted");
  }
  if (c.loop === true) attrs.push("loop");
  const preload = ["none", "metadata", "auto"].includes(String(c.preload ?? "")) ? String(c.preload) : "metadata";
  attrs.push(`preload="${preload}"`);

  /* 左侧：封面图 + 图标占位。接口模式下**两个元素都输出**，靠 display 切换 ——
     面数据到达时脚本把封面点亮、把图标收起来，不必为切换结构再写一段 DOM 操作。
     `display:none` 的元素不参与 flex 布局与 gap，因此可见结果与编辑区「二选一渲染」逐项一致；
     静态封面且非接口模式时图标**根本不需要**，此时不输出（产物与历史逐字一致）。 */
  const staticCover = isApi ? "" : cover;
  const showIconNow = !staticCover && showIcon;
  const iconSvg =
    icon === "headphones"
      ? "M12 3a9 9 0 0 0-9 9v7a2 2 0 0 0 2 2h2v-8H5v-1a7 7 0 0 1 14 0v1h-2v8h2a2 2 0 0 0 2-2v-7a9 9 0 0 0-9-9z"
      : "M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z";
  const sizeStyle = `width:44px;height:44px;flex-shrink:0;border-radius:${innerRadius}px`;
  let left = "";
  if (staticCover || isApi) {
    left +=
      `<img id="${uid}c" alt=""${staticCover ? ` src="${escapeHTML(staticCover)}"` : ""} ` +
      `style="${sizeStyle};object-fit:cover;display:${staticCover ? "block" : "none"}" />`;
  }
  if (showIconNow || isApi) {
    left +=
      `<span id="${uid}i" style="${sizeStyle};display:${showIconNow ? "flex" : "none"};` +
      `align-items:center;justify-content:center;background:${accentColor};color:#fff">` +
      `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="${iconSvg}"/></svg></span>`;
  }

  const meta = title || subtitle
    ? `<div style="flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px">` +
      (title
        ? `<div style="font-size:14px;font-weight:600;color:${textColor};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHTML(title)}</div>`
        : "") +
      (subtitle
        ? `<div style="font-size:12px;color:${subtitleColor};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHTML(subtitle)}</div>`
        : "") +
      `</div>`
    : "";

  /* 接口模式：先渲染出 audio 元素（src 由脚本写入），空态由脚本切换 */
  const showAudio = !!src || isApi;
  const audioEl = showAudio
    ? `<audio id="${uid}a" ${attrs.join(" ")} style="flex:0 1 260px;min-width:120px;max-width:320px">` +
      `<source id="${uid}s"${isApi ? "" : ` src="${escapeHTML(src)}"`}></audio>`
    : "";
  const emptyEl =
    `<div id="${uid}e" style="flex:0 1 260px;min-width:120px;max-width:320px;` +
    `display:${showAudio && !isApi ? "none" : "flex"};align-items:center;justify-content:center;height:36px;` +
    `border:1px dashed ${borderColor};border-radius:${s.radiusCss};font-size:12px;color:${s.emptyColor};` +
    `background:${s.emptyBg};user-select:none">${escapeHTML(s.emptyText)}</div>`;

  const wrapCss = [
    "position:relative",
    "width:100%",
    "height:100%",
    "box-sizing:border-box",
    "overflow:hidden",
    "display:flex",
    "align-items:center",
    `justify-content:${align}`,
    `gap:${gap}px`,
    `padding:0 ${padding}px`,
    `background:${s.bgColor}`,
    `border-radius:${s.radiusCss}`,
    s.borderCss ? `border:${s.borderCss}` : "",
    s.boxShadow ? `box-shadow:${s.boxShadow}` : "",
    `opacity:${s.opacity}`,
  ]
    .filter(Boolean)
    .join(";");

  // 接口模式：数据到达后写入 <source src> 与封面；空值回落空态
  const apiScript = isApi
    ? dataLoaderScript({
        container: `var au=document.getElementById('${uid}a');`,
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
          `var cf=${JSON.stringify(String(eff.apiCoverField ?? c.apiCoverField ?? ""))};`,
          `function pick(obj,field,keys){`,
          `  if(field){var v=field.split('.').reduce(function(a,k){return a==null?undefined:a[k];},obj);if(v)return String(v);}`,
          `  for(var i=0;i<keys.length;i++){var w=keys[i].split('.').reduce(function(a,k){return a==null?undefined:a[k];},obj);if(w)return String(w);}`,
          `  return '';`,
          `}`,
          `var src='',cv='';`,
          `if(typeof data==='string'){src=data;}`,
          `else if(data&&typeof data==='object'){`,
          `  src=pick(data,f,['url','src','audio','audioUrl','path']);`,
          `  cv=pick(data,cf,['cover','poster','image','thumbnail']);`,
          `}`,
          `var so=document.getElementById('${uid}s'),em=document.getElementById('${uid}e');`,
          `var cov=document.getElementById('${uid}c'),ic=document.getElementById('${uid}i');`,
          `if(src&&so){so.src=src;if(au){try{au.load();}catch(e){}}if(em)em.style.display='none';}`,
          `else{if(em)em.style.display='flex';}`,
          `if(cv&&cov){cov.src=cv;cov.style.display='block';if(ic)ic.style.display='none';}`,
        ].join("\n"),
      })
    : "";

  return `<div class="${uid}" style="${wrapCss}">${left}${meta}${audioEl}${emptyEl}</div>` + apiScript;
};
