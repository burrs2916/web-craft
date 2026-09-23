import type { ComponentCodegenFn } from "../types";
import { escapeHTML } from "../layout";
import { bindVisibilityScript } from "../dataLoader";
import { readAuthEnabled } from "../../editor/data/authMode";

/**
 * spin 加载中组件 -> HTML
 * 配置：variant, size, color, speed, tip, tipPosition, tipFontSize, tipColor,
 *       customSize, strokeWidth
 */
export const spinCodegen: ComponentCodegenFn = (component) => {
  const c = component.config;

  const variant = String(c.variant ?? "circle");
  const size = String(c.size ?? "medium");
  const color = String(c.color ?? "#2196F3");
  const speed = Number(c.speed ?? 1);
  const tip = String(c.tip ?? "");
  const tipPosition = String(c.tipPosition ?? "bottom");
  const tipFontSize = Number(c.tipFontSize ?? 13);
  const tipColor = String(c.tipColor ?? "rgba(255,255,255,0.5)");
  const customSize = Number(c.customSize ?? 0);
  const strokeWidth = Number(c.strokeWidth ?? 3);
  const gradientEnabled = c.gradientEnabled === true;
  const gradientFrom = String(c.gradientFrom ?? "#0D9488");
  const gradientTo = String(c.gradientTo ?? "#0EA5E9");
  const gradBg = gradientEnabled ? `linear-gradient(135deg,${gradientFrom},${gradientTo})` : color;
  const gradientId = `spin-grad-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

  // 数据感知自动隐藏（仅 api 模式且配置了地址时生效）
  const visibilityMode = String(c.visibilityMode ?? "always");
  const apiMode = visibilityMode === "api";
  const bindUrl = String(c.bindUrl ?? "");
  const bindMethod = String(c.bindMethod ?? "GET");
  const bindHeaders = String(c.bindHeaders ?? "");
  const bindBody = String(c.bindBody ?? "");
  const bindInterval = Number(c.bindInterval ?? 0);
  // 三态透传（null = 跟随站点全局）：与内容数据源同一口径，勿压成布尔
  const bindAuthEnabled = readAuthEnabled(c.bindAuthEnabled);
  const hideOnError = c.hideOnError === true;

  const spinId = `spin-${Math.random().toString(36).slice(2, 8)}`;

  const sizeMap: Record<string, number> = {
    small: 16,
    medium: 28,
    large: 40,
  };

  // 与编辑端渲染器保持一致的等比缩放：factor 基于组件盒尺寸 / 设计基准 100×60
  const tw = component.transform?.width ?? 0;
  const th = component.transform?.height ?? 0;
  const factor =
    tw > 0 && th > 0 ? Math.min(Math.max(Math.min(tw / 100, th / 60), 0.4), 6) : 1;
  const s = (v: number) => v * factor;
  const spinSize = s(customSize || (sizeMap[size] ?? sizeMap.medium));
  const strokeWidthS = s(strokeWidth);
  const tipFontSizeS = s(tipFontSize);
  const gapTip = s(8);
  const gapDots = s(4);
  const gapBars = s(3);
  const tipTop = s(6);

  const tipHTML = tip
    ? `<span style="font-size:${tipFontSizeS}px;color:${tipColor};${tipPosition === "bottom" ? `margin-top:${tipTop}px` : `margin-left:${gapTip}px`}">${escapeHTML(tip)}</span>`
    : "";
  const flexDirection = tipPosition === "right" ? "row" : "column";

  let inner = "";

  // 圆环
  if (variant === "circle") {
    const radius = (spinSize - strokeWidthS) / 2;
    const circumference = 2 * Math.PI * radius;
    inner = `<svg width="${spinSize}" height="${spinSize}" style="animation:spin-rotate ${speed}s linear infinite">
      ${gradientEnabled ? `<defs><linearGradient id="${gradientId}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${gradientFrom}"/><stop offset="100%" stop-color="${gradientTo}"/></linearGradient></defs>` : ""}
      <circle cx="${spinSize/2}" cy="${spinSize/2}" r="${radius}" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="${strokeWidthS}"/>
      <circle cx="${spinSize/2}" cy="${spinSize/2}" r="${radius}" fill="none" stroke="${gradientEnabled ? `url(#${gradientId})` : color}" stroke-width="${strokeWidthS}" stroke-linecap="round" stroke-dasharray="${circumference * 0.25} ${circumference * 0.75}"/>
    </svg>`;
  }
  // 三点
  else if (variant === "dots") {
    const dotSize = spinSize / 3;
    let dots = "";
    for (let i = 0; i < 3; i++) {
      dots += `<span style="width:${dotSize}px;height:${dotSize}px;border-radius:50%;background:${gradBg};animation:spin-bounce ${speed}s ease-in-out ${i * 0.16}s infinite;display:inline-block"></span>`;
    }
    inner = `<span style="display:flex;align-items:center;gap:${gapDots}px">${dots}</span>`;
  }
  // 竖条
  else if (variant === "bars") {
    const barWidth = Math.max(s(2), Math.round(spinSize / 5));
    let bars = "";
    for (let i = 0; i < 3; i++) {
      bars += `<span style="width:${barWidth}px;height:100%;border-radius:${barWidth/2}px;background:${gradBg};animation:spin-stretch ${speed}s ease-in-out ${i * 0.16}s infinite;display:inline-block"></span>`;
    }
    inner = `<span style="display:flex;align-items:center;gap:${gapBars}px;height:${spinSize}px">${bars}</span>`;
  }

  const css = `
<style>
@keyframes spin-rotate{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes spin-bounce{0%,80%,100%{transform:scale(0);opacity:0.5}40%{transform:scale(1);opacity:1}}
@keyframes spin-stretch{0%,40%,100%{transform:scaleY(0.4)}20%{transform:scaleY(1)}}
</style>`;

  let runtime = "";
  // 运行时：数据感知自动隐藏（统一 bindVisibilityScript，取数规则同 dataLoaderScript）
  if (apiMode && bindUrl) {
    runtime = bindVisibilityScript({
      hostExpr: `var host = document.getElementById("${escapeHTML(spinId)}");`,
      mode: "loaded",
      bindUrl,
      bindMethod,
      bindHeaders,
      bindBody,
      bindInterval,
      bindAuthEnabled,
      hideOnError,
    });
  }

  return `<div id="${spinId}" style="display:flex;align-items:center;gap:${tip ? `${gapTip}px` : "0"};flex-direction:${flexDirection};width:100%;height:100%;justify-content:center">${inner}${tipHTML}</div>${css}${runtime}`;
};
