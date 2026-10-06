import {
  applyFrozenColumns,
  isCellEditable,
  initialEditValue,
  parseCellEditValue,
  tableRowSearchText,
  tableCellWriteBack,
  attachTableCellEditing,
} from "../../../editor/data/tableData";
import type { TablePagerStyle } from "../../../editor/data/tableStyle";

/** JSON 字面量化：把编译期字符串安全内嵌进运行时脚本。 */
export function escapeJs(s: string): string {
  return JSON.stringify(s);
}

/**
 * 发布端分页运行时算法（与数据层 buildPaginationModel / normalizePaginationTotal /
 * paginateTableRows 一一同构）：页码窗口、总数归一、页夹紧、切片。
 * 外观参数由 resolveTablePagerStyle 注入（函数入参），编辑区与发布端读同一份解析值。
 */
export function buildPaginationRuntimeJs(s: TablePagerStyle, totalField = ""): string {
  return `  // 分页栏外观全部取自 resolveTablePagerStyle（面板 pager* 字段），这里不再写死颜色/尺寸
  var PAGE_SIZE_OPTIONS = [10,20,50,100];
  var WC_TOTAL_FIELD = ${JSON.stringify(totalField)};
  function normalizeTotal(v, field){
    if (field && v != null && typeof v === "object") {
      var cur = v;
      var parts = field.split(".");
      for (var fi=0;fi<parts.length;fi++){
        if (cur != null && typeof cur === "object") cur = cur[parts[fi]];
        else { cur = undefined; break; }
      }
      if (typeof cur === "number" && isFinite(cur)) return Math.max(0, Math.floor(cur));
    }
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
  // 分页栏外观：全部取自 resolveTablePagerStyle（面板 pager* 字段的解析值），
  // 这里不再写死颜色/尺寸 —— 面板改一处，发布端跟着变，不会出现"两端各写各的"。
  var PAGER_C = ${JSON.stringify(s.color)};
  var PAGER_ACTIVE_TEXT = ${JSON.stringify(s.activeTextColor)};
  var PAGER_TEXT = ${JSON.stringify(s.textColor)};
  var PAGER_TOTAL = ${JSON.stringify(s.totalColor)};
  var PAGER_BG = ${JSON.stringify(s.bgColor)};
  var PAGER_FIELD_BG = ${JSON.stringify(s.fieldBg)};
  var PAGER_BORDER = ${JSON.stringify(s.borderColor)};
  var PAGER_RADIUS = ${JSON.stringify(s.radius)};
  var PAGER_BTN_SIZE = ${s.btnSize};
  // ⚠️ 这里是裸数字：它会直接被拼进分页按钮的内联样式里，带上单位引号会先把 style
  // 属性截断（改造期踩过一次），所以别再把它包成 JSON 字符串。
  var PAGER_FONT_SIZE = ${s.fontSize};
  var PAGER_GAP = ${s.gap};
  var PAGER_MAX_BUTTONS = ${s.maxButtons};
  var PAGER_HAS_BORDER = ${s.borderEnabled};
  var PAGER_HAS_GO = ${s.goButton};
  var PAGER_TOTAL_TEXT = ${JSON.stringify(s.totalText)};
  function buildPagerHtml(opts){
    var current = opts.current, total = opts.total, totalPages = opts.totalPages, pageSize = opts.pageSize;
    var showSize = opts.showPageSize !== false, showJump = opts.showQuickJumper === true;
    var bd = PAGER_HAS_BORDER ? "border:1px solid " + PAGER_BORDER + ";" : "";
    // 按钮底色/文字色由类规则给（.wc-pg-btn / .is-active / .is-disabled，见发布端 styleTag），
    // 这里只留尺寸/边框/圆角/光标等静态布局，绝不再写 background-color/color 内联 —— 否则会压制类规则。
    var btn = function(label, extra){
      var disabled = extra && extra.indexOf("disabled") >= 0;
      var cls = "wc-pg-btn" + (disabled ? " is-disabled" : "");
      return '<button class="' + cls + '"' + (extra || '') + ' style="min-width:' + PAGER_BTN_SIZE + 'px;height:' + PAGER_BTN_SIZE + 'px;font-size:' + PAGER_FONT_SIZE + 'px;' + bd + 'border-radius:' + PAGER_RADIUS + ';cursor:pointer">' + label + '</button>';
    };
    var h = '<span style="font-size:' + PAGER_FONT_SIZE + 'px;color:' + PAGER_TOTAL + ';margin-right:' + PAGER_GAP + 'px">' + PAGER_TOTAL_TEXT.replace("{n}", total) + '</span>';
    if (showSize) {
      h += '<select data-pg-size style="height:' + PAGER_BTN_SIZE + 'px;font-size:' + PAGER_FONT_SIZE + 'px;color:' + PAGER_TEXT + ';background-color:' + PAGER_FIELD_BG + ';' + bd + 'border-radius:' + PAGER_RADIUS + ';outline:none">';
      for (var oi=0; oi<PAGE_SIZE_OPTIONS.length; oi++) {
        h += '<option value="' + PAGE_SIZE_OPTIONS[oi] + '"' + (PAGE_SIZE_OPTIONS[oi]===pageSize?' selected':'') + '>' + PAGE_SIZE_OPTIONS[oi] + ' 条/页</option>';
      }
      h += '</select>';
    }
    h += btn('&lsaquo;', current<=1?' disabled':' data-pg="prev"');
    var items = pageItemsOf(current, totalPages, PAGER_MAX_BUTTONS);
    for (var i=0;i<items.length;i++) {
      if (items[i] === "ellipsis") { h += '<span style="font-size:' + PAGER_FONT_SIZE + 'px;color:' + PAGER_TOTAL + ';padding:0 ' + PAGER_GAP + 'px">&hellip;</span>'; continue; }
      var act = items[i] === current;
      var cls = "wc-pg-btn" + (act ? " is-active" : "");
      h += '<button class="' + cls + '" data-pg="' + items[i] + '" style="min-width:' + PAGER_BTN_SIZE + 'px;height:' + PAGER_BTN_SIZE + 'px;font-size:' + PAGER_FONT_SIZE + 'px;' + bd + 'border-radius:' + PAGER_RADIUS + ';cursor:pointer">' + items[i] + '</button>';
    }
    h += btn('&rsaquo;', current>=totalPages?' disabled':' data-pg="next"');
    if (showJump) {
      h += '<span style="font-size:' + PAGER_FONT_SIZE + 'px;color:' + PAGER_TOTAL + '">跳至</span>';
      h += '<input data-pg-jump type="number" min="1" max="' + totalPages + '" value="' + current + '" style="width:44px;height:' + PAGER_BTN_SIZE + 'px;font-size:' + PAGER_FONT_SIZE + 'px;color:' + PAGER_TEXT + ';background-color:' + PAGER_FIELD_BG + ';' + bd + 'border-radius:' + PAGER_RADIUS + ';outline:none;text-align:center" />';
      h += '<span style="font-size:' + PAGER_FONT_SIZE + 'px;color:' + PAGER_TOTAL + '">页</span>';
      if (opts.showGo === true) h += btn('跳', ' data-pg-go="1"');
    }
    return h;
  }
  function bindPager(pagerEl, state, refresh){
    pagerEl.addEventListener("click", function(e){
      var t = e.target;
      if (!t || !t.getAttribute) return;
      if (t.getAttribute("data-pg-go")) {
        var ji = pagerEl.querySelector("[data-pg-jump]");
        if (ji) jumpFromInput(ji);
        return;
      }
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
    var jumpFromInput = function(inp){
      var raw = (inp.value || "").trim();
      if (raw === "") return;
      var v = Math.floor(Number(raw));
      if (!isFinite(v)) return;
      state.page = clampPage(Math.max(1, v), state.totalPages);
      refresh();
    };
    pagerEl.addEventListener("keydown", function(e){
      if (e.key !== "Enter") return;
      var t = e.target;
      if (t && t.getAttribute && t.getAttribute("data-pg-jump")) jumpFromInput(t);
    });
    pagerEl.addEventListener("focusout", function(e){
      var t = e.target;
      if (t && t.getAttribute && t.getAttribute("data-pg-jump")) jumpFromInput(t);
    });
  }
`;
}

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