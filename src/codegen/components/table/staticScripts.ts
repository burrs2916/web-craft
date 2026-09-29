import {
  formatCellDisplay,
  renderCellHtml,
  tableModelToCSV,
  type ColumnDef,
  type TableModel,
} from "../../../editor/data/tableData";
import type { TableStyle } from "../../../editor/data/tableStyle";
import {
  EDIT_RUNTIME_JS,
  FROZEN_RUNTIME_JS,
  PAGINATION_RUNTIME_JS,
  escapeJs,
} from "./runtime";

/** 静态模式搜索过滤脚本（无分页、非虚拟静态时生效）。 */
export function buildStaticSearchScript(p: {
  uid: string;
  showSearch: boolean;
  showPagination: boolean;
  virtualStatic: boolean;
}): string {
  const { uid, showSearch, showPagination, virtualStatic } = p;
  return showSearch && !showPagination && !virtualStatic
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
}

/** 静态模式搜索过滤 + 分页脚本。 */
export function buildStaticPagerScript(p: {
  uid: string;
  showSearch: boolean;
  showPagination: boolean;
  staticPageSize: number;
  showPageSizeOptions: boolean;
  showQuickJumper: boolean;
}): string {
  const { uid, showSearch, showPagination, staticPageSize, showPageSizeOptions, showQuickJumper } = p;
  return showPagination
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
}

/** 静态（非接口、非虚拟静态）模式数据岛：把编译期列定义与数据行灌入全局。 */
export function buildStaticCsvDataScript(p: {
  uid: string;
  showExportCsv: boolean;
  editEnabled: boolean;
  isApi: boolean;
  virtualStatic: boolean;
  staticColumns: ColumnDef[];
  staticModel: TableModel;
}): string {
  const { uid, showExportCsv, editEnabled, isApi, virtualStatic, staticColumns, staticModel } = p;
  return (showExportCsv || editEnabled) && !isApi && !virtualStatic
    ? `<script>
window["__wcTblCols_${uid}"] = ${JSON.stringify(staticColumns)};
window["__wcTblData_${uid}"] = ${JSON.stringify(staticModel.data ?? [])};
</script>`
    : "";
}

/** 导出 CSV 运行时脚本（所有模式共用）。 */
export function buildCsvExportScript(p: { uid: string; showExportCsv: boolean }): string {
  const { uid, showExportCsv } = p;
  return showExportCsv
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
}

/** 静态（非接口、非虚拟静态）模式冻结列脚本。 */
export function buildStaticFrozenScript(p: { uid: string; frozenCount: number; s: TableStyle }): string {
  const { uid, frozenCount, s } = p;
  return frozenCount > 0
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
}

/** 静态模式行展开脚本。 */
export function buildStaticExpandScript(p: {
  uid: string;
  showRowExpand: boolean;
  isApi: boolean;
  virtualStatic: boolean;
}): string {
  const { uid, showRowExpand, isApi, virtualStatic } = p;
  return showRowExpand && !isApi && !virtualStatic
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
}

/** 静态模式单元格编辑脚本。 */
export function buildStaticEditScript(p: {
  uid: string;
  editEnabled: boolean;
  isApi: boolean;
  virtualStatic: boolean;
  editApiUrl: string;
  editApiMethod: string;
  editIdField: string;
  editAuthLiteral: string;
}): string {
  const { uid, editEnabled, isApi, virtualStatic, editApiUrl, editApiMethod, editIdField, editAuthLiteral } = p;
  return editEnabled && !isApi && !virtualStatic
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
}

/** 静态模式行选择脚本。 */
export function buildStaticRowSelectScript(p: {
  uid: string;
  showRowSelection: boolean;
  staticModel: TableModel;
}): string {
  const { uid, showRowSelection, staticModel } = p;
  return showRowSelection
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
}

/** P4 静态（bake）模式列宽拖拽脚本。 */
export function buildStaticResizeScript(p: { uid: string; resizableColumns: boolean }): string {
  const { uid, resizableColumns } = p;
  return resizableColumns
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
}

/** P4 静态模式虚拟滚动引导：把编译期数据灌入运行时数据槽。 */
export function buildStaticVirtualBootstrap(p: {
  uid: string;
  virtualStatic: boolean;
  staticColumns: ColumnDef[];
  staticModel: TableModel;
}): string {
  const { uid, virtualStatic, staticColumns, staticModel } = p;
  return virtualStatic
    ? `<script>window["__wcTbl_${uid}"](${JSON.stringify({
        columns: staticColumns,
        data: staticModel.data ?? [],
        rows: staticModel.rows ?? [],
        headers: staticModel.headers ?? [],
      })}, null);</script>`
    : "";
}