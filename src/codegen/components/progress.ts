import type { ComponentCodegenFn } from "../types";
import type { SceneComponent } from "../../types/editor";
import { progressCircleFit } from "../../editor/data/scaleFit";
import { scaleSkeleton, scaleSkeletonScript } from "../shared/scaleSkeleton";
import { dataLoaderScript } from "../dataLoader";
import { readAuthEnabled } from "../../editor/data/authMode";
import { coerceProgressNumber } from "../../editor/data/progressData";

/**
 * progress 进度条组件 -> HTML
 * 配置：value, max, shape, size, color, trackColor, gradientEnabled, gradientTo,
 *       showLabel, labelPosition, striped, animated, status, strokeLinecap, strokeWidth,
 *       height, circleSize
 */
export const progressCodegen: ComponentCodegenFn = (component) => {
  const c = component.config;
  const uid = "prg-" + Math.random().toString(36).slice(2, 9);

  const value = Number(c.value ?? 60);
  const max = Number(c.max ?? 100);
  const shape = String(c.shape ?? "line");
  const size = String(c.size ?? "medium");
  const color = String(c.color ?? "#2196F3");
  const trackColor = String(c.trackColor ?? "rgba(255,255,255,0.08)");
  const labelColor = String(c.labelColor ?? "");
  const gradientEnabled = c.gradientEnabled === true;
  const gradientTo = String(c.gradientTo ?? "#64B5F6");
  const showLabel = c.showLabel !== false;
  const labelPosition = String(c.labelPosition ?? "right");
  const striped = c.striped === true;
  const animated = c.animated === true;
  const status = String(c.status ?? "normal");
  const strokeLinecap = String(c.strokeLinecap ?? "round");
  const strokeWidth = Number(c.strokeWidth ?? 6);
  const heightOverride = Number(c.height ?? 0);
  const circleSize = Number(c.circleSize ?? 80);

  // staticData 显式存在时优先（全局静态数据源驱动，metric 同款）；口径收敛见 progressData.ts
  const hasExplicitStaticData = c.staticData != null && c.staticData !== "";
  const staticNum = hasExplicitStaticData ? coerceProgressNumber(c.staticData) : null;

  // ── 动态数据（与 metric 指标卡同一套键；全局源绑定由引擎层 withEffectiveConfig 覆盖 config，无需自理）──
  // loader 的其余取数参数（apiMethod/apiInterval/apiHeaders/apiBody/authEnabled）由 progressDataJs
  // 从 effective config 读取，这里只留分支判定需要的键。
  const dataMode = String(c.dataMode ?? "static");
  const field = String(c.field ?? "");
  const apiUrl = String(c.apiUrl ?? "");
  const apiPath = String(c.apiPath ?? "");
  const isApi = dataMode === "api" && (apiUrl !== "" || apiPath !== "");
  // uid 类钩子（-fill/-ring/-label）只在动态模式挂载：static 产物与历史逐字节一致
  const needsDataHooks = isApi || Boolean(field);
  const cls = (name: string) => (needsDataHooks ? `class="${uid}-${name}" ` : "");

  const statusColors: Record<string, string> = {
    success: "#4CAF50",
    warning: "#FF9800",
    error: "#F44336",
  };
  const activeColor = status !== "normal" ? (statusColors[status] ?? color) : color;
  const fillBg = gradientEnabled ? `linear-gradient(90deg, ${activeColor}, ${gradientTo})` : activeColor;

  const percent = Math.round(((staticNum ?? value) / max) * 100);

  const sizeMap: Record<string, { height: number; fs: number }> = {
    small: { height: 6, fs: 10 },
    medium: { height: 10, fs: 12 },
    large: { height: 14, fs: 14 },
  };
  const dims = sizeMap[size] ?? sizeMap.medium;
  const barHeight = heightOverride || dims.height;

  // 圆形进度条：缩放骨架 + 缩放脚本（与编辑区 fitFactor(progressCircleFit) 同源）
  if (shape === "circle") {
    const radius = (circleSize - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percent / 100) * circumference;
    const strokeColor = fillBg.startsWith("linear-gradient") ? activeColor : fillBg;
    const cap = strokeLinecap === "round" ? "round" : "butt";
    const spec = progressCircleFit(circleSize);

    const svg = `<svg width="${circleSize}" height="${circleSize}" style="transform:rotate(-90deg)">
      <circle cx="${circleSize/2}" cy="${circleSize/2}" r="${radius}" fill="none" stroke="${trackColor}" stroke-width="${strokeWidth}"/>
      <circle ${cls("ring")}cx="${circleSize/2}" cy="${circleSize/2}" r="${radius}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linecap="${cap}" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" style="transition:stroke-dashoffset 0.3s ease${animated ? `;animation:${uid}-grow 0.8s ease-out` : ""}"/>
    </svg>`;
    const labelHTML = showLabel
      ? `<span ${cls("label")}style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:${dims.fs}px;font-weight:600;color:${labelColor || "rgba(255,255,255,0.7)"}">${percent}%</span>`
      : "";
    const control = `<div style="position:relative;width:${circleSize}px;height:${circleSize}px;display:flex;align-items:center;justify-content:center">${svg}${labelHTML}</div>`;
    const innerStyle = `width:${circleSize}px;height:${circleSize}px`;

    // 生长动画的 keyframes 依赖本圆的周长（from=空环），必须用 uid 作用域避免同名互踩
    const growCss = animated ? `<style>@keyframes ${uid}-grow{from{stroke-dashoffset:${circumference}}}</style>` : "";
    return scaleSkeleton({ uid, control, spec, align: "center", vAlign: "center", innerStyle, scaleFit: true })
      + scaleSkeletonScript(uid, spec, true)
      + growCss
      + progressDataJs({ component, uid, isApi, field, max, circumference });
  }

  // 线性进度条
  let labelHTML = "";
  if (showLabel && labelPosition === "right") {
    labelHTML = `<span ${cls("label")}style="font-size:${dims.fs}px;color:${labelColor || "rgba(255,255,255,0.6)"};white-space:nowrap;min-width:32px">${percent}%</span>`;
  }

  const stripedStyle = striped
    ? `background-image:repeating-linear-gradient(45deg,rgba(255,255,255,0.15) 0,rgba(255,255,255,0.15) ${barHeight/2}px,transparent ${barHeight/2}px,transparent ${barHeight}px);background-size:${barHeight*2}px ${barHeight*2}px`
    : "";
  // 入场生长动画（animated 开关；编辑区预览模式的 RAF 增长是同一语义的发布端对等物）：
  // keyframes 只写 from{width:0}，to 用元素内联 width（keyframes 缺省端 = 计算样式）
  const fillAnims: string[] = [];
  if (animated) fillAnims.push("progress-grow 0.8s ease-out");
  if (striped && animated) fillAnims.push("progress-stripes 1s linear infinite");
  const fillAnimStyle = fillAnims.length ? `;animation:${fillAnims.join(",")}` : "";

  const insideLabel = (showLabel && labelPosition === "inside" && percent > 10)
    ? `<span ${cls("label")}style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:${dims.fs}px;color:${labelColor || "#fff"};white-space:nowrap">${percent}%</span>`
    : "";

  return `<div ${needsDataHooks ? `id="${uid}" ` : ""}style="width:100%;height:100%;display:flex;align-items:center;gap:8px;position:relative">
    <div style="flex:1;position:relative">
      <div style="width:100%;height:${barHeight}px;background:${trackColor};border-radius:${barHeight/2}px;overflow:hidden;position:relative">
        <div ${cls("fill")}style="width:${percent}%;height:100%;background:${fillBg};border-radius:${barHeight/2}px;transition:width 0.3s ease;position:relative;overflow:hidden;${stripedStyle}${fillAnimStyle}"></div>
      </div>
      ${insideLabel}
    </div>
    ${labelHTML}
  </div>
  <style>@keyframes progress-stripes{from{background-position:0 0}to{background-position:${barHeight*2}px 0}}${animated ? "@keyframes progress-grow{from{width:0}}" : ""}</style>`
  + progressDataJs({ component, uid, isApi, field, max, circumference: 0 });
};

/**
 * 动态数据运行时（与 metric 指标卡同一结构：update 回调 + data-update 监听 + dataLoaderScript 骨架）。
 *
 * 语义要点：
 *  - 数据值 Number 化失败（空/非数字）时**保持现状不闪 0** —— 进度条没有 "--" 语义；
 *  - 数值 clamp 到 [0, max] 后换算 percent，更新 fill 宽度（线）/ dashoffset（圆）/ 标签文字；
 *  - 数据只改几何比例、不改尺寸，transform 缩放骨架无需重新适配；
 *  - field 绑定监听 data-update 事件（数据引擎对 data-component-id 包装层派发）。
 */
function progressDataJs(o: {
  component: SceneComponent;
  uid: string;
  isApi: boolean;
  field: string;
  max: number;
  circumference: number;
}): string {
  if (!o.isApi && !o.field) return "";

  const js = `<script>
(function(){
  var el = document.querySelector('[data-component-id=${JSON.stringify(o.component.id)}]') || document.getElementById("${o.uid}") || document.querySelector('.${o.uid}-st');
  if (!el) return;
  var max = ${Number(o.max) || 100};
  var fill = el.querySelector(".${o.uid}-fill");
  var ring = el.querySelector(".${o.uid}-ring");
  var label = el.querySelector(".${o.uid}-label");
  var circ = ${o.circumference};
  // coerceNum 是 editor/data/progressData.ts#coerceProgressNumber 的手工镜像（运行时无法 import TS），两侧必须同步
  function coerceNum(v) {
    if (v == null) return null;
    if (typeof v === "object") { return coerceNum(v.value != null ? v.value : (v.percent != null ? v.percent : v.current)); }
    var n = typeof v === "number" ? v : parseFloat(v);
    return isNaN(n) ? null : n;
  }
  function update(v) {
    var n = coerceNum(v);
    if (n === null) return;
    if (n < 0) n = 0;
    if (n > max) n = max;
    var pct = Math.round(n / max * 100);
    if (fill) fill.style.width = pct + "%";
    if (ring) ring.setAttribute("stroke-dashoffset", String(circ - circ * pct / 100));
    if (label) label.textContent = pct + "%";
  }
  ${o.field ? `el.addEventListener("data-update", function(e) {
    var d = e.detail || {};
    var val = d[${JSON.stringify(o.field)}] !== undefined ? d[${JSON.stringify(o.field)}] : d.value;
    if (val !== undefined) update(val);
  });` : ""}
  window["__wcPrg_${o.uid}"] = update;
})();
</script>`;

  if (!o.isApi) return js;

  const loader = dataLoaderScript({
    container: `var el = document.querySelector('[data-component-id=${JSON.stringify(o.component.id)}]') || document.getElementById("${o.uid}") || document.querySelector('.${o.uid}-st');`,
    apiUrl: String(o.component.config.apiUrl ?? ""),
    apiPath: String(o.component.config.apiPath ?? ""),
    apiMethod: String(o.component.config.apiMethod ?? "GET"),
    apiHeaders: String(o.component.config.apiHeaders ?? ""),
    apiBody: String(o.component.config.apiBody ?? ""),
    apiInterval: Number(o.component.config.apiInterval ?? 0) || 0,
    apiDataPath: String(o.component.config.apiDataPath ?? ""),
    authEnabled: readAuthEnabled(o.component.config.authEnabled),
    renderBody: `if (window["__wcPrg_${o.uid}"]) window["__wcPrg_${o.uid}"](data);`,
  });

  return js + loader;
}
