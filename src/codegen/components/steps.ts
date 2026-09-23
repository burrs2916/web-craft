import type { ComponentCodegenFn } from "../types";
import { escapeHTML } from "../layout";
import { dataLoaderScript } from "../dataLoader";
import { readAuthEnabled } from "../../editor/data/authMode";

interface StepItem {
  title: string;
  description: string;
}

const DEFAULT_STEPS: StepItem[] = [
  { title: "步骤一", description: "填写信息" },
  { title: "步骤二", description: "确认信息" },
  { title: "步骤三", description: "完成提交" },
];

function parseSteps(input: unknown): StepItem[] {
  if (Array.isArray(input) && input.length > 0) {
    return input.map((item, i) => ({
      title: String((item as Record<string, unknown>)?.title ?? `步骤 ${i + 1}`),
      description: String((item as Record<string, unknown>)?.description ?? (item as Record<string, unknown>)?.desc ?? ""),
    }));
  }
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((item: Record<string, unknown>, i: number) => ({
            title: String(item?.title ?? `步骤 ${i + 1}`),
            description: String(item?.description ?? item?.desc ?? ""),
          }));
        }
        if (Array.isArray(parsed) && parsed.length === 0) {
          return [{ title: "步骤 1", description: "" }];
        }
      } catch {
        // fall through
      }
    }
    const lines = trimmed.split("\n").map((s) => s.trim()).filter(Boolean);
    if (lines.length > 0) {
      return lines.map((title) => ({ title, description: "" }));
    }
  }
  return [...DEFAULT_STEPS];
}

/**
 * steps 组件 -> HTML
 * 配置：steps(JSON), current, direction, variant, showDescription, showLastConnector, gap,
 *       activeColor, completedColor, pendingColor, activeBgColor, completedBgColor,
 *       connectorColor, titleColor, titleFontSize, descColor, descFontSize, stepSize
 * 数据源：dataMode(static|api), staticData, apiUrl/apiPath, apiMethod, apiBody,
 *         apiHeaders, apiInterval, apiDataPath, authEnabled —— api 模式统一走
 *         dataLoaderScript 骨架取数；响应形态：数组 → 步骤列表 / 数字 → 当前索引 /
 *         对象 {steps, current} → 二者皆可
 */
export const stepsCodegen: ComponentCodegenFn = (component) => {
  const c = component.config;

  // ── 数据源配置 ──
  const dataMode = String(c.dataMode ?? "static");
  const isApi = dataMode === "api" && (String(c.apiUrl ?? "") || String(c.apiPath ?? ""));
  const hasExplicitStaticData = c.staticData != null && c.staticData !== "";

  // ── 解析静态步骤（staticData 优先） ──
  let steps: StepItem[];
  if (hasExplicitStaticData) {
    steps = parseSteps(c.staticData);
  } else {
    steps = parseSteps(c.steps);
  }

  const current = Number(c.current ?? 0);
  const direction = String(c.direction ?? "horizontal");
  const variant = String(c.variant ?? "dot");
  const showDescription = c.showDescription !== false;
  const showLastConnector = c.showLastConnector === true;
  const gap = Number(c.gap ?? 0);
  const activeColor = String(c.activeColor ?? "#FF9800");
  const completedColor = String(c.completedColor ?? "#4CAF50");
  const pendingColor = String(c.pendingColor ?? "rgba(255,255,255,0.25)");
  const activeBgColor = String(c.activeBgColor ?? "rgba(255,152,0,0.15)");
  const completedBgColor = String(c.completedBgColor ?? "rgba(76,175,80,0.15)");
  const connectorColor = String(c.connectorColor ?? "rgba(255,255,255,0.15)");
  const titleColor = String(c.titleColor ?? "rgba(255,255,255,0.85)");
  const titleFontSize = Number(c.titleFontSize ?? 14);
  const descColor = String(c.descColor ?? "rgba(255,255,255,0.45)");
  const descFontSize = Number(c.descFontSize ?? 12);
  const stepSize = Number(c.stepSize ?? 28);

  const isHorizontal = direction === "horizontal";
  const safeCurrent = Math.max(0, Math.min(current, steps.length - 1));

  const uid = `stp-${Math.random().toString(36).slice(2, 9)}`;

  // ── 编译期步骤渲染（与运行时 mount 脚本镜像） ──
  function buildStepHTML(step: StepItem, i: number, total: number, currentIdx: number): string {
    const state = i < currentIdx ? "completed" : i === currentIdx ? "active" : "pending";
    const color = state === "completed" ? completedColor : state === "active" ? activeColor : pendingColor;
    const bg = state === "completed" ? completedBgColor : state === "active" ? activeBgColor : "transparent";
    const isLast = i === total - 1;
    const needsRight = !isLast || (isLast && showLastConnector);
    const needsLeft = isHorizontal && i > 0;

    const circleStyle = [
      `width:${stepSize}px`,
      `height:${stepSize}px`,
      `border-radius:${variant === "square" ? "4px" : "50%"}`,
      "display:flex",
      "align-items:center",
      "justify-content:center",
      `background:${bg}`,
      `border:2px solid ${color}`,
      `color:${color}`,
      `font-size:${stepSize * 0.5}px`,
      "font-weight:600",
      "flex-shrink:0",
      "transition:all 0.3s ease",
      "box-sizing:border-box",
    ].join(";");

    const checkSVG = `<svg viewBox="0 0 24 24" fill="currentColor" style="width:${stepSize * 0.6}px;height:${stepSize * 0.6}px"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`;
    const circleContent = state === "completed" ? checkSVG : (variant === "number" ? String(i + 1) : "");

    // 水平：左右对称连接线让圆点与下方文字对齐；垂直：连接线向下拉伸继承框高
    const connectorColored = `background:${connectorColor}`;
    const leftLine = isHorizontal
      ? `flex:1;height:2px;min-width:0;background:${needsLeft ? connectorColor : "transparent"}`
      : "";
    const rightLine = isHorizontal
      ? `flex:1;height:2px;min-width:0;background:${needsRight ? connectorColor : "transparent"}`
      : "";
    // 垂直连接线带 min-height 兜底 + flex:1 拉伸，使框变高时线条随之增长
    const vConnector = !isHorizontal && needsRight
      ? `flex:1;width:2px;min-height:24px;${connectorColored}`
      : "";

    const stepFlex = isHorizontal
      ? "display:flex;flex-direction:column;align-items:center;flex:1;gap:8px;min-width:0;min-height:0"
      : `display:flex;flex-direction:row;align-items:flex-start;gap:8px;flex:${needsRight ? "1 1 0" : "0 0 auto"};min-width:0;min-height:0`;

    const indicatorStyle = isHorizontal
      ? "display:flex;flex-direction:row;align-items:center;width:100%"
      : "display:flex;flex-direction:column;align-items:center;height:100%";

    const textStyle = isHorizontal
      ? "display:flex;flex-direction:column;align-items:center;text-align:center;gap:2px;width:100%"
      : "display:flex;flex-direction:column;align-items:flex-start;text-align:left;gap:2px;margin-left:12px";

    const titleStyle = `color:${state === "pending" ? descColor : titleColor};font-size:${titleFontSize}px;font-weight:${state === "active" ? 600 : 400};line-height:1.4`;
    const descStyle = `color:${descColor};font-size:${descFontSize}px;line-height:1.3`;

    let html = `<div style="${stepFlex}">`;
    html += `<div style="${indicatorStyle}">`;
    if (leftLine) html += `<div style="${leftLine}"></div>`;
    html += `<div style="${circleStyle}">${circleContent}</div>`;
    if (rightLine) html += `<div style="${rightLine}"></div>`;
    if (vConnector) html += `<div style="${vConnector}"></div>`;
    html += `</div>`;
    html += `<div style="${textStyle}">`;
    html += `<span style="${titleStyle}">${escapeHTML(step.title)}</span>`;
    if (showDescription && step.description) {
      html += `<span style="${descStyle}">${escapeHTML(step.description)}</span>`;
    }
    html += `</div>`;
    html += `</div>`;
    return html;
  }

  let stepsHTML = "";
  // 接口模式：不渲染编译期本地步骤，等待接口数据驱动
  if (!isApi) {
    steps.forEach((step, i) => {
      stepsHTML += buildStepHTML(step, i, steps.length, safeCurrent);
    });
  }

  const outerStyle = [
    "width:100%",
    "height:100%",
    "overflow:auto",
    "padding:4px",
    "box-sizing:border-box",
  ].join(";");

  const innerStyle = [
    "display:flex",
    "height:100%",
    `flex-direction:${isHorizontal ? "row" : "column"}`,
    // 水平：步骤铺满整框；垂直：画像水平居中、上下由连接线填满
    `align-items:${isHorizontal ? "stretch" : "center"}`,
    // 垂直模式不插入行 gap：圆点间距由连接线承接，保证连线连续不断开；水平模式保留配置间距
    `gap:${isHorizontal ? gap : 0}px`,
    isHorizontal ? "width:100%" : "",
  ].filter(Boolean).join(";");

  // ── API 模式：mount 脚本（运行时重绘步骤/当前索引）+ dataLoaderScript 统一取数骨架 ──
  let apiScript = "";
  if (isApi) {
    const apiUrl = String(c.apiUrl ?? "");
    const apiPath = String(c.apiPath ?? "");
    const apiMethod = String(c.apiMethod ?? "GET");
    const apiInterval = Number(c.apiInterval ?? 0) || 0;
    const apiDataPath = String(c.apiDataPath ?? "");
    const apiHeaders = String(c.apiHeaders ?? "");
    const apiBody = String(c.apiBody ?? "");
    const authEnabled = readAuthEnabled(c.authEnabled);

    const mountScript = `<script>
(function(){
  var el = document.getElementById("${uid}-inner");
  if (!el) return;
  var steps = ${JSON.stringify(steps)};
  var current = ${safeCurrent};
  var isHorizontal = ${isHorizontal};
  var variant = ${JSON.stringify(variant)};
  var showDescription = ${showDescription};
  var showLastConnector = ${showLastConnector};
  var activeColor = ${JSON.stringify(activeColor)};
  var completedColor = ${JSON.stringify(completedColor)};
  var pendingColor = ${JSON.stringify(pendingColor)};
  var activeBgColor = ${JSON.stringify(activeBgColor)};
  var completedBgColor = ${JSON.stringify(completedBgColor)};
  var connectorColor = ${JSON.stringify(connectorColor)};
  var titleColor = ${JSON.stringify(titleColor)};
  var titleFontSize = ${titleFontSize};
  var descColor = ${JSON.stringify(descColor)};
  var descFontSize = ${descFontSize};
  var stepSize = ${stepSize};

  function esc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

  function parseSteps(data) {
    var arr = data;
    if (typeof data === "string") {
      arr = null;
      var t = data.trim();
      if (t.charAt(0) === "[") {
        try { arr = JSON.parse(t); } catch(e) { arr = null; }
      }
      if (arr == null) {
        arr = t.split("\\n").map(function(s){ return s.trim(); }).filter(Boolean);
      }
    }
    if (!Array.isArray(arr)) return [];
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var d = arr[i];
      if (d && typeof d === "object") {
        out.push({
          title: d.title != null ? String(d.title) : "步骤 " + (i + 1),
          description: d.description != null ? String(d.description) : (d.desc != null ? String(d.desc) : "")
        });
      } else if (d != null && typeof d !== "object") {
        out.push({ title: String(d), description: "" });
      }
    }
    return out;
  }

  function buildStepHTML(step, i, total, currentIdx) {
    var state = i < currentIdx ? "completed" : (i === currentIdx ? "active" : "pending");
    var color = state === "completed" ? completedColor : (state === "active" ? activeColor : pendingColor);
    var bg = state === "completed" ? completedBgColor : (state === "active" ? activeBgColor : "transparent");
    var isLast = i === total - 1;
    var needsRight = !isLast || (isLast && showLastConnector);
    var needsLeft = isHorizontal && i > 0;
    var circleStyle = ["width:" + stepSize + "px","height:" + stepSize + "px","border-radius:" + (variant === "square" ? "4px" : "50%"),"display:flex","align-items:center","justify-content:center","background:" + bg,"border:2px solid " + color,"color:" + color,"font-size:" + stepSize * 0.5 + "px","font-weight:600","flex-shrink:0","transition:all 0.3s ease","box-sizing:border-box"].join(";");
    var checkSVG = '<svg viewBox="0 0 24 24" fill="currentColor" style="width:' + stepSize * 0.6 + 'px;height:' + stepSize * 0.6 + 'px"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
    var circleContent = state === "completed" ? checkSVG : (variant === "number" ? String(i + 1) : "");
    var leftLine = isHorizontal ? "flex:1;height:2px;min-width:0;background:" + (needsLeft ? connectorColor : "transparent") : "";
    var rightLine = isHorizontal ? "flex:1;height:2px;min-width:0;background:" + (needsRight ? connectorColor : "transparent") : "";
    var vConnector = !isHorizontal && needsRight ? "flex:1;width:2px;min-height:24px;background:" + connectorColor : "";
    var stepFlex = isHorizontal ? "display:flex;flex-direction:column;align-items:center;flex:1;gap:8px;min-width:0;min-height:0" : "display:flex;flex-direction:row;align-items:flex-start;gap:8px;flex:" + (needsRight ? "1 1 0" : "0 0 auto") + ";min-width:0;min-height:0";
    var indicatorStyle = isHorizontal ? "display:flex;flex-direction:row;align-items:center;width:100%" : "display:flex;flex-direction:column;align-items:center;height:100%";
    var textStyle = isHorizontal ? "display:flex;flex-direction:column;align-items:center;text-align:center;gap:2px;width:100%" : "display:flex;flex-direction:column;align-items:flex-start;text-align:left;gap:2px;margin-left:12px";
    var titleStyle = "color:" + (state === "pending" ? descColor : titleColor) + ";font-size:" + titleFontSize + "px;font-weight:" + (state === "active" ? 600 : 400) + ";line-height:1.4";
    var descStyle = "color:" + descColor + ";font-size:" + descFontSize + "px;line-height:1.3";
    var html = '<div style="' + stepFlex + '">';
    html += '<div style="' + indicatorStyle + '">';
    if (leftLine) html += '<div style="' + leftLine + '"></div>';
    html += '<div style="' + circleStyle + '">' + circleContent + '</div>';
    if (rightLine) html += '<div style="' + rightLine + '"></div>';
    if (vConnector) html += '<div style="' + vConnector + '"></div>';
    html += '</div>';
    html += '<div style="' + textStyle + '">';
    html += '<span style="' + titleStyle + '">' + esc(step.title || "") + '</span>';
    if (showDescription && step.description) {
      html += '<span style="' + descStyle + '">' + esc(step.description) + '</span>';
    }
    html += '</div>';
    html += '</div>';
    return html;
  }

  function render(){
    var safeCurrent = Math.max(0, Math.min(current, steps.length - 1));
    var html = "";
    for (var i = 0; i < steps.length; i++) {
      html += buildStepHTML(steps[i], i, steps.length, safeCurrent);
    }
    el.innerHTML = html;
  }

  // 响应形态（与编辑器 StepsRenderer 对齐）：数组/JSON 字符串 → 步骤列表；
  // 数字 → 当前索引；对象 {steps|items|list, current} → 二者皆可
  function mount(data){
    if (data == null) return;
    if (Array.isArray(data) || typeof data === "string") {
      var parsed = parseSteps(data);
      if (parsed.length > 0) steps = parsed;
    } else if (typeof data === "number" && isFinite(data)) {
      current = data;
    } else if (data && typeof data === "object") {
      var rawList = Array.isArray(data.steps) ? data.steps
        : (Array.isArray(data.items) ? data.items
        : (Array.isArray(data.list) ? data.list : null));
      if (rawList && rawList.length > 0) steps = parseSteps(rawList);
      if (data.current != null && isFinite(Number(data.current))) current = Number(data.current);
    }
    render();
  }

  window["__wcStp_${uid}"] = mount;
})();
</script>`;

    const loader = dataLoaderScript({
      container: `var el = document.getElementById("${uid}-inner");`,
      apiUrl,
      apiPath,
      apiMethod,
      apiHeaders,
      apiBody,
      apiInterval,
      apiDataPath,
      authEnabled,
      renderBody: `if (window["__wcStp_${uid}"]) window["__wcStp_${uid}"](data);`,
    });

    apiScript = mountScript + loader;
  }

  return `<div style="${outerStyle}"><div id="${uid}-inner" style="${innerStyle}">${stepsHTML}</div></div>${apiScript}`;
};
