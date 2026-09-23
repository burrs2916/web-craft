import type { ComponentCodegenFn } from "../types";
import { escapeHTML } from "../layout";
import { renderMenuIcon } from "../iconPipeline";
import { bindVisibilityScript } from "../dataLoader";
import { readAuthEnabled } from "../../editor/data/authMode";

/**
 * empty-state 组件 -> HTML
 *
 * 配置：preset(仅作者辅助,发布端无感)、icon、title、description、
 *       showButton、buttonAction(link|reload)、buttonText、buttonHref、buttonTarget、
 *       visibilityMode(always|api)、bindUrl、bindMethod、bindInterval、bindDataPath、
 *       bindAuthEnabled、emptyWhen、showWhenEmpty、hideOnError、
 *       iconSize、iconColor、iconGradientEnabled、iconGradientFrom、iconGradientTo、
 *       iconEntrance、iconAnimation、titleColor、titleFontSize、descColor、descFontSize、
 *       descMaxWidth、buttonColor、buttonBgColor、buttonFontSize、bgColor、padding、gap
 */
export const emptyStateCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config;

  const icon = String(c.icon ?? "material:inbox");
  const title = String(c.title ?? "暂无数据");
  const description = String(c.description ?? "");
  const showButton = c.showButton === true;
  const buttonAction = String(c.buttonAction ?? "link");
  const buttonText = String(c.buttonText ?? "刷新");
  const buttonHref = String(c.buttonHref ?? "");
  const buttonTarget = String(c.buttonTarget ?? "_self");

  const visibilityMode = String(c.visibilityMode ?? "always");
  const apiMode = visibilityMode === "api";
  const bindUrl = String(c.bindUrl ?? "");
  const bindMethod = String(c.bindMethod ?? "GET");
  const bindHeaders = String(c.bindHeaders ?? "");
  const bindBody = String(c.bindBody ?? "");
  const bindInterval = Number(c.bindInterval ?? 0);
  const bindDataPath = String(c.bindDataPath ?? "");
  // 三态透传（null = 跟随站点全局）：与内容数据源同一口径，勿压成布尔
  const bindAuthEnabled = readAuthEnabled(c.bindAuthEnabled);
  const emptyWhen = String(c.emptyWhen ?? "emptyValue");
  const showWhenEmpty = c.showWhenEmpty !== false;
  const hideOnError = c.hideOnError !== false;

  const iconSize = Number(c.iconSize ?? 64);
  const iconColor = String(c.iconColor ?? "rgba(255,255,255,0.28)");
  const glowEnabled = c.iconGradientEnabled === true;
  const glowFrom = String(c.iconGradientFrom ?? "rgba(79,195,247,0.45)");
  const glowTo = String(c.iconGradientTo ?? "rgba(79,195,247,0.08)");
  const iconEntrance = String(c.iconEntrance ?? "none");
  const iconAnimation = String(c.iconAnimation ?? "none");
  const animDuration = Math.max(300, Number(c.iconAnimDuration ?? 640));

  const titleColor = String(c.titleColor ?? "rgba(255,255,255,0.62)");
  const titleFontSize = Number(c.titleFontSize ?? 16);
  const descColor = String(c.descColor ?? "rgba(255,255,255,0.42)");
  const descFontSize = Number(c.descFontSize ?? 13);
  const descMaxWidth = Number(c.descMaxWidth ?? 84);
  const bgColor = String(c.bgColor ?? "transparent");
  const padding = Number(c.padding ?? 24);
  const gap = Number(c.gap ?? 12);
  const buttonColor = String(c.buttonColor ?? "#FF9800");
  const buttonBgColor = String(c.buttonBgColor ?? "rgba(255,152,0,0.16)");
  const buttonFontSize = Number(c.buttonFontSize ?? 13);

  // 用于定位本组件宿主元素 + 注入 JS 的唯一 id
  const uid = `es${Math.random().toString(36).slice(2, 8)}`;
  const runId = `${uid}-run`;

  // 图标（未知图标兜底 inbox，保证双端一致）
  let iconHTML = renderMenuIcon(icon, iconSize, ctx);
  if (!iconHTML) iconHTML = renderMenuIcon("material:inbox", iconSize, ctx);

  // 动画 keyframes
  const keyframes: string[] = [];
  if (iconEntrance === "fadeIn") keyframes.push(`@keyframes ${runId}Fade{from{opacity:0}to{opacity:1}}`);
  if (iconEntrance === "zoomIn") keyframes.push(`@keyframes ${runId}Zoom{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:scale(1)}}`);
  if (iconEntrance === "drop") keyframes.push(`@keyframes ${runId}Drop{from{opacity:0;transform:translateY(-18px)}to{opacity:1;transform:translateY(0)}}`);
  if (iconAnimation === "float") keyframes.push(`@keyframes ${runId}Float{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}`);
  if (iconAnimation === "bounce") keyframes.push(`@keyframes ${runId}Bounce{0%,100%{transform:translateY(0)}30%{transform:translateY(-4px)}}`);
  if (iconAnimation === "pulse") keyframes.push(`@keyframes ${runId}Pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.06);opacity:.9}}`);
  const entranceAnim = {
    fadeIn: `${runId}Fade ${animDuration}ms ease both`,
    zoomIn: `${runId}Zoom ${animDuration}ms cubic-bezier(.22,1,.36,1) both`,
    drop: `${runId}Drop ${animDuration}ms cubic-bezier(.22,1,.36,1) both`,
  }[iconEntrance];
  const loopAnim = {
    float: `${runId}Float 3.2s ease-in-out infinite`,
    bounce: `${runId}Bounce 1.6s ease-in-out infinite`,
    pulse: `${runId}Pulse 2.2s ease-in-out infinite`,
  }[iconAnimation];
  const iconAnim = [entranceAnim, loopAnim].filter(Boolean).join(", ");

  let html = `<div id="${uid}" role="status" aria-live="polite" style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:${bgColor};gap:${gap}px;padding:${padding}px;box-sizing:border-box;overflow:hidden">`;

  // Icon + 光晕
  const glowArea = Math.max(iconSize, 88);
  html += `<div style="position:relative;width:${glowArea}px;height:${glowArea}px;display:flex;align-items:center;justify-content:center;flex-shrink:0${iconAnim ? ";animation:" + iconAnim : ""}">`;
  if (glowEnabled) {
    html += `<div aria-hidden="true" style="position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle,${glowFrom} 0%,${glowTo} 55%,transparent 74%);filter:blur(6px);pointer-events:none"></div>`;
  }
  html += `<div style="position:relative;display:flex;align-items:center;justify-content:center;color:${iconColor}">${iconHTML}</div>`;
  html += `</div>`;

  // Title
  if (title) {
    html += `<span style="display:block;color:${titleColor};font-size:${titleFontSize}px;font-weight:500;text-align:center;line-height:1.4">${escapeHTML(title)}</span>`;
  }

  // Description
  if (description) {
    html += `<span style="display:block;color:${descColor};font-size:${descFontSize}px;text-align:center;line-height:1.6;max-width:${descMaxWidth}%;margin:0 auto;white-space:pre-wrap">${escapeHTML(description)}</span>`;
  }

  // Button
  if (showButton) {
    const btnClass = `${uid}btn`;
    const btnStyle = `color:${buttonColor};background:${buttonBgColor};font-size:${buttonFontSize}px;text-decoration:none;padding:6px 22px;border-radius:8px;border:none;cursor:pointer;display:inline-block;box-shadow:0 2px 8px rgba(0,0,0,.12);transition:filter .2s ease`;
    const hoverCSS = `<style>.${btnClass}:hover{filter:brightness(1.12)}</style>`;
    if (buttonAction === "reload") {
      html += `<button class="${btnClass}" data-es-reload style="${btnStyle}">${escapeHTML(buttonText)}</button>`;
    } else if (buttonHref) {
      html += `<a href="${escapeHTML(buttonHref)}" target="${escapeHTML(buttonTarget)}" rel="noopener noreferrer" class="${btnClass}" style="${btnStyle}">${escapeHTML(buttonText)}</a>`;
    } else {
      html += `<button class="${btnClass}" style="${btnStyle}">${escapeHTML(buttonText)}</button>`;
    }
    html += hoverCSS;
  }

  html += `</div>`;
  if (keyframes.length > 0) {
    html += `<style>${keyframes.join(" ")}</style>`;
  }

  // ─── 运行时：按钮重试 + 数据感知显隐（仅 api 模式且配置了地址时注入） ───
  if (showButton && buttonAction === "reload") {
    html += `<script>(function(){var b=document.getElementById("${uid}").querySelector("[data-es-reload]");if(b){b.addEventListener("click",function(){window.location.reload();});}})();</script>`;
  }
  if (apiMode && bindUrl) {
    // 统一数据感知显隐脚本（与骨架屏/加载动画共用，取数规则同 dataLoaderScript）
    html += bindVisibilityScript({
      hostExpr: `var host = document.getElementById("${escapeHTML(uid)}");`,
      mode: "empty",
      bindUrl,
      bindMethod,
      bindHeaders,
      bindBody,
      bindInterval,
      bindAuthEnabled,
      bindDataPath,
      emptyWhen,
      showWhenEmpty,
      hideOnError,
    });
  }

  return html;
};