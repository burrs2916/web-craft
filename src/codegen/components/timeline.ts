import type { ComponentCodegenFn } from "../types";
import { escapeHTML } from "../layout";
import { dataLoaderScript } from "../dataLoader";
import { readAuthEnabled } from "../../editor/data/authMode";

interface TimelineItem {
  title: string;
  content: string;
  timestamp: string;
  color: string;
}

const DEFAULT_ITEMS: TimelineItem[] = [
  { title: "事件一", content: "这是事件一的内容描述。", timestamp: "2024-01-01", color: "" },
  { title: "事件二", content: "这是事件二的内容描述。", timestamp: "2024-03-15", color: "" },
  { title: "事件三", content: "这是事件三的内容描述。", timestamp: "2024-06-30", color: "" },
];

function parseItems(input: unknown): TimelineItem[] {
  if (Array.isArray(input) && input.length > 0) {
    return input.map((item, i) => ({
      title: String((item as Record<string, unknown>)?.title ?? (item as Record<string, unknown>)?.label ?? `事件 ${i + 1}`),
      content: String((item as Record<string, unknown>)?.content ?? (item as Record<string, unknown>)?.desc ?? ""),
      timestamp: String((item as Record<string, unknown>)?.timestamp ?? (item as Record<string, unknown>)?.time ?? (item as Record<string, unknown>)?.date ?? ""),
      color: String((item as Record<string, unknown>)?.color ?? ""),
    }));
  }
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((item: Record<string, unknown>, i: number) => ({
            title: String(item?.title ?? item?.label ?? `事件 ${i + 1}`),
            content: String(item?.content ?? item?.desc ?? ""),
            timestamp: String(item?.timestamp ?? item?.time ?? item?.date ?? ""),
            color: String(item?.color ?? ""),
          }));
        }
        if (Array.isArray(parsed) && parsed.length === 0) {
          return [{ title: "事件 1", content: "", timestamp: "", color: "" }];
        }
      } catch {
        // fall through
      }
    }
    const lines = trimmed.split("\n").map((s) => s.trim()).filter(Boolean);
    if (lines.length > 0) {
      return lines.map((title) => ({ title, content: "", timestamp: "", color: "" }));
    }
  }
  return [...DEFAULT_ITEMS];
}

/**
 * timeline 组件 -> HTML
 * 配置：items(JSON), mode(left/right/alternate), dotSize, lineColor, dotColor,
 *       titleColor, titleFontSize, contentColor, contentFontSize,
 *       timestampColor, timestampFontSize, itemGap, paddingX
 * 数据源：dataMode(static|api), staticData, apiUrl/apiPath, apiMethod, apiBody,
 *         apiHeaders, apiInterval, apiDataPath, authEnabled —— api 模式统一走
 *         dataLoaderScript 骨架取数；响应形态：数组/JSON 字符串 → 时间线条目 /
 *         对象 {items|list|data|timeline} → 解包
 */
export const timelineCodegen: ComponentCodegenFn = (component) => {
  const c = component.config;

  const dataMode = String(c.dataMode ?? "static");
  const isApi = dataMode === "api" && (String(c.apiUrl ?? "") || String(c.apiPath ?? ""));
  const hasExplicitStaticData = c.staticData != null && c.staticData !== "";

  let items: TimelineItem[];
  if (hasExplicitStaticData) {
    items = parseItems(c.staticData);
  } else {
    items = parseItems(c.items);
  }

  const mode = String(c.mode ?? "left");
  const dotSize = Number(c.dotSize ?? 12);
  const lineColor = String(c.lineColor ?? "rgba(255,255,255,0.15)");
  const dotColor = String(c.dotColor ?? "#FF9800");
  const titleColor = String(c.titleColor ?? "rgba(255,255,255,0.85)");
  const titleFontSize = Number(c.titleFontSize ?? 14);
  const contentColor = String(c.contentColor ?? "rgba(255,255,255,0.6)");
  const contentFontSize = Number(c.contentFontSize ?? 13);
  const timestampColor = String(c.timestampColor ?? "rgba(255,255,255,0.35)");
  const timestampFontSize = Number(c.timestampFontSize ?? 12);
  const itemGap = Number(c.itemGap ?? 20);
  const paddingX = Number(c.paddingX ?? 16);
  const paddingY = 4;

  const isRight = mode === "right";
  const isAlternate = mode === "alternate";

  const uid = `tl-${Math.random().toString(36).slice(2, 9)}`;

  // ── 编译期条目渲染（与运行时 mount 脚本镜像） ──
  function buildItemHTML(item: TimelineItem, i: number, total: number): string {
    const itemDotColor = item.color || dotColor;
    const isLeftSide = isAlternate ? i % 2 === 0 : !isRight;
    const showLine = i < total - 1;

    const rowDir = isRight ? "row-reverse" : "row";
    const justify = isAlternate
      ? (isLeftSide ? "justify-content:flex-start" : "justify-content:flex-end")
      : "justify-content:center";
    const contentAlign = isAlternate && isLeftSide ? "text-align:right;align-items:flex-end" : "";

    const dotStyle = [
      `width:${dotSize}px`,
      `height:${dotSize}px`,
      "border-radius:50%",
      `background:${itemDotColor}`,
      `border:2px solid ${itemDotColor}`,
      "flex-shrink:0",
      "z-index:2",
      "box-sizing:border-box",
    ].join(";");

    // 连接线紧贴圆点底并 flex:1 无缝延伸；行间距由内容列 paddingBottom 提供 → 连线不断开
    const lineStyle = showLine
      ? `width:2px;flex:1 1 0;min-height:12px;background:${lineColor}`
      : "";

    const contentStyle = [
      isAlternate ? "flex:1" : "flex:0 0 62%",
      "min-width:0",
      "display:flex",
      "flex-direction:column",
      "gap:4px",
      showLine ? `padding-bottom:${itemGap}px` : "",
      contentAlign,
    ].filter(Boolean).join(";");

    let contentInner = "";
    if (item.timestamp) {
      contentInner += `<span style="color:${timestampColor};font-size:${timestampFontSize}px;line-height:1.3">${escapeHTML(item.timestamp)}</span>`;
    }
    if (item.title) {
      contentInner += `<span style="color:${titleColor};font-size:${titleFontSize}px;font-weight:600;line-height:1.4">${escapeHTML(item.title)}</span>`;
    }
    if (item.content) {
      contentInner += `<span style="color:${contentColor};font-size:${contentFontSize}px;line-height:1.5">${escapeHTML(item.content)}</span>`;
    }

    const rowStyle = [
      showLine ? "flex:1 1 0" : "flex:0 0 auto",
      "min-width:0",
      "display:flex",
      `flex-direction:${rowDir}`,
      "align-items:stretch",
      "gap:12px",
      justify,
    ].filter(Boolean).join(";");

    const dotColStyle = [
      "display:flex",
      "flex-direction:column",
      "align-items:center",
      "flex-shrink:0",
      `min-width:${dotSize}px`,
    ].join(";");

    return `<div style="${rowStyle}"><div style="${dotColStyle}"><div style="${dotStyle}"></div>${lineStyle ? `<div style="${lineStyle}"></div>` : ""}</div><div style="${contentStyle}">${contentInner}</div></div>`;
  }

  let itemsHTML = "";
  // 接口模式：不渲染编译期本地时间线条目，等待接口数据驱动
  if (!isApi) {
    items.forEach((item, i) => {
      itemsHTML += buildItemHTML(item, i, items.length);
    });
  }

  // 外层负责滚动；内层 min-height:100% + 垂直居中——内容少→对称留白(便于拖动定位)，内容多→从顶可滚
  const outerStyle = [
    "width:100%",
    "height:100%",
    "overflow-y:auto",
    "box-sizing:border-box",
  ].join(";");

  const innerStyle = [
    "min-height:100%",
    "width:100%",
    "display:flex",
    "flex-direction:column",
    `padding:${paddingY}px ${paddingX}px`,
    "box-sizing:border-box",
  ].join(";");

  // ── API 模式：mount 脚本（运行时重绘条目）+ dataLoaderScript 统一取数骨架 ──
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
  var dotSize = ${dotSize};
  var dotColor = ${JSON.stringify(dotColor)};
  var lineColor = ${JSON.stringify(lineColor)};
  var titleColor = ${JSON.stringify(titleColor)};
  var titleFontSize = ${titleFontSize};
  var contentColor = ${JSON.stringify(contentColor)};
  var contentFontSize = ${contentFontSize};
  var timestampColor = ${JSON.stringify(timestampColor)};
  var timestampFontSize = ${timestampFontSize};
  var itemGap = ${itemGap};
  var mode = ${JSON.stringify(mode)};

  function esc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

  function parseItems(data) {
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
          title: d.title != null ? String(d.title) : (d.label != null ? String(d.label) : "事件 " + (i + 1)),
          content: d.content != null ? String(d.content) : (d.desc != null ? String(d.desc) : ""),
          timestamp: d.timestamp != null ? String(d.timestamp) : (d.time != null ? String(d.time) : (d.date != null ? String(d.date) : "")),
          color: d.color != null ? String(d.color) : ""
        });
      } else if (d != null && typeof d !== "object") {
        out.push({ title: String(d), content: "", timestamp: "", color: "" });
      }
    }
    return out;
  }

  function buildItemHTML(item, i, total) {
    var itemDotColor = item.color || dotColor;
    var isLeftSide = mode === "alternate" ? i % 2 === 0 : mode !== "right";
    var showLine = i < total - 1;
    var rowDir = mode === "right" ? "row-reverse" : "row";
    var justify = mode === "alternate" ? (isLeftSide ? "justify-content:flex-start" : "justify-content:flex-end") : "justify-content:center";
    var contentAlign = mode === "alternate" && isLeftSide ? "text-align:right;align-items:flex-end" : "";
    var dotStyle = ["width:" + dotSize + "px","height:" + dotSize + "px","border-radius:50%","background:" + itemDotColor,"border:2px solid " + itemDotColor,"flex-shrink:0","z-index:2","box-sizing:border-box"].join(";");
    var lineStyle = showLine ? "width:2px;flex:1 1 0;min-height:12px;background:" + lineColor : "";
    var contentStyle = [(mode === "alternate" ? "flex:1" : "flex:0 0 62%"),"min-width:0","display:flex","flex-direction:column","gap:4px", showLine ? "padding-bottom:" + itemGap + "px" : "", contentAlign].filter(Boolean).join(";");
    var contentInner = "";
    if (item.timestamp) contentInner += '<span style="color:' + timestampColor + ';font-size:' + timestampFontSize + 'px;line-height:1.3">' + esc(item.timestamp) + '</span>';
    if (item.title) contentInner += '<span style="color:' + titleColor + ';font-size:' + titleFontSize + 'px;font-weight:600;line-height:1.4">' + esc(item.title) + '</span>';
    if (item.content) contentInner += '<span style="color:' + contentColor + ';font-size:' + contentFontSize + 'px;line-height:1.5">' + esc(item.content) + '</span>';
    var rowStyle = [showLine ? "flex:1 1 0" : "flex:0 0 auto","min-width:0","display:flex","flex-direction:" + rowDir,"align-items:stretch","gap:12px", justify].filter(Boolean).join(";");
    var dotColStyle = ["display:flex","flex-direction:column","align-items:center","flex-shrink:0","min-width:" + dotSize + "px"].join(";");
    return '<div style="' + rowStyle + '"><div style="' + dotColStyle + '"><div style="' + dotStyle + '"></div>' + (lineStyle ? '<div style="' + lineStyle + '"></div>' : '') + '</div><div style="' + contentStyle + '">' + contentInner + '</div></div>';
  }

  function render(){
    var html = "";
    for (var i = 0; i < items.length; i++) {
      html += buildItemHTML(items[i], i, items.length);
    }
    el.innerHTML = html;
  }

  // 响应形态（与编辑器 TimelineRenderer 对齐）：数组/JSON 字符串 → 条目列表；
  // 对象 {items|list|data|timeline} → 解包，或兜底取首个数组字段
  function mount(data){
    if (data == null) return;
    var newItems = [];
    if (Array.isArray(data) || typeof data === "string") {
      newItems = parseItems(data);
    } else if (data && typeof data === "object") {
      var raw = Array.isArray(data.items) ? data.items
        : (Array.isArray(data.list) ? data.list
        : (Array.isArray(data.data) ? data.data
        : (Array.isArray(data.timeline) ? data.timeline : null)));
      if (raw == null) {
        if (typeof data.data === "string") raw = data.data;
        if (raw == null) {
          for (var k in data) { if (Array.isArray(data[k]) && data[k].length > 0) { raw = data[k]; break; } }
        }
      }
      if (raw != null) newItems = parseItems(raw);
    }
    if (newItems.length > 0) {
      items = newItems;
      render();
    }
  }

  var items = ${JSON.stringify(items)};
  window["__wcTl_${uid}"] = mount;
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
      renderBody: `if (window["__wcTl_${uid}"]) window["__wcTl_${uid}"](data);`,
    });

    apiScript = mountScript + loader;
  }

  return `<div style="${outerStyle}"><div id="${uid}-inner" style="${innerStyle}">${itemsHTML}</div></div>${apiScript}`;
};