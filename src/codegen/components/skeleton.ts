import type { ComponentCodegenFn } from "../types";
import { escapeHTML } from "../layout";
import { bindVisibilityScript } from "../dataLoader";
import { readAuthEnabled } from "../../editor/data/authMode";

interface SkeletonRow {
  type: "text" | "rect" | "circle";
  width: string;
  height: number;
  count: number;
}

const DEFAULT_ROWS: SkeletonRow[] = [
  { type: "text", width: "100%", height: 16, count: 1 },
  { type: "text", width: "100%", height: 16, count: 1 },
  { type: "text", width: "60%", height: 16, count: 1 },
];

function parseRows(input: unknown): SkeletonRow[] {
  const normalize = (item: Record<string, unknown>): SkeletonRow => ({
    type: (String(item?.type ?? "text") as SkeletonRow["type"]),
    width: String(item?.width ?? "100%"),
    height: Number(item?.height ?? 16),
    count: Number(item?.count ?? 1),
  });

  if (Array.isArray(input) && input.length > 0) {
    return input.map(normalize);
  }
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          if (parsed.length > 0) return parsed.map(normalize);
          return [{ type: "text", width: "100%", height: 16, count: 1 }];
        }
      } catch {
        // fall through
      }
    }
  }
  return [...DEFAULT_ROWS];
}

/**
 * skeleton 组件 -> HTML
 * 配置：preset(仅作者辅助,发布端无感)、rows(JSON)、baseColor、highlightColor、
 *       animation(wave/pulse)、animationDuration、gap、paddingX、paddingY、borderRadius、bgColor、
 *       layout(simple/card)、avatarSize、avatarGap、
 *       visibilityMode(always/api)、bindUrl、bindMethod、bindInterval、bindAuthEnabled、hideOnError
 */
export const skeletonCodegen: ComponentCodegenFn = (component) => {
  const c = component.config;

  const rows = parseRows(c.rows);
  const baseColor = String(c.baseColor ?? "rgba(255,255,255,0.08)");
  const highlightColor = String(c.highlightColor ?? "rgba(255,255,255,0.15)");
  const animation = String(c.animation ?? "wave");
  const animationDuration = Number(c.animationDuration ?? 1500);
  const gap = Number(c.gap ?? 10);
  const paddingX = Number(c.paddingX ?? 16);
  const paddingY = Number(c.paddingY ?? 16);
  const borderRadius = Number(c.borderRadius ?? 4);
  const bgColor = String(c.bgColor ?? "transparent");
  const avatarSize = Number(c.avatarSize ?? 40);
  const avatarGap = Number(c.avatarGap ?? 12);
  const layout = String(c.layout ?? "simple");

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

  const isCardLayout = layout === "card";
  const dur = `${animationDuration}ms`;

  const uid = `sk${Math.random().toString(36).slice(2, 8)}`;

  // 动画 keyframes（全局声明一次；时长在元素级控制，可各自不同）
  const keyframesCSS = animation === "wave"
    ? `@keyframes ${uid}Wave{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}`
    : `@keyframes ${uid}Pulse{0%,100%{opacity:1}50%{opacity:0.4}}`;

  const waveAnim = `${uid}Wave ${dur} ease-in-out infinite`;
  const pulseAnim = `${uid}Pulse ${dur} ease-in-out infinite`;

  // 元素外壳：波浪需要 relative+overflow，脉冲整体呼吸；shimmer 只对 wave 生效
  const shapeShell = (animated: boolean) =>
    (animated && animation === "wave") ? `position:relative;overflow:hidden` : "";
  const shimmerEl = (animated: boolean) =>
    animation === "wave" && animated
      ? `<div style="position:absolute;inset:0;background:linear-gradient(90deg,transparent,${highlightColor},transparent);animation:${waveAnim}"></div>`
      : "";
  const pulseCss = (animated: boolean) => (animated && animation === "pulse" ? `animation:${pulseAnim}` : "");

  let html = `<style>${keyframesCSS}</style>`;
  html += `<div id="${uid}" role="progressbar" aria-busy="true" aria-label="内容加载中" style="width:100%;height:100%;display:flex;flex-direction:column;gap:${gap}px;padding:${paddingY}px ${paddingX}px;background:${bgColor};box-sizing:border-box;overflow:hidden">`;

  // 卡片布局：头像 + 标题/副标题 + 正文行
  if (isCardLayout) {
    html += `<div style="display:flex;gap:${avatarGap}px;align-items:flex-start;flex-shrink:0">`;
    html += `<div aria-hidden="true" style="width:${avatarSize}px;height:${avatarSize}px;border-radius:50%;background:${baseColor};flex-shrink:0;${shapeShell(true)}${pulseCss(true)}">${shimmerEl(true)}</div>`;
    html += `<div style="flex:1;display:flex;flex-direction:column;gap:8px;padding-top:4px">`;
    html += `<div aria-hidden="true" style="width:50%;height:14px;border-radius:${borderRadius}px;background:${baseColor};${shapeShell(true)}${pulseCss(true)}">${shimmerEl(true)}</div>`;
    html += `<div aria-hidden="true" style="width:80%;height:12px;border-radius:${borderRadius}px;background:${baseColor};${shapeShell(true)}${pulseCss(true)}">${shimmerEl(true)}</div>`;
    html += `</div></div>`;
  }

  // 行数据
  rows.forEach((row) => {
    for (let ci = 0; ci < row.count; ci++) {
      const isCircle = row.type === "circle";
      const shapeRadius = isCircle ? "50%" : `${borderRadius}px`;
      const shapeWidth = isCircle ? `${row.height}px` : row.width;
      const shapeHeight = `${row.height}px`;
      html += `<div aria-hidden="true" style="width:${shapeWidth};height:${shapeHeight};border-radius:${shapeRadius};background:${baseColor};flex-shrink:0;${shapeShell(true)}${pulseCss(true)}">${shimmerEl(true)}</div>`;
    }
  });

  html += `</div>`;

  // ─── 运行时：数据感知自动隐藏（统一 bindVisibilityScript，取数规则同 dataLoaderScript） ───
  if (apiMode && bindUrl) {
    html += bindVisibilityScript({
      hostExpr: `var host = document.getElementById("${escapeHTML(uid)}");`,
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

  return html;
};