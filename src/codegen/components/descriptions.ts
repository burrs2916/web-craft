import type { ComponentCodegenFn } from "../types";
import { escapeHTML } from "../layout";
import { dataLoaderScript } from "../dataLoader";
import {
  padDescriptionItems,
  resolveDescriptionItems,
  type DescriptionItem,
} from "../../editor/data/tableData";
import { resolveDescriptionsStyle } from "../../editor/data/tableStyle";
import { readAuthEnabled } from "../../editor/data/authMode";

/**
 * descriptions 描述列表组件 → HTML（与编辑区 DescriptionsRenderer 结构同构）
 *
 * 修掉的既有缺陷：水平布局的网格模板与编辑区不一致（编辑区 `repeat(N, 100/N%)`、
 * 发布端 `repeat(N, 1fr 2fr)`）→ 同一份配置两端记录条数排布不同。现两端统一为
 * `repeat(N, <标签列> minmax(0,2fr))`。
 * 数据解析（默认项 / JSON / 每行「标签: 值」/ 接口归一）与样式口径全部来自 data 层。
 */
export const descriptionsCodegen: ComponentCodegenFn = (component) => {
  const c = component.config;
  const s = resolveDescriptionsStyle(c);
  const title = String(c.title ?? "");

  const dataMode = String(c.dataMode ?? "static");
  const isApi = dataMode === "api" && (String(c.apiUrl ?? "") || String(c.apiPath ?? ""));
  const items = isApi ? [] : resolveDescriptionItems({ config: c });

  const uid = `desc-${Math.random().toString(36).slice(2, 9)}`;
  const labelTrack = s.labelWidth > 0 ? `${s.labelWidth}px` : "minmax(0,1fr)";
  const gridTemplateColumns = `repeat(${s.columns}, ${labelTrack} minmax(0,2fr))`;
  const cellBorder = s.borderEnabled ? `1px solid ${s.borderColor}` : "none";

  const titleHtml = title
    ? `<div style="font-size:${s.titleFontSize}px;font-weight:600;color:${s.titleColor};margin-bottom:8px;padding:0 4px;">${escapeHTML(title)}</div>`
    : "";

  const outerStyle = "width:100%;height:100%;display:flex;flex-direction:column;overflow:auto;";

  /* ── 垂直布局：标签在上，值在下 ── */
  const verticalHTML = (list: DescriptionItem[]): string => {
    const cells = list
      .map((item) => {
        const flexW = `calc(${100 / s.columns}% - ${(s.gap * (s.columns - 1)) / s.columns}px)`;
        return `<div style="flex:0 0 ${flexW};min-width:0;">`
          + `<div style="padding:4px 8px;background-color:${s.labelBg};color:${s.labelColor};font-size:${s.fontSize}px;font-weight:${s.labelFontWeight};text-align:${s.labelAlign};`
          + (s.borderEnabled ? `border:1px solid ${s.borderColor};` : "")
          + `border-radius:${s.radius}px ${s.radius}px 0 0;">${escapeHTML(item.label)}</div>`
          + `<div style="padding:4px 8px;color:${s.valueColor};font-size:${s.fontSize}px;text-align:${s.valueAlign};`
          + (s.borderEnabled ? `border:1px solid ${s.borderColor};border-top:none;` : "")
          + `border-radius:0 0 ${s.radius}px ${s.radius}px;">${escapeHTML(item.value || "—")}</div>`
          + `</div>`;
      })
      .join("");
    return `<div style="display:flex;flex-wrap:wrap;gap:${s.gap}px;">${cells}</div>`;
  };

  /* ── 水平布局：标签列 + 值列交替（与编辑区同一网格模板） ── */
  const horizontalHTML = (list: DescriptionItem[]): string => {
    const padded = padDescriptionItems(list, s.columns);
    const cells = padded
      .map((item, i) => {
        const isLabelCol = i % 2 === 0;
        const rowIndex = Math.floor(i / (s.columns * 2));
        const striped = s.striped && rowIndex % 2 === 1;
        const bg = isLabelCol ? s.labelBg : striped ? "rgba(255,255,255,0.03)" : "transparent";
        const right = i % (s.columns * 2) < s.columns * 2 - 1 ? cellBorder : "none";
        return `<div style="padding:6px 10px;font-size:${s.fontSize}px;background-color:${bg};`
          + `color:${isLabelCol ? s.labelColor : s.valueColor};font-weight:${isLabelCol ? s.labelFontWeight : 400};`
          + `text-align:${isLabelCol ? s.labelAlign : s.valueAlign};border-bottom:${cellBorder};border-right:${right};`
          + `overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">`
          + `${escapeHTML(isLabelCol ? item.label : item.value || "—")}</div>`;
      })
      .join("");
    return `<div style="display:grid;grid-template-columns:${gridTemplateColumns};`
      + (s.borderEnabled ? `border:1px solid ${s.borderColor};` : "")
      + `border-radius:${s.radius}px;overflow:hidden;">${cells}</div>`;
  };

  const buildBody = (list: DescriptionItem[]) =>
    s.layout === "vertical" ? verticalHTML(list) : horizontalHTML(list);

  /* ── 静态模式：服务端渲染 ── */
  if (!isApi) {
    return `<div style="${outerStyle}">${titleHtml}${buildBody(items)}</div>`;
  }

  /* ── 接口模式：运行时归一 + 重渲染 ── */
  const bodyId = `${uid}-body`;
  const renderBody = `
var COLS = ${s.columns};
var LAYOUT = ${JSON.stringify(s.layout)};
var BORDER = ${s.borderEnabled};
var BORDER_COLOR = ${JSON.stringify(s.borderColor)};
var LABEL_BG = ${JSON.stringify(s.labelBg)};
var LABEL_COLOR = ${JSON.stringify(s.labelColor)};
var LABEL_WEIGHT = ${s.labelFontWeight};
var VALUE_COLOR = ${JSON.stringify(s.valueColor)};
var FONT = ${s.fontSize};
var RADIUS = ${s.radius};
var GAP = ${s.gap};
var STRIPED = ${s.striped};
var LABEL_TRACK = ${JSON.stringify(labelTrack)};
var LABEL_ALIGN = ${JSON.stringify(s.labelAlign)};
var VALUE_ALIGN = ${JSON.stringify(s.valueAlign)};
var CELL_BORDER = BORDER ? ('1px solid ' + BORDER_COLOR) : 'none';

function collect(data){
  var out = [];
  if (Array.isArray(data)) {
    for (var i = 0; i < data.length; i++) {
      var it = data[i];
      if (!it || typeof it !== 'object') continue;
      var lb = it.label != null ? it.label : (it.name != null ? it.name : (it.key != null ? it.key : ''));
      var vl = it.value != null ? it.value : (it.text != null ? it.text : '');
      out.push({ label: String(lb), value: String(vl) });
    }
  } else if (data && typeof data === 'object') {
    Object.keys(data).forEach(function(k){
      if (!k.trim()) return;
      var v = data[k];
      if (typeof v === 'object' && v !== null) return;
      out.push({ label: k, value: v == null ? '' : String(v) });
    });
  }
  return out;
}
function pad(list){
  var out = list.slice();
  while (out.length % COLS !== 0) out.push({ label: '', value: '' });
  return out;
}
function render(items){
  var html = '';
  if (LAYOUT === 'vertical') {
    var cells = items.map(function(it){
      var w = 'calc(' + (100 / COLS) + '% - ' + (GAP * (COLS - 1) / COLS) + 'px)';
      return '<div style="flex:0 0 ' + w + ';min-width:0;">'
        + '<div style="padding:4px 8px;background-color:' + LABEL_BG + ';color:' + LABEL_COLOR + ';font-size:' + FONT + 'px;font-weight:' + LABEL_WEIGHT + ';text-align:' + LABEL_ALIGN + ';' + (BORDER ? ('border:1px solid ' + BORDER_COLOR + ';') : '') + 'border-radius:' + RADIUS + 'px ' + RADIUS + 'px 0 0;">' + escapeHtml(it.label) + '</div>'
        + '<div style="padding:4px 8px;color:' + VALUE_COLOR + ';font-size:' + FONT + 'px;text-align:' + VALUE_ALIGN + ';' + (BORDER ? ('border:1px solid ' + BORDER_COLOR + ';border-top:none;') : '') + 'border-radius:0 0 ' + RADIUS + 'px ' + RADIUS + 'px;">' + escapeHtml(it.value || '—') + '</div>'
        + '</div>';
    }).join('');
    html = '<div style="display:flex;flex-wrap:wrap;gap:' + GAP + 'px;">' + cells + '</div>';
  } else {
    var padded = pad(items);
    var total = COLS * 2;
    var cells2 = padded.map(function(it, i){
      var isLabel = i % 2 === 0;
      var rowIndex = Math.floor(i / total);
      var striped = STRIPED && (rowIndex % 2 === 1);
      var bg = isLabel ? LABEL_BG : (striped ? 'rgba(255,255,255,0.03)' : 'transparent');
      var right = (i % total) < total - 1 ? CELL_BORDER : 'none';
      return '<div style="padding:6px 10px;font-size:' + FONT + 'px;background-color:' + bg + ';color:' + (isLabel ? LABEL_COLOR : VALUE_COLOR) + ';font-weight:' + (isLabel ? LABEL_WEIGHT : 400) + ';text-align:' + (isLabel ? LABEL_ALIGN : VALUE_ALIGN) + ';border-bottom:' + CELL_BORDER + ';border-right:' + right + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(isLabel ? it.label : (it.value || '—')) + '</div>';
    }).join('');
    html = '<div style="display:grid;grid-template-columns:repeat(' + COLS + ', ' + LABEL_TRACK + ' minmax(0,2fr));' + (BORDER ? ('border:1px solid ' + BORDER_COLOR + ';') : '') + 'border-radius:' + RADIUS + 'px;overflow:hidden;">' + cells2 + '</div>';
  }
  el.innerHTML = html;
}
render(collect(data));
`;

  const loader = dataLoaderScript({
    container: `var el = document.getElementById("${bodyId}");`,
    apiUrl: String(c.apiUrl ?? ""),
    apiPath: String(c.apiPath ?? ""),
    apiMethod: String(c.apiMethod ?? "GET"),
    apiHeaders: String(c.apiHeaders ?? ""),
    apiBody: String(c.apiBody ?? ""),
    apiInterval: Number(c.apiInterval ?? 0),
    apiDataPath: String(c.apiDataPath ?? ""),
    authEnabled: readAuthEnabled(c.authEnabled),
    renderBody,
  });

  return `<div style="${outerStyle}">${titleHtml}<div id="${bodyId}" style="width:100%;min-height:1px;"></div></div>${loader}`;
};
