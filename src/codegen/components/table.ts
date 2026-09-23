import type { ComponentCodegenFn } from "../types";
import { escapeHTML } from "../layout";
import { dataLoaderScript } from "../dataLoader";
import { resolveTableData } from "../../editor/data/tableData";
import { resolveTableStyle, tableColumnCount, cssText, type CssDecls } from "../../editor/data/tableStyle";
import { readAuthEnabled } from "../../editor/data/authMode";

/**
 * table 组件 → HTML（与编辑区 TableRenderer 结构同构）
 *
 * 数据解析与样式口径全部来自 `editor/data/tableData.ts` / `tableStyle.ts`，
 * 本文件**不写任何默认值字面量**（唯一的例外是接口模式下运行时重建表格的骨架代码，
 * 它消费的也是同一份解析结果）。
 *
 * 交互铁律：行悬浮高亮由 `.tbl-<uid> tbody tr:hover td` 类规则承载，
 * **不能写成 inline style**（inline 恒胜过样式表，会把悬浮态永久压死）。
 */
export const tableCodegen: ComponentCodegenFn = (component) => {
  const c = component.config;

  const dataMode = String(c.dataMode ?? "static");
  const isApi = dataMode === "api" && (String(c.apiUrl ?? "") || String(c.apiPath ?? ""));
  const s = resolveTableStyle(c);

  // 接口模式：编译期不渲染占位行（等接口数据到达），仅静态模式走编译期数据
  const { headers, rows } = resolveTableData({ config: c, isApi: false });
  const staticHeaders = isApi ? [] : headers;
  const staticRows = isApi ? [] : rows;

  const colCount = isApi ? 0 : tableColumnCount({ headers: staticHeaders, rows: staticRows });
  const uid = `tbl-${Math.random().toString(36).slice(2, 9)}`;

  const stickyInline = s.stickyHeader ? "position:sticky;top:0;z-index:1;" : "";
  const thStyle = cssText(s.th) + (stickyInline ? `;${stickyInline}` : "");
  const emptyTdStyle = cssText(s.emptyTd);

  /* ── 样式规则（含行悬浮 —— 状态属性只能由类规则承载） ── */
  const hoverRule = s.hoverBg
    ? `.${uid} tbody tr:hover td{background-color:${s.hoverBg};}`
    : "";

  let headerHTML = "";
  if (!isApi && s.showHeader) {
    const cells: string[] = staticHeaders.map(
      (h) => `<th style="${thStyle}">${escapeHTML(h)}</th>`,
    );
    for (let i = staticHeaders.length; i < colCount; i++) {
      cells.push(`<th style="${thStyle}"></th>`);
    }
    headerHTML = `<thead><tr>${cells.join("")}</tr></thead>`;
  } else if (!isApi) {
    headerHTML = "";
  }

  let bodyHTML = "";
  if (!isApi) {
    if (colCount === 0) {
      bodyHTML = `<tbody><tr><td style="${emptyTdStyle};height:100%">${escapeHTML(s.emptyText)}</td></tr></tbody>`;
    } else if (staticRows.length === 0) {
      bodyHTML = `<tbody><tr><td colspan="${colCount}" style="${emptyTdStyle}">${escapeHTML(s.emptyText)}</td></tr></tbody>`;
    } else {
      bodyHTML = `<tbody>${staticRows
        .map((row, ri) => {
          const tdStyle = cssText(s.td(ri));
          const tds = Array.from({ length: colCount })
            .map((_, ci) => `<td style="${tdStyle}">${escapeHTML(row[ci] ?? "")}</td>`)
            .join("");
          return `<tr>${tds}</tr>`;
        })
        .join("")}</tbody>`;
    }
  }

  const tableHTML = isApi
    ? `<table style="width:100%;border-collapse:collapse"><thead id="${uid}-head"></thead><tbody id="${uid}-body"></tbody></table>`
    : colCount === 0 && !s.showHeader
      ? `<table style="width:100%;border-collapse:collapse">${bodyHTML}</table>`
      : `<table style="width:100%;border-collapse:collapse">${headerHTML}${bodyHTML}</table>`;

  const styleTag = hoverRule ? `<style>${hoverRule}</style>` : "";
  const outer = `<div class="${uid}" style="${cssText(s.outer)}">${tableHTML}</div>`;

  if (!isApi) return `${styleTag}${outer}`;

  /* ── 接口模式：运行时重建（同一份解析与样式口径的 JS 化） ── */
  const thDecls: CssDecls = { ...s.th, ...(s.stickyHeader ? { position: "sticky", top: "0", zIndex: "1" } : {}) };
  const mountScript = `<script>
(function(){
  var head = document.getElementById("${uid}-head");
  var body = document.getElementById("${uid}-body");
  if (!body) return;
  var TH_STYLE = ${JSON.stringify(cssText(thDecls))};
  var EMPTY_TD_STYLE = ${JSON.stringify(emptyTdStyle)};
  var SHOW_HEADER = ${s.showHeader};
  var STRIPE = ${s.stripeEnabled};
  var STRIPE_COLOR = ${JSON.stringify(s.stripeColor)};
  var ROW_HEIGHT = ${s.rowHeight};
  var ROW_COLOR = ${JSON.stringify(s.rowColor)};
  var ROW_FONT = ${s.rowFontSize};
  var BORDER = ${JSON.stringify(s.borderCss)};
  var PAD = ${JSON.stringify(`${s.padY}px ${s.padX}px`)};
  var ALIGN = ${JSON.stringify(s.align)};
  var EMPTY_TEXT = ${JSON.stringify(s.emptyText)};
  var COLS = 0;

  function escapeHtml(s) {
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }
  function tdStyle(ri){
    var css = "color:" + ROW_COLOR + ";font-size:" + ROW_FONT + "px;height:" + ROW_HEIGHT + "px;border:" + (BORDER || "none") + ";padding:" + PAD + ";text-align:" + ALIGN + ";white-space:nowrap;";
    if (STRIPE && ri % 2 === 1) css += "background-color:" + STRIPE_COLOR + ";";
    return css;
  }
  function renderEmpty(){
    if (body) body.innerHTML = '<tr><td colspan="' + (COLS || 1) + '" style="' + EMPTY_TD_STYLE + '">' + escapeHtml(EMPTY_TEXT) + '</td></tr>';
  }
  window["__wcTbl_${uid}"] = function(data) {
    var model = data && data.__picked !== undefined ? data.__picked : data;
    var headers = [];
    var rows = [];
    if (Array.isArray(model) && model.length > 0) {
      var first = model[0];
      if (first && typeof first === "object" && !Array.isArray(first)) {
        headers = Object.keys(first);
        rows = model.map(function(item){ return headers.map(function(k){ return String(item && item[k] != null ? item[k] : ""); }); });
      } else if (Array.isArray(first)) {
        rows = model.map(function(r){ return Array.isArray(r) ? r.map(String) : [String(r)]; });
      }
    } else if (model && typeof model === "object") {
      if (Array.isArray(model.columns) && Array.isArray(model.rows)) {
        headers = model.columns.map(String);
        rows = model.rows.map(function(r){ return Array.isArray(r) ? r.map(String) : [String(r)]; });
      } else {
        var es = Object.keys(model);
        headers = ["字段","值"];
        rows = es.map(function(k){ var v = model[k]; return [k, v == null ? "" : String(v)]; });
      }
    }
    COLS = headers.length || (rows[0] ? rows[0].length : 0);
    if (head && SHOW_HEADER) {
      var ths = headers.map(function(h){ return '<th style="' + TH_STYLE + '">' + escapeHtml(h) + '</th>'; }).join("");
      for (var k = headers.length; k < COLS; k++) ths += '<th style="' + TH_STYLE + '"></th>';
      head.innerHTML = '<tr>' + ths + '</tr>';
    }
    if (!rows.length || !COLS) { renderEmpty(); return; }
    var html = "";
    for (var ri = 0; ri < rows.length; ri++) {
      var row = rows[ri];
      var tds = "";
      for (var ci = 0; ci < COLS; ci++) {
        tds += '<td style="' + tdStyle(ri) + '">' + escapeHtml(row[ci] != null ? row[ci] : "") + '</td>';
      }
      html += '<tr>' + tds + '</tr>';
    }
    body.innerHTML = html;
  };
  renderEmpty();
})();
</script>`;

  const loader = dataLoaderScript({
    container: `var el = document.getElementById("${uid}-body");`,
    apiUrl: String(c.apiUrl ?? ""),
    apiPath: String(c.apiPath ?? ""),
    apiMethod: String(c.apiMethod ?? "GET"),
    apiHeaders: String(c.apiHeaders ?? ""),
    apiBody: String(c.apiBody ?? ""),
    apiInterval: Number(c.apiInterval ?? 0),
    apiDataPath: String(c.apiDataPath ?? ""),
    authEnabled: readAuthEnabled(c.authEnabled),
    renderBody: `if (window["__wcTbl_${uid}"]) window["__wcTbl_${uid}"](data);`,
  });

  return `${styleTag}${outer}${mountScript}${loader}`;
};
