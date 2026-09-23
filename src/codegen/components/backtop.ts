import type { ComponentCodegenFn } from "../types";
import { escapeHTML, toJsString } from "../layout";
import { renderMenuIcon } from "../iconPipeline";
import { backtopScale } from "../../editor/renderers/backtopShared";

/**
 * backtop 组件 -> HTML
 *
 * 发布端与编辑器一致：按钮在组件框内**居中、静态、始终可见**（WYSIWYG），不做 fixed 悬浮。
 * 运行时注入 JS：
 *   - 点击 → 平滑回顶（window 或配置的 scrollTarget 容器）
 *   - 可选滚动进度环：随目标滚动更新
 *   - 悬停 → 渐变提亮 / 纯色换色、图标变色、可选放大
 *
 * 配置：shape, size, icon, iconSize, showText, text, textSize,
 *       bgColor, bgColorHover, gradientEnabled, gradientFrom, gradientTo,
 *       iconColor, iconColorHover, textColor,
 *       borderEnabled, borderColor, borderWidth, borderRadius, boxShadow, hoverScale,
 *       progressRing, ringColor, ringWidth, ringTrackColor,
 *       scrollTarget
 */
export const backtopCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config;

  const shape = String(c.shape ?? "circle");
  const size = Number(c.size ?? 44);
  const icon = String(c.icon ?? "");
  const iconSize = Number(c.iconSize ?? 24);
  const showText = c.showText === true;
  const text = String(c.text ?? "顶部");
  const textSize = Number(c.textSize ?? 11);
  const bgColor = String(c.bgColor ?? "rgba(255,152,0,0.15)");
  const bgColorHover = String(c.bgColorHover ?? "rgba(255,152,0,0.25)");
  const gradientEnabled = c.gradientEnabled === true;
  const gradientFrom = String(c.gradientFrom ?? "rgba(13,148,136,0.85)");
  const gradientTo = String(c.gradientTo ?? "rgba(14,165,233,0.9)");
  const iconColor = String(c.iconColor ?? "#FF9800");
  const iconColorHover = String(c.iconColorHover ?? "#ffffff");
  const textColor = String(c.textColor ?? iconColor);
  const borderEnabled = c.borderEnabled === true;
  const borderColor = String(c.borderColor ?? "rgba(255,152,0,0.3)");
  const borderWidth = Number(c.borderWidth ?? 1);
  const borderRadius = Number(c.borderRadius ?? 50);
  const boxShadow = c.boxShadow !== false;
  const hoverScale = c.hoverScale !== false;
  const progressRing = c.progressRing === true;
  const ringColor = String(c.ringColor ?? "#FF9800");
  const ringWidth = Number(c.ringWidth ?? 3);
  const ringTrackColor = String(c.ringTrackColor ?? "rgba(255,255,255,0.15)");
  const scrollTarget = String(c.scrollTarget ?? "");

  const uid = `bktp-${Math.random().toString(36).slice(2, 9)}`;

  const borderRadiusVal = shape === "circle"
    ? "50%"
    : shape === "square"
      ? `${Math.min(size * 0.12, 8)}px`
      : `${borderRadius}px`;

  const fullHeight = showText ? size + 20 : size;
  const height = `${fullHeight}px`;
  // 等比缩放并以「收进框内」为准（取宽高两个方向较紧者），避免缩放时被 overflow 裁切
  const tf = component.transform as { width?: number; height?: number } | undefined;
  const boxW = typeof tf?.width === "number" ? tf.width : undefined;
  const boxH = typeof tf?.height === "number" ? tf.height : undefined;
  const scaleFactor = backtopScale(boxW, boxH, size, fullHeight);
  const baseBg = gradientEnabled
    ? `linear-gradient(135deg,${gradientFrom},${gradientTo})`
    : bgColor;

  const btnStyle = [
    "position:relative",
    `width:${size}px`,
    `height:${height}`,
    "display:flex",
    "flex-direction:column",
    "align-items:center",
    "justify-content:center",
    "gap:2px",
    "cursor:pointer",
    `transform:scale(${scaleFactor})`,
    "transform-origin:center",
    `background:${baseBg}`,
    `border-radius:${borderRadiusVal}`,
    borderEnabled ? `border:${borderWidth}px solid ${borderColor}` : "border:none",
    boxShadow ? "box-shadow:0 4px 14px rgba(0,0,0,0.28)" : "",
    "transition:all 0.25s ease",
    "box-sizing:border-box",
    "flex-shrink:0",
  ].filter(Boolean).join(";");

  // 图标：留空用默认向上箭头；选中了自定义图标则经图标管道解析（未知兜底 vertical_align_top）
  let iconInner: string;
  if (icon) {
    iconInner = renderMenuIcon(icon, iconSize, ctx) || renderMenuIcon("vertical_align_top", iconSize, ctx);
  } else {
    iconInner = `<svg viewBox="0 0 24 24" fill="currentColor" style="width:${iconSize}px;height:${iconSize}px;display:block;flex-shrink:0"><path d="M7.41 15.41 12 10.83l4.59 4.58L18 14l-6-6-6 6z"/></svg>`;
  }
  const iconEl = `<span id="${uid}-icon" style="display:flex;line-height:0;color:${iconColor}">${iconInner}</span>`;

  // 进度环
  const ringR = size / 2 - ringWidth / 2 - 1;
  const ringC = 2 * Math.PI * ringR;
  const ringSVG = progressRing
    ? `<svg width="${size}" height="${size}" aria-hidden="true" style="position:absolute;top:0;left:0;transform:rotate(-90deg);pointer-events:none"><circle cx="${size / 2}" cy="${size / 2}" r="${ringR}" fill="none" stroke="${ringTrackColor}" stroke-width="${ringWidth}"/><circle cx="${size / 2}" cy="${size / 2}" r="${ringR}" fill="none" stroke="${ringColor}" stroke-width="${ringWidth}" stroke-linecap="round" stroke-dasharray="${ringC}" stroke-dashoffset="${ringC}" data-bktop-progress data-bktop-uid="${uid}"/></svg>`
    : "";

  let inner = ringSVG + iconEl;
  if (showText) {
    inner += `<span style="position:relative;color:${textColor};font-size:${textSize}px;user-select:none;line-height:1">${escapeHTML(text)}</span>`;
  }

  const safeUid = escapeHTML(uid);
  const safeScrollTarget = toJsString(scrollTarget);
  const isGradient = gradientEnabled ? "true" : "false";
  const useHoverScale = hoverScale ? "true" : "false";

  const script = `<script>(function(){
var btn=document.querySelector('[data-backtop-uid="${safeUid}"] [data-bktop-btn]');
if(!btn)return;
var iconEl=document.getElementById("${safeUid}-icon");
var ring=btn.querySelector("[data-bktop-progress]");
var sel=${safeScrollTarget};
var targetEl=sel?document.querySelector(sel):null;
var isGradient=${isGradient}===true;
var useScale=${useHoverScale}===true;
var K=${scaleFactor};
var C=${ringC};
var bgColor="${escapeHTML(bgColor)}";
var bgColorHover="${escapeHTML(bgColorHover)}";
var iconColor="${escapeHTML(iconColor)}";
var iconColorHover="${escapeHTML(iconColorHover)}";
function info(){
  if(targetEl){return {top:targetEl.scrollTop,max:Math.max(1,targetEl.scrollHeight-targetEl.clientHeight)};}
  var d=document.scrollingElement||document.documentElement;
  return {top:window.scrollY,max:Math.max(1,d.scrollHeight-window.innerHeight)};
}
function update(){
  if(!ring)return;
  var s=info();
  var p=Math.max(0,Math.min(1,s.top/s.max));
  ring.style.strokeDashoffset=String(C*(1-p));
}
var listenWith=targetEl||window;
listenWith.addEventListener("scroll",update,{passive:true});
window.addEventListener("resize",update);
update();
btn.addEventListener("click",function(){
  if(targetEl){targetEl.scrollTo({top:0,behavior:"smooth"});}
  else{window.scrollTo({top:0,behavior:"smooth"});}
});
btn.addEventListener("mouseenter",function(){
  if(isGradient){btn.style.filter="brightness(1.12)";}else{btn.style.background=bgColorHover;}
  if(iconEl)iconEl.style.color=iconColorHover;
  if(useScale)btn.style.transform="scale("+(K*1.08)+")";
});
btn.addEventListener("mouseleave",function(){
  if(isGradient){btn.style.filter="none";}else{btn.style.background=bgColor;}
  if(iconEl)iconEl.style.color=iconColor;
  if(useScale)btn.style.transform="scale("+K+")";
});
})();</script>`;

  // 容器占满组件框并居中；按钮本体始终可见
  const html = `<div data-backtop-uid="${safeUid}" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;box-sizing:border-box;overflow:hidden;position:relative"><div data-bktop-btn role="button" aria-label="返回顶部" style="${btnStyle}">${inner}</div></div>${script}`;

  return html;
};