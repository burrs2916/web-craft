import {
  applyFrozenColumns,
  isCellEditable,
  initialEditValue,
  parseCellEditValue,
  tableRowSearchText,
  tableCellWriteBack,
  attachTableCellEditing,
} from "../../../editor/data/tableData";

/** JSON 字面量化：把编译期字符串安全内嵌进运行时脚本。 */
export function escapeJs(s: string): string {
  return JSON.stringify(s);
}

/**
 * 发布端分页运行时算法（与数据层 buildPaginationModel / normalizePaginationTotal /
 * paginateTableRows 一一同构）：页码窗口、总数归一、页夹紧、切片。
 * 不含反引号与 ${ 字面量，可安全内嵌到外层模板字符串。
 */
export const PAGINATION_RUNTIME_JS = `
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
export const EDIT_RUNTIME_JS = `
  var isCellEditable = ${isCellEditable.toString()};
  var initialEditValue = ${initialEditValue.toString()};
  var parseCellEditValue = ${parseCellEditValue.toString()};
  var tableRowSearchText = ${tableRowSearchText.toString()};
  var tableCellWriteBack = ${tableCellWriteBack.toString()};
  var attachTableCellEditing = ${attachTableCellEditing.toString()};`;

/**
 * 冻结列运行时（P2）：直接内联编辑区 applyFrozenColumns（tableData.ts 自包含函数），
 * 与编辑端 useLayoutEffect 调用的是同一份实现，杜绝双份字面量漂移。
 */
export const FROZEN_RUNTIME_JS = `var applyFrozenColumns = ${applyFrozenColumns.toString()};`;