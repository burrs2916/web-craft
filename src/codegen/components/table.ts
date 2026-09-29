import type { ComponentCodegenFn } from "../types";
import { escapeHTML } from "../layout";
import { dataLoaderScript } from "../dataLoader";
import {
  resolveTableData,
  getColumnDefs,
  parseColumnDefs,
  parseTableDataModel,
  mergeColumnDefs,
  readVirtualScroll,
  readColumnResize,
  VIRTUAL_OVERSCAN,
  computeVirtualRange,
  formatCellDisplay,
  tableModelToCSV,
  applyFrozenColumns,
  renderRowDetail,
  renderCellHtml,
  tableRowSearchText,
  isCellEditable,
  initialEditValue,
  parseCellEditValue,
  tableCellWriteBack,
  attachTableCellEditing,
  type ColumnDef,
  type TableRow,
} from "../../editor/data/tableData";
import { resolveTableStyle, cssText, type CssDecls } from "../../editor/data/tableStyle";
import { readAuthEnabled } from "../../editor/data/authMode";

/**
 * table 组件 → HTML（与编辑区 TableRenderer 结构同构）
 *
 * 新版支持 ColumnDef 列定义模型：
 *   - 按 field 从对象数组取值
 *   - 列宽/对齐/格式化按列差异化
 *   - 多态单元格渲染（boolean 圆点 / status 徽章 / link 外链 / image 缩略图）
 *   - 兼容旧版 headers + rows 降级
 *
 * 数据解析与样式口径全部来自 `editor/data/tableData.ts` / `tableStyle.ts`，
 * 本文件**不写任何默认值字面量**。
 *
 * 交互铁律：行悬浮高亮由 `.tbl-<uid> tbody tr:hover td` 类规则承载，
 * **不能写成 inline style**（inline 恒胜过样式表，会把悬浮态永久压死）。
 */

function escapeJs(s: string): string {
  return JSON.stringify(s);
}

/**
 * URL 协议白名单的展示态判定已收口到 tableData.renderCellHtml 内部的 safeUrl
 *（编译期与运行时同源）。此前运行时 renderCell 手写的 safeHref/safeSrc 引用
 * 实为未定义标识符（link/image 列在接口模式下渲染会抛 ReferenceError），随收口一并消除。
 */

/**
 * 发布端分页运行时算法（与数据层 buildPaginationModel / normalizePaginationTotal /
 * paginateTableRows 一一同构）：页码窗口、总数归一、页夹紧、切片。
 * 不含反引号与 ${ 字面量，可安全内嵌到外层模板字符串。
 */
const PAGINATION_RUNTIME_JS = `
  var PAGE_SIZE_OPTIONS = [10,20,50,100];
  function normalizeTotal(v){
    if (v == null) return null;
    if (Array.isArray(v)) return v.length;
    if (typeof v === "number" && isFinite(v)) return Math.max(0, Math.floor(v));
    if (typeof v === "object") {
      var keys = ["total","totalCount","totalElements","count"];
      for (var i=0;i<keys.length;i++){ var x = v[keys[i]]; if (typeof x === "number" && isFinite(x)) return Math.max(0, Math.floor(x)); }
    }
    return null;
  }
  function clampPage(p, totalPages){ return Math.min(totalPages, Math.max(1, Math.floor(p) || 1)); }
  function pageItemsOf(current, totalPages, maxButtons){
    maxButtons = Math.min(9, Math.max(3, Math.floor(maxButtons) || 5));
    var items = [];
    if (totalPages <= maxButtons) { for (var i=1;i<=totalPages;i++) items.push(i); return items; }
    var half = Math.floor(maxButtons / 2);
    var start = Math.max(1, current - half);
    var end = Math.min(totalPages, start + maxButtons - 1);
    if (end - start < maxButtons - 1) start = Math.max(1, end - maxButtons + 1);
    if (start > 1) { items.push(1); if (start > 2) items.push("ellipsis"); }
    for (var j=start;j<=end;j++) items.push(j);
    if (end < totalPages) { if (end < totalPages - 1) items.push("ellipsis"); items.push(totalPages); }
    return items;
  }
  function buildPagerHtml(opts){
    var current = opts.current, total = opts.total, totalPages = opts.totalPages, pageSize = opts.pageSize;
    var showSize = opts.showPageSize !== false, showJump = opts.showQuickJumper === true;
    var btn = function(label, extra){
      return '<button' + (extra || '') + ' style="min-width:26px;height:26px;font-size:12px;color:rgba(255,255,255,0.75);background-color:transparent;border:1px solid rgba(255,255,255,0.12);border-radius:4px;cursor:pointer">' + label + '</button>';
    };
    var h = '<span style="font-size:12px;color:rgba(255,255,255,0.4);margin-right:4px">共 ' + total + ' 条</span>';
    if (showSize) {
      h += '<select data-pg-size style="height:26px;font-size:12px;color:rgba(255,255,255,0.75);background-color:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.12);border-radius:4px;outline:none">';
      for (var oi=0; oi<PAGE_SIZE_OPTIONS.length; oi++) {
        h += '<option value="' + PAGE_SIZE_OPTIONS[oi] + '"' + (PAGE_SIZE_OPTIONS[oi]===pageSize?" selected":"") + '>' + PAGE_SIZE_OPTIONS[oi] + ' 条/页</option>';
      }
      h += '</select>';
    }
    h += btn('&lsaquo;', current<=1?' disabled':' data-pg="prev"');
    var items = pageItemsOf(current, totalPages, 5);
    for (var i=0;i<items.length;i++) {
      if (items[i] === "ellipsis") { h += '<span style="font-size:12px;color:rgba(255,255,255,0.4);padding:0 4px">&hellip;</span>'; continue; }
      var act = items[i] === current;
      h += '<button data-pg="' + items[i] + '" style="min-width:26px;height:26px;font-size:12px;color:' + (act?"#fff":"rgba(255,255,255,0.75)") + ';background-color:' + (act?"#2196F3":"transparent") + ';border:1px solid ' + (act?"#2196F3":"rgba(255,255,255,0.12)") + ';border-radius:4px;cursor:pointer">' + items[i] + '</button>';
    }
    h += btn('&rsaquo;', current>=totalPages?' disabled':' data-pg="next"');
    if (showJump) {
      h += '<input data-pg-jump type="number" min="1" max="' + totalPages + '" placeholder="页" style="width:44px;height:26px;font-size:12px;color:rgba(255,255,255,0.75);background-color:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.12);border-radius:4px;outline:none;text-align:center" />';
    }
    return h;
  }
  function bindPager(pagerEl, state, refresh){
    pagerEl.addEventListener("click", function(e){
      var t = e.target;
      if (!t || !t.getAttribute) return;
      var pg = t.getAttribute("data-pg");
      if (!pg) return;
      if (pg === "prev") state.page = clampPage(state.page - 1, state.totalPages);
      else if (pg === "next") state.page = clampPage(state.page + 1, state.totalPages);
      else state.page = clampPage(Number(pg), state.totalPages);
      refresh();
    });
    pagerEl.addEventListener("change", function(e){
      var t = e.target;
      if (t && t.getAttribute && t.getAttribute("data-pg-size")) {
        state.pageSize = Math.max(1, Number(t.value) || 10);
        state.page = 1;
        refresh();
      }
    });
    pagerEl.addEventListener("keydown", function(e){
      if (e.key !== "Enter") return;
      var t = e.target;
      if (t && t.getAttribute && t.getAttribute("data-pg-jump")) {
        var v = Math.floor(Number(t.value));
        if (v >= 1) { state.page = clampPage(v, state.totalPages); refresh(); }
      }
    });
  }
`;

/**
 * 单元格编辑运行时（多维第一档）：编辑口径函数全部内联自 tableData.ts（两端同源）。
 * renderCellHtml 依赖 formatCellDisplay、attachTableCellEditing 依赖
 * isCellEditable/initialEditValue/parseCellEditValue —— 内联点须先声明这些标识符
 * （同 computeVirtualRange 引用 VIRTUAL_OVERSCAN 的既有范式）。
 */
const EDIT_RUNTIME_JS = `
  var isCellEditable = ${isCellEditable.toString()};
  var initialEditValue = ${initialEditValue.toString()};
  var parseCellEditValue = ${parseCellEditValue.toString()};
  var tableRowSearchText = ${tableRowSearchText.toString()};
  var tableCellWriteBack = ${tableCellWriteBack.toString()};
  var attachTableCellEditing = ${attachTableCellEditing.toString()};`;

export const tableCodegen: ComponentCodegenFn = (component) => {
  const c = component.config;

  const dataMode = String(c.dataMode ?? "static");
  const isApi = dataMode === "api" && (String(c.apiUrl ?? "") || String(c.apiPath ?? ""));
  const s = resolveTableStyle(c);

  // 编译期解析列定义（静态模式优先用面板配置；接口模式等运行时重建）
  const staticModel = resolveTableData({ config: c, isApi: false });
  const staticColumns = getColumnDefs(staticModel);
  const staticColCount = staticColumns.length;

  // 面板列定义（与编辑端 resolveTableData 的 API 分支同口径：优先 tableData，其次 columnDefs）。
  // 接口模式下发布端必须把它合并进 API 派生列，否则编辑器预览（已合并）与发布后（未合并）漂移。
  let panelColumns: ColumnDef[] = [];
  if (c.tableData != null) {
    const unified = parseTableDataModel(c.tableData);
    if (unified) panelColumns = unified.columns;
  }
  if (panelColumns.length === 0) panelColumns = parseColumnDefs(c.columnDefs);

  // P4 虚拟滚动 / 列宽拖拽：口径与编辑端唯一（tableData.ts）
  const vs = readVirtualScroll(c);
  const resizableColumns = readColumnResize(c);
  // 虚拟滚动与分页互斥（与编辑端同口径）
  const virtualStatic = !isApi && vs.enabled && staticColCount > 0;
  // 行展开详情（P2-2）：与虚拟滚动互斥（详情行破坏等高窗口 spacer 数学，与分页同口径）
  const showRowExpand = c.showRowExpand === true && !vs.enabled;
  const detailField = String(c.detailField ?? "detail").trim() || "detail";

  // 单元格编辑（多维第一档）：editEnabled 开启后双击可编辑类型单元格进入编辑态。
  // 写回配置：url 留空 = 仅本地修改；method 限 PUT/POST/PATCH；idField 为行主键字段。
  const editEnabled = c.editEnabled === true;
  const editApiUrl = String(c.editApiUrl ?? "").trim();
  const editApiMethodRaw = String(c.editApiMethod ?? "PUT").toUpperCase();
  const editApiMethod = ["PUT", "POST", "PATCH"].indexOf(editApiMethodRaw) >= 0 ? editApiMethodRaw : "PUT";
  const editIdField = String(c.editIdField ?? "id").trim() || "id";
  const editAuth = readAuthEnabled(c.authEnabled);
  const editAuthLiteral = editAuth === null ? "null" : String(editAuth);

  const uid = `tbl-${Math.random().toString(36).slice(2, 9)}`;

  const stickyInline = s.stickyHeader ? "position:sticky;top:0;z-index:1;" : "";
  const thStyle = cssText(s.th) + (stickyInline ? `;${stickyInline}` : "");
  const emptyTdStyle = cssText(s.emptyTd);

  /* ── 样式规则（含行悬浮 —— 状态属性只能由类规则承载） ── */
  const hoverRule = s.hoverBg
    ? `.${uid} tbody tr:hover td{background-color:${s.hoverBg};}`
    : "";

  const showRowSelection = c.showRowSelection === true;
  // 空态/详情行的总列跨度（数据列 + 行选择列 + 展开列）
  const spanAll = staticColCount + (showRowSelection ? 1 : 0) + (showRowExpand ? 1 : 0);
  // 行选中高亮由类规则承载（同悬停纪律：状态属性不得写 inline）
  const rowSelectedRule = showRowSelection
    ? `.${uid} tbody tr.${uid}-row-selected td{background-color:rgba(33,150,243,0.10);}`
    : "";
  const selCheckStyle = "width:14px;height:14px;cursor:pointer;vertical-align:middle";
  const selHeaderCell = showRowSelection
    ? `<th style="${thStyle}width:36px;text-align:center"><input type="checkbox" data-sel-all style="${selCheckStyle}" /></th>`
    : "";
  // 展开列表头（无 data-col-index：非数据列，冻结/列宽拖拽自动跳过）
  const expandHeaderCell = showRowExpand
    ? `<th style="${thStyle}width:36px;text-align:center"></th>`
    : "";
  // 行首列复选框（仅在有列定义的新版模型下渲染，与编辑端同构）
  const selRowCell = (ri: number) =>
    showRowSelection
      ? `<td style="${cssText(s.td(ri))}width:36px;text-align:center"><input type="checkbox" data-sel-row="${ri}" style="${selCheckStyle}" /></td>`
      : "";

  // 构造行的搜索文本（与 filterTableRows 的匹配口径一致的纯文本表示：boolean→是/否，其余 String 原值）
  // 口径收口到 tableData.tableRowSearchText（编辑脚本提交后同步 data-search-text 也用同一份）
  function buildRowSearchText(row: TableRow, columns: ColumnDef[]): string {
    return tableRowSearchText(row, columns);
  }

  // 静态模式下的表头 HTML（如果有列定义）
  function buildHeaderHTML(columns: ColumnDef[]): string {
    if (!s.showHeader || columns.length === 0) return "";
    const cells = columns.map((col, ci) => {
      const colSt = s.columnStyles(ci);
      const extra = colSt.width ? `width:${colSt.width};` : "";
      const alignExtra = colSt.align ? `text-align:${colSt.align};` : "";
      const relativeExtra = resizableColumns ? "position:relative;" : "";
      const resizer = resizableColumns
        ? `<span data-col-resizer="${ci}" style="position:absolute;top:0;right:-4px;width:8px;height:100%;cursor:col-resize;z-index:2" title="拖拽调整列宽"></span>`
        : "";
      return `<th data-col-index="${ci}" style="${thStyle}${relativeExtra}${extra}${alignExtra}">${escapeHTML(col.header || col.field)}${resizer}</th>`;
    });
    return `<thead><tr>${selHeaderCell}${expandHeaderCell}${cells.join("")}</tr></thead>`;
  }

  // 静态模式下的数据行 HTML（按列定义提取值）
  function buildBodyHTML(columns: ColumnDef[], data: TableRow[], rows?: string[][]): string {
    if (columns.length === 0 && (!rows || rows.length === 0)) {
      return `<tbody><tr><td style="${emptyTdStyle};height:100%">${escapeHTML(s.emptyText)}</td></tr></tbody>`;
    }
    if (columns.length === 0) {
      // 旧版降级：无列定义但有 rows
      return `<tbody>${(rows ?? []).map((row, ri) => {
        const tdStyle = cssText(s.td(ri));
        const tds = row.map((cell, ci) => `<td data-col-index="${ci}" style="${tdStyle}">${escapeHTML(cell)}</td>`).join("");
        const searchText = escapeHTML(row.join(" ").toLowerCase());
        return `<tr data-search-text="${searchText}" data-row-index="${ri}">${tds}</tr>`;
      }).join("")}</tbody>`;
    }
    if (data.length === 0 && (!rows || rows.length === 0)) {
      const colSpan = columns.length + (showRowSelection ? 1 : 0) + (showRowExpand ? 1 : 0);
      return `<tbody><tr><td colspan="${colSpan}" style="${emptyTdStyle}">${escapeHTML(s.emptyText)}</td></tr></tbody>`;
    }
    // 优先使用对象数组 data
    if (data.length > 0) {
      // 详情行单元格样式：不固定行高（内容自适应）、保留边框与内边距
      const detailTdStyle = `border:${s.borderCss || "none"};padding:${s.padY}px ${s.padX}px;text-align:left;white-space:pre-wrap;`;
      const expandBtnStyle = "width:22px;height:22px;padding:0;font-size:12px;line-height:1;color:rgba(255,255,255,0.65);background-color:transparent;border:1px solid rgba(255,255,255,0.12);border-radius:4px;cursor:pointer";
      return `<tbody>${data.map((row, ri) => {
        const tds = columns.map((col, ci) => {
          const colSt = s.columnStyles(ci);
          const baseStyle = s.td(ri);
          let extra = "";
          if (colSt.align) extra += `text-align:${colSt.align};`;
          if (colSt.width) extra += `width:${colSt.width};`;
          if (colSt.minWidth) extra += `min-width:${colSt.minWidth};`;
          if (colSt.fontSize) extra += `font-size:${colSt.fontSize}px;`;
          if (colSt.color) extra += `color:${colSt.color};`;
          if (colSt.padY !== undefined || colSt.padX !== undefined) {
            extra += `padding:${colSt.padY ?? s.padY}px ${colSt.padX ?? s.padX}px;`;
          }
          const cellContent = renderCellCodegen(row, col);
          return `<td data-col-index="${ci}" style="${cssText(baseStyle)}${extra}">${cellContent}</td>`;
        }).join("");
        const searchText = escapeHTML(buildRowSearchText(row, columns));
        // 展开列：详情内容非空才渲染箭头（renderRowDetail 口径两端同源）
        const detail = showRowExpand ? renderRowDetail(row[detailField]) : "";
        const expandCell = showRowExpand
          ? `<td style="${cssText(s.td(ri))}width:36px;text-align:center">${detail ? `<button type="button" data-expand="${ri}" style="${expandBtnStyle}">▸</button>` : ""}</td>`
          : "";
        const detailRow = detail
          ? `<tr data-detail-row="${ri}" class="${uid}-detail-hidden"><td colspan="${spanAll}" style="${detailTdStyle}">${escapeHTML(detail)}</td></tr>`
          : "";
        return `<tr data-search-text="${searchText}" data-row-index="${ri}">${selRowCell(ri)}${expandCell}${tds}</tr>${detailRow}`;
      }).join("")}</tbody>`;
    }
    // 降级旧版 rows
    return `<tbody>${(rows ?? []).map((row, ri) => {
      const tdStyle = cssText(s.td(ri));
      const tds = row.map((cell, ci) => `<td data-col-index="${ci}" style="${tdStyle}">${escapeHTML(cell)}</td>`).join("");
      const searchText = escapeHTML(row.join(" ").toLowerCase());
      return `<tr data-search-text="${searchText}" data-row-index="${ri}">${selRowCell(ri)}${tds}</tr>`;
    }).join("")}</tbody>`;
  }

  // 多态单元格渲染（发布端用 HTML 字符串）：口径收口到 tableData.renderCellHtml ——
  // 与编辑区/运行时/编辑脚本共用同一份实现（此前编译期与运行时各手写一份，属双份字面量）
  function renderCellCodegen(row: TableRow, col: ColumnDef): string {
    return renderCellHtml(row, col);
  }

  const staticHeaderHTML = !isApi ? buildHeaderHTML(staticColumns) : "";
  const staticBodyHTML = !isApi ? buildBodyHTML(staticColumns, staticModel.data ?? [], staticModel.rows) : "";

  // 虚拟滚动：容器布局（table/thead/tbody 块级流 + tbody 滚动区）随骨架内联，
  // 避免运行时书写 .style.display（状态切换仍全部走类规则）
  const virtualTableHTML = vs.enabled
    ? `<table style="width:100%;border-collapse:collapse;display:block"><thead id="${uid}-head" style="display:block"></thead><tbody id="${uid}-body" style="display:block;max-height:${vs.viewportHeight}px;overflow-y:auto;overscroll-behavior:contain"></tbody></table>`
    : "";
  const tableHTML = (isApi || virtualStatic)
    ? (virtualTableHTML || `<table style="width:100%;border-collapse:collapse"><thead id="${uid}-head"></thead><tbody id="${uid}-body"></tbody></table>`)
    : `<table style="width:100%;border-collapse:collapse">${staticHeaderHTML}${staticBodyHTML}</table>`;

  const showSearch = c.showSearch === true;
  const showExportCsv = c.exportCsv === true;
  // 冻结列（P2）：冻结前 N 列（按可见列序号），横向滚动时常驻左侧
  const frozenCount = Math.max(0, Math.min(50, Math.floor(Number(c.frozenColumns) || 0)));

  // 编译期搜索框 HTML（静态/接口模式共用，与编辑端 TableRenderer 同构）
  const searchHTML = showSearch
    ? `<div style="padding:4px 8px;border-bottom:1px solid rgba(255,255,255,0.08)"><input type="text" id="${uid}-search" placeholder="${escapeHTML(String(c.searchPlaceholder ?? "搜索…"))}" style="width:100%;height:28px;padding:0 12px;font-size:${s.rowFontSize}px;color:${s.rowColor};background-color:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:4px;outline:none;" /></div>`
    : "";

  // 导出 CSV 工具栏（与编辑端 TableRenderer 同构）：仅当开启 exportCsv 时渲染，
  // 放置在表格上方、搜索框下方。有搜索框时搜索框已带下边框，这里不再重复。
  const csvToolbarHTML = showExportCsv
    ? `<div style="display:flex;align-items:center;justify-content:flex-end;padding:4px 8px${showSearch ? "" : ";border-bottom:1px solid rgba(255,255,255,0.08)"}"><button type="button" id="${uid}-export" style="height:28px;padding:0 12px;font-size:12px;color:rgba(255,255,255,0.85);background-color:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:4px;cursor:pointer">导出 CSV</button></div>`
    : "";

  // 虚拟滚动开启时忽略分页（与编辑端 readVirtualScroll 互斥口径一致）
  const showPagination = c.showPagination === true && !vs.enabled;
  const staticPageSize = Math.max(1, Math.floor(Number(c.pageSize) || 10));
  const showPageSizeOptions = c.showPageSizeOptions !== false;
  const showQuickJumper = c.showQuickJumper === true;

  // 静态模式交互脚本：搜索过滤 + 分页（按 data-search-text / data-row-index 控制行显隐，
  // 与编辑端"原始 → 排序 → 过滤 → 分页"口径一致：先按搜索过滤，再对匹配行切片）
  const staticSearchScript = showSearch && !showPagination && !virtualStatic
    ? `<script>
(function(){
  var rows = document.querySelectorAll('.${uid} tbody tr[data-search-text]');
  if (!rows.length) return;
  var input = document.getElementById("${uid}-search");
  if (!input) return;
  input.addEventListener("input", function(){
    var k = input.value.trim().toLowerCase();
    for (var i = 0; i < rows.length; i++) {
      var txt = rows[i].getAttribute("data-search-text") || "";
      rows[i].classList.toggle("${uid}-row-hidden", k && txt.indexOf(k) < 0);
    }
  });
})();
</script>`
    : "";

  const staticPagerScript = showPagination
    ? `<script>
(function(){
${PAGINATION_RUNTIME_JS}
  var rows = Array.prototype.slice.call(document.querySelectorAll('.${uid} tbody tr[data-row-index]'));
  var pagerEl = document.getElementById("${uid}-pager");
  var searchInput = ${showSearch} ? document.getElementById("${uid}-search") : null;
  var page = 1;
  var pageSize = ${staticPageSize};
  if (!pagerEl || !rows.length) return;
  function pagerHtml(total, totalPages, current){
    var items = pageItemsOf(current, totalPages, 5);
    var h = "";
    h += '<span style="font-size:12px;color:rgba(255,255,255,0.4);margin-right:4px">共 ' + total + ' 条</span>';
    if (${showPageSizeOptions}) {
      h += '<select data-pg-size style="height:26px;font-size:12px;color:rgba(255,255,255,0.75);background-color:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.12);border-radius:4px;outline:none">';
      for (var oi=0; oi<PAGE_SIZE_OPTIONS.length; oi++) {
        h += '<option value="' + PAGE_SIZE_OPTIONS[oi] + '"' + (PAGE_SIZE_OPTIONS[oi]===pageSize?" selected":"") + '>' + PAGE_SIZE_OPTIONS[oi] + ' 条/页</option>';
      }
      h += '</select>';
    }
    h += '<button data-pg="prev"' + (current<=1?' disabled':'') + ' style="min-width:26px;height:26px;font-size:12px;color:rgba(255,255,255,0.75);background-color:transparent;border:1px solid rgba(255,255,255,0.12);border-radius:4px;cursor:pointer">&lsaquo;</button>';
    for (var i=0;i<items.length;i++) {
      if (items[i] === "ellipsis") { h += '<span style="font-size:12px;color:rgba(255,255,255,0.4);padding:0 4px">&hellip;</span>'; continue; }
      var act = items[i] === current;
      h += '<button data-pg="' + items[i] + '" style="min-width:26px;height:26px;font-size:12px;color:' + (act?"#fff":"rgba(255,255,255,0.75)") + ';background-color:' + (act?"#2196F3":"transparent") + ';border:1px solid ' + (act?"#2196F3":"rgba(255,255,255,0.12)") + ';border-radius:4px;cursor:pointer">' + items[i] + '</button>';
    }
    h += '<button data-pg="next"' + (current>=totalPages?' disabled':'') + ' style="min-width:26px;height:26px;font-size:12px;color:rgba(255,255,255,0.75);background-color:transparent;border:1px solid rgba(255,255,255,0.12);border-radius:4px;cursor:pointer">&rsaquo;</button>';
    if (${showQuickJumper}) {
      h += '<input data-pg-jump type="number" min="1" max="' + totalPages + '" value="" placeholder="页" style="width:44px;height:26px;font-size:12px;color:rgba(255,255,255,0.75);background-color:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.12);border-radius:4px;outline:none;text-align:center" />';
    }
    return h;
  }
  function render(){
    var matched = [];
    var k = searchInput ? searchInput.value.trim().toLowerCase() : "";
    for (var i=0;i<rows.length;i++) {
      var txt = rows[i].getAttribute("data-search-text") || "";
      if (!k || txt.indexOf(k) >= 0) matched.push(i);
    }
    var total = matched.length;
    var totalPages = Math.max(1, Math.ceil(total / pageSize));
    page = clampPage(page, totalPages);
    var start = (page - 1) * pageSize;
    var shown = {};
    for (var j=start;j<start+pageSize && j<matched.length;j++) shown[matched[j]] = true;
    for (var r=0;r<rows.length;r++) rows[r].classList.toggle("${uid}-row-hidden", !shown[r]);
    if (pagerEl) pagerEl.innerHTML = pagerHtml(total, totalPages, page);
  }
  if (searchInput) {
    searchInput.addEventListener("input", function(){ page = 1; render(); });
  }
  pagerEl.addEventListener("click", function(e){
    var t = e.target;
    if (!t || !t.getAttribute) return;
    var pg = t.getAttribute("data-pg");
    var totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    if (pg === "prev") page = clampPage(page - 1, totalPages);
    else if (pg === "next") page = clampPage(page + 1, totalPages);
    else if (pg && pg !== "prev" && pg !== "next") page = clampPage(Number(pg), totalPages);
    render();
  });
  pagerEl.addEventListener("change", function(e){
    var t = e.target;
    if (t && t.getAttribute && t.getAttribute("data-pg-size")) {
      pageSize = Math.max(1, Number(t.value) || 10);
      page = 1;
      render();
    }
  });
  pagerEl.addEventListener("keydown", function(e){
    if (e.key !== "Enter") return;
    var t = e.target;
    if (t && t.getAttribute && t.getAttribute("data-pg-jump")) {
      var v = Math.floor(Number(t.value));
      if (v >= 1) { page = clampPage(v, Math.max(1, Math.ceil(rows.length / pageSize))); render(); }
    }
  });
  render();
})();
</script>`
    : "";

  const styleTag = (hoverRule || rowSelectedRule || showSearch || showPagination || showRowExpand)
    ? `<style>${hoverRule}${rowSelectedRule}${showSearch || showPagination ? `.${uid}-row-hidden{display:none!important;}` : ""}${showPagination ? `.${uid}-pager-hidden{display:none!important;}` : ""}${showRowExpand ? `.${uid}-detail-hidden{display:none!important;}` : ""}${showRowExpand ? `.${uid}-row-hidden + tr[data-detail-row]{display:none!important;}` : ""}</style>`
    : "";
  const pagerHTML = showPagination
    ? `<div id="${uid}-pager" style="display:flex;align-items:center;justify-content:flex-end;gap:4px;padding:4px 8px;border-top:1px solid rgba(255,255,255,0.08);flex-wrap:wrap"></div>`
    : "";
  const outer = `<div class="${uid}" style="${cssText(s.outer)}">${searchHTML}${csvToolbarHTML}${tableHTML}${pagerHTML}</div>`;

  // 静态（非接口、非虚拟静态）模式数据岛：把编译期列定义与数据行灌入全局，
  // 供 csvExportScript（导出）与 staticEditScript（单元格编辑写回数据槽）读取
  //（与接口/虚拟静态模式走 mountScript 同一套全局键）。
  const staticCsvDataScript = (showExportCsv || editEnabled) && !isApi && !virtualStatic
    ? `<script>
window["__wcTblCols_${uid}"] = ${JSON.stringify(staticColumns)};
window["__wcTblData_${uid}"] = ${JSON.stringify(staticModel.data ?? [])};
</script>`
    : "";

  // 导出 CSV 运行时脚本（所有模式共用）：点击按钮用当前列定义 + 当前数据生成 CSV 并触发下载。
  // tableModelToCSV 自包含内联（与编辑端同源），BOM 用 String.fromCharCode(65279) 注入，避免字面 BOM 编码歧义。
  const csvExportScript = showExportCsv
    ? `<script>
(function(){
  var btn = document.getElementById("${uid}-export");
  if (!btn) return;
  var tableModelToCSV = ${tableModelToCSV.toString()};
  btn.addEventListener("click", function(){
    var cols = window["__wcTblCols_${uid}"] || [];
    var rows = window["__wcTblData_${uid}"] || [];
    cols = cols.filter(function(c){ return c.visible !== false; });
    if (!cols.length) return;
    var csv = tableModelToCSV({ columns: cols, rows: rows });
    var BOM = String.fromCharCode(65279);
    var blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "table.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    if (window.setTimeout) setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
  });
})();
</script>`
    : "";

  // 冻结列运行时（P2）：直接内联编辑区 applyFrozenColumns（tableData.ts 自包含函数），
  // 与编辑端 useLayoutEffect 调用的是同一份实现，杜绝双份字面量漂移。
  // 表格本身透明（s.outer 无背景），函数内会向上遍历祖先取首个非透明背景回填冻结单元，
  // sticky left 偏移按实测 offsetWidth 累加，兼容任意列宽单位。
  const FROZEN_RUNTIME_JS = `var applyFrozenColumns = ${applyFrozenColumns.toString()};`;

  // 静态（非接口、非虚拟静态）模式冻结列脚本：DOM 就绪后调用 applyFrozenColumns
  const staticFrozenScript = frozenCount > 0
    ? `<script>
${FROZEN_RUNTIME_JS}
(function(){
  function run(){ var root = document.querySelector(".${uid}"); if (root) applyFrozenColumns(root, ${frozenCount}, ${s.stickyHeader}); }
  function schedule(){ if (window.requestAnimationFrame) requestAnimationFrame(run); else run(); }
  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", schedule);
  else schedule();
  window.addEventListener("load", schedule);
})();
</script>`
    : "";

  // 静态模式行展开脚本：委托点击切换相邻详情行显隐（详情行隐藏也可由
  // 「-row-hidden + [data-detail-row]」相邻兄弟规则联动，父行被搜索/分页隐藏时详情同步隐藏）
  const staticExpandScript = showRowExpand && !isApi && !virtualStatic
    ? `<script>
(function(){
  var root = document.querySelector(".${uid}");
  if (!root) return;
  root.addEventListener("click", function(e){
    var t = e.target;
    if (!t || !t.getAttribute) return;
    if (t.getAttribute("data-expand") == null) return;
    var tr = t.closest ? t.closest("tr") : null;
    if (!tr) return;
    var detail = tr.nextElementSibling;
    if (!detail || detail.getAttribute("data-detail-row") == null) return;
    var hidden = detail.classList.toggle("${uid}-detail-hidden");
    t.textContent = hidden ? "▸" : "▾";
  });
})();
</script>`
    : "";

  // 静态模式单元格编辑脚本（多维第一档）：双击原位编辑 + 乐观更新 + 写回失败回滚。
  // 编辑口径函数全部内联自 tableData.ts（与接口/虚拟模式的 mountScript 同一份实现）。
  const staticEditScript = editEnabled && !isApi && !virtualStatic
    ? `<script>
(function(){
${EDIT_RUNTIME_JS}
  var formatCellDisplay = ${formatCellDisplay.toString()};
  var renderCellHtml = ${renderCellHtml.toString()};
  var root = document.querySelector(".${uid}");
  if (!root) return;
  var writeBack = ${escapeJs(editApiUrl)} ? function(row, field, value, done){
    tableCellWriteBack({ url: ${escapeJs(editApiUrl)}, method: ${escapeJs(editApiMethod)}, idField: ${escapeJs(editIdField)}, row: row, field: field, value: value, authEnabled: ${editAuthLiteral} })
      .then(function(ok){ if (!ok && window.console && console.warn) console.warn("[webcraft table] 单元格写回失败，已回滚本地修改:", field); done(ok); });
  } : null;
  attachTableCellEditing(root, {
    enabled: true,
    getColumns: function(){ return window["__wcTblCols_${uid}"] || []; },
    getRows: function(){ return window["__wcTblData_${uid}"] || []; },
    renderCellHtml: renderCellHtml,
    searchTextOf: tableRowSearchText,
    writeBack: writeBack,
    onEdit: function(row, field, value){
      root.dispatchEvent(new CustomEvent("cell-edit", { detail: { field: field, value: value, row: row } }));
    },
  });
})();
</script>`
    : "";

  // 静态模式行选择脚本：全选框作用于「当前可见行」（未隐藏的 data-row-index 行，
  // 与编辑端 displayData 全选口径一致），选中变化时在根节点派发
  // row-selection-change 事件暴露选中行数据。
  const staticRowSelectScript = showRowSelection
    ? `<script>
(function(){
  var root = document.querySelector(".${uid}");
  if (!root) return;
  // 行数据优先读共享数据岛（单元格编辑提交后选择暴露的行数据与表格显示一致）；
  // 无数据岛（既不开导出也不开编辑）时退回编译期内联副本
  var ROW_DATA = window["__wcTblData_${uid}"] || ${JSON.stringify((staticModel.data && staticModel.data.length ? staticModel.data : (staticModel.rows ?? [])).map((r) => (typeof r === "object" && r !== null ? r : r)))};
  var SELECTED = [];
  function visibleRows(){
    var rows = root.querySelectorAll("tbody tr[data-row-index]");
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      if (!rows[i].classList.contains("${uid}-row-hidden")) out.push(rows[i]);
    }
    return out;
  }
  function syncHeader(){
    var all = root.querySelector("input[data-sel-all]");
    if (!all) return;
    var vis = visibleRows();
    var picked = 0;
    for (var i = 0; i < vis.length; i++) {
      var cb = vis[i].querySelector("input[data-sel-row]");
      if (cb && cb.checked) picked++;
    }
    all.checked = vis.length > 0 && picked === vis.length;
    all.indeterminate = picked > 0 && picked < vis.length;
  }
  function emit(){
    var rows = [];
    for (var i = 0; i < SELECTED.length; i++) rows.push(ROW_DATA[SELECTED[i]]);
    root.dispatchEvent(new CustomEvent("row-selection-change", { detail: { rows: rows } }));
  }
  root.addEventListener("change", function(e){
    var t = e.target;
    if (!t || !t.getAttribute) return;
    var rk = t.getAttribute("data-sel-row");
    if (rk != null) {
      var idx = Number(rk);
      var pos = SELECTED.indexOf(idx);
      if (t.checked && pos < 0) SELECTED.push(idx);
      if (!t.checked && pos >= 0) SELECTED.splice(pos, 1);
      var tr = t.closest("tr");
      if (tr) tr.classList.toggle("${uid}-row-selected", !!t.checked);
      syncHeader();
      emit();
      return;
    }
    if (t.getAttribute("data-sel-all") != null) {
      var vis = visibleRows();
      var alreadyAll = vis.length > 0 && vis.every(function(tr){
        var cb = tr.querySelector("input[data-sel-row]");
        return cb && cb.checked;
      });
      for (var i = 0; i < vis.length; i++) {
        var cb = vis[i].querySelector("input[data-sel-row]");
        if (!cb) continue;
        var idx2 = Number(cb.getAttribute("data-sel-row"));
        var want = !alreadyAll;
        cb.checked = want;
        var p2 = SELECTED.indexOf(idx2);
        if (want && p2 < 0) SELECTED.push(idx2);
        if (!want && p2 >= 0) SELECTED.splice(p2, 1);
        vis[i].classList.toggle("${uid}-row-selected", want);
      }
      syncHeader();
      emit();
    }
  });
  syncHeader();
})();
</script>`
    : "";

  // P4 静态（bake）模式列宽拖拽：document 级 mousedown 委托 + 按 data-col-index 写回 th/td 宽度
  const staticResizeScript = resizableColumns
    ? `<script>
(function(){
  var W = {}; // 运行时拖拽列宽（px），与编辑端 colWidths / 运行时 WIDTHS 对应
  var root = document.querySelector(".${uid}");
  if (!root) return;
  function applyCol(ci, px){
    var ths = root.querySelectorAll("th[data-col-index]");
    for (var i = 0; i < ths.length; i++) {
      if (Number(ths[i].getAttribute("data-col-index")) === ci) ths[i].style.width = px + "px";
    }
    var tds = root.querySelectorAll("td[data-col-index]");
    for (var j = 0; j < tds.length; j++) {
      if (Number(tds[j].getAttribute("data-col-index")) === ci) tds[j].style.width = px + "px";
    }
  }
  document.addEventListener("mousedown", function(e){
    var t = e.target;
    if (!t || !t.getAttribute) return;
    var idx = t.getAttribute("data-col-resizer");
    if (idx == null) return;
    e.preventDefault();
    var ci = Number(idx);
    var th = t.parentElement;
    var drag = { ci: ci, startX: e.clientX, startW: W[ci] || (parseFloat(th && th.style.width) || 100) };
    function onMove(ev){
      var w = Math.max(40, Math.round(drag.startW + (ev.clientX - drag.startX)));
      if (W[drag.ci] !== w) { W[drag.ci] = w; applyCol(drag.ci, w); }
    }
    function onUp(){
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
})();
</script>`
    : "";

  // P4 静态模式虚拟滚动引导：把编译期数据灌入运行时数据槽，由 mountScript 统一初始化
  // （保留列定义/rows 降级解析入口，与接口模式共用 parseModel 口径）
  const staticVirtualBootstrap = virtualStatic
    ? `<script>window["__wcTbl_${uid}"](${JSON.stringify({
        columns: staticColumns,
        data: staticModel.data ?? [],
        rows: staticModel.rows ?? [],
        headers: staticModel.headers ?? [],
      })}, null);</script>`
    : "";

  /* ── 接口模式 / 静态虚拟滚动：运行时重建（同一份解析与样式口径的 JS 化） ── */
  const thDecls: CssDecls = { ...s.th, ...(s.stickyHeader ? { position: "sticky", top: "0", zIndex: "1" } : {}) };

  // 生成运行时多态渲染函数
  const mountScript = `<script>
(function(){
  var head = document.getElementById("${uid}-head");
  var body = document.getElementById("${uid}-body");
  if (!body) return;
  var ROOT_EL = document.querySelector(".${uid}");
  var TABLE_EL = body.parentElement;
  var RENDERED_ROWS = [];
  var SHOW_ROW_SELECTION = ${showRowSelection};
  var SELECTED = []; // 选中行对象引用（排序/过滤/分页不复制行对象 → 引用稳定）
  ${showRowExpand ? `var SHOW_ROW_EXPAND = true;
  var DETAIL_FIELD = ${escapeJs(detailField)};
  var EXPANDED = []; // 展开行对象引用（排序/过滤/分页重渲染不丢展开态）
  var renderRowDetail = ${renderRowDetail.toString()};` : "var SHOW_ROW_EXPAND = false;"}

  // P4 虚拟滚动 / 列宽拖拽运行时常量（口径来自 tableData.ts）
  var VIRTUAL_ENABLED = ${vs.enabled};
  var VIRTUAL_HEIGHT = ${vs.viewportHeight};
  var VIRTUAL_OVERSCAN = ${VIRTUAL_OVERSCAN};
  var VSCROLL_TOP = 0;
  var VROW_HEIGHT = ${s.rowHeight};
  var RESIZABLE = ${resizableColumns};
  // 虚拟滚动窗口算法：直接复用编辑区 computeVirtualRange（已内联为运行时函数），
  // 与编辑区严格同源，消除此前在 renderTable 内手写一份导致的 ±1 行漂移。
  var computeVirtualRange = ${computeVirtualRange.toString()};
  // 单元格格式化：直接复用编辑区 formatCellDisplay（已内联为运行时函数），
  // 与编辑区严格同源；col.format 的日期/数字格式化两端一致生效，不再各自实现一份。
  var formatCellDisplay = ${formatCellDisplay.toString()};
  // 多态单元格 HTML：内联编辑区 renderCellHtml（与编译期/静态编辑脚本同一份实现），
  // 取代此前手写的运行时 renderCell 双份字面量。
  var renderCellHtml = ${renderCellHtml.toString()};
  // 编辑口径函数仅在开启编辑时内联（attachTableCellEditing 源码含行定位契约字符串，
  // 无条件内联会污染「不 bake 行」类断言与产物体积）
  ${editEnabled ? EDIT_RUNTIME_JS : ""}
  // 单元格编辑（多维第一档）配置：url 留空 = 仅本地修改；auth 三态与取数骨架同口径
  var EDIT_ENABLED = ${editEnabled};
  var EDIT_URL = ${escapeJs(editApiUrl)};
  var EDIT_METHOD = ${escapeJs(editApiMethod)};
  var EDIT_ID_FIELD = ${escapeJs(editIdField)};
  var EDIT_AUTH = ${editAuthLiteral};
  // 面板列定义（来自 config.tableData / columnDefs）：接口模式下与 API 派生列合并，
  // 与编辑端 resolveTableData 的 mergeColumnDefs 同源（已内联），保证画布预览与发布后一致。
  var PANEL_COLUMNS = ${JSON.stringify(panelColumns)};
  var mergeColumnDefs = ${mergeColumnDefs.toString()};
  ${frozenCount > 0 ? FROZEN_RUNTIME_JS : ""}
  var WIDTHS = {}; // 运行时拖拽列宽（px），与编辑端 colWidths state 对应，重渲染不丢失
  var SCROLLING = false;
  function emitSelection(){
    if (!ROOT_EL) return;
    ROOT_EL.dispatchEvent(new CustomEvent("row-selection-change", { detail: { rows: SELECTED.slice() } }));
  }
  function refreshTable(){
    renderTable(CURRENT_COLS, window["__wcTblData_${uid}"] || []);
  }
  // 行复选框事件委托：冒泡阶段统一处理（渲染重建不丢失监听，与编辑端 onChange 同构）
  if (SHOW_ROW_SELECTION && body) {
    body.addEventListener("change", function(e){
      var t = e.target;
      if (!t || !t.getAttribute) return;
      if (t.getAttribute("data-sel-row") == null) return;
      var ri = Number(t.getAttribute("data-sel-row"));
      var row = RENDERED_ROWS[ri];
      if (!row) return;
      var pos = SELECTED.indexOf(row);
      if (t.checked && pos < 0) SELECTED.push(row);
      if (!t.checked && pos >= 0) SELECTED.splice(pos, 1);
      var tr = t.closest("tr");
      if (tr) tr.classList.toggle("${uid}-row-selected", !!t.checked);
      syncSelHeader();
      emitSelection();
    });
  }
  // 行展开点击委托：切换 EXPANDED 引用后整表重渲染（详情行随重渲染重建，展开态按行对象引用保持）
  if (SHOW_ROW_EXPAND && body) {
    body.addEventListener("click", function(e){
      var t = e.target;
      if (!t || !t.getAttribute) return;
      if (t.getAttribute("data-expand-row") == null) return;
      var row = RENDERED_ROWS[Number(t.getAttribute("data-expand-row"))];
      if (!row) return;
      var pos = EXPANDED.indexOf(row);
      if (pos >= 0) EXPANDED.splice(pos, 1);
      else EXPANDED.push(row);
      refreshTable();
    });
  }
  // 单元格编辑（多维第一档）：双击原位编辑 + 乐观更新 + 写回失败回滚（与静态编辑脚本同一份实现）。
  // getRows/getColumns 分别对应渲染定位的行序号与可见列序号（与 td/tr 上的定位属性严格一致）。
  if (EDIT_ENABLED && body) {
    attachTableCellEditing(body, {
      enabled: true,
      getColumns: function(){ return VISIBLE_COLS; },
      getRows: function(){ return RENDERED_ROWS; },
      renderCellHtml: renderCellHtml,
      searchTextOf: null,
      writeBack: EDIT_URL ? function(row, field, value, done){
        tableCellWriteBack({ url: EDIT_URL, method: EDIT_METHOD, idField: EDIT_ID_FIELD, row: row, field: field, value: value, authEnabled: EDIT_AUTH })
          .then(function(ok){ if (!ok && window.console && console.warn) console.warn("[webcraft table] 单元格写回失败，已回滚本地修改:", field); done(ok); });
      } : null,
      onEdit: function(row, field, value){
        if (ROOT_EL) ROOT_EL.dispatchEvent(new CustomEvent("cell-edit", { detail: { field: field, value: value, row: row } }));
      },
    });
  }
  // 表头全选框三态：checked / indeterminate / 空。渲染后调用（与编辑端 displayData 全选口径一致）
  function syncSelHeader(){
    if (!SHOW_ROW_SELECTION) return;
    var all = head ? head.querySelector("input[data-sel-all]") : null;
    if (!all) return;
    var n = RENDERED_ROWS.length;
    var picked = 0;
    for (var i = 0; i < n; i++) {
      if (SELECTED.indexOf(RENDERED_ROWS[i]) >= 0) picked++;
    }
    all.checked = n > 0 && picked === n;
    all.indeterminate = picked > 0 && picked < n;
  }
  var TH_STYLE = ${escapeJs(cssText(thDecls))};
  var EMPTY_TD_STYLE = ${escapeJs(emptyTdStyle)};
  var SHOW_HEADER = ${s.showHeader};
  var STRIPE = ${s.stripeEnabled};
  var STRIPE_COLOR = ${escapeJs(s.stripeColor)};
  var ROW_HEIGHT = ${s.rowHeight};
  var ROW_COLOR = ${escapeJs(s.rowColor)};
  var ROW_FONT = ${s.rowFontSize};
  var BORDER = ${escapeJs(s.borderCss)};
  var PAD = ${escapeJs(`${s.padY}px ${s.padX}px`)};
  var ALIGN = ${escapeJs(s.align)};
  var EMPTY_TEXT = ${escapeJs(s.emptyText)};
  var COLUMN_STYLES = ${JSON.stringify(
    Array.from({ length: Math.max(staticColCount, 0) }).map((_, i) => {
      const cs = s.columnStyles(i);
      return {
        width: cs.width || null,
        align: cs.align || null,
        fontSize: cs.fontSize || null,
        color: cs.color || null,
        minWidth: cs.minWidth || null,
        padY: cs.padY !== undefined ? cs.padY : null,
        padX: cs.padX !== undefined ? cs.padX : null,
      };
    }),
  )};

  function escapeHtml(s) {
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }
  function tdStyle(ri, colIdx){
    var cs = COLUMN_STYLES[colIdx] || {};
    var css = "color:" + (cs.color || ROW_COLOR) + ";font-size:" + (cs.fontSize || ROW_FONT) + "px;height:" + ROW_HEIGHT + "px;border:" + (BORDER || "none") + ";";
    var padY = cs.padY != null ? cs.padY : ${s.padY};
    var padX = cs.padX != null ? cs.padX : ${s.padX};
    css += "padding:" + padY + "px " + padX + "px;";
    css += "text-align:" + (cs.align || ALIGN) + ";white-space:nowrap;";
    // 运行时拖拽宽度优先（与编辑端 colWidths[i] > columnStyle.width 同口径）
    if (WIDTHS[colIdx]) css += "width:" + WIDTHS[colIdx] + "px;";
    else if (cs.width) css += "width:" + cs.width + ";";
    if (cs.minWidth) css += "min-width:" + cs.minWidth + ";";
    if (STRIPE && ri % 2 === 1) css += "background-color:" + STRIPE_COLOR + ";";
    return css;
  }
  // 运行时单元格渲染：委托给同源 renderCellHtml（口径收口，见上方内联注释）
  var renderCell = function(row, col){
    return renderCellHtml(row, col);
  };
  function renderEmpty(){
    var span = (COLS || 1) + (SHOW_ROW_SELECTION ? 1 : 0);
    if (body) body.innerHTML = '<tr><td colspan="' + span + '" style="' + EMPTY_TD_STYLE + '">' + escapeHtml(EMPTY_TEXT) + '</td></tr>';
  }
  function parseColumnDefs(input) {
    if (!input) return [];
    if (Array.isArray(input)) {
      return input.filter(function(item){ return item && typeof item === "object"; }).map(function(item){
        var field = String(item.field || "");
        if (!field) return null;
        return {
          field: field,
          header: item.header != null ? String(item.header) : field,
          type: ["text","number","date","boolean","status","link","image","select"].indexOf(String(item.type).toLowerCase()) >= 0 ? String(item.type).toLowerCase() : "text",
          width: item.width != null ? String(item.width) : undefined,
          align: ["left","center","right"].indexOf(String(item.align).toLowerCase()) >= 0 ? String(item.align).toLowerCase() : undefined,
          format: item.format != null ? String(item.format) : undefined,
          sortable: item.sortable !== false,
          visible: item.visible !== false,
          options: (function(v){
            if (Array.isArray(v)) { var arr = v.map(String).filter(function(s){ return s.trim() !== ""; }); return arr.length ? arr : undefined; }
            if (typeof v === "string" && v.trim()) { var arr2 = v.split(",").map(function(s){ return s.trim(); }).filter(Boolean); return arr2.length ? arr2 : undefined; }
            return undefined;
          })(item.options),
          editable: typeof item.editable === "boolean" ? item.editable : undefined,
        };
      }).filter(Boolean);
    }
    if (typeof input === "string") {
      return input.split(",").map(function(s){ return s.trim(); }).filter(Boolean).map(function(segment){
        var parts = segment.split(":").map(function(s){ return s.trim(); });
        var field = parts[0];
        var header = parts[1] || field;
        var type = ["text","number","date","boolean","status","link","image","select"].indexOf(String(parts[2]).toLowerCase()) >= 0 ? String(parts[2]).toLowerCase() : undefined;
        return { field: field, header: header, type: type };
      });
    }
    return [];
  }
  function inferColumnDefs(sample) {
    if (!sample || typeof sample !== "object") return [];
    return Object.keys(sample).map(function(field){
      var val = sample[field];
      var type = "text";
      if (typeof val === "boolean") type = "boolean";
      else if (typeof val === "number") type = "number";
      else if (typeof val === "string") {
        if (/^https?:\\/\\//.test(val) || /^\\//.test(val)) {
          if (/\\.(png|jpe?g|gif|webp|svg)(\\?.*)?$/i.test(val)) type = "image";
          else type = "link";
        } else if (/^\\d{4}-\\d{2}-\\d{2}/.test(val)) {
          type = "date";
        }
      }
      var align = type === "number" ? "right" : "left";
      return { field: field, header: field, type: type, align: align };
    });
  }
  var COLS = 0;
  var SORT_FIELD = "";
  var SORT_ORDER = "none";
  var SEARCH_TEXT = "";
  var CURRENT_COLS = [];
  var VISIBLE_COLS = []; // 当前渲染的可见列（data-col-index 的定位口径，编辑脚本取列用）
  var SHOW_SEARCH = ${showSearch};
  var SEARCH_INPUT_EL = SHOW_SEARCH ? document.getElementById("${uid}-search") : null;
${PAGINATION_RUNTIME_JS}
  // ── 分页状态（与编辑端 buildPaginationModel / normalizePaginationTotal / paginateTableRows 同构） ──
  var SHOW_PAGINATION = ${showPagination};
  var PAGER_EL = SHOW_PAGINATION ? document.getElementById("${uid}-pager") : null;
  var PAGER_STATE = { page: 1, pageSize: ${staticPageSize}, totalPages: 1 };
  var TOTAL = null; // 接口动态总数（原始响应归一化），不可用时空态回退本地过滤后条数
  if (PAGER_EL) {
    bindPager(PAGER_EL, PAGER_STATE, function(){
      renderTable(CURRENT_COLS, window["__wcTblData_${uid}"] || []);
    });
  }

  // ── P4 虚拟滚动：tbody 为滚动容器（布局样式已随骨架内联），rAF 节流滚动 → 重渲染窗口 ──
  if (VIRTUAL_ENABLED && body) {
    body.addEventListener("scroll", function(){
      if (SCROLLING) return;
      SCROLLING = true;
      requestAnimationFrame(function(){
        SCROLLING = false;
        var st = body.scrollTop;
        if (st === VSCROLL_TOP) return;
        VSCROLL_TOP = st;
        renderTable(CURRENT_COLS, window["__wcTblData_${uid}"] || []);
      });
    });
  }

  // ── P4 列宽拖拽：head 级 mousedown 委托 + document 级 move/up（冒泡委托在渲染重建后仍生效） ──
  function applyColWidth(ci, px){
    var tds = body ? body.querySelectorAll("td[data-col-index]") : [];
    for (var ai = 0; ai < tds.length; ai++) {
      if (Number(tds[ai].getAttribute("data-col-index")) === ci) tds[ai].style.width = px + "px";
    }
    if (head) {
      var ths = head.querySelectorAll("th[data-col-index]");
      for (var bi = 0; bi < ths.length; bi++) {
        if (Number(ths[bi].getAttribute("data-col-index")) === ci) ths[bi].style.width = px + "px";
      }
    }
  }
  if (RESIZABLE) {
    document.addEventListener("mousedown", function(e){
      var t = e.target;
      if (!t || !t.getAttribute) return;
      var idx = t.getAttribute("data-col-resizer");
      if (idx == null) return;
      e.preventDefault();
      var ci = Number(idx);
      var th = t.parentElement;
      var base = parseFloat(th && th.style.width) || 100;
      var drag = { ci: ci, startX: e.clientX, startW: base };
      function onMove(ev){
        if (!drag) return;
        var w = Math.max(40, Math.round(drag.startW + (ev.clientX - drag.startX)));
        if (WIDTHS[drag.ci] !== w) {
          WIDTHS[drag.ci] = w;
          applyColWidth(drag.ci, w);
        }
      }
      function onUp(){
        if (drag) document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        drag = null;
      }
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  function filterRows(dataRows, columns, keyword) {
    var k = (keyword || "").trim().toLowerCase();
    if (!k) return dataRows;
    return dataRows.filter(function(row){
      return columns.some(function(col){
        var raw = row[col.field];
        if (raw == null) return false;
        if (col.type === "boolean") {
          var on = raw === true || raw === "true" || raw === 1;
          if (k === "true" || k === "是") return on;
          if (k === "false" || k === "否") return !on;
          return (on ? "是" : "否").toLowerCase().indexOf(k) >= 0;
        }
        if (col.type === "number") {
          var n = Number(raw);
          if (!isNaN(n)) {
            return String(n).indexOf(k) >= 0 || String(n) === k;
          }
        }
        return String(raw).toLowerCase().indexOf(k) >= 0;
      });
    });
  }

  function compareFn(field, type) {
    return function(a, b) {
      var av = a[field], bv = b[field];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (type === "number") {
        var an = Number(av), bn = Number(bv);
        if (!isNaN(an) && !isNaN(bn)) return an - bn;
      }
      if (type === "date") {
        var ad = new Date(String(av)).getTime(), bd = new Date(String(bv)).getTime();
        if (!isNaN(ad) && !isNaN(bd)) return ad - bd;
      }
      if (type === "boolean") {
        var at = (av === true || av === "true" || av === 1) ? 1 : 0;
        var bt = (bv === true || bv === "true" || bv === 1) ? 1 : 0;
        return at - bt;
      }
      return String(av).localeCompare(String(bv));
    };
  }

  function sortRows(dataRows, columns, field, order) {
    if (order === "none" || !field) return dataRows;
    var col = null;
    for (var i = 0; i < columns.length; i++) {
      if (columns[i].field === field) { col = columns[i]; break; }
    }
    if (!col || col.sortable === false) return dataRows;
    var cmp = compareFn(field, col.type);
    return dataRows.slice().sort(function(a, b){
      return order === "asc" ? cmp(a, b) : cmp(b, a);
    });
  }

  function renderTable(columns, dataRows) {
    columns = columns.filter(function(col){ return col.visible !== false; });
    COLS = columns.length;
    VISIBLE_COLS = columns;

    dataRows = sortRows(dataRows, columns, SORT_FIELD, SORT_ORDER);
    dataRows = filterRows(dataRows, columns, SEARCH_TEXT);
    var fullRows = dataRows;

    // P4 虚拟滚动：按滚动位置计算窗口（与编辑端 computeVirtualRange 同构），
    // 仅列定义模型生效（columns.length > 0），旧版 rows 降级为直排。
    var virtual = null;
    if (VIRTUAL_ENABLED && COLS > 0 && fullRows.length > 0) {
      // 虚拟滚动窗口：调用编辑区同款 computeVirtualRange（已内联进本脚本），
      // 保证画布与发布后的窗口计算结果严格一致，不再各自实现一份。
      var vWin = computeVirtualRange({
        scrollTop: VSCROLL_TOP,
        viewportHeight: VIRTUAL_HEIGHT,
        rowHeight: VROW_HEIGHT,
        total: fullRows.length,
        overscan: VIRTUAL_OVERSCAN,
      });
      virtual = { start: vWin.start, end: vWin.end };
      dataRows = fullRows.slice(vWin.start, vWin.end);
    }

    if (SHOW_PAGINATION) {
      var pgTotal = TOTAL != null ? TOTAL : fullRows.length;
      PAGER_STATE.totalPages = Math.max(1, Math.ceil(pgTotal / PAGER_STATE.pageSize));
      PAGER_STATE.page = clampPage(PAGER_STATE.page, PAGER_STATE.totalPages);
      dataRows = fullRows.slice((PAGER_STATE.page - 1) * PAGER_STATE.pageSize, PAGER_STATE.page * PAGER_STATE.pageSize);
    }
    var DISPLAY_TOTAL = TOTAL != null ? TOTAL : fullRows.length;

    if (head && SHOW_HEADER && COLS > 0) {
      var ths = "";
      if (SHOW_ROW_SELECTION) {
        ths += '<th style="' + TH_STYLE + 'width:36px;text-align:center"><input type="checkbox" data-sel-all style="' + ${escapeJs(selCheckStyle)} + '" /></th>';
      }
      if (SHOW_ROW_EXPAND) {
        ths += '<th style="' + TH_STYLE + 'width:36px;text-align:center"></th>';
      }
      for (var ci = 0; ci < columns.length; ci++) {
        var col = columns[ci];
        var cs = COLUMN_STYLES[ci] || {};
        var extra = "";
        if (WIDTHS[ci]) extra += "width:" + WIDTHS[ci] + "px;";
        else if (cs.width) extra += "width:" + cs.width + ";";
        if (RESIZABLE) extra += "position:relative;";
        if (cs.align) extra += "text-align:" + cs.align + ";";
        var sortable = col.sortable !== false;
        var isSorted = SORT_FIELD === col.field;
        var icon = isSorted && SORT_ORDER === "asc" ? "▲" : isSorted && SORT_ORDER === "desc" ? "▼" : "⇅";
        var cursorStyle = sortable ? "cursor:pointer;" : "";
        var resizer = RESIZABLE ? '<span data-col-resizer="' + ci + '" style="position:absolute;top:0;right:-4px;width:8px;height:100%;cursor:col-resize;z-index:2" title="拖拽调整列宽"></span>' : "";
        ths += '<th data-field="' + escapeHtml(col.field) + '" data-sortable="' + (sortable ? "true" : "false") + '" data-col-index="' + ci + '" style="' + TH_STYLE + extra + cursorStyle + '">' + escapeHtml(col.header || col.field) + (sortable ? '<span style="font-size:0.75em;margin-left:4px;opacity:' + (isSorted ? 1 : 0.3) + '">' + icon + '</span>' : '') + resizer + '</th>';
      }
      head.innerHTML = virtual ? '<tr style="display:table;table-layout:fixed;width:100%">' + ths + '</tr>' : '<tr>' + ths + '</tr>';
      var selHeadAll = head.querySelector("input[data-sel-all]");
      if (selHeadAll) selHeadAll.addEventListener("change", function(){
        // 全选/反选「当前渲染行」（过滤+分页/虚拟窗口后），与编辑端 toggleAllRowsSelection 同构
        var allPicked = RENDERED_ROWS.length > 0 && RENDERED_ROWS.every(function(r){ return SELECTED.indexOf(r) >= 0; });
        for (var si = 0; si < RENDERED_ROWS.length; si++) {
          var r2 = RENDERED_ROWS[si];
          var pos = SELECTED.indexOf(r2);
          if (allPicked) { if (pos >= 0) SELECTED.splice(pos, 1); }
          else if (pos < 0) SELECTED.push(r2);
        }
        refreshTable();
        emitSelection();
      });
      var thElems = head.querySelectorAll('th');
      for (var ti = 0; ti < thElems.length; ti++) {
        (function(th){
          if (th.getAttribute('data-sortable') === 'true') {
            th.addEventListener('click', function(ev){
              // 拖拽列宽手柄时误触 th：不做排序（与编辑端 stopPropagation 语义一致）
              if (ev.target && ev.target.closest && ev.target.closest('[data-col-resizer]')) return;
              var field = th.getAttribute('data-field');
              if (SORT_FIELD === field) {
                SORT_ORDER = SORT_ORDER === "asc" ? "desc" : SORT_ORDER === "desc" ? "none" : "asc";
              } else {
                SORT_FIELD = field;
                SORT_ORDER = "asc";
              }
              if (SHOW_PAGINATION) PAGER_STATE.page = 1;
              var currentData = window["__wcTblData_${uid}"] || [];
              renderTable(columns, currentData);
            });
          }
        })(thElems[ti]);
      }
    }

    // 空态/加载态：不渲染分页内容并隐藏分页容器（与编辑端"空态/加载态不分页"一致）
    if (!COLS) { if (PAGER_EL) PAGER_EL.classList.add("${uid}-pager-hidden"); renderEmpty(); return; }
    if (!fullRows.length) { if (PAGER_EL) PAGER_EL.classList.add("${uid}-pager-hidden"); renderEmpty(); return; }
    if (PAGER_EL) PAGER_EL.classList.remove("${uid}-pager-hidden");
    var html = "";
    RENDERED_ROWS = dataRows;
    // 虚拟滚动垫片：顶部/底部块级 spacer 承载未渲染行高（与编辑端 data-virtual-spacer 同构）
    if (virtual && virtual.start > 0) {
      html += '<tr data-virtual-spacer="top" style="display:block;height:' + (virtual.start * VROW_HEIGHT) + 'px"></tr>';
    }
    for (var ri = 0; ri < dataRows.length; ri++) {
      var row = dataRows[ri];
      var selected = SHOW_ROW_SELECTION && SELECTED.indexOf(row) >= 0;
      var expanded = SHOW_ROW_EXPAND && EXPANDED.indexOf(row) >= 0;
      var detailTxt = SHOW_ROW_EXPAND ? renderRowDetail(row[DETAIL_FIELD]) : "";
      var tds = "";
      if (SHOW_ROW_SELECTION) {
        tds += '<td style="' + tdStyle(ri, -1) + 'width:36px;text-align:center"><input type="checkbox" data-sel-row="' + ri + '"' + (selected ? ' checked="checked"' : '') + ' style="' + ${escapeJs(selCheckStyle)} + '" /></td>';
      }
      if (SHOW_ROW_EXPAND) {
        tds += '<td style="' + tdStyle(ri, -1) + 'width:36px;text-align:center">' + (detailTxt ? '<button type="button" data-expand-row="' + ri + '" style="width:22px;height:22px;padding:0;font-size:12px;line-height:1;color:rgba(255,255,255,0.65);background-color:transparent;border:1px solid rgba(255,255,255,0.12);border-radius:4px;cursor:pointer">' + (expanded ? "▾" : "▸") + '</button>' : '') + '</td>';
      }
      for (var ci2 = 0; ci2 < COLS; ci2++) {
        tds += '<td data-col-index="' + ci2 + '" style="' + tdStyle(ri, ci2) + '">' + renderCell(row, columns[ci2]) + '</td>';
      }
      html += '<tr' + (virtual ? ' style="display:table;table-layout:fixed;width:100%"' : '') + ' data-row-index="' + ri + '"' + (selected ? ' class="' + '${uid}-row-selected' + '"' : '') + '>' + tds + '</tr>';
      if (expanded && detailTxt) {
        html += '<tr data-detail-row="' + ri + '"><td colspan="' + (COLS + (SHOW_ROW_SELECTION ? 1 : 0) + 1) + '" style="border:' + (BORDER || "none") + ';padding:' + PAD + ';text-align:left;white-space:pre-wrap">' + escapeHtml(detailTxt) + '</td></tr>';
      }
    }
    if (virtual && virtual.end < fullRows.length) {
      html += '<tr data-virtual-spacer="bottom" style="display:block;height:' + ((fullRows.length - virtual.end) * VROW_HEIGHT) + 'px"></tr>';
    }
    body.innerHTML = html;
    syncSelHeader();
    if (SHOW_PAGINATION && PAGER_EL) {
      PAGER_EL.innerHTML = buildPagerHtml({
        current: PAGER_STATE.page,
        total: DISPLAY_TOTAL,
        totalPages: PAGER_STATE.totalPages,
        pageSize: PAGER_STATE.pageSize,
        showPageSize: ${showPageSizeOptions},
        showQuickJumper: ${showQuickJumper}
      });
    }
    ${frozenCount > 0 ? `\n    // 冻结列（P2）：每次重建后重算 sticky 偏移与背景\n    applyFrozenColumns(ROOT_EL, ${frozenCount}, ${s.stickyHeader});` : ""}
  }

  // 数据模型解析（新版 columns+data / 旧版 headers+rows / 纯对象数组 / 纯二维数组），
  // 接口模式与静态虚拟滚动共用同一条口径。
  function parseModel(model) {
    var out = { columns: [], dataRows: [] };
    if (!model) return out;
    if (typeof model === "object" && !Array.isArray(model)) {
      if (Array.isArray(model.columns) && model.columns.length > 0) {
        out.columns = parseColumnDefs(model.columns);
      }
      if (Array.isArray(model.data) && model.data.length > 0) {
        out.dataRows = model.data;
      }
      if (!out.columns.length && Array.isArray(model.headers) && model.headers.length > 0) {
        out.columns = model.headers.map(String).map(function(h){ return { field: h, header: h, type: "text" }; });
      }
      if (!out.dataRows.length && Array.isArray(model.rows) && model.rows.length > 0) {
        out.dataRows = model.rows.map(function(row){
          var obj = {};
          out.columns.forEach(function(col, idx){ obj[col.field] = row[idx] != null ? row[idx] : ""; });
          return obj;
        });
      }
      return out;
    }
    // 纯数组（对象数组）
    if (Array.isArray(model) && model.length > 0) {
      var first = model[0];
      if (first && typeof first === "object" && !Array.isArray(first)) {
        out.columns = inferColumnDefs(first);
        out.dataRows = model;
        return out;
      }
      if (Array.isArray(first)) {
        if (!out.columns.length) {
          var maxCols = Math.max.apply(null, model.map(function(r){ return r.length; }));
          for (var i = 0; i < maxCols; i++) {
            out.columns.push({ field: "col_" + i, header: "列 " + (i + 1), type: "text" });
          }
        }
        out.dataRows = model.map(function(row){
          var obj = {};
          out.columns.forEach(function(col, idx){ obj[col.field] = row[idx] != null ? row[idx] : ""; });
          return obj;
        });
        return out;
      }
    }
    return out;
  }

  window["__wcTbl_${uid}"] = function(data, json) {
    // 接口动态总数：优先取原始响应归一化（与编辑端 normalizePaginationTotal(fetchedData) 同构）
    if (SHOW_PAGINATION && json != null) {
      var apiTotal = normalizeTotal(json);
      if (apiTotal != null) TOTAL = apiTotal;
    }
    var model = data && data.__picked !== undefined ? data.__picked : data;
    var parsed = parseModel(model);
    // 合并面板列（与编辑端 mergeColumnDefs 同源）：API 派生列 + 面板覆盖（header/type/width/format/sortable/visible）
    var mergedCols = (PANEL_COLUMNS && PANEL_COLUMNS.length && parsed.columns.length)
      ? mergeColumnDefs(parsed.columns, PANEL_COLUMNS)
      : parsed.columns;
    window["__wcTblData_${uid}"] = parsed.dataRows;
    CURRENT_COLS = mergedCols;
    // 导出 CSV 共享全局键：合并后的列定义（含面板 header/type/format 覆盖），供 csvExportScript 读取
    window["__wcTblCols_${uid}"] = mergedCols;
    // 行对象引用随新数据失效：刷新时清空选中（与编辑端数据流水线变化清空 selectedRows 同构）
    if (SELECTED.length) { SELECTED = []; }
    renderTable(mergedCols, parsed.dataRows);
    emitSelection();
  };
  if (SEARCH_INPUT_EL) {
    var SEARCH_TIMER = null;
    SEARCH_INPUT_EL.addEventListener("input", function(){
      SEARCH_TEXT = SEARCH_INPUT_EL.value;
      if (SHOW_PAGINATION) PAGER_STATE.page = 1;
      if (SEARCH_TIMER) clearTimeout(SEARCH_TIMER);
      SEARCH_TIMER = setTimeout(function(){
        renderTable(CURRENT_COLS, window["__wcTblData_${uid}"] || []);
      }, 200);
    });
  }
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
    renderBody: `if (window["__wcTbl_${uid}"]) window["__wcTbl_${uid}"](data, json);`,
  });

  if (!isApi) {
    if (virtualStatic) {
      // mountScript 先定义 __wcTbl_${uid}，bootstrap 再灌入编译期数据触发首屏渲染
      return `${styleTag}${outer}${mountScript}${staticVirtualBootstrap}${csvExportScript}${staticFrozenScript}`;
    }
    return `${styleTag}${outer}${staticSearchScript}${staticPagerScript}${staticResizeScript}${staticRowSelectScript}${staticCsvDataScript}${csvExportScript}${staticExpandScript}${staticFrozenScript}${staticEditScript}`;
  }
  return `${styleTag}${outer}${mountScript}${loader}${csvExportScript}`;
};
